import { config } from './config.js';
import { query } from './db.js';
import { appendMarketHistory } from './member.js';
import { logger } from './logger.js';
import { redis } from './redis.js';
import { randomUUID } from 'node:crypto';
import { MARKET_MAP, resolveDecision, enforceDecisionFreshness, countDecisions, observationCountsBySource, rawObservationSummaryBySource } from './toto-collector-core.js';
import { TOTO_SOURCES, collectTotoSources, renderTotoSource } from './toto-source-fetch.js';
import { collectOfficialTotoSources, officialDecision } from './toto-official-source.js';
import { buildTotoAuthoritySnapshot, totoAuthoritySnapshotRevision } from './toto-production-acceptance.js';
import { reconcileCashBettingWindows } from './toto-cash-lifecycle.js';
import { recordDrawObservations, drawCalibrationSnapshot } from './toto-draw-calibrator.js';
import { poolsInPollingPhase, TOTO_RESULT_TIMES_WIB } from './toto-draw-scheduler.js';
import { syncJobs, dueJobs, applyPollResult, pollerSnapshot } from './toto-draw-poller.js';
const STATUS_KEY = 'toto:collector:status:v1';
const LOCK_KEY = 'toto:collector:lock:v1';
const STATUS_TTL_SECONDS = 172800;
const LOCK_TTL_SECONDS = 180;
export { TOTO_SOURCES } from './toto-source-fetch.js';

let state = {
  running: false,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  sources: [],
  summary: { verified: 0, singleSource: 0, conflict: 0, unmapped: 85, updated: 0, unchanged: 0 }
};
let inFlight = null;
let lastAuthoritySnapshotLogAt = 0;
let lastAuthoritySnapshotRevision = null;
const AUTHORITY_SNAPSHOT_LOG_INTERVAL_MS = 15 * 60 * 1000;
let browserFallbackCursor = 0;
const renderedConsensusCache = new Map();
const BROWSER_FALLBACK_PRIORITY = Object.freeze(['kingkonginfo']); // only kept browser-enabled source (Instruction #1 cleanup)

// Per-source health & auto-failover (additive; TIDAK mengubah decision/verification/betting logic).
const sourceHealth = new Map();
const MAX_HEALTH_ENTRIES = 80;
function healthNow() { return Date.now(); }
function sourceHealthEntry(code) {
  return sourceHealth.get(code) || { failCount: 0, successCount: 0, lastFailAt: 0, lastSuccessAt: 0, lastSeenAt: 0 };
}
function sourceFailThreshold() { return Math.max(2, Number(config.totoSourceFailThreshold) || 5); }
function sourceCooldownMs() { return Math.max(30, Number(config.totoSourceFailCooldownSeconds) || 300) * 1000; }
function recordSourceOutcome(code, ok) {
  const now = healthNow();
  const h = sourceHealthEntry(code);
  if (ok) { h.failCount = 0; h.successCount = (h.successCount || 0) + 1; h.lastSuccessAt = now; }
  else { h.failCount = (h.failCount || 0) + 1; h.lastFailAt = now; }
  h.lastSeenAt = now;
  sourceHealth.set(code, h);
  if (sourceHealth.size > MAX_HEALTH_ENTRIES) {
    const oldest = [...sourceHealth.keys()].sort((a, b) => (sourceHealth.get(a).lastSeenAt || 0) - (sourceHealth.get(b).lastSeenAt || 0))[0];
    if (oldest) sourceHealth.delete(oldest);
  }
  return h;
}
// Degraded selama: kegagalan >= threshold DAN belum lewat masa cooldown (skip usaha).
// Begitu cooldown lewat, dikembalikan ke kandidat untuk auto-heal probe.
function sourceInCooldown(code, now = healthNow()) {
  const h = sourceHealthEntry(code);
  if (h.failCount < sourceFailThreshold()) return false;
  return now - (h.lastFailAt || 0) < sourceCooldownMs();
}
function sourceHealthy(code) {
  const h = sourceHealthEntry(code);
  return h.failCount < sourceFailThreshold();
}
function allSourceHealthSnapshot() {
  const out = {};
  for (const [code, h] of sourceHealth) out[code] = { ...h };
  return out;
}

async function persistSharedState() {
  if (!redis.isOpen) return;
  try {
    await redis.set(STATUS_KEY, JSON.stringify(state), { EX: STATUS_TTL_SECONDS });
  } catch (error) {
    logger.warn('TOTO collector status cache write failed', { error: error.message });
  }
}
async function readSharedState() {
  if (!redis.isOpen) return null;
  try {
    const raw = await redis.get(STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    logger.warn('TOTO collector status cache read failed', { error: error.message });
    return null;
  }
}
function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }

async function bettingReadinessSummary() {
  const market = (await query(`SELECT
    COUNT(*)::int AS total_configs,
    COUNT(*) FILTER (WHERE c.betting_status='OPEN')::int AS open_markets,
    COUNT(*) FILTER (WHERE c.betting_status='OPEN' AND m.verification_status='VERIFIED' AND c.betting_period IS NOT NULL AND btrim(c.betting_period)<>'' AND c.close_at IS NOT NULL AND c.close_at>now())::int AS ready_open_markets,
    COUNT(*) FILTER (WHERE c.betting_status='OPEN' AND (m.verification_status<>'VERIFIED' OR c.betting_period IS NULL OR btrim(c.betting_period)='' OR c.close_at IS NULL OR c.close_at<=now()))::int AS invalid_open_markets
    FROM market_betting_configs c JOIN markets m ON m.id=c.market_id`)).rows[0] || {};
  const orders = (await query(`SELECT
    COUNT(*) FILTER (WHERE o.status='ACCEPTED' AND o.wallet_mode='CASH')::int AS accepted_orders,
    COUNT(*) FILTER (WHERE o.status='ACCEPTED' AND o.wallet_mode='CASH' AND EXISTS (
      SELECT 1 FROM market_result_history h
      WHERE h.market_id=o.market_id AND h.period=o.period
        AND (h.source_name LIKE 'OFFICIAL:%' OR h.source_name LIKE 'CONSENSUS:%')
    ))::int AS accepted_orders_with_authority
    FROM bet_orders o`)).rows[0] || {};
  const accepted = Number(orders.accepted_orders || 0);
  const withAuthority = Number(orders.accepted_orders_with_authority || 0);
  return {
    totalConfigs: Number(market.total_configs || 0),
    openMarkets: Number(market.open_markets || 0),
    readyOpenMarkets: Number(market.ready_open_markets || 0),
    invalidOpenMarkets: Number(market.invalid_open_markets || 0),
    acceptedOrders: accepted,
    acceptedOrdersWithAuthority: withAuthority,
    acceptedOrdersWaitingAuthority: Math.max(0, accepted - withAuthority)
  };
}

async function applyDecisions(decisions) {
  const marketRows = (await query('SELECT id,slug,result,period,verification_status,draw_date FROM markets')).rows;
  const bySlug = new Map(marketRows.map(row => [row.slug, row]));
  let updated = 0, unchanged = 0, autoSuspended = 0;
  for (const decision of decisions) {
    const market = bySlug.get(decision.slug);
    if (!market) continue;
    const suspendIfOpen = async () => {
      const suspended = await query(`UPDATE market_betting_configs SET betting_status='SUSPENDED',updated_at=now() WHERE market_id=$1 AND betting_status='OPEN' RETURNING market_id`, [market.id]);
      autoSuspended += Number(suspended.rowCount || 0);
    };
    if (decision.status === 'CONFLICT') {
      await query(`UPDATE markets SET verification_status='CONFLICT',confidence=0,source_updated_at=now(),updated_at=now() WHERE id=$1`, [market.id]);
      await suspendIfOpen();
      unchanged += 1;
      continue;
    }
    if (decision.status === 'SINGLE_SOURCE') {
      if (config.totoPublishSingleSource && /^\d{3,6}$/.test(String(decision.result || '')) && decision.drawDate) {
        await query(`UPDATE markets SET result=$1,period=$2,verification_status='SINGLE_SOURCE',confidence=$3,draw_date=$4,draw_time=COALESCE($5,draw_time),source_updated_at=now(),updated_at=now() WHERE id=$6`,
          [decision.result, decision.drawDate, decision.confidence || 0.6, decision.drawDate, decision.drawTime, market.id]);
        updated += 1;
      } else {
        await query(`UPDATE markets SET verification_status='SINGLE_SOURCE',confidence=$1,source_updated_at=now(),updated_at=now() WHERE id=$2`, [decision.confidence || 0.6, market.id]);
        unchanged += 1;
      }
      await suspendIfOpen();
      continue;
    }
    if (!decision.result || !decision.drawDate || decision.status !== 'VERIFIED') {
      if (!Object.keys(MARKET_MAP.find(item => item.slug === decision.slug)?.sources || {}).length && !decision.authority) {
        await query(`UPDATE markets SET verification_status='UNMAPPED',confidence=0,updated_at=now() WHERE id=$1 AND verification_status<>'UNMAPPED'`, [market.id]);
      }
      await suspendIfOpen();
      unchanged += 1;
      continue;
    }
    const period = decision.drawDate;
    const same = String(market.result || '') === decision.result && String(market.period || '') === period && market.verification_status === 'VERIFIED';
    await query(`UPDATE markets SET result=$1,period=$2,verification_status='VERIFIED',confidence=$3,draw_date=$4,draw_time=COALESCE($5,draw_time),source_updated_at=now(),updated_at=now() WHERE id=$6`,
      [decision.result, period, decision.confidence, decision.drawDate, decision.drawTime, market.id]);
    if (!same) {
      const sourceName = decision.authority === 'OFFICIAL' ? `OFFICIAL:${(decision.sources || []).join('+')}` : `CONSENSUS:${(decision.sources || []).join('+')}`;
      await appendMarketHistory({ marketId: market.id, period, result: decision.result, drawDate: decision.drawDate, drawTime: decision.drawTime, sourceName, sourceUpdatedAt: new Date() });
      updated += 1;
    } else unchanged += 1;
  }
  return { updated, unchanged, autoSuspended };
}
function parsedCoverageForSource(source) {
  if (!source?.ok || !source?.html) return 0;
  const decisions = MARKET_MAP.map(mapping => resolveDecision(mapping, [source]));
  return Number(rawObservationSummaryBySource(decisions).get(source.code)?.parsedMarkets || 0);
}
function cachedRenderedConsensusSource(code, now = Date.now()) {
  const cached = renderedConsensusCache.get(code);
  if (!cached) return null;
  if (now - cached.cachedAt > config.totoBrowserFallbackCacheSeconds * 1000) {
    renderedConsensusCache.delete(code);
    return null;
  }
  return { ...cached.source, renderer: `${cached.source.renderer || 'CHROMIUM_CDP'}_CACHE`, renderCacheAgeMs: now - cached.cachedAt };
}
async function enrichConsensusSourcesWithBrowserFallback(sourceResults) {
  const initialDecisions = MARKET_MAP.map(mapping => resolveDecision(mapping, sourceResults));
  const initialRaw = rawObservationSummaryBySource(initialDecisions);
  const candidates = sourceResults
    .filter(source => source.browserFallback && Number(initialRaw.get(source.code)?.parsedMarkets || 0) === 0)
    .filter(source => !sourceInCooldown(source.code))
    .sort((a, b) => {
      const ai = BROWSER_FALLBACK_PRIORITY.indexOf(a.code), bi = BROWSER_FALLBACK_PRIORITY.indexOf(b.code);
      const ah = sourceHealthy(a.code) ? 0 : 1, bh = sourceHealthy(b.code) ? 0 : 1;
      return (ah - bh) || ((ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi));
    });
  if (!candidates.length) return sourceResults;
  const max = Math.min(config.totoBrowserFallbackMaxSources, candidates.length);
  const selected = [];
  for (let offset = 0; offset < max; offset += 1) selected.push(candidates[(browserFallbackCursor + offset) % candidates.length]);
  if (candidates.length && max) browserFallbackCursor = (browserFallbackCursor + max) % candidates.length;
  const replacements = new Map();
  for (const source of selected) {
    const rendered = await renderTotoSource(source);
    const coverage = parsedCoverageForSource(rendered);
    if (coverage > 0) {
      renderedConsensusCache.set(source.code, { source: rendered, cachedAt: Date.now(), coverage });
      replacements.set(source.code, rendered);
    } else {
      const cached = cachedRenderedConsensusSource(source.code);
      if (cached) replacements.set(source.code, cached);
      else replacements.set(source.code, rendered);
    }
  }
  for (const source of candidates) {
    if (replacements.has(source.code)) continue;
    const cached = cachedRenderedConsensusSource(source.code);
    if (cached) replacements.set(source.code, cached);
  }
  return sourceResults.map(source => replacements.get(source.code) || source);
}

async function executeRun({ fetchImpl = fetch, persist = true, reason = 'scheduled' } = {}) {
  const startedAt = new Date();
  state = { ...state, running: true, lastRunAt: startedAt.toISOString(), lastError: null };

  const manual = reason === 'owner-manual';
  const activeWakeSet = manual ? [] : poolsInPollingPhase(startedAt, Object.keys(TOTO_RESULT_TIMES_WIB));
  const duePolls = manual ? [] : dueJobs(startedAt).map(item => item.key);

  if (!manual && !activeWakeSet.length && !duePolls.length) {
    state = {
      ...state,
      running: false,
      summary: { ...(state.summary || {}), activeWakeSet: 0, duePolls: 0 },
      poller: pollerSnapshot(startedAt)
    };
    await persistSharedState();
    return { ...state, skipped: true, skipReason: 'NO_ACTIVE_TOTO_WAKE_WINDOW', decisions: [] };
  }

  // Vegasnet adalah sumber tunggal TOTO (lihat toto-source-fetch.js). Jalur
  // scraper lain sudah dibuang agar collector tidak menambah beban dan tidak
  // menggeser angka dengan board yang menulis label berbeda.
  const initialSourceResults = await collectTotoSources(fetchImpl);
  const officialResults = [];
  const sourceResults = await enrichConsensusSourcesWithBrowserFallback(initialSourceResults);
  if (![...sourceResults, ...officialResults].some(source => source.ok)) {
    let autoSuspended = 0;
    if (persist) {
      const suspended = await query(`UPDATE market_betting_configs SET betting_status='SUSPENDED',updated_at=now() WHERE betting_status='OPEN' RETURNING market_id`);
      autoSuspended = Number(suspended.rowCount || 0);
      state = { ...state, running: false, lastError: { message: 'ALL_TOTO_SOURCES_UNAVAILABLE', at: new Date().toISOString() }, summary: { ...(state.summary || {}), autoSuspended }, bettingReadiness: await bettingReadinessSummary() };
      await persistSharedState();
    }
    throw new Error(`Semua sumber TOTO gagal: ${[...sourceResults, ...officialResults].map(source => `${source.name}:${source.error}`).join('; ')}`);
  }
  const consensusDecisions = MARKET_MAP.map(mapping => resolveDecision(mapping, sourceResults));
  const rawDecisions = MARKET_MAP.map((mapping, index) => {
    const decision = officialDecision(mapping.slug, officialResults) || consensusDecisions[index];
    if (decision === consensusDecisions[index]) return decision;
    return { ...decision, schedule: consensusDecisions[index]?.schedule || null };
  });
  const decisions = rawDecisions.map(decision => enforceDecisionFreshness(decision, { now: startedAt, maxAgeDays: config.totoMaxResultAgeDays }));
  const counts = countDecisions(decisions);
  const scheduleReadiness = {
    observedMarkets: decisions.filter(item => item.schedule?.status === 'OBSERVED').length,
    verifiedMarkets: decisions.filter(item => item.schedule?.status === 'VERIFIED').length,
    closeTimeMarkets: decisions.filter(item => Boolean(item.schedule?.closeTime)).length,
    resultTimeMarkets: decisions.filter(item => Boolean(item.schedule?.resultTime)).length,
    explicitFutureDrawMarkets: decisions.filter(item => Boolean(item.schedule?.nextDrawDate)).length
  };
  const sourceObservationCounts = observationCountsBySource(decisions);
  const rawSourceSummary = rawObservationSummaryBySource(consensusDecisions);
  // Auto-failover: rekam kesehatan tiap sumber untuk siklus berikutnya.
  for (const source of sourceResults) {
    const raw = rawSourceSummary.get(source.code) || { parsedMarkets: 0 };
    recordSourceOutcome(source.code, Boolean(source.ok && Number(raw.parsedMarkets || 0) > 0));
  }
  for (const source of officialResults) {
    recordSourceOutcome(source.code, Boolean(source.ok && Number(source.parsedMarkets || 0) > 0));
  }
  const sourceHealthSnapshot = allSourceHealthSnapshot();
  // Ukur jam result yang terlihat di sumber. Sampel baru hanya diambil ketika
  // tanggal draw berubah, jadi tidak menambah beban request.
  const drawCalibration = recordDrawObservations(decisions, { now: startedAt });
  const polledKeys = manual ? [] : dueJobs(startedAt).map(item => item.key);
  const pollOutcome = applyPollResult(decisions, { now: startedAt, polled: polledKeys });
  const persistence = persist ? await applyDecisions(decisions) : { updated: 0, unchanged: 0, autoSuspended: 0 };
  const cashWindows = persist ? await reconcileCashBettingWindows(decisions) : null;
  state = {
    running: false,
    lastRunAt: startedAt.toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    sourceHealth: sourceHealthSnapshot,
    sources: [
      ...officialResults.map(({ code, name, url, ok, bytes, latencyMs, error, parsedMarkets }) => ({
        code, name, url, ok: Boolean(ok && Number(parsedMarkets || 0) > 0), transportOk: Boolean(ok), bytes, latencyMs,
        error, parsedMarkets: Number(parsedMarkets || 0), selectedMarkets: Number(sourceObservationCounts.get(code) || 0), latestDrawDate: null, authority: 'OFFICIAL',
        failCount: Number(sourceHealthEntry(code).failCount || 0), degraded: sourceInCooldown(code)
      })),
      ...sourceResults.map(({ code, name, url, ok, bytes, latencyMs, error, status, finalUrl, contentType, attempts, renderer, renderAttempted, renderMs, renderError, renderCacheAgeMs }) => {
        const raw = rawSourceSummary.get(code) || { parsedMarkets: 0, latestDrawDate: null };
        const parsedMarkets = Number(raw.parsedMarkets || 0);
        const selectedMarkets = Number(sourceObservationCounts.get(code) || 0);
        return {
          code, name, url, ok: Boolean(ok && parsedMarkets > 0), transportOk: Boolean(ok), bytes, latencyMs,
          error: ok && parsedMarkets === 0 ? 'TOTO_SOURCE_PARSE_EMPTY' : error,
          parsedMarkets, selectedMarkets, latestDrawDate: raw.latestDrawDate || null,
          status: status || null, finalUrl: finalUrl || null, contentType: contentType || null,
          attempts: Array.isArray(attempts) ? attempts : [], renderer: renderer || null, renderAttempted: Boolean(renderAttempted), renderMs: Number(renderMs || 0), renderError: renderError || null,
          renderCacheAgeMs: Number(renderCacheAgeMs || 0), failCount: Number(sourceHealthEntry(code).failCount || 0), degraded: sourceInCooldown(code)
        };
      })
    ],
    summary: { ...counts, ...persistence, cashWindows, activeWakeSet: activeWakeSet.length, duePolls: polledKeys.length },
    scheduleReadiness,
    drawCalibration: { ...drawCalibration, snapshot: drawCalibrationSnapshot() },
    bettingReadiness: persist ? await bettingReadinessSummary() : null,
    poller: pollerSnapshot(startedAt),
    pollOutcome
  };
  await persistSharedState();
  const authoritySnapshot = buildTotoAuthoritySnapshot(decisions);
  const snapshotRevision = totoAuthoritySnapshotRevision(authoritySnapshot);
  const authorityChanged = snapshotRevision !== lastAuthoritySnapshotRevision;
  const now = Date.now();
  if (lastAuthoritySnapshotLogAt === 0 || authorityChanged || now - lastAuthoritySnapshotLogAt >= AUTHORITY_SNAPSHOT_LOG_INTERVAL_MS || reason === 'owner-manual') {
    logger.info('TOTO production result authority snapshot', { reason, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null, snapshotVersion: 'R6.9.0.23-V12', snapshotRevision, authorityChanged, scheduleReadiness, bettingReadiness: state.bettingReadiness || null });
    lastAuthoritySnapshotLogAt = now;
  }
  lastAuthoritySnapshotRevision = snapshotRevision;
  logger.info('TOTO collector cycle completed', {
    reason,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
    ...state.summary,
    healthySources: state.sources.filter(item => item.ok).length,
    degradedSources: state.sources.filter(item => item.degraded).length,
    sourceHealth: state.sourceHealth || null,
    sourceDiagnostics: state.sources.map(({ code, ok, transportOk, parsedMarkets, selectedMarkets, latestDrawDate, status, bytes, latencyMs, error, renderer, renderAttempted, renderMs, renderError }) => ({
      code, ok, transportOk, parsedMarkets, selectedMarkets, latestDrawDate, status, bytes, latencyMs, error, renderer, renderAttempted, renderMs, renderError
    })),
    scheduleReadiness: state.scheduleReadiness || null,
    bettingReadiness: state.bettingReadiness || null,
    poller: state.poller || null
  });
  return { ...state, decisions, poller: state.poller || null };
}
export async function runTotoCollector(options = {}) {
  const reason = options.reason || 'scheduled';
  if (reason !== 'owner-manual') {
    const now = new Date();
    syncJobs(now);
    const due = dueJobs(now);
    const active = poolsInPollingPhase(now, Object.keys(TOTO_RESULT_TIMES_WIB));
    if (!active.length && !due.length) {
      return { skipped: true, skipReason: 'NO_ACTIVE_TOTO_WAKE_WINDOW', decisions: [], poller: pollerSnapshot(now), activePolls: 0, duePolls: 0 };
    }
  }

  if (inFlight) return inFlight;
  const token = randomUUID();
  let distributedLock = false;
  if (redis.isOpen) {
    try { distributedLock = Boolean(await redis.set(LOCK_KEY, token, { NX: true, EX: LOCK_TTL_SECONDS })); }
    catch (error) { logger.warn('TOTO collector distributed lock unavailable', { error: error.message }); }
    if (!distributedLock) {
      const shared = await totoCollectorStatus();
      return { ...shared, skipped: true, skipReason: 'COLLECTOR_ALREADY_RUNNING', decisions: [] };
    }
  }
  inFlight = executeRun(options).catch(async error => {
    state = { ...state, running: false, lastError: { message: clean(error.message), at: new Date().toISOString() } };
    await persistSharedState();
    logger.warn('TOTO collector cycle failed', { error: error.message, reason: options.reason || 'scheduled' });
    throw error;
  }).finally(async () => {
    if (distributedLock && redis.isOpen) {
      try { await redis.eval('if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end', { keys: [LOCK_KEY], arguments: [token] }); }
      catch (error) { logger.warn('TOTO collector distributed lock release failed', { error: error.message }); }
    }
    inFlight = null;
  });
  return inFlight;
}
export async function totoCollectorStatus() {
  const shared = await readSharedState();
  return {
    enabled: config.totoCollectorEnabled,
    intervalSeconds: config.totoCollectorIntervalSeconds,
    mappedMarkets: MARKET_MAP.filter(item => Object.keys(item.sources || {}).length).length,
    unmappedMarkets: MARKET_MAP.filter(item => !Object.keys(item.sources || {}).length).length,
    totalMarkets: MARKET_MAP.length,
    ...(shared || state),
    statusScope: shared ? 'REDIS_SHARED' : 'PROCESS_LOCAL'
  };
}

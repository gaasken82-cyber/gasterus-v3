import crypto from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';
import { redis } from './redis.js';
import { logger } from './logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchSharpApi, fetchApiSports, fetchTheOddsApi, fetchTheSportsDb, fetchSportmonks, mergeProviderEvents, publicEvent } from './sportsbook-providers.js';
import { fetchPublicMarketFeed } from './sportsbook-public-market.js';
import { fetchFootballDataIo } from './sportsbook-footballdataio.js';
import { seedRegistry, maintainRegistry, isActive, recordResult, registrySummary } from './sportsbook-source-registry.js';
import { advanceProviderLifecycle, publicProviderLifecycle, shouldProbeProvider, transitionProviderLifecycle } from './sportsbook-provider-lifecycle.js';
import { recordSportsbookMarketTransitions, recordSportsbookProviderTransitions, sportsbookPricingExposureSnapshot } from './sportsbook-operations.js';
import { applySportsbookRiskRepricing } from './sportsbook-risk-pricing.js';
import { reconcileSportsbookMarketLifecycle } from './sportsbook-market-lifecycle.js';
import { priceVersionChangeCount } from './sportsbook-live-observability.js';
import { applySportsbookTradingControls, listActiveSportsbookTradingControls, resolveSportsbookTradingPolicy } from './sportsbook-trading-controls.js';
import { eventSettlementAuthority, settlementAuthoritySummary } from './sportsbook-settlement-authority.js';
import { enrichTeamArtwork } from './sportsbook-team-artwork.js';
import { compactMemberMarkets, projectMemberMarkets } from './sportsbook-member-projection.js';

const LIFECYCLE_GENERATION = 'r6915';
const CACHE_KEY = 'sportsbook:aggregated-feed:v11';
seedRegistry();
const LIFECYCLE_KEY = 'sportsbook:provider-lifecycle:v6';
const MARKET_LIFECYCLE_KEY = 'sportsbook:market-lifecycle:v6';
const REFRESH_MS = config.sportsFeedRefreshSeconds * 1000;
const STALE_MS = config.sportsFeedStaleSeconds * 1000;

let memory = { lifecycleGeneration: LIFECYCLE_GENERATION, events: [], providers: [], providerLifecycle: {}, marketLifecycleStats: { active: 0, suspended: 0, reopening: 0, closed: 0 }, revision: null, fetchedAt: 0, expiresAt: 0, error: null };
let marketLifecycleMemory = {};
let inFlight = null;
const HERE = dirname(fileURLToPath(import.meta.url));
let suppliedSnapshot = null;
function loadSuppliedSnapshot() {
  if (suppliedSnapshot) return suppliedSnapshot;
  try {
    suppliedSnapshot = JSON.parse(readFileSync(resolve(HERE, '../data/sportsbook-supplied-snapshot.json'), 'utf8'));
  } catch {
    suppliedSnapshot = { capturedAt: null, events: [] };
  }
  return suppliedSnapshot;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const CLOSED_EVENT_STATUSES = new Set(['FINISHED', 'CANCELLED', 'CANCELED', 'ABANDONED', 'POSTPONED', 'VOID']);
function eventBettingOpen(event, now = Date.now()) {
  const status = clean(event?.status).toUpperCase();
  if (CLOSED_EVENT_STATUSES.has(status) || status === 'SUSPENDED') return false;
  if (event?.live || ['LIVE', 'IN_PLAY', 'IN-PLAY'].includes(status)) return true;
  const kickoff = Date.parse(event?.startTime || '');
  if (status === 'SCHEDULED' && Number.isFinite(kickoff)) {
    return now <= kickoff + Number(config.sportsbookPrematchCloseGraceSeconds || 0) * 1000;
  }
  return true;
}
function enforceEventBettingWindow(events = [], now = Date.now()) {
  return events.map(event => {
    if (eventBettingOpen(event, now)) return event;
    return {
      ...event,
      markets: (event.markets || []).map(market => ({
        ...market,
        suspended: true,
        selections: (market.selections || []).map(selection => ({ ...selection, suspended: true }))
      }))
    };
  });
}
function memberVisibleEvent(event, now = Date.now()) {
  const status = clean(event?.status).toUpperCase();
  if (CLOSED_EVENT_STATUSES.has(status)) return false;
  if (event?.live || ['LIVE', 'IN_PLAY', 'IN-PLAY'].includes(status)) return true;
  const kickoff = Date.parse(event?.startTime || '');
  if (!Number.isFinite(kickoff)) return true;
  const horizonMs = Number(config.sportsbookMemberHorizonDays || 14) * 86400000;
  const graceMs = Number(config.sportsbookPrematchCloseGraceSeconds || 0) * 1000;
  return kickoff >= now - graceMs && kickoff <= now + horizonMs;
}

function stablePriceVersion(event, market, selection) {
  return crypto.createHash('sha256').update([
    event?.id || '', market?.id || market?.key || '', selection?.key || '', selection?.source || market?.source || '',
    selection?.sourceSelectionId || '', selection?.line ?? market?.line ?? '', selection?.odds ?? ''
  ].map(value => String(value ?? '')).join('|')).digest('hex').slice(0, 28);
}
function stampPriceVersions(events = [], fetchedAt = Date.now()) {
  const fallbackUpdatedAt = new Date(fetchedAt).toISOString();
  return events.map(event => ({
    ...event,
    markets: (event.markets || []).map(market => ({
      ...market,
      updatedAt: market.updatedAt || fallbackUpdatedAt,
      selections: (market.selections || []).map(selection => {
        const updatedAt = selection.updatedAt || market.updatedAt || fallbackUpdatedAt;
        return {
          ...selection,
          source: selection.source || market.source || 'unknown',
          updatedAt,
          priceVersion: selection.priceVersion || stablePriceVersion(event, market, selection)
        };
      })
    }))
  }));
}
function stableFeedRevision(events = [], providerLifecycle = {}) {
  const hash = crypto.createHash('sha256');
  for (const event of [...events].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    hash.update(`E|${event.id}|${event.status}|${event.live ? 1 : 0}
`);
    for (const market of [...(event.markets || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      hash.update(`M|${market.id}|${market.source || ''}|${market.suspended ? 1 : 0}
`);
      for (const selection of [...(market.selections || [])].sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
        hash.update(`S|${selection.key}|${selection.priceVersion || ''}|${selection.suspended ? 1 : 0}
`);
      }
    }
  }
  for (const code of Object.keys(providerLifecycle).sort()) {
    const state = providerLifecycle[code] || {};
    hash.update(`P|${code}|${state.state || ''}|${state.bettingAllowed ? 1 : 0}|${state.pricingReady ? 1 : 0}
`);
  }
  return hash.digest('hex').slice(0, 32);
}
function lifecycleOptions() {
  return {
    failureThreshold: config.sportsbookProviderFailureThreshold,
    recoverySuccesses: config.sportsbookProviderRecoverySuccesses,
    cooldownSeconds: config.sportsbookProviderCooldownSeconds
  };
}
function assertSelectionFresh(event, market, selection, feedFetchedAt) {
  const now = Date.now();
  const feedAge = now - Number(feedFetchedAt || 0);
  if (!Number.isFinite(feedAge) || feedAge < 0 || feedAge > STALE_MS) {
    throw new AppError(409, 'Feed odds sudah kedaluwarsa. Tunggu pembaruan berikutnya.', 'SPORTS_FEED_STALE_AT_ACCEPTANCE');
  }
  const source = String(selection?.source || market?.source || '');
  // public-market freshness is governed by its bounded collector cache. A successful
  // aggregate observation is therefore the acceptance freshness clock; source file
  // Last-Modified may legitimately be older without making the deterministic quote stale.
  const freshnessTimestamp = source === 'public-market' ? new Date(Number(feedFetchedAt || 0)).toISOString() : (selection?.updatedAt || market?.updatedAt);
  const updatedMs = Date.parse(freshnessTimestamp || '');
  if (!Number.isFinite(updatedMs)) return;
  const maxAgeSeconds = source === 'public-market'
    ? config.publicMarketPriceMaxAgeSeconds
    : event?.live ? config.sportsbookMaxLivePriceAgeSeconds : config.sportsbookMaxPrematchPriceAgeSeconds;
  if (now - updatedMs > maxAgeSeconds * 1000) {
    throw new AppError(409, 'Harga odds terlalu lama untuk diterima. Market ditahan sampai provider mengirim harga baru.', 'SPORTS_PRICE_STALE', {
      eventId: event?.id || null,
      marketId: market?.id || null,
      selectionId: selection?.key || null,
      priceUpdatedAt: selection?.updatedAt || market?.updatedAt || null,
      maxAgeSeconds
    });
  }
}
function pricedMarketCount(events = []) {
  return events.reduce((total, event) => total + (event.markets || []).filter(market =>
    (market.selections || []).some(selection => Number.isFinite(Number(selection.odds)) && Number(selection.odds) > 1)
  ).length, 0);
}
function bettableMarketCount(events = []) {
  const now = Date.now();
  return events.reduce((total, event) => {
    if (!eventBettingOpen(event, now)) return total;
    return total + (event.markets || []).filter(market =>
      !market.suspended && (market.selections || []).some(selection => !selection.suspended && Number.isFinite(Number(selection.odds)) && Number(selection.odds) > 1)
    ).length;
  }, 0);
}
function providerHasPricedMarkets(result) {
  return Boolean(result?.enabled && !result?.stale && pricedMarketCount(result.events || []) > 0);
}
function enabledProviders() {
  return [
    { name: 'SBOTOTO Public Market Feed', code: 'public-market', enabled: Boolean(config.publicMarketEnabled) },
    { name: 'SharpAPI', code: 'sharpapi', enabled: config.sharpApiEnabled && Boolean(config.sharpApiKey) },
    { name: 'API-Sports', code: 'api-sports', enabled: config.apiSportsEnabled && Boolean(config.apiSportsKey) },
    { name: 'The Odds API', code: 'the-odds-api', enabled: config.theOddsApiEnabled && Boolean(config.theOddsApiKey) },
    { name: 'TheSportsDB', code: 'thesportsdb', enabled: config.theSportsDbEnabled && Boolean(config.theSportsDbKey) },
    { name: 'FootballData.io', code: 'footballdata-io', enabled: config.footballDataIoEnabled && Boolean(config.footballDataIoKey) }
  ];
}
async function readRedisCache() {
  if (!redis.isOpen) return null;
  try {
    const raw = await redis.get(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.events) || !Array.isArray(parsed.providers)) return null;
    if (parsed.lifecycleGeneration !== LIFECYCLE_GENERATION) return null;
    return parsed;
  } catch (error) {
    logger.warn('Sportsbook Redis cache read failed', { error: error.message });
    return null;
  }
}
async function writeRedisCache(value) {
  if (!redis.isOpen) return;
  try {
    await redis.set(CACHE_KEY, JSON.stringify(value), { EX: Math.max(config.sportsFeedStaleSeconds * 2, 300) });
  } catch (error) {
    logger.warn('Sportsbook Redis cache write failed', { error: error.message });
  }
}
async function readProviderLifecycle() {
  if (memory.lifecycleGeneration === LIFECYCLE_GENERATION && memory.providerLifecycle && Object.keys(memory.providerLifecycle).length) return memory.providerLifecycle;
  if (!redis.isOpen) return {};
  try {
    const raw = await redis.get(LIFECYCLE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    logger.warn('Sportsbook provider lifecycle cache read failed', { error: error.message });
    return {};
  }
}
async function writeProviderLifecycle(value) {
  if (!redis.isOpen) return;
  try {
    await redis.set(LIFECYCLE_KEY, JSON.stringify(value), { EX: Math.max(config.sportsFeedStaleSeconds * 10, 3600) });
  } catch (error) {
    logger.warn('Sportsbook provider lifecycle cache write failed', { error: error.message });
  }
}
async function readMarketLifecycle() {
  if (marketLifecycleMemory && Object.keys(marketLifecycleMemory).length) return marketLifecycleMemory;
  if (!redis.isOpen) return marketLifecycleMemory || {};
  try {
    const raw = await redis.get(MARKET_LIFECYCLE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    marketLifecycleMemory = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return marketLifecycleMemory;
  } catch (error) {
    logger.warn('Sportsbook market lifecycle cache read failed', { error: error.message });
    return marketLifecycleMemory || {};
  }
}
async function writeMarketLifecycle(value) {
  marketLifecycleMemory = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (!redis.isOpen) return;
  try {
    await redis.set(MARKET_LIFECYCLE_KEY, JSON.stringify(marketLifecycleMemory), { EX: Math.max(config.sportsbookMarketLifecycleRetentionSeconds, 3600) });
  } catch (error) {
    logger.warn('Sportsbook market lifecycle cache write failed', { error: error.message });
  }
}
function providerSummary(result, elapsedMs) {
  const events = result.events || [];
  const pricedMarkets = pricedMarketCount(events);
  const bettableMarkets = bettableMarketCount(events);
  const transportHealthy = Boolean(result.enabled && result.transportOk !== false && !result.stale && !result.skipped);
  return {
    code: result.provider,
    enabled: Boolean(result.enabled),
    healthy: providerHasPricedMarkets(result),
    transportHealthy,
    pricingReady: Boolean(result.enabled && !result.stale && pricedMarkets > 0),
    metadataHealthy: Boolean(result.enabled && !result.stale && events.length > 0),
    events: events.length,
    pricedMarkets,
    bettableMarkets,
    warnings: (result.errors || []).slice(0, 3),
    latencyMs: elapsedMs,
    skipped: Boolean(result.skipped)
  };
}
async function timed(provider, fetcher) {
  const started = performance.now();
  try {
    const result = await fetcher();
    return { result: { ...result, transportOk: result.transportOk !== false }, elapsedMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      result: { provider, enabled: true, events: [], errors: [clean(error.message || 'Provider failed')], transportOk: false },
      elapsedMs: Math.round(performance.now() - started)
    };
  }
}
function applyProviderLifecycleResult(result, lifecycle) {
  const settlementReady = Boolean(lifecycle?.state === 'HEALTHY' && lifecycle?.transportHealthy);
  const events = (result.events || []).map(event => ({
    ...event,
    _settlementReadySources: settlementReady ? [result.provider] : [],
    markets: lifecycle?.bettingAllowed
      ? (event.markets || [])
      : (event.markets || []).map(market => ({
          ...market,
          suspended: true,
          selections: (market.selections || []).map(selection => ({ ...selection, suspended: true }))
        }))
  }));
  return { ...result, events };
}
function bridgeEvent(event, { suspended = false, source = 'supplied-snapshot' } = {}) {
  const markets = (event.markets || []).map(market => {
    const marketSuspended = Boolean(suspended);
    return {
    id: market.id,
    key: market.id,
    type: market.type || 'OTHER',
    label: market.label || market.type || 'Market',
    period: market.period || 'FT',
    line: market.line ?? null,
    mainLine: market.mainLine ?? null,
    suspended: marketSuspended,
    updatedAt: null,
    source,
    selections: (market.selections || []).map(selection => ({
      key: selection.key,
      label: selection.label,
      odds: Number(selection.odds),
      line: selection.handicap ?? selection.line ?? null,
      suspended: marketSuspended,
      source,
      sourceSelectionId: selection.key
    })).filter(selection => Number.isFinite(selection.odds) && selection.odds > 1)
  }; }).filter(market => market.selections.length);
  return {
    id: event.id,
    sport: event.sport || 'Football',
    league: event.league || 'Other',
    country: event.country || null,
    startTime: event.startTime || null,
    status: event.status || (event.live ? 'LIVE' : 'SCHEDULED'),
    live: Boolean(event.live),
    clock: event.clock || null,
    home: { name: event.home?.name || 'Home', score: event.home?.score ?? null, logo: event.home?.logo || null },
    away: { name: event.away?.name || 'Away', score: event.away?.score ?? null, logo: event.away?.logo || null },
    leagueLogo: event.leagueLogo || null,
    venue: event.venue || null,
    periodScores: event.periodScores || {},
    availableMarketCount: Math.max(Number(event.availableMarketCount || 0), markets.length) || markets.length,
    detailFetchedAt: event.detailFetchedAt || null,
    markets,
    _refs: { [source]: event.sourceId || event.id },
    _sources: [source]
  };
}
function suppliedSnapshotResult() {
  const snapshot = loadSuppliedSnapshot();
  return {
    provider: 'supplied-snapshot', enabled: true,
    events: (snapshot.events || []).map(event => bridgeEvent(event, { suspended: true, source: 'supplied-snapshot' })),
    errors: ['Live source unavailable; showing the last supplied source snapshot with betting disabled.'],
    capturedAt: snapshot.capturedAt || null
  };
}
async function performRefresh({ reason = 'scheduled' } = {}) {
  const configured = enabledProviders();
  if (!configured.some(provider => provider.enabled)) {
    throw new AppError(503, 'Belum ada sumber sportsbook yang dikonfigurasi pada core service.', 'SPORTS_PROVIDERS_NOT_CONFIGURED');
  }
  const previousLifecycle = await readProviderLifecycle();
  if (config.sportsSourceRegistryEnabled) maintainRegistry();
  const descriptors = [
    { code: 'public-market', enabled: Boolean(config.publicMarketEnabled), fetcher: fetchPublicMarketFeed },
    { code: 'sharpapi', enabled: config.sharpApiEnabled && Boolean(config.sharpApiKey), fetcher: fetchSharpApi },
    { code: 'api-sports', enabled: config.apiSportsEnabled && Boolean(config.apiSportsKey), fetcher: fetchApiSports },
    { code: 'the-odds-api', enabled: config.theOddsApiEnabled && Boolean(config.theOddsApiKey), fetcher: fetchTheOddsApi },
    { code: 'sportmonks', enabled: config.sportmonksEnabled && Boolean(config.sportmonksApiKey), fetcher: fetchSportmonks },
    { code: 'thesportsdb', enabled: config.theSportsDbEnabled && Boolean(config.theSportsDbKey), fetcher: fetchTheSportsDb },
    { code: 'footballdata-io', enabled: config.footballDataIoEnabled && Boolean(config.footballDataIoKey), fetcher: fetchFootballDataIo }
  ].filter(descriptor => !config.sportsSourceRegistryEnabled || isActive(descriptor.code));
  const settled = await Promise.all(descriptors.map(descriptor => {
    const lifecycle = previousLifecycle[descriptor.code];
    if (descriptor.enabled && lifecycle?.state === 'OPEN_CIRCUIT' && !shouldProbeProvider(lifecycle)) {
      return Promise.resolve({
        result: {
          provider: descriptor.code,
          enabled: true,
          events: [],
          errors: ['Provider circuit breaker cooldown active.'],
          transportOk: false,
          skipped: true
        },
        elapsedMs: 0
      });
    }
    return timed(descriptor.code, descriptor.fetcher);
  }));

  let results = settled.map(item => item.result);
  const rawProviderStatus = settled.map(item => providerSummary(item.result, item.elapsedMs));
  const nextLifecycle = {};
  const transitions = [];
  let providerStatus = rawProviderStatus.map(status => {
    const { next, transition } = transitionProviderLifecycle(previousLifecycle[status.code], {
      code: status.code,
      enabled: status.enabled,
      transportHealthy: status.transportHealthy,
      pricingReady: status.pricingReady,
      skipped: status.skipped,
      error: status.warnings[0] || null
    }, lifecycleOptions());
    nextLifecycle[status.code] = next;
    if (transition) transitions.push(transition);
    if (config.sportsSourceRegistryEnabled && !status.skipped) recordResult(status.code, Boolean(status.transportHealthy), status.warnings?.[0] || '');
    return {
      ...status,
      state: next.state,
      failureStreak: next.failureStreak,
      successStreak: next.successStreak,
      nextProbeAt: next.nextProbeAt || null,
      bettingAllowed: next.bettingAllowed,
      healthy: next.bettingAllowed
    };
  });

  results = results.map(result => {
    const lifecycle = nextLifecycle[result.provider];
    return applyProviderLifecycleResult(result, lifecycle);
  });

  let events = mergeProviderEvents(results);
  try {
    const exposures = await sportsbookPricingExposureSnapshot({ limit: 5000 });
    events = applySportsbookRiskRepricing(events, exposures);
  } catch (error) {
    logger.warn('Sportsbook risk repricing snapshot unavailable; base prices preserved', { error: error.message });
  }
  // Artwork enrichment is metadata-only. A badge provider failure can never suspend odds.
  events = await enrichTeamArtwork(events);
  // Feed-level safety: a finished/suspended event or a prematch event whose kickoff
  // has passed without confirmed live state must not remain counted or rendered as bettable.
  events = enforceEventBettingWindow(events, Date.now());
  let snapshotFallback = false;
  let snapshotCapturedAt = null;
  if (!events.length) {
    const fallback = suppliedSnapshotResult();
    if (fallback.events.length) {
      results = [...results, fallback];
      providerStatus = [...providerStatus, {
        code: 'supplied-snapshot', enabled: true, healthy: false, transportHealthy: true, pricingReady: false,
        metadataHealthy: true, bettingAllowed: false, state: 'READ_ONLY', events: fallback.events.length,
        pricedMarkets: pricedMarketCount(fallback.events), bettableMarkets: 0, warnings: fallback.errors, latencyMs: 0
      }];
      events = fallback.events;
      snapshotFallback = true;
      snapshotCapturedAt = fallback.capturedAt;
    }
  }
  await writeProviderLifecycle(nextLifecycle);
  if (!events.length) {
    await recordSportsbookProviderTransitions(transitions, { reason, pricedMarkets: 0, bettableMarkets: 0 });
    const warnings = providerStatus.flatMap(item => item.warnings || []);
    throw new AppError(503, warnings[0] || 'Sumber aktif tetapi belum mengembalikan pertandingan.', 'SPORTS_FEED_EMPTY');
  }
  const fetchedAt = Date.now();
  const previousMarketLifecycle = await readMarketLifecycle();
  const marketLifecycle = reconcileSportsbookMarketLifecycle(previousMarketLifecycle, events, {
    reopenSuccesses: config.sportsbookMarketReopenSuccesses,
    reopenObservationSeconds: config.sportsbookMarketReopenObservationSeconds,
    retentionSeconds: config.sportsbookMarketLifecycleRetentionSeconds,
    now: fetchedAt
  });
  events = stampPriceVersions(marketLifecycle.events, fetchedAt);
  await writeMarketLifecycle(marketLifecycle.state);
  const mergedPricedMarkets = pricedMarketCount(events);
  const mergedBettableMarkets = bettableMarketCount(events);
  const pricingProviders = providerStatus
    .filter(provider => provider.enabled && provider.bettingAllowed && provider.pricedMarkets > 0)
    .sort((a, b) => b.bettableMarkets - a.bettableMarkets || b.pricedMarkets - a.pricedMarkets || a.latencyMs - b.latencyMs);
  const primaryPricingProvider = pricingProviders[0]?.code || null;
  const readOnlySource = Boolean(snapshotFallback || mergedBettableMarkets < 1);
  const revision = stableFeedRevision(events, nextLifecycle);
  const priceChanges = priceVersionChangeCount(memory.events || [], events);
  memory = {
    lifecycleGeneration: LIFECYCLE_GENERATION,
    events,
    providers: providerStatus,
    providerLifecycle: nextLifecycle,
    marketLifecycleStats: marketLifecycle.stats,
    revision,
    fetchedAt,
    expiresAt: fetchedAt + REFRESH_MS,
    error: snapshotFallback
      ? { code: 'SPORTS_SNAPSHOT_FALLBACK', message: 'Live source unavailable; supplied source snapshot is read-only.' }
      : readOnlySource && mergedPricedMarkets > 0
        ? { code: 'SPORTS_PRICED_READ_ONLY', message: 'Priced odds tersedia, tetapi provider belum melewati settlement/recovery gate untuk menerima taruhan.' }
        : readOnlySource
          ? { code: 'SPORTS_SOURCE_STALE', message: 'Live priced source belum tersedia; sportsbook tetap read-only.' }
          : null,
    snapshotFallback,
    snapshotCapturedAt,
    readOnlySource,
    pricedMarkets: mergedPricedMarkets,
    bettableMarkets: mergedBettableMarkets,
    primaryPricingProvider,
    lastPriceChanges: priceChanges,
    lastMarketLifecycleTransitionCount: marketLifecycle.transitions.length
  };
  await writeRedisCache(memory);
  await recordSportsbookProviderTransitions(transitions, { reason, feedRevision: revision, pricedMarkets: mergedPricedMarkets, bettableMarkets: mergedBettableMarkets });
  await recordSportsbookMarketTransitions(marketLifecycle.transitions, { reason, feedRevision: revision, pricedMarkets: mergedPricedMarkets, bettableMarkets: mergedBettableMarkets });
  if (marketLifecycle.transitions.length) {
    logger.info('Sportsbook market lifecycle transitions', {
      reason, feedRevision: revision, count: marketLifecycle.transitions.length,
      actions: marketLifecycle.transitions.reduce((acc, item) => { acc[item.action] = (acc[item.action] || 0) + 1; return acc; }, {})
    });
  }
  return memory;
}
function suspendedEvents(events = []) {
  return events.map(event => ({
    ...event,
    status: event.status === 'FINISHED' ? 'FINISHED' : event.status,
    markets: (event.markets || []).map(market => ({
      ...market,
      suspended: true,
      selections: (market.selections || []).map(selection => ({ ...selection, suspended: true }))
    }))
  }));
}

async function markCachedFeedReadOnly(error, { reason = 'refresh-failed' } = {}) {
  if (!memory.events.length) return null;
  const now = Date.now();
  const readOnlyEvents = suspendedEvents(memory.events);
  const forcedSuspended = readOnlyEvents;
  const previousMarketLifecycle = await readMarketLifecycle();
  const marketLifecycle = reconcileSportsbookMarketLifecycle(previousMarketLifecycle, forcedSuspended, {
    reopenSuccesses: config.sportsbookMarketReopenSuccesses,
    reopenObservationSeconds: config.sportsbookMarketReopenObservationSeconds,
    retentionSeconds: config.sportsbookMarketLifecycleRetentionSeconds,
    now
  });
  readOnlyEvents.splice(0, readOnlyEvents.length, ...marketLifecycle.events);
  await writeMarketLifecycle(marketLifecycle.state);
  const revision = stableFeedRevision(readOnlyEvents, memory.providerLifecycle || {});
  memory = {
    ...memory,
    events: readOnlyEvents,
    marketLifecycleStats: marketLifecycle.stats,
    revision,
    providers: (memory.providers || []).map(provider => provider.enabled ? { ...provider, healthy: false, bettingAllowed: false, bettableMarkets: 0 } : provider),
    expiresAt: now + REFRESH_MS,
    readOnlySource: true,
    pricedMarkets: pricedMarketCount(readOnlyEvents),
    bettableMarkets: 0,
    error: { code: error?.code || 'SPORTS_REFRESH_FAILED', message: error?.message || 'Sportsbook live source refresh failed.' }
  };
  await writeRedisCache(memory);
  await recordSportsbookMarketTransitions(marketLifecycle.transitions, { reason, feedRevision: revision, pricedMarkets: memory.pricedMarkets, bettableMarkets: 0 });
  if (marketLifecycle.transitions.length) {
    logger.warn('Sportsbook market lifecycle transitions', {
      reason, feedRevision: revision, count: marketLifecycle.transitions.length,
      actions: marketLifecycle.transitions.reduce((acc, item) => { acc[item.action] = (acc[item.action] || 0) + 1; return acc; }, {})
    });
  }
  logger.warn('Sportsbook cached feed switched to read-only', {
    reason,
    events: memory.events.length,
    code: memory.error.code,
    error: memory.error.message
  });
  return memory;
}

export async function refreshSportsbookFeed({ reason = 'scheduled' } = {}) {
  try {
    const refreshed = await performRefresh({ reason });
    const allPricedMarkets = refreshed.events.flatMap(event => event.markets || []).filter(market =>
      (market.selections || []).some(selection => Number.isFinite(Number(selection.odds)) && Number(selection.odds) > 1)
    );
    const activeMarkets = allPricedMarkets.filter(market => !market.suspended && (market.selections || []).some(selection => !selection.suspended));
    const bettableEvents = refreshed.events.filter(event => eventBettingOpen(event) && (event.markets || []).some(market => !market.suspended && (market.selections || []).some(selection => !selection.suspended && Number(selection.odds) > 1))).length;
    const memberVisibleEvents = refreshed.events.filter(event => memberVisibleEvent(event)).length;
    const marketCount = (type, period) => activeMarkets.filter(market => market.type === type && market.period === period).length;
    const settlementAuthority = settlementAuthoritySummary(refreshed.events);
    logger.info('Sportsbook live feed refreshed', {
      reason,
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
      feedRevision: refreshed.revision || null,
      priceChanges: Number(refreshed.lastPriceChanges || 0),
      marketLifecycleTransitions: Number(refreshed.lastMarketLifecycleTransitionCount || 0),
      events: refreshed.events.length,
      healthyProviders: refreshed.providers.filter(provider => provider.enabled && provider.healthy).length,
      pricedProviders: refreshed.providers.filter(provider => provider.enabled && provider.pricedMarkets > 0).length,
      primaryPricingProvider: refreshed.primaryPricingProvider || null,
      pricedMarkets: allPricedMarkets.length,
      bettableMarkets: activeMarkets.length,
      bettableEvents,
      memberVisibleEvents,
      cashBettingLedger: true,
      cashLedgerMode: 'MEMBER_LEDGER',
      sportsbookHoldAccount: 'SYSTEM:SPORTSBOOK_HOLD',
      readOnly: Boolean(refreshed.readOnlySource),
      snapshotFallback: Boolean(refreshed.snapshotFallback),
      ftMarkets: activeMarkets.filter(market => market.period === 'FT').length,
      htMarkets: activeMarkets.filter(market => market.period === '1H').length,
      ft1x2: marketCount('1X2', 'FT'),
      ht1x2: marketCount('1X2', '1H'),
      ftHandicap: marketCount('HANDICAP', 'FT'),
      htHandicap: marketCount('HANDICAP', '1H'),
      ftTotals: marketCount('TOTALS', 'FT'),
      htTotals: marketCount('TOTALS', '1H'),
      settlementFtEvents: settlementAuthority.ftEvents,
      settlementHtEvents: settlementAuthority.htEvents,
      settlementAutomaticFtEvents: settlementAuthority.automaticFtEvents,
      settlementManualFtEvents: settlementAuthority.manualFtEvents,
      settlementModes: settlementAuthority.modes,
      settlementSources: settlementAuthority.sources,
      lifecycleActive: Number(refreshed.marketLifecycleStats?.active || 0),
      lifecycleSuspended: Number(refreshed.marketLifecycleStats?.suspended || 0),
      lifecycleReopening: Number(refreshed.marketLifecycleStats?.reopening || 0),
      lifecycleClosed: Number(refreshed.marketLifecycleStats?.closed || 0)
    });
    return refreshed;
  } catch (error) {
    const stale = await markCachedFeedReadOnly(error, { reason });
    if (stale) return stale;
    throw error;
  }
}
async function currentFeed({ force = false } = {}) {
  const now = Date.now();
  if (!force && memory.events.length && memory.expiresAt > now) return memory;
  if (!force) {
    const cached = await readRedisCache();
    if (cached?.events?.length && Number(cached.fetchedAt || 0) >= Number(memory.fetchedAt || 0)) memory = cached;
    if (memory.events.length && memory.expiresAt > now) return memory;
  }
  if (!inFlight) {
    inFlight = refreshSportsbookFeed({ reason: force ? 'forced-request' : 'request-expired-cache' }).catch(async error => {
      const stale = await markCachedFeedReadOnly(error, { reason: 'request-refresh-failed' });
      if (stale && now - stale.fetchedAt <= STALE_MS) return stale;
      throw error;
    }).finally(() => { inFlight = null; });
  }
  return inFlight;
}
function normalizedSport(value) {
  const raw = clean(value).toLowerCase();
  if (/basket/.test(raw)) return 'Basketball';
  if (/tennis/.test(raw)) return 'Tennis';
  if (/esport/.test(raw)) return 'Esports';
  if (/hockey/.test(raw)) return 'Ice Hockey';
  if (/baseball/.test(raw)) return 'Baseball';
  return raw ? 'Football' : '';
}
function filterEvents(events, { sport, live, q, league } = {}) {
  const requestedSport = normalizedSport(sport);
  const query = clean(q).toLowerCase();
  const requestedLeague = clean(league).toLowerCase();
  return events.filter(event => {
    if (requestedSport && event.sport !== requestedSport) return false;
    if (String(live).toLowerCase() === 'true' && !event.live) return false;
    if (requestedLeague && !event.league.toLowerCase().includes(requestedLeague)) return false;
    if (query && !`${event.league} ${event.home.name} ${event.away.name}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function memberEventShape(item, markets) {
  return {
    id: item.id,
    sport: item.sport,
    league: item.league,
    country: item.country,
    startTime: item.startTime,
    status: item.status,
    live: item.live,
    clock: item.clock,
    home: item.home,
    away: item.away,
    leagueLogo: item.leagueLogo,
    venue: item.venue,
    availableMarketCount: item.availableMarketCount,
    detailLoaded: item.detailLoaded,
    markets: projectMemberMarkets(markets)
  };
}
function memberPublicEvent(event) {
  const item = publicEvent(event);
  return memberEventShape(item, compactMemberMarkets(item.markets || []));
}
function memberPublicEventDetail(event) {
  const item = publicEvent(event);
  return memberEventShape(item, item.markets || []);
}
export async function sportsbookSnapshot(filters = {}, { memberView = true } = {}) {
  const feed = await currentFeed();
  const now = Date.now();
  const stale = Boolean(feed.readOnlySource || feed.snapshotFallback || !feed.fetchedAt || now - Number(feed.fetchedAt) > STALE_MS);
  const controls = await listActiveSportsbookTradingControls();
  let sourceEvents = filterEvents(feed.events, filters);
  if (memberView) {
    sourceEvents = sourceEvents
      .filter(event => memberVisibleEvent(event, now))
      .sort((a, b) => Date.parse(a.startTime || '') - Date.parse(b.startTime || ''))
      .slice(0, Number(config.sportsbookMemberMaxEvents || 250));
  }
  const projected = memberView ? sourceEvents.map(memberPublicEvent) : sourceEvents.map(publicEvent);
  const events = applySportsbookTradingControls(projected, controls);
  const healthyCount = feed.providers.filter(provider => provider.enabled && provider.healthy).length;
  const visiblePricedMarkets = pricedMarketCount(events);
  const visibleBettableMarkets = bettableMarketCount(events);
  const memberHealthy = !stale && !feed.readOnlySource && Number(feed.bettableMarkets || 0) > 0;
  return {
    events,
    stale,
    degraded: !memberHealthy,
    source: {
      name: 'SBOTOTO Sportsbook Feed',
      mode: feed.snapshotFallback
        ? 'READ_ONLY_SNAPSHOT'
        : feed.readOnlySource && Number(feed.pricedMarkets || 0) > 0
          ? 'READ_ONLY_PRICED_NO_SETTLEMENT_AUTHORITY'
          : feed.readOnlySource
            ? 'READ_ONLY_STALE_SOURCE'
            : 'LIVE_SOURCE_AGGREGATOR',
      status: feed.readOnlySource ? (visiblePricedMarkets > 0 ? 'PRICED_READ_ONLY' : 'STALE') : memberHealthy ? 'ONLINE' : 'DEGRADED',
      fetchedAt: new Date(feed.fetchedAt).toISOString(),
      capturedAt: feed.snapshotCapturedAt || null,
      refreshSeconds: config.sportsFeedRefreshSeconds,
      pricedMarkets: visiblePricedMarkets,
      bettableMarkets: visibleBettableMarkets,
      feedRevision: feed.revision || null
    },
    capabilities: {
      betBuilderPricedMarkets: events.some(event => event.markets?.some(market => market.type === 'BET_BUILDER' && !market.suspended)),
      ftMarkets: events.some(event => event.markets?.some(market => market.period === 'FT' && !market.suspended)),
      htMarkets: events.some(event => event.markets?.some(market => market.period === '1H' && !market.suspended)),
      ftHtCoreMarkets: events.some(event => {
        const core = new Set((event.markets || []).filter(market => !market.suspended).map(market => `${market.type}:${market.period}`));
        return ['1X2:FT','1X2:1H','HANDICAP:FT','HANDICAP:1H','TOTALS:FT','TOTALS:1H'].every(key => core.has(key));
      }),
      cashOut: Boolean(config.sportsbookCashoutEnabled),
      realtime: Boolean(config.sportsbookRealtimeEnabled),
      liveStatistics: false
    },
    betting: {
      minStake: config.sportsbookMinStake,
      maxStake: config.sportsbookMaxStake,
      maxPayout: config.sportsbookMaxPayout,
      maxLegs: config.sportsbookMaxLegs,
      quoteRequired: config.sportsbookQuoteRequired,
      quoteTtlSeconds: config.sportsbookQuoteTtlSeconds,
      types: ['SINGLE', 'PARLAY', 'SYSTEM']
    }
  };
}

export async function sportsbookEventSnapshot(eventId) {
  const requested = clean(eventId);
  if (!requested) throw new AppError(400, 'ID pertandingan wajib diisi.', 'SPORTS_EVENT_ID_REQUIRED');
  const feed = await currentFeed();
  let current = feed.events.find(item => item.id === requested);
  if (!current) throw new AppError(404, 'Pertandingan tidak ditemukan.', 'SPORTS_EVENT_UNAVAILABLE');
  const controls = await listActiveSportsbookTradingControls({ eventId: current.id });
  return {
    event: applySportsbookTradingControls([memberPublicEventDetail(current)], controls)[0],
    detailLimited: false,
    source: {
      mode: feed.readOnlySource ? 'READ_ONLY_STALE_SOURCE' : 'LIVE',
      fetchedAt: new Date(feed.fetchedAt).toISOString()
    }
  };
}


export async function sportsbookSettlementSnapshot() {
  const feed = await currentFeed({ force: true });
  if (feed.readOnlySource || feed.snapshotFallback) {
    throw new AppError(503, 'Sumber sportsbook read-only/stale tidak boleh dipakai untuk settlement.', 'SPORTS_SETTLEMENT_SOURCE_STALE');
  }
  const authorities = feed.events.map(event => eventSettlementAuthority(event));
  const settlementSources = [...new Set(authorities.flatMap(authority => authority.sources))];
  return {
    fetchedAt: feed.fetchedAt,
    feedRevision: feed.revision || null,
    sourceName: settlementSources.length ? `SBOTOTO_AUTHORITY:${settlementSources.join('+')}` : 'SBOTOTO_AUTHORITY:UNAVAILABLE',
    settlementSources,
    events: feed.events.map((event, index) => ({
      ...publicEvent(event),
      settlementAuthority: authorities[index]
    }))
  };
}

export function sportsbookSourceStatus() {
  const enabledCount = enabledProviders().filter(provider => provider.enabled).length;
  const healthyCount = memory.providers.filter(provider => provider.enabled && provider.bettingAllowed).length;
  return {
    configured: enabledCount > 0,
    healthy: healthyCount > 0 && !memory.readOnlySource && !memory.snapshotFallback,
    cachedEvents: memory.events.length,
    fetchedAt: memory.fetchedAt ? new Date(memory.fetchedAt).toISOString() : null,
    feedRevision: memory.revision || null,
    stale: Boolean(memory.readOnlySource || memory.snapshotFallback || (memory.expiresAt ? Date.now() > memory.expiresAt : true)),
    snapshotFallback: Boolean(memory.snapshotFallback),
    providers: Object.values(memory.providerLifecycle || {}).map(publicProviderLifecycle)
  };
}

export async function sportsbookOperationalStatus() {
  const feed = await currentFeed();
  const controls = await listActiveSportsbookTradingControls();
  const controlledEvents = applySportsbookTradingControls((feed.events || []).map(publicEvent), controls);
  const activeMarkets = controlledEvents.flatMap(event => event.markets || []).filter(market =>
    !market.suspended && (market.selections || []).some(selection => !selection.suspended && Number(selection.odds) > 1)
  );
  const operatorSuspendedMarkets = controlledEvents.flatMap(event => event.markets || []).filter(market => market.trading?.suspendedByOperator).length;
  const count = (type, period) => activeMarkets.filter(market => market.type === type && market.period === period).length;
  return {
    feedRevision: feed.revision || null,
    fetchedAt: feed.fetchedAt ? new Date(feed.fetchedAt).toISOString() : null,
    expiresAt: feed.expiresAt ? new Date(feed.expiresAt).toISOString() : null,
    feedAgeSeconds: feed.fetchedAt ? Math.max(0, Math.floor((Date.now() - feed.fetchedAt) / 1000)) : null,
    lastPriceChanges: Number(feed.lastPriceChanges || 0),
    lastMarketLifecycleTransitionCount: Number(feed.lastMarketLifecycleTransitionCount || 0),
    readOnly: Boolean(feed.readOnlySource),
    snapshotFallback: Boolean(feed.snapshotFallback),
    primaryPricingProvider: feed.primaryPricingProvider || null,
    events: (feed.events || []).length,
    liveEvents: (feed.events || []).filter(event => event.live).length,
    pricedMarkets: Number(feed.pricedMarkets || 0),
    upstreamBettableMarkets: Number(feed.bettableMarkets || 0),
    bettableMarkets: activeMarkets.length,
    tradingControls: {
      active: controls.length,
      suspended: controls.filter(control => control.suspended).length,
      operatorSuspendedMarkets
    },
    marketLifecycle: {
      active: Number(feed.marketLifecycleStats?.active || 0),
      suspended: Number(feed.marketLifecycleStats?.suspended || 0),
      reopening: Number(feed.marketLifecycleStats?.reopening || 0),
      closed: Number(feed.marketLifecycleStats?.closed || 0),
      reopenSuccessesRequired: config.sportsbookMarketReopenSuccesses,
      reopenObservationSeconds: config.sportsbookMarketReopenObservationSeconds
    },
    coverage: {
      ft1x2: count('1X2', 'FT'),
      ht1x2: count('1X2', '1H'),
      ftHandicap: count('HANDICAP', 'FT'),
      htHandicap: count('HANDICAP', '1H'),
      ftTotals: count('TOTALS', 'FT'),
      htTotals: count('TOTALS', '1H')
    },
    lifecyclePolicy: {
      failureThreshold: config.sportsbookProviderFailureThreshold,
      recoverySuccesses: config.sportsbookProviderRecoverySuccesses,
      cooldownSeconds: config.sportsbookProviderCooldownSeconds
    },
    settlementAuthority: settlementAuthoritySummary(feed.events),
    providers: feed.providers.map(provider => ({
      code: provider.code,
      enabled: Boolean(provider.enabled),
      state: provider.state || null,
      transportHealthy: Boolean(provider.transportHealthy),
      pricingReady: Boolean(provider.pricingReady),
      bettingAllowed: Boolean(provider.bettingAllowed),
      failureStreak: Number(provider.failureStreak || 0),
      successStreak: Number(provider.successStreak || 0),
      nextProbeAt: provider.nextProbeAt ? new Date(provider.nextProbeAt).toISOString() : null,
      events: Number(provider.events || 0),
      pricedMarkets: Number(provider.pricedMarkets || 0),
      bettableMarkets: Number(provider.bettableMarkets || 0),
      latencyMs: Number(provider.latencyMs || 0),
      warnings: (provider.warnings || []).slice(0, 3)
    }))
  };
}

export async function sportsbookSelectionSnapshot({ eventId, marketId, selectionId }) {
  let feed = await currentFeed();
  let event = feed.events.find(item => item.id === eventId);
  let market = event?.markets.find(item => item.id === marketId);
  let selection = market?.selections.find(item => item.key === selectionId);
  if (!event || !market || !selection || market.suspended || selection.suspended) {
    feed = await currentFeed({ force: true });
    event = feed.events.find(item => item.id === eventId);
    market = event?.markets.find(item => item.id === marketId);
    selection = market?.selections.find(item => item.key === selectionId);
  }
  if (!event) throw new AppError(409, 'Pertandingan sudah tidak tersedia.', 'SPORTS_EVENT_UNAVAILABLE');
  const scheduledStart = Date.parse(event.startTime || '');
  if (!event.live && event.status === 'SCHEDULED' && Number.isFinite(scheduledStart) && Date.now() > scheduledStart + config.sportsbookPrematchCloseGraceSeconds * 1000) {
    throw new AppError(409, 'Kickoff sudah tercapai tetapi status live belum terkonfirmasi. Market ditahan sampai sumber resmi memperbarui status pertandingan.', 'SPORTS_EVENT_START_STATUS_PENDING');
  }
  if (!market || market.suspended) throw new AppError(409, 'Pasaran sedang ditutup atau tidak tersedia.', 'SPORTS_MARKET_SUSPENDED');
  if (!selection || selection.suspended) throw new AppError(409, 'Pilihan odds sedang ditutup atau tidak tersedia.', 'SPORTS_SELECTION_SUSPENDED');
  if (event.status === 'FINISHED' || event.status === 'SUSPENDED') throw new AppError(409, 'Pertandingan tidak dapat menerima taruhan.', 'SPORTS_EVENT_CLOSED');
  const providerCode = selection.source || market.source || null;
  const providerState = providerCode ? feed.providers.find(provider => provider.code === providerCode) : null;
  if (providerState && !providerState.bettingAllowed) {
    logger.warn('Sportsbook selection temporarily unavailable by provider lifecycle gate', {
      eventId: event.id, marketId: market.id, selectionId: selection.key,
      provider: providerCode, state: providerState.state || null,
      failureStreak: Number(providerState.failureStreak || 0), successStreak: Number(providerState.successStreak || 0)
    });
    throw new AppError(409, 'Pasaran sedang diperbarui. Tunggu pembaruan berikutnya lalu coba kembali.', 'SPORTS_MARKET_TEMPORARILY_UNAVAILABLE');
  }
  assertSelectionFresh(event, market, selection, feed.fetchedAt);
  const tradingPolicy = await resolveSportsbookTradingPolicy({ eventId: event.id, marketId: market.id, selectionId: selection.key });
  if (tradingPolicy.suspended) {
    throw new AppError(409, 'Pasaran ditutup oleh trading desk.', 'SPORTSBOOK_OPERATOR_SUSPENDED', {
      eventId: event.id,
      marketId: market.id,
      selectionId: selection.key,
      controlVersion: tradingPolicy.versionToken
    });
  }
  return {
    event, market, selection, feedFetchedAt: feed.fetchedAt,
    feedRevision: feed.revision || null,
    providerState: providerState?.state || null,
    priceVersion: selection.priceVersion,
    priceUpdatedAt: selection.updatedAt || market.updatedAt || null,
    tradingPolicy
  };
}

export const __sportsbookFeed = { filterEvents, normalizedSport, pricedMarketCount, bettableMarketCount, providerHasPricedMarkets, stampPriceVersions, stableFeedRevision, assertSelectionFresh, advanceProviderLifecycle, eventBettingOpen, enforceEventBettingWindow, memberVisibleEvent, eventSettlementAuthority, settlementAuthoritySummary, compactMemberMarkets, memberPublicEvent, memberPublicEventDetail };

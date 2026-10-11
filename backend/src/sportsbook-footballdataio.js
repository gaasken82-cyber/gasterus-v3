import crypto from 'node:crypto';
import { config } from './config.js';
import {
  normalizedEvent,
  normalizedMarket,
  normalizedSelection,
  clean,
  iso,
  status
} from './sportsbook-providers.js';
import { buildDerivedMarkets } from './sportsbook-public-market.js';
import { setBoundedCacheEntry } from './bounded-cache.js';

// Gasterus sportsbook provider adapter for footballdata.io.
// Provides REAL market odds (footballdata.io returns bookmaker 1X2 prices plus
// match probabilities). The 1X2 market uses the live price; the remaining market
// set (O/U, HDP, BTTS, DC, CS, ...) is expanded by Gasterus's own probability engine
// from the 1X2 anchor (reusing public-market's buildDerivedMarkets).
const PROVIDER = 'footballdata-io';
const BASE_HOST = 'footballdata.io';

function hash(...parts) {
  return crypto.createHash('sha256').update(parts.map(v => clean(v, 500)).join('|')).digest('hex').slice(0, 28);
}
function teamKey(value) {
  return clean(value).toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function probToOdds(p, marginBps) {
  const pNum = Number(p) / 100;
  if (!(pNum > 0)) return null;
  const margin = Math.max(0.01, Math.min(0.12, (Number(marginBps || 450)) / 10000));
  const o = Math.round((1 / (pNum * (1 + margin))) * 1000) / 1000;
  return o > 1 ? o : null;
}

async function requestJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.sportsFeedRequestTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ASEAN777-Sports-Aggregator/2.0', Authorization: `Bearer ${config.footballDataIoKey}` },
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`footballdata.io returned HTTP ${response.status}`);
    const text = await response.text();
    const responseBytes = Buffer.byteLength(text, 'utf8');
    if (responseBytes > config.sportsProviderCacheMaxEntryBytes) {
      throw new Error(`footballdata.io response exceeds cache entry size limit (${responseBytes} bytes)`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMatches() {
  const base = config.footballDataIoBaseUrl.replace(/\/$/, '');
  const limit = Number(config.footballDataIoUpcomingLimit || 200);
  const collected = new Map();
  const endpoints = [`${base}/fixtures/today`, `${base}/fixtures/upcoming`];
  for (const path of endpoints) {
    try {
      const payload = await requestJson(path);
      const matches = payload?.data?.matches || [];
      for (const m of matches) {
        if (m && m.match_id) collected.set(String(m.match_id), m);
        if (collected.size >= limit) break;
      }
    } catch (error) {
      // One endpoint failing must not block the other (today vs upcoming).
      if (!collected.size) throw error;
    }
    if (collected.size >= limit) break;
  }
  return [...collected.values()].slice(0, limit);
}

function buildEvent(match) {
  const odds = match.odds || {};
  const probs = match.probabilities || {};
  const realHome = Number(odds.home_win) > 1 ? Number(odds.home_win) : probToOdds(probs.home_win, config.publicMarketDerivedMarginBps);
  const realDraw = Number(odds.draw) > 1 ? Number(odds.draw) : probToOdds(probs.draw, config.publicMarketDerivedMarginBps);
  const realAway = Number(odds.away_win) > 1 ? Number(odds.away_win) : probToOdds(probs.away_win, config.publicMarketDerivedMarginBps);
  if (!(realHome > 1 && realDraw > 1 && realAway > 1)) return null;

  const providerId = String(match.match_id);
  const startTime = iso(match.match_date);
  if (!startTime) return null;
  const homeName = clean(match.home_team?.team_name || match.home_team?.name, 120);
  const awayName = clean(match.away_team?.team_name || match.away_team?.name, 120);
  if (!homeName || !awayName) return null;

  const event = normalizedEvent({
    provider: PROVIDER,
    providerId,
    sport: 'Football',
    league: match.league?.name || match.league?.competition_name || 'Football',
    country: match.league?.country || null,
    startTime,
    state: match.status || 'incomplete',
    providerStatus: match.status || null,
    clock: null,
    home: homeName,
    away: awayName,
    homeScore: match.score?.home ?? null,
    awayScore: match.score?.away ?? null,
    homeLogo: match.home_team?.team_logo || null,
    awayLogo: match.away_team?.team_logo || null,
    leagueLogo: match.league?.image || null,
    venue: match.venue?.stadium_name || null
  });

  const oneXtwo = normalizedMarket(event.id, {
    key: '1X2:FT',
    name: '1X2',
    type: '1X2',
    period: 'FT',
    selections: [
      normalizedSelection(event.id, '1X2:FT', 'Home', realHome, { source: PROVIDER, sourceSelectionId: `fd:home:${providerId}` }),
      normalizedSelection(event.id, '1X2:FT', 'Draw', realDraw, { source: PROVIDER, sourceSelectionId: `fd:draw:${providerId}` }),
      normalizedSelection(event.id, '1X2:FT', 'Away', realAway, { source: PROVIDER, sourceSelectionId: `fd:away:${providerId}` })
    ].filter(Boolean),
    source: PROVIDER,
    sourceMarketId: `fd:1x2:${providerId}`,
    mainLine: true
  });
  if (!oneXtwo) return null;

  const anchor = { oneXtwo: { home: realHome, draw: realDraw, away: realAway }, total25: null, handicap: null };
  const derived = config.publicMarketDerivedMarketsEnabled ? buildDerivedMarkets(event.id, anchor, startTime) : [];

  event.markets = [oneXtwo, ...derived].filter(Boolean);
  event._refs = { [PROVIDER]: providerId };
  event._sources = [PROVIDER];
  event._settlementReadySources = [PROVIDER, 'manual-ops'];
  event._settlementMode = 'FOOTBALLDATA_IO_AUTO_WITH_MANUAL_FALLBACK';
  return event;
}

const cache = new Map();
const CACHE_KEY = 'feed';
let inFlight = null;
let consecutiveFailures = 0;
let retryAt = 0;
let lastFailure = null;
const INITIAL_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000;

function cachedFeed() {
  return cache.get(CACHE_KEY)?.value || { fetchedAt: 0, events: [], warnings: [] };
}

function failedRefresh(error) {
  consecutiveFailures += 1;
  const backoffMs = Math.min(INITIAL_BACKOFF_MS * (2 ** (consecutiveFailures - 1)), MAX_BACKOFF_MS);
  retryAt = Date.now() + backoffMs;
  lastFailure = error;
}

export async function fetchFootballDataIo() {
  if (!config.footballDataIoEnabled || !config.footballDataIoKey) {
    return { provider: PROVIDER, enabled: false, events: [] };
  }
  const currentCache = cachedFeed();
  const now = Date.now();
  const ageMs = now - Number(currentCache.fetchedAt || 0);
  if (currentCache.events.length && ageMs < config.footballDataIoRefreshSeconds * 1000) {
    return { provider: PROVIDER, enabled: true, events: structuredClone(currentCache.events), errors: currentCache.warnings, stale: false, transportOk: true };
  }
  if (retryAt > now) {
    const cacheIsStale = ageMs > config.footballDataIoRefreshSeconds * 1000 * 2;
    if (currentCache.events.length) {
      return {
        provider: PROVIDER,
        enabled: true,
        events: structuredClone(currentCache.events),
        errors: [`Refresh skipped during ${Math.ceil((retryAt - now) / 1000)}s backoff: ${lastFailure?.message || 'previous request failed'}`],
        stale: cacheIsStale,
        transportOk: !cacheIsStale,
        cachedFallback: true
      };
    }
    return {
      provider: PROVIDER,
      enabled: true,
      events: [],
      errors: [`Refresh skipped during ${Math.ceil((retryAt - now) / 1000)}s backoff: ${lastFailure?.message || 'previous request failed'}`],
      stale: true,
      transportOk: false
    };
  }
  if (!inFlight) {
    inFlight = (async () => {
      const matches = await fetchMatches();
      const events = [];
      const warnings = [];
      for (const m of matches) {
        try {
          const ev = buildEvent(m);
          if (ev) events.push(ev);
        } catch (e) {
          warnings.push(`footballdata.io match ${m?.match_id}: ${clean(e.message)}`);
        }
      }
      if (!events.length) throw new Error(`footballdata.io returned no priced events (${warnings.join(' | ') || 'no matches'})`);
      const refreshed = { fetchedAt: Date.now(), events, warnings: [...new Set(warnings)] };
      setBoundedCacheEntry(cache, CACHE_KEY, refreshed, {
        fetchedAt: refreshed.fetchedAt,
        maxEntryBytes: config.sportsProviderCacheMaxEntryBytes,
        maxTotalBytes: config.sportsProviderCacheMaxTotalBytes
      });
      consecutiveFailures = 0;
      retryAt = 0;
      lastFailure = null;
      return refreshed;
    })().catch(error => {
      failedRefresh(error);
      throw error;
    }).finally(() => { inFlight = null; });
  }
  try {
    const loaded = await inFlight;
    return { provider: PROVIDER, enabled: true, events: structuredClone(loaded.events), errors: loaded.warnings, stale: false, transportOk: true };
  } catch (error) {
    const maxStaleMs = config.footballDataIoRefreshSeconds * 1000 * 2;
    const latestCache = cachedFeed();
    const latestAgeMs = Date.now() - Number(latestCache.fetchedAt || 0);
    if (latestCache.events.length) {
      const cacheIsStale = latestAgeMs > maxStaleMs;
      return { provider: PROVIDER, enabled: true, events: structuredClone(latestCache.events), errors: [`Refresh failed; serving cached footballdata.io odds: ${error.message}`], stale: cacheIsStale, transportOk: !cacheIsStale, cachedFallback: true };
    }
    return { provider: PROVIDER, enabled: true, events: [], errors: [error.message], stale: true, transportOk: false };
  }
}

export const __footballDataIo = {
  buildEvent,
  fetchMatches,
  teamKey,
  cache,
  backoffState: () => ({ consecutiveFailures, retryAt, lastFailure }),
  resetRuntimeState: () => {
    cache.clear();
    inFlight = null;
    consecutiveFailures = 0;
    retryAt = 0;
    lastFailure = null;
  }
};

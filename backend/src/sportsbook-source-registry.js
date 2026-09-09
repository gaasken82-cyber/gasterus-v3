import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './logger.js';

// Self-healing sportsbook source registry.
//
// Goal (per operator): keep the sportsbook populated with real matches + odds and
// NEVER let it go empty because one source broke. Strategy:
//   - Track per-source health (success / error timestamps + streak).
//   - Evict (disable) any ACTIVE source that has had NO successful fetch within
//     `sportsSourceEvictUnhealthyHours` (default 10h) while erroring.
//   - Continuously promote healthy CANDIDATE sources to fill the active set
//     (auto "find another source" from the curated pool).
//   - Recycle disabled sources after `sportsSourceRecycleCooldownHours` so they are
//     retried forever (self-healing loop).
//
// IMPORTANT: "find a new source" is bounded to a CURATED, verified pool
// (CURATED_SOURCES). Autonomous crawling of arbitrary websites is intentionally
// NOT performed — it is fragile and legally/accuracy risky. Extend CURATED_SOURCES
// (with a verified, licence-clean source) to grow redundancy over time.

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(HERE, '../data/sportsbook-source-registry.json');

// Curated pool of FREE sportsbook sources (no paid key required for the platform;
// footballdata.io / thesportsdb use free-tier keys). public-market already blends
// OpenFootball (CC0) + football-data.co.uk (public CSV) as two underlying sources.
const CURATED_SOURCES = [
  { code: 'public-market', label: 'OpenFootball (CC0) + Football-Data.co.uk public CSV', requiresKey: false },
  { code: 'footballdata-io', label: 'footballdata.io (free plan, real market odds)', requiresKey: true },
  { code: 'thesportsdb', label: 'TheSportsDB (free)', requiresKey: true }
];

function nowMs() {
  return Date.now();
}

let state = null;
let loaded = false;

function defaultState() {
  const sources = {};
  for (const s of CURATED_SOURCES) {
    sources[s.code] = {
      code: s.code,
      label: s.label,
      status: 'active',
      lastSuccess: 0,
      lastError: 0,
      consecutiveErrors: 0,
      totalSuccess: 0,
      totalErrors: 0,
      evictedAt: 0,
      promotedAt: 0,
      lastEvent: ''
    };
  }
  return { sources, updatedAt: nowMs() };
}

function load() {
  if (loaded) return state;
  loaded = true;
  try {
    if (existsSync(STATE_PATH)) {
      const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      const base = defaultState();
      if (raw && raw.sources) {
        for (const code of Object.keys(base.sources)) {
          if (raw.sources[code]) base.sources[code] = { ...base.sources[code], ...raw.sources[code] };
        }
      }
      state = base;
      return state;
    }
  } catch (e) {
    logger.warn('sportsbook-source-registry: failed to load state, reseeding', { error: e.message });
  }
  state = defaultState();
  return state;
}

function persist() {
  try {
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    logger.warn('sportsbook-source-registry: persist failed', { error: e.message });
  }
}

export function isConfigEnabled(code) {
  switch (code) {
    case 'public-market': return Boolean(config.publicMarketEnabled);
    case 'footballdata-io': return config.footballDataIoEnabled && Boolean(config.footballDataIoKey);
    case 'thesportsdb': return config.theSportsDbEnabled && Boolean(config.theSportsDbKey);
    default: return false;
  }
}

export function seedRegistry() {
  load();
  let changed = false;
  for (const code of Object.keys(state.sources)) {
    const s = state.sources[code];
    if (s.status === 'active' && !isConfigEnabled(code)) {
      s.status = 'candidate';
      changed = true;
    }
  }
  if (changed) persist();
  return state;
}

export function recordResult(code, ok, detail = '') {
  load();
  const s = state.sources[code];
  if (!s) return;
  const t = nowMs();
  if (ok) {
    s.lastSuccess = t;
    s.consecutiveErrors = 0;
    s.totalSuccess += 1;
    if (s.status === 'disabled') s.status = 'candidate';
    else if (s.status === 'candidate') s.status = 'active';
  } else {
    s.lastError = t;
    s.consecutiveErrors += 1;
    s.totalErrors += 1;
  }
  s.lastEvent = detail ? String(detail).slice(0, 200) : s.lastEvent;
  persist();
}

export function maintainRegistry({ evictUnhealthyHours, minActive, recycleCooldownHours, now } = {}) {
  load();
  const evictMs = (evictUnhealthyHours ?? config.sportsSourceEvictUnhealthyHours ?? 10) * 3600 * 1000;
  const recycleMs = (recycleCooldownHours ?? config.sportsSourceRecycleCooldownHours ?? 24) * 3600 * 1000;
  const min = minActive ?? config.sportsSourceMinActive ?? 2;
  const t = now ?? nowMs();
  const events = [];

  const configEnabledCodes = () => Object.keys(state.sources).filter(c => isConfigEnabled(c));
  const activeCount = () => Object.values(state.sources).filter(s => s.status === 'active' && isConfigEnabled(s.code)).length;

  // 1) Evict active sources unhealthy for >= evict window.
  for (const code of Object.keys(state.sources)) {
    const s = state.sources[code];
    if (s.status !== 'active') continue;
    if (!isConfigEnabled(code)) { s.status = 'candidate'; events.push({ type: 'config-disabled', code }); continue; }
    const noSuccessFor = s.lastSuccess ? (t - s.lastSuccess) : Number.POSITIVE_INFINITY;
    if (s.consecutiveErrors > 0 && noSuccessFor >= evictMs) {
      s.status = 'disabled';
      s.evictedAt = t;
      s.consecutiveErrors = 0;
      events.push({ type: 'evicted', code, reason: `no successful fetch within ${evictUnhealthyHours ?? config.sportsSourceEvictUnhealthyHours ?? 10}h` });
    }
  }

  // 2) Recycle disabled sources after cooldown -> candidate (retried forever).
  for (const code of Object.keys(state.sources)) {
    const s = state.sources[code];
    if (s.status === 'disabled' && s.evictedAt && (t - s.evictedAt) >= recycleMs) {
      s.status = 'candidate';
      s.evictedAt = 0;
      events.push({ type: 'recycled', code });
    }
  }

  // 3) Promote candidates to active until minActive (or all config-enabled) reached.
  const maxActive = Math.max(min, configEnabledCodes().length);
  for (const code of Object.keys(state.sources)) {
    const s = state.sources[code];
    if (s.status === 'candidate' && isConfigEnabled(code) && activeCount() < maxActive) {
      s.status = 'active';
      s.promotedAt = t;
      events.push({ type: 'promoted', code });
    }
  }

  if (events.length) { state.updatedAt = t; persist(); }
  if (events.length) logger.info('sportsbook-source-registry: maintenance', { events });
  return events;
}

export function isActive(code) {
  load();
  const s = state.sources[code];
  if (!s) return true; // not managed by the registry (e.g. commercial providers) -> governed by config/circuit breaker only
  return Boolean(s.status === 'active' && isConfigEnabled(code));
}

export function getRegistryState() {
  load();
  return state;
}

export function registrySummary() {
  load();
  return Object.values(state.sources).map(s => ({
    code: s.code,
    status: s.status,
    configEnabled: isConfigEnabled(s.code),
    lastSuccess: s.lastSuccess ? new Date(s.lastSuccess).toISOString() : null,
    lastError: s.lastError ? new Date(s.lastError).toISOString() : null,
    consecutiveErrors: s.consecutiveErrors
  }));
}

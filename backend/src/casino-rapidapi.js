import { config } from './config.js';
import { logger } from './logger.js';
import { AppError } from './errors.js';

// RapidAPI casino aggregator. Key HANYA dari env backend.
// Frontend TIDAK PERNAH menerima key — semua lewat proxy ini.
const HOST = 'live-casino-slots-evolution-jili-and-50-plus-provider.p.rapidapi.com';

// Allowlist path agar proxy tidak bisa dipakai SSRF ke endpoint lain.
const ALLOWED_PATHS = new Set([
  '/casino/getallproviders',
  '/casino/getgames',
  '/casino/getgameurl',
  '/casino/getbalance',
  '/casino/launch',
  '/casino/login',
]);

const cache = new Map();
const inFlight = new Map();
const failureCache = new Map();

function rapidApiKey() {
  return String(
    process.env.RAPIDAPI_CASINO_KEY || process.env.RAPIDAPI_KEY || config.rapidApiKey || ''
  ).trim();
}

export function casinoRapidApiStatus() {
  const key = rapidApiKey();
  return {
    configured: Boolean(key),
    enabled: Boolean(config.rapidApiCasinoEnabled) && Boolean(key),
    host: HOST,
    allowedPaths: [...ALLOWED_PATHS],
    cacheTtlSeconds: config.rapidApiCasinoCacheSeconds,
  };
}

function clean(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function guessCategory(code) {
  const c = String(code || '').toUpperCase();
  if (/SPORT|BETBY|PRONET|CMD|SBO|SABA|BTI|IAE|LUCKY|KOOL|TOPBET/.test(c)) return 'SPORTSBOOK';
  if (/LIVE|EVO|EZUGI|VIVO|DREAM|SAGAMING|WM|SEXY|CREED|ATMOS|ASTAR/.test(c)) return 'LIVE_CASINO';
  if (/AVIATOR|AVIATRIX|SMARTSOFT|SPRIBE|TURBO|INOUT|GALAXYS/.test(c)) return 'CRASH_ARCADE';
  if (/JILI|PGSOFT|PRAGMATIC|JOKER|HABANERO|SPADE|CQ9|JDB|KA|NEXTSPIN|FASTSPIN|FACHAI|TADA|BNG|PLAYNGO|PLAYTECH|MICRO|NETENT|REDTIGER|RELAX|NOLIMIT|HACKSAW|BIGTIME|GAMEART|PLAYSON|BETSOFT|BOOMING|ENDORPHINA|FUNKEY|EPICWIN|WINGAMING|RICHPARAD/.test(c)) return 'SLOTS';
  return 'OTHER';
}

export function normalizeProviders(payload) {
  const rawList = Array.isArray(payload?.games)
    ? payload.games
    : Array.isArray(payload?.providers)
      ? payload.providers
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  const seen = new Set();
  const providers = [];
  for (const item of rawList) {
    const code = clean(typeof item === 'string' ? item : item?.code || item?.provider || item?.name, 60).toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const name = clean(typeof item === 'string' ? item : item?.name || item?.title || code, 120) || code;
    providers.push({ code, name, category: guessCategory(code) });
  }
  providers.sort((a, b) => a.code.localeCompare(b.code));
  return providers;
}
async function rapidFetch(path, params = {}) {
  const key = rapidApiKey();
  if (!config.rapidApiCasinoEnabled) {
    throw new AppError(503, 'Layanan casino belum diaktifkan.', 'CASINO_DISABLED');
  }
  if (!key) {
    throw new AppError(503, 'Kunci RapidAPI casino belum dikonfigurasi.', 'CASINO_NOT_CONFIGURED');
  }
  if (!ALLOWED_PATHS.has(path)) {
    throw new AppError(400, 'Endpoint casino tidak diizinkan.', 'CASINO_PATH_NOT_ALLOWED');
  }
  const url = new URL('https://' + HOST + path);
  for (const entry of Object.entries(params || {})) {
    if (entry[1] === undefined || entry[1] === null || entry[1] === '') continue;
    url.searchParams.set(entry[0], String(entry[1]));
  }
  const cacheKey = path + '?' + url.searchParams.toString();
  const now = Date.now();
  const failed = failureCache.get(cacheKey);
  if (failed && now < failed.retryAt) {
    throw new AppError(502, 'Provider casino sibuk. Coba lagi nanti.', 'CASINO_UPSTREAM_COOLDOWN');
  }
  const ttlMs = Math.max(15, Number(config.rapidApiCasinoCacheSeconds) || 300) * 1000;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.fetchedAt < ttlMs) return cached.value;
  if (inFlight.get(cacheKey)) return inFlight.get(cacheKey);
  const task = (async () => {
    const controller = new AbortController();
    const timeoutMs = Math.max(3000, Number(config.rapidApiCasinoTimeoutMs) || 12000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key, accept: 'application/json' },
        signal: controller.signal,
      });
      const text = await res.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: String(text || '').slice(0, 2000) }; }
      if (!res.ok) {
        throw new AppError(res.status === 429 ? 429 : 502, 'Provider casino gagal.', res.status === 429 ? 'CASINO_RATE_LIMITED' : 'CASINO_UPSTREAM_ERROR');
      }
      if (cache.size > 200) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
        for (const entry of oldest.slice(0, 40)) cache.delete(entry[0]);
      }
      cache.set(cacheKey, { value: payload, fetchedAt: Date.now() });
      failureCache.delete(cacheKey);
      return payload;
    } catch (error) {
      if (error instanceof AppError) {
        failureCache.set(cacheKey, { message: error.message, retryAt: now + 60 * 1000 });
        throw error;
      }
      failureCache.set(cacheKey, { message: 'fetch-failed', retryAt: now + 60 * 1000 });
      logger.error('Casino RapidAPI request failed', { path });
      throw new AppError(502, 'Provider casino tidak dapat dihubungi.', 'CASINO_UPSTREAM_ERROR');
    } finally {
      clearTimeout(timeout);
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, task);
  return task;
}

export async function casinoProviders() {
  const payload = await rapidFetch('/casino/getallproviders');
  const providers = normalizeProviders(payload);
  return {
    providers,
    total: providers.length,
    categories: [...new Set(providers.map((p) => p.category))].sort(),
    fetchedAt: new Date().toISOString(),
  };
}

export async function casinoPassthrough(path, params = {}) {
  return rapidFetch(path, params);
}


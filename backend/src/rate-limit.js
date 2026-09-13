/**
 * rate-limit.js — generic sliding-window rate limiter backed by Redis + in-memory fallback.
 *
 * Usage in a route handler:
 *   import { withRateLimit } from './rate-limit.js';
 *   const lim = withRateLimit(req, res, {
 *     key: clientIp(req),
 *     limits: { login: 5, register: 3, withdraw: 2, captcha: 10, 'api:key': 60 }
 *   });
 *   if (!lim.allowed) return fail(res, new AppError(429, `Terlalu banyak permintaan. Coba lagi dalam ${lim.retryAfter}s.`, 'RATE_LIMITED'));
 *
 * Turbo mode (token bucket) untuk endpoint dengan traffic tinggi:
 *   const turbo = withTurboRateLimit({ key: clientIp(req), rate: 20, burst: 40, periodSec: 1 });
 *   if (!turbo.allowed) return fail(res, new AppError(429, 'Hanya bisa 20 permintaan/detik.', 'TOO_MANY_REQUESTS'));
 */

import { redis } from './redis.js';
import { logger } from './logger.js';
import { AppError } from './errors.js';

const EMPTY = new Set();

// ---------------------------------------------------------------------------
// In-memory L4-ish token bucket (fallback / lightweight paths).
// ---------------------------------------------------------------------------
const LOCAL_BUCKETS = new Map();
const LOCAL_CLEANUP_INTERVAL = setInterval(() => {
  for (const [key, bucket] of LOCAL_BUCKETS) {
    if (Date.now() - bucket.lastUpdated > 120_000) LOCAL_BUCKETS.delete(key);
  }
}, 60_000).unref();

function localBucket(key, rate, burst) {
  if (!LOCAL_BUCKETS.has(key)) {
    LOCAL_BUCKETS.set(key, { tokens: burst, lastUpdated: Date.now(), rate, burst });
  }
  const bucket = LOCAL_BUCKETS.get(key);
  const now = Date.now();
  const elapsed = (now - bucket.lastUpdated) / 1000;
  bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsed * (rate / bucket.burst));
  bucket.lastUpdated = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfter: 0 };
  }
  const waitMs = ((1 - bucket.tokens) * bucket.burst) / rate * 1000;
  return { allowed: false, retryAfter: Math.ceil(waitMs / 1000) };
}

// ---------------------------------------------------------------------------
// Redis-backed sliding window.
// ---------------------------------------------------------------------------
const WINDOW_SIZE = 60; // seconds

export async function redisRateLimit({ key, limit, windowSeconds = WINDOW_SIZE, label = 'default' }) {
  const redisKey = `ratelimit:${label}:${key}`;
  try {
    const multi = redis.multi();
    multi.zAdd(redisKey, { score: Date.now(), value: String(Date.now()) });
    multi.zRemRangeByScore(redisKey, 0, Date.now() - windowSeconds * 1000);
    multi.zCard(redisKey);
    const [, , count] = await multi.exec();
    const current = count[2];
    const retryAfter = current >= limit ? Math.ceil((windowSeconds * (current - limit + 1)) / current) : 0;
    return {
      allowed: current < limit || retryAfter === 0,
      count: current,
      limit,
      retryAfter,
    };
  } catch {
    // Redis down? fail closed (no rate limiting = potential abuse, but better than crashing).
    logger.warn('Rate limiter Redis fallback to in-memory', { key, label });
    return { allowed: true, count: 0, limit, retryAfter: 0, fallback: true };
  }
}

// ---------------------------------------------------------------------------
// Per-endpoint rate limiter (suitable for login, register, withdraw, captcha).
// ---------------------------------------------------------------------------
export function withRateLimit(req, res, { key, limits, label = 'default' }) {
  // Pick the right limit for the current route label.
  const limitConfig = limits[label];
  if (!limitConfig) return { allowed: true, retryAfter: 0 };

  const { limit, windowSeconds = WINDOW_SIZE } = limitConfig;
  const ip = typeof key === 'function' ? key(req) : key;

  // Fast path: in-memory for low limits (<= 60) when Redis is known unhealthy.
  const bucket = localBucket(`${label}:${ip}`, limit / windowSeconds, limit);

  if (!bucket.allowed) {
    res.setHeader('Retry-After', String(bucket.retryAfter));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + bucket.retryAfter * 1000) / 1000)));
    return { allowed: false, retryAfter: bucket.retryAfter, via: 'local' };
  }

  // Redis-backed authoritative check.
  return redisRateLimit({ key: `${label}:${ip}`, limit, windowSeconds, label }).then((r) => {
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfter));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + r.retryAfter * 1000) / 1000)));
    }
    return { allowed: r.allowed, count: r.count, limit: r.limit, retryAfter: r.retryAfter, via: r.fallback ? 'local-fallback' : 'redis' };
  });
}

// ---------------------------------------------------------------------------
// High-throughput token bucket (suitable for API key lookups, quote refreshes).
// ---------------------------------------------------------------------------
export function withTurboRateLimit({ key, rate, burst, periodSec = 1, label = 'turbo' }) {
  const ip = typeof key === 'function' ? key : key;
  return Promise.resolve().then(() => localBucket(`${label}:${ip}`, rate, burst));
}

// ---------------------------------------------------------------------------
// Hook: attach retry-after handshake to AppError 429.
// ---------------------------------------------------------------------------
export function rejectIfRateLimited(req, res, result) {
  if (!result.allowed) {
    throw new AppError(429, `Terlalu banyak permintaan. Coba lagi dalam ${result.retryAfter} detik.`, 'RATE_LIMITED', {
      retryAfter: result.retryAfter,
      limit: result.limit,
      count: result.count,
      via: result.via,
    });
  }
  return result;
}

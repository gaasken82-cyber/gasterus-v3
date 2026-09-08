import { createClient } from 'redis';
import { config } from './config.js';
import { logger } from './logger.js';
export const redis = createClient({ url: config.redisUrl, socket: { reconnectStrategy: retries => Math.min(1000 + retries * 250, 10000) } });
redis.on('error', error => logger.error('Redis client error', { error: error.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));
export async function connectRedis() { if (!redis.isOpen) await redis.connect(); }
export async function checkRedis() {
  const started = performance.now();
  const pong = await redis.ping();
  return { ok: pong === 'PONG', latencyMs: Math.round((performance.now()-started)*100)/100 };
}
export async function closeRedis() { if (redis.isOpen) await redis.quit(); }

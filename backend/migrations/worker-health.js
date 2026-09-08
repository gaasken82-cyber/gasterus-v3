import { config } from '../src/config.js';
import { connectRedis, closeRedis, redis } from '../src/redis.js';
try {
  await connectRedis();
  const raw = await redis.get(config.workerHeartbeatKey);
  if (!raw) throw new Error('Worker heartbeat is missing');
  const at = new Date(raw);
  const age = Math.floor((Date.now() - at.getTime()) / 1000);
  if (!Number.isFinite(at.getTime()) || age < 0 || age > config.workerHeartbeatMaxAgeSeconds) throw new Error(`Worker heartbeat stale: ${age}s`);
  console.log(JSON.stringify({ status: 'healthy', heartbeatAt: raw, ageSeconds: age }));
} finally {
  await closeRedis().catch(() => {});
}

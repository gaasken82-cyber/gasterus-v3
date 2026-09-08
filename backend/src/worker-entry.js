// Standalone worker service entrypoint (R6.9.0.24 worker split).
// Starts a minimal HTTP liveness endpoint BEFORE importing worker.js so that
// Railway healthchecks succeed during dependency warm-up, then hands off to the
// unchanged scheduler in ./worker.js. This file must stay side-effect-light:
// worker.js owns all domain behaviour and must never be modified for deployment
// topology changes.
import { createServer } from 'node:http';
import { createClient } from 'redis';
import { config } from './config.js';

const HOST = String(process.env.HOST || '0.0.0.0');
const PORT = Number(process.env.PORT || 8090);
const GRACE_MS = Math.max(10_000, Number(process.env.WORKER_HEALTH_GRACE_MS || 120_000));
const PROBE_TIMEOUT_MS = 2_500;
const STALE_AFTER_SECONDS = Math.max(Number(config.workerHeartbeatMaxAgeSeconds || 90) * 2, 120);
const startedAt = Date.now();

function log(event, data = {}) {
  console.log(JSON.stringify({ service: 'asean777-worker-entry', version: '6.9.0', event, ...data }));
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a valid TCP port');

// Independent probe client: deliberately NOT the shared singleton exported by
// ./redis.js, so liveness probing can never interfere with the worker's own
// connection lifecycle. Reconnects automatically between probes.
let probeClient = null;
async function withProbeRedis(operation) {
  if (!process.env.REDIS_URL && !config.redisUrl) throw new Error('REDIS_URL is not configured');
  const url = process.env.REDIS_URL || config.redisUrl;
  if (!probeClient) {
    probeClient = createClient({ url, socket: { reconnectStrategy: retries => Math.min(retries * 500, 5000) } });
    probeClient.on('error', () => {}); // surfaced through probe result, not logs spam
  }
  if (!probeClient.isOpen) await probeClient.connect();
  return operation(probeClient);
}

async function probeWorkerLiveness() {
  const rawHeartbeat = await withProbeRedis(client => client.get(config.workerHeartbeatKey));
  let heartbeat = null;
  if (rawHeartbeat) {
    const at = new Date(rawHeartbeat);
    if (Number.isFinite(at.getTime())) {
      heartbeat = { at: rawHeartbeat, ageSeconds: Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000)) };
    }
  }
  let queueDepth = null;
  try { queueDepth = Number(await withProbeRedis(client => client.lLen(config.queueName))); } catch {}
  return { heartbeat, queueDepth };
}

function verdict(result) {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const base = {
    service: 'asean777-worker',
    uptimeSeconds,
    graceMs: GRACE_MS,
    staleAfterSeconds: STALE_AFTER_SECONDS,
    heartbeat: result?.heartbeat || null,
    queueDepth: result?.queueDepth ?? null,
    memory: { rssBytes: process.memoryUsage().rss }
  };
  // Cold-start window: report healthy so the platform keeps waiting while
  // worker.js connects PostgreSQL/Redis. Genuine startup failures exit the
  // process (worker.js exits non-zero), which kills this server anyway.
  if (uptimeSeconds * 1000 < GRACE_MS) return { status: 200, body: { ...base, status: 'starting' } };
  if (!result) return { status: 503, body: { ...base, status: 'unhealthy', reason: 'HEARTBEAT_UNAVAILABLE' } };
  if (!result.heartbeat) return { status: 503, body: { ...base, status: 'unhealthy', reason: 'HEARTBEAT_MISSING' } };
  if (result.heartbeat.ageSeconds > STALE_AFTER_SECONDS) {
    return { status: 503, body: { ...base, status: 'unhealthy', reason: 'HEARTBEAT_STALE' } };
  }
  return { status: 200, body: { ...base, status: 'healthy' } };
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' || !['/healthz', '/'].includes(new URL(request.url || '/', 'http://internal').pathname)) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }
  probeWorkerLiveness()
    .then(result => verdict(result))
    .catch(error => ({
      status: 503,
      body: {
        status: 'unhealthy',
        reason: 'PROBE_FAILED',
        error: String(error?.message || error).slice(0, 200)
      }
    }))
    .then(({ status, body }) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    });
});

server.listen(PORT, HOST, () => {
  log('health-endpoint-ready', { host: HOST, port: PORT, heartbeatKey: config.workerHeartbeatKey, staleAfterSeconds: STALE_AFTER_SECONDS });
});

// Hand off to the unchanged scheduler. worker.js executes main() on import and
// registers its own SIGTERM/SIGINT shutdown handlers.
try {
  await import('./worker.js');
  log('worker-handoff-complete');
} catch (error) {
  log('worker-handoff-failed', { error: String(error?.message || error) });
  setTimeout(() => process.exit(1), 250).unref();
}

process.on('uncaughtException', error => {
  log('uncaughtException', { error: String(error?.message || error) });
  setTimeout(() => process.exit(1), 250).unref();
});
process.on('unhandledRejection', reason => {
  log('unhandledRejection', { error: String(reason instanceof Error ? reason.message : reason) });
  setTimeout(() => process.exit(1), 250).unref();
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log('shutdown-requested', { signal });
    server.close(() => {});
    // worker.js performs the real graceful shutdown and calls process.exit(0).
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

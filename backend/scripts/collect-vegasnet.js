#!/usr/bin/env node
/**
 * backend/scripts/collect-vegasnet.js
 * Schedule-gated Vegasnet result collector — Railway backend entry point.
 *
 * Reuses the existing consensus toto collector (backend/src/toto-collector.js),
 * which already fetches the official `vegasnet` widget source among all its
 * sources. This script ONLY changes the *trigger*, not the collector logic.
 *
 * Per Instruction #2 this is NOT a raw 1-minute poller: collection runs only
 * while at least one market is inside its real draw-result window. The window
 * map lives in backend/src/toto-collector-core.js (DRAW_SCHEDULE) and is reused
 * verbatim via isDrawWindowActive(). runTotoCollector() also honours the Redis
 * per-market completion set (toto:completed:today), so a period already
 * published today is not re-fetched until its window rolls over.
 *
 * Safe to schedule on any cadence: the collector takes a distributed Redis lock
 * (toto:collector:lock:v1), so this script serializes cleanly against the live
 * worker cycle and is a no-op if a collection is already in flight.
 *
 * Usage:
 *   node backend/scripts/collect-vegasnet.js            # schedule-gated (default)
 *   node backend/scripts/collect-vegasnet.js --run       # force one collection now
 *   node backend/scripts/collect-vegasnet.js --dry-run   # print draw-window gate decision, no network/DB/Redis
 *
 * Source URL: configurable via TOTO_VEGASNET_URL (default
 * https://widgets.vegasnet.info/result.php — verified live). The bare
 * https://vegasnet.info/result.php returns 404 and is intentionally not used.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // backend/scripts
const BACKEND_ROOT = resolve(HERE, '..');             // backend/
const CLI = { dryRun: process.argv.includes('--dry-run'), force: process.argv.includes('--run') };

// Load local dev env BEFORE any module reads process.env at import time.
// On Railway the vars come from the platform, so a missing .env is ignored.
for (const envPath of [resolve(BACKEND_ROOT, '.env'), resolve(BACKEND_ROOT, '.env.local')]) {
  if (existsSync(envPath)) {
    try { process.loadEnvFile(envPath); }
    catch { /* env already provided (Railway) or .env malformed — ignore */ }
  }
}

// Dynamic imports after env is loaded because config.js snapshots env at import.
const { config } = await import('../src/config.js');
const { logger } = await import('../src/logger.js');
const { connectRedis, checkRedis, closeRedis, redis } = await import('../src/redis.js');
const { checkDatabase, closeDatabase } = await import('../src/db.js');
const { isDrawWindowActive, DRAW_SCHEDULE } = await import('../src/toto-collector-core.js');
const { runTotoCollector } = await import('../src/toto-collector.js');

function wibNow() {
  // WIB = UTC+7 — same offset the draw-window matcher in toto-collector-core uses.
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}
function activeDrawMarkets(now = new Date()) {
  return Object.keys(DRAW_SCHEDULE).filter(slug => isDrawWindowActive(slug, { now }));
}

function gateDecisionSummary() {
  const now = wibNow();
  const active = activeDrawMarkets(now);
  return {
    nowWib: now.toISOString(),
    vegasnetUrl: config.totoVegasnetUrl,
    drawWindowActive: active.length,
    activeMarkets: active.slice(0, 20),
    note: 'No HTTP scrape outside active draw windows (no raw 1-min polling).'
  };
}

async function shutdown() {
  await Promise.allSettled([closeRedis(), closeDatabase()]);
}

async function main() {
  logger.info('Vegasnet collector starting', { dryRun: CLI.dryRun, force: CLI.force });

  if (CLI.dryRun) {
    logger.info('Vegasnet collector gate decision (dry-run)', gateDecisionSummary());
    return 0;
  }

  // Connectivity readiness — required only when we actually collect.
  await connectRedis();
  const redisProbe = await checkRedis();
  if (!redisProbe.ok) logger.warn('Redis unavailable — collector may use process-local state', { error: redisProbe.error });
  await checkDatabase();

  const active = activeDrawMarkets();
  if (!CLI.force && !active.length) {
    logger.info('Vegasnet collector: no market inside an active draw window — skipping (schedule-based).', {
      nowWib: wibNow().toISOString(),
      drawWindowActive: 0,
      activeMarkets: []
    });
    await shutdown();
    return 0;
  }

  logger.info('Vegasnet collector: running consensus collection (official vegasnet source included).', {
    reason: CLI.force ? 'manual-force' : 'draw-window-scheduled',
    drawWindowActive: active.length,
    activeMarkets: active.slice(0, 20)
  });

  const outcome = await runTotoCollector({ reason: CLI.force ? 'vegasnet-manual' : 'vegasnet-scheduled' });
  logger.info('Vegasnet collector cycle finished', {
    summary: outcome?.summary,
    healthySources: (outcome?.sources || []).filter(s => s.ok).length,
    degradedSources: (outcome?.sources || []).filter(s => s.degraded).length
  });

  await shutdown();
  return 0;
}

await main().catch(async error => {
  logger.error('Vegasnet collector failed', { error: error.message, stack: error?.stack });
  try { await shutdown(); } catch { /* ignore */ }
  process.exit(1);
});
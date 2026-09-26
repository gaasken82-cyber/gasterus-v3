import { config } from './config.js';
import { connectRedis, redis, closeRedis } from './redis.js';
import { closeDatabase } from './db.js';
import { logger } from './logger.js';
import { runTotoCollector } from './toto-collector.js';
import { isDrawWindowActive, DRAW_SCHEDULE } from './toto-collector-core.js';
import { activeWakeSet, schedulerSnapshot, TOTO_RESULT_TIMES_WIB } from './toto-draw-scheduler.js';
import { refreshSportsbookFeedFromPoll } from './sportsbook-feed.js';
import { startMemoryGuard } from './memory-guard.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let memoryGuard = null;
let stopping = false;

function collectorIntervalMs() {
  const baseMs = Math.max(30, config.totoCollectorIntervalSeconds) * 1000;
  const wibHour = (new Date().getUTCHours() + 7) % 24;
  return (wibHour >= 9 || wibHour === 0) ? baseMs : Math.max(baseMs * 5, 300_000);
}

// Jadwal operator memakai jam result per pool. Collector hanya bangun bila
// ada pool yang result-nya sudah dekat, sehingga tidak ada polling sepanjang
// hari dan hari libur tidak diulang endlessly.
const SCHEDULED_SLUGS = Object.freeze(Object.keys(TOTO_RESULT_TIMES_WIB));

function wakeMarketSnapshot(now = new Date()) {
  try {
    return activeWakeSet(now, SCHEDULED_SLUGS);
  } catch (error) {
    logger.warn('TOTO draw-window check failed; collector will retry safely', { error: error.message });
    return [];
  }
}

function anyDrawWindowActive(now = new Date()) {
  // Bila scheduler punya jam result untuk sebuah pool, keputusan itu yang dipakai
  // karena sudah memperhitungkan hari libur. Pool tanpa jam operator tetap memakai
  // jendela draw bawaan supaya pasarannya tidak berhenti diperbarui.
  const waking = wakeMarketSnapshot(now);
  if (waking.length) return true;
  return Object.keys(DRAW_SCHEDULE)
    .filter(slug => !SCHEDULED_SLUGS.includes(slug))
    .some(slug => isDrawWindowActive(slug, { now }));
}

async function collectTotoIfDue(state) {
  if (!config.totoCollectorEnabled || Date.now() - state.lastTotoCollector < collectorIntervalMs()) return;
  const nowMs = Date.now();
  state.lastTotoCollector = nowMs;
  const waking = wakeMarketSnapshot(new Date(nowMs));
  if (!anyDrawWindowActive(new Date(nowMs))) {
    state.lastWakingMarkets = 0;
    logger.info('TOTO collector skipped outside active draw window');
    return;
  }
  state.lastWakingMarkets = waking.length;
  if (waking.length) {
    logger.info('TOTO draw wake set', { markets: waking.length, sample: waking.slice(0, 6) });
  }

  let completedSlugs = new Set();
  if (redis.isOpen) {
    try {
      const raw = await redis.get('toto:completed:today');
      const saved = raw ? JSON.parse(raw) : [];
      if (Array.isArray(saved)) completedSlugs = new Set(saved);
    } catch (error) {
      logger.warn('TOTO completion cache unavailable; continuing with current cycle', { error: error.message });
    }
  }
  try {
    const result = await runTotoCollector({ reason: 'feed-worker-scheduled-draw-window' });
    const publishedNow = (result?.decisions || [])
      .filter(decision => decision.status === 'VERIFIED' && decision.drawDate && String(decision.drawDate).startsWith(new Date(nowMs).toISOString().slice(0, 10)))
      .map(decision => decision.slug)
      .filter(Boolean);
    if (publishedNow.length && redis.isOpen) {
      for (const slug of publishedNow) completedSlugs.add(slug);
      await redis.set('toto:completed:today', JSON.stringify([...completedSlugs]), { EX: 90000 });
    }
    logger.info('Feed worker TOTO collector cycle completed', { published: publishedNow.length });
  } catch (error) {
    logger.warn('Feed worker TOTO collector cycle unavailable', { error: error.message });
  } finally {
    if (global.gc && process.memoryUsage().heapUsed > 180 * 1024 * 1024) {
      try { global.gc(); } catch {}
    }
  }
}

async function refreshSportsFeedIfDue(state) {
  if (!config.sportsSourceBackgroundPollEnabled || Date.now() - state.lastSportsbookFeedRefresh < config.sportsFeedRefreshSeconds * 1000) return;
  state.lastSportsbookFeedRefresh = Date.now();
  try {
    await refreshSportsbookFeedFromPoll({ reason: 'feed-worker-background-poll' });
  } catch (error) {
    logger.warn('Feed worker sportsbook refresh unavailable', { code: error.code, error: error.message });
  }
}

async function main() {
  await connectRedis();
  memoryGuard = startMemoryGuard({ label: 'feed-worker' });
  const state = { lastTotoCollector: 0, lastSportsbookFeedRefresh: 0 };
  logger.info('Feed worker ready', {
    totoCollectorEnabled: config.totoCollectorEnabled,
    sportsFeedRefreshSeconds: config.sportsFeedRefreshSeconds,
    scheduledPools: SCHEDULED_SLUGS.length,
    schedule: schedulerSnapshot()
  });

  while (!stopping) {
    await collectTotoIfDue(state);
    await refreshSportsFeedIfDue(state);
    await sleep(1000);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info('Feed worker shutdown requested', { signal });
  memoryGuard?.stop();
  await closeRedis().catch(() => {});
  await closeDatabase().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
main().catch(error => {
  logger.error('Feed worker startup failed', { error: error.message });
  process.exit(1);
});

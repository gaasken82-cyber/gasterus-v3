/**
 * memory-guard.js — graceful self-recycle before the OS OOM-kills the container.
 *
 * Single-container Railway deploys run gateway+core+worker+member+admin in one
 * process tree. Without a heap cap, V8 lets the heap grow toward the host limit
 * and the cgroup OOM-killer tears down ALL services at once (hard kill, no
 * graceful shutdown). Instead we:
 *   - derive an active heap ceiling from NODE_OPTIONS --max-old-space-size
 *     (set per-child by launcher) or COREx/MEMBERx env fallbacks;
 *   - poll heapUsed every interval;
 *   - if the heap stays above HIGH_WATER for CONSECUTIVE checks, schedule a clean
 *     process.exit(0) so the launcher's recover() restarts ONLY this service.
 */
import { logger } from './logger.js';

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function configuredHeapMB() {
  const fromOptions = String(process.env.NODE_OPTIONS || '')
    .split(/\s+/)
    .find(o => o.startsWith('--max-old-space-size='));
  if (fromOptions) {
    const n = Number(fromOptions.split('=')[1]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  // fallbacks mirror the launcher defaults for processes started without NODE_OPTIONS
  return envNum('CORE_HEAP_MB', envNum('MEMBER_HEAP_MB', 512));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.label]  used only for log clarity
 * @param {number} [opts.highWaterRatio]  exit when heapUsed >= heapMB*ratio
 * @param {number} [opts.consecutive]     consecutive high readings before exit
 * @param {number} [opts.intervalMs]
 */
export function startMemoryGuard(opts = {}) {
  const label = opts.label || 'unknown';
  const heapMB = configuredHeapMB();
  const highWater = Math.floor(heapMB * 1024 * 1024 * (opts.highWaterRatio ?? 0.9));
  const consecutive = Math.max(1, opts.consecutive ?? 3);
  const intervalMs = opts.intervalMs ?? 60_000;
  let highCount = 0;
  let exited = false;

  const timer = setInterval(() => {
    const used = process.memoryUsage().heapUsed;
    if (global.gc && used >= Math.floor(highWater * 0.75)) {
      try { global.gc(); } catch {}
    }
    if (used >= highWater) {
      highCount += 1;
      logger.warn(`memory-guard[${label}] heap high ${(used / 1048576).toFixed(0)}MB / ${heapMB}MB (${highCount}/${consecutive})`);
      if (highCount >= consecutive) {
        if (exited) return;
        exited = true;
        logger.error(`memory-guard[${label}] recycling: heap sustained above ${heapMB}MB — graceful restart via launcher`);
        clearInterval(timer);
        setImmediate(() => process.exit(0));
      }
    } else {
      highCount = 0;
    }
  }, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer), heapMB, highWater };
}
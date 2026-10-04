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
import { readFileSync } from 'node:fs';
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

// --- Registry proses anak (RSS di luar V8 heap) ----------------------------
// Chromium (browser renderer) adalah proses terpisah: memorinya TIDAK dihitung
// oleh --max-old-space-size maupun oleh heapUsed. Tanpa registrasi ini, guard
// buta terhadap penyebab OOM yang paling nyata di container ini.
const PAGE_SIZE = 4096;
const children = new Map(); // pid -> label

export function registerChild(pid, label = 'child') {
  const key = Number(pid);
  if (!Number.isInteger(key) || key <= 0) return false;
  children.set(key, String(label || 'child'));
  return true;
}

export function unregisterChild(pid) {
  const key = Number(pid);
  if (!Number.isInteger(key)) return false;
  return children.delete(key);
}

export function registeredChildCount() {
  return children.size;
}

// RSS anak dari /proc (Linux). Di platform lain menghasilkan 0 sehingga guard
// tetap aman: hanya sinyal heap yang berlaku.
function readChildRssBytes(pid) {
  try {
    const fields = String(readFileSync(`/proc/${pid}/statm`, 'utf8')).trim().split(/\s+/);
    const residentPages = Number(fields[1]);
    if (!Number.isFinite(residentPages)) return 0;
    return Math.max(0, residentPages) * PAGE_SIZE;
  } catch {
    return 0;
  }
}

export function treeMemory() {
  const own = process.memoryUsage();
  let childRss = 0;
  for (const pid of children.keys()) childRss += readChildRssBytes(pid);
  return {
    rssBytes: own.rss + childRss,
    ownRssBytes: own.rss,
    childRssBytes: childRss,
    childCount: children.size,
    heapUsed: own.heapUsed
  };
}

// Logika keputusan dipisah agar bisa diuji tanpa memicu process.exit().
export function evaluateMemoryGuard({ heapUsed, rssBytes, highWater, rssHighWater }) {
  const heapHigh = Number(heapUsed) >= Number(highWater);
  const rssHigh = Number(rssBytes) >= Number(rssHighWater);
  return { heapHigh, rssHigh, breach: heapHigh || rssHigh };
}

// --- Batas memori container (cgroup) ---------------------------------------
// Guard harus tahu limit container supaya bisa recycle SEBELUM OS OOM-killer
// turun. Nilainya dideteksi sendiri dari cgroup, jadi tidak perlu env manual
// untuk setiap ukuran plan Railway; env hanya pengecualian.
const CGROUP_LIMIT_FILES = Object.freeze([
  '/sys/fs/cgroup/memory.max',                  // cgroup v2
  '/sys/fs/cgroup/memory/memory.limit_in_bytes' // cgroup v1
]);
// Di atas 64GB dianggap bukan limit container yang masuk akal.
const MAX_PLAUSIBLE_MEMORY_MB = 64 * 1024;
const DEFAULT_TREE_RSS_LIMIT_MB = 900;
const TREE_RSS_AUTO_RATIO = 0.75;

// Mengembalikan limit memori container dalam MB, atau null bila tidak terdeteksi
// (mis. "max"/tak terbatas, atau bukan Linux/cgroup).
export function detectContainerMemoryMB(read = readFileSync) {
  for (const file of CGROUP_LIMIT_FILES) {
    let raw;
    try { raw = String(read(file, 'utf8')).trim(); } catch { continue; }
    if (!raw || raw === 'max') continue;
    const bytes = Number(raw);
    if (!Number.isFinite(bytes) || bytes <= 0) continue;
    if (bytes > Number.MAX_SAFE_INTEGER) continue; // limit "infinite" cgroup v1
    const mb = Math.floor(bytes / (1024 * 1024));
    if (mb <= 0 || mb > MAX_PLAUSIBLE_MEMORY_MB) continue;
    return mb;
  }
  return null;
}

// Urutan prioritas: opsi eksplisit (test) > env > deteksi cgroup > default.
export function resolveRssLimitMB(opts = {}) {
  const explicit = Number(opts.rssLimitMb);
  if (Number.isInteger(explicit) && explicit > 0) return { rssLimitMB: explicit, source: 'option' };
  const fromEnv = envNum('TREE_RSS_LIMIT_MB', 0);
  if (fromEnv > 0) return { rssLimitMB: fromEnv, source: 'env' };
  const detected = detectContainerMemoryMB(opts.readCgroup);
  if (detected) return { rssLimitMB: Math.max(256, Math.floor(detected * TREE_RSS_AUTO_RATIO)), source: `cgroup:${detected}MB` };
  return { rssLimitMB: DEFAULT_TREE_RSS_LIMIT_MB, source: 'default' };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.label]  used only for log clarity
 * @param {number} [opts.highWaterRatio]  exit when heapUsed >= heapMB*ratio
 * @param {number} [opts.consecutive]     consecutive high readings before exit
 * @param {number} [opts.intervalMs]
 * @param {number} [opts.rssLimitMb]  override batas tree RSS (umumnya otomatis)
 */
export function startMemoryGuard(opts = {}) {
  const label = opts.label || 'unknown';
  const heapMB = configuredHeapMB();
  const highWater = Math.floor(heapMB * 1024 * 1024 * (opts.highWaterRatio ?? 0.9));
  // Batas RSS total (self + anak terdaftar, mis. Chromium). Diturunkan otomatis
  // dari limit memori container; env hanya untuk override kasus khusus.
  const { rssLimitMB, source: rssLimitSource } = resolveRssLimitMB(opts);
  const rssHighWater = rssLimitMB * 1024 * 1024;
  const consecutive = Math.max(1, opts.consecutive ?? 3);
  const intervalMs = opts.intervalMs ?? 60_000;
  let highCount = 0;
  let exited = false;

  logger.info(`memory-guard[${label}] heap ${heapMB}MB | tree RSS ${rssLimitMB}MB (sumber: ${rssLimitSource}) | jendela ${consecutive}x${Math.round(intervalMs / 1000)}s`);

  const timer = setInterval(() => {
    const mem = treeMemory();
    const used = mem.heapUsed;
    if (global.gc && used >= Math.floor(highWater * 0.75)) {
      try { global.gc(); } catch {}
    }
    const decision = evaluateMemoryGuard({
      heapUsed: used,
      rssBytes: mem.rssBytes,
      highWater,
      rssHighWater
    });
    if (decision.breach) {
      highCount += 1;
      logger.warn(`memory-guard[${label}] heap ${(used / 1048576).toFixed(0)}MB / ${heapMB}MB | tree ${(mem.rssBytes / 1048576).toFixed(0)}MB / ${rssLimitMB}MB | child ${mem.childCount} (${highCount}/${consecutive})`);
      if (highCount >= consecutive) {
        if (exited) return;
        exited = true;
        const reason = decision.heapHigh ? `heap > ${heapMB}MB` : `tree RSS > ${rssLimitMB}MB`;
        logger.error(`memory-guard[${label}] recycling: ${reason} sustained — graceful restart via launcher`);
        clearInterval(timer);
        setImmediate(() => process.exit(0));
      }
    } else {
      highCount = 0;
    }
  }, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer), heapMB, highWater, rssLimitMB, rssLimitSource, rssHighWater };
}
// Polling per pool. Setiap pool/draw punya state sendiri sehingga jadwal,
// attempts, dan waktu poll berikutnya tidak bercampur antar pool.
//
// Aturan main:
//   - Tidak ada polling sebelum T-5 (lihat scheduler).
//   - Satu poll per pool setiap 3 menit.
//   - Poll berhenti begitu result baru valid terlihat untuk pool itu.
//   - Setelah batas MAX_POLL_MINUTES job ditandai RESULT_DELAYED supaya tidak
//     ada pool yang polling tanpa akhir.
//   - Job hilang dari memori setiap selesai/expired, dan state ini murni turunan
//     dari jam result, sehingga restart tidak pernah membuat job ganda.
import {
  poolsInPollingPhase,
  markDrawObservations,
  TOTO_POLL_INTERVAL_MINUTES,
  TOTO_MAX_POLL_MINUTES,
  TOTO_RESULT_TIMES_WIB
} from './toto-draw-scheduler.js';
import { logger } from './logger.js';

const POLL_INTERVAL_MS = TOTO_POLL_INTERVAL_MINUTES * 60 * 1000;

function jobKey(slug, resultTime, dayKey) {
  return `${slug}@${resultTime}#${dayKey}`;
}

const jobs = new Map();

// Job aktif dibuat ulang dari jam result setiap kali sinkron, sehingga tidak
// ada job ganda setelah restart dan tidak ada state basi yang menumpuk.
export function syncJobs(now = new Date()) {
  const nowMs = now.getTime();
  const active = poolsInPollingPhase(now, Object.keys(TOTO_RESULT_TIMES_WIB));
  const activeSlugs = new Set();
  for (const pool of active) {
    activeSlugs.add(pool.slug);
    const key = jobKey(pool.slug, pool.resultTime, pool.dayKey);
    if (jobs.has(key)) continue;
    const job = {
      slug: pool.slug,
      resultTime: pool.resultTime,
      dayKey: pool.dayKey,
      startedAt: nowMs,
      nextPollAt: nowMs,
      attempts: 0,
      lastDrawDate: null,
      status: 'WAITING'
    };
    jobs.set(key, job);
    logger.info('TOTO draw poll dimulai', { pool: job.slug, resultWib: clockFromMinutes(pool.resultTime), poll: 1 });
  }
  // Pool yang tidak lagi dibangunkan (hari libur, jadwal selesai) langsung
  // dibuang supaya tidak ada job yatim.
  for (const [key, job] of jobs) {
    if (activeSlugs.has(job.slug)) continue;
    if (jobs.get(key) === job) {
      jobs.delete(key);
      logger.info('TOTO draw poll dibatalkan', { pool: job.slug, reason: 'di luar fase polling' });
    }
  }
  return active.length;
}

// Job yang sudah waktunya poll # berikutnya.
export function dueJobs(now = new Date()) {
  const nowMs = now.getTime();
  const due = [];
  for (const [key, job] of jobs) {
    if (job.nextPollAt > nowMs) continue;
    if (nowMs - job.startedAt > TOTO_MAX_POLL_MINUTES * 60 * 1000) {
      job.status = 'RESULT_DELAYED';
      job.nextPollAt = Infinity;
      jobs.delete(key);
      logger.warn('TOTO draw poll dihentikan', { pool: job.slug, reason: 'RESULT_DELAYED', attempts: job.attempts });
      continue;
    }
    due.push({ key, job });
  }
  return due;
}

// Tandai satu poll sudah dijalankan untuk sebuah pool.
export function markPolled(key, now = new Date()) {
  const job = jobs.get(key);
  if (!job) return null;
  job.attempts += 1;
  job.nextPollAt = now.getTime() + POLL_INTERVAL_MS;
  return job;
}

// Result dari sebuah poll. Pool yang tanggal draw-nya sudah maju dianggap
// selesai dan tidak lagi dipoll; pool lain tetap berjalan dengan jadwalnya.
export function applyPollResult(decisions = [], { now = new Date(), polled = [] } = {}) {
  const outcome = markDrawObservations(decisions, { now });
  const advanced = new Set(outcome.advanced);
  for (const key of polled) {
    const job = jobs.get(key);
    if (!job) continue;
    if (!advanced.has(job.slug)) continue;
    job.status = 'RESULT_FOUND';
    job.lastDrawDate = String((decisions.find(item => item?.slug === job.slug)?.drawDate) || '');
    job.nextPollAt = Infinity;
    jobs.delete(key);
    logger.info('TOTO draw poll selesai', { pool: job.slug, attempts: job.attempts, drawDate: job.lastDrawDate || null });
  }
  return { advanced: outcome.advanced, skippedDays: outcome.skippedDays };
}

export function pollerSnapshot(now = new Date()) {
  return {
    activeJobs: jobs.size,
    pollIntervalMinutes: TOTO_POLL_INTERVAL_MINUTES,
    maxPollMinutes: TOTO_MAX_POLL_MINUTES,
    jobs: [...jobs.values()].map(job => ({
      pool: job.slug,
      resultWib: clockFromMinutes(job.resultTime),
      attempts: job.attempts,
      nextPollAt: new Date(job.nextPollAt).toISOString(),
      status: job.status
    }))
  };
}

function clockFromMinutes(minutes) {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export const __totoDrawPoller = { jobs, syncJobs, dueJobs, markPolled, applyPollResult, pollerSnapshot };

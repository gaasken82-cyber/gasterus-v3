// ============================================================
// TOTO V3 — SCHEDULE REGISTRY (explicit, Asia/Jakarta WIB)
// READ-ONLY scheduler, NOT WIRED into worker.
//
// CATATAN PENTING: modul ini dulunya punya tabel jam sendiri
// (VERIFIED_DRAW_WIB) yang BERTENTANGAN dengan jadwal kanonik di
// toto-draw-scheduler.js — misalnya sydney-pool 12:50 di sini vs 20:00 di sana.
// Dua sumber kebenaran untuk jam draw adalah bom waktu: begitu salah satu dipakai,
// pasar salah buka/tutup. Sekarang modul ini hanya TAMPILAN(read-only) di atas
// TOTO_RESULT_TIMES_WIB, jadi tidak ada lagi tabel jadwal kedua di repo.
//
// Rules enforced here:
// - Jam draw SELALU berasal dari toto-draw-scheduler.js, tidak pernah ditulis manual.
// - markets.draw_time di DB tidak pernah dipakai sebagai jadwal.
// - Pasar tanpa jam pada scheduler tetap UNVERIFIED dan tidak pernah waking.
// ============================================================
import { MARKET_MAP } from './toto-collector-core.js';
import { TOTO_RESULT_TIMES_WIB } from './toto-draw-scheduler.js';

export const SCHEDULE_TIMEZONE = 'Asia/Jakarta';
export const WAKE_LEAD_MINUTES = 5;
export const POLL_MIN_SECONDS = 60;
export const POLL_MAX_SECONDS = 120;

// Jam draw = milik scheduler kanonik. Di sini hanya diambil nilai pertama untuk
// pool yang punya lebih dari satu undian per hari.
const VERIFIED_DRAW_WIB = Object.freeze(Object.fromEntries(
  Object.entries(TOTO_RESULT_TIMES_WIB)
    .map(([slug, times]) => [slug, Array.isArray(times) && times.length ? times[0] : null])
    .filter(([, draw]) => draw)
));

function minusMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const total = ((h * 60 + m - minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function sourceNamesFor(slug) {
  const entry = MARKET_MAP.find((x) => x.slug === slug);
  return entry ? Object.keys(entry.sources || {}) : [];
}

// Full 85-row registry, derived from MARKET_MAP order (sortOrder).
// Verified rows carry draw/wake; unverified rows carry draw:null and never wake.
export const SCHEDULE_REGISTRY = Object.freeze(
  [...MARKET_MAP]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((entry) => {
      const slug = entry.slug;
      const draw = VERIFIED_DRAW_WIB[slug] || null;
      const verified = draw !== null;
      return Object.freeze({
        slug,
        name: entry.name,
        sources: sourceNamesFor(slug),
        drawWib: draw,
        wakeWib: verified ? minusMinutes(draw, WAKE_LEAD_MINUTES) : null,
        pollSeconds: `${POLL_MIN_SECONDS}-${POLL_MAX_SECONDS}`,
        status: verified ? 'VERIFIED' : 'UNVERIFIED',
        timezone: SCHEDULE_TIMEZONE,
      });
    }),
);

export const SCHEDULE_COUNTS = Object.freeze({
  verified: SCHEDULE_REGISTRY.filter((r) => r.status === 'VERIFIED').length,
  unverified: SCHEDULE_REGISTRY.filter((r) => r.status !== 'VERIFIED').length,
  total: SCHEDULE_REGISTRY.length,
});

// --- Centralized single-scheduler helpers (pure, no timers created here) ---
// Wake window for ONE verified market on a given WIB day: [wakeWib, drawWib + grace].
// Unverified markets have no window => never active.
function toMin(hhmm) {
  const [h = '00', m = '00'] = String(hhmm || '00:00').split(':');
  return (Number(h) % 24) * 60 + (Number(m) % 60);
}

export function wakeWindowFor(slug) {
  const row = SCHEDULE_REGISTRY.find((r) => r.slug === slug);
  if (!row || row.status !== 'VERIFIED' || !row.drawWib || !row.wakeWib) return null;
  return [row.wakeWib, row.drawWib];
}

// Markets that should be actively polled at `now` (Date, interpreted in WIB).
// Grouping: callers fetch this whole set in ONE active cycle (no per-market timers).
export function activeMarketsAt(now = new Date(), { graceAfterDrawMin = 15 } = {}) {
  const wibMs = now.getTime() + 7 * 3600 * 1000;
  const mins = Math.floor((((wibMs % 86400000) + 86400000) % 86400000) / 60000);
  return SCHEDULE_REGISTRY.filter((row) => {
    if (row.status !== 'VERIFIED') return false;
    const open = toMin(row.wakeWib);
    const close = toMin(row.drawWib) + Math.max(0, Number(graceAfterDrawMin) || 0);
    return open <= close
      ? mins >= open && mins <= close
      : mins >= open || mins <= close;
  }).map((row) => row.slug);
}

// Milliseconds until the next H-5 wake among VERIFIED markets (for one central sleep).
// Returns null when nothing verified remains (scheduler stays asleep).
export function msUntilNextWake(now = new Date()) {
  const verified = SCHEDULE_REGISTRY.filter((r) => r.status === 'VERIFIED' && r.wakeWib);
  if (!verified.length) return null;
  const wibMs = now.getTime() + 7 * 3600 * 1000;
  const minsNow = Math.floor((((wibMs % 86400000) + 86400000) % 86400000) / 60000);
  const msIntoMinute = wibMs % 60000;
  let best = null;
  for (const row of verified) {
    const wake = toMin(row.wakeWib);
    let deltaMin = wake - minsNow;
    if (deltaMin < 0) deltaMin += 1440; // next day
    const deltaMs = deltaMin * 60000 - msIntoMinute;
    if (best === null || deltaMs < best) best = deltaMs;
  }
  return best;
}

// Stop rule helper: a market stops polling the moment a genuinely NEW result
// for its current period is persisted (caller compares drawDate/period vs history).
// Kept here as documentation of the contract; persistence itself stays in the
// existing collector path (consensus + completed-today in Redis untouched).
export function shouldStopMarket({ persistedNewResult = false } = {}) {
  return persistedNewResult === true;
}

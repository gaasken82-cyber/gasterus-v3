const DAY_MS = 86400000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value) {
  const text = String(value || '').slice(0, 10);
  return ISO_DATE_RE.test(text) ? text : null;
}
function utcDay(value) {
  const date = isoDate(value);
  return date ? Date.parse(`${date}T00:00:00Z`) : NaN;
}
function addDays(date, days) {
  const ms = utcDay(date);
  return Number.isFinite(ms) ? new Date(ms + days * DAY_MS).toISOString().slice(0, 10) : null;
}
function dayGap(newer, older) {
  const a = utcDay(newer), b = utcDay(older);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / DAY_MS) : NaN;
}

export function inferNextCashPeriod(history = [], { schedule = null } = {}) {
  const dates = [...new Set((history || []).map(item => isoDate(item.draw_date || item.drawDate || item.period)).filter(Boolean))]
    .sort().reverse();
  // Satu riwayat saja belum cukup untuk menyimpulkan irama, TAPI jadwal pool yang
  // sudah dipetakan (closeTime/resultTime) memberi irama harian secara langsung.
  // Tanpa ini, pasar seperti Sydney yang baru mulai terkumpul riwayatnya tidak
  // pernah kebuka sama sekali karena `dates.length < 2`.
  if (dates.length === 1 && schedule?.resultTime) {
    return { period: addDays(dates[0], 1), cadenceDays: 1, evidenceCount: 1, method: 'CONFIGURED_DAILY_SCHEDULE' };
  }
  if (dates.length < 2) return null;
  const firstGap = dayGap(dates[0], dates[1]);
  if (!Number.isInteger(firstGap) || firstGap < 1 || firstGap > 7) return null;
  // Daily draws can be inferred after two consecutive trusted observations.
  if (firstGap === 1) return { period: addDays(dates[0], 1), cadenceDays: 1, evidenceCount: 2, method: 'TRUSTED_DAILY_HISTORY' };
  // Non-daily cadence requires three trusted periods with the same interval.
  if (dates.length >= 3 && dayGap(dates[1], dates[2]) === firstGap) {
    return { period: addDays(dates[0], firstGap), cadenceDays: firstGap, evidenceCount: 3, method: 'TRUSTED_FIXED_INTERVAL_HISTORY' };
  }
  return null;
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hh = Number(match[1]), mm = Number(match[2]), ss = Number(match[3] || 0);
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

export function cashCloseAtForPeriod(period, schedule, nowMs = Date.now()) {
  const date = isoDate(period);
  if (!date || !schedule) return null;
  const closeTime = normalizeTime(schedule.closeTime);
  const resultTime = normalizeTime(schedule.resultTime);
  const time = closeTime || resultTime;
  if (!time) return null;
  // Source schedules are parsed in Asia/Jakarta. A close-time is buffered by 2 minutes;
  // if only result-time exists, stop 12 minutes before it instead of betting into the draw.
  const base = Date.parse(`${date}T${time}+07:00`);
  if (!Number.isFinite(base)) return null;
  const bufferMs = (closeTime ? 2 : 12) * 60 * 1000;
  const closeMs = base - bufferMs;
  if (closeMs <= nowMs) return null;
  return new Date(closeMs);
}

export function buildCashWindowPlan({ history = [], decision = null, resultPeriod = null, nowMs = Date.now() } = {}) {
  if (!decision) return null;
  if (decision.status !== undefined && decision.status !== 'VERIFIED') return null;
  const inferred = inferNextCashPeriod(history, { schedule: decision?.schedule || null });
  if (!inferred?.period) return null;
  const latestResult = isoDate(resultPeriod || decision.drawDate);
  // Future betting windows follow source schedule. Result verification is not a prerequisite.
  if (latestResult && inferred.period <= latestResult) return null;
  const trustedPeriods = new Set((history || []).map(item => isoDate(item.period || item.draw_date || item.drawDate)).filter(Boolean));
  if (trustedPeriods.has(inferred.period)) return null;
  const closeAt = cashCloseAtForPeriod(inferred.period, decision.schedule, nowMs);
  if (!closeAt) return null;
  return {
    period: inferred.period,
    closeAt,
    basis: {
      mode: 'CASH',
      method: inferred.method,
      cadenceDays: inferred.cadenceDays,
      evidenceCount: inferred.evidenceCount,
      latestTrustedResultPeriod: latestResult,
      scheduleStatus: decision.schedule?.status || 'OBSERVED',
      scheduleSources: Array.isArray(decision.schedule?.sources) ? decision.schedule.sources : [],
      scheduleTimezone: decision.schedule?.timezone || 'Asia/Jakarta',
      sourceCloseTime: decision.schedule?.closeTime || null,
      sourceResultTime: decision.schedule?.resultTime || null
    }
  };
}


// Jam result pools menurut instruksi operator, dalam WIB.
//
// Nilai di sini adalah titik awal. Setelah tiga kali pengamatan, jam hasil
// pengukuran di sumber menggantikan nilai ini sehingga jadwal tidak lagi
// bergantung pada perkiraan. Selama belum terkalibrasi, jadwal digeser lebih
// awal supaya pasar menutup sebelum angka terlihat.
//
// Beberapa pool punya lebih dari satu undian per hari, hasilnya ditulis sebagai
// daftar jam.
//
// Hari tanpa pengundian tidak dicatat sebagai tabel khusus. Scheduler mendeteksi
//nya secara empiris: bila jam result sudah lewat tetapi tanggal draw di sumber
//tidak berubah, pasar dianggap libur hari itu dan penjadwalan untuk hari itu
//dihentikan. Cara ini berlaku untuk hari libur apa pun, termasuk yang tidak
//pernah tercatat sebelumnya.
export const TOTO_RESULT_TIMES_WIB = Object.freeze({
  'jepang-pool': ['18:45'],
  'taiwan-pool': ['20:30'],
  'hongkong-pool': ['23:00'],
  'pcso-pool': ['21:00'],
  'singapore-pool': ['23:00'],
  'ohio-eve-pool': ['06:29'],
  'michigan-eve-pool': ['06:29'],
  'rhode-island-pool': ['05:59'],
  'washingtonev-pool': ['11:00'],
  'georgia-eve-pool': ['05:59'],
  'ohio-mid-pool': ['00:29'],
  'newjerseymid-pool': ['15:00'],
  'kentucky-mid-pool': ['15:00'],
  'indiana-mid-pool': ['00:20'],
  'florida-mid-pool': ['01:30'],
  'illinois-mid-pool': ['00:40'],
  'missouri-mid-pool': ['01:00'],
  'delaware-ngt-pool': ['06:57'],
  'delaware-day-pool': ['01:58'],
  'virginia-day-pool': ['15:00'],
  'sydney-pool': ['14:00'],
  'cambodia-pool': ['11:50'],
  'california-pool': ['07:00'],
  'china-pool': ['22:15'],
  'bullseye-pool': ['13:00'],
  'newyork-pool': ['13:00'],
  'newyork-eve-pool': ['23:00'],
  'toto-macau-midnight': ['00:00'],
  'toto-macau-siang': ['13:00'],
  'toto-macau-sore': ['16:00'],
  'toto-macau-malam': ['19:00'],
  'toto-macau-night': ['22:00']
});

// Hari tanpa pengundian yang sudah diketahui dan tetap dipakai sebagai
// penyaring awal. Nilai ini hari dalam satu minggu lokal WIB, 0=Minggu, 6=Sabtu.
// Deteksi empiris tetap menjadi penentu utama; daftar ini hanya menghemat
// polling pada hari libur yang memang sudah jelas.
export const TOTO_SKIPPED_WEEKDAYS = Object.freeze({
  'singapore-pool': [2, 5]
});

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86400000;
// Jendela bangun dimulai sebelum jam result dan ditutup beberapa menit setelah
// jam result, supaya angka baru sempat terambil tanpa membuat collector berjalan
// sepanjang hari.
const WAKE_LEAD_MINUTES = 20;
const WAKE_TRAIL_MINUTES = 25;
// Batas kesabaran menunggu sumber. Bila jam result sudah lewat selama jendela ini
// tanpa tanggal draw berubah, pasar dianggap libur hari itu.
const HOLIDAY_GRACE_MINUTES = 90;

const state = new Map();
const MAX_TRACKED = 96;

function toMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]) % 24;
  const minutes = Number(match[2]) % 60;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function wibParts(now = new Date()) {
  const shifted = new Date((now instanceof Date ? now.getTime() : Date.parse(String(now))) + WIB_OFFSET_MS);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    dayKey: shifted.toISOString().slice(0, 10)
  };
}

function resultTimesFor(slug) {
  return (TOTO_RESULT_TIMES_WIB[String(slug || '').trim()] || []).map(toMinutes).filter(value => value !== null);
}

function entryFor(slug) {
  const key = String(slug || '').trim();
  let entry = state.get(key);
  if (!entry) {
    if (state.size >= MAX_TRACKED) {
      const oldest = [...state.entries()].sort((a, b) => (a[1].seenAt || 0) - (b[1].seenAt || 0))[0];
      if (oldest) state.delete(oldest[0]);
    }
    entry = { lastDrawDate: null, lastDrawDateAt: null, skippedDays: new Set(), seenAt: 0 };
    state.set(key, entry);
  }
  return entry;
}

// Hari yang sudah dipastikan tanpa pengundian. Daftar operator dipakai lebih dulu,
// lalu hari yang terlewat saat jam result lewat ditandai secara permanen sehingga
// collector tidak mengulang polling sepanjang hari libur itu.
export function isDrawDay(slug, now = new Date()) {
  const { weekday, dayKey } = wibParts(now);
  const skipList = TOTO_SKIPPED_WEEKDAYS[String(slug || '').trim()];
  if (Array.isArray(skipList) && skipList.includes(weekday)) return false;
  return !entryFor(slug).skippedDays.has(dayKey);
}

export function markDrawObservations(decisions = [], { now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) return { advanced: 0, skippedDays: [] };
  const { minutes } = wibParts(now);
  const advanced = [];
  const skippedDays = [];

  for (const decision of decisions) {
    const slug = String(decision?.slug || '').trim();
    const drawDate = String(decision?.drawDate || '').trim();
    if (!slug || !drawDate || decision?.status !== 'VERIFIED') continue;
    const entry = entryFor(slug);
    entry.seenAt = nowMs;
    if (entry.lastDrawDate === null) {
      entry.lastDrawDate = drawDate;
      entry.lastDrawDateAt = nowMs;
      entry.missedDraws = 0;
      continue;
    }
    if (entry.lastDrawDate === drawDate) continue;
    // Angka benar-benar berganti, jadi jadwal yang lalu bukan hari libur.
    entry.lastDrawDate = drawDate;
    entry.lastDrawDateAt = nowMs;
    entry.missedDraws = 0;
    // Angka yang telat keluar menghapus status libur hari ini supaya pool
    // langsung dijadwalkan kembali.
    const { dayKey } = wibParts(now);
    if (entry.skippedDays.delete(dayKey)) entry.missedDraws = 0;
    advanced.push(slug);
  }

  // Deteksi hari libur: bila jam result sudah lewat dan tanggal draw yang terlihat
  // masih sama sejak sebelum jadwal itu, berarti sumber tidak meng-undian hari ini.
  for (const slug of Object.keys(TOTO_RESULT_TIMES_WIB)) {
    const entry = entryFor(slug);
    entry.seenAt = nowMs;
    if (entry.lastDrawDate === null || entry.lastDrawDateAt === null) continue;
    const times = resultTimesFor(slug);
    // Jadwal yang berlalu sejak terakhir kali tanggal draw berubah.
    const sinceChange = ((minutes - wibMinutesAt(entry.lastDrawDateAt)) % 1440 + 1440) % 1440;
    const due = times.filter(time => sinceChange >= ((time - wibMinutesAt(entry.lastDrawDateAt)) % 1440 + 1440) % 1440).length;
    if (!due) continue;
    if (sinceChange < HOLIDAY_GRACE_MINUTES) continue;
    entry.missedDraws = (entry.missedDraws || 0) + due;
    if (entry.missedDraws < 1) continue;
    const { dayKey } = wibParts(now);
    if (!entry.skippedDays.has(dayKey)) {
      entry.skippedDays.add(dayKey);
      skippedDays.push(slug);
    }
  }
  return { advanced, skippedDays };
}

function wibMinutesAt(ms) {
  const shifted = new Date(ms + WIB_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function isExplicitSkipped(slug, now) {
  const { weekday } = wibParts(now);
  const skipList = TOTO_SKIPPED_WEEKDAYS[String(slug || '').trim()];
  return Array.isArray(skipList) && skipList.includes(weekday);
}

// Jendela bangun sebuah pool: [mulai, selesai] dalam menit WIB.
export function wakeWindowFor(slug, now = new Date()) {
  const times = resultTimesFor(slug);
  if (!times.length) return null;
  const { minutes } = wibParts(now);
  for (const time of times) {
    const start = ((time - WAKE_LEAD_MINUTES) % 1440 + 1440) % 1440;
    const end = (time + WAKE_TRAIL_MINUTES) % 1440;
    const inside = start <= end
      ? minutes >= start && minutes <= end
      : minutes >= start || minutes <= end;
    if (inside && isDrawDay(slug, now)) return { start, end, resultTime: time };
  }
  return null;
}

// Daftar pool yang sedang waking. Kalau kosong, collector tidak perlu berjalan
// sama sekali sehingga tidak ada polling sia-sia.
export function activeWakeSet(now = new Date(), slugs = []) {
  return slugs.filter(slug => !isExplicitSkipped(slug, now) && wakeWindowFor(slug, now));
}

export function schedulerSnapshot(now = new Date()) {
  const { dayKey, weekday } = wibParts(now);
  const tracked = [...state.entries()].map(([slug, entry]) => ({
    slug,
    lastDrawDate: entry.lastDrawDate,
    skippedToday: entry.skippedDays.has(dayKey)
  }));
  return {
    dayKeyWib: dayKey,
    weekdayWib: weekday,
    wakeLeadMinutes: WAKE_LEAD_MINUTES,
    wakeTrailMinutes: WAKE_TRAIL_MINUTES,
    holidayGraceMinutes: HOLIDAY_GRACE_MINUTES,
    configuredMarkets: Object.keys(TOTO_RESULT_TIMES_WIB).length,
    explicitWeekdaySkips: TOTO_SKIPPED_WEEKDAYS,
    tracked
  };
}

export const __totoDrawScheduler = { state, toMinutes, wibParts };

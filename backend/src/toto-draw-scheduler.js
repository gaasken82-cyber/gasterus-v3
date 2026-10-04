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
  'toto-macau-midnight': ['00:00'],
  'toto-macau-siang': ['13:00'],
  'toto-macau-sore': ['16:00'],
  'toto-macau-malam': ['19:00'],
  'toto-macau-night': ['22:00'],
  'king-kong-4d-pool': ['20:15'],
  'hongkong-pool': ['23:25'],
  'sydney-pool': ['20:00'],
  'newyork-pool': ['22:35'],
  'singapore-pool': ['22:25'],
  'china-pool': ['21:35'],
  'california-pool': ['21:15'],
  'pcso-pool': ['23:25'],
  'bullseye-pool': ['22:15'],
  'jepang-pool': ['20:45'],
  'taiwan-pool': ['21:55'],
  'wisconsin-pool': ['02:35'],
  'cambodia-pool': ['20:35'],
  'georgia-eve-pool': ['04:55'],
  'oregon-1-pool': ['04:00'],
  'oregon-2-pool': ['07:00'],
  'oregon-3-pool': ['10:00'],
  'oregon-4-pool': ['13:00'],
  'ohio-mid-pool': ['05:35'],
  'ohio-eve-pool': ['04:35'],
  'newyork-eve-pool': ['22:35'],
  'maryland-eve-pool': ['04:35'],
  'michigan-eve-pool': ['04:35'],
  'newjersey-mid-pool': ['05:35'],
  'kentucky-mid-pool': ['05:35'],
  'indiana-mid-pool': ['05:35'],
  'tennessee-mid-pool': ['05:35'],
  'tennessee-eve-pool': ['04:35'],
  'texas-eve-pool': ['04:35'],
  'texas-day-pool': ['06:35'],
  'texas-night-pool': ['08:35'],
  'florida-mid-pool': ['05:35'],
  'rhode-island-pool': ['04:35'],
  'illinois-mid-pool': ['05:35'],
  'missouri-mid-pool': ['05:35'],
  'washington-md-pool': ['05:35'],
  'washington-ev-pool': ['04:35'],
  'delaware-ngt-pool': ['06:35'],
  'delaware-day-pool': ['08:35'],
  'virginia-day-pool': ['08:35']
});

// Hari tanpa pengundian yang sudah diketahui dan tetap dipakai sebagai
// penyaring awal. Nilai ini hari dalam satu minggu lokal WIB, 0=Minggu, 6=Sabtu.
// Deteksi empiris tetap menjadi penentu utama; daftar ini hanya menghemat
// polling pada hari libur yang memang sudah jelas.
export const TOTO_SKIPPED_WEEKDAYS = Object.freeze({
  'singapore-pool': [2, 5],
  'pcso-pool': [0]
});

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86400000;
// Pemisahan waktu sesuai aturan platform:
//
//   CLOSE BETTING = jam result - 20 menit
//   SCRAPER START = jam result -  5 menit
//   POLLING       = setiap 3 menit per pool, berhenti saat result baru valid
//
// Jendela T-20 hanya dipakai untuk menutup betting, tidak untuk scraping.
// Scraping dimulai pada T-5 dan dilanjutkan per pool sampai result baru
// ditemukan, bukan sampai jam result lewat.
const CLOSE_LEAD_MINUTES = 20;
const SCRAPE_LEAD_MINUTES = 5;
const POLL_INTERVAL_MINUTES = 3;
// Batas kesabaran menunggu sumber. Bila jam result sudah lewat selama jendela ini
// tanpa tanggal draw berubah, pasar dianggap libur hari itu. Ini terpisah dari
// status RESULT_DELAYED supaya dua keadaan tidak tertukar.
const HOLIDAY_GRACE_MINUTES = 90;
// Pengaman: satu pool tidak boleh polling tanpa henti. Setelah batas ini job
// polling dihentikan sebagai RESULT_DELAYED, pasar tetap CLOSED, dan siklus
// berikutnya baru dijadwalkan pada undian berikutnya. Angkanya sengaja jauh lebih
// kecil dari 24 jam supaya tidak semua pool waking sepanjang hari.
const MAX_POLL_MINUTES = 60;

export const TOTO_CLOSE_LEAD_MINUTES = CLOSE_LEAD_MINUTES;
export const TOTO_SCRAPE_LEAD_MINUTES = SCRAPE_LEAD_MINUTES;
export const TOTO_POLL_INTERVAL_MINUTES = POLL_INTERVAL_MINUTES;
export const TOTO_MAX_POLL_MINUTES = MAX_POLL_MINUTES;

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

// Jendela polling sebuah pool. Mulai pada T-5 dan tetap terbuka sampai result
// baru ditemukan, dibatasi MAX_POLL_MINUTES supaya tidak ada pool yang polling
// tanpa akhir. Angka dihitung sebagai "menit sejak mulai" supaya jadwal yang
// melewati tengah malam tetap benar.
export function wakeWindowFor(slug, now = new Date()) {
  const times = resultTimesFor(slug);
  if (!times.length) return null;
  if (isExplicitSkipped(slug, now)) return null;
  const { minutes } = wibParts(now);
  for (const time of times) {
    const sinceStart = sinceStartMinutes(time, minutes);
    if (sinceStart >= 0 && sinceStart <= MAX_POLL_MINUTES && isDrawDay(slug, now)) {
      return { start: normalizeMinutes(time - SCRAPE_LEAD_MINUTES), end: normalizeMinutes(time + MAX_POLL_MINUTES), resultTime: time };
    }
  }
  return null;
}

function normalizeMinutes(minutes) {
  return ((Math.floor(minutes) % 1440) + 1440) % 1440;
}

// Berapa menit sudah berjalan sejak polling sebuah undian boleh mulai. Nilai
// negatif berarti belum waktunya, lebih dari MAX_POLL_MINUTES berarti sudah
// melewati batas kesabaran.
function sinceStartMinutes(resultMinutes, currentMinutes) {
  const start = resultMinutes - SCRAPE_LEAD_MINUTES;
  const since = ((currentMinutes - start) % 1440 + 1440) % 1440;
  return since > MAX_POLL_MINUTES ? -1 : since;
}

// Daftar pool yang sedang waking. Kalau kosong, collector tidak perlu berjalan
// sama sekali sehingga tidak ada polling sia-sia.
export function activeWakeSet(now = new Date(), slugs = []) {
  return slugs.filter(slug => !isExplicitSkipped(slug, now) && wakeWindowFor(slug, now));
}

// Kapan betting harus ditutup untuk sebuah undian. Dipakai lifecycle dan
// presentation, bukan untuk memulai scraping.
export function closeAtFor(resultTime, { now = new Date() } = {}) {
  const time = typeof resultTime === 'number' ? resultTime : toMinutes(resultTime);
  if (time === null || time === undefined) return null;
  const { minutes } = wibParts(now);
  // Bila jam result sudah lewat hari ini, undian berikutnya yang dihitung.
  const base = time <= minutes ? time + 1440 : time;
  return {
    resultMinutes: base,
    closeMinutes: base - CLOSE_LEAD_MINUTES,
    resultClock: clockFromMinutes(base),
    closeClock: clockFromMinutes(base - CLOSE_LEAD_MINUTES)
  };
}

// Kapan polling untuk sebuah undian boleh dimulai. Tidak ada scraping sebelum
// T-5, dan tidak ada scraping sama sekali pada hari tanpa undian.
export function pollStartFor(slug, resultTime, { now = new Date() } = {}) {
  const time = typeof resultTime === 'number' ? resultTime : toMinutes(resultTime);
  if (time === null || time === undefined) return null;
  if (!isDrawDay(slug, now)) return null;
  const { minutes, dayKey } = wibParts(now);
  const base = time <= minutes ? time + 1440 : time;
  return { dayKey, resultMinutes: base, startMinutes: base - SCRAPE_LEAD_MINUTES };
}

function clockFromMinutes(minutes) {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

// Pool yang sedang menunggu result. Nilai balik berisi jam result yang ditunggu
// supaya tiap pool punya jadwal polling sendiri. Sebuah pool baru masuk daftar
// setelah T-5, dan tetap ada sampai result-nya ditemukan atau batas kesabaran
// terlampaui.
export function poolsInPollingPhase(now = new Date(), slugs = Object.keys(TOTO_RESULT_TIMES_WIB)) {
  const { dayKey } = wibParts(now);
  const out = [];
  for (const slug of slugs) {
    for (const time of resultTimesFor(slug)) {
      const since = sinceStartMinutes(time, wibMinutesAt(now.getTime()));
      if (since === -1) continue;
      if (since < 0) continue;
      if (!isDrawDay(slug, now)) continue;
      out.push({ slug, resultTime: time, sinceStart: since, dayKey });
      break;
    }
  }
  return out;
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
    closeLeadMinutes: CLOSE_LEAD_MINUTES,
    scrapeLeadMinutes: SCRAPE_LEAD_MINUTES,
    pollIntervalMinutes: POLL_INTERVAL_MINUTES,
    maxPollMinutes: MAX_POLL_MINUTES,
    holidayGraceMinutes: HOLIDAY_GRACE_MINUTES,
    configuredMarkets: Object.keys(TOTO_RESULT_TIMES_WIB).length,
    explicitWeekdaySkips: TOTO_SKIPPED_WEEKDAYS,
    tracked
  };
}

// Serialisasi status jadwal (tanggal draw terakhir + hari libur) supaya deteksi
// libur per pasar tetap bertahan setelah proses restart/redeploy. Modul ini tetap
// murni (tanpa Redis); persistensi dilakukan oleh pemanggil (feed-worker).
export function serializeDrawState() {
  const entries = {};
  for (const [slug, entry] of state) {
    entries[slug] = {
      lastDrawDate: entry.lastDrawDate ?? null,
      lastDrawDateAt: entry.lastDrawDateAt ?? null,
      missedDraws: Number(entry.missedDraws) || 0,
      seenAt: Number(entry.seenAt) || 0,
      skippedDays: [...entry.skippedDays]
    };
  }
  return { version: 1, entries };
}

export function hydrateDrawState(payload) {
  if (!payload || payload.version !== 1 || typeof payload.entries !== 'object' || payload.entries === null) return 0;
  state.clear();
  let restored = 0;
  for (const [slug, entry] of Object.entries(payload.entries)) {
    if (!slug || !entry) continue;
    if (state.size >= MAX_TRACKED) break;
    state.set(slug, {
      lastDrawDate: entry.lastDrawDate ?? null,
      lastDrawDateAt: Number.isFinite(Number(entry.lastDrawDateAt)) ? Number(entry.lastDrawDateAt) : null,
      missedDraws: Number(entry.missedDraws) || 0,
      seenAt: Number(entry.seenAt) || 0,
      skippedDays: new Set(Array.isArray(entry.skippedDays) ? entry.skippedDays.filter(day => typeof day === 'string') : [])
    });
    restored += 1;
  }
  return restored;
}

export const __totoDrawScheduler = { state, toMinutes, wibParts };

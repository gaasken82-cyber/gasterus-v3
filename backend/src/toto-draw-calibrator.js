// Kalibrasi jam draw per pasar.
//
// Sumber TOTO (VegasNet) hanya mengirim nama, tanggal, dan angka; tidak ada jam.
// Jadwal yang tersimpan di toto-source-map.json adalah perkiraan manual, sehingga
// bisa meleset beberapa jam dari waktu angka benar-benar berubah. Kalau meleset
// terlalu jauh, pasar bisa menutup sebelum result keluar, atau Sebaliknya masih
// terbuka setelah angka sudah terlihat member.
//
// Kalibrasi ini mengukur waktu result muncul dari pergantian tanggal sumber:
// waktu pertama di mana tanggal draw berubah dianggap waktu result terlihat.
// Karena sumber yang dipakai untuk menutup pasar adalah sumber yang sama dengan
// sumber yang menampilkan angka, waktu ini selalu konsisten dengan yang dilihat
// member.
//
// Beban: tidak ada permintaan HTTP tambahan dan tidak ada proses tambahan.
// Penyimpanan dibatasi per slug dan jumlah sampel per slug dipangkas.
const MAX_SLUGS = 96;
const MAX_SAMPLES = 7;
// Pengaman: pasar yang belum terkalibrasi ditutup lebih awal dari jadwal
// manual, sehingga member tidak pernah memasang bet setelah angka terlihat.
const UNCALIBRATED_SAFETY_MINUTES = 60;
const CALIBRATED_BUFFER_MINUTES = 5;

const observations = new Map();

function toMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]) % 24;
  const minutes = Number(match[2]) % 60;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function toClock(minutes) {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function entryFor(slug) {
  let entry = observations.get(slug);
  if (!entry) {
    if (observations.size >= MAX_SLUGS) {
      const oldest = [...observations.entries()].sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0))[0];
      if (oldest) observations.delete(oldest[0]);
    }
    entry = { lastDrawDate: null, samples: [], updatedAt: 0 };
    observations.set(slug, entry);
  }
  return entry;
}

// Dipanggil sekali tiap siklus collector. Sampel baru hanya diambil ketika
// tanggal draw berubah, jadi pasar yang tidak berganti tidak menambah data.
export function recordDrawObservations(decisions = [], { now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) return { recorded: 0 };
  let recorded = 0;
  for (const decision of decisions) {
    const slug = String(decision?.slug || '').trim();
    const drawDate = String(decision?.drawDate || '').trim();
    if (!slug || !drawDate || decision?.status !== 'VERIFIED') continue;
    const entry = entryFor(slug);
    // Pengamatan pertama hanya mencatat tanggal, bukan jam. Kita belum tahu kapan
    // angka itu muncul, jadi mencatat jam sekarang akan membuat semua pasar
    // terlihat seperti baru result keluar dan menutup semuanya bersamaan.
    if (entry.lastDrawDate === null) {
      entry.lastDrawDate = drawDate;
      entry.updatedAt = nowMs;
      continue;
    }
    if (entry.lastDrawDate === drawDate) continue;
    entry.lastDrawDate = drawDate;
    entry.updatedAt = nowMs;
    const wibMinutes = toMinutes(toClockLocal(nowMs));
    entry.samples.push({ drawDate, minutes: wibMinutes, at: nowMs });
    if (entry.samples.length > MAX_SAMPLES) entry.samples.splice(0, entry.samples.length - MAX_SAMPLES);
    recorded += 1;
  }
  return { recorded };
}

function toClockLocal(ms) {
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(11, 16);
}

// Median lebih stabil daripada rata-rata bila satu siklus collector terlambat.
function medianMinutes(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].map(item => item.minutes).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Jadwal hasil kalibrasi, atau null bila pasar belum punya cukup sampel.
export function calibratedSchedule(slug) {
  const entry = observations.get(String(slug || '').trim());
  if (!entry || entry.samples.length < 1) return null;
  const resultMinutes = medianMinutes(entry.samples);
  if (resultMinutes === null) return null;
  const closeMinutes = resultMinutes - CALIBRATED_BUFFER_MINUTES;
  return {
    status: entry.samples.length >= 3 ? 'CALIBRATED' : 'CALIBRATED_LOW_SAMPLE',
    closeTime: toClock(closeMinutes),
    resultTime: toClock(resultMinutes),
    timezone: 'Asia/Jakarta',
    sources: ['Kalibrasi draw sumber'],
    sourceFamilies: ['draw-calibration'],
    samples: entry.samples.length,
    lastDrawDate: entry.lastDrawDate || null
  };
}

// Jadwal cadangan bila pasar belum terkalibrasi: jadwal manual digeser lebih
// awal supaya pasar menutup duluan dan tidak pernah menerima bet telat.
export function conservativeFallbackSchedule(mapping) {
  const mapped = mapping?.schedule;
  if (!mapped || (!mapped.closeTime && !mapped.resultTime)) return null;
  const base = toMinutes(mapped.closeTime) ?? toMinutes(mapped.resultTime);
  if (base === null) return null;
  return {
    status: 'CONFIGURED',
    closeTime: toClock(base - UNCALIBRATED_SAFETY_MINUTES),
    resultTime: toClock(base - UNCALIBRATED_SAFETY_MINUTES),
    timezone: mapped.timezone || 'Asia/Jakarta',
    sources: ['Jadwal Pool (konservatif)'],
    sourceFamilies: ['schedule-config'],
    safetyMinutes: UNCALIBRATED_SAFETY_MINUTES
  };
}

export function drawCalibrationSnapshot() {
  const out = {};
  for (const [slug, entry] of observations) {
    out[slug] = { samples: entry.samples.length, lastDrawDate: entry.lastDrawDate, medianResult: toClock(medianMinutes(entry.samples) ?? 0) };
  }
  return { count: observations.size, maxSlugs: MAX_SLUGS, maxSamples: MAX_SAMPLES, uncalibratedSafetyMinutes: UNCALIBRATED_SAFETY_MINUTES, calibratedBufferMinutes: CALIBRATED_BUFFER_MINUTES, markets: out };
}

export const __drawCalibrator = { observations, toMinutes, toClock, medianMinutes };

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@example.com/db';
process.env.REDIS_URL = 'redis://example.com:6379';
process.env.MEMBER_PROXY_SECRET = 'm'.repeat(48);
process.env.ADMIN_PROXY_SECRET = 'a'.repeat(48);
process.env.OPS_INTERNAL_SECRET = 'o'.repeat(48);
process.env.SESSION_HMAC_KEY = 's'.repeat(48);
process.env.API_KEY_PEPPER = 'p'.repeat(48);
process.env.MFA_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

const {
  recordDrawObservations,
  calibratedSchedule,
  conservativeFallbackSchedule,
  drawCalibrationSnapshot,
  __drawCalibrator
} = await import('../src/toto-draw-calibrator.js');

function wibClock(isoUtc) {
  return new Date(Date.parse(isoUtc) + 7 * 3600 * 1000).toISOString().slice(11, 16);
}

test('sampling hanya terjadi saat tanggal draw berubah', () => {
  __drawCalibrator.observations.clear();
  const decision = { slug: 'sydney-pool', drawDate: '2026-09-26', status: 'VERIFIED' };
  assert.equal(recordDrawObservations([decision], { now: new Date('2026-09-26T12:00:00Z') }).recorded, 1);
  // Siklus berikutnya di hari yang sama tidak menambah sampel.
  assert.equal(recordDrawObservations([decision], { now: new Date('2026-09-26T12:05:00Z') }).recorded, 0);
  // Tanggal baru = hasil baru, satu sampel baru.
  const next = { slug: 'sydney-pool', drawDate: '2026-09-27', status: 'VERIFIED' };
  assert.equal(recordDrawObservations([next], { now: new Date('2026-09-27T12:00:00Z') }).recorded, 1);
  const entry = __drawCalibrator.observations.get('sydney-pool');
  assert.equal(entry.samples.length, 2);
  assert.equal(entry.samples.at(-1).minutes, 19 * 60);
});

test('jadwal terkalibrasi menutup 5 menit sebelum hasil terlihat', () => {
  __drawCalibrator.observations.clear();
  for (let day = 1; day <= 3; day += 1) {
    recordDrawObservations(
      [{ slug: 'hongkong-pool', drawDate: `2026-09-2${day}`, status: 'VERIFIED' }],
      { now: new Date(`2026-09-2${day}T16:05:00Z`) }
    );
  }
  const schedule = calibratedSchedule('hongkong-pool');
  assert.equal(schedule.status, 'CALIBRATED');
  assert.equal(schedule.samples, 3);
  // 23:05 WIB hasil terlihat, tutup 23:00 WIB.
  assert.equal(wibClock(`2026-09-01T00:00:00Z`), '07:00');
  assert.equal(schedule.resultTime, '23:05');
  assert.equal(schedule.closeTime, '23:00');
});

test('pasar tanpa sampel memakai jadwal pool yang digeser lebih awal', () => {
  __drawCalibrator.observations.clear();
  assert.equal(calibratedSchedule('belum-terukur'), null);
  const fallback = conservativeFallbackSchedule({ schedule: { closeTime: '23:10', resultTime: '23:25', timezone: 'Asia/Jakarta' } });
  assert.equal(fallback.status, 'CONFIGURED');
  assert.equal(fallback.safetyMinutes, 60);
  // Jadwal 23:10 digeser 60 menit supaya pasar menutup sebelum perkiraan hasil.
  assert.equal(fallback.closeTime, '22:10');
  assert.equal(fallback.resultTime, '22:10');
});

test('jadwal yang benar-benar tidak ada tetap tidak ditebak', () => {
  assert.equal(conservativeFallbackSchedule(null), null);
  assert.equal(conservativeFallbackSchedule({}), null);
  assert.equal(conservativeFallbackSchedule({ schedule: {} }), null);
});

test('penyimpanan kalibrasi dibatasi agar tidak tumbuh tanpa batas', () => {
  __drawCalibrator.observations.clear();
  const snapshot = drawCalibrationSnapshot();
  assert.equal(snapshot.maxSlugs, 96);
  assert.equal(snapshot.maxSamples, 7);
  for (let day = 1; day <= 12; day += 1) {
    recordDrawObservations([{ slug: 'jepang-pool', drawDate: `2026-09-${String(day).padStart(2, '0')}`, status: 'VERIFIED' }], { now: new Date() });
  }
  assert.ok(__drawCalibrator.observations.get('jepang-pool').samples.length <= 7);
  for (let i = 0; i < 200; i += 1) {
    recordDrawObservations([{ slug: `pool-${i}`, drawDate: '2026-09-26', status: 'VERIFIED' }], { now: new Date() });
  }
  assert.ok(drawCalibrationSnapshot().count <= 96);
});

test('keputusan bukan VERIFIED tidak boleh mengarang sampel jam', () => {
  __drawCalibrator.observations.clear();
  const before = drawCalibrationSnapshot().count;
  recordDrawObservations([
    { slug: 'x', drawDate: '2026-09-26', status: 'CONFLICT' },
    { slug: 'y', drawDate: '2026-09-26', status: 'SINGLE_SOURCE' },
    { slug: 'z', drawDate: '', status: 'VERIFIED' }
  ], { now: new Date() });
  assert.equal(drawCalibrationSnapshot().count, before);
});

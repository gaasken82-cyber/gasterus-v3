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
  TOTO_RESULT_TIMES_WIB,
  TOTO_SKIPPED_WEEKDAYS,
  activeWakeSet,
  isDrawDay,
  wakeWindowFor,
  markDrawObservations,
  schedulerSnapshot,
  __totoDrawScheduler
} = await import('../src/toto-draw-scheduler.js');

const SLUGS = Object.keys(TOTO_RESULT_TIMES_WIB);
const wib = (iso) => new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');

test('jam result operator mengikuti tabel dan semuanya WIB', () => {
  assert.equal(TOTO_RESULT_TIMES_WIB['jepang-pool'][0], '18:45');
  assert.equal(TOTO_RESULT_TIMES_WIB['hongkong-pool'][0], '23:00');
  assert.equal(TOTO_RESULT_TIMES_WIB['pcso-pool'][0], '21:00');
  assert.equal(TOTO_RESULT_TIMES_WIB['sydney-pool'][0], '14:00');
  assert.equal(TOTO_RESULT_TIMES_WIB['taiwan-pool'][0], '20:30');
  assert.equal(TOTO_RESULT_TIMES_WIB['california-pool'][0], '07:00');
  assert.equal(TOTO_RESULT_TIMES_WIB['china-pool'][0], '22:15');
  // Pool dengan lebih dari satu undian per hari tetap sebuah entri.
  assert.equal(TOTO_RESULT_TIMES_WIB['toto-macau-night'].length, 1);
  for (const slug of SLUGS) {
    for (const time of TOTO_RESULT_TIMES_WIB[slug]) {
      assert.match(time, /^([01]\d|2[0-3]):[0-5]\d$/, `${slug} jam tidak valid`);
    }
  }
});

test('collector hanya bangun di dekat jam result, tidak sepanjang hari', () => {
  // 10:00, 12:30, dan 17:00 WIB tidak dekat dengan jam result pool mana pun.
  for (const iso of ['2026-09-27T03:00:00Z', '2026-09-27T05:30:00Z', '2026-09-27T10:00:00Z']) {
    assert.equal(activeWakeSet(new Date(iso), SLUGS).length, 0, `${wib(iso)} seharusnya tidak ada pool aktif`);
  }
  // 15:00 WIB ada tiga pool yang result-nya tepat jam itu.
  const jamTigaWib = activeWakeSet(new Date('2026-09-27T08:05:00Z'), SLUGS);
  assert.ok(jamTigaWib.includes('newjerseymid-pool'));
  assert.ok(jamTigaWib.includes('kentucky-mid-pool'));
  assert.ok(jamTigaWib.includes('virginia-day-pool'));
  // Tepat sebelum result Jepang 18:45 WIB harus ada pool yang bangun.
  const sebelumJepang = new Date('2026-09-27T11:25:00Z');
  assert.ok(activeWakeSet(sebelumJepang, SLUGS).includes('jepang-pool'));
});

test('jendela bangun hanya 45 menit di sekitar jam result', () => {
  const sebelum = wakeWindowFor('jepang-pool', new Date('2026-09-27T11:25:00Z'));
  assert.equal(sebelum.resultTime, 18 * 60 + 45);
  // 2 menit sebelum jendela dimulai sudah di luar.
  assert.equal(wakeWindowFor('jepang-pool', new Date('2026-09-27T11:20:00Z')), null);
  // 3 jam sebelum result juga di luar.
  assert.equal(wakeWindowFor('jepang-pool', new Date('2026-09-27T08:00:00Z')), null);
});

test('hari libur yang sudah diketahui dilewati tanpa membangkitkan pool', () => {
  // 2026-09-29 adalah Selasa, 2026-09-25 adalah Jumat.
  const selasa = new Date('2026-09-29T15:20:00Z');
  assert.equal(isDrawDay('singapore-pool', selasa), false);
  assert.equal(activeWakeSet(selasa, SLUGS).includes('singapore-pool'), false);
  const jumat = new Date('2026-09-25T15:20:00Z');
  assert.equal(isDrawDay('singapore-pool', jumat), false);
  // Hari lain tetap waking seperti biasa.
  assert.equal(isDrawDay('singapore-pool', new Date('2026-09-30T15:20:00Z')), true);
  assert.deepEqual(TOTO_SKIPPED_WEEKDAYS['singapore-pool'], [2, 5]);
});

test('hari libur yang tidak terdaftar tetap terdeteksi dari sumber', () => {
  __totoDrawScheduler.state.clear();
  const sebelumResult = new Date('2026-09-27T11:00:00Z');
  // Angka pools masih 25-09 saat jendela result berjalan.
  markDrawObservations([{ slug: 'jepang-pool', drawDate: '2026-09-25', status: 'VERIFIED' }], { now: sebelumResult });
  // Dua jam lewat jam result, sumber tidak mengeluarkan tanggal baru.
  const sesudahResult = new Date('2026-09-27T13:00:00Z');
  const hasil = markDrawObservations([{ slug: 'jepang-pool', drawDate: '2026-09-25', status: 'VERIFIED' }], { now: sesudahResult });
  assert.deepEqual(hasil.skippedDays, ['jepang-pool']);
  assert.equal(isDrawDay('jepang-pool', sesudahResult), false);
  // Hari berikutnya jadwal berjalan lagi.
  assert.equal(isDrawDay('jepang-pool', new Date('2026-09-28T11:00:00Z')), true);
});

test('angka yang benar-benar berganti membatalkan status libur', () => {
  __totoDrawScheduler.state.clear();
  const sebelum = new Date('2026-09-27T11:00:00Z');
  markDrawObservations([{ slug: 'taiwan-pool', drawDate: '2026-09-25', status: 'VERIFIED' }], { now: sebelum });
  const sesudah = new Date('2026-09-27T14:00:00Z');
  markDrawObservations([{ slug: 'taiwan-pool', drawDate: '2026-09-25', status: 'VERIFIED' }], { now: sesudah });
  const hasil = markDrawObservations([{ slug: 'taiwan-pool', drawDate: '2026-09-26', status: 'VERIFIED' }], { now: sesudah });
  assert.deepEqual(hasil.advanced, ['taiwan-pool']);
  assert.equal(isDrawDay('taiwan-pool', sesudah), true);
});

test('status scheduler tidak menyimpan apa pun di luar daftar pool', () => {
  __totoDrawScheduler.state.clear();
  const snap = schedulerSnapshot(new Date('2026-09-27T12:00:00Z'));
  assert.equal(snap.configuredMarkets, SLUGS.length);
  assert.equal(snap.wakeLeadMinutes, 20);
  assert.equal(snap.wakeTrailMinutes, 25);
  assert.equal(snap.holidayGraceMinutes, 90);
  for (let i = 0; i < 300; i += 1) {
    markDrawObservations([{ slug: `entah-${i}`, drawDate: '2026-09-26', status: 'VERIFIED' }], { now: new Date() });
  }
  assert.ok(__totoDrawScheduler.state.size <= 96, 'state scheduler harus dibatasi');
});

test('pool tanpa jam operator tidak pernah membangunkan collector sendiri', () => {
  assert.equal(TOTO_RESULT_TIMES_WIB['wisconsin-pool'], undefined);
  assert.equal(wakeWindowFor('wisconsin-pool', new Date('2026-09-27T12:00:00Z')), null);
  assert.equal(activeWakeSet(new Date('2026-09-27T12:00:00Z'), SLUGS).includes('wisconsin-pool'), false);
});

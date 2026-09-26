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
  poolsInPollingPhase,
  closeAtFor,
  TOTO_POLL_INTERVAL_MINUTES,
  TOTO_SCRAPE_LEAD_MINUTES,
  TOTO_CLOSE_LEAD_MINUTES,
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
  // Jauh dari jam result pool mana pun: 10:00 dan 17:00 WIB tidak ada yang waking.
  for (const iso of ['2026-09-27T03:00:00Z', '2026-09-27T10:00:00Z']) {
    assert.equal(activeWakeSet(new Date(iso), SLUGS).length, 0, `${wib(iso)} seharusnya tidak ada pool aktif`);
    assert.equal(poolsInPollingPhase(new Date(iso), SLUGS).length, 0, `${wib(iso)} seharusnya tidak ada polling`);
  }
  // 12:30 WIB: Cambodia 11:50 masih dalam batas T+60 sehingga masih menunggu
  // result, dan tidak ada pool lain yang jamnya jauh ikut waking.
  const tengahHari = poolsInPollingPhase(new Date('2026-09-27T05:30:00Z'), SLUGS);
  assert.ok(tengahHari.some(item => item.slug === 'cambodia-pool'), 'Cambodia 11:50 masih menunggu result di 12:30');
  for (const item of tengahHari) {
    assert.ok(item.resultTime >= 11 * 60 && item.resultTime <= 13 * 60, `${item.slug} di luar rentang jam result midday`);
  }
  // 15:05 WIB ada tiga pool yang result-nya tepat jam 15:00 dan masih dalam
  // masa polling (T+5).
  const jamTigaWib = poolsInPollingPhase(new Date('2026-09-27T08:05:00Z'), SLUGS);
  assert.ok(jamTigaWib.some(item => item.slug === 'newjerseymid-pool'));
  assert.ok(jamTigaWib.some(item => item.slug === 'kentucky-mid-pool'));
  assert.ok(jamTigaWib.some(item => item.slug === 'virginia-day-pool'));
  // Tepat sebelum result Jepang 18:45 WIB (18:40 = T-5) harus poll.
  const sebelumJepang = new Date('2026-09-27T11:40:00Z');
  assert.ok(activeWakeSet(sebelumJepang, SLUGS).includes('jepang-pool'));
  assert.ok(poolsInPollingPhase(sebelumJepang, SLUGS).some(item => item.slug === 'jepang-pool'));
});

test('polling hanya mulai pada T-5, ditutup pada T-20, dan berlangsung tiap 3 menit', () => {
  const resultTime = 16 * 60; // 16:00 WIB
  // 15:40 WIB = T-20: betting ditutup, tapi belum ada polling.
  const tMinus20 = new Date('2026-09-27T08:40:00Z');
  // 15:41 WIB: masih tidak ada scraping.
  const tMinus19 = new Date('2026-09-27T08:41:00Z');
  // 15:54 WIB = T-6: belum.
  const tMinus6 = new Date('2026-09-27T08:54:00Z');
  // 15:55 WIB = T-5: polling pertama.
  const tMinus5 = new Date('2026-09-27T08:55:00Z');
  assert.equal(poolsInPollingPhase(tMinus20).some(item => item.slug === 'toto-macau-sore'), false, 'T-20 tidak boleh poll pool 16:00');
  assert.equal(poolsInPollingPhase(tMinus19).some(item => item.slug === 'toto-macau-sore'), false, 'T-19 tidak boleh poll');
  assert.equal(poolsInPollingPhase(tMinus6).some(item => item.slug === 'toto-macau-sore'), false, 'T-6 tidak boleh poll');
  const mulai = poolsInPollingPhase(tMinus5);
  assert.ok(mulai.some(item => item.slug === 'toto-macau-sore' && item.resultTime === resultTime), 'T-5 harus poll');

  // Betting ditutup 20 menit sebelum result.
  const close = closeAtFor(resultTime, { now: new Date('2026-09-27T08:00:00Z') });
  assert.equal(close.closeClock, '15:40');
  assert.equal(close.resultClock, '16:00');
});

test('interval antar poll tepat 3 menit', () => {
  assert.equal(TOTO_POLL_INTERVAL_MINUTES, 3);
  assert.equal(TOTO_SCRAPE_LEAD_MINUTES, 5);
  assert.equal(TOTO_CLOSE_LEAD_MINUTES, 20);
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

test('status scheduler memakai T-20/T-5/3 menit dan tidak menyimpan apa pun di luar daftar pool', () => {
  __totoDrawScheduler.state.clear();
  const snap = schedulerSnapshot(new Date('2026-09-27T12:00:00Z'));
  assert.equal(snap.configuredMarkets, SLUGS.length);
  assert.equal(snap.closeLeadMinutes, 20);
  assert.equal(snap.scrapeLeadMinutes, 5);
  assert.equal(snap.pollIntervalMinutes, 3);
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

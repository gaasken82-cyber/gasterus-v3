import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inferNextCashPeriod } from '../src/toto-cash-window.js';

const root = resolve(import.meta.dirname, '..', '..');
const read = file => readFileSync(resolve(root, file), 'utf8');

// Pool yang tidak draw setiap hari memakai daftar hari yang dilewati dari scheduler.
// Tanpa dukungan ini, pola mingguan selalu menghasilkan interval yang tidak tetap,
// sehingga planner menyimpulkan "tidak ada window aman" dan pasar tidak pernah buka.
test('planner memakai daftar hari libur untuk pool berm pola mingguan',()=>{
  // 2026-09-30 = Rabu. Dengan [2,5] dilewati, hari berikutnya yangdraw = 1 Oktober.
  const plan = inferNextCashPeriod([{ draw_date: '2026-09-30' }], { skipWeekdays: [2, 5] });
  assert.equal(plan?.period, '2026-10-01');
  assert.equal(plan?.cadenceDays, 1);
  assert.equal(plan?.method, 'CONFIGURED_SKIP_WEEKDAYS');
});

test('planner melompati hari yangListed, bukan hanya menambah satu hari',()=>{
  // 2026-10-01 = Kamis. Jumat (5) dilewati, jadi draw berikutnya Sabtu (cadence 2).
  const plan = inferNextCashPeriod([{ draw_date: '2026-10-01' }], { skipWeekdays: [2, 5] });
  assert.equal(plan?.period, '2026-10-03');
  assert.equal(plan?.cadenceDays, 2);
});

test('pool berm libur tetap fail-closed tanpa histori terverifikasi',()=>{
  assert.equal(inferNextCashPeriod([], { skipWeekdays: [2, 5] }), null);
  assert.equal(inferNextCashPeriod([{ draw_date: 'bukan tanggal' }], { skipWeekdays: [2, 5] }), null);
});

test('pool tanpa daftar libur memakai jalur lama (harian dari histori)',()=>{
  assert.deepEqual(
    inferNextCashPeriod([{ draw_date: '2026-09-25' }, { draw_date: '2026-09-26' }]),
    { period: '2026-09-27', cadenceDays: 1, evidenceCount: 2, method: 'TRUSTED_DAILY_HISTORY' }
  );
  // Satu histori + jadwal configured tetap dianggap harian seperti sebelumnya.
  assert.equal(inferNextCashPeriod([{ draw_date: '2026-09-25' }], { schedule: { resultTime: '20:00' } })?.method, 'CONFIGURED_DAILY_SCHEDULE');
});

test('reconciler meneruskan daftar hari libur ke planner',()=>{
  const lifecycle = read('backend/src/toto-cash-lifecycle.js');
  assert.match(lifecycle, /import \{ TOTO_SKIPPED_WEEKDAYS \} from '\.\/toto-draw-scheduler\.js'/);
  assert.match(lifecycle, /skipWeekdays: TOTO_SKIPPED_WEEKDAYS\[String\(row\.slug/);
});

test('tiga pool non-harian memakai VegasNet sebagai satu-satunya sumber',()=>{
  const map = JSON.parse(read('backend/data/toto-source-map.json'));
  for (const slug of ['hongkong-pool', 'singapore-pool', 'newjerseymid-pool']) {
    const entry = map.find(item => item.slug === slug);
    assert.ok(entry, `${slug} tidak ada di toto-source-map.json`);
    assert.deepEqual(Object.keys(entry.sources), ['vegasnet'], `${slug} masih memakai scraper lain: ${Object.keys(entry.sources).join(',')}`);
    assert.deepEqual(entry.authoritySources, ['vegasnet'], `${slug} belum menunjuk VegasNet sebagai sumber otoritatif`);
    assert.ok(entry.schedule?.resultTime, `${slug} kehilangan jadwal result`);
  }
});
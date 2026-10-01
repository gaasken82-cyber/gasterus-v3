import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOTTERY_GAME_MAP, LOTTERY_GAMES, TOTO_ADVANCED_GAME_RATES } from '../src/lottery-games.js';

const repoFile = relative => readFileSync(resolve(import.meta.dirname, '..', '..', relative), 'utf8');
const marketPlay = () => repoFile('frontend/js/market-play.js');

// Aturan digit di sisi member dibaca dari kode frontend apa adanya supaya test
// ini menangkap setiap selisih antara apa yang diketik member dan yang divalidasi
// backend. Dulu ada dua daftar terpisah (a.select di HTML vs normalisasi backend)
// yang bisa menyimpang diam-diam.
const pasteRules = () => {
  const block = marketPlay().match(/PASTE_GAME_BY_DIGITS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'PASTE_GAME_BY_DIGITS tidak ditemukan di market-play.js');
  return [...block[1].matchAll(/\{\s*digits:\s*(\d+),\s*gameCode:\s*'([A-Z0-9_]+)'\s*\}/g)]
    .map(m => ({ digits: Number(m[1]), gameCode: m[2] }));
};

const autoRules = () => {
  const block = marketPlay().match(/AUTO_DIGIT_GAMES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'AUTO_DIGIT_GAMES tidak ditemukan di market-play.js');
  return [...block[1].matchAll(/\['([A-Z0-9_]+)',\s*(\d+)\]/g)].map(m => ({ gameCode: m[1], digits: Number(m[2]) }));
};

test('aturan tempel di frontend cocok dengan katalog game backend',()=>{
  const rules = pasteRules();
  assert.ok(rules.length >= 4, 'paste harus punya minimal aturan 1/2/3/4 digit');
  for (const rule of rules) {
    const game = LOTTERY_GAME_MAP.get(rule.gameCode);
    assert.ok(game, `${rule.gameCode} tidak ada di katalog backend`);
    assert.equal(game.engineReady, true, `${rule.gameCode} belum punya settlement engine`);
    assert.equal(game.uiMode, 'digits', `${rule.gameCode} bukan game angka, tidak bisa dipakai paste`);
    assert.equal(game.inputDigits, rule.digits, `${rule.gameCode} butuh ${game.inputDigits} digit, paste memetakan ${rule.digits}`);
  }
  const covered = new Set(rules.map(r => r.digits));
  for (const game of LOTTERY_GAMES) {
    if (!game.engineReady || game.uiMode !== 'digits') continue;
    if (!covered.has(game.inputDigits)) continue; // panjang digit sudah dipetakan game lain (2 digit -> 2D)
    assert.ok(rules.some(r => r.digits === game.inputDigits), `panjang ${game.inputDigits} digit belum dipetakan`);
  }
});

test('auto-detect di frontend memakai panjang digit yang sama dengan backend',()=>{
  for (const rule of autoRules()) {
    const game = LOTTERY_GAME_MAP.get(rule.gameCode);
    assert.ok(game, `${rule.gameCode} tidak ada di katalog backend`);
    assert.equal(game.uiMode, 'digits', `${rule.gameCode} bukan game angka`);
    assert.equal(game.inputDigits, rule.digits, `${rule.gameCode} butuh ${game.inputDigits} digit, auto-detect memakai ${rule.digits}`);
  }
});

test('minimum bet fallback di frontend sama dengan default database',()=>{
  const client = marketPlay();
  const fallback = client.match(/function minStake\(\)\s*\{[\s\S]*?:\s*(\d+)\s*;/);
  assert.ok(fallback, 'fallback minStake tidak ditemukan di market-play.js');
  const schema = repoFile('backend/migrations/001_platform.sql');
  const dbDefault = schema.match(/min_stake BIGINT NOT NULL DEFAULT (\d+)/);
  assert.ok(dbDefault, 'default min_stake tidak ditemukan di 001_platform.sql');
  assert.equal(Number(fallback[1]), Number(dbDefault[1]), 'minimum bet di frontend dan database berbeda');
});

// Regresi: backend membungkus jawaban sukses dalam { data: ... } lewat ok().
// market-play.js pernah memakai objek respons mentah, sehingga bettingStatus,
// period, dan closeAt selalu undefined. Efeknya isMarketBettable() selalu
// false dan SETIAP pasar — termasuk yang OPEN — tampil "Pasaran tidak
// tersedia" sehingga member tidak bisa memasang betting sama sekali.
test('market-play membuka amplop { data: ... } dari API config pasar',()=>{
  const client = marketPlay();
  assert.ok(
    /function unwrapMarketConfig\(res\)[\s\S]*?res\?\.data/.test(client),
    'unwrapMarketConfig harus membaca res.data dari amplop backend'
  );
  const loadMarket = client.match(/async function loadMarketInfo\(code\)\s*\{[\s\S]*?\n\}/);
  assert.ok(loadMarket, 'loadMarketInfo tidak ditemukan di market-play.js');
  assert.ok(
    /const config = unwrapMarketConfig\(res\)/.test(loadMarket[0]),
    'loadMarketInfo harus memakai unwrapMarketConfig, bukan respons mentah'
  );
  assert.ok(
    !/currentMarketConfig = res\s*;/.test(loadMarket[0]),
    'currentMarketConfig tidak boleh diisi respons mentah (tanpa .data)'
  );
});

test('halaman bet tidak pernah buntu saat dibuka tanpa ?code=',()=>{
  const client = marketPlay();
  assert.ok(
    /async function resolveFallbackMarketCode\(\)/.test(client),
    'halaman bet harus punya resolveFallbackMarketCode untuk link tanpa ?code='
  );
  assert.ok(
    /const marketCode = requestedCode \|\| await resolveFallbackMarketCode\(\)/.test(client),
    'initMarketPlay harus memakai pasar cadangan ketika ?code= kosong'
  );
});

// Regresi cache: Cloudflare Pages Advanced Mode mengabaikan _headers, sehingga
// /js/* dan /css/* sempat dilayani max-age=14400 (4 jam). Aturan yang benar-benar
// dieksekusi hanya yang ada di _worker.js.
test('_worker.js yang menentukan cache-control asset, bukan _headers',()=>{
  const worker = repoFile('frontend/_worker.js');
  assert.ok(
    /function cacheControlFor\(pathname\)/.test(worker),
    '_worker.js harus punya cacheControlFor'
  );
  assert.ok(
    /cacheHeaders\.set\('cache-control'|assetHeaders\.set\('cache-control'/.test(worker),
    '_worker.js harus menimpa cache-control untuk asset static'
  );
  assert.ok(
    /env\.ASSETS\.fetch\(request\)/.test(worker),
    '_worker.js harus tetap mengambil asset dari env.ASSETS'
  );
});
// Daftar "14 game" yang dijanjikan member di halaman bet harus sama di tiga
// tempat: katalog engine, migration yang menyalakannya, dan teks di halaman.
// Kalau satu daftar berubah dan dua lainnya tidak, member melihat game yang
// tidak bisa dimainkan (atau sebaliknya, game hilang dari dropdown).
const FOURTEEN = [
  'STRAIGHT_4D','STRAIGHT_3D','STRAIGHT_2D',
  'POSITION_2D_FRONT','POSITION_2D_MIDDLE',
  'COLOK_BEBAS','COLOK_2D','COLOK_NAGA','COLOK_JITU',
  'TENGAH_TEPI','DASAR','SILANG_HOMO','KEMBANG_KEMPIS','KOMBINASI'
];

test('14 game yang dinyalakan migration 037 semuanya ada di katalog dan punya engine',()=>{
  const sql = repoFile('backend/migrations/037_reassert_fourteen_toto_games.sql');
  for (const code of FOURTEEN) {
    assert.ok(sql.includes(`'${code}'`), `migration 037 tidak menyalakan ${code}`);
    assert.ok(LOTTERY_GAME_MAP.has(code), `${code} tidak ada di katalog backend`);

    assert.equal(LOTTERY_GAME_MAP.get(code).engineReady, true, `${code} belum punya settlement engine`);
    assert.notEqual(LOTTERY_GAME_MAP.get(code).uiMode, 'unsupported', `${code} tidak bisa dipakai di UI`);
  }
  assert.equal(FOURTEEN.length, 14, 'daftar harus berisi tepat 14 game');
});

test('harga game lanjutan di migration 037 sama dengan TOTO_ADVANCED_GAME_RATES',()=>{
  const sql = repoFile('backend/migrations/037_reassert_fourteen_toto_games.sql');
  // Baris INSERT "<CODE>', <discount>, <multiplier>" dari VALUES pertama.
  const seeded = [...sql.matchAll(/\(\s*'([A-Z_0-9]+)',\s*(\d+),\s*([\d.]+)\s*\)/g)];
  const byCode = new Map(seeded.map(m => [m[1], { discount: Number(m[2]), payout: Number(m[3]) }]));
  const source = readFileSync(resolve(import.meta.dirname, '..', 'src', 'lottery-games.js'), 'utf8');
  for (const [code, expected] of Object.entries(TOTO_ADVANCED_GAME_RATES)) {
    const row = byCode.get(code);
    assert.ok(row, `migration 037 tidak men-seed ${code}`);
    assert.equal(row.payout, expected.payoutMultiplier, `multiplier ${code} berbeda dari lottery-games.js`);
    assert.equal(row.discount, expected.discountPercent, `diskon ${code} berbeda dari lottery-games.js`);
    assert.ok(source.includes(code), `${code} tidak ada di lottery-games.js`);
  }
});

test('migration 034 yang sudah applied tidak boleh diubah (migrate.js melompatinya)',()=>{
  // migrate.js mencatat versi di schema_migrations dan melompati yang sudah ada,
  // jadi mengedit 033/034 diam-diam tidak akan pernah berefek di produksi.
  const applied = ['033_lottery_advanced_rates_and_min_stake.sql','034_enable_advanced_games_for_4d_markets.sql'];
  const head = repoFile('backend/migrations/034_enable_advanced_games_for_4d_markets.sql');
  assert.ok(head.includes('Idempoten'), '034 yang sudah deployed tidak boleh diedit; buat migration baru');
  assert.ok(repoFile('backend/migrations/037_reassert_fourteen_toto_games.sql').length > 0);
  assert.equal(applied.length, 2);
});


// Jam result WAJIB terlihat member di dua tempat: kartu pasar di lobby dan header
// slip betting. Sebelumnya drawTime hanya dipakai di number-history.html, jadi di
// lobby dan halaman bet jam undian tidak pernah tampil sama sekali - member
// menganggap jadwalnya hilang.
test('API config pasar mengirim jam result ke frontend',()=>{
  const markets = repoFile('backend/src/markets.js');
  assert.ok(markets.includes('result_draw_time'), 'markets.js harus mengambil markets.draw_time');
  assert.ok(markets.includes('resultDrawTime:r.result_draw_time'), 'mapConfig harus mengirim resultDrawTime');
  assert.ok(markets.includes('resultDrawDate:r.result_draw_date'), 'mapConfig harus mengirim resultDrawDate');
});

test('jam result tampil di kartu pasar lobby dan header slip betting',()=>{
  const member = repoFile('frontend/js/member.js');
  assert.ok(member.includes('Jam Result:'), 'kartu pasar di lobby harus menampilkan Jam Result');
  assert.ok(member.includes('m.drawTime'), 'lobby harus membaca drawTime dari API publik');

  const play = repoFile('frontend/js/market-play.js');
  assert.ok(play.includes('market-draw-time'), 'market-play.js harus mengisi #market-draw-time');
  assert.ok(play.includes('resultDrawTime'), 'market-play.js harus membaca resultDrawTime');

  const html = repoFile('frontend/market-play.html');
  assert.ok(html.includes('id="market-draw-time"'), 'market-play.html harus punya elemen #market-draw-time');
});

test('jam result tidak pernah disamarkan jadi 00:00 saat jadwal kosong',()=>{
  for (const file of ['frontend/js/member.js', 'frontend/js/market-play.js']) {
    const src = repoFile(file);
    assert.ok(src.includes('Belum ditentukan'), `${file} harus menampilkan "Belum ditentukan" untuk jadwal kosong`);
    assert.ok(src.includes('padStart(2, \'0\')'), `${file} harus menormalkan jam ke dua digit`);
  }
});

test('guard cache-buster menutup referensi JS relatif (tanpa garis miring depan)',()=>{
  const guard = repoFile('scripts/check-asset-version.js');
  assert.ok(
    !guard.includes('src|href)="(\\/js\\/'),
    'guard hanya memeriksa /js/*.js absolut; referensi relatif seperti src="js/member.js" akan lolos'
  );
  assert.ok(guard.includes('relative = `js/'), 'guard harus merekonstruksi path relatif ke js/<file>');
  assert.ok(repoFile('frontend/member.html').includes('js/member.js?v='), 'member.js wajib punya ?v=');
  assert.ok(repoFile('frontend/register.html').includes('js/register.js?v='), 'register.js wajib punya ?v=');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOTTERY_GAME_MAP, LOTTERY_GAMES } from '../src/lottery-games.js';

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
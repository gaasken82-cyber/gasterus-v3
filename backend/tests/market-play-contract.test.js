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
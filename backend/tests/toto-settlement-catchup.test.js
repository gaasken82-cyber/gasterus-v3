import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/toto-auto-settlement.js'),
  'utf8'
);

test('settlements hanya boleh dibuat lewat satu pintu agar pengaman tidak bocor', () => {
  const inserts = [...SRC.matchAll(/INSERT INTO settlement_runs/g)];
  assert.equal(inserts.length, 1, 'hanya boleh ada satu INSERT settlement_runs');
  assert.match(SRC, /async function queueSettlementRun/);
  // Kedua jalur wajib memakai pintu yang sama.
  assert.equal((SRC.match(/queueSettlementRun\(/g) || []).length, 2, 'definisikan + 1 pemanggilan');
});

test('catch-up mencari periode yang betting_period-nya sudah maju', () => {
  const catchup = SRC.slice(SRC.indexOf('const CATCHUP_SQL'));
  // Dianchor ke bet_orders, bukan market_betting_configs.betting_period.
  assert.match(catchup, /FROM bet_orders o/);
  assert.match(catchup, /o\.period/);
  assert.match(catchup, /o\.status IN\('ACCEPTED','SETTLEMENT_PENDING'\)/);
});

test('catch-up tetap dijaga: pasar open, tanpa run ganda, sumber otoritatif', () => {
  const catchup = SRC.slice(SRC.indexOf('const CATCHUP_SQL'));
  assert.match(catchup, /m\.status='open'/, 'pasar yang di-retire tidak dibayar otomatis');
  assert.match(catchup, /NOT EXISTS \(SELECT 1 FROM settlement_runs r/);
  assert.match(catchup, /h2\.source_name LIKE 'OFFICIAL:%' OR h2\.source_name LIKE 'CONSENSUS:%'/);
  // Validasi sumber + format hasil tetap berlaku untuk kedua jalur.
  assert.match(SRC, /const AUTHORITATIVE_SOURCE=\/\^\(OFFICIAL\|CONSENSUS\):\//);
  assert.match(SRC, /const SETTLEABLE_RESULT=\/\^\\d\{4,6\}\$\//);
});

test('kandidat digabung lalu didedupe per market+periode agar tidak dobel queue', () => {
  assert.match(SRC, /const merged = new Map\(\)/);
  assert.match(SRC, /\$\{row\.market_id\}@\$\{row\.period\}/);
  assert.match(SRC, /if \(!merged\.has\(key\)\) merged\.set\(key, row\)/);
});

test('settlement tetap terkunci baris dan Serializable supaya dua siklus tidak balapan', () => {
  assert.match(SRC, /FOR UPDATE/);
  assert.match(SRC, /isolation: 'SERIALIZABLE'/);
  // Cek ulang di dalam transaksi tetap ada (bukan hanya di SQL kandidat).
  assert.match(SRC, /SELECT 1 FROM settlement_runs WHERE market_id=\$1 AND period=\$2 AND mode='SETTLE'/);
});
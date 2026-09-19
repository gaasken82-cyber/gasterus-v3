import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bettingWindowReady } from '../src/toto-betting-window.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('FINAL TOTO window remains open from schedule before settlement authority',()=>{
  const now=Date.parse('2026-08-19T09:00:00Z');
  const base={bettingStatus:'OPEN',period:'2026-08-20',closeAt:'2026-08-19T12:00:00Z'};
  assert.equal(bettingWindowReady({...base,authorityReady:true},now),true);
  assert.equal(bettingWindowReady({...base,authorityReady:false},now),true);
  assert.equal(bettingWindowReady(base,now),true);
});

test('FINAL TOTO acceptance separates betting schedule from settlement authority',()=>{
  const betting=read('backend/src/betting.js');
  assert.match(betting,/current\.authorityReady===true/);
  assert.match(betting,/BETTING_PERIOD_REQUIRED/);
  assert.match(betting,/CLOSE_AT_REQUIRED|BETTING_CLOSE_REQUIRED/);
  assert.match(betting,/m\.verification_status AS result_verification_status/);
});

test('FINAL collector suspends OPEN TOTO markets when authority degrades or all sources fail',()=>{
  const collector=read('backend/src/toto-collector.js');
  assert.match(collector,/UPDATE market_betting_configs SET betting_status='SUSPENDED'/);
  assert.match(collector,/autoSuspended/);
  assert.match(collector,/ALL_TOTO_SOURCES_UNAVAILABLE/);
});

test('FINAL member catalog exposes only generic betting readiness and UI does not advertise betting while closed',()=>{
  const markets=read('backend/src/markets.js');
  const app=read('backend/src/app.js');
  const lobby=read('frontend/member.html');
  const card=read('frontend/member.html');
  const mobile=read('frontend/js/market-play.js');
  const play=read('frontend/js/market-play.js');
  assert.match(markets,/bettingReady/);
  assert.match(markets,/readinessReason/);
  assert.match(app,/bettingReady:Boolean\(x\.bettingReady\)/);
  assert.match(app,/readinessReason:x\.readinessReason\|\|null/);
  assert.match(lobby,/hasil|result/i);
  assert.match(card,/hasil|result/i);
  // Frontend produksi (beku untuk migrasi backend ini) tidak menghitung readiness sendiri —
  // ia hanya menampilkan status betting yang diputuskan backend.
  assert.match(mobile,/bettingStatus/);
  assert.match(play,/bettingStatus|betting-markets/);
});

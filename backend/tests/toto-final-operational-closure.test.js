import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bettingWindowReady } from '../src/toto-betting-window.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('FINAL TOTO window remains open from schedule before settlement authority',()=>{
  const now=Date.parse('2026-08-19T09:00:00Z');
  const base={bettingStatus:'OPEN',period:'2026-08-20',closeAt:'2026-08-19T12:00:00Z'};
  assert.equal(bettingWindowReady({...base,authorityReady:true},now),true);
  assert.equal(bettingWindowReady({...base,authorityReady:false},now),true);
  assert.equal(bettingWindowReady(base,now),true);
});

test('FINAL TOTO acceptance separates betting schedule from settlement authority',()=>{
  const betting=read('services/core/src/betting.js');
  assert.match(betting,/current\.authorityReady===true/);
  assert.match(betting,/BETTING_PERIOD_REQUIRED/);
  assert.match(betting,/CLOSE_AT_REQUIRED|BETTING_CLOSE_REQUIRED/);
  assert.match(betting,/m\.verification_status AS result_verification_status/);
});

test('FINAL collector suspends OPEN TOTO markets when authority degrades or all sources fail',()=>{
  const collector=read('services/core/src/toto-collector.js');
  assert.match(collector,/UPDATE market_betting_configs SET betting_status='SUSPENDED'/);
  assert.match(collector,/autoSuspended/);
  assert.match(collector,/ALL_TOTO_SOURCES_UNAVAILABLE/);
});

test('FINAL member catalog exposes only generic betting readiness and UI does not advertise betting while closed',()=>{
  const markets=read('services/core/src/markets.js');
  const app=read('services/core/src/app.js');
  const lobby=read('services/member/public/member-r690.js');
  const card=read('services/member/public/market-card-ui.js');
  const mobile=read('services/member/public/mobile-platform-r6923-v20.js');
  const play=read('services/member/public/market-play.js');
  assert.match(markets,/bettingReady/);
  assert.match(app,/bettingReady:Boolean\(x\.bettingReady\)/);
  assert.match(lobby,/LIHAT HASIL/);
  assert.match(card,/LIHAT HASIL/);
  assert.match(mobile,/b\.dataset\.bettingReady==='1'/);
  assert.match(play,/AUTHORITY BELUM SIAP/);
  assert.match(play,/Periode betting atau waktu tutup belum siap/);
});

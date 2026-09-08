import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inferNextCashPeriod, cashCloseAtForPeriod, buildCashWindowPlan } from '../src/toto-cash-window.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('HF17 restores cash TOTO and removes HF16 virtual runtime',()=>{
  const betting=read('src/betting.js');
  const worker=read('src/worker.js');
  const migration=read('migrations/019_remove_hf16_virtual_runtime.sql');
  assert.match(betting,/SYSTEM_ACCOUNTS\.BET_HOLD/);
  assert.match(betting,/memberDelta:-normalized\.total/);
  assert.match(worker,/SYSTEM_ACCOUNTS\.PRIZE_POOL/);
  assert.match(worker,/memberDelta: payout/);
  assert.match(worker,/wallet_mode='CASH'/);
  assert.match(migration,/betting_period LIKE 'VIRTUAL-%'/);
  assert.match(migration,/wallet_mode='VIRTUAL'/);
  assert.match(migration,/auto_cash_window/);
  assert.equal(existsSync(new URL('../src/toto-virtual-lifecycle.js',import.meta.url)),false);
});

test('HF17 infers only a future daily period after two consecutive trusted draw dates',()=>{
  const plan=inferNextCashPeriod([{draw_date:'2026-08-19'},{draw_date:'2026-08-18'}]);
  assert.equal(plan.period,'2026-08-20');
  assert.equal(plan.cadenceDays,1);
  assert.equal(inferNextCashPeriod([{draw_date:'2026-08-19'}]),null);
});

test('HF17 requires three observations for a non-daily fixed cadence',()=>{
  assert.equal(inferNextCashPeriod([{draw_date:'2026-08-19'},{draw_date:'2026-08-17'}]),null);
  const plan=inferNextCashPeriod([{draw_date:'2026-08-19'},{draw_date:'2026-08-17'},{draw_date:'2026-08-15'}]);
  assert.equal(plan.period,'2026-08-21');
  assert.equal(plan.cadenceDays,2);
});

test('HF17 uses WIB source schedule with a conservative betting cutoff',()=>{
  const close=cashCloseAtForPeriod('2026-08-20',{closeTime:'23:00',timezone:'Asia/Jakarta'},Date.parse('2026-08-20T00:00:00Z'));
  assert.equal(close.toISOString(),'2026-08-20T15:58:00.000Z');
  const resultOnly=cashCloseAtForPeriod('2026-08-20',{resultTime:'23:30'},Date.parse('2026-08-20T00:00:00Z'));
  assert.equal(resultOnly.toISOString(),'2026-08-20T16:18:00.000Z');
});

test('HF17 refuses to skip a missed inferred draw or reopen a resulted period',()=>{
  const history=[{period:'2026-08-19',draw_date:'2026-08-19'},{period:'2026-08-18',draw_date:'2026-08-18'}];
  const decision={status:'VERIFIED',drawDate:'2026-08-19',schedule:{closeTime:'10:00',status:'OBSERVED',sources:['Board A']}};
  assert.equal(buildCashWindowPlan({history,decision,resultPeriod:'2026-08-19',nowMs:Date.parse('2026-08-20T10:00:00Z')}),null);
  const future=buildCashWindowPlan({history,decision:{...decision,schedule:{closeTime:'23:00',status:'OBSERVED',sources:['Board A']}},resultPeriod:'2026-08-19',nowMs:Date.parse('2026-08-20T00:00:00Z')});
  assert.equal(future.period,'2026-08-20');
  assert.ok(future.closeAt.getTime()>Date.parse('2026-08-20T00:00:00Z'));
});

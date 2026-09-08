import test from 'node:test';
import assert from 'node:assert/strict';
import { bettingWindowReady } from '../src/toto-betting-window.js';

test('HF14 betting window requires explicit betting period and future close time',()=>{
  const now=Date.parse('2026-08-19T07:00:00Z');
  assert.equal(bettingWindowReady({bettingStatus:'OPEN',period:'2026-08-20',closeAt:'2026-08-19T12:00:00Z'},now),true);
  assert.equal(bettingWindowReady({bettingStatus:'OPEN',period:null,closeAt:'2026-08-19T12:00:00Z'},now),false);
  assert.equal(bettingWindowReady({bettingStatus:'OPEN',period:'2026-08-20',closeAt:null},now),false);
  assert.equal(bettingWindowReady({bettingStatus:'OPEN',period:'2026-08-20',closeAt:'2026-08-19T06:59:59Z'},now),false);
  assert.equal(bettingWindowReady({bettingStatus:'SUSPENDED',period:'2026-08-20',closeAt:'2026-08-19T12:00:00Z'},now),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('HF15 draft submission and exposure use betting_period, never result period',()=>{
  const src=read('backend/src/betting.js');
  const draft=src.slice(src.indexOf('export async function submitDraft'),src.indexOf('export async function cancelBet'));
  assert.match(draft,/assertOpen\(config,row\.period\)/);
  assert.doesNotMatch(draft,/m\.period AS current_period/);
  assert.match(src,/drawPeriod=clean\(period\|\|active\.period,80\)/);
  assert.match(src,/period=clean\(input\.period\|\|active\.period,80\)/);
  assert.doesNotMatch(src,/period\|\|market\.period/);
});

test('HF15 member market page separates betting period from result period',()=>{
  const src=read('frontend/js/market-play.js');
  // Frontend produksi mengonsumsi kontrak katalog member (betting period, bukan result period):
  assert.match(src,/bettingStatus/);
  assert.match(src,/betting-markets/);
  assert.match(src,/period: currentMarketConfig\?\.period/);
  assert.doesNotMatch(src,/period: market\.period/);
  // Kontrak readiness (bettingReady + alasan blokir) dimiliki backend dan diverifikasi di sini,
  // sehingga UI tidak pernah mengiklankan pasaran yang belum siap.
  const markets=read('backend/src/markets.js');
  const app=read('backend/src/app.js');
  assert.match(markets,/bettingReady/);
  assert.match(markets,/readinessReason/);
  assert.match(app,/bettingReady:Boolean\(x\.bettingReady\)/);
  assert.match(app,/readinessReason:x\.readinessReason\|\|null/);
});

test('HF15 external result ingestion cannot publish VERIFIED authority',()=>{
  const src=read('backend/src/app.js');
  const start=src.indexOf("add('POST',/^\\/api\\/v1\\/results$/");
  assert.ok(start>=0);
  const route=src.slice(start,src.indexOf('\n\nfunction respondEnvelope',start));
  assert.match(route,/INGESTED:/);
  assert.match(route,/verificationStatus:'SINGLE_SOURCE'/);
  assert.match(route,/published:false/);
  assert.doesNotMatch(route,/UPDATE markets SET result=/);
  assert.doesNotMatch(route,/verificationStatus\|\|'VERIFIED'/);
});

test('HF15 settlement consumes immutable authority and never rewrites result provenance',()=>{
  const worker=read('backend/src/worker.js');
  assert.doesNotMatch(worker,/verification_status='MANUAL_RESOLUTION'/);
  assert.doesNotMatch(worker,/sourceName:\s*'APPROVED_RESULT'/);
  const owner=read('backend/src/owner.js');
  assert.match(owner,/source_name LIKE 'OFFICIAL:%'/);
  assert.match(owner,/source_name LIKE 'CONSENSUS:%'/);
  assert.match(owner,/SETTLEMENT_AUTHORITY_CHANGED/);
});

test('HF15 migration quarantines legacy unbacked trusted results',()=>{
  const migration=read('backend/migrations/017_toto_authority_quarantine.sql');
  assert.match(migration,/verification_status IN \('VERIFIED','MANUAL_RESOLUTION'\)/);
  assert.match(migration,/h\.period=m\.period/);
  assert.match(migration,/h\.result=m\.result/);
  assert.match(migration,/source_name LIKE 'OFFICIAL:%'/);
  assert.match(migration,/source_name LIKE 'CONSENSUS:%'/);
  assert.match(migration,/SET verification_status='SINGLE_SOURCE'/);
});

test('HF15 member number history is authority allowlisted and runtime logs betting readiness',()=>{
  const member=read('backend/src/member.js');
  assert.match(member,/MEMBER_HISTORY_TRUST_FILTER = `\(source_name LIKE 'OFFICIAL:%' OR source_name LIKE 'CONSENSUS:%' OR source_name='APPROVED_RESULT'\)`/);
  assert.doesNotMatch(member,/source_name <> 'ASEAN777 AUTO COLLECTOR'/);
  const collector=read('backend/src/toto-collector.js');
  assert.match(collector,/bettingReadinessSummary/);
  assert.match(collector,/invalid_open_markets/);
  assert.match(collector,/bettingReadiness: state\.bettingReadiness/);
});

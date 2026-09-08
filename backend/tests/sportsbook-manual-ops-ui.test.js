import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('R6.9.0.12 accepted ticket records manual FT settlement requirement in durable metadata', () => {
  const betting = read('../src/sportsbook-betting.js');
  assert.match(betting, /settlementModes:\s*\[\.\.\.new Set\(/);
  assert.match(betting, /manualSettlementRequired:\s*freshLegs\.some\(leg => leg\.event\?\._settlementMode === 'MANUAL_FT_FALLBACK'\)/);
  assert.match(betting, /metadata:\s*row\.metadata && typeof row\.metadata === 'object' \? row\.metadata : \{\}/);
});

test('R6.9.0.12 admin Sportsbook Desk exposes a guarded Manual FT settlement queue', () => {
  const admin = read('../../../services/admin/public/sportsbook-control.html');
  assert.match(admin, /Manual FT Settlement Queue/);
  assert.match(admin, /manualSettlementRequired===true/);
  assert.match(admin, /ticket\.status==='OPEN'/);
  assert.match(admin, /\(leg\.marketPeriod\|\|'FT'\)==='FT'&&!leg\.liveAtBet/);
  assert.match(admin, /\/admin-api\/owner\/sportsbook\/manual-settlement-queue\?openLimit=500&recentLimit=100/);
  assert.match(admin, /\/admin-api\/owner\/sportsbook\/bets\/\$\{encodeURIComponent\(ticket\.id\)\}\/settle/);
  assert.match(admin, /sourceName:'MANUAL_OPS'/);
  assert.match(admin, /manual-ops-ui:\$\{ticket\.id\}:r\$\{Number\(ticket\.settlementRevision\|\|0\)\+1\}/);
  assert.match(admin, /Hasil settlement harus mencakup seluruh leg/);
  assert.match(admin, /Result\/provenance/);
});

test('R6.9.0.12 manual settlement UI exposes ledger-safe rollback correction', () => {
  const admin = read('../../../services/admin/public/sportsbook-control.html');
  const app = read('../src/app.js');
  const betting = read('../src/sportsbook-betting.js');
  assert.match(admin, /\/rollback`,postOptions\(/);
  assert.match(admin, /manual-ops-ui:rollback:/);
  assert.ok(app.includes('rollbackSportsbookSettlement(s,params.id')) ;
  assert.match(betting, /action:\s*'ROLLBACK'/);
  assert.match(betting, /isolation:\s*'SERIALIZABLE'/);
});

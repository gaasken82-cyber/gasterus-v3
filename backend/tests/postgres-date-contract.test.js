import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTotoProduction } from '../src/toto-production-acceptance.js';
import { configurePostgresTypeParsers, parsePostgresDate, POSTGRES_DATE_OID } from '../src/postgres-types.js';

test('PostgreSQL DATE parser preserves the date-only wire contract', () => {
  let registeredOid = null;
  let registeredParser = null;
  configurePostgresTypeParsers({
    setTypeParser(oid, parser) {
      registeredOid = oid;
      registeredParser = parser;
    }
  });

  assert.equal(POSTGRES_DATE_OID, 1082);
  assert.equal(registeredOid, 1082);
  assert.equal(registeredParser, parsePostgresDate);
  assert.equal(registeredParser('2026-08-17'), '2026-08-17');
});

test('TOTO V12 accepts a trusted result after PostgreSQL DATE parsing', () => {
  const proof = {
    rows: [{
      slug: 'california-pool',
      status: 'VERIFIED',
      result: '2833',
      drawDate: '2026-08-17',
      authority: 'OFFICIAL',
      sources: ['California State Lottery']
    }]
  };
  const memberItems = [{
    slug: 'california-pool',
    result: '2833',
    drawDate: parsePostgresDate('2026-08-17')
  }];

  const result = compareTotoProduction({
    proof,
    memberItems,
    memberTotal: 1,
    expectedVisibleMarkets: 1
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures, 0);
  assert.equal(result.trustedPublished, 1);
  assert.equal(result.rows[0].reason, 'MATCH');
});

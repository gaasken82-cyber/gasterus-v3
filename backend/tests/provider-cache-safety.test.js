import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:password@example.com/db',
  REDIS_URL: 'redis://example.com:6379',
  MEMBER_PROXY_SECRET: 'm'.repeat(48),
  ADMIN_PROXY_SECRET: 'a'.repeat(48),
  OPS_INTERNAL_SECRET: 'o'.repeat(48),
  SESSION_HMAC_KEY: 's'.repeat(48),
  API_KEY_PEPPER: 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  API_SPORTS_ENABLED: 'true',
  API_SPORTS_KEY: 'test-provider-key',
  FOOTBALLDATA_IO_ENABLED: 'true',
  FOOTBALLDATA_IO_KEY: 'test-footballdata-key',
  PUBLIC_MARKET_DERIVED_MARKETS_ENABLED: 'false',
  RAPIDAPI_CASINO_ENABLED: 'true',
  RAPIDAPI_CASINO_KEY: 'test-rapidapi-key'
});

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const { setBoundedCacheEntry } = await import('../src/bounded-cache.js');
const { fetchApiSports, __sportsbookProviders } = await import('../src/sportsbook-providers.js');
const { fetchFootballDataIo, __footballDataIo } = await import('../src/sportsbook-footballdataio.js');
const { casinoPassthrough, __casinoRapidApi } = await import('../src/casino-rapidapi.js');

test('bounded cache rejects oversized entries and evicts oldest entries to fit its total budget', () => {
  const cache = new Map(), secondCache = new Map();
  const limits = { maxEntryBytes: 20, maxTotalBytes: 24 };
  setBoundedCacheEntry(cache, 'oldest', { data: 'a' }, { fetchedAt: 1, ...limits });
  setBoundedCacheEntry(secondCache, 'newer', { data: 'b' }, { fetchedAt: 2, ...limits });
  setBoundedCacheEntry(cache, 'latest', { data: 'c' }, { fetchedAt: 3, ...limits });

  assert.equal(cache.has('oldest'), false);
  assert.equal(secondCache.has('newer'), true);
  assert.equal(cache.has('latest'), true);
  assert.ok([...cache.values(), ...secondCache.values()].reduce((sum, entry) => sum + entry.sizeBytes, 0) <= limits.maxTotalBytes);
  assert.throws(
    () => setBoundedCacheEntry(cache, 'oversized', { data: 'x'.repeat(30) }, limits),
    /cache entry limit/
  );
});

test('API-Sports does not cache responses above the configured per-entry limit', async () => {
  __sportsbookProviders.providerRequestCache.clear();
  const oversized = JSON.stringify({ response: [], padding: 'x'.repeat(3_145_728) });
  globalThis.fetch = async input => ({
    ok: true,
    status: 200,
    async text() {
      return String(input).includes('/fixtures?live=all') ? oversized : '{"response":[]}';
    }
  });

  try {
    const result = await fetchApiSports();
    assert.equal(result.transportOk, false);
    assert.ok(result.errors.some(error => error.includes('cache entry size limit')));
    const entries = [...__sportsbookProviders.providerRequestCache.values()].filter(entry => entry.value !== undefined);
    assert.ok(entries.every(entry => entry.sizeBytes <= 3_145_728));
    assert.ok(entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) <= 41_943_040);
  } finally {
    __sportsbookProviders.providerRequestCache.clear();
    globalThis.fetch = originalFetch;
  }
});

test('FootballData.io exponentially backs off failed polls, serves cached events, and resets after success', async () => {
  __footballDataIo.resetRuntimeState();
  let now = 1_800_000_000_000;
  Date.now = () => now;
  let shouldFail = true;
  let calls = 0;
  const match = {
    match_id: 'backoff-match',
    match_date: '2026-10-11T12:00:00Z',
    status: 'scheduled',
    home_team: { team_name: 'Home FC' },
    away_team: { team_name: 'Away FC' },
    league: { name: 'Test League' },
    odds: { home_win: 1.9, draw: 3.4, away_win: 4.2 }
  };
  globalThis.fetch = async () => {
    calls += 1;
    if (shouldFail) throw new Error('footballdata.io returned HTTP 401');
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ data: { matches: [match] } }); }
    };
  };

  try {
    const firstFailure = await fetchFootballDataIo();
    assert.equal(firstFailure.events.length, 0);
    assert.equal(__footballDataIo.backoffState().retryAt - now, 30_000);
    const callsAfterFirstFailure = calls;
    await fetchFootballDataIo();
    assert.equal(calls, callsAfterFirstFailure, 'must skip HTTP while the 30-second backoff is active');

    now += 30_000;
    await fetchFootballDataIo();
    assert.equal(__footballDataIo.backoffState().retryAt - now, 60_000);

    for (const expectedBackoffMs of [120_000, 240_000, 480_000, 600_000, 600_000]) {
      now += __footballDataIo.backoffState().retryAt - now;
      await fetchFootballDataIo();
      assert.equal(__footballDataIo.backoffState().retryAt - now, expectedBackoffMs);
    }

    shouldFail = false;
    now += 600_000;
    const success = await fetchFootballDataIo();
    assert.equal(success.events.length, 1);
    assert.equal(__footballDataIo.backoffState().consecutiveFailures, 0);
    assert.equal(__footballDataIo.backoffState().retryAt, 0);
    assert.ok(__footballDataIo.cache.get('feed').sizeBytes <= 3_145_728);

    now += 301_000;
    shouldFail = true;
    const cachedFallback = await fetchFootballDataIo();
    assert.equal(cachedFallback.cachedFallback, true);
    assert.equal(cachedFallback.events.length, 1);
    const callsAfterFailureWithCache = calls;
    const backoffFallback = await fetchFootballDataIo();
    assert.equal(backoffFallback.cachedFallback, true);
    assert.equal(backoffFallback.events.length, 1);
    assert.equal(calls, callsAfterFailureWithCache, 'must serve the existing cache without another request during backoff');
  } finally {
    __footballDataIo.resetRuntimeState();
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('RapidAPI casino expires failure entries and keeps the failure cache at 100 entries maximum', async () => {
  __casinoRapidApi.failureCache.clear();
  let now = 1_800_000_000_000;
  Date.now = () => now;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    async text() { return '{"message":"Unauthorized"}'; }
  });

  try {
    for (let index = 0; index < 105; index += 1) {
      await assert.rejects(
        casinoPassthrough('/casino/getgames', { provider: `PROVIDER${index}` })
      );
    }
    assert.equal(__casinoRapidApi.failureCache.size, 100);

    now += 60_001;
    await assert.rejects(
      casinoPassthrough('/casino/getgames', { provider: 'AFTER-EXPIRY' })
    );
    assert.equal(__casinoRapidApi.failureCache.size, 1);
  } finally {
    __casinoRapidApi.failureCache.clear();
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  __footballDataIo.resetRuntimeState();
  __sportsbookProviders.providerRequestCache.clear();
  __casinoRapidApi.failureCache.clear();
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
});

import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@example.com/db',
  REDIS_URL: 'redis://example.com:6379',
  MEMBER_PROXY_SECRET: 'm'.repeat(48),
  ADMIN_PROXY_SECRET: 'a'.repeat(48),
  OPS_INTERNAL_SECRET: 'o'.repeat(48),
  SESSION_HMAC_KEY: 's'.repeat(48),
  API_KEY_PEPPER: 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  API_SPORTS_ENABLED: 'true',
  API_SPORTS_KEY: 'test-provider-key',
  API_SPORTS_ODDS_PAGES: '2',
  API_SPORTS_LIVE_REFRESH_SECONDS: '30',
  API_SPORTS_PREMATCH_REFRESH_SECONDS: '300',
  THE_ODDS_API_ENABLED: 'false'
});

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async url => {
  calls.push(String(url));
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify({ response: [] }); }
  };
};

const { fetchApiSports, __sportsbookProviders } = await import('../src/sportsbook-providers.js');

test('API-Sports endpoint cache prevents the 8-second aggregator loop from consuming provider quota every cycle', async () => {
  __sportsbookProviders.providerRequestCache.clear();
  calls.length = 0;
  await fetchApiSports();
  const first = calls.length;
  assert.equal(first, 5, 'first refresh should call live fixtures, upcoming fixtures, live odds and two pre-match odds pages');
  await fetchApiSports();
  assert.equal(calls.length, first, 'immediate second refresh must reuse endpoint cache and make zero new provider HTTP calls');
  assert.ok(calls.some(url => url.includes('/fixtures?live=all')));
  assert.ok(calls.some(url => url.includes('/odds/live')));
  assert.equal(calls.filter(url => url.includes('/odds?')).length, 2);
});

test.after(() => { globalThis.fetch = originalFetch; });

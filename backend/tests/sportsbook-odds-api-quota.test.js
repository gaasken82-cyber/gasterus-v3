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
  THE_ODDS_API_ENABLED: 'true',
  THE_ODDS_API_KEY: 'test-odds-api-key',
  THE_ODDS_API_BASE_URL: 'https://api.the-odds-api.test/v4',
  THE_ODDS_API_SPORT_KEYS: 'soccer_test_league',
  THE_ODDS_API_REGIONS: 'eu',
  THE_ODDS_API_MARKETS: 'h2h',
  THE_ODDS_API_REFRESH_SECONDS: '60',
  THE_ODDS_API_EVENT_MARKETS_ENABLED: 'false',
  THE_ODDS_API_EVENT_MAX_EVENTS_PER_SPORT: '0',
  THE_ODDS_API_EVENT_MAX_TOTAL_EVENTS: '0'
});

const calls = [];
// 'ok' membalas payload odds asli; '429' meniru kuota harian habis.
let mode = 'ok';
const kickoff = new Date(Date.now() + 3600000).toISOString();
const oddsPayload = [{
  id: 'evt-quota-1',
  sport_key: 'soccer_test_league',
  sport_title: 'Test League',
  commence_time: kickoff,
  home_team: 'Home FC',
  away_team: 'Away FC',
  completed: false,
  bookmakers: [{
    key: 'testbook',
    title: 'Test Book',
    last_update: new Date().toISOString(),
    markets: [{
      key: 'h2h',
      last_update: new Date().toISOString(),
      outcomes: [
        { name: 'Home FC', price: 1.9 },
        { name: 'Draw', price: 3.4 },
        { name: 'Away FC', price: 4.2 }
      ]
    }]
  }]
}];

globalThis.fetch = async url => {
  calls.push(String(url));
  if (mode === '429') {
    return { ok: false, status: 429, async text() { return 'daily quota exceeded'; } };
  }
  return { ok: true, status: 200, async text() { return JSON.stringify(oddsPayload); } };
};

const { fetchTheOddsApi, __sportsbookProviders } = await import('../src/sportsbook-providers.js');
const guard = __sportsbookProviders.theOddsApiQuotaGuard;

function resetGuardState() {
  __sportsbookProviders.providerRequestCache.clear();
  guard.reset();
  calls.length = 0;
  mode = 'ok';
}

function expireProviderCache() {
  for (const entry of __sportsbookProviders.providerRequestCache.values()) {
    entry.fetchedAt -= 120_000;
    entry.expiresAt -= 120_000;
  }
}

test('The Odds API endpoint cache keeps the refresh loop free within its TTL', async () => {
  resetGuardState();
  const first = await fetchTheOddsApi();
  assert.equal(calls.length, 1);
  assert.equal(first.events.length, 1);

  const second = await fetchTheOddsApi();
  assert.equal(calls.length, 1, 'siklus berikutnya dalam TTL tidak boleh menyentuh provider');
  assert.equal(second.events.length, 1);
});

test('HTTP 429 serves the last real payload so the feed keeps flowing', async () => {
  resetGuardState();
  await fetchTheOddsApi();
  assert.equal(calls.length, 1);

  expireProviderCache();
  mode = '429';
  calls.length = 0;
  const degraded = await fetchTheOddsApi();

  assert.equal(calls.length, 1, 'satu percobaan refresh tetap dibolehkan');
  assert.equal(degraded.enabled, true);
  assert.equal(degraded.events.length, 1, 'fixture terakhir tetap tersaji, feed tidak mati');
  assert.equal(degraded.events[0].home.name, 'Home FC');
  assert.ok(guard.floorUntil > Date.now(), 'guard floor harus aktif setelah 429');
});

test('quota floor stops further provider calls while the daily budget is exhausted', async () => {
  resetGuardState();
  await fetchTheOddsApi();

  expireProviderCache();
  mode = '429';
  await fetchTheOddsApi();
  assert.ok(guard.floorUntil > Date.now());

  // Kuota dipulihkan menurut provider, tapi floor masih aktif: worker tidak
  // boleh memukul provider sama sekali sebelum backoff selesai.
  mode = 'ok';
  expireProviderCache();
  calls.length = 0;
  const served = await fetchTheOddsApi();

  assert.equal(calls.length, 0, 'floor menahan seluruh HTTP selama backoff');
  assert.equal(served.events.length, 1, 'payload stale tetap disajikan');
});

test('429 without any cached payload returns a valid empty result instead of crashing', async () => {
  resetGuardState();
  mode = '429';

  const empty = await fetchTheOddsApi();
  assert.equal(empty.enabled, true);
  assert.deepEqual(empty.events, []);
  assert.ok(guard.floorUntil > Date.now());

  const second = await fetchTheOddsApi();
  assert.deepEqual(second.events, []);
  assert.equal(calls.length, 1, 'cycle kedua tidak membanjiri provider saat kuota habis');
});

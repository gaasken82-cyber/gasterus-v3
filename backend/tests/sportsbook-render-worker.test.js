import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost:5432/gasterus-test',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  MEMBER_PROXY_SECRET: process.env.MEMBER_PROXY_SECRET || 'm'.repeat(48),
  ADMIN_PROXY_SECRET: process.env.ADMIN_PROXY_SECRET || 'a'.repeat(48),
  OPS_INTERNAL_SECRET: process.env.OPS_INTERNAL_SECRET || 'o'.repeat(48),
  SESSION_HMAC_KEY: process.env.SESSION_HMAC_KEY || 's'.repeat(48),
  API_KEY_PEPPER: process.env.API_KEY_PEPPER || 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: process.env.MFA_ENCRYPTION_KEY_BASE64 || Buffer.alloc(32, 1).toString('base64')
});

const [{ buildSportsbookRenderSnapshot }, { teamKey }, { validateSportsbookSnapshot }] = await Promise.all([
  import('../src/sportsbook-render-worker-core.js'),
  import('../src/sportsbook-providers.js'),
  import('../src/sportsbook-ingestion.js')
]);
const { createSportsbookIngestRequest } = await import('../src/sportsbook-ingest-client.js');
const SECRET = 'render-worker-test-secret-'.padEnd(48, 'x');
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

function event(provider, {
  id,
  league = 'Regional League',
  home = `Home ${id}`,
  away = `Away ${id}`,
  startTime = new Date(NOW + 3600000).toISOString(),
  live = false
} = {}) {
  return {
    id,
    sport: 'Football',
    league,
    country: 'England',
    startTime,
    status: live ? 'LIVE' : 'SCHEDULED',
    live,
    home: { name: home, score: null, logo: null },
    away: { name: away, score: null, logo: null },
    markets: [{
      id: `market-${id}`,
      type: '1X2',
      period: 'FT',
      source: provider,
      suspended: false,
      selections: [{
        key: `selection-${id}`,
        label: 'Home',
        odds: 2.1,
        suspended: false,
        source: provider,
        updatedAt: null
      }]
    }],
    _refs: { [provider]: `provider-${id}` },
    _sources: [provider]
  };
}

test('Render worker calls both configured adapters and deduplicates shared fixtures with priority', async () => {
  const kickOff = new Date(NOW - 15 * 60000).toISOString();
  const sportmonks = {
    provider: 'sportmonks',
    enabled: true,
    events: [
      event('sportmonks', { id: 'shared-sm', league: 'Premier League', home: 'Home FC', away: 'Away FC', startTime: kickOff, live: true }),
      event('sportmonks', { id: 'top-sm', league: 'Premier League', startTime: new Date(NOW + 2 * 3600000).toISOString() }),
      event('sportmonks', { id: 'minor-sm', startTime: new Date(NOW + 30 * 60000).toISOString() })
    ]
  };
  const apiSports = {
    provider: 'api-sports',
    enabled: true,
    events: [
      event('api-sports', { id: 'shared-api', league: 'Premier League', home: 'Home', away: 'Away', startTime: new Date(NOW - 14 * 60000).toISOString(), live: true }),
      event('api-sports', { id: 'api-other', league: 'Regional League', startTime: new Date(NOW + 4 * 3600000).toISOString() })
    ]
  };
  let sportmonksCalled = false;
  let apiSportsCalled = false;
  let sportmonksOptions;
  const snapshot = await buildSportsbookRenderSnapshot({
    fetchSportmonks: async options => {
      sportmonksCalled = true;
      sportmonksOptions = options;
      return sportmonks;
    },
    fetchApiSports: async () => {
      apiSportsCalled = true;
      return apiSports;
    },
    maxEvents: 3,
    maxPages: 72,
    priorityLeagues: 'Premier League,La Liga',
    teamKey,
    now: NOW
  });

  assert.equal(sportmonksCalled, true);
  assert.equal(apiSportsCalled, true);
  assert.deepEqual(sportmonksOptions, { maxEvents: 3, maxPages: 72 });
  assert.equal(snapshot.eventCount, 3);
  assert.deepEqual(snapshot.providerResults.map(result => result.provider), ['sportmonks', 'api-sports']);
  const selected = snapshot.providerResults.flatMap(result =>
    result.events.map(item => ({ provider: result.provider, event: item }))
  );
  assert.equal(selected.length, 3);
  assert.equal(selected.filter(item => ['shared-sm', 'shared-api'].includes(item.event.id)).length, 1, 'same teams and near-identical kick-off are deduplicated');
  assert.ok(selected.some(item => item.provider === 'api-sports' && item.event.id === 'shared-api'), 'API-Sports wins the duplicate live fixture');
  assert.ok(selected.some(item => item.event.id === 'top-sm'), 'configured top leagues outrank minor leagues');
  assert.ok(selected.some(item => item.event.id === 'minor-sm'), 'remaining capacity is filled after deduplication');

  assert.deepEqual(validateSportsbookSnapshot(snapshot, { now: NOW }).providers, ['sportmonks', 'api-sports']);
});

test('Render snapshot signs and validates as a bounded ingestion payload', async () => {
  const apiEvent = event('api-sports', { id: 'api-only' });
  const snapshot = await buildSportsbookRenderSnapshot({
    fetchSportmonks: async () => ({ provider: 'sportmonks', enabled: false, events: [] }),
    fetchApiSports: async () => ({ provider: 'api-sports', enabled: true, events: [apiEvent] }),
    maxEvents: 300,
    maxPages: 120,
    priorityLeagues: 'Premier League',
    teamKey,
    now: NOW
  });
  const signed = createSportsbookIngestRequest(snapshot, SECRET, { timestamp: Math.floor(NOW / 1000) });
  const request = Readable.from([signed.body]);
  request.headers = signed.headers;
  let stored;
  const { acceptSportsbookSnapshot } = await import('../src/sportsbook-ingestion.js');
  const result = await acceptSportsbookSnapshot(request, {
    secret: SECRET,
    now: NOW,
    storeSnapshot: async value => { stored = value; }
  });

  assert.equal(result.eventCount, 1);
  assert.deepEqual(result.providerResults, ['api-sports']);
  assert.equal(stored.providerResults[0].events[0].id, 'api-only');
  assert.ok(signed.body.length < 6_291_456);
});

test('Render worker fails closed if neither provider returns priced fixtures', async () => {
  await assert.rejects(
    buildSportsbookRenderSnapshot({
      fetchSportmonks: async () => ({ provider: 'sportmonks', enabled: false, events: [] }),
      fetchApiSports: async () => ({ provider: 'api-sports', enabled: false, events: [] }),
      teamKey
    }),
    /No enabled sportsbook provider returned normalized, priced fixtures/
  );
});

test('Render worker republishes cached snapshots before their ingestion freshness window expires', async () => {
  const workerSource = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../src/sportsbook-render-worker.js', import.meta.url), 'utf8')
  );
  assert.match(workerSource, /Math\.min\(config\.sportmonksRefreshSeconds,\s*Math\.floor\(config\.sportsbookIngestMaxAgeSeconds\s*\/\s*2\)\)/);
});

test('Render snapshot freshness starts after provider fetches finish', async () => {
  const startedAt = Date.now();
  const snapshot = await buildSportsbookRenderSnapshot({
    fetchSportmonks: async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return { provider: 'sportmonks', enabled: true, events: [event('sportmonks', { id: 'fresh-after-fetch' })] };
    },
    teamKey
  });

  assert.ok(Date.parse(snapshot.generatedAt) >= startedAt + 20);
});

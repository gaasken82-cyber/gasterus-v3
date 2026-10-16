import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Proves the "professional volume" slate (500 events, each with the FULL derived
// market set) stays inside the Railway 512 MB RSS ceiling through the real feed
// pipeline: buildDerivedMarkets -> member projection -> paginate. This guards the
// OpenFootball horizon expansion + derived-markets-in-production change from OOM.
const runtimeEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://example.com/db',
  REDIS_URL: 'redis://example.com:6379',
  MEMBER_PROXY_SECRET: 'm'.repeat(48),
  ADMIN_PROXY_SECRET: 'a'.repeat(48),
  OPS_INTERNAL_SECRET: 'o'.repeat(48),
  SESSION_HMAC_KEY: 's'.repeat(48),
  API_KEY_PEPPER: 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  // Ensure the two production gates are ON for this test regardless of ambient env.
  PUBLIC_MARKET_DERIVED_MARKETS_ENABLED: 'true',
  PUBLIC_MARKET_OPENFOOTBALL_ENABLED: 'true'
};

function runHighVolumeProbe(eventCount) {
  const script = `
    const { __publicMarket } = await import('./src/sportsbook-public-market.js');
    const { __sportsbookFeed } = await import('./src/sportsbook-feed.js');
    const buildDerivedMarkets = __publicMarket.buildDerivedMarkets;
    const now = Date.now();
    // Build a realistic full derived-market board for ${eventCount} upcoming fixtures.
    const events = [];
    for (let i = 0; i < ${eventCount}; i++) {
      const anchor = { oneXtwo: { home: 2.1 + (i % 7) * 0.05, draw: 3.3, away: 3.4 }, total25: { over: 1.9, under: 1.95 }, handicap: null };
      const markets = buildDerivedMarkets('evt-' + i, anchor, new Date(now).toISOString());
      events.push({
        id: 'evt-' + i, sport: 'Football', country: 'England', league: 'League ' + (i % 13),
        startTime: new Date(now + (i + 1) * 3600000).toISOString(),
        status: 'SCHEDULED', live: false,
        home: { name: 'Home ' + i, score: null },
        away: { name: 'Away ' + i, score: null },
        markets
      });
    }
    const marketCount = events.reduce((n, e) => n + e.markets.length, 0);
    // The snapshot/SSE path does NOT ship the full market tree. It projects each
    // event through memberPublicEvent (summary markets: 1X2/HANDICAP/TOTALS only);
    // the full tree loads lazily per event via /events/:id. Measure the REAL page
    // payload the client actually receives.
    const projected = events.map(e => __sportsbookFeed.memberPublicEvent(e));
    const page = __sportsbookFeed.paginateEvents(projected, { offset: 0, limit: 30 });
    const output = {
      eventCount: events.length,
      marketCount,
      marketsPerRawEvent: Math.round(marketCount / events.length),
      marketsPerProjectedEvent: Math.round(projected.reduce((n, e) => n + (e.markets || []).length, 0) / projected.length),
      pageSize: page.events.length,
      pageTotal: page.pagination.total,
      pageHasMore: page.pagination.hasMore,
      pageBytes: Buffer.byteLength(JSON.stringify(page.events)),
      fullBoardBytes: Buffer.byteLength(JSON.stringify(events)),
      rssBytes: process.memoryUsage().rss
    };
    console.log(JSON.stringify(output));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: runtimeEnv
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

test('full derived-market board for 500 events stays under the 512 MB RSS ceiling', t => {
  const out = runHighVolumeProbe(500);
  t.diagnostic(`500 events -> ${out.marketsPerRawEvent} markets/event (raw), snapshot ships ${out.marketsPerProjectedEvent}/event, full board ${Math.round(out.fullBoardBytes / 1048576)} MB, RSS ${Math.round(out.rssBytes / 1048576)} MB`);
  assert.ok(out.marketsPerRawEvent >= 30, `expected a rich board (>=30 markets/event), got ${out.marketsPerRawEvent}`);
  // Snapshot projection must be lean (summary markets only) — this is what keeps
  // the wire payload small despite the rich underlying board.
  assert.ok(out.marketsPerProjectedEvent <= out.marketsPerRawEvent / 2, 'snapshot should ship roughly half or fewer markets than the raw board');
  assert.ok(out.rssBytes < 512 * 1024 * 1024, `RSS was ${Math.round(out.rssBytes / 1048576)} MB`);
});

test('snapshot page is bounded (page size 30) even with a 500-event slate', t => {
  const out = runHighVolumeProbe(500);
  t.diagnostic(`page=${out.pageSize}/${out.pageTotal} hasMore=${out.pageHasMore} pageBytes=${out.pageBytes}`);
  assert.equal(out.pageSize, 30, 'page must be capped at EVENTS_PAGE_SIZE');
  assert.equal(out.pageTotal, 500);
  assert.equal(out.pageHasMore, true);
  // A single summary-projected page must stay well under ~1 MB so SSE/REST frames
  // never balloon even as the underlying slate grows.
  assert.ok(out.pageBytes < 1_000_000, `page payload was ${out.pageBytes} bytes`);
});

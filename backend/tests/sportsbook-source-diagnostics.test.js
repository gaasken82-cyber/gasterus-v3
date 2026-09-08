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
  SPORTS_SOURCE_BASE_URL: 'https://www.terushebatunggul.com/',
  SPORTS_SOURCE_ALLOWED_DOMAIN: 'terushebatunggul.com',
  SPORTS_SOURCE_CANDIDATE_URLS: 'https://www.terushebatunggul.com/id-ID/euro/sepak-bola;https://www.terushebatunggul.com/id-ID/euro/taruhan-live/sepak-bola',
  SPORTS_SOURCE_MAIN_PATH: 'id-ID/euro/sepak-bola',
  SPORTS_SOURCE_LIVE_PATH: 'id-ID/euro/taruhan-live/sepak-bola',
  SPORTS_SOURCE_ALLOW_PUBLIC_EDGE_REDIRECT: 'false',
  SPORTS_SOURCE_MAX_REDIRECTS: '3',
  SPORTS_SOURCE_REFRESH_SECONDS: '8',
  SPORTS_FEED_REFRESH_SECONDS: '8',
  // This test targets the browser-rendered escalation path (catalog-only -> browser),
  // so the browser gateway must be enabled for it. The executable is pointed at a path
  // that can never exist so the renderer fails fast (deterministic, hermetic) instead
  // of launching a real Chromium inside unit tests. It does NOT change the production
  // default (SPORTS_SOURCE_BROWSER_ENABLED stays false there).
  SPORTS_SOURCE_BROWSER_ENABLED: 'true',
  SPORTS_SOURCE_BROWSER_EXECUTABLE: '/definitely-not-present-chromium',
  API_SPORTS_ENABLED: 'false',
  THE_ODDS_API_ENABLED: 'false',
  THESPORTSDB_ENABLED: 'false'
});

const catalogHtml = `<!doctype html><html><head><script src="/assets/app.js"></script></head><body>
  <nav id="menu-sports"><span class="NumEvt">814</span><span>All Events</span><span>Live Betting</span></nav>
  <div id="app"></div>
</body></html>`;

globalThis.fetch = async () => new Response(catalogHtml, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' }
});

const { refreshSportsbookSource, sportsbookSourceStatus } = await import('../src/sportsbook-source.js');

test('catalog-only HTTP upstream escalates to browser-rendered diagnosis and preserves direct catalog diagnostics', async () => {
  await assert.rejects(
    refreshSportsbookSource(),
    error => {
      assert.equal(error?.code, 'SPORTS_SOURCE_BROWSER_PARSE_EMPTY');
      assert.match(error?.message || '', /browser-rendered DOM/i);
      assert.ok(Array.isArray(error?.upstreams));
      assert.ok(error.upstreams.length >= 1);
      assert.ok(error.upstreams.every(item => item.healthy === false));
      assert.ok(error.upstreams.some(item => item.diagnostics?.catalogOnly === true || item.diagnostics?.directHttp?.catalogOnly === true));
      assert.ok(error.upstreams.every(item => (item.diagnostics?.oddsMarkers ?? 0) === 0));
      return true;
    }
  );

  const status = sportsbookSourceStatus();
  assert.equal(status.lastError?.code, 'SPORTS_SOURCE_BROWSER_PARSE_EMPTY');
  assert.ok(Array.isArray(status.lastError?.upstreams));
  assert.ok(status.lastError.upstreams.some(item => item.diagnostics?.catalogOnly === true || item.diagnostics?.directHttp?.catalogOnly === true));
  assert.ok(status.upstreams.some(item => item.error?.code === 'SPORTS_SOURCE_BROWSER_PARSE_EMPTY'));
});

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
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 9).toString('base64'),
  SPORTS_SOURCE_BASE_URL: 'https://www.kerjahebatberhasil.com/',
  SPORTS_SOURCE_ALLOWED_DOMAIN: 'kerjahebatberhasil.com',
  SPORTS_SOURCE_TRUSTED_REDIRECT_DOMAINS: 'hiduprukunsejahtera.com,terushebatunggul.com,pastimenangpasti.com',
  SPORTS_SOURCE_MAIN_PATH: 'id-ID/sports',
  SPORTS_SOURCE_LIVE_PATH: '',
  SPORTS_SOURCE_BROWSER_ENABLED: 'true',
  SPORTS_SOURCE_IGNORE_LEGACY_SECRETS: 'true',
  SPORTS_SOURCE_SCHEDULE_DISCOVERY_ENABLED: 'false',
  API_SPORTS_ENABLED: 'false',
  THE_ODDS_API_ENABLED: 'false',
  THESPORTSDB_ENABLED: 'false'
});

const html = `
<table><tr data-event-id="browser-fallback-1" data-sport="Football" data-league="Fallback League">
  <td class="home-team">Fallback Home</td><td class="away-team">Fallback Away</td>
  <td class="start-time">2026-08-18T12:00:00Z</td>
  <td>
    <button class="odd" data-market="1X2" data-selection="Home" data-odd="1.91">1.91</button>
    <button class="odd" data-market="1X2" data-selection="Draw" data-odd="3.25">3.25</button>
    <button class="odd" data-market="1X2" data-selection="Away" data-odd="4.10">4.10</button>
  </td>
</tr></table>`;

const sourceModule = new URL('../src/sportsbook-source.js', import.meta.url).href;

test('transport failure falls back to approved browser renderer and still parses priced markets', async () => {
  const { __sportsbookSourceInternals } = await import(`${sourceModule}?browser-transport-fallback`);
  let directCalls = 0;
  let browserCalls = 0;
  const result = await __sportsbookSourceInternals.collectCandidate(
    new URL('https://www.kerjahebatberhasil.com/id-ID/sports'),
    '',
    {
      fetchDirect: async () => {
        directCalls += 1;
        const error = new Error('fetch failed');
        error.code = 'UND_ERR_CONNECT_TIMEOUT';
        throw error;
      },
      renderBrowser: async url => {
        browserCalls += 1;
        assert.equal(url, 'https://www.kerjahebatberhasil.com/id-ID/sports');
        return {
          html,
          cookie: '',
          url,
          redirects: 0,
          contentType: 'text/html; renderer=chromium-cdp',
          renderer: 'CHROMIUM_CDP',
          rendererCacheHit: false,
          renderMs: 25
        };
      }
    }
  );
  assert.equal(directCalls, 1);
  assert.equal(browserCalls, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].markets[0].type, '1X2');
  assert.equal(result.events[0].markets[0].selections.length, 3);
  assert.equal(result.diagnostics.renderer, 'CHROMIUM_CDP');
  assert.equal(result.diagnostics.directTransport.code, 'UND_ERR_CONNECT_TIMEOUT');
});

test('transport and browser failure returns one explicit composite source error', async () => {
  const { __sportsbookSourceInternals } = await import(`${sourceModule}?browser-transport-double-failure`);
  await assert.rejects(
    __sportsbookSourceInternals.loadSourcePageWithBrowserFallback(
      new URL('https://www.hiduprukunsejahtera.com/id-ID/sports'),
      '',
      {
        fetchDirect: async () => {
          const error = new Error('fetch failed');
          error.code = 'UND_ERR_CONNECT_TIMEOUT';
          throw error;
        },
        renderBrowser: async () => {
          const error = new Error('renderer connection failed');
          error.code = 'SPORTS_SOURCE_BROWSER_FAILED';
          throw error;
        }
      }
    ),
    error => {
      assert.equal(error.code, 'SPORTS_SOURCE_TRANSPORT_AND_BROWSER_FAILED');
      assert.equal(error.diagnostics.directTransport.code, 'UND_ERR_CONNECT_TIMEOUT');
      assert.equal(error.diagnostics.browser.code, 'SPORTS_SOURCE_BROWSER_FAILED');
      return true;
    }
  );
});

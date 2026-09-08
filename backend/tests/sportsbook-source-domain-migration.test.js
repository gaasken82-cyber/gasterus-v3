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
  SPORTS_SOURCE_TRUSTED_REDIRECT_DOMAINS: 'pastimenangpasti.com',
  SPORTS_SOURCE_CANDIDATE_URLS: '',
  SPORTS_SOURCE_MAIN_PATH: 'id-ID/euro/sepak-bola',
  SPORTS_SOURCE_LIVE_PATH: '',
  SPORTS_SOURCE_PANEL_PATH: '',
  SPORTS_SOURCE_SCHEDULE_DISCOVERY_ENABLED: 'false',
  SPORTS_SOURCE_ALLOW_PUBLIC_EDGE_REDIRECT: 'false',
  SPORTS_SOURCE_MAX_REDIRECTS: '3',
  SPORTS_SOURCE_BROWSER_ENABLED: 'false',
  SPORTS_SOURCE_REFRESH_SECONDS: '8',
  API_SPORTS_ENABLED: 'false', THE_ODDS_API_ENABLED: 'false', THESPORTSDB_ENABLED: 'false'
});

const indexHtml = `
<div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div>
<div class="MarketLea"><div class="SubHeadT">Migration Test League</div></div><table><tr id="bu:od:or:9901">
<td class="DateTime"><div class="DateTimeTxt">Agu 17 20:00</div></td><td><div id="bu:od:afa:ev:990001"></div></td>
<td><a class="OddsTabL"><span class="OddsR">1.90</span><span class="OddsL">Migration Home</span></a></td>
<td><a class="OddsTabL"><span class="OddsR">3.30</span><span class="OddsL">Seri</span></a></td>
<td><a class="OddsTabR"><span class="OddsR">4.00</span><span class="OddsL">Migration Away</span></a></td>
</tr></table></div>`;

const sourceModule = new URL('../src/sportsbook-source.js', import.meta.url).href;

test('canonical sportsbook redirect migrates to the trusted alias, preserves sportsbook path, and strips sensitive headers', async () => {
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const headers = options.headers || {};
    requests.push({ url: url.toString(), headers });
    if (url.hostname === 'www.terushebatunggul.com') {
      return new Response('', { status: 302, headers: { location: 'http://www.pastimenangpasti.com' } });
    }
    if (url.protocol === 'http:' && url.hostname === 'www.pastimenangpasti.com') {
      assert.equal(url.pathname, '/id-ID/euro/sepak-bola');
      assert.equal('cookie' in headers, false);
      assert.equal('authorization' in headers, false);
      assert.equal('referer' in headers, false);
      return new Response('', { status: 301, headers: { location: 'https://www.pastimenangpasti.com/' } });
    }
    if (url.protocol === 'https:' && url.hostname === 'www.pastimenangpasti.com') {
      assert.equal(url.pathname, '/id-ID/euro/sepak-bola');
      assert.equal('cookie' in headers, false);
      assert.equal('authorization' in headers, false);
      assert.equal('referer' in headers, false);
      return new Response(indexHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const { refreshSportsbookSource } = await import(`${sourceModule}?migration-success`);
  const snapshot = await refreshSportsbookSource();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.events[0].id, '990001');
  assert.ok(snapshot.source.activeIndexes.some(url => url.startsWith('https://www.pastimenangpasti.com/id-ID/euro/sepak-bola')));
  assert.deepEqual(requests.map(item => new URL(item.url).hostname), [
    'www.terushebatunggul.com', 'www.pastimenangpasti.com', 'www.pastimenangpasti.com'
  ]);
});

test('trusted alias HTTP may be a migration hop but can never be the final odds response', async () => {
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.terushebatunggul.com') {
      return new Response('', { status: 302, headers: { location: 'http://www.pastimenangpasti.com' } });
    }
    if (url.protocol === 'http:' && url.hostname === 'www.pastimenangpasti.com') {
      return new Response(indexHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const { refreshSportsbookSource } = await import(`${sourceModule}?migration-insecure-final`);
  await assert.rejects(refreshSportsbookSource(), error => {
    assert.equal(error.code, 'SPORTS_SOURCE_INSECURE_FINAL');
    return true;
  });
});

test('trusted alias root redirect does not become a synthetic preserved-path loop', async () => {
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url.toString());
    if (url.hostname === 'www.terushebatunggul.com') {
      return new Response('', { status: 302, headers: { location: 'http://www.pastimenangpasti.com' } });
    }
    if (url.protocol === 'http:' && url.hostname === 'www.pastimenangpasti.com' && url.pathname === '/id-ID/euro/sepak-bola') {
      return new Response('', { status: 301, headers: { location: 'https://www.pastimenangpasti.com/' } });
    }
    if (url.protocol === 'https:' && url.hostname === 'www.pastimenangpasti.com' && url.pathname === '/id-ID/euro/sepak-bola') {
      // This is the production failure shape observed after R6.9.0.9: the trusted
      // alias strips the sportsbook path. The bridge must follow the safe raw root
      // redirect rather than forcing the same path again forever.
      return new Response('', { status: 302, headers: { location: 'https://www.pastimenangpasti.com/' } });
    }
    if (url.protocol === 'https:' && url.hostname === 'www.pastimenangpasti.com' && url.pathname === '/') {
      return new Response(indexHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const { refreshSportsbookSource } = await import(`${sourceModule}?migration-root-loop-break`);
  const snapshot = await refreshSportsbookSource();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.events[0].id, '990001');
  assert.deepEqual(requests, [
    'https://www.terushebatunggul.com/id-ID/euro/sepak-bola',
    'http://www.pastimenangpasti.com/id-ID/euro/sepak-bola',
    'https://www.pastimenangpasti.com/id-ID/euro/sepak-bola',
    'https://www.pastimenangpasti.com/'
  ]);
});

test('real redirect cycle is diagnosed immediately instead of exhausting redirect budget', async () => {
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.terushebatunggul.com') {
      return new Response('', { status: 302, headers: { location: 'https://www.pastimenangpasti.com/' } });
    }
    if (url.hostname === 'www.pastimenangpasti.com' && url.pathname === '/id-ID/euro/sepak-bola') {
      return new Response('', { status: 302, headers: { location: 'https://www.pastimenangpasti.com/' } });
    }
    if (url.hostname === 'www.pastimenangpasti.com' && url.pathname === '/') {
      return new Response('', { status: 302, headers: { location: 'https://www.pastimenangpasti.com/id-ID/euro/sepak-bola' } });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const { refreshSportsbookSource } = await import(`${sourceModule}?migration-real-cycle`);
  await assert.rejects(refreshSportsbookSource(), error => {
    assert.equal(error.code, 'SPORTS_SOURCE_REDIRECT_LOOP');
    assert.ok(Array.isArray(error.redirectChain));
    assert.ok(error.redirectChain.length >= 2);
    return true;
  });
});

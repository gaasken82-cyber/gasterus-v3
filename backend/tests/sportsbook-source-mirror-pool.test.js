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
  SPORTS_SOURCE_NAME: 'SBOTOP Public Football Mirror Feed',
  SPORTS_SOURCE_BASE_URL: 'https://www.kerjahebatberhasil.com/',
  SPORTS_SOURCE_ALLOWED_DOMAIN: 'kerjahebatberhasil.com',
  SPORTS_SOURCE_TRUSTED_REDIRECT_DOMAINS: 'hiduprukunsejahtera.com,terushebatunggul.com,pastimenangpasti.com',
  SPORTS_SOURCE_CANDIDATE_URLS: 'https://www.kerjahebatberhasil.com/id-ID/sports;https://www.hiduprukunsejahtera.com/id-ID/sports;https://www.terushebatunggul.com/id-ID/euro/sepak-bola;https://www.terushebatunggul.com/id-ID/euro/taruhan-live/sepak-bola',
  SPORTS_SOURCE_PANEL_PATH: '',
  SPORTS_SOURCE_MAIN_PATH: 'id-ID/sports',
  SPORTS_SOURCE_LIVE_PATH: '',
  SPORTS_SOURCE_SCHEDULE_DISCOVERY_ENABLED: 'false',
  SPORTS_SOURCE_BROWSER_ENABLED: 'false',
  SPORTS_SOURCE_ALLOW_PUBLIC_EDGE_REDIRECT: 'false',
  SPORTS_SOURCE_MAX_REDIRECTS: '4',
  SPORTS_SOURCE_IGNORE_LEGACY_SECRETS: 'false',
  SPORTS_SOURCE_COOKIE: 'session=must-not-leak',
  SPORTS_SOURCE_AUTHORIZATION: 'Bearer must-not-leak',
  SPORTS_SOURCE_REFERER: 'https://www.kerjahebatberhasil.com/id-ID/sports',
  SPORTS_SOURCE_REFRESH_SECONDS: '8',
  API_SPORTS_ENABLED: 'false',
  THE_ODDS_API_ENABLED: 'false',
  THESPORTSDB_ENABLED: 'false'
});

const eventId = 'mirror-1001';
const detailPath = `/id-ID/sports/event/${eventId}`;
const mirrorHtml = `
<table><tr data-event-id="${eventId}" data-sport="Football" data-league="Mirror League">
  <td class="home-team">Mirror Home</td><td class="away-team">Mirror Away</td>
  <td class="start-time">2026-08-18T12:00:00Z</td>
  <td><a href="${detailPath}">detail</a>
    <button class="odd" data-market="1X2" data-selection="Home" data-odd="1.91">1.91</button>
    <button class="odd" data-market="1X2" data-selection="Draw" data-odd="3.25">3.25</button>
    <button class="odd" data-market="1X2" data-selection="Away" data-odd="4.10">4.10</button>
  </td>
</tr></table>`;

const sourceModule = new URL('../src/sportsbook-source.js', import.meta.url).href;

test('approved mirror pool survives canonical outage and never leaks canonical credentials to fallback mirrors', async () => {
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const headers = options.headers || {};
    requests.push({ url: url.toString(), headers });

    if (url.hostname === 'www.kerjahebatberhasil.com') {
      assert.equal(headers.cookie, 'session=must-not-leak');
      assert.equal(headers.authorization, 'Bearer must-not-leak');
      return new Response('primary unavailable', { status: 503, headers: { 'content-type': 'text/plain' } });
    }
    if (url.hostname === 'www.hiduprukunsejahtera.com') {
      assert.equal('cookie' in headers, false);
      assert.equal('authorization' in headers, false);
      assert.equal('referer' in headers, false);
      return new Response(mirrorHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (url.hostname === 'www.terushebatunggul.com') {
      assert.equal('cookie' in headers, false);
      assert.equal('authorization' in headers, false);
      assert.equal('referer' in headers, false);
      return new Response('legacy unavailable', { status: 503, headers: { 'content-type': 'text/plain' } });
    }
    throw new Error(`unexpected mirror request ${url}`);
  };

  const { refreshSportsbookSource } = await import(`${sourceModule}?mirror-pool-outage`);
  const snapshot = await refreshSportsbookSource();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.events[0].sourceId, eventId);
  assert.equal(snapshot.events[0].markets[0].type, '1X2');
  assert.equal(snapshot.events[0].markets[0].selections.length, 3);
  assert.ok(snapshot.source.activeIndexes.some(url => url.startsWith('https://www.hiduprukunsejahtera.com/id-ID/sports')));
  assert.ok(snapshot.upstreams.some(item => item.url.includes('kerjahebatberhasil.com') && item.healthy === false));
  assert.ok(snapshot.upstreams.some(item => item.url.includes('hiduprukunsejahtera.com') && item.healthy === true));
  assert.ok(requests.some(item => item.url.startsWith('https://www.hiduprukunsejahtera.com/id-ID/sports')));
});

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
  SPORTS_SOURCE_MAX_REDIRECTS: '2',
  SPORTS_SOURCE_SCHEDULE_DISCOVERY_ENABLED: 'true',
  SPORTS_SOURCE_SCHEDULE_REFRESH_SECONDS: '60',
  SPORTS_SOURCE_SCHEDULE_MAX_PAGES: '8',
  SPORTS_SOURCE_REFRESH_SECONDS: '8',
  SPORTS_FEED_REFRESH_SECONDS: '8',
  API_SPORTS_ENABLED: 'false',
  THE_ODDS_API_ENABLED: 'false',
  THESPORTSDB_ENABLED: 'false'
});

const prematchHtml = `
<table class="TimeTab"><tr>
  <td class="Sel"><a id="bu:od:go:dt:1" href="/id-ID/euro/sepak-bola/">Hari ini</a></td>
  <td><a id="bu:od:go:dt:2" href="/id-ID/euro/sepak-bola/2026-08-11">Besok</a></td>
  <td><a id="bu:od:go:dt:8" href="/id-ID/euro/sepak-bola/lainnya">Lainnya</a></td>
</tr></table>
<div id="od-ma-1-5" class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div><div class="MarketBd">
  <div class="MarketLea"><div class="SubHeadT">ASEAN Test League</div></div>
  <table class="Onex2"><tr id="bu:od:or:7001"><td class="DateTime"><div class="DateTimeTxt">Agu 10 21:00</div></td><td class="Fav"><div id="bu:od:afa:ev:10350001"></div></td>
    <td><a class="OddsTabL" title="Home FC"><span class="OddsR">1.85</span><span class="OddsL">Home FC</span></a></td>
    <td><a class="OddsTabL"><span class="OddsR">3.20</span><span class="OddsL">Seri</span></a></td>
    <td><a class="OddsTabR" title="Away FC"><span class="OddsR">4.10</span><span class="OddsL">Away FC</span></a></td>
    <td><a href="/id-ID/euro/sepak-bola/test/10350001/home-fc-vs-away-fc" id="bu:od:go:ev:10350001" class="IconMarkets">10</a></td></tr></table></div></div>
<div id="od-ma-1-1" class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>Handicap Asia</span></div></div><div class="MarketBd">
  <div class="MarketLea"><div class="SubHeadT">ASEAN Test League</div></div>
  <table class="Hdp"><tr id="bu:od:or:7002"><td class="DateTime"><div class="DateTimeTxt">Agu 10 21:00</div></td><td class="Fav"><div id="bu:od:afa:ev:10350001"></div></td>
    <td><a class="OddsTabL"><span class="OddsR">1.90</span><span class="OddsM">-0.50</span><span class="OddsL">Home FC</span></a></td>
    <td><a class="OddsTabR"><span class="OddsR">1.98</span><span class="OddsM">+0.50</span><span class="OddsL">Away FC</span></a></td></tr></table></div></div>`;

const liveHtml = `
<div id="od-ma-1-5" class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div><div class="MarketBd">
  <div class="MarketLea"><div class="SubHeadT">ASEAN Test League</div></div>
  <table class="Onex2">
    <tr id="bu:od:or:7101"><td class="DateTime"><div class="DateTimeTxt">1 - 0 LIVE 36'</div></td><td class="Fav"><div id="bu:od:afa:ev:10350001"></div></td>
      <td><a class="OddsTabL"><span class="OddsR">1.62</span><span class="OddsL">Home FC</span></a></td>
      <td><a class="OddsTabL"><span class="OddsR">3.75</span><span class="OddsL">Seri</span></a></td>
      <td><a class="OddsTabR"><span class="OddsR">5.20</span><span class="OddsL">Away FC</span></a></td>
      <td><a href="/id-ID/euro/sepak-bola/test/10350001/home-fc-vs-away-fc" id="bu:od:go:ev:10350001" class="IconMarkets">12</a></td></tr>
    <tr id="bu:od:or:7102"><td class="DateTime"><div class="DateTimeTxt">0 - 0 LIVE 12'</div></td><td class="Fav"><div id="bu:od:afa:ev:10350002"></div></td>
      <td><a class="OddsTabL"><span class="OddsR">2.05</span><span class="OddsL">Live Home</span></a></td>
      <td><a class="OddsTabL"><span class="OddsR">3.05</span><span class="OddsL">Seri</span></a></td>
      <td><a class="OddsTabR"><span class="OddsR">3.65</span><span class="OddsL">Live Away</span></a></td>
      <td><a href="/id-ID/euro/sepak-bola/test/10350002/live-home-vs-live-away" id="bu:od:go:ev:10350002" class="IconMarkets">9</a></td></tr>
  </table></div></div>`;

const futureHtml = `
<div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div><div class="MarketBd">
  <div class="MarketLea"><div class="SubHeadT">Future League</div></div>
  <table><tr id="bu:od:or:7201"><td class="DateTime"><div class="DateTimeTxt">Agu 11 22:00</div></td><td><div id="bu:od:afa:ev:10350003"></div></td>
    <td><a class="OddsTabL"><span class="OddsR">1.75</span><span class="OddsL">Future Home</span></a></td>
    <td><a class="OddsTabL"><span class="OddsR">3.50</span><span class="OddsL">Seri</span></a></td>
    <td><a class="OddsTabR"><span class="OddsR">4.60</span><span class="OddsL">Future Away</span></a></td>
    <td><a href="/id-ID/euro/sepak-bola/future/10350003/future-home-vs-future-away" id="bu:od:go:ev:10350003" class="IconMarkets">14</a></td></tr></table></div></div>`;

const otherHtml = `
<div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>Handicap Asia</span></div></div><div class="MarketBd">
  <div class="MarketLea"><div class="SubHeadT">Long Range League</div></div>
  <table><tr id="bu:od:or:7301"><td class="DateTime"><div class="DateTimeTxt">Agu 20 20:00</div></td><td><div id="bu:od:afa:ev:10350004"></div></td>
    <td><a class="OddsTabL"><span class="OddsR">1.88</span><span class="OddsM">-0.25</span><span class="OddsL">Long Home</span></a></td>
    <td><a class="OddsTabR"><span class="OddsR">2.02</span><span class="OddsM">+0.25</span><span class="OddsL">Long Away</span></a></td>
    <td><a href="/id-ID/euro/sepak-bola/future/10350004/long-home-vs-long-away" id="bu:od:go:ev:10350004" class="IconMarkets">11</a></td></tr></table></div></div>`;

const requests = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  requests.push({ url: url.toString(), headers: options.headers || {} });
  if (url.hostname !== 'www.terushebatunggul.com') throw new Error(`unexpected host ${url.hostname}`);
  if (url.pathname === '/id-ID/euro/sepak-bola' || url.pathname === '/id-ID/euro/sepak-bola/') {
    return new Response(prematchHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'sid=test-session; Path=/; Secure; HttpOnly' } });
  }
  if (url.pathname === '/id-ID/euro/taruhan-live/sepak-bola' || url.pathname === '/id-ID/euro/taruhan-live/sepak-bola/') {
    return new Response(liveHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (url.pathname === '/id-ID/euro/sepak-bola/2026-08-11') {
    return new Response(futureHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (url.pathname === '/id-ID/euro/sepak-bola/lainnya') {
    return new Response(otherHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  throw new Error(`unexpected request ${url}`);
};

const { refreshSportsbookSource, sportsbookSourceStatus } = await import('../src/sportsbook-source.js');

test('Terus Hebat Unggul direct source merges prematch + live indexes and upgrades duplicate event to live odds', async () => {
  const snapshot = await refreshSportsbookSource();
  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.source.mode, 'DIRECT_MULTI_PAGE_SOURCE');
  assert.equal(snapshot.source.activeIndexes.length, 4);
  assert.equal(snapshot.source.hotIndexes.length, 2);
  assert.equal(snapshot.source.discoveredScheduleIndexes.length, 2);
  assert.equal(snapshot.source.discoveredScheduleCount, 2);
  assert.ok(snapshot.source.activeIndexes.every(url => url.startsWith('https://www.terushebatunggul.com/')));
  const merged = snapshot.events.find(event => event.id === '10350001');
  assert.ok(merged);
  assert.equal(merged.live, true);
  assert.equal(merged.home.score, 1);
  assert.equal(merged.away.score, 0);
  assert.equal(merged.availableMarketCount, 12);
  assert.ok(merged.markets.some(market => market.type === '1X2'));
  assert.ok(merged.markets.some(market => market.type === 'HANDICAP'));
  assert.ok(snapshot.events.some(event => event.id === '10350002' && event.live));
  assert.ok(snapshot.events.some(event => event.id === '10350003' && event.league === 'Future League'));
  assert.ok(snapshot.events.some(event => event.id === '10350004' && event.league === 'Long Range League'));
  assert.ok(requests.some(request => request.url.includes('/id-ID/euro/sepak-bola/2026-08-11')));
  assert.ok(requests.some(request => request.url.includes('/id-ID/euro/sepak-bola/lainnya')));
  assert.equal(requests.some(request => request.url.startsWith('http://')), false);
  assert.match(sportsbookSourceStatus().activeUpstream, /^https:\/\/www\.terushebatunggul\.com\//);
});

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
  SPORTS_SOURCE_CANDIDATE_URLS: '',
  SPORTS_SOURCE_MAIN_PATH: 'id-ID/euro/sepak-bola',
  SPORTS_SOURCE_LIVE_PATH: '',
  SPORTS_SOURCE_DETAIL_ENABLED: 'true',
  SPORTS_SOURCE_DETAIL_REFRESH_SECONDS: '30',
  SPORTS_SOURCE_DETAIL_PREMATCH_REFRESH_SECONDS: '180',
  SPORTS_SOURCE_ALLOW_PUBLIC_EDGE_REDIRECT: 'false',
  SPORTS_SOURCE_REFRESH_SECONDS: '8',
  SPORTS_FEED_REFRESH_SECONDS: '8',
  API_SPORTS_ENABLED: 'false', THE_ODDS_API_ENABLED: 'false', THESPORTSDB_ENABLED: 'false'
});

const eventId = '77889900';
const eventPath = `/id-ID/euro/sepak-bola/test-league/${eventId}/direct-home-vs-direct-away`;
const indexHtml = `
<div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div>
<div class="MarketLea"><div class="SubHeadT">Direct Test League</div></div><table><tr id="bu:od:or:100">
<td class="DateTime"><div class="DateTimeTxt">Agu 11 02:00</div></td><td><div id="bu:od:afa:ev:${eventId}"></div></td>
<td><a class="OddsTabL"><span class="OddsR">1.90</span><span class="OddsL">Direct Home</span></a></td>
<td><a class="OddsTabL"><span class="OddsR">3.30</span><span class="OddsL">Seri</span></a></td>
<td><a class="OddsTabR"><span class="OddsR">4.00</span><span class="OddsL">Direct Away</span></a></td>
<td><a href="${eventPath}" id="bu:od:go:ev:${eventId}" class="IconMarkets">18</a></td></tr></table></div>`;

const section = (title, offer, cells) => `<div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>${title}</span></div></div><div class="MarketLea"><div class="SubHeadT">Direct Test League</div></div><table><tr id="bu:od:or:${offer}"><td><div id="bu:od:afa:ev:${eventId}"></div></td>${cells}</tr></table></div>`;
const odd = (label, price, line = '') => `<td><a class="OddsTabL"><span class="OddsR">${price}</span>${line ? `<span class="OddsM">${line}</span>` : ''}<span class="OddsL">${label}</span></a></td>`;
const detailHtml = [
  section('1X2', 201, odd('Direct Home',1.88)+odd('Seri',3.35)+odd('Direct Away',4.05)),
  section('1X2 Babak Pertama', 202, odd('Direct Home',2.45)+odd('Seri',2.05)+odd('Direct Away',4.80)),
  section('Handicap Asia', 203, odd('Direct Home',1.92,'-0.50')+odd('Direct Away',1.96,'+0.50')),
  section('Handicap Asia Babak Pertama', 204, odd('Direct Home',1.91,'-0.25')+odd('Direct Away',1.97,'+0.25')),
  section('Over / Under', 205, odd('Over',1.89,'2.50')+odd('Under',1.99,'2.50')),
  section('Over / Under Babak Pertama', 206, odd('Over',1.95,'1.00')+odd('Under',1.91,'1.00')),
  section('Peluang Ganda', 207, odd('1X',1.22)+odd('12',1.30)+odd('X2',1.82)),
  section('Kedua Tim Cetak Gol', 208, odd('Ya',1.74)+odd('Tidak',2.04)),
  section('Skor Tepat', 209, odd('1-0',7.20)+odd('1-1',6.50)+odd('2-1',8.40)),
  section('Ganjil / Genap', 210, odd('Ganjil',1.90)+odd('Genap',1.90))
].join('\n');

let indexFetches = 0;
let detailFetches = 0;
globalThis.fetch = async input => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'www.terushebatunggul.com');
  if (url.pathname === '/id-ID/euro/sepak-bola') {
    indexFetches += 1;
    return new Response(indexHtml, { status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'source_sid=abc123; Path=/; Secure; HttpOnly' } });
  }
  if (url.pathname === eventPath) {
    detailFetches += 1;
    return new Response(detailHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  }
  throw new Error(`unexpected URL ${url}`);
};

const { refreshSportsbookSource, sportsbookEventDetail, sportsbookSourceStatus } = await import('../src/sportsbook-source.js');

test('direct source event detail hydrates all recognized markets and caches the event detail page', async () => {
  const snapshot = await refreshSportsbookSource();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.events[0].availableMarketCount, 18);
  assert.equal(snapshot.events[0].sourceUrl, `https://www.terushebatunggul.com${eventPath}`);
  const detail = await sportsbookEventDetail(eventId);
  const coverage = new Set(detail.markets.map(market => `${market.type}:${market.period}`));
  for (const expected of ['1X2:FT','1X2:1H','HANDICAP:FT','HANDICAP:1H','TOTALS:FT','TOTALS:1H','DOUBLE_CHANCE:FT','BTTS:FT','CORRECT_SCORE:FT','ODD_EVEN:FT']) {
    assert.ok(coverage.has(expected), `missing ${expected}`);
  }
  assert.equal(detail.availableMarketCount, 18);
  assert.ok(detail.detailFetchedAt);
  assert.equal(indexFetches, 1);
  assert.equal(detailFetches, 1);
  const cached = await sportsbookEventDetail(eventId);
  assert.equal(cached.detailFetchedAt, detail.detailFetchedAt);
  assert.equal(detailFetches, 1, 'detail page should be served from TTL cache on second call');
  assert.ok(sportsbookSourceStatus().detailCacheEntries >= 1);
});

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
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
});

const { __sportsbookParser, __sportsbookSourcePolicy } = await import('../src/sportsbook-source.js');

test('sportsbook parser normalizes embedded JSON and HTML odds', () => {
  const html = `
    <script>
      window.feed={"events":[{"eventId":"m1","sport":"Football","league":"Premier League","home":"Arsenal","away":"Chelsea","status":"LIVE","score":"1-0","markets":[{"id":"1x2","name":"1X2","selections":[{"name":"Home","odds":1.85},{"name":"Draw","odds":3.20},{"name":"Away","odds":4.10}]},{"id":"ou25","name":"Over / Under","line":2.5,"selections":[{"name":"Over 2.5","odds":1.90},{"name":"Under 2.5","odds":1.92}]}]}]};
    </script>
    <table>
      <tr data-event-id="m2" data-sport="Football" data-league="Serie A">
        <td class="home-team">Inter</td>
        <td class="away-team">Milan</td>
        <td class="start-time">2026-08-06T12:00:00Z</td>
        <td>
          <button class="odd" data-market="1X2" data-selection="Home" data-odd="2.10">2.10</button>
          <button class="odd" data-market="1X2" data-selection="Draw" data-odd="3.10">3.10</button>
          <button class="odd" data-market="1X2" data-selection="Away" data-odd="3.40">3.40</button>
        </td>
      </tr>
    </table>`;

  const events = __sportsbookParser.parseSourceHtml(html);
  assert.equal(events.length, 2);
  assert.equal(events[0].live, true);
  assert.equal(events[0].home.score, 1);
  assert.ok(events[0].markets.some(market => market.type === '1X2'));
  assert.ok(events[0].markets.some(market => market.type === 'TOTALS'));
  assert.equal(events[1].league, 'Serie A');
  assert.equal(events[1].markets[0].selections.length, 3);
});

test('sportsbook parser reads supplied SBOBET-style 1X2 and Asian Handicap markup', () => {
  const html = `
  <div id="od-ma-1-5" class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div><div class="MarketBd">
    <div class="MarketLea"><div class="SubHeadT">UEFA Test League</div></div>
    <table class="Onex2"><tr id="bu:od:or:7001"><td class="DateTime"><div class="DateTimeTxt">Agu 10 21:00</div></td><td class="Fav"><div id="bu:od:afa:ev:10350001"></div></td>
      <td><a class="OddsTabL" title="Home FC"><span class="OddsR">1.85</span><span class="OddsL">Home FC</span></a></td>
      <td><a class="OddsTabL"><span class="OddsR">3.20</span><span class="OddsL">Seri</span></a></td>
      <td><a class="OddsTabR" title="Away FC"><span class="OddsR">4.10</span><span class="OddsL">Away FC</span></a></td>
      <td><a href="/id-id/euro/sepak-bola/test/10350001/home-fc-vs-away-fc" id="bu:od:go:ev:10350001">10</a></td></tr></table></div></div>
  <div id="od-ma-1-1" class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>Handicap Asia</span></div></div><div class="MarketBd">
    <div class="MarketLea"><div class="SubHeadT">UEFA Test League</div></div>
    <table class="Hdp"><tr id="bu:od:or:7002"><td class="DateTime"><div class="DateTimeTxt">Agu 10 21:00</div></td><td class="Fav"><div id="bu:od:afa:ev:10350001"></div></td>
      <td><a class="OddsTabL"><span class="OddsR">1.90</span><span class="OddsM">-0.50</span><span class="OddsL">Home FC</span></a></td>
      <td><a class="OddsTabR"><span class="OddsR">1.98</span><span class="OddsM">+0.50</span><span class="OddsL">Away FC</span></a></td></tr></table></div></div>`;
  const events = __sportsbookParser.parseSbobetHtmlEvents(html);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, '10350001');
  assert.equal(events[0].league, 'UEFA Test League');
  assert.ok(events[0].markets.some(market => market.type === '1X2' && market.selections.length === 3));
  assert.ok(events[0].markets.some(market => market.type === 'HANDICAP' && market.line === '-0.50'));
  assert.equal(events[0].availableMarketCount, 10);
  assert.equal(events[0].sourceUrl, '/id-id/euro/sepak-bola/test/10350001/home-fc-vs-away-fc');
});



test('sportsbook upstream quality prefers richer live odds payloads', () => {
  const sparse = [{ live: false, markets: [{ selections: [{ odds: 1.9 }] }] }];
  const rich = [{ live: true, markets: [{ selections: [{ odds: 1.9 }, { odds: 2.1 }, { odds: 3.2 }] }, { selections: [{ odds: 1.8 }, { odds: 2.0 }] }] }];
  assert.ok(__sportsbookParser.snapshotQuality(rich).score > __sportsbookParser.snapshotQuality(sparse).score);
});

test('sportsbook direct-source redirect policy allows the primary mirror and only explicit trusted mirrors', () => {
  const vendor = __sportsbookSourcePolicy.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'), new URL('https://kerjahebatberhasil.com/id-ID/sports'), true);
  assert.equal(vendor.allowed, true);
  assert.equal(vendor.includeSensitive, true);

  const migrated = __sportsbookSourcePolicy.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'), new URL('https://www.hiduprukunsejahtera.com/'), true);
  assert.equal(migrated.allowed, true);
  assert.equal(migrated.includeSensitive, false);
  assert.equal(migrated.preserveSportsbookPath, '/id-ID/sports');
  assert.equal(__sportsbookSourcePolicy.trustedRedirectHost('www.hiduprukunsejahtera.com'), true);
  assert.equal(__sportsbookSourcePolicy.trustedRedirectHost('www.terushebatunggul.com'), true);
  assert.equal(__sportsbookSourcePolicy.trustedRedirectHost('www.pastimenangpasti.com'), true);

  const edge = __sportsbookSourcePolicy.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'), new URL('http://54.65.5.61/'), true);
  assert.equal(edge.allowed, false);
  const foreign = __sportsbookSourcePolicy.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/'), new URL('https://example.org/odds'), true);
  assert.equal(foreign.allowed, false);
});

test('sportsbook source payload parser accepts top-level JSON API responses with participant arrays', () => {
  const payload = JSON.stringify({
    data: {
      events: [{
        eventId: 'api-1001',
        sport: 'Football',
        league: 'Authorized API League',
        startTime: '2026-08-10T15:00:00Z',
        participants: [
          { side: 'home', name: 'API Home' },
          { side: 'away', name: 'API Away' }
        ],
        markets: [{
          id: 'm-1x2',
          name: '1X2',
          selections: [
            { name: 'Home', odds: 1.91 },
            { name: 'Draw', odds: 3.25 },
            { name: 'Away', odds: 4.15 }
          ]
        }]
      }]
    }
  });
  const events = __sportsbookParser.parseSourcePayload(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceId, 'api-1001');
  assert.equal(events[0].home.name, 'API Home');
  assert.equal(events[0].away.name, 'API Away');
  assert.equal(events[0].markets[0].type, '1X2');
  assert.equal(events[0].markets[0].selections.length, 3);
});

test('sportsbook source payload parser unwraps JSON responses containing rendered SBOBET HTML fragments', () => {
  const fragment = `
    <div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2</span></div></div>
    <div class="MarketLea"><div class="SubHeadT">Wrapped League</div></div>
    <table><tr id="bu:od:or:901"><td class="DateTime"><div class="DateTimeTxt">Agu 10 22:00</div></td>
    <td><div id="bu:od:afa:ev:9001001"></div></td>
    <td><a class="OddsTabL"><span class="OddsR">1.80</span><span class="OddsL">Wrapped Home</span></a></td>
    <td><a class="OddsTabL"><span class="OddsR">3.40</span><span class="OddsL">Seri</span></a></td>
    <td><a class="OddsTabR"><span class="OddsR">4.40</span><span class="OddsL">Wrapped Away</span></a></td>
    <td><a href="/id-id/euro/sepak-bola/test/9001001/wrapped-home-vs-wrapped-away" id="bu:od:go:ev:9001001">9</a></td>
    </tr></table></div>`;
  const payload = JSON.stringify({ status: 'ok', html: fragment });
  const events = __sportsbookParser.parseSourcePayload(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceId, '9001001');
  assert.equal(events[0].league, 'Wrapped League');
  assert.equal(events[0].markets[0].type, '1X2');
});

test('sportsbook source diagnostics distinguish catalog-only HTML from priced event payloads', () => {
  const catalog = `<html><script src="app.js"></script><div id="menu-sports"><span class="NumEvt">814</span>All Events Live Betting</div></html>`;
  const catalogInfo = __sportsbookParser.sourcePayloadDiagnostics(catalog, 'text/html; charset=utf-8');
  assert.equal(catalogInfo.format, 'HTML');
  assert.equal(catalogInfo.catalogOnly, true);
  assert.equal(catalogInfo.likelyClientHydrated, true);
  assert.equal(catalogInfo.oddsMarkers, 0);

  const priced = `<div class="NumEvt">814</div><a class="OddsTabL"><span class="OddsR">1.90</span></a><div id="bu:od:afa:ev:12345"></div>`;
  const pricedInfo = __sportsbookParser.sourcePayloadDiagnostics(priced, 'text/html');
  assert.equal(pricedInfo.catalogOnly, false);
  assert.ok(pricedInfo.oddsMarkers > 0);
  assert.ok(pricedInfo.eventMarkers > 0);
});


test('Terus Hebat Unggul market labels preserve market type and FT/HT period', () => {
  const { marketTypeFromLabel, normalizePeriod } = __sportsbookParser;
  const cases = [
    ['1X2', '1X2', 'FT'],
    ['1X2 Babak Pertama', '1X2', '1H'],
    ['Handicap Asia', 'HANDICAP', 'FT'],
    ['Handicap Asia Babak Pertama', 'HANDICAP', '1H'],
    ['Over / Under', 'TOTALS', 'FT'],
    ['Over / Under Babak Pertama', 'TOTALS', '1H'],
    ['Kedua Tim Cetak Gol', 'BTTS', 'FT'],
    ['Peluang Ganda', 'DOUBLE_CHANCE', 'FT'],
    ['Skor Tepat', 'CORRECT_SCORE', 'FT'],
    ['Ganjil / Genap', 'ODD_EVEN', 'FT']
  ];
  for (const [label, type, period] of cases) {
    assert.equal(marketTypeFromLabel(label), type, label);
    assert.equal(normalizePeriod('', label), period, label);
  }
});

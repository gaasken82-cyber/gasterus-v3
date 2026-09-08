import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const { __sportsbookProviders } = await import('../src/sportsbook-providers.js');
const { __sportsbookParser } = await import('../src/sportsbook-source.js');
const { evaluateSportsbookLeg } = await import('../src/sportsbook-result-evaluator.js');

test('The Odds API event markets preserve FT/HT periods for 1X2 handicap and totals', () => {
  const event = __sportsbookProviders.normalizeOddsApiEvent({
    id: 'period-odds-1',
    sport_key: 'soccer_epl',
    sport_title: 'Premier League',
    commence_time: '2026-08-11T12:00:00Z',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    bookmakers: [{
      key: 'book-a',
      markets: [
        { key: 'h2h', outcomes: [{ name: 'Arsenal', price: 1.8 }, { name: 'Draw', price: 3.4 }, { name: 'Chelsea', price: 4.2 }] },
        { key: 'h2h_3_way_h1', outcomes: [{ name: 'Arsenal', price: 2.2 }, { name: 'Draw', price: 2.1 }, { name: 'Chelsea', price: 4.6 }] },
        { key: 'spreads_h1', outcomes: [{ name: 'Arsenal', point: -0.25, price: 1.92 }, { name: 'Chelsea', point: 0.25, price: 1.94 }] },
        { key: 'totals_h1', outcomes: [{ name: 'Over', point: 1.0, price: 1.88 }, { name: 'Under', point: 1.0, price: 1.98 }] }
      ]
    }]
  });
  assert.ok(event.markets.some(market => market.type === '1X2' && market.period === 'FT'));
  assert.ok(event.markets.some(market => market.type === '1X2' && market.period === '1H'));
  assert.ok(event.markets.some(market => market.type === 'HANDICAP' && market.period === '1H'));
  assert.ok(event.markets.some(market => market.type === 'TOTALS' && market.period === '1H'));
});

test('API-Sports normalizer carries first-half markets and halftime settlement score', () => {
  const event = __sportsbookProviders.normalizeApiSportsFixture({
    fixture: { id: 9911, date: '2026-08-11T12:00:00Z', status: { short: 'FT', elapsed: 90 }, venue: { name: 'Stadium' } },
    league: { name: 'Premier League', country: 'England' },
    teams: { home: { name: 'Arsenal' }, away: { name: 'Chelsea' } },
    goals: { home: 3, away: 1 },
    score: { halftime: { home: 1, away: 1 }, fulltime: { home: 3, away: 1 } }
  }, [
    { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '1.80' }, { value: 'Draw', odd: '3.40' }, { value: 'Away', odd: '4.20' }] },
    { id: 2, name: 'First Half Winner', values: [{ value: 'Home', odd: '2.20' }, { value: 'Draw', odd: '2.10' }, { value: 'Away', odd: '4.60' }] },
    { id: 6, name: 'Goals Over/Under First Half', values: [{ value: 'Over 1.0', odd: '1.88' }, { value: 'Under 1.0', odd: '1.98' }] }
  ]);
  assert.ok(event.markets.some(market => market.type === '1X2' && market.period === '1H'));
  assert.ok(event.markets.some(market => market.type === 'TOTALS' && market.period === '1H'));
  assert.deepEqual(event.periodScores['1H'], { home: 1, away: 1 });
});

test('API-Sports live odds extractor accepts top-level bets payload', () => {
  const map = __sportsbookProviders.extractApiSportsOdds({ response: [{ fixture: { id: 123 }, bets: [{ id: 2, name: 'First Half Winner', values: [{ value: 'Home', odd: '2.0' }] }] }] });
  assert.equal(map.get('123').length, 1);
  assert.equal(map.get('123')[0].name, 'First Half Winner');
});

test('provider merger keeps HT priced market bettable only when API-Sports result source is attached', () => {
  const oddsEvent = __sportsbookProviders.normalizeOddsApiEvent({
    id: 'odds-safety', sport_key: 'soccer_epl', sport_title: 'Premier League', commence_time: '2026-08-11T12:00:00Z',
    home_team: 'Arsenal', away_team: 'Chelsea',
    bookmakers: [{ key: 'book-a', markets: [{ key: 'h2h_3_way_h1', outcomes: [{ name: 'Arsenal', price: 2.2 }, { name: 'Draw', price: 2.1 }, { name: 'Chelsea', price: 4.6 }] }] }]
  });
  const withoutScoreProvider = __sportsbookProviders.mergeProviderEvents([{ events: [oddsEvent] }]);
  assert.equal(withoutScoreProvider[0].markets[0].suspended, true);

  const apiEvent = __sportsbookProviders.normalizeApiSportsFixture({
    fixture: { id: 9911, date: '2026-08-11T12:00:00Z', status: { short: 'NS' } },
    league: { name: 'Premier League', country: 'England' },
    teams: { home: { name: 'Arsenal' }, away: { name: 'Chelsea' } }, goals: { home: null, away: null }, score: { halftime: { home: null, away: null } }
  });
  const withScoreProvider = __sportsbookProviders.mergeProviderEvents([{ events: [oddsEvent] }, { events: [apiEvent] }]);
  assert.equal(withScoreProvider[0].markets[0].suspended, false);
  assert.ok(withScoreProvider[0]._sources.includes('api-sports'));
});

test('SBOBET source bridge parser preserves first-half market period instead of forcing FT', () => {
  const html = `
    <div class="MarketT Open"><div class="MarketHd"><div class="SubHead"><span>1X2 First Half</span></div></div>
    <div class="MarketLea"><div class="SubHeadT">Test League</div></div>
    <table><tr id="bu:od:or:991"><td class="DateTime"><div class="DateTimeTxt">Agu 11 20:00</div></td><td><div id="bu:od:afa:ev:9002001"></div></td>
    <td><a class="OddsTabL"><span class="OddsR">2.10</span><span class="OddsL">Home FC</span></a></td>
    <td><a class="OddsTabL"><span class="OddsR">2.05</span><span class="OddsL">Seri</span></a></td>
    <td><a class="OddsTabR"><span class="OddsR">4.10</span><span class="OddsL">Away FC</span></a></td>
    <td><a href="/id-id/euro/sepak-bola/test/9002001/home-fc-vs-away-fc" id="bu:od:go:ev:9002001">9</a></td></tr></table></div>`;
  const events = __sportsbookParser.parseSbobetHtmlEvents(html);
  assert.equal(events.length, 1);
  assert.equal(events[0].markets[0].period, '1H');
});

test('auto settlement evaluates HT market from halftime score and FT market from final score', () => {
  const event = { status: 'FINISHED', home: { score: 3 }, away: { score: 1 }, periodScores: { '1H': { home: 1, away: 1 } } };
  const base = { home_team: 'Arsenal', away_team: 'Chelsea', market_type: '1X2', market_line: null };
  const ht = evaluateSportsbookLeg({ ...base, market_period: '1H', selection_label: 'Draw' }, event);
  const ft = evaluateSportsbookLeg({ ...base, market_period: 'FT', selection_label: 'Home' }, event);
  assert.equal(ht.status, 'WON');
  assert.match(ht.resultValue, /^HT 1-1$/);
  assert.equal(ft.status, 'WON');
  assert.match(ft.resultValue, /^FT 3-1$/);
});

test('member sportsbook ships explicit FT/HT controls and does not hard-code bridge markets to FT', () => {
  const ui = readFileSync(new URL('../../member/public/sportsbook.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../member/public/sportsbook.html', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../src/sportsbook-feed.js', import.meta.url), 'utf8');
  assert.match(html, /data-period="FT"/);
  assert.match(html, /data-period="1H"/);
  assert.match(ui, /function periodMatches/);
  assert.match(ui, /all\.slice\(0, 6\)/);
  assert.match(feed, /period: market\.period \|\| 'FT'/);
  assert.doesNotMatch(feed, /period: 'FT',/);
});

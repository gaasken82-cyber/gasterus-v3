import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV:'test', DATABASE_URL:'postgresql://u:p@example.com/db', REDIS_URL:'redis://example.com:6379',
  MEMBER_PROXY_SECRET:'m'.repeat(48), ADMIN_PROXY_SECRET:'a'.repeat(48), OPS_INTERNAL_SECRET:'o'.repeat(48),
  SESSION_HMAC_KEY:'s'.repeat(48), API_KEY_PEPPER:'p'.repeat(48), MFA_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),
  PUBLIC_MARKET_ENABLED:'true', PUBLIC_MARKET_DERIVED_MARKETS_ENABLED:'true', PUBLIC_MARKET_DERIVED_MARGIN_BPS:'450'
});

const { parseCsv, normalizeFootballDataFixture, normalizeOpenFootballFixture, __publicMarket } = await import('../src/sportsbook-public-market.js');
const { parseOpenFootballText, buildOpenFootballModelAnchor, __openFootball } = await import('../src/sportsbook-openfootball.js');
const { __sportsbookProviders } = await import('../src/sportsbook-providers.js');
const { eventSettlementAuthority } = await import('../src/sportsbook-settlement-authority.js');
const { evaluateSportsbookLeg } = await import('../src/sportsbook-result-evaluator.js');

const fixtureRow = {
  Div:'E0', Date:'23/08/2026', Time:'16:30', HomeTeam:'Arsenal', AwayTeam:'Chelsea',
  B365H:'1.91', B365D:'3.65', B365A:'4.10', 'B365>2.5':'1.82', 'B365<2.5':'2.02',
  AHh:'-0.5', B365AHH:'1.94', B365AHA:'1.96'
};

test('R6.9.0.15 CSV parser preserves quoted bookmaker fields', () => {
  const rows=parseCsv('Div,Date,Time,HomeTeam,AwayTeam,B365H\nE0,23/08/2026,16:30,"Arsenal, FC",Chelsea,1.91\n');
  assert.equal(rows.length,1);
  assert.equal(rows[0].HomeTeam,'Arsenal, FC');
  assert.equal(rows[0].B365H,'1.91');
});

test('R6.9.0.15 public fixture creates real anchor markets plus broad Gasterus-derived catalog', () => {
  const event=normalizeFootballDataFixture(fixtureRow,{updatedAt:'2026-08-17T12:00:00Z'});
  assert.ok(event);
  assert.equal(event.league,'Premier League');
  assert.equal(event.country,'England');
  assert.equal(event._sources[0],'public-market');
  assert.ok(event._settlementReadySources.includes('public-market'));
  const source1x2=event.markets.find(m=>m.type==='1X2'&&m.period==='FT'&&m.sourceMarketId?.includes(':1x2'));
  assert.deepEqual(source1x2.selections.map(s=>s.odds),[1.91,3.65,4.10]);
  const types=new Set(event.markets.map(m=>m.type));
  for(const type of ['1X2','HANDICAP','TOTALS','BTTS','DOUBLE_CHANCE','DRAW_NO_BET','TEAM_TOTAL','HT_FT','ODD_EVEN','CORRECT_SCORE']) assert.ok(types.has(type),type);
  assert.ok(event.markets.length >= 25, `markets=${event.markets.length}`);
  assert.ok(event.markets.flatMap(m=>m.selections).every(s=>Number.isFinite(s.odds)&&s.odds>1));
});

test('R6.9.0.15 public market source unlocks FT and 1H without any commercial provider key', () => {
  const event=normalizeFootballDataFixture(fixtureRow,{updatedAt:'2026-08-17T12:00:00Z'});
  const [merged]=__sportsbookProviders.mergeProviderEvents([{provider:'public-market',enabled:true,events:[event]}]);
  const authority=eventSettlementAuthority(merged);
  assert.equal(authority.ft,true);
  assert.equal(authority.ht,true);
  assert.equal(authority.automaticFt,true);
  assert.ok(merged.markets.some(m=>m.period==='FT'&&!m.suspended));
  assert.ok(merged.markets.some(m=>m.period==='1H'&&!m.suspended));
});

test('R6.9.0.15 result merge supplies FT/HT scores for automatic settlement', () => {
  const event=normalizeFootballDataFixture(fixtureRow,{updatedAt:'2026-08-17T12:00:00Z'});
  event.startTime='2026-08-10T16:30:00.000Z';
  const result=__publicMarket.normalizeResultRow({HomeTeam:'Arsenal',AwayTeam:'Chelsea',Date:'10/08/2026',FTHG:'2',FTAG:'1',HTHG:'1',HTAG:'0'});
  const [finished]=__publicMarket.mergeResults([event],[result]);
  assert.equal(finished.status,'FINISHED');
  assert.equal(finished.home.score,2);
  assert.equal(finished.away.score,1);
  assert.deepEqual(finished.periodScores['1H'],{home:1,away:0});
  const leg={market_type:'DRAW_NO_BET',market_period:'FT',market_line:null,selection_label:'Home',home_team:'Arsenal',away_team:'Chelsea'};
  const evaluated=evaluateSportsbookLeg(leg,{...finished,settlementAuthority:{ft:true,ht:true}});
  assert.equal(evaluated.status,'WON');
});

test('R6.9.0.15 team total and HT/FT evaluator support own-feed markets', () => {
  const event={status:'FINISHED',providerStatus:'FT',home:{score:2},away:{score:1},periodScores:{'1H':{home:1,away:0}},settlementAuthority:{ft:true,ht:true}};
  const base={market_period:'FT',home_team:'Arsenal',away_team:'Chelsea'};
  assert.equal(evaluateSportsbookLeg({...base,market_type:'TEAM_TOTAL',market_line:1.5,selection_label:'Home Over 1.5'},event).status,'WON');
  assert.equal(evaluateSportsbookLeg({...base,market_type:'HT_FT',market_line:null,selection_label:'Home / Home'},event).status,'WON');
});

test('R6.9.0.15 season result URL resolves current cross-year league file', () => {
  assert.equal(__publicMarket.seasonCodeForKickoff('2026-08-23T16:30:00Z'),'2627');
  assert.equal(__publicMarket.resultFileUrl('E0','2026-08-23T16:30:00Z'),'https://www.football-data.co.uk/mmz4281/2627/E0.csv');
});

test('result file cache is pruned by season generation so old seasons cannot accumulate', () => {
  const cache = __publicMarket.resultFileCache;
  cache.clear();
  const old = 'https://www.football-data.co.uk/mmz4281/2122/E0.csv';
  const live = 'https://www.football-data.co.uk/mmz4281/2627/E0.csv';
  const live2 = 'https://www.football-data.co.uk/mmz4281/2627/SP1.csv';
  cache.set(old, { rows: [{ key: 'x' }], fetchedAt: Date.now() });
  cache.set(live, { rows: [], fetchedAt: Date.now() });
  cache.set(live2, { rows: [], fetchedAt: Date.now() });
  assert.equal(__publicMarket.resultFileUrlSeason(old), '2122');
  assert.equal(__publicMarket.resultFileUrlSeason(live), '2627');
  __publicMarket.pruneStaleResultSeasons(new Set(['2627']));
  assert.equal(cache.has(old), false, 'stale season entry must be pruned');
  assert.equal(cache.has(live), true, 'live season entry must survive');
  assert.equal(cache.has(live2), true, 'live season entry must survive');
  cache.clear();
});

test('R6.9.0.15 extra-league fixture page discovers only approved Football-Data CSV links', () => {
  const page = `<html><a href="https://evil.example/fixtures.csv">bad</a><a href="/newfixtures.csv">Download fixtures in CSV format</a></html>`;
  assert.equal(__publicMarket.discoverCsvUrl(page, 'https://www.football-data.co.uk/matches_new_leagues.php'), 'https://www.football-data.co.uk/newfixtures.csv');
});

test('R6.9.0.15 result merge rejects an old same-team rematch result', () => {
  const event = normalizeFootballDataFixture({ Div:'E0', Date:'17/08/2026', Time:'19:00', HomeTeam:'Alpha FC', AwayTeam:'Beta FC', AvgH:'1.90', AvgD:'3.40', AvgA:'4.10', 'Avg>2.5':'1.95', 'Avg<2.5':'1.90' }, { updatedAt:'2026-08-17T08:00:00.000Z' });
  const oldResult = __publicMarket.normalizeResultRow({ Date:'01/01/2026', HomeTeam:'Alpha FC', AwayTeam:'Beta FC', FTHG:'5', FTAG:'0', HTHG:'2', HTAG:'0' });
  const merged = __publicMarket.mergeResults([event], [oldResult]);
  assert.equal(merged[0].status, 'SCHEDULED');
  assert.equal(merged[0].home.score, null);
});


test('R6.9.0.15 OpenFootball parser carries grouped kickoff time and preserves FT/HT result', () => {
  const text = `= English Premier League

▪ Matchday 1
  Fri Aug 14
    20:00  Alpha FC v Beta FC 2-1 (1-0)
  Sat Aug 15
    15:00  Gamma FC v Delta FC
           Echo FC v Foxtrot FC
`;
  const matches = parseOpenFootballText(text, { seasonStartYear: 2026 });
  assert.equal(matches.length, 3);
  assert.equal(matches[0].startTime, '2026-08-14T20:00:00.000Z');
  assert.deepEqual(matches[0].ft, [2, 1]);
  assert.deepEqual(matches[0].ht, [1, 0]);
  assert.equal(matches[1].startTime, '2026-08-15T15:00:00.000Z');
  assert.equal(matches[2].startTime, '2026-08-15T15:00:00.000Z');
});

test('R6.9.0.15 OpenFootball CC0 model creates deterministic non-random 1X2 anchor without commercial key', () => {
  const previous = parseOpenFootballText(`Fri Aug 15\n  20:00 Alpha FC v Beta FC 3-1 (1-0)\nSat Aug 16\n  15:00 Delta FC v Gamma FC 0-2 (0-1)\n`, { seasonStartYear: 2025 });
  const current = parseOpenFootballText(`Fri Aug 14\n  20:00 Alpha FC v Gamma FC 2-0 (1-0)\nSat Aug 15\n  15:00 Beta FC v Delta FC 1-1 (0-0)\n`, { seasonStartYear: 2026 });
  const model = __openFootball.weightedModel(current, previous);
  const a = buildOpenFootballModelAnchor('Alpha FC', 'Delta FC', model, { marginBps: 450 });
  const b = buildOpenFootballModelAnchor('Alpha FC', 'Delta FC', model, { marginBps: 450 });
  assert.deepEqual(a, b);
  assert.equal(a.oneXtwo.book, 'gasterus-open-model');
  assert.ok(a.oneXtwo.home > 1 && a.oneXtwo.draw > 1 && a.oneXtwo.away > 1);
  assert.ok(a.lambdaHome > 0 && a.lambdaAway > 0);
  assert.equal(a.sampleMatches, 4);
});

test('R6.9.0.15 OpenFootball fixture is independently bettable with broad markets and automatic result authority', () => {
  const previous = parseOpenFootballText(`Fri Aug 15\n  20:00 Alpha FC v Beta FC 2-1 (1-0)\nSat Aug 16\n  15:00 Gamma FC v Delta FC 1-2 (0-1)\n`, { seasonStartYear: 2025 });
  const current = parseOpenFootballText(`Fri Aug 14\n  20:00 Alpha FC v Gamma FC 3-0 (2-0)\nSat Aug 15\n  15:00 Beta FC v Delta FC\n`, { seasonStartYear: 2026 });
  const model = __openFootball.weightedModel(current, previous);
  const match = current.find(m => m.home === 'Beta FC');
  const anchor = buildOpenFootballModelAnchor(match.home, match.away, model, { marginBps: 450 });
  const event = normalizeOpenFootballFixture({
    competition: { code:'ENG-PL', league:'Premier League', country:'England' }, match, anchor, updatedAt:'2026-08-17T12:00:00.000Z'
  });
  assert.ok(event);
  assert.equal(event._publicMarketOrigin, 'openfootball-cc0');
  assert.equal(event._sources[0], 'public-market');
  assert.ok(event._settlementReadySources.includes('public-market'));
  const types = new Set(event.markets.map(m => m.type));
  for (const type of ['1X2','HANDICAP','TOTALS','BTTS','DOUBLE_CHANCE','DRAW_NO_BET','TEAM_TOTAL','HT_FT','ODD_EVEN','CORRECT_SCORE']) assert.ok(types.has(type), type);
  const [merged] = __sportsbookProviders.mergeProviderEvents([{ provider:'public-market', enabled:true, events:[event] }]);
  const authority = eventSettlementAuthority(merged);
  assert.equal(authority.ft, true);
  assert.equal(authority.ht, true);
  assert.equal(authority.automaticFt, true);
  assert.ok(merged.markets.some(m => m.period === 'FT' && !m.suspended));
});

test('R6.9.0.15 finished OpenFootball fixture carries score provenance for automatic FT/HT settlement', () => {
  const match = { home:'Alpha FC', away:'Beta FC', startTime:'2026-08-14T20:00:00.000Z', ft:[2,1], ht:[1,0] };
  const event = normalizeOpenFootballFixture({
    competition:{ code:'ENG-PL', league:'Premier League', country:'England' },
    match,
    anchor:{ oneXtwo:{home:1.82,draw:3.65,away:4.5}, lambdaHome:1.7, lambdaAway:1.0, sampleMatches:40 },
    updatedAt:'2026-08-17T12:00:00.000Z'
  });
  assert.equal(event.status, 'FINISHED');
  assert.equal(event.home.score, 2);
  assert.equal(event.away.score, 1);
  assert.deepEqual(event.periodScores['1H'], {home:1,away:0});
  assert.equal(event._publicResultProvenance.source, 'openfootball-cc0');
  const leg={market_type:'1X2',market_period:'FT',market_line:null,selection_label:'Home',home_team:'Alpha FC',away_team:'Beta FC'};
  assert.equal(evaluateSportsbookLeg(leg,{...event,settlementAuthority:{ft:true,ht:true}}).status,'WON');
});

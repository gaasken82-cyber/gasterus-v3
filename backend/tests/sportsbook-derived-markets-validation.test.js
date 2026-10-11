import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@example.com/db',
  REDIS_URL: 'redis://example.com:6379',
  MEMBER_PROXY_SECRET: 'm'.repeat(48),
  ADMIN_PROXY_SECRET: 'a'.repeat(48),
  OPS_INTERNAL_SECRET: 'o'.repeat(48),
  SESSION_HMAC_KEY: 's'.repeat(48),
  API_KEY_PEPPER: 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  PUBLIC_MARKET_DERIVED_MARKETS_ENABLED: 'true',
  PUBLIC_MARKET_DERIVED_MARGIN_BPS: '450'
});

const { config } = await import('../src/config.js');
const { __publicMarket, normalizeFootballDataFixture } = await import('../src/sportsbook-public-market.js');
const { evaluateSportsbookLeg } = await import('../src/sportsbook-result-evaluator.js');
const { publicEvent } = await import('../src/sportsbook-providers.js');
const { projectMemberMarkets } = await import('../src/sportsbook-member-projection.js');

const baseAnchor = {
  oneXtwo: { home: 1.91, draw: 3.65, away: 4.1 },
  total25: null,
  handicap: null
};

function marketsFor(anchor, suffix = '') {
  return __publicMarket.buildDerivedMarkets(`derived-test${suffix}`, anchor, '2026-10-11T12:00:00.000Z');
}

function findMarket(markets, type, period = 'FT', line = null) {
  return markets.find(market => market.type === type && market.period === period && market.line === line);
}

function assertUsableOdds(markets) {
  assert.ok(markets.length > 0, 'expected derived markets');
  for (const market of markets) {
    assert.ok(market.selections.length >= 2, `${market.type} should have at least two selections`);
    for (const selection of market.selections) {
      assert.ok(Number.isFinite(selection.odds), `${market.type}/${selection.label} odds must be finite`);
      assert.ok(selection.odds >= 1.01 && selection.odds <= 250, `${market.type}/${selection.label} odds must be within clamps`);
    }
  }
}

test('derived Poisson markets remain priced for balanced, short-priced, and anchored inputs', () => {
  const scenarios = [
    {
      ...baseAnchor,
      oneXtwo: { home: 2.7, draw: 2.9, away: 2.7 }
    },
    {
      ...baseAnchor,
      oneXtwo: { home: 1.08, draw: 12, away: 40 },
      total25: { over: 1.25, under: 4.2, book: 'test' }
    },
    {
      ...baseAnchor,
      oneXtwo: { home: 2.25, draw: 3.1, away: 3.4 },
      total25: { over: 1.82, under: 2.02, book: 'test' },
      handicap: { line: -0.5, home: 1.94, away: 1.96, book: 'test' }
    },
    {
      ...baseAnchor,
      oneXtwo: { home: 1.01, draw: 999, away: 999 }
    }
  ];

  for (const [index, anchor] of scenarios.entries()) {
    assertUsableOdds(marketsFor(anchor, `-${index}`));
  }
});

test('member event detail projection preserves country and all derived market options', () => {
  const event = normalizeFootballDataFixture({
    Div: 'E0',
    Date: '23/08/2026',
    Time: '16:30',
    HomeTeam: 'Alpha FC',
    AwayTeam: 'Beta FC',
    B365H: '1.91',
    B365D: '3.65',
    B365A: '4.10'
  }, { updatedAt: '2026-08-17T12:00:00.000Z' });
  const apiEvent = publicEvent(event);
  const detailMarkets = projectMemberMarkets(apiEvent.markets);

  assert.equal(apiEvent.country, 'England');
  assert.ok(detailMarkets.length >= 25, `detail market count=${detailMarkets.length}`);
  assert.ok(detailMarkets.some(market => market.type === 'CORRECT_SCORE'));
  assert.ok(detailMarkets.flatMap(market => market.selections).every(selection => Number.isFinite(selection.odds) && selection.odds > 1));
});

test('two-way derived prices apply the configured 4.5% nominal margin', () => {
  assert.equal(config.publicMarketDerivedMarginBps, 450);
  const markets = marketsFor(baseAnchor);
  for (const type of ['BTTS', 'ODD_EVEN']) {
    const market = findMarket(markets, type);
    assert.ok(market, `${type} market should be generated`);
    const impliedProbability = market.selections.reduce((sum, selection) => sum + 1 / selection.odds, 0);
    assert.ok(Math.abs(impliedProbability - 1.045) < 0.003, `${type} overround ${impliedProbability} should be approximately 1.045`);
  }
});

test('configured margin endpoints are honored by the market pricing formula', () => {
  const script = `
    const { config } = await import('./src/config.js');
    const { __publicMarket } = await import('./src/sportsbook-public-market.js');
    const markets = __publicMarket.buildDerivedMarkets('margin-boundary', {
      oneXtwo: { home: 1.91, draw: 3.65, away: 4.1 },
      total25: null,
      handicap: null
    }, '2026-10-11T12:00:00.000Z');
    const pairs = ['BTTS', 'ODD_EVEN'].map(type => {
      const market = markets.find(item => item.type === type);
      return market.selections.reduce((sum, selection) => sum + 1 / selection.odds, 0);
    });
    console.log(JSON.stringify({ marginBps: config.publicMarketDerivedMarginBps, pairs }));
  `;
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@example.com/db',
    REDIS_URL: 'redis://example.com:6379',
    MEMBER_PROXY_SECRET: 'm'.repeat(48),
    ADMIN_PROXY_SECRET: 'a'.repeat(48),
    OPS_INTERNAL_SECRET: 'o'.repeat(48),
    SESSION_HMAC_KEY: 's'.repeat(48),
    API_KEY_PEPPER: 'p'.repeat(48),
    MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
  };

  for (const marginBps of [100, 1200]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: { ...baseEnv, PUBLIC_MARKET_DERIVED_MARGIN_BPS: String(marginBps) }
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout.trim());
    assert.equal(observed.marginBps, marginBps);
    for (const overround of observed.pairs) {
      assert.ok(Math.abs(overround - (1 + marginBps / 10000)) < 0.003,
        `overround ${overround} should track ${marginBps} bps`);
    }
  }
});

test('missing O/U 2.5 uses the fallback and generated correct scores cap at 14', () => {
  const fallbackMarkets = marketsFor({ ...baseAnchor, total25: null });
  const anchoredMarkets = marketsFor({
    ...baseAnchor,
    total25: { over: 1.25, under: 4.2, book: 'test' }
  }, '-with-ou');
  const fallbackOu25 = fallbackMarkets.filter(market => market.type === 'TOTALS' && market.period === 'FT' && market.line === 2.5);
  const anchoredOu25 = anchoredMarkets.filter(market => market.type === 'TOTALS' && market.period === 'FT' && market.line === 2.5);
  assert.equal(fallbackOu25.length, 1, 'fallback should generate the 2.5 total market');
  assert.equal(anchoredOu25.length, 0, 'an anchor O/U 2.5 should suppress its derived duplicate');

  const fallbackOver15 = findMarket(fallbackMarkets, 'TOTALS', 'FT', 1.5).selections.find(selection => selection.label === 'Over 1.5').odds;
  const anchoredOver15 = findMarket(anchoredMarkets, 'TOTALS', 'FT', 1.5).selections.find(selection => selection.label === 'Over 1.5').odds;
  assert.notEqual(fallbackOver15, anchoredOver15, 'fallback heuristic and supplied O/U anchor should produce different total-goal prices');

  const correctScore = findMarket(fallbackMarkets, 'CORRECT_SCORE');
  assert.ok(correctScore);
  assert.equal(correctScore.selections.length, 14);
  assert.equal(new Set(correctScore.selections.map(selection => selection.label)).size, 14);
  assert.ok(correctScore.selections.every(selection => /^\d-\d$/.test(selection.label)));
  assert.ok(correctScore.selections.every((selection, index, choices) => index === 0 || choices[index - 1].odds <= selection.odds),
    'correct-score selections should be ordered from highest to lowest probability');
});

test('supplied Asian Handicap line is not duplicated by derived line generation', () => {
  for (const line of [-0.5, 1.5]) {
    const markets = marketsFor({
      ...baseAnchor,
      handicap: { line, home: 1.94, away: 1.96, book: 'test' }
    }, `-ah-${line}`);
    assert.equal(markets.filter(market => market.type === 'HANDICAP' && market.period === 'FT' && market.line === line).length, 0);
  }
});

test('derived market generation stays within CPU budget for representative fixtures', () => {
  const anchors = Array.from({ length: 100 }, (_, index) => ({
    oneXtwo: { home: 1.6 + (index % 7) / 10, draw: 3.2, away: 4.5 },
    total25: index % 2 ? { over: 1.9, under: 1.95, book: 'test' } : null,
    handicap: null
  }));
  const started = performance.now();
  let generated = 0;
  for (const [index, anchor] of anchors.entries()) generated += marketsFor(anchor, `-perf-${index}`).length;
  const elapsedMs = performance.now() - started;
  assert.ok(generated > 0);
  assert.ok(Number.isFinite(elapsedMs));
  assert.ok(elapsedMs < 2000, `100 fixture generations took ${elapsedMs.toFixed(1)}ms (budget: 2000ms)`);
  assert.ok(Number.isFinite(process.memoryUsage().heapUsed));
});

const finishedEvent = (home, away, halfHome = null, halfAway = null) => ({
  status: 'FINISHED',
  providerStatus: 'FT',
  home: { score: home },
  away: { score: away },
  periodScores: halfHome === null ? {} : { '1H': { home: halfHome, away: halfAway } },
  settlementAuthority: { ft: true, ht: true }
});
const leg = (marketType, selectionLabel, marketLine = null, marketPeriod = 'FT') => ({
  market_type: marketType,
  selection_label: selectionLabel,
  market_line: marketLine,
  market_period: marketPeriod,
  home_team: 'Alpha FC',
  away_team: 'Beta FC'
});

test('derived-market settlement handles Double Chance, DNB refunds, BTTS, and Correct Score', () => {
  const draw = finishedEvent(1, 1);
  assert.equal(evaluateSportsbookLeg(leg('DOUBLE_CHANCE', '1X'), draw).status, 'WON');
  assert.equal(evaluateSportsbookLeg(leg('DOUBLE_CHANCE', '12'), draw).status, 'LOST');
  assert.equal(evaluateSportsbookLeg(leg('DRAW_NO_BET', 'Home'), draw).status, 'PUSH');
  assert.equal(evaluateSportsbookLeg(leg('BTTS', 'Yes'), draw).status, 'WON');
  assert.equal(evaluateSportsbookLeg(leg('BTTS', 'No'), draw).status, 'LOST');
  assert.equal(evaluateSportsbookLeg(leg('CORRECT_SCORE', '1-1'), draw).status, 'WON');
  assert.equal(evaluateSportsbookLeg(leg('CORRECT_SCORE', '2-1'), draw).status, 'LOST');

  const homeWin = finishedEvent(2, 1);
  assert.equal(evaluateSportsbookLeg(leg('DOUBLE_CHANCE', 'X2'), homeWin).status, 'LOST');
  assert.equal(evaluateSportsbookLeg(leg('DRAW_NO_BET', 'Home'), homeWin).status, 'WON');
  assert.equal(evaluateSportsbookLeg(leg('BTTS', 'No'), finishedEvent(2, 0)).status, 'WON');
});

test('derived HT/FT settlement uses both authoritative half-time and full-time scores', () => {
  const event = finishedEvent(2, 1, 0, 1);
  assert.equal(evaluateSportsbookLeg(leg('HT_FT', 'Away / Home'), event).status, 'WON');
  assert.equal(evaluateSportsbookLeg(leg('HT_FT', 'Home / Home'), event).status, 'LOST');

  const missingHalfScore = finishedEvent(2, 1);
  assert.equal(evaluateSportsbookLeg(leg('HT_FT', 'Away / Home'), missingHalfScore), null);
  assert.equal(evaluateSportsbookLeg(leg('HT_FT', 'Away / Home'), {
    ...event,
    settlementAuthority: { ft: false, ht: true }
  }), null);
  assert.equal(evaluateSportsbookLeg(leg('1X2', 'Home', null, '1H'), {
    ...event,
    settlementAuthority: { ft: true, ht: false }
  }), null);
});

test('quarter-line Asian Handicap settlement computes half wins, half losses, and pushes', () => {
  const event = finishedEvent(2, 1);
  assert.equal(evaluateSportsbookLeg(leg('HANDICAP', 'Home', -0.75), event).status, 'HALF_WON');
  assert.equal(evaluateSportsbookLeg(leg('HANDICAP', 'Home', -1.25), event).status, 'HALF_LOST');
  assert.equal(evaluateSportsbookLeg(leg('HANDICAP', 'Home', -1), event).status, 'PUSH');
  assert.equal(evaluateSportsbookLeg(leg('HANDICAP', 'Away', 0.75), event).status, 'HALF_LOST');
});

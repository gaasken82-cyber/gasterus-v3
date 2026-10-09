import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const frontend = readFileSync(new URL('../../frontend/js/sportsbook.js', import.meta.url), 'utf8');
const feed = readFileSync(new URL('../src/sportsbook-feed.js', import.meta.url), 'utf8');

test('member sportsbook lazy-loads complete event market details rather than only compact list markets', () => {
  assert.match(frontend, /const FEED_DETAIL_URL = \(id\) => `\/api\/member\/sportsbook\/events\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(frontend, /await api\.get\(FEED_DETAIL_URL\(eventId\)\)/);
  assert.match(frontend, /function renderAllEventMarkets\(event\)[\s\S]*event\.markets[\s\S]*market\.selections\.map/);
  assert.match(feed, /function memberPublicEvent\(event\)[\s\S]*compactMemberMarkets\(item\.markets \|\| \[\]\)/);
  assert.match(feed, /function memberPublicEventDetail\(event\)[\s\S]*memberEventShape\(item, item\.markets \|\| \[\]\)/);
});

test('detailed markets are refreshed by feed revision and stale odds cannot place a bet during refresh', () => {
  assert.match(feed, /feedRevision: feed\.revision \|\| null/);
  assert.match(frontend, /detailRefreshIds\.add\(eventId\)/);
  assert.match(frontend, /\[\.\.\.selected\.values\(\)\]\.some\(selection => pendingEventDetails\.has\(selection\.eventId\)\)/);
  assert.match(frontend, /requestGeneration !== quoteGeneration/);
  assert.match(frontend, /pendingEventDetails\.has\(selection\.eventId\)\)\) \{\s*showToast\('Odds sedang diperbarui/);
});

test('event cards render only provider-backed primary markets and do not advertise inactive bet builder tabs', () => {
  assert.match(frontend, /import \{ primaryMarketColumns \} from '\.\/sportsbook-markets\.js'/);
  assert.match(frontend, /const fullTimeMarkets = primaryMarketColumns\(e, 'FT'\)/);
  assert.match(frontend, /const firstHalfMarkets = primaryMarketColumns\(e, '1H'\)/);
  assert.match(frontend, /Odds utama belum tersedia dari provider/);
  assert.doesNotMatch(frontend, /<button[^>]*>Bet Builder<\/button>/);
});

test('sports selector options are derived from sports that exist in the live feed', () => {
  assert.match(frontend, /const sports = \[\.\.\.new Set\(list\.map\(\(e\) => e\.sport/);
  assert.match(frontend, /dropdown\.innerHTML = options\.map/);
  assert.doesNotMatch(frontend, /data-sport="Basketball"/);
});

test('sportsbook filters and mix-parlay shortcuts update the actual active betting mode', () => {
  assert.match(frontend, /function setMatchFilter\(filter\)[\s\S]*aria-pressed[\s\S]*renderAll\(\)/);
  assert.match(frontend, /setSlipTab\('parlay'\)/);
  assert.match(frontend, /setMatchFilter\(currentFilter === 'fav' \? 'today' : 'fav'\)/);
  assert.match(frontend, /mixParlayButton\.classList\.toggle\('active', tab === 'parlay'\)/);
});

test('sportsbook does not fabricate live scores and clears suspended or unpriced betslip legs', () => {
  assert.match(frontend, /function scoreText\(score\)[\s\S]*score === null \|\| score === undefined \|\| score === '' \? '—'/);
  assert.match(frontend, /if \(mk\.suspended\) continue/);
  assert.match(frontend, /if \(!sk\.suspended && Number\.isFinite\(odds\) && odds > 1\)/);
});

test('sportsbook event list renders bounded pages and accessible league accordions', () => {
  assert.match(frontend, /const EVENTS_PAGE_SIZE = 30/);
  assert.match(frontend, /data-load-more-events/);
  assert.match(frontend, /aria-expanded="true" aria-controls="sb-league-list-/);
  assert.match(frontend, /leagueHead\.setAttribute\('aria-expanded', String\(!collapsed\)\)/);
});

test('betslip desktop and mobile breakpoints match the visible sidebar breakpoint', () => {
  const styles = readFileSync(new URL('../../frontend/css/pages/sportsbook-v3.css', import.meta.url), 'utf8');
  assert.match(frontend, /const BETSLIP_MOBILE_BREAKPOINT = 860/);
  assert.doesNotMatch(frontend, /innerWidth[^;\n]*1024/);
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*?\.sb-betslip\s*\{\s*display: none/);
  assert.match(styles, /@media \(min-width: 861px\)[\s\S]*?\.sb-bottom-nav\s*\{\s*display: none/);
});

test('zero-valued market lines remain visible in the betslip', () => {
  assert.match(frontend, /marketLine: market\.line \?\? selection\.line \?\? null/);
  assert.match(frontend, /s\.marketLine !== null && s\.marketLine !== undefined/);
});

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

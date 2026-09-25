import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('settlement worker and feed/collector worker are separate processes', () => {
  const launcher = read('deploy/launcher.js');
  const settlement = read('backend/src/worker.js');
  const feed = read('backend/src/feed-worker.js');
  assert.match(launcher, /start\('feed-worker',coreDir,\['src\/feed-worker\.js'\]/);
  assert.match(launcher, /'feed-worker':heapMB\('FEED_WORKER_HEAP_MB',256\)/);
  assert.match(launcher, /isRecoverable = label => \['core', 'worker', 'feed-worker'/);
  assert.doesNotMatch(settlement, /refreshSportsbookFeed|runTotoCollector|DRAW_SCHEDULE/);
  assert.match(feed, /refreshSportsbookFeed/);
  assert.match(feed, /runTotoCollector/);
});

test('sportsbook feed and Redis cache have hard event and byte caps', () => {
  const config = read('backend/src/config.js');
  const feed = read('backend/src/sportsbook-feed.js');
  assert.match(config, /sportsFeedMaxEvents/);
  assert.match(config, /sportsFeedMaxCacheBytes/);
  assert.match(feed, /MAX_FEED_EVENTS/);
  assert.match(feed, /MAX_CACHE_BYTES/);
  assert.match(feed, /cacheWithinLimit/);
  assert.match(feed, /Buffer\.byteLength\(raw, 'utf8'\) > MAX_CACHE_BYTES/);
});

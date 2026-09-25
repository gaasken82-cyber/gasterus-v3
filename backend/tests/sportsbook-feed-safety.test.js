import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const feed = readFileSync(new URL('../src/sportsbook-feed.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../frontend/js/sportsbook.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('stale Sportsbook feed cache is read-only and cannot be settled', () => {
  assert.match(feed, /sportsbook:aggregated-feed:v11/);
  assert.match(feed, /READ_ONLY_STALE_SOURCE/);
  assert.match(feed, /feed\.readOnlySource \|\| feed\.snapshotFallback/);
  assert.match(feed, /SPORTS_SETTLEMENT_SOURCE_STALE/);
});

test('Sportsbook member UI disables every READ_ONLY source mode', () => {
  assert.match(ui,/readOnly|degraded|stale/i);
  assert.doesNotMatch(ui, /state\.source\?\.mode === 'READ_ONLY_SNAPSHOT'/);
});


const feedWorker = readFileSync(new URL('../src/feed-worker.js', import.meta.url), 'utf8');

test('Sportsbook feed is refreshed continuously by the isolated feed worker', () => {
  assert.doesNotMatch(worker, /refreshSportsbookFeed/);
  assert.doesNotMatch(worker, /runTotoCollector/);
  assert.match(feedWorker, /refreshSportsbookFeed/);
  assert.match(feedWorker, /sportsSourceBackgroundPollEnabled/);
  assert.match(feedWorker, /sportsFeedRefreshSeconds \* 1000/);
  assert.match(feedWorker, /feed-worker-background-poll/);
  assert.match(feed, /readRedisCache\(\)/);
  assert.match(feed, /Number\(cached\.fetchedAt/);
});

test('failed Sportsbook background refresh immediately suspends cached odds and persists read-only state', () => {
  const feedSource = readFileSync(new URL('../src/sportsbook-feed.js', import.meta.url), 'utf8');
  assert.match(feedSource, /async function markCachedFeedReadOnly/);
  assert.match(feedSource, /const readOnlyEvents = suspendedEvents\(memory\.events\)/);
  assert.match(feedSource, /events:\s*readOnlyEvents/);
  assert.match(feedSource, /readOnlySource:\s*true/);
  assert.match(feedSource, /await writeRedisCache\(memory\)/);
});

test('background poll guard skips an overlapping cycle instead of queueing it', () => {
  assert.match(feed, /let backgroundPollInFlight = false;/);
  assert.match(feed, /export async function refreshSportsbookFeedFromPoll/);
  assert.match(feed, /if \(backgroundPollInFlight\)/);
  assert.match(feed, /Sportsbook background poll skipped; previous cycle still running/);
  assert.match(feed, /backgroundPollInFlight = true;/);
  assert.match(feed, /backgroundPollInFlight = false;/);
  // the poll call site must use the guarded entry point, not the raw one
  assert.match(feedWorker, /refreshSportsbookFeedFromPoll\(\{ reason: 'feed-worker-background-poll' \}\)/);
  assert.doesNotMatch(feedWorker, /refreshSportsbookFeed\(\{ reason: 'feed-worker-background-poll' \}\)/);
});

test('Redis refresh-lock outage falls back to the in-process guard instead of running unguarded', () => {
  assert.match(feed, /let refreshInFlight = null;/);
  assert.match(feed, /async function performWithInProcessGuard/);
  assert.match(feed, /if \(!redis\.isOpen\) return performWithInProcessGuard\(reason\);/);
  assert.match(feed, /if \(held === null\) return performWithInProcessGuard\(reason\);/);
  assert.match(feed, /if \(!redis\.isOpen\) return null;/);
  assert.match(feed, /falling back to in-process guard/);
  // must NOT silently allow an unguarded refresh any more
  assert.doesNotMatch(feed, /proceeding without cross-process guard/);
  assert.doesNotMatch(feed, /if \(!redis\.isOpen\) return performRefresh\(\{ reason \}\);/);
});

test('Sportsbook feed distinguishes priced markets from settlement-safe bettable markets', () => {
  assert.match(feed, /function pricedMarketCount/);
  assert.match(feed, /function bettableMarketCount/);
  assert.match(feed, /SPORTS_PRICED_READ_ONLY/);
  assert.match(feed, /READ_ONLY_PRICED_NO_SETTLEMENT_AUTHORITY/);
  assert.match(feed, /primaryPricingProvider/);
});

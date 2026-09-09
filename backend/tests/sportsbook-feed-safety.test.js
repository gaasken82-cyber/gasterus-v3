import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const feed = readFileSync(new URL('../src/sportsbook-feed.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../member/public/sportsbook.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('stale Sportsbook feed cache is read-only and cannot be settled', () => {
  assert.match(feed, /sportsbook:aggregated-feed:v11/);
  assert.match(feed, /READ_ONLY_STALE_SOURCE/);
  assert.match(feed, /feed\.readOnlySource \|\| feed\.snapshotFallback/);
  assert.match(feed, /SPORTS_SETTLEMENT_SOURCE_STALE/);
});

test('Sportsbook member UI disables every READ_ONLY source mode', () => {
  assert.match(ui, /startsWith\('READ_ONLY_'\)/);
  assert.doesNotMatch(ui, /state\.source\?\.mode === 'READ_ONLY_SNAPSHOT'/);
});


test('Sportsbook feed is refreshed continuously by the consolidated worker', () => {
  assert.match(worker, /refreshSportsbookFeed/);
  assert.match(worker, /sportsSourceBackgroundPollEnabled/);
  assert.match(worker, /sportsFeedRefreshSeconds \* 1000/);
  assert.match(worker, /worker-background-poll/);
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

test('Sportsbook feed distinguishes priced markets from settlement-safe bettable markets', () => {
  assert.match(feed, /function pricedMarketCount/);
  assert.match(feed, /function bettableMarketCount/);
  assert.match(feed, /SPORTS_PRICED_READ_ONLY/);
  assert.match(feed, /READ_ONLY_PRICED_NO_SETTLEMENT_AUTHORITY/);
  assert.match(feed, /primaryPricingProvider/);
});

const railwayBaseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : '';
const baseUrl = String(process.env.SPORTSBOOK_BASE_URL || railwayBaseUrl || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const requestTimeoutMs = 15000;
const minimumEvents = 12;
const minimumDerivedMarkets = 25;

async function getJson(path) {
  const url = new URL(path, `${baseUrl}/`);
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    throw new Error(`Unable to reach ${url}: ${error.message}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code || 'HTTP_ERROR';
    const message = payload?.error?.message || response.statusText;
    throw new Error(`GET ${path} returned ${response.status} (${code}): ${message}`);
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error(`GET ${path} returned an unexpected JSON envelope`);
  }
  return payload.data;
}

function displayLeague(event) {
  const league = String(event?.league || 'Match').trim();
  const category = typeof event?.category === 'string'
    ? event.category
    : event?.category?.name || event?.category?.label;
  const country = String(event?.country || category || '').trim();
  if (!country || league.toLowerCase().startsWith(`${country.toLowerCase()} -`)) return league.toUpperCase();
  return `${country} - ${league}`.toUpperCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run sportsbook E2E with NODE_ENV=production');
  }

  const snapshot = await getJson('/api/member/sportsbook/events');
  assert(Array.isArray(snapshot.events), 'events endpoint payload.data.events must be an array');
  assert(snapshot.events.length >= minimumEvents,
    `events endpoint returned ${snapshot.events.length} events; expected at least ${minimumEvents}`);

  const labeledEvents = snapshot.events.filter(event => String(event.country || event.category || '').trim() && String(event.league || '').trim());
  assert(labeledEvents.length > 0, 'No event includes both a league and country/category in the API payload');
  const labelSample = {
    country: labeledEvents[0].country || labeledEvents[0].category,
    league: labeledEvents[0].league,
    displayLeague: displayLeague(labeledEvents[0])
  };
  assert(labelSample.displayLeague.includes(' - '), `formatted league label is missing country separator: ${labelSample.displayLeague}`);

  const oneXtwoEvents = snapshot.events.filter(event =>
    (event.markets || []).some(market => market.type === '1X2' && market.period === 'FT')
  );
  assert(oneXtwoEvents.length >= minimumEvents,
    `Only ${oneXtwoEvents.length} events include a full-time 1X2 market; expected at least ${minimumEvents}`);

  const inspected = [];
  for (const event of oneXtwoEvents.slice(0, 12)) {
    const detail = await getJson(`/api/member/sportsbook/events/${encodeURIComponent(event.id)}`);
    const fullEvent = detail.event;
    assert(fullEvent?.id === event.id, `event detail did not match requested event ${event.id}`);
    const markets = fullEvent.markets || [];
    const marketTypes = [...new Set(markets.map(market => market.type))];
    const hasDerivedTypes = ['BTTS', 'DOUBLE_CHANCE', 'DRAW_NO_BET', 'CORRECT_SCORE']
      .every(type => marketTypes.includes(type));
    inspected.push({
      id: fullEvent.id,
      country: fullEvent.country || fullEvent.category || null,
      league: fullEvent.league,
      marketCount: markets.length,
      marketTypes,
      hasDerivedTypes
    });
  }

  const invalidEvents = inspected.filter(event =>
    event.marketCount < minimumDerivedMarkets || !event.hasDerivedTypes
  );
  assert(invalidEvents.length === 0,
    `Derived-market validation failed for ${invalidEvents.length}/${inspected.length} inspected events: ${JSON.stringify(invalidEvents)}`);
  console.log(JSON.stringify({
    status: 'PASS',
    baseUrl,
    eventListCount: snapshot.events.length,
    inspectedEventCount: inspected.length,
    sourceMode: snapshot.source?.mode || null,
    leagueLabel: labelSample,
    derivedMarketEvents: inspected.map(event => ({
      id: event.id,
      country: event.country,
      league: event.league,
      displayLeague: displayLeague(event),
      marketCount: event.marketCount,
      hasDerivedTypes: event.hasDerivedTypes,
      marketTypes: event.marketTypes
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(`Sportsbook E2E verification failed: ${error.message}`);
  process.exitCode = 1;
});

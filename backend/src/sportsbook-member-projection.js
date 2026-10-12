function clean(value) { return String(value ?? '').trim(); }

const MEMBER_MARKET_SOURCE_LABELS = Object.freeze({
  'api-sports': 'API-Sports',
  'the-odds-api': 'The Odds API',
  sharpapi: 'SharpAPI',
  'public-market': 'Gasterus Market Feed',
  'footballdata-io': 'FootballData.io',
  sportmonks: 'Sportmonks'
});

export function projectMemberMarkets(markets = []) {
  return (markets || []).map(market => ({
    id: market.id,
    type: market.type,
    label: market.label,
    period: market.period,
    line: market.line,
    suspended: market.suspended,
    mainLine: market.mainLine ?? null,
    bookmaker: market.bookmaker || null,
    sourceLabel: MEMBER_MARKET_SOURCE_LABELS[clean(market.source).toLowerCase()] || null,
    selections: (market.selections || []).map(selection => ({
      key: selection.key,
      label: selection.label,
      odds: selection.odds,
      line: selection.line,
      suspended: selection.suspended,
      priceVersion: selection.priceVersion
    }))
  }));
}

export const MEMBER_HIDDEN_TOTO_MARKETS = new Set([]);

export const MEMBER_VISIBLE_TOTO_MARKET_COUNT = 85;

export function memberMarketVisible(market) {
  return Boolean(market) && !MEMBER_HIDDEN_TOTO_MARKETS.has(String(market.slug || ''));
}

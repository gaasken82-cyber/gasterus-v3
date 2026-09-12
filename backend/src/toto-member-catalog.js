// NZ regional pools disabled (product decision): they have no reliable live
// source — Vegasnet does not carry them and their only boards are dead — so they
// are hidden from the member catalog. Rows stay in DB (FK integrity for history)
// but are closed + betting-suspended via migration 020.
export const MEMBER_HIDDEN_TOTO_MARKETS = new Set([
  'auckland-pool', 'christchurch-pool', 'napier-hasti-pool', 'wellington-pool',
  'tauranga-pool', 'nelson-pool', 'invercargill-pool', 'queenstown-pool',
  'rotorua-pool', 'new-plymouth-pool', 'gisborne-pool'
]);

export const MEMBER_VISIBLE_TOTO_MARKET_COUNT = 74;

export function memberMarketVisible(market) {
  return Boolean(market) && !MEMBER_HIDDEN_TOTO_MARKETS.has(String(market.slug || ''));
}

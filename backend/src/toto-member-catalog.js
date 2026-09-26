// Pool yang tidak pernah ada di widgets.vegasnet.info — sumber TOTO tunggal kita.
// Prague/Seattle/Medellin/Emerald/Whang Rei/Palmerston/Dunedin/Hamilton/
// Belize/Merida tidak punya baris di VegasNet, jadi tidak bisa punya angka.
// Baris di tabel markets tetap ada (riwayat bet tetap utuh) tetapi tidak
// pernah diumumkan sebagai BUKA supaya member tidak melihat pasar kosong.
export const MEMBER_HIDDEN_TOTO_MARKETS = new Set([
  'auckland-pool', 'christchurch-pool', 'napier-hasti-pool', 'wellington-pool',
  'tauranga-pool', 'nelson-pool', 'invercargill-pool', 'queenstown-pool',
  'rotorua-pool', 'new-plymouth-pool', 'gisborne-pool',
  'prague-pool', 'seattle-pool', 'medellin-pool', 'emerlad-pool',
  'whang-rei-pool', 'palmerston-pool', 'dunedin-pool', 'hamilton-pool',
  'belize-mor-pool', 'belize-mid-pool', 'belize-eve-pool', 'belize-night-pool',
  'merida-mor-pool', 'merida-mid-pool', 'merida-eve-pool', 'merida-night-pool'
]);

export const MEMBER_VISIBLE_TOTO_MARKET_COUNT = 58;

export function memberMarketVisible(market) {
  return Boolean(market) && !MEMBER_HIDDEN_TOTO_MARKETS.has(String(market.slug || ''));
}

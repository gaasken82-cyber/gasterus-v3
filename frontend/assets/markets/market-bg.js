/**
 * Market Background Mapping
 * 
 * marketCode → { bgImage, fallback, category }
 * 
 * Priority:
 *   1. marketCode specific (misal: "SG" → sg.svg)
 *   2. category fallback (misal: "ASIA" → asia.svg)
 *   3. default fallback (default.svg)
 */

const MARKET_BG_MAP = {
  // ===== ASIA =====
  "SG":  { bg: "markets/sg.svg",       fallback: "markets/asia.svg",    name: "Singapore Pool" },
  "HK":  { bg: "markets/hk.svg",       fallback: "markets/asia.svg",    name: "Hongkong Pool" },
  "SYD": { bg: "markets/syd.svg",      fallback: "markets/asia.svg",    name: "Sydney Pool" },
  "SP":  { bg: "markets/sp.svg",       fallback: "markets/asia.svg",    name: "Singapore Pools" },
  "4D":  { bg: "markets/macau.svg",    fallback: "markets/asia.svg",    name: "4D Macau Pool" },
  "5D":  { bg: "markets/macau.svg",    fallback: "markets/asia.svg",    name: "5D Macau Pool" },
  "CMD": { bg: "markets/cambodia.svg", fallback: "markets/asia.svg",    name: "Cambodia" },
  "MY":  { bg: "markets/malaysia.svg", fallback: "markets/asia.svg",    name: "Malaysia" },
  "TH":  { bg: "markets/thailand.svg", fallback: "markets/asia.svg",    name: "Thailand" },
  "VN":  { bg: "markets/vietnam.svg",  fallback: "markets/asia.svg",    name: "Vietnam" },
  "ID":  { bg: "markets/indonesia.svg",fallback: "markets/asia.svg",    name: "Indonesia" },
  
  // ===== AMERICA =====
  "NP":  { bg: "markets/ny.svg",       fallback: "markets/america.svg", name: "New York Pool" },
  "WP":  { bg: "markets/wellington.svg",fallback: "markets/america.svg",name: "Wellington Pool" },
  "USDC": { bg: "markets/washington-dc.svg", fallback: "markets/america.svg", name: "Washington DC" },
  "USMD": { bg: "markets/maryland.svg", fallback: "markets/america.svg", name: "Maryland" },
  "USVA": { bg: "markets/virginia.svg", fallback: "markets/america.svg", name: "Virginia" },
  "USDE": { bg: "markets/delaware.svg", fallback: "markets/america.svg", name: "Delaware" },
  "USNC": { bg: "markets/north-carolina.svg", fallback: "markets/america.svg", name: "North Carolina" },
  
  // ===== EUROPE =====
  "UK":  { bg: "markets/united-kingdom.svg", fallback: "markets/europe.svg", name: "United Kingdom" },
  "DE":  { bg: "markets/germany.svg", fallback: "markets/europe.svg", name: "Germany" },
  "FR":  { bg: "markets/france.svg", fallback: "markets/europe.svg", name: "France" },
  "IT":  { bg: "markets/italy.svg", fallback: "markets/europe.svg", name: "Italy" },
  
  // ===== OTHERS / DEFAULT =====
  "DEFAULT": { bg: "markets/default.svg", fallback: "markets/default.svg", name: "Pasaran" }
};

/**
 * Get background info for a market
 * @param {string} marketCode - Market code from markets.seed.json
 * @returns {Object|null} Background mapping or null
 */
export function getMarketBackground(marketCode) {
  if (!marketCode) return null;
  
  // Direct lookup by code (uppercase)
  const code = marketCode.trim().toUpperCase();
  const direct = MARKET_BG_MAP[code];
  if (direct) return direct;
  
  // Return default fallback
  return MARKET_BG_MAP["DEFAULT"];
}

/**
 * Get all unique categories that have backgrounds
 */
export function getAvailableCategories() {
  const categories = new Set();
  for (const info of Object.values(MARKET_BG_MAP)) {
    if (info.fallback) {
      const match = info.fallback.match(/markets\/(\w+)\.svg/);
      if (match) categories.add(match[1].toUpperCase());
    }
  }
  return Array.from(categories);
}

export default MARKET_BG_MAP;

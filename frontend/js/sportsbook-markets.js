const MARKET_PRIORITY = { HANDICAP: 0, TOTALS: 1, '1X2': 2 };
const MARKET_NAMES = { HANDICAP: 'Asian Handicap', TOTALS: 'Over / Under', '1X2': '1X2' };

export function primaryMarketColumns(event, period) {
  const requestedPeriod = String(period || 'FT').toUpperCase();
  const seenCoreTypes = new Set();
  const markets = Array.isArray(event?.markets) ? event.markets : [];
  return markets
    .filter((market) => !market.suspended &&
      String(market.period || 'FT').toUpperCase() === requestedPeriod &&
      Array.isArray(market.selections) && market.selections.length)
    .sort((a, b) => (MARKET_PRIORITY[String(a.type || '').toUpperCase()] ?? 99) -
      (MARKET_PRIORITY[String(b.type || '').toUpperCase()] ?? 99))
    .filter((market) => {
      const type = String(market.type || '').toUpperCase();
      if (!Object.hasOwn(MARKET_PRIORITY, type)) return true;
      if (seenCoreTypes.has(type)) return false;
      seenCoreTypes.add(type);
      return true;
    })
    .map((market) => {
      const type = String(market.type || '').toUpperCase();
      return {
        title: MARKET_NAMES[type] || market.label || market.type || 'Pasar',
        market,
        outcomes: market.selections.map((selection, index) => {
          const text = `${selection.label || ''} ${selection.key || ''}`.trim().toLowerCase();
          const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
          let label = selection.label || selection.key || `Pilihan ${index + 1}`;
          if (type === 'HANDICAP') {
            label = tokens.includes('home') || tokens.includes('1') ? '1' :
              tokens.includes('away') || tokens.includes('2') ? '2' : label;
          } else if (type === 'TOTALS') {
            label = tokens.includes('over') || tokens.includes('o') ? 'O' :
              tokens.includes('under') || tokens.includes('u') ? 'U' : label;
          } else if (type === '1X2') {
            label = tokens.includes('home') || tokens.includes('1') ? '1' :
              tokens.includes('draw') || tokens.includes('x') ? 'X' :
                tokens.includes('away') || tokens.includes('2') ? '2' : label;
          }
          return [label, selection];
        })
      };
    });
}

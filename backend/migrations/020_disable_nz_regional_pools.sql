-- Disable NZ regional pools (product decision).
-- Vegasnet does not carry Auckland/Christchurch/Napier/Wellington/Tauranga/Nelson/
-- Invercargill/Queenstown/Rotorua/New Plymouth/Gisborne and their only aggregator
-- boards (cindototo/sumtoto/miototo/datatoto/masterlive) are dead, so there is no
-- stable auto-source. We keep the market ROWS (FK integrity for historical bets)
-- but mark them closed + suspend betting so they disappear from the active catalog,
-- the public market list (listMarkets filters status<>'closed') and the member area
-- (MEMBER_HIDDEN_TOTO_MARKETS).

UPDATE market_betting_configs c
SET betting_status = 'SUSPENDED', close_at = now()
WHERE c.market_id IN (
  SELECT id FROM markets
  WHERE slug IN ('auckland-pool','christchurch-pool','napier-hasti-pool','wellington-pool',
                 'tauranga-pool','nelson-pool','invercargill-pool','queenstown-pool',
                 'rotorua-pool','new-plymouth-pool','gisborne-pool')
);

UPDATE markets
SET status = 'closed', updated_at = now()
WHERE slug IN ('auckland-pool','christchurch-pool','napier-hasti-pool','wellington-pool',
               'tauranga-pool','nelson-pool','invercargill-pool','queenstown-pool',
               'rotorua-pool','new-plymouth-pool','gisborne-pool');
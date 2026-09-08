-- R6.9.0.23 V20 HF14: separate betting lifecycle from result lifecycle.
-- markets.period remains the result/draw period published by the authority collector.
-- market_betting_configs.betting_period is the future/current period accepted from members.
ALTER TABLE market_betting_configs
  ADD COLUMN IF NOT EXISTS betting_period TEXT;

-- Existing deployments used markets.period for both result and betting periods.  That value can
-- already point to a completed draw, therefore do not silently migrate it into a new betting
-- period.  Fail closed until an operator explicitly assigns the next period and close time.
UPDATE market_betting_configs
SET betting_status='SUSPENDED', updated_at=now()
WHERE betting_status='OPEN'
  AND (betting_period IS NULL OR btrim(betting_period)='');

CREATE INDEX IF NOT EXISTS market_betting_configs_open_period_idx
  ON market_betting_configs(betting_status, betting_period, close_at);

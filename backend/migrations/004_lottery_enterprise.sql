ALTER TABLE market_betting_configs
  ADD COLUMN IF NOT EXISTS max_payout_per_order BIGINT NOT NULL DEFAULT 2000000000;

CREATE TABLE IF NOT EXISTS lottery_game_configs (
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  game_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  payout_multiplier NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (payout_multiplier >= 0),
  max_stake_per_selection BIGINT NOT NULL DEFAULT 0 CHECK (max_stake_per_selection >= 0),
  selection_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, game_code)
);
CREATE INDEX IF NOT EXISTS lottery_game_configs_enabled_idx ON lottery_game_configs(market_id,enabled,game_code);

INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_2D',TRUE,discount_2d,payout_2d,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO NOTHING;
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_3D',TRUE,discount_3d,payout_3d,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO NOTHING;
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_4D',TRUE,discount_4d,payout_4d,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO NOTHING;

INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT c.market_id,g.game_code,FALSE,0,0,c.max_stake_per_item
FROM market_betting_configs c
CROSS JOIN (VALUES
 ('POSITION_2D_FRONT'),('POSITION_2D_MIDDLE'),('COLOK_BEBAS'),('COLOK_2D'),('COLOK_NAGA'),('COLOK_JITU'),
 ('TENGAH_TEPI'),('DASAR'),('SILANG_HOMO'),('KEMBANG_KEMPIS'),('KOMBINASI'),('SHIO'),('MACAU_SHIO'),('FIFTY_GENERAL')
) AS g(game_code)
ON CONFLICT(market_id,game_code) DO NOTHING;

ALTER TABLE bet_items ALTER COLUMN payout_multiplier TYPE NUMERIC(12,4) USING payout_multiplier::numeric;
ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS game_code TEXT;
ALTER TABLE bet_items ADD COLUMN IF NOT EXISTS selection_value TEXT;
UPDATE bet_items SET game_code=CASE bet_type WHEN '4D' THEN 'STRAIGHT_4D' WHEN '3D' THEN 'STRAIGHT_3D' ELSE 'STRAIGHT_2D' END WHERE game_code IS NULL;
UPDATE bet_items SET selection_value=number_value WHERE selection_value IS NULL;
ALTER TABLE bet_items ALTER COLUMN game_code SET NOT NULL;
ALTER TABLE bet_items ALTER COLUMN selection_value SET NOT NULL;
ALTER TABLE bet_items DROP CONSTRAINT IF EXISTS bet_items_order_id_bet_type_number_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS bet_items_order_game_selection_idx ON bet_items(order_id,game_code,selection_value);
CREATE INDEX IF NOT EXISTS bet_items_game_selection_idx ON bet_items(game_code,selection_value);

CREATE TABLE IF NOT EXISTS lottery_selection_limits (
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  game_code TEXT NOT NULL,
  selection_value TEXT NOT NULL,
  max_stake BIGINT NOT NULL CHECK (max_stake >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LIMITED','SOLD_OUT','SUSPENDED')),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(market_id,period,game_code,selection_value)
);

CREATE TABLE IF NOT EXISTS market_result_details (
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  first_prize TEXT,
  second_prize TEXT,
  third_prize TEXT,
  special_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  consolation_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  source_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(market_id,period)
);
CREATE INDEX IF NOT EXISTS market_result_details_market_idx ON market_result_details(market_id,updated_at DESC);

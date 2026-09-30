-- R6.8.21 TOTO professional betting flow / standard pricing
-- Gross BET is the prize basis. Discount only changes the amount debited from member balance.

-- Batas diskon dinaikkan ke 0-90 supaya konstanta TOTO_STANDARD_RULES (66 untuk
-- 4D, 59 untuk 3D) benar-benar bisa tersimpan. DROP IF EXISTS dipakai supaya
-- migrasi ini aman untuk database baru (constraint inline dari 001) maupun database
-- lama. Batas final satu acuan dipasang lagi di 036.
ALTER TABLE market_betting_configs DROP CONSTRAINT IF EXISTS market_betting_configs_discount_2d_check;
ALTER TABLE market_betting_configs ADD CONSTRAINT market_betting_configs_discount_2d_check CHECK (discount_2d BETWEEN 0 AND 90);
ALTER TABLE market_betting_configs DROP CONSTRAINT IF EXISTS market_betting_configs_discount_3d_check;
ALTER TABLE market_betting_configs ADD CONSTRAINT market_betting_configs_discount_3d_check CHECK (discount_3d BETWEEN 0 AND 90);
ALTER TABLE market_betting_configs DROP CONSTRAINT IF EXISTS market_betting_configs_discount_4d_check;
ALTER TABLE market_betting_configs ADD CONSTRAINT market_betting_configs_discount_4d_check CHECK (discount_4d BETWEEN 0 AND 90);

ALTER TABLE lottery_game_configs DROP CONSTRAINT IF EXISTS lottery_game_configs_discount_percent_check;
ALTER TABLE lottery_game_configs ADD CONSTRAINT lottery_game_configs_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 90);

ALTER TABLE market_betting_configs ALTER COLUMN min_stake SET DEFAULT 100;
ALTER TABLE market_betting_configs ALTER COLUMN discount_2d SET DEFAULT 29;
ALTER TABLE market_betting_configs ALTER COLUMN discount_3d SET DEFAULT 59;
ALTER TABLE market_betting_configs ALTER COLUMN discount_4d SET DEFAULT 66;
ALTER TABLE market_betting_configs ALTER COLUMN payout_2d SET DEFAULT 70;
ALTER TABLE market_betting_configs ALTER COLUMN payout_3d SET DEFAULT 400;
ALTER TABLE market_betting_configs ALTER COLUMN payout_4d SET DEFAULT 3000;

UPDATE market_betting_configs
SET min_stake=100,
    discount_2d=29,
    discount_3d=59,
    discount_4d=66,
    payout_2d=70,
    payout_3d=400,
    payout_4d=3000,
    updated_at=now();

INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_4D',TRUE,66,3000,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO UPDATE SET enabled=TRUE,discount_percent=66,payout_multiplier=3000,max_stake_per_selection=excluded.max_stake_per_selection,updated_at=now();
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_3D',TRUE,59,400,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO UPDATE SET enabled=TRUE,discount_percent=59,payout_multiplier=400,max_stake_per_selection=excluded.max_stake_per_selection,updated_at=now();
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'STRAIGHT_2D',TRUE,29,70,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO UPDATE SET enabled=TRUE,discount_percent=29,payout_multiplier=70,max_stake_per_selection=excluded.max_stake_per_selection,updated_at=now();
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'POSITION_2D_FRONT',TRUE,28,65,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO UPDATE SET enabled=TRUE,discount_percent=28,payout_multiplier=65,max_stake_per_selection=excluded.max_stake_per_selection,updated_at=now();
INSERT INTO lottery_game_configs(market_id,game_code,enabled,discount_percent,payout_multiplier,max_stake_per_selection)
SELECT market_id,'POSITION_2D_MIDDLE',TRUE,28,65,max_stake_per_item FROM market_betting_configs
ON CONFLICT(market_id,game_code) DO UPDATE SET enabled=TRUE,discount_percent=28,payout_multiplier=65,max_stake_per_selection=excluded.max_stake_per_selection,updated_at=now();

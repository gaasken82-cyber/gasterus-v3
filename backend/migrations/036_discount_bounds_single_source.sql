-- Satu acuan bound diskon: 0 sampai 90.
--
-- Latar belakang: TOTO_STANDARD_RULES memakai diskon 66 (4D) dan 59 (3D), dan
-- updateBettingConfig() menuliskan konstanta itu apa adanya ke
-- market_betting_configs. Migration 008 sudah menaikkan batasnya ke 0-90, tetapi
-- CHECK inline di 001_platform.sql dan 004_lottery_enterprise.sql masih 0-50.
-- consequence untuk database baru: dua CHECK dengan batas berbeda hidup
-- bersamaan, dan yang ketat menang sehingga diskon 66/59 tidak bisa tersimpan.
--
-- Migrasi ini menghapus SEMUA CHECK diskon yang ada (batas lama maupun dari 008)
-- lalu memasang satu batas tegas 0-90. Idempoten: dijalankan dua kali tetap
-- menghasilkan hasil sama karena CHECK lama ikut dibuang lebih dulu.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('market_betting_configs'::regclass, 'lottery_game_configs'::regclass)
      AND (
        pg_get_constraintdef(oid) ILIKE '%discount_2d%'
        OR pg_get_constraintdef(oid) ILIKE '%discount_3d%'
        OR pg_get_constraintdef(oid) ILIKE '%discount_4d%'
        OR pg_get_constraintdef(oid) ILIKE '%discount_percent%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE market_betting_configs DROP CONSTRAINT IF EXISTS market_betting_configs_discount_bounds;
ALTER TABLE market_betting_configs ADD CONSTRAINT market_betting_configs_discount_bounds
  CHECK (discount_2d BETWEEN 0 AND 90 AND discount_3d BETWEEN 0 AND 90 AND discount_4d BETWEEN 0 AND 90);

ALTER TABLE lottery_game_configs DROP CONSTRAINT IF EXISTS lottery_game_configs_discount_bounds;
ALTER TABLE lottery_game_configs ADD CONSTRAINT lottery_game_configs_discount_bounds
  CHECK (discount_percent BETWEEN 0 AND 90);
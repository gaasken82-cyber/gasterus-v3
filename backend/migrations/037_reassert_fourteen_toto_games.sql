-- Nyalakan ulang 14 game togel secara deterministik di SETIAP pasar yang 4D-nya
-- bisa dimainkan, dan pastikan baris game lanjutan benar-benar ADA dengan harga
-- produksi.
--
-- LATAR BELANG
-- 033 dan 034 sama-sama bekerja pada baris yang DIASUMSIKAN sudah ada:
--   033 hanya mengubah payout_multiplier game lanjutan
--   034 hanya menyalakan game lanjutan yang payout_multiplier > 0
-- ensureLotteryConfigs() di backend/src/markets.js juga hanya UPDATE baris yang
-- multiplier-nya masih 0 - ia tidak pernah INSERT baris game lanjutan.
-- Di pasar yang baris game lanjutannya belum pernah terbentuk, tidak ada satu
-- pun langkah itu yang berefek: 033 tidak mengubah apa pun, 034 tidak menyalakan
-- apa pun, ensureLotteryConfigs() tidak menemukan barisnya. Member lalu hanya
-- melihat game dasar padahal katalog punya 15 game siap dimainkan.
--
-- Migration ini menutup celah itu dengan urutan aman:
--   1. INSERT baris game lanjutan yang belum ada, dengan harga produksi yang sama
--      dengan TOTO_ADVANCED_GAME_RATES di backend/src/lottery-games.js.
--   2. Isi harga HANYA pada baris yang belum punya harga (multiplier 0). Baris
--      yang sudah ditune operator dari Lottery Control tidak ditimpa.
--   3. Nyalakan 14 game pada pasar yang STRAIGHT_4D-nya aktif dan berHarga.
--
-- Kriteria aman: hanya pasar tempat permainan berbasis 4D bisa settlement, jadi
-- tidak ada game yang dinyalakan di pasar yang tidak bisa enforcing hasilnya.
-- Idempoten: aman dijalankan berkali-kali.

-- 1) Pastikan baris game lanjutan ADA di setiap pasar.
INSERT INTO lottery_game_configs (market_id, game_code, enabled, discount_percent, payout_multiplier, max_stake_per_selection)
SELECT c.market_id, v.game_code, FALSE, v.discount_percent, v.payout_multiplier, c.max_stake_per_item
FROM market_betting_configs c
CROSS JOIN (VALUES
    ('COLOK_BEBAS',      5,  1.5),
    ('COLOK_2D',        15,  7.7),
    ('COLOK_NAGA',      15, 36.7),
    ('COLOK_JITU',       5,  7.5),
    ('TENGAH_TEPI',      4,  1.5),
    ('DASAR',            4,  1.3),
    ('SILANG_HOMO',      4,  1.5),
    ('KEMBANG_KEMPIS',   4,  1.6),
    ('KOMBINASI',        4,  3.0)
  ) AS v(game_code, discount_percent, payout_multiplier)
ON CONFLICT (market_id, game_code) DO NOTHING;

-- 2) Isi harga pada baris yang belum pernah diberi harga saja (multiplier 0).
UPDATE lottery_game_configs g
SET payout_multiplier = v.payout_multiplier,
    discount_percent  = v.discount_percent,
    updated_at        = now()
FROM (VALUES
    ('COLOK_BEBAS',      5,  1.5),
    ('COLOK_2D',        15,  7.7),
    ('COLOK_NAGA',      15, 36.7),
    ('COLOK_JITU',       5,  7.5),
    ('TENGAH_TEPI',      4,  1.5),
    ('DASAR',            4,  1.3),
    ('SILANG_HOMO',      4,  1.5),
    ('KEMBANG_KEMPIS',   4,  1.6),
    ('KOMBINASI',        4,  3.0)
  ) AS v(game_code, discount_percent, payout_multiplier)
WHERE g.game_code = v.game_code
  AND g.payout_multiplier = 0;

-- 2b) Baris 2D posisi di-seed 28% / x65 oleh ensureLotteryConfigs. Kalau barisnya
-- ada tapi masih 0, isi juga supaya ikut menyala di langkah 3.
UPDATE lottery_game_configs g
SET payout_multiplier = 65, discount_percent = 28, updated_at = now()
WHERE g.game_code IN ('POSITION_2D_FRONT', 'POSITION_2D_MIDDLE')
  AND g.payout_multiplier = 0;

-- 3) Nyalakan 14 game pada pasar yang 4D-nya aktif dan berHarga.
UPDATE lottery_game_configs g
SET enabled = TRUE, updated_at = now()
WHERE g.game_code IN (
        'STRAIGHT_4D','STRAIGHT_3D','STRAIGHT_2D',
        'POSITION_2D_FRONT','POSITION_2D_MIDDLE',
        'COLOK_BEBAS','COLOK_2D','COLOK_NAGA','COLOK_JITU',
        'TENGAH_TEPI','DASAR','SILANG_HOMO','KEMBANG_KEMPIS','KOMBINASI'
      )
  AND g.payout_multiplier > 0
  AND EXISTS (
        SELECT 1 FROM lottery_game_configs s
        WHERE s.market_id = g.market_id
          AND s.game_code = 'STRAIGHT_4D'
          AND s.enabled = TRUE
          AND s.payout_multiplier > 0
      )
  AND g.enabled = FALSE;

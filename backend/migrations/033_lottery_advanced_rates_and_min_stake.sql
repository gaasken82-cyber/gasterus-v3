-- Perbaiki odds game lanjutan + samakan minimum bet togel ke Rp 100.
--
-- LATAR BELAKANG
-- ensureLotteryConfigs() di backend/src/markets.js men-seed game lanjutan dengan
-- multiplier commercially (COLOK_BEBAS 7, COLOK_2D 70, COLOK_NAGA 350, COLOK_JITU 65,
-- TENGAH_TEPI 2, DASAR 2, SILANG_HOMO 3, KEMBANG_KEMPIS 3). Angka itu tidak
-- dihitung dari probabilitas settlement engine, sehingga EV payout per nominal verge:
--
--   COLOK_BEBAS 2,80 | COLOK_2D 6,82 | COLOK_NAGA 7,14 | COLOK_JITU 6,50
--   TENGAH_TEPI 1,00 | SILANG_HOMO 1,50 | KEMBANG_KEMPIS 1,35
--
-- EV di atas 1 berarti platform membayar lebih besar dari peluang jp, jadi setiap
-- rupiah yang dipasang pada game itu rugi. Nilai baru dihitung dari probabilitas
-- hasil seragam 0000-9999 memakai evaluateLotterySelection (lihat TOTO_ADVANCED_GAME_RATES
-- di backend/src/lottery-games.js) dengan target EV <= 0.75:
--
--   COLOK_BEBAS 1,5 (EV 0,746) | COLOK_2D 7,7 (0,750) | COLOK_NAGA 36,7 (0,749)
--   COLOK_JITU 7,5 (0,750) | TENGAH_TEPI 1,5 (0,750) | DASAR 1,3 (0,715)
--   SILANG_HOMO 1,5 (0,750) | KEMBANG_KEMPIS 1,6 (0,720) | KOMBINASI 3 (0,750)
--
-- Baris hanya diubah kalau multiplier-nya masih persis sama dengan nilai lama hasil
-- seeding, jadi odds yang sudah ditune operator lewat lottery-control tidak ditimpa.
-- Baris dengan payout_multiplier = 0 ikut diisi karena itu berarti game belum pernah
-- diberi harga.
--
-- CATATAN PENTING: game bolak-balik (COLOK_2D, COLOK_NAGA) sekarang menolak angka
-- kembar ("11") di normalizeLotterySelection. Tanpa itu, "11" punya peluang jp 0,0523
-- dan "12" punya 0,0974, sehingga satu multiplier tidak bisa menutup keduanya.

UPDATE lottery_game_configs SET payout_multiplier = 1.5  WHERE game_code = 'COLOK_BEBAS'    AND payout_multiplier IN (7,0);
UPDATE lottery_game_configs SET payout_multiplier = 7.7  WHERE game_code = 'COLOK_2D'       AND payout_multiplier IN (70,0);
UPDATE lottery_game_configs SET payout_multiplier = 36.7 WHERE game_code = 'COLOK_NAGA'     AND payout_multiplier IN (350,0);
UPDATE lottery_game_configs SET payout_multiplier = 7.5  WHERE game_code = 'COLOK_JITU'     AND payout_multiplier IN (65,0);
UPDATE lottery_game_configs SET payout_multiplier = 1.5  WHERE game_code = 'TENGAH_TEPI'    AND payout_multiplier IN (2,0);
UPDATE lottery_game_configs SET payout_multiplier = 1.3  WHERE game_code = 'DASAR'          AND payout_multiplier IN (2,0);
UPDATE lottery_game_configs SET payout_multiplier = 1.5  WHERE game_code = 'SILANG_HOMO'    AND payout_multiplier IN (3,0);
UPDATE lottery_game_configs SET payout_multiplier = 1.6  WHERE game_code = 'KEMBANG_KEMPIS' AND payout_multiplier IN (3,0);

-- Minimum bet togel diseragamkan ke Rp 100 (schema default 1000, default admin 100).
-- Menurunkan min_stake tidak pernah melanggar CHECK (max_stake_per_item >= min_stake).
UPDATE market_betting_configs SET min_stake = 100 WHERE min_stake > 100;

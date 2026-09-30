-- Nyalakan game lanjutan secara deterministik di setiap pasar yang 4D-nya bisa
-- dimainkan, supaya member benar-benar melihat seluruh pilihan game.
--
-- Latar belakang: ensureLotteryConfigs() di backend/src/markets.js hanya menyalakan
-- game lanjutan ketika payout_multiplier masih 0. Kalau sebuah baris pernah dibuat
-- dengan multiplier 0 dan kemudian diisi harga manual, atau pernah dinonaktifkan
-- operator, baris itu tidak pernah ikut dinyalakan lagi. Akibatnya UI bisa tampil
-- benar sementara daftar game di pasar itu tetap 3 kode.
--
-- Kriteria: game lanjutan dinyalakan pada pasar yang STRAIGHT_4D-nya juga aktif dan
-- sudah punya harga (payout_multiplier > 0). Ini persis himpunan pasar tempat
-- permainan berbasis 4D bisa settlement, jadi tidak ada game yang dinyalakan di pasar
-- yang tidak bisa enforcing hasilnya. Baris yang/game disabled dengan sengaja oleh
-- operator tetap bisa dimatikan lagi dari Lottery Control (kolom Enabled per game).
--
-- Idempoten: aman dijalankan berkali-kali.

UPDATE lottery_game_configs g
SET enabled = TRUE, updated_at = now()
WHERE g.game_code IN (
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

-- Migration 029: tutup pasaran yang OPEN tanpa waktu tutup
--
-- Latar belakang: ada 24 baris market_betting_configs berstatus OPEN tetapi
-- close_at NULL. Endpoint /api/public/markets tetap mengirimkannya sebagai
-- OPEN, sehingga member tampak bisa memasang wager pada 52 pasar, padahal
-- hanya 28 yang benar-benar siap. createBet() menolak 24 sisanya dengan
-- MARKET_CLOSED atau BETTING_CLOSE_NOT_READY.
--
-- Dua penulis itu sudah diperbaiki pada commit sebelumnya: reconciler
-- cash-window dan scheduler auto-open tidak lagi berebut betting_period.
-- Data lama ini dibuat ketika keduanya masih berebut, sehingga tertinggal
-- pada kondisi OPEN tanpa close_at.
--
-- Perbaikan: baris yang OPEN tanpa close_at ditutup menjadi SUSPENDED dan
-- ditandai auto_reopen_blocked=TRUE supaya scheduler tidak membukanya
-- kembali dengan tebakan tanggal. Baris ini akan dibuka kembali oleh
-- reconcileCashBettingWindows bila sudah punya plan yang valid dari histori
-- hasil terverifikasi, atau oleh operator lewat panel admin.
--
-- Hanya baris yang memang tidak bisa dipakai yang disentuh. Baris OPEN
-- dengan close_at valid dibiarkan apa adanya.

BEGIN;

-- Laporan dulu supaya hasil migrasi bisa diaudit di log Railway.
DO $$
DECLARE
  jumlah INTEGER;
BEGIN
  SELECT COUNT(*) INTO jumlah
  FROM market_betting_configs
  WHERE betting_status='OPEN' AND close_at IS NULL;

  RAISE NOTICE 'Migration 029: % baris OPEN tanpa close_at akan ditutup menjadi SUSPENDED', jumlah;
END $$;

UPDATE market_betting_configs
   SET betting_status = 'SUSPENDED',
       close_at = NULL,
       auto_reopen_blocked = TRUE,
       updated_by = NULL,
       updated_at = now()
 WHERE betting_status = 'OPEN'
   AND close_at IS NULL;

COMMIT;

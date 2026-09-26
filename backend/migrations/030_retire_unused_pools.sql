-- Migration 030: hapus 16 pool yang tidak dipakai lagi (keputusan operator)
--
-- Pool state AS sore/malam dihapus dari katalog: jadwal result-nya jatuh di
-- jam malam WIB sehingga jendela bets praktis tidak pernah terbuka. Member
-- hanya melihat pasar yang bisa benar-benar menerima bet.
--
-- Baris markets TIDAK dihapus supaya:
--   - riwayat bet lama tetap punya foreign key yang valid,
--   - laporan dan rekonsiliasi uang lama tidak berubah.
-- Yang ditutup hanya konfigurasi betting-nya dan flag market.
--
-- auto_reopen_blocked=TRUE mencegah scheduler auto-open membukanya kembali.
-- Katalog member (MEMBER_HIDDEN_TOTO_MARKETS) juga menyembunyikannya, jadi
-- pool ini tidak muncul di /api/public/markets maupun /member-api/markets.

BEGIN;

DO $$
DECLARE
  jumlah INTEGER;
BEGIN
  SELECT COUNT(*) INTO jumlah
  FROM markets
  WHERE slug IN (
    'georgia-ngt-pool','newyork-mid-pool','georgia-mid-pool','maryland-mid-pool',
    'michigan-mid-pool','newjerseyeve-pool','kentucky-eve-pool','indiana-eve-pool',
    'tennesse-mor-pool','texas-mor-pool','florida-eve-pool','illinois-eve-pool',
    'missouri-eve-pool','virginia-ngt-pool','northcaroday-pool','northcaroeve-pool'
  );
  RAISE NOTICE 'Migration 030: % pool akan ditutup permanen', jumlah;
END $$;

UPDATE market_betting_configs c
   SET betting_status = 'SUSPENDED',
       betting_period = NULL,
       close_at = NULL,
       auto_reopen_blocked = TRUE,
       updated_by = NULL,
       updated_at = now()
  FROM markets m
 WHERE m.id = c.market_id
   AND m.slug IN (
     'georgia-ngt-pool','newyork-mid-pool','georgia-mid-pool','maryland-mid-pool',
     'michigan-mid-pool','newjerseyeve-pool','kentucky-eve-pool','indiana-eve-pool',
     'tennesse-mor-pool','texas-mor-pool','florida-eve-pool','illinois-eve-pool',
     'missouri-eve-pool','virginia-ngt-pool','northcaroday-pool','northcaroeve-pool'
   );

UPDATE markets
   SET status = 'closed',
       verification_status = 'RETIRED',
       updated_at = now()
 WHERE slug IN (
   'georgia-ngt-pool','newyork-mid-pool','georgia-mid-pool','maryland-mid-pool',
   'michigan-mid-pool','newjerseyeve-pool','kentucky-eve-pool','indiana-eve-pool',
   'tennesse-mor-pool','texas-mor-pool','florida-eve-pool','illinois-eve-pool',
   'missouri-eve-pool','virginia-ngt-pool','northcaroday-pool','northcaroeve-pool'
 );

COMMIT;
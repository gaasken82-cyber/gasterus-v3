-- Samakan slug lima pasar dengan kosakata kanonik di
-- backend/data/toto-source-map.json.
--
-- LATAR BELANG
-- Dua kosakata slug pernah hidup berdampingan:
--   - kanonik  : newjersey-mid-pool, tennessee-mid-pool, tennessee-eve-pool,
--                washington-md-pool, washington-ev-pool  (source map; dipakai
--                collector, scheduler, dan DRAW_SCHEDULE)
--   - lama/typo: newjerseymid-pool, tennesse-mid-pool, tennesse-eve-pool,
--                washingtonmd-pool, washingtonev-pool     (dipakai markets.seed.json
--                lama, toto-official-source.js, dan migration 038)
--
-- Baris markets untuk slug lama itu TIDAK PERNAH disentuh collector lagi karena
-- collector selalu menulis ke slug kanonik. Akibatnya:
--   - markets.result / verification_status / updated_at membeku (teramati 20 jam),
--   - markets.draw_time juga tidak ikut terisi dari migration 038 yang memakai
--     slug lama,
--   - baris itu tertinggal SUSPENDED tanpa close_at sehingga tidak bisa dipasang.
--
-- KENAPA AMAN
-- markets.slug adalah satu-satunya kolom slug di skema ini. Semua tabel lain
-- (market_betting_configs, bets, histori) mereferensikan markets.id (BIGINT),
-- bukan markets.slug. Karena itu mengganti slug TIDAK menyentuh foreign key,
-- histori bet, maupun nomor period. markets.id tidak berubah.
--
-- Migration ini hanya mengganti slug dan membuka kembali jalan auto-reopen.
-- betting_status sengaja dibiarkan apa adanya (SUSPENDED): pasar tidak akan
-- dibuka sampai reconcilerCashBettingWindows punya rencana betting valid dari
-- histori hasil terverifikasi. Jadi fail-closed tetap terjaga.
--
-- Idempoten: WHERE memakai slug lama, jadi dijalankan berkali-kali aman.

BEGIN;

-- Laporan supaya bisa diaudit di log Railway.
DO $$
DECLARE
  jumlah INTEGER;
BEGIN
  SELECT COUNT(*) INTO jumlah FROM markets
  WHERE slug IN ('newjerseymid-pool','tennesse-mid-pool','tennesse-eve-pool','washingtonmd-pool','washingtonev-pool');
  RAISE NOTICE 'Migration 039: % baris markets akan diubah slugnya ke kosakata kanonik', jumlah;
END $$;

-- Kosakata lama -> kosakata kanonik.
UPDATE markets SET slug = 'newjersey-mid-pool',   updated_at = now() WHERE slug = 'newjerseymid-pool';
UPDATE markets SET slug = 'tennessee-mid-pool',   updated_at = now() WHERE slug = 'tennesse-mid-pool';
UPDATE markets SET slug = 'tennessee-eve-pool',   updated_at = now() WHERE slug = 'tennesse-eve-pool';
UPDATE markets SET slug = 'washington-md-pool',   updated_at = now() WHERE slug = 'washingtonmd-pool';
UPDATE markets SET slug = 'washington-ev-pool',   updated_at = now() WHERE slug = 'washingtonev-pool';

-- Buka kembali jalan auto-reopen untuk kelima baris itu. Migration 029 sempat
-- mengunci kelima baris itu dengan auto_reopen_blocked=TRUE; sekarang slug-nya
-- sudah cocok
-- dengan collector sehingga reconciler boleh menghitungkan jendela betting.
UPDATE market_betting_configs c
SET auto_reopen_blocked = FALSE,
    updated_at = now()
FROM markets m
WHERE c.market_id = m.id
  AND m.slug IN ('newjersey-mid-pool','tennessee-mid-pool','tennessee-eve-pool','washington-md-pool','washington-ev-pool')
  AND c.auto_reopen_blocked;

COMMIT;
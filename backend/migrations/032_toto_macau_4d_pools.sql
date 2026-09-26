-- Tambah lima pasar TOTO MACAU 4D dan tutup dua pasar lama.
--
-- Dua pasar lama (4D TOTO MACAU POOL dan 5D TOTO MACAU POOL) sama-sama memakai
-- satu sumber VegasNet, yaitu "Macau 00", sehingga keduanya selalu menampilkan
-- angka yang identik. Sumber TOTO MACAU yang tersedia adalah lima pool 4D:
-- Macau 00, Macau 13:00, Macau 16, Macau 19:00, dan Macau 22:00.
--
-- Nama pasar memakai waktu result sesuai nama pool sumber. Angka diambil dari
-- sumber yang sama seperti pool lain, bukan dari angka manual.
--
-- Baris lama tidak dihapus supaya riwayat bet lama tetap punya foreign key valid.
INSERT INTO markets (slug,code,name,result,period,category,tags,status,provider_path,source_key,sort_order,verification_status,confidence,draw_date)
VALUES
  ('toto-macau-midnight','TMC-00','TOTO MACAU MIDNIGHT','----',NULL,'asia','["popular"]'::jsonb,'open','/games/toto-macau/00','/games/toto-macau/00',2,'UNMAPPED',0,NULL),
  ('toto-macau-siang','TMC-13','TOTO MACAU SIANG','----',NULL,'asia','["popular"]'::jsonb,'open','/games/toto-macau/13','/games/toto-macau/13',3,'UNMAPPED',0,NULL),
  ('toto-macau-sore','TMC-16','TOTO MACAU SORE','----',NULL,'asia','["popular"]'::jsonb,'open','/games/toto-macau/16','/games/toto-macau/16',4,'UNMAPPED',0,NULL),
  ('toto-macau-malam','TMC-19','TOTO MACAU MALAM','----',NULL,'asia','["popular"]'::jsonb,'open','/games/toto-macau/19','/games/toto-macau/19',5,'UNMAPPED',0,NULL),
  ('toto-macau-night','TMC-22','TOTO MACAU NIGHT','----',NULL,'asia','["popular"]'::jsonb,'open','/games/toto-macau/22','/games/toto-macau/22',6,'UNMAPPED',0,NULL)
ON CONFLICT (slug) DO NOTHING;

-- Config betting baru harus lahir tertutup, bukan OPEN palsu tanpa periode.
INSERT INTO market_betting_configs (market_id,betting_status)
SELECT id,'SUSPENDED' FROM markets
WHERE slug IN ('toto-macau-midnight','toto-macau-siang','toto-macau-sore','toto-macau-malam','toto-macau-night')
ON CONFLICT (market_id) DO NOTHING;

-- Dua pasar lama ditutup supaya tidak lagi menampilkan angka yang sama.
UPDATE markets SET status='closed', verification_status='RETIRED'
WHERE slug IN ('4d-toto-macau-pool','5d-toto-macau-pool');

UPDATE market_betting_configs
SET betting_status='SUSPENDED', auto_reopen_blocked=TRUE, updated_at=now()
WHERE market_id IN (SELECT id FROM markets WHERE slug IN ('4d-toto-macau-pool','5d-toto-macau-pool'));

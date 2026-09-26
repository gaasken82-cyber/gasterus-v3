-- Kode display pasar dibuat unik
--
-- Sebelumnya 11 kode dipakai lebih dari satu pasar: CP untuk CAMBODIA, CALIFORNIA,
-- dan CHINA; WP untuk WISCONSIN, WASHINGTON, dan WASHINGTON EVE; lalu MEP, NP, PP,
-- MMP, IMP, TEP, TP, SP, dan BMP. Kode bentrok membuat admin dan member tidak bisa
-- membedakan pasar yang dituju saat memilih.
--
-- Identitas internal pasar tidak berubah. markets.id (BIGSERIAL) dan markets.slug
-- (UNIQUE) tetap menjadi kunci utama. Kolom markets.code hanya untuk tampilan dan
-- pencarian admin, sehingga migrasi ini tidak menyentuh riwayat betting, settlement,
-- maupun saldo member.
--
-- Setelah migrasi ini, setiap kode pasar bersifat unik.
UPDATE markets SET code='KK4P' WHERE slug='king-kong-4d-pool' AND code <> 'KK4P';
UPDATE markets SET code='5TMP' WHERE slug='5d-toto-macau-pool' AND code <> '5TMP';
UPDATE markets SET code='4TMP' WHERE slug='4d-toto-macau-pool' AND code <> '4TMP';
UPDATE markets SET code='HK' WHERE slug='hongkong-pool' AND code <> 'HK';
UPDATE markets SET code='SYD' WHERE slug='sydney-pool' AND code <> 'SYD';
UPDATE markets SET code='NYP' WHERE slug='newyork-pool' AND code <> 'NYP';
UPDATE markets SET code='SGP' WHERE slug='singapore-pool' AND code <> 'SGP';
UPDATE markets SET code='WLG' WHERE slug='wellington-pool' AND code <> 'WLG';
UPDATE markets SET code='PRG' WHERE slug='prague-pool' AND code <> 'PRG';
UPDATE markets SET code='SEA' WHERE slug='seattle-pool' AND code <> 'SEA';
UPDATE markets SET code='MP' WHERE slug='medellin-pool' AND code <> 'MP';
UPDATE markets SET code='EP' WHERE slug='emerlad-pool' AND code <> 'EP';
UPDATE markets SET code='AP' WHERE slug='auckland-pool' AND code <> 'AP';
UPDATE markets SET code='NHP' WHERE slug='napier-hasti-pool' AND code <> 'NHP';
UPDATE markets SET code='CHC' WHERE slug='christchurch-pool' AND code <> 'CHC';
UPDATE markets SET code='TRG' WHERE slug='tauranga-pool' AND code <> 'TRG';
UPDATE markets SET code='CHN' WHERE slug='china-pool' AND code <> 'CHN';
UPDATE markets SET code='NEL' WHERE slug='nelson-pool' AND code <> 'NEL';
UPDATE markets SET code='CFR' WHERE slug='california-pool' AND code <> 'CFR';
UPDATE markets SET code='PCS' WHERE slug='pcso-pool' AND code <> 'PCS';
UPDATE markets SET code='IP' WHERE slug='invercargill-pool' AND code <> 'IP';
UPDATE markets SET code='QP' WHERE slug='queenstown-pool' AND code <> 'QP';
UPDATE markets SET code='RP' WHERE slug='rotorua-pool' AND code <> 'RP';
UPDATE markets SET code='NPP' WHERE slug='new-plymouth-pool' AND code <> 'NPP';
UPDATE markets SET code='GP' WHERE slug='gisborne-pool' AND code <> 'GP';
UPDATE markets SET code='WRP' WHERE slug='whang-rei-pool' AND code <> 'WRP';
UPDATE markets SET code='PMR' WHERE slug='palmerston-pool' AND code <> 'PMR';
UPDATE markets SET code='BP' WHERE slug='bullseye-pool' AND code <> 'BP';
UPDATE markets SET code='DP' WHERE slug='dunedin-pool' AND code <> 'DP';
UPDATE markets SET code='JP' WHERE slug='jepang-pool' AND code <> 'JP';
UPDATE markets SET code='HP' WHERE slug='hamilton-pool' AND code <> 'HP';
UPDATE markets SET code='TWN' WHERE slug='taiwan-pool' AND code <> 'TWN';
UPDATE markets SET code='WIS' WHERE slug='wisconsin-pool' AND code <> 'WIS';
UPDATE markets SET code='CBD' WHERE slug='cambodia-pool' AND code <> 'CBD';
UPDATE markets SET code='BZM' WHERE slug='belize-mor-pool' AND code <> 'BZM';
UPDATE markets SET code='MRE' WHERE slug='merida-eve-pool' AND code <> 'MRE';
UPDATE markets SET code='MRR' WHERE slug='merida-mor-pool' AND code <> 'MRR';
UPDATE markets SET code='MRN' WHERE slug='merida-night-pool' AND code <> 'MRN';
UPDATE markets SET code='BZL' WHERE slug='belize-mid-pool' AND code <> 'BZL';
UPDATE markets SET code='BZN' WHERE slug='belize-night-pool' AND code <> 'BZN';
UPDATE markets SET code='BZE' WHERE slug='belize-eve-pool' AND code <> 'BZE';
UPDATE markets SET code='MRM' WHERE slug='merida-mid-pool' AND code <> 'MRM';
UPDATE markets SET code='GEP' WHERE slug='georgia-eve-pool' AND code <> 'GEP';
UPDATE markets SET code='O1P' WHERE slug='oregon-1-pool' AND code <> 'O1P';
UPDATE markets SET code='O3P' WHERE slug='oregon-3-pool' AND code <> 'O3P';
UPDATE markets SET code='O4P' WHERE slug='oregon-4-pool' AND code <> 'O4P';
UPDATE markets SET code='OMP' WHERE slug='ohio-mid-pool' AND code <> 'OMP';
UPDATE markets SET code='OEP' WHERE slug='ohio-eve-pool' AND code <> 'OEP';
UPDATE markets SET code='NEP' WHERE slug='newyork-eve-pool' AND code <> 'NEP';
UPDATE markets SET code='O2P' WHERE slug='oregon-2-pool' AND code <> 'O2P';
UPDATE markets SET code='MDV' WHERE slug='maryland-eve-pool' AND code <> 'MDV';
UPDATE markets SET code='MIV' WHERE slug='michigan-eve-pool' AND code <> 'MIV';
UPDATE markets SET code='NJM' WHERE slug='newjerseymid-pool' AND code <> 'NJM';
UPDATE markets SET code='KMP' WHERE slug='kentucky-mid-pool' AND code <> 'KMP';
UPDATE markets SET code='INM' WHERE slug='indiana-mid-pool' AND code <> 'INM';
UPDATE markets SET code='TMP' WHERE slug='tennesse-mid-pool' AND code <> 'TMP';
UPDATE markets SET code='TEV' WHERE slug='tennesse-eve-pool' AND code <> 'TEV';
UPDATE markets SET code='TXE' WHERE slug='texas-eve-pool' AND code <> 'TXE';
UPDATE markets SET code='TDP' WHERE slug='texas-day-pool' AND code <> 'TDP';
UPDATE markets SET code='TNP' WHERE slug='texas-night-pool' AND code <> 'TNP';
UPDATE markets SET code='FMP' WHERE slug='florida-mid-pool' AND code <> 'FMP';
UPDATE markets SET code='RIP' WHERE slug='rhode-island-pool' AND code <> 'RIP';
UPDATE markets SET code='ILM' WHERE slug='illinois-mid-pool' AND code <> 'ILM';
UPDATE markets SET code='MMO' WHERE slug='missouri-mid-pool' AND code <> 'MMO';
UPDATE markets SET code='WMD' WHERE slug='washingtonmd-pool' AND code <> 'WMD';
UPDATE markets SET code='WEV' WHERE slug='washingtonev-pool' AND code <> 'WEV';
UPDATE markets SET code='DNP' WHERE slug='delaware-ngt-pool' AND code <> 'DNP';
UPDATE markets SET code='DDP' WHERE slug='delaware-day-pool' AND code <> 'DDP';
UPDATE markets SET code='VDP' WHERE slug='virginia-day-pool' AND code <> 'VDP';

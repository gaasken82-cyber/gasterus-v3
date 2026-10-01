-- Isi markets.draw_time untuk SEMUA pool dari jadwal resmi di
-- backend/data/toto-source-map.json.
--
-- LATAR BELANG
-- markets.draw_time hanya terisi sebagai efek samping saat collector benar-benar
-- MENERIMA hasil undian (toto-collector.js: draw_time=COALESCE($5,draw_time)).
-- Pool yang hasil resminya belum pernah terkoleksi karena collector hanya bangun
-- di T-5 s/d 60 menit setelah jam result, jadi kolomnya tetap NULL.
--
-- Akibatnya jadwal jam result ada di source map untuk 45 pool, tapi hanya 27
-- pool yang menampilkannya lewat markets.draw_time. Member lalu melihat
-- "Belum ditentukan" pada 18 pasar walau jadwalnya jelas dan berSJEDULE.
--
-- Migration ini menyalin jadwal resmi ke markets.draw_time HANYA untuk baris yang
-- masih NULL. Baris yang sudah terisi hasil collector TIDAK ditimpa, sehingga
-- waktu draw aktual yang terverifikasi tetap menang atas jadwalPlanning.
--
-- Tabel nilai di bawah adalah salinan backend/data/toto-source-map.json; test
-- "jadwal pool di migration 038 sama dengan source map" menjaga keduanya tetap
-- sinkron. Idempoten: aman dijalankan berkali-kali.

UPDATE markets m
SET draw_time = v.result_time::time,
    updated_at = now()
FROM (VALUES
    ('toto-macau-midnight', '23:00', '00:00'),
    ('toto-macau-siang', '11:00', '13:00'),
    ('toto-macau-sore', '14:00', '16:00'),
    ('toto-macau-malam', '17:00', '19:00'),
    ('toto-macau-night', '20:00', '22:00'),
    ('king-kong-4d-pool', '20:00', '20:15'),
    ('hongkong-pool', '23:10', '23:25'),
    ('sydney-pool', '19:45', '20:00'),
    ('newyork-pool', '22:20', '22:35'),
    ('singapore-pool', '22:10', '22:25'),
    ('china-pool', '21:20', '21:35'),
    ('california-pool', '21:00', '21:15'),
    ('pcso-pool', '23:10', '23:25'),
    ('bullseye-pool', '22:00', '22:15'),
    ('jepang-pool', '20:30', '20:45'),
    ('taiwan-pool', '21:40', '21:55'),
    ('wisconsin-pool', '02:20', '02:35'),
    ('cambodia-pool', '20:20', '20:35'),
    ('georgia-eve-pool', '04:40', '04:55'),
    ('oregon-1-pool', '03:45', '04:00'),
    ('oregon-3-pool', '09:45', '10:00'),
    ('oregon-4-pool', '12:45', '13:00'),
    ('ohio-mid-pool', '05:20', '05:35'),
    ('ohio-eve-pool', '04:20', '04:35'),
    ('newyork-eve-pool', '22:20', '22:35'),
    ('oregon-2-pool', '06:45', '07:00'),
    ('maryland-eve-pool', '04:20', '04:35'),
    ('michigan-eve-pool', '04:20', '04:35'),
    ('newjerseymid-pool', '05:20', '05:35'),
    ('kentucky-mid-pool', '05:20', '05:35'),
    ('indiana-mid-pool', '05:20', '05:35'),
    ('tennesse-mid-pool', '05:20', '05:35'),
    ('tennesse-eve-pool', '04:20', '04:35'),
    ('texas-eve-pool', '04:20', '04:35'),
    ('texas-day-pool', '06:20', '06:35'),
    ('texas-night-pool', '08:20', '08:35'),
    ('florida-mid-pool', '05:20', '05:35'),
    ('rhode-island-pool', '04:20', '04:35'),
    ('illinois-mid-pool', '05:20', '05:35'),
    ('missouri-mid-pool', '05:20', '05:35'),
    ('washingtonmd-pool', '05:20', '05:35'),
    ('washingtonev-pool', '04:20', '04:35'),
    ('delaware-ngt-pool', '06:20', '06:35'),
    ('delaware-day-pool', '08:20', '08:35'),
    ('virginia-day-pool', '08:20', '08:35')
  ) AS v(slug, close_time, result_time)
WHERE m.slug = v.slug
  AND m.draw_time IS NULL;

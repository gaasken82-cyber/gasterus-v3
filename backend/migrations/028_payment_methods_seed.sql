-- Migration 028: isi metode pembayaran produksi (BNI manual + QRIS statis)
--
-- Latar belakang: GET /api/public/bank-status mengembalikan data kosong karena
-- tabel payment_methods belum pernah diisi. Akibatnya halaman deposit tidak
-- menampilkan metode apa pun dan member tidak dapat menambah saldo, sehingga
-- alur betting tidak dapat dijalankan sama sekali.
--
-- Dua metode yang diaktifkan:
--   1. BNI  - transfer bank manual, disetujui admin lewat wallet_requests.
--   2. QRIS - barcode statis dari frontend/assets/qris-barcode.png, juga
--             disetujui admin karena tidak memakai DANA OpenAPI.
--
-- Nomor rekening tidak disimpan polos di sini. Nilai yang dirow hanya
-- tersamar (digit tengah diganti *) supaya tidak bocor lewat endpoint publik;
-- nomor lengkap hanya ditampilkan di halaman kasir setelah member login dan
-- diminta menghubungi customer service. Untuk ini diperlukan fungsi masker.

BEGIN;

-- Sanitasi nomor rekening: sisakan 4 digit depan dan 4 digit belakang.
CREATE OR REPLACE FUNCTION mask_account_number(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    WHEN length(btrim(raw)) <= 8 THEN repeat('*', length(btrim(raw)))
    ELSE left(btrim(raw), 4) || repeat('*', length(btrim(raw)) - 8) || right(btrim(raw), 4)
  END
$$;

-- Metode 1: transfer bank manual ke BNI.
INSERT INTO payment_methods (
  id, code, method_type, name, provider_name, account_name, account_number,
  instructions, min_amount, max_amount, is_active, sort_order, created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  'BNI_MANUAL',
  'BANK',
  'Transfer Bank BNI',
  'BNI',
  'WILLY SANJAYA',
  mask_account_number('0792087820'),
  'Silakan transfer ke rekening tujuan yang diberikan customer service, lalu isi formulir dengan nominal dan bukti transfer. Deposit disetujui oleh admin.',
  10000,
  20000000,
  TRUE,
  10,
  now(),
  now()
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  provider_name = EXCLUDED.provider_name,
  account_name = EXCLUDED.account_name,
  account_number = EXCLUDED.account_number,
  instructions = EXCLUDED.instructions,
  is_active = TRUE,
  updated_at = now();

-- Metode 2: QRIS statis. Barcode sudah ada di frontend dan tidak memerlukan
-- kredensial DANA OpenAPI, jadi approve tetap dilakukan manual oleh admin.
INSERT INTO payment_methods (
  id, code, method_type, name, provider_name, qr_image, instructions,
  min_amount, max_amount, is_active, sort_order, created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  'QRIS_STATIC',
  'QRIS',
  'QRIS',
  'QRIS',
  '/assets/qris-barcode.png',
  'Pindai barcode QRIS pada layar, isi nominal, lalu unggah bukti pembayaran. Deposit disetujui oleh admin.',
  10000,
  20000000,
  TRUE,
  20,
  now(),
  now()
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  qr_image = EXCLUDED.qr_image,
  instructions = EXCLUDED.instructions,
  is_active = TRUE,
  updated_at = now();

COMMIT;

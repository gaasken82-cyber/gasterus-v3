BEGIN;

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  method_type TEXT NOT NULL CHECK (method_type IN ('BANK','QRIS','EWALLET')),
  name TEXT NOT NULL,
  provider_name TEXT,
  account_name TEXT,
  account_number TEXT,
  qr_image TEXT,
  instructions TEXT,
  min_amount BIGINT NOT NULL DEFAULT 10000 CHECK (min_amount >= 0),
  max_amount BIGINT NOT NULL DEFAULT 200000000 CHECK (max_amount >= min_amount),
  fee_fixed BIGINT NOT NULL DEFAULT 0 CHECK (fee_fixed >= 0),
  fee_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_methods_active_idx ON payment_methods(is_active, sort_order, name);

ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payment_snapshot JSONB;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS proof_image TEXT;

CREATE TABLE IF NOT EXISTS content_banners (
  id UUID PRIMARY KEY,
  placement TEXT NOT NULL DEFAULT 'HERO' CHECK (placement IN ('HERO','MEMBER_HOME','DEPOSIT','MOBILE')),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  target_url TEXT,
  button_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS content_banners_live_idx ON content_banners(placement, is_active, sort_order);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  image_url TEXT,
  target_url TEXT,
  promo_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS promotions_live_idx ON promotions(is_active, sort_order);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_settings(setting_key,setting_value,description,is_public) VALUES
 ('site.branding','{"siteName":"ASEAN777","maintenance":false}'::jsonb,'Branding dan status situs',TRUE),
 ('finance.deposit','{"enabled":true,"notice":"Pilih metode pembayaran aktif dan kirim bukti pembayaran."}'::jsonb,'Pengaturan deposit member',TRUE),
 ('finance.withdraw','{"enabled":true,"notice":"Pastikan data rekening penarikan Anda benar."}'::jsonb,'Pengaturan withdraw member',TRUE),
 ('security.member','{"forceStrongPassword":true}'::jsonb,'Kebijakan keamanan member',FALSE)
ON CONFLICT(setting_key) DO NOTHING;

UPDATE roles SET permissions='["approvals:read","approvals:approve","bets:read","wallet:read","members:read","content:write"]'::jsonb WHERE code='SUPERVISOR';
UPDATE roles SET permissions='["wallet:read","wallet:review","members:read","payments:write"]'::jsonb WHERE code='FINANCE';
UPDATE roles SET permissions='["members:read","bets:read","wallet:read"]'::jsonb WHERE code='SUPPORT';
UPDATE roles SET permissions='["audit:read","roles:write","mfa:reset","sessions:revoke","members:credential-reset"]'::jsonb WHERE code='SECURITY';

COMMIT;

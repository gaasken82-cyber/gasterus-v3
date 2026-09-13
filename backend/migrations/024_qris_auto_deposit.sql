BEGIN;

-- QRIS auto deposit orders: dynamic QRIS (DANA OpenAPI QRIS Acquirer) with
-- webhook-driven auto settlement. settle_mode='AUTO' means the balance is
-- credited automatically by the provider webhook; 'MANUAL' falls back to the
-- existing admin approval flow on the linked wallet_requests row.
CREATE TABLE IF NOT EXISTS qris_deposit_orders (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_request_id UUID REFERENCES wallet_requests(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  request_key TEXT NOT NULL,
  provider_code TEXT NOT NULL DEFAULT 'DANA',
  provider_ref TEXT NOT NULL UNIQUE,
  merchant_trans_id TEXT,
  qr_payload TEXT,
  qr_image TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','PAID','EXPIRED','FAILED')),
  settle_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (settle_mode IN ('AUTO','MANUAL')),
  raw_notify JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qris_orders_member_request_key_idx ON qris_deposit_orders(member_id, request_key);
CREATE INDEX IF NOT EXISTS qris_orders_member_idx ON qris_deposit_orders(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qris_orders_status_idx ON qris_deposit_orders(status, expires_at);

COMMIT;

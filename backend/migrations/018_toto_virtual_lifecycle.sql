-- R6.9.0.23 V20 HF16: isolated non-cashable TOTO simulation lifecycle.
-- This migration never credits/debits ledger_accounts and therefore cannot be withdrawn.
ALTER TABLE bet_orders
  ADD COLUMN IF NOT EXISTS wallet_mode TEXT NOT NULL DEFAULT 'CASH'
  CHECK (wallet_mode IN ('CASH','VIRTUAL'));

CREATE INDEX IF NOT EXISTS bet_orders_wallet_mode_idx
  ON bet_orders(wallet_mode, market_id, status, created_at);

CREATE TABLE IF NOT EXISTS toto_virtual_wallets (
  member_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS toto_virtual_wallet_ledger (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES bet_orders(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('SEED','BET','CANCEL','PAYOUT','VOID_REFUND')),
  amount_signed BIGINT NOT NULL,
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS toto_virtual_wallet_ledger_member_idx
  ON toto_virtual_wallet_ledger(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS toto_virtual_runtime_state (
  singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO toto_virtual_runtime_state(singleton) VALUES(1) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS toto_virtual_settled_periods (
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  result_period TEXT NOT NULL,
  history_id UUID NOT NULL REFERENCES market_result_history(id) ON DELETE RESTRICT,
  result_value TEXT NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, result_period)
);

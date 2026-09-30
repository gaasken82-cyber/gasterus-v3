BEGIN;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username CITEXT NOT NULL UNIQUE,
  email CITEXT UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  rules_accepted_at TIMESTAMPTZ,
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  referral_code CITEXT UNIQUE,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE IF NOT EXISTS markets (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  result TEXT NOT NULL,
  period TEXT,
  category TEXT NOT NULL CHECK (category IN ('asia','america','other')),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('open','closed','unknown')),
  provider_path TEXT NOT NULL UNIQUE,
  source_key TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNMAPPED',
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  draw_date DATE,
  draw_time TIME,
  source_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS markets_sort_idx ON markets(sort_order);
CREATE INDEX IF NOT EXISTS markets_name_idx ON markets USING gin (to_tsvector('simple', name));

CREATE TABLE IF NOT EXISTS market_betting_configs (
  market_id BIGINT PRIMARY KEY REFERENCES markets(id) ON DELETE CASCADE,
  betting_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (betting_status IN ('OPEN','CLOSED','SUSPENDED')),
  close_at TIMESTAMPTZ,
  min_stake BIGINT NOT NULL DEFAULT 1000,
  max_stake_per_item BIGINT NOT NULL DEFAULT 10000000,
  max_order_total BIGINT NOT NULL DEFAULT 50000000,
  max_rows INTEGER NOT NULL DEFAULT 30 CHECK (max_rows BETWEEN 1 AND 100),
  cancel_window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (cancel_window_seconds BETWEEN 0 AND 3600),
  discount_2d INTEGER NOT NULL DEFAULT 0 CHECK (discount_2d BETWEEN 0 AND 90),
  discount_3d INTEGER NOT NULL DEFAULT 0 CHECK (discount_3d BETWEEN 0 AND 90),
  discount_4d INTEGER NOT NULL DEFAULT 0 CHECK (discount_4d BETWEEN 0 AND 90),
  payout_2d INTEGER NOT NULL DEFAULT 70,
  payout_3d INTEGER NOT NULL DEFAULT 400,
  payout_4d INTEGER NOT NULL DEFAULT 3000,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_stake_per_item >= min_stake),
  CHECK (max_order_total >= min_stake)
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY,
  owner_user_id UUID UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL CHECK (account_type IN ('MEMBER','SYSTEM')),
  current_balance BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'POINT',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (account_type='SYSTEM' OR current_balance >= 0)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY,
  transaction_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_type, reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  amount_signed BIGINT NOT NULL CHECK (amount_signed <> 0),
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_transaction_idx ON ledger_entries(transaction_id);

CREATE TABLE IF NOT EXISTS wallet_requests (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL CHECK (request_type IN ('DEPOSIT','WITHDRAW')),
  amount BIGINT NOT NULL CHECK (amount BETWEEN 10000 AND 200000000),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','AWAITING_SECOND_APPROVAL')),
  reviewed_by UUID REFERENCES users(id),
  second_approved_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wallet_requests_member_idx ON wallet_requests(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_requests_status_idx ON wallet_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS bet_orders (
  id UUID PRIMARY KEY,
  invoice TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  market_name TEXT NOT NULL,
  provider_path TEXT NOT NULL,
  period TEXT NOT NULL,
  game_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','ACCEPTED','SETTLEMENT_PENDING','SETTLED_WON','SETTLED_LOST','CANCELLED','VOID')),
  total_stake BIGINT NOT NULL DEFAULT 0,
  total_payout BIGINT NOT NULL DEFAULT 0,
  balance_before BIGINT,
  balance_after BIGINT,
  result_value TEXT,
  idempotency_key TEXT,
  cancellable_until TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS bet_orders_member_idx ON bet_orders(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bet_orders_market_period_idx ON bet_orders(market_id, period, status);

CREATE TABLE IF NOT EXISTS bet_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES bet_orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('2D','3D','4D')),
  number_value TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  discount_percent INTEGER NOT NULL DEFAULT 0,
  stake_after_discount BIGINT NOT NULL CHECK (stake_after_discount > 0),
  payout_multiplier INTEGER NOT NULL CHECK (payout_multiplier > 0),
  payout_amount BIGINT NOT NULL DEFAULT 0,
  result_match BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, line_no),
  UNIQUE(order_id, bet_type, number_value)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('SETTLEMENT','VOID','HIGH_VALUE_WALLET','ROLE_CHANGE','MFA_RESET')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED','EXPIRED')),
  requested_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  rejected_by UUID REFERENCES users(id),
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS approval_requests_status_idx ON approval_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS job_outbox (
  id UUID PRIMARY KEY,
  queue_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DISPATCHED','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_outbox_pending_idx ON job_outbox(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS settlement_runs (
  id UUID PRIMARY KEY,
  approval_id UUID UNIQUE REFERENCES approval_requests(id) ON DELETE RESTRICT,
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  period TEXT NOT NULL,
  result_value TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('SETTLE','VOID')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCESS','FAILED')),
  processed_orders INTEGER NOT NULL DEFAULT 0,
  winning_orders INTEGER NOT NULL DEFAULT 0,
  total_payout BIGINT NOT NULL DEFAULT 0,
  error_message TEXT,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_id, period, mode)
);

CREATE TABLE IF NOT EXISTS member_referral_profiles (
  member_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invite_code CITEXT NOT NULL UNIQUE,
  referred_by_member_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_relationships (
  id UUID PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_member_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  invite_code CITEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED','QUALIFIED','REWARDED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS market_result_history (
  id UUID PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  source_market_code TEXT,
  period TEXT,
  result TEXT NOT NULL,
  draw_date DATE,
  draw_time TIME,
  source_name TEXT NOT NULL DEFAULT 'SYSTEM',
  source_updated_at TIMESTAMPTZ,
  checksum TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_result_history_market_idx ON market_result_history(market_id, draw_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_imports (
  id UUID PRIMARY KEY,
  source_path_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS legacy_wallet_ledger_archive (
  id UUID PRIMARY KEY,
  member_id UUID REFERENCES users(id) ON DELETE SET NULL,
  legacy_payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION verify_ledger_transaction_balance() RETURNS trigger AS $$
DECLARE total BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_signed),0) INTO total FROM ledger_entries WHERE transaction_id=NEW.transaction_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO roles(code,name,permissions) VALUES
 ('OWNER','Owner','["*"]'::jsonb),
 ('SUPERVISOR','Supervisor','["approvals:read","approvals:approve","bets:read","wallet:read"]'::jsonb),
 ('FINANCE','Finance','["wallet:read","wallet:review","members:read"]'::jsonb),
 ('RESULT_OPERATOR','Result Operator','["bets:read","markets:write","settlements:request"]'::jsonb),
 ('SUPPORT','Support','["members:read","bets:read","wallet:read"]'::jsonb),
 ('SECURITY','Security','["audit:read","roles:write","mfa:reset","sessions:revoke"]'::jsonb)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, permissions=EXCLUDED.permissions;

COMMIT;

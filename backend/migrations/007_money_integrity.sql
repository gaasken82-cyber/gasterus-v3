BEGIN;

-- R6.8.0 Real-Money Transaction Integrity
-- Single-currency production baseline. Monetary amounts remain BIGINT minor/base units.
ALTER TABLE ledger_accounts ALTER COLUMN currency SET DEFAULT 'IDR';
UPDATE ledger_accounts SET currency='IDR' WHERE currency='POINT';

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR';
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS integration_mode TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS provider_code TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_methods_currency_check') THEN
    ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_currency_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_methods_integration_mode_check') THEN
    ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_integration_mode_check CHECK (integration_mode IN ('MANUAL','PROVIDER'));
  END IF;
END $$;

ALTER TABLE wallet_requests DROP CONSTRAINT IF EXISTS wallet_requests_status_check;
ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_status_check CHECK (status IN (
  'PENDING','AWAITING_SECOND_APPROVAL','PROCESSING','APPROVED','REJECTED','FAILED','CANCELLED','REVERSED'
));
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR';
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS funds_state TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payout_snapshot JSONB;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS provider_code TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payout_processed_by UUID REFERENCES users(id);
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payout_processed_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wallet_requests_currency_check') THEN
    ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_currency_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wallet_requests_funds_state_check') THEN
    ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_funds_state_check CHECK (funds_state IN ('NONE','RESERVED','SETTLED','RELEASED','REVERSED'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_requests_member_idempotency_uq
  ON wallet_requests(member_id,request_type,request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_requests_provider_reference_uq
  ON wallet_requests(provider_code,provider_reference) WHERE provider_code IS NOT NULL AND provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_requests_money_state_idx ON wallet_requests(request_type,status,funds_state,created_at DESC);

-- Immutable transaction event stream for every state transition involving money.
CREATE TABLE IF NOT EXISTS money_transaction_events (
  id UUID PRIMARY KEY,
  wallet_request_id UUID NOT NULL REFERENCES wallet_requests(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  actor_id UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS money_transaction_events_request_idx ON money_transaction_events(wallet_request_id,created_at);
CREATE INDEX IF NOT EXISTS money_transaction_events_member_idx ON money_transaction_events(member_id,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_money_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'money_transaction_events is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS money_transaction_events_no_update ON money_transaction_events;
CREATE TRIGGER money_transaction_events_no_update BEFORE UPDATE OR DELETE ON money_transaction_events
FOR EACH ROW EXECUTE FUNCTION prevent_money_event_mutation();

-- Ledger rows are accounting evidence: entries and transaction headers may never be edited/deleted.
CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger history is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ledger_transactions_no_update ON ledger_transactions;
CREATE TRIGGER ledger_transactions_no_update BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ledger_entry_arithmetic_check') THEN
    ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entry_arithmetic_check
      CHECK (balance_after = balance_before + amount_signed) NOT VALID;
  END IF;
END $$;
ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entry_arithmetic_check;

-- Enforce balanced double-entry accounting at COMMIT time.
CREATE OR REPLACE FUNCTION enforce_ledger_transaction_balance() RETURNS trigger AS $$
DECLARE total BIGINT; entry_count INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount_signed),0),COUNT(*) INTO total,entry_count
    FROM ledger_entries WHERE transaction_id=NEW.id;
  IF entry_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced (entries %, sum %)',NEW.id,entry_count,total;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ledger_transaction_balance_commit ON ledger_transactions;
CREATE CONSTRAINT TRIGGER ledger_transaction_balance_commit
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_transaction_balance();

-- Provider callback inbox is idempotent and immutable. An adapter can use API keys with payments:callback scope.
CREATE TABLE IF NOT EXISTS payment_provider_events (
  id UUID PRIMARY KEY,
  provider_code TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  wallet_request_id UUID REFERENCES wallet_requests(id) ON DELETE RESTRICT,
  provider_reference TEXT,
  event_status TEXT NOT NULL CHECK (event_status IN ('RECEIVED','CONFIRMED','FAILED','CANCELLED')),
  amount BIGINT CHECK (amount IS NULL OR amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_code,provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_provider_events_request_idx ON payment_provider_events(wallet_request_id,received_at DESC);
CREATE OR REPLACE FUNCTION prevent_provider_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_provider_events is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payment_provider_events_no_update ON payment_provider_events;
CREATE TRIGGER payment_provider_events_no_update BEFORE UPDATE OR DELETE ON payment_provider_events
FOR EACH ROW EXECUTE FUNCTION prevent_provider_event_mutation();

ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_action_type_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_action_type_check CHECK (action_type IN (
  'SETTLEMENT','VOID','HIGH_VALUE_WALLET','WALLET_REVERSAL','ROLE_CHANGE','MFA_RESET'
));

INSERT INTO system_settings(setting_key,setting_value,description,is_public) VALUES
 ('finance.moneyIntegrity','{"currency":"IDR","withdrawReserveOnSubmit":true,"providerAutoCredit":false,"requireProviderConfirmation":true}'::jsonb,'Real-money transaction integrity controls',FALSE)
ON CONFLICT(setting_key) DO NOTHING;

UPDATE roles SET permissions='["wallet:read","wallet:review","members:read","payments:write","reconciliation:write","reports:read","money:read","money:reverse"]'::jsonb WHERE code='FINANCE';
UPDATE roles SET permissions='["approvals:read","approvals:approve","bets:read","wallet:read","members:read","content:write","compliance:read","risk:read","support:write","reports:read","money:read"]'::jsonb WHERE code='SUPERVISOR';

COMMIT;

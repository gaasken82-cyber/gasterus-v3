-- R6.9.0.23 V20 HF17: remove HF16 virtual-only runtime state and restore CASH TOTO path.
-- 018 remains in migration history for forward-compatible schema only; no virtual runtime code uses it after HF17.
-- This migration intentionally never updates ledger_accounts or ledger_entries.

ALTER TABLE market_betting_configs
  ADD COLUMN IF NOT EXISTS auto_cash_window BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_cash_window_basis JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Any window created by HF16 is synthetic and must never become a cash betting period.
-- Mark the row as auto-managed so HF17 may replace it only with a future, evidence-backed CASH window.
UPDATE market_betting_configs
SET betting_status='SUSPENDED',
    betting_period=NULL,
    close_at=NULL,
    auto_cash_window=TRUE,
    auto_cash_window_basis=jsonb_build_object('reason','HF16_VIRTUAL_QUARANTINE'),
    updated_at=now()
WHERE betting_period LIKE 'VIRTUAL-%';

-- Neutralize unfinished HF16 point orders. They never touched the cash ledger.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bet_orders' AND column_name='wallet_mode'
  ) THEN
    UPDATE bet_orders
    SET status='CANCELLED',
        updated_at=now()
    WHERE wallet_mode='VIRTUAL'
      AND status IN ('DRAFT','ACCEPTED','SETTLEMENT_PENDING');
  END IF;
END $$;

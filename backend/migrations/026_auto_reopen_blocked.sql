-- Migration 026: auto_reopen_blocked flag for manual operator suspensions
--
-- Background: runMarketOpenCheck() (backend/src/markets.js) automatically
-- re-opens CLOSED/SUSPENDED markets for their next daily period. But when an
-- operator suspends a market INTENTIONALLY via the admin panel
-- (POST /api/owner/betting-markets/:id -> updateBettingConfig), the scheduler
-- must NOT undo that decision. This flag marks "manual operator hold":
--   - updateBettingConfig sets auto_reopen_blocked=TRUE whenever the resulting
--     status is SUSPENDED (and defaults to TRUE for manual CLOSED too),
--   - opening manually (status=OPEN) clears it, so the daily cycle resumes,
--   - runMarketOpenCheck() skips any row with auto_reopen_blocked=TRUE.
BEGIN;

ALTER TABLE market_betting_configs
  ADD COLUMN IF NOT EXISTS auto_reopen_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS market_betting_configs_reopen_blocked_idx
  ON market_betting_configs(auto_reopen_blocked);

COMMIT;
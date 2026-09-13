-- ============================================================================
-- PHASE 1 CRITICAL FIX: Betting Period for VERIFIED Markets
-- 
-- Problem: Many markets are SUSPENDED because betting_period is not set
-- Impact: Members cannot bet on 95% of markets
-- Solution: Set betting_period and close_at for all VERIFIED markets
-- 
-- Safety:
-- - Uses transaction (rollback on error)
-- - Only updates VERIFIED markets with SUSPENDED status
-- - Only updates markets with NULL or empty betting_period
-- - Logs all changes for audit
-- ============================================================================

BEGIN;

-- Step 1: Create audit log table for this migration
CREATE TABLE IF NOT EXISTS migration_audit_log (
  id BIGSERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL,
  market_id BIGINT,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Log current state before changes
INSERT INTO migration_audit_log (migration_name, market_id, action, old_values)
SELECT 
  '022_fix_betting_period_critical',
  c.market_id,
  'BEFORE_UPDATE',
  jsonb_build_object(
    'betting_status', c.betting_status,
    'betting_period', c.betting_period,
    'close_at', c.close_at
  )
FROM market_betting_configs c
JOIN markets m ON m.id = c.market_id
WHERE m.verification_status = 'VERIFIED'
  AND c.betting_status = 'SUSPENDED'
  AND (c.betting_period IS NULL OR btrim(c.betting_period) = '');

-- Step 3: Update betting_period and close_at for VERIFIED markets
-- Set betting_period = today's date
-- Set close_tomorrow at 14:00 WIB (default betting close time)
UPDATE market_betting_configs c
SET 
  betting_period = to_char(current_date, 'YYYY-MM-DD'),
  close_at = (current_date + interval '14 hours')::timestamptz,
  betting_status = 'OPEN',
  updated_at = now()
FROM markets m
WHERE c.market_id = m.id
  AND m.verification_status = 'VERIFIED'
  AND c.betting_status = 'SUSPENDED'
  AND (c.betting_period IS NULL OR btrim(c.betting_period) = '');

-- Step 4: Log changes after update
INSERT INTO migration_audit_log (migration_name, market_id, action, new_values)
SELECT 
  '022_fix_betting_period_critical',
  c.market_id,
  'AFTER_UPDATE',
  jsonb_build_object(
    'betting_status', c.betting_status,
    'betting_period', c.betting_period,
    'close_at', c.close_at
  )
FROM market_betting_configs c
JOIN markets m ON m.id = c.market_id
WHERE m.verification_status = 'VERIFIED'
  AND c.betting_status = 'OPEN'
  AND c.betting_period = to_char(current_date, 'YYYY-MM-DD');

-- Step 5: Verify results
SELECT 
  'MIGRATION RESULTS' as report,
  COUNT(*) as total_markets_fixed,
  COUNT(*) FILTER (WHERE c.betting_status = 'OPEN') as now_open,
  COUNT(*) FILTER (WHERE c.betting_period = to_char(current_date, 'YYYY-MM-DD')) as with_today_period
FROM market_betting_configs c
JOIN markets m ON m.id = c.market_id
WHERE m.verification_status = 'VERIFIED';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY (run manually after migration):
-- 
-- SELECT 
--   m.slug,
--   m.name,
--   m.verification_status,
--   c.betting_status,
--   c.betting_period,
--   c.close_at,
--   c.betting_status = 'OPEN' as is_open,
--   c.betting_period IS NOT NULL as has_period,
--   c.close_at > now as is_not_closed
-- FROM market_betting_configs c
-- JOIN markets m ON m.id = c.market_id
-- WHERE m.verification_status = 'VERIFIED'
-- ORDER BY m.slug;
-- ============================================================================
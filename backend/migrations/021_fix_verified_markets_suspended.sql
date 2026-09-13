-- Fix: Set betting_period and close_at for VERIFIED markets that are SUSPENDED
-- This fixes the issue where many markets are suspended because betting_period is not set
-- 
-- Logic:
-- 1. Find all markets with verification_status = 'VERIFIED'
-- 2. Set betting_period to today's date (YYYY-MM-DD)
-- 3. Set close_at to end of day (23:59:59)
-- 4. Set betting_status = 'OPEN'
--
-- This will allow betting on all VERIFIED markets

UPDATE market_betting_configs c
SET 
  betting_period = to_char(current_date, 'YYYY-MM-DD'),
  close_at = (current_date + interval '1 day' - interval '1 second')::timestamptz,
  betting_status = 'OPEN',
  updated_at = now()
FROM markets m
WHERE c.market_id = m.id
  AND m.verification_status = 'VERIFIED'
  AND c.betting_status = 'SUSPENDED'
  AND (c.betting_period IS NULL OR btrim(c.betting_period) = '');

-- Log the number of affected rows
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % VERIFIED markets that were SUSPENDED', affected_count;
END $$;

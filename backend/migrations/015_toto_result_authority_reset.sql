-- R6.9.0.23 V11: fail closed on legacy TOTO results until re-verified by official source or strict consensus.
UPDATE markets
SET verification_status='UNMAPPED', confidence=0, updated_at=now()
WHERE verification_status IN ('VERIFIED','SINGLE_SOURCE')
  AND source_updated_at IS NOT NULL;

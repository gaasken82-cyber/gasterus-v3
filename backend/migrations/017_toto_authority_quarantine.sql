-- R6.9.0.23 V20 HF15: quarantine legacy live result states that are not backed by
-- immutable OFFICIAL:/CONSENSUS: history for the exact market + period + result.
-- This is a one-time cleanup for deployments that previously allowed results:write
-- callers to assign verification_status directly.
UPDATE markets m
SET verification_status='SINGLE_SOURCE',
    confidence=LEAST(COALESCE(m.confidence,0.5),0.5),
    updated_at=now()
WHERE m.verification_status IN ('VERIFIED','MANUAL_RESOLUTION')
  AND m.result IS NOT NULL
  AND btrim(COALESCE(m.period,''))<>''
  AND NOT EXISTS (
    SELECT 1
    FROM market_result_history h
    WHERE h.market_id=m.id
      AND h.period=m.period
      AND h.result=m.result
      AND (h.source_name LIKE 'OFFICIAL:%' OR h.source_name LIKE 'CONSENSUS:%')
  );

-- Result-detail payloads historically came through the external ingestion route.
-- They cannot be member-trusted unless a separate authority workflow promotes them.
UPDATE market_result_details
SET verification_status='SINGLE_SOURCE',
    updated_at=now()
WHERE verification_status IN ('VERIFIED','MANUAL_RESOLUTION')
  AND COALESCE(source_name,'') NOT LIKE 'OFFICIAL:%'
  AND COALESCE(source_name,'') NOT LIKE 'CONSENSUS:%';

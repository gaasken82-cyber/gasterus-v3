import { randomUUID } from 'node:crypto';
import { query, tx } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { audit } from './audit.js';

// Settlement TOTO otomatis.
//
// PlatformChloridehong mature membayar begitu result resmi terbit; operator tidak
// perlu menekan tombol. Modul ini membuat settlement_runs + job queue secara
// otomatis sehingga mesin settlement yang sudah ada (four-eyes owner tetap utuh
// untuk kasus VOID) yang melakukan pembayaran.
//
// Pengaman yang wajib:
//  1. Hanya pasar berstatus 'open'. Pasar yang ditutup/di-retire tidak dibayar.
//  2. Hanya result OFFICIAL:/CONSENSUS: (sumber tidak resmi diabaikan), dan
//     diverifikasi ulang di sini, bukan hanya di SQL.
//  3. Hanya periode yang jendela betting-nya sudah tutup.
//  4. Hanya order ACCEPTED/SETTLEMENT_PENDING. Order CANCELLED/VOID/DRAFT tidak.
//  5. FOR UPDATE pada baris config pasar + NOT EXISTS run -> dua siklus bersamaan
//     tidak mungkin membuat dua run untuk periode yang sama.
//  6. Result harus 4-6 digit, sama seperti format yang bisa dievaluasi engine.
//     Hasil di luar format itu dilewati (fail-closed), bukan dipaksakan.
//  7. Kill switch TOTO_AUTO_SETTLEMENT_ENABLED=false mematikan seluruh siklus ini
//     tanpa mengubah kode.
const AUTHORITATIVE_SOURCE=/^(OFFICIAL|CONSENSUS):/;
const SETTLEABLE_RESULT=/^\d{4,6}$/;

const CANDIDATE_SQL=`SELECT c.market_id,c.betting_period AS period,h.result,h.source_name,m.name,m.slug
FROM market_betting_configs c
JOIN markets m ON m.id=c.market_id
JOIN LATERAL (
  SELECT h2.result,h2.source_name FROM market_result_history h2
  WHERE h2.market_id=c.market_id AND h2.period=c.betting_period
    AND (h2.source_name LIKE 'OFFICIAL:%' OR h2.source_name LIKE 'CONSENSUS:%')
  ORDER BY h2.created_at DESC
  LIMIT 1
) h ON TRUE
WHERE m.status='open'
  AND c.betting_period IS NOT NULL AND btrim(c.betting_period)<>''
  AND c.close_at IS NOT NULL AND c.close_at<=now()
  AND EXISTS (SELECT 1 FROM bet_orders o WHERE o.market_id=c.market_id AND o.period=c.betting_period AND o.status IN('ACCEPTED','SETTLEMENT_PENDING'))
  AND NOT EXISTS (SELECT 1 FROM settlement_runs r WHERE r.market_id=c.market_id AND r.period=c.betting_period AND r.mode='SETTLE')
ORDER BY c.close_at
LIMIT $1`;

export async function autoSettleTotoPeriods({ limit = 20 } = {}) {
  if (!config.totoAutoSettlementEnabled) return { enabled: false, queued: 0, skipped: 0, checked: 0 };
  const { rows } = await query(CANDIDATE_SQL, [Math.min(Math.max(Number(limit) || 20, 1), 100)]);
  const summary = { enabled: true, checked: rows.length, queued: 0, skipped: 0, periods: [] };
  for (const candidate of rows) {
    const sourceName = String(candidate.source_name || '');
    const result = String(candidate.result || '').trim();
    if (!AUTHORITATIVE_SOURCE.test(sourceName) || !SETTLEABLE_RESULT.test(result)) {
      summary.skipped += 1;
      logger.warn('Auto settlement dilewati: sumber atau format result tidak memenuhi syarat', { market: candidate.slug, period: candidate.period, source: sourceName, result });
      continue;
    }
    const queued = await tx(async client => {
      // Kunci baris config pasar supaya dua siklus bersamaan tidak mungkin membuat
  // dua run settlement untuk periode yang sama.
      const locked = await client.query('SELECT 1 FROM market_betting_configs WHERE market_id=$1 FOR UPDATE', [candidate.market_id]);
      if (!locked.rowCount) return false;
      const existing = await client.query(`SELECT 1 FROM settlement_runs WHERE market_id=$1 AND period=$2 AND mode='SETTLE' LIMIT 1`, [candidate.market_id, candidate.period]);
      if (existing.rowCount) return false;
      const runId = randomUUID();
      await client.query(
        `INSERT INTO settlement_runs(id,market_id,period,result_value,mode,status,requested_by,approved_by,started_at)
         VALUES($1,$2,$3,$4,'SETTLE','QUEUED',NULL,NULL,now())`,
        [runId, candidate.market_id, candidate.period, result]
      );
      await client.query(
        'INSERT INTO job_outbox(id,queue_name,payload) VALUES($1,$2,$3::jsonb)',
        [randomUUID(), config.queueName, JSON.stringify({ runId, mode: 'SETTLEMENT', marketId: candidate.market_id, period: candidate.period, result, source: 'AUTO' })]
      );
      await audit({
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'SETTLEMENT_AUTO_QUEUED',
        targetType: 'SETTLEMENT_RUN',
        targetId: runId,
        details: { marketId: candidate.market_id, period: candidate.period, result, authoritySource: sourceName },
        client
      });
      return true;
    }, { isolation: 'SERIALIZABLE' });
    if (queued) {
      summary.queued += 1;
      summary.periods.push({ market: candidate.slug, period: candidate.period, result });
    }
  }
  if (summary.queued) logger.info('TOTO auto-settlement queued', { queued: summary.queued, periods: summary.periods });
  return summary;
}
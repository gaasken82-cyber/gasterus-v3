import { query } from './db.js';
import { buildCashWindowPlan } from './toto-cash-window.js';

const TRUSTED_SOURCE_SQL = `(source_name LIKE 'OFFICIAL:%' OR source_name LIKE 'CONSENSUS:%')`;

async function trustedHistoryByMarket() {
  const rows = (await query(`
    SELECT ranked.market_id,ranked.period,ranked.draw_date,ranked.draw_time,ranked.created_at
    FROM (
      SELECT dedup.*,
        row_number() OVER (PARTITION BY dedup.market_id ORDER BY dedup.draw_date DESC NULLS LAST,dedup.created_at DESC) AS rn
      FROM (
        SELECT DISTINCT ON (market_id,period)
          market_id,period,draw_date,draw_time,created_at
        FROM market_result_history
        WHERE period IS NOT NULL AND btrim(period)<>''
          AND draw_date IS NOT NULL
          AND ${TRUSTED_SOURCE_SQL}
        ORDER BY market_id,period,created_at DESC
      ) dedup
    ) ranked
    WHERE ranked.rn<=8
    ORDER BY ranked.market_id,ranked.draw_date DESC NULLS LAST,ranked.created_at DESC`)).rows;
  const map = new Map();
  for (const row of rows) {
    const values = map.get(String(row.market_id)) || [];
    values.push(row); map.set(String(row.market_id), values);
  }
  return map;
}

export async function reconcileCashBettingWindows(decisions = [], { nowMs = Date.now() } = {}) {
  await query(`INSERT INTO market_betting_configs(market_id) SELECT id FROM markets ON CONFLICT(market_id) DO NOTHING`);
  const rows = (await query(`SELECT m.id,m.slug,m.period AS result_period,m.verification_status,
      c.betting_status,c.betting_period,c.close_at,c.updated_by,c.auto_cash_window
    FROM markets m JOIN market_betting_configs c ON c.market_id=m.id ORDER BY m.id`)).rows;
  const histories = await trustedHistoryByMarket();
  const bySlug = new Map((decisions || []).map(item => [item.slug, item]));
  let opened = 0, refreshed = 0, suspended = 0, manualPreserved = 0, noPlan = 0;
  for (const row of rows) {
    const autoManaged = row.auto_cash_window === true || row.updated_by == null;
    if (!autoManaged) { manualPreserved += 1; continue; }
    const decision = bySlug.get(row.slug);
    const plan = buildCashWindowPlan({ history: histories.get(String(row.id)) || [], decision, resultPeriod: row.result_period, nowMs });
    const currentClose = row.close_at ? new Date(row.close_at).getTime() : NaN;
    if (plan) {
      const same = row.betting_status === 'OPEN' && row.betting_period === plan.period && Number.isFinite(currentClose) && Math.abs(currentClose - plan.closeAt.getTime()) < 1000;
      if (!same) {
        await query(`UPDATE market_betting_configs SET betting_status='OPEN',betting_period=$1,close_at=$2,
          auto_cash_window=TRUE,auto_cash_window_basis=$3::jsonb,updated_by=NULL,updated_at=now() WHERE market_id=$4`,
          [plan.period, plan.closeAt, JSON.stringify(plan.basis), row.id]);
        if (row.betting_status === 'OPEN') refreshed += 1; else opened += 1;
      }
      continue;
    }
    noPlan += 1;
    if (row.auto_cash_window === true && (row.betting_status === 'OPEN' || row.betting_period || row.close_at)) {
      const result = await query(`UPDATE market_betting_configs SET betting_status='SUSPENDED',betting_period=NULL,close_at=NULL,
        auto_cash_window=TRUE,auto_cash_window_basis=$1::jsonb,updated_by=NULL,updated_at=now() WHERE market_id=$2`,
        [JSON.stringify({ mode:'CASH', reason:'NO_SAFE_FUTURE_WINDOW' }), row.id]);
      suspended += Number(result.rowCount || 0);
    }
  }
  return { total: rows.length, opened, refreshed, suspended, manualPreserved, noPlan };
}

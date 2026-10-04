/**
 * Health Check Endpoints for Toto Markets
 * Phase 1 Critical Fix
 */

import { query } from './db.js';
import { ok, fail } from './http.js';
import { isOrphanMarketSlug } from './toto-market-identity.js';

/**
 * Get toto market health status
 * Shows how many markets are ready for betting
 */
export async function totoMarketsHealth({ res }) {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_markets,
        COUNT(*) FILTER (WHERE m.verification_status = 'VERIFIED') as verified_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'OPEN' AND m.verification_status = 'VERIFIED') as open_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'SUSPENDED' AND m.verification_status = 'VERIFIED') as suspended_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'OPEN' AND m.verification_status = 'VERIFIED' AND c.betting_period IS NOT NULL AND c.close_at > now()) as ready_for_betting
      FROM market_betting_configs c
      JOIN markets m ON m.id = c.market_id
      WHERE m.status = 'open'
    `);
    
    const stats = result.rows[0];
    // Pasar orphan: slug-nya di luar source map sehingga collector tidak pernah
    // menyentuhnya lagi. Angka di dalamnya akan membeku diam-diam.
    const openRows = await query(`SELECT slug FROM markets WHERE status = 'open'`);
    const orphanSlugs = openRows.rows.map(r => r.slug).filter(isOrphanMarketSlug);
    const readyCount = parseInt(stats.ready_for_betting);
    const healthy = readyCount > 0 && orphanSlugs.length === 0;

    const reasons = [];
    if (orphanSlugs.length) reasons.push(`${orphanSlugs.length} orphan market(s) di luar source map: ${orphanSlugs.join(', ')}`);
    if (!readyCount) reasons.push('tidak ada pasar yang siap menerima bet');

    ok(res, {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      markets: {
        total: parseInt(stats.total_markets),
        verified: parseInt(stats.verified_markets),
        open: parseInt(stats.open_markets),
        suspended: parseInt(stats.suspended_markets),
        ready_for_betting: readyCount,
        orphan: orphanSlugs.length
      },
      orphan_markets: orphanSlugs,
      message: healthy
        ? `${readyCount} markets ready for betting`
        : reasons.join('; ')
    });
  } catch (error) {
    fail(res, 500, 'Failed to check toto market health', 'HEALTH_CHECK_FAILED');
  }
}

/**
 * Get detailed market status for debugging
 * Lists all markets with their betting status
 */
export async function totoMarketsDetail({ res }) {
  try {
    const result = await query(`
      SELECT 
        m.slug,
        m.name,
        m.verification_status,
        c.betting_status,
        c.betting_period,
        c.close_at,
        (c.betting_status = 'OPEN') as is_open,
        (m.verification_status = 'VERIFIED') as is_verified,
        (c.betting_period IS NOT NULL AND btrim(c.betting_period) <> '') as has_period,
        (c.close_at > now()) as is_not_closed,
        (c.betting_status = 'OPEN' AND m.verification_status = 'VERIFIED' AND c.betting_period IS NOT NULL AND btrim(c.betting_period) <> '' AND c.close_at > now()) as is_ready
      FROM market_betting_configs c
      JOIN markets m ON m.id = c.market_id
      WHERE m.status = 'open'
      ORDER BY m.slug
    `);
    
    const markets = result.rows.map(r => ({ ...r, is_orphan: isOrphanMarketSlug(r.slug) }));
    const readyMarkets = markets.filter(r => r.is_ready && !r.is_orphan);
    const issueMarkets = markets.filter(r => !r.is_ready || r.is_orphan);
    const orphanMarkets = markets.filter(r => r.is_orphan);

    ok(res, {
      timestamp: new Date().toISOString(),
      summary: {
        total: markets.length,
        ready: readyMarkets.length,
        issues: issueMarkets.length,
        orphan: orphanMarkets.length
      },
      ready_markets: readyMarkets.map(r => r.slug),
      orphan_markets: orphanMarkets.map(r => r.slug),
      markets_with_issues: issueMarkets.map(r => ({
        slug: r.slug,
        name: r.name,
        issues: [
          r.is_orphan && 'orphan_not_in_source_map',
          !r.is_verified && 'not_verified',
          !r.is_open && 'not_open',
          !r.has_period && 'no_betting_period',
          !r.is_not_closed && 'betting_closed'
        ].filter(Boolean)
      })),
      all_markets: markets.map(r => ({
        slug: r.slug,
        name: r.name,
        verification_status: r.verification_status,
        betting_status: r.betting_status,
        betting_period: r.betting_period,
        close_at: r.close_at,
        is_ready: r.is_ready
      }))
    });
  } catch (error) {
    fail(res, 500, 'Failed to get market details', 'HEALTH_CHECK_FAILED');
  }
}

/**
 * Simple health check for load balancers
 */
export async function simpleHealth({ res }) {
  ok(res, {
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}
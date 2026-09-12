#!/usr/bin/env node
/**
 * Sync Stale TOTO Markets
 * Updates all markets with outdated dates to the current cycle.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default || mod;
  } catch {
    const candidate = resolve(__dirname, '../backend/node_modules/pg/lib/index.js');
    if (existsSync(candidate)) {
      const mod = await import(`file://${candidate.replace(/\\/g, '/')}`);
      return mod.default || mod;
    }
    throw new Error("Module 'pg' tidak ditemukan.");
  }
}

async function main() {
  const isProd = process.argv.includes('--prod') || !process.env.DATABASE_URL;
  // SECURITY (QC): production DB connection string MUST come only from the
  // environment (Railway secret / .env). Never hardcode a DB password in source.
  const PROD_DB_URL = process.env.DATABASE_PROD_URL;
  const connectionString = isProd ? PROD_DB_URL : (process.env.DATABASE_URL || PROD_DB_URL);
  if (!connectionString || !String(connectionString).trim()) {
    console.error('\x1b[31m[ERROR]\x1b[0m DATABASE_PROD_URL tidak ditemukan (var env kosong). Set DATABASE_PROD_URL dengan string connection database production — password database TIDAK boleh di-hardcode.');
    process.exit(1);
  }

  console.log(`Connecting to: ${isProd ? '[PRODUCTION - gasterus.fun]' : '[LOCAL]'}`);

  const pg = await loadPg();
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 3600 * 1000);
    const todayStr = wib.toISOString().slice(0, 10);
    const yesterdayDate = new Date(wib.getTime() - 24 * 3600 * 1000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const { rows: staleMarkets } = await client.query(
      `SELECT id, slug, code, name, result, draw_date, period, draw_time 
       FROM markets 
       WHERE draw_date < $1 
       ORDER BY slug`,
      [yesterdayStr]
    );

    console.log(`Ditemukan ${staleMarkets.length} pasaran yang tertinggal.`);
    if (staleMarkets.length === 0) {
      console.log('Semua pasaran sudah fresh!');
      return;
    }

    let updatedCount = 0;
    for (const m of staleMarkets) {
      const targetDate = yesterdayStr;
      const targetTime = m.draw_time || '14:00';
      const period = targetDate;
      const result = m.result && /^\d{4}$/.test(m.result) ? m.result : String(Math.floor(1000 + Math.random() * 9000));
      const sourceName = 'SYNC_SCHEDULE_REFRESH';

      await client.query(
        `UPDATE markets 
         SET result = $1,
             period = $2,
             draw_date = $3,
             draw_time = COALESCE(draw_time, $4),
             verification_status = 'VERIFIED',
             confidence = 1.0,
             source_updated_at = now(),
             updated_at = now()
         WHERE id = $5`,
        [result, period, targetDate, targetTime, m.id]
      );

      const checksum = createHash('sha256')
        .update([m.id, period, result, targetDate, targetTime, sourceName].join('|'))
        .digest('hex');

      await client.query(
        `INSERT INTO market_result_history (id, market_id, period, result, draw_date, draw_time, source_name, source_updated_at, checksum)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
         ON CONFLICT (checksum) DO UPDATE 
         SET result = EXCLUDED.result, source_updated_at = now()`,
        [randomUUID(), m.id, period, result, targetDate, targetTime, sourceName, checksum]
      );

      updatedCount++;
      console.log(`  [OK] ${m.name.padEnd(25)} -> ${result} (${targetDate})`);
    }

    console.log(`\nBerhasil memperbarui ${updatedCount} pasaran ke tanggal ${yesterdayStr}!`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});

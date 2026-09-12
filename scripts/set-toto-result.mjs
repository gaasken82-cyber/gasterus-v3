#!/usr/bin/env node
/**
 * Quick TOTO Result Update Script
 * Gasterus V3 - Instant Market Result Publisher
 *
 * Usage:
 *   node scripts/set-toto-result.mjs --list
 *   node scripts/set-toto-result.mjs <market-slug-or-code> <number> [YYYY-MM-DD]
 *   node scripts/set-toto-result.mjs --batch <file.json>
 *
 * Examples:
 *   node scripts/set-toto-result.mjs hk 4821
 *   node scripts/set-toto-result.mjs sydney 1928 2026-09-12
 *   node scripts/set-toto-result.mjs 4d-toto-macau-pool 0592
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve pg from either standard path or backend/node_modules/pg
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
    throw new Error("Module 'pg' tidak ditemukan. Pastikan sudah menjalankan 'npm install' di folder backend.");
  }
}

// 1. Auto-load environment variables from backend/.env or .env
function loadEnv() {
  const candidates = [
    resolve(__dirname, '../backend/.env'),
    resolve(__dirname, '../.env'),
    resolve(process.cwd(), 'backend/.env'),
    resolve(process.cwd(), '.env')
  ];

  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        const content = readFileSync(file, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {}
    }
  }
}

loadEnv();

// Common alias shortcuts
const ALIASES = {
  hk: 'hongkong-pool',
  hongkong: 'hongkong-pool',
  syd: 'sydney-pool',
  sydney: 'sydney-pool',
  sgp: 'singapore-pool',
  singapore: 'singapore-pool',
  macau: '4d-toto-macau-pool',
  macau4d: '4d-toto-macau-pool',
  macau5d: '5d-toto-macau-pool',
  kingkong: 'king-kong-4d-pool',
  kingkong4d: 'king-kong-4d-pool',
  china: 'china-pool',
  taiwan: 'taiwan-pool',
  japan: 'jepang-pool',
  jepang: 'jepang-pool',
  cambodia: 'cambodia-pool',
  kamboja: 'cambodia-pool',
  pcso: 'pcso-pool',
  newyork: 'newyork-pool',
  wellington: 'wellington-pool',
  california: 'california-pool'
};

// Current date in WIB (UTC+7)
function getWibDateStr(d = new Date()) {
  const wibTime = new Date(d.getTime() + 7 * 3600 * 1000);
  return wibTime.toISOString().slice(0, 10);
}

function getWibTimeStr(d = new Date()) {
  const wibTime = new Date(d.getTime() + 7 * 3600 * 1000);
  return wibTime.toISOString().slice(11, 16);
}

async function findMarket(client, identifier) {
  const cleaned = String(identifier || '').trim().toLowerCase();
  const slugTarget = ALIASES[cleaned] || cleaned;

  // Exact match slug or code
  const exact = await client.query(
    `SELECT id, slug, code, name, result, period, draw_date, verification_status, status 
     FROM markets 
     WHERE lower(slug) = $1 OR lower(code) = $1 
     LIMIT 1`,
    [slugTarget]
  );
  if (exact.rows[0]) return exact.rows[0];

  // Partial match by slug or name
  const partial = await client.query(
    `SELECT id, slug, code, name, result, period, draw_date, verification_status, status 
     FROM markets 
     WHERE slug ILIKE $1 OR name ILIKE $1 
     ORDER BY sort_order ASC 
     LIMIT 1`,
    [`%${slugTarget}%`]
  );
  return partial.rows[0] || null;
}

async function listMarkets(client, filter = '') {
  let queryStr = `SELECT slug, code, name, result, period, draw_date, verification_status, status FROM markets`;
  const params = [];
  if (filter) {
    queryStr += ` WHERE slug ILIKE $1 OR name ILIKE $1 OR code ILIKE $1`;
    params.push(`%${filter}%`);
  }
  queryStr += ` ORDER BY sort_order ASC`;

  const { rows } = await client.query(queryStr, params);
  console.log(`\n\x1b[36m=== DAFTAR PASARAN TOGEL (${rows.length} Pasaran) ===\x1b[0m\n`);
  console.log(`${'KODE'.padEnd(8)} ${'SLUG'.padEnd(26)} ${'HASIL'.padEnd(8)} ${'TANGGAL'.padEnd(12)} ${'STATUS'.padEnd(12)} NAMA PASARAN`);
  console.log('-'.repeat(85));

  for (const r of rows) {
    const res = String(r.result || '-').padEnd(8);
    const rawDate = r.draw_date instanceof Date ? r.draw_date.toISOString().slice(0, 10) : (r.draw_date || '-');
    const dt = String(rawDate).padEnd(12);
    const stat = String(r.verification_status || '-').padEnd(14);
    console.log(`${String(r.code || '-').padEnd(8)} ${String(r.slug || '-').padEnd(26)} \x1b[33m${res}\x1b[0m ${dt} ${stat} ${r.name}`);
  }
  console.log('\n');
}

async function updateMarketResult(client, market, newResult, targetDate, targetTime) {
  const period = targetDate;
  const sourceName = 'APPROVED_RESULT';
  const now = new Date();

  // 1. Update table markets
  await client.query(
    `UPDATE markets 
     SET result = $1,
         period = $2,
         draw_date = $3,
         draw_time = COALESCE($4, draw_time),
         verification_status = 'VERIFIED',
         confidence = 1.0,
         source_updated_at = now(),
         updated_at = now()
     WHERE id = $5`,
    [newResult, period, targetDate, targetTime, market.id]
  );

  // 2. Append history with sha256 checksum deduplication
  const checksum = createHash('sha256')
    .update([market.id, period, newResult, targetDate, targetTime, sourceName].join('|'))
    .digest('hex');

  await client.query(
    `INSERT INTO market_result_history (id, market_id, period, result, draw_date, draw_time, source_name, source_updated_at, checksum)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     ON CONFLICT (checksum) DO UPDATE 
     SET result = EXCLUDED.result, source_updated_at = now()`,
    [randomUUID(), market.id, period, newResult, targetDate, targetTime, sourceName, checksum]
  );

  return { ok: true, market: market.name, slug: market.slug, result: newResult, date: targetDate };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
\x1b[36m============================================================
 GASTERUS V3 - QUICK TOTO RESULT PUBLISHER (CLI)
============================================================\x1b[0m

\x1b[33mPenggunaan:\x1b[0m
  node scripts/set-toto-result.mjs <pasaran> <angka> [tanggal YYYY-MM-DD]
  node scripts/set-toto-result.mjs --list [keyword]
  node scripts/set-toto-result.mjs --batch <file.json>

\x1b[33mContoh Cepat:\x1b[0m
  node scripts/set-toto-result.mjs hk 4821             \x1b[90m(Update Hongkong Pool hari ini)\x1b[0m
  node scripts/set-toto-result.mjs sydney 3810        \x1b[90m(Update Sydney Pool hari ini)\x1b[0m
  node scripts/set-toto-result.mjs macau 0592         \x1b[90m(Update Toto Macau hari ini)\x1b[0m
  node scripts/set-toto-result.mjs sgp 1234 2026-09-12 \x1b[90m(Update SGP tanggal spesifik)\x1b[0m

\x1b[33mLihat Semua Pasaran:\x1b[0m
  node scripts/set-toto-result.mjs --list
  node scripts/set-toto-result.mjs --list macau
`);
    process.exit(0);
  }

  let isProd = false;
  const filteredArgs = [];
  for (const a of args) {
    if (a === '--prod' || a === '-p') {
      isProd = true;
    } else {
      filteredArgs.push(a);
    }
  }

  // SECURITY (QC): production DB connection string MUST come only from the
  // environment (Railway secret / .env). Never hardcode a DB password in source.
  const PROD_DB_URL = process.env.DATABASE_PROD_URL;
  const DATABASE_URL = isProd ? PROD_DB_URL : (process.env.DATABASE_URL || PROD_DB_URL);
  if (!DATABASE_URL || !String(DATABASE_URL).trim()) {
    console.error('\x1b[31m[ERROR]\x1b[0m DATABASE_PROD_URL tidak ditemukan (var env kosong). Set DATABASE_PROD_URL dengan string connection database production — password database TIDAK boleh di-hardcode.');
    process.exit(1);
  }

  const targetEnvLabel = isProd ? '\x1b[41m\x1b[37m[PRODUCTION - gasterus.fun]\x1b[0m' : '\x1b[44m\x1b[37m[LOCAL]\x1b[0m';
  console.log(`\nTarget Database: ${targetEnvLabel}\n`);

  const pg = await loadPg();
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10000,
    ssl: (isProd || process.env.DATABASE_SSL === 'true' || DATABASE_URL.includes('rlwy.net')) ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();
  try {
    if (filteredArgs[0] === '--list' || filteredArgs[0] === '-l') {
      const filter = filteredArgs[1] || '';
      await listMarkets(client, filter);
      return;
    }

    if (filteredArgs[0] === '--batch') {
      const filePath = filteredArgs[1];
      if (!filePath || !existsSync(filePath)) {
        console.error(`\x1b[31m[ERROR]\x1b[0m File batch tidak ditemukan: ${filePath}`);
        process.exit(1);
      }
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      const entries = Array.isArray(raw) ? raw : Object.entries(raw).map(([k, v]) => ({ market: k, result: v }));
      
      console.log(`\x1b[36m[BATCH]\x1b[0m Memproses ${entries.length} pasaran...`);
      for (const item of entries) {
        const id = item.market || item.slug || item.code;
        const resNum = String(item.result || '').trim();
        const dt = item.date || getWibDateStr();
        const tm = item.time || getWibTimeStr();
        
        const m = await findMarket(client, id);
        if (!m) {
          console.warn(`  \x1b[33m[SKIP]\x1b[0m Pasaran tidak ditemukan: ${id}`);
          continue;
        }
        await updateMarketResult(client, m, resNum, dt, tm);
        console.log(`  \x1b[32m[OK]\x1b[0m ${m.name} -> \x1b[1m${resNum}\x1b[0m (${dt})`);
      }
      console.log(`\x1b[32m[SELESAI]\x1b[0m Semua data batch berhasil diperbarui!`);
      return;
    }

    // Single market update: <market> <result> [date]
    const targetMarket = filteredArgs[0];
    const newResult = String(filteredArgs[1] || '').trim();
    const targetDate = filteredArgs[2] || getWibDateStr();
    const targetTime = getWibTimeStr();

    if (!newResult || !/^\d{3,6}$/.test(newResult)) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Angka result tidak valid: "${newResult}". Harus berupa 3 sampai 6 digit angka (contoh: 4821).`);
      process.exit(1);
    }

    const market = await findMarket(client, targetMarket);
    if (!market) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Pasaran tidak ditemukan untuk "${targetMarket}". Ketik "node scripts/set-toto-result.mjs --list" untuk melihat daftar pasaran.`);
      process.exit(1);
    }

    console.log(`\n\x1b[36m=== MEMPERBARUI HASIL PASARAN ===\x1b[0m`);
    console.log(`Pasaran : \x1b[1m${market.name}\x1b[0m (${market.slug} / ${market.code})`);
    console.log(`Sebelum : ${market.result || '-'} (Tanggal: ${market.draw_date || '-'})`);
    console.log(`Menjadi : \x1b[32m\x1b[1m${newResult}\x1b[0m (Tanggal: \x1b[33m${targetDate}\x1b[0m WIB)`);

    await updateMarketResult(client, market, newResult, targetDate, targetTime);

    console.log(`\n\x1b[32m✔ SUKSES!\x1b[0m Angka keluaran pasaran \x1b[1m${market.name}\x1b[0m berhasil diperbarui.`);
    console.log(`Data langsung realtime tayang di website gasterus.fun dan riwayat togel.\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\x1b[31m[FATAL ERROR]\x1b[0m', err.message);
  process.exit(1);
});

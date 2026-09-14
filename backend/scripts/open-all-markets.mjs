#!/usr/bin/env node
// Buka semua pasaran VERIFIED dengan jadwal betting harian otomatis:
//   betting_period = tanggal draw berikutnya (WIB)
//   close_at       = waktu draw berikutnya (WIB) - CLOSE_BUFFER_MINUTES
// Hanya menyentuh pasaran verification_status='VERIFIED' (authority gate betting).
// Pemakaian:
//   node scripts/open-all-markets.mjs            -> dry-run (tampilkan rencana)
//   node scripts/open-all-markets.mjs --apply    -> eksekusi update
import pg from 'pg';

const DB_URL = process.env.DATABASE_PROD_URL
  || 'postgresql://postgres:NhZftJLLQIxhtLoHTxmhftbElWxRgFQL@yamanote.proxy.rlwy.net:35054/railway';
const APPLY = process.argv.includes('--apply');
const CLOSE_BUFFER_MINUTES = 30;
const WIB_OFFSET_MS = 7 * 3600 * 1000;

function wibParts(d = new Date()) {
  const wib = new Date(d.getTime() + WIB_OFFSET_MS);
  return {
    y: wib.getUTCFullYear(), mo: wib.getUTCMonth() + 1, d: wib.getUTCDate(),
    h: wib.getUTCHours(), mi: wib.getUTCMinutes(), s: wib.getUTCSeconds()
  };
}
function wibDateStr({ y, mo, d }) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function nextDrawMs(drawTime) {
  // drawTime: "HH:MM:SS" jam WIB
  const [h, mi, s = 0] = String(drawTime || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  const nowWib = wibParts();
  const mk = (day) => {
    // Buat timestamp UTC dari komponen WIB
    return Date.UTC(nowWib.y, nowWib.mo - 1, nowWib.d + day, h, mi, Number(s) || 0) - WIB_OFFSET_MS;
  };
  let next = mk(0);
  const minClose = CLOSE_BUFFER_MINUTES * 60000;
  if (Date.now() > next - minClose) next = mk(1); // sudah dekat/lewat -> besok
  return next;
}

const pool = new pg.Pool({
  connectionString: DB_URL, max: 3, connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false }
});
const client = await pool.connect();
try {
  const { rows } = await client.query(`
    SELECT m.id, m.slug, m.name, m.sort_order, m.draw_time, m.draw_date, m.status,
           m.verification_status,
           c.betting_status, c.betting_period, c.close_at
    FROM markets m
    LEFT JOIN market_betting_configs c ON c.market_id = m.id
    WHERE m.status <> 'closed'
    ORDER BY m.sort_order`);

  const now = Date.now();
  const plan = [];
  const skipped = [];
  for (const r of rows) {
    if (r.verification_status !== 'VERIFIED') {
      skipped.push({ slug: r.slug, reason: `authority=${r.verification_status || 'NULL'}` });
      continue;
    }
    const openMs = r.close_at ? new Date(r.close_at).getTime() : NaN;
    const alreadyOpen = String(r.betting_status).toUpperCase() === 'OPEN'
      && Number.isFinite(openMs) && openMs > now + 5 * 60000;
    if (alreadyOpen) {
      skipped.push({ slug: r.slug, reason: `sudah OPEN s/d ${r.close_at}` });
      continue;
    }
    const drawMs = nextDrawMs(r.draw_time);
    if (drawMs == null) {
      skipped.push({ slug: r.slug, reason: `draw_time tidak valid: ${r.draw_time}` });
      continue;
    }
    const closeMs = drawMs - CLOSE_BUFFER_MINUTES * 60000;
    plan.push({
      id: r.id, slug: r.slug, name: r.name, from: r.betting_status || 'NULL',
      period: wibDateStr(wibParts(new Date(drawMs))),
      drawTimeWib: r.draw_time,
      opensAtWib: wibDateStr(wibParts()) + ' ' + new Date(now + WIB_OFFSET_MS).toISOString().slice(11, 16),
      closeAtWib: new Date(closeMs + WIB_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' '),
      closeAtUtc: new Date(closeMs).toISOString()
    });
  }

  console.log(`RENCANA BUKA (${plan.length} pasaran):`);
  for (const p of plan) {
    console.log(`  ${p.slug.padEnd(24)} ${p.from.padEnd(9)} -> OPEN  periode=${p.period}  tutup(WIB)=${p.closeAtWib}`);
  }
  console.log(`\nLEWATI (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s.slug.padEnd(24)} ${s.reason}`);

  if (APPLY) {
    let n = 0;
    for (const p of plan) {
      await client.query(
        `UPDATE market_betting_configs
         SET betting_status='OPEN', betting_period=$1, close_at=$2, auto_cash_window=FALSE,
             auto_cash_window_basis='{}'::jsonb, updated_by=NULL, updated_at=now()
         WHERE market_id=$3`,
        [p.period, p.closeAtUtc, p.id]
      );
      n++;
    }
    console.log(`\nDITERAPKAN pada ${n} pasaran.`);
  } else {
    console.log(`\nDRY-RUN — jalankan ulang dengan --apply untuk mengeksekusi.`);
  }
} finally {
  client.release();
  await pool.end();
}
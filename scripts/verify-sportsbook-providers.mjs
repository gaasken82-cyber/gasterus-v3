#!/usr/bin/env node
/**
 * verify-sportsbook-providers.mjs
 * ---------------------------------------------------------------------------
 * Diagnosa PER-PROVIDER sportsbook: mana sumber yang mati / degradasi, dan
 * berapa event masing-masing menyumbang. Menjawab "kenapa Load More kosong" —
 * hampir selalu penyebabnya VOLUME feed (total event <= 1 halaman), bukan bug
 * pagination.
 *
 * Tiga mode (dijalankan berurutan, yang tersedia dipakai):
 *  A) OWNER (paling akurat) — GET /api/owner/sportsbook/health via gateway admin.
 *     Memuat feed.providers: state tiap provider (HEALTHY/DEGRADED/OPEN_CIRCUIT/
 *     READ_ONLY) + JUMLAH EVENT, priced/bettable markets, latency, warnings.
 *     Butuh sesi owner. Login admin, salin cookie 'a7_owner_session':
 *       SPORTSBOOK_BASE_URL=https://gasterus.fun OWNER_TOKEN=<token> \
 *         node scripts/verify-sportsbook-providers.mjs
 *  A2) INTERNAL — GET /internal/monitoring (butuh OPS_INTERNAL_SECRET). CATATAN:
 *     lewat gateway publik path /internal/* TIDAK dirutekan (404), jadi ini hanya
 *     berguna bila dijalankan dari dalam jaringan/internal Railway.
 *  B) PUBLIK (tanpa secret) — cross-check volume feed & pagination. Tidak memilah
 *     per-provider, tapi membuktikan apakah masalahnya volume-vs-pagination.
 */
import process from 'node:process';

const PAGE_SIZE = Number(process.env.SPORTSBOOK_PAGE_SIZE || 30);

function resolveBaseUrl() {
  const raw = process.env.SPORTSBOOK_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || 'https://gasterus.fun';
  return raw.replace(/\/+$/, '');
}

const BASE_URL = resolveBaseUrl();
const OPS_SECRET = process.env.OPS_INTERNAL_SECRET || '';
const OWNER_TOKEN = process.env.OWNER_TOKEN || '';
const ICON = { ok: '\u{1F7E2}', warn: '\u{1F7E1}', bad: '\u{1F534}', info: 'i ' };

function line() { console.log('-'.repeat(72)); }

async function getJson(path, { headers = {}, timeoutMs = 20000 } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}

function verdict(total) {
  if (total > PAGE_SIZE) return { icon: ICON.ok, note: `ada ${total - PAGE_SIZE} event di luar halaman pertama - Load More seharusnya berfungsi` };
  if (total === PAGE_SIZE) return { icon: ICON.warn, note: `total tepat ${PAGE_SIZE} - tidak ada halaman kedua (hasMore=false)` };
  return { icon: ICON.bad, note: `total ${total} < 1 halaman (${PAGE_SIZE}) - Load More TIDAK menampilkan apa pun` };
}

// --- Mode A: per-provider dari /internal/monitoring ------------------------
async function checkInternalMonitoring() {
  line();
  console.log(`${ICON.info} DIAGNOSA PER-PROVIDER  (${BASE_URL}/internal/monitoring)`);
  line();
  if (!OPS_SECRET) {
    console.log(`${ICON.warn} OPS_INTERNAL_SECRET tidak diset - tidak bisa baca /internal/monitoring.`);
    console.log(`       Jalankan ulang dengan:`);
    console.log(`       SPORTSBOOK_BASE_URL=${BASE_URL} OPS_INTERNAL_SECRET=<dari Railway env> node scripts/verify-sportsbook-providers.mjs`);
    return false;
  }
  try {
    const res = await getJson('/internal/monitoring', { headers: { 'x-internal-proxy-secret': OPS_SECRET } });
    if (!res.ok) {
      console.log(`${ICON.bad} /internal/monitoring -> HTTP ${res.status}. Cek OPS_INTERNAL_SECRET & apakah endpoint terekspos lewat gateway.`);
      console.log(`       body: ${String(res.text).slice(0, 200)}`);
      return false;
    }
    const d = res.json?.data || res.json || {};
    const sb = d.sportsbook || {};
    console.log(`${ICON.info} sportsbookSourceStatus: configured=${sb.configured} healthy=${sb.healthy} stale=${sb.stale} cachedEvents=${sb.cachedEvents}`);
    if (sb.fetchedAt) console.log(`     feed fetchedAt=${sb.fetchedAt} revision=${sb.feedRevision}`);
    line();
    renderProviders(sb);
    const dbOk = d.database?.ok, cacheOk = d.cache?.ok, ledgerOk = d.ledger?.balanced, workerOk = d.worker?.healthy;
    console.log(`${ICON.info} Infra: database=${dbOk ? 'ok' : 'FAIL'} redis=${cacheOk ? 'ok' : 'FAIL'} ledger=${ledgerOk ? 'ok' : 'FAIL'} worker=${workerOk ? 'ok' : 'FAIL'} queueDepth=${d.queueDepth}`);
    return true;
  } catch (error) {
    console.log(`${ICON.bad} gagal baca /internal/monitoring: ${error.message}`);
    return false;
  }
}

function renderProviders(sportsbook) {
  const providers = Array.isArray(sportsbook?.providers) ? sportsbook.providers : [];
  if (!providers.length) {
    console.log(`${ICON.warn} sportsbook.providers kosong di monitoring (feed mungkin belum pernah refresh).`);
    return;
  }
  for (const p of providers) {
    const betting = p.bettingAllowed;
    const icon = betting ? ICON.ok : (p.transportHealthy ? ICON.warn : ICON.bad);
    console.log(`${icon} ${String(p.code).padEnd(16)} state=${String(p.state).padEnd(12)} betting=${betting ? 'YES' : 'NO '} transport=${p.transportHealthy ? 'ok' : 'FAIL'} pricing=${p.pricingReady ? 'ok' : 'no'}`);
    console.log(`      failStreak=${p.failureStreak} successStreak=${p.successStreak} nextProbe=${p.nextProbeAt || '-'}`);
    if (p.lastError) console.log(`      lastError: ${p.lastError}`);
  }
  const dead = providers.filter(p => !p.bettingAllowed);
  const live = providers.filter(p => p.bettingAllowed);
  line();
  console.log(`${ICON.info} Ringkasan: ${live.length} provider betting-aktif [${live.map(p => p.code).join(', ') || '-'}]`);
  if (dead.length) console.log(`${ICON.bad} Provider TIDAK betting-aktif: [${dead.map(p => p.code).join(', ')}]`);
}

// Render provider yang sudah diperkaya jumlah event (dari /api/owner/sportsbook/health).
function renderProvidersWithEvents(providers) {
  for (const p of providers) {
    const icon = p.bettingAllowed ? ICON.ok : (p.transportHealthy ? ICON.warn : ICON.bad);
    console.log(`${icon} ${String(p.code).padEnd(16)} state=${String(p.state).padEnd(12)} events=${String(p.events).padEnd(4)} priced=${String(p.pricedMarkets).padEnd(4)} bettable=${String(p.bettableMarkets).padEnd(4)} latency=${p.latencyMs}ms`);
    if ((p.warnings || []).length) console.log(`      warnings: ${p.warnings.join(' | ')}`);
  }
  const dead = providers.filter(p => !p.bettingAllowed);
  const live = providers.filter(p => p.bettingAllowed);
  line();
  console.log(`${ICON.info} Ringkasan: ${live.length} provider betting-aktif [${live.map(p => p.code).join(', ') || '-'}]`);
  if (dead.length) console.log(`${ICON.bad} Provider TIDAK betting-aktif: [${dead.map(p => p.code).join(', ')}]`);
  const totalEvents = providers.reduce((sum, p) => sum + (Number(p.events) || 0), 0);
  console.log(`${ICON.info} Total event gabungan (pra-merge/dedup): ${totalEvents}`);
}

// --- Mode A (utama): /api/owner/sportsbook/health via gateway admin path ----
// Endpoint ini MEMANG memiliki jumlah event per provider + state lifecycle.
// Butuh sesi owner. Terkirim sebagai Bearer token (cookie a7_owner_session juga
// didukung bila Anda menjalankannya dari browser/sesi yang sudah login).
async function checkOwnerHealth() {
  line();
  console.log(`${ICON.info} DIAGNOSA PER-PROVIDER  (${BASE_URL}/api/owner/sportsbook/health)`);
  line();
  if (!OWNER_TOKEN) {
    console.log(`${ICON.warn} OWNER_TOKEN tidak diset - lewati endpoint owner.`);
    console.log(`       Cara dapat token: login ke panel admin, lalu salin cookie 'a7_owner_session'`);
    console.log(`       atau Bearer token, kemudian jalankan:`);
    console.log(`       SPORTSBOOK_BASE_URL=${BASE_URL} OWNER_TOKEN=<token> node scripts/verify-sportsbook-providers.mjs`);
    return false;
  }
  try {
    const res = await getJson('/api/owner/sportsbook/health', {
      headers: { authorization: `Bearer ${OWNER_TOKEN}` }
    });
    if (!res.ok) {
      console.log(`${ICON.bad} /api/owner/sportsbook/health -> HTTP ${res.status}. Token owner mungkin salah/kedaluwarsa.`);
      console.log(`       body: ${String(res.text).slice(0, 200)}`);
      return false;
    }
    const feed = res.json?.data?.feed || res.json?.feed || {};
    console.log(`${ICON.info} feed: fetchedAt=${feed.fetchedAt} readOnly=${feed.readOnly} snapshotFallback=${feed.snapshotFallback}`);
    console.log(`     events=${feed.events} live=${feed.liveEvents} pricedMarkets=${feed.pricedMarkets} bettableMarkets=${feed.bettableMarkets} primary=${feed.primaryPricingProvider}`);
    line();
    renderProvidersWithEvents(Array.isArray(feed.providers) ? feed.providers : []);
    return true;
  } catch (error) {
    console.log(`${ICON.bad} gagal baca /api/owner/sportsbook/health: ${error.message}`);
    return false;
  }
}

// --- Mode B: cross-check publik (tanpa secret) -----------------------------
async function checkPublicFeed() {
  line();
  console.log(`${ICON.info} CROSS-CHECK VOLUME FEED & PAGINATION  (${BASE_URL})`);
  line();
  try {
    const pub = await getJson('/api/public/markets?limit=1');
    if (pub.ok) console.log(`${ICON.info} /api/public/markets total (TOTO/lottery): ${pub.json?.meta?.total ?? 'n/a'}`);

    const member = await getJson(`/api/member/sportsbook/events?tab=all&limit=${PAGE_SIZE}&offset=0`);
    if (member.ok) {
      const d = member.json?.data || member.json || {};
      const p = d.pagination || {};
      const s = d.source || {};
      const c = d.counts || {};
      const total = Number(p.total ?? d.events?.length ?? 0);
      const v = verdict(total);
      console.log(`${ICON.info} /api/member/sportsbook/events (sesi terbaca):`);
      console.log(`     events di halaman : ${(d.events || []).length}`);
      console.log(`     pagination        : total=${p.total} offset=${p.offset} limit=${p.limit} hasMore=${p.hasMore}`);
      console.log(`     counts            : all=${c.all} live=${c.live} today=${c.today} early=${c.early}`);
      console.log(`     degraded=${d.degraded} stale=${d.stale} status=${s.status} mode=${s.mode}`);
      console.log(`     pricedMarkets=${s.pricedMarkets} bettableMarkets=${s.bettableMarkets}`);
      console.log(`     ${v.icon} VERDICT: ${v.note}`);
    } else {
      console.log(`${ICON.info} /api/member/sportsbook/events -> HTTP ${member.status} (butuh sesi member; lewati)`);
      console.log(`       Tips: untuk cek volume tanpa login, lihat angka counts pada respons member saat Anda login sebagai member.`);
    }
  } catch (error) {
    console.log(`${ICON.warn} cross-check publik gagal: ${error.message}`);
  }
}

async function main() {
  console.log(`\n${ICON.info} SPORTSBOOK PROVIDER DIAGNOSTIC - ${new Date().toISOString()}`);
  console.log(`     base=${BASE_URL} pageSize=${PAGE_SIZE}`);
  const gotOwner = await checkOwnerHealth();
  const gotInternal = gotOwner ? false : await checkInternalMonitoring();
  await checkPublicFeed();
  line();
  console.log(`${ICON.info} Cara baca hasil:`);
  console.log(`   - Volume: kalau total <= ${PAGE_SIZE} maka Load More kosong = kurangnya event, BUKAN bug pagination.`);
  console.log(`   - Per-provider: OPEN_CIRCUIT/DEGRADED/transport=FAIL menandai sumber yang mati.`);
  console.log(`   - Kalau public-market (gratis) satu-satunya betting-aktif -> provider berbayar tak menyumbang (cek API key/quota).`);
  if (!gotOwner && !gotInternal) {
    console.log(`\n${ICON.warn} Untuk pemilahaan per-provider (paling akurat), login admin lalu jalankan:`);
    console.log(`       SPORTSBOOK_BASE_URL=${BASE_URL} OWNER_TOKEN=<a7_owner_session> node scripts/verify-sportsbook-providers.mjs`);
  }
}

main().catch(error => {
  console.error(`Diagnostic gagal total: ${error?.stack || error}`);
  process.exitCode = 1;
});

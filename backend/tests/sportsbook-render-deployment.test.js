import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderBlueprint = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8');
const renderDockerfile = readFileSync(new URL('../../deploy/Dockerfile.sportsbook-render-worker', import.meta.url), 'utf8');
const railway = readFileSync(new URL('../../.railway/railway.ts', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../../deploy/member-server.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/sportsbook-render-worker.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

const INGEST_PATH = '/api/internal/sportsbook/ingest';

test('sportsbook scraper worker is deployed on Render with its dedicated Dockerfile', () => {
  assert.match(renderBlueprint, /type: worker/);
  assert.match(renderBlueprint, /dockerfilePath: \.\/deploy\/Dockerfile\.sportsbook-render-worker/);
  assert.match(renderBlueprint, /dockerContext: \./);
  assert.match(renderBlueprint, /numInstances: 1/);

  assert.match(renderDockerfile, /^FROM node:22\./m);
  assert.match(renderDockerfile, /COPY backend\/src \.\/backend\/src/);
  assert.match(renderDockerfile, /CMD \["node", "backend\/src\/sportsbook-render-worker\.js"\]/);
});

test('Render worker posts real The Odds API snapshots to the Railway ingest endpoint', () => {
  assert.match(renderBlueprint, new RegExp(`SPORTSBOOK_INGEST_URL\\n\\s+value: https?://[^\\n]+${INGEST_PATH.replace(/\//g, '\\/')}`));
  assert.match(renderBlueprint, /key: SPORTSBOOK_INGEST_HMAC_SECRET\n\s+sync: false/);
  assert.match(renderBlueprint, /key: THE_ODDS_API_ENABLED\n\s+value: "true"/);
  assert.match(renderBlueprint, /key: THE_ODDS_API_KEY\n\s+sync: false/);
  // Kuota The Odds API dijaga: market per-event dimatikan dan jeda refresh
  // lebih panjang daripada jendela freshness ingest.
  assert.match(renderBlueprint, /key: THE_ODDS_API_EVENT_MARKETS_ENABLED\n\s+value: "false"/);
  const refreshSeconds = Number(renderBlueprint.match(/key: THE_ODDS_API_REFRESH_SECONDS\n\s+value: "(\d+)"/)?.[1]);
  const ingestMaxAge = Number(renderBlueprint.match(/key: SPORTSBOOK_INGEST_MAX_AGE_SECONDS\n\s+value: "(\d+)"/)?.[1]);
  assert.ok(refreshSeconds >= 60, 'refresh odds harus dijaga minimum 60 detik');
  assert.ok(ingestMaxAge >= 30, 'jendela freshness ingest harus wajar');
  assert.match(worker, /fetchOddsApi:\s*fetchTheOddsApi/);
});

test('ingest URL is identical across Render blueprint, env example and both proxy layers', () => {
  const renderUrl = renderBlueprint.match(/key: SPORTSBOOK_INGEST_URL\n\s+value: (\S+)/)?.[1];
  const envUrl = envExample.match(/^SPORTSBOOK_INGEST_URL=(\S+)$/m)?.[1];
  assert.ok(renderUrl, 'render.yaml wajib menentukan SPORTSBOOK_INGEST_URL');
  assert.equal(renderUrl, envUrl, 'URL ingest Render harus sama dengan backend/.env.example');
  assert.ok(renderUrl.endsWith(INGEST_PATH), 'URL ingest menunjuk ke /api/internal/sportsbook/ingest');

  assert.match(proxy, /url\.pathname === '\/api\/internal\/sportsbook\/ingest'/);
  assert.match(proxy, /request\.method !== 'POST'/);
  assert.match(proxy, /x-sportsbook-timestamp/);
  assert.match(proxy, /x-sportsbook-signature/);
  assert.ok(app.includes(String.raw`\/api\/internal\/sportsbook\/ingest`), 'backend app.js wajib mendaftarkan rute ingest internal');
});

test('Railway hosts no scraper worker so its memory footprint stays flat', () => {
  assert.doesNotMatch(railway, /sportsbook-render-worker|sportsbookRenderWorker/);
  assert.match(railway, /resources: \[Postgres, web, Redis, postgresVolume, redisVolume\]/);
  // Railway tetap memvalidasi snapshot dari Render, jadi secret ingest wajib dipertahankan.
  assert.match(railway, /SPORTSBOOK_INGEST_HMAC_SECRET: preserve\(\)/);
  assert.match(railway, /SPORTSBOOK_INGEST_URL: preserve\(\)/);
});

test('Railway Redis keeps a hard memory ceiling to prevent instance OOM', () => {
  assert.match(railway, /--maxmemory 128mb/);
  assert.match(railway, /--maxmemory-policy volatile-lru/);
  assert.match(railway, /--maxmemory-samples 5/);
});

test('Render odds cadence stays inside the prematch price window and the Professional daily quota', () => {
  const refreshSeconds = Number(renderBlueprint.match(/key: THE_ODDS_API_REFRESH_SECONDS\n\s+value: "(\d+)"/)?.[1]);
  assert.ok(Number.isFinite(refreshSeconds), 'render.yaml wajib menentukan THE_ODDS_API_REFRESH_SECONDS');

  // Odds yang di-fetch lebih tua dari jendela harga prematch akan membuat
  // semua taruhan ditolak SPORTS_PRICE_STALE, jadi cadence wajib lebih cepat.
  const prematchWindow = Number(config.match(/sportsbookMaxPrematchPriceAgeSeconds: int\('SPORTSBOOK_MAX_PREMATCH_PRICE_AGE_SECONDS', (\d+)/)?.[1]);
  assert.ok(Number.isFinite(prematchWindow), 'jendela harga prematch wajib terbaca dari config');
  assert.ok(
    refreshSeconds < prematchWindow,
    `refresh ${refreshSeconds}s harus lebih cepat dari jendela prematch ${prematchWindow}s`
  );

  // Kuota The Odds API Professional = 667 kredit/hari, biaya per request =
  // markets x regions. Daftar sport harus tetap muat tanpa memicu 429 harian.
  const sportKeys = (renderBlueprint.match(/key: THE_ODDS_API_SPORT_KEYS\n\s+value: (\S+)/)?.[1] || '')
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
  const markets = (renderBlueprint.match(/key: THE_ODDS_API_MARKETS\n\s+value: (\S+)/)?.[1] || '')
    .split(',')
    .filter(Boolean);
  const regions = (renderBlueprint.match(/key: THE_ODDS_API_REGIONS\n\s+value: (\S+)/)?.[1] || '')
    .split(',')
    .filter(Boolean);
  assert.ok(sportKeys.length >= 1, 'render.yaml wajib membatasi daftar sport secara eksplisit');
  assert.ok(sportKeys.includes('soccer_epl'), 'Premier League wajib termasuk dalam cakupan scraper');

  const cyclesPerDay = Math.ceil(86400 / refreshSeconds);
  const creditsPerDay = sportKeys.length * cyclesPerDay * markets.length * regions.length;
  assert.ok(
    creditsPerDay <= 667,
    `anggaran ${creditsPerDay} kredit/hari melebihi kuota Professional 667/hari`
  );
});

test('member sportsbook endpoints stay clean and fast behind the Cloudflare frontend', () => {
  // Frontend Cloudflare memanggil /api/member/sportsbook/* — jalur ini wajib
  // diproxy utuh, tidak boleh jatuh ke aturan 405/static di bawahnya.
  assert.match(proxy, /url\.pathname\.startsWith\('\/api\/member\/'\)/);
  // Preflight CORS ditangani di edge sebelum masuk core, plus keep-alive
  // upstream 65s supaya request berikutnya tidak menunggu handshake baru.
  assert.match(proxy, /request\.method === 'OPTIONS'/);
  assert.match(proxy, /access-control-max-age/);
  assert.match(proxy, /server\.keepAliveTimeout = 65000/);
  assert.match(proxy, /server\.requestTimeout = 30000/);

  // Core menyajikan feed & detail event dari cache Redis (sportsbookSnapshot),
  // bukan fetch provider per request — latensi frontend bebas beban scrape.
  assert.ok(app.includes(String.raw`\/api\/member\/sportsbook\/events`), 'rute snapshot member wajib terdaftar');
  assert.ok(app.includes(String.raw`\/api\/member\/sportsbook\/stream`), 'rute SSE member wajib terdaftar');
  assert.ok(app.includes('ok(res,await sportsbookSnapshot('), 'feed disajikan dari cache');
  assert.ok(app.includes('ok(res,await sportsbookEventSnapshot('), 'detail event disajikan dari cache');
  // Snapshot Render masuk lewat POST internal saja; keamanannya dijamin
  // validasi HMAC + jendela timestamp + cap payload di acceptSportsbookSnapshot.
  assert.ok(app.includes(String.raw`\/api\/internal\/sportsbook\/ingest`), 'rute ingest internal wajib terdaftar');
});

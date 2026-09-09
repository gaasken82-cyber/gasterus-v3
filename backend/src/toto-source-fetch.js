import { config } from './config.js';
import { renderSportsbookPage } from './sportsbook-browser-renderer.js';

const MAX_HTML_BYTES = Math.floor(1.5 * 1024 * 1024);
const DEFAULT_CONCURRENCY = 2;
const BOARD_MARKER = /hasil\s+terakhir/i;
const BOARD_MARKER_FALLBACKS = [/hasil\s+terkini/i, /hasil\s+terbaru/i, /result/i, /live\s+result/i, /nomor\s+terakhir/i, /draw\s+result/i];
function boardMarkerTest(html) {
  if (BOARD_MARKER.test(html)) return true;
  for (const pattern of BOARD_MARKER_FALLBACKS) {
    if (pattern.test(html)) return true;
  }
  return false;
}
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const TOTO_SOURCES = Object.freeze([
  { code: 'poskopaito', name: 'PoskoPaito', url: config.totoPoskoPaitoUrl, parser: 'posko-board', family: 'poskopaito.com', requestProfile: 'browser-id', browserFallback: true },
  { code: 'datatoto', name: 'DataToto', url: config.totoDataTotoUrl, family: 'datatoto.pro' },
  { code: 'masterlive', name: 'MasterLive', url: config.totoMasterLiveUrl, family: 'masterlive.net' },
  { code: 'cindototo', name: 'CindoToto Public Result Board', url: config.totoCindoTotoUrl, urls: [config.totoCindoTotoUrl, 'https://cindototopusat.com/support'], parser: 'snapshot-board', snapshotBoard: true, globalBoard: true, family: 'cindototopusat.com', requestProfile: 'browser-id', browserFallback: true },
  { code: 'sumtoto', name: 'SumToto Public Result Board', url: config.totoSumTotoUrl, urls: [config.totoSumTotoUrl, 'https://sumtotoking.com/'], parser: 'snapshot-board', snapshotBoard: true, globalBoard: true, family: 'sumtotoking.com', requestProfile: 'browser-id', browserFallback: true },
  { code: 'miototo', name: 'MioToto Public Result Board', url: config.totoMioTotoUrl, urls: [config.totoMioTotoUrl, 'https://miototo.com/support'], parser: 'snapshot-board', snapshotBoard: true, globalBoard: true, family: 'miototo.com', requestProfile: 'browser-id', browserFallback: true },
  { code: 'ikontoto', name: 'IkonToto Public Result Board', url: config.totoIkonTotoUrl, parser: 'snapshot-board', snapshotBoard: true, globalBoard: true, family: 'ikontoto.org', requestProfile: 'browser-id', browserFallback: true },
  { code: 'kiatoto', name: 'KiaToto Public Result Board', url: config.totoKiaTotoUrl, parser: 'snapshot-board', snapshotBoard: true, globalBoard: true, family: 'kiatoto.net', requestProfile: 'browser-id', browserFallback: true },
  { code: 'kingkonginfo', name: 'KingkongToto Result & Schedule Board', url: config.totoKingkongInfoUrl, parser: 'market-card', globalBoard: true, family: 'kingkongtoto-info.com', requestProfile: 'browser-id', browserFallback: true },
  // Official lottery pools live-draw sources (public, static HTML, no anti-bot). Each family is a distinct
  // operator, so an agreement with these counts toward the two-family CONSENSUS/VERSIFIED gate.
  // Operator official draw authorities. When an official site publishes the latest draw,
  // its result overrides any differing aggregator observation for that pool (the operator
  // is the source of truth for its own draws). Distinguish from CONSENSUS_INPUT sources.
  { code: 'belizepools-mor', name: 'Belize Pools Morning', url: config.totoBelizePoolsUrl + 'live-draw-morning/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-mid', name: 'Belize Pools Midday', url: config.totoBelizePoolsUrl + 'live-draw-midday/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-eve', name: 'Belize Pools Evening', url: config.totoBelizePoolsUrl + 'live-draw-evening/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-ngt', name: 'Belize Pools Night', url: config.totoBelizePoolsUrl + 'live-draw-night/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'meridapools', name: 'Merida Pools Official', url: config.totoMeridaPoolsUrl, parser: 'pools-draw', family: 'meridapools.org', authority: true },
  // Vegasnet live-result widget: plain HTTP table (no Chromium). One lightweight
  // request per show_id; each page is a single <table> row (Pasaran/Tanggal/Hasil)
  // parsed by the generic 'vegasnet-table' table-rows parser. show_id list covers
  // the pools mapped in toto-source-map.json ("vegasnet" alias entries).
  {
    code: 'vegasnet',
    name: 'Vegasnet Live Result Widget',
    url: 'https://widgets.vegasnet.info/result.php',
    parser: 'vegasnet-table',
    family: 'vegasnet.info',
    combineAll: true,
    showIds: [
      2, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21, 30, 38, 39, 40, 42, 43, 44,
      45, 48, 49, 51, 54, 55, 57, 59, 60, 61, 63, 65, 66, 67, 70, 71, 74, 76,
      77, 84, 88, 89, 94, 98, 101, 110, 113, 114, 115, 116, 138, 139, 157, 166
    ]
  }
]);

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function privateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  if (host === '::1' || host === '::' || /^f[cd][0-9a-f:]*$/i.test(host) || /^fe[89ab][0-9a-f:]*$/i.test(host)) return true;
  return false;
}
function sameSourceHost(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  return a === b || a === `www.${b}` || `www.${a}` === b;
}
function uniqueUrls(source) {
  const values = Array.isArray(source.urls) ? source.urls : [source.url];
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function validateSourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error(`TOTO source ${url.hostname} must use HTTPS`);
  if (url.username || url.password) throw new Error('TOTO source URL credentials are not allowed');
  if (privateHost(url.hostname)) throw new Error('Private TOTO source host is not allowed');
  return url;
}

export async function fetchTotoDocument(source, fetchImpl = fetch) {
  const url = validateSourceUrl(source.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.totoSourceTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': source.requestProfile === 'browser-en' ? 'en-US,en;q=0.9' : 'id-ID,id;q=0.9,en;q=0.7',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': /^browser-/.test(String(source.requestProfile || '')) ? BROWSER_USER_AGENT : config.totoCollectorUserAgent,
        ...(source.headers && typeof source.headers === 'object' ? source.headers : {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = validateSourceUrl(response.url || url.toString());
    if (!sameSourceHost(finalUrl.hostname, url.hostname)) throw new Error('redirect host blocked');
    const length = Number(response.headers?.get?.('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_HTML_BYTES) throw new Error('response too large');
    let html;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_HTML_BYTES) {
            await reader.cancel('response too large').catch(() => {});
            throw new Error('response too large');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock?.();
      }
      html = Buffer.concat(chunks).toString('utf8');
    } else {
      html = await response.text();
    }
    const bytes = Buffer.byteLength(html);
    if (bytes > MAX_HTML_BYTES) throw new Error('response too large');
    return {
      html,
      bytes,
      status: Number(response.status || 200),
      finalUrl: finalUrl.toString(),
      contentType: clean(response.headers?.get?.('content-type') || '') || null
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTotoHtml(source, fetchImpl = fetch) {
  return (await fetchTotoDocument(source, fetchImpl)).html;
}

export async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(Number(limit) || 1, 1), items.length || 1) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function collectOneSource(source, fetchImpl) {
  const started = Date.now();
  // Vegasnet widget: fetch every show_id page (plain HTTP), merge the single-row
  // tables into one combined HTML document for the table-rows parser. Individual
  // show_id failures are tolerated as long as at least one page succeeds.
  if (source.combineAll && Array.isArray(source.showIds) && source.showIds.length) {
    const pages = await mapLimit(source.showIds, 4, async (showId) => {
      try {
        const document = await fetchTotoDocument({ ...source, url: `${source.url}?show_id=${showId}` }, fetchImpl);
        return { showId, html: document.html, status: document.status };
      } catch (error) {
        return { showId, html: '', status: null, error: clean(error.message) };
      }
    });
    const okPages = pages.filter(page => page.html);
    const html = okPages.map(page => page.html).join('\n');
    const bytes = Buffer.byteLength(html);
    const attempts = [
      ...pages.filter(page => !page.html).map(page => ({ url: `${source.url}?show_id=${page.showId}`, ok: false, status: null, finalUrl: null, bytes: 0, error: page.error || 'VEGASNET_SHOWID_FAILED' })),
      { url: `${source.url}?show_id=*(${okPages.length}/${source.showIds.length})`, ok: Boolean(html), status: html ? 200 : null, finalUrl: source.url, bytes, error: html ? null : 'VEGASNET_ALL_SHOWIDS_FAILED' }
    ];
    return {
      ...source,
      ok: Boolean(html),
      html,
      bytes,
      status: html ? 200 : null,
      finalUrl: source.url,
      contentType: html ? 'text/html; combined=vegasnet' : null,
      latencyMs: Date.now() - started,
      attempts,
      error: html ? null : 'VEGASNET_ALL_SHOWIDS_FAILED'
    };
  }
  const attempts = [];
  for (const candidate of uniqueUrls(source)) {
    try {
      const document = await fetchTotoDocument({ ...source, url: candidate }, fetchImpl);
      const boardMarker = source.snapshotBoard ? boardMarkerTest(document.html) : true;
      attempts.push({ url: candidate, ok: boardMarker, status: document.status, finalUrl: document.finalUrl, bytes: document.bytes, error: boardMarker ? null : 'TOTO_SOURCE_BOARD_MARKER_MISSING' });
      if (!boardMarker) continue;
      return {
        ...source,
        url: candidate,
        ok: true,
        html: document.html,
        bytes: document.bytes,
        status: document.status,
        finalUrl: document.finalUrl,
        contentType: document.contentType,
        latencyMs: Date.now() - started,
        attempts,
        error: null
      };
    } catch (error) {
      attempts.push({ url: candidate, ok: false, status: null, finalUrl: null, bytes: 0, error: clean(error.message) });
    }
  }
  return {
    ...source,
    ok: false,
    html: '',
    bytes: 0,
    status: null,
    finalUrl: null,
    contentType: null,
    latencyMs: Date.now() - started,
    attempts,
    error: attempts.map(item => `${item.url}:${item.error}`).join('; ') || 'TOTO_SOURCE_FETCH_FAILED'
  };
}

export async function collectTotoSources(fetchImpl = fetch) {
  return mapLimit(TOTO_SOURCES, DEFAULT_CONCURRENCY, source => collectOneSource(source, fetchImpl));
}

export async function renderTotoSource(source, renderImpl = renderSportsbookPage) {
  if (!source?.browserFallback) return source;
  const requested = validateSourceUrl(source.url);
  const started = Date.now();
  try {
    const rendered = await renderImpl(requested.toString(), {
      timeoutMs: Math.max(8000, config.totoSourceTimeoutMs),
      settleMs: config.totoBrowserFallbackSettleMs,
      cacheSeconds: Math.max(30, config.totoCollectorIntervalSeconds - 5),
      maxBytes: MAX_HTML_BYTES,
      userAgent: BROWSER_USER_AGENT
    });
    const finalUrl = validateSourceUrl(rendered.finalUrl || requested.toString());
    if (!sameSourceHost(finalUrl.hostname, requested.hostname)) throw new Error('browser redirect host blocked');
    const html = String(rendered.html || '');
    const bytes = Buffer.byteLength(html);
    if (!html || bytes > MAX_HTML_BYTES) throw new Error(!html ? 'browser rendered empty DOM' : 'browser response too large');
    return {
      ...source,
      ok: true,
      html,
      bytes,
      status: source.status || 200,
      finalUrl: finalUrl.toString(),
      contentType: 'text/html; rendered=chromium',
      latencyMs: Number(source.latencyMs || 0) + (Date.now() - started),
      renderer: rendered.renderer || 'CHROMIUM_CDP',
      renderAttempted: true,
      renderMs: Number(rendered.renderMs || (Date.now() - started)),
      renderError: null,
      error: null
    };
  } catch (error) {
    return {
      ...source,
      renderAttempted: true,
      renderMs: Date.now() - started,
      renderError: clean(error.message),
      error: source.error || clean(error.message)
    };
  }
}

export const __totoSourceFetch = Object.freeze({ MAX_HTML_BYTES, DEFAULT_CONCURRENCY, BOARD_MARKER, BROWSER_USER_AGENT, privateHost, sameSourceHost, uniqueUrls, mapLimit, collectOneSource });

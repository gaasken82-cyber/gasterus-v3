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
  // === INSTRUCTION (QC): FOCUS ON VEGASNET =================================
  // `vegasnet` is the PRIMARY & sole most-reliable source. Plain HTTP widget,
  // no Chromium. One lightweight request per show_id; each page is a single
  // <table> row parsed by the 'vegasnet-table' parser. show_id list covers the
  // pools mapped in toto-source-map.json ("vegasnet" alias entries).
  //
  // Cleanup (Instruction #1): removed dead/unreliable scrapers from this array:
  // poskopaito, datatoto (down), masterlive, cindototo, sumtoto, miototo,
  // ikontoto, kiatoto. Only sources proven alive remain (liveness-verified).
  {
    code: 'vegasnet',
    name: 'Vegasnet Live Result Widget',
    url: config.totoVegasnetUrl,
    parser: 'vegasnet-table',
    family: 'vegasnet.info',
    combineAll: true,
    batchSize: 30,
    showIds: [
      2, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21, 30, 38, 39, 40, 42, 43, 44,
      45, 48, 49, 51, 54, 55, 57, 59, 60, 61, 63, 65, 66, 67, 70, 71, 74, 76,
      77, 84, 88, 89, 94, 98, 101, 110, 113, 114, 115, 116, 138, 139, 157, 166,
      // Additional Sydney Pool show_ids (VegasNet uses multiple IDs for Sydney)
      3, 4, 5, 6, 7, 8, 14, 20, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33,
      34, 35, 36, 37, 41, 46, 47, 50, 52, 53, 56, 58, 62, 64, 68, 69, 72, 73,
      75, 78, 79, 80, 81, 82, 83, 85, 86, 87, 90, 91, 92, 93, 95, 96, 97, 99, 100
    ]
  },
  // Backup board (proven live, browser-rendered): aggregates ALL pools incl.
  // schedule (Tutup Pasaran / Result Pasaran WIB).
  { code: 'kingkonginfo', name: 'KingkongToto Result & Schedule Board', url: config.totoKingkongInfoUrl, parser: 'market-card', globalBoard: true, family: 'kingkongtoto-info.com', requestProfile: 'browser-id', browserFallback: true },
  // Official operator live-draw authorities (proven live, static HTML, no anti-bot).
  // Each family is a distinct operator, so agreement counts toward the two-family
  // CONSENSUS/VERIFIED gate; official site overrides any differing aggregator obs.
  { code: 'belizepools-mor', name: 'Belize Pools Morning', url: config.totoBelizePoolsUrl + 'live-draw-morning/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-mid', name: 'Belize Pools Midday', url: config.totoBelizePoolsUrl + 'live-draw-midday/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-eve', name: 'Belize Pools Evening', url: config.totoBelizePoolsUrl + 'live-draw-evening/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'belizepools-ngt', name: 'Belize Pools Night', url: config.totoBelizePoolsUrl + 'live-draw-night/', parser: 'pools-draw', family: 'belizepools.org', authority: true },
  { code: 'meridapools', name: 'Merida Pools Official', url: config.totoMeridaPoolsUrl, parser: 'pools-draw', family: 'meridapools.org', authority: true }
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
  // Vegasnet widget (lean transport): group all show_ids into a single request per
  // batch (`?show_id=a,b,c`) — plain HTTP, no Chromium. The widget returns one row
  // per pool, so the merged HTML is parsed by the same table-rows parser as before
  // (one request per show_id). Empty/failed batches are tolerated as long as at
  // least one batch succeeds. This reduces N=56 HTTP calls down to a few batches.
  if (source.combineAll && Array.isArray(source.showIds) && source.showIds.length) {
    const batchSize = Math.max(1, Number(source.batchSize) || 30);
    const groups = [];
    for (let i = 0; i < source.showIds.length; i += batchSize) groups.push(source.showIds.slice(i, i + batchSize));
    const pages = await mapLimit(groups, 2, async (group) => {
      const url = `${source.url}?show_id=${group.join(',')}`;
      try {
        const document = await fetchTotoDocument({ ...source, url }, fetchImpl);
        // Log HTML for Sydney Pool (show_id 98) for debugging
        if (group.includes(98)) {
          console.log(`[VEGASNET DEBUG] Sydney Pool (show_id 98) HTML response (${document.html.length} chars):`);
          console.log(document.html.substring(0, 2000));
          console.log('---END VEGASNET DEBUG---');
        }
        return { url, html: document.html, status: document.status };
      } catch (error) {
        return { url, html: '', status: null, error: clean(error.message) };
      }
    });
    const okPages = pages.filter(page => page.html);
    const html = okPages.map(page => page.html).join('\n');
    const bytes = Buffer.byteLength(html);
    const attempts = [
      ...pages.filter(page => !page.html).map(page => ({ url: page.url, ok: false, status: null, finalUrl: null, bytes: 0, error: page.error || 'VEGASNET_SHOWID_FAILED' })),
      { url: `${source.url}?show_id=*(successful ${okPages.length}/${groups.length} batches)`, ok: Boolean(html), status: html ? 200 : null, finalUrl: source.url, bytes, error: html ? null : 'VEGASNET_ALL_SHOWIDS_FAILED' }
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

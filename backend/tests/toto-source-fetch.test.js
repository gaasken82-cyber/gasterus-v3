import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@example.com/db',
  REDIS_URL: 'redis://example.com:6379',
  MEMBER_PROXY_SECRET: 'm'.repeat(48),
  ADMIN_PROXY_SECRET: 'a'.repeat(48),
  OPS_INTERNAL_SECRET: 'o'.repeat(48),
  SESSION_HMAC_KEY: 's'.repeat(48),
  API_KEY_PEPPER: 'p'.repeat(48),
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
});

const { TOTO_SOURCES, collectTotoSources, fetchTotoHtml, validateSourceUrl, renderTotoSource, __totoSourceFetch } = await import('../src/toto-source-fetch.js');


function snapshotHtml(label = 'WELLINGTON', result = '4969') {
  return `<html><h4>Hasil Terakhir</h4><div>19 Agustus 2026</div><div>${label}</div>${String(result).split('').map(d => `<span>${d}</span>`).join('')}</html>`;
}
function htmlFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (['cindototopusat.com', 'sumtotoking.com', 'miototo.com', 'ikontoto.org', 'kiatoto.net'].includes(host)) return snapshotHtml();
  if (host === 'kingkongtoto-info.com') return `<html><h3>Wellington</h3><strong>4969</strong><div>Result: Rabu, 19-08-2026</div></html>`;
  return `<html>${host}</html>`;
}

function response(url, html, { status = 200, contentLength = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get(name) { return name.toLowerCase() === 'content-length' && contentLength !== null ? String(contentLength) : null; } },
    async text() { return html; }
  };
}

test('TOTO source set is lean & vegasnet-primary (proven-alive sources only)', async () => {
  assert.deepEqual(TOTO_SOURCES.map(item => item.code), ['vegasnet', 'kingkonginfo', 'belizepools-mor', 'belizepools-mid', 'belizepools-eve', 'belizepools-ngt', 'meridapools']);
  assert.deepEqual(TOTO_SOURCES.map(item => item.url), [
    'https://widgets.vegasnet.info/result.php',
    'https://kingkongtoto-info.com/',
    'https://belizepools.org/live-draw-morning/',
    'https://belizepools.org/live-draw-midday/',
    'https://belizepools.org/live-draw-evening/',
    'https://belizepools.org/live-draw-night/',
    'https://meridapools.org/'
  ]);
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return response(String(url), htmlFor(url));
  };
  const results = await collectTotoSources(fakeFetch);
  const vegasnet = results.find(item => item.code === 'vegasnet');
  assert.equal(results.length, 7);
  assert.equal(vegasnet.ok, true);
  assert.match(vegasnet.contentType, /combined=vegasnet/);
  assert.equal(results.every(item => item.ok && item.bytes > 0), true);
  assert.equal(calls.length, 6 + vegasnet.showIds.length); // 6 non-combine sources + 1 per show_id
  assert.equal(calls.every(call => call.options.redirect === 'follow'), true);
  const byHost = new Map(calls.map(call => [new URL(call.url).hostname.replace(/^www\./, ''), call.options.headers]));
  assert.match(byHost.get('kingkongtoto-info.com')['user-agent'], /Mozilla\/5\.0/);
  assert.match(byHost.get('kingkongtoto-info.com')['accept-language'], /id-ID/);
  assert.match(byHost.get('widgets.vegasnet.info')['user-agent'], /ASEAN777-Result-Collector\/6\.8\.14/);
});

test('TOTO network adapter keeps healthy sources when one source fails', async () => {
  const fakeFetch = async url => {
    if (new URL(url).hostname === 'meridapools.org') return response(String(url), '', { status: 503 });
    return response(String(url), htmlFor(url));
  };
  const results = await collectTotoSources(fakeFetch);
  assert.equal(results.filter(item => item.ok).length, 6);
  assert.match(results.find(item => item.code === 'meridapools').error, /HTTP 503/);
});

test('TOTO source fetch blocks unsafe URLs and cross-host redirects', async () => {
  assert.throws(() => validateSourceUrl('http://poskopaito.com/'), /HTTPS/);
  assert.throws(() => validateSourceUrl('https://127.0.0.1/feed'), /Private/);
  assert.throws(() => validateSourceUrl('https://user:pass@poskopaito.com/'), /credentials/);
  await assert.rejects(
    fetchTotoHtml({ code: 'x', name: 'x', url: 'https://poskopaito.com/' }, async () => response('https://evil.example/feed', '<html>bad</html>')),
    /redirect host blocked/
  );
});


test('vegasnet combineAll tolerates individual show_id failures and merges HTML', async () => {
  const source = TOTO_SOURCES.find(item => item.code === 'vegasnet');
  const calls = [];
  const result = await __totoSourceFetch.collectOneSource(source, async url => {
    calls.push(String(url));
    const showId = new URL(url).searchParams.get('show_id');
    if (showId === '2') return response(String(url), '<table><tr><td>Ohio Midday</td><td>12-09-2026</td><td>6364</td></tr></table>');
    if (showId === '9') return response(String(url), '<table><tr><td>Hkg Lotto</td><td>12-09-2026</td><td>3007</td></tr></table>');
    return response(String(url), ''); // empty page → tolerated as VEGASNET_SHOWID_FAILED
  });
  assert.equal(result.ok, true);
  assert.match(result.contentType, /combined=vegasnet/);
  assert.match(result.html, /Ohio Midday/);
  assert.match(result.html, /3007/);
  assert.equal(calls.length, source.showIds.length);
  assert.match(result.attempts.find(a => a.error).error, /VEGASNET_SHOWID_FAILED/);
});

test('browser fallback preserves HTTPS/same-host policy and returns rendered DOM', async () => {
  const source = TOTO_SOURCES.find(item => item.code === 'kingkonginfo');
  const rendered = await renderTotoSource({ ...source, ok: true, html: '<html>landing</html>' }, async url => ({
    html: snapshotHtml('WELLINGTON', '4969'), finalUrl: url, renderer: 'CHROMIUM_CDP', renderMs: 12
  }));
  assert.equal(rendered.ok, true);
  assert.equal(rendered.renderer, 'CHROMIUM_CDP');
  assert.match(rendered.html, /WELLINGTON/);
  await assert.doesNotReject(async () => validateSourceUrl(rendered.finalUrl));
  const blocked = await renderTotoSource(source, async () => ({ html: snapshotHtml(), finalUrl: 'https://evil.example/' }));
  assert.equal(blocked.renderAttempted, true);
  assert.match(blocked.renderError, /browser redirect host blocked/);
});

test('mapLimit bounds concurrent TOTO transport work', async () => {
  let active = 0;
  let peak = 0;
  await __totoSourceFetch.mapLimit([1,2,3,4,5,6], 2, async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return value;
  });
  assert.equal(peak, 2);
});

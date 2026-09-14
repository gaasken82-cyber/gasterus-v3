// Cloudflare Pages Advanced Mode (_worker.js) — reverse proxy API dan Admin ke backend Railway.
// Semua request non-proxy dilayani dari static assets frontend (env.ASSETS).
const BACKEND = 'https://web-production-e8e55.up.railway.app';

const HOP_BY_HOP = new Set([
  'host', 'cf-ray', 'cf-visitor', 'cdn-loop',
  'cf-worker', 'x-forwarded-proto', 'x-forwarded-host',
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
]);

function shouldProxyToBackend(pathname, env) {
  if (pathname.startsWith('/api/')) return true;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname === '/admin-api' || pathname.startsWith('/admin-api/')) return true;
  if (pathname.startsWith('/cc-')) return true;
  const customPrefix = env?.ADMIN_PATH_PREFIX;
  if (customPrefix && (pathname === customPrefix || pathname.startsWith(customPrefix + '/'))) return true;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!shouldProxyToBackend(url.pathname, env)) {
      return env.ASSETS.fetch(request);
    }

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for');
    const headers = new Headers(request.headers);
    for (const h of HOP_BY_HOP) headers.delete(h);
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', url.hostname);
    if (clientIp) {
      headers.set('cf-connecting-ip', clientIp);
      headers.set('x-forwarded-for', clientIp);
    }

    const upstream = await fetch(BACKEND + url.pathname + url.search, {
      method: request.method,
      headers,
      body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
      redirect: 'manual',
    });

    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    out.delete('transfer-encoding');

    const loc = out.get('location');
    if (loc && loc.includes('web-production-e8e55.up.railway.app')) {
      out.set('location', loc.replace('https://web-production-e8e55.up.railway.app', ''));
    }

    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

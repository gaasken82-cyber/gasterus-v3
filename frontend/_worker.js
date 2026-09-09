// Cloudflare Pages Advanced Mode (_worker.js) — reverse proxy /api/* ke backend Railway.
// Semua request non-/api dilayani dari static assets (env.ASSETS).
const BACKEND = 'https://web-production-e8e55.up.railway.app';

const HOP_BY_HOP = new Set([
  'host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cdn-loop',
  'cf-ipcountry', 'cf-worker', 'x-forwarded-proto', 'x-forwarded-host',
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const headers = new Headers(request.headers);
    for (const h of HOP_BY_HOP) headers.delete(h);
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', url.hostname);

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
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

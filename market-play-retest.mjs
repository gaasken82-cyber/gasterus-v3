// Focused re-test: MARKET_PLAY with a real market code (previous token was logged out)
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const BASE = process.env.E2E_BASE || 'http://localhost:8082';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USERNAME = String(process.env.E2E_USERNAME || '');
const PASSWORD = String(process.env.E2E_PASSWORD || '');
if (!USERNAME || !PASSWORD) {
  console.error('Env wajib: E2E_USERNAME dan E2E_PASSWORD (opsional E2E_BASE).');
  process.exit(1);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) };
  const res = await fetch(BASE + path, { ...options, headers });
  let body = {};
  try { body = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, body };
}

// login fresh
const login = await api('/api/member/login', {
  method: 'POST',
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
const token = login.body?.data?.token;
const auth = { Authorization: `Bearer ${token}` };
console.log('LOGIN:', login.status, token ? 'ok' : 'FAIL');

// get first OPEN market code from public markets
const mk = await api('/api/public/markets?limit=20');
const open = (mk.body?.data || []).find(m => m.bettingStatus === 'OPEN');
const code = open?.code || (mk.body?.data || [])[0]?.code;
console.log('USING MARKET CODE:', code, '|', open?.name || '');

// MARKET_PLAY: betting config for the real market (NO real bet placed)
const bm = await api(`/api/member/betting-markets/${encodeURIComponent(code)}`, { headers: auth });
console.log(`MARKET_PLAY | HTTP ${bm.status} | ${bm.body?.error?.code || 'config loaded'}`);
if (bm.ok) {
  const d = bm.body?.data || bm.body;
  console.log('  config keys:', Object.keys(d || {}).slice(0, 8).join(', '));
  console.log('  market:', d?.market?.name || d?.name || '(n/a)');
}

// also verify market-play frontend endpoint shape used by market-play.js
const betList = await api('/api/member/bets?limit=5', { headers: auth });
console.log(`BETS LIST | HTTP ${betList.status} | items=${Array.isArray(betList.body?.data) ? betList.body.data.length : '?'}`);

// logout again to leave clean state
const csrf = login.body?.data?.csrfToken;
if (csrf) {
  const out = await api('/api/member/logout', { method: 'POST', headers: { ...auth, 'x-csrf-token': csrf } });
  console.log('LOGOUT:', out.status);
}
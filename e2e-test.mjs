// ============================================================
//  GASTERUS V3 — END-TO-END API VERIFICATION (READ/TEST ONLY)
//  - 1 development test account (clearly identified)
//  - No real bets, no fake endpoints, no source changes
// ============================================================
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const BASE = process.env.E2E_BASE || 'http://localhost:8082';   // member-server (proxies to core with internal secret)
const REDIS_CLI = process.env.REDIS_CLI || 'redis-cli';
const SESSION_HMAC_KEY = String(process.env.SESSION_HMAC_KEY || '');
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RESULTS = [];

// Kredensial akun uji dev HARUS dari environment — jangan pernah hardcode di repo.
const USERNAME = String(process.env.E2E_USERNAME || '');
const EMAIL = String(process.env.E2E_EMAIL || '');
const PASSWORD = String(process.env.E2E_PASSWORD || '');
if (!SESSION_HMAC_KEY || !USERNAME || !PASSWORD) {
  console.error('Env wajib: SESSION_HMAC_KEY, E2E_USERNAME, E2E_PASSWORD (dan opsional E2E_EMAIL, E2E_BASE, REDIS_CLI).');
  process.exit(1);
}

function report(name, pass, status, extra = '') {
  RESULTS.push({ name, pass, status });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | HTTP ${status}${extra ? ' | ' + extra : ''}`);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) };
  const res = await fetch(BASE + path, { ...options, headers });
  let body = {};
  try { body = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, body };
}

// ---- Step 0: health/ready (gateway 8080) ----
{
  const r = await fetch('http://localhost:8080/health');
  const b = await r.json().catch(() => ({}));
  report('HEALTH', r.status === 200 && b.status === 'ok', r.status);
}
{
  const r = await fetch('http://localhost:8080/ready');
  const b = await r.json().catch(() => ({}));
  report('READY', r.status === 200 && b.status === 'ready', r.status);
}

// ---- Step 1: captcha + HMAC brute-force (33.5M combos, ~30s) ----
const cap = await api('/api/member/register/captcha');
const challengeId = cap.body?.data?.challengeId;
report('CAPTCHA_ISSUED', cap.ok && Boolean(challengeId), cap.status, challengeId ? challengeId.slice(0, 8) + '…' : 'no id');

let captchaAnswer = null;
if (challengeId) {
  const raw = execFileSync(REDIS_CLI, ['GET', `registration:captcha:${challengeId}`], { encoding: 'utf8' }).trim();
  let answerHash = null;
  try { answerHash = JSON.parse(raw).answerHash; } catch {}
  if (answerHash) {
    const t0 = Date.now();
    outer:
    for (const a of CHARSET) {
      for (const b of CHARSET) {
        for (const c of CHARSET) {
          for (const d of CHARSET) {
            for (const e of CHARSET) {
              const cand = a + b + c + d + e;
              if (createHmac('sha256', SESSION_HMAC_KEY).update(cand).digest('hex') === answerHash) {
                captchaAnswer = cand; break outer;
              }
            }
          }
        }
      }
    }
    console.log(`      captcha solved in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${captchaAnswer ? 'FOUND' : 'NOT FOUND'}`);
  }
}

// ---- Step 2: REGISTER ----
let reg = { status: 0, body: {} };
if (captchaAnswer) {
  reg = await api('/api/member/register', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, email: EMAIL, password: PASSWORD, phone: '', captchaId: challengeId, captchaAnswer }),
  });
  const okReg = reg.status === 201 || reg.status === 409; // 409 = already exists from prior run
  report('REGISTER', okReg, reg.status, reg.body?.error?.code || (reg.status === 201 ? 'created' : ''));
} else {
  report('REGISTER', false, 0, 'captcha unsolved');
}

// ---- Step 3: LOGIN (fresh session) ----
const login = await api('/api/member/login', {
  method: 'POST',
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
const token = login.body?.data?.token || login.body?.token;
const csrf = login.body?.data?.csrfToken || login.body?.csrfToken;
report('LOGIN', login.status === 200 && Boolean(token), login.status, login.body?.error?.code || (token ? 'token issued' : ''));

const auth = { Authorization: `Bearer ${token}` };

// ---- Step 4: SESSION persistence ----
if (token) {
  const me1 = await api('/api/member/me', { headers: auth });
  const me2 = await api('/api/member/me', { headers: auth });
  const bad = await api('/api/member/me', { headers: { Authorization: 'Bearer invalid-token-xyz' } });
  report('SESSION', me1.status === 200 && me2.status === 200 && bad.status === 401, me2.status,
    `valid=${me1.status},${me2.status} invalid=${bad.status}`);
}

// ---- Step 5: PROFILE ----
if (token) {
  const me = await api('/api/member/me', { headers: auth });
  const u = me.body?.data?.user;
  report('PROFILE', me.status === 200 && u?.username === USERNAME, me.status,
    u ? `user=${u.username} status=${u.status}` : me.body?.error?.code || '');
}

// ---- Step 6: WALLET (balance from /me + ledger) ----
if (token) {
  const me = await api('/api/member/me', { headers: auth });
  const bal = me.body?.data?.user?.balance;
  const ledger = await api('/api/member/wallet-ledger?limit=5', { headers: auth });
  report('WALLET', me.status === 200 && typeof bal === 'number' && ledger.status === 200, ledger.status,
    `balance=${bal} ledgerItems=${Array.isArray(ledger.body?.data) ? ledger.body.data.length : '?'}`);
}

// ---- Step 7: MARKETS (public) ----
{
  const m = await api('/api/public/markets?limit=5');
  const n = Array.isArray(m.body?.data) ? m.body.data.length : 0;
  report('MARKETS', m.status === 200 && n > 0, m.status, `items=${n}`);
}

// ---- Step 8: MARKET PLAY (betting config; NO real bet placed) ----
if (token) {
  const bm = await api('/api/member/betting-markets/SGP', { headers: auth });
  report('MARKET_PLAY', bm.status === 200, bm.status, bm.body?.error?.code || 'config loaded');
}

// ---- Step 9: TRANSACTION HISTORY (bets list; none placed -> empty list ok) ----
if (token) {
  const bets = await api('/api/member/bets?limit=5', { headers: auth });
  const n = Array.isArray(bets.body?.data) ? bets.body.data.length : 0;
  report('TRANSACTION_HISTORY', bets.status === 200, bets.status, `items=${n}`);
}

// ---- Step 10: RESULT / NUMBER HISTORY ----
if (token) {
  const mkts = await api('/api/member/number-history/markets', { headers: auth });
  const list = Array.isArray(mkts.body?.data) ? mkts.body.data : [];
  const first = list[0];
  const detail = first
    ? await api(`/api/member/number-history/${encodeURIComponent(first.code || first.slug)}`, { headers: auth })
    : { status: 0 };
  report('RESULT_HISTORY', mkts.status === 200 && detail.status === 200, detail.status || mkts.status,
    `markets=${list.length} detail=${detail.status}`);
}

// ---- Step 11: LOGOUT (requires CSRF) + session destroyed ----
if (token && csrf) {
  const out = await api('/api/member/logout', { method: 'POST', headers: { ...auth, 'x-csrf-token': csrf } });
  const after = await api('/api/member/me', { headers: auth });
  report('LOGOUT', out.status === 200 && after.status === 401, out.status, `after-logout-me=${after.status}`);
} else {
  report('LOGOUT', false, 0, 'no token/csrf');
}

// ---- Summary ----
const passed = RESULTS.filter(r => r.pass).length;
console.log(`\n===== SUMMARY: ${passed}/${RESULTS.length} PASS =====`);
for (const r of RESULTS) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
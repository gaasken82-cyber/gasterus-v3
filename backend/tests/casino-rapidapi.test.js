import test from 'node:test';
import assert from 'node:assert/strict';
const env = { DATABASE_URL: 'postgresql://user:pass@localhost/db', REDIS_URL: 'redis://localhost:6379', MEMBER_PROXY_SECRET: 'm'.repeat(48), ADMIN_PROXY_SECRET: 'a'.repeat(48), OPS_INTERNAL_SECRET: 'o'.repeat(48), SESSION_HMAC_KEY: 'y'.repeat(48), API_KEY_PEPPER: 'z'.repeat(48), MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64') };
Object.assign(process.env, env);
const casino = await import('../src/casino-rapidapi.js');
test('normalizeProviders maps games array to coded categories', () => {
  const out = casino.normalizeProviders({ success: true, games: ['PGSOFT', 'EVOLUTIONLIVE', 'CMDSPORTS', 'AVIATOR', 'pgsoft', '  '] });
  assert.deepEqual(out.map((p) => p.code), ['AVIATOR', 'CMDSPORTS', 'EVOLUTIONLIVE', 'PGSOFT']);
  assert.equal(out.find((p) => p.code === 'PGSOFT').category, 'SLOTS');
  assert.equal(out.find((p) => p.code === 'EVOLUTIONLIVE').category, 'LIVE_CASINO');
  assert.equal(out.find((p) => p.code === 'CMDSPORTS').category, 'SPORTSBOOK');
  assert.equal(out.find((p) => p.code === 'AVIATOR').category, 'CRASH_ARCADE');
});
test('casinoRapidApiStatus never leaks key', () => {
  const status = casino.casinoRapidApiStatus();
  assert.equal('key' in status, false);
  assert.equal('rapidApiKey' in status, false);
  assert.equal(JSON.stringify(status).toLowerCase().includes('rapidapi-key'), false);
});

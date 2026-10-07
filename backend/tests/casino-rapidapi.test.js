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
test('normalizeGames maps SPRIBE-style and PG-style game payloads', () => {
  const spribe = casino.normalizeGames({
    success: true, provider: 'SPRIBE', totalGames: 2,
    games: [
      { name: 'Aviator', id: 'a04d', img: 'https://cdn.example/spribe/0.png', type: 'crash', provider: 'SPRIBE' },
      { name: 'Dice', id: '8a87', img: 'https://cdn.example/spribe/1.png', type: 'crash', provider: 'SPRIBE' },
    ],
  }, 'SPRIBE');
  assert.equal(spribe.length, 2);
  assert.deepEqual(spribe[0], { name: 'Aviator', id: 'a04d', img: 'https://cdn.example/spribe/0.png', type: 'crash', provider: 'SPRIBE' });
  const pg = casino.normalizeGames({
    success: true,
    data: [{ game_uid: '1189', game_name: 'Mahjong Ways', game_type: 'Slot', status: 1 }],
  }, 'PG');
  assert.equal(pg.length, 1);
  assert.equal(pg[0].id, '1189');
  assert.equal(pg[0].name, 'Mahjong Ways');
  assert.equal(pg[0].type, 'Slot');
  assert.equal(pg[0].provider, 'PG');
  assert.deepEqual(casino.normalizeGames({}), []);
});
test('diagnoseCasinoUpstream is exported and probes without leaking key', async () => {
  assert.equal(typeof casino.diagnoseCasinoUpstream, 'function');
});

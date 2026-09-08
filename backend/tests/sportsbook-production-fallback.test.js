import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const configUrl = pathToFileURL(resolve(import.meta.dirname, '../src/config.js')).href;

function loadProductionConfig(extra = {}) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@example.com/db',
    REDIS_URL: 'redis://example.com:6379',
    MEMBER_PROXY_SECRET: 'm'.repeat(48),
    ADMIN_PROXY_SECRET: 'a'.repeat(48),
    OPS_INTERNAL_SECRET: 'o'.repeat(48),
    SESSION_HMAC_KEY: 's'.repeat(48),
    API_KEY_PEPPER: 'p'.repeat(48),
    MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
    ...extra
  };
  for (const key of ['API_SPORTS_ENABLED', 'THE_ODDS_API_ENABLED', 'THESPORTSDB_ENABLED']) {
    if (extra[key] === undefined) delete env[key];
  }
  const script = `import(${JSON.stringify(configUrl)}).then(({config})=>console.log(JSON.stringify({apiSportsEnabled:config.apiSportsEnabled,theOddsApiEnabled:config.theOddsApiEnabled,edgeRedirect:config.sportsSourceAllowPublicEdgeRedirect,trustedRedirectDomains:config.sportsSourceTrustedRedirectDomains,baseUrl:config.sportsSourceBaseUrl,allowedDomain:config.sportsSourceAllowedDomain,candidateUrls:config.sportsSourceCandidateUrls,mainPath:config.sportsSourceMainPath,livePath:config.sportsSourceLivePath,panelPath:config.sportsSourcePanelPath})))`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim());
}

test('production auto-enables authorized priced providers when API keys exist', () => {
  const config = loadProductionConfig({
    API_SPORTS_KEY: 'A'.repeat(40),
    THE_ODDS_API_KEY: 'B'.repeat(40)
  });
  assert.equal(config.apiSportsEnabled, true);
  assert.equal(config.theOddsApiEnabled, true);
  assert.equal(config.edgeRedirect, true);
  assert.equal(config.trustedRedirectDomains, 'hiduprukunsejahtera.com,terushebatunggul.com,pastimenangpasti.com');
  assert.equal(config.baseUrl, 'https://www.kerjahebatberhasil.com/');
  assert.equal(config.allowedDomain, 'kerjahebatberhasil.com');
  assert.match(config.candidateUrls, /https:\/\/www\.kerjahebatberhasil\.com\/id-ID\/sports/);
  assert.match(config.candidateUrls, /https:\/\/www\.hiduprukunsejahtera\.com\/id-ID\/sports/);
  assert.equal(config.mainPath, 'id-ID/sports');
  assert.equal(config.livePath, '');
  assert.equal(config.panelPath, '');
});

test('production operator can explicitly disable an authorized fallback provider', () => {
  const config = loadProductionConfig({
    API_SPORTS_KEY: 'A'.repeat(40),
    API_SPORTS_ENABLED: 'false',
    THE_ODDS_API_KEY: 'B'.repeat(40),
    THE_ODDS_API_ENABLED: 'false'
  });
  assert.equal(config.apiSportsEnabled, false);
  assert.equal(config.theOddsApiEnabled, false);
});

test('production direct source can traverse an approved public IP edge redirect without forwarding sensitive headers', () => {
  const sourceUrl = pathToFileURL(resolve(import.meta.dirname, '../src/sportsbook-source.js')).href;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@example.com/db',
    REDIS_URL: 'redis://example.com:6379',
    MEMBER_PROXY_SECRET: 'm'.repeat(48),
    ADMIN_PROXY_SECRET: 'a'.repeat(48),
    OPS_INTERNAL_SECRET: 'o'.repeat(48),
    SESSION_HMAC_KEY: 's'.repeat(48),
    API_KEY_PEPPER: 'p'.repeat(48),
    MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
  };
  delete env.SPORTS_SOURCE_COOKIE;
  delete env.SPORTS_SOURCE_AUTHORIZATION;
  delete env.SPORTS_SOURCE_ALLOW_PUBLIC_EDGE_REDIRECT;
  const script = `import(${JSON.stringify(sourceUrl)}).then(({__sportsbookSourcePolicy:p})=>{const first=p.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'),new URL('https://54.65.5.61/'),true);const second=p.redirectTargetAllowed(new URL('https://54.65.5.61/'),new URL('http://54.65.5.62/'),false);console.log(JSON.stringify({first,second,current:p.publicEdgeHopAllowed(new URL('https://54.65.5.61/'),false)}))})`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim());
  assert.deepEqual(result.first, { allowed: true, includeSensitive: false });
  assert.deepEqual(result.second, { allowed: true, includeSensitive: false });
  assert.equal(result.current, true);
});


test('production direct source accepts only observed trusted domain migration and strips sensitive context', () => {
  const sourceUrl = pathToFileURL(resolve(import.meta.dirname, '../src/sportsbook-source.js')).href;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@example.com/db', REDIS_URL: 'redis://example.com:6379',
    MEMBER_PROXY_SECRET: 'm'.repeat(48), ADMIN_PROXY_SECRET: 'a'.repeat(48), OPS_INTERNAL_SECRET: 'o'.repeat(48),
    SESSION_HMAC_KEY: 's'.repeat(48), API_KEY_PEPPER: 'p'.repeat(48), MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64')
  };
  delete env.SPORTS_SOURCE_COOKIE; delete env.SPORTS_SOURCE_AUTHORIZATION;
  const script = `import(${JSON.stringify(sourceUrl)}).then(({__sportsbookSourcePolicy:p})=>{const migration=p.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'),new URL('https://www.hiduprukunsejahtera.com/'),true);const foreign=p.redirectTargetAllowed(new URL('https://www.kerjahebatberhasil.com/id-ID/sports'),new URL('https://example.org/'),true);console.log(JSON.stringify({migration,foreign,alias:p.trustedRedirectHost('www.hiduprukunsejahtera.com'),legacy:p.trustedRedirectHost('www.terushebatunggul.com')}))})`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim());
  assert.equal(result.alias, true);
  assert.equal(result.legacy, true);
  assert.equal(result.migration.allowed, true);
  assert.equal(result.migration.includeSensitive, false);
  assert.equal(result.migration.preserveSportsbookPath, '/id-ID/sports');
  assert.equal(result.foreign.allowed, false);
});

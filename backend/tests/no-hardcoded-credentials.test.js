import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor']);
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.sh', '.env', '.sql', '.md', '.ts']);

// Pola kredensial yang pernah bocor ke dalam repo. String koneksi database di
// dalam skrip berarti siapa pun yang punya repo bisa membaca/menulis data
// produksi(member, saldo, hasil), jadi harus Ambient dari environment.
//
// Host placeholder (localhost, example.com, .test, .invalid) boleh muncul di
// fixture test: kredensialnya palsu dan tidak menunjuk ke sistem mana pun. Yang
// dilarang adalah host sungguhan, karena di situ kredensialnya bisa dipakai.
const PLACEHOLDER_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|example\.(com|org|net)|[^/]*\.(test|invalid|localhost))$/i;
const SECRET_PATTERNS = [
  { label: 'URL database dengan password', pattern: /postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@([^\s'"`/]+)/gi },
  { label: 'kredensial Railway/Nhost tersemat', pattern: /(?:railway\.net|rdb\.railway\.net|nhost\.com)/gi }
];

function connectionHost(uri) {
  try { return new URL(uri.replace(/^postgres(?:ql)?:\/\//, 'https://')).hostname; } catch { return ''; }
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.git')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SCAN_EXT.has(extname(full)) || entry.startsWith('.env')) files.push(full);
  }
  return files;
}

test('tidak ada kredensial produksi yang tertanam di file repo', () => {
  const leaks = [];
  for (const file of walk(repoRoot)) {
    const content = readFileSync(file, 'utf8');
    for (const { label, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        const line = content.slice(0, match.index).split('\n').length;
        if (label === 'kredensial Railway/Nhost tersemat' && !/postgres/.test(match[0])) continue;
        // Fixture test dengan host placeholder diizinkan.
        const host = match[1] ? connectionHost(match[0]) : match[0];
        if (PLACEHOLDER_HOST.test(host)) continue;
        leaks.push(`${relative(repoRoot, file)}:${line} ${label} -> ${match[0].slice(0, 60)}...`);
      }
    }
  }
  assert.deepEqual(leaks, [], `Kredensial tidak boleh ada di repo:\n${leaks.join('\n')}`);
});

test('skrip yang menyentuh DB produksi menolak jalan tanpa environment variable', () => {
  for (const script of ['scripts/reset-admin-password.mjs', 'backend/scripts/open-all-markets.mjs']) {
    const content = readFileSync(join(repoRoot, script), 'utf8');
    // Yang dilarang adalah string koneksi berisi kredensial, bukan penyebutan
    // skema di komentar dokumentasi.
    assert.doesNotMatch(content, /postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@[^\s'"`]+/, `${script} tidak boleh memuat string koneksi berkredensial`);
    assert.match(content, /process\.exit\(1\)/, `${script} harus berhenti jelas bila env DB kosong`);
    assert.match(content, /process\.env\.(DATABASE_URL_OVERRIDE|DATABASE_PROD_URL|DATABASE_URL)/, `${script} harus membaca kredensial dari environment`);
  }
});

test('reset admin password tidak menyematkan kredensial default', () => {
  const content = readFileSync(join(repoRoot, 'scripts/reset-admin-password.mjs'), 'utf8');
  assert.match(content, /NEW_PASSWORD/, 'password baru tetap bisa diatur lewat environment');
  assert.doesNotMatch(content, /proxy\.rlwy\.net|railway\.net/, 'host produksi tidak boleh tertulis di skrip');
});

test('repo tetap bisa disalin utuh tanpa kredensial (git archive bersih)', () => {
  // Guard terakhir: file yang terlacak di git tidak boleh memuat pola kredensial.
  const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => SCAN_EXT.has(extname(f)) || f.startsWith('.env'));
  const leaks = [];
  for (const file of tracked) {
    let content;
    try { content = readFileSync(join(repoRoot, file), 'utf8'); } catch { continue; }
    for (const match of content.matchAll(/postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@([^\s'"`/]+)/g)) {
      if (PLACEHOLDER_HOST.test(connectionHost(match[0]))) continue;
      leaks.push(file);
    }
  }
  assert.deepEqual(leaks, [], `File terlacak git memuat kredensial: ${leaks.join(', ')}`);
});
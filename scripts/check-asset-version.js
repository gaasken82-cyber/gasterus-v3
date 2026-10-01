#!/usr/bin/env node
/**
 * check-asset-version.js — gagal kalau ada <script>/<link> ke /js/*.js tanpa
 * query versi (?v=...), atau kalau file JS diubah tanpa menaikkan ?v=.
 *
 * Kenapa perlu: Cloudflare Pages mengirim `cache-control: public, max-age=14400`
 * untuk /js/*, jadi file JS baru di server TIDAK langsung dipakai browser selama
 * query versinya sama. Gejalanya: "live sudah di-deploy tapi tidak ada perubahan".
 * Release ini sudah pernah mengalaminya (market-play.js v=20260919-mp2 tetap
 * dipakai browser selama 4 jam setelah file di server diganti).
 *
 * Naiknya ?v= selama ini manual dan beberapa kali lupa. Bagian kedua di bawah
 * membandingkan ?v= sebelum vs sesudah commit yang mengubah file JS, jadi
 * kelalaian itu ketahuan otomatis oleh `npm run check` dan `npm test`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'frontend');
const pages = readdirSync(frontend).filter(name => name.endsWith('.html'));
const problems = [];
let checked = 0;

// Script ini tidak boleh mati hanya karena git tidak tersedia (container build
// sering menyalin sources tanpa .git). Tanpa git kita hanya bisa memeriksa
// keberadaan ?v=, bukan apakah versinya sudah dinaikkan.
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

for (const page of pages) {
  const html = readFileSync(resolve(frontend, page), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/js\/[A-Za-z0-9._-]+\.js)(\?v=[^"]*)?"/g)) {
    checked += 1;
    const [, file, version] = match;
    const relative = file.replace(/^\//, '');

    if (!version) {
      problems.push(`${page}: ${file} tanpa ?v= (browser akan memakai salinan lama sampai 4 jam)`);
      continue;
    }
    if (!existsSync(resolve(frontend, relative))) {
      problems.push(`${page}: ${file} tidak ada di frontend/`);
      continue;
    }

    // Commit yang mengubah file JS juga harus menaikkan ?v= di halaman yang
    // tidak pernah sampai ke browser. Masalah historis yang sudah lalu
    // ?v= dinaikkan lagi tidak dilaporkan lagi.
    const lastJsCommit = git('log', '-1', '--format=%H', '--', `frontend/${relative}`);
    if (!lastJsCommit) continue;
    const versionAt = commit => {
      const snapshot = git('show', `${commit}:frontend/${page}`);
      if (snapshot === null) return undefined;
      const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return snapshot.match(new RegExp(`${escaped}\\?v=([^"]*)`))?.[1];
    };
    const before = versionAt(`${lastJsCommit}~1`);
    const after = versionAt(lastJsCommit);
    const current = version.replace(/^\?v=/, '');
    if (before !== undefined && after !== undefined && before === after && current === after) {
      problems.push(`${page}: ${file} diubah pada ${lastJsCommit.slice(0, 7)} tanpa menaikkan ?v= (sampai sekarang masih ?v=${after}) — naikkan versinya`);
    }
  }
}

if (problems.length) {
  console.error('❌ Cache-busting asset bermasalah:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log(`✅ Cache-busting OK (${checked} referensi /js/*.js, semua punya ?v= dan naik saat file berubah)`);

#!/usr/bin/env node
/**
 * check-asset-version.js — gagal kalau ada <script>/<link> ke /js/*.js tanpa
 * query versi (?v=...).
 *
 * Kenapa perlu: Cloudflare Pages mengirim `cache-control: public, max-age=14400`
 * untuk /js/*, jadi file JS baru di server TIDAK langsung dipakai browser selama
 * query versinya sama. Gejalanya: "live sudah di-deploy tapi tidak ada perubahan".
 * Release ini sudah pernah mengalaminya (market-play.js v=20260919-mp2 tetap
 * dipakai browser selama 4 jam setelah file di server diganti).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'frontend');
const pages = readdirSync(frontend).filter(name => name.endsWith('.html'));
const problems = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(resolve(frontend, page), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/js\/[A-Za-z0-9._-]+\.js)([^"]*)"/g)) {
    checked += 1;
    const [, file, rest] = match;
    if (!/[?&]v=/.test(rest)) problems.push(`${page}: ${file} tanpa ?v= (browser akan memakai salinan lama sampai 4 jam)`);
    if (!existsSync(resolve(frontend, file.replace(/^\//, '')))) problems.push(`${page}: ${file} tidak ada di frontend/`);
  }
}

if (problems.length) {
  console.error('❌ Cache-busting asset bermasalah:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log(`✅ Cache-busting OK (${checked} referensi /js/*.js, semua punya ?v=)`);

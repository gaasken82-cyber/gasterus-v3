#!/usr/bin/env node
/**
 * check-asset-version.js — gagal kalau ada referensi aset JS/CSS lokal tanpa
 * query versi (?v=...) atau menunjuk file yang tidak ada.
 *
 * Query versi membuat perubahan aset mendapatkan URL baru, sedangkan pemeriksaan
 * ini memastikan semua referensi lokal punya versi dan menunjuk file yang ada.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'frontend');
const admin = resolve(root, 'admin/public');
const pages = [
  ...readdirSync(frontend).filter(name => name.endsWith('.html')).map(name => resolve(frontend, name)),
  ...readdirSync(admin).filter(name => name.endsWith('.html')).map(name => resolve(admin, name))
];
const problems = [];
let checkedJs = 0;
let checkedCss = 0;

for (const pagePath of pages) {
  const html = readFileSync(pagePath, 'utf8');
  const page = pagePath.startsWith(`${frontend}/`) ? 'frontend' : 'admin/public';
  for (const match of html.matchAll(/(?:src|href)="(\/js\/[A-Za-z0-9._-]+\.js)([^"]*)"/g)) {
    checkedJs += 1;
    const [, file, rest] = match;
    if (!/[?&]v=/.test(rest)) problems.push(`${page}/${pagePath.split('/').at(-1)}: ${file} tanpa ?v=`);
    if (!existsSync(resolve(frontend, file.replace(/^\//, '')))) problems.push(`${page}/${pagePath.split('/').at(-1)}: ${file} tidak ada`);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/i)?.[1];
    if (!href || /^(?:https?:)?\/\//i.test(href) || /^(?:data:|blob:)/i.test(href)) continue;

    checkedCss += 1;
    const [pathname, ...queryParts] = href.split('?');
    const query = queryParts.length ? `?${queryParts.join('?')}` : '';
    if (!/[?&]v=/.test(query)) problems.push(`${page}/${pagePath.split('/').at(-1)}: ${href} tanpa ?v=`);
    const base = pagePath.startsWith(`${frontend}/`) ? frontend : admin;
    const assetPath = resolve(base, pathname.replace(/^\//, ''));
    if (!existsSync(assetPath)) problems.push(`${page}/${pagePath.split('/').at(-1)}: ${href} tidak ada`);
  }
}

if (problems.length) {
  console.error('❌ Cache-busting asset bermasalah:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log(`✅ Cache-busting OK (${checkedJs} referensi JS, ${checkedCss} stylesheet lokal; semua punya ?v= dan file tersedia)`);

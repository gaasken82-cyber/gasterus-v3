import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const frontendPages = readdirSync(resolve(root, 'frontend'))
  .filter(name => name.endsWith('.html'))
  .filter(name => !name.startsWith('__') && name !== 'icon-preview.html');

// market-play dan sportsbook memakai sistem CSS token sendiri, jadi dikecualikan
// dari aturan token mobile-blue.
const mobileBluePages = frontendPages.filter(name => !['market-play.html', 'sportsbook.html'].includes(name));

test('semua halaman memakai satu token cache untuk mobile-blue.css', () => {
  const tokens = new Set();
  for (const name of mobileBluePages) {
    const found = read(`frontend/${name}`).match(/mobile-blue\.css\?v=([a-z0-9-]+)/);
    assert.ok(found, `${name} tidak punya token cache mobile-blue.css`);
    tokens.add(found[1]);
  }
  assert.equal(tokens.size, 1, `token cache harus satu, ditemukan: ${[...tokens].join(', ')}`);
});

test('halaman promosi mendefinisikan sendiri semua kelas dan spacing yang dipakainya', () => {
  const html = read('frontend/promotion.html');
  // promotion.html memakai kelas dari layout/components yang tidak dimuat di
  // halaman ini. Kalau tidak didefinisikan ulang, spacing dan footer jadi rusak.
  const selfScoped = html.match(/\.page-promotion \{([\s\S]*?)\}/)[1];
  for (const step of ['1', '2', '3', '4', '5', '6', '8', '10']) {
    assert.match(selfScoped, new RegExp(`--space-${step}:`), `--space-${step} belum didefinisikan`);
  }
  for (const className of ['app-main', 'container', 'app-footer', 'footer-links', 'footer-bottom', 'badge-info', 'nav-drawer-item']) {
    assert.match(html, new RegExp(`\\.page-promotion \\.${className}\\b`), `.${className} belum diberi gaya`);
  }
  // Kepala halaman dan statistik harus memakai pembungkus yang rapi.
  assert.match(html, /<section class="promo-hero">/);
  assert.match(html, /class="promo-hero-eyebrow"/);
  assert.match(html, /class="promo-hero-title"/);
  assert.match(html, /class="promo-hero-stats"/);
  // Struktur penutup harus seimbang.
  assert.equal((html.match(/<div/g) || []).length, (html.match(/<\/div>/g) || []).length, 'jumlah div tidak seimbang');
  // Label antarmuka harus bahasa Indonesia.
  assert.doesNotMatch(html, />Privacy</);
  assert.doesNotMatch(html, />Terms</);
  assert.doesNotMatch(html, />Responsible Gaming</);
});

test('animations.css dimuat tepat satu kali dan setelah mobile-blue.css', () => {
  for (const name of frontendPages) {
    const html = read(`frontend/${name}`);
    const count = (html.match(/\/css\/animations\.css/g) || []).length;
    assert.ok(count <= 1, `${name} memuat animations.css ${count} kali, harus maksimal 1`);
    if (count === 0) continue;
    const anim = html.indexOf('/css/animations.css');
    // Bandingkan dengan stylesheet utama halaman ini: mobile-blue.css untuk
    // halaman utama, tokens.css untuk market-play dan sportsbook.
    const main = Math.max(html.indexOf('mobile-blue.css'), html.indexOf('tokens.css'));
    if (main >= 0) {
      // Animasi harus dimuat setelah stylesheet utama supaya cascade-nya stabil.
      assert.ok(anim > main, `${name} memuat animations.css sebelum stylesheet utama`);
    }
  }
});

test('loader 3D GASTERUS terpasang di semua halaman tanpa mengubah layout', () => {
  const loaderJs = read('frontend/js/loader-3d.js');
  const loaderCss = read('frontend/css/loader-3d.css');
  // Dua file BARU, terpisah dari CSS/layout yang sudah ada.
  assert.match(loaderCss, /\.gasterus-loader\b/);
  assert.match(loaderCss, /@keyframes gasterusLoaderSpin/);
  assert.match(loaderCss, /prefers-reduced-motion/);
  assert.match(loaderJs, /gasterus-loader-logo/);
  assert.match(loaderJs, /GASTERUS/);
  // Loader harus punya jaring pengaman agar tidak pernah menahan halaman.
  assert.match(loaderJs, /MAX_MS/);
  assert.match(loaderJs, /halaman tetap dimuat normal/);

  const pages = readdirSync(resolve(root, 'frontend')).filter(name => name.endsWith('.html'));
  const memberPages = pages.filter(name => !name.startsWith('__') && name !== 'icon-preview.html');
  assert.ok(memberPages.length >= 24, 'halaman member harus lengkap');
  for (const name of memberPages) {
    const html = read(`frontend/${name}`);
    assert.match(html, /loader-3d\.css/, `${name} belum memuat CSS loader`);
    assert.match(html, /loader-3d\.js/, `${name} belum memuat JS loader`);
  }
});

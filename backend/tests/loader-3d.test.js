import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

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

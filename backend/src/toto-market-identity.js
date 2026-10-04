// Identitas pasar TOTO: satu kosakata slug untuk seluruh sistem.
//
// Collector SELALU menulis hasil memakai slug kanonik dari source map. Maka pasar
// yang slug-nya di luar daftar itu tidak akan pernah disentuh lagi, dan angka
// di dalamnya membeku tanpa terdeteksi: kasus newjerseymid-pool,
// tennesse-mid-pool, washingtonmd-pool, washingtonev-pool, dan tennesse-eve-pool
// yang membeku selama puluhan jam.
//
// Modul ini murni (tanpa database, tanpa Redis) supaya aturan ini bisa diuji dan
// dipakai bersama oleh health check maupun lapisan lain.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBER_HIDDEN_TOTO_MARKETS } from './toto-member-catalog.js';

const SOURCE_MAP_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../data/toto-source-map.json');

export const CANONICAL_SLUGS = Object.freeze(new Set(
  JSON.parse(readFileSync(SOURCE_MAP_FILE, 'utf8').replace(/^\uFEFF/, '')).map(item => item.slug)
));

export function isCanonicalMarketSlug(slug) {
  return CANONICAL_SLUGS.has(String(slug || '').trim());
}

// Pasar orphan = slug di luar source map sehingga collector tidak pernah
// menyentuhnya. Pool yang memang disembunyikan operator sengaja tidak
// dikumpulkan, jadi slug non-kanonik pada pool itu bukan bug.
export function isOrphanMarketSlug(slug) {
  const key = String(slug || '').trim();
  if (!key) return false;
  if (MEMBER_HIDDEN_TOTO_MARKETS.has(key)) return false;
  return !CANONICAL_SLUGS.has(key);
}
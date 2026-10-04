import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateMemoryGuard,
  registerChild,
  unregisterChild,
  registeredChildCount,
  treeMemory,
  startMemoryGuard
} from '../src/memory-guard.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const readSrc = name => readFileSync(resolve(SRC, name), 'utf8');

test('recycle terjadi saat heap melewati batas (perilaku lama dipertahankan)', () => {
  const result = evaluateMemoryGuard({
    heapUsed: 200 * 1024 * 1024,
    rssBytes: 100 * 1024 * 1024,
    highWater: 180 * 1024 * 1024,
    rssHighWater: 900 * 1024 * 1024
  });
  assert.equal(result.heapHigh, true);
  assert.equal(result.rssHigh, false);
  assert.equal(result.breach, true);
});

test('recycle juga terjadi saat tree RSS lewat batas walau heap masih aman', () => {
  const result = evaluateMemoryGuard({
    heapUsed: 10 * 1024 * 1024,
    rssBytes: 950 * 1024 * 1024,
    highWater: 180 * 1024 * 1024,
    rssHighWater: 900 * 1024 * 1024
  });
  assert.equal(result.heapHigh, false);
  assert.equal(result.rssHigh, true);
  assert.equal(result.breach, true);
});

test('tidak ada breach saat heap dan tree RSS sama-sama di bawah batas', () => {
  const result = evaluateMemoryGuard({
    heapUsed: 10 * 1024 * 1024,
    rssBytes: 100 * 1024 * 1024,
    highWater: 180 * 1024 * 1024,
    rssHighWater: 900 * 1024 * 1024
  });
  assert.equal(result.breach, false);
});

test('registry anak memengaruhi perhitungan tree RSS dan bisa dilepas', () => {
  const before = treeMemory();
  const beforeCount = registeredChildCount();
  assert.ok(before.ownRssBytes > 0, 'RSS proses sendiri harus terbaca');

  assert.equal(registerChild(process.pid, 'selftest'), true);
  const withChild = treeMemory();
  assert.equal(withChild.childCount, beforeCount + 1);
  // PID self terdaftar sebagai "anak" supaya penjumlahan benar-benar teruji.
  assert.ok(withChild.childRssBytes > 0, 'RSS anak harus terbaca dari /proc');
  assert.equal(withChild.rssBytes, withChild.ownRssBytes + withChild.childRssBytes);

  assert.equal(unregisterChild(process.pid), true);
  const after = treeMemory();
  assert.equal(after.childCount, beforeCount);
  assert.equal(after.childRssBytes, 0);
});

test('registerChild menolak PID tidak valid', () => {
  assert.equal(registerChild(0), false);
  assert.equal(registerChild(-1), false);
  assert.equal(registerChild('abc'), false);
  assert.equal(registerChild(1.5), false);
});

test('startMemoryGuard mengembalikan batas heap dan batas tree RSS', () => {
  const guard = startMemoryGuard({ label: 'test-guard', intervalMs: 600000, rssLimitMb: 512 });
  try {
    assert.ok(guard.heapMB > 0);
    assert.ok(guard.highWater > 0);
    assert.equal(guard.rssLimitMB, 512);
    assert.equal(guard.rssHighWater, 512 * 1024 * 1024);
  } finally {
    guard.stop();
  }
});

test('renderer mendaftarkan anak dan membersihkan lewat process group', () => {
  const src = readSrc('sportsbook-browser-renderer.js');
  // Spawn harus detached agar kill(-pid) menyapu seluruh sub-proses Chromium.
  assert.match(src, /spawn\(executable, args, \{[^}]*detached: IS_POSIX/s);
  // Anak didaftarkan ke memory-guard supaya RSS-nya ikut dipantau.
  assert.match(src, /registerChild\(child\.pid, 'chromium'\)/);
  assert.match(src, /unregisterChild\(pid\)/);
  // Pembersihan memakai process group di POSIX.
  assert.match(src, /process\.kill\(-pid, signal\)/);
  // Hook 'exit' menutup celah orphan saat process.exit(0) dari memory-guard.
  assert.match(src, /process\.once\('exit', killOrphanedChildren\)/);
});
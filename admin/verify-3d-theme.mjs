#!/usr/bin/env node
/**
 * SBOTOTO R7.0.0 — Verify Enterprise 3D Glass Theme across all admin HTML pages.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('admin/public');
const CSS_LINK = 'enterprise-3d-r7000.css';
const JS_LINK = 'enterprise-3d-r7000.js';
const BODY_CLASS = 'enterprise-3d-r7000';

let pass = 0, fail = 0;
const failures = [];

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.html')) continue;
  const path = join(DIR, file);
  const html = readFileSync(path, 'utf8');
  const checks = {
    'CSS link': html.includes(CSS_LINK),
    'JS link': html.includes(JS_LINK),
    'Body class': html.includes(BODY_CLASS)
  };
  const ok = Object.values(checks).every(Boolean);
  if (ok) { pass++; }
  else {
    fail++;
    failures.push({ file, ...checks });
  }
}

console.log(`\n=== Enterprise 3D Theme Verification ===`);
console.log(`Pass: ${pass}  |  Fail: ${fail}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.file} — ${Object.entries(f).filter(([k,v])=>k!=='file'&&!v).map(([k])=>k).join(', ') || 'unknown'}`);
  }
} else {
  console.log('\n✓ Semua admin pages sudah terintegrasi dengan Enterprise 3D Glass theme.');
}
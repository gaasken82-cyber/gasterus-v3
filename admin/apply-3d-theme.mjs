#!/usr/bin/env node
/**
 * SBOTOTO R7.0.0 — Apply Enterprise 3D Glass Theme to all admin HTML pages.
 * Adds:
 *  1. <link href="enterprise-3d-r7000.css?v=7000-3d-glass" rel="stylesheet"/>
 *  2. body class "enterprise-3d-r7000"
 *  3. <script src="enterprise-3d-r7000.js?v=7000-3d-glass"></script> before </body>
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('admin/public');
const CSS_TAG = '<link href="enterprise-3d-r7000.css?v=7000-3d-glass" rel="stylesheet"/>';
const JS_TAG = '<script src="enterprise-3d-r7000.js?v=7000-3d-glass"></script>';
const BODY_CLASS = 'enterprise-3d-r7000';

let updated = 0, skipped = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.html')) continue;
  const path = join(DIR, file);
  let html = readFileSync(path, 'utf8');

  const has3d = html.includes('enterprise-3d-r7000');
  if (has3d) { skipped++; continue; }

  // 1. Add CSS link after the last enterprise css link
  if (!html.includes(BODY_CLASS + '.css')) {
    const cssMatch = html.match(/<link[^>]*enterprise[^>]*\.css[^>]*>/gi);
    if (cssMatch?.length) {
      const lastCss = cssMatch[cssMatch.length - 1];
      html = html.replace(lastCss, lastCss + '\n' + CSS_TAG);
    } else {
      html = html.replace('</head>', CSS_TAG + '\n</head>');
    }
  }

  // 2. Add body class
  html = html.replace(/<body\s+class="([^"]*)"/, (match, cls) => {
    const classes = new Set(cls.split(/\s+/).filter(Boolean));
    classes.add(BODY_CLASS);
    return `<body class="${[...classes].join(' ')}"`;
  });

  // 3. Add JS before </body>
  if (!html.includes(BODY_CLASS + '.js')) {
    html = html.replace('</body>', JS_TAG + '\n</body>');
  }

  writeFileSync(path, html, 'utf8');
  updated++;
  console.log(`✓ ${file}`);
}

console.log(`\nDone: ${updated} updated, ${skipped} already had 3D theme.`);
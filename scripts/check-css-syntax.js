import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const directories = ['frontend/css', 'admin/public'];
const files = [];

function collectCss(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) collectCss(fullPath);
    else if (entry.endsWith('.css')) files.push(fullPath);
  }
}

for (const directory of directories) collectCss(directory);

let hasErrors = false;
for (const file of files) {
  try {
    postcss.parse(readFileSync(file, 'utf8'), { from: file });
  } catch (error) {
    console.error(`❌ CSS syntax error in ${file}:${error.line}:${error.column}: ${error.reason}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`\nCSS syntax check failed (${files.length} files checked).`);
  process.exit(1);
}

console.log(`✅ CSS syntax check passed for all ${files.length} files.`);

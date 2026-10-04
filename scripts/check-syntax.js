import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directories = ['backend/src', 'deploy'];
let hasErrors = false;
let count = 0;

function checkDir(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      checkDir(fullPath);
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      try {
        execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
        count++;
      } catch (err) {
        console.error(`❌ Syntax error in ${fullPath}:`, err.message);
        hasErrors = true;
      }
    }
  }
}

for (const d of directories) {
  checkDir(d);
}

// Files that live outside the scanned directories but ship to a runtime and must
// never carry a syntax error (e.g. the Cloudflare Pages Function edge proxy).
for (const file of ['frontend/_worker.js']) {
  if (!existsSync(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    count++;
  } catch (err) {
    console.error(`❌ Syntax error in ${file}:`, err.message);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`\nCheck failed with errors.`);
  process.exit(1);
} else {
  console.log(`✅ Syntax check passed for all ${count} files.`);
}

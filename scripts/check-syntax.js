import { readdirSync, statSync } from 'node:fs';
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

if (hasErrors) {
  console.error(`\nCheck failed with errors.`);
  process.exit(1);
} else {
  console.log(`✅ Syntax check passed for all ${count} files.`);
}

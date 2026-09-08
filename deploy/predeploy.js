import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const coreDir = resolve(ROOT, 'services/core');
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

function run(label, script, attempts = 1, delayMs = 3000) {
  return (async () => {
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await new Promise((resolvePromise, reject) => {
          const child = spawn(process.execPath, [script], { cwd: coreDir, env: process.env, stdio: 'inherit' });
          child.once('error', reject);
          child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${label} exited with ${code}`)));
        });
        return;
      } catch (error) {
        last = error;
        console.error(`[predeploy] ${label} attempt ${attempt}/${attempts} failed: ${error.message}`);
        if (attempt < attempts) await sleep(delayMs);
      }
    }
    throw last;
  })();
}

console.log(JSON.stringify({ service:'asean777-predeploy', version:'6.9.0', phase:'start' }));
await run('dependency readiness', 'scripts/wait-dependencies.js', 60, 3000);
await run('database migration', 'scripts/migrate.js', 3, 3000);
await run('database seed', 'scripts/seed.js', 3, 3000);
await run('ensure initial owner', 'scripts/ensure-owner.js', 2, 2000);
await run('schema readiness', 'scripts/schema-ready.js', 5, 2000);
console.log(JSON.stringify({ service:'asean777-predeploy', version:'6.9.0', status:'ok' }));

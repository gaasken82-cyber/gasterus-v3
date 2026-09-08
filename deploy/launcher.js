import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const children = new Map();
let stopping = false;
let fatalReason = null;

function bool(name,fallback=false){const v=String(process.env[name] ?? fallback).toLowerCase();return !['0','false','no','off','disabled'].includes(v);}
function validPort(value,name){const n=Number(value);if(!Number.isInteger(n)||n<1||n>65535)throw new Error(`${name} must be a valid TCP port`);return n;}
function heapMB(name,fallback){const n=Number(process.env[name]);return Number.isInteger(n)&&n>0?n:fallback;}
// Heap ceiling per child process (MB). Without an explicit cap V8 lets the heap
// grow way past the container cgroup quota, so the OS OOM-killer tears down
// ALL services at once. Capping per-child keeps each service inside a budget and
// makes the launcher recover() restart just that crashed subprocess.
const HEAP_MB={
  gateway:heapMB('GATEWAY_HEAP_MB',48),
  core:heapMB('CORE_HEAP_MB',256),
  worker:heapMB('WORKER_HEAP_MB',192),
  member:heapMB('MEMBER_HEAP_MB',128),
  admin:heapMB('ADMIN_HEAP_MB',64),
  'health-monitor':heapMB('HEALTH_MONITOR_HEAP_MB',32),
  'backup-scheduler':heapMB('BACKUP_HEAP_MB',32),
  default:heapMB('SCRIPT_HEAP_MB',128),
};
function childEnv(label='default',overrides={}) {
  const cap=HEAP_MB[label]||HEAP_MB.default;
  const base=String(process.env.NODE_OPTIONS||'').split(/\s+/).filter(Boolean).filter(o=>!o.startsWith('--max-old-space-size='));
  base.push(`--max-old-space-size=${cap}`);
  return {...process.env,NODE_OPTIONS:base.join(' '),NODE_ENV:process.env.NODE_ENV||'production',...overrides};
}
function sleep(ms){return new Promise(resolvePromise=>setTimeout(resolvePromise,ms));}

const PUBLIC_PORT = validPort(process.env.PORT || 8080,'PORT');
const CORE_INTERNAL_PORT = validPort(process.env.CORE_INTERNAL_PORT || 8083,'CORE_INTERNAL_PORT');
const MEMBER_INTERNAL_PORT = validPort(process.env.MEMBER_INTERNAL_PORT || 8082,'MEMBER_INTERNAL_PORT');
const ADMIN_INTERNAL_PORT = validPort(process.env.ADMIN_INTERNAL_PORT || 8081,'ADMIN_INTERNAL_PORT');
if(new Set([PUBLIC_PORT,CORE_INTERNAL_PORT,MEMBER_INTERNAL_PORT,ADMIN_INTERNAL_PORT]).size !== 4) throw new Error('PORT, CORE_INTERNAL_PORT, MEMBER_INTERNAL_PORT, and ADMIN_INTERNAL_PORT must all be different');

function runOnce(label,cwd,args,env={}) {return new Promise((resolvePromise,reject)=>{const child=spawn(process.execPath,args,{cwd,env:childEnv(label,env),stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolvePromise():reject(new Error(`${label} exited with ${code}`)));});}
async function runWithRetry(label,cwd,args,env={},attempts=20,delayMs=3000){let lastError;for(let attempt=1;attempt<=attempts;attempt++){try{return await runOnce(label,cwd,args,env);}catch(error){lastError=error;console.error(`[startup] ${label} attempt ${attempt}/${attempts} failed: ${error.message}`);if(attempt<attempts)await sleep(delayMs);}}throw lastError;}
// Restart budget must survive start()/exit cycles. start() used to reset the
// counter to 0 on every spawn, so recover() never exhausted and a crashing
// worker/core could flap forever every 3 seconds without ever failing loudly.
const restartCounts = new Map();
const RESTART_HEALTHY_UPTIME_MS = 300000;
// Services we can quietly recycle via heap-cap watchdog + graceful exit without
// taking the whole container down. Core and gateway are cluster-critical.
const isRecoverable = label => ['core', 'worker', 'member', 'admin'].includes(label);
function start(label,cwd,args,env={},critical=true){const startedAt=Date.now();const child=spawn(process.execPath,args,{cwd,env:childEnv(label,env),stdio:'inherit'});children.set(label,{child,critical,restarts:restartCounts.get(label)||0,args,cwd,env,startedAt});child.on('error',error=>{console.error(`[${label}] spawn failed`,error?.stack || error);if(isRecoverable(label)){recover(label,children.get(label));}else if(critical){fatal(label);}});child.on('exit',(code,signal)=>{const state=children.get(label);children.delete(label);if(stopping)return;console.error(`[${label}] exited unexpectedly`,{code,signal});if(state && Date.now()-state.startedAt>=RESTART_HEALTHY_UPTIME_MS)restartCounts.delete(label);if(isRecoverable(label)){recover(label,state);return;}if(critical)fatal(label);});return child;}
function recover(label,state){const current=state || {};const max=3;const nextRestarts=(restartCounts.get(label)||0)+1;restartCounts.set(label,nextRestarts);if(nextRestarts<=max){console.error(`[${label}] recovery restart ${nextRestarts}/${max}`);setTimeout(()=>start(label,current.cwd,current.args,current.env,current.critical),3000).unref();return;}console.error(`[${label}] recovery exhausted`);if(label==='core')fatal(label);}
function fatal(label){if(stopping)return;stopping=true;fatalReason=label;console.error(`Critical process failed: ${label}. Stopping consolidated service.`);for(const {child} of children.values())child.kill('SIGTERM');setTimeout(()=>process.exit(1),8000).unref();}
function fatalSignal(type,error){
  console.error(JSON.stringify({service:'asean777-launcher',event:type,message:error?.message || String(error),stack:error?.stack || null}));
  fatal(type);
}
process.on('uncaughtException', error => fatalSignal('uncaughtException', error));
process.on('unhandledRejection', reason => fatalSignal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))));
async function waitReady(url,timeoutMs=120000){const until=Date.now()+timeoutMs;while(Date.now()<until){try{const r=await fetch(url,{signal:AbortSignal.timeout(2500)});if(r.ok)return;}catch{}await sleep(1000);}throw new Error(`Timed out waiting for ${url}`);}

const coreDir=resolve(ROOT,'services/core'),memberDir=resolve(ROOT,'services/member'),adminDir=resolve(ROOT,'services/admin'),opsDir=resolve(ROOT,'services/ops'),appDir=resolve(ROOT,'services/app');
const coreUrl=`http://127.0.0.1:${CORE_INTERNAL_PORT}`;
const internalCommon={HOST:'127.0.0.1',CORE_HOST:'127.0.0.1',CORE_PORT:String(CORE_INTERNAL_PORT),PUBLIC_PROTO:process.env.PUBLIC_PROTO || (process.env.NODE_ENV==='production'?'https':'http')};
const onRailway=Boolean(process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_ENVIRONMENT_ID);
const runStartupMigrations=bool('RUN_STARTUP_MIGRATIONS', !onRailway);

console.log(JSON.stringify({service:'asean777-launcher',version:'6.9.0.5',phase:'startup',publicPort:PUBLIC_PORT,corePort:CORE_INTERNAL_PORT,memberPort:MEMBER_INTERNAL_PORT,adminPort:ADMIN_INTERNAL_PORT,onRailway,runStartupMigrations}));
// Bind Railway's public PORT immediately. /healthz remains 503 until Core/Member/Admin are ready,
// preventing edge-level 502 during cold start while preserving the readiness gate.
start('gateway',appDir,['gateway.js'],{CORE_INTERNAL_PORT:String(CORE_INTERNAL_PORT),MEMBER_INTERNAL_PORT:String(MEMBER_INTERNAL_PORT),ADMIN_INTERNAL_PORT:String(ADMIN_INTERNAL_PORT)},true);
console.log(JSON.stringify({service:'asean777-launcher',version:'6.9.0.5',phase:'public-port-bound',host:process.env.HOST||'0.0.0.0',port:PUBLIC_PORT}));
await runWithRetry('dependency readiness',coreDir,['scripts/wait-dependencies.js'],{},20,3000);
if(runStartupMigrations){
  await runWithRetry('database migration',coreDir,['scripts/migrate.js'],{},3,3000);
  await runWithRetry('database seed',coreDir,['scripts/seed.js'],{},3,3000);
}
await runWithRetry('schema readiness',coreDir,['scripts/schema-ready.js'],{},5,2000);
start('core',coreDir,['src/server.js'],{HOST:'127.0.0.1',PORT:String(CORE_INTERNAL_PORT)});
await waitReady(`${coreUrl}/ready`);
if(bool('WORKER_ENABLED',true))start('worker',coreDir,['src/worker.js'],{HOST:'127.0.0.1',PORT:String(CORE_INTERNAL_PORT)});else console.log(JSON.stringify({service:'asean777-launcher',version:'6.9.0.5',phase:'worker-skipped',workerEnabled:false}));
start('member',memberDir,['server.js'],{...internalCommon,PORT:String(MEMBER_INTERNAL_PORT)});
start('admin',adminDir,['server.js'],{...internalCommon,PORT:String(ADMIN_INTERNAL_PORT)});
await Promise.all([waitReady(`http://127.0.0.1:${MEMBER_INTERNAL_PORT}/ready`),waitReady(`http://127.0.0.1:${ADMIN_INTERNAL_PORT}/ready`)]);
// Health monitor disabled on free tier
if(bool('HEALTH_MONITOR_ENABLED',false))start('health-monitor',opsDir,['scripts/health-loop.js'],{CORE_INTERNAL_URL:coreUrl},false);
// Backup scheduler disabled on free tier (already false by default)
if(bool('BACKUP_ENABLED',false))start('backup-scheduler',opsDir,['scripts/backup-loop.js'],{},false);
function shutdown(signal){if(stopping)return;stopping=true;console.log(`Consolidated shutdown requested: ${signal}`);for(const {child} of children.values())child.kill('SIGTERM');setTimeout(()=>process.exit(0),9000).unref();}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));

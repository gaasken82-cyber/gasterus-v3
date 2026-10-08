// CDP debug: buka halaman live, kumpulkan console errors + isi DOM + screenshot
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/usr/bin/google-chrome';
const URL_ = process.argv[2] || 'https://gasterus.fun/casino.html';
const SHOT = process.argv[3] || '';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9344', '--user-data-dir=/tmp/cdp-casino-' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });
chrome.on('error', (e) => console.error('chrome spawn error:', e.message));

try {
  let targets;
  let lastErr;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9344/json/list');
      targets = await res.json();
      if (Array.isArray(targets) && targets.length) break;
    } catch (e) { lastErr = e.message; }
  }
  if (!Array.isArray(targets) || !targets.length) {
    console.error('CDP tidak siap. lastErr:', lastErr);
    chrome.kill();
    process.exit(1);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));

  let id = 0;
  const pending = new Map();
  const consoleLogs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      consoleLogs.push(`[${msg.params.type}] ${args}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleLogs.push(`[EXCEPTION] ${d.text || ''} ${d.exception?.description || ''}`);
    }
    if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
      consoleLogs.push(`[LOG:${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await sleep(10000);

  // Klik provider SPRIBE untuk uji load games
  const clickResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('button.casino-card[title="SPRIBE"]');
      if (!card) return 'SPRIBE card not found';
      card.click();
      return 'clicked';
    })()`,
    returnByValue: true,
  });
  console.log('click:', clickResult.result.result.value);
  await sleep(6000);

  if (SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
    console.log('screenshot:', SHOT);
  }

  const { result } = await send('Runtime.evaluate', {
    expression: `(() => {
      const grid = document.getElementById('casino-grid');
      const status = document.getElementById('casino-status');
      const filters = document.getElementById('casino-filters');
      const games = document.getElementById('casino-games');
      return JSON.stringify({
        url: location.href,
        statusText: status ? status.textContent : 'NO #casino-status',
        gridCards: grid ? grid.querySelectorAll('.casino-card').length : 'NO #casino-grid',
        gridHtmlHead: grid ? grid.innerHTML.slice(0, 200) : null,
        filterChips: filters ? filters.querySelectorAll('.casino-chip').length : 'NO #casino-filters',
        gamesHtmlHead: games ? games.innerHTML.slice(0, 150) : 'NO #casino-games',
        readyState: document.readyState,
      });
    })()`,
    returnByValue: true,
  });
  console.log('DOM:', result.result.value);
  console.log('CONSOLE(' + consoleLogs.length + '):');
  for (const line of consoleLogs.slice(0, 40)) console.log('  ' + line);
} finally {
  chrome.kill();
}

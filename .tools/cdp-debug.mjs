// CDP debug: temukan elemen penyebab overflow horizontal di market-play (mobile 375px)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || 'http://localhost:3000/market-play.html?code=HK';
const SHOT = process.argv[3] || '';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9333', '--user-data-dir=' + process.env.TEMP + '/cdp-mp',
  'about:blank',
], { stdio: 'ignore' });
chrome.on('error', (e) => console.error('chrome spawn error:', e.message));

try {
  let targets;
  let lastErr;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9333/json/list');
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
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(process.argv[4]) || 375, height: 812, deviceScaleFactor: 2, mobile: !process.argv[4],
  });
  await send('Page.navigate', { url: URL_ });
  await sleep(8000);

  if (SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
  }

  const { result } = await send('Runtime.evaluate', {
    expression: `(() => {
      const vw = document.documentElement.clientWidth;
      const out = { vw, docScrollW: document.documentElement.scrollWidth, offenders: [] };
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > vw + 1 || r.left < -1)) {
          out.offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 60),
            left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
          });
        }
      }
      out.offenders.sort((a, b) => b.right - a.right);
      out.offenders = out.offenders.slice(0, 25);
      return JSON.stringify(out);
    })()`,
    returnByValue: true,
  });
  console.log(result.result.value);
} finally {
  chrome.kill();
}

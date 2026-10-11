// Headless Chrome shot of the temp console's proposal page (art-proposal-shot). Own Chrome, own profile, killed at the end.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const S = new URL('.', import.meta.url).pathname;
const URL_ = process.argv[2] || 'http://localhost:5871/proposals#PR-007';
const OUT = process.argv[3] || S + 'out';
const W = 1360;
mkdirSync(OUT, { recursive: true });
const port = 9431;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${S}chrome`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', `--window-size=${W},1000`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = l.find((t) => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 1000, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await sleep(3500);
  const info = await ev(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.top + scrollY, b.height]; };
    return { h: document.documentElement.scrollHeight, text: document.body.innerText, tryit: r('#tryit'), decide: r('#decide'), opts: r('.opts') }; })()`);
  writeFileSync(OUT + '/page.txt', info.text);
  writeFileSync(OUT + '/info.json', JSON.stringify({ h: info.h, tryit: info.tryit, decide: info.decide, opts: info.opts }, null, 1));
  const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: info.h, scale: 1 } });
  writeFileSync(OUT + '/full.png', Buffer.from(full.result.data, 'base64'));
  console.log('OK', JSON.stringify({ h: info.h, tryit: info.tryit, decide: info.decide, opts: info.opts }));
} catch (e) { console.log('ERR', e.stack || e); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} chrome.kill('SIGTERM'); await sleep(500); try { chrome.kill('SIGKILL'); } catch {} }

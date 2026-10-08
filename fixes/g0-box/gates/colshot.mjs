#!/usr/bin/env node
// colpause proposal shots (Chrome, no timing): per arm, open the page, 6 s idle, run g0.0f's morph driver
// (window.__fwMorphDrive: to the page end, open the menu, hold, close, hold, open again), and take a screenshot 0.8 s
// after the menu's SECOND opening (the moment option 1 differs: its columns start again from the first position).
// Arms are served by fixes/g0-box/phone/p168-serve.sh (out/p168/serve-<arm>.json). Output: out/g0box/colpause/shots/<arm>.png
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-box -- \
//     node fixes/g0-box/gates/colshot.mjs f fB fB2
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ARMS = process.argv.slice(2); if (!ARMS.length) { console.error('usage: colshot.mjs <arm> ...'); process.exit(2); }
const OUT = join(WT, 'out/g0box/colpause/shots'); mkdirSync(OUT, { recursive: true });
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const START = `(() => { const sc = document.querySelector('.start-selling-morph-col-track')?.closest('[data-start-selling-scene]');
  const L = window.__cs = { opens: 0, at: null }; let prev = sc && sc.getAttribute('data-start-selling-scene');
  const loop = () => { const v = sc && sc.getAttribute('data-start-selling-scene'); if (v === 'active' && prev !== 'active') { L.opens++; if (L.opens === 2) L.at = performance.now(); } prev = v; if (!L.stop) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); window.__fwMD = null; window.__fwMorphDrive({ hold: 2500, cycles: 2 }); return 1; })()`;
const READY = `(window.__cs.at != null && performance.now() - window.__cs.at > 800)`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/g0box/chrome'), 'colshot'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ARMS) {
    const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
    const page = await cdp.newIsolatedPage();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await gotoAndSettle(page, `http://localhost:${port}/`, { quietMs: 1500, maxMs: 45000 }); await sleep(6000);
    await page.eval(START); const t0 = Date.now();
    while (!(await page.eval(READY)) && Date.now() - t0 < 40000) await sleep(100);
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const f = join(OUT, `${arm}.png`); writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log(`SHOT ${arm}: ${f} (second opening + ${Math.round(Date.now() - t0)} ms after the driver start)`);
    await page.close?.();
  }
} finally { cdp.close(); await chrome.close(); }

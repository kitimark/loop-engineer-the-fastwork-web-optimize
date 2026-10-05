// end-morph (fix-end-morph): does an iOS-like toolbar step (viewport height 775 <-> 815) flip the will-change window
// (fwWC, JS 2736-2748: IntersectionObserver rootMargin 50 %, data-fw-wc 1/0, CSS [data-fw-wc="0"] { will-change: auto })
// of elements in the end zone? Chrome headless 430 x H DPR 3 mobile + touch, COUNTS ONLY. At each morph position (touch
// held), a MutationObserver counts data-fw-wc writes (value changes only) during: a 600 ms control window, a step
// 775 -> 815 + 600 ms, a step back + 600 ms. Also lists, per position, the elements whose data-fw-wc is 1 and whose
// rect is within 1.5 viewports of the viewport edge (distance of their edge to the IO margin line).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/em-wc-chrome.mjs [--overlay fixes/end-morph/overlay] [--ms pre,0,0.1,0.25,0.4,0.5,0.7,1]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MS = arg('--ms', 'pre,0,0.1,0.25,0.4,0.5,0.7,1').split(',');
const OVERLAY = resolve(WT, arg('--overlay', 'fixes/end-morph/overlay'));
const H1 = 775, H2 = 815;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph'); mkdirSync(OUT, { recursive: true });
const st = join(OUT, `serve-wc-${stamp}.json`);
const srvP = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', join(mirrorHome(), 'site-pretty'), '--overlay', OVERLAY, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'emwc'), headless: true, windowSize: `430,${H1}` });
const cdp = await CDP.connect(chrome.wsUrl);
const metrics = (h) => ({ width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
const res = { tool: 'fixes/end-morph/em-wc-chrome.mjs', positions: [] };
const desc = `(e) => e.tagName.toLowerCase() + '.' + [...e.classList].filter((c) => !/^svelte-/.test(c)).slice(0, 2).join('.')`;
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', metrics(H1));
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
  await page.eval(`(() => { window.__wcLog = []; const d = ${desc}; new MutationObserver((ms) => { for (const m of ms) if (m.attributeName === 'data-fw-wc' && m.oldValue !== m.target.getAttribute('data-fw-wc')) window.__wcLog.push([performance.now(), d(m.target), m.target.getAttribute('data-fw-wc')]); })
    .observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-fw-wc'] }); return 1; })()`);
  const g = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, endStart: max - t }; })()`);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 215, y: 400, id: 1 }] });
  for (const p of MS) {
    const y = p === 'pre' ? g.endStart - 400 : Math.round(g.endStart + Number(p) * g.t);
    await page.send('Emulation.setDeviceMetricsOverride', metrics(H1));
    await page.eval(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(900);
    const near = await page.eval(`(() => { const d = ${desc}; const ih = innerHeight; const out = [];
      for (const e of document.querySelectorAll('[data-fw-wc]')) { const r = e.getBoundingClientRect(); const dTop = r.bottom + 0.5 * ih, dBot = 1.5 * ih - r.top; if (Math.min(Math.abs(dTop), Math.abs(dBot)) < 120) out.push([d(e), e.getAttribute('data-fw-wc'), Math.round(r.top), Math.round(r.bottom), getComputedStyle(e).willChange]); }
      return out; })()`);
    const win = async (label, h) => { await page.eval('(window.__wcLog.length = 0, 1)'); if (h) await page.send('Emulation.setDeviceMetricsOverride', metrics(h)); await sleep(600); return { label, flips: await page.eval('window.__wcLog.map((x) => x[1] + "=" + x[2])') }; };
    const ws = [await win('control'), await win(`step ${H1}->${H2}`, H2), await win('control@815'), await win(`step ${H2}->${H1}`, H1)];
    const row = { p, y, near, windows: ws };
    res.positions.push(row); console.log(p, 'y', y, 'near-edge', JSON.stringify(near), '|', ws.map((w) => `${w.label}: ${w.flips.length} ${JSON.stringify(w.flips.slice(0, 6))}`).join(' | '));
  }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.close();
} finally { const f = join(OUT, `wc-${stamp}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); cdp.close(); await chrome.close(); srvP.kill(); rmSync(st, { force: true }); console.log('wrote', f); }

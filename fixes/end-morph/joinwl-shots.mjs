// end-morph (fix-end-morph, user T-204 #10/#13): proposal screenshots of the nav's "Join waitlist" button mid-exit, Chrome.
// Headless Chrome 430x775 DPR 3, mobile + touch. Per build (overlay dir): load, walk the page, park above the end zone,
// step the scroll per rAF to morph m and capture at once (inside the button.s 0.12 s opacity delay, so the fade has not
// started, as in the real first frames of the morph), scroll to morph m (default 0.2: the frame where the original's
// 8px rise and 10px blur are complete while it is still fully opaque), and capture the nav strip (css 0-96 px).
// Writes out/joinwl/shots/<label>-m<m>.png and prints the button's rect and computed style at that frame.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/joinwl-shots.mjs --arms B=out/joinwl/B,fadeonly=fixes/joinwl-fadeonly/overlay [--m 0.2,0.4]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [label, dir] = x.split('='); return { label, dir: resolve(WT, dir) }; });
const MS = arg('--m', '0.2').split(',').map(Number);
const H = 775;
const OUT = join(WT, 'out/joinwl/shots'); mkdirSync(OUT, { recursive: true });
const BASE = join(mirrorHome(), 'site-pretty');
const READ = `(() => { const b = document.querySelector('.start-selling-top-nav-btn.is-earn'); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  const hd = document.querySelector('header.start-selling-top-nav');
  return { y: scrollY, morph: hd.style.getPropertyValue('--morph'), top: +r.top.toFixed(2), left: +r.left.toFixed(2), op: cs.opacity, tf: cs.transform, fl: cs.filter }; })()`;
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm.label}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', arm.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'jws'), headless: true, windowSize: `430,${H}` });
  const cdp = await CDP.connect(chrome.wsUrl);
  try {
    for (const m of MS) {
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
      const g = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, endStart: max - t }; })()`);
      await page.eval(`(window.scrollTo({ top: ${g.endStart - H}, behavior: 'instant' }), 1)`); await sleep(2500);
      // a held touch: without it the 7d settle (200 ms rest timer) scrolls a part-way morph back to m 0 or 1
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 215, y: 400, id: 1 }] });
      // real time, no paused animations (paused, the frozen nav painted nothing): one scrollTo per rAF from the end zone's
      // start to morph m in 8 frames, then the capture at once, inside the button's 0.12 s opacity delay
      const target = Math.round(g.endStart + m * g.t);
      await page.eval(`new Promise((res) => { const a = ${g.endStart}, b = ${target}; let k = 0; const f = () => { k++; window.scrollTo({ top: Math.round(a + (b - a) * k / 8), behavior: 'instant' }); k < 8 ? requestAnimationFrame(f) : requestAnimationFrame(() => res(1)); }; requestAnimationFrame(f); })`);
      // the clip is in document coordinates: the fixed nav strip sits at the scroll position
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: target, width: 430, height: 96, scale: 1 }, captureBeyondViewport: false });
      const r = await page.eval(READ);
      const f = join(OUT, `${arm.label}-m${m}.png`); writeFileSync(f, Buffer.from(shot.data, 'base64'));
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      console.log(arm.label, 'm', m, JSON.stringify(r), f);
      await page.close?.().catch(() => {});
    }
  } finally { cdp.close(); await chrome.close(); p.kill(); }
}

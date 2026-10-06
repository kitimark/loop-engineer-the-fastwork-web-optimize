// end-morph (fix-end-morph, user T-204 #10): the nav's "Join waitlist" button (.start-selling-top-nav-btn.is-earn) per
// frame through the end-of-page morph, Chrome, COUNTS/GEOMETRY ONLY (no timing judged). Headless Chrome 430 x H DPR 3,
// mobile + touch, hover:none / pointer:coarse. Per build: load, scroll the page once, park 2 viewports above the bottom,
// then one scrollTo per rAF down to the bottom (N steps) and R rest frames, then back up (N steps) and R rest frames.
// Every frame (rAF, after the scroll of the previous frame was drawn) reads the button's getBoundingClientRect, its
// computed opacity / transform / translate / filter, the label box (.start-selling-top-nav-earn-box, nav-earn rev 3),
// the nav's rect and --morph. Output: out/joinwl/joinwl-chrome-<label>-<stamp>.json and a summary line.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/joinwl-chrome.mjs --label base [--overlay <dir>] [--h 775] [--steps 60] [--rest 120] [--css <file>]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const H = Number(arg('--h', '775')), N = Number(arg('--steps', '60')), REST = Number(arg('--rest', '120'));
const LABEL = arg('--label', 'base');
const OVERLAY = arg('--overlay', null) ? resolve(WT, arg('--overlay')) : null;
const CSSX = arg('--css', null); const CSSTXT = CSSX ? readFileSync(resolve(WT, CSSX), 'utf8') : null;
const BASE = join(mirrorHome(), 'site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/joinwl'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

async function serve() {
  const st = join(OUT, `serve-${LABEL}-${tag}.json`); rmSync(st, { force: true });
  const a = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'];
  if (OVERLAY) a.push('--overlay', OVERLAY);
  const p = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}

const READ = `(() => { const b = document.querySelector('.start-selling-top-nav-btn.is-earn'); const x = document.querySelector('.start-selling-top-nav-earn-box');
  const hd = document.querySelector('header.start-selling-top-nav'); const r = b ? b.getBoundingClientRect() : null; const rx = x ? x.getBoundingClientRect() : null;
  const hr = hd ? hd.getBoundingClientRect() : null; const cs = b ? getComputedStyle(b) : null;
  return { y: Math.round(scrollY), morph: hd ? hd.style.getPropertyValue('--morph') || getComputedStyle(hd).getPropertyValue('--morph') : null,
    hdr: hd ? hd.className.replace(/svelte-\\w+/g, '').replace(/\\s+/g, ' ').trim() : null,
    top: r && +r.top.toFixed(2), left: r && +r.left.toFixed(2), w: r && +r.width.toFixed(2), h: r && +r.height.toFixed(2),
    boxTop: rx && +rx.top.toFixed(2), boxLeft: rx && +rx.left.toFixed(2), boxW: rx && +rx.width.toFixed(2),
    navTop: hr && +hr.top.toFixed(2), navH: hr && +hr.height.toFixed(2),
    op: cs && +cs.opacity, tf: cs && cs.transform, tr: cs && cs.translate, fl: cs && cs.filter }; })()`;
// one scrollTo per rAF, a READ at the start of every frame (it sees the previous frame's scroll), then rest frames
const RUN = (ys, rest) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; const out = []; let k = 0;
  const f = () => { const s = ${READ}; s.k = k; out.push(s); if (k < ys.length) window.scrollTo({ top: ys[k], behavior: 'instant' });
    k++; if (k < ys.length + ${rest}) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); })`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * (i + 1)) / n));

const srv = await serve();
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'jw'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-morph/joinwl-chrome.mjs', label: LABEL, browser: chrome.browser, h: H, steps: N, rest: REST, overlay: OVERLAY, css: CSSX };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  res.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
  if (CSSTXT) await page.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(CSSTXT)}; document.head.appendChild(s); return 1; })()`);
  console.log(LABEL, 'served', JSON.stringify(res.served));
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
  const max = await page.eval(`document.documentElement.scrollHeight - innerHeight`);
  const from = max - 2 * H;
  await page.eval(`(window.scrollTo({ top: ${from}, behavior: 'instant' }), 1)`); await sleep(2000);
  res.max = max; res.from = from;
  res.down = await page.eval(RUN(lin(from, max, N), REST), { timeout: 60000 });
  await sleep(1000);
  res.up = await page.eval(RUN(lin(max, from, N), REST), { timeout: 60000 });
  // the baseline's own trigger (JS 13049-13058): at the bottom, with #platform in view, a wheel (or touchmove) with
  // deltaY > 0 starts the 0.68 s tween to morph 1, deltaY < 0 back to 0. Dispatched once at frame 0, then frames only.
  await page.eval(`(window.scrollTo({ top: ${max}, behavior: 'instant' }), 1)`); await sleep(1500);
  const WHEEL = (d) => RUN([], REST).replace('requestAnimationFrame(f); })', `window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${d}, cancelable: true, bubbles: true })); requestAnimationFrame(f); })`);
  res.wheelDown = await page.eval(WHEEL(120), { timeout: 60000 }); await sleep(1000);
  res.wheelUp = await page.eval(WHEEL(-120), { timeout: 60000 });
} finally {
  cdp.close(); await chrome.close();
  srv.proc.kill();
}
// summary: frames where the button is visible (opacity > 0.01); its top relative to the first frame of the pass
const sum = (fr) => { const t0 = fr[0].top; const vis = fr.filter((s) => s.op > 0.01);
  const lifts = vis.map((s) => +(s.top - t0).toFixed(2)); const navs = vis.map((s) => +(s.navTop - fr[0].navTop).toFixed(2));
  const tys = vis.map((s) => { const m = /matrix\(([^)]+)\)/.exec(s.tf || ''); return m ? +m[1].split(',')[5] : 0; });
  return { frames: fr.length, visible: vis.length, liftMin: Math.min(...lifts), liftMax: Math.max(...lifts), navMoveMin: Math.min(...navs), navMoveMax: Math.max(...navs),
    ownTranslateYmin: Math.min(...tys), leftRange: [Math.min(...vis.map((s) => s.left)), Math.max(...vis.map((s) => s.left))] }; };
res.summary = { down: sum(res.down), up: sum(res.up), wheelDown: res.wheelDown && sum(res.wheelDown), wheelUp: res.wheelUp && sum(res.wheelUp) };
const f = join(OUT, `joinwl-chrome-${LABEL}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
console.log(LABEL, 'SUMMARY', JSON.stringify(res.summary)); console.log(f);

// COPY by fix-end-morph-p1 of fix-morph-gpu's fixes/morph-gpu/gates/frames.mjs (main), for the exact-m reference of P1's
// gate (b) (review-end-morph-p1, lead 2026-10-06): adds R2 (a second R load, so R has its own A/A) and writes to
// out/end-morph-p1/rv1frames-<stamp>; nothing else changed. Use --builds M,R,M2,R2 and --ms with P1's exact m values.
// morph-gpu frozen frames in Chrome (fix-morph-gpu; adapted from fixes/morph-inherit/gates/reveal-frames.mjs): M = main +
// best-build + hook (besthook), R = this fix + the same hook (rvhook, newest in out/snapshots unless --rv <dir>), M2 = a
// second M load (true A/A). Headless Chrome 430x932 DPR 3 mobile; all builds held at the same morph values m with
// window.__fwMorphSet(m) (no spring running); Date.now frozen; CSS animations paused at the same time, transitions
// finished. Per m: a PNG per build and a pixel diff vs M. Counts and pixels only, no timing.
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu \
//   -- node fixes/morph-gpu/gates/frames.mjs [--builds M,R,M2] [--ms ...] [--steps-file f.json] [--width 430 --height 932 --dpr 3 --desktop]
// --steps-file: a JSON list like --ms where a string is a page expression run before the shot (no m change).
// --desktop: not mobile, no touch (with --width/--height/--dpr for a desktop window).
// --reduced: emulate prefers-reduced-motion: reduce (Emulation.setEmulatedMedia) on every load.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const argv0 = process.argv.slice(2);
const rvArg = argv0.includes('--rv') ? argv0[argv0.indexOf('--rv') + 1] : null;
const { readdirSync, statSync } = await import('node:fs');
const rvDir = rvArg || readdirSync(SNAP).filter((d) => d.startsWith('rvhook-')).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const BUILDS = {
  M: { dir: join(SNAP, 'besthook-fef569e3c2e2'), js: 'fef569e3c2e2', css: 'e0f92804c521' }, // best-build + hook
  R: { dir: rvDir, js: hashOf(rvDir, NODE), css: hashOf(rvDir, CSS) },
};
BUILDS.M2 = { ...BUILDS.M }; // the A/A pair: a second M load, same build
BUILDS.R2 = { ...BUILDS.R }; // fix-end-morph-p1: a second R load (R's own A/A)

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--builds', 'M,R,M2').split(',');
const MS = argv.includes('--steps-file') ? JSON.parse(readFileSync(arg('--steps-file'), 'utf8')) : arg('--ms', '0,0.002,0.02,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.95,0.99,1,0.6,0.15,0').split(',').map(Number);
const VW = Number(arg('--width', '430')), VH = Number(arg('--height', '932')), DPR = Number(arg('--dpr', '3')), MOBILE = !argv.includes('--desktop');
const REDUCED = argv.includes('--reduced'); // emulate prefers-reduced-motion: reduce on every load
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1', `rv1frames-${VH}-${tag}`); mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const INIT = `(() => { const F = 1790985600500; Date.now = () => F; })();`;
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 4000; } n++; } catch {} } return n; })()`;
const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`;
const ANC = `(() => { const h = document.querySelector('.start-selling-top-nav'); const out = []; for (let e = h; e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); out.push([e.tagName + '.' + [...e.classList].join('.'), c.position, c.zIndex, c.transform, c.filter, c.opacity, c.isolation, c.willChange, c.contain, e.parentElement ? [...e.parentElement.children].indexOf(e) + '/' + e.parentElement.children.length : '']); }
  const sib = [...h.parentElement.children].map((e) => { const c = getComputedStyle(e); return [e.tagName + '.' + [...e.classList].join('.').slice(0, 60), c.position, c.zIndex]; }); return JSON.stringify({ out, sib }); })()`;
const STATE = `(() => { const h = document.querySelector('.start-selling-top-nav'); const b = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  const q = (s) => document.querySelector(s); return { cls: h.className.replace(/svelte-\\w+/g, '').trim(), rv: h.hasAttribute('data-fw-rv'), morph: h.style.getPropertyValue('--morph'), rect: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100),
    clip: cs.clipPath, bg: cs.backgroundColor, bdf: cs.backdropFilter || cs.webkitBackdropFilter, veil: document.querySelector('.start-selling-morph-veil')?.style.transform || '', title: ['.start-selling-morph-title', '.start-selling-morph-footer', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions'].map((s) => { const r = q(s)?.getBoundingClientRect(); return r ? [r.x, r.y].map((v) => Math.round(v * 300) / 100) : null; }), y: Math.round(scrollY) }; })()`;

function decodePng(b) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break; p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[row + x - bpp] : 0, up = y ? out[row - stride + x] : 0, c = y && x >= bpp ? out[row - stride + x - bpp] : 0; let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[row + x] = v & 255; } }
  return { w, h, bpp, px: out };
}
function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { error: 'size' };
  let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n8 = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.px[(y * a.w + x) * a.bpp + c] - b.px[(y * b.w + x) * b.bpp + c]));
    if (d) { n++; if (d > 8) n8++; max = Math.max(max, d); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
  const r = (v) => Math.round(v / 3 * 10) / 10;
  return { px: n, pxOver8: n8, pct: Math.round(n / (a.w * a.h) * 1e4) / 100, max, box: n ? [r(x0), r(y0), r(x1 + 1), r(y1 + 1)] : null };
}

async function serve(label) {
  const st = join(OUT, `serve-${label}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url };
}

const profileDir = tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'rv');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: `${VW},${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-morph-gpu frames (frozen frames, M vs R, M2 = A/A)', rvDir, viewport: { w: VW, h: VH, dpr: DPR, mobile: MOBILE, reducedMotion: REDUCED }, browser: chrome.browser, ms: MS, out: OUT, builds: {} };
const shots = {};
try {
  for (const b of ORDER) {
    const srv = await serve(b);
    const page = await cdp.newIsolatedPage();
    const R = res.builds[b] = { frames: [] };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: MOBILE });
      if (MOBILE) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (REDUCED) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      R.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (R.served.js !== BUILDS[b].js || R.served.css !== BUILDS[b].css) { R.void = JSON.stringify(R.served); console.log('VOID', b, R.void); continue; }
      await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 2500); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      if (argv.includes('--anc')) console.log('ANC', b, await page.eval(ANC));
      if (REDUCED) console.log('REDUCED', b, (R.reduced = await page.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`)));
      shots[b] = [];
      for (let k = 0; k < MS.length; k++) {
        const m = MS[k];
        if (typeof m === 'string') { await page.eval(`(${m}, ${RAF2})`); await sleep(400); }
        else {
          await page.eval(`(window.__fwMorphSet(${m}), ${RAF2})`);
          await page.eval(`(window.__fwMorphSet(${m}), ${RAF2})`);
          await sleep(400);
        }
        const nAnim = await page.eval(FREEZE);
        await page.eval(RAF2); await sleep(200);
        const st = await page.eval(STATE);
        const png = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        const f = join(OUT, `${b}-${k}-m${typeof m === 'string' ? 'js' : m}.png`); writeFileSync(f, png);
        shots[b].push(png);
        R.frames.push({ k, m, anims: nAnim, state: st, file: f });
        console.log(b, k, m, JSON.stringify(st));
      }
    } finally { await page.close(); srv.proc.kill(); }
  }
  res.diffs = {};
  for (const b of ORDER.filter((x) => x !== 'M' && shots[x] && shots.M)) {
    res.diffs[b] = MS.map((m, k) => ({ k, m, ...diff(decodePng(shots.M[k]), decodePng(shots[b][k])) }));
    for (const d of res.diffs[b]) console.log('diff M vs', b, JSON.stringify(d));
  }
} finally {
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', join(OUT, 'frames.json'));
}

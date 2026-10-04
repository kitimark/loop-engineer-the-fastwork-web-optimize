// morph-scroll frozen frames in Chrome (fix-hero-exit-threaded). A = msbasehook (base + window.__fwMorphSet: the morph
// held at m at the end of the page, as the jack leaves it), B = ms (the proposal: the page scrolled to m of the way
// into the extra screen, the morph set by the scroll itself), A2 = a second A load (A/A). Headless Chrome 430x932 DPR 3
// mobile + touch; Date.now frozen; CSS animations paused at the same time, transitions finished. Per m: PNGs, pixel diff
// vs A, and state (morph value, panel inert, #platform bottom, html.fw-ms). B's root snap is switched off with an
// inline style while it is positioned (programmatic scrolls may snap). Counts and pixels only, no timing.
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 \
//   --owner fix-hero-exit-threaded -- node fixes/morph-scroll/frames.mjs [--builds A,B,A2] [--ms 0,0.5,1] [--desktop]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const newest = (p) => readdirSync(SNAP).filter((d) => d.startsWith(p + '-')).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const build = (dir) => ({ dir, js: sha(readFileSync(join(dir, NODE))), css: sha(readFileSync(join(dir, CSS))) });
const BUILDS = { A: build(arg('--a', newest('msbasehook'))), B: build(arg('--b', newest('ms'))) };
BUILDS.A2 = { ...BUILDS.A };
const ORDER = arg('--builds', 'A,B,A2').split(',');
// m = whole CSS px into the 932 px extra screen, so B lands exactly on m (Chrome scrolls in whole px) and A holds the same m
const MS = arg('--ms', [0, 19, 93, 186, 280, 373, 466, 559, 652, 746, 839, 885, 932, 466, 0].map((d) => d / 932).join(',')).split(',').map(Number);
const mTag = (m) => Math.round(m * 1000) / 1000;
const MOBILE = !argv.includes('--desktop');
const VW = Number(arg('--width', MOBILE ? '430' : '1440')), VH = Number(arg('--height', MOBILE ? '932' : '900')), DPR = Number(arg('--dpr', MOBILE ? '3' : '1'));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-scroll', `frames-${tag}`); mkdirSync(OUT, { recursive: true });
const INIT = `(() => { const F = 1790985600500; Date.now = () => F; })();`;
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 4000; } n++; } catch {} } return n; })()`;
const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`;
const STATE = `(() => { const h = document.querySelector('.start-selling-top-nav'), P = document.querySelector('.start-selling-platform'), E = document.querySelector('.fw-ms-end'), pn = document.querySelector('.start-selling-morph-panel');
  return { fwms: document.documentElement.classList.contains('fw-ms'), morph: h.style.getPropertyValue('--morph'), rv: h.hasAttribute('data-fw-rv'), inert: pn ? pn.inert : null,
    platBottom: Math.round(P.getBoundingClientRect().bottom * 100) / 100, platPos: getComputedStyle(P).position, fade: P.style.getPropertyValue('--morph-fade'),
    end: E ? Math.round(E.getBoundingClientRect().top) : null, y: Math.round(scrollY * 100) / 100, ih: innerHeight, sh: document.documentElement.scrollHeight,
    touchListeners: typeof getEventListeners === 'function' ? null : undefined, drive: typeof window.__fwMorphDrive, set: typeof window.__navMorphSet }; })()`;
const goEnd = `(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); })()`;
// B: scroll to m of the way into the extra screen (snap off while positioned)
const goP = (m) => `(() => { document.documentElement.style.scrollSnapType = 'none'; const E = document.querySelector('.fw-ms-end'); if (!E) return 'no .fw-ms-end';
  const L = E.offsetHeight, y0 = document.documentElement.scrollHeight - innerHeight - L; window.scrollTo({ top: y0 + ${m} * L, behavior: 'instant' }); return [y0, L]; })()`;

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
  let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n8 = 0, n64 = 0, n128 = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.px[(y * a.w + x) * a.bpp + c] - b.px[(y * b.w + x) * b.bpp + c]));
    if (d) { n++; if (d > 8) n8++; if (d > 64) n64++; if (d > 128) n128++; max = Math.max(max, d); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
  const r = (v) => Math.round(v / DPR * 10) / 10;
  return { px: n, pxOver8: n8, pxOver64: n64, pxOver128: n128, pct: Math.round(n / (a.w * a.h) * 1e4) / 100, max, box: n ? [r(x0), r(y0), r(x1 + 1), r(y1 + 1)] : null };
}
async function serve(label) {
  const st = join(OUT, `serve-${label}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', BUILDS[label].dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url };
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-scroll/chrome'), 'frames'), headless: true, windowSize: `${VW},${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-hero-exit-threaded morph-scroll frames (A = base held at m by __fwMorphSet, B = proposal scrolled to m)', viewport: { w: VW, h: VH, dpr: DPR, mobile: MOBILE }, browser: chrome.browser, ms: MS, out: OUT, builds: {} };
const shots = {};
try {
  for (const b of ORDER) {
    const srv = await serve(b);
    const page = await cdp.newIsolatedPage();
    const R = res.builds[b] = { ...BUILDS[b], frames: [] };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: MOBILE });
      if (MOBILE) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      R.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (R.served.js !== R.js || R.served.css !== R.css) { R.void = JSON.stringify(R.served); console.log('VOID', b, R.void); continue; }
      R.media = await page.eval(`({ coarse: matchMedia('(hover: none) and (pointer: coarse)').matches, screen: [screen.width, screen.height] })`);
      await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 2500); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      console.log(b, 'media', JSON.stringify(R.media), 'state at end', JSON.stringify(await page.eval(STATE)));
      if (argv.includes('--state-only')) continue;
      shots[b] = [];
      for (let k = 0; k < MS.length; k++) {
        const m = MS[k];
        // A: the end of the page, morph held at m. A variant whose gate is off (no .fw-ms-end): the same, rest only.
        const gateOff = !b.startsWith('A') && (await page.eval(`!document.querySelector('.fw-ms-end')`));
        if (b.startsWith('A') || gateOff) {
          await page.eval(goEnd); await page.eval(RAF2);
          await page.eval(`(window.__fwMorphSet?.(${m}), ${RAF2})`); await page.eval(`(window.__fwMorphSet?.(${m}), ${RAF2})`);
        } else {
          R.pos = await page.eval(goP(m)); await page.eval(RAF2);
          await page.eval(goP(m)); await page.eval(RAF2);
        }
        await sleep(400);
        const nAnim = await page.eval(FREEZE);
        await page.eval(RAF2); await sleep(200);
        const st = await page.eval(STATE);
        const png = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        const f = join(OUT, `${b}-${k}-m${mTag(m)}.png`); writeFileSync(f, png);
        shots[b].push(png);
        R.frames.push({ k, m, anims: nAnim, state: st, file: f });
        console.log(b, k, m, JSON.stringify(st));
      }
    } finally { await page.close(); srv.proc.kill(); }
  }
  res.diffs = {};
  for (const b of ORDER.filter((x) => x !== 'A' && shots[x] && shots.A)) {
    res.diffs[b] = MS.map((m, k) => ({ k, m, ...diff(decodePng(shots.A[k]), decodePng(shots[b][k])) }));
    for (const d of res.diffs[b]) console.log('diff A vs', b, JSON.stringify(d));
  }
} finally {
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', join(OUT, 'frames.json'));
}

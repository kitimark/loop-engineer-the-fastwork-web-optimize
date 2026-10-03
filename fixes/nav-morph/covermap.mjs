// F3 coverage map (fix-nav-morph, P-082 design): where, at the pin, a touch lands on a hit path with NO non-passive
// touchmove listener (WebKit: an asynchronous-dispatch point, EventTrackingRegions TrackingType; Chrome: outside the
// blocking touch region). C aw1-10e vs V mw10e-arm-scope-c, at the phone's viewport (430x775 scripted, 430x815
// collapsed toolbar) and at 430x932. Counts only, no timing. Per build and viewport: pre-morph (end of page) and pin
// (after the start swipe, m = 1): the 10 px grid cells without a non-passive touchmove listener, as row runs
// (y band -> x ranges) and the element under each run (tag.class#id of elementFromPoint and its first listener owner).
// Run (shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//     node fixes/nav-morph/covermap.mjs [--builds C,V] [--out f.json]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUT = join(WT, 'out/costcard'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const AW = join(SNAP, 'aw1-10e-3e2f599a1632');
const BUILDS = {
  C: { overlays: [AW], js: '3e2f599a1632' },
  V: { overlays: [join(SNAP, 'mw10e-arm-scope-c-c6d3590576a7'), AW], js: 'c6d3590576a7' },
};
const CSSH = 'c6aad94b455f';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--builds', 'C,V').split(',');
const VIEWS = [[430, 775], [430, 815], [430, 932]];
const startedAt = new Date().toISOString();
const outFile = arg('--out', join(OUT, `covermap-${startedAt.replace(/[:.]/g, '-')}.json`));
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const INIT = `(() => {
  const T = new Set(['touchstart', 'touchmove']);
  const DP = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);
  const reg = new Map();
  const desc = (t) => t === window ? 'window' : t === document ? 'document' : t && t.nodeType === 1 ? (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : '?';
  const oA = EventTarget.prototype.addEventListener, oR = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, cb, o) {
    if (T.has(type) && cb) { const capture = typeof o === 'boolean' ? o : !!(o && o.capture);
      const passive = o && typeof o === 'object' && 'passive' in o ? !!o.passive : DP.has(type) && (this === window || this === document || this === document.documentElement || this === document.body);
      let a = reg.get(this); if (!a) reg.set(this, (a = [])); if (!a.some((x) => x.type === type && x.cb === cb && x.capture === capture)) a.push({ type, cb, capture, passive }); }
    return oA.call(this, type, cb, o); };
  EventTarget.prototype.removeEventListener = function (type, cb, o) {
    if (T.has(type) && cb) { const capture = typeof o === 'boolean' ? o : !!(o && o.capture); const a = reg.get(this);
      const i = a ? a.findIndex((x) => x.type === type && x.cb === cb && x.capture === capture) : -1; if (i >= 0) a.splice(i, 1); }
    return oR.call(this, type, cb, o); };
  window.__cm = () => { const rows = []; let n = 0, free = 0;
    for (let y = 5; y < innerHeight; y += 10) { let run = null; const runs = [];
      for (let x = 5; x < innerWidth; x += 10) { n++;
        const el = document.elementFromPoint(x, y); const path = []; for (let e = el; e; e = e.parentNode) path.push(e); path.push(window);
        const owner = path.find((t) => (reg.get(t) || []).some((l) => l.type === 'touchmove' && !l.passive));
        if (owner) { run = null; continue; }
        free++;
        if (run && run.el === desc(el)) run.x1 = x + 5; else { run = { x0: x - 5, x1: x + 5, el: desc(el) }; runs.push(run); } }
      if (runs.length) rows.push({ y0: y - 5, y1: y + 5, runs }); }
    // merge equal consecutive rows into bands
    const bands = []; for (const r of rows) { const k = JSON.stringify(r.runs); const b = bands[bands.length - 1];
      if (b && b.k === k && b.y1 === r.y0) b.y1 = r.y1; else bands.push({ k, y0: r.y0, y1: r.y1, runs: r.runs }); }
    const owners = {}; for (const [t, a] of reg) for (const l of a) if (l.type === 'touchmove' && !l.passive) owners[desc(t)] = (owners[desc(t)] || 0) + 1;
    return { freePct: Math.round((1000 * free) / n) / 10, bands: bands.map(({ k, ...b }) => b), nonPassiveTouchmoveOwners: owners, scrollY: Math.round(scrollY), innerHeight }; };
})()`;
const MORPH = `+(document.querySelector('header.start-selling-top-nav')?.style.getPropertyValue('--morph') || 0)`;

async function swipe(page, x, y0, dy, moves = 12) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= moves; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + i * dy }] }); await sleep(16); }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function serve(label) {
  const st = join(OUT, `serve-cm-${label}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].overlays.join(','), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url };
}
async function toEnd(page) {
  await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 1200); }; requestAnimationFrame(step); })`, { timeout: 60000 });
}

const profileDir = tempProfileDir(join(OUT, 'chrome'), 'covermap');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-nav-morph covermap', startedAt, browser: chrome.browser, maps: [] };
try {
  for (const b of ORDER) for (const [w, h] of VIEWS) {
    const srv = await serve(b);
    const page = await cdp.newIsolatedPage();
    const rec = { build: b, viewport: [w, h] };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      const js = sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`)));
      const css = sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`)));
      rec.served = { js, css };
      if (js !== BUILDS[b].js || css !== CSSH) { rec.void = `serves ${js} / ${css}`; continue; }
      await toEnd(page);
      rec.preMorph = JSON.parse(await page.eval('JSON.stringify(__cm())'));
      await swipe(page, 215, Math.round(h * 0.64), -20); await sleep(1400);
      rec.m = await page.eval(MORPH);
      rec.pin = JSON.parse(await page.eval('JSON.stringify(__cm())'));
      console.log(`${b} ${w}x${h}: pre free ${rec.preMorph.freePct} % | pin m ${rec.m} free ${rec.pin.freePct} % y ${rec.pin.scrollY}`);
      for (const band of rec.pin.bands) console.log(`   y ${band.y0}-${band.y1}: ${band.runs.map((r) => `x ${r.x0}-${r.x1} ${r.el}`).join(' ; ')}`);
    } catch (e) { rec.error = String(e.message || e); console.log(`${b} ${w}x${h} error: ${rec.error}`); }
    finally { await page.close(); srv.proc.kill(); res.maps.push(rec); writeFileSync(outFile, JSON.stringify(res, null, 1)); }
  }
} finally { cdp.close(); await chrome.close(); }
console.log('wrote', outFile);

#!/usr/bin/env node
// sticky-walk gate 4c: the PR-013 avatar slider (keep-st6, `.start-selling-avatars.is-carousel` in #people), A vs V
// (fix-scrollcb-g0, 2026-10-09; lead: "check its behaviour and pixels A vs V in Chrome and the Simulator").
// Functional, no timing verdicts. Arms from out/sticky-walk/snap (HASHES.txt checked per load, a mismatch is VOID),
// loads A (C = g0.0h), V (V = g0.0h + fixcq), A2, V2, each on its own server and origin.
//   --engine chrome: headless Chrome, 430x775 DPR 3 mobile + touch (the iPhone's scripted geometry).
//   --engine sim:    Safari on the warm fw-sim (in a functional sim session), screenshots by `simctl io screenshot`.
// Per load (the row brought to the middle of the viewport, instant scroll, after a 2.5 s settle):
//   1. behaviour: a MutationObserver on the row logs every state change for 8 s, state = .is-sliding + the 5 slot img
//      names; scored: the state sequence (as index steps) and the slide period (start-to-start, ms).
//   2. pixels: a hold hook wraps window.setTimeout for the slider's own helper (the 800 / 220 ms timers whose callback
//      text has `indexOf(r)` ... `splice(e, 1), t()`, the same match as px-sim.mjs's PX_CAROUSEL): while held, a due
//      helper callback is queued and run only when the gate steps it, so the cycle advances on demand and nothing else
//      changes. The gate steps until the slots show the mount state (x = 0, recorded before the row was activated),
//      then for 4 slides: REST crop (slots settled, 800 ms helper due), step, two frames, every animation under the row
//      paused at currentTime 110 ms, MID crop, resume, step (220 ms helper). Crops: the row's rect plus 8 css px.
// Scores per crop key (rest k / mid k): A~V beyond the A~A2 mask and the consistent count over all four cross pairs
// (pxlib rules: > 8 levels), plus max level.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node fixes/sticky-walk/gates/avatar-gate.mjs --engine chrome
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- node fixes/sticky-walk/gates/avatar-gate.mjs --engine sim
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngPixels, delta } from '../../v9-best/gates/pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const ENGINE = argv.includes('--engine') ? argv[argv.indexOf('--engine') + 1] : 'chrome';
if (!['chrome', 'sim'].includes(ENGINE)) { console.error('usage: avatar-gate.mjs --engine chrome|sim'); process.exit(1); }
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, process.env.PX_SNAP || 'out/sticky-walk/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const ARMS = [['A', 'C'], ['V', 'V'], ['A2', 'C'], ['V2', 'V']];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/sticky-walk/avatar', `${ENGINE}-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NCAP = 4;

const ROW = `document.querySelector('.start-selling-avatars.is-carousel')`;
const KEY = `(() => { const me = ${ROW}; if (!me) return null; return JSON.stringify({ s: me.classList.contains('is-sliding'), i: [...me.querySelectorAll('img')].map((i) => (i.getAttribute('src') || '').replace(/^https?:\\/\\/[^/]+/, "")) }); })()`;
const INSTALL = `(() => { if (window.__av) return 'again'; const me = ${ROW}; if (!me) return 'no row';
  const key = () => JSON.stringify({ s: me.classList.contains('is-sliding'), i: [...me.querySelectorAll('img')].map((i) => (i.getAttribute('src') || '').replace(/^https?:\\/\\/[^/]+/, "")) });
  const A = window.__av = { t0: performance.now(), log: [[0, key()]], hold: false, q: [], mount: null };
  new MutationObserver(() => { const k = key(); if (k !== A.log[A.log.length - 1][1]) A.log.push([Math.round(performance.now() - A.t0), k]); })
    .observe(me, { subtree: true, attributes: true, childList: true, attributeFilter: ['class', 'src'] });
  const st = window.setTimeout; const re = /indexOf\\(r\\)[\\s\\S]*splice\\(e, 1\\), t\\(\\)/;
  window.setTimeout = function (fn, ms, ...a) { if ((ms === 800 || ms === 220) && typeof fn === 'function' && re.test(Function.prototype.toString.call(fn)))
    return st.call(this, () => { if (A.hold) A.q.push([ms, fn]); else fn(); }, ms); return st.call(this, fn, ms, ...a); };
  A.step = () => { const x = A.q.shift(); if (!x) return 0; x[1](); return x[0]; };
  A.pause = (t) => { let n = 0; for (const a of me.getAnimations({ subtree: true })) { try { a.pause(); a.currentTime = t; n++; } catch {} } return n; };
  A.resume = () => { for (const a of me.getAnimations({ subtree: true })) { try { a.play(); } catch {} } return 1; };
  return 'ok'; })()`;
const RECT = `JSON.stringify((() => { const r = ${ROW}.getBoundingClientRect(); return [r.left - 8, r.top - 8, r.width + 16, r.height + 16]; })())`;
const CENTER = `(() => { const r = ${ROW}.getBoundingClientRect(); scrollTo({ top: Math.round(r.top + scrollY + r.height / 2 - innerHeight / 2), behavior: 'instant' }); return Math.round(scrollY); })()`;

// ---- engines: ev(js) -> value, shot(rect css) -> pixels {w,h,bpp,px}
let chrome, cdp, S, cfg, openTab, calTop = null;
if (ENGINE === 'chrome') {
  const L = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await L.launchChrome({ port: 0, profileDir: L.tempProfileDir(join(WT, 'out/sticky-walk/chrome'), 'avatar'), headless: true, windowSize: '430,775' });
  cdp = await L.CDP.connect(chrome.wsUrl);
  var gotoAndSettle = L.gotoAndSettle;
} else {
  S = await import(join(WT, 'tools/lib/sim.mjs')); cfg = S.readConfig();
  ({ openTab } = await import(join(WT, 'tools/lib/wip.mjs')));
}
function crop(P, x, y, w, h) { x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.min(P.w - x, Math.round(w)); h = Math.min(P.h - y, Math.round(h));
  const px = Buffer.alloc(w * h * 4); for (let r = 0; r < h; r++) P.px.copy(px, r * w * 4, ((y + r) * P.w + x) * 4, ((y + r) * P.w + x + w) * 4); return { w, h, bpp: 4, px }; }
async function openLoad(url, host) {
  if (ENGINE === 'chrome') {
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
    return { ev: async (js) => page.eval(js), shot: async (r, name = 'tmp') => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); const b = Buffer.from(data, 'base64'); writeFileSync(join(OUT, name + '.png'), b); return crop(pngPixels(b), r[0] * 3, r[1] * 3, r[2] * 3, r[3] * 3); }, close: () => page.close?.() };
  }
  process.env.FW_TAB_HOST = host;
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env } });
  const c = await openTab(host);
  for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
  // magenta calibration (as px-sim.mjs): the web view's top edge in the screenshot (Safari's status bar / toolbar above it)
  await c.evaluate(`(() => { const b = document.createElement('div'); b.id = '__avcal'; b.style.cssText = 'position:fixed;left:0;top:100px;width:100%;height:6px;background:#ff00ff;z-index:2147483647'; document.body.appendChild(b); return 1; })()`); await sleep(400);
  const cf = join(OUT, 'calibration.png'); S.simctl(['io', cfg.udid, 'screenshot', cf]);
  await c.evaluate(`(document.getElementById('__avcal').remove(), 1)`); await sleep(300);
  const CP = pngPixels(readFileSync(cf)); let top = -1;
  for (let y = 0; y < CP.h && top < 0; y++) { let m = 0; for (let x = 0; x < CP.w; x++) { const i = (y * CP.w + x) * CP.bpp; if (CP.px[i] > 230 && CP.px[i + 1] < 40 && CP.px[i + 2] > 230) m++; } if (m > CP.w * 0.9) top = y; }
  if (top < 0) throw new Error('calibration bar not found');
  top -= 300; calTop = top; // bar at css top 100: below the status bar, which Safari tints with the bar's colour (row 0 read as magenta, 2026-10-09)
  return { ev: async (js) => c.evaluate(js), shot: async (r, name = 'tmp') => { const f = join(OUT, name + '.png'); S.simctl(['io', cfg.udid, 'screenshot', f]); return crop(pngPixels(readFileSync(f)), r[0] * 3, top + r[1] * 3, r[2] * 3, r[3] * 3); }, close: () => c.close() };
}

const res = { tool: 'fixes/sticky-walk/gates/avatar-gate.mjs', engine: ENGINE, startedAt: new Date().toISOString(), loads: [], scores: [] };
const crops = {};
try {
  for (const [arm, d] of ARMS) {
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, build: d }; let pg = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (load.served.js !== HX[`${d}/${NODE}`] || load.served.css !== HX[`${d}/${CSS}`]) { load.void = 'served ' + JSON.stringify(load.served); console.log('VOID', arm, load.void); continue; }
      pg = await openLoad(url, `localhost:${s.port}`);
      load.mountKey = await pg.ev(KEY); // the row is far away at y 0: slots still show the mount state
      load.install = await pg.ev(INSTALL);
      await sleep(2500);
      load.scrollY = await pg.ev(CENTER);
      await sleep(8000);
      const A = JSON.parse(await pg.ev('JSON.stringify(window.__av.log)'));
      load.log = A;
      const starts = A.filter(([, k], i) => JSON.parse(k).s && (i === 0 || !JSON.parse(A[i - 1][1]).s)).map(([t]) => t);
      load.periods = starts.slice(1).map((t, i) => t - starts[i]);
      load.seq = A.map(([, k]) => { const o = JSON.parse(k); return (o.s ? 'S:' : 'R:') + o.i.join(','); });
      // pixels: hold, align to the mount state, then NCAP rest / mid crops
      await pg.ev('(window.__av.hold = true, 1)');
      const want = JSON.parse(load.mountKey).i.join(',');
      const waitQ = async () => { for (let i = 0; i < 60; i++) { if (await pg.ev('window.__av.q.length')) return true; await sleep(100); } return false; };
      let aligned = false;
      for (let n = 0; n < 40 && !aligned; n++) {
        if (!(await waitQ())) throw new Error('no helper timer queued');
        const k = JSON.parse(await pg.ev(KEY));
        if (!k.s && k.i.join(',') === want) { aligned = true; break; }
        await pg.ev('window.__av.step()');
      }
      load.aligned = aligned; if (!aligned) throw new Error('could not align to the mount state');
      const rect = JSON.parse(await pg.ev(RECT)); load.rect = rect; load.calTop = calTop;
      load.caps = [];
      for (let k = 0; k < NCAP; k++) {
        if (!(await waitQ())) throw new Error('no helper timer queued (rest ' + k + ')');
        await sleep(150);
        (crops['rest' + k] ||= {})[arm] = await pg.shot(rect, arm + '-rest' + k); const kr = await pg.ev(KEY);
        const ms = await pg.ev('window.__av.step()'); // the 800 ms helper: the slide starts
        await sleep(60); await pg.ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
        const np = await pg.ev('window.__av.pause(110)'); await sleep(120);
        (crops['mid' + k] ||= {})[arm] = await pg.shot(rect, arm + '-mid' + k); const km = await pg.ev(KEY);
        await pg.ev('window.__av.resume()');
        if (!(await waitQ())) throw new Error('no helper timer queued (mid ' + k + ')');
        const ms2 = await pg.ev('window.__av.step()'); // the 220 ms helper: the slide ends, next index
        load.caps.push({ k, rest: kr, mid: km, stepped: [ms, ms2], paused: np });
      }
      load.errors = [];
    } catch (e) { load.void = 'error: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | '); console.log(arm, 'error', load.void); }
    finally { try { pg && (await pg.close()); } catch {} p.kill(); res.loads.push(load); writeFileSync(join(OUT, 'avatar.json'), JSON.stringify(res, null, 1)); }
    console.log(`load ${arm}: install ${load.install} y ${load.scrollY} states ${load.log?.length} periods ${JSON.stringify(load.periods)} aligned ${load.aligned} caps ${load.caps?.length}${load.void ? ' VOID' : ''}`);
  }
} finally { if (chrome) { try { cdp.close(); } catch {} await chrome.close(); } }

// behaviour: the index sequence relative to the first state, and the periods
const L = Object.fromEntries(res.loads.filter((l) => !l.void).map((l) => [l.arm, l]));
const norm = (seq) => seq.map((x) => x.slice(0, 2)).join('');
for (const [x, y] of [['A', 'V'], ['A', 'A2'], ['V', 'V2'], ['A2', 'V2']]) {
  const a = L[x], b = L[y]; if (!a || !b) { console.log(`${x}~${y} missing`); continue; }
  const sameCaps = JSON.stringify(a.caps.map((c) => [c.rest, c.mid])) === JSON.stringify(b.caps.map((c) => [c.rest, c.mid]));
  console.log(`${x}~${y}`.padEnd(6), 'mountKey', a.mountKey === b.mountKey, 'pattern', norm(a.seq) === norm(b.seq) ? 'same' : `${norm(a.seq)} vs ${norm(b.seq)}`,
    'periods', JSON.stringify(a.periods), 'vs', JSON.stringify(b.periods), 'capKeys', sameCaps);
}
for (const [ck, C] of Object.entries(crops)) {
  if (['A', 'V', 'A2', 'V2'].some((a) => !C[a])) { console.log(ck, 'missing arm'); continue; }
  try {
    const dAV = delta(C.A, C.V), dAA = delta(C.A, C.A2), dVV = delta(C.V, C.V2), dA2V2 = delta(C.A2, C.V2), dAV2 = delta(C.A, C.V2), dA2V = delta(C.A2, C.V);
    let beyond = 0, cons = 0, max = 0, aaO = 0, vvO = 0;
    for (let p = 0; p < dAV.length; p++) { if (dAV[p] > max) max = dAV[p]; if (dAA[p] > 8) aaO++; if (dVV[p] > 8) vvO++;
      if (dAV[p] > 8 && dAA[p] <= 8) beyond++; if (Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]) > 8 && Math.max(dAA[p], dVV[p]) <= 8) cons++; }
    const n = dAV.length; const row = { crop: ck, px: n, AVbeyondAA: beyond, consistent: cons, consistentPct: +(100 * cons / n).toFixed(4), maxLevel: max, AAover8: aaO, VVover8: vvO };
    res.scores.push(row); console.log(`${ck.padEnd(6)} A~V beyond A/A ${beyond} px  consistent ${cons} px (${row.consistentPct} %)  max ${max}  A/A over8 ${aaO}  V/V over8 ${vvO}  (crop ${C.A.w}x${C.A.h})`);
  } catch (e) { console.log(ck, 'score error', e.message); }
}
// sanity: the crops must show the row moving (rest k ~ mid k, rest k ~ rest k+1 over 8 levels), else the crop missed it
res.motion = {};
for (const arm of ['A', 'V', 'A2', 'V2']) {
  const m = []; for (let k = 0; k < NCAP; k++) { const r0 = crops['rest' + k]?.[arm], m0 = crops['mid' + k]?.[arm], r1 = crops['rest' + (k + 1)]?.[arm];
    const over = (x, y) => (x && y ? delta(x, y).filter((v) => v > 8).length : null); m.push({ k, restMid: over(r0, m0), restNext: over(r0, r1) }); }
  res.motion[arm] = m; console.log(`motion ${arm.padEnd(2)} rest~mid ${m.map((x) => x.restMid).join(',')}  rest~nextRest ${m.map((x) => x.restNext).join(',')}`);
}
res.motionOk = Object.values(res.motion).every((m) => m.every((x) => x.restMid > 0) && m.slice(0, -1).every((x) => x.restNext > 0));
console.log('motionOk', res.motionOk);
res.endedAt = new Date().toISOString();
writeFileSync(join(OUT, 'avatar.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'avatar.json'));

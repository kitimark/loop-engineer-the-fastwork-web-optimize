#!/usr/bin/env node
// morph-scroll on WebKit (fw-sim, iPhone 15 Pro Max Simulator), fix-hero-exit-threaded. Functional session, no timing.
// Arms: B = ms (the proposal), A = msbasehook (base, morph held at m by __fwMorphSet at the end of the page), A2 = A again.
// B runs first; A and A2 hold the morph values B actually reached (WebKit may land on fractional scroll positions).
// Checks on B: the gate (html.fw-ms), #platform sticky at the visual bottom while the spacer scrolls in (dvh under
// Safari's toolbar), __rvPrepNow called (count), the morph value per scroll position, and where programmatic scrolls
// come to rest with scroll snap on (y0 + 0.3 L, y0 + 0.7 L). Frames: simctl screenshots, diffs below the status bar.
//   sh fixes/morph-scroll/simcheck.sh   (shared lane, weight simulator)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { openTab, sleep } from '../../tools/lib/wip.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const arms = arg('--arms', '').split(',').filter(Boolean).map((s) => { const [k, ...u] = s.split('='); return { k, url: u.join('=') }; });
const OUT = resolve(arg('--out', 'out/morph-scroll/sim')); mkdirSync(OUT, { recursive: true });
const MS = arg('--ms', '0,0.25,0.5,0.75,1,0.5').split(',').map(Number);
const UDID = process.env.FW_SIM_UDID || 'booted';
const TOPSKIP = Number(arg('--top-skip', '200')); // device px of the status bar (clock) left out of the diffs
const ev = async (c, e) => c.evaluate(e);
const FREEZE = `(() => { const top = setTimeout(() => {}, 0); for (let i = 1; i <= top + 50; i++) { clearTimeout(i); clearInterval(i); }
  let n = 0; for (const a of document.getAnimations()) { if (a.timeline !== document.timeline) continue;
    try { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 4000; } n++; } catch (e) {} } return n; })()`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav'), P = document.querySelector('.start-selling-platform'), E = document.querySelector('.fw-ms-end'), pn = document.querySelector('.start-selling-morph-panel');
  const de = document.documentElement, L = E ? E.offsetHeight : 0, y0 = de.scrollHeight - innerHeight - L, r = P.getBoundingClientRect();
  let pr = document.getElementById('__msprobe'); if (!pr) { pr = document.createElement('div'); pr.id = '__msprobe'; pr.style.cssText = 'position:fixed;top:0;left:-10px;width:1px;visibility:hidden;pointer-events:none'; document.body.append(pr); }
  const hv = (v) => { pr.style.height = v; return Math.round(pr.getBoundingClientRect().height * 100) / 100; };
  return { fwms: de.classList.contains('fw-ms'), y: Math.round(scrollY * 100) / 100, ih: innerHeight, vvh: visualViewport ? Math.round(visualViewport.height * 100) / 100 : null,
    dvh: hv('100dvh'), lvh: hv('100lvh'), svh: hv('100svh'), sh: de.scrollHeight, L, y0, p: L ? Math.round(((scrollY - y0) / L) * 10000) / 10000 : null,
    morph: h ? h.style.getPropertyValue('--morph') : null, inert: pn ? pn.inert : null, platPos: getComputedStyle(P).position, platTop: getComputedStyle(P).top,
    msh: P.style.getPropertyValue('--fw-ms-h'), hc: h ? [...h.classList].filter((c) => !c.startsWith('svelte-')).join(' ') : null, platBottom: Math.round(r.bottom * 100) / 100, platH: Math.round(r.height * 100) / 100,
    snap: getComputedStyle(de).scrollSnapType, prep: window.__msPrepCount ?? null, set: typeof window.__navMorphSet, hook: typeof window.__fwMorphSet,
    coarse: matchMedia('(hover: none) and (pointer: coarse)').matches, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, screen: [screen.width, screen.height] }; })())`;
// count __rvPrepNow calls (wrapped once the page defines it)
const WRAP = `(() => { if (window.__msPrepWrapped) return 'already'; const f = window.__rvPrepNow; if (typeof f !== 'function') return 'none';
  window.__msPrepCount = 0; window.__rvPrepNow = (...a) => { window.__msPrepCount++; return f(...a); }; window.__msPrepWrapped = 1; return 'wrapped'; })()`;
function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function cmp(fa, fb) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb)); if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: true };
  let n8 = 0, n64 = 0, n128 = 0, max = 0, box = [1e9, 1e9, -1, -1];
  for (let y = TOPSKIP; y < A.h; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * A.bpp; let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (d > 8) { n8++; if (d > 64) n64++; if (d > 128) n128++; if (d > max) max = d; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; } }
  return { pxOver8: n8, pxOver64: n64, pxOver128: n128, pct8: +((100 * n8) / (A.w * (A.h - TOPSKIP))).toFixed(3), max, box: n8 ? box : null };
}
const shot = (f) => { const s = spawnSync('xcrun', ['simctl', 'io', UDID, 'screenshot', f], { encoding: 'utf8' }); return s.status === 0 ? f : null; };
const res = { tool: 'fixes/morph-scroll/simcheck.mjs', at: new Date().toISOString(), ms: MS, arms: {}, diffs: {} };
let reached = null; // B's reached p per k
for (const arm of arms) {
  const R = { frames: [], checks: {} };
  res.arms[arm.k] = R;
  const o = spawnSync('node', ['tools/sim.mjs', 'open', arm.url], { encoding: 'utf8' });
  if (o.status !== 0) { R.error = 'open failed: ' + (o.stderr || o.stdout).split('\n').slice(-3).join(' '); console.log(arm.k, R.error); continue; }
  let c;
  try {
    c = await openTab((u) => String(u || '').includes(new URL(arm.url).host));
    for (let i = 0; i < 40; i++) { if ((await ev(c, 'document.readyState')) === 'complete') break; await sleep(500); }
    await sleep(6000);
    R.wrap = await ev(c, WRAP);
    R.checks.load = JSON.parse(await ev(c, STATE));
    console.log(`SIMMS ${arm.k} load wrap=${R.wrap} ${JSON.stringify(R.checks.load)}`);
    // walk down to the end in 300 px steps (lazy work, IntersectionObservers), snap off for B while walking
    await ev(c, `document.documentElement.style.scrollSnapType = 'none'; 'ok'`);
    const sh = JSON.parse(await ev(c, STATE)).sh;
    for (let y = 0; y <= sh; y += 300) { await ev(c, `window.scrollTo({ top: ${y}, behavior: 'instant' }); 'ok'`); await sleep(120); }
    await sleep(2500);
    R.checks.end = JSON.parse(await ev(c, STATE));
    console.log(`SIMMS ${arm.k} end ${JSON.stringify(R.checks.end)}`);
    const isB = R.checks.end.fwms;
    if (isB) {
      // sticky: #platform bottom vs the visual viewport while the spacer scrolls in
      const st = [];
      // scroll-step driver: down through the extra screen in 0.05 steps, back up in 0.1 steps
      const STEPS = [...Array.from({ length: 21 }, (_, i) => i / 20), ...Array.from({ length: 10 }, (_, i) => (9 - i) / 10)];
      for (const m of STEPS) {
        await ev(c, `(() => { const s = JSON.parse(${STATE}); window.scrollTo({ top: s.y0 + ${m} * s.L, behavior: 'instant' }); return 'ok'; })()`); await sleep(350);
        const s = JSON.parse(await ev(c, STATE)); st.push({ m, y: s.y, p: s.p, platBottom: s.platBottom, ih: s.ih, vvh: s.vvh, dvh: s.dvh, morph: s.morph, inert: s.inert, hc: s.hc });
      }
      R.checks.sticky = st; console.log(`SIMMS ${arm.k} sticky ${JSON.stringify(st)}`);
    }
    R.frozen = await ev(c, FREEZE); await sleep(500);
    const hits = [];
    for (let k = 0; k < MS.length; k++) {
      const m = isB ? MS[k] : (reached?.[k] ?? MS[k]);
      if (isB) {
        await ev(c, `(() => { const s = JSON.parse(${STATE}); window.scrollTo({ top: s.y0 + ${m} * s.L, behavior: 'instant' }); return 'ok'; })()`);
      } else {
        await ev(c, `window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); 'ok'`); await sleep(300);
        await ev(c, `(window.__fwMorphSet && window.__fwMorphSet(${m}), 'ok')`);
      }
      await sleep(1200);
      await ev(c, FREEZE); await sleep(300);
      const s = JSON.parse(await ev(c, STATE));
      if (isB) hits.push(s.p == null ? m : Math.min(1, Math.max(0, s.p)));
      const f = shot(join(OUT, `${arm.k}-${k}.png`));
      R.frames.push({ k, m, state: s, file: f });
      console.log(`SIMMS ${arm.k} k${k} m${m} ${JSON.stringify(s)}`);
    }
    if (isB) reached = hits;
    // the page before the end (y0 - 400, p 0): #platform on screen, not yet held (WebKit composites every sticky box)
    {
      await ev(c, `(() => { window.__fwMorphSet && window.__fwMorphSet(0); const de = document.documentElement, E = document.querySelector('.fw-ms-end'), L = E ? E.offsetHeight : 0; window.scrollTo({ top: de.scrollHeight - innerHeight - L - 400, behavior: 'instant' }); return 'ok'; })()`);
      await sleep(1200); await ev(c, FREEZE); await sleep(300);
      const s = JSON.parse(await ev(c, STATE)); const f = shot(join(OUT, `${arm.k}-pre.png`));
      R.frames.push({ k: 'pre', m: 0, state: s, file: f }); console.log(`SIMMS ${arm.k} pre ${JSON.stringify(s)}`);
    }
    if (isB) {
      // snap: programmatic scrolls with snap on
      const sn = [];
      await ev(c, `document.documentElement.style.scrollSnapType = ''; 'ok'`);
      for (const m of [0.1, 0.9, 0.45]) {
        await ev(c, `(() => { const s = JSON.parse(${STATE}); window.scrollTo({ top: s.y0 + ${m} * s.L, behavior: 'instant' }); return 'ok'; })()`); await sleep(1500);
        const s = JSON.parse(await ev(c, STATE)); sn.push({ asked: m, y: s.y, p: s.p, snap: s.snap });
      }
      for (const m of [0.1]) {
        await ev(c, `(() => { const s = JSON.parse(${STATE}); window.scrollTo({ top: s.y0 + ${m} * s.L, behavior: 'smooth' }); return 'ok'; })()`); await sleep(2000);
        const s = JSON.parse(await ev(c, STATE)); sn.push({ asked: m, smooth: true, y: s.y, p: s.p });
      }
      R.checks.snap = sn; console.log(`SIMMS ${arm.k} snap ${JSON.stringify(sn)}`);
      // after the snap checks: the morph closed again by scrolling back up (path check)
      for (const [kk, m] of [['post0', 0], ['post05', 0.5]]) {
        await ev(c, `(() => { const s = JSON.parse(${STATE}); window.scrollTo({ top: s.y0 + ${m} * s.L, behavior: 'instant' }); return 'ok'; })()`);
        await sleep(1200); await ev(c, FREEZE); await sleep(300);
        const s = JSON.parse(await ev(c, STATE)); const f = shot(join(OUT, `${arm.k}-${kk}.png`));
        R.frames.push({ k: kk, m, state: s, file: f }); console.log(`SIMMS ${arm.k} ${kk} m${m} ${JSON.stringify(s)}`);
      }
      await ev(c, `document.documentElement.style.scrollSnapType = 'none'; 'ok'`);
    }
    await ev(c, `window.scrollTo({ top: 0, behavior: 'instant' }); 'ok'`);
  } catch (e) { R.error = String((e && e.message) || e); console.log(arm.k, 'ERROR', R.error); }
  try { c && c.close(); } catch {}
}
const keys = arms.map((a) => a.k);
if (keys.includes('A')) for (const b of keys.filter((k) => k !== 'A')) {
  res.diffs[b] = MS.map((m, k) => { const fa = res.arms.A?.frames?.[k]?.file, fb = res.arms[b]?.frames?.[k]?.file; return fa && fb ? { k, ...cmp(fa, fb) } : { k, missing: true }; });
  for (const d of res.diffs[b]) console.log(`SIMDIFF A vs ${b} ${JSON.stringify(d)}`);
}
if (keys.includes('A2') && keys.includes('B')) {
  res.diffs['B~A2'] = MS.map((m, k) => { const fa = res.arms.A2?.frames?.[k]?.file, fb = res.arms.B?.frames?.[k]?.file; return fa && fb ? { k, ...cmp(fa, fb) } : { k, missing: true }; });
  for (const d of res.diffs['B~A2']) console.log(`SIMDIFF A2 vs B ${JSON.stringify(d)}`);
}
for (const X of ['B', 'A2']) { const fa = res.arms.A?.frames?.find((x) => x.k === 'pre')?.file, fb = res.arms[X]?.frames?.find((x) => x.k === 'pre')?.file;
  if (fa && fb) { const d = cmp(fa, fb); (res.diffs.pre ||= {})[X] = d; console.log(`SIMDIFF A-pre vs ${X}-pre ${JSON.stringify(d)}`); } }
for (const [kk, ka] of [['post0', 0], ['post05', MS.indexOf(0.5)]]) { const fb = res.arms.B?.frames?.find((x) => x.k === kk)?.file;
  for (const A of ['A', 'A2']) { const fa = res.arms[A]?.frames?.[ka]?.file; if (fa && fb) { const d = cmp(fa, fb); (res.diffs[`B-${kk}`] ||= {})[A] = d; console.log(`SIMDIFF ${A}-k${ka} vs B-${kk} ${JSON.stringify(d)}`); } } }
writeFileSync(join(OUT, 'simcheck.json'), JSON.stringify(res, null, 1));
console.log('->', join(OUT, 'simcheck.json'));

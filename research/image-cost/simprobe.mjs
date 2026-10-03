// image-cost Simulator probe (de-image-cost, T-042 point 3). Counts, sizes and Timeline records only: Simulator ms are
// Mac-CPU ms, indicative only, never a phone number (F-084). No timing A/B.
//
// Modes (each runs inside a functional Simulator session in the shared lane):
//   census                 base arm: walk the page top to bottom in 0.5-vh steps (instant scroll, 350 ms settle) and
//                          record every <img> seen: currentSrc, natural size, layout box, transform scale, object-fit,
//                          loading/decoding attributes, animations on it or its ancestors; plus CSS background images.
//   walk <arm,arm,...>     per arm: fresh page load, 6 s idle, then a rAF-paced scroll (STEP px per frame) from top to
//                          bottom with WebKit Timeline on (Page.disable -> Page.enable -> Timeline.start, F-047),
//                          console.timeStamp('y:<scrollY>') every 10 frames; Memory tracking (images category) alongside.
//   decode <arm,arm,...>   per arm: in-page img.decode() wall time for every image in DECODE_LIST (blob URL per rep, so
//                          each rep decodes afresh at natural size: BitmapImageSource::decode has no sizeForDrawing).
// Arms: base = the committed baseline; any other name = overlay dir out/image-cost/arms/<name>/ served over the baseline.
// Usage:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-image-cost -- \
//     node tools/sim.mjs session --functional --owner de-image-cost -- node research/image-cost/simprobe.mjs census
// Output: out/image-cost/sim/<mode>-<stamp>.json (gitignored)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const OUT = join(WT, 'out/image-cost/sim');
const MODE = process.argv[2] || 'census';
const ARMS = (process.argv[3] || 'base').split(',');
const STEP = Number(process.env.IC_STEP || 14);
const BASE = resolveTree('site-pretty');
const dirOf = (arm) => join(WT, 'out/image-cost/arms', arm);
mkdirSync(OUT, { recursive: true });

async function serve(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const ov = arm === 'base' ? [] : ['--overlay', dirOf(arm)];
  if (arm !== 'base' && !existsSync(dirOf(arm))) throw new Error('no overlay dir ' + dirOf(arm));
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null;
  for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(`${arm} server did not start`); }
  return { p, url: `http://localhost:${s.port}/`, port: s.port };
}
async function load(arm) {
  const sv = await serve(arm);
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', sv.url], { stdio: ['ignore', 'ignore', 'inherit'] });
  const c = await openTab(`localhost:${sv.port}`);
  const ev = (e) => c.evaluate(e);
  for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
  return { sv, c, ev };
}
// poll a window.* result (WebKit's Runtime.evaluate ignores awaitPromise, wip.mjs header)
async function poll(ev, key, tmoMs) {
  for (let t = 0; t < tmoMs; t += 250) { const v = await ev(key.startsWith('(') ? key : `window.${key} ?? null`); if (v != null) return v; await sleep(250); }
  throw new Error('timeout waiting for ' + key);
}

// ---------- census (in page) ----------
const CENSUS_INIT = `(() => { window.__ic = { imgs: new Map(), steps: 0 }; return 1; })()`;
const CENSUS_STEP = `(() => {
  const S = window.__ic, vh = innerHeight, vw = innerWidth, dpr = devicePixelRatio;
  const anims = new Map();
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (!t) continue;
    let props = []; try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))]; } catch {}
    const cur = anims.get(t) || new Set(); props.forEach((p) => cur.add(p)); anims.set(t, cur); }
  const all = document.querySelectorAll('img');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -0.25 * vh || r.top > 1.25 * vh || r.width === 0 || r.height === 0) { if (!S.imgs.has(el)) S.imgs.set(el, null); continue; }
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') { if (!S.imgs.has(el)) S.imgs.set(el, null); continue; }
    // accumulated transform scale and opacity along the ancestor chain; animated properties on the chain
    let sc = 1, op = 1, n = el, depth = 0; const animProps = new Set(); const moving = [];
    while (n && n.nodeType === 1 && depth < 40) {
      const c2 = n === el ? cs : getComputedStyle(n);
      if (c2.transform && c2.transform !== 'none') { try { const m = new DOMMatrix(c2.transform); sc *= Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)); } catch {} }
      if (c2.scale && c2.scale !== 'none') { const v = c2.scale.split(' ').map(Number).filter((x) => !isNaN(x)); if (v.length) sc *= Math.max(...v.map(Math.abs)); }
      op *= Number(c2.opacity);
      const a = anims.get(n); if (a) { a.forEach((p) => animProps.add(p)); moving.push((n.className && n.className.baseVal === undefined ? String(n.className).split(' ')[0] : n.tagName) || n.tagName); }
      n = n.parentElement; depth++;
    }
    const nw = el.naturalWidth, nh = el.naturalHeight, bw = el.offsetWidth, bh = el.offsetHeight;
    const fit = cs.objectFit;
    const inView = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && op > 0.01;
    let rec = S.imgs.get(el);
    if (!rec) { const sec = el.closest('section[id], [id]'); const par = el.parentElement;
      rec = { src: el.currentSrc || el.src, attrSrc: el.getAttribute('src'), srcset: el.getAttribute('srcset'), sizes: el.getAttribute('sizes'),
        source: (el.parentElement && el.parentElement.tagName === 'PICTURE') ? [...el.parentElement.querySelectorAll('source')].map((s) => ({ type: s.type, srcset: s.getAttribute('srcset') })) : null,
        loading: el.getAttribute('loading'), decoding: el.getAttribute('decoding'), fit, where: (sec ? '#' + sec.id : '') + ' > ' + (par ? String(par.className || par.tagName).split(' ')[0] : '') + (el.className ? ' > img.' + String(el.className).split(' ')[0] : ''),
        nat: [nw, nh], complete: el.complete, maxBox: [0, 0], maxScaledBox: [0, 0], maxScale: 1, minScale: 9, seenY: [], inViewY: [], animProps: [], movingAncestors: [], opacityMin: 1 };
      S.imgs.set(el, rec); }
    rec.src = el.currentSrc || el.src; rec.nat = [nw, nh]; rec.complete = el.complete;
    if (bw * bh > rec.maxBox[0] * rec.maxBox[1]) rec.maxBox = [bw, bh];
    if (bw * sc * bh * sc > rec.maxScaledBox[0] * rec.maxScaledBox[1]) rec.maxScaledBox = [Math.round(bw * sc * 10) / 10, Math.round(bh * sc * 10) / 10];
    rec.maxScale = Math.max(rec.maxScale, sc); rec.minScale = Math.min(rec.minScale, sc); rec.opacityMin = Math.min(rec.opacityMin, op);
    if (rec.seenY.length < 400) rec.seenY.push(Math.round(scrollY));
    if (inView && rec.inViewY.length < 400) rec.inViewY.push(Math.round(scrollY));
    for (const p of animProps) if (!rec.animProps.includes(p)) rec.animProps.push(p);
    for (const p of moving) if (!rec.movingAncestors.includes(p) && rec.movingAncestors.length < 6) rec.movingAncestors.push(p);
  }
  S.steps++; return { y: Math.round(scrollY), imgs: all.length };
})()`;
const CENSUS_END = `(() => { const S = window.__ic; const out = []; let unseen = 0;
  for (const [el, rec] of S.imgs) { if (!rec) { unseen++; out.push({ unseen: true, src: el.currentSrc || el.src || el.getAttribute('src'), nat: [el.naturalWidth, el.naturalHeight], complete: el.complete, loading: el.getAttribute('loading'),
      where: ((el.closest('[id]') || {}).id || '') + ' > ' + String((el.parentElement || {}).className || '').split(' ')[0] }); continue; } out.push(rec); }
  const bgs = []; const seen = new Set();
  for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['backgroundImage', 'maskImage', 'webkitMaskImage']) { const v = cs[prop];
    if (!v || v === 'none' || !v.includes('url(')) continue; const urls = [...v.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)].map((m) => m[1]);
    for (const u of urls) { const k = prop + u; if (seen.has(k)) continue; seen.add(k); bgs.push({ prop, url: u, box: [el.offsetWidth, el.offsetHeight], size: cs.backgroundSize, where: String(el.className || el.tagName).split(' ')[0] }); } } }
  const res = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img' || /\\.(png|jpe?g|webp|avif|svg|gif)(\\?|$)/.test(e.name)).map((e) => ({ name: e.name.replace(location.origin, ''), size: e.transferSize, decoded: e.decodedBodySize, start: Math.round(e.startTime) }));
  return { steps: S.steps, unseen, imgs: out, bgs, resources: res, docH: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth, dpr: devicePixelRatio, ua: navigator.userAgent }; })()`;

async function census() {
  const { sv, c, ev } = await load('base');
  try {
    await sleep(6000);
    await ev(CENSUS_INIT);
    const geo = await ev('({ h: document.documentElement.scrollHeight, vh: innerHeight })');
    const steps = [];
    for (let y = 0; y <= geo.h; y += Math.round(geo.vh / 2)) {
      await ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(350);
      steps.push(await ev(CENSUS_STEP));
      const h = await ev('document.documentElement.scrollHeight'); if (h > geo.h) geo.h = h;
    }
    const res = await ev(CENSUS_END);
    res.walk = steps;
    return res;
  } finally { c.close(); sv.p.kill(); }
}

// ---------- walk with Timeline ----------
const WALK_START = `(() => { const W = window.__icw = { done: false, frames: 0, t0: performance.now(), ys: [] };
  const max = document.documentElement.scrollHeight - innerHeight;
  const tick = () => { W.frames++; const y = Math.min(max, scrollY + ${STEP}); scrollTo({ top: y, behavior: 'instant' });
    if (W.frames % 10 === 0) { console.timeStamp('y:' + Math.round(scrollY)); W.ys.push([Math.round(performance.now() - W.t0), Math.round(scrollY)]); }
    if (y >= max || W.frames > 9000) { W.done = true; W.ms = Math.round(performance.now() - W.t0); return; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return max; })()`;
const IMG_RECTS = `(() => [...document.querySelectorAll('img')].map((el) => { const r = el.getBoundingClientRect(); return { src: (el.currentSrc || el.src || '').replace(location.origin, ''), top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), nat: [el.naturalWidth, el.naturalHeight] }; }).filter((x) => x.w > 0))()`;
const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
function analyzeWalk(records) {
  const out = { frames: 0, paint: { n: 0, ms: 0, max: 0, over2: 0, over4: 0, areaDev: 0 }, composite: { n: 0, ms: 0, max: 0 }, layout: { n: 0, ms: 0 }, style: { n: 0, ms: 0 }, frameMs: [], byY: [] };
  let y = 0, cur = null;
  const bucket = (yy) => { const k = Math.floor(yy / 1000); let b = out.byY[k]; if (!b) b = out.byY[k] = { y0: k * 1000, frames: 0, paintN: 0, paintMs: 0, paintMax: 0, compMs: 0, compMax: 0 }; return b; };
  const walk = (r, inFrame) => {
    if (r.type === 'TimeStamp') { const m = /^y:(\d+)/.exec(r.data?.message || ''); if (m) y = Number(m[1]); }
    if (r.type === 'RenderingFrame') { out.frames++; out.frameMs.push(Math.round(ms(r) * 10) / 10); bucket(y).frames++; }
    if (r.type === 'Paint') { const d = ms(r); const q = r.data?.clip; let area = 0;
      if (q && q.length >= 8) { const w = Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]); const h = Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]); area = w * h; }
      out.paint.n++; out.paint.ms += d; out.paint.max = Math.max(out.paint.max, d); if (d > 2) out.paint.over2++; if (d > 4) out.paint.over4++; out.paint.areaDev += area * 9;
      const b = bucket(y); b.paintN++; b.paintMs += d; b.paintMax = Math.max(b.paintMax, d); }
    if (r.type === 'Composite') { const d = ms(r); out.composite.n++; out.composite.ms += d; out.composite.max = Math.max(out.composite.max, d); const b = bucket(y); b.compMs += d; b.compMax = Math.max(b.compMax, d); }
    if (r.type === 'Layout') { out.layout.n++; out.layout.ms += ms(r); }
    if (r.type === 'RecalculateStyles') { out.style.n++; out.style.ms += ms(r); }
    for (const ch of r.children || []) walk(ch, inFrame || r.type === 'RenderingFrame');
  };
  for (const r of records) walk(r, false);
  const fm = out.frameMs.slice().sort((a, b) => a - b);
  out.frameP50 = fm[Math.floor(fm.length / 2)] ?? null; out.frameP95 = fm[Math.floor(fm.length * 0.95)] ?? null;
  for (const k of ['paint', 'composite', 'layout', 'style']) { out[k].ms = Math.round(out[k].ms); if (out[k].max != null) out[k].max = Math.round(out[k].max * 10) / 10; }
  out.paint.areaDevMpx = Math.round(out.paint.areaDev / 1e5) / 10; delete out.paint.areaDev;
  out.byY = out.byY.filter(Boolean).map((b) => ({ ...b, paintMs: Math.round(b.paintMs * 10) / 10, paintMax: Math.round(b.paintMax * 10) / 10, compMs: Math.round(b.compMs), compMax: Math.round(b.compMax * 10) / 10 }));
  delete out.frameMs;
  return out;
}
async function walkArm(arm) {
  const { sv, c, ev } = await load(arm);
  try {
    await sleep(6000);
    let recs = [], mem = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); if (m.method === 'Memory.trackingUpdate') mem.push(m.params.event); });
    await c.send('Page.disable'); await c.send('Page.enable');
    await c.send('Memory.enable').catch(() => {});
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    await c.send('Memory.startTracking').catch(() => {});
    await c.send('Timeline.start', { maxCallStackDepth: 2 });
    const max = await ev(WALK_START);
    const w = await poll(ev, '(window.__icw && window.__icw.done ? window.__icw : null)', 120000);
    await sleep(2000);
    await c.send('Timeline.stop');
    await c.send('Memory.stopTracking').catch(() => {});
    await c.send('Timeline.disable').catch(() => {});
    const rects = await ev(IMG_RECTS);
    const a = analyzeWalk(recs);
    const cats = (e) => Object.fromEntries((e.categories || []).map((x) => [x.type, x.size]));
    const imgsMB = mem.map((e) => (cats(e).images || 0) / 1048576);
    const memo = { samples: mem.length, imagesPeakMB: imgsMB.length ? Math.round(Math.max(...imgsMB) * 10) / 10 : null, imagesEndMB: imgsMB.length ? Math.round(imgsMB[imgsMB.length - 1] * 10) / 10 : null,
      imagesMeanMB: imgsMB.length ? Math.round(imgsMB.reduce((s, x) => s + x, 0) / imgsMB.length * 10) / 10 : null, totalPeakMB: mem.length ? Math.round(Math.max(...mem.map((e) => (e.categories || []).reduce((s, x) => s + x.size, 0))) / 1048576 * 10) / 10 : null };
    const vis = await ev('({ vis: document.visibilityState, rafFrames: window.__icw.frames, ms: window.__icw.ms })');
    console.log(`${arm} walk: max ${max} frames(rAF) ${vis.rafFrames} in ${vis.ms} ms | TL frames ${a.frames} p50 ${a.frameP50} p95 ${a.frameP95} | paint n ${a.paint.n} ms ${a.paint.ms} max ${a.paint.max} >2 ${a.paint.over2} >4 ${a.paint.over4} area ${a.paint.areaDevMpx} Mpx | comp ms ${a.composite.ms} max ${a.composite.max} | images MB peak ${memo.imagesPeakMB} mean ${memo.imagesMeanMB} end ${memo.imagesEndMB}`);
    return { arm, max, raf: vis, records: recs.length, ...a, memory: memo, imgRects: rects.length };
  } finally { c.close(); sv.p.kill(); }
}

// ---------- decode bench ----------
const DECODE_LIST = process.env.IC_LIST ? JSON.parse(readFileSync(process.env.IC_LIST, 'utf8')) : [];
const REPS = Number(process.env.IC_REPS || 5);
const DECODE_JS = (list, reps) => `(() => { window.__icd = null; (async () => { const out = [];
  for (const u of ${JSON.stringify(list)}) { const b = await (await fetch(u, { cache: 'no-store' })).blob(); const ts = []; let nat = null;
    for (let i = 0; i < ${reps}; i++) { const url = URL.createObjectURL(b); const im = new Image(); const t0 = performance.now(); im.src = url;
      try { await im.decode(); } catch (e) { ts.push(-1); continue; } ts.push(Math.round((performance.now() - t0) * 100) / 100); nat = [im.naturalWidth, im.naturalHeight]; URL.revokeObjectURL(url); await new Promise((r) => setTimeout(r, 30)); }
    out.push({ u, bytes: b.size, nat, ts }); }
  window.__icd = out; })(); return 1; })()`;
async function decodeArm(arm) {
  const { sv, c, ev } = await load(arm);
  try {
    await sleep(4000);
    await ev(DECODE_JS(DECODE_LIST, REPS));
    const r = await poll(ev, '__icd', 200000);
    for (const x of r) { const s = x.ts.filter((t) => t >= 0).sort((a, b) => a - b); x.median = s[Math.floor(s.length / 2)]; }
    console.log(`${arm} decode: ${r.length} images, sum of medians ${Math.round(r.reduce((s, x) => s + (x.median || 0), 0))} ms`);
    return { arm, images: r };
  } finally { c.close(); sv.p.kill(); }
}

// ---------- idle at the top (hero rotator) with Timeline ----------
const IDLE_S = Number(process.env.IC_IDLE_S || 20);
const MO_START = `(() => { const S = window.__icm = { n: 0 }; S.mo = new MutationObserver((ms) => { for (const m of ms) {
    if (m.type === 'attributes' && m.target.tagName === 'IMG') { S.n++; console.timeStamp('img:' + (m.target.getAttribute('src') || '')); }
    if (m.type === 'childList') for (const a of m.addedNodes) if (a.nodeType === 1) for (const im of (a.tagName === 'IMG' ? [a] : a.querySelectorAll('img'))) { S.n++; console.timeStamp('img+:' + (im.getAttribute('src') || '')); } } });
  S.mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['src', 'srcset'], childList: true }); return 1; })()`;
function paintsAfterMarks(records, prefix, winMs) {
  // flat list of Paint records and TimeStamp marks (seconds), then per mark the Paint records that start within winMs
  const flat = [];
  const walk = (r) => { flat.push(r); for (const ch of r.children || []) walk(ch); };
  records.forEach(walk);
  const marks = flat.filter((r) => r.type === 'TimeStamp' && (r.data?.message || '').startsWith(prefix));
  const paints = flat.filter((r) => r.type === 'Paint');
  return marks.map((m) => { const t = m.startTime; const ps = paints.filter((p) => p.startTime >= t && p.startTime < t + winMs / 1000);
    return { mark: m.data.message, at: Math.round(t * 1000), paints: ps.length, ms: Math.round(ps.reduce((s, p) => s + ms(p), 0) * 10) / 10, max: Math.round(Math.max(0, ...ps.map(ms)) * 10) / 10 }; });
}
async function idleArm(arm) {
  const { sv, c, ev } = await load(arm);
  try {
    await sleep(4000);
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await ev(MO_START);
    await c.send('Page.disable'); await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    await c.send('Timeline.start', { maxCallStackDepth: 2 });
    await sleep(IDLE_S * 1000);
    await c.send('Timeline.stop');
    await c.send('Timeline.disable').catch(() => {});
    const a = analyzeWalk(recs);
    const swaps = paintsAfterMarks(recs, 'img', 120);
    const n = await ev('window.__icm.n');
    console.log(`${arm} idle ${IDLE_S}s: TL frames ${a.frames} p50 ${a.frameP50} p95 ${a.frameP95} | paint n ${a.paint.n} ms ${a.paint.ms} max ${a.paint.max} >2 ${a.paint.over2} >4 ${a.paint.over4} | comp ms ${a.composite.ms} max ${a.composite.max} | img changes ${n}; paint ms in 120 ms after a change: ${swaps.map((s) => s.ms).join(',')}`);
    return { arm, idleS: IDLE_S, records: recs.length, ...a, imgChanges: n, swaps };
  } finally { c.close(); sv.p.kill(); }
}

// ---------- paint-decode probe: the main-thread cost of first painting a new, visible image ----------
// A fixed container (its own layer, painted once first) at the image's displayed CSS size; per URL: load a fresh copy
// (?r= so no decoded frame is shared), mark, append (visible, not the layer's first paint -> WebKit decodes synchronously at
// natural size: RenderBoxModelObject::decodingModeForImageDraw), wait, mark, remove; then a control: re-append the same,
// now decoded, image. Paint records that start in each window are summed.
const PD_LIST = process.env.IC_PD ? JSON.parse(readFileSync(process.env.IC_PD, 'utf8')) : [];
const PD_JS = (list) => `(() => { window.__pd = null; (async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(() => r())); const wait = (t) => new Promise((r) => setTimeout(r, t));
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;top:120px;left:20px;z-index:2147483647;background:#fff;overflow:hidden;will-change:transform;width:200px;height:200px';
  document.body.appendChild(box); await wait(600);
  const out = [];
  for (const it of ${JSON.stringify(list)}) {
    box.style.width = it.box[0] + 'px'; box.style.height = it.box[1] + 'px'; await raf(); await raf(); await wait(150);
    const im = new Image(); im.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover'; im.src = it.u + '?r=' + Math.random().toString(36).slice(2);
    await new Promise((r) => { im.onload = r; im.onerror = r; }); await wait(250);
    console.timeStamp('pd:' + it.u); box.appendChild(im); await raf(); await raf(); await raf(); await wait(150); console.timeStamp('pdend:' + it.u);
    box.removeChild(im); await raf(); await raf(); await wait(150);
    console.timeStamp('pdc:' + it.u); box.appendChild(im); await raf(); await raf(); await raf(); await wait(150); console.timeStamp('pdcend:' + it.u);
    box.removeChild(im); await raf(); await wait(100);
    out.push({ u: it.u, nat: [im.naturalWidth, im.naturalHeight] });
  }
  box.remove(); window.__pd = out; })(); return 1; })()`;
function pdWindows(records) {
  const flat = []; const walk = (r) => { flat.push(r); for (const ch of r.children || []) walk(ch); }; records.forEach(walk);
  const marks = flat.filter((r) => r.type === 'TimeStamp').map((r) => ({ m: r.data?.message || '', t: r.startTime }));
  const paints = flat.filter((r) => r.type === 'Paint');
  const win = (a, b) => { const ps = paints.filter((p) => p.startTime >= a && p.startTime < b); return { n: ps.length, ms: Math.round(ps.reduce((s, p) => s + ms(p), 0) * 100) / 100, max: Math.round(Math.max(0, ...ps.map(ms)) * 100) / 100 }; };
  const res = {};
  for (const k of marks) {
    let mm;
    if ((mm = /^pd:(.*)$/.exec(k.m))) { const e = marks.find((x) => x.m === 'pdend:' + mm[1] && x.t > k.t); if (e) (res[mm[1]] ||= {}).fresh = win(k.t, e.t); }
    if ((mm = /^pdc:(.*)$/.exec(k.m))) { const e = marks.find((x) => x.m === 'pdcend:' + mm[1] && x.t > k.t); if (e) (res[mm[1]] ||= {}).decoded = win(k.t, e.t); }
  }
  return res;
}
async function pdArm(arm) {
  const { sv, c, ev } = await load(arm);
  try {
    await sleep(4000);
    // a quiet spot: the end of the page minus one screen is past the hero's orbit; record where we are
    await ev(`(scrollTo({ top: Math.round(document.documentElement.scrollHeight * 0.45), behavior: 'instant' }), 0)`); await sleep(1500);
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.disable'); await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    await c.send('Timeline.start', { maxCallStackDepth: 2 });
    await ev(PD_JS(PD_LIST));
    const nat = await poll(ev, '__pd', 200000);
    await sleep(300);
    await c.send('Timeline.stop');
    await c.send('Timeline.disable').catch(() => {});
    const w = pdWindows(recs);
    const rows = nat.map((x) => ({ ...x, ...(w[x.u] || {}) }));
    for (const r of rows) console.log(`${arm} ${r.u} nat ${r.nat.join('x')} fresh n ${r.fresh?.n} ms ${r.fresh?.ms} max ${r.fresh?.max} | decoded n ${r.decoded?.n} ms ${r.decoded?.ms} max ${r.decoded?.max}`);
    return { arm, y: await ev('Math.round(scrollY)'), rows };
  } finally { c.close(); sv.p.kill(); }
}

// ---------- pixel impact in WebKit: draw the original and the capped copy at the shown device size, compare ----------
// Arm `both`: the overlay holds the capped copies under /__cap2/<path>, so both are same-origin (untainted canvas).
// Per image: canvas of the shown box x DPR (device px), object-fit cover crop (centred), drawImage with WebKit's default
// smoothing at imageSmoothingQuality 'low' and 'high' (which one matches the page's own <img> paint is UNRESOLVED);
// original drawn twice for an A/A; counts of channel diffs > 8 and the largest diff.
const PIX_JS = (list) => `(() => { window.__px = null; (async () => { const out = []; const dpr = devicePixelRatio;
  const load = (u) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = u; });
  const draw = (im, w, h, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = q;
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight); const sw = w / s, sh = h / s; x.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
  const cmp = (a, b) => { let max = 0, over8 = 0, over64 = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > max) max = d; if (d > 8) over8++; if (d > 64) over64++; } return { max, over8, over64, px: a.length / 4 }; };
  for (const it of ${JSON.stringify(list)}) { const w = Math.round(it.box[0] * dpr), h = Math.round(it.box[1] * dpr);
    const o = await load(it.u), c = await load('/__cap2' + it.u); if (!o || !c) { out.push({ u: it.u, err: !o ? 'orig' : 'cap' }); continue; }
    const row = { u: it.u, dev: [w, h], nat: [o.naturalWidth, o.naturalHeight], cap: [c.naturalWidth, c.naturalHeight] };
    for (const q of ['low', 'high']) { const A = draw(o, w, h, q), A2 = draw(o, w, h, q), B = draw(c, w, h, q); row[q] = { aa: cmp(A, A2), ab: cmp(A, B) }; }
    row.aa = row.high.aa; row.ab = row.high.ab; out.push(row); }
  window.__px = out; })(); return 1; })()`;
async function pixArm(arm) {
  const { sv, c, ev } = await load(arm);
  try { await sleep(3000); await ev(PIX_JS(PD_LIST)); const r = await poll(ev, '__px', 200000);
    for (const x of r) console.log(`${x.u} dev ${x.dev} aa max ${x.aa?.max} | ab max ${x.ab?.max} >8 ${x.ab?.over8} (${x.ab ? (100 * x.ab.over8 / x.ab.px).toFixed(1) : '-'} %) >64 ${x.ab?.over64}`);
    return { arm, rows: r }; } finally { c.close(); sv.p.kill(); }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const res = { tool: 'image-cost simprobe', mode: MODE, note: 'Simulator: counts, sizes and attribution; ms are Mac-CPU ms, indicative only (F-084)', startedAt: new Date().toISOString(), step: STEP };
if (MODE === 'census') res.census = await census();
else if (MODE === 'walk') { res.arms = []; for (const a of ARMS) res.arms.push(await walkArm(a)); }
else if (MODE === 'decode') { res.arms = []; for (const a of ARMS) res.arms.push(await decodeArm(a)); }
else if (MODE === 'idle') { res.arms = []; for (const a of ARMS) res.arms.push(await idleArm(a)); }
else if (MODE === 'pd') { res.arms = []; for (const a of ARMS) res.arms.push(await pdArm(a)); }
else if (MODE === 'mix') { // IC_MIX="idle:base,idle:cap2,walk:base,..." runs the listed (mode, arm) pairs in order
  res.runs = []; const fn = { idle: idleArm, walk: walkArm, pd: pdArm, decode: decodeArm, pix: pixArm };
  for (const it of (process.env.IC_MIX || '').split(',').filter(Boolean)) { const [m, a] = it.split(':'); res.runs.push({ mode: m, ...(await fn[m](a)) }); } }
else throw new Error('mode?');
const f = join(OUT, `${MODE}-${stamp}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('wrote', f);

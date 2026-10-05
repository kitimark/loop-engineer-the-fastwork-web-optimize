// end-bg (fix-end-bg, user T-193 #10/#12): which background images, gradients, masks, blend and blur layers paint in the
// last screen of the page (v9-final + morph-scroll 7d), and what a toolbar step (innerHeight 775 <-> 815) repaints there.
// Chrome headless, 430 x H DPR 3 mobile + touch, no CPU throttle. COUNTS AND AREAS ONLY: no time is judged.
//   --mode inv     inventory at H 775 and 815, positions pre (endStart - 400), m0, mhalf (a touch held: no settle), m1
//   --mode census  per position (m0, mhalf, m1): cycles of [control window, step 775->815, control, step 815->775], each
//                  window W ms; per window: trace Paint events (clip area, owner node), RasterTask, image decodes,
//                  Layout / UpdateLayoutTree / PrePaint counts, and LayerTree paintCount deltas per layer (w x h).
// Arms: --arms C[,name=css-file,...] : name=file injects that CSS (<style id="eb-arm"> at the end of <head>) after load.
// Run (shared lane, probe weight):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-bg -- \
//     node fixes/end-bg/endbg-chrome.mjs --mode inv
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
const MODE = arg('--mode', 'inv');
const HEIGHTS = arg('--heights', '775,815').split(',').map(Number);
const W = Number(arg('--window', '700'));
const CYCLES = Number(arg('--cycles', '3'));
const POS = arg('--pos', MODE === 'inv' ? 'pre,m0,mhalf,m1' : 'm0,mhalf,m1').split(',');
const ARMS = arg('--arms', 'C').split(',').map((a) => { const [name, css] = a.split('='); return { name, css: css ? readFileSync(resolve(WT, css), 'utf8') : null, cssFile: css || null }; });
const OVERLAY = resolve(WT, arg('--overlay', 'fixes/end-bg/overlay'));
const BASE = join(mirrorHome(), 'site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-bg'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame'].join(',');

async function serve() {
  const st = join(OUT, `serve-${tag}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', OVERLAY, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}

const metricsFor = (h) => ({ width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });

// page-side helpers (installed once per load)
const HELPERS = `(() => {
  const VU = /(-?[\\d.]+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax|dvb|svb|lvb|vb)\\b/;
  const desc = (el) => { if (!el || el.nodeType !== 1) return String(el); let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id;
    const c = [...el.classList].filter((x) => !/^svelte-/.test(x)).slice(0, 3); if (c.length) s += '.' + c.join('.'); return s; };
  const path = (el) => { const out = []; for (let e = el; e && e !== document.body && out.length < 4; e = e.parentElement) out.unshift(desc(e)); return out.join(' > '); };
  const region = (el) => el.closest('header.start-selling-top-nav') ? 'nav-header' : el.closest('.start-selling-platform') ? 'platform' : el.closest('footer') ? 'footer' : el.closest('.fw-ms-end') ? 'runway' : 'other';
  // style rules matching el (or its pseudo) that use viewport units or % heights
  const rulesFor = (el, pseudo) => { const hits = [];
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
      const walk = (rs, media) => { for (const r of rs) {
        if (r.cssRules && !r.selectorText) { const m = r.media ? r.media.mediaText : (r.conditionText || ''); if (r.media && !matchMedia(r.media.mediaText).matches) continue; walk(r.cssRules, m); continue; }
        if (!r.selectorText || !r.style) continue;
        for (const sel of r.selectorText.split(',')) { const s = sel.trim(); const isP = /::?(before|after)\\s*$/.test(s);
          if (!!pseudo !== isP) continue; if (pseudo && !s.endsWith(pseudo) && !s.endsWith(pseudo.slice(1))) continue;
          const base = isP ? s.replace(/::?(before|after)\\s*$/, '') || '*' : s; let ok = false; try { ok = el.matches(base); } catch {}
          if (!ok) continue;
          const t = r.style.cssText; const props = [];
          for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; const v = r.style.getPropertyValue(p);
            if (VU.test(v) || (/^(height|min-height|max-height|top|bottom|inset|background-size|background-position|mask-size)/.test(p) && /%/.test(v)) || /^background|^mask|^filter|^backdrop|^mix-blend/.test(p)) props.push(p + ': ' + v.slice(0, 140)); }
          if (props.length) hits.push({ sel: s.slice(0, 160), media: media || '', props });
          break; } } };
      walk(rules, ''); }
    return hits; };
  const vis = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const interesting = (cs) => (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')
    || cs.filter !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') || cs.mixBlendMode !== 'normal';
  window.__ebInv = () => { const items = [];
    for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (!vis(r)) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const media = /^(IMG|VIDEO|CANVAS)$/.test(el.tagName) || (el.tagName === 'svg' && r.width * r.height >= 10000);
      const big = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && r.width * r.height >= 0.25 * innerWidth * innerHeight;
      for (const pseudo of [null, '::before', '::after']) { const c = pseudo ? getComputedStyle(el, pseudo) : cs;
        if (pseudo && (c.content === 'none' || c.content === 'normal' || c.display === 'none')) continue;
        if (!(interesting(c) || (!pseudo && (media || big)))) continue;
        const pr = pseudo ? { w: parseFloat(c.width) || r.width, h: parseFloat(c.height) || r.height } : { w: r.width, h: r.height };
        items.push({ key: path(el) + (pseudo || ''), region: region(el), tag: el.tagName, pseudo,
          rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(pr.w * 10) / 10, h: Math.round(pr.h * 10) / 10 },
          visArea: Math.round(Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))),
          bgImage: c.backgroundImage === 'none' ? null : c.backgroundImage.slice(0, 400), bgSize: c.backgroundSize, bgPos: c.backgroundPosition, bgRepeat: c.backgroundRepeat,
          bgAttach: c.backgroundAttachment, bgColor: c.backgroundColor, mask: (c.maskImage && c.maskImage !== 'none') ? c.maskImage.slice(0, 200) : (c.webkitMaskImage && c.webkitMaskImage !== 'none' ? c.webkitMaskImage.slice(0, 200) : null),
          maskSize: c.maskSize || c.webkitMaskSize, filter: c.filter, backdrop: c.backdropFilter || c.webkitBackdropFilter, blend: c.mixBlendMode, opacity: c.opacity,
          position: c.position, transform: c.transform === 'none' ? null : c.transform.slice(0, 80), willChange: c.willChange, zIndex: c.zIndex, isolation: c.isolation,
          height: c.height, minHeight: c.minHeight,
          img: el.tagName === 'IMG' ? { src: el.currentSrc || el.src, nw: el.naturalWidth, nh: el.naturalHeight, objectFit: c.objectFit, loading: el.loading, decoding: el.decoding, sizes: el.sizes } : null,
          rules: rulesFor(el, pseudo) }); } }
    const end = document.querySelector('.fw-ms-end'); const t = end ? end.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
    return { y: scrollY, ih: innerHeight, vvh: visualViewport && visualViewport.height, t, max, m: t ? +((scrollY - (max - t)) / t).toFixed(4) : null, fwms: document.documentElement.classList.contains('fw-ms'), items }; };
  window.__ebGeo = () => { const end = document.querySelector('.fw-ms-end'); const t = end ? end.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
    const pl = document.querySelector('.start-selling-platform'); const pr = pl && pl.getBoundingClientRect(); const hd = document.querySelector('header.start-selling-top-nav'); const hr = hd && hd.getBoundingClientRect();
    return { y: scrollY, ih: innerHeight, t, max, sh: document.documentElement.scrollHeight, m: t ? +((scrollY - (max - t)) / t).toFixed(4) : null,
      platform: pr && { top: Math.round(pr.top * 10) / 10, h: Math.round(pr.height) }, header: hr && { top: Math.round(hr.top), h: Math.round(hr.height), w: Math.round(hr.width), cls: hd.className.replace(/svelte-\\w+/g, '').trim() } }; };
  window.__ebUrls = () => { const urls = new Set();
    for (const el of document.querySelectorAll('.start-selling-platform *, header.start-selling-top-nav *, footer *')) for (const p of [null, '::before', '::after']) { const bi = getComputedStyle(el, p).backgroundImage; if (bi && bi !== 'none') for (const m of bi.matchAll(/url\\("?([^")]+)"?\\)/g)) urls.add(m[1]); if (!p && el.tagName === 'IMG' && el.currentSrc) urls.add(el.currentSrc); }
    return [...urls]; };
  return 1; })()`;

// position: y for a target m (endStart = max - t)
const POSY = { pre: (g) => g.max - g.t - 400, m0: (g) => g.max - g.t, mhalf: (g) => g.max - g.t / 2, m1: (g) => g.max };

async function touch(page, type) {
  await page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y: 400, id: 1 }] });
}

async function goPos(page, pos) {
  const g = await page.eval('__ebGeo()');
  const y = Math.round(POSY[pos](g));
  if (pos === 'mhalf') await touch(page, 'touchStart'); // a held finger: __msTouch blocks the settle
  await page.eval(`new Promise((res) => { window.scrollTo({ top: ${y}, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(() => res(1))); })`);
  if (pos !== 'mhalf') await sleep(1500); // let any settle and the morph spring finish
  else await sleep(400);
  return page.eval('__ebGeo()');
}

async function loadArm(cdp, srv, arm, h) {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', metricsFor(h));
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  const served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
  if (arm.css) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'eb-arm'; s.textContent = ${JSON.stringify(arm.css)}; document.head.appendChild(s); return 1; })()`);
  await page.eval(HELPERS);
  // walk the page once (lazy images, deferred sections), then to the end
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
  return { page, served };
}

const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };

async function census(page, pos) {
  await page.send('DOM.getDocument', { depth: 0 });
  await page.send('LayerTree.enable');
  let layers = new Map();
  const offL = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) { layers = new Map(m.params.layers.map((l) => [l.layerId, l])); } });
  const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
  const g0 = await goPos(page, pos);
  await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
  await sleep(300);
  const windows = [];
  const snap = () => new Map([...layers].map(([id, l]) => [id, { pc: l.paintCount || 0, w: l.width, h: l.height, node: l.backendNodeId }]));
  let cur = HEIGHTS[0];
  for (let c = 0; c < CYCLES; c++) {
    for (const kind of ['control', 'step', 'control', 'step']) {
      const before = snap();
      const label = `${kind}${kind === 'step' ? `:${cur}->${cur === HEIGHTS[0] ? HEIGHTS[1] : HEIGHTS[0]}` : ''}`;
      await page.eval(`(console.timeStamp('eb:${c}:${label}'), 1)`);
      const gB = await page.eval('__ebGeo()');
      if (kind === 'step') { cur = cur === HEIGHTS[0] ? HEIGHTS[1] : HEIGHTS[0]; await page.send('Emulation.setDeviceMetricsOverride', metricsFor(cur)); }
      await sleep(W);
      const gA = await page.eval('__ebGeo()');
      const after = snap();
      const lay = [];
      for (const [id, a] of after) { const b = before.get(id); const d = a.pc - (b ? b.pc : 0); if (d > 0) lay.push({ id, d, w: a.w, h: a.h, node: a.node, isNew: !b }); }
      windows.push({ c, kind, label, gB, gA, layers: lay });
    }
  }
  await page.eval(`(console.timeStamp('eb:end'), 1)`);
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  await page.send('Tracing.end'); await done; offT(); offL();
  if (pos === 'mhalf') await touch(page, 'touchEnd');
  // name layers' nodes
  const names = new Map();
  for (const w of windows) for (const l of w.layers) if (l.node && !names.has(l.node)) {
    try { const { node } = await page.send('DOM.describeNode', { backendNodeId: l.node }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
      names.set(l.node, `${node.localName || node.nodeName}${o.id ? '#' + o.id : ''}${o.class ? '.' + o.class.split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''}${node.pseudoType ? '::' + node.pseudoType : ''}`); } catch { names.set(l.node, '?'); } }
  // split trace by TimeStamp marks
  const marks = ev.filter((e) => e.name === 'TimeStamp' && /^eb:/.test(e.args?.data?.message || '')).map((e) => ({ ts: e.ts, msg: e.args.data.message })).sort((a, b) => a.ts - b.ts);
  const paintNodes = new Set();
  for (let i = 0; i < windows.length; i++) {
    const a = marks[i]?.ts, b = marks[i + 1]?.ts; const w = windows[i];
    const inW = ev.filter((e) => e.ts >= a && e.ts < b);
    const paints = inW.filter((e) => e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B'));
    w.paint = { n: paints.length, area: 0, byNode: {} };
    for (const p of paints) { const d = p.args?.data || {}; const bx = d.clip ? box(d.clip) : null; const ar = bx ? bx.w * bx.h : 0; w.paint.area += ar; const k = d.nodeId || 0; paintNodes.add(k);
      const e = (w.paint.byNode[k] ||= { n: 0, area: 0, maxW: 0, maxH: 0 }); e.n++; e.area += ar; if (bx) { e.maxW = Math.max(e.maxW, Math.round(bx.w)); e.maxH = Math.max(e.maxH, Math.round(bx.h)); } }
    const cnt = (re) => inW.filter((e) => re.test(e.name) && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n')).length;
    w.counts = { raster: cnt(/^RasterTask$/), decode: cnt(/^(Decode Image|ImageDecodeTask|Decode LazyPixelRef)$/), layout: cnt(/^Layout$/), style: cnt(/^UpdateLayoutTree$/), prePaint: cnt(/^PrePaint$/), layerize: cnt(/^Layerize$/), commit: cnt(/^Commit$/),
      frames: cnt(/^BeginMainThreadFrame$/), drawFrame: cnt(/^DrawFrame$/), scroll: inW.filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'scroll').length, raf: cnt(/^FireAnimationFrame$/) };
    const decodes = inW.filter((e) => /^(Decode Image|ImageDecodeTask)$/.test(e.name)); w.decodeUrls = [...new Set(decodes.map((e) => e.args?.imageUrl || e.args?.data?.url || e.args?.data?.imageUrl || '').filter(Boolean))].slice(0, 10);
    w.layers = w.layers.map((l) => ({ ...l, name: names.get(l.node) || (l.node ? '?' : '(no node)'), area: Math.round(l.w * l.h) }));
  }
  // name paint-owner nodes (Paint's nodeId is a DOMNodeId = backendNodeId)
  const pn = {};
  for (const k of paintNodes) { if (!k) { pn[k] = '(none)'; continue; }
    try { const { node } = await page.send('DOM.describeNode', { backendNodeId: Number(k) }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
      pn[k] = `${node.localName || node.nodeName}${o.id ? '#' + o.id : ''}${o.class ? '.' + o.class.split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''}`; } catch { pn[k] = '?'; } }
  await page.send('LayerTree.disable').catch(() => {});
  return { pos, g0, windows, paintNodeNames: pn, marks: marks.length };
}

const srv = await serve();
const profileDir = tempProfileDir(join(OUT, 'chrome'), 'eb');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-bg/endbg-chrome.mjs', mode: MODE, browser: chrome.browser, heights: HEIGHTS, window: W, cycles: CYCLES, overlay: OVERLAY, arms: ARMS.map((a) => ({ name: a.name, cssFile: a.cssFile, cssSha: a.css ? sha(Buffer.from(a.css)) : null })), runs: [] };
try {
  for (const arm of ARMS) {
    if (MODE === 'fair') {
      // fairness gate for an ablation arm: same boxes (every element's rounded rect at 3 positions, whole page) and the
      // same script and layout work over a fixed pass (m0 -> m1 -> m0 by 20 rAF scrollTo steps each, touch held, then
      // a 2 s rest): trace counts of rAF callbacks, timers, observer/event callbacks, style, layout; listener and node counts.
      const { page, served } = await loadArm(cdp, srv, arm, HEIGHTS[0]);
      const R = { arm: arm.name, served, boxes: {}, work: null };
      try {
        await page.send('Performance.enable');
        for (const pos of ['pre', 'm0', 'm1']) { await goPos(page, pos);
          R.boxes[pos] = await page.eval(`(() => { const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); out.push([Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)].join(',')); } const s = out.join(';'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return { n: out.length, hash: h, list: out }; })()`); }
        await goPos(page, 'm0');
        const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
        const m0 = Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
        await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
        await touch(page, 'touchStart');
        await page.eval(`new Promise((res) => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; const y0 = max - t; let k = 0;
          const step = () => { k++; const p = k <= 20 ? k / 20 : (40 - k) / 20; window.scrollTo({ top: Math.round(y0 + p * t), behavior: 'instant' }); k < 40 ? requestAnimationFrame(step) : setTimeout(res, 2000); }; requestAnimationFrame(step); })`, { timeout: 30000 });
        await touch(page, 'touchEnd'); await sleep(1500);
        const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000); await page.send('Tracing.end'); await done; offT();
        const m1 = Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
        const c = (re, f = () => true) => ev.filter((e) => re.test(e.name) && (e.ph === 'X' || e.ph === 'B') && f(e)).length;
        R.work = { raf: c(/^FireAnimationFrame$/), timer: c(/^TimerFire$/), event: c(/^EventDispatch$/), funcCall: c(/^FunctionCall$/), style: c(/^UpdateLayoutTree$/), layout: c(/^Layout$/),
          paint: c(/^Paint$/), raster: c(/^RasterTask$/), decode: c(/^(Decode Image|ImageDecodeTask)$/), intersect: c(/IntersectionObserver/), resizeObs: c(/ResizeObserver/),
          elementsRestyled: ev.filter((e) => e.name === 'UpdateLayoutTree').reduce((s, e) => s + (e.args?.elementCount ?? e.args?.endData?.elementCount ?? 0), 0),
          metrics: Object.fromEntries(['JSEventListeners', 'Nodes', 'LayoutCount', 'RecalcStyleCount', 'LayoutObjects'].map((k) => [k, k === 'JSEventListeners' || k === 'Nodes' || k === 'LayoutObjects' ? m1[k] : m1[k] - m0[k]])) };
        console.log(arm.name, 'boxes', Object.entries(R.boxes).map(([k, b]) => `${k} n${b.n} h${b.hash}`).join(' '), 'work', JSON.stringify(R.work));
      } finally { await page.close(); res.runs.push(R); }
    } else if (MODE === 'inv') {
      for (const h of HEIGHTS) {
        const { page, served } = await loadArm(cdp, srv, arm, h);
        const R = { arm: arm.name, h, served, pos: {} };
        try {
          for (const pos of POS) { const g = await goPos(page, pos); R.pos[pos] = { geo: g, inv: await page.eval('__ebInv()') }; if (pos === 'mhalf') await touch(page, 'touchEnd'); console.log(arm.name, h, pos, JSON.stringify(g), R.pos[pos].inv.items.length, 'items'); }
          const urls = await page.eval('__ebUrls()');
          R.urls = await page.eval(`Promise.all(${JSON.stringify(urls)}.map(async (u) => { try { const r = await fetch(u); const b = await r.arrayBuffer(); const im = new Image(); im.src = u; await im.decode().catch(() => {}); return { u: u.slice(0, 300), bytes: b.byteLength, type: r.headers.get('content-type'), nw: im.naturalWidth, nh: im.naturalHeight }; } catch (e) { return { u: u.slice(0, 300), err: String(e) }; } }))`, { timeout: 60000 });
        } finally { await page.close(); res.runs.push(R); }
      }
    } else {
      const { page, served } = await loadArm(cdp, srv, arm, HEIGHTS[0]);
      const R = { arm: arm.name, served, census: [] };
      try { for (const pos of POS) { const c = await census(page, pos); R.census.push(c);
        const sum = (k) => c.windows.filter((w) => w.kind === k).map((w) => `${w.paint.n}p/${Math.round(w.paint.area / 1000)}k L${w.counts.layout} R${w.counts.raster} D${w.counts.decode}`).join(' | ');
        console.log(arm.name, pos, 'm', c.g0.m, '\n  control', sum('control'), '\n  step   ', sum('step')); } }
      finally { await page.close(); res.runs.push(R); }
    }
  }
} finally {
  const f = join(OUT, `${MODE}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); srv.proc.kill();
  console.log('wrote', f);
}

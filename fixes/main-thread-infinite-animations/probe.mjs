#!/usr/bin/env node
// N3 main-thread-infinite-animations: runtime inventory + idle cost probe (counts, not a jank measurement).
// Run only under the chrome-measure lock, short lane (counts, unthrottled); slot.sh starts the servers
// inside the hold (calibrated flags), runs this probe and stops them:
//   TARGETS="base:- n3base:<combined-topic>" node tools/lock.mjs run chrome-measure --owner fix-infinite-anims \
//     --short --max-seconds 240 -- sh fixes/main-thread-infinite-animations/slot.sh out/n3/probe.json \
//     --step 1.0 --settle 1000 --win 1500 [--ablate --loop-win 800] [--only 0,932,max]
//   --ablate adds the R2 first-reader check per stop: an early rAF loop times one
//   documentElement.getBoundingClientRect() per frame, animations running vs
//   `*,*::before,*::after{animation-play-state:paused!important}`, then idle counts while paused.
//   Each callback is counted by its registration site (file:line of the caller), so idle loops are attributed.
// For each target (mobile 430x932 DPR 3, touch): load, then walk down the page in instant 300 px steps.
// At each stop (every 0.75 viewport + the bottom): wait SETTLE ms, then for WIN ms record
//   Performance.getMetrics deltas (RecalcStyleCount, LayoutCount, RecalcStyleDuration, TaskDuration, ScriptDuration),
//   page rAF callbacks (wrapped requestAnimationFrame), LayerTree.layerPainted events (with --paints),
//   and document.getAnimations() that are running, grouped by name, with keyframe properties, SVG target,
//   on-screen flag and a "compositable" guess (opacity/transform/filter family on a non-SVG-child target).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import os from 'node:os';
import { launchChrome, CDP, gotoAndSettle, sleep } from '../../tools/lib/cdp.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const targets = argv.filter((a) => /^[\w-]+=https?:\/\//.test(a)).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
const CPU = Number(opt('cpu', 1));
const SETTLE = Number(opt('settle', 1500));
const WIN = Number(opt('win', 2000));
const STEP = Number(opt('step', 0.75));
const OUT = resolve(opt('out', 'out/n3/probe.json'));
const PAINTS = flag('paints');
const ABLATE = flag('ablate');
const ONLY = opt('only', '');
const MAXSTOPS = Number(opt('max-stops', 40));
const VP = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true };

const INJECT = `(() => {
  const w = window; w.__n3 = { raf: 0, timers: 0, src: {} };
  // registration site of each callback (first stack frame outside this wrapper), counted when it runs
  const site = (kind) => { const s = (new Error().stack || '').split('\\n').slice(2).find(l => /https?:/.test(l)) || '?'; const m = s.match(/\\/([^\\/]+\\.(?:js|html))(?:\\?[^:]*)?:(\\d+):(\\d+)/); return kind + ' ' + (m ? m[1] + ':' + m[2] : s.trim().slice(0, 60)); };
  const bump = (k) => { w.__n3.src[k] = (w.__n3.src[k] || 0) + 1; };
  const r = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => { const k = site('raf'); return r((t) => { w.__n3.raf++; bump(k); return cb(t); }); };
  const si = w.setInterval.bind(w), st = w.setTimeout.bind(w);
  w.setInterval = (cb, ms, ...a) => { const k = site('interval(' + ms + ')'); return si(typeof cb === 'function' ? (...x) => { w.__n3.timers++; bump(k); return cb(...x); } : cb, ms, ...a); };
  w.setTimeout = (cb, ms, ...a) => { const k = site('timeout(' + ms + ')'); return st(typeof cb === 'function' ? (...x) => { w.__n3.timers++; bump(k); return cb(...x); } : cb, ms, ...a); };
  // R2 probe (arch-research2): an early rAF loop that times one forced style+layout flush at the start
  // of each frame. "Update animations" runs before rAF callbacks, so this read pays whatever pending
  // animation style the frame carries. Off until __n3.loopOn() (it keeps frames running while on).
  const g = w.__n3.gbcr = { on: false, n: 0, ms: 0, max: 0, all: [] };
  const tick = () => { if (!g.on) return; r(tick); const t0 = performance.now(); document.documentElement.getBoundingClientRect(); const d = performance.now() - t0; g.n++; g.ms += d; if (d > g.max) g.max = d; g.all.push(d); };
  w.__n3.loopOn = () => { g.n = 0; g.ms = 0; g.max = 0; g.all = []; if (!g.on) { g.on = true; r(tick); } };
  w.__n3.loopOff = () => { g.on = false; const s = [...g.all].sort((a, b) => a - b); return { n: g.n, meanMs: g.n ? g.ms / g.n : 0, p50: s[Math.floor(s.length / 2)] || 0, p90: s[Math.floor(s.length * 0.9)] || 0, max: g.max }; };
  w.__n3.pause = (on) => { let st = document.getElementById('__n3pause'); if (on && !st) { st = document.createElement('style'); st.id = '__n3pause'; st.textContent = '*,*::before,*::after{animation-play-state:paused!important}'; document.head.appendChild(st); } if (!on && st) st.remove(); };
})();`;

const ANIMS = `(() => {
  const vh = innerHeight, vw = innerWidth;
  const COMP = new Set(['opacity','transform','translate','rotate','scale','filter','backdrop-filter','offset','composite','easing','computedOffset']);
  const desc = (el) => { if (!el) return '?'; let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = (el.getAttribute('class')||'').split(/\\s+/).filter(x => x && !x.startsWith('svelte-')).slice(0,3); if (c.length) s += '.' + c.join('.'); return s; };
  const groups = {};
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue;
    const e = a.effect, t = e && e.target;
    const name = a.animationName || a.transitionProperty && ('transition:' + a.transitionProperty) || a.id || a.constructor.name;
    let props = [];
    try { props = [...new Set(e.getKeyframes().flatMap(k => Object.keys(k)))].filter(p => !['offset','composite','easing','computedOffset'].includes(p)); } catch {}
    const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
    const on = !!r && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && (r.width * r.height) > 0;
    const svgChild = !!t && t instanceof SVGElement && !(t instanceof SVGSVGElement && !(t.parentNode instanceof SVGElement));
    const comp = !svgChild && props.length > 0 && props.every(p => COMP.has(p));
    const deferred = !!t && !!t.closest && !!t.closest('[data-start-selling-render=deferred]');
    const cv = t && t.closest ? getComputedStyle(t.closest('section') || t).contentVisibility : '';
    const key = name + (e && e.pseudoElement ? ' ' + e.pseudoElement : '');
    const g = groups[key] ||= { name: key, n: 0, onscreen: 0, props: props.join(','), comp, svgChild, iter: e && e.getTiming ? String(e.getTiming().iterations) : '', targets: new Set(), deferred: 0, cv: new Set() };
    g.n++; if (on) g.onscreen++; if (deferred) g.deferred++; g.targets.add(desc(t)); g.cv.add(cv);
  }
  return Object.values(groups).map(g => ({ ...g, targets: [...g.targets].slice(0,4).join(' | '), cv: [...g.cv].join(',') }));
})()`;

async function metrics(page) {
  const { metrics } = await page.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const c = await page.eval('({ raf: window.__n3?.raf || 0, timers: window.__n3?.timers || 0, y: scrollY, src: { ...(window.__n3?.src || {}) } })');
  return { ...m, ...c };
}

async function probe(cdp, t) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
  let paints = 0;
  const paintRects = {};
  page.on((m) => { if (m.method === 'LayerTree.layerPainted') { paints++; const c = m.params.clip; const k = `${c.width}x${c.height}`; paintRects[k] = (paintRects[k] || 0) + 1; } });
  await page.send('Network.enable');
  await page.send('Performance.enable', { timeDomain: 'timeTicks' });
  await page.send('Emulation.setDeviceMetricsOverride', VP);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, t.url, { quietMs: 2000 });
  await sleep(1500);
  if (PAINTS) await page.send('LayerTree.enable');
  if (CPU !== 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const maxY = await page.eval('document.documentElement.scrollHeight - innerHeight');
  if (!(maxY > 3000)) throw new Error(`page did not load properly (maxY ${maxY}): is the server up?`);
  const ys = [];
  for (let y = 0; y < maxY && ys.length < MAXSTOPS - 1; y += Math.round(VP.height * STEP)) ys.push(y);
  ys.push(maxY);
  if (ONLY) { ys.length = 0; for (const v of ONLY.split(',')) ys.push(v === 'max' ? maxY : Math.min(maxY, Number(v))); }
  const stops = [];
  for (const y of ys) {
    await page.eval(`new Promise(async (res) => { const T = ${y}; for (let i = 0; i < 400 && Math.abs(scrollY - T) > 1; i++) { const d = T - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); if (d > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 1) break; } res(); })`, { timeout: 60000 });
    await sleep(SETTLE);
    const a = await metrics(page); const p0 = paints; for (const k in paintRects) delete paintRects[k];
    await sleep(WIN);
    const b = await metrics(page);
    const anims = await page.eval(ANIMS);
    const s = (WIN / 1000);
    const d = (k) => Math.round(((b[k] - a[k]) / s) * 10) / 10;
    const dms = (k) => Math.round(((b[k] - a[k]) * 1000 / s) * 10) / 10;
    const sec = await page.eval(`(() => { const el = document.elementFromPoint(innerWidth/2, innerHeight/2); const s = el && el.closest('section,header,footer,[class*=morph]'); return s ? (s.id ? '#' + s.id : '') + '.' + (s.getAttribute('class')||'').split(/\\s+/).filter(x=>!x.startsWith('svelte-'))[0] : '?'; })()`);
    const stop = { y: a.y, section: sec, recalcPerS: d('RecalcStyleCount'), layoutPerS: d('LayoutCount'), styleMsPerS: dms('RecalcStyleDuration'), layoutMsPerS: dms('LayoutDuration'), scriptMsPerS: dms('ScriptDuration'), taskMsPerS: dms('TaskDuration'), rafPerS: d('raf'), timersPerS: d('timers'), paintsPerS: PAINTS ? Math.round((paints - p0) / s * 10) / 10 : null, paintRects: PAINTS ? { ...paintRects } : null, running: anims };
    stop.sources = Object.fromEntries(Object.keys(b.src).map((k) => [k, Math.round(((b.src[k] - (a.src[k] || 0)) / s) * 10) / 10]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]));
    if (ABLATE) {
      // R2 / count-level E3 at this stop: an early-rAF forced flush per frame, animations running,
      // then with `*{animation-play-state:paused!important}`, then idle counts while paused.
      const LW = Number(opt('loop-win', 1000));
      await page.eval('window.__n3.loopOn(); 0');
      await sleep(LW);
      const runLoop = await page.eval('window.__n3.loopOff()');
      await page.eval('window.__n3.pause(true); 0');
      await sleep(300);
      await page.eval('window.__n3.loopOn(); 0');
      await sleep(LW);
      const pauseLoop = await page.eval('window.__n3.loopOff()');
      await sleep(200);
      const a2 = await metrics(page); const p2 = paints;
      await sleep(WIN);
      const b2 = await metrics(page);
      await page.eval('window.__n3.pause(false); 0');
      const d2 = (k) => Math.round(((b2[k] - a2[k]) / s) * 10) / 10;
      const dms2 = (k) => Math.round(((b2[k] - a2[k]) * 1000 / s) * 10) / 10;
      const r3 = (x) => Math.round(x * 1000) / 1000;
      stop.flushRunning = { n: runLoop.n, meanMs: r3(runLoop.meanMs), p90: r3(runLoop.p90), max: r3(runLoop.max) };
      stop.flushPaused = { n: pauseLoop.n, meanMs: r3(pauseLoop.meanMs), p90: r3(pauseLoop.p90), max: r3(pauseLoop.max) };
      stop.paused = { recalcPerS: d2('RecalcStyleCount'), styleMsPerS: dms2('RecalcStyleDuration'), taskMsPerS: dms2('TaskDuration'), paintsPerS: PAINTS ? Math.round((paints - p2) / s * 10) / 10 : null };
      console.log(`    flush/frame running ${stop.flushRunning.meanMs}ms (p90 ${stop.flushRunning.p90}, n ${runLoop.n}) paused ${stop.flushPaused.meanMs}ms (p90 ${stop.flushPaused.p90}, n ${pauseLoop.n}); idle all-paused: recalc/s ${stop.paused.recalcPerS} style ${stop.paused.styleMsPerS}ms/s task ${stop.paused.taskMsPerS}ms/s paints/s ${stop.paused.paintsPerS}`);
    }
    stops.push(stop);
    console.log(`${t.label} y=${stop.y} ${sec}  recalc/s ${stop.recalcPerS} layout/s ${stop.layoutPerS} style ${stop.styleMsPerS}ms/s task ${stop.taskMsPerS}ms/s raf/s ${stop.rafPerS} timers/s ${stop.timersPerS}${PAINTS ? ' paints/s ' + stop.paintsPerS : ''}`);
    for (const [k, v] of Object.entries(stop.sources)) console.log(`    src ${v}/s ${k}`);
    for (const g of anims) console.log(`    ${g.comp ? 'comp' : 'MAIN'} ${g.name} n=${g.n} on=${g.onscreen} def=${g.deferred} [${g.props}] iter=${g.iter} ${g.svgChild ? 'svg-child ' : ''}${g.targets}`);
  }
  if (CPU !== 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  return { label: t.label, url: t.url, maxY, stops, errors };
}

const ch = await launchChrome({ port: 0, profileDir: resolve('out/n3/chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const load0 = os.loadavg();
const res = [];
try { for (const t of targets) res.push(await probe(cdp, t)); }
finally { cdp.close(); await ch.close(); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ cpu: CPU, settle: SETTLE, win: WIN, load: { before: load0, after: os.loadavg() }, results: res }, null, 1));
console.log('wrote', OUT, 'load', load0.map((x) => x.toFixed(1)).join(' '), '->', os.loadavg().map((x) => x.toFixed(1)).join(' '));

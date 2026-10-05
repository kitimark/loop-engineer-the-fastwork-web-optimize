#!/usr/bin/env node
// nav-fade R/I probe (T-183 #4/#7): motion quality and work of the nav's Join waitlist button and language switch at the
// 72 % hero flip (both directions, instant step and an in-page rAF glide) and through the end-of-page morph
// (__fwMorphDrive). Counts and per-rAF values only: no timing verdict, no ms judged.
// Two passes per arm and load:
//   motion: a per-rAF sampler (computed style + rects of the Join button, its earn-box, the switch wrap, the nav)
//           -> values per frame (steps, holds, jumps, fights); it forces style+layout per frame by design;
//   counts: no sampler, a bare rAF counter; Chrome: Performance.getMetrics Layout/RecalcStyle + LayerTree paintCount
//           deltas per layer; WebKit (Simulator): Timeline record counts + LayerTree paintCount deltas per layer.
// Arms are overlay dirs: name=dir (default C=fixes/v9c/overlay, V8=fixes/v8c/overlay).
//   Chrome:  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-fade -- \
//              node fixes/nav-fade/probe/motion.mjs --engine chrome [--arms C,V8] [--passes motion,counts] [--cpu 1]
//   WebKit:  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-fade -- \
//              node tools/sim.mjs session --functional --owner fix-nav-fade -- node fixes/nav-fade/probe/motion.mjs --engine sim
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chrome');
const PASSES = arg('--passes', 'motion,counts').split(',');
const SCENS = arg('--scen', 'topIn,topOut,glideIn,glideOut,end').split(',');
const CPU = +arg('--cpu', '1');
const REDUCE = argv.includes('--reduce'); // Chrome: emulate prefers-reduced-motion: reduce (Sim: sim.mjs session --reduce-motion on)
const PSCENS = arg('--pscen', 'topIn,topOut,endOut,endIn').split(',');
const rng = (a, b, s) => { const o = []; for (let t = a; t <= b; t += s) o.push(t); return o; };
const PTIMES = { topIn: [...rng(0, 500, 100), ...rng(560, 1600, 80)], topOut: rng(0, 400, 40), endOut: rng(0, 480, 40), endIn: rng(0, 720, 60) };
const LABEL = arg('--label', '');
const DEF_ARMS = { C: 'fixes/v9c/overlay', V8: 'fixes/v8c/overlay' };
const ARMS = arg('--arms', 'C,V8').split(',').map((a) => { const [n, d] = a.split('='); const dir = d || DEF_ARMS[n] || `fixes/${n}/overlay`; return { name: n, dir: isAbsolute(dir) ? dir : join(WT, dir) }; });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-fade', `motion-${ENGINE}${LABEL ? '-' + LABEL : ''}-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- page side (same code in both engines) ----
const PAGE = (sampler) => `(() => {
  const nav = document.querySelector('header.start-selling-top-nav'); if (!nav) return 'no nav';
  const q = (s) => nav.querySelector(s);
  const earn = q('.start-selling-top-nav-btn.is-earn'), box = q('.start-selling-top-nav-earn-box'), acts = q('.start-selling-top-nav-actions');
  const wrap = q('.start-selling-top-nav-actions > .start-selling-language-switch-wrap'), lang = q('.start-selling-language-switch');
  const mk = q('.fw-nf-mk'), mki = q('.fw-nf-mki'), clw = q('.fw-nf-cl');
  const raf = window.__nfRaf || (window.__nfRaf = requestAnimationFrame.bind(window));
  const r2 = (v) => Math.round(v * 100) / 100;
  const SAMPLE = ${sampler ? 'true' : 'false'};
  const hero = document.querySelector('.hero-track');
  const yAt = (p) => { const r = hero.getBoundingClientRect(); return Math.round(r.top + scrollY + Math.max(1, r.height - innerHeight) * p); };
  const aname = (a) => (a.animationName || a.transitionProperty || (a.effect && a.effect.getKeyframes && a.effect.getKeyframes()[0] ? Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join('+') : '?')) + '@' + ((a.effect && a.effect.target && (a.effect.target.className.baseVal ?? a.effect.target.className) || '').toString().replace(/svelte-\\S+/g, '').trim().split(' ').pop());
  let S = [], on = false, F = 0;
  const tick = (t) => {
    if (!on) return; F++;
    if (SAMPLE) {
      const ce = getComputedStyle(earn), cw = getComputedStyle(wrap), cl = getComputedStyle(lang), cb = box ? getComputedStyle(box) : null;
      const nr = nav.getBoundingClientRect(), er = earn.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), br = box ? box.getBoundingClientRect() : null;
      S.push({ t: r2(t), y: Math.round(scrollY), cls: nav.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').replace(/\\s+/g, ' ').trim(), m: nav.style.getPropertyValue('--morph'),
        nl: r2(nr.left), nr: r2(nr.right), nw: r2(nr.width),
        eo: ce.opacity, etr: ce.translate, etf: ce.transform, ef: ce.filter, emask: ce.webkitMaskPosition || ce.maskPosition, emw: ce.maxWidth, epl: ce.paddingLeft,
        el: r2(er.left), ew: r2(er.width), bclip: cb ? cb.clipPath : null, bl: br ? r2(br.left) : null, bw: br ? r2(br.width) : null,
        wl: r2(wr.left), wtr: cw.translate, wtf: cw.transform, lo: cl.opacity, lbf: cl.webkitBackdropFilter || cl.backdropFilter, gap: getComputedStyle(acts).columnGap,
        mkl: mk ? r2(mk.getBoundingClientRect().left - er.left) : null, mkw: mk ? r2(mk.getBoundingClientRect().width) : null, mkil: mki ? r2(mki.getBoundingClientRect().left - er.left) : null, cll: clw ? r2(clw.getBoundingClientRect().left) : null,
        an: nav.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map(aname).join(' ') });
    }
    raf(tick);
  };
  const start = () => { S = []; F = 0; on = true; raf(tick); };
  const stop = () => { on = false; return { frames: F, samples: S }; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = (y) => { scrollTo({ top: y, behavior: 'instant' }); dispatchEvent(new Event('scroll')); };
  const seg = (a, b, d) => new Promise((res) => { const s = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - s) / d); scrollTo({ top: Math.round(a + (b - a) * k), behavior: 'instant' }); k < 1 ? raf(f) : res(1); }; raf(f); });
  const mark = (n) => { try { performance.mark(n); } catch (e) {} try { console.timeStamp(n); } catch (e) {} return performance.now(); };
  const P = { pill: yAt(0.66), bar: yAt(0.78), lo: yAt(0.5), hi: yAt(0.85) };
  const SC = {
    topIn: async () => { go(P.pill); await wait(1800); const t0 = mark('nf-topIn-0'); start(); await wait(50); const tf = performance.now(); go(P.bar); await wait(1800); const r = stop(); return { t0, tf, t1: mark('nf-topIn-1'), ...r }; },
    topOut: async () => { go(P.bar); await wait(1800); const t0 = mark('nf-topOut-0'); start(); await wait(50); const tf = performance.now(); go(P.pill); await wait(1500); const r = stop(); return { t0, tf, t1: mark('nf-topOut-1'), ...r }; },
    glideIn: async () => { go(P.lo); await wait(1800); const t0 = mark('nf-glideIn-0'); start(); await wait(50); const tf = performance.now(); await seg(P.lo, P.hi, 1000); await wait(1500); const r = stop(); return { t0, tf, t1: mark('nf-glideIn-1'), ...r }; },
    glideThru: async () => { const a = yAt(0.6), b = yAt(1) + 300; go(a); await wait(1800); const t0 = mark('nf-glideThru-0'); start(); await wait(50); const tf = performance.now(); await seg(a, b, 2500); await wait(800); const r = stop(); return { t0, tf, t1: mark('nf-glideThru-1'), ...r }; },
    glideOut: async () => { go(P.hi); await wait(1800); const t0 = mark('nf-glideOut-0'); start(); await wait(50); const tf = performance.now(); await seg(P.hi, P.lo, 1000); await wait(1500); const r = stop(); return { t0, tf, t1: mark('nf-glideOut-1'), ...r }; },
    // end of the page: v9 on touch phones (rev 7c, .fw-ms-end) maps the scroll into the extra screen to the morph, so a
    // glide drives it (into the screen over 800 ms, hold 1.5 s, out over 800 ms, hold 1.5 s); builds without it (v8)
    // use the jack's own driver (__fwMorphDrive: open at ~1.1 s, close 2.5 s later)
    end: async () => {
      const ms = document.querySelector('.fw-ms-end');
      if (ms) {
        const y1 = Math.max(0, document.documentElement.scrollHeight - innerHeight), y0 = Math.max(0, y1 - ms.offsetHeight - 200);
        go(y0); await wait(1800); const t0 = mark('nf-end-0'); start(); await wait(50); const tf = performance.now();
        await seg(y0, y1, 800); await wait(1500); const tb = performance.now(); await seg(y1, y0, 800); await wait(1500);
        const r = stop(); return { mode: 'scroll', y0, y1, t0, tf, tb, t1: mark('nf-end-1'), ...r };
      }
      const t0 = mark('nf-end-0'); start(); const tf = performance.now(); window.__fwMorphDrive({ hold: 2500, cycles: 1 }); await wait(7000); const r = stop(); return { mode: 'drive', t0, tf, t1: mark('nf-end-1'), ...r };
    },
  };
  // parity pass: freeze the nav's animations at fixed times after a state change (all other animations paused at the
  // change) so arms can be compared frame by frame on screenshots
  const endYs = () => { const ms = document.querySelector('.fw-ms-end'); const y1 = Math.max(0, document.documentElement.scrollHeight - innerHeight); return { y1, y0: Math.max(0, y1 - (ms ? ms.offsetHeight : 0) - 200) }; };
  const FZ = { topIn: [P.pill, P.bar], topOut: [P.bar, P.pill], endOut: () => { const e = endYs(); return [e.y0, e.y1]; }, endIn: () => { const e = endYs(); return [e.y1, e.y0]; } };
  const r2f = () => new Promise((r) => raf(() => raf(r)));
  let FA = [];
  window.__nfPrep = async (name) => { window.__nfRes = null; const z = typeof FZ[name] === 'function' ? FZ[name]() : FZ[name]; go(z[0]); await wait(2200); go(z[1]); await r2f(); await wait(30);
    FA = nav.getAnimations({ subtree: true }).filter((a) => a.playState !== 'finished'); /* only what the state change started: a finished fill (the top sweep) is never rewound */
    document.getAnimations().forEach((a) => { try { if (a.playState !== 'finished') a.pause(); } catch (e) {} }); window.__nfRes = JSON.stringify({ name, y: [z[0], z[1]], anims: FA.map(aname) }); return 1; };
  window.__nfAt = async (t) => { window.__nfRes = null; for (const a of FA) { try { a.pause(); a.currentTime = t; } catch (e) {} } await r2f(); await wait(60);
    const ce = getComputedStyle(earn); const er = earn.getBoundingClientRect(), br = box.getBoundingClientRect(), mk = earn.querySelector('.fw-nf-mk');
    /* geometry for the 1-device-px check: the mask image's left edge relative to the button (C: mask-position p of a 2.4W
       image -> p*(W-2.4W); carrier arms: .fw-nf-mk's left edge, its mask is 100% of its 2.4W box), the button and the earn box */
    let mx = null; if (mk) { const cm = getComputedStyle(mk); if ((cm.maskImage || cm.webkitMaskImage || 'none') !== 'none') mx = mk.getBoundingClientRect().left - er.left; }
    else if ((ce.maskImage || ce.webkitMaskImage || 'none') !== 'none') { const W = er.width, p0 = String(ce.maskPosition || ce.webkitMaskPosition).trim().split(' ')[0]; mx = p0.endsWith('%') ? (parseFloat(p0) / 100) * (W - 2.4 * W) : parseFloat(p0); }
    const geo = { bx: er.left, bw: er.width, ex: br.left, ew: br.width, mx };
    window.__nfRes = JSON.stringify({ t, geo, op: ce.opacity, m: nav.style.getPropertyValue('--morph'), cls: nav.className.replace(/svelte-\S+|start-selling-top-nav/g, '').replace(/\s+/g, ' ').trim() }); return 1; };
  window.__nfRes = null;
  window.__nfGo = (name) => { window.__nfRes = null; SC[name]().then((r) => { window.__nfRes = JSON.stringify({ name, P, ...r }); }, (e) => { window.__nfRes = JSON.stringify({ name, error: String(e) }); }); return 1; };
  return JSON.stringify({ ok: 1, P, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, morphDrive: typeof window.__fwMorphDrive });
})()`;

async function server(arm) {
  const st = join(OUT, `serve-${arm.name}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', arm.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm.name + ' server did not start');
}

const res = { tool: 'fixes/nav-fade/probe/motion.mjs', geoV: 2, engine: ENGINE, cpu: CPU, startedAt: new Date().toISOString(), load1: loadavg()[0], passes: PASSES, scens: SCENS, runs: [] };
const save = () => writeFileSync(join(OUT, 'motion.json'), JSON.stringify(res, null, 1));

// ---- engine adapters: {eval(expr) -> value, counts: {begin(), end(name)}} ----
async function chromeEngine() {
  const { launchChrome, CDP, gotoAndSettle, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-fade/chrome'), 'motion'), headless: true, windowSize: '430,932' });
  const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
  return {
    close: async () => { try { cdp.close(); await chrome.close(); } catch {} },
    async open(url, run) {
      const page = await cdp.newIsolatedPage();
      page.on((m) => {
        if (m.method === 'Runtime.exceptionThrown') run.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
        if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) run.failed.push(m.params.response.status + ' ' + m.params.response.url.replace(url, '/'));
      });
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true }); await page.send('Performance.enable');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      if (REDUCE) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2500);
      let layers = []; page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers?.length) layers = m.params.layers; });
      await page.send('DOM.enable'); await page.send('DOM.getDocument', { depth: 0 });
      const names = new Map();
      const nameOf = async (bid) => {
        if (bid == null) return '(no node)'; if (names.has(bid)) return names.get(bid);
        let v = '?'; try { const { object } = await page.send('DOM.resolveNode', { backendNodeId: bid }); const r = await page.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; if (!e) return this.nodeName; return e.tagName.toLowerCase() + (e.classList.length ? "." + [...e.classList].filter((c) => !c.startsWith("svelte-")).slice(0, 3).join(".") : ""); }' }); v = r.result.value; } catch {}
        names.set(bid, v); return v;
      };
      const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => ['LayoutCount', 'RecalcStyleCount'].includes(m.name)).map((m) => [m.name, m.value]));
      let m0 = null, l0 = null;
      return {
        eval: (e) => page.eval(e, { awaitPromise: false }),
        async countsOn() { await page.send('LayerTree.enable'); await sleep(600); },
        async begin() { m0 = await metrics(); l0 = new Map(layers.map((l) => [l.layerId, l.paintCount || 0])); },
        async end() {
          await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(150);
          const m1 = await metrics(); const paints = {};
          for (const l of layers) { const d = (l.paintCount || 0) - (l0.get(l.layerId) ?? 0); if (d > 0) { const k = (await nameOf(l.backendNodeId)) + ` [${Math.round(l.width)}x${Math.round(l.height)}]`; paints[k] = (paints[k] || 0) + d; } }
          return { layout: m1.LayoutCount - m0.LayoutCount, style: m1.RecalcStyleCount - m0.RecalcStyleCount, paints, layerCount: layers.length };
        },
        async layerInfo() {
          const out = [];
          for (const l of layers) { const n = await nameOf(l.backendNodeId); if (!/top-nav|language-switch|earn/.test(n)) continue; let r = null; try { r = (await page.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds; } catch {} out.push({ n, w: Math.round(l.width), h: Math.round(l.height), draws: l.drawsContent, reasons: r }); }
          return out;
        },
        async shot(f) { const r = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.data, 'base64')); return f; },
        close: () => page.close(),
      };
    },
  };
}

async function simEngine() {
  const { openTab, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
  return {
    close: async () => {},
    async open(url, run) {
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      const port = new URL(url).port;
      const c = await openTab(`localhost:${port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(4000);
      await c.evaluate(`(() => { window.__nfErr = []; addEventListener('error', (e) => window.__nfErr.push(String(e.message))); return 1; })()`);
      let recs = [], off = null, w0 = null;
      const names = new Map();
      const nameOf = async (nodeId) => {
        if (!nodeId) return '(no node)'; if (names.has(nodeId)) return names.get(nodeId);
        let v = '?'; try { const o = await c.send('DOM.resolveNode', { nodeId }); const r = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, returnByValue: true, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; if (!e) return this.nodeName; return e.tagName.toLowerCase() + (e.classList.length ? "." + [...e.classList].filter((c) => !c.startsWith("svelte-")).slice(0, 3).join(".") : ""); }' }); v = r.result.value; } catch {}
        names.set(nodeId, v); return v;
      };
      const snap = async () => { const root = (await c.send('DOM.getDocument')).root.nodeId; return (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []; };
      let L0 = null;
      return {
        eval: (e) => c.evaluate(e),
        async countsOn() {
          c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
          for (const [m, p] of TIMELINE_START) await c.send(m, p);
          await c.send('LayerTree.enable');
          const syncT = await c.evaluate(timelineSyncJs('nf-sync')); await sleep(800);
          const syncTL = findTimeStamp(recs, 'nf-sync'); off = syncTL != null ? syncTL * 1000 - syncT : null; run.timelineOffset = off;
        },
        async begin() { L0 = new Map((await snap()).map((l) => [l.layerId, l.paintCount || 0])); w0 = await c.evaluate('performance.now()'); },
        async end() {
          await sleep(300); const w1 = await c.evaluate('performance.now()');
          const L = await snap(); const paints = {};
          for (const l of L) { const d = (l.paintCount || 0) - (L0.get(l.layerId) ?? 0); if (d > 0) { const k = (await nameOf(l.nodeId)) + ` [${Math.round(l.bounds?.width ?? 0)}x${Math.round(l.bounds?.height ?? 0)}]`; paints[k] = (paints[k] || 0) + d; } }
          const flat = []; const walk = (r) => { if (r.startTime != null) flat.push(r); for (const k of r.children || []) walk(k); }; for (const r of recs) walk(r);
          const inW = (r) => off != null && r.startTime * 1000 - off >= w0 && r.startTime * 1000 - off < w1;
          const by = {}; for (const r of flat) if (inW(r)) by[r.type] = (by[r.type] || 0) + 1;
          return { types: by, paints, layerCount: L.length, windowMs: Math.round(w1 - w0) };
        },
        async layerInfo() {
          const L = await snap(); const out = [];
          for (const l of L) { const n = await nameOf(l.nodeId); if (!/top-nav|language-switch|earn/.test(n)) continue; let r = null; try { const x = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons; r = Object.keys(x).filter((k) => x[k] === true); } catch {} out.push({ n, w: Math.round(l.bounds?.width ?? 0), h: Math.round(l.bounds?.height ?? 0), reasons: r, mem: l.memory }); }
          return out;
        },
        async shot(f) { execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', f], { stdio: 'ignore' }); return f; },
        errors: async () => JSON.parse(await c.evaluate('JSON.stringify(window.__nfErr || [])')),
        close: async () => { try { await c.send('Timeline.stop'); } catch {} try { c.close(); } catch {} },
      };
    },
  };
}

const eng = ENGINE === 'sim' ? await simEngine() : await chromeEngine();
try {
  for (const arm of ARMS) {
    for (const pass of PASSES) {
      const s = await server(arm); const run = { arm: arm.name, pass, errors: [], failed: [], scen: {} }; res.runs.push(run);
      try {
        const url = `http://localhost:${s.port}/`;
        run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
        const pg = await eng.open(url, run);
        run.setup = JSON.parse(await pg.eval(PAGE(pass === 'motion')));
        if (pass === 'counts') { await pg.countsOn(); run.layersPill = null; }
        if (pass === 'parity') {
          const poll = async () => { let r = null; for (let i = 0; i < 80 && !(r = await pg.eval('window.__nfRes')); i++) await sleep(100); return r ? JSON.parse(r) : { error: 'no result' }; };
          for (const sc of PSCENS) {
            await pg.eval(`window.__nfPrep(${JSON.stringify(sc)})`); const o = await poll(); o.frames = [];
            const dir = join(OUT, 'png'); mkdirSync(dir, { recursive: true });
            for (const t of PTIMES[sc]) { await pg.eval(`window.__nfAt(${t})`); const f = await poll(); await sleep(ENGINE === 'sim' ? 250 : 30); f.png = await pg.shot(join(dir, `${arm.name}-${sc}-${t}.png`)); o.frames.push(f); }
            run.scen[sc] = o; console.log(arm.name, 'parity', sc, o.frames.length, 'frames', (o.anims || []).length, 'anims');
          }
          if (pg.errors) run.errors.push(...(await pg.errors()));
          await pg.close(); continue;
        }
        for (const sc of SCENS) {
          if (pass === 'counts') await pg.begin();
          await pg.eval(`window.__nfGo(${JSON.stringify(sc)})`);
          let r = null; for (let i = 0; i < 80 && !(r = await pg.eval('window.__nfRes')); i++) await sleep(250);
          const o = r ? JSON.parse(r) : { error: 'no result' };
          if (pass === 'counts') { delete o.samples; o.counts = await pg.end(); if (sc === 'topIn') run.layersBar = await pg.layerInfo(); if (sc === 'end') run.layersEnd = await pg.layerInfo(); }
          run.scen[sc] = o;
          console.log(arm.name, pass, sc, 'frames', o.frames, o.samples ? `samples ${o.samples.length}` : JSON.stringify(o.counts ? { l: o.counts.layout, s: o.counts.style, t: o.counts.types } : o.error));
        }
        if (pg.errors) run.errors.push(...(await pg.errors()));
        await pg.close();
      } catch (e) { run.void = String(e.stack || e); console.log(arm.name, pass, 'VOID', run.void.split('\n')[0]); }
      finally { s.p.kill(); save(); }
      console.log(arm.name, pass, JSON.stringify(run.served), 'errors', run.errors.length, 'failed', run.failed.length);
    }
  }
} finally { save(); await eng.close(); console.log('OUT', OUT); }
process.exit(0);

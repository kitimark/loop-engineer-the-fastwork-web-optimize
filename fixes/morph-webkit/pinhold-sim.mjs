// B1 probe on the iOS Simulator (fix-nav-morph; review-f3-arm-scope B1; counts only, Simulator ms never count, F-084).
// Question: P-036's capped runs (the morph pins the page at y 5215 and the end loop keeps pushing) collapse to 5-21 fps in
// V (F3 mw10e-arm-scope-c) and stay there through idle; C (aw1-10e) holds 52-60. What runs every frame in V that does
// not in C?
// Per arm: serve the arm's immutable snapshot copy (as P-036 did), open it, run gestures/pin-hold-v1.json with
// `sim.mjs gesture` (WDA-sim strokes: transit strokes until atEnd or 24 passes, then 8 s idle), then, at the pin, on a
// new inspector connection (the proxy allows one per page, I-038): wrap requestAnimationFrame / setTimeout / scrollTo
// to count registrations by callback, count scroll events and DOM mutations under the nav and #platform, log rAF frames
// [t, dt, scrollY, innerHeight, morph], and record Timeline for 4 s of idle (record counts and summed Simulator ms per
// type and per script location; Simulator ms are indicative only).
// Usage (a NORMAL hold: gestures need a timed session):
//   node tools/lock.mjs run chrome-measure --owner fix-nav-morph --max-seconds 420 -- \
//     node tools/sim.mjs session --owner fix-nav-morph -- node fixes/morph-webkit/pinhold-sim.mjs V,C
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/pinhold-sim'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const ARMDEF = {
  C: { overlays: [join(SNAP, 'aw1-10e-3e2f599a1632')], js: '3e2f599a1632', css: 'c6aad94b455f' },
  V: { overlays: [join(SNAP, 'mw10e-arm-scope-c-c6d3590576a7'), join(SNAP, 'aw1-10e-3e2f599a1632')], js: 'c6d3590576a7', css: 'c6aad94b455f' },
};
const ARMS = (process.argv[2] || 'V,C').split(',');
const SCRIPT = join(WT, 'fixes/morph-webkit/gestures/pin-hold-v1.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const BASE = resolveTree('site-pretty');

const INSTALL = `(() => {
  const P = window.__ph = { f: [], raf: {}, to: {}, scrollTo: 0, scrollEv: 0, mut: {}, on: false };
  const nav = document.querySelector('header.start-selling-top-nav');
  const pf = document.querySelector('.start-selling-platform');
  const mv = () => { const m = /--morph:\\s*([0-9.e+-]+)/.exec(nav?.getAttribute('style') || ''); return m ? +m[1] : null; };
  const key = (cb) => ((cb && cb.name) || 'anon') + ' ' + String(cb).replace(/\\s+/g, ' ').slice(0, 90);
  const oR = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { if (P.on) { const k = key(cb); P.raf[k] = (P.raf[k] || 0) + 1; } return oR(cb); };
  const oT = window.setTimeout.bind(window);
  window.setTimeout = (cb, ms, ...a) => { if (P.on) { const k = key(cb) + ' @' + ms; P.to[k] = (P.to[k] || 0) + 1; } return oT(cb, ms, ...a); };
  const oS = window.scrollTo.bind(window);
  window.scrollTo = (...a) => { if (P.on) P.scrollTo++; return oS(...a); };
  addEventListener('scroll', () => { if (P.on) P.scrollEv++; }, { passive: true, capture: true });
  const mo = new MutationObserver((ms) => { if (!P.on) return; for (const r of ms) {
    const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    const tag = (el?.id ? '#' + el.id : '') + (el?.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el?.tagName || '?');
    const k = r.type + ':' + (r.attributeName || '') + ' ' + tag; P.mut[k] = (P.mut[k] || 0) + 1; } });
  const opt = { attributes: true, childList: true, characterData: true, subtree: true };
  nav && mo.observe(nav, opt); pf && mo.observe(pf, opt); mo.observe(document.documentElement, { attributes: true });
  let last = 0;
  const tick = (t) => { P.f.push([Math.round(t), Math.round((t - last) * 10) / 10, Math.round(scrollY), innerHeight, mv()]); last = t; if (P.on) oR(tick); };
  P.start = () => { P.on = true; P.f = []; P.raf = {}; P.to = {}; P.scrollTo = 0; P.scrollEv = 0; P.mut = {}; oR(tick); };
  P.stop = () => { P.on = false; };
  P.state = () => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, ih: innerHeight, m: mv(),
    navClass: nav?.className, pfPE: pf?.style.pointerEvents, pfFade: pf?.style.getPropertyValue('--morph-fade'),
    osb: document.documentElement.style.overscrollBehaviorY || getComputedStyle(document.documentElement).overscrollBehaviorY });
  return nav ? 'ok' : 'no nav'; })()`;

const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
function summarize(records) {
  const types = {}, js = {}; let frames = 0, frameMs = 0;
  const walk = (r) => {
    const t = types[r.type] ||= { n: 0, ms: 0 }; t.n++; t.ms += ms(r);
    if (['FunctionCall', 'FireAnimationFrame', 'TimerFire', 'EventDispatch', 'ObserverCallback'].includes(r.type)) {
      const d = r.data || {}; const loc = r.type === 'EventDispatch' ? d.type : `${(d.scriptName || '').split('/').pop()}:${d.scriptLine ?? ''}${d.callbackType ? ' ' + d.callbackType : ''}`;
      const k = `${r.type} ${loc}`; const j = js[k] ||= { n: 0, ms: 0 }; j.n++; j.ms += ms(r);
    }
    for (const c of r.children || []) walk(c);
  };
  for (const r of records) { if (r.type === 'RenderingFrame') { frames++; frameMs += ms(r); } walk(r); }
  const round = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, { n: v.n, ms: Math.round(v.ms * 10) / 10 }]));
  return { renderingFrames: frames, renderingFrameMs: Math.round(frameMs), types: round(types), js: round(js) };
}

const res = { tool: 'fix-nav-morph pinhold-sim', note: 'Simulator: counts only (F-084)', startedAt: new Date().toISOString(), order: ARMS, runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.overlays.join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())).slice(0, 12), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())).slice(0, 12);
    if (js !== def.js || css !== def.css) { console.error(`VOID ${arm}: serves ${js} / ${css}`); process.exitCode = 3; continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(4000);
    const g = spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'gesture', SCRIPT, '--label', `pinhold-${arm}`], { encoding: 'utf8', timeout: 150000 });
    const gOut = (g.stdout || '') + (g.stderr || '');
    const saved = /saved (\S+)/.exec(gOut)?.[1] ?? null;
    const run = { arm, served: { js, css }, gesture: { status: g.status, saved, tail: gOut.split('\n').filter((l) => /loops|aborted|pin|error/i.test(l)).slice(0, 12) } };
    console.log(`${arm} gesture exit ${g.status} saved ${saved}`);
    await sleep(1000);
    const c = await openTab(`localhost:${s.port}`);
    try {
      run.install = await c.evaluate(INSTALL);
      run.before = JSON.parse(await c.evaluate('JSON.stringify(__ph.state())'));
      await c.send('Page.disable'); await c.send('Page.enable');
      await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
      let recs = [];
      c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      await c.send('Timeline.start', { maxCallStackDepth: 2 });
      await c.evaluate('(__ph.start(), 0)');
      await sleep(4000);
      await c.evaluate('(__ph.stop(), 0)');
      await c.send('Timeline.stop'); await sleep(400);
      const P = JSON.parse(await c.evaluate('JSON.stringify({ f: __ph.f, raf: __ph.raf, to: __ph.to, scrollTo: __ph.scrollTo, scrollEv: __ph.scrollEv, mut: __ph.mut })'));
      run.after = JSON.parse(await c.evaluate('JSON.stringify(__ph.state())'));
      const dts = P.f.slice(1).map((f) => f[1]);
      run.idle = { seconds: 4, frames: P.f.length, gt34: dts.filter((d) => d > 34).length, gt50: dts.filter((d) => d > 50).length, maxDt: Math.max(0, ...dts),
        mRange: [Math.min(...P.f.map((f) => f[4] ?? NaN)), Math.max(...P.f.map((f) => f[4] ?? NaN))], yRange: [Math.min(...P.f.map((f) => f[2])), Math.max(...P.f.map((f) => f[2]))],
        raf: P.raf, timeouts: P.to, scrollTo: P.scrollTo, scrollEvents: P.scrollEv, mutations: P.mut };
      run.timeline = summarize(recs);
      await c.send('Timeline.disable').catch(() => {});
      console.log(`${arm} at pin: before ${JSON.stringify(run.before)}`);
      console.log(`${arm} idle 4 s: frames ${run.idle.frames} gt34 ${run.idle.gt34} gt50 ${run.idle.gt50} max ${run.idle.maxDt} m ${run.idle.mRange} y ${run.idle.yRange} scrollTo ${P.scrollTo} scrollEv ${P.scrollEv}`);
      console.log(`  raf ${JSON.stringify(P.raf).slice(0, 600)}`);
      console.log(`  timeouts ${JSON.stringify(P.to).slice(0, 400)}`);
      console.log(`  mutations ${JSON.stringify(P.mut).slice(0, 600)}`);
      console.log(`  timeline frames ${run.timeline.renderingFrames} types ${JSON.stringify(run.timeline.types).slice(0, 700)}`);
      console.log(`  js ${JSON.stringify(run.timeline.js).slice(0, 700)}`);
    } catch (e) { run.error = String(e.message || e); console.error(arm, e.message); }
    finally { c.close(); }
    res.runs.push(run);
  } finally { p.kill(); }
}
const f = join(OUT, `pinhold-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);

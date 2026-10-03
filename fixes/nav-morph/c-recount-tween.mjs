// F3 (c) recount, tween side (fix-nav-morph, 2026-10-03): the tween and hold paints per layer on main's build after
// morph-inherit and platform-idle landed (P = mpi-65052c4a3902), against morph-inherit alone (M = mi-7c61fe7d0662,
// st6-rb2 + the fix, no platform-idle). Question: how many platform card / artboard paints are left while --morph-fade
// is 0 (m = 1 hold, the open tween once m >= 0.55, the start of the close tween), i.e. what (c) (visibility: hidden at
// fade 0) could still save. Copy of fixes/morph-inherit/gates/tween-paint-sim.mjs with the arms and output changed;
// read with node fixes/morph-inherit/gates/tween-paint-read.mjs <file>. Snapshots: node fixes/morph-inherit/build.mjs
// && node fixes/nav-morph/c-recount-build.mjs. Run: as below with fixes/nav-morph/c-recount-tween.mjs M,P.
// What the copy measures (unchanged): which paints of the morph's open/close tween repaint unchanged content. Simulator
// only, counts and geometry only (Simulator ms are never judged, F-084). Per arm (immutable copies
// in out/snapshots/): a fresh server, open, scroll to the pin, start Timeline,
// run the M driver (__fwMorphDrive, 2 cycles, hold 3.5 s), and take LayerTree snapshots (paintCount, bounds per layer)
// in the holds between tweens, so the per-layer paint deltas split into hold and tween parts. Then isolation probes at
// rest (m = 0), each between two layer snapshots, 40 rAF frames each:
//   fade:  only --morph-fade on .start-selling-platform steps 1 -> 0.6 -> 1 (the platform's filter/opacity, as S() writes it)
//   fadeO: only the platform's opacity (filter fixed at none) steps the same way
//   nav:   only --morph on the nav header steps 0 -> 0.5 -> 0 (the header's own geometry/paint, no class change)
//   still: nothing written (the rest rate over the same 40 frames)
// Every Timeline Paint record is kept with its clip rect (root-view coordinates), cut per rAF frame on the page clock.
// Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-morph/c-recount-tween.mjs M,P
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/nav-morph'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const ARMDEF = {
  C: { overlays: [join(SNAP, 'c-7bf7c4657d21')], js: '7bf7c4657d21', css: 'f523598b2a24' },
  // morph-inherit: C + inline --morph on the nav children (fixes/morph-inherit/build.mjs)
  M: { overlays: [join(SNAP, 'mi-7c61fe7d0662')], js: '7c61fe7d0662', css: 'f523598b2a24' },
  // main after morph-inherit and platform-idle landed (fixes/nav-morph/c-recount-build.mjs)
  P: { overlays: [join(SNAP, 'mpi-65052c4a3902')], js: '65052c4a3902', css: 'e0f92804c521' },
};
const argv = process.argv.slice(2);
const ARMS = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'M,P').split(',');
const HOLD = 3500, CYCLES = 2;
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const startedAt = new Date().toISOString(), tag = startedAt.replace(/[:.]/g, '-');

const SELS = {
  nav: 'header.start-selling-top-nav', navBar: '.start-selling-top-nav-bar', navLogo: '.start-selling-top-nav-logo',
  navActions: '.start-selling-top-nav-actions', earn: '.start-selling-top-nav-btn.is-earn',
  panel: '.start-selling-morph-panel', backdrop: '.start-selling-morph-backdrop', veil: '.start-selling-morph-veil',
  center: '.start-selling-morph-center', footer: '.start-selling-morph-footer', panelClock: '.start-selling-morph-panel .waitlist-closing-countdown',
  platform: '.start-selling-platform', main: 'main',
};
const RECTS_JS = `(() => { const o = {}; const S = ${JSON.stringify(SELS)}; for (const [k, s] of Object.entries(S)) { const e = document.querySelector(s); if (!e) { o[k] = null; continue; } const r = e.getBoundingClientRect(); o[k] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 1000) / 1000); } o.scrollY = scrollY; o.vh = innerHeight; o.vw = innerWidth; o.dpr = devicePixelRatio; o.navStyle = document.querySelector(S.nav)?.getAttribute('style') || null; o.navClass = document.querySelector(S.nav)?.className || null; return JSON.stringify(o); })()`;

// isolation probes: 40 frames of one write per frame, then restore; result on window.__f3iso
const isoJs = (kind) => `(() => { window.__f3iso = null; const P = document.querySelector(${JSON.stringify(SELS.platform)}), H = document.querySelector(${JSON.stringify(SELS.nav)});
  const N = 40, ts = []; let i = 0; const prevF = P.style.getPropertyValue('--morph-fade'), prevM = H.style.getPropertyValue('--morph'), prevO = P.style.opacity, prevFi = P.style.filter;
  const tri = (k) => 1 - Math.abs((k / (N - 1)) * 2 - 1);
  const step = (t) => { ts.push(t);
    if (i < N) { const a = tri(i);
      if (${JSON.stringify(kind)} === 'fade') P.style.setProperty('--morph-fade', String(1 - 0.4 * a));
      if (${JSON.stringify(kind)} === 'fadeO') { P.style.filter = 'none'; P.style.opacity = String(1 - 0.4 * a); }
      if (${JSON.stringify(kind)} === 'nav') H.style.setProperty('--morph', String(0.5 * a));
      i++; requestAnimationFrame(step); return; }
    if (${JSON.stringify(kind)} === 'fade') P.style.setProperty('--morph-fade', prevF || '1');
    if (${JSON.stringify(kind)} === 'fadeO') { P.style.opacity = prevO; P.style.filter = prevFi; }
    if (${JSON.stringify(kind)} === 'nav') H.style.setProperty('--morph', prevM || '0');
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__f3iso = JSON.stringify({ kind: ${JSON.stringify(kind)}, ts }); }));
  };
  requestAnimationFrame(step); return 'started'; })()`;

const nodeNames = new Map();
async function layerSnap(c, label) {
  const tA = await c.evaluate('performance.now()');
  const root = (await c.send('DOM.getDocument')).root.nodeId;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
  const tB = await c.evaluate('performance.now()');
  for (const l of L) {
    if (!l.nodeId || nodeNames.has(l.nodeId)) continue;
    try {
      const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId });
      const r = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { const e = this; if (e.nodeType !== 1) return e.nodeName; const p = []; let x = e; for (let k = 0; x && x.nodeType === 1 && k < 3; k++, x = x.parentElement) p.push(x.tagName.toLowerCase() + (x.classList.length ? "." + [...x.classList].filter((c) => !c.startsWith("svelte-")).slice(0, 3).join(".") : "")); return p.join(" < "); }', returnByValue: true });
      nodeNames.set(l.nodeId, r.result.value);
      await c.send('Runtime.releaseObject', { objectId: o.object.objectId }).catch(() => {});
    } catch (e) { nodeNames.set(l.nodeId, '?' + String(e.message || e).slice(0, 40)); }
  }
  const rects = JSON.parse(await c.evaluate(RECTS_JS));
  return { label, tA, tB, rects, layers: L.map((l) => ({ id: l.layerId, node: l.nodeId, name: l.nodeId ? nodeNames.get(l.nodeId) : (l.isAnonymous ? 'anon' : '') + (l.pseudoElement ? '::' + l.pseudoElement : ''), b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height], cb: l.compositedBounds && [l.compositedBounds.width, l.compositedBounds.height], pc: l.paintCount, mem: l.memory })) };
}

const res = { tool: 'fix-nav-morph c-recount-tween (F3 (c) recount on main + morph-inherit + platform-idle; copy of morph-inherit gates/tween-paint-sim.mjs)', note: 'Simulator: counts and geometry only, ms never judged (F-084)', startedAt, order: ARMS, hold: HOLD, cycles: CYCLES, runs: [] };
const f = join(OUT, `c-recount-tween-${tag}.json`);
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.overlays.join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    run.served = { js, css };
    if (js !== def.js || css !== def.css) { run.void = `serves ${js} / ${css}`; console.log(`VOID ${arm}: ${run.void}`); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    run.pageJs = await c.evaluate(`(() => { const s = [...document.scripts].map((x) => x.src).concat(performance.getEntriesByType('resource').map((e) => e.name)); return s.filter((u) => u.includes('nodes/2.')).map((u) => u.split('/').pop()); })()`);
    await c.evaluate(`window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }); 'ok'`);
    await sleep(3500);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('f3a-sync'));
    const snaps = [];
    snaps.push(await layerSnap(c, 'pre'));
    snaps.push(await layerSnap(c, 'pre2')); // the snapshot's own paint effect (expected 0)
    const t0 = await c.evaluate(`(() => { window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} }); return performance.now(); })()`);
    // E(1) at ~t0 + 1100, E(0) at + HOLD, next E(1) at + 2 HOLD; snapshots 1.6 s after each start and 0.5 s before the next
    const plan = [];
    for (let k = 0; k < CYCLES; k++) {
      const a = 1100 + k * 2 * HOLD;
      plan.push([a + 1600, `m1-early-${k}`], [a + HOLD - 500, `m1-late-${k}`], [a + HOLD + 1600, `m0-early-${k}`]);
      if (k < CYCLES - 1) plan.push([a + 2 * HOLD - 500, `m0-late-${k}`]);
    }
    for (const [at, label] of plan) {
      const now = await c.evaluate('performance.now()');
      if (at - (now - t0) > 0) await sleep(at - (now - t0));
      snaps.push(await layerSnap(c, label));
    }
    let md = null; for (let i = 0; i < 60 && !md; i++) { md = await c.evaluate('window.__fwMD || null'); if (!md) await sleep(500); }
    run.driver = md ? JSON.parse(md) : null;
    snaps.push(await layerSnap(c, 'm0-end'));
    // isolation probes at rest
    run.iso = [];
    for (const kind of ['still', 'fade', 'fadeO', 'nav', 'still']) {
      const sA = await layerSnap(c, `iso-${kind}-a`);
      await c.evaluate(isoJs(kind));
      let v = null; for (let i = 0; i < 40 && !v; i++) { await sleep(250); v = await c.evaluate('window.__f3iso || null'); }
      const sB = await layerSnap(c, `iso-${kind}-b`);
      snaps.push(sA, sB);
      run.iso.push({ kind, ts: v ? JSON.parse(v).ts : null, a: sA.label, b: sB.label });
    }
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await c.send('LayerTree.disable').catch(() => {});
    const syncTL = findTimeStamp(recs, 'f3a-sync');
    run.timeline = { n: recs.length, syncT, syncTL, offsetMs: syncTL != null ? syncTL * 1000 - syncT : null };
    run.t0 = t0; run.snaps = snaps;
    const tlf = join(OUT, `tl-${arm}-${tag}.json`);
    writeFileSync(tlf, JSON.stringify({ offsetMs: run.timeline.offsetMs, recs }));
    run.timelineFile = tlf;
    console.log(`${arm}: served ${js}/${css} recs ${recs.length} sync ${run.timeline.offsetMs != null} driver ${run.driver ? JSON.stringify(run.driver.moving) : 'none'} snaps ${snaps.length}`);
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(f, JSON.stringify(res, null, 1)); }
}
console.log('wrote', f);

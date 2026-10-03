// F3 (c) recount, hold side (fix-nav-morph, 2026-10-03): tween-paint-sim2.mjs re-run on main's build after
// morph-inherit and platform-idle landed (P = mpi-65052c4a3902, fixes/nav-morph/c-recount-build.mjs) and on
// morph-inherit alone (M = mi-7c61fe7d0662). Arms and output changed, nothing else. Run:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-morph/c-recount-hold.mjs M,P
// The original probe: F3 A step 1, second probe (fix-nav-morph): at the held m = 1 (platform at --morph-fade 0, opacity 0, under the panel),
// does `visibility: hidden` on .start-selling-platform stop the platform card / artboard paints that go on every frame?
// And why are the nav layers composited (LayerTree.reasonsForCompositingLayer at m = 0 and m = 1)? Simulator only,
// counts only. Sequence per arm: load, pin, Timeline + LayerTree, compositing reasons at m = 0, __fwMorphDrive({hold:
// 9000, cycles: 1}); in the m = 1 hold: reasons, then 3 windows of ~1.2 s between layer snapshots: control, visibility
// hidden, control. Same functional-session command as tween-paint-sim.mjs.
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
  M: { overlays: [join(SNAP, 'mi-7c61fe7d0662')], js: '7c61fe7d0662', css: 'f523598b2a24' },
  P: { overlays: [join(SNAP, 'mpi-65052c4a3902')], js: '65052c4a3902', css: 'e0f92804c521' },
};
const ARMS = (process.argv[2] || 'M,P').split(',');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');

const nodeNames = new Map();
async function name(c, nodeId) {
  if (!nodeId) return '';
  if (nodeNames.has(nodeId)) return nodeNames.get(nodeId);
  let v = '?';
  try {
    const o = await c.send('DOM.resolveNode', { nodeId });
    const r = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { const e = this; if (e.nodeType !== 1) return e.nodeName; return e.tagName.toLowerCase() + (e.classList.length ? "." + [...e.classList].filter((c) => !c.startsWith("svelte-")).slice(0, 3).join(".") : ""); }', returnByValue: true });
    v = r.result.value;
  } catch {}
  nodeNames.set(nodeId, v); return v;
}
async function snap(c, label) {
  const root = (await c.send('DOM.getDocument')).root.nodeId;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
  const t = await c.evaluate('performance.now()');
  const out = [];
  for (const l of L) out.push({ id: l.layerId, name: await name(c, l.nodeId), pc: l.paintCount, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height].map(Math.round), mem: l.memory });
  return { label, t, layers: out };
}
async function reasons(c) {
  const root = (await c.send('DOM.getDocument')).root.nodeId;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
  const out = [];
  for (const l of L) {
    let r = null; try { r = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons; } catch (e) { r = { error: String(e.message || e).slice(0, 80) }; }
    out.push({ id: l.layerId, name: await name(c, l.nodeId), reasons: r ? Object.keys(r).filter((k) => r[k] === true) : null });
  }
  return out;
}
const diff = (a, b) => { const A = new Map(a.layers.map((l) => [l.id, l.pc])); return b.layers.filter((l) => l.pc - (A.get(l.id) ?? 0)).map((l) => [l.id + ' ' + l.name, l.pc - (A.get(l.id) ?? 0)]); };
const frames = (ms) => `new Promise((res) => { const t0 = performance.now(); let n = 0; const f = (t) => { n++; if (t - t0 < ${ms}) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })`;

const res = { tool: 'fix-nav-morph c-recount-hold (F3 (c) recount; copy of tween-paint-sim2.mjs)', note: 'Simulator, counts only', runs: [] };
const f = join(OUT, `c-recount-hold-${tag}.json`);
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve2-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.overlays.join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (run.served.js !== def.js || run.served.css !== def.css) { run.void = JSON.stringify(run.served); console.log('VOID', arm, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await c.evaluate(`window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }); 'ok'`);
    await sleep(3500);
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('f3b-sync'));
    run.reasonsM0 = await reasons(c);
    const t0 = await c.evaluate(`(() => { window.__fwMorphDrive({ hold: 14000, cycles: 1 }); return performance.now(); })()`);
    await sleep(3000); // E(1) at ~1.1 s, tween done by ~1.9 s
    run.state = await c.evaluate(`(() => { const P = document.querySelector('.start-selling-platform'); const cs = getComputedStyle(P); return JSON.stringify({ fade: P.style.getPropertyValue('--morph-fade'), opacity: cs.opacity, visibility: cs.visibility, filter: cs.filter }); })()`);
    run.reasonsM1 = await reasons(c);
    const w = [];
    const s0 = await snap(c, 'w0');
    const n1 = await c.evaluate(`(${frames(1200)}).then((n) => { window.__f3n = n; }), 'ok'`); await sleep(1500);
    const s1 = await snap(c, 'w1'); w.push({ kind: 'control', frames: await c.evaluate('window.__f3n'), t: [s0.t, s1.t], d: diff(s0, s1) });
    await c.evaluate(`document.querySelector('.start-selling-platform').style.visibility = 'hidden'; 'ok'`);
    await sleep(300);
    const s2 = await snap(c, 'w2');
    await c.evaluate(`(${frames(1200)}).then((n) => { window.__f3n = n; }), 'ok'`); await sleep(1500);
    const s3 = await snap(c, 'w3'); w.push({ kind: 'visibility-hidden', frames: await c.evaluate('window.__f3n'), t: [s2.t, s3.t], d: diff(s2, s3) });
    await c.evaluate(`document.querySelector('.start-selling-platform').style.visibility = ''; 'ok'`);
    await sleep(300);
    const s4 = await snap(c, 'w4');
    await c.evaluate(`(${frames(1200)}).then((n) => { window.__f3n = n; }), 'ok'`); await sleep(1500);
    const s5 = await snap(c, 'w5'); w.push({ kind: 'control2', frames: await c.evaluate('window.__f3n'), t: [s4.t, s5.t], d: diff(s4, s5) });
    run.windows = w;
    run.tDone = (await c.evaluate('performance.now()')) - t0;
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1000);
    const syncTL = findTimeStamp(recs, 'f3b-sync'); const off = syncTL != null ? syncTL * 1000 - syncT : null;
    const flat = []; const walk = (r) => { if (r.startTime != null) flat.push(r); for (const k of r.children || []) walk(k); }; for (const r of recs) walk(r);
    for (const x of w) { const P = flat.filter((r) => r.type === 'Paint' && r.startTime * 1000 - off >= x.t[0] && r.startTime * 1000 - off < x.t[1]); x.timelinePaints = P.length; x.layouts = flat.filter((r) => r.type === 'Layout' && r.startTime * 1000 - off >= x.t[0] && r.startTime * 1000 - off < x.t[1]).length; }
    console.log(arm, run.state, 'tDone', Math.round(run.tDone), JSON.stringify(w.map((x) => ({ kind: x.kind, frames: x.frames, timelinePaints: x.timelinePaints, layouts: x.layouts, d: x.d }))));
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(f, JSON.stringify(res, null, 1)); }
}
console.log('wrote', f);

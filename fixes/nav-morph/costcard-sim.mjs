// F3 rendering cost card, Simulator part (fix-nav-morph; user T-035 #8; layout: isolated-measurement README §6).
// Counts only: Simulator ms are never judged (F-084). One Simulator session = one rep; arms in the order given
// (default C,V,D,C2; C2 = a second C server, the A/A pair). Per arm: a fresh server on a new port (a fresh origin, so
// no cache shared with the other arms; the session clears Safari's cache at launch), open it, run
// gestures/costcard-pin-v1.json with `sim.mjs gesture --timeline --inject costcard-inject.mjs` (WDA strokes: reload,
// 3 s idle, flings to the end, then marks start / push-1 / push-n x8 / hold / end), then the layer census at the pin on
// a new inspector connection. Per event window (cut at the gesture's own fwg: marks, on the page clock; Timeline
// records mapped with the file's offsetMs): RenderingFrame, RecalculateStyles, Layout, Paint (+ clip area), Composite,
// FunctionCall (+ by script:line), EventDispatch by type, FireAnimationFrame, TimerFire, listener ops (logger), and the
// touchmoves' prevented share.
// Run (WDA gestures need a timed session, so a --no-timing hold; sim.mjs refuses WDA in a --functional session):
//   node tools/lock.mjs run chrome-measure --no-timing --max-seconds 600 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --owner fix-nav-morph -- sh -c 'node tools/sim.mjs wda start && node fixes/nav-morph/costcard-sim.mjs C,V,D,C2 --rep 1'
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/costcard'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const AW = join(SNAP, 'aw1-10e-3e2f599a1632');
const ARMDEF = {
  C: { overlays: [AW], js: '3e2f599a1632', css: 'c6aad94b455f' },
  C2: { overlays: [AW], js: '3e2f599a1632', css: 'c6aad94b455f' },
  V: { overlays: [join(SNAP, 'mw10e-arm-scope-c-c6d3590576a7'), AW], js: 'c6d3590576a7', css: 'c6aad94b455f' },
  D: { overlays: [join(SNAP, 'mw10e-arm-scope-d-999c4497f37e'), AW], js: '999c4497f37e', css: 'c6aad94b455f' },
};
const argv = process.argv.slice(2);
const ARMS = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'C,V,D,C2').split(',');
const ai = argv.indexOf('--rep'); const REP = ai >= 0 ? +argv[ai + 1] : 1;
const SCRIPT = join(WT, 'fixes/nav-morph/gestures/costcard-pin-v1.json');
const INJECT = join(WT, 'fixes/nav-morph/costcard-inject.mjs');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const startedAt = new Date().toISOString(), tag = startedAt.replace(/[:.]/g, '-');

const SUB = { panel: '.start-selling-morph-panel', nav: 'header.start-selling-top-nav', platform: '.start-selling-platform' };
const PANELFACE = '.start-selling-morph-panel .waitlist-closing-countdown .face';
async function census(c) {
  await c.send('LayerTree.enable');
  try {
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
    const out = { layers: L.length, memory: L.reduce((a, l) => a + (l.memory || 0), 0), by: {} };
    const sets = { ...SUB, face: PANELFACE };
    for (const [k, sel] of Object.entries(sets)) {
      const ids = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: k === 'face' ? sel : `${sel}, ${sel} *` })).nodeIds);
      const F = L.filter((l) => ids.has(l.nodeId));
      out.by[k] = { nodes: ids.size, layers: F.length, memory: F.reduce((a, l) => a + (l.memory || 0), 0) };
    }
    return out;
  } finally { await c.send('LayerTree.disable').catch(() => {}); }
}

const quadArea = (q) => { if (!Array.isArray(q) || q.length < 8) return 0; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
const TYPES = ['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall', 'EventDispatch', 'FireAnimationFrame', 'TimerFire', 'ObserverCallback', 'ScheduleStyleRecalculation', 'InvalidateLayout'];
function windows(tl, inj) {
  const off = tl.offsetMs;
  const marks = (inj.marks || []).filter(([n]) => n.startsWith('fwg:')).map(([n, t]) => ({ kind: n.slice(4), t })).sort((a, b) => a.t - b.t);
  const k0 = marks.findIndex((m) => m.kind === 'start');
  const ws = [];
  for (let i = k0; i >= 0 && i < marks.length - 1; i++) ws.push({ kind: marks[i].kind, t0: marks[i].t, t1: marks[i + 1].t });
  const flat = [];
  const walk = (r) => { if (r.startTime != null) flat.push(r); for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r);
  return ws.map((w) => {
    const R = flat.filter((r) => { const t = r.startTime * 1000 - off; return t >= w.t0 && t < w.t1; });
    const o = { kind: w.kind, ms: w.t1 - w.t0 };
    for (const ty of TYPES) o[ty] = R.filter((r) => r.type === ty).length;
    o.paintArea = Math.round(R.filter((r) => r.type === 'Paint').reduce((a, r) => a + quadArea(r.data?.clip), 0));
    o.eventDispatch = R.filter((r) => r.type === 'EventDispatch').reduce((a, r) => { const t = r.data?.type || '?'; a[t] = (a[t] || 0) + 1; return a; }, {});
    o.fcBy = R.filter((r) => r.type === 'FunctionCall' || r.type === 'FireAnimationFrame' || r.type === 'TimerFire').reduce((a, r) => { const d = r.data || {}; const k = `${r.type === 'FunctionCall' ? '' : r.type + ' '}${String(d.scriptName || '').split('/').pop()}:${d.scriptLine ?? ''}`; a[k] = (a[k] || 0) + 1; return a; }, {});
    o.listenerOps = (inj.ops || []).filter(([t]) => t >= w.t0 && t < w.t1).map(([, m]) => m);
    const tm = (inj.tm || []).filter(([t]) => t >= w.t0 && t < w.t1);
    o.touchmoves = { n: tm.length, cancelable: tm.filter((x) => x[1]).length, prevented: tm.filter((x) => x[2]).length };
    o.touchstarts = (inj.ts || []).filter(([t]) => t >= w.t0 && t < w.t1).map(([, y, m]) => [y, Math.round(m * 1000) / 1000]);
    o.msUnjudged = Object.fromEntries(['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall'].map((ty) => [ty, Math.round(R.filter((r) => r.type === ty).reduce((a, r) => a + ((r.endTime ?? r.startTime) - r.startTime) * 1000, 0) * 10) / 10]));
    return o;
  });
}

const res = { tool: 'fix-nav-morph costcard-sim', note: 'Simulator: counts only, ms never judged (F-084); one session = one rep (I-082)', startedAt, rep: REP, order: ARMS, gestureFile: 'fixes/nav-morph/gestures/costcard-pin-v1.json', runs: [] };
const f = join(OUT, `costcard-sim-r${REP}-${tag}.json`);
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-sim-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.overlays.join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, rep: REP };
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    run.served = { js, css };
    if (js !== def.js || css !== def.css) { run.void = `serves ${js} / ${css}`; console.log(`VOID ${arm}: ${run.void}`); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(4000);
    const tlf = join(OUT, `sim-tl-${arm}-r${REP}-${tag}.json`);
    const g = spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'gesture', SCRIPT, '--label', `costcard-${arm}`, '--timeline', tlf, '--inject', INJECT], { encoding: 'utf8', timeout: 200000 });
    const gOut = (g.stdout || '') + (g.stderr || '');
    const saved = /saved (\S+)/.exec(gOut)?.[1] ?? null;
    run.gesture = { status: g.status, saved, timeline: tlf };
    console.log(`${arm} gesture exit ${g.status} saved ${saved}`);
    if (g.status || !saved) { run.error = 'gesture: ' + gOut.trim().split('\n').slice(-4).join(' | ').slice(0, 600); console.log(run.error); continue; }
    const G = JSON.parse(readFileSync(saved, 'utf8'));
    const injs = (G.inject || G.run?.inject || []).filter((x) => x.value);
    const pick = injs.map((x) => ({ seg: x.seg, v: typeof x.value === 'string' ? JSON.parse(x.value) : x.value })).find((x) => x.v?.marks?.some(([n]) => n === 'fwg:start'));
    if (!pick) { run.error = 'no inject read with the start mark'; console.log(arm, run.error); continue; }
    const segFile = pick.seg === 0 ? tlf : tlf.replace(/\.json$/, `-seg${pick.seg}.json`);
    const TL = JSON.parse(readFileSync(segFile, 'utf8'));
    run.timelineErrors = TL.errors; run.seg = pick.seg; run.y = pick.v.y; run.m = pick.v.m;
    run.drift = TL.end && TL.offsetMs != null && TL.end.offsetMs != null ? Math.round((TL.end.offsetMs - TL.offsetMs) * 10) / 10 : null;
    run.opsBeforeStart = pick.v.ops.filter(([t]) => t < (pick.v.marks.find(([n]) => n === 'fwg:start')?.[1] ?? 0)).map(([, m]) => m);
    run.windows = windows(TL, pick.v);
    await sleep(800);
    const c = await openTab(`localhost:${s.port}`);
    try { run.census = await census(c); } catch (e) { run.census = { error: String(e.message || e) }; } finally { c.close(); }
    const W = (k) => run.windows.filter((w) => w.kind === k);
    const fmt = (w) => w ? `frames ${w.RenderingFrame} style ${w.RecalculateStyles} layout ${w.Layout} paint ${w.Paint} comp ${w.Composite} fc ${w.FunctionCall} raf ${w.FireAnimationFrame} ops ${w.listenerOps.length} tm ${w.touchmoves.prevented}/${w.touchmoves.n}` : '-';
    console.log(`${arm} r${REP}: y ${run.y} m ${run.m} drift ${run.drift} opsBeforeStart ${run.opsBeforeStart.length} | start ${fmt(W('start')[0])} | push-1 ${fmt(W('push-1')[0])} | push-n x${W('push-n').length} | hold ${fmt(W('hold')[0])} | census ${JSON.stringify(run.census)}`);
  } catch (e) { run.error = String(e.message || e); console.log(arm, 'error', run.error); }
  finally { p.kill(); res.runs.push(run); writeFileSync(f, JSON.stringify(res, null, 1)); }
}
console.log('wrote', f);

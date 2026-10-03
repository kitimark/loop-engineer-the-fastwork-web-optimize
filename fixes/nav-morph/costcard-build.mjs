// Build the F3 cost card table (§6 form) from costcard-chrome.mjs and costcard-sim.mjs outputs (fix-nav-morph).
// Until ts-costcard's tools/costcard.mjs (I-083) lands, this is the card's reducer; it applies the same rules:
// per load, push-n = median over pushes 2..N; hold-frame = hold counts / hold frames; then median over loads [range]
// per arm; tol = max(2·|C − C2|, 2 counts) (for per-frame rows: max(2·|C − C2|, 2 / hold frames)); mark "=" when
// |Δ| ≤ tol, "↓"/"↑" otherwise; "low-power" when tol > C/2; rows marked "ctx" are context, never judged.
//   node fixes/nav-morph/costcard-build.mjs --chrome a.json,b.json [--sim s1.json,s2.json] [--json out.json] > table.md
import { readFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const files = (k) => (arg(k) ? arg(k).split(',').filter(Boolean) : []);
const med = (a) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x) => (x == null ? null : Math.abs(x) >= 1e5 ? Number(x.toPrecision(3)) : Math.round(x * 100) / 100);
const ARMS = ['C', 'V', 'D', 'C2'];
const COUNTDOWN = new Set(['2.DyWL8TcE.js:4039', '2.DyWL8TcE.js:4142', 'BSBv9QXB.js:261']);
const TOUCHH = new Set(['2.DyWL8TcE.js:13314', '2.DyWL8TcE.js:13317']); // j (touchstart) and M (touchmove) of the morph effect, same lines in C/V/D

// ---- per-load values ------------------------------------------------------------------------------------------------
function chromeLoadRows(l) {
  const W = (k) => l.windows.filter((w) => w.kind === k);
  const sum = (o, keep) => Object.entries(o || {}).filter(([k]) => keep(k)).reduce((a, [, n]) => a + n, 0);
  const metrics = {
    'frames (BeginMainThreadFrame)': (w) => w.mainFrames,
    'listener adds/removes': (w) => w.listenerOps.length,
    'morph touch handler calls (j + M)': (w) => sum(w.fcBy, (k) => TOUCHH.has(k)),
    'touchmove dispatches': (w) => w.eventDispatch?.touchmove || 0,
    'style recalcs (UpdateLayoutTree)': (w) => w.styleRecalcs,
    'style elements recalculated': (w) => w.styleElements,
    'layouts': (w) => w.layouts,
    'paints': (w) => w.paints,
    // n/a when the window holds unbounded cull rects: at the morph start ~400 of ~700 Paints carry Chromium's infinite
    // cull rect (16777215 px a side) or a ~25000 px 3D-face rect, so their sum (~5e16 px²) means nothing
    'page paint area, Mpx² (cull rects: an upper bound, not element-attributed)': (w) => (w.paintArea > 1e12 ? null : w.paintArea / 1e6),
    'script calls (FunctionCall)': (w) => w.functionCalls,
    'script calls outside the countdown family': (w) => sum(w.fcBy, (k) => !COUNTDOWN.has(k)),
  };
  const out = {};
  for (const [name, f] of Object.entries(metrics)) {
    const s = W('start')[0], p1 = W('push-1')[0], pn = W('push-n'), h = W('hold')[0];
    out[`${name}|start`] = s ? f(s) : null;
    out[`${name}|push-1`] = p1 ? f(p1) : null;
    out[`${name}|push-n`] = pn.length ? med(pn.map(f)) : null;
    if (name !== 'frames (BeginMainThreadFrame)' && !/listener|touch/.test(name)) out[`${name}|hold-frame`] = h && h.mainFrames ? f(h) / h.mainFrames : null;
  }
  out['prevented share of pin touchmoves, %|pushes 1..N'] = l.pinTouchmoves?.n ? (100 * l.pinTouchmoves.prevented) / l.pinTouchmoves.n : null;
  out['layers at the pin (LayerTree)|pin'] = l.census?.layers ?? null;
  out['panel subtree layers|pin'] = l.census?.by?.panel?.layers ?? null;
  out['GPU memory estimate, all drawing layers, MB (w×h×4 device px)|pin'] = l.census ? l.census.estBytes / 1e6 : null;
  out['GPU memory estimate, panel subtree, MB|pin'] = l.census?.by?.panel ? l.census.by.panel.estBytes / 1e6 : null;
  return out;
}
function simRunRows(r) {
  const W = (k) => (r.windows || []).filter((w) => w.kind === k);
  const sum = (o, keep) => Object.entries(o || {}).filter(([k]) => keep(k)).reduce((a, [, n]) => a + n, 0);
  // per-load mode: in some loads the scroll engine's rAF scheduler (rE, JS 2668) runs every frame at the pin, in the
  // 4 s idle too (scroll or resize events every frame, cause unknown); it occurs in C, C2, V and D alike, so script
  // rows are also printed per mode ('loop on' / 'loop off') and compared within it
  const hw = W('hold')[0];
  const loopOn = hw && hw.RenderingFrame ? (hw.fcBy?.['2.DyWL8TcE.js:2668'] || 0) / hw.RenderingFrame > 0.5 : null;
  const mode = loopOn == null ? '' : loopOn ? ' [loop on]' : ' [loop off]';
  const metrics = {
    'frames (RenderingFrame)': (w) => w.RenderingFrame,
    'listener adds/removes (after mount)': (w) => w.listenerOps.length,
    'touchmove dispatches (EventDispatch)': (w) => w.eventDispatch?.touchmove || 0,
    'morph touch handler calls (j + M, JS 13314 + 13317)': (w) => sum(w.fcBy, (k) => /2\.DyWL8TcE\.js:(13314|13317)$/.test(k)),
    'scroll-engine rAF (rE, JS 2668)': (w) => w.fcBy?.['2.DyWL8TcE.js:2668'] || 0,
    'style recalcs (RecalculateStyles)': (w) => w.RecalculateStyles,
    'layouts': (w) => w.Layout,
    'paints': (w) => w.Paint,
    'composites': (w) => w.Composite,
    'page paint area, Mpx² (clip rects, not element-attributed)': (w) => w.paintArea / 1e6,
    'script records (FunctionCall + rAF + timer)': (w) => w.FunctionCall + w.FireAnimationFrame + w.TimerFire,
    'script records outside the countdown (rAF/timer at 4039/4142)': (w) => sum(w.fcBy, (k) => !/:(4039|4142)$/.test(k)),
  };
  const out = {};
  for (const [name, f] of Object.entries(metrics)) {
    const s = W('start')[0], p1 = W('push-1')[0], pn = W('push-n'), h = W('hold')[0];
    // Simulator windows differ in length between loads (the gesture's settle waits, the momentum into the end), so
    // every count except frames, listener ops and touchmoves is printed per RenderingFrame of its own event window
    const pf = !/^frames|listener|touch/.test(name);
    const g = (w) => (!w ? null : pf ? (w.RenderingFrame ? f(w) / w.RenderingFrame : null) : f(w));
    const ms = W('morph-start')[0];
    for (const sfx of /^script/.test(name) && mode ? ['', mode] : ['']) {
      out[`${name}${pf ? ' per frame' : ''}${sfx}|morph-start`] = g(ms);
      out[`${name}${pf ? ' per frame' : ''}${sfx}|push-1`] = g(p1);
      out[`${name}${pf ? ' per frame' : ''}${sfx}|push-n`] = pn.length ? med(pn.map(g)) : null;
      if (pf) out[`${name} per frame${sfx}|hold-frame`] = g(h);
    }
  }
  const tm = (r.windows || []).filter((w) => w.kind === 'push-1' || w.kind === 'push-n').reduce((a, w) => [a[0] + w.touchmoves.n, a[1] + w.touchmoves.prevented], [0, 0]);
  out['prevented share of pin touchmoves, %|pushes 1..N'] = tm[0] ? (100 * tm[1]) / tm[0] : null;
  out['layers at the pin (LayerTree)|pin'] = r.census?.layers ?? null;
  out['panel clock face layers|pin'] = r.census?.by?.face?.layers ?? null;
  out['layer memory, all layers, MB (WebKit LayerTree)|pin'] = r.census?.memory != null ? r.census.memory / 1e6 : null;
  out['layer memory, panel subtree, MB|pin'] = r.census?.by?.panel ? r.census.by.panel.memory / 1e6 : null;
  return out;
}

// ---- table -----------------------------------------------------------------------------------------------------------
const CTX = /paint area|^frames|GPU memory|layer memory|scroll-engine/; // context rows: printed, never marked
function table(engine, perArm, holdFrames) {
  const keys = [...new Set(Object.values(perArm).flatMap((ls) => ls.flatMap((r) => Object.keys(r))))];
  const rows = [];
  for (const key of keys) {
    const [field, event] = key.split('|');
    const v = {}, rg = {}, n = {};
    for (const a of ARMS) { const xs = (perArm[a] || []).map((r) => r[key]).filter((x) => x != null); v[a] = med(xs); rg[a] = xs.length ? [Math.min(...xs), Math.max(...xs)] : null; n[a] = xs.length; }
    const aa = v.C != null && v.C2 != null ? Math.abs(v.C - v.C2) : null;
    const framesC = engine === 'Sim' ? med((perArm.C || []).map((r) => r[`frames (RenderingFrame)|${event === 'hold-frame' ? 'hold' : event}`] ?? r['frames (RenderingFrame)|' + event]).filter((x) => x != null)) : null;
    const floor = /per frame/.test(field) ? 2 / (framesC || holdFrames || 240) : event === 'hold-frame' ? 2 / (holdFrames || 240) : /%|MB/.test(field) ? 0 : 2;
    const tol = aa == null ? null : Math.max(2 * aa, floor);
    const mk = (d) => (d == null || tol == null ? '' : CTX.test(field) ? 'ctx' : Math.abs(d) <= tol ? '=' : d < 0 ? '↓' : '↑');
    const dV = v.V != null && v.C != null ? v.V - v.C : null, dD = v.D != null && v.C != null ? v.D - v.C : null;
    const lowPower = tol != null && v.C != null && !CTX.test(field) && tol > Math.abs(v.C) / 2;
    rows.push({ engine, field, event, n, C: v.C, V: v.V, D: v.D, C2: v.C2, range: rg, aa, tol, dV, dD, markV: mk(dV), markD: mk(dD), lowPower });
  }
  return rows;
}
const fmtv = (x, rg) => (x == null ? 'n/a' : `${r2(x)}${rg && rg[0] !== rg[1] ? ` [${r2(rg[0])}-${r2(rg[1])}]` : ''}`);

const chrome = files('--chrome').map((f) => JSON.parse(readFileSync(f, 'utf8')));
const sims = files('--sim').map((f) => JSON.parse(readFileSync(f, 'utf8')));
const perArmC = Object.fromEntries(ARMS.map((a) => [a, []])), perArmS = Object.fromEntries(ARMS.map((a) => [a, []]));
const voids = [];
for (const d of chrome) for (const l of d.loads) { if (l.void || l.error || !l.windows) { voids.push({ engine: 'chrome', build: l.build, rep: l.rep, why: l.void || l.error }); continue; } perArmC[l.build].push(chromeLoadRows(l)); }
for (const d of sims) for (const r of d.runs) { if (r.void || r.error || !r.windows?.length) { voids.push({ engine: 'sim', build: r.arm, rep: r.rep, why: r.void || r.error || 'no windows' }); continue; } perArmS[r.arm].push(simRunRows(r)); }
const coverage = Object.assign({}, ...chrome.map((d) => d.coverage || {}));
const rows = [...table('Chrome', perArmC, 240), ...(sims.length ? table('Sim', perArmS, 240) : [])];
const lines = ['| # | field | event | engine | source | unit | C | V | D | V−C | D−C | mark (V / D) |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
rows.forEach((r, i) => {
  const unit = /MB/.test(r.field) ? 'MB' : /%/.test(r.field) ? '%' : /area/.test(r.field) ? 'Mpx²' + (/per frame/.test(r.field) ? ' per frame' : '') : r.event === 'hold-frame' || /per frame/.test(r.field) ? 'per frame' : 'per event';
  const mark = r.markV || r.markD ? `${r.markV} / ${r.markD}${r.lowPower ? ' low-power' : ''}` : '';
  lines.push(`| ${i + 1} | ${r.field} | ${r.event}${r.event === 'push-1' ? ` (n ${r.n.C}/${r.n.V}/${r.n.D})` : ''} | ${r.engine} | FULL | ${unit} | ${fmtv(r.C, r.range.C)} | ${fmtv(r.V, r.range.V)} | ${fmtv(r.D, r.range.D)} | ${r2(r.dV) ?? 'n/a'} | ${r2(r.dD) ?? 'n/a'} | ${mark} |`);
});
console.log(lines.join('\n'));
console.log(`\nloads per arm: Chrome ${ARMS.map((a) => `${a} ${perArmC[a].length}`).join(', ')}; Sim ${ARMS.map((a) => `${a} ${perArmS[a].length}`).join(', ')}; void/error ${voids.length}${voids.length ? ' ' + JSON.stringify(voids) : ''}`);
const loopModes = sims.flatMap((d) => d.runs.filter((r) => r.windows?.length).map((r) => { const h = r.windows.find((w) => w.kind === 'hold'); return `${r.arm} r${r.rep} ${h && h.RenderingFrame && (h.fcBy?.['2.DyWL8TcE.js:2668'] || 0) / h.RenderingFrame > 0.5 ? 'on' : 'off'}`; }));
if (loopModes.length) console.log(`Sim scroll-engine loop (rE, JS 2668, every frame at the pin) per load: ${loopModes.join(', ')}`);
console.log(`coverage (Chrome, % of a 10 px viewport grid whose hit path has a non-passive touchmove listener): ${Object.entries(coverage).map(([a, c]) => `${a} pre-morph ${c.preMorph?.touchmove} / mid-tween ${c.midTween?.touchmove} / pin ${c.pin?.touchmove}`).join('; ')}; Sim: n/a (logger installs after mount)`);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ tool: 'fix-nav-morph costcard-build', rules: 'README §6; push-n median within load; hold-frame = hold / frames; median over loads [range]; tol = max(2·|C−C2|, 2 counts | 2/frames per frame); ctx rows never judged', sources: { chrome: files('--chrome'), sim: files('--sim') }, rows, coverage, voids, perLoad: { chrome: perArmC, sim: perArmS } }, null, 1));

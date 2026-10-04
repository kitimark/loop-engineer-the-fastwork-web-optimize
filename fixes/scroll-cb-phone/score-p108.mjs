#!/usr/bin/env node
// P-108 scorer (fix-scroll-cb). Rules as registered in README "D card P-108"; committed before any P-108 data.
// usage (P-108 loads, the card's exact command): node fixes/scroll-cb-phone/score-p108.mjs out/scroll-cb-phone/p108 --aa-extra out/scroll-cb-phone/noise [--json out.json]
//        (noise run): node fixes/scroll-cb-phone/score-p108.mjs out/scroll-cb-phone/noise --noise [--json out.json]
//   <dir> holds counts-<vp>.json (Chrome, scb-probe.mjs) and sim-counts.json (Simulator, simcount.mjs).
//   --noise: C-only noise run (card item d): per-count C-vs-C spreads and normalised A/A diffs; nothing judged.
//   --aa-extra <noise dir>: the noise run's C loads also feed the A/A flake set (each diffed against this block's C1);
//   they never enter count means, spreads or the VOID check.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const argv = process.argv.slice(2);
const D = argv.find((a, i) => !a.startsWith('--') && !['--json', '--aa-extra'].includes(argv[i - 1])) || 'out/scroll-cb-phone/p108';
const NOISE = argv.includes('--noise');
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const EXTRA = opt('--aa-extra');
// N_vp frozen from the noise run (card item 7e, commit 4354a187): 2 x largest noise C-vs-C pair + 5. Not a flag.
const N_VP = Object.freeze({ phone: 5, phone775: 5, desk: 19, desk900: 5, resize: 9, sim: 5 });
if (argv.includes('--void-n')) { console.error('score-p108: --void-n was removed; N_vp is frozen per viewport (card item 7e)'); process.exit(2); }
if (!NOISE && !EXTRA) { console.error('score-p108: P-108 scoring needs --aa-extra out/scroll-cb-phone/noise (card item 7d)'); process.exit(2); }
if (EXTRA && !existsSync(EXTRA)) { console.error(`score-p108: --aa-extra dir not found: ${EXTRA}`); process.exit(2); }
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const spread = (a) => (a.length < 2 ? 0 : Math.max(...a) - Math.min(...a));
const OUT = { dir: D, noise: NOISE, nVp: N_VP, aaExtra: EXTRA || null, viewports: {} };

// --- state-log normalisation (card item 7) ---
// class tokens exact; style declarations exact, except:
//   eased floats -> rest-crossing state: --profile-scale "rest" (= 1) | "moving"; --future-shrink "0" | "1" | "between";
//   pshell transform "set" (absent = rest); transform-origin dropped (it follows transform);
//   --start-selling-intrinsic-block-size -> "written" (its values are reported per load; geometry decides, item 7c).
// After normalisation an entry counts only when its element's normalised state changes.
const DEFER = '--start-selling-intrinsic-block-size';
function normValue(key, v) {
  if (key === 'geom') return { v, defer: null };
  const bar = v.indexOf(' | ');
  if (bar < 0) return { v, defer: null };
  const cls = v.slice(0, bar), style = v.slice(bar + 3);
  let defer = null;
  const decls = style.split(';').map((d) => d.trim()).filter(Boolean).flatMap((d) => {
    const i = d.indexOf(':'); const p = d.slice(0, i).trim(), val = d.slice(i + 1).trim();
    if (p === DEFER) { defer = val; return [`${p}: written`]; }
    if (p === '--profile-scale') return [`${p}: ${parseFloat(val) === 1 ? 'rest' : 'moving'}`];
    if (p === '--future-shrink') { const x = parseFloat(val); return [`${p}: ${x === 0 ? '0' : x === 1 ? '1' : 'between'}`]; }
    if (p === 'transform-origin') return [];
    if (p === 'transform') return [`${p}: ${val ? 'set' : 'rest'}`];
    return [`${p}: ${val}`];
  });
  return { v: cls + ' | ' + decls.join('; '), defer };
}
function normLog(load) {
  const rows = (load.log || []).map((e) => (e.length === 4 ? { step: e[1], key: e[2], v: e[3] } : { step: e[0], key: e[1], v: e[2] }));
  const last = {}; const out = []; const defers = {};
  for (const r of rows) {
    const n = normValue(r.key, r.v);
    if (n.defer !== null) (defers[r.key] ||= new Set()).add(n.defer);
    if (last[r.key] === n.v) continue;
    last[r.key] = n.v; out.push(`${r.step}|${r.key}|${n.v}`);
  }
  return { entries: out, defers: Object.fromEntries(Object.entries(defers).map(([k, s]) => [k, [...s]])) };
}
const diff = (A, B) => { const a = new Set(A), b = new Set(B); return [...[...a].filter((x) => !b.has(x)).map((x) => '-' + x), ...[...b].filter((x) => !a.has(x)).map((x) => '+' + x)]; };

function parity(loads, extraC, vp) {
  const C = loads.filter((l) => l.arm === 'C'), V = loads.filter((l) => l.arm === 'V');
  if (!C.length) return null;
  const N = new Map(loads.map((l) => [l, normLog(l)]));
  const c1 = C[0];
  const aaPairs = C.slice(1).map((c) => ({ load: `${c.arm}${c.rep}`, diffs: diff(N.get(c1).entries, N.get(c).entries) }));
  const extraPairs = extraC.map((c) => ({ load: `noise-C${c.rep}`, diffs: diff(normLog(c1).entries, normLog(c).entries) }));
  const flakes = new Set([...aaPairs, ...extraPairs].flatMap((p) => p.diffs));
  const maxAA = Math.max(0, ...aaPairs.map((p) => p.diffs.length));
  // all C pairs (not only vs C1), for the noise run's N
  let maxAAall = 0;
  for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) maxAAall = Math.max(maxAAall, diff(N.get(C[i]).entries, N.get(C[j]).entries).length);
  const v = V.map((l) => { const d = diff(N.get(c1).entries, N.get(l).entries); const real = d.filter((x) => !flakes.has(x)); return { load: `V${l.rep}`, diffs: d.length, beyondAA: real.length, geomBeyondAA: real.filter((x) => x.split('|')[1] === 'geom').length, sample: real.slice(0, 12) }; });
  const deferC = {}; for (const c of C) for (const [k, vals] of Object.entries(N.get(c).defers)) for (const x of vals) (deferC[k] ||= new Set()).add(x);
  const deferV = V.map((l) => ({ load: `V${l.rep}`, notInC: Object.entries(N.get(l).defers).flatMap(([k, vals]) => vals.filter((x) => !deferC[k]?.has(x)).map((x) => `${k}=${x}`)) }));
  const nvp = N_VP[vp];
  if (nvp === undefined) throw new Error(`score-p108: no frozen N_vp for viewport ${vp}`);
  const voided = !NOISE && maxAA > nvp;
  return { c1: `C${c1.rep}`, extraAA: extraPairs.map((p) => `${p.load} ${p.diffs.length}`), aa: aaPairs.map((p) => ({ load: p.load, diffs: p.diffs.length, sample: p.diffs.slice(0, 8) })), maxAA, maxAAall, nVp: nvp, voided, v, deferC: Object.fromEntries(Object.entries(deferC).map(([k, s]) => [k, [...s]])), deferV,
    pass: !voided && V.length > 0 ? v.every((x) => x.beyondAA === 0) : null };
}

function rows(C, V, defs) {
  return defs.map(([name, get, rule]) => {
    const c = C.map(get), v = V.map(get);
    const sp = spread(c);
    const row = { name, C: c.map(r3), V: v.map(r3), cMean: r3(mean(c)), cSpread: r3(sp) };
    if (!V.length) return row;
    row.vMean = r3(mean(v)); row.dMean = r3(mean(v) - mean(c));
    if (rule === 'below') row.pass = Math.max(...v) < Math.min(...c);
    if (rule === 'equal') row.pass = Math.abs(mean(v) - mean(c)) <= 0.05;
    if (rule === 'guard') { row.tol = r3(Math.max(0.05, sp)); row.limit = r3(mean(c) + Math.max(0.05, sp)); row.pass = mean(v) <= mean(c) + Math.max(0.05, sp); }
    row.rule = rule;
    return row;
  });
}

const extraC = (file) => { if (!EXTRA || !existsSync(join(EXTRA, file))) return []; return JSON.parse(readFileSync(join(EXTRA, file), 'utf8')).loads.filter((l) => !l.void && l.arm === 'C'); };
const CH_GUARDS = ['forcedLayout', 'forcedUpdateLayoutTree', 'layout', 'updateLayoutTree', 'prePaint', 'paint', 'fireAnimationFrame'];
for (const vp of ['phone', 'phone775', 'desk', 'desk900', 'resize']) {
  const f = join(D, `counts-${vp}.json`);
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const valid = j.loads.filter((l) => !l.void);
  const C = valid.filter((l) => l.arm === 'C'), V = valid.filter((l) => l.arm === 'V');
  const judged = vp === 'phone' || vp === 'phone775'
    ? [['side raf/step', (l) => l.perStep.side.raf || 0, 'below'], ['side rect/step', (l) => l.perStep.side.rect || 0, 'below']]
    : vp === 'desk900' ? [['AE raf/step', (l) => l.sideByFn.AE.raf || 0, 'below'], ['AE rect/step', (l) => l.sideByFn.AE.rect || 0, 'below']]
    : vp === 'desk' ? [['side raf/step', (l) => l.perStep.side.raf || 0, 'equal'], ['side rect/step', (l) => l.perStep.side.rect || 0, 'equal']]
    : [['side raf/step', (l) => l.perStep.side.raf || 0, 'report'], ['side rect/step', (l) => l.perStep.side.rect || 0, 'report']];
  const guards = CH_GUARDS.map((g) => [g, (l) => l.trace.perStep[g] || 0, 'guard']);
  const res = { valid: { C: C.length, V: V.length }, voidLoads: j.loads.filter((l) => l.void).map((l) => `${l.arm}${l.rep}: ${l.void}`), pageErrors: valid.map((l) => `${l.arm}${l.rep}:${l.pageErrors.length}`),
    judged: NOISE ? rows(C, [], judged) : rows(C, V, judged), guards: NOISE ? rows(C, [], guards) : rows(C, V, guards), parity: parity(valid, extraC(`counts-${vp}.json`), vp) };
  OUT.viewports[vp] = res;
}
const sf = join(D, 'sim-counts.json');
if (existsSync(sf)) {
  const j = JSON.parse(readFileSync(sf, 'utf8'));
  const valid = j.loads.filter((l) => !l.void);
  const C = valid.filter((l) => l.arm === 'C'), V = valid.filter((l) => l.arm === 'V');
  const judged = [['side raf/step', (l) => l.perStep.side.raf || 0, 'below'], ['side rect/step', (l) => l.perStep.side.rect || 0, 'below']];
  const guards = ['styleRecalcs', 'layouts', 'forcedLayouts', 'paints', 'renderingFrames'].map((g) => [g, (l) => l.window.perStep[g] || 0, 'guard']);
  OUT.viewports.sim = { valid: { C: C.length, V: V.length }, voidLoads: j.loads.filter((l) => l.void).map((l) => `${l.arm}${l.rep}: ${l.void}`),
    judged: NOISE ? rows(C, [], judged) : rows(C, V, judged), guards: NOISE ? rows(C, [], guards) : rows(C, V, guards), parity: parity(valid, extraC('sim-counts.json'), 'sim'),
    paintBySec: valid.map((l) => ({ load: `${l.arm}${l.rep}`, ...l.paintBySec })) };
}
for (const [vp, r] of Object.entries(OUT.viewports)) {
  console.log(`\n== ${vp}: valid C ${r.valid.C} V ${r.valid.V}${r.voidLoads.length ? ' | VOID ' + r.voidLoads.join('; ') : ''}`);
  for (const x of [...r.judged, ...r.guards]) console.log(`  ${x.name.padEnd(24)} C ${JSON.stringify(x.C)} mean ${x.cMean} spread ${x.cSpread}${x.V.length ? ` | V ${JSON.stringify(x.V)} mean ${x.vMean} d ${x.dMean}${x.limit !== undefined ? ` tol ${x.tol} limit ${x.limit}` : ''} ${x.rule} ${x.pass === undefined ? '' : x.pass ? 'PASS' : 'FAIL'}` : ''}`);
  const p = r.parity;
  if (p) {
    console.log(`  A/A vs ${p.c1}: ${[...p.aa.map((a) => `${a.load} ${a.diffs}`), ...p.extraAA].join(', ')} (max ${p.maxAA}, max over all C pairs ${p.maxAAall}) N_vp ${p.nVp}${p.voided ? ` -> VOID (${p.maxAA} > ${p.nVp})` : ''}`);
    for (const v of p.v) console.log(`  parity ${v.load}: diffs ${v.diffs}, beyond A/A ${v.beyondAA} (geom ${v.geomBeyondAA}) ${v.sample.slice(0, 4).join('  ')}`);
    console.log(`  deferral sizes in C: ${JSON.stringify(p.deferC)}${p.deferV.length ? ' | V values not in C: ' + JSON.stringify(p.deferV) : ''}`);
    if (p.pass !== null) console.log(`  parity ${p.pass ? 'PASS' : 'FAIL'}`);
  }
  if (r.paintBySec) console.log('  Sim paints by section (reported): ' + JSON.stringify(r.paintBySec));
}
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(OUT, null, 1));

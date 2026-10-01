#!/usr/bin/env node
// Protocol v2 analysis (research/architecture/measurement-protocol-v2.md §3, §5.3; item T3). Library:
// tools/lib/stats.mjs (ANALYSIS CODE: it decides phone-block verdicts).
//
//   node tools/stats.mjs ticks <dt>...                        tick k of each frame time (k>=5 = ">34", k>=7 = ">50")
//   node tools/stats.mjs summary <x>...                       n, median [q1-q3], IQR, min, max
//   node tools/stats.mjs decide --c <x,x,..> --v <x,x,..> [--c .. --v ..] [--dir lower|higher] [--unit ms|ticks|count]
//                               [--predicted <improvement>] [--min-shift <x>] [--alpha 0.05] [--json]
//       one --c/--v pair per block (control, variant: per-run values of ONE metric); 1 block -> win / futile /
//       block2, 2 blocks -> win / no-win (stratified exact van Elteren). Exit 0 always on a decision.
//   node tools/stats.mjs runs <run.json|dir>... --metric k5|k7|gt34|gt50|p50Ms|p95Ms|p50Ticks|p95Ticks
//                               [--phase scroll] [--predicted <x>] [--min-shift <x>] [--json]
//       iPhone run files (meta.block, meta.arm 'C' | 'V' | 'A' | 'B'; meta.warmup / meta.void runs are
//       skipped) -> one decision per variant arm against C.
//   node tools/stats.mjs place <run.json|verify.json|dir>... --thresholds <th.json> [--min-ms 37.5] [--phase scroll]
//                               [--lvh 815] [--svh 775] [--inner-height 932] [--json]
//       every frame >= --min-ms placed at its nearest code-threshold crossing (§3.4). th.json:
//       {viewport: {lvh, svh}, thresholds: [{id, top, f, unit: ih|lvh|svh|dvh} | {id, y}]} or the bare array.
//       A run's own `tops` ({id: documentTop}) override the static `top` (topSource run | static).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tick, summary, frameCounts, sequentialDecision, runsFromJson, blocksFromRuns, placeFrames, METRICS, tickThresholdMs, K34 } from './lib/stats.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const VALUED = new Set(['--c', '--v', '--dir', '--unit', '--predicted', '--min-shift', '--alpha', '--metric', '--phase', '--thresholds', '--min-ms', '--lvh', '--svh', '--inner-height']);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !VALUED.has(i > 0 ? arr[i - 1] : argv[0]));
const asJson = argv.includes('--json');
const die = (msg) => { console.error(msg); process.exit(2); };
const numOpt = (n) => { const v = opt(n, null); if (v == null) return null; const x = Number(v); if (!Number.isFinite(x)) die(`bad --${n}: ${v}`); return x; };
const list = (s, what) => { const xs = String(s ?? '').split(',').filter(Boolean).map(Number); if (!xs.length || xs.some((x) => !Number.isFinite(x))) die(`bad ${what}: ${s}`); return xs; };
const f = (x) => (x == null ? '-' : Math.round(x * 1000) / 1000);
const USAGE = 'usage: node tools/stats.mjs ticks|summary|decide|runs|place ... (see the header of tools/stats.mjs)';

function files(inputs) {
  const out = [];
  for (const p of inputs) {
    if (!existsSync(p)) die(`not found: ${p}`);
    if (statSync(p).isDirectory()) { for (const x of readdirSync(p).sort()) if (x.endsWith('.json')) out.push(join(p, x)); } else out.push(p);
  }
  return out;
}
function loadRuns(inputs, o) {
  const runs = [];
  for (const file of files(inputs)) { let j; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; } runs.push(...runsFromJson(j, { ...o, file })); }
  return runs;
}
function printDecision(d, title = '') {
  const s = d.stats, c = s.choices;
  console.log(`${title}DECISION ${d.decision.toUpperCase()}: ${d.reason}`);
  console.log(`  test: ${s.test}; dir ${c.dir} (positive HL = variant better); unit ${c.unit}; min shift ${f(c.minShift)}; medians compared as ${c.medianCompare}`);
  console.log(`  rule: ${d.rule}`);
  const blocks = s.perBlock || [s];
  blocks.forEach((b, i) => console.log(`  block ${i + 1}: control ${f(b.control.median)} [${f(b.control.q1)}-${f(b.control.q3)}] n=${b.n[0]}  variant ${f(b.variant.median)} [${f(b.variant.q1)}-${f(b.variant.q3)}] n=${b.n[1]}  U ${b.u}  p ${f(b.p)}  HL ${f(b.shift)}`));
  if (s.perBlock) console.log(`  stratified: T ${f(s.t)}  p ${f(s.p)}  (worse: p ${f(s.pWorse)})  HL ${f(s.shift)};  aligned (diagnostic): U ${s.aligned.u}  p ${f(s.aligned.p)}  HL ${f(s.aligned.shift)}`);
}

if (cmd === 'ticks') {
  const xs = list(positional.join(','), 'frame times');
  const r = { ticks: xs.map((x) => tick(x)), ...frameCounts(xs) };
  if (asJson) console.log(JSON.stringify(r)); else console.log(`ticks ${r.ticks.join(' ')}  | k>=5 ${r.k5}  k>=7 ${r.k7}  on-time ${r.onTime}  (legacy >34 ${r.gt34}  >50 ${r.gt50})`);
} else if (cmd === 'summary') {
  const r = summary(list(positional.join(','), 'values'));
  if (asJson) console.log(JSON.stringify(r)); else console.log(`n ${r.n}  median ${f(r.median)} [${f(r.q1)}-${f(r.q3)}]  IQR ${f(r.iqr)}  min ${f(r.min)}  max ${f(r.max)}  (quartiles: linear interpolation, R type 7)`);
} else if (cmd === 'decide') {
  const cs = all('c'), vs = all('v');
  if (!cs.length || cs.length !== vs.length) die('decide: one --c and one --v per block');
  const blocks = cs.map((c, i) => ({ control: list(c, '--c'), variant: list(vs[i], '--v') }));
  let d;
  try { d = sequentialDecision({ blocks, dir: opt('dir', 'lower'), unit: opt('unit', 'ms'), predicted: numOpt('predicted'), minShift: numOpt('min-shift'), alpha: numOpt('alpha') ?? 0.05 }); } catch (e) { die(e.message); }
  if (asJson) console.log(JSON.stringify(d, null, 1)); else printDecision(d);
} else if (cmd === 'runs') {
  const metric = opt('metric', null);
  if (!METRICS[metric]) die(`runs: --metric ${Object.keys(METRICS).join('|')}`);
  if (!positional.length) die(USAGE);
  const runs = loadRuns(positional, { phase: opt('phase', 'scroll') });
  if (!runs.length) die('runs: no run files with frames');
  let byArm;
  try { byArm = blocksFromRuns(runs, metric); } catch (e) { die(e.message); }
  const out = {};
  for (const [arm, blocks] of Object.entries(byArm)) {
    try { out[arm] = sequentialDecision({ blocks, ...METRICS[metric], predicted: numOpt('predicted'), minShift: numOpt('min-shift') }); } catch (e) { die(`arm ${arm}: ${e.message}`); }
  }
  if (!Object.keys(out).length) die('runs: no block with both a control (C) and a variant arm');
  if (asJson) console.log(JSON.stringify({ metric, ...METRICS[metric], skipped: runs.filter((r) => r.warmup || r.void).length, arms: out }, null, 1));
  else { console.log(`metric ${metric} (${METRICS[metric].unit}, ${METRICS[metric].dir} is better); ${runs.length} run(s), ${runs.filter((r) => r.warmup || r.void).length} warm-up/void skipped`); for (const [arm, d] of Object.entries(out)) printDecision(d, `arm ${arm} vs C: `); }
} else if (cmd === 'place') {
  const thFile = opt('thresholds', null);
  if (!thFile || !positional.length) die(USAGE);
  const th = JSON.parse(readFileSync(thFile, 'utf8'));
  const thresholds = Array.isArray(th) ? th : th.thresholds;
  const viewport = { ...(th.viewport || {}), ...(numOpt('lvh') != null ? { lvh: numOpt('lvh') } : {}), ...(numOpt('svh') != null ? { svh: numOpt('svh') } : {}) };
  const minDt = numOpt('min-ms') ?? tickThresholdMs(K34);
  const runs = loadRuns(positional, { phase: opt('phase', 'scroll'), innerHeight: numOpt('inner-height') });
  if (!runs.length) die('place: no frames');
  let placed;
  try { placed = runs.map((r) => ({ label: r.label, run: r.run, source: r.source, frames: placeFrames(r.frames, thresholds, { minDt, viewport, tops: r.tops }) })); } catch (e) { die(`place: ${e.message}`); }
  if (asJson) console.log(JSON.stringify({ minDt, viewport, runs: placed }, null, 1));
  else {
    console.log(`frames >= ${f(minDt)} ms at their nearest crossing (delta 0 = crossed in the frame, + = past it); viewport ${JSON.stringify(viewport)}`);
    for (const r of placed) {
      console.log(`\n${r.label ?? '-'} run ${r.run} (${r.source}): ${r.frames.length} frame(s)`);
      for (const x of r.frames) console.log(`  dt ${f(x.dt)} (k ${x.k})  y ${f(x.yStart)}->${f(x.yEnd)}  ih ${x.innerHeight ?? '-'}  ${x.crossing} @ ${f(x.crossingY)} [${x.unit}, top ${x.topSource}]  delta ${f(x.delta)}`);
    }
  }
} else die(USAGE);

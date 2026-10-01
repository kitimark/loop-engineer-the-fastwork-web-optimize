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
//   node tools/stats.mjs runs <run.json|dir>... --metric gt50|gt34|gt46|gt54|gt30|gt38|p50Ms|p95Ms|k5|k7|p50Ticks|p95Ticks
//                               [--device phone|chrome] [--phase scroll] [--predicted <x>] [--min-shift <x>] [--json]
//       Run files (meta.block, meta.arm 'C' | 'V' | 'A' | 'B'; meta.warmup / meta.void runs are skipped) ->
//       one decision per variant arm against C, also decided by the metric's twins on a "both ways" line.
//       --device defaults to the runs' own (iPhone files phone, verify.json chrome; a mix is an error).
//       phone (CLAUDE.md "Frame thresholds"): no k forms (k5/k7/p50Ticks/p95Ticks are refused); p50Ms/p95Ms
//       use min shift 4 ms and medians in whole ms (arch-claims), counts compare raw; gt50 is checked at +-4 ms (gt46, gt54), gt34 likewise (gt30, gt38), and a verdict that
//       differs across them is THRESHOLD-SENSITIVE; the frames near the thresholds (near50 = 46 < dt <= 54,
//       near34 = 30 < dt <= 38) are listed per run, with median [IQR] per arm and block (never pooled). chrome (§3.2): twins k5/gt34, k7/gt50
//       ("threshold-sensitive"), p50Ms/p50Ticks, p95Ms/p95Ticks ("tick-sensitive"); medians as ticks for ms.
//       A counted run without a finite frame time in the phase is an error (void it); --phase all takes
//       every frame. WARN lines: unreadable files, runs with some non-finite frame times, dropped blocks,
//       block shape (n per arm, warm-up, ABBA order, no sentinel record: T2 judges the sentinel; mixed
//       meta.driver in a block or across the blocks of one decision, F-071), --device unlike the files, and
//       sensitivity when a twin's verdict differs.
//       Given 2 blocks, a block 1 that already stopped (win / futile) stands; block 2 is not evaluated.
//   node tools/stats.mjs place <run.json|verify.json|dir>... --thresholds <th.json> [--min-ms 37.5] [--phase scroll]
//                               [--lvh 815] [--svh 775] [--inner-height 932] [--json]
//       every frame >= --min-ms placed at its nearest code-threshold crossing (§3.4). th.json:
//       {viewport: {lvh, svh}, thresholds: [{id, top, f, unit: ih|lvh|svh|dvh} | {id, y}]} or the bare array.
//       A run's own `tops` ({id: documentTop}) override the static `top` (topSource run | static).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tick, summary, frameCounts, sequentialDecision, runsFromJson, blocksFromRuns, blockWarnings, nearByBlock, NEAR_KEYS, placeFrames, METRICS, twinsFor, twinKind, K_FORMS, tickThresholdMs, K34 } from './lib/stats.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const VALUED = new Set(['--c', '--v', '--dir', '--unit', '--predicted', '--min-shift', '--alpha', '--metric', '--device', '--phase', '--thresholds', '--min-ms', '--lvh', '--svh', '--inner-height']);
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
/** Runs of every readable file; an unreadable/truncated JSON and a run with a phase warning are reported on stderr. */
function loadRuns(inputs, o) {
  const runs = [], unreadable = [];
  for (const file of files(inputs)) {
    let j;
    try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { unreadable.push(file); console.error(`WARN unreadable JSON skipped: ${file} (${e.message})`); continue; }
    for (const r of runsFromJson(j, { ...o, file })) { if (r.warning) console.error(`WARN ${file}: ${r.warning}`); runs.push(r); }
  }
  return { runs, unreadable };
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
  if (asJson) console.log(JSON.stringify(r)); else console.log(`ticks ${r.ticks.join(' ')}  | k>=5 ${r.k5}  k>=7 ${r.k7}  on-time ${r.onTime}  | >50 ${r.gt50} (>46 ${r.gt46}, >54 ${r.gt54}, near ${r.near50})  >34 ${r.gt34} (>30 ${r.gt30}, >38 ${r.gt38}, near ${r.near34})`);
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
  const { runs, unreadable } = loadRuns(positional, { phase: opt('phase', 'scroll') });
  if (!runs.length) die('runs: no run files with frames');
  const seen = [...new Set(runs.map((r) => r.device))];
  if (seen.length > 1) die(`runs: mixed devices (${seen.join(', ')}): analyse phone and Chrome runs separately`);
  const device = opt('device', seen[0]);
  if (!['phone', 'chrome'].includes(device)) die(`runs: --device phone|chrome (got ${device})`);
  const deviceWarn = device !== seen[0] ? [`--device ${device} on ${seen[0]} files: ${device === 'chrome' ? 'Chrome rules (k forms, tick medians) on phone data' : 'phone rules (no k forms, raw medians) on Chrome data'}`] : [];
  if (device === 'phone' && K_FORMS.has(metric)) die(`runs: no k forms on the phone (CLAUDE.md "Frame thresholds"); use gt50 / gt34 (${metric} -> ${metric === 'k7' ? 'gt50' : metric === 'k5' ? 'gt34' : metric.replace('Ticks', 'Ms')})`);
  const decideAll = (m) => {
    let g;
    try { g = blocksFromRuns(runs, m); } catch (e) { die(e.message); }
    const out = {};
    for (const [arm, blocks] of Object.entries(g.arms)) {
      if (!blocks.length) continue;
      try { out[arm] = sequentialDecision({ blocks, ...METRICS[m], predicted: numOpt('predicted'), minShift: numOpt('min-shift'), platform: device }); } catch (e) { die(`arm ${arm}: ${e.message}`); }
    }
    return { out, dropped: g.dropped, partial: g.partial };
  };
  const { out, dropped, partial } = decideAll(metric);
  if (!Object.keys(out).length) die('runs: no block with both a control (C) and a variant arm');
  // every verdict also decided by its twins: chrome §3.2 / arch-unknowns U2, phone +-4 ms (CLAUDE.md)
  const tws = twinsFor(metric, device), kind = twinKind(metric);
  const twins = Object.fromEntries(tws.map((m) => [m, decideAll(m).out]));
  const sensitive = Object.keys(out).flatMap((a) => tws.filter((m) => twins[m][a] && twins[m][a].decision !== out[a].decision).map((m) => `arm ${a}: ${metric} ${out[a].decision} vs ${m} ${twins[m][a].decision}`));
  const sensArms = new Set(Object.keys(out).filter((a) => tws.some((m) => twins[m][a] && twins[m][a].decision !== out[a].decision)));
  // frames near a phone threshold, per arm, block and run (§5.3: never pooled; context for a threshold-sensitive verdict)
  const near = device === 'phone' ? nearByBlock(runs) : {};
  const warnings = [
    ...deviceWarn,
    ...unreadable.map((x) => `unreadable JSON skipped: ${x}`),
    ...partial.map((x) => `${x.source} (block ${x.block ?? '-'}, arm ${x.arm}): ${x.frames - x.finite} of ${x.frames} frame time(s) not finite; scored on ${x.finite}`),
    ...dropped.map((x) => `block ${x.block ?? '-'} dropped for arm ${x.arm}: ${x.reason}`),
    ...blockWarnings(runs),
    ...sensitive.map((x) => `${kind}: ${x}`),
  ];
  const skipped = runs.filter((r) => r.warmup || r.void).length;
  const tw = tws[0] ?? null;
  if (asJson) {
    console.log(JSON.stringify({ metric, ...METRICS[metric], device, medianCompare: Object.values(out)[0].stats.choices.medianCompare, minShift: Object.values(out)[0].stats.choices.minShift, skipped, unreadable, partial, dropped, warnings,
      twin: tw, twins: tws, twinSensitive: sensitive.length > 0, sensitivity: kind, ...(kind === 'threshold-sensitive' ? { thresholdSensitive: sensitive.length > 0 } : {}),
      sensitiveArms: [...sensArms], ...(device === 'phone' ? { near } : {}), arms: out, twinArms: tw ? twins[tw] : {}, twinsArms: twins }, null, 1));
  } else {
    console.log(`metric ${metric} (${METRICS[metric].unit}, ${METRICS[metric].dir} is better) on ${device}, twin${tws.length === 1 ? '' : 's'} ${tws.join(', ') || '-'}; ${runs.length} run(s), ${skipped} warm-up/void skipped, ${unreadable.length} unreadable`);
    for (const w of warnings) console.log(`WARN ${w}`);
    for (const [arm, d] of Object.entries(out)) {
      printDecision(d, `arm ${arm} vs C: `);
      const parts = tws.map((m) => { const t = twins[m][arm]; return `${m} ${t ? `${t.decision.toUpperCase()} (${t.reason})` : '-'}`; });
      console.log(`  both ways: ${metric} ${d.decision.toUpperCase()}${parts.length ? ` | ${parts.join(' | ')}` : ' (no twin)'}${sensArms.has(arm) ? `  ${kind.toUpperCase()}` : ''}`);
    }
    if (device === 'phone') {
      console.log('near thresholds per run (near50 = 46 < dt <= 54, near34 = 30 < dt <= 38; median [IQR] over the runs of one arm and block):');
      for (const [arm, bs] of Object.entries(near)) for (const b of bs) {
        console.log(`  arm ${arm} block ${b.block ?? '-'}: ${NEAR_KEYS.map((k) => `${k} ${f(b[k].median)} [${f(b[k].q1)}-${f(b[k].q3)}]`).join('  ')}`);
        for (const x of b.runs) console.log(`    pos ${x.pos ?? '-'} ${x.source ?? '-'}: ${x.frames} frames  ${NEAR_KEYS.map((k) => `${k} ${x[k]}`).join('  ')}`);
      }
    }
  }
} else if (cmd === 'place') {
  const thFile = opt('thresholds', null);
  if (!thFile || !positional.length) die(USAGE);
  const th = JSON.parse(readFileSync(thFile, 'utf8'));
  const thresholds = Array.isArray(th) ? th : th.thresholds;
  const viewport = { ...(th.viewport || {}), ...(numOpt('lvh') != null ? { lvh: numOpt('lvh') } : {}), ...(numOpt('svh') != null ? { svh: numOpt('svh') } : {}) };
  const minDt = numOpt('min-ms') ?? tickThresholdMs(K34);
  const { runs } = loadRuns(positional, { phase: opt('phase', 'scroll'), innerHeight: numOpt('inner-height') });
  if (!runs.length) die('place: no frames');
  let placed;
  try { placed = runs.map((r) => ({ label: r.label, run: r.run, source: r.source, frames: placeFrames(r.frames, thresholds, { minDt, viewport, tops: r.tops }) })); } catch (e) { die(`place: ${e.message}`); }
  // frames without a scroll position (logger --y-source none) are listed but not placed
  const warnings = placed.map((r) => [r, r.frames.filter((x) => x.noY).length]).filter(([, n]) => n).map(([r, n]) => `${r.source ?? r.label ?? '-'}: ${n} of ${r.frames.length} frame(s) have no scroll position (y source none?): not placed`);
  for (const w of warnings) console.error(`WARN ${w}`);
  if (asJson) console.log(JSON.stringify({ minDt, viewport, warnings, runs: placed }, null, 1));
  else {
    console.log(`frames >= ${f(minDt)} ms at their nearest crossing (delta 0 = crossed in the frame, + = past it); viewport ${JSON.stringify(viewport)}`);
    for (const w of warnings) console.log(`WARN ${w}`);
    for (const r of placed) {
      console.log(`\n${r.label ?? '-'} run ${r.run} (${r.source}): ${r.frames.length} frame(s)`);
      for (const x of r.frames) console.log(x.noY ? `  dt ${f(x.dt)} (k ${x.k})  no y: not placed` : `  dt ${f(x.dt)} (k ${x.k})  y ${f(x.yStart)}->${f(x.yEnd)}  ih ${x.innerHeight ?? '-'}  ${x.crossing} @ ${f(x.crossingY)} [${x.unit}, top ${x.topSource}]  delta ${f(x.delta)}`);
    }
  }
} else die(USAGE);

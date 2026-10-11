#!/usr/bin/env node
// Long-frame clusters by scroll position across runs (experiment E5): where do the long frames land?
//
//   node tools/frames.mjs <verify.json | dir | iphone.json>... [--phase scroll] [--min-ms 34] [--bucket 50] [--min-share 0.6] [--json]
//
// Inputs: verify.json from `verify.mjs --frame-log` / `fix.mjs ab --frame-log` (out/ab/<topic>/<stamp>/,
// per-frame [t, dt, scrollY] per phase, grouped by target label: base / fix / base2) and iPhone logs from
// `iphone.mjs scroll` (out/iphone/*.json, grouped by their label). A directory means every *.json in it.
// Prints, per label, the scrollY ranges where a frame > --min-ms occurs in >= --min-share of the runs
// (frames and ms per run), and for two labels which clusters both sides share. An A/A should show the
// same clusters on both sides. Library: tools/lib/frames.mjs.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runsFromJson, clusters, compare } from './lib/frames.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--phase', '--min-ms', '--bucket', '--min-share'];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const inputs = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
if (!inputs.length) { console.error('usage: node tools/frames.mjs <verify.json|dir|iphone.json>... [--phase scroll] [--min-ms 34] [--bucket 50] [--min-share 0.6] [--json]'); process.exit(2); }
const o = { minMs: Number(opt('min-ms', 34)), bucketPx: Number(opt('bucket', 50)), minShare: Number(opt('min-share', 0.6)) };
for (const [k, v] of Object.entries(o)) if (!(v > 0)) { console.error(`bad --${k}: ${v}`); process.exit(2); }
const phase = opt('phase', 'scroll');

const files = [];
for (const p of inputs) {
  if (!existsSync(p)) { console.error(`not found: ${p}`); process.exit(2); }
  if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) { if (f.endsWith('.json')) files.push(join(p, f)); } else files.push(p);
}
const runs = [];
for (const f of files) { let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; } runs.push(...runsFromJson(j, { file: f, phase })); }
if (!runs.length) { console.error(`no per-frame logs for phase "${phase}" in ${files.length} file(s) (verify.mjs needs --frame-log)`); process.exit(1); }
const res = clusters(runs, o);
const labels = res.map((r) => r.label);
const cmp = res.length === 2 ? compare(res[0], res[1]) : null;
if (argv.includes('--json')) { console.log(JSON.stringify({ phase, ...o, labels: res, compare: cmp }, null, 1)); process.exit(0); }
console.log(`phase ${phase}: frames > ${o.minMs} ms in ${o.bucketPx} px scrollY buckets, stable = in >= ${Math.round(o.minShare * 100)} % of runs`);
for (const r of res) {
  console.log(`\n${r.label}: ${r.runs} run(s), ${r.clusters.length} stable cluster(s)`);
  for (const c of r.clusters) console.log(`  y ${String(c.y0).padStart(5)}-${String(c.y1).padEnd(5)}  in ${c.runsHit}/${r.runs} runs  ${c.framesPerRun} frames/run  ${c.msPerRun} ms/run`);
}
if (cmp) {
  const fmt = (c) => `${c.y0}-${c.y1}`;
  console.log(`\n${labels[0]} vs ${labels[1]}: ${cmp.common.length} shared, ${cmp.onlyA.length} only ${labels[0]} (${cmp.onlyA.map(fmt).join(', ') || '-'}), ${cmp.onlyB.length} only ${labels[1]} (${cmp.onlyB.map(fmt).join(', ') || '-'})`);
  for (const { a, b } of cmp.common) console.log(`  ${fmt(a)}: ${a.framesPerRun} vs ${b.map((x) => x.framesPerRun).join('+')} frames/run, ${a.msPerRun} vs ${b.map((x) => x.msPerRun).join('+')} ms/run`);
}

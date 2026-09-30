#!/usr/bin/env node
// Summarize loadmon.jsonl: per phase (a time window or the lock holder), medians/p90 of load, total CPU,
// CPU by process family and memory.
// Usage: node monsum.mjs <loadmon.jsonl> [--phases phases.json] [--by holder]
//   phases.json: [{"name":"c1","from":"ISO","to":"ISO"}, ...]
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
const opt = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const samples = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((s) => s.mem); // memory-aware samples only
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const r1 = (x) => Math.round(x * 10) / 10;

let groups;
if (opt('phases')) {
  const phases = JSON.parse(readFileSync(opt('phases'), 'utf8'));
  groups = phases.map((p) => [p.name, samples.filter((s) => s.ts >= p.from && s.ts <= p.to)]);
} else {
  const by = new Map();
  for (const s of samples) { const k = s.lock?.holder ? (s.lock.holder === 'measure-parallel' ? 'measure-parallel' : 'other agent measuring') : 'lock free'; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  groups = [...by.entries()];
  groups.unshift(['all', samples]);
}
const FAMS = ['chrome_measured_renderer', 'chrome_measured_gpu', 'chrome_measured_browser', 'chrome_measured_other', 'chrome_other', 'node_servers', 'node_measure_tools', 'node_tests', 'node_mcp', 'node_other', 'claude', 'serena_python', 'windowserver', 'kernel_task', 'shell_tools', 'other'];
const lines = [];
lines.push(`${samples.length} samples ${samples[0]?.ts} .. ${samples.at(-1)?.ts} (CPU % of the whole 8-core machine; median / p90)`);
lines.push('');
lines.push('| phase | n | load1 med [p10-p90] | CPU % med / p90 | measured Chrome (rend/gpu/browser+other) | other Chrome | node servers | node tools+tests | claude | serena/python | WindowServer | other | free GB | compressor GB | decompr/s med | pageins/s med |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [name, ss] of groups) {
  if (!ss.length) continue;
  const f = (k) => ss.map((s) => s.fam[k] || 0);
  const mm = (a) => `${r1(q(a, 0.5))} / ${r1(q(a, 0.9))}`;
  const sum = (ks) => ss.map((s) => ks.reduce((a, k) => a + (s.fam[k] || 0), 0));
  lines.push(`| ${name} | ${ss.length} | ${r1(q(ss.map((s) => s.load1), 0.5))} [${r1(q(ss.map((s) => s.load1), 0.1))}-${r1(q(ss.map((s) => s.load1), 0.9))}] | ${mm(ss.map((s) => s.cpuPct))} | ${mm(f('chrome_measured_renderer'))} / ${mm(f('chrome_measured_gpu'))} / ${mm(sum(['chrome_measured_browser', 'chrome_measured_other']))} | ${mm(f('chrome_other'))} | ${mm(f('node_servers'))} | ${mm(sum(['node_measure_tools', 'node_tests', 'node_other', 'node_mcp']))} | ${mm(f('claude'))} | ${mm(f('serena_python'))} | ${mm(f('windowserver'))} | ${mm(sum(['other', 'kernel_task', 'shell_tools']))} | ${r1(q(ss.map((s) => s.mem.freeGB), 0.5))} | ${r1(q(ss.map((s) => s.mem.compressorGB), 0.5))} | ${q(ss.map((s) => s.mem.decompressionsPerSec), 0.5)} | ${q(ss.map((s) => s.mem.pageinsPerSec), 0.5)} |`);
}
const np = samples.at(-1)?.nProcs || {};
lines.push('');
lines.push(`process counts (last sample): node servers ${np.node_servers || 0}, node other ${np.node_other || 0}, node tools ${np.node_measure_tools || 0}, other Chrome ${np.chrome_other || 0}, measured Chrome roots ${samples.at(-1)?.nChromeMeasuredRoots}; memory pressure levels seen: ${[...new Set(samples.map((s) => s.mem.pressure))].join(',')}; swap used max ${Math.max(...samples.map((s) => s.mem.swapUsedMB || 0))} MB`);
console.log(lines.join('\n'));

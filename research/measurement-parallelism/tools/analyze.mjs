#!/usr/bin/env node
// Analyze the parallel A/A experiment written by par.mjs.
// Usage: node analyze.mjs <scratch> <tag> [<tag> ...] [--json out.json] [--mon loadmon.jsonl]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const val = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const jsonOut = val('json'), monFile = val('mon');
const pos = argv.filter((a, i) => !a.startsWith('--') && !['--json', '--mon'].includes(argv[i - 1]));
const [scratch, ...tags] = pos;
const M = ['fps', 'gt20', 'gt34', 'gt50', 'max', 'p95', 'loafMs', 'forcedLayoutMs'];
const MORPH = ['fps', 'gt50', 'loafMs'];
const FLOOR = { fps: [71.4, 77], gt20: [54, 78], gt34: [7, 10], gt50: [3, 5], loafMs: [195, 283], forcedLayoutMs: [34, 83] }; // published A/A, 5 runs x 2 sides
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mad = (a) => { const m = med(a); return med(a.map((x) => Math.abs(x - m))); };
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const r1 = (x) => Math.round(x * 10) / 10;
const mon = monFile ? readFileSync(monFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((s) => s.mem) : [];

const out = { conditions: {} };
const lines = [];
for (const tag of tags) {
  const dir = join(scratch, tag);
  if (!existsSync(join(dir, 'meta.json'))) { lines.push(`(${tag}: no meta.json)`); continue; }
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const runs = [];
  const perProc = [];
  for (const pd of readdirSync(dir).filter((d) => /^p\d+$/.test(d)).sort()) {
    const vf = join(dir, pd, 'verify.json');
    if (!existsSync(vf)) { perProc.push({ proc: pd, missing: true }); continue; }
    const v = JSON.parse(readFileSync(vf, 'utf8'));
    // per-measurement timestamps from the timestamped stdout: "[mobile run k/N] label url ... " then the result line
    const log = existsSync(join(dir, pd, 'log.jsonl')) ? readFileSync(join(dir, pd, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    const starts = log.filter((e) => e.s && /^\[mobile run/.test(e.s)).map((e) => e.ts);
    const ends = log.filter((e) => e.s && /fps [\d.]+ +>20ms/.test(e.s)).map((e) => e.ts);
    let k = 0;
    const rs = v.results.filter((r) => !r.diff && r.scrollSummary);
    for (const r of rs) {
      runs.push({ proc: pd, label: r.label, run: r.run, seq: k, start: starts[k], end: ends[k], loadBefore: r.loadavg1?.before, loadAfter: r.loadavg1?.after,
        ...Object.fromEntries(M.map((m) => [m, r.scrollSummary[m]])), ...Object.fromEntries(MORPH.map((m) => ['morph_' + m, r.morphSummary[m]])), scrollMs: r.scroll?.ms });
      k++;
    }
    const pr = runs.filter((r) => r.proc === pd);
    const a = pr.filter((r) => r.label === 'base'), b = pr.filter((r) => r.label === 'base2');
    const falsePos = {};
    for (const m of M) {
      const [av, bv] = [a.map((r) => r[m]), b.map((r) => r[m])];
      if (av.length >= 3 && bv.length >= 3 && (Math.min(...av) > Math.max(...bv) || Math.min(...bv) > Math.max(...av))) falsePos[m] = true;
    }
    perProc.push({ proc: pd, n: pr.length, ...Object.fromEntries(M.map((m) => [m, { median: med(pr.map((r) => r[m])), min: Math.min(...pr.map((r) => r[m])), max: Math.max(...pr.map((r) => r[m])) }])),
      aaFalsePositive: Object.keys(falsePos), baseMinusBase2: Object.fromEntries(M.map((m) => [m, r1(med(a.map((r) => r[m])) - med(b.map((r) => r[m])))])),
      durationS: (() => { const p = meta.procs.find((q) => `p${q.i}` === pd); return p ? Math.round((Date.parse(p.end) - Date.parse(p.start)) / 1000) : null; })() });
  }
  const ss = mon.filter((s) => s.ts >= meta.startedAt && s.ts <= meta.endedAt);
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const load = ss.length ? { n: ss.length, load1Med: r1(q(ss.map((s) => s.load1), 0.5)), load1Max: r1(Math.max(...ss.map((s) => s.load1))), cpuMed: r1(q(ss.map((s) => s.cpuPct), 0.5)), cpuP90: r1(q(ss.map((s) => s.cpuPct), 0.9)),
    measuredRendererMed: r1(q(ss.map((s) => s.fam.chrome_measured_renderer || 0), 0.5)), measuredGpuMed: r1(q(ss.map((s) => s.fam.chrome_measured_gpu || 0), 0.5)), windowServerMed: r1(q(ss.map((s) => s.fam.windowserver || 0), 0.5)),
    freeGBMin: Math.min(...ss.map((s) => s.mem.freeGB)), pageinsMed: q(ss.map((s) => s.mem.pageinsPerSec), 0.5), decompMed: q(ss.map((s) => s.mem.decompressionsPerSec), 0.5), maxChromeRoots: Math.max(...ss.map((s) => s.nChromeMeasuredRoots)) } : null;
  const pooled = Object.fromEntries(M.map((m) => { const a = runs.map((r) => r[m]); return [m, { n: a.length, median: r1(med(a)), min: Math.min(...a), max: Math.max(...a), sd: r1(sd(a)), mad: r1(mad(a)) }]; }));
  const pooledMorph = Object.fromEntries(MORPH.map((m) => { const a = runs.map((r) => r['morph_' + m]); return [m, { median: r1(med(a)), min: Math.min(...a), max: Math.max(...a) }]; }));
  out.conditions[tag] = { meta, load, pooled, pooledMorph, perProc, runs };

  lines.push(`\n### ${tag}: ${meta.conc} simultaneous process(es) x ${meta.runs} runs x 2 sides (${meta.startedAt.slice(11, 19)}-${meta.endedAt.slice(11, 19)} UTC)`);
  if (load) lines.push(`monitor: load1 median ${load.load1Med} (max ${load.load1Max}), CPU ${load.cpuMed}% (p90 ${load.cpuP90}%), measured renderers ${load.measuredRendererMed}%, GPU ${load.measuredGpuMed}%, WindowServer ${load.windowServerMed}%, free min ${load.freeGBMin} GB, pageins/s ${load.pageinsMed}, measured Chromes up to ${load.maxChromeRoots}`);
  lines.push('');
  lines.push('| metric | pooled median [min-max] | SD | MAD | per-process medians | per-process [min-max] | published floor |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const m of M) {
    const p = pooled[m];
    lines.push(`| ${m} | ${p.median} [${p.min}-${p.max}] | ${p.sd} | ${p.mad} | ${perProc.filter((x) => !x.missing).map((x) => x[m].median).join(' / ')} | ${perProc.filter((x) => !x.missing).map((x) => `${x[m].min}-${x[m].max}`).join(' / ')} | ${FLOOR[m] ? FLOOR[m].join('-') : ''} |`);
  }
  lines.push(`| morph fps | ${pooledMorph.fps.median} [${pooledMorph.fps.min}-${pooledMorph.fps.max}] | | | | | |`);
  lines.push(`\nA/A false positives (base vs base2 ranges don't overlap, per process): ${perProc.map((x) => `${x.proc}: ${x.aaFalsePositive?.length ? x.aaFalsePositive.join(',') : 'none'}`).join('; ')}`);
  lines.push(`base - base2 median deltas: ${perProc.map((x) => `${x.proc} gt20 ${x.baseMinusBase2?.gt20} fps ${x.baseMinusBase2?.fps} loaf ${x.baseMinusBase2?.loafMs}`).join('; ')}`);
  lines.push(`process wall time (s): ${perProc.map((x) => `${x.proc} ${x.durationS}`).join(', ')}`);
}
console.log(lines.join('\n'));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));

#!/usr/bin/env node
// O1 attribution from P-156's counted part-A runs (descriptive; no device, no measurement): for each run's first open
// (P-153's opens(), O1), the Timeline records that overlap the gaps of f1, f2 and f3, summed by record type (ms clipped to
// the gap, count), plus the record types that appear in A's f2 gap and not in C's. Uses the runs' own Timeline captures
// (tl-<run>.json, maxCallStackDepth 1), so it names work types, not functions.
//   node fixes/end-morph-p1/phone/o1-attr.mjs out/p156/runs [--json out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..', '..');
const { flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { opens } = await import(pathToFileURL(join(here, 'p153-read.mjs')).href);
const dir = process.argv[2], jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (!dir) { console.log('usage: node fixes/end-morph-p1/phone/o1-attr.mjs <runs folder> [--json out.json]'); process.exit(2); }
const r1 = (x) => Math.round(x * 10) / 10;
const out = {};
for (const arm of ['C', 'A']) for (let k = 1; k <= 4; k++) {
  const nm = `E${arm}${k}`, gf = join(dir, `g-${nm}.json`), tf = join(dir, `tl-${nm}.json`);
  if (!existsSync(gf) || !existsSync(tf)) continue;
  const g = JSON.parse(readFileSync(gf, 'utf8')), tl = JSON.parse(readFileSync(tf, 'utf8'));
  const fr = g.run.segments[0].frames, o = opens(g)[0];
  if (!o) continue;
  const flat = flatten(tl.recs, tl.offsetMs);
  const gaps = {};
  for (const [lab, j] of [['f1', o.i], ['f2', o.i + 1], ['f3', o.i + 2]]) {
    if (!fr[j]) continue;
    const hi = fr[j][0], lo = hi - fr[j][1], by = {};
    for (const r of flat) {
      if (r.b <= lo || r.a >= hi) continue;
      const d = Math.min(r.b, hi) - Math.max(r.a, lo);
      (by[r.type] ||= { ms: 0, n: 0 }); by[r.type].ms += d; by[r.type].n++;
    }
    for (const t of Object.keys(by)) by[t].ms = r1(by[t].ms);
    gaps[lab] = { dt: fr[j][1], by };
  }
  out[nm] = { arm, gaps };
}
// per arm: median ms per type in the f2 gap
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const summary = {};
for (const lab of ['f1', 'f2', 'f3']) {
  const types = new Set(Object.values(out).flatMap((r) => Object.keys(r.gaps[lab]?.by || {})));
  summary[lab] = {};
  for (const t of [...types].sort()) {
    const v = (arm) => Object.values(out).filter((r) => r.arm === arm).map((r) => r.gaps[lab]?.by?.[t]?.ms ?? 0);
    const n = (arm) => Object.values(out).filter((r) => r.arm === arm).map((r) => r.gaps[lab]?.by?.[t]?.n ?? 0);
    summary[lab][t] = { C: med(v('C')), A: med(v('A')), nC: med(n('C')), nA: med(n('A')) };
  }
}
for (const lab of ['f1', 'f2', 'f3']) {
  const dts = (arm) => Object.values(out).filter((r) => r.arm === arm).map((r) => r.gaps[lab]?.dt);
  console.log(`${lab} gap dt C ${dts('C').join(',')} | A ${dts('A').join(',')}`);
  for (const [t, s] of Object.entries(summary[lab])) if (s.C || s.A) console.log(`   ${t.padEnd(26)} C ${String(s.C).padStart(5)} ms (n ${s.nC})  A ${String(s.A).padStart(5)} ms (n ${s.nA})${s.A - s.C >= 1 ? '  A +' + r1(s.A - s.C) : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ runs: out, summary }, null, 1));

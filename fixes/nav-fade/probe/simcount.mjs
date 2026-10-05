#!/usr/bin/env node
// nav-fade batch 9 scorer (written and committed before batch 9's data): applies README "Batch 9 rule" to the pooled
// Simulator count runs (batch 8 t8a/t8b/e8a/e8b + batch 9 t9c-t9f/e9c-e9f) of motion.mjs --engine sim --passes counts.
//   node fixes/nav-fade/probe/simcount.mjs <motion dir> [<motion dir> ...]
// Per arm and scene: Paint, Layout, RecalculateStyles (raw and per frame), W = Paint + Layout + RecalculateStyles per
// frame; then the verdicts R1-R5. "frames" = the probe's rAF frame count for the scene window.
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
const CTL = 'C', ARM = 'nav-fade', MIN_N = 5;
const rows = { topIn: { [CTL]: [], [ARM]: [] }, end: { [CTL]: [], [ARM]: [] } };
const failed = [];
for (const d of process.argv.slice(2)) {
  const J = JSON.parse(readFileSync(join(d, 'motion.json'), 'utf8'));
  if (J.engine !== 'sim') { failed.push(`${basename(d)}: not a Simulator run`); continue; }
  for (const r of J.runs) {
    if (!(r.arm in rows.topIn)) continue;
    if ((r.failed || []).length || (r.errors || []).length) { failed.push(`${basename(d)} ${r.arm}: failed/errors`); continue; }
    for (const [sc, s] of Object.entries(r.scen || {})) {
      const t = s.counts?.types; const f = s.frames;
      if (!rows[sc] || !t || !f) { if (rows[sc]) failed.push(`${basename(d)} ${r.arm} ${sc}: no counts`); continue; }
      const P = t.Paint || 0, L = t.Layout || 0, R = t.RecalculateStyles || 0;
      rows[sc][r.arm].push({ run: basename(d).replace(/^motion-sim-/, '').slice(0, 3), f, P, L, R, Lf: L / f, Rf: R / f, Wf: (P + L + R) / f });
    }
  }
}
const rng = (a, k) => { const v = a.map((x) => x[k]); return [Math.min(...v), Math.max(...v)]; };
const med = (a, k) => { const v = a.map((x) => x[k]).sort((x, y) => x - y); const n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
const fmt = ([a, b], d = 0) => `${a.toFixed(d)}-${b.toFixed(d)}`;
// better: arm max < control min; WORSE: arm min > control max; else within noise
const cmp = (sc, k) => { const c = rng(rows[sc][CTL], k), a = rng(rows[sc][ARM], k); return a[1] < c[0] ? 'lower' : a[0] > c[1] ? 'higher' : 'overlap'; };
for (const sc of Object.keys(rows)) for (const arm of [CTL, ARM]) {
  const a = rows[sc][arm];
  console.log(`${sc.padEnd(5)} ${arm.padEnd(8)} n=${a.length} runs ${a.map((x) => x.run).join(',')} | Paint ${fmt(rng(a, 'P'))} | Layout ${fmt(rng(a, 'L'))} (${fmt(rng(a, 'Lf'), 2)}/frame) | Recalc ${fmt(rng(a, 'R'))} (${fmt(rng(a, 'Rf'), 2)}/frame) | W/frame ${fmt(rng(a, 'Wf'), 2)} median ${med(a, 'Wf').toFixed(2)} | frames ${fmt(rng(a, 'f'))}`);
}
if (failed.length) console.log('failed / skipped (not replaced):', failed.join('; '));
const enough = Object.values(rows).every((s) => s[CTL].length >= MIN_N && s[ARM].length >= MIN_N);
if (!enough) console.log(`INCOMPLETE: fewer than ${MIN_N} completed runs per arm and scene; the claims stay as committed at n=2`);
const v = {
  R1_topInPaint: cmp('topIn', 'P') === 'lower' ? 'CONFIRMED' : 'VOID (Simulator Paint claim withdrawn; the Chrome claim stands)',
  R2_endPaint: { lower: 'better', higher: 'WORSE', overlap: 'within noise' }[cmp('end', 'P')],
  R3_P4_topInRecalcPerFrame: { lower: 'lower', higher: 'rise (P4 stays UNRESOLVED as to cause)', overlap: 'within noise' }[cmp('topIn', 'Rf')],
  R4_P5_endLayoutPerFrame: { lower: 'lower', higher: 'rise', overlap: 'within noise' }[cmp('end', 'Lf')],
  R4_P5_topInLayoutPerFrame: { lower: 'lower', higher: 'rise', overlap: 'within noise' }[cmp('topIn', 'Lf')],
  R5_lessWork: cmp('topIn', 'Wf') === 'lower' && med(rows.end[ARM], 'Wf') <= med(rows.end[CTL], 'Wf') ? 'PASS' : 'FAIL (the lead decides; no less-work landing claim)',
};
console.log((enough ? '' : 'INCOMPLETE ') + 'VERDICTS ' + JSON.stringify(v));

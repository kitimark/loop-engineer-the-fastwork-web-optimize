#!/usr/bin/env node
// P-137 reader (frozen before data; card: fixes/end-bg/README.md "P-137"). End-of-page backgrounds ablation on the
// iPhone: C (v9-final + morph-scroll 7d) vs V (C + nobg.css: every background image, gradient, grain layer and backdrop
// photo of the last screen stops painting; boxes, layout and scripts unchanged). A pure reader: no device, no measurement.
//   node fixes/end-bg/phone/p137-read.mjs <folder> [--json out.json]      (folder: out/p137/runs)
//   node fixes/end-bg/phone/p137-read.mjs --selftest
// Runs: counted EC1-EC4 (C) and EV1-EV4 (V), g-<run>.json + tl-<run>.json; a re-run <run>r replaces its run when the
// first try is INVALID (the first valid try counts; both valid: the first one). Sentinels S0, S1 (g- only).
// Per run, the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) gives the gates G1-G6
// and per moving frame: dt, band, toolbar step, class (busy) and classRF (busyRF). Nothing of it is changed here.
// METRIC (the same read as T-194, iphone-runner's out/t194/read.mjs): moving frames in the reader's lastScreen band
//   (scrollY >= docH - 2 innerHeight) whose last touch event before the frame is a touchend ("after touchend").
//   Per run: n = such moving frames; s(th) = those with dt > th, th in 30, 34, 38 (the >34 decision and its twins) and
//   46, 50, 54 (the >50 reading and its twins).
// DECISION (>34, per-run counts; at least 3 valid runs per arm, else THIN; a failed sentinel: VOID):
//   CAUSE        max(V) < min(C) and median(V) <= 0.5 median(C)
//   CONTRIBUTES  max(V) < min(C) and median(V) >  0.5 median(C)
//   WORSE        min(V) > max(C)
//   NOT SHOWN    otherwise (the ranges touch or overlap)
//   Denominator guard: when median n differs between the arms by more than 15 % of C's median, the same rule runs on the
//   per-run rates s/n instead of counts, and the output says so.
//   Twins: the same rule at >30 and >38; a twin with another verdict makes the >34 verdict "threshold-sensitive".
//   >50 (twins >46, >54): the same rule, reported, decides nothing (about 4-5 frames per run on C in T-194: thin).
// DESCRIPTIVE (decides nothing): per arm the class split of the >34 frames in the metric (busy, and busyRF), and the
//   toolbar-step share; all-band moving fps per run.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
export const TH = [30, 34, 38, 46, 50, 54];
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/** The decision rule on two arrays of per-run values. */
export function verdict(c, v) {
  if (c.length < 3 || v.length < 3) return 'THIN';
  const mc = med(c), mv = med(v);
  if (Math.max(...v) < Math.min(...c)) return mv <= 0.5 * mc ? 'CAUSE' : 'CONTRIBUTES';
  if (Math.min(...v) > Math.max(...c)) return 'WORSE';
  return 'NOT SHOWN';
}

/** Metric rows of one readRun result (moving lastScreen frames after a touchend). */
export function metric(g, r) {
  const seg = g.run.segments[0], fr = seg.frames, tc = seg.touches || [];
  const rows = r.rows.filter((x) => x.band === 'lastScreen').filter((x) => {
    const t = fr[x.i][0]; let last = null; for (const e of tc) if (e[0] <= t) last = e;
    return last && last[1] === 'e';
  });
  const s = Object.fromEntries(TH.map((th) => [th, rows.filter((x) => x.dt > th).length]));
  const cls = { MAIN: 0, RENDER: 0, MIXED: 0, none: 0 }, clsRF = { MAIN: 0, RENDER: 0, MIXED: 0, none: 0 };
  let tb = 0;
  for (const x of rows) if (x.dt > 34) { cls[x.cls || 'none']++; clsRF[x.clsRF || 'none']++; if (x.tb) tb++; }
  const mv = r.rows, sum = mv.reduce((m, x) => m + x.dt, 0);
  return { n: rows.length, s, cls, clsRF, tbShare: s[34] ? r3(tb / s[34]) : null, fpsAll: sum ? Math.round((10000 * mv.length) / sum) / 10 : null };
}

export function decide(per) { // per: {C: [metric], V: [metric]}
  const nC = med(per.C.map((m) => m.n)), nV = med(per.V.map((m) => m.n));
  const denomShift = nC ? Math.abs(nV - nC) > 0.15 * nC : false;
  const val = (m, th) => (denomShift ? (m.n ? m.s[th] / m.n : 0) : m.s[th]);
  const at = (th) => verdict(per.C.map((m) => val(m, th)), per.V.map((m) => val(m, th)));
  const v34 = at(34), v30 = at(30), v38 = at(38);
  const v50 = at(50), v46 = at(46), v54 = at(54);
  return {
    basis: denomShift ? `rates (median n C ${nC}, V ${nV}: > 15 % apart)` : `counts (median n C ${nC}, V ${nV})`,
    decision: v34 + (v30 !== v34 || v38 !== v34 ? ' [threshold-sensitive]' : ''),
    twins: { 'dt>30': v30, 'dt>34': v34, 'dt>38': v38 },
    gt50: { 'dt>46': v46, 'dt>50': v50, 'dt>54': v54, note: 'reported, decides nothing' },
    medians: Object.fromEntries(['C', 'V'].map((a) => [a, Object.fromEntries(TH.map((th) => [`dt>${th}`, med(per[a].map((m) => m.s[th]))]))])),
  };
}

function selftest() {
  const ok = (a, b, m) => { if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${a} != ${b}`); process.exit(1); } };
  ok(verdict([19, 18, 20, 21], [8, 9, 7, 10]), 'CAUSE', 'half and separated');
  ok(verdict([19, 18, 20, 21], [12, 15, 14, 13]), 'CONTRIBUTES', 'separated, above half');
  ok(verdict([19, 18, 20, 21], [12, 18, 14, 13]), 'NOT SHOWN', 'touching ranges');
  ok(verdict([19, 18, 20, 21], [22, 25, 23, 24]), 'WORSE', 'reverse');
  ok(verdict([19, 18], [8, 9, 7]), 'THIN', 'two runs');
  ok(verdict([10, 10, 10], [5, 5, 4]), 'CAUSE', 'exactly half');
  const mk = (s34, n = 60) => ({ n, s: { 30: Math.round(s34 * 1.2), 34: s34, 38: Math.round(s34 * 0.8), 46: 2, 50: 1, 54: 1 } });
  ok(decide({ C: [mk(19), mk(18), mk(20), mk(21)], V: [mk(8), mk(9), mk(7), mk(10)] }).decision, 'CAUSE', 'decide counts');
  ok(decide({ C: [mk(19), mk(18), mk(20), mk(21)], V: [mk(8, 30), mk(9, 30), mk(7, 30), mk(10, 30)] }).basis.startsWith('rates'), true, 'denominator guard');
  console.log('SELFTEST ok (8 checks)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-bg/phone/p137-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, per: { C: [], V: [] } };
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const r = g ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: 'FAIL (no record)' }; }
  for (const arm of ['C', 'V']) for (let k = 1; k <= 4; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const m = metric(g, r); out.runs[name] = { arm, idle: r.idle, align: r.align, drift: r.drift, ...m }; out.per[arm].push(m); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.result = sentOk ? decide(out.per) : { decision: 'VOID (a sentinel failed or is missing)' };
  for (const arm of ['C', 'V']) {
    const sum = (k) => out.per[arm].reduce((m, x) => { for (const c of Object.keys(x[k])) m[c] = (m[c] || 0) + x[k][c]; return m; }, {});
    out[`classSplit${arm}`] = { busy: sum('cls'), busyRF: sum('clsRF') };
  }
  console.log(`P-137 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | busy ${JSON.stringify(r.cls)} RF ${JSON.stringify(r.clsRF)} tb ${r.tbShare} fpsAll ${r.fpsAll}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`  class split >34 C ${JSON.stringify(out.classSplitC)} V ${JSON.stringify(out.classSplitV)}`);
  console.log(`DECISION ${JSON.stringify(out.result)}`);
  delete out.per;
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

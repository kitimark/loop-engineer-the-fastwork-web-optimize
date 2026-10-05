#!/usr/bin/env node
// P-145 reader (frozen before data; card: fixes/end-bg/README.md "P-145"). End-screen split on the iPhone: C (v9-final +
// morph-scroll 7d) vs P (C + sim/pictures-off.css) vs T (C + sim/titles-off.css); P + T = P-137's V (nobg.css).
// A pure reader: no device, no measurement.
//   node fixes/end-bg/phone/p145-read.mjs <folder> [--json out.json]      (folder: out/p145/runs)
//   node fixes/end-bg/phone/p145-read.mjs --selftest
// Runs: counted EC1-EC3, EP1-EP3, ET1-ET3 (g-<run>.json + tl-<run>.json); a re-run <run>r replaces its run when the first
// try is INVALID (the first valid try counts). Sentinels S0, S1 (Timeline off, g- only).
// Per run: the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) for the gates G1-G6 and
// the frame rows, and P-137's metric (fixes/end-bg/phone/p137-read.mjs `metric`, unchanged): moving frames in the
// lastScreen band after a touchend; s(th) for th 30, 34, 38, 46, 50, 54.
// DECISION per arm X in {P, T}, X against C, P-137's rule (p137-read.mjs `verdict`, unchanged) on the >34 per-run values:
//   CAUSE (max X < min C and median X <= 0.5 median C) | CONTRIBUTES (max X < min C) | WORSE | NOT SHOWN | THIN (< 3 valid
//   runs in an arm). Denominator guard and twins (>30, >38: "threshold-sensitive") as in P-137, per pair.
// READING: an arm "carries" when its verdict is CAUSE or CONTRIBUTES.
//   P carries, T not: PICTURES | T carries, P not: TITLES | both: BOTH | neither: NEITHER | a THIN arm or a failed
//   sentinel: no reading (THIN / VOID).
// DESCRIPTIVE (decides nothing): class split of the >34 frames per arm, toolbar-step share, and from each counted run's
// Timeline the median summed Paint and Composite ms over its metric frames (records starting in (t - dt, t]).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { verdict, metric, TH } = await import(pathToFileURL(join(here, 'p137-read.mjs')).href);
export const ARMS = ['C', 'P', 'T'];
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/** One arm against C: P-137's decision with its denominator guard and twins. */
export function decidePair(c, x) {
  const nC = med(c.map((m) => m.n)), nX = med(x.map((m) => m.n));
  const denomShift = nC ? Math.abs(nX - nC) > 0.15 * nC : false;
  const val = (m, th) => (denomShift ? (m.n ? m.s[th] / m.n : 0) : m.s[th]);
  const at = (th) => verdict(c.map((m) => val(m, th)), x.map((m) => val(m, th)));
  const v34 = at(34), v30 = at(30), v38 = at(38);
  return { basis: denomShift ? `rates (median n C ${nC}, X ${nX})` : `counts (median n C ${nC}, X ${nX})`, v34, sensitive: v30 !== v34 || v38 !== v34, twins: { 'dt>30': v30, 'dt>38': v38 }, gt50: at(50) };
}
export function reading(vP, vT, sentOk) {
  if (!sentOk) return 'VOID';
  if (vP === 'THIN' || vT === 'THIN') return 'THIN';
  const carries = (v) => v === 'CAUSE' || v === 'CONTRIBUTES';
  const p = carries(vP), t = carries(vT);
  return p && !t ? 'PICTURES' : t && !p ? 'TITLES' : p && t ? 'BOTH' : 'NEITHER';
}
/** Descriptive: median Paint / Composite ms per metric frame from the run's Timeline. */
export function tlCost(g, r, tl) {
  if (!tl?.recs) return null;
  const recs = []; const walk = (x) => { if ((x.type === 'Paint' || x.type === 'Composite') && x.endTime != null) recs.push([x.startTime * 1000 - tl.offsetMs, (x.endTime - x.startTime) * 1000, x.type]); (x.children || []).forEach(walk); };
  tl.recs.forEach(walk);
  const fr = g.run.segments[0].frames, tc = g.run.segments[0].touches || [];
  const rows = r.rows.filter((x) => x.band === 'lastScreen').filter((x) => { const t = fr[x.i][0]; let last = null; for (const e of tc) if (e[0] <= t) last = e; return last && last[1] === 'e'; });
  const per = rows.map((x) => { const t = fr[x.i][0], dt = x.dt; const inF = recs.filter((q) => q[0] > t - dt && q[0] <= t); return [inF.filter((q) => q[2] === 'Paint').reduce((a, q) => a + q[1], 0), inF.filter((q) => q[2] === 'Composite').reduce((a, q) => a + q[1], 0)]; });
  return { paintMs: r3(med(per.map((p) => p[0]))), compMs: r3(med(per.map((p) => p[1]))) };
}
function selftest() {
  const ok = (a, b, m) => { if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${a} != ${b}`); process.exit(1); } };
  const mk = (s34, n = 60) => ({ n, s: { 30: Math.round(s34 * 1.2), 34: s34, 38: Math.round(s34 * 0.8), 46: 2, 50: 1, 54: 1 } });
  const C = [mk(16), mk(15), mk(17)];
  ok(decidePair(C, [mk(3), mk(4), mk(5)]).v34, 'CAUSE', 'pair CAUSE');
  ok(decidePair(C, [mk(10), mk(11), mk(12)]).v34, 'CONTRIBUTES', 'pair CONTRIBUTES');
  ok(decidePair(C, [mk(14), mk(16), mk(15)]).v34, 'NOT SHOWN', 'pair NOT SHOWN');
  ok(decidePair(C, [mk(3), mk(4)]).v34, 'THIN', 'pair THIN');
  ok(decidePair(C, [mk(3, 30), mk(4, 30), mk(5, 30)]).basis.startsWith('rates'), true, 'denominator guard');
  ok(reading('CAUSE', 'NOT SHOWN', true), 'PICTURES', 'PICTURES');
  ok(reading('NOT SHOWN', 'CONTRIBUTES', true), 'TITLES', 'TITLES');
  ok(reading('CAUSE', 'CAUSE', true), 'BOTH', 'BOTH');
  ok(reading('NOT SHOWN', 'WORSE', true), 'NEITHER', 'NEITHER');
  ok(reading('THIN', 'CAUSE', true), 'THIN', 'THIN');
  ok(reading('CAUSE', 'NOT SHOWN', false), 'VOID', 'VOID');
  console.log('SELFTEST ok (11 checks)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-bg/phone/p145-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {} }, per = { C: [], P: [], T: [] };
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const r = g ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: 'FAIL (no record)' }; }
  for (const arm of ARMS) for (let k = 1; k <= 3; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const m = metric(g, r); out.runs[name] = { arm, ...m, tl: tlCost(g, r, tl) }; per[arm].push(m); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  const dP = decidePair(per.C, per.P), dT = decidePair(per.C, per.T);
  out.result = { P: dP, T: dT, reading: reading(dP.v34, dT.v34, sentOk), medians: Object.fromEntries(ARMS.map((x) => [x, Object.fromEntries(TH.map((th) => [`dt>${th}`, med(per[x].map((m) => m.s[th]))]))])) };
  console.log(`P-145 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >50 ${r.s[50]} | busy ${JSON.stringify(r.cls)} tb ${r.tbShare} | tl ${JSON.stringify(r.tl)}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`DECISION P ${dP.v34}${dP.sensitive ? ' [threshold-sensitive]' : ''} (${dP.basis}) | T ${dT.v34}${dT.sensitive ? ' [threshold-sensitive]' : ''} (${dT.basis}) | READING ${out.result.reading}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

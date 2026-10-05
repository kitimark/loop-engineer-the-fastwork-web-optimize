#!/usr/bin/env node
// P-150 reader (frozen before data; card: fixes/end-bg/README.md "P-150"). Phone no-worse check of PR-025 option B:
// C (v9-final + morph-scroll 7d) vs N (C + lighter files + AVIF). A pure reader: no device, no measurement.
//   node fixes/end-bg/phone/p150-read.mjs <folder> [--json out.json]      (folder: out/p150/runs)
//   node fixes/end-bg/phone/p150-read.mjs --selftest
// Runs: counted EC1-EC3, EN1-EN3 (g-<run>.json + tl-<run>.json); a re-run <run>r replaces its run when the first try is
// INVALID (the first valid try counts). Sentinels S0, S1 (Timeline off, g- only). Records of a VOID hold are moved to
// out/p150/void/<H>/ by the runner before the read and never count (P-145 N1's rule, carried over).
// Per run: the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) for the gates G1-G6 and
// the moving-frame rows.
// METRIC (whole page: the pictures appear all down the page, so their first decode can fall anywhere): every moving
//   frame of the run (scrollY differs from the previous frame), n = their number, s(th) = those with dt > th, th 30, 34,
//   38, 46, 50, 54. P-137's lastScreen-after-touchend metric (p137-read.mjs `metric`) is reported, decides nothing.
// DECISION (P-137's rule, p137-read.mjs `verdict`, N against C, at least 3 valid runs per arm, both sentinels PASS):
//   at >34 and at >50 separately: WORSE when min(N) > max(C); else CAUSE / CONTRIBUTES / NOT SHOWN as P-137 (better or
//   the same; reported, no gain claim). Denominator guard (15 %): rates s/n instead of counts.
//   NO-WORSE PASS: neither >34 nor >50 is WORSE. FAIL: either is WORSE (named). INSUFFICIENT: an arm has < 3 valid runs.
//   VOID: a sentinel failed. Twins (>30/>38 for >34, >46/>54 for >50): a twin whose WORSE-or-not differs from its main
//   threshold marks the result "threshold-sensitive" (reported with the result; it does not change PASS/FAIL).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { verdict, metric, TH } = await import(pathToFileURL(join(here, 'p137-read.mjs')).href);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** Whole-page metric of one readRun result. */
export function wholePage(r) {
  const rows = r.rows;
  return { n: rows.length, s: Object.fromEntries(TH.map((th) => [th, rows.filter((x) => x.dt > th).length])) };
}
export function decideNoWorse(c, x) {
  const nC = med(c.map((m) => m.n)), nX = med(x.map((m) => m.n));
  const denomShift = nC ? Math.abs(nX - nC) > 0.15 * nC : false;
  const val = (m, th) => (denomShift ? (m.n ? m.s[th] / m.n : 0) : m.s[th]);
  const at = Object.fromEntries(TH.map((th) => [th, verdict(c.map((m) => val(m, th)), x.map((m) => val(m, th)))]));
  const basis = denomShift ? `rates (median n C ${nC}, N ${nX})` : `counts (median n C ${nC}, N ${nX})`;
  if (at[34] === 'THIN') return { result: 'INSUFFICIENT', basis, at };
  const worse = [34, 50].filter((th) => at[th] === 'WORSE');
  const w = (v) => v === 'WORSE';
  const sensitive = w(at[30]) !== w(at[34]) || w(at[38]) !== w(at[34]) || w(at[46]) !== w(at[50]) || w(at[54]) !== w(at[50]);
  return { result: worse.length ? `FAIL (WORSE at ${worse.map((t) => '>' + t).join(', ')})` : 'NO-WORSE PASS', sensitive, basis, at };
}
function selftest() {
  const ok = (a, b, m) => { if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${a} != ${b}`); process.exit(1); } };
  const mk = (s34, s50 = 2, n = 900) => ({ n, s: { 30: s34 + 4, 34: s34, 38: Math.max(0, s34 - 4), 46: s50 + 1, 50: s50, 54: Math.max(0, s50 - 1) } });
  const C = [mk(20), mk(22), mk(19)];
  ok(decideNoWorse(C, [mk(21), mk(20), mk(23)]).result, 'NO-WORSE PASS', 'overlap');
  ok(decideNoWorse(C, [mk(30), mk(28), mk(31)]).result, 'FAIL (WORSE at >34)', 'worse 34');
  ok(decideNoWorse(C, [mk(20, 6), mk(21, 7), mk(19, 5)]).result, 'FAIL (WORSE at >50)', 'worse 50');
  ok(decideNoWorse(C, [mk(10), mk(9), mk(11)]).result, 'NO-WORSE PASS', 'better is a pass');
  ok(decideNoWorse(C, [mk(21), mk(20)]).result, 'INSUFFICIENT', 'thin');
  ok(decideNoWorse(C, [mk(30, 2, 500), mk(28, 2, 500), mk(31, 2, 500)]).basis.startsWith('rates'), true, 'denominator guard');
  ok(wholePage({ rows: [{ dt: 40 }, { dt: 16 }, { dt: 60 }] }).s[34], 2, 'whole page count');
  console.log('SELFTEST ok (7 checks)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-bg/phone/p150-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {} }, per = { C: [], N: [] };
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const r = g ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: 'FAIL (no record)' }; }
  for (const arm of ['C', 'N']) for (let k = 1; k <= 3; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const w = wholePage(r), ls = metric(g, r); out.runs[name] = { arm, ...w, lastScreen: { n: ls.n, s: ls.s, cls: ls.cls } }; per[arm].push(w); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.result = sentOk ? decideNoWorse(per.C, per.N) : { result: 'VOID (a sentinel failed or is missing)' };
  out.medians = Object.fromEntries(['C', 'N'].map((x) => [x, Object.fromEntries(TH.map((th) => [`dt>${th}`, med(per[x].map((m) => m.s[th]))]))]));
  console.log(`P-150 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | lastScreen n ${r.lastScreen.n} >34 ${r.lastScreen.s[34]}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`DECISION ${out.result.result}${out.result.sensitive ? ' [threshold-sensitive]' : ''} ${out.result.basis || ''} ${out.result.at ? JSON.stringify(out.result.at) : ''}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

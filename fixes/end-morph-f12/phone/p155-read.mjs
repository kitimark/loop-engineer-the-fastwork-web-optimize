#!/usr/bin/env node
// P-155 reader (frozen before data; card: fixes/end-morph-f12/README.md "Split block", lead-signed as P-155 09:10Z).
// The F1-only / U2-only split of end-morph F1+U2 on v9-final. A pure reader: no device, no measurement.
//   node fixes/end-morph-f12/phone/p155-read.mjs <folder> [--json out.json]      (folder: out/p155/runs)
//   node fixes/end-morph-f12/phone/p155-read.mjs --selftest
// ARMS: C v9-final (JS 647c9ef2b1e2), F = C + F1 only (b1c1320fde83), U = C + U2 only (4389044c1ec4); CSS e1359ab9994a.
// RUNS: counted EC1-EC3, EF1-EF3, EU1-EU3, g-<run>.json + tl-<run>.json; a re-run <run>r replaces its run only when the
//   first try is INVALID (P-152's rule). Sentinels S0, S1 on C (g- only). A run counts only when its hold's log
//   (out/p155/hold-<H>.log) ends "HOLD <H> VALID" (P-152's holdStatus). Per run: P-129's readRun (role E): run gates and
//   the moving-frame rows. Functions shared with P-152 are imported from p152-read.mjs (pin 74ffb1031287), not copied.
// METRICS:
//   CB34 / CB50 (the closing band; new, found in P-152's data, confirmatory here, never pooled with P-152): moving frames
//     in the lastScreen band, going down (scrollY below the previous frame), at 0.2 <= m < 0.55, with dt > 34 / dt > 50.
//     m = (scrollY - (maxY - innerHeight)) / innerHeight, maxY = docH - innerHeight (docH1 if present), as P-152's
//     attribution split. P-152 for reference: C 6 / 3 / 5 / 7, V 23 / 21 / 21 / 14.
//   END ZONE (P-152's metric): moving lastScreen frames, s(th) for th 30 ... 54.
// PREDICTIONS (fixed before data):
//   P1 (F1 is the cause): median(F) - median(C) of CB34 >= +8 AND every F run above every C run (min F > max C; at 3 v 3
//      the exact one-sided permutation p is then 1/20).
//   P2 (U2 is not): median(U) - median(C) of CB34 <= +3.
//   OUTCOME: P1 and P2 -> "F1 re-show" (F1's re-show is the cause in our setup; mechanism UNRESOLVED);
//            dF <= +3 and dU >= +8 with U separated above C -> "U2" (the suspect refuted);
//            dF <= +3 and dU <= +3 -> "neither alone" (interaction or a P-152 artifact; UNRESOLVED);
//            anything else -> "UNRESOLVED (partial)". Fewer than 3 valid runs in an arm -> INSUFFICIENT.
// U2 NO-WORSE (lead-signed: decides whether U2 lands alone under the less-work rule): P-152's decideNoWorse on the end
//   zone, U against C, at >34 and >50: WORSE when separated, or when the median exceeds +2 / +1 with permutation p <= 0.05
//   (3 v 3: p = 0.05 needs the most extreme ordering; weaker than P-152's 4 v 4, disclosed). PASS lands U2; FAIL does not.
//   F against C on the same rule is reported, decides nothing.
// Precedence: VOID (a sentinel failed or is missing) > INSUFFICIENT > the outcomes above.
// DESCRIPTIVE (decides nothing): per run hold, start, gap, battery °C at the hold's start; Timeline main-thread totals
//   (Layout, Paint, RecalculateStyles, FunctionCall, Composite, RenderingFrame) over each arm's CB frames.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun, flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { endZone, decideNoWorse, holdStatus, separated, TH } = await import(pathToFileURL(join(here, 'p152-read.mjs')).href);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const ARMS = ['C', 'F', 'U'];
export const PLAN = { S0: 'H4', EC1: 'H5', EF1: 'H6', EU1: 'H7', EF2: 'H8', EU2: 'H9', EC2: 'H10', EU3: 'H11', EC3: 'H12', EF3: 'H13', S1: 'H14-H16 (after the re-runs)' };
const TYPES = ['Layout', 'Paint', 'RecalculateStyles', 'FunctionCall', 'Composite', 'RenderingFrame'];

/** Morph value of frame i: frames are [t, dt, scrollY, innerHeight]. */
export function mOf(seg, i) { const fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0; const [, , y, ih] = fr[i]; return (y - (docH - 2 * ih)) / ih; }
/** The closing band of one run: rows from readRun (band, dt, i) plus the record's first segment. */
export function closingBand(seg, rows) {
  const fr = seg.frames;
  const cb = rows.filter((x) => x.band === 'lastScreen' && x.i > 0 && fr[x.i][2] < fr[x.i - 1][2]).filter((x) => { const m = mOf(seg, x.i); return m >= 0.2 && m < 0.55; });
  return { n: cb.length, s34: cb.filter((x) => x.dt > 34).length, s50: cb.filter((x) => x.dt > 50).length, rows: cb };
}
/** P1 / P2 and the outcome from per-arm CB34 lists. */
export function decideSplit(c, f, u) {
  if (c.length < 3 || f.length < 3 || u.length < 3) return { outcome: 'INSUFFICIENT', P1: null, P2: null };
  const dF = med(f) - med(c), dU = med(u) - med(c);
  const P1 = dF >= 8 && separated(c, f), P2 = dU <= 3;
  let outcome = 'UNRESOLVED (partial)';
  if (P1 && P2) outcome = 'F1 re-show';
  else if (dF <= 3 && dU >= 8 && separated(c, u)) outcome = 'U2';
  else if (dF <= 3 && dU <= 3) outcome = 'neither alone';
  return { outcome, P1, P2, dF, dU };
}
function tlTotals(seg, cbRows, tl) {
  const o = Object.fromEntries(TYPES.map((t) => [t, 0]));
  if (!tl || !Number.isFinite(tl.offsetMs)) return null;
  const recs = flatten(tl.recs, tl.offsetMs).filter((q) => TYPES.includes(q.type));
  for (const x of cbRows) { const t = seg.frames[x.i][0]; for (const q of recs) if (q.a > t - x.dt && q.a <= t) o[q.type] += Math.max(0, q.b - q.a); }
  for (const k of TYPES) o[k] = Math.round(o[k]);
  return o;
}
function selftest() {
  let n = 0;
  const ok = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  const C = [6, 3, 5];
  ok(decideSplit(C, [23, 21, 14], [5, 7, 4]).outcome, 'F1 re-show', 'F like P-152 V, U like C');
  ok(decideSplit(C, [23, 21, 5], [5, 7, 4]).outcome, 'UNRESOLVED (partial)', 'F median +16 but not separated (5 = max C)');
  ok(decideSplit(C, [11, 12, 13], [5, 7, 4]).P1, false, 'F median +7 (12 - 5), separated: below the +8 bound, P1 fails');
  ok(decideSplit(C, [12, 13, 14], [5, 7, 4]).P1, true, 'F median +8 (13 - 5), separated: the bound itself holds');
  ok(decideSplit(C, [5, 6, 7], [20, 22, 25]).outcome, 'U2', 'U separated and +17, F like C');
  ok(decideSplit(C, [5, 6, 7], [5, 6, 4]).outcome, 'neither alone', 'both like C');
  ok(decideSplit(C, [20, 22, 25], [9, 10, 11]).outcome, 'UNRESOLVED (partial)', 'F +17 separated but U +5 breaks P2');
  ok(decideSplit(C, [20, 22, 25], [8, 8, 8]).P2, true, 'U +3 is the P2 bound (<= +3 holds)');
  ok(decideSplit(C.slice(0, 2), [20, 22, 25], [5, 6, 7]).outcome, 'INSUFFICIENT', 'under 3 C runs');
  // the closing band on a synthetic record: ih 800, docH 6800 -> zone starts at 5200; m 0.2 at 5360, 0.55 at 5640
  const seg = { docH: 6800, frames: [[0, 16, 5800, 800], [16, 40, 5600, 800], [56, 60, 5500, 800], [116, 40, 5300, 800], [156, 40, 5600, 800], [196, 40, 5450, 800]] };
  const rows = [1, 2, 3, 4, 5].map((i) => ({ i, dt: seg.frames[i][1], band: 'lastScreen' }));
  const cb = closingBand(seg, rows);
  ok([cb.n, cb.s34, cb.s50], [3, 3, 1], 'closing band: down frames at 0.2 <= m < 0.55 only (5600, 5500, 5450; 5300 is below 0.2, 5600 going up excluded)');
  ok(closingBand(seg, rows.map((r) => ({ ...r, band: 'middle' }))).n, 0, 'closing band needs lastScreen');
  // U2 no-worse uses P-152's rule unchanged (3 v 3)
  const R = (s34, s50) => ({ n: 1400, s: { 30: s34 + 5, 34: s34, 38: s34 - 5, 46: s50 + 2, 50: s50, 54: s50 - 1 } });
  ok(decideNoWorse([R(30, 4), R(28, 3), R(32, 5)], [R(31, 4), R(29, 5), R(30, 3)]).result, 'NO-WORSE PASS', 'U like C passes at 3 v 3');
  ok(decideNoWorse([R(30, 4), R(28, 3), R(32, 5)], [R(40, 6), R(42, 7), R(45, 8)]).result.startsWith('FAIL'), true, 'U separated above C fails');
  ok(holdStatus({ H6: 'RUN EF1 arm F exit 0\nHOLD H6 VALID 300 s\n' }).EF1.valid, true, 'holdStatus reads the F arm');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-morph-f12/phone/p155-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, tl: {} }, ez = { C: [], F: [], U: [] }, cb34 = { C: [], F: [], U: [] }, cb50 = { C: [], F: [], U: [] };
  const base = dirname(dir.replace(/\/+$/, ''));
  const logs = {};
  for (const f of existsSync(base) ? readdirSync(base) : []) { const m = f.match(/^hold-(H[0-9]+)\.log$/); if (m) logs[m[1]] = readFileSync(join(base, f), 'utf8'); }
  const hs = holdStatus(logs);
  const holdWhy = (item) => (!hs[item] ? 'in no hold log' : hs[item].valid ? null : hs[item].why);
  out.holds = Object.fromEntries(Object.keys(logs).sort().map((h) => [h, (logs[h].match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || ['no HOLD line']).pop()]));
  const t0 = (g) => (g?.meta?.date ? Date.parse(g.meta.date) : null), starts = [];
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const hw = g ? holdWhy(s) : null; const r = g && !hw ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: hw ? `FAIL (${hw})` : 'FAIL (no record)' }; if (g) starts.push([s, t0(g)]); }
  const tlSum = { C: null, F: null, U: null };
  for (const arm of ARMS) for (let k = 1; k <= 3; k++) {
    const nm = `E${arm}${k}`; let used = null;
    for (const name of [nm, `${nm}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      { const hw = holdWhy(name); if (hw) { out.invalid[name] = [hw]; continue; } }
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name;
      const seg = g.run.segments[0], w = endZone(r), cb = closingBand(seg, r.rows);
      out.runs[name] = { arm, ...w, cb: { n: cb.n, 34: cb.s34, 50: cb.s50 }, hold: PLAN[name] || 'H14-H15 (re-run)', start: g.meta?.date ?? null, battC: g.meta?.profile?.start?.battC ?? null };
      const t = tlTotals(seg, cb.rows, tl);
      if (t) { tlSum[arm] ||= Object.fromEntries(TYPES.map((x) => [x, 0])); for (const x of TYPES) tlSum[arm][x] += t[x]; }
      starts.push([name, t0(g)]); ez[arm].push(w); cb34[arm].push(cb.s34); cb50[arm].push(cb.s50); break;
    }
    if (!used) out.invalid[nm] ||= ['no valid try'];
  }
  out.tl = tlSum;
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.split = sentOk ? decideSplit(cb34.C, cb34.F, cb34.U) : { outcome: 'VOID (a sentinel failed or is missing)' };
  out.u2NoWorse = sentOk ? decideNoWorse(ez.C, ez.U) : { result: 'VOID (a sentinel failed or is missing)' };
  out.f1NoWorse = sentOk ? decideNoWorse(ez.C, ez.F) : { result: 'VOID' };
  out.cb50 = { C: cb50.C, F: cb50.F, U: cb50.U, dF: med(cb50.F) - med(cb50.C), dU: med(cb50.U) - med(cb50.C) };
  const ord = starts.filter((x) => x[1] != null).sort((p, q) => p[1] - q[1]);
  for (let i = 0; i < ord.length; i++) if (out.runs[ord[i][0]]) out.runs[ord[i][0]].gapS = i ? Math.round((ord[i][1] - ord[i - 1][1]) / 1000) : null;
  console.log(`P-155 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [nm, r] of Object.entries(out.runs)) console.log(`  ${nm} (${r.arm}) ${r.hold} start ${r.start} gap ${r.gapS ?? '-'} s batt ${r.battC ?? '-'} C | CB n ${r.cb.n} >34 ${r.cb[34]} >50 ${r.cb[50]} | end zone n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]}`);
  for (const [nm, w] of Object.entries(out.invalid)) console.log(`  INVALID ${nm}: ${w.join('; ')}`);
  console.log(`HOLDS ${JSON.stringify(out.holds)}`);
  console.log(`SPLIT ${out.split.outcome}${out.split.P1 != null ? ` | P1 ${out.split.P1 ? 'holds' : 'fails'} (F-C CB34 median ${out.split.dF}) | P2 ${out.split.P2 ? 'holds' : 'fails'} (U-C ${out.split.dU})` : ''} | CB34 C ${cb34.C.join('/')} F ${cb34.F.join('/')} U ${cb34.U.join('/')}`);
  console.log(`CB50 (reported) C ${cb50.C.join('/')} F ${cb50.F.join('/')} U ${cb50.U.join('/')}`);
  console.log(`U2 NO-WORSE ${out.u2NoWorse.result}${out.u2NoWorse.sensitive ? ' [threshold-sensitive]' : ''} ${out.u2NoWorse.diff ? 'median U-C ' + JSON.stringify(out.u2NoWorse.diff) : ''}${out.u2NoWorse.p ? ' p ' + JSON.stringify(out.u2NoWorse.p) : ''} (3 v 3, weaker than 4 v 4: disclosed)`);
  console.log(`F1 against C, same rule (decides nothing): ${out.f1NoWorse.result}`);
  console.log(`TIMELINE on CB frames, ms (decides nothing): ${JSON.stringify(out.tl)}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

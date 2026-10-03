#!/usr/bin/env node
// score079.mjs: P-079 scorer (cd-strip strip-tc = V vs st6-rb2 = C, phone block of the PHONE TICKET in
// fixes/cd-strip/README.md). Counts and frame counts only; no ms verdicts beyond the frame thresholds.
// usage: node fixes/cd-strip/p079/score079.mjs <arm>:<file> ... [--json out.json]
//   Pass every file of the block in block order, arm first: the counted W runs (iphone.mjs run --driver window,
//   schema fw-iphone-run/1; warm-ups may be passed, they are skipped) and the attribution cycles (attr079.mjs, schema
//   cd-strip-attr079/1). Void runs are reported and dropped; nothing is re-paired.
// Windows (fixed before data):
//   top frames   : a W run's frames with t in [marks.idle[0], marks.scroll[1]) and yEnd < 1000 (the hero clock at rest
//                  for --idle, then the W steps through the hero), dt != null.
//   pin frames   : an attribution cycle's step 4 (Timeline off) driver frames with m >= 0.999 and
//                  t >= (first such frame's t) + 100 ms (the m = 1 hold, the tween's last frame excluded).
//   pin Layout   : step 5 (Timeline on), the same hold window from its own driver frames: Layout records with page time
//                  in [first m >= 0.999 frame + 100 ms, last m >= 0.999 frame]; reported per hold and per 1000 ms.
//   top Layout   : step 2, Layout records in [cdw0, cdw1) (4000 ms from 650 ms after a seconds tick).
//   re-entry     : step 3, clock Paint records in [cdmark in, + 1000 ms) (cdmark in is stamped in the page task that
//                  scrolls back to y 0).
//   backing      : step 1 census, hero clock layers with memory > 0, and their MB.
// Frame counts per run/hold: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
// Aggregation and gates (P-079):
//   frames   : per window, median over V's valid runs (holds) minus median over C's; falsified when >50 rises by >= 2
//              in either window; the same rule with each twin: a verdict that differs is "threshold-sensitive". > 34:
//              the prediction band V - C in [-1, +1], reported, not a falsifier. Needs >= 3 valid per arm (top) and
//              >= 2 (pin), else "not enough".
//   pin Layout: each valid V hold's Layout minus the median of C's valid holds; above the band = > +14; falsified when
//              >= 2 of 3 V holds are above (fewer than 3 valid V holds or 2 valid C holds: "not enough").
//   re-entry : arm medians; falsified when V >= 38 or V >= C. backing: arm medians; falsified when V backed > 20.
//   top Layout: arm medians, V - C in [-10, +15] (prediction band, not a falsifier); idle clock Paint per 4 s V - C in
//              [-8, +12] (descriptive, no claim).
// Void (dropped, reported): W run: meta.error, served JS/CSS not the arm's, Low Power Mode (settings.lowPowerMode true
//   or lowPowerSuspect), a C run whose heat sentinel fails or has no data (it voids itself and every run since the last
//   passing C run, block order). Attribution cycle: errors, served not the arm's, missing window stamps; a C cycle
//   whose pin-frames p95 (step 4, m = 1 held) is > 18 ms (the M sentinel) voids itself and every cycle since the last
//   passing C cycle. The start band (38-40 °C at the block start) is printed from the first counted run's battery.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const EXPECT = {
  V: { js: '6fa0e1e8a221ccd5aa2983c6dcceaceab239a1535b295e07a0035ff4ea32ef16', css: '982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d' },
  C: { js: '7bf7c4657d21f1e94c666d582efccda65f20a5498626d22964bfbc5e35124f7a', css: 'f523598b2a24ede87f745d8b6d3b7c61e113559cc6dfdb35744b20bdbcffda97' },
};
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const cnt = (dts) => Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--json')).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), file: s.slice(k + 1) }; });
for (const f of files) if (!['C', 'V'].includes(f.arm)) throw new Error(`arm must be C or V: ${f.arm}:${f.file}`);

// held m = 1 window of driver frames [t, dt, y, m]
export function holdWindow(frames) {
  const H = (frames || []).filter((f) => f[3] >= 0.999);
  if (!H.length) return null;
  const a = H[0][0] + 100, b = H[H.length - 1][0];
  return { a, b, frames: H.filter((f) => f[0] >= a && f[0] <= b && f[1] != null) };
}
export function scoreW(j, arm) {
  const m = j.meta || {}; const v = [];
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  const js = sv[NODE], css = sv[CSS];
  if (!(js && EXPECT[arm].js.startsWith(js) && css && EXPECT[arm].css.startsWith(css))) v.push(`served not arm ${arm} (JS ${js ?? 'none'}, CSS ${css ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  const mk = j.marks || {};
  const a = mk.idle?.[0], b = mk.scroll?.[1];
  let top = null;
  if (a == null || b == null) v.push('no idle/scroll marks');
  else { const dts = (j.frames || []).filter((f) => f[0] >= a && f[0] < b && f[3] < 1000 && f[1] != null).map((f) => f[1]); top = { frames: dts.length, ...cnt(dts) }; }
  return { kind: 'W', arm, label: m.label, warmup: !!m.warmup, void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, charging: m.battery?.start?.IsCharging ?? null, top };
}
export function scoreA(j, arm) {
  const v = [...(j.errors || [])];
  if (j.arm !== arm) v.push(`file says arm ${j.arm}`);
  if (!j.served?.ok) v.push('served not the arm\'s');
  if (!j.census) v.push('no census');
  if (!j.top || j.top.error) v.push(`top: ${j.top?.error ?? 'missing'}`);
  if (!j.reentry || j.reentry.error) v.push(`reentry: ${j.reentry?.error ?? 'missing'}`);
  const pf = holdWindow(j.pinFrames?.frames);
  if (!pf) v.push('no held m = 1 frames (step 4)');
  const pin = pf ? { frames: pf.frames.length, ...cnt(pf.frames.map((f) => f[1])), p95: pct(pf.frames.map((f) => f[1]), 0.95) } : null;
  let pinLayout = null;
  const pt = j.pinTimeline;
  if (!pt || pt.error) v.push(`pin Timeline: ${pt?.error ?? 'missing'}`);
  else { const w = holdWindow(pt.frames); if (!w) v.push('no held m = 1 frames (step 5)');
    else { const r = pt.recs.filter((x) => x[0] >= w.a && x[0] <= w.b); const L = r.filter((x) => x[1] === 'L').length;
      pinLayout = { ms: Math.round(w.b - w.a), Layout: L, perSec: Math.round((L / Math.max(1, w.b - w.a)) * 1e5) / 100, RecalculateStyles: r.filter((x) => x[1] === 'R').length, clockPaint: r.filter((x) => x[1] === 'P' && x[2]).length }; } }
  return { kind: 'A', arm, label: `${arm} cycle ${j.cycle}`, void: v, tempStart: j.battery?.start?.temperatureC ?? null, census: j.census, top: j.top, reentry: j.reentry?.first1s ?? null, pin, pinLayout };
}
// sentinel voiding in block order: a failing C voids itself and every run of its kind since the last passing C
export function applySentinel(list, passOf) {
  let since = [];
  for (const r of list) {
    if (r.void.length) { since.push(r); continue; }
    since.push(r);
    if (r.arm !== 'C') continue;
    const p = passOf(r);
    if (p === true) { since = []; continue; }
    for (const x of since) if (!x.void.length || x === r) x.void.push(x === r ? `sentinel ${p === false ? 'failed' : 'no data'}` : `voided by failing sentinel ${r.label}`);
    since = [];
  }
}
export function frameGate(C, V, minN) {
  const out = { nC: C.length, nV: V.length };
  if (C.length < minN || V.length < minN) return { ...out, verdict: `not enough (C ${C.length}, V ${V.length}, need ${minN})` };
  const d = (k) => median(V.map((x) => x[k])) - median(C.map((x) => x[k]));
  const rise = (k) => d(k) >= 2;
  out.delta = Object.fromEntries(Object.keys(TH).map((k) => [k, d(k)]));
  out.gt50 = rise('gt50') ? 'FALSIFIED (>50 up by >= 2)' : 'hit';
  const tw = [rise('gt46'), rise('gt54')];
  out.thresholdSensitive = tw.some((x) => x !== rise('gt50'));
  out.gt34band = out.delta.gt34 >= -1 && out.delta.gt34 <= 1 ? 'in [-1, +1]' : 'out of [-1, +1]';
  out.gt34twins = [out.delta.gt30, out.delta.gt38].map((x) => (x >= -1 && x <= 1 ? 'in' : 'out'));
  out.verdict = out.gt50 + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

const runs = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f.file, 'utf8'));
  if (j?.meta?.schema === 'fw-iphone-run/1') { if (j.meta.driver !== 'W') throw new Error(`${f.file}: driver ${j.meta.driver}, not W`); runs.push({ file: f.file, ...scoreW(j, f.arm) }); }
  else if (j?.schema === 'cd-strip-attr079/1') runs.push({ file: f.file, ...scoreA(j, f.arm) });
  else throw new Error(`${f.file}: unknown schema`);
}
const W = runs.filter((r) => r.kind === 'W' && !r.warmup), A = runs.filter((r) => r.kind === 'A');
applySentinel(W, (r) => r.sentinel?.pass ?? null);
applySentinel(A, (r) => (r.pin && typeof r.pin.p95 === 'number' ? r.pin.p95 <= 18 : null));
const ok = (L, arm) => L.filter((r) => r.arm === arm && !r.void.length);
const out = { scorer: 'score079.mjs', sha256: self, runs, gates: {} };
for (const r of runs) console.log(`${r.kind} ${r.label}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; start ${r.tempStart ?? '?'} °C` +
  (r.kind === 'W' ? `; top ${JSON.stringify(r.top)}` : `; census ${JSON.stringify(r.census)}; top ${JSON.stringify(r.top)}; re-entry ${JSON.stringify(r.reentry)}; pin ${JSON.stringify(r.pin)}; pin Layout ${JSON.stringify(r.pinLayout)}`));
const first = W[0];
out.startBand = first ? { run: first.label, tempC: first.tempStart, inBand: typeof first.tempStart === 'number' && first.tempStart >= 38 && first.tempStart <= 40 } : null;
const G = out.gates;
G.framesTop = frameGate(ok(W, 'C').map((r) => r.top), ok(W, 'V').map((r) => r.top), 3);
G.framesPin = frameGate(ok(A, 'C').map((r) => r.pin), ok(A, 'V').map((r) => r.pin), 2);
const AC = ok(A, 'C'), AV = ok(A, 'V');
{ const mc = median(AC.map((r) => r.reentry.clockPaint)), mv = median(AV.map((r) => r.reentry.clockPaint));
  G.reentry = { C: mc, V: mv, verdict: !AC.length || !AV.length ? 'not enough' : mv >= 38 || mv >= mc ? 'FALSIFIED' : 'hit', predicted: 'C ~55 [35, 75], V ~23 [12, 38]' }; }
{ const bc = median(AC.map((r) => r.census.heroBacked)), bv = median(AV.map((r) => r.census.heroBacked));
  G.backing = { backedC: bc, backedV: bv, mbC: median(AC.map((r) => r.census.heroMB)), mbV: median(AV.map((r) => r.census.heroMB)), verdict: !AC.length || !AV.length ? 'not enough' : bv > 20 ? 'FALSIFIED' : 'hit', predicted: 'backed C 48, V 16 (+-4); MB C ~1.2, V ~0.4 [0.3, 0.6]' }; }
{ const Lc = AC.filter((r) => r.pinLayout).map((r) => r.pinLayout.Layout), Lv = AV.filter((r) => r.pinLayout).map((r) => r.pinLayout.Layout);
  const mc = median(Lc); const per = Lv.map((x) => ({ Layout: x, minusMedianC: mc == null ? null : x - mc, above: mc != null && x - mc > 14 }));
  G.pinLayout = { C: Lc, medianC: mc, V: per, band: '[-6, +14]', verdict: Lv.length < 3 || Lc.length < 2 ? `not enough (V ${Lv.length}, C ${Lc.length})` : per.filter((x) => x.above).length >= 2 ? 'FALSIFIED (>= 2 of 3 V holds above +14)' : 'hit' }; }
{ const d = median(AV.map((r) => r.top.Layout)) - median(AC.map((r) => r.top.Layout));
  G.topLayout = { C: median(AC.map((r) => r.top.Layout)), V: median(AV.map((r) => r.top.Layout)), delta: d, band: '[-10, +15]', verdict: !AC.length || !AV.length ? 'not enough' : d >= -10 && d <= 15 ? 'in band' : 'out of band' }; }
{ const d = median(AV.map((r) => r.top.clockPaint)) - median(AC.map((r) => r.top.clockPaint));
  G.idleClockPaint = { C: median(AC.map((r) => r.top.clockPaint)), V: median(AV.map((r) => r.top.clockPaint)), delta: d, band: '[-8, +12]', note: 'descriptive, no claim' }; }
for (const [k, g] of Object.entries(G)) console.log(`${k}: ${JSON.stringify(g)}`);
console.log(`start band: ${JSON.stringify(out.startBand)}`);
console.log(`scorer sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));

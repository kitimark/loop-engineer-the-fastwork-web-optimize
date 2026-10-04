#!/usr/bin/env node
// k-score.mjs: cd-roll-ca K phone no-worse check (less-work rule; PHONE TICKET K in fixes/cd-roll-ca/README.md). V = VK
// (V9 + K: per-frame quadratic keyframes, JS b43fe790) vs C = V9 (landed cd-roll-ca). A copy of score.mjs (P-093, rev 2)
// with only these header lines, the usage line and EXPECT changed; frame counts only, driver W, Timeline off.
// Adapted from fix-cd-strip's fixes/cd-strip/p079/score079.mjs (its W scoring, sentinel voiding and frame gate, with
// credit); no attribution cycles.
// usage: node fixes/cd-roll-ca/phone/k-score.mjs <arm>:<file> ... [--json out.json]
//   Pass every W run file of the block in block order (iphone.mjs run --driver window, schema fw-iphone-run/1); warm-ups
//   may be passed, they are skipped. Runs of a hold that failed the thermal gate are left out by the caller (listed in
//   the block log), as in P-079. Void runs are reported and dropped; nothing is re-paired.
// Windows (fixed before data):
//   top  : frames with t in [marks.idle[0], marks.scroll[1]) and yEnd < 1000, dt != null: the clock rolling at y 0 for
//          --idle s, then the W steps through the hero (P-079's window).
//   idle : frames with t in [marks.idle[0], marks.idle[1]), dt != null: the page at rest, the clock rolling once a
//          second (descriptive: reported, no gate).
// Frame counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
// Gate (no-worse): top window, median over V's valid runs minus median over C's; FALSIFIED (worse) when > 50 rises by
//   >= 2; the same rule with each twin, a verdict that differs is "threshold-sensitive". > 34: band V - C in [-1, +1],
//   reported, not a falsifier. Needs >= 3 valid runs per arm, else "not enough".
// Void (dropped, reported): meta.error; served JS/CSS not the arm's; Low Power Mode (settings.lowPowerMode true or
//   lowPowerSuspect); no idle/scroll marks; a C run whose heat sentinel fails or has no data voids itself and every run
//   since the last passing C run (block order); every counted C run's sentinel is judged, also when the run is void
//   for another reason.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const EXPECT = {
  V: { js: 'b43fe790c20c8fbdc6a9a8693a2f39ddc82d75b231cef68df0562cbb245cdd4c', css: '982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d' },
  C: { js: '582d120c9f8ffacd9ff7f8b46f11f548fc8163411ef9cc67b2e6f59ca90f18f3', css: '982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d' },
};
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const cnt = (dts) => Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--json')).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), file: s.slice(k + 1) }; });
for (const f of files) if (!['C', 'V'].includes(f.arm)) throw new Error(`arm must be C or V: ${f.arm}:${f.file}`);

export function scoreW(j, arm) {
  const m = j.meta || {}; const v = [];
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  const js = sv[NODE], css = sv[CSS];
  if (!(js && EXPECT[arm].js.startsWith(js) && css && EXPECT[arm].css.startsWith(css))) v.push(`served not arm ${arm} (JS ${js ?? 'none'}, CSS ${css ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  const mk = j.marks || {};
  const a = mk.idle?.[0], ie = mk.idle?.[1], b = mk.scroll?.[1];
  let top = null, idle = null;
  if (a == null || b == null || ie == null) v.push('no idle/scroll marks');
  else {
    const F = (j.frames || []).filter((f) => f[1] != null);
    const t = F.filter((f) => f[0] >= a && f[0] < b && f[3] < 1000).map((f) => f[1]); top = { frames: t.length, ...cnt(t) };
    const i = F.filter((f) => f[0] >= a && f[0] < ie).map((f) => f[1]); idle = { frames: i.length, ...cnt(i) };
  }
  return { arm, label: m.label, warmup: !!m.warmup, void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, charging: m.battery?.start?.IsCharging ?? null, top, idle };
}
// sentinel voiding in block order: the sentinel of EVERY counted C run is judged, whatever its other voids (a
// served-mismatch or LPM C run still says how hot the phone was; mgmt-ops-10's P-093 read S1, the P-092 fix): pass ===
// true resets; anything else (false, no data) voids that C run and every run since the last passing C
export function applySentinel(list, passOf) {
  let since = [];
  for (const r of list) {
    since.push(r);
    if (r.arm !== 'C') continue;
    const p = passOf(r);
    if (p === true) { since = []; continue; }
    for (const x of since) x.void.push(x === r ? `sentinel ${p === false ? 'failed' : 'no data'}` : `voided by failing sentinel ${r.label}`);
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
  out.thresholdSensitive = [rise('gt46'), rise('gt54')].some((x) => x !== rise('gt50'));
  out.gt34band = out.delta.gt34 >= -1 && out.delta.gt34 <= 1 ? 'in [-1, +1]' : 'out of [-1, +1]';
  out.gt34twins = [out.delta.gt30, out.delta.gt38].map((x) => (x >= -1 && x <= 1 ? 'in' : 'out'));
  out.verdict = out.gt50 + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

if (files.length) {
  const runs = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(f.file, 'utf8'));
    if (j?.meta?.schema !== 'fw-iphone-run/1') throw new Error(`${f.file}: unknown schema`);
    if (j.meta.driver !== 'W') throw new Error(`${f.file}: driver ${j.meta.driver}, not W`);
    runs.push({ file: f.file, ...scoreW(j, f.arm) });
  }
  const W = runs.filter((r) => !r.warmup);
  applySentinel(W, (r) => r.sentinel?.pass ?? null);
  const ok = (arm) => W.filter((r) => r.arm === arm && !r.void.length);
  const out = { scorer: 'fixes/cd-roll-ca/phone/score.mjs', sha256: self, runs, gates: {} };
  for (const r of runs) console.log(`W ${r.label}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; start ${r.tempStart ?? '?'} °C; top ${JSON.stringify(r.top)}; idle ${JSON.stringify(r.idle)}`);
  out.gates.framesTop = frameGate(ok('C').map((r) => r.top), ok('V').map((r) => r.top), 3);
  const di = (k) => median(ok('V').map((r) => r.idle[k])) - median(ok('C').map((r) => r.idle[k]));
  out.gates.idleDescriptive = ok('C').length && ok('V').length ? { delta: Object.fromEntries(Object.keys(TH).map((k) => [k, di(k)])), note: 'descriptive, no gate' } : 'not enough';
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`scorer sha256 ${self}`);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
}

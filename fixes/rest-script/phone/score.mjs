#!/usr/bin/env node
// score.mjs: rest-script v4 phone no-worse check P-094 (less-work rule; PHONE TICKET in fixes/rest-script/README.md).
// V = st6-rb2 + rest-script v4 (fixes/rest-script-live) vs C = st6-rb2. Frame counts only, driver W, Timeline off.
// Adapted from fix-cd-roll-ca's fixes/cd-roll-ca/phone/score.mjs (P-093 rev 2, 57856e3f530a; itself from fix-cd-strip's
// score079.mjs), with credit: the same void rules, sentinel voiding and frame gate; new arm hashes and windows.
// usage: node fixes/rest-script/phone/score.mjs <arm>:<file> ... [--json out.json]
//   Pass every W run file of the block in block order (iphone.mjs run --driver window, schema fw-iphone-run/1); warm-ups
//   may be passed, they are skipped. Runs of a hold that is VOID (thermal gate or I-098 sleep) are left out by the
//   caller (listed in the block log). Void runs are reported and dropped; nothing is re-paired.
// Windows (fixed before data; W run --to 2800 --idle 8 --hold 8 --sentinel 3):
//   timed : frames with t in [marks.idle[0], marks.hold[1]), dt != null: 8 s at the top (the avatar row far, the scene
//           gate active: V plays each far slide as an empty 1 ms Web Animation, C runs the slide), the 250 px steps
//           through the row (V's near band entered and left: fwNearChange), 8 s held at y 2800 (row far again).
//           THE GATED WINDOW.
//   idle / scroll / hold : the three phases alone (descriptive, no gate).
// Frame counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
// Gate (no-worse): timed window, median over V's valid runs minus median over C's; FALSIFIED (worse) when > 50 rises by
//   >= 2; the same rule with each twin, a verdict that differs is "threshold-sensitive". > 34: band V - C in [-1, +1],
//   reported, not a falsifier. Needs >= 3 valid runs per arm, else "not enough".
// Void (dropped, reported): meta.error; served JS/CSS not the arm's; Low Power Mode (settings.lowPowerMode true or
//   lowPowerSuspect); no idle/scroll/hold marks; a C run whose heat sentinel fails or has no data voids itself and every
//   run since the last passing C run (block order); every counted C run's sentinel is judged, also when the run is void
//   for another reason (ops' P-093 read S1).
// Descriptive: the avatar row's document top (tops.row, --tops) and the y at the timed window's start and end.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const EXPECT = {
  V: { js: '520d5f1139c74b55977ec2c7a7ffae362876bb4801755aa04ff432f6232bb7f5', css: 'f523598b2a24ede87f745d8b6d3b7c61e113559cc6dfdb35744b20bdbcffda97' },
  C: { js: '7bf7c4657d21f1e94c666d582efccda65f20a5498626d22964bfbc5e35124f7a', css: 'f523598b2a24ede87f745d8b6d3b7c61e113559cc6dfdb35744b20bdbcffda97' },
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
  const ph = { idle: mk.idle, scroll: mk.scroll, hold: mk.hold };
  let timed = null; const parts = {}; let y = null;
  if (Object.values(ph).some((p) => p?.[0] == null || p?.[1] == null)) v.push('no idle/scroll/hold marks');
  else {
    const F = (j.frames || []).filter((f) => f[1] != null);
    const win = (a, b) => F.filter((f) => f[0] >= a && f[0] < b);
    const T = win(ph.idle[0], ph.hold[1]); timed = { frames: T.length, ...cnt(T.map((f) => f[1])) };
    for (const [k, p] of Object.entries(ph)) { const w = win(p[0], p[1]).map((f) => f[1]); parts[k] = { frames: w.length, ...cnt(w) }; }
    y = { start: T[0]?.[3] ?? null, end: T.at(-1)?.[3] ?? null };
  }
  return { arm, label: m.label, warmup: !!m.warmup, void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, charging: m.battery?.start?.IsCharging ?? null, timed, parts, y, rowTop: j.tops?.row ?? null };
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
  const out = { scorer: 'fixes/rest-script/phone/score.mjs', sha256: self, runs, gates: {} };
  for (const r of runs) console.log(`W ${r.label}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; start ${r.tempStart ?? '?'} °C; timed ${JSON.stringify(r.timed)}; y ${JSON.stringify(r.y)}; row top ${JSON.stringify(r.rowTop)}`);
  out.gates.framesTimed = frameGate(ok('C').map((r) => r.timed), ok('V').map((r) => r.timed), 3);
  for (const k of ['idle', 'scroll', 'hold']) {
    const d = (c) => median(ok('V').map((r) => r.parts[k][c])) - median(ok('C').map((r) => r.parts[k][c]));
    out.gates[`${k}Descriptive`] = ok('C').length && ok('V').length ? { delta: Object.fromEntries(['frames', ...Object.keys(TH)].map((c) => [c, d(c)])), note: 'descriptive, no gate' } : 'not enough';
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`scorer sha256 ${self}`);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
}

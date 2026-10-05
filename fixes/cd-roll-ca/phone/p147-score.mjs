#!/usr/bin/env node
// p147-score.mjs: P-147 phone no-worse check of the panel clock roll (PHONE TICKET P-147, fixes/cd-roll-ca/README.md).
// C = current v9-final (JS 1b2eecc66011), V = C + the P-097 delta (JS 2cfd990c788d), CSS e1359ab9994a both. Built on
// k-score.mjs (its W voids, sentinel voiding in block order and served check, with credit); only the window, the
// thresholds of the rule and the descriptive counts differ. Frame counts only, driver W, Timeline off.
// usage: node fixes/cd-roll-ca/phone/p147-score.mjs <arm>:<file> ... [--json out.json]     node … --selftest
//   Pass every W run file of the block in block order (warm-ups may be passed: skipped).
// Window (fixed before data): hold = frames with t in [marks.hold[0], marks.hold[1]), dt != null: 12 s at the page end
//   with the menu open (the page's settle after the scroll-in included, as in every arm).
// Counts per run: dt > 50 (twins > 46, > 54), dt > 34 (twins > 30, > 38); near bands (30, 38] and (46, 54] ms flagged;
//   descriptive: inline-style mutations (probe types style, same) in the hold rows; m (the probe's --morph column) on
//   the first and last hold frame.
// Rule (no-worse): N1 V median(> 50) <= C median(> 50) + 1; N2 V median(> 34) <= C median(> 34) + 2; each twin judged
//   the same way, a verdict that differs with a twin is "threshold-sensitive". Needs >= 3 valid runs per arm, else
//   "not enough". Voids (dropped, reported): meta.error; served JS/CSS not the arm's; Low Power Mode; no hold marks; a
//   C run whose heat sentinel fails or has no data voids itself and every run since the last passing C run.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const EXPECT = {
  C: { js: '1b2eecc66011', css: 'e1359ab9994a' },
  V: { js: '2cfd990c788d', css: 'e1359ab9994a' },
};
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
export const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const cnt = (dts) => Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pref = (full, p) => typeof full === 'string' && typeof p === 'string' && (full.startsWith(p) || p.startsWith(full));

export function scoreW(j, arm) {
  const m = j.meta || {}; const v = [];
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  if (!(pref(sv[NODE], EXPECT[arm].js) && pref(sv[CSS], EXPECT[arm].css))) v.push(`served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  const h = j.marks?.hold;
  let hold = null;
  if (!h || h[0] == null || h[1] == null) v.push('no hold marks');
  else {
    const F = (j.frames || []).map((f, k) => [k, f]).filter(([, f]) => f[1] != null && f[0] >= h[0] && f[0] < h[1]);
    const dts = F.map(([, f]) => f[1]);
    const rows = new Set(F.map(([k]) => k));
    const types = j.mutations?.types || [], si = types.indexOf('style'), sa = types.indexOf('same');
    let style = 0, same = 0;
    for (const [k, ...c] of j.mutations?.counts || []) if (rows.has(k)) { if (si >= 0) style += c[si]; if (sa >= 0) same += c[sa]; }
    hold = { frames: dts.length, ...cnt(dts), near34: dts.filter((d) => d > 30 && d <= 38).length, near50: dts.filter((d) => d > 46 && d <= 54).length,
      styleMut: style, sameMut: same, m: F.length ? [F[0][1][5], F[F.length - 1][1][5]] : null };
  }
  return { arm, label: m.label, warmup: !!m.warmup, void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, hold };
}
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
export function gate(C, V, minN = 3) {
  const out = { nC: C.length, nV: V.length };
  if (C.length < minN || V.length < minN) return { ...out, verdict: `not enough (C ${C.length}, V ${V.length}, need ${minN})` };
  const d = (k) => median(V.map((x) => x[k])) - median(C.map((x) => x[k]));
  out.delta = Object.fromEntries(Object.keys(TH).map((k) => [k, d(k)]));
  const n1 = (k) => d(k) <= 1, n2 = (k) => d(k) <= 2;
  out.N1 = n1('gt50') ? 'pass' : 'MISS'; out.N1sensitive = [n1('gt46'), n1('gt54')].some((x) => x !== n1('gt50'));
  out.N2 = n2('gt34') ? 'pass' : 'MISS'; out.N2sensitive = [n2('gt30'), n2('gt38')].some((x) => x !== n2('gt34'));
  out.verdict = out.N1 === 'pass' && out.N2 === 'pass' ? 'pass' : 'MISS';
  out.descriptive = { styleMut: [median(C.map((x) => x.styleMut)), median(V.map((x) => x.styleMut))], sameMut: [median(C.map((x) => x.sameMut)), median(V.map((x) => x.sameMut))] };
  return out;
}

export function selftest() {
  const ok = [], fail = (m) => { throw new Error('SELFTEST ' + m); };
  const run = (arm, dts, { warmup = false, served = EXPECT[arm], sentinel = true, styleRows = 0 } = {}) => {
    const frames = [[0, null, 0, 0, 800, '1']]; let t = 0; dts.forEach((d) => { t += d; frames.push([t, d, 0, 0, 800, '1']); });
    return { meta: { schema: 'fw-iphone-run/1', driver: 'W', label: `${arm}${dts.length}`, warmup, served: { [NODE]: served.js, [CSS]: served.css }, sentinel: { pass: sentinel } },
      marks: { hold: [1, t + 1] }, frames, mutations: { types: ['src', 'class', 'style', 'same'], counts: Array.from({ length: styleRows }, (_, k) => [k + 1, 0, 0, 2, 1]) } };
  };
  const base = Array(700).fill(16.7);
  const r1 = scoreW(run('C', [...base, 60, 40, 35, 52]), 'C');
  if (r1.hold.gt50 !== 2 || r1.hold.gt34 !== 4 || r1.hold.gt54 !== 1 || r1.hold.gt46 !== 2 || r1.hold.near34 !== 1 || r1.hold.near50 !== 1) fail('counts ' + JSON.stringify(r1.hold));
  ok.push('hold window counts: > 50, > 34 and their twins; near bands flagged');
  const r2 = scoreW(run('V', base, { styleRows: 5 }), 'V');
  if (r2.hold.styleMut !== 10 || r2.hold.sameMut !== 5) fail('mutations ' + JSON.stringify(r2.hold)); ok.push('style / same mutations summed over the hold rows');
  if (!scoreW(run('V', base, { served: EXPECT.C }), 'V').void.length) fail('served'); ok.push('served JS of the other arm voids the run');
  const L = [scoreW(run('C', base), 'C'), scoreW(run('V', base), 'V'), scoreW(run('V', base), 'V'), scoreW(run('C', base, { sentinel: false }), 'C'), scoreW(run('C', base), 'C')];
  applySentinel(L, (r) => r.sentinel?.pass ?? null);
  if (L[0].void.length || !L[1].void.length || !L[2].void.length || !L[3].void.length || L[4].void.length) fail('sentinel ' + JSON.stringify(L.map((r) => r.void)));
  ok.push('a failing C sentinel voids itself and every run since the last passing C');
  const h = (g50, g34) => ({ gt50: g50, gt46: g50, gt54: g50, gt34: g34, gt30: g34, gt38: g34, styleMut: 0, sameMut: 0 });
  const g1 = gate([h(1, 3), h(1, 3), h(2, 4)], [h(2, 5), h(2, 5), h(3, 6)]);
  const g2 = gate([h(1, 3), h(1, 3), h(2, 4)], [h(3, 3), h(3, 3), h(3, 3)]);
  const g3 = gate([h(1, 3), h(1, 3)], [h(1, 3), h(1, 3), h(1, 3)]);
  if (g1.verdict !== 'pass' || g2.N1 !== 'MISS' || !g3.verdict.startsWith('not enough')) fail('gate ' + JSON.stringify([g1, g2, g3]));
  ok.push('N1: V median > 50 <= C + 1; N2: V median > 34 <= C + 2; fewer than 3 valid runs per arm: not enough');
  return ok;
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) { const r = selftest(); for (const x of r) console.log('ok', x); console.log(`SELFTEST PASS ${r.length} (sha256 ${self.slice(0, 12)})`); process.exit(0); }
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--json')).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), file: s.slice(k + 1) }; });
if (files.length) {
  for (const f of files) if (!['C', 'V'].includes(f.arm)) throw new Error(`arm must be C or V: ${f.arm}:${f.file}`);
  const runs = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(f.file, 'utf8'));
    if (j?.meta?.schema !== 'fw-iphone-run/1') throw new Error(`${f.file}: unknown schema`);
    if (j.meta.driver !== 'W') throw new Error(`${f.file}: driver ${j.meta.driver}, not W`);
    runs.push({ file: f.file, ...scoreW(j, f.arm) });
  }
  const W = runs.filter((r) => !r.warmup);
  applySentinel(W, (r) => r.sentinel?.pass ?? null);
  const ok = (arm) => W.filter((r) => r.arm === arm && !r.void.length).map((r) => r.hold);
  const out = { scorer: 'fixes/cd-roll-ca/phone/p147-score.mjs', sha256: self, runs, gate: gate(ok('C'), ok('V')) };
  for (const r of runs) console.log(`W ${r.label}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; start ${r.tempStart ?? '?'} °C; hold ${JSON.stringify(r.hold)}`);
  console.log('gate', JSON.stringify(out.gate));
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
}

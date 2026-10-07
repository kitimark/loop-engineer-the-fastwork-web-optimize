#!/usr/bin/env node
// P-158 reader (arch-compositor-morph; a pure reader: no device, no measurement). Question: in a fast short swipe (G, fs
// 8737f212c0ff), does v11 have more slow frames than C on the frames that cross a CM threshold?
//   node fixes/compositor-morph/phone-v11/p158-read.mjs <runs folder> [--runs EC1,EV1,...] [--json out.json]
//   node fixes/compositor-morph/phone-v11/p158-read.mjs --start-state <C gesture.json> <V gesture.json>
//   node fixes/compositor-morph/phone-v11/p158-read.mjs --selftest
// Frames: segment 0 of g-<run>.json, rows [t, dt, scrollY, innerHeight]; m = (y - (docH - 2 ih)) / ih (as cm-read.mjs
// mOf; docH1 or docH). A frame "moves" when its scrollY differs from the previous row's. A moving frame is a CROSSING
// frame when the interval (m_prev, m] crosses one of CM's thresholds 0, 0.08, 0.2, 0.35, 0.4, 0.55, 0.92, 1 (the values
// at which v11 flips the nav's Svelte state; C flips its classes at the same values). Per run: crossing frames n, slow
// shares at > 50 ms with the twins > 46 / > 54, and > 34 with > 30 / > 38 (phone, 1 ms stamps); the same for the
// other moving frames with 0 < m < 1 (descriptive).
// Verdict (P-158 card, fixes/compositor-morph/README.md): per threshold T in {50, 46, 54}: "le" when the V median share
// <= the C median share; "worse" when every V run's share > every C run's share (at least 3 valid runs per arm); else
// "open". (a) le at all three; (b) worse at all three; (c) anything else (threshold-sensitive or insufficient).
// --start-state: the P-120-style pre-data check on two Simulator gesture records (sim.mjs gesture --count-only): start m,
// the order of the opens and closes (m crossing 0 and 1), the settle ys (scrollY after each 300 ms of no move), moving frames.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export const TH = [0, 0.08, 0.2, 0.35, 0.4, 0.55, 0.92, 1];
export const mAt = (seg, i) => { const r = seg.frames[i]; const docH = seg.docH1 ?? seg.docH ?? 0; return (r[2] - (docH - 2 * r[3])) / r[3]; };
export const crosses = (a, b) => TH.some((t) => (a < t) !== (b < t));
export function runCounts(seg) {
  const fr = seg.frames; const X = { n: 0 }, O = { n: 0 }; const ks = [50, 46, 54, 34, 30, 38];
  for (const k of ks) { X['gt' + k] = 0; O['gt' + k] = 0; }
  for (let i = 1; i < fr.length; i++) {
    if (fr[i][2] === fr[i - 1][2]) continue;
    const a = mAt(seg, i - 1), b = mAt(seg, i), dt = fr[i][1];
    const bin = crosses(a, b) ? X : (b > 0 && b < 1 ? O : null);
    if (!bin) continue;
    bin.n++; for (const k of ks) if (dt > k) bin['gt' + k]++;
  }
  const share = (B) => Object.fromEntries(ks.map((k) => [k, B.n ? +(B['gt' + k] / B.n).toFixed(4) : null]));
  return { crossing: { ...X, share: share(X) }, other: { ...O, share: share(O) } };
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function verdict(c, v) { // c, v: arrays of crossing shares per run, by threshold key
  const per = {};
  for (const k of [50, 46, 54]) {
    const C = c.map((x) => x[k]), V = v.map((x) => x[k]);
    if (C.length < 3 || V.length < 3) { per[k] = 'open'; continue; }
    per[k] = med(V) <= med(C) ? 'le' : Math.min(...V) > Math.max(...C) ? 'worse' : 'open';
  }
  const all = Object.values(per);
  return { per, decision: all.every((x) => x === 'le') ? 'a' : all.every((x) => x === 'worse') ? 'b' : 'c' };
}
export function startState(seg) {
  const fr = seg.frames; let moving = 0; const events = []; const settles = []; let lastMove = fr[0]?.[0] ?? 0, settledAt = null;
  for (let i = 1; i < fr.length; i++) {
    const a = mAt(seg, i - 1), b = mAt(seg, i);
    if (fr[i][2] !== fr[i - 1][2]) { moving++; lastMove = fr[i][0]; settledAt = null; }
    else if (fr[i][0] - lastMove >= 300 && settledAt === null) { settledAt = fr[i][0]; settles.push(fr[i][2]); }
    if ((a <= 0) !== (b <= 0)) events.push(b > 0 ? 'open' : 'close');
    if ((a >= 1) !== (b >= 1)) events.push(b >= 1 ? 'end' : 'leave');
  }
  return { startM: +mAt(seg, 0).toFixed(3), startY: fr[0]?.[2], order: events.join(' '), settles, moving, frames: fr.length };
}
function selftest() {
  const seg = { docH: 1000, frames: [[0, 16, 0, 100], [16, 16, 820, 100], [33, 60, 805, 100], [50, 17, 805, 100], [66, 55, 850, 100], [83, 16, 852, 100]] };
  // m = (y - 800) / 100: 0 -> -8, 820 -> 0.2, 805 -> 0.05, 850 -> 0.5, 852 -> 0.52 (no threshold: an other frame)
  const r = runCounts(seg);
  const ok = [
    ['crossing n', r.crossing.n === 3], // 0->820 crosses 0, 0.08, 0.2; 820->805 crosses 0.08, 0.2; 805->850 crosses 0.08 .. 0.4
    ['crossing >50', r.crossing.gt50 === 2],
    ['other n', r.other.n === 1],
    ['verdict a', verdict([{ 50: 0.2, 46: 0.2, 54: 0.2 }, { 50: 0.2, 46: 0.2, 54: 0.2 }, { 50: 0.2, 46: 0.2, 54: 0.2 }], [{ 50: 0.1, 46: 0.1, 54: 0.1 }, { 50: 0.2, 46: 0.2, 54: 0.2 }, { 50: 0.3, 46: 0.3, 54: 0.3 }]).decision === 'a'],
    ['verdict b', verdict([{ 50: 0.1, 46: 0.1, 54: 0.1 }, { 50: 0.1, 46: 0.1, 54: 0.1 }, { 50: 0.1, 46: 0.1, 54: 0.1 }], [{ 50: 0.2, 46: 0.2, 54: 0.2 }, { 50: 0.2, 46: 0.2, 54: 0.2 }, { 50: 0.3, 46: 0.3, 54: 0.3 }]).decision === 'b'],
    ['verdict c', verdict([{ 50: 0.1, 46: 0.2, 54: 0.1 }, { 50: 0.1, 46: 0.2, 54: 0.1 }, { 50: 0.1, 46: 0.2, 54: 0.1 }], [{ 50: 0.2, 46: 0.1, 54: 0.2 }, { 50: 0.2, 46: 0.1, 54: 0.2 }, { 50: 0.3, 46: 0.1, 54: 0.3 }]).decision === 'c'],
  ];
  const bad = ok.filter(([, v]) => !v);
  console.log(bad.length ? 'SELFTEST FAIL ' + bad.map(([k]) => k).join(', ') : `SELFTEST ok (${ok.length} checks)`);
  process.exitCode = bad.length ? 1 : 0;
}
const argv = process.argv.slice(2);
if (argv[0] === '--selftest') selftest();
else if (argv[0] === '--start-state') {
  for (const f of argv.slice(1, 3)) { const j = JSON.parse(readFileSync(f, 'utf8')); console.log(f.replace(/.*\//, ''), JSON.stringify(startState(j.run.segments[0]))); }
} else if (argv[0]) {
  const dir = argv[0]; const ri = argv.indexOf('--runs');
  const names = ri > 0 ? argv[ri + 1].split(',') : ['EC1', 'EV1', 'EV2', 'EC2', 'EC3', 'EV3', 'EV4', 'EC4'];
  const out = { runs: {} };
  for (const nm of names) {
    const f = join(dir, `g-${nm}.json`); if (!existsSync(f)) { console.log(nm, 'missing'); continue; }
    const j = JSON.parse(readFileSync(f, 'utf8')); const r = runCounts(j.run.segments[0]); out.runs[nm] = r;
    const s = (B) => `n ${B.n} >50 ${B.share[50]} (>46 ${B.share[46]} >54 ${B.share[54]}) >34 ${B.share[34]} (>30 ${B.share[30]} >38 ${B.share[38]})`;
    console.log(`${nm} crossing ${s(r.crossing)} | other ${s(r.other)}`);
  }
  const C = Object.entries(out.runs).filter(([k]) => /^EC/.test(k)).map(([, r]) => r.crossing.share), V = Object.entries(out.runs).filter(([k]) => /^EV/.test(k)).map(([, r]) => r.crossing.share);
  out.verdict = verdict(C, V); console.log('VERDICT', JSON.stringify(out.verdict));
  const ji = argv.indexOf('--json'); if (ji > 0) writeFileSync(argv[ji + 1], JSON.stringify(out, null, 1));
} else console.log('usage: see header');

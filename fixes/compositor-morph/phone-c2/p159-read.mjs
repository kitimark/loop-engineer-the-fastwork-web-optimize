#!/usr/bin/env node
// P-159 reader (arch-compositor-morph; a pure reader: no device, no measurement). Question: is v11+c2 no worse than C
// on the first open after load and on every open from closed? (Card: fixes/compositor-morph/README.md "P-159 card".)
//   node fixes/compositor-morph/phone-c2/p159-read.mjs <runs folder> [--runs EC1,EV1,...] [--json out.json]
//   node fixes/compositor-morph/phone-c2/p159-read.mjs --selftest
// Runs: g-<run>.json (segment 0 rows [t, dt, scrollY, innerHeight], touches [t, type]) from cm-hold.sh; a run counts only
// when its hold log (<runs folder>/../hold-<H>.log) ends "HOLD <H> VALID" (p153-read's holdStatus). A re-run <run>r
// replaces its run only when the first try's hold was not VALID or the first try has no file.
// METRICS (per counted run)
//   O1.f2: p153-read's firstOpen (opens(): m with lvh, the first open after load; f2 = the frame after the open frame's),
//     the same function as nw11-read's Pr1.
//   open-0 frames: finger-down moving frames whose m (P-158's form, (y - (docH - 2 ih)) / ih) goes from <= 0 to > 0
//     (an open from closed; the frame P-158's line-up and int-v11 read): n, median dt, share with dt > 34 and the
//     twins > 30 / > 38, and > 50 (descriptive).
//   Descriptive: P-158's finger-down crossing frames (p158-read runCounts), and their 34-50 ms band share (> 34 minus > 50).
// DECISION (fixed before data, P-159 card):
//   D1 first open: median V O1.f2 - median C O1.f2 <= +4 ms (the phone minShift; nw11-read's Pr1 bound). >= 3 first
//     opens per arm, else INSUFFICIENT.
//   D2 open-0 median dt: median over runs of V's per-run median dt - the same for C <= +4 ms.
//   D3 open-0 share: per T in {34, 30, 38}: "le" when V's median share <= C's; "worse" when every V run's share > every
//     C run's (>= 3 valid runs per arm); else "open".
//   PASS: D1 and D2 within their bounds and D3 "le" at all three T. FAIL: D1 or D2 over its bound, or D3 "worse" at all
//   three T. Anything else: OPEN (threshold-sensitive or insufficient), reported to the lead; no second block without his OK.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { firstOpen, holdStatus } = await import(pathToFileURL(join(root, 'fixes', 'end-morph-p1', 'phone', 'p153-read.mjs')).href);
// copied from ../phone-v11/p158-read.mjs (same author; that file runs its CLI on import, so it is not imported)
const TH = [0, 0.08, 0.2, 0.35, 0.4, 0.55, 0.92, 1];
const mAt = (seg, i) => { const r = seg.frames[i]; const docH = seg.docH1 ?? seg.docH ?? 0; return (r[2] - (docH - 2 * r[3])) / r[3]; };
const crosses = (a, b) => TH.some((t) => (a < t) !== (b < t));
function downIntervals(seg) {
  const iv = []; let s = null;
  for (const r of seg.touches ?? []) { if (r[1] === 's' && s === null) s = r[0]; else if ((r[1] === 'e' || r[1] === 'c') && s !== null) { iv.push([s, r[0]]); s = null; } }
  if (s !== null) iv.push([s, Infinity]);
  return iv;
}
function crossingDown(seg) { // P-158's finger-down crossing frames: n, > 34, > 50
  const fr = seg.frames, iv = downIntervals(seg), B = { n: 0, gt34: 0, gt50: 0 };
  for (let i = 1; i < fr.length; i++) {
    if (fr[i][2] === fr[i - 1][2] || !crosses(mAt(seg, i - 1), mAt(seg, i)) || !iv.some(([a, b]) => fr[i][0] >= a && fr[i][0] <= b)) continue;
    B.n++; if (fr[i][1] > 34) B.gt34++; if (fr[i][1] > 50) B.gt50++;
  }
  return B;
}
export const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const BOUND_MS = 4;
export function open0(seg) {
  const fr = seg.frames, iv = downIntervals(seg), dts = [];
  const isDown = (t) => iv.some(([a, b]) => t >= a && t <= b);
  for (let i = 1; i < fr.length; i++) {
    if (fr[i][2] === fr[i - 1][2]) continue;
    if (mAt(seg, i - 1) <= 0 && mAt(seg, i) > 0 && isDown(fr[i][0])) dts.push(fr[i][1]);
  }
  const sh = (k) => (dts.length ? +(dts.filter((d) => d > k).length / dts.length).toFixed(4) : null);
  return { n: dts.length, dts, medianDt: med(dts), share: { 34: sh(34), 30: sh(30), 38: sh(38), 50: sh(50) } };
}
export function decide(C, V) { // C, V: arrays of per-run { f2, medianDt, share }
  const f2C = C.map((r) => r.f2).filter((x) => x != null), f2V = V.map((r) => r.f2).filter((x) => x != null);
  const d1 = f2C.length >= 3 && f2V.length >= 3 ? { diff: med(f2V) - med(f2C), ok: med(f2V) - med(f2C) <= BOUND_MS + 1e-9 } : { diff: null, ok: null };
  const mC = C.map((r) => r.medianDt).filter((x) => x != null), mV = V.map((r) => r.medianDt).filter((x) => x != null);
  const d2 = mC.length >= 3 && mV.length >= 3 ? { diff: med(mV) - med(mC), ok: med(mV) - med(mC) <= BOUND_MS + 1e-9 } : { diff: null, ok: null };
  const d3 = {};
  for (const k of [34, 30, 38]) {
    const c = C.map((r) => r.share?.[k]).filter((x) => x != null), v = V.map((r) => r.share?.[k]).filter((x) => x != null);
    d3[k] = c.length < 3 || v.length < 3 ? 'open' : med(v) <= med(c) ? 'le' : Math.min(...v) > Math.max(...c) ? 'worse' : 'open';
  }
  const d3v = Object.values(d3);
  const fail = d1.ok === false || d2.ok === false || d3v.every((x) => x === 'worse');
  const pass = d1.ok === true && d2.ok === true && d3v.every((x) => x === 'le');
  return { d1, d2, d3, decision: fail ? 'FAIL' : pass ? 'PASS' : 'OPEN' };
}
function selftest() {
  // m = (y - (1000 - 200)) / 100 = (y - 800) / 100; finger down 0..100 ms
  const seg = { docH: 1000, touches: [[0, 's'], [100, 'e']], frames: [[0, 16, 700, 100], [16, 40, 790, 100], [33, 36, 805, 100], [50, 17, 790, 100], [66, 31, 810, 100], [120, 60, 790, 100], [140, 60, 830, 100]] };
  const o = open0(seg); // opens: 790->805 (dt 36, down), 790->810 (dt 31, down); 790->830 at t 140 is after lift
  const P = (f2, md, s) => ({ f2, medianDt: md, share: { 34: s, 30: s, 38: s } });
  const ok = [
    ['open0 n', o.n === 2],
    ['open0 median', o.medianDt === 33.5],
    ['open0 share 34', o.share[34] === 0.5 && o.share[30] === 1 && o.share[38] === 0],
    ['pass', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.2)], [P(32, 22, 0.1), P(31, 20, 0.0), P(33, 23, 0.1)]).decision === 'PASS'],
    ['fail f2', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.2)], [P(45, 20, 0.1), P(44, 20, 0.0), P(46, 20, 0.1)]).decision === 'FAIL'],
    ['fail share', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.1)], [P(30, 22, 0.5), P(30, 20, 0.6), P(30, 21, 0.4)]).decision === 'FAIL'],
    ['open share', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.3)], [P(30, 22, 0.2), P(30, 20, 0.2), P(30, 21, 0.0)]).decision === 'OPEN'],
    ['insufficient', decide([P(30, 20, 0.1), P(28, 21, 0.1)], [P(30, 22, 0.1), P(30, 20, 0.1), P(30, 21, 0.1)]).decision === 'OPEN'],
  ];
  const bad = ok.filter(([, v]) => !v);
  console.log(bad.length ? 'SELFTEST FAIL ' + bad.map(([k]) => k).join(', ') : `SELFTEST ok (${ok.length} checks)`);
  process.exitCode = bad.length ? 1 : 0;
}
const argv = process.argv.slice(2);
if (argv[0] === '--selftest') selftest();
else if (argv[0]) {
  const dir = argv[0], ri = argv.indexOf('--runs');
  const names = ri > 0 ? argv[ri + 1].split(',') : ['EC1', 'EV1', 'EV2', 'EC2', 'EC3', 'EV3', 'EV4', 'EC4'];
  const logs = {}; const ld = join(dir, '..');
  for (const f of readdirSync(ld).filter((f) => /^hold-H\d+\.log$/.test(f))) logs[f.slice(5, -4)] = readFileSync(join(ld, f), 'utf8');
  const hs = holdStatus(logs);
  const out = { runs: {}, holds: hs };
  for (const nm of names) {
    let use = nm;
    if (!(hs[nm]?.valid && existsSync(join(dir, `g-${nm}.json`))) && hs[nm + 'r']?.valid && existsSync(join(dir, `g-${nm}r.json`))) use = nm + 'r';
    const f = join(dir, `g-${use}.json`);
    if (!existsSync(f)) { console.log(nm, 'missing'); continue; }
    if (!hs[use]?.valid) { console.log(nm, `NOT COUNTED: ${hs[use]?.why ?? 'no hold log names it'}`); continue; }
    const g = JSON.parse(readFileSync(f, 'utf8')), seg = g.run.segments[0];
    const fo = firstOpen(g), o = open0(seg), pc = crossingDown(seg);
    const band = pc.n ? +((pc.gt34 - pc.gt50) / pc.n).toFixed(4) : null;
    out.runs[nm] = { file: use, f2: fo.o1?.f2 ?? null, f123: fo.o1?.f123 ?? null, n: o.n, medianDt: o.medianDt, share: o.share, dts: o.dts, p158Down: { n: pc.n, gt34: pc.gt34, gt50: pc.gt50, band3450: band } };
    console.log(`${nm}${use !== nm ? ' (' + use + ')' : ''} O1 f2 ${fo.o1?.f2 ?? 'none'} f123 ${fo.o1?.f123 ?? 'none'} | open-0 n ${o.n} median ${o.medianDt} >34 ${o.share[34]} (>30 ${o.share[30]} >38 ${o.share[38]}) >50 ${o.share[50]} dts ${o.dts.join(',')} | P-158 finger-down crossing n ${pc.n} 34-50 band ${band}`);
  }
  const arm = (re) => Object.entries(out.runs).filter(([k]) => re.test(k)).map(([, r]) => r);
  const C = arm(/^EC/), V = arm(/^EV/);
  out.decision = decide(C, V);
  const st = (a) => `median ${med(a)} (${a.length ? Math.min(...a) + '-' + Math.max(...a) : 'none'})`;
  console.log(`D1 O1.f2 C ${st(C.map((r) => r.f2).filter((x) => x != null))} V ${st(V.map((r) => r.f2).filter((x) => x != null))} diff ${out.decision.d1.diff} -> ${out.decision.d1.ok === null ? 'INSUFFICIENT' : out.decision.d1.ok ? 'within +4' : 'OVER +4'}`);
  console.log(`D2 open-0 median dt C ${st(C.map((r) => r.medianDt).filter((x) => x != null))} V ${st(V.map((r) => r.medianDt).filter((x) => x != null))} diff ${out.decision.d2.diff} -> ${out.decision.d2.ok === null ? 'INSUFFICIENT' : out.decision.d2.ok ? 'within +4' : 'OVER +4'}`);
  console.log(`D3 open-0 share >34/>30/>38 C ${[34, 30, 38].map((k) => med(C.map((r) => r.share[k]))).join('/')} V ${[34, 30, 38].map((k) => med(V.map((r) => r.share[k]))).join('/')} -> ${JSON.stringify(out.decision.d3)}`);
  console.log(`descriptive: P-158 finger-down 34-50 band C ${st(C.map((r) => r.p158Down.band3450))} V ${st(V.map((r) => r.p158Down.band3450))}`);
  console.log(`DECISION ${out.decision.decision}`);
  const ji = argv.indexOf('--json'); if (ji > 0) writeFileSync(argv[ji + 1], JSON.stringify(out, null, 1));
} else console.log('usage: see header');

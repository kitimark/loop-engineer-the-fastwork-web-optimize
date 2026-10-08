#!/usr/bin/env node
// P-171 reader (fix-g0-box; candidate 1, D signed NAMED by the lead 2026-10-09; written before any P-171 data). Pure
// reader: no device. G runs of the g0 program (38d7fe5d7fa8) in out/p171p/runs (g-<run>.json + tl-<run>.json), C = g0.0h,
// V = ws.
// PRIMARY (lead's condition 3): the te-crossing frame X = the longest frame (any finger state) whose scrollY lies in the
// crossing window W = [1650, 1850] (te's 200 % edge: phone P-164 cluster ~1750, Simulator 1714-1735 at the same 775 px
// view), in the approach (before O1). Per run: X.dt and X's Layout + RecalculateStyles from Timeline (union, eop-read's
// inSpan). Per arm: median of X.dt and of X.LS over the runs; and the runs with X.dt > 50 (twins 46 / 54) and > 34 (30/38).
// LOCATION CHECK: C's X carries L+S >= 20 ms in >= 3 of its runs (the spike is in W on the phone); else the window missed.
// PARITY: per run the open / close trigger counts (eop-read's triggers()); every V run must equal the C runs' counts.
// DESCRIPTIVE: frames in W > 50 / > 34 per run; whole-approach finger-down > 50 / > 34 (sticky-dominated, no verdict).
//   node fixes/g0-box/phone/p171-read.mjs [runs dir=out/p171p/runs] [--json out.json] | --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { triggers, tlSpans, inSpan, readRun } from './eop-read.mjs';

export const W = [1650, 1850];
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

export function readX(g, tl) {
  const seg = g.run.segments[0]; const tr = triggers(seg); const o1 = tr.find((x) => x.kind === 'open');
  const ap = (seg.marks || []).find((m) => m[1] === 'approach'); const t0 = ap ? ap[0] : -Infinity, t1 = o1 ? o1.t : Infinity;
  const inW = seg.frames.filter((f) => f[0] > t0 && f[0] <= t1 && f[2] >= W[0] && f[2] <= W[1]);
  const X = inW.reduce((p, f) => (!p || f[1] > p[1] ? f : p), null);
  const spans = tlSpans(tl); const tx = X && spans.length ? inSpan(spans, X[0] - X[1], X[0]) : null;
  return { X: X ? { t: X[0], dt: X[1], y: X[2], ls: tx ? r1((tx.Layout || 0) + (tx.RecalculateStyles || 0)) : null, tl: tx } : null,
    inW: { n: inW.length, gt50: inW.filter((f) => f[1] > 50).length, gt34: inW.filter((f) => f[1] > 34).length },
    opens: tr.filter((x) => x.kind === 'open').length, closes: tr.filter((x) => x.kind === 'close').length };
}

export function verdict(C, V) { // C, V: arrays of readX results (runs with an X)
  const m = (A, k) => r1(med(A.map((r) => r.X?.[k] ?? null)));
  const cnt = (A, t) => A.filter((r) => r.X && r.X.dt > t).length;
  const located = C.filter((r) => r.X && r.X.ls != null && r.X.ls >= 20).length >= 3;
  const d = m(V, 'dt') - m(C, 'dt'), dls = m(V, 'ls') - m(C, 'ls');
  const twins = [46, 50, 54].map((t) => cnt(V, t) - cnt(C, t)); // V - C, runs with X.dt over t
  const sens = twins.some((x) => Math.sign(x) !== Math.sign(twins[1]));
  const parity = V.every((r) => r.opens === C[0]?.opens && r.closes === C[0]?.closes) && C.every((r) => r.opens === C[0].opens && r.closes === C[0].closes);
  let v;
  if (!located) v = 'OPEN (window missed: C has no L+S spike in W)';
  else if (!parity) v = 'FAIL (behaviour: open/close counts differ)';
  else if (d <= -10 && dls < 0) v = 'GAIN';
  else if (d > 4) v = 'WORSE';
  else v = 'NO GAIN';
  if (sens && v === 'GAIN') v = 'GAIN (threshold-sensitive)';
  return { medC: m(C, 'dt'), medV: m(V, 'dt'), d: r1(d), lsC: m(C, 'ls'), lsV: m(V, 'ls'), dls: r1(dls), twins, located, parity, verdict: v };
}

function selftest() {
  const bad = []; const ok = (c, msg) => { if (!c) bad.push(msg); };
  const mk = (dtX, lsX, opens = 1) => {
    const frames = [[100, 16, 1600, 775], [200, 30, 1700, 775], [300, dtX, 1750, 775], [400, 60, 1900, 775], [600, 16, 5213, 775]];
    const touches = [[50, 's', 1, 1, 0, 1500, 700], [500, 'e', 1, 1, 0, 1900, 200], [550, 's', 1, 1, 0, 5213, 700], [560, 'm', 1, 1, 1, 5213, 650], [590, 'e', 1, 1, 0, 5213, 600]];
    const tl = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: (300 - dtX) / 1000, endTime: 0.3, children: [{ type: 'Layout', startTime: (300 - dtX) / 1000, endTime: (300 - dtX + lsX) / 1000 }] }] };
    return readX({ run: { segments: [{ docH: 6000, vh0: 775, marks: [[40, 'approach']], frames, touches }] } }, tl);
  };
  const a = mk(110, 80); ok(a.X.dt === 110 && a.X.y === 1750 && a.X.ls === 80 && a.inW.n === 2 && a.inW.gt50 === 1 && a.opens === 1, `readX ${JSON.stringify(a)}`);
  const C = [mk(110, 80), mk(100, 70), mk(120, 90), mk(105, 60)], V = [mk(45, 20), mk(40, 22), mk(55, 25), mk(50, 18)];
  const v = verdict(C, V); ok(v.verdict === "GAIN" && v.d === -60 && v.located && v.parity, `gain ${JSON.stringify(v)}`);
  ok(verdict(C, C).verdict === 'NO GAIN', 'aa');
  ok(verdict([mk(40, 5), mk(40, 5), mk(40, 5), mk(40, 5)], V).verdict.startsWith('OPEN'), 'located');
  ok(verdict(C, [Object.assign(mk(45, 20), { opens: 2 }), mk(40, 22), mk(55, 25), mk(50, 18)]).verdict.startsWith('FAIL'), 'parity');
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (crossing frame X in W, Timeline L+S, verdict GAIN / NO GAIN / OPEN / FAIL)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const ji = args.indexOf('--json');
  const dir = args.find((x, i) => !x.startsWith('--') && (ji < 0 || i !== ji + 1)) || 'out/p171p/runs';
  const res = { runs: {}, C: [], V: [] };
  for (const run of ['EC1', 'EC2', 'EC3', 'EC4', 'EV1', 'EV2', 'EV3', 'EV4']) {
    const f = join(dir, `g-${run}.json`); if (!existsSync(f)) continue;
    const tf = join(dir, `tl-${run}.json`); const g = JSON.parse(readFileSync(f, 'utf8')); const tl = existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null;
    const r = readX(g, tl); const a = readRun(g, tl).approach.fingerDown; r.approach = { gt50: a.gt50, gt34: a.gt34 };
    res.runs[run] = r; res[run[1]].push(r);
    console.log(`${run}: X ${r.X ? `y ${r.X.y} dt ${r.X.dt} L+S ${r.X.ls}` : 'none'} | W frames ${r.inW.n} >50 ${r.inW.gt50} >34 ${r.inW.gt34} | opens ${r.opens} closes ${r.closes} | approach finger-down >50 ${a.gt50} >34 ${a.gt34} (descriptive)`);
  }
  if (res.C.length && res.V.length) { res.verdict = verdict(res.C, res.V); const v = res.verdict;
    console.log(`P-171: median X.dt C ${v.medC} V ${v.medV} (d ${v.d}) | median X L+S C ${v.lsC} V ${v.lsV} (d ${v.dls}) | runs X.dt over 46/50/54, V - C: ${v.twins.join('/')} | located ${v.located} parity ${v.parity} -> ${v.verdict}`); }
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}

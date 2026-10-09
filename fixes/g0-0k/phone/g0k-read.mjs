#!/usr/bin/env node
// P-173 reader (fix-cm-return; card fixes/g0-0k/README.md "Phone check card", signed by the lead 2026-10-09 ~04:25Z;
// written and frozen before any P-173 data). Pure reader: no device. G runs of the g0 program (38d7fe5d7fa8) in
// out/g0kp/runs (g-<run>.json + tl-<run>.json), C = g0.0j, V = g0.0k; a re-run <run>r replaces its run.
// A frame [t, dt, scrollY, innerHeight] covers (t - dt, t]. Segment 0. Helpers from fix-g0-box's eop-read.mjs (imported).
// Parts per run:
//   APPROACH = frames after the `approach` mark up to the END start
//   END      = frames after the END start to the run end
//   END start: C = eop-read's O1 (first prevented upward touchmove while closed, g0.0j's jack at the pin);
//              V = the first frame after the approach mark with scrollY >= docH - innerHeight - 815 (CM's m >= 0)
// PRIMARY (no-worse; all END frames, finger state ignored):
//   D1  per run END frames dt > 50; d = median V - median C; PASS at d <= +2; twins > 46 / > 54 computed the same way
//   D2  per run END frames dt > 34; PASS at d <= +4; twins > 30 / > 38
//   each D: all three thresholds PASS -> PASS, all FAIL -> FAIL, mixed -> OPEN (threshold-sensitive)
// SECONDARY: X = the longest APPROACH frame with scrollY in [1650, 1850] (p171-read's window): per arm median X.dt and
//   median X's Layout + RecalculateStyles (Timeline union), runs with X.dt > 46 / 50 / 54 and > 30 / 34 / 38.
// DESCRIPTIVE: APPROACH finger-down > 50 / > 34 (twins); whole run > 50 / > 34; END frames delivered; END near-band
//   frames (30, 38] and (46, 54]; Timeline Layout and RecalculateStyles records >= 5 ms ending in END (count, ms);
//   END frames > 34 by the E-mark that precedes them. FLAG: a run without an END start (V: the approach never reached
//   the end) is listed and kept out of D1 / D2 / X.
//   node fixes/g0-0k/phone/g0k-read.mjs [runs dir=out/g0kp/runs] [--json out.json] | --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { triggers, contacts, tlSpans, inSpan } = await import(pathToFileURL(join(here, '../../g0-box/phone/eop-read.mjs')).href);
export const W = [1650, 1850];
export const LVH = 815;
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const TH = [30, 34, 38, 46, 50, 54];
const cnt = (dts) => { const o = { n: dts.length }; for (const t of TH) o['gt' + t] = dts.filter((d) => d > t).length;
  o.near34 = dts.filter((d) => d > 30 && d <= 38).length; o.near50 = dts.filter((d) => d > 46 && d <= 54).length; return o; };

export function endStart(seg, arm) {
  const ap = (seg.marks || []).find((m) => m[1] === 'approach'); const t0 = ap ? ap[0] : -Infinity;
  if (arm === 'C') { const o1 = triggers(seg).find((x) => x.kind === 'open'); return o1 ? { t: o1.t, how: 'O1' } : null; }
  const docH = seg.docH1 ?? seg.docH ?? 0;
  const f = seg.frames.find((r) => r[0] > t0 && r[2] >= docH - r[3] - LVH);
  return f ? { t: f[0] - f[1], y: f[2], how: `y >= docH ${docH} - ih - ${LVH}` } : null; // the END part starts with this frame
}

export function readRun(g, tl, arm) {
  const seg = g.run.segments[0];
  const ap = (seg.marks || []).find((m) => m[1] === 'approach'); const t0 = ap ? ap[0] : seg.frames[0]?.[0] ?? 0;
  const es = endStart(seg, arm); const t1 = es ? es.t : Infinity;
  const C = contacts(seg.touches); const down = (f) => C.some((c) => c.a < f[0] && c.b > f[0] - f[1]);
  const spans = tlSpans(tl);
  const appr = seg.frames.filter((f) => f[0] > t0 && f[0] <= t1);
  const end = es ? seg.frames.filter((f) => f[0] > t1) : [];
  const inW = appr.filter((f) => f[2] >= W[0] && f[2] <= W[1]);
  const X = inW.reduce((p, f) => (!p || f[1] > p[1] ? f : p), null);
  const tx = X && spans.length ? inSpan(spans, X[0] - X[1], X[0]) : null;
  // Timeline Layout / RecalculateStyles records >= 5 ms ending in END
  const big = { Layout: { n: 0, ms: 0 }, RecalculateStyles: { n: 0, ms: 0 } };
  if (es) for (const [a, b, k] of spans) if ((k === 'Layout' || k === 'RecalculateStyles') && b > t1 && b - a >= 5) { big[k].n++; big[k].ms = r1(big[k].ms + b - a); }
  const marks = (seg.marks || []).filter((m) => m[1] !== 'approach');
  const markOf = (t) => { let n = 'approach'; for (const m of marks) if (m[0] <= t) n = m[1]; return n; };
  const byMark = {}; for (const f of end) if (f[1] > 34) { const k = markOf(f[0]); (byMark[k] ||= []).push(f[1]); }
  return { arm, endStart: es ? { t: r1(es.t), y: es.y ?? null, how: es.how } : null,
    end: cnt(end.map((f) => f[1])), approach: { frames: appr.length, fingerDown: cnt(appr.filter(down).map((f) => f[1])) },
    whole: cnt(seg.frames.map((f) => f[1])),
    X: X ? { t: X[0], dt: X[1], y: X[2], ls: tx ? r1((tx.Layout || 0) + (tx.RecalculateStyles || 0)) : null } : null,
    tlBigEnd: spans.length ? big : null, slowByMark: byMark };
}

function noWorse(Cr, Vr, ths, lim) {
  const per = ths.map((t) => { const d = r1(med(Vr.map((r) => r.end['gt' + t])) - med(Cr.map((r) => r.end['gt' + t])));
    return { t, C: Cr.map((r) => r.end['gt' + t]), V: Vr.map((r) => r.end['gt' + t]), d, pass: d <= lim }; });
  const np = per.filter((x) => x.pass).length;
  return { per, verdict: np === per.length ? 'PASS' : np === 0 ? 'FAIL' : 'OPEN (threshold-sensitive)' };
}
export function verdict(Cr, Vr) {
  const okC = Cr.filter((r) => r.endStart), okV = Vr.filter((r) => r.endStart);
  const xs = (A, k) => r1(med(A.map((r) => r.X?.[k] ?? null)));
  const xr = (A) => Object.fromEntries(TH.map((t) => ['gt' + t, A.filter((r) => r.X && r.X.dt > t).length]));
  return { n: { C: okC.length, V: okV.length }, flagged: [...Cr, ...Vr].filter((r) => !r.endStart).length,
    D1: noWorse(okC, okV, [46, 50, 54], 2), D2: noWorse(okC, okV, [30, 34, 38], 4),
    X: { C: { medDt: xs(okC, 'dt'), medLS: xs(okC, 'ls'), runs: xr(okC) }, V: { medDt: xs(okV, 'dt'), medLS: xs(okV, 'ls'), runs: xr(okV) } } };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const fr = (t, dt, y, ih = 815) => [t, dt, y, ih];
  // C: jack at the pin (prevented upward move at t 1050), END after it
  const segC = { docH: 6000, vh0: 775, marks: [[100, 'approach'], [1500, 'E20-close-fast-60px-50ms']],
    frames: [fr(200, 16, 1000), fr(300, 60, 1700), fr(400, 20, 1800), fr(1000, 16, 5180), fr(1100, 55, 5185), fr(1200, 36, 5185), fr(1600, 40, 5185)],
    touches: [[150, 's', 1, 1, 0, 0, 700], [900, 'e', 1, 1, 0, 5100, 300], [1000, 's', 1, 1, 0, 5180, 700], [1050, 'm', 1, 1, 1, 5185, 650], [1150, 'e', 1, 1, 0, 5185, 600]] };
  const tlC = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: 0.24, endTime: 0.3, children: [{ type: 'RecalculateStyles', startTime: 0.25, endTime: 0.29 }] },
    { type: 'RenderingFrame', startTime: 1.045, endTime: 1.1, children: [{ type: 'Layout', startTime: 1.06, endTime: 1.07 }] }] };
  const c = readRun({ run: { segments: [segC] } }, tlC, 'C');
  ok(c.endStart?.t === 1050 && c.end.n === 3 && c.end.gt50 === 1 && c.end.gt34 === 3 && c.end.near50 === 0, `C end ${JSON.stringify(c.endStart)} ${JSON.stringify(c.end)}`);
  ok(c.X?.dt === 60 && c.X.y === 1700 && c.X.ls === 40, `C X ${JSON.stringify(c.X)}`);
  ok(c.tlBigEnd.Layout.n === 1 && c.tlBigEnd.RecalculateStyles.n === 0, `C tl ${JSON.stringify(c.tlBigEnd)}`);
  ok(c.slowByMark.approach?.length === 2 && c.slowByMark['E20-close-fast-60px-50ms']?.length === 1, `C marks ${JSON.stringify(c.slowByMark)}`);
  // V: no prevented move; END from the first frame with y >= 6000 - 815 - 815 = 4370
  const segV = { docH: 6000, vh0: 775, marks: [[100, 'approach']],
    frames: [fr(200, 16, 1000), fr(300, 30, 1700), fr(1000, 16, 4300), fr(1100, 48, 4370), fr(1200, 16, 5000), fr(1300, 52, 5185)],
    touches: [[150, 's', 1, 1, 0, 0, 700], [1250, 'e', 1, 1, 0, 5100, 300]] };
  const v = readRun({ run: { segments: [segV] } }, null, 'V');
  ok(v.endStart?.y === 4370 && v.end.n === 3 && v.end.gt50 === 1 && v.end.gt46 === 2 && v.end.near50 === 2, `V end ${JSON.stringify(v.endStart)} ${JSON.stringify(v.end)}`);
  ok(v.approach.frames === 3 && v.X?.dt === 30 && v.X.ls === null && v.tlBigEnd === null, `V approach ${JSON.stringify(v.approach)} X ${JSON.stringify(v.X)}`);
  // V whose approach never reaches the end: flagged, out of the verdict
  const vn = readRun({ run: { segments: [{ ...segV, frames: segV.frames.slice(0, 3) }] } }, null, 'V');
  ok(vn.endStart === null && vn.end.n === 0, 'V no end');
  // verdicts
  const mk = (arm, gt) => ({ arm, endStart: { t: 1 }, end: Object.fromEntries(TH.map((t, i) => ['gt' + t, gt[i]])), X: { dt: arm === 'C' ? 52 : 25, ls: arm === 'C' ? 40 : 6 } });
  const C4 = [0, 1, 2, 3].map(() => mk('C', [20, 12, 8, 3, 2, 1]));
  ok(verdict(C4, C4).D1.verdict === 'PASS' && verdict(C4, C4).D2.verdict === 'PASS', 'aa pass');
  const V4 = [0, 1, 2, 3].map(() => mk('V', [30, 20, 15, 6, 5, 4]));
  const w = verdict(C4, V4); ok(w.D1.verdict === 'FAIL' && w.D2.verdict === 'FAIL', `worse ${JSON.stringify(w.D1)} ${JSON.stringify(w.D2)}`);
  const s = verdict(C4, [0, 1, 2, 3].map(() => mk('V', [24, 16, 13, 6, 4, 2]))); // d: 30 +4 34 +4 38 +5 | 46 +3 50 +2 54 +1
  ok(s.D1.verdict.startsWith('OPEN') && s.D2.verdict.startsWith('OPEN'), `sensitive ${s.D1.verdict} ${s.D2.verdict}`);
  ok(w.X.C.medDt === 52 && w.X.V.medLS === 6 && w.X.C.runs.gt50 === 4 && w.X.V.runs.gt34 === 0, `X ${JSON.stringify(w.X)}`);
  ok(verdict([...C4, { ...mk('C', TH.map(() => 0)), endStart: null }], C4).flagged === 1, 'flag');
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (END split C O1 / V docH - ih - 815, D1 / D2 no-worse with twins, X, Timeline >= 5 ms, E-marks, flag)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const ji = args.indexOf('--json');
  const dir = args.find((x, i) => !x.startsWith('--') && (ji < 0 || i !== ji + 1)) || 'out/g0kp/runs';
  const res = { runs: {}, C: [], V: [] };
  for (const base of ['EC1', 'EV1', 'EV2', 'EC2', 'EC3', 'EV3', 'EV4', 'EC4']) {
    const run = existsSync(join(dir, `g-${base}r.json`)) ? `${base}r` : base;
    const f = join(dir, `g-${run}.json`); if (!existsSync(f)) { console.log(`${base}: no record`); continue; }
    const tf = join(dir, `tl-${run}.json`);
    const r = readRun(JSON.parse(readFileSync(f, 'utf8')), existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null, base[1]);
    res.runs[run] = r; res[base[1]].push(r);
    const e = r.end, a = r.approach.fingerDown;
    console.log(`${run}: END ${r.endStart ? `from ${r.endStart.how}${r.endStart.y != null ? ` (y ${r.endStart.y})` : ''}` : 'NOT REACHED (flagged)'} frames ${e.n} >50 ${e.gt50} (${e.gt46}/${e.gt54}) >34 ${e.gt34} (${e.gt30}/${e.gt38}) near ${e.near34}/${e.near50}` +
      ` | X ${r.X ? `y ${r.X.y} dt ${r.X.dt} L+S ${r.X.ls}` : 'none'} | approach finger-down >50 ${a.gt50} (${a.gt46}/${a.gt54}) >34 ${a.gt34} (${a.gt30}/${a.gt38}) | whole >50 ${r.whole.gt50} >34 ${r.whole.gt34}` +
      ` | END Timeline >= 5 ms: Layout ${r.tlBigEnd?.Layout.n ?? '-'} (${r.tlBigEnd?.Layout.ms ?? '-'} ms) Style ${r.tlBigEnd?.RecalculateStyles.n ?? '-'} (${r.tlBigEnd?.RecalculateStyles.ms ?? '-'} ms)` +
      ` | END >34 by mark ${Object.entries(r.slowByMark).map(([k, v]) => `${k.split('-')[0]}:${v.length}`).join(' ')}`);
  }
  const v = verdict(res.C, res.V); res.verdict = v;
  for (const k of ['D1', 'D2']) console.log(`${k} ${v[k].verdict}: ${v[k].per.map((x) => `>${x.t} C [${x.C}] V [${x.V}] d ${x.d} ${x.pass ? 'pass' : 'FAIL'}`).join(' | ')}`);
  console.log(`X C med dt ${v.X.C.medDt} L+S ${v.X.C.medLS} runs ${JSON.stringify(v.X.C.runs)} | V med dt ${v.X.V.medDt} L+S ${v.X.V.medLS} runs ${JSON.stringify(v.X.V.runs)}`);
  console.log(`n C ${v.n.C} V ${v.n.V}, flagged ${v.flagged}`);
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}

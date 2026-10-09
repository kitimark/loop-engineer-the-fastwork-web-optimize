#!/usr/bin/env node
// P-172 reader (fix-scrollcb-g0, sticky-walk; card signed by the lead 2026-10-09; written before any P-172 data is read).
// Pure reader: no device. G runs of the g0 program (g-fastshort-g0.json, 38d7fe5d7fa8) in out/swp/runs (g-<run>.json +
// tl-<run>.json), C = g0.0i (CSS adb875d94c1f), V = g0.0i + fixcq (CSS bee7fce9ad56), counted runs EC1-4 / EV1-4.
// Window: the APPROACH (the program's "approach" mark to the first open trigger O1; eop-read's readRun / triggers), frames
// [t, dt, scrollY, innerHeight] covering (t - dt, t] whose scrollY lies in Y = [1000, 3400]; finger-down = the frame overlaps
// a contact (eop-read's rule).
// PRIMARY: per run, finger-down frames in Y with dt > 50 and > 34; twins > 46 / > 54 and > 30 / > 38; near bands
//   (30, 38] and (46, 54] counted and flagged.
// SECONDARY: whole-run (segment 0, all frames) > 50 / > 34; Timeline Layout records >= 5 ms whose end falls in a
//   finger-down frame in Y (count and total ms).
// DECISION (the card): per threshold, "lower" = V's max < C's min (ranges separated), "higher" = V's min > C's max,
//   else "overlap". Primary > 50:
//   - lower, and both twins (46, 54) lower -> GAIN (F done, V review, land on the less-work rule); a twin not lower ->
//     GAIN (threshold-sensitive).
//   - higher -> WORSE (stop, back to D).
//   - overlap -> NO SEPARATION: the Simulator counts stay the cost card; NO-WORSE holds when whole-run > 50 is not
//     "higher" (and its twins not higher), else NO-WORSE FAILS.
//   The > 34 family is reported with the same rule (descriptive next to > 50).
// PREDICTION (P-172 item 5): Layout >= 5 ms records in the window drop by >= 80 % (median V <= 0.2 x median C) -> HIT;
//   FALSIFIED if Layout does not drop (median V >= median C) or the > 50 counts are not lower (V median >= C median).
// PARITY (descriptive): open / close trigger counts per run.
//   node fixes/sticky-walk/phone/p172-read.mjs [runs dir=out/swp/runs] [--json out.json] | --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { triggers, contacts, tlSpans } = await import(join(HERE, '../../g0-box/phone/eop-read.mjs'));

export const Y = [1000, 3400];
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const TH = [30, 34, 38, 46, 50, 54];
const counts = (dts) => Object.fromEntries([...TH.map((t) => ['gt' + t, dts.filter((d) => d > t).length]), ['near34', dts.filter((d) => d > 30 && d <= 38).length], ['near50', dts.filter((d) => d > 46 && d <= 54).length], ['n', dts.length]]);

export function readRun(g, tl) {
  const seg = g.run.segments[0];
  const ap = (seg.marks || []).find((m) => m[1] === 'approach');
  const tr = triggers(seg); const o1 = tr.find((x) => x.kind === 'open');
  const t0 = ap ? ap[0] : -Infinity, t1 = o1 ? o1.t : Infinity;
  const C = contacts(seg.touches);
  const down = (f) => C.some((c) => c.a < f[0] && c.b > f[0] - f[1]);
  const win = seg.frames.filter((f) => f[0] > t0 && f[0] <= t1 && f[2] >= Y[0] && f[2] <= Y[1] && down(f));
  const lay = tlSpans(tl).filter(([a, b, k]) => k === 'Layout' && b - a >= 5 && win.some((f) => b > f[0] - f[1] && b <= f[0]));
  return {
    approach: !!ap, o1: o1 ? r1(o1.t) : null, yMax: Math.max(...seg.frames.filter((f) => f[0] <= t1).map((f) => f[2])),
    win: counts(win.map((f) => f[1])), slow50: win.filter((f) => f[1] > 50).map((f) => ({ t: r1(f[0]), dt: f[1], y: f[2] })),
    whole: counts(seg.frames.map((f) => f[1])),
    layout5: { n: lay.length, ms: r1(lay.reduce((s, [a, b]) => s + b - a, 0)) }, tl: !!tl,
    opens: tr.filter((x) => x.kind === 'open').length, closes: tr.filter((x) => x.kind === 'close').length,
  };
}

const sep = (c, v) => (Math.max(...v) < Math.min(...c) ? 'lower' : Math.min(...v) > Math.max(...c) ? 'higher' : 'overlap');
export function verdict(C, V) {
  const g = (A, part, k) => A.map((r) => r[part][k]);
  const s = (part, k) => sep(g(C, part, k), g(V, part, k));
  const p50 = s('win', 'gt50'), t46 = s('win', 'gt46'), t54 = s('win', 'gt54');
  const p34 = s('win', 'gt34'), t30 = s('win', 'gt30'), t38 = s('win', 'gt38');
  const w50 = s('whole', 'gt50'), w46 = s('whole', 'gt46'), w54 = s('whole', 'gt54');
  let v;
  if (p50 === 'lower') v = t46 === 'lower' && t54 === 'lower' ? 'GAIN' : 'GAIN (threshold-sensitive)';
  else if (p50 === 'higher') v = 'WORSE';
  else v = [w50, w46, w54].includes('higher') ? 'NO SEPARATION, NO-WORSE FAILS' : 'NO SEPARATION, NO-WORSE holds';
  const lc = med(g(C, 'layout5', 'n')), lv = med(g(V, 'layout5', 'n'));
  const mc = med(g(C, 'win', 'gt50')), mv = med(g(V, 'win', 'gt50'));
  const pred = lc == null || lv == null ? 'OPEN' : (lv >= lc || mv >= mc) ? 'FALSIFIED' : lv <= 0.2 * lc ? 'HIT' : 'PARTIAL (Layout drop < 80 %)';
  const parity = [...C, ...V].every((r) => r.opens === C[0]?.opens && r.closes === C[0]?.closes);
  return { gt50: { C: g(C, 'win', 'gt50'), V: g(V, 'win', 'gt50'), sep: p50, twins: [t46, t54] },
    gt34: { C: g(C, 'win', 'gt34'), V: g(V, 'win', 'gt34'), sep: p34, twins: [t30, t38] },
    whole50: { C: g(C, 'whole', 'gt50'), V: g(V, 'whole', 'gt50'), sep: w50, twins: [w46, w54] },
    layout5: { C: g(C, 'layout5', 'n'), V: g(V, 'layout5', 'n'), medC: lc, medV: lv }, parity, verdict: v, prediction: pred };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const mk = (slow, lay) => {
    const frames = [[100, 16, 500, 775]]; let t = 100;
    for (let i = 0; i < 20; i++) { t += 20; frames.push([t, i < slow ? 60 : 16, 1000 + i * 100, 775]); }
    frames.push([t + 400, 70, 3600, 775]);
    const touches = [[90, 's', 1, 1, 0, 0, 700], [t + 10, 'e', 1, 1, 0, 3000, 200]];
    const recs = []; for (let i = 0; i < lay; i++) { const e = (120 + i * 20) / 1000; recs.push({ type: 'Layout', startTime: e - 0.008, endTime: e }); }
    return readRun({ run: { segments: [{ docH: 6000, vh0: 775, marks: [[95, 'approach']], frames, touches }] } }, { offsetMs: 0, recs });
  };
  const a = mk(3, 5); ok(a.win.gt50 === 3 && a.win.n === 20 && a.whole.gt50 === 4 && a.layout5.n === 5 && a.layout5.ms === 40, 'readRun ' + JSON.stringify(a));
  const C = [mk(6, 10), mk(5, 9), mk(7, 12), mk(6, 11)], V = [mk(1, 1), mk(0, 0), mk(1, 2), mk(0, 1)];
  const v = verdict(C, V); ok(v.verdict === 'GAIN' && v.prediction === 'HIT', 'gain ' + JSON.stringify(v));
  ok(verdict(C, C).verdict.startsWith('NO SEPARATION, NO-WORSE holds') && verdict(C, C).prediction === 'FALSIFIED', 'aa');
  ok(verdict(V, C).verdict === 'WORSE', 'worse');
  console.log(bad.length ? 'SELFTEST FAIL\n- ' + bad.join('\n- ') : 'SELFTEST ok (window y 1000-3400 finger-down, twins, Layout >= 5 ms, GAIN / WORSE / NO SEPARATION, prediction)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const ji = args.indexOf('--json');
  const dir = args.find((x, i) => !x.startsWith('--') && (ji < 0 || i !== ji + 1)) || 'out/swp/runs';
  const res = { runs: {}, C: [], V: [] };
  for (const run of ['EC1', 'EC2', 'EC3', 'EC4', 'EV1', 'EV2', 'EV3', 'EV4']) {
    const f = join(dir, `g-${run}.json`); if (!existsSync(f)) { console.log(`${run}: missing`); continue; }
    const tf = join(dir, `tl-${run}.json`);
    const r = readRun(JSON.parse(readFileSync(f, 'utf8')), existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null);
    res.runs[run] = r; res[run[1]].push(r); const w = r.win;
    console.log(`${run}: window frames ${w.n} | >50 ${w.gt50} (${w.gt46}/${w.gt54}) near ${w.near50} | >34 ${w.gt34} (${w.gt30}/${w.gt38}) near ${w.near34} | Layout>=5 ${r.layout5.n} (${r.layout5.ms} ms) | whole >50 ${r.whole.gt50} (${r.whole.gt46}/${r.whole.gt54}) >34 ${r.whole.gt34} | approach to y ${r.yMax}, opens ${r.opens} closes ${r.closes}${r.approach ? '' : ' NO-APPROACH-MARK'}${r.tl ? '' : ' NO-TIMELINE'}`);
  }
  if (res.C.length && res.V.length) {
    const v = res.verdict = verdict(res.C, res.V);
    console.log(`P-172 >50 C ${v.gt50.C} V ${v.gt50.V} ${v.gt50.sep} (twins ${v.gt50.twins}) | >34 C ${v.gt34.C} V ${v.gt34.V} ${v.gt34.sep} (twins ${v.gt34.twins}) | whole >50 C ${v.whole50.C} V ${v.whole50.V} ${v.whole50.sep} | Layout>=5 C ${v.layout5.C} V ${v.layout5.V} | parity ${v.parity}`);
    console.log(`P-172 VERDICT ${v.verdict} | PREDICTION ${v.prediction}`);
  }
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}

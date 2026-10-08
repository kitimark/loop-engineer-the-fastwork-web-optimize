#!/usr/bin/env node
// P-169 reader (window B only; arms 0 = v0, e = g0.0f, k = f-B2). Written and committed before any P-169 run exists.
// Per counted W run (Timeline on): P-168's reader (p168-wread.mjs: scroll / move phases, Layout, the +is-play frame)
// plus the PRIMARY metric of P-169: the Composite time inside the `+is-play` frame (the overlap of every Composite
// record with [frame start, frame end) = [t - dt, t), p167-wread's per-frame overlap) and the frame's dt.
// Rules (card "P-169", written before data):
//   reproduce first: g0.0f's median +is-play Composite >= v0's + 10 ms, else "not reproduced" (no f-B2 verdict).
//   tree size: d = median(f-B2) - median(g0.0f) of the +is-play Composite:
//     d <= -10 "tree size is the cost"; -10 < d < -6 "partly tree size"; |d| <= 6 "not tree size"; d >= 6 "worse".
//     Twins (+-4 ms on the 10 / 6 bounds: 6 / 2 and 14 / 10): "threshold-sensitive" when either gives another verdict.
//   PR-039 line: the +is-play frame dt, f-B2 vs g0.0f median: <= -6 ms "shorter frame", within 6 "same frame", >= +6 "longer frame".
//   Counts line (as P-168 B): f-B2's scroll-phase > 34 (30/38) and > 50 (46/54) medians <= g0.0f's, per threshold.
//   node fixes/g0-box/phone/p169-wread.mjs [dir=out/p169ph] [--json out.json] | --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRun as readRun168, summarize as summarize168 } from './p168-wread.mjs';
import { composites } from './p167-wread.mjs';
import { spotFrame } from './p166-wread.mjs';

const medOf = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

export function readRun(j, tl) {
  const base = readRun168(j, tl, 'B');
  const sf = spotFrame(j, 'B'); let flip = null;
  if (sf) { const lo = sf.t - sf.dt, hi = sf.t; const comp = composites(tl).reduce((s, [a, b]) => s + Math.max(0, Math.min(b, hi) - Math.max(a, lo)), 0); flip = { dt: sf.dt, y: Math.round(sf.y), comp: r1(comp) }; }
  return { ...base, flip };
}

export function summarize(rows) {
  const s = summarize168(rows); const fl = rows.filter((r) => r.flip);
  return { ...s, flip: fl.length ? { n: fl.length, comp: r1(medOf(fl.map((r) => r.flip.comp))), dt: r1(medOf(fl.map((r) => r.flip.dt))) } : null };
}

export function verdicts(A) {
  if (!A['0']?.flip || !A.e?.flip || !A.k?.flip) return { verdict: 'missing arm' };
  const rep = A.e.flip.comp >= A['0'].flip.comp + 10;
  const d = A.k.flip.comp - A.e.flip.comp;
  const tree = (hi, lo) => (d <= -hi ? 'tree size is the cost' : d < -lo ? 'partly tree size' : d < lo ? 'not tree size' : 'worse');
  const main = tree(10, 6), t1 = tree(6, 2), t2 = tree(14, 10);
  const dd = A.k.flip.dt - A.e.flip.dt;
  const sc = A.k.scroll, se = A.e.scroll;
  return {
    reproduced: rep, verdict: rep ? main : 'not reproduced', delta: r1(d), twins: { low: t1, high: t2 }, thresholdSensitive: rep && (t1 !== main || t2 !== main),
    pr039: { dtDelta: r1(dd), line: dd <= -6 ? 'shorter frame' : dd >= 6 ? 'longer frame' : 'same frame' },
    counts: Object.fromEntries(['gt30', 'gt34', 'gt38', 'gt46', 'gt50', 'gt54'].map((g) => [g, sc[g] <= se[g]])),
  };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const F = ['t', 'dt', 'yStart', 'yEnd'];
  const j = { fields: F, marks: { idle: [0, 100], scroll: [100, 300], hold: [300, 400] }, crossings: [{ kind: 'class', value: '+is-play', frame: 2, id: 'x' }],
    frames: [[50, 16, 4000, 4000], [116, 16, 4000, 4100], [200, 60, 4100, 4500], [216, 16, 4500, 4520], [316, 16, 4600, 4600]] };
  const tl = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: 0.14, endTime: 0.2, children: [{ type: 'Composite', startTime: 0.15, endTime: 0.195 }] }, { type: 'Composite', startTime: 0.3, endTime: 0.31 }] };
  const r = readRun(j, tl);
  ok(r.flip && r.flip.dt === 60 && r.flip.comp === 45, `1 flip ${JSON.stringify(r.flip)}`);
  const S = (comp, dt, g = 1) => ({ flip: { comp, dt }, scroll: { gt30: g, gt34: g, gt38: g, gt46: g, gt50: g, gt54: g } });
  let v = verdicts({ 0: S(40, 45), e: S(60, 73), k: S(45, 66) });
  ok(v.verdict === 'tree size is the cost' && v.delta === -15 && !v.thresholdSensitive && v.pr039.line === 'shorter frame', `2 tree ${JSON.stringify(v)}`);
  v = verdicts({ 0: S(40, 45), e: S(60, 73), k: S(52, 70) });
  ok(v.verdict === 'partly tree size' && v.thresholdSensitive, `3 partly ${JSON.stringify(v)}`);
  v = verdicts({ 0: S(40, 45), e: S(60, 73), k: S(59, 72) });
  ok(v.verdict === 'not tree size' && v.pr039.line === 'same frame', `4 not ${JSON.stringify(v)}`);
  v = verdicts({ 0: S(55, 45), e: S(60, 73), k: S(40, 60) });
  ok(v.verdict === 'not reproduced', `5 reproduce ${JSON.stringify(v)}`);
  v = verdicts({ 0: S(40, 45), e: S(60, 73), k: S(68, 80) });
  ok(v.verdict === 'worse' && v.pr039.line === 'longer frame', `6 worse ${JSON.stringify(v)}`);
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (6 cases: flip-frame Composite, tree / partly / not / not reproduced / worse, twins, PR-039 line)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const dir = args.find((a) => !a.startsWith('--')) || 'out/p169ph'; const ji = args.indexOf('--json');
  const res = { runs: {}, arms: {} }; const by = {};
  for (const arm of ['0', 'e', 'k']) for (const n of [1, 2, 3]) {
    let it = `B${arm}${n}`; if (existsSync(join(dir, 'runs', `w-${it}x.json`))) it += 'x';
    const rf = join(dir, 'runs', `w-${it}.json`), tf = join(dir, 'runs', `tl-${it}.json`);
    if (!existsSync(rf) || !existsSync(tf)) continue;
    const r = readRun(JSON.parse(readFileSync(rf, 'utf8')), JSON.parse(readFileSync(tf, 'utf8')));
    res.runs[it] = r; (by[arm] ||= []).push(r);
    console.log(`${it} +is-play y ${r.flip?.y} dt ${r.flip?.dt} Composite ${r.flip?.comp} | scroll >34 ${r.scroll.gt34} (${r.scroll.gt30}/${r.scroll.gt38}) >50 ${r.scroll.gt50} (${r.scroll.gt46}/${r.scroll.gt54}) max ${r.scroll.maxDt} | layouts in flip ${r.play?.layouts}`);
  }
  for (const [k, rows] of Object.entries(by)) { const s = summarize(rows); res.arms[k] = s; console.log(`ARM B${k} (n ${s.n}) +is-play dt ${s.flip?.dt} Composite ${s.flip?.comp} | scroll >34 ${s.scroll.gt34} >50 ${s.scroll.gt50} max ${s.scroll.maxDt}`); }
  res.verdicts = verdicts(res.arms); console.log('VERDICTS', JSON.stringify(res.verdicts));
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}

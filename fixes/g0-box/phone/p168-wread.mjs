#!/usr/bin/env node
// P-168 reader: applies the card's rules as written (fixes/g0-box/README.md "P-168", signed d7bee250). A pure reader, no
// device. Written after part A's runs existed but before any of them was read (15:5xZ); one interpretation fixed here
// before reading, since the card names it without defining it: "median Layout record" = per run, the median duration of
// the Layout records >= 5 ms whose top-level Timeline record starts in the scroll phase; per arm, the median over its runs.
// The median over ALL Layout records (any size) is printed as a sensitivity line, never used by a rule.
// Per counted W run (Timeline on), with iphone-run's marks:
//   scroll = [scroll start, scroll end)   PRIMARY: frames > 34 / > 50 (twins 30/38, 46/54), max dt
//   move   = [scroll start, hold end)     secondary (P-167's metric), same counts plus Composite sum / max
//   Layout records >= 5 ms in the scroll phase: count, sum, median, frames (top-level records) with 2+
//   window B: the +is-play frame (p166-wread spotFrame) and the Layout records that overlap it
//   node fixes/g0-box/phone/p168-wread.mjs [dir=out/p168ph] [--json out.json]
//   node fixes/g0-box/phone/p168-wread.mjs --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { phase, composites } from './p167-wread.mjs';
import { spotFrame } from './p166-wread.mjs';

const medOf = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** Layout records: [{ a, b, ms, top }] in page ms; top = index of the top-level record they sit in */
export function layouts(tl) {
  const out = [];
  (tl.recs || []).forEach((top, ti) => {
    const walk = (r) => { if (r.type === 'Layout') { const a = r.startTime * 1000 - tl.offsetMs, b = (r.endTime ?? r.startTime) * 1000 - tl.offsetMs; out.push({ a, b, ms: b - a, top: ti, topStart: top.startTime * 1000 - tl.offsetMs }); } for (const c of r.children || []) walk(c); };
    walk(top);
  });
  return out;
}

export function readRun(j, tl, spot) {
  const m = j.marks || {}; const comps = composites(tl); const L = layouts(tl);
  const scroll = phase(j, comps, m.scroll[0], m.scroll[1]);
  const move = phase(j, comps, m.scroll[0], m.hold[1]);
  const inScroll = L.filter((x) => x.topStart >= m.scroll[0] && x.topStart < m.scroll[1]);
  const big = inScroll.filter((x) => x.ms >= 5);
  const perTop = {}; for (const x of big) perTop[x.top] = (perTop[x.top] || 0) + 1;
  const lay = { n: big.length, sum: r1(big.reduce((s, x) => s + x.ms, 0)), med: r1(medOf(big.map((x) => x.ms))), max: r1(big.length ? Math.max(...big.map((x) => x.ms)) : 0),
    pairs: Object.values(perTop).filter((c) => c >= 2).length, medAll: r1(medOf(inScroll.map((x) => x.ms))), nAll: inScroll.length };
  let play = null;
  if (spot === 'B') {
    const sf = spotFrame(j, 'B');
    if (sf) { const lo = sf.t - sf.dt, hi = sf.t; const ov = L.filter((x) => x.b > lo && x.a < hi);
      play = { dt: sf.dt, y: Math.round(sf.y), layouts: ov.length, layoutMs: r1(ov.reduce((s, x) => s + x.ms, 0)), layoutMax: r1(ov.length ? Math.max(...ov.map((x) => x.ms)) : 0) }; }
  }
  return { scroll, move, lay, play };
}

const KEYS = ['gt30', 'gt34', 'gt38', 'gt46', 'gt50', 'gt54', 'maxDt', 'compSum', 'compMax'];
export function summarize(rows) {
  const s = (p) => Object.fromEntries(KEYS.map((x) => [x, r1(medOf(rows.map((r) => r[p][x])))]));
  const lay = Object.fromEntries(['n', 'sum', 'med', 'max', 'pairs', 'medAll'].map((x) => [x, r1(medOf(rows.map((r) => r.lay[x])))]));
  const pl = rows.filter((r) => r.play);
  const play = pl.length ? { dt: r1(medOf(pl.map((r) => r.play.dt))), layouts: r1(medOf(pl.map((r) => r.play.layouts))), layoutMs: r1(medOf(pl.map((r) => r.play.layoutMs))), n: pl.length } : null;
  return { n: rows.length, scroll: s('scroll'), move: s('move'), lay, play };
}

/** the card's rules; arms 0 (v0), e (g0.0f), k (the part's test arm) */
export function verdicts(A, B) {
  const out = {};
  if (A && A['0'] && A.e && A.k) {
    const one = (g) => {
      const v = A['0'].scroll[g], e = A.e.scroll[g], k = A.k.scroll[g];
      if (!(e >= v + 1)) return 'not reproduced';
      if (k <= v && A.k.lay.med <= A['0'].lay.med + 2) return 'removes';
      if (k <= e - 1) return 'partial';
      return 'no effect';
    };
    const main = one('gt50'), t46 = one('gt46'), t54 = one('gt54');
    const de = Math.abs(A.e.lay.med - A['0'].lay.med), dk = Math.abs(A.k.lay.med - A['0'].lay.med);
    out.A = { verdict: main, twins: { gt46: t46, gt54: t54 }, thresholdSensitive: t46 !== main || t54 !== main,
      reproduced: main !== 'not reproduced', mechanism: `f-cv25 median Layout ${A.k.lay.med} ms vs g0.0f ${A.e.lay.med}, v0 ${A['0'].lay.med}: ${dk < de ? 'moves toward v0' : 'does not move toward v0'}` };
  }
  if (B && B.e && B.k) {
    const d = B.k.scroll.maxDt - B.e.scroll.maxDt;
    out.B = { verdict: d <= -6 ? 'shorter' : d >= 6 ? 'worse' : 'no effect', maxDtDelta: r1(d),
      gt34le: B.k.scroll.gt34 <= B.e.scroll.gt34, gt50le: B.k.scroll.gt50 <= B.e.scroll.gt50,
      mechanism: B.k.play && B.e.play ? `+is-play frame Layout: g0.0g ${B.k.play.layouts} records / ${B.k.play.layoutMs} ms vs g0.0f ${B.e.play.layouts} / ${B.e.play.layoutMs} ms` : 'no +is-play frame' };
  }
  return out;
}

function selftest() {
  const bad = []; const ok = (c, msg) => { if (!c) bad.push(msg); };
  const F = ['t', 'dt', 'yStart', 'yEnd'];
  const j = { fields: F, marks: { idle: [0, 100], scroll: [100, 300], hold: [300, 400] },
    frames: [[50, 16, 0, 0], [116, 16, 0, 0], [176, 60, 0, 40], [216, 40, 40, 200], [316, 36, 700, 750], [416, 16, 750, 750]] };
  const tl = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: 0.12, endTime: 0.17, children: [{ type: 'Layout', startTime: 0.12, endTime: 0.13 }, { type: 'Layout', startTime: 0.14, endTime: 0.146 }, { type: 'Layout', startTime: 0.15, endTime: 0.152 }] },
    { type: 'RenderingFrame', startTime: 0.32, endTime: 0.33, children: [{ type: 'Layout', startTime: 0.32, endTime: 0.33 }] }] };
  const r = readRun(j, tl, 'A');
  ok(r.scroll.frames === 3 && r.scroll.gt34 === 2 && r.scroll.gt50 === 1 && r.scroll.maxDt === 60, `1 scroll ${JSON.stringify(r.scroll)}`);
  ok(r.move.frames === 4 && r.move.gt34 === 3, `2 move ${JSON.stringify(r.move)}`);
  ok(r.lay.n === 2 && r.lay.med === 8 && r.lay.pairs === 1 && r.lay.nAll === 3, `3 layout ${JSON.stringify(r.lay)}`);
  const S = (gt50, gt46, gt54, med) => ({ scroll: { gt50, gt46, gt54, gt34: 0, maxDt: 0 }, lay: { med } });
  const v = verdicts({ 0: S(1, 1, 1, 12), e: S(3, 3, 3, 16), k: S(1, 2, 1, 13) });
  ok(v.A.verdict === 'removes' && v.A.thresholdSensitive && v.A.twins.gt46 === 'partial', `4 rule A ${JSON.stringify(v.A)}`);
  ok(verdicts({ 0: S(2, 2, 2, 12), e: S(2, 2, 2, 16), k: S(1, 1, 1, 12) }).A.verdict === 'not reproduced', '5 reproduce first');
  ok(verdicts({ 0: S(1, 1, 1, 12), e: S(3, 3, 3, 16), k: S(1, 1, 1, 15) }).A.verdict === 'partial', '6 removes needs the Layout median');
  const B = (maxDt) => ({ scroll: { maxDt, gt34: 1, gt50: 1 }, play: null });
  ok(verdicts(null, { e: B(70), k: B(64) }).B.verdict === 'shorter' && verdicts(null, { e: B(70), k: B(65) }).B.verdict === 'no effect' && verdicts(null, { e: B(70), k: B(76) }).B.verdict === 'worse', '7 rule B');
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (7 cases: scroll/move counts, Layout stats, rule A + twins, reproduce first, Layout condition, rule B)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const dir = args.find((a) => !a.startsWith('--')) || 'out/p168ph'; const ji = args.indexOf('--json');
  const res = { runs: {}, arms: {} }; const by = {};
  for (const spot of ['A', 'B']) for (const arm of ['0', 'e', 'k']) for (const n of [1, 2, 3]) {
    let it = `${spot}${arm}${n}`;
    if (existsSync(join(dir, 'runs', `w-${it}x.json`))) it += 'x';   // a TAIL re-run replaces its item
    const rf = join(dir, 'runs', `w-${it}.json`), tf = join(dir, 'runs', `tl-${it}.json`);
    if (!existsSync(rf) || !existsSync(tf)) continue;
    const r = readRun(JSON.parse(readFileSync(rf, 'utf8')), JSON.parse(readFileSync(tf, 'utf8')), spot);
    res.runs[it] = r; (by[`${spot}${arm}`] ||= []).push(r);
    const sc = r.scroll;
    console.log(`${it} scroll >34 ${sc.gt34} (${sc.gt30}/${sc.gt38}) >50 ${sc.gt50} (${sc.gt46}/${sc.gt54}) max ${sc.maxDt} | move >34 ${r.move.gt34} >50 ${r.move.gt50} max ${r.move.maxDt} comp ${r.move.compSum}/${r.move.compMax} | layout>=5 n ${r.lay.n} sum ${r.lay.sum} med ${r.lay.med} max ${r.lay.max} pairs ${r.lay.pairs} (all: n ${r.lay.nAll} med ${r.lay.medAll})${r.play ? ` | +is-play dt ${r.play.dt} y ${r.play.y} layouts ${r.play.layouts} ${r.play.layoutMs} ms` : ''} | slow ${sc.slow.map((x) => `y${x.y}:${x.dt}`).join(' ')}`);
  }
  for (const [k, rows] of Object.entries(by)) { const s = summarize(rows); res.arms[k] = s;
    console.log(`ARM ${k} (n ${s.n}) scroll: >34 ${s.scroll.gt34} (30/38 ${s.scroll.gt30}/${s.scroll.gt38}) >50 ${s.scroll.gt50} (46/54 ${s.scroll.gt46}/${s.scroll.gt54}) max ${s.scroll.maxDt} | move >34 ${s.move.gt34} >50 ${s.move.gt50} max ${s.move.maxDt} comp ${s.move.compSum}/${s.move.compMax} | layout>=5 n ${s.lay.n} sum ${s.lay.sum} med ${s.lay.med} pairs ${s.lay.pairs} (all med ${s.lay.medAll})${s.play ? ` | +is-play dt ${s.play.dt} layouts ${s.play.layouts} ${s.play.layoutMs} ms` : ''}`); }
  const pick = (w) => (by[`${w}0`] || by[`${w}e`] ? { 0: res.arms[`${w}0`], e: res.arms[`${w}e`], k: res.arms[`${w}k`] } : null);
  res.verdicts = verdicts(pick('A'), pick('B'));
  console.log('VERDICTS', JSON.stringify(res.verdicts));
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}

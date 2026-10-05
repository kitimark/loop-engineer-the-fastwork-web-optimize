// PR-018 rev 7d, P-124 pre-data read (F-256, ops D1): does the V arm (rev 7d candidate) give the G driver the same start
// state and the same gesture path as the C arm (rev 7c)? Compares count-only gesture records of the same script
// (sim7d.sh or iphone.mjs gesture, both with --inject fixes/morph-scroll/msdbg-inject.mjs).
//   node fixes/morph-scroll/sim7d-compare.mjs <C record> <V record> --aa-c <C record 2> [--aa-c …] --aa-v <V record 2> [--aa-v …]
// The rule, FROZEN by mgmt-ops-10 before the s6/s7 data (2026-10-05). It changed twice after data was seen (strict
// per-stroke match -> in-order alignment -> shared-points fraction; disclosed in TICKET-7d.md "Simulator dry run"):
//   1. Exact match, C vs V (SAME / DIFF per line):
//      page      program hash; toolbar level (innerHeight at record start, vh0, and at read, ih); endH; maxY
//      first     first touch: scrollY, p (0 closed rest, 1 open), clientY
//      counted   program stroke ids in play order for every stroke outside an `until` loop (the scored strokes:
//                fling-out, near-250/280, the fast short flicks, E1-E4); per counted stroke: id, mark, start scrollY and
//                p, clientY at touchstart, clientY at lift, and prevented touchmoves = 0 on both arms
//   2. Touchmove stream, per group of identical counted strokes (dir, px, ms, profile): the C-V shared-points fraction
//      (touchmove clientYs in order, +-2 px, an LCS, min over both strokes; lowest over all C x V pairs of the group)
//      must be >= the lowest same-arm fraction from the A/A pairs of that group (C x C' over the --aa-c records and
//      V x V' over the --aa-v records, across records). Every counted stroke of C and V runs monotone in its planned
//      direction (no reversal over 2 px). Touchmove counts are reported, not judged.
//   3. A group with no C-C or no V-V A/A pair FAILS until it has one.
// INFO only: docH, played and approach strokes, passes per `until atEnd` loop (outcome-dependent by design: a released
// close leaves the page lower, so the next approach takes more drags), the earlier strict per-stroke rule (touchmove count
// <= 2 apart and in-order aligned path <= 6 px), within-record same-arm fractions, A/A records' own start lines.
// Tolerances: scrollY 8 px, p 0.02, clientY 4 px. No times are compared. Exit 0 SAME, 2 DIFF, 1 usage.
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2), pos = [], aaC = [], aaV = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--aa-c') aaC.push(args[++i]);
  else if (args[i] === '--aa-v') aaV.push(args[++i]);
  else pos.push(args[i]);
}
const [fc, fv] = pos;
if (!fc || !fv || pos.length !== 2 || aaC.includes(undefined) || aaV.includes(undefined)) {
  console.error('usage: sim7d-compare.mjs <C record> <V record> --aa-c <C record 2> [--aa-c …] --aa-v <V record 2> [--aa-v …]'); process.exit(1);
}
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const C = load(fc), V = load(fv);
// program stroke list with loop flags, in the compiler's order (fixed repeats unrolled, until-loops kept as one stroke)
function programStrokes(script) {
  const out = [];
  const walk = (steps, inLoop) => {
    for (const s of steps) {
      if (s.type === 'stroke') out.push({ id: `s${out.length + 1}`, inLoop });
      else if (s.type === 'repeat' && s.until) walk(s.steps, true);
      else if (s.type === 'repeat') for (let i = 0; i < (s.times || 1); i++) walk(s.steps, inLoop);
    }
  };
  walk(script.steps, false);
  return out;
}
function view(d, label) {
  const script = load(d.meta.script);
  const prog = programStrokes(script);
  if (prog.length !== d.program.strokes.length) throw new Error(`${label}: program walk gives ${prog.length} strokes, record has ${d.program.strokes.length}`);
  const loopIds = new Set(prog.filter((s) => s.inLoop).map((s) => s.id));
  const seg = d.run.segments[0];
  const inj = (d.run.inject || []).find((x) => x.seg === 0);
  const v = inj && (typeof inj.value === 'string' ? JSON.parse(inj.value) : inj.value);
  if (!v || !v.endH) throw new Error(`${label}: no inject read (endH)`);
  const closed = v.maxY - v.endH, P = (y) => (y - closed) / v.endH;
  const tch = seg.touches || [];
  const starts = tch.map((t, i) => [t, i]).filter(([t]) => t[1] === 's');
  const played = d.run.strokes.map((s) => s.id);
  const strokes = starts.map(([t0, i], k) => {
    const nextI = k + 1 < starts.length ? starts[k + 1][1] : tch.length;
    const mine = tch.slice(i, nextI);
    const end = mine.find((t) => t[1] === 'e' || t[1] === 'c');
    const moves = mine.filter((t) => t[1] === 'm' && t[6] !== null).map((t) => t[6]);
    const prevented = mine.filter((t) => t[1] === 'm' && t[4]).length;
    const t1 = k + 1 < starts.length ? starts[k + 1][0][0] : Infinity;
    const after = (v.scroll || []).filter((s) => end && s[0] >= end[0] && s[0] < t1);
    const rest = after.length ? P(after[after.length - 1][1]) : end ? P(end[5]) : null;
    const mark = [...(seg.marks || [])].reverse().find((m) => m[0] <= t0[0]);
    const kn = d.run.strokes[k].kin || {}; return { k, id: played[k], kin: `${kn.dir} ${kn.px}px/${kn.ms}ms ${kn.profile}`, loop: loopIds.has(played[k]), mark: mark ? mark[1] : null, y0: t0[5], p0: P(t0[5]), c0: t0[6], moves, prevented, cEnd: end ? end[6] : null, rest };
  });
  const allMoves = tch.filter((t) => t[1] === 'm');
  return { prevAll: allMoves.filter((t) => t[4]).length, cancelAll: allMoves.filter((t) => t[3]).length, nMoves: allMoves.length, hash: d.program.hash.slice(0, 12), vh0: seg.vh0, ih: v.ih, docH: seg.docH, endH: v.endH, maxY: v.maxY, played, strokes, loops: (d.run.loops || []).map((l) => l.passes) };
}
// touchmove paths: the browser may deliver one move fewer or more (coalesced events), so the shorter list is matched,
// in order, to a subsequence of the longer one, minimising the largest |clientY difference| (DP; the count difference is
// judged separately, tolerance 2). Index alignment is also printed: one dropped move shifts every later pair.
function alignMax(x, y) {
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (!s.length) return 0;
  const skip = l.length - s.length;
  // f[i][k] = best max dev matching s[0..i] with k skips used so far (s[i] matched to l[i + k])
  let prev = Array(skip + 1).fill(Infinity);
  for (let k = 0; k <= skip; k++) prev[k] = Math.abs(s[0] - l[k]);
  for (let k = 1; k <= skip; k++) prev[k] = Math.min(prev[k], prev[k - 1]);
  for (let i = 1; i < s.length; i++) {
    const cur = Array(skip + 1).fill(Infinity);
    for (let k = 0; k <= skip; k++) cur[k] = Math.max(prev[k], Math.abs(s[i] - l[i + k]));
    for (let k = 1; k <= skip; k++) cur[k] = Math.min(cur[k], cur[k - 1]);
    prev = cur;
  }
  return prev[skip];
}
const c = view(C, 'C'), w = view(V, 'V');
const ac = aaC.map((f) => ({ f, v: view(load(f), `aa-c ${f}`) })), av = aaV.map((f) => ({ f, v: view(load(f), `aa-v ${f}`) }));
const base = (f) => f.split('/').pop();
for (const { f, v } of [...ac, ...av]) if (v.hash !== c.hash) { console.error(`A/A record ${base(f)} plays program ${v.hash}, C plays ${c.hash}: not the same script`); process.exit(1); }
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
let diffs = 0;
const line = (name, ok, a, b, note = '') => { if (!ok) diffs++; console.log(`${ok ? 'SAME' : 'DIFF'}  ${name}: C ${a} | V ${b}${note ? `  (${note})` : ''}`); };
console.log(`INFO  records: C ${base(fc)} | V ${base(fv)} | A/A C ${ac.map((x) => base(x.f)).join(', ') || '-'} | A/A V ${av.map((x) => base(x.f)).join(', ') || '-'}`);
line('program hash', c.hash === w.hash, c.hash, w.hash);
line('toolbar level, innerHeight at start', c.vh0 === w.vh0, c.vh0, w.vh0);
line('toolbar level, innerHeight at read', c.ih === w.ih, c.ih, w.ih);
line('endH', c.endH === w.endH, c.endH, w.endH);
line('maxY', c.maxY === w.maxY, c.maxY, w.maxY);
console.log(`INFO  docH: C ${c.docH} | V ${w.docH}`);
const f0 = c.strokes[0], g0 = w.strokes[0];
line('first touch scrollY / p / clientY', Math.abs(f0.y0 - g0.y0) <= 8 && Math.abs(f0.p0 - g0.p0) <= 0.02 && Math.abs(f0.c0 - g0.c0) <= 4, `${f0.y0} / ${r2(f0.p0)} / ${f0.c0}`, `${g0.y0} / ${r2(g0.p0)} / ${g0.c0}`);
const lc = c.strokes.filter((s) => s.loop).length, lw = w.strokes.filter((s) => s.loop).length;
console.log(`INFO  played strokes: C ${c.strokes.length} (${lc} approach drags) | V ${w.strokes.length} (${lw} approach drags); approach passes per loop: C ${c.loops.join(' ')} | V ${w.loops.join(' ')} (outcome-dependent, not judged)`);
console.log(`INFO  touchmoves, whole record: C ${c.nMoves} (cancelable ${c.cancelAll}, prevented ${c.prevAll}) | V ${w.nMoves} (cancelable ${w.cancelAll}, prevented ${w.prevAll})`);
const cc = c.strokes.filter((s) => !s.loop), cw = w.strokes.filter((s) => !s.loop);
line('counted strokes (program ids in order)', cc.map((s) => s.id).join(' ') === cw.map((s) => s.id).join(' '), `${cc.length}: ${cc.map((s) => s.id).join(' ')}`, `${cw.length}: ${cw.map((s) => s.id).join(' ')}`);
// 1. per counted stroke, exact match (judged): id, mark, start scrollY / p, clientY at touchstart and at lift, no prevented
// touchmove on either arm. The strict rule (count <= 2 apart, aligned path <= 6 px) is printed as INFO only.
let differed = false, strict = 0;
for (let i = 0; i < Math.min(cc.length, cw.length); i++) {
  const a = cc[i], b = cw[i];
  const n = Math.min(a.moves.length, b.moves.length);
  let idx = 0; for (let j = 0; j < n; j++) idx = Math.max(idx, Math.abs(a.moves[j] - b.moves[j]));
  const path = alignMax(a.moves, b.moves);
  const start = a.id === b.id && a.mark === b.mark && Math.abs(a.y0 - b.y0) <= 8 && Math.abs(a.p0 - b.p0) <= 0.02 && Math.abs(a.c0 - b.c0) <= 4
    && a.cEnd !== null && b.cEnd !== null && Math.abs(a.cEnd - b.cEnd) <= 4 && a.prevented === 0 && b.prevented === 0;
  const st = start && Math.abs(a.moves.length - b.moves.length) <= 2 && path <= 6;
  if (!st) strict++;
  line(`counted ${i + 1} ${a.id} @${a.mark} start/lift/prevented`, start,
    `y0 ${a.y0} p ${r2(a.p0)} c0 ${a.c0} lift ${a.cEnd} prevented ${a.prevented} rest ${r2(a.rest)} moves ${a.moves.length}`,
    `y0 ${b.y0} p ${r2(b.p0)} c0 ${b.c0} lift ${b.cEnd} prevented ${b.prevented} rest ${r2(b.rest)} moves ${b.moves.length}`,
    `INFO strict ${st ? 'same' : 'DIFF'}; path max |dy| ${path} px in-order aligned, index-aligned ${idx}${differed ? '; after a differing outcome' : ''}`);
  if (a.rest !== null && b.rest !== null && Math.abs(a.rest - b.rest) > 0.1) differed = true;
}
// A/A records: their own counted strokes must be the same ids (else their pairs would not be the same strokes); start lines INFO
for (const [arm, list, ref] of [['C', ac, cc], ['V', av, cw]]) for (const { f, v } of list) {
  const ids = v.strokes.filter((s) => !s.loop).map((s) => s.id).join(' ');
  line(`A/A ${arm} ${base(f)} counted strokes (program ids in order)`, ids === ref.map((s) => s.id).join(' '), arm === 'C' ? ids : '-', arm === 'V' ? ids : '-');
  const pv = v.strokes.filter((s) => !s.loop).reduce((n, s) => n + s.prevented, 0);
  console.log(`INFO  A/A ${arm} ${base(f)}: vh0 ${v.vh0} ih ${v.ih} endH ${v.endH} maxY ${v.maxY}; first touch ${v.strokes[0].y0} / ${r2(v.strokes[0].p0)} / ${v.strokes[0].c0}; prevented touchmoves on counted strokes ${pv}`);
}
// 2. touchmove stream per group of identical counted strokes
function shared(x, y) { // LCS with |dy| <= 2, as min(m / |x|, m / |y|)
  if (!x.length || !y.length) return x.length === y.length ? 1 : 0;
  const L = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
    L[i][j] = Math.abs(x[i - 1] - y[j - 1]) <= 2 ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  const m = L[x.length][y.length];
  return Math.min(m / x.length, m / y.length);
}
const monotone = (s) => { const sg = s.kin.startsWith('down') ? 1 : -1; const v = [s.c0, ...s.moves]; for (let i = 1; i < v.length; i++) if (sg * (v[i] - v[i - 1]) < -2) return false; return true; };
const r2s = (x) => (x === null ? '-' : Math.round(x * 100) / 100);
const groups = new Map();
const gget = (kin) => { if (!groups.has(kin)) groups.set(kin, { C: [], V: [], AC: [], AV: [] }); return groups.get(kin); };
for (const s of cc) gget(s.kin).C.push(s);
for (const s of cw) gget(s.kin).V.push(s);
for (const { v } of ac) for (const s of v.strokes.filter((x) => !x.loop)) if (groups.has(s.kin)) groups.get(s.kin).AC.push(s);
for (const { v } of av) for (const s of v.strokes.filter((x) => !x.loop)) if (groups.has(s.kin)) groups.get(s.kin).AV.push(s);
const cross = (A, B) => { const out = []; for (const a of A) for (const b of B) out.push(shared(a.moves, b.moves)); return out; };
const within = (A) => { const out = []; for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) out.push(shared(A[i].moves, A[j].moves)); return out; };
const mn = (a) => (a.length ? Math.min(...a) : null);
for (const [kin, g] of groups) {
  const bt = mn(cross(g.C, g.V)), aaCC = mn(cross(g.C, g.AC)), aaVV = mn(cross(g.V, g.AV));
  const mono = [...g.C, ...g.V].every(monotone);
  const missing = [aaCC === null ? 'no C-C A/A pair' : null, aaVV === null ? 'no V-V A/A pair' : null].filter(Boolean);
  const need = missing.length ? null : Math.min(aaCC, aaVV);
  const ok = !missing.length && mono && bt !== null && bt >= need;
  line(`path, strokes ${kin}`, ok,
    `${g.C.length} strokes, moves ${g.C.map((s) => s.moves.length).join(' ')}; A/A C-C min ${r2s(aaCC)} (${g.AC.length} partner strokes, moves ${g.AC.map((s) => s.moves.length).join(' ') || '-'})`,
    `${g.V.length} strokes, moves ${g.V.map((s) => s.moves.length).join(' ')}; A/A V-V min ${r2s(aaVV)} (${g.AV.length} partner strokes, moves ${g.AV.map((s) => s.moves.length).join(' ') || '-'})`,
    `C-V shared min ${r2s(bt)}, need ${missing.length ? missing.join(', ') + ': FAILS until it has one' : r2s(need)}; monotone ${mono ? 'yes' : 'NO'}; INFO within-record C ${r2s(mn(within(g.C)))} V ${r2s(mn(within(g.V)))}`);
}
console.log(`RESULT ${diffs ? `DIFF ${diffs}` : 'SAME'} (${base(fc)} vs ${base(fv)}; frozen rule, A/A C ${ac.length} V ${av.length} record(s)); INFO strict per-stroke rule: ${strict ? `DIFF ${strict}` : 'same'}`);
process.exit(diffs ? 2 : 0);

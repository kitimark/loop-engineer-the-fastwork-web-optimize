// PR-018 rev 7d, P-124 pre-data read (F-256, ops D1): does the V arm (rev 7d candidate) give the G driver the same start
// state and the same gesture path as the C arm (rev 7c)? Compares two count-only gesture records of the same script
// (sim7d.sh or iphone.mjs gesture, both with --inject fixes/morph-scroll/msdbg-inject.mjs).
//   node fixes/morph-scroll/sim7d-compare.mjs <C record.json> <V record.json>
// Checked (SAME / DIFF per line, tolerances below):
//   page      program hash; toolbar level (innerHeight at record start, vh0, and at read, ih); docH; endH; maxY
//   first     first touch: scrollY, p (0 closed rest, 1 open), clientY
//   strokes   played strokes = touchstarts, and program stroke ids in play order
//   counted   every stroke outside an `until` loop (the scored strokes: fling-out, near-250/280, the fast short flicks,
//             E1-E4): its mark, start scrollY and p, clientY at touchstart, touchmove count, clientY path (touchmoves
//             index-aligned, max |dy|), clientY at lift. A counted stroke that starts after an earlier counted stroke
//             ended differently (its rest p differs by > 0.1) is marked "after a differing outcome".
//   loops     `until atEnd` approach loops: passes per loop (outcome-dependent by design: a released close leaves the
//             page lower, so the next approach takes more drags; reported, not judged)
// Tolerances: scrollY 8 px, p 0.02, clientY 4 px, touchmove count 2, path 6 px. No times are compared.
import { readFileSync } from 'node:fs';
const [fc, fv] = process.argv.slice(2);
if (!fc || !fv) { console.error('usage: sim7d-compare.mjs <C record> <V record>'); process.exit(1); }
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
    const t1 = k + 1 < starts.length ? starts[k + 1][0][0] : Infinity;
    const after = (v.scroll || []).filter((s) => end && s[0] >= end[0] && s[0] < t1);
    const rest = after.length ? P(after[after.length - 1][1]) : end ? P(end[5]) : null;
    const mark = [...(seg.marks || [])].reverse().find((m) => m[0] <= t0[0]);
    return { k, id: played[k], loop: loopIds.has(played[k]), mark: mark ? mark[1] : null, y0: t0[5], p0: P(t0[5]), c0: t0[6], moves, cEnd: end ? end[6] : null, rest };
  });
  return { hash: d.program.hash.slice(0, 12), vh0: seg.vh0, ih: v.ih, docH: seg.docH, endH: v.endH, maxY: v.maxY, played, strokes, loops: (d.run.loops || []).map((l) => l.passes) };
}
const c = view(C, 'C'), w = view(V, 'V');
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
let diffs = 0;
const line = (name, ok, a, b, note = '') => { if (!ok) diffs++; console.log(`${ok ? 'SAME' : 'DIFF'}  ${name}: C ${a} | V ${b}${note ? `  (${note})` : ''}`); };
line('program hash', c.hash === w.hash, c.hash, w.hash);
line('toolbar level, innerHeight at start', c.vh0 === w.vh0, c.vh0, w.vh0);
line('toolbar level, innerHeight at read', c.ih === w.ih, c.ih, w.ih);
line('docH', c.docH === w.docH, c.docH, w.docH);
line('endH', c.endH === w.endH, c.endH, w.endH);
line('maxY', c.maxY === w.maxY, c.maxY, w.maxY);
const f0 = c.strokes[0], g0 = w.strokes[0];
line('first touch scrollY / p / clientY', Math.abs(f0.y0 - g0.y0) <= 8 && Math.abs(f0.c0 - g0.c0) <= 4, `${f0.y0} / ${r2(f0.p0)} / ${f0.c0}`, `${g0.y0} / ${r2(g0.p0)} / ${g0.c0}`);
const lc = c.strokes.filter((s) => s.loop).length, lw = w.strokes.filter((s) => s.loop).length;
console.log(`INFO  played strokes: C ${c.strokes.length} (${lc} approach drags) | V ${w.strokes.length} (${lw} approach drags); approach passes per loop: C ${c.loops.join(' ')} | V ${w.loops.join(' ')} (outcome-dependent, not judged)`);
const cc = c.strokes.filter((s) => !s.loop), cw = w.strokes.filter((s) => !s.loop);
line('counted strokes (program ids in order)', cc.map((s) => s.id).join(' ') === cw.map((s) => s.id).join(' '), `${cc.length}: ${cc.map((s) => s.id).join(' ')}`, `${cw.length}: ${cw.map((s) => s.id).join(' ')}`);
let differed = false;
for (let i = 0; i < Math.min(cc.length, cw.length); i++) {
  const a = cc[i], b = cw[i];
  const n = Math.min(a.moves.length, b.moves.length);
  let path = 0; for (let j = 0; j < n; j++) path = Math.max(path, Math.abs(a.moves[j] - b.moves[j]));
  const ok = a.id === b.id && a.mark === b.mark && Math.abs(a.y0 - b.y0) <= 8 && Math.abs(a.p0 - b.p0) <= 0.02 && Math.abs(a.c0 - b.c0) <= 4
    && Math.abs(a.moves.length - b.moves.length) <= 2 && path <= 6 && (a.cEnd === null || b.cEnd === null || Math.abs(a.cEnd - b.cEnd) <= 4);
  line(`counted ${i + 1} ${a.id} @${a.mark}`, ok,
    `y0 ${a.y0} p ${r2(a.p0)} c0 ${a.c0} moves ${a.moves.length} lift ${a.cEnd} rest ${r2(a.rest)}`,
    `y0 ${b.y0} p ${r2(b.p0)} c0 ${b.c0} moves ${b.moves.length} lift ${b.cEnd} rest ${r2(b.rest)}`,
    `path max |dy| ${path} px over ${n} moves${differed ? '; after a differing outcome' : ''}`);
  if (a.rest !== null && b.rest !== null && Math.abs(a.rest - b.rest) > 0.1) differed = true;
}
console.log(`RESULT ${diffs ? `DIFF ${diffs}` : 'SAME'} (${fc.split('/').pop()} vs ${fv.split('/').pop()})`);
process.exit(diffs ? 2 : 0);

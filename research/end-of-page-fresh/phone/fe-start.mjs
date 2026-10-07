#!/usr/bin/env node
// P-163 pre-data start-state check (arch-end-fresh; a pure reader: no device, no measurement). Reads two Simulator
// gesture records made with `sim.mjs gesture fixes/morph-scroll/g-fastshort-v1.json --count-only` (C = v14, V = D1b-a)
// and prints, per arm: the program hash, the doc geometry, start m (m = (y - (docH - 2 ih)) / ih, ih = the segment's
// vh0), the stroke order (id profile dir px, the tween order the driver played), the settle ys (each stroke's start y =
// where the previous stroke came to rest), moving frames per stroke and in total, momentum flings.
// Count-only records keep no frame log, so this reads summary.segments[0].perStroke (startY, movingFrames,
// postReleaseTravelPx) and run.segments[0] (docH, vh0, marks), not frames.
//   node research/end-of-page-fresh/phone/fe-start.mjs <C record.json> <V record.json>
// MATCH when: the same program, docH, vh0, stroke order and mark order; every settle y within 2 px; total moving frames
// within 10 % of each other. Else DIFFER, with the items that differ (the lead's rule: if the arms differ, stop).
import { readFileSync } from 'node:fs';
const [cf, vf] = process.argv.slice(2);
if (!cf || !vf) { console.log('usage: node research/end-of-page-fresh/phone/fe-start.mjs <C record.json> <V record.json>'); process.exit(2); }
function read(f) {
  const j = JSON.parse(readFileSync(f, 'utf8')); const seg = j.run.segments[0]; const sum = j.summary.segments[0];
  const docH = seg.docH1 ?? seg.docH; const ih = seg.vh0; const m = (y) => +((y - (docH - 2 * ih)) / ih).toFixed(3);
  const ps = sum.perStroke;
  return {
    file: f.replace(/.*\//, ''), countOnly: !!j.meta.countOnly, script: j.meta.script, program: j.meta.program ?? j.meta.compiled?.hash ?? null,
    docH, ih, marks: (seg.marks ?? []).map((r) => r[1]).join(' '),
    order: ps.map((p) => `${p.id}:${p.profile}:${p.dir}:${p.px}`),
    startY: ps.map((p) => p.startY), startM: ps.map((p) => m(p.startY)), firstEStart: (() => { const i = ps.findIndex((p) => p.id !== 's1'); return i < 0 ? null : { y: ps[i].startY, m: m(ps[i].startY) }; })(),
    moving: ps.map((p) => p.movingFrames), movingTotal: ps.reduce((a, p) => a + p.movingFrames, 0),
    travel: ps.map((p) => p.postReleaseTravelPx), flings: j.summary.momentum?.flings ?? null, strokes: j.summary.strokes ?? ps.length,
    toolbarTransitions: sum.toolbar?.transitions ?? null, frames: sum.frames ?? seg.frameCount ?? null,
  };
}
const C = read(cf), V = read(vf);
for (const [k, r] of [['C', C], ['V', V]]) {
  console.log(`${k} ${r.file} countOnly ${r.countOnly} script ${r.script} program ${r.program} docH ${r.docH} ih ${r.ih} strokes ${r.order.length} frames ${r.frames} toolbar ${r.toolbarTransitions} flings ${r.flings}`);
  console.log(`${k} first E stroke start y ${r.firstEStart?.y} m ${r.firstEStart?.m}`);
  console.log(`${k} order ${r.order.join(' ')}`);
  console.log(`${k} settle ys ${r.startY.slice(1).join(' ')}`);
  console.log(`${k} moving ${r.moving.join(' ')} total ${r.movingTotal}`);
  console.log(`${k} post-release px ${r.travel.join(' ')}`);
}
const diff = [];
if (C.program !== V.program || C.script !== V.script) diff.push('program');
if (C.docH !== V.docH || C.ih !== V.ih) diff.push(`geometry docH ${C.docH}/${V.docH} ih ${C.ih}/${V.ih}`);
if (C.marks !== V.marks) diff.push('mark order');
if (C.order.join() !== V.order.join()) diff.push('stroke order');
const sd = C.startY.map((y, i) => [i, y, V.startY[i]]).filter(([, a, b]) => b === undefined || Math.abs(a - b) > 2);
if (sd.length) diff.push(`settle ys at strokes ${sd.map(([i, a, b]) => `${i}:${a}/${b}`).join(' ')}`);
const mr = Math.abs(C.movingTotal - V.movingTotal) / Math.max(C.movingTotal, V.movingTotal);
if (mr > 0.1) diff.push(`moving frames ${C.movingTotal}/${V.movingTotal}`);
console.log(`moving frames C ${C.movingTotal} V ${V.movingTotal} (${(mr * 100).toFixed(1)} %), flings C ${C.flings} V ${V.flings}, start m (first E stroke) C ${C.firstEStart?.m} V ${V.firstEStart?.m}`);
console.log(diff.length ? `START-STATE DIFFER: ${diff.join('; ')}` : 'START-STATE MATCH');
process.exit(diff.length ? 3 : 0);

#!/usr/bin/env node
// PR-018 rev 7: per-swipe outcome of the user's finger captures (finger-capture.mjs) at the end of the page.
//   node fixes/morph-scroll/finger-analyze.mjs <capture.json>... [--json out.json]
// p = (scrollY - (docH - vh - lvh)) / lvh: 0 = menu closed (rest one large viewport above the end), 1 = open (page end).
// A swipe = touchstart .. touchend that starts in the end zone (-0.15 <= p0 <= 1.15). Heading: the page's move during
// the touch, or (no move) the finger's: finger up = page down = opening. Rest: the first 300 ms with no scrollY change
// after the lift, or the next touchstart. hit = rests at the end it headed for (open p >= 0.98, close p <= 0.02);
// back = rests at the end it started from; mid = between. Swipes that start at the end they head for are "noop".
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args[ji + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && (ji < 0 || i !== ji + 1));
const all = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const fr = r.frames, tc = r.touches;
  if (!fr.length) continue;
  const lvh = Math.max(...fr.map((x) => x[3]));
  const pOf = (x) => (x[2] - (r.docH - x[3] - lvh)) / lvh;
  const frAt = (t) => { let q = fr[0]; for (const x of fr) { if (x[0] > t) break; q = x; } return q; };
  const T = (x) => x[0];
  for (let i = 0; i < tc.length; i++) {
    if (tc[i][1] !== 's' || tc[i][2] !== 1) continue;
    let j = i + 1; const moves = [];
    while (j < tc.length && !((tc[j][1] === 'e' || tc[j][1] === 'c') && tc[j][2] === 0)) { if (tc[j][1] === 'm') moves.push(tc[j]); j++; }
    if (j >= tc.length) break;
    const ts = T(tc[i]), tl = T(tc[j]);
    const nextS = tc.slice(j + 1).find((x) => x[1] === 's');
    const f0 = frAt(ts), fl = frAt(tl), p0 = pOf(f0), pl = pOf(fl);
    if (p0 < -0.15 || p0 > 1.15) continue;
    const fingerDy = (tc[j][6] ?? moves.at(-1)?.[6] ?? tc[i][6]) - tc[i][6];
    const last = moves.slice(-3);
    const liftV = last.length >= 2 ? -(last.at(-1)[6] - last[0][6]) / Math.max(1, (last.at(-1)[7] ?? last.at(-1)[0]) - (last[0][7] ?? last[0][0])) : null; // + = finger up (opening), px/ms
    const pageDy = fl[2] - f0[2];
    const dir = Math.abs(pageDy) >= 2 ? Math.sign(pageDy) : -Math.sign(fingerDy);
    // rest
    const after = fr.filter((x) => x[0] > tl && (!nextS || x[0] < T(nextS)));
    let rest = null, lastChange = tl;
    for (let k = 1; k < after.length; k++) {
      if (after[k][2] !== after[k - 1][2]) lastChange = after[k][0];
      else if (after[k][0] - lastChange >= 300) { rest = after[k]; break; }
    }
    const interrupted = !rest;
    rest = rest || after.at(-1) || fl;
    const pr = pOf(rest);
    const atOpen = pr >= 0.98, atClosed = pr <= 0.02;
    const startOpen = p0 >= 0.98, startClosed = p0 <= 0.02;
    let out;
    if ((dir > 0 && startOpen) || (dir < 0 && startClosed) || dir === 0) out = 'noop';
    else if ((dir > 0 && atOpen) || (dir < 0 && atClosed)) out = 'hit';
    else if ((dir > 0 && atClosed) || (dir < 0 && atOpen)) out = 'back';
    else out = 'mid';
    all.push({ file: f.split('/').pop(), label: r.label, dir: dir > 0 ? 'open' : dir < 0 ? 'close' : '-', p0: +p0.toFixed(2), pLift: +pl.toFixed(2), pRest: +pr.toFixed(2), out, interrupted,
      touchMs: Math.round(tl - ts), fingerPx: fingerDy, moves: moves.length, liftV: liftV == null ? null : +liftV.toFixed(2), restMs: Math.round(rest[0] - tl) });
  }
}
const by = {};
for (const s of all) { const k = s.label || s.file; (by[k] ||= []).push(s); }
for (const [k, ss] of Object.entries(by)) {
  const c = ss.filter((s) => s.out !== 'noop');
  const n = (o, d) => c.filter((s) => s.out === o && (!d || s.dir === d)).length;
  const fast = c.filter((s) => s.touchMs <= 150);
  console.log(`${k}: ${c.length} swipes (open ${c.filter((s) => s.dir === 'open').length}, close ${c.filter((s) => s.dir === 'close').length}), hit ${n('hit')} (open ${n('hit', 'open')}, close ${n('hit', 'close')}), back ${n('back')}, mid ${n('mid')}; ` +
    `fast (touch <= 150 ms) ${fast.length}: hit ${fast.filter((s) => s.out === 'hit').length}, back ${fast.filter((s) => s.out === 'back').length}; noop ${ss.length - c.length}`);
  for (const s of ss) console.log(`   ${s.dir.padEnd(5)} p ${s.p0} -> lift ${s.pLift} -> rest ${s.pRest} ${s.out.padEnd(4)} touch ${s.touchMs} ms finger ${s.fingerPx} px moves ${s.moves} liftV ${s.liftV} rest +${s.restMs} ms${s.interrupted ? ' (next touch)' : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));

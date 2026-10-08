#!/usr/bin/env node
// de-offscreen step 4 (lead): P-164's end-of-page G-gesture runs (fix-g0-box's out/g0bp/runs, read only). Which moments
// and code paths are the finger-down frames > 50 ms on g0.0e (C) and g0.0f (V)?
// Per counted run (EC1-EC4, EV1-EV4; re-runs EC1r/EV1r with --all), segment 0:
//   frames  = [t, dt, scrollY, innerHeight] (rAF stamps); a frame covers (t - dt, t].
//   touches = [t, kind s|m|e|c, nTouches, cancelable, defaultPrevented, scrollY, clientY, timeStamp].
//   finger down = from a touchstart to the next touchend/touchcancel. A frame is "finger-down" when its span overlaps
//   one (the P-164 descriptive line used the same idea; its exact counts may differ by a frame or two).
//   Moment of each > 50 frame: the gesture part (last mark before it: approach / E2x-open|close-...), ms since the
//   touchstart, the touch rows inside the frame (moves, prevented, cancelable), scrollY, docH, the menu state (g0b-read's
//   rule: an upward prevented move while closed opens, a downward prevented move while open closes), whether the frame
//   holds the first prevented move of the contact (the jack's take-over), whether the scroll is at the end.
//   Timeline (tl-<run>.json, clock t = startTime*1000 - offsetMs): every record whose span overlaps the frame, summed
//   by type at its own depth: top-level EventDispatch (touch handlers outside a rendering update), and inside each
//   RenderingFrame its children (Layout, RecalculateStyles, Composite, Paint, FireAnimationFrame, EventDispatch,
//   TimerFire, ObserverCallback ...) plus "RF-other" (RenderingFrame time not covered by a child).
//   node fixes/de-offscreen/p164-fingerdown-read.mjs [runs dir] [--all] [--json <out>]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const DIR = args.find((a, i) => !a.startsWith('--') && i !== ji + 1)
  || '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-afabe5bf71361298f/out/g0bp/runs';
const RUNS = ['EC1', 'EC2', 'EC3', 'EC4', 'EV1', 'EV2', 'EV3', 'EV4', ...(args.includes('--all') ? ['EC1r', 'EV1r'] : [])];
const r1 = (x) => Math.round(x * 10) / 10;

function contacts(touches) {
  const out = []; let cur = null;
  for (const r of touches) {
    if (r[1] === 's') { if (cur) out.push(cur); cur = { a: r[0], b: null, rows: [r] }; }
    else if (cur) { cur.rows.push(r); if (r[1] === 'e' || r[1] === 'c') { cur.b = r[0]; out.push(cur); cur = null; } }
  }
  if (cur) { cur.b = cur.rows[cur.rows.length - 1][0]; out.push(cur); }
  return out;
}
function menuStates(touches) { // [t, open] after each trigger (g0b-read's rule)
  const ev = []; let open = false, prevY = null;
  for (const r of touches) {
    if (r[1] === 's') { prevY = r[6]; continue; }
    if (r[1] !== 'm') continue;
    const up = prevY != null && r[6] < prevY, down = prevY != null && r[6] > prevY; prevY = r[6];
    if (r[4] === 1 && !open && up) { open = true; ev.push([r[0], true]); }
    else if (r[4] === 1 && open && down) { open = false; ev.push([r[0], false]); }
  }
  return ev;
}
function tlInFrame(tl, lo, hi) {
  const by = {}; const add = (k, ms) => { by[k] = (by[k] || 0) + ms; };
  const T = (x) => x * 1000 - tl.offsetMs;
  const ev = [];
  for (const r of tl.recs || []) {
    const a = T(r.startTime), b = T(r.endTime ?? r.startTime);
    if (!(b > lo && a < hi)) continue;
    if (r.type === 'RenderingFrame') {
      let covered = 0;
      for (const c of r.children || []) {
        const ca = T(c.startTime), cb = T(c.endTime ?? c.startTime); add(c.type, cb - ca); covered += cb - ca;
        if (c.type === 'EventDispatch') ev.push(c.data?.type || '?');
        // Paint nested in Composite: report separately
        if (c.type === 'Composite') for (const p of c.children || []) if (p.type === 'Paint') add('Paint(in Composite)', T(p.endTime) - T(p.startTime));
      }
      add('RF-other', Math.max(0, b - a - covered)); add('RF-total', b - a);
    } else { add('top:' + r.type, b - a); if (r.type === 'EventDispatch') ev.push(r.data?.type || '?'); }
  }
  return { by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r1(v)])), events: ev };
}

const res = { dir: 'fix-g0-box out/g0bp/runs (read only)', runs: {} };
for (const run of RUNS) {
  const gf = join(DIR, `g-${run}.json`), tf = join(DIR, `tl-${run}.json`);
  if (!existsSync(gf)) { console.log(`${run}: missing`); continue; }
  const g = JSON.parse(readFileSync(gf, 'utf8')); const s = g.run.segments[0];
  const tl = existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null;
  const C = contacts(s.touches), M = menuStates(s.touches), marks = s.marks;
  const maxY = (s.docH1 || s.docH) - s.vh0;
  const slow = [];
  for (let i = 0; i < s.frames.length; i++) {
    const [t, dt, y, ih] = s.frames[i]; if (!(dt > 34)) continue;
    const lo = t - dt, hi = t;
    const c = C.find((x) => x.b > lo && x.a < hi); if (!c) continue;
    const mark = [...marks].reverse().find((m) => m[0] <= t)?.[1] || 'pre';
    const rows = c.rows.filter((r) => r[0] > lo && r[0] <= hi);
    const firstPrev = c.rows.find((r) => r[1] === 'm' && r[4] === 1);
    const st = [...M].reverse().find((m) => m[0] <= lo); const open = st ? st[1] : false;
    const trig = M.find((m) => m[0] > lo && m[0] <= hi);
    const ci = C.indexOf(c);
    const dir = c.rows.length > 2 ? (c.rows[c.rows.length - 1][6] < c.rows[0][6] ? 'up' : 'down') : '?';
    slow.push({ t, dt, y, ih, mark, contact: ci, dir, msSinceStart: Math.round(lo - c.a), msToEnd: Math.round(c.b - hi),
      rows: rows.length, moves: rows.filter((r) => r[1] === 'm').length, prevented: rows.filter((r) => r[4] === 1).length,
      cancelable: rows.filter((r) => r[3] === 1).length, start: rows.some((r) => r[1] === 's'), end: rows.some((r) => r[1] === 'e' || r[1] === 'c'),
      jackFirst: !!(firstPrev && firstPrev[0] > lo && firstPrev[0] <= hi), trigger: trig ? (trig[1] ? 'open' : 'close') : null,
      menu: open ? 'open' : 'closed', atEnd: y >= maxY - 60, tl: tl ? tlInFrame(tl, lo, hi) : null });
  }
  const gt50 = slow.filter((x) => x.dt > 50);
  res.runs[run] = { arm: run[1] === 'C' ? 'g0.0e' : 'g0.0f', fingerDownGt34: slow.length, fingerDownGt50: gt50.length, contacts: C.length, slow };
  console.log(`\n== ${run} (${res.runs[run].arm}) finger-down frames >34 ${slow.length}, >50 ${gt50.length}; contacts ${C.length}`);
  for (const x of gt50) {
    const b = x.tl?.by || {}; const top = Object.entries(b).filter(([k]) => k !== 'RF-total').sort((p, q) => q[1] - p[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`  dt ${x.dt} y ${x.y}${x.atEnd ? ' END' : ''} | ${x.mark} c${x.contact} ${x.dir} +${x.msSinceStart} ms (to end ${x.msToEnd}) | rows ${x.rows} mv ${x.moves} prev ${x.prevented} canc ${x.cancelable}${x.start ? ' START' : ''}${x.end ? ' END-TOUCH' : ''}${x.jackFirst ? ' JACK-FIRST' : ''}${x.trigger ? ' TRIGGER-' + x.trigger : ''} menu ${x.menu} | RF ${b['RF-total'] ?? '-'}: ${top} | ev ${[...new Set(x.tl?.events || [])].join(',')}`);
  }
}
if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));

#!/usr/bin/env node
// The phone side in h60.mjs's columns: scroll-phase frames of iphone.mjs scroll logs (fixes/iphone-wave2/raw/goal-*.json,
// 2026-10-01 06:53-06:57Z: baseline B1-B3, aw1-10c P1-P3), with the ±4 ms twins and 60 Hz ticks k = round(dt/16.667).
//   node phone.mjs <file.json>...
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const m = d.marks.scroll; // [start, end] in the log's time base
  const fr = d.frames.map((x) => (Array.isArray(x) ? { t: x[0], dt: x[1], y: x[2] } : x));
  const [a, b] = Array.isArray(m) ? m : [m.start ?? m.t0 ?? m[0], m.end ?? m.t1 ?? m[1]];
  const s = fr.filter((x) => x.t > a && x.t <= b).map((x) => x.dt);
  const n = (t) => s.filter((x) => x > t).length;
  const k = s.map((dt) => Math.round(dt / (1000 / 60)));
  console.log(`${basename(f).padEnd(14)} frames ${s.length} >20 ${n(20)} >30 ${n(30)} >34 ${n(34)} >38 ${n(38)} >46 ${n(46)} >50 ${n(50)} >54 ${n(54)} >100 ${n(100)} k>=3 ${k.filter((x) => x >= 3).length} k>=4 ${k.filter((x) => x >= 4).length} max ${Math.max(...s)} | in (30,38]: ${s.filter((x) => x > 30 && x <= 38).length} in (46,54]: ${s.filter((x) => x > 46 && x <= 54).length} | summary >34 ${d.summary?.scroll?.gt34 ?? d.summary?.scroll?.over34 ?? '?'}`);
}

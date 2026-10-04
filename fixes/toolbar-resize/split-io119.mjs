#!/usr/bin/env node
// toolbar-resize P-119 read helper for ops note N1 (descriptive only, no call): splits each run's primary frames
// (toolbar moving: innerHeight strictly between the run's min and max; y < 3250; the secondary's frame set) by the
// showcase's IntersectionObserver state at the frame's time (the last IO entry with time <= t: in view = 1, off screen = 0;
// before the first entry = unknown). Per group: frame count, median of the frame's largest outermost Layout, summed
// Layout ms per second (sum Layout ms / sum dt), and each value's ratio to the neighbouring C runs' mean.
// IO entries are delivered in the update after the crossing, so a frame at the boundary may sit in the wrong group;
// a "skip is the mechanism" read uses the off-screen group only (N1).
//   node fixes/toolbar-resize/split-io119.mjs <folder> <run> ... [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
const [dir, ...names] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
if (!dir || !names.length) { console.error('usage: split-io119.mjs <folder> <run> ... [--json out.json]'); process.exit(1); }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const runs = names.map((name) => {
  const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8'));
  const seg = [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  let inj = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof inj === 'string') inj = JSON.parse(inj);
  const lays = [];
  const walk = (r, inLay) => { const isL = r.type === 'Layout' && r.endTime != null; if (isL && !inLay) lays.push([r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000]); (r.children || []).forEach((c) => walk(c, inLay || isL)); };
  for (const r of tl.recs || []) walk(r, false);
  const io = inj?.io || [], fr = seg.frames, ihs = fr.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
  const grp = { in: [], off: [], unknown: [] };
  for (const [t, dt, y, ih] of fr) {
    if (!(ih > lo && ih < hi) || y >= 3250) continue;
    let st = null; for (const e of io) { if (e[0] <= t) st = e[1]; else break; }
    const ls = lays.filter((l) => l[0] > t - dt && l[0] <= t);
    grp[st == null ? 'unknown' : st ? 'in' : 'off'].push({ dt, max: ls.reduce((m, l) => Math.max(m, l[1]), 0), sum: ls.reduce((a, l) => a + l[1], 0) });
  }
  const sum = {};
  for (const [k, a] of Object.entries(grp)) { const dts = a.reduce((x, f) => x + f.dt, 0); sum[k] = { n: a.length, medLargest: r3(median(a.map((f) => f.max))), msPerS: dts ? r3(a.reduce((x, f) => x + f.sum, 0) / (dts / 1000)) : null }; }
  return { name, arm: name.replace(/-H\d+$/, ''), groups: sum };
});
const nbC = (i) => { const nb = []; for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C') { nb.push(runs[j]); break; } for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C') { nb.push(runs[j]); break; } return nb; };
runs.forEach((r, i) => {
  if (r.arm === 'C') return;
  const nb = nbC(i); r.ratios = {};
  for (const k of ['in', 'off']) for (const m of ['medLargest', 'msPerS']) {
    const c = nb.map((x) => x.groups[k][m]).filter((v) => v != null);
    const cm = c.length ? c.reduce((a, v) => a + v, 0) / c.length : null;
    r.ratios[`${k}.${m}`] = cm && r.groups[k][m] != null ? r3(r.groups[k][m] / cm) : null;
  }
});
for (const r of runs) {
  const f = (k) => `${k} n ${r.groups[k].n} medL ${r.groups[k].medLargest} ms/s ${r.groups[k].msPerS}`;
  console.log(`${r.name.padEnd(8)} ${f('in')} | ${f('off')} | unknown n ${r.groups.unknown.n}${r.ratios ? ` | ratio in medL ${r.ratios['in.medLargest']} ms/s ${r.ratios['in.msPerS']}, off medL ${r.ratios['off.medLargest']} ms/s ${r.ratios['off.msPerS']}` : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ helper: 'fixes/toolbar-resize/split-io119.mjs', note: 'N1, descriptive only', runs }, null, 1));

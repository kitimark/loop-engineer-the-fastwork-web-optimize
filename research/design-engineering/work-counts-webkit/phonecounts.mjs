// Phone-side twin of wkscore.mjs (de-counts-sim): the same WebKit work counts, computed from iphone-runner's existing
// Timeline runs (srwin/tlwin output: <run>.json {syncT, marks, frames, vh0, maxY} + <run>.tl.json {syncTL, recs}).
// Read-only on those files; the counts use the same definitions as wkscore.mjs (view-rooted = root quad at 0,0 covering
// the viewport; heavy = duration >= CUT ms, default 2, also 1/5) so Sim and phone counts can be set side by side.
// Two outputs per run:
//   phases: per marked phase (idle, scroll, push, bottom), counts and counts per second;
//   flips:  every outermost RecalculateStyles that contains a nested Layout and starts at scroll y in [Y0, Y1]
//           (default 2300-2900, the scene flip), with nested Layout count, how many are view-rooted / heavy, RS ms.
// usage: node phonecounts.mjs <run.json>... [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const CUT = Number(process.env.CUT || 2);
const Y0 = Number(process.env.Y0 || 2300), Y1 = Number(process.env.Y1 || 2900);
const VW = 430;

export function flatten(recs, off) {
  const flat = [];
  const walk = (x, anc) => { flat.push({ type: x.type, s: x.startTime * 1000 - off, e: (x.endTime ?? x.startTime) * 1000 - off, anc, data: x.data || {} }); for (const c of x.children || []) walk(c, [...anc, x.type]); };
  for (const x of recs) walk(x, []);
  return flat.sort((a, b) => a.s - b.s);
}

export function spanCounts(R, vw, vh) {
  const dur = (f) => f.e - f.s;
  const isView = (f) => { const q = f.data.root; return Array.isArray(q) && Math.round(q[0]) === 0 && Math.round(q[1]) === 0 && q[2] - q[0] >= vw - 1 && q[5] - q[1] >= vh - 1; };
  const rs = R.filter((f) => f.type === 'RecalculateStyles' && !f.anc.includes('RecalculateStyles'));
  const lay = R.filter((f) => f.type === 'Layout');
  const nested = lay.filter((f) => f.anc.includes('RecalculateStyles'));
  const heavy = (xs, c) => xs.filter((f) => dur(f) >= c).length;
  return {
    frames: R.filter((f) => f.type === 'RenderingFrame').length,
    rs: rs.length, rsHeavy: heavy(rs, CUT), nestedLayout: nested.length,
    layout: lay.length, layoutView: lay.filter(isView).length,
    layoutHeavy1: heavy(lay, 1), layoutHeavy: heavy(lay, CUT), layoutHeavy5: heavy(lay, 5),
    layoutViewHeavy: lay.filter((f) => isView(f) && dur(f) >= CUT).length,
    layoutViewHeavy10: lay.filter((f) => isView(f) && dur(f) >= 10).length,
    paint: R.filter((f) => f.type === 'Paint').length,
    composite: R.filter((f) => f.type === 'Composite').length,
    schedStyle: R.filter((f) => f.type === 'ScheduleStyleRecalculation').length,
    invalidateLayout: R.filter((f) => f.type === 'InvalidateLayout').length,
  };
}

const all = {};
for (const f of args) {
  const r = JSON.parse(readFileSync(f));
  const tl = JSON.parse(readFileSync(f.replace(/\.json$/, '.tl.json')));
  const off = tl.syncTL * 1000 - tl.syncT;
  const flat = flatten(tl.recs, off);
  const vh = r.vh0 || 775;
  const yAt = (t) => { let y = r.frames[0]?.[2] ?? 0; for (const fr of r.frames) { if (fr[0] > t) break; y = fr[2]; } return y; };
  const phases = {};
  for (const [ph, [a, b]] of Object.entries(r.marks)) {
    const c = spanCounts(flat.filter((x) => x.s >= a && x.s < b), VW, vh);
    c.sec = Math.round((b - a) / 100) / 10;
    phases[ph] = c;
  }
  const flips = [];
  for (const x of flat) {
    if (x.type !== 'RecalculateStyles' || x.anc.includes('RecalculateStyles')) continue;
    const y = yAt(x.s);
    if (y < Y0 || y > Y1) continue;
    const inner = flat.filter((z) => z.type === 'Layout' && z.s >= x.s && z.e <= x.e && z.anc.includes('RecalculateStyles'));
    if (!inner.length) continue;
    const isView = (z) => { const q = z.data.root; return Array.isArray(q) && Math.round(q[0]) === 0 && Math.round(q[1]) === 0 && q[2] - q[0] >= VW - 1 && q[5] - q[1] >= vh - 1; };
    flips.push({ y, rsMs: Math.round((x.e - x.s) * 10) / 10, nested: inner.length, nestedView: inner.filter(isView).length, nestedHeavy: inner.filter((z) => z.e - z.s >= CUT).length, nestedMs: Math.round(inner.reduce((s, z) => s + z.e - z.s, 0) * 10) / 10 });
  }
  const label = f.split('/').pop().replace(/\.json$/, '');
  all[label] = { phases, flips };
  console.log(`\n== ${label} (phone, ${r.ua?.match(/Version\/[\d.]+/)?.[0] || '?'}) vh ${vh}`);
  console.log(['phase', 'sec', 'frames', 'rs', 'rsHeavy', 'nestedLayout', 'layout', 'layoutView', 'layoutHeavy', 'layoutViewHeavy', 'layoutViewHeavy10', 'paint', 'composite', 'schedStyle', 'invalidateLayout'].join('\t'));
  for (const [ph, c] of Object.entries(phases)) console.log([ph, c.sec, c.frames, c.rs, c.rsHeavy, c.nestedLayout, c.layout, c.layoutView, c.layoutHeavy, c.layoutViewHeavy, c.layoutViewHeavy10, c.paint, c.composite, c.schedStyle, c.invalidateLayout].join('\t'));
  for (const fl of flips) console.log(`  flip-RS y${fl.y} rs ${fl.rsMs} ms, nested Layout ${fl.nested} (view ${fl.nestedView}, >=${CUT}ms ${fl.nestedHeavy}, ${fl.nestedMs} ms)`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));

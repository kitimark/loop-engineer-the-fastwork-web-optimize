#!/usr/bin/env node
// g0.0m phone card, secondary reader (fix-reveal-paint, 2026-10-09; card: fixes/g0-0m/README.md "Phone check card"): the
// people card's REVEAL FRAME in every counted record, with its Timeline work. Descriptive, no verdict. Method as
// fix-scrollcb-g0's P-174 where50 read (scratch), made a reader:
//   FLICK    the flip = pb-lite's first `+is-visible` on section#people after the flick mark; the reveal frame = the first
//            frame [t, dt] with t > flip (its interval (t - dt, t] starts with the rendering update that ran the flip)
//   APPROACH no page logger on these records: the flip y = the median page scrollY at the flip over every FLICK record of
//            the block (both arms; the 0.72 threshold is geometry, the same in both builds); the reveal frame = the first
//            frame with scrollY >= that y (its stamp's scrollY is read after the gap the reveal made: P-174's records show
//            ... 588 (dt 16) -> 609 (dt 42) ... around a flip y of 601.5)
// Per reveal frame: dt, and from the record's Timeline (tl-*.json, Timeline ms = page ms + offsetMs) the ms of Paint,
// Composite, Layout and RecalculateStyles inside (t - dt, t]. g0.0m paints the card's layers before the reveal (Simulator:
// 1-3 frames earlier), so the 5 frames before the reveal frame are read too: their max dt and their Paint / Composite ms
// (pre5). GAIN primary of the card (lead ruling 1): R7 = the longest frame dt among the reveal frame and the 3 frames
// before and after it (frames k-3 .. k+3 of the record's frame list). Per arm and window: the values per run and the median.
//   node fixes/g0-0m/phone/g0m-reveal.mjs [runs dir, default out/g0mp/runs] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), JSON_OUT = args.includes('--json');
const dir = args.find((a) => !a.startsWith('--')) || 'out/g0mp/runs';
const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const TYPES = ['Paint', 'Composite', 'Layout', 'RecalculateStyles'];
const items = [];
for (const a of ['C', 'V']) for (let n = 1; n <= 6; n++) { const id = existsSync(join(dir, `g-E${a}${n}rf.json`)) ? `E${a}${n}r` : `E${a}${n}`; if (existsSync(join(dir, `g-${id}f.json`))) items.push([a, id]); }

function work(tl, a, b) {
  const w = Object.fromEntries(TYPES.map((t) => [t, 0])); if (!tl) return null;
  const walk = (r) => { const s = r.startTime * 1000 - tl.offsetMs, e = (r.endTime ?? r.startTime) * 1000 - tl.offsetMs;
    if (TYPES.includes(r.type) && e > a && s < b) w[r.type] += Math.min(e, b) - Math.max(s, a); (r.children || []).forEach(walk); };
  tl.recs.forEach(walk); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, r1(v)]));
}
// the 5 frames before frames[k]: max dt, and Timeline Paint / Composite ms from the first one's start to frames[k]'s start
const r7 = (frames, k) => { const W = frames.slice(Math.max(0, k - 3), k + 4); return W.length ? Math.max(...W.map((f) => f[1])) : null; };
function pre5(frames, k, tl) {
  const P = frames.slice(Math.max(0, k - 5), k); if (!P.length) return null;
  const w = work(tl, P[0][0] - P[0][1], frames[k][0] - frames[k][1]);
  return { n: P.length, maxDt: Math.max(...P.map((f) => f[1])), Paint: w?.Paint ?? null, Composite: w?.Composite ?? null };
}
const segOf = (g) => g?.run?.segments?.[0];
const injOf = (g) => { const v = g?.run?.inject?.find((x) => x.seg === 0)?.value; return typeof v === 'string' ? JSON.parse(v) : v; };
// pass 1: FLICK flips (time, scrollY)
const flipY = [];
const rows = [];
for (const [arm, id] of items) {
  const g = load(join(dir, `g-${id}f.json`)), s = segOf(g), inj = injOf(g);
  const mk = Object.fromEntries((s?.marks || []).map(([t, m]) => [m, t]));
  const flip = inj?.m?.find(([t, nm, at, d]) => t >= mk.flick - 50 && /section#people/.test(nm) && at === 'class' && /\+is-visible/.test(d))?.[0];
  if (flip == null) { rows.push({ arm, id, win: 'FLICK', err: 'no flip in the page log' }); continue; }
  const yAt = [...(inj.f || [])].reverse().find(([t]) => t <= flip)?.[1]; if (yAt != null) flipY.push(yAt);
  const all = s.frames || [], k = all.findIndex(([t]) => t > flip), fr = k >= 0 ? all[k] : null;
  const tl = load(join(dir, `tl-${id}f.json`));
  rows.push({ arm, id, win: 'FLICK', flipY: yAt, t: fr && r1(fr[0] - flip), dt: fr?.[1], y: fr?.[2], w: fr ? work(tl, fr[0] - fr[1], fr[0]) : null, pre5: k >= 0 ? pre5(all, k, tl) : null, r7: k >= 0 ? r7(all, k) : null });
}
const Y = med(flipY);
for (const [arm, id] of items) {
  const g = load(join(dir, `g-${id}a.json`)), s = segOf(g); if (!s) { rows.push({ arm, id, win: 'APPROACH', err: 'no record' }); continue; }
  const mk = Object.fromEntries((s.marks || []).map(([t, m]) => [m, t]));
  const fr = (s.frames || []).filter(([t]) => t > mk.approach && t <= mk['approach-end']);
  const i = Y == null ? -1 : fr.findIndex(([, , y]) => y >= Y);
  const f = i >= 0 ? fr[i] : null;
  const tl = load(join(dir, `tl-${id}a.json`));
  rows.push({ arm, id, win: 'APPROACH', flipY: Y, dt: f?.[1], y: f?.[2], w: f ? work(tl, f[0] - f[1], f[0]) : null, pre5: i >= 0 ? pre5(fr, i, tl) : null, r7: i >= 0 ? r7(fr, i) : null });
}
const sum = {};
for (const win of ['FLICK', 'APPROACH']) for (const arm of ['C', 'V']) {
  const R = rows.filter((r) => r.win === win && r.arm === arm && !r.err);
  sum[`${win} ${arm}`] = { n: R.length, r7: med(R.map((r) => r.r7)), r7all: R.map((r) => r.r7), dt: med(R.map((r) => r.dt)), Paint: med(R.map((r) => r.w?.Paint)), Composite: med(R.map((r) => r.w?.Composite)), Layout: med(R.map((r) => r.w?.Layout)), RecalculateStyles: med(R.map((r) => r.w?.RecalculateStyles)),
    pre5MaxDt: med(R.map((r) => r.pre5?.maxDt)), pre5Paint: med(R.map((r) => r.pre5?.Paint)), pre5Composite: med(R.map((r) => r.pre5?.Composite)) };
}
if (JSON_OUT) { console.log(JSON.stringify({ tool: 'fixes/g0-0m/phone/g0m-reveal.mjs', dir, flipYMedian: Y, rows, sum }, null, 1)); process.exit(0); }
console.log(`reveal frames in ${dir} (flip y median over the FLICK records: ${Y})`);
for (const r of rows) console.log(r.err ? `${r.win.padEnd(8)} ${r.id.padEnd(5)} ${r.err}` : `${r.win.padEnd(8)} ${r.id.padEnd(5)} R7 ${r.r7} | dt ${r.dt} y ${r.y}${r.t != null ? ` (+${r.t} ms after the flip)` : ''}  paint ${r.w?.Paint} composite ${r.w?.Composite} layout ${r.w?.Layout} style ${r.w?.RecalculateStyles} | 5 before: max dt ${r.pre5?.maxDt} paint ${r.pre5?.Paint} composite ${r.pre5?.Composite}`);
for (const [k, v] of Object.entries(sum)) console.log(`median ${k.padEnd(10)} n ${v.n}  R7 ${v.r7} ${JSON.stringify(v.r7all)} | dt ${v.dt}  paint ${v.Paint}  composite ${v.Composite}  layout ${v.Layout}  style ${v.RecalculateStyles} | 5 before: max dt ${v.pre5MaxDt} paint ${v.pre5Paint} composite ${v.pre5Composite}`);

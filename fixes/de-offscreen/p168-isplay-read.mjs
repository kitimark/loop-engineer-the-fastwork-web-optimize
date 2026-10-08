#!/usr/bin/env node
// de-offscreen step 3 (lead): read P-168's phone W runs at window B (fix-g0-box's data, read only) and answer, per run:
//   (1) where the glint `.is-active` flips land relative to the `+is-play` frame (frame index, ms, y);
//   (2) the Composite records in the `+is-play` frame and the Paint records nested in them (count, ms, painted area,
//       the biggest boxes), against the same numbers for the glint frame and the run's other scroll frames;
//   (3) the layer-tree size, if the run recorded one.
// Frames: iphone-run's rAF stamps (fields t, dt, yEnd); the `+is-play` frame = p166-wread's spotFrame (the frame of the
// `+is-play` class crossing). A frame covers (t - dt, t]. Timeline records are mapped to the same clock with tl.offsetMs
// (p168-wread's convention). Paint clip quads are in page coordinates (CSS px); area in CSS px².
//   node fixes/de-offscreen/p168-isplay-read.mjs [runs dir] [--json <out>]
// Default dir: fix-g0-box's out/p168ph/runs. Pure file reads, no device, no lock.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--json')
  || '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-afabe5bf71361298f/out/p168ph/runs';
const ji = args.indexOf('--json');
const r1 = (x) => Math.round(x * 10) / 10;
const ARM = { 0: 'v0', e: 'g0.0f', k: 'g0.0g' };
const it_0 = (F) => F.indexOf('t');

function paintsIn(rec, off) {
  const out = []; const walk = (r) => { if (r.type === 'Paint') { const q = r.data?.clip || []; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    out.push({ ms: (r.endTime - r.startTime) * 1000, x: Math.min(...xs), y: Math.min(...ys), w, h, area: w * h }); }
    for (const c of r.children || []) walk(c); };
  walk(rec); return out;
}
/** Composite records (with nested Paints) whose span overlaps (lo, hi] */
function compositesIn(tl, lo, hi) {
  const out = []; const walk = (r) => { if (r.type === 'Composite') { const a = r.startTime * 1000 - tl.offsetMs, b = (r.endTime ?? r.startTime) * 1000 - tl.offsetMs;
    if (b > lo && a < hi) out.push({ a, b, ms: b - a, paints: paintsIn(r, tl.offsetMs) }); }
    for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r); return out;
}
function frameStats(tl, f, F) {
  const t = f[F.indexOf('t')], dt = f[F.indexOf('dt')];
  const cs = compositesIn(tl, t - dt, t); const ps = cs.flatMap((c) => c.paints);
  return { t, dt, y: Math.round(f[F.indexOf('yEnd')]), composites: cs.length, compMs: r1(cs.reduce((s, c) => s + c.ms, 0)),
    paints: ps.length, paintMs: r1(ps.reduce((s, p) => s + p.ms, 0)), paintArea: Math.round(ps.reduce((s, p) => s + p.area, 0)),
    big: ps.sort((a, b) => b.area - a.area).slice(0, 4).map((p) => `${Math.round(p.w)}x${Math.round(p.h)}@y${Math.round(p.y)} ${r1(p.ms)}ms`) };
}

const res = { dir: 'fix-g0-box out/p168ph/runs (read only)', runs: {} };
for (const arm of ['0', 'e', 'k']) for (const n of [1, 2, 3]) {
  let it = `B${arm}${n}`; if (existsSync(join(DIR, `w-${it}x.json`))) it += 'x';
  const wf = join(DIR, `w-${it}.json`), tf = join(DIR, `tl-${it}.json`);
  if (!existsSync(wf) || !existsSync(tf)) { console.log(`${it}: missing`); continue; }
  const j = JSON.parse(readFileSync(wf, 'utf8')), tl = JSON.parse(readFileSync(tf, 'utf8')); const F = j.fields, fr = j.frames;
  const cr = j.crossings || [];
  const play = cr.find((x) => x.kind === 'class' && x.value === '+is-play' && /platform-secure/.test(x.id));
  const glint = cr.filter((x) => x.kind === 'class' && x.value === '+is-active' && /glint/.test(x.id));
  const hl = cr.filter((x) => x.kind === 'class' && x.value === '+is-active' && /highlight/.test(x.id));
  if (!play) { console.log(`${it}: no +is-play crossing`); continue; }
  const pf = frameStats(tl, fr[play.frame], F);
  const gf = glint.length ? frameStats(tl, fr[glint[0].frame], F) : null;
  const hf = !glint.length && hl.length ? frameStats(tl, fr[hl[0].frame], F) : null;
  // the other scroll-phase frames, for scale: median paints / paint ms / Composite ms per frame
  const m = j.marks; const it_ = F.indexOf('t');
  const others = fr.map((f, i) => [f, i]).filter(([f, i]) => f[it_] >= m.scroll[0] && f[it_] < m.hold[1] && i !== play.frame).map(([f]) => frameStats(tl, f, F));
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  // where the class flip itself happened: the MutationObserver record's y (scrollY when the flip was seen) vs the
  // frame's yEnd (which includes the scroll that happened during the long frame), and the scroll speed just before
  const iy = F.indexOf('yEnd'), pv = fr[play.frame - 1], p10 = fr[play.frame - 11];
  const flipAt = { mutationY: play.y, yFrame: play.yFrame, frameYEnd: pf.y, prevDt: pv[F.indexOf('dt')],
    pxPerMs: Math.round(((pv[iy] - p10[iy]) / (pv[it_0(F)] - p10[it_0(F)])) * 100) / 100 };
  const row = { arm: ARM[arm], flipAt, play: { frame: play.frame, ...pf }, playCrossingsInFrame: cr.filter((x) => x.frame === play.frame).map((x) => `${x.id} ${x.value}`),
    glint: glint.map((g) => ({ frame: g.frame, framesAfterPlay: g.frame - play.frame, msAfterPlay: Math.round(fr[g.frame][it_] - fr[play.frame][it_]), y: g.y })),
    glintFrame: gf, highlight: hl.map((g) => ({ frame: g.frame, framesAfterPlay: g.frame - play.frame, msAfterPlay: Math.round(fr[g.frame][it_] - fr[play.frame][it_]) })), highlightFrame: hf,
    othersMedian: { n: others.length, dt: med(others.map((o) => o.dt)), compMs: med(others.map((o) => o.compMs)), paints: med(others.map((o) => o.paints)), paintMs: med(others.map((o) => o.paintMs)), paintArea: med(others.map((o) => o.paintArea)) },
    layerTree: j.pre?.layers ?? j.post?.layers ?? null };
  res.runs[it] = row;
  const g = row.glint[0] || row.highlight[0];
  console.log(`${it} ${row.arm.padEnd(6)} flip seen at y ${flipAt.mutationY} (frame ${flipAt.yFrame.join('-')}, prev dt ${flipAt.prevDt}, ${flipAt.pxPerMs} px/ms before) |`);
  console.log(`   +is-play f${play.frame} y${pf.y} dt ${pf.dt} | Composite ${pf.composites} rec ${pf.compMs} ms, Paint ${pf.paints} rec ${pf.paintMs} ms, area ${pf.paintArea} px² [${pf.big.join('; ')}]`);
  console.log(`   ${glint.length ? 'glint' : 'highlight'} +is-active: ${g ? `${g.framesAfterPlay} frames / ${g.msAfterPlay} ms after the +is-play frame` : 'none'}${gf || hf ? ` | that frame dt ${(gf || hf).dt}, Composite ${(gf || hf).compMs} ms, Paint ${(gf || hf).paints} rec ${(gf || hf).paintMs} ms, area ${(gf || hf).paintArea}` : ''}`);
  console.log(`   other move frames (n ${others.length}) median: dt ${row.othersMedian.dt}, Composite ${row.othersMedian.compMs} ms, Paint ${row.othersMedian.paints} rec ${row.othersMedian.paintMs} ms, area ${row.othersMedian.paintArea}; crossings in the +is-play frame: ${row.playCrossingsInFrame.join(', ')}`);
}
if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));

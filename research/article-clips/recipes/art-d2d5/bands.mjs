// art-d2d5 bands.mjs (2026-10-11): where the slow frames of each -ar-herocatch4- run sit, with the code-geometry split
// of art-d5/bands.mjs and src-12 (research/design-engineering/hero.md section 2), unchanged: the title's "o" windows first
// (0.92 s after it starts to open, 1.42 s after the title crosses y 242, or after it leaves), then heroOnly = y < 600 and
// moving or within 1 s of moving (the hero cards leaving, People card not yet shown), overlap = y 600-855 (People card
// over the hero), rest = everything else. Two windows per run, in page time: whole = (mark finger, mark end] (Fig. 14's
// window) and clip = 11.5 s from 0.3 s before the end of the first scroll-moving frame (the clips' window, align.py).
// usage (repo root): node research/article-clips/recipes/art-d2d5/bands.mjs [out/wc/runs] [--json out/d2d5/bands.json]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const dir = args.find((a, i) => !a.startsWith('--') && i !== ji + 1) || 'out/wc/runs';
const Y_IN = 242, Y_OUT = 970, Y_FLIP = 600, Y_HERO = 855;
function classify(seg) {
  let inView = false, enterT = null, expandedAt = null, closeAt = null, prevY = seg.frames[0][2], lastMove = -1e9;
  return seg.frames.map((fr) => {
    const [t, , y] = fr;
    const iv = y >= Y_IN && y <= Y_OUT;
    if (iv && !inView) { enterT = t; expandedAt = null; }
    if (!iv && inView) { if (expandedAt != null || (enterT != null && t - enterT >= 1300)) closeAt = t; enterT = null; expandedAt = null; }
    inView = iv;
    if (inView && enterT != null && expandedAt == null && t - enterT >= 1420) expandedAt = enterT + 1420;
    if (y !== prevY) lastMove = t;
    let c;
    if (expandedAt != null && t > expandedAt && t <= expandedAt + 920) c = 'o';
    else if (closeAt != null && t > closeAt && t <= closeAt + 920) c = 'o';
    else if (y < Y_FLIP && y > 0 && t - lastMove < 1000) c = 'heroOnly';
    else if (y >= Y_FLIP && y < Y_HERO) c = 'overlap';
    else c = 'rest';
    prevY = y;
    return [fr, c];
  });
}
const stat = (a) => ({ n: a.length, gt34: a.filter((q) => q[1] > 34).length, gt50: a.filter((q) => q[1] > 50).length,
  gt100: a.filter((q) => q[1] > 100).length, max: a.length ? Math.round(Math.max(...a.map((q) => q[1]))) : null });
const out = [];
for (const f of fs.readdirSync(dir).filter((x) => /-ar-herocatch4-(orig|aw1|v6)\.json$/.test(x)).sort()) {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const seg = rec.run.segments.find((s) => (s.marks || []).length) || rec.run.segments[0];
  const mk = (n) => seg.marks.find((m) => m[1] === n)?.[0];
  const a = mk('finger'), b = mk('end');
  const after = seg.frames.filter((x) => x[0] > a);
  const mv = after.find((x) => x[2] !== after[0][2]);
  const c0 = mv[0] - 300, c1 = c0 + 11500;
  const cl = classify(seg);
  const row = { run: f.replace(/\.json$/, '') };
  for (const [w, lo, hi] of [['whole', a, b], ['clip', c0, c1]]) {
    const inW = cl.filter(([fr]) => fr[0] > lo && fr[0] <= hi);
    row[w] = { all: stat(inW.map(([fr]) => fr)) };
    for (const k of ['heroOnly', 'overlap', 'o', 'rest']) row[w][k] = stat(inW.filter(([, c]) => c === k).map(([fr]) => fr));
  }
  out.push(row);
  for (const w of ['whole', 'clip']) {
    const r = row[w];
    console.log(`${row.run.padEnd(38)} ${w.padEnd(5)} all ${r.all.n}/${r.all.gt34}/${r.all.gt50}/${r.all.max}  ` +
      ['heroOnly', 'overlap', 'o', 'rest'].map((k) => `${k} ${r[k].n}/${r[k].gt34}/${r[k].gt50}/${r[k].max ?? '-'}`).join('  '));
  }
}
console.log('(cells: frames / >34 / >50 / longest ms)');
if (ji >= 0) fs.writeFileSync(args[ji + 1], JSON.stringify(out, null, 1));

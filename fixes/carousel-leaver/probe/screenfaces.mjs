// carousel-leaver P-090 on-screen read-out (describes only): which interpolation quality is on screen during a natural
// slide sequence? Reads simquiet.mjs output (burst crops burst/<arm>-<nn>.png, quiet crops scrc-quiet-<arm>.png).
// node screenfaces.mjs <simquiet dir> <burst arm>:<ref arm>[,<ref arm>...] ...    e.g. base:base,Bs S:S
// After the slide that follows the quiet shot, quiet faces 1..3 sit at slots 0..2 (the slot pitch is 24 CSS px = 72
// device px, a whole number, so the sub-pixel phase is the same). For each burst shot and slot j = 0..2 the face's inner
// disc (centre carLeft + 24 j + 16, carTop + 16, radius 14 CSS px, i.e. inside the 1 px border and its antialiasing,
// within the slot's own 24 px strip so no neighbour shows) is compared with slot j + 1's disc in each reference arm's
// quiet crop: n8 (pixels with a channel difference > 8) and max. A shot "matches" a reference when n8 = 0 on all three
// slots. Each shot's time is its simctl start..exit window relative to the last slide start before the window's middle
// (in-page Date.now(), the same clock).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels } from './png.mjs';
const [dir, ...specs] = process.argv.slice(2);
const res = JSON.parse(readFileSync(join(dir, 'simquiet.json'), 'utf8'));
const load = (f) => pngPixels(readFileSync(join(dir, f)));
for (const spec of specs) {
  const [arm, refsArg] = spec.split(':'); const refs = refsArg.split(',');
  const R = res.arms[arm]; if (!R || R.void || !R.burst) { console.log(`${arm}: no burst (${R?.void || 'missing'})`); continue; }
  const g = R.geo2, rect = R.rect, k = 3;
  const disc = (j) => { const out = [];
    for (let y = 0; y < rect.height * k; y++) for (let x = 0; x < rect.width * k; x++) {
      const cx = rect.x + (x + 0.5) / k, cy = rect.y + (y + 0.5) / k;
      if (cx < g.carLeft + 24 * j || cx >= g.carLeft + 24 * j + 24) continue;
      if (Math.hypot(cx - (g.carLeft + 24 * j + 16), cy - (g.carTop + 16)) <= 14) out.push([x, y]); }
    return out; };
  const D = [0, 1, 2].map(disc);
  const REF = Object.fromEntries(refs.map((r) => [r, load(`scrc-quiet-${r}.png`)]));
  const cmpDisc = (A, B, j) => { let n8 = 0, max = 0;
    for (const [x, y] of D[j]) { const ia = (y * A.w + x) * A.bpp, ib = (y * B.w + x + 72) * B.bpp; let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[ia + c] - B.px[ib + c])); if (d > 8) n8++; if (d > max) max = d; }
    return { n8, max }; };
  const starts = R.slides.filter((s) => s.on).map((s) => s.t), ends = R.slides.filter((s) => !s.on).map((s) => s.t);
  console.log(`${arm}: slides (ms from burst start) ${R.slides.map((s) => `${s.on ? 'start' : 'end'} ${s.t - R.burstStart}`).join(', ')}; disc px per slot ${D.map((d) => d.length).join('/')}`);
  const rows = [];
  for (const b of R.burst) {
    if (b.code) { rows.push({ i: b.i, failed: true }); continue; }
    const mid = (b.t0 + b.t1) / 2, s = starts.filter((t) => t <= mid).pop();
    const P = load(`burst/${arm}-${String(b.i).padStart(2, '0')}.png`);
    const per = {}; for (const r of refs) per[r] = [0, 1, 2].map((j) => cmpDisc(P, REF[r], j));
    const match = refs.filter((r) => per[r].every((x) => x.n8 === 0));
    const slideNo = s === undefined ? null : starts.indexOf(s) + 1;
    const row = { i: b.i, slide: slideNo, from: s === undefined ? null : b.t0 - s, to: s === undefined ? null : b.t1 - s, endedBy: s === undefined ? null : (ends.find((e) => e > s) ?? null) - s, match, per };
    rows.push(row);
    console.log(`  #${String(b.i).padStart(2, '0')} slide ${slideNo ?? '-'} t ${row.from ?? '?'}..${row.to ?? '?'} ms (slide ended at ${row.endedBy ?? '?'}) | ${refs.map((r) => `${r}: ${per[r].map((x) => `${x.n8}/${x.max}`).join(' ')}`).join(' | ')} | matches ${match.join(',') || 'none'}`);
  }
}

// carousel-leaver scorer for P-086 (1) and (3): rAF series of the avatar carousel, aligned by slide start.
// node score.mjs <ref.json> <other.json> [--dt 2]
// A series file is the JSON array the clp.mjs / simclp.mjs sampler writes: [{t, cls, cx, imgs: [[left, width, opacity,
// transform, translate, clipPath, className, src, width, marginRight, borderLeftWidth, animName, playState, loaded]]}].
// A slide starts at the first frame where the carousel slides (baseline: an img.is-exit; st5 builds: .is-sliding) and
// ends at the first frame where it no longer does (that frame, the swap frame, is included as n = last).
// Roles by slot: 0 leaver, 1-3 followers, 4 entering face (the baseline's 4-img rest frames have no 4).
// Per frame pair (frame n of slide k in both files, |t_ref - t_other| <= dt ms measured from each slide's start):
// A frame where one file already shows the swap (rest) and the other still slides is not compared; it is listed in
// stateMismatch (the rotator's 220 ms timer and the 220 ms animation race, so the swap lands on frame 13 or 14).
//   xr = rect left - carousel left (CSS px), w = rect width, o = opacity, s = transform scale (1 if none).
// Output: max |delta| per role and quantity over all matched frames, the frame of the max, the end offset of the
// followers (xr of slot 1 in the last sliding frame minus its rest xr) and the snap at the swap frame, per file.
import { readFileSync } from 'node:fs';
const [fa, fb] = process.argv.slice(2, 4);
const DT = Number((process.argv.indexOf('--dt') > 0 && process.argv[process.argv.indexOf('--dt') + 1]) || 2);
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const sliding = (fr) => /\bis-sliding\b/.test(fr.cls) || fr.imgs.some((i) => /\bis-exit\b/.test(i[6]));
const scale = (tr) => { if (!tr || tr === 'none') return 1; const m = /matrix\(([^,]+)/.exec(tr); return m ? +m[1] : NaN; };
function slides(S) {
  const out = []; let cur = null;
  S.forEach((fr, i) => { const on = sliding(fr);
    if (on && !cur) cur = { a: i, frames: [] };
    if (cur) cur.frames.push(fr);
    if (!on && cur) { out.push(cur); cur = null; } });
  return out.filter((s) => s.a > 0 && !sliding(s.frames[s.frames.length - 1]) ? true : false);
}
const q = (fr, k, cx) => { const i = fr.imgs[k]; if (!i) return null; return { xr: i[0] - fr.cx, w: i[1], o: i[2], s: scale(i[3]) }; };
function endInfo(sl, S) {
  const last = sl.frames[sl.frames.length - 2], swap = sl.frames[sl.frames.length - 1], rest = S[sl.a - 1];
  const x = (fr, k) => (fr && fr.imgs[k] ? +(fr.imgs[k][0] - fr.cx).toFixed(3) : null);
  return { restX1: x(rest, 1), lastX1: x(last, 1), swapX0: x(swap, 0), endOffset: last && rest ? +(x(last, 1) - x(rest, 1)).toFixed(3) : null, snap: last && swap ? +(x(swap, 0) - x(last, 1)).toFixed(3) : null, nFrames: sl.frames.length };
}
const A = load(fa), B = load(fb);
const sa = slides(A), sb = slides(B);
const n = Math.min(sa.length, sb.length);
const roles = ['L', 'F1', 'F2', 'F3', 'N'];
const max = {}; let matched = 0, skipped = 0; const stateMismatch = [];
for (let k = 0; k < n; k++) {
  const x = sa[k], y = sb[k]; const ta = x.frames[0].t, tb = y.frames[0].t;
  for (let j = 0; j < Math.min(x.frames.length, y.frames.length); j++) {
    const fa_ = x.frames[j], fb_ = y.frames[j];
    if (Math.abs((fa_.t - ta) - (fb_.t - tb)) > DT) { skipped++; continue; }
    if (sliding(fa_) !== sliding(fb_)) { stateMismatch.push({ slide: k, frame: j, t: +(fa_.t - ta).toFixed(1) }); continue; }
    matched++;
    const isSwap = j === x.frames.length - 1 || j === y.frames.length - 1;
    for (let r = 0; r < 5; r++) {
      const p = q(fa_, r), o = q(fb_, r);
      if (!p || !o) continue;
      if (isSwap && r === 4) continue; // the rest frame's 5th slot is the waiting st5-next (invisible) vs no 5th img
      for (const key of ['xr', 'w', 'o', 's']) {
        const d = Math.abs(p[key] - o[key]); const id = `${roles[r]}.${key}`;
        if (!max[id] || d > max[id].d) max[id] = { d: +d.toFixed(4), slide: k, frame: j, t: +(fa_.t - ta).toFixed(1), ref: +(+p[key]).toFixed(4), other: +(+o[key]).toFixed(4) };
      }
    }
  }
}
const ends = { ref: sa.slice(0, n).map((s) => endInfo(s, A)), other: sb.slice(0, n).map((s) => endInfo(s, B)) };
console.log(JSON.stringify({ ref: fa.split('/').pop(), other: fb.split('/').pop(), slidesRef: sa.length, slidesOther: sb.length, compared: n, matched, skipped, stateMismatch, dt: DT, max, ends }, null, 1));

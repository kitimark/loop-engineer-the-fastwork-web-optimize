#!/usr/bin/env node
// fig2-frame-rhythms/check.mjs: numbers-only checks of the Fig. 2 frames, from raw RGB24 frames on stdin (README.md).
//
//   ffmpeg -v error -i <frames or mp4> -f rawvideo -pix_fmt rgb24 - | node check.mjs --schedule <schedule.json> --frames M [--exact]
//
// Per frame and lane it finds the dot's x as the centroid of its colour weight in the lane's band (worst and typical
// lanes: (r - g) / 130 of --late #c9472a; AFTER lane: (b - r) / 162 of --signal #2743c9; on white the weight is the dot's
// coverage, so anti-aliased edges count by their share) and turns it into canvas units (the page's 1200 px).
// Frame k of the input is loop frame k % n. Prints:
//   POS   max |measured - expected| per lane (canvas px and device px), expected = 80 + thumb(t_lane) * 1040;
//   HOLD  for every page frame of the worst and typical lanes that the 60 Hz schedule shows for 2+ video frames: the
//         dot stays put (max drift inside the hold, device px), and the run it actually holds in the frames (the
//         frames from the hold's start while the centroid stays within tol) against the schedule's frame count;
//         all page frames over 34 ms are listed with ms -> frames;
//   SEAM  frame n (the next loop's first frame) against frame 0, over the whole picture: byte-equal for PNG input; for
//         a video no worse than every other frame against its copy in the next loop; and the AFTER lane's step
//         across the seam against the steps next to it;
//   EXACT (--exact, lossless PNG input) the lane bands are byte-identical inside every hold and change at every update.
// Exit 1 when a check fails.
import { readFileSync } from 'node:fs';
import { exitOnHelp } from '../../../../tools/lib/help.mjs';

exitOnHelp(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const S = JSON.parse(readFileSync(arg('--schedule'), 'utf8'));
const M = Number(arg('--frames'));
const EXACT = process.argv.includes('--exact');
const TOL = Number(arg('--tol', EXACT ? 1e-9 : 0.25));   // device px
const { w: W, h: H } = S.sizePx, n = S.n, cp = S.canvasPx;
const FB = W * H * 3;
const raw = readFileSync(0);
if (raw.length !== FB * M) { console.error(`check: got ${raw.length} bytes, want ${M} frames of ${W}x${H} rgb24 (${FB * M})`); process.exit(2); }
const frame = (k) => raw.subarray(k * FB, (k + 1) * FB);

const LANES = ['worst', 'typical', 'after'];
const band = (lane) => {
  const y = S.lanesY[lane], r = S.dotR + 4;
  return { y0: Math.floor(cp.y + (y - r) * cp.sy), y1: Math.ceil(cp.y + (y + r) * cp.sy), x0: Math.floor(cp.x + 40 * cp.sx), x1: Math.ceil(cp.x + 1160 * cp.sx) };
};
const B = Object.fromEntries(LANES.map((l) => [l, band(l)]));
function centroid(buf, lane) {
  const b = B[lane]; let sw = 0, sx = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const o = (y * W + x) * 3, r = buf[o], g = buf[o + 1], bl = buf[o + 2];
    let wgt = lane === 'after' ? (bl - r) / 162 : (r - g) / 130;
    if (wgt <= 0.1) continue;   // the grey lane line (211,221,216) has b - r = 5, a weight of 0.03: it must count 0
    if (wgt > 1) wgt = 1;
    sw += wgt; sx += wgt * (x + 0.5);
  }
  return sw ? sx / sw : NaN;   // device px
}
const bandBytes = (buf, lane) => { const b = B[lane], parts = []; for (let y = b.y0; y < b.y1; y++) parts.push(buf.subarray((y * W + b.x0) * 3, (y * W + b.x1) * 3)); return Buffer.concat(parts); };
const toCanvas = (X) => (X - cp.x) / cp.sx;

let fail = 0;
const X = {}; for (const l of LANES) X[l] = [];
for (let k = 0; k < M; k++) { const f = frame(k); for (const l of LANES) X[l].push(centroid(f, l)); }

// POS
for (const l of LANES) {
  let maxC = 0, at = -1;
  for (let k = 0; k < M; k++) { const e = S.frames[k % n][l].x, d = Math.abs(toCanvas(X[l][k]) - e); if (!(d <= maxC)) { maxC = d; at = k; } }
  const dev = maxC * cp.sx, ok = dev <= (EXACT ? 0.5 : 0.75);
  if (!ok) fail++;
  console.log(`POS   ${l.padEnd(7)} max |measured - expected| = ${maxC.toFixed(3)} canvas px (${dev.toFixed(2)} device px) at frame ${at}  ${ok ? 'OK' : 'FAIL'}`);
}

// HOLD
for (const l of ['worst', 'typical']) {
  const lane = S.lanes[l];
  let holdsN = 0, drift = 0, runMiss = [];
  for (let loop = 0; loop * n < M; loop++) {
    for (const h of lane.holds) {
      const a = loop * n + h.f, z = a + h.frames;   // [a, z) should show one picture
      if (z > M) continue;
      if (h.frames >= 2) {
        holdsN++;
        for (let k = a + 1; k < z; k++) drift = Math.max(drift, Math.abs(X[l][k] - X[l][a]));
      }
      let run = 1; while (a + run < M && Math.abs(X[l][a + run] - X[l][a]) <= TOL) run++;
      if (run !== h.frames && loop === 0) {
        const next = S.frames[(h.f + h.frames) % n]?.[l].x, step = Math.abs(next - S.frames[h.f][l].x) * cp.sx;
        runMiss.push(`f${h.f}: ${h.frames} -> ${run} (next step ${step.toFixed(2)} device px${step <= TOL * 2 ? ', below tol' : ''})`);
        if (step > TOL * 2) fail++;
      }
    }
  }
  const ok = drift <= TOL;
  if (!ok) fail++;
  console.log(`HOLD  ${l.padEnd(7)} ${lane.holds.length} pictures per loop, ${holdsN} held 2+ frames over the input: max drift inside a hold ${drift.toFixed(3)} device px (tol ${TOL})  ${ok ? 'OK' : 'FAIL'}`);
  if (runMiss.length) console.log(`      runs that differ from the schedule (loop 1): ${runMiss.join('; ')}`);
  const slow = lane.gapHolds.filter((g) => g.gap != null && g.gap > 34);
  console.log(`      page frames > 34 ms (ms -> video frames shown): ${slow.map((g) => `${g.gap}->${g.frames}`).join(', ')}`);
}

// EXACT: band bytes equal inside a hold, different at an update
if (EXACT) {
  for (const l of ['worst', 'typical']) {
    let same = 0, diff = 0, bad = [];
    for (let k = 1; k < Math.min(M, n); k++) {
      const eq = bandBytes(frame(k), l).equals(bandBytes(frame(k - 1), l));
      const upd = S.lanes[l].updates.includes(k);
      if (!upd && eq) same++; else if (upd && !eq) diff++; else bad.push(`f${k} ${upd ? 'update but identical' : 'hold but changed'}`);
    }
    const ok = bad.every((b) => /identical/.test(b));   // an update to a sub-pixel-equal position may draw the same bytes
    if (!ok) fail++;
    console.log(`EXACT ${l.padEnd(7)} identical band in ${same} held frames, changed at ${diff} updates${bad.length ? '; ' + bad.join(', ') : ''}  ${ok ? 'OK' : 'FAIL'}`);
  }
}

// SEAM
const diff = (i, j) => { const a = frame(i), b = frame(j); let maxd = 0, sum = 0, big = 0;
  for (let p = 0; p < FB; p++) { const d = Math.abs(a[p] - b[p]); sum += d; if (d > maxd) maxd = d; if (d > 16) big++; }
  return { maxd, mean: sum / FB, big }; };
const fmt = (d) => `max channel diff ${d.maxd}, mean ${d.mean.toFixed(3)}, ${d.big} bytes off by > 16`;
if (M > n) {
  const s = diff(0, n);
  const steps = [n - 2, n - 1, n, n + 1].filter((k) => k < M).map((k) => (X.after[k] - X.after[k - 1]).toFixed(2));
  let ok;
  if (EXACT) { ok = s.maxd === 0; console.log(`SEAM  frame ${n} vs frame 0: ${fmt(s)}  ${ok ? 'OK' : 'FAIL'}`); }
  else {
    // lossy input: the same picture at another place in the stream is never byte-equal (other reference frames), so
    // the seam frame is judged against the same comparison for every other frame of loop 1 vs loop 2
    let ref = { maxd: 0, mean: 0, big: 0 };
    for (let k = 1; k < n && k + n < M; k++) { const d = diff(k, k + n); ref = { maxd: Math.max(ref.maxd, d.maxd), mean: Math.max(ref.mean, d.mean), big: Math.max(ref.big, d.big) }; }
    ok = s.mean <= Math.max(ref.mean, 0.5) && s.maxd <= Math.max(ref.maxd, 32);
    console.log(`SEAM  frame ${n} vs frame 0: ${fmt(s)}; worst of frames 1..${n - 1} vs their loop-2 copies: ${fmt(ref)}  ${ok ? 'OK' : 'FAIL'}`);
  }
  if (!ok) fail++;
  console.log(`      AFTER lane steps (device px) into frames ${n - 2}..${n + 1}: ${steps.join(', ')}`);
}
console.log(fail ? `CHECK FAIL (${fail})` : 'CHECK OK');
process.exit(fail ? 1 : 0);

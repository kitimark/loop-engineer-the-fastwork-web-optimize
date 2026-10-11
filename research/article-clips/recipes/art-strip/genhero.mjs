// art-hero-worst: filter scripts for hero-worst-cards (3x and real speed, 60 fps) + window stats. Numbers only.
// art-strip (T-170 #191): + frame-time strip (strips.py, inputs 2/3) under each side and a white playhead over it,
// overlaid on each side's own clock before the 3x slow-down. Writes fc-3x.txt, fc-60.txt, windows-hero.json.
import fs from 'node:fs';
const A0 = 39.05875, B0 = 99.48928, DUR = 2.8; // first .mov frame of each window (frames.json PTS - first PTS)
const L = { A: JSON.parse(fs.readFileSync('orig.json')), B: JSON.parse(fs.readFileSync('g0l2.json')) };
const T0 = { A: A0, B: B0 };
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const stats = {};
const SH = 96, PW = 3, D = DUR.toFixed(6), HERE = new URL('.', import.meta.url).pathname;
const RR = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/';
fs.writeFileSync('windows-hero.json', JSON.stringify([
  { id: 'hero-worst-A', mov: RR + '20261009T134136Z-wc-hero-orig.mov', ss: 39.05, mode: 'grid', a: 0, n: Math.round(DUR * 60), W: 645, SH, pw: PW },
  { id: 'hero-worst-B', mov: RR + '20261009T132633Z-wc-hero-g0l.mov', ss: 99.48, mode: 'grid', a: 0, n: Math.round(DUR * 60), W: 645, SH, pw: PW }], null, 1));
const longs = {};
for (const s of ['A', 'B']) {
  const fr = L[s].filter(([t]) => t > T0[s] && t <= T0[s] + DUR);
  const d = fr.map((x) => x[1]);
  stats[s] = { n: d.length, gt34: d.filter((x) => x > 34).length, gt50: d.filter((x) => x > 50).length, k5: d.filter((x) => x >= 37.5).length, k7: d.filter((x) => x >= 54.17).length, max: Math.max(...d) };
  // long frame stall interval [t-dt, t] in clip seconds; ends after the window start
  longs[s] = L[s].filter(([t, dt]) => dt > 50 && t > T0[s] && t - dt / 1000 < T0[s] + DUR).map(([t, dt]) => ({ a: +(t - dt / 1000 - T0[s]).toFixed(4), b: +(t - T0[s]).toFixed(4), ms: Math.round(dt) }));
}
const r3 = (x) => x.toFixed(4);
function half(i, s, label, w, slow) {
  const lg = longs[s];
  const p = [`[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=${Math.round(DUR * 60)},setpts=PTS-STARTPTS,crop=1290:2294:0:162,scale=645:1147:flags=lanczos,setsar=1`];
  // red edge + label while a page frame over 50 ms is in progress
  for (const { a, b, ms } of lg) {
    const en = `enable='between(t,${r3(Math.max(0, a))},${r3(b)})'`;
    p.push(`drawbox=x=0:y=0:w=iw:h=ih:color=0xE0201B:t=11:${en}`);
    p.push(`drawtext=${FB}:text='page frame ${ms} ms':x=(w-tw)/2:y=140:fontsize=36:fontcolor=white:box=1:boxcolor=0xE0201B:boxborderw=11:${en}`);
  }
  p.push(`pad=${w}:${1300 + SH}:0:80:color=white`);
  p.push(`drawtext=${FB}:text='${label}':x=12:y=12:fontsize=27:fontcolor=black`);
  p.push(`drawtext=${F}:text='%{eif\\:round(t*1000)\\:d} ms':x=645-tw-12:y=14:fontsize=22:fontcolor=0x444444`);
  // running count of page frames over 50 ms (counted when the frame starts)
  const starts = lg.map((x) => Math.max(0, x.a));
  for (let k = 0; k <= starts.length; k++) {
    const a = k === 0 ? 0 : starts[k - 1], b = k < starts.length ? starts[k] : 999;
    if (b <= a && k < starts.length) continue;
    p.push(`drawtext=${F}:text='page frames over 50 ms so far\\: ${k}':x=12:y=50:fontsize=21:fontcolor=${k ? '0xC0181B' : '0x444444'}:enable='gte(t,${r3(a)})*lt(t,${r3(b)})'`);
  }
  return p.join(',') + `[h${i}x];\n[${2 + i}:v]setsar=1[s${i}];[h${i}x][s${i}]overlay=x=0:y=1227:format=auto[h${i}y];[h${i}y]split[h${i}y1][h${i}y2];[h${i}y2]crop=${PW}:${SH}:0:1227,drawbox=c=white:t=fill[p${i}];` +
    `[h${i}y1][p${i}]overlay=x='clip(t/${D}\\,0\\,1)*${645 - PW}':y=1227:eval=frame:format=auto[h${i}]`;
}
function graph(slow, line2) {
  const g = [half(0, 'A', 'before (original site)', 652), half(1, 'B', 'after (final build g0.0l)', 646),
    `[h0][h1]hstack=inputs=2,pad=1298:${1300 + SH}:0:0:color=white,` +
    `drawtext=${FB}:text='Drag 2 of 3\\: the hero fades out and the People card moves in - red edge = a page frame over 50 ms':x=(w-tw)/2:y=h-64:fontsize=24:fontcolor=black,` +
    `drawtext=${F}:text='${line2}':x=(w-tw)/2:y=h-30:fontsize=19:fontcolor=0x444444,` +
    (slow > 1 ? `setpts=${slow}*PTS,` : '') + `fps=60,tpad=stop_mode=clone:stop_duration=${slow > 1 ? 1.0 : 0.5},format=yuv420p`];
  return g.join(';\n') + '\n';
}
fs.writeFileSync('fc-3x.txt', graph(3, 'iPhone 15 Pro Max - Safari - robot slow drag - 3x slower (each 60 Hz screen frame held 3 frames) - ms of real time'));
fs.writeFileSync('fc-60.txt', graph(1, 'iPhone 15 Pro Max - Safari - robot slow drag - real speed, every 60 Hz screen frame once - ms of real time'));
console.log(JSON.stringify({ stats, longs }, null, 0));

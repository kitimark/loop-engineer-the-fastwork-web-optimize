// art-ar-gifs: filter graphs for the Day 8 menu and Day 3 carousel GIFs/strip from the -ar- recordings.
// Same look as art-rec/montage.mjs, day5.mjs (crop 1290:2295:0:162 = address bar cut off; labels; 60 fps grid;
// 50 fps = 1.2x slower, 20 fps = 3x slower; palettegen/paletteuse). usage: node gen.mjs <dir>; writes <dir>/*.txt + run.sh
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/';
const O = 'out/article-gifs/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const MO = '20261010T041207Z-ar-menu-orig.mov', MV = '20261010T041016Z-ar-menu-v14.mov';
const CO = '20261010T042754Z-ar-carousel-orig.mov', CG = '20261010T042903Z-ar-carousel-g0m.mov';
// menu: clip start = robot mark + 0.8 s; the after run's first motion is at mark + ~1.0 s (P3 and P4), so timer 0 = mark + 1.0
const P3 = [79.60 + 0.8, 75.88 + 0.8], P4 = [87.21 + 0.8, 83.37 + 0.8];
const BA = 'before (original site)', AV = 'after (v14)', AG = 'after (final build g0.0m)';
const pre = (i, n) => `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=${n},setpts=PTS-STARTPTS`;
const pal = (c, b = 5) => `split[s0][s1];[s0]palettegen=max_colors=${c}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${b}:diff_mode=rectangle`;
const inp = (pairs, T) => pairs.flatMap(([f, s]) => ['-ss', s.toFixed(3), '-t', String(T), '-i', R + f]);
const jobs = [];
const job = (name, args, graph, out) => { writeFileSync(`${dir}/${name}.txt`, graph + '\n'); jobs.push(`ffmpeg -nostdin -v error -y ${args.map((a) => `'${a}'`).join(' ')} -filter_complex_script ${dir}/${name}.txt ${out}`); };

// full-view half (as montage.mjs): crop, 398x708, label, ms timer
const half = (src, lab, w, off, crop = 'crop=1290:2295:0:162,scale=398:708:flags=lanczos', W = 398, H = 708, tag) =>
  `${src},${crop},setsar=1,pad=${w}:${H + 28}:0:28:color=white,drawtext=${F}:text='${lab}':x=8:y=7:fontsize=15:fontcolor=black,` +
  `drawtext=${F}:text='%{eif\\:round((t+${off})*1000)\\:d} ms':x=${W}-tw-8:y=8:fontsize=13:fontcolor=0x444444[${tag}]`;

// 1) day8-menu-50fps: P3 open + P4 close, 4.6 s each, 1.2x slower
for (const [cn, cc, outp] of [['menu50', 64, 'day8-menu-50fps.gif'], ['menu50c48', 48, 'check/day8-menu-50fps-c48.gif']]) {
  const N = 264, T = (N / 60 + 0.3).toFixed(2), g = [];
  const clips = [[P3, '1/2  End of the page - one slow push up opens the menu'], [P4, '2/2  One slow push down closes it again']];
  clips.forEach(([_, title], k) => {
    g.push(half(pre(2 * k, N), BA, 402, -0.2, undefined, undefined, undefined, `h${k}0`), half(pre(2 * k + 1, N), AV, 398, -0.2, undefined, undefined, undefined, `h${k}1`));
    g.push(`[h${k}0][h${k}1]hstack=inputs=2,pad=800:784:0:0:color=white,drawtext=${FB}:text='${title}':x=(w-tw)/2:y=h-46:fontsize=16:fontcolor=black,` +
      `drawtext=${F}:text='iPhone 15 Pro Max - Safari - same robot push on both - 1.2x slower (60 fps phone frames at 50 fps) - ms after the push starts':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
      `setpts=N/50/TB,fps=50,tpad=stop_mode=clone:stop_duration=0.5[c${k}]`);
  });
  g.push(`[c0][c1]concat=n=2:v=1:a=0,${pal(cc)}`);
  job(cn, [...inp([[MO, P3[0]], [MV, P3[1]]], T), ...inp([[MO, P4[0]], [MV, P4[1]]], T)], g.join(';\n'), O + outp);
}
// 2) day8-menu-3x: close-up (upper 60 % of the view, where the menu edge travels) during the open push, 3x slower
{
  const N = 156, T = (N / 60 + 0.3).toFixed(2);
  const crop = 'crop=1290:1380:0:162,scale=460:492:flags=lanczos';
  const g = [half(pre(0, N), BA, 464, -0.2, crop, 460, 492, 'h0'), half(pre(1, N), AV, 460, -0.2, crop, 460, 492, 'h1'),
    `[h0][h1]hstack=inputs=2,pad=924:568:0:0:color=white,drawtext=${FB}:text='Close-up - one slow push up at the end of the page opens the menu':x=(w-tw)/2:y=h-46:fontsize=16:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - upper part of the screen - 3x slower (60 fps phone frames at 20 fps) - ms after the push starts':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/20/TB,fps=20,tpad=stop_mode=clone:stop_duration=1.0,${pal(128)}`];
  job('menu3x', inp([[MO, P3[0]], [MV, P3[1]]], T), g.join(';\n'), O + 'day8-menu-3x.gif');
}
// 3) day8-menu-strip: 6 moments of the open push, ms after push start (frame = 12 + ms*60/1000)
{
  const MS = [0, 400, 550, 700, 2400, 4200], N = 12 + 253;
  const row = (i, label) => {
    const parts = [`${pre(i, N)},crop=1290:2295:0:162,scale=188:334:flags=lanczos,setsar=1,split=${MS.length}${MS.map((_, k) => `[x${i}${k}]`).join('')}`];
    MS.forEach((ms, k) => { const f = 12 + Math.round(ms * 60 / 1000); parts.push(`[x${i}${k}]trim=start_frame=${f}:end_frame=${f + 1},setpts=PTS-STARTPTS,pad=196:362:4:28:color=white,` +
      `drawtext=${F}:text='${ms} ms':x=(w-tw)/2:y=6:fontsize=16:fontcolor=0x444444[y${i}${k}]`); });
    parts.push(`${MS.map((_, k) => `[y${i}${k}]`).join('')}hstack=inputs=${MS.length},pad=1188:ih+40:(ow-iw)/2:40:color=white,drawtext=${FB}:text='${label}':x=8:y=12:fontsize=22:fontcolor=black[r${i}]`);
    return parts.join(';\n');
  };
  const g = [row(0, BA), row(1, AV), `[r0][r1]vstack=inputs=2,pad=1188:ih+44:0:0:color=white,drawtext=${F}:text='iPhone 15 Pro Max - Safari - end of the page - one slow push up opens the menu - ms after the push starts':x=(w-tw)/2:y=h-30:fontsize=15:fontcolor=0x444444`];
  job('menustrip', inp([[MO, P3[0]], [MV, P3[1]]], 4.8), g.join(';\n'), '-frames:v 1 ' + O + 'day8-menu-strip.png');
}
// 4) day3-carousel-50fps: full view at rest, 4.2 s from rest start + 0.5 s
const C = [36.40 + 0.5, 19.94 + 0.5];
{
  const N = 252, T = (N / 60 + 0.3).toFixed(2);
  const g = [half(pre(0, N), BA, 402, 0, undefined, undefined, undefined, 'h0'), half(pre(1, N), AG, 398, 0, undefined, undefined, undefined, 'h1'),
    `[h0][h1]hstack=inputs=2,pad=800:784:0:0:color=white,drawtext=${FB}:text='The People section at rest - the profile photos in the pill change about every second':x=(w-tw)/2:y=h-46:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - page at rest - 1.2x slower (60 fps phone frames at 50 fps) - ms into the clip':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/50/TB,fps=50,tpad=stop_mode=clone:stop_duration=0.5,${pal(128)}`];
  job('car50', inp([[CO, C[0]], [CG, C[1]]], T), g.join(';\n'), O + 'day3-carousel-50fps.gif');
}
// 5) day3-carousel-3x: close-up on the photo pill at device pixels (600x180 from x 150, y 1165), rows stacked, 3x slower
{
  const N = 192, T = (N / 60 + 0.3).toFixed(2);
  const row = (i, lab) => `${pre(i, N)},crop=600:180:150:1165,setsar=1,pad=620:212:10:30:color=white,drawtext=${F}:text='${lab}':x=10:y=7:fontsize=16:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round(t*1000)\\:d} ms':x=w-tw-10:y=8:fontsize=14:fontcolor=0x444444[r${i}]`;
  const g = [row(0, BA), row(1, AG), `[r0][r1]vstack=inputs=2,pad=620:ih+50:0:0:color=white,drawtext=${FB}:text='Close-up - the profile-photo pill, page at rest':x=(w-tw)/2:y=h-44:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - actual device pixels - 3x slower (60 fps phone frames at 20 fps) - ms into the clip':x=(w-tw)/2:y=h-21:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/20/TB,fps=20,tpad=stop_mode=clone:stop_duration=1.0,${pal(128, 3)}`];
  job('car3x', inp([[CO, C[0]], [CG, C[1]]], T), g.join(';\n'), O + 'day3-carousel-3x.gif');
}
writeFileSync(`${dir}/run.sh`, `set -e\n${jobs.join('\n')}\nls -la ${O}day8-menu-* ${O}day3-carousel-*\necho EXIT 0\n`);
console.log(jobs.length, 'jobs');

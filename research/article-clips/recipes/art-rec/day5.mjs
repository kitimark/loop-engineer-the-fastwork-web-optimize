// art-rec: Day 5 continuous stretch (hero top -> cards move out -> People section fades in), wc-hero pair 1.
// Same crop/labels as the other strips and GIFs. usage: node day5.mjs <outdir> <colors>
// Writes day5-50.txt (1.2x slower, 50 fps), day5-3x.txt (3x slower, 20 fps) and day5-strip.txt; prints the input args.
import { writeFileSync } from 'node:fs';
const [dir, colors = '80'] = process.argv.slice(2);
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
// orig 50.4 s; g0l = orig + 45.171 (art-gif-pb's drag-2 screen alignment; cap-worst's y600/y800 crossings give 45.10/45.18)
const A = ['20261009T132512Z-wc-hero-orig.mov', 50.4], B = ['20261009T132633Z-wc-hero-g0l.mov', 95.571];
const N = 432; // 7.2 s of 60 Hz frames
const args = ['-ss', String(A[1]), '-t', '7.4', '-i', R + A[0], '-ss', String(B[1]), '-t', '7.4', '-i', R + B[0]];
const pre = (i) => `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=${N},setpts=PTS-STARTPTS`;

function gif(name, slow, fps) {
  const half = (i, label, w) => `${pre(i)},crop=1290:2295:0:162,scale=398:708:flags=lanczos,setsar=1,` +
    `pad=${w}:736:0:28:color=white,drawtext=${F}:text='${label}':x=8:y=7:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round(t*1000)\\:d} ms':x=398-tw-8:y=8:fontsize=13:fontcolor=0x444444[h${i}]`;
  const g = [half(0, 'before (original site)', 402), half(1, 'after (final build g0.0l)', 398),
    `[h0][h1]hstack=inputs=2,pad=800:784:0:0:color=white,` +
    `drawtext=${FB}:text='From the top of the page - the hero cards move out - the People section fades in':x=(w-tw)/2:y=h-46:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - three slow drags - ${slow} (60 fps phone frames at ${fps} fps) - ms into the clip':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/${fps}/TB,fps=${fps},tpad=stop_mode=clone:stop_duration=0.6,split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`];
  writeFileSync(`${dir}/${name}`, g.join(';\n') + '\n');
}
gif('day5-50.txt', '1.2x slower', 50);
gif('day5-3x.txt', '3x slower', 20);

// strip: 6 moments, same ms on both rows
const PICK = [0, 84, 180, 324, 336, 390];
function row(i, label) {
  const parts = [`${pre(i)},crop=1290:2295:0:162,scale=188:334:flags=lanczos,setsar=1,split=${PICK.length}${PICK.map((_, k) => `[x${i}${k}]`).join('')}`];
  PICK.forEach((f, k) => parts.push(`[x${i}${k}]trim=start_frame=${f}:end_frame=${f + 1},setpts=PTS-STARTPTS,pad=196:362:4:28:color=white,` +
    `drawtext=${F}:text='${f * 50 / 3} ms':x=(w-tw)/2:y=6:fontsize=16:fontcolor=0x444444[y${i}${k}]`));
  parts.push(`${PICK.map((_, k) => `[y${i}${k}]`).join('')}hstack=inputs=${PICK.length},` +
    `pad=1188:ih+40:(ow-iw)/2:40:color=white,drawtext=${FB}:text='${label}':x=8:y=12:fontsize=22:fontcolor=black[r${i}]`);
  return parts.join(';\n');
}
writeFileSync(`${dir}/day5-strip.txt`, [row(0, 'before (original site)'), row(1, 'after (final build g0.0l)'),
  `[r0][r1]vstack=inputs=2,pad=1188:ih+44:0:0:color=white,drawtext=${F}:text='iPhone 15 Pro Max - Safari - three slow drags from the top of the page - ms into the stretch':x=(w-tw)/2:y=h-30:fontsize=15:fontcolor=0x444444`].join(';\n') + '\n');
console.log(JSON.stringify(args));

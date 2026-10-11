// art-rec: filter graph + ffmpeg args for the "Before day one" montage: four before | after clips from the -wc-
// recordings (same crop, labels and 50 fps / 1.2x slower as art-gif-pb's GIFs). Prints the ffmpeg argument list as JSON
// and writes the filter graph. usage: node montage.mjs <filter.txt> [colors] [clips e.g. 1,2,3,4]
import { writeFileSync } from 'node:fs';
const [out, colorsS = '128', pick = '1,2,3,4'] = process.argv.slice(2);
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
// start (s into each .mov) and timer offset (s) so that the timer reads ms after the clip's reference moment
const CLIPS = {
  1: { title: '1/4  The top cards move out (slow drag)', ref: 'ms after the drag starts', off: 0.7,
    a: ['20261009T132512Z-wc-hero-orig.mov', 55.123], b: ['20261009T132633Z-wc-hero-g0l.mov', 100.294] },
  2: { title: '2/4  People still need people - the profile card under a slow drag', ref: 'ms into the clip', off: 0,
    a: ['20261009T135711Z-wc-middle-orig.mov', 81.0], b: ['20261009T135904Z-wc-middle-g0l.mov', 13.64] },
  3: { title: '3/4  The dark section and the user carousel come in', ref: 'ms after this drag starts', off: 0.2,
    a: ['20261009T135711Z-wc-middle-orig.mov', 84.657], b: ['20261009T135904Z-wc-middle-g0l.mov', 16.763] },
  4: { title: '4/4  End of the page - one push opens the menu (both runs at Critical heat)', ref: 'ms after the menu starts to move', off: -0.2,
    a: ['20261009T144540Z-wc-end-orig.mov', 183.348], b: ['20261009T141903Z-wc-end-g0l.mov', 111.893] },
};
const ids = pick.split(',').map(Number);
const N = 100, args = [], g = [];
ids.forEach((id, k) => {
  const c = CLIPS[id];
  args.push('-ss', String(c.a[1]), '-t', '1.9', '-i', R + c.a[0], '-ss', String(c.b[1]), '-t', '1.9', '-i', R + c.b[0]);
  const half = (i, label, w) => `[${2 * k + i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=${N},setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=398:708:flags=lanczos,setsar=1,` +
    `pad=${w}:736:0:28:color=white,drawtext=${F}:text='${label}':x=8:y=7:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t+${c.off})*1000)\\:d} ms':x=398-tw-8:y=8:fontsize=13:fontcolor=0x444444[h${k}${i}]`;
  g.push(half(0, 'before (original site)', 402), half(1, 'after (final build g0.0l)', 398));
  g.push(`[h${k}0][h${k}1]hstack=inputs=2,pad=800:784:0:0:color=white,` +
    `drawtext=${FB}:text='${c.title}':x=(w-tw)/2:y=h-46:fontsize=16:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - 1.2x slower (60 fps phone frames at 50 fps) - ${c.ref}':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/50/TB,fps=50,tpad=stop_mode=clone:stop_duration=0.4[c${k}]`);
});
g.push(`${ids.map((_, k) => `[c${k}]`).join('')}concat=n=${ids.length}:v=1:a=0,split[s0][s1];[s0]palettegen=max_colors=${colorsS}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`);
writeFileSync(out, g.join(';\n') + '\n');
console.log(JSON.stringify(args));

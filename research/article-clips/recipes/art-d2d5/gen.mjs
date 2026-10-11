// art-d2d5 gen.mjs (2026-10-11, owner T-170 #359/#363): the Day 2 and Day 5 strip clips, made exactly like article
// clip 1 (art-strip/g5/gen.mjs, hero-gesture-long): the owner's swipe replayed by the robot, 11.5 s (690 frames on the
// 60 Hz grid) from 0.3 s before the first scroll move (align.py: ss = that frame's end - 0.3 s), each phone side at half
// device pixels (crop 1290x2294 from row 162 -> 645x1147), a frame-time strip under each side (strips.py, the phone's
// own rAF log via the clock chain) with a white playhead, the same labels' style, footer and encoding (CRF 17, 60 fps).
// usage (repo root): node research/article-clips/recipes/art-d2d5/gen.mjs out/d2d5/pairs.json out/d2d5/gen
//   pairs.json: {"<clip name>": {"A": {"mov", "ss"}, "B": {"mov", "ss"}, "la", "lb"}, ...}
//   -> <dir>/<name>.txt (filter script), <dir>/windows.json (strip specs for strips.py), <dir>/cmds.json (ffmpeg lines)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [pairsPath, dir] = process.argv.slice(2);
const PAIRS = JSON.parse(readFileSync(pairsPath, 'utf8'));
const OUT = 'out/article-video/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc';
const SPEED = 'real speed, every 60 Hz screen frame once';
const CRF = Number(process.env.CRF || 17);
const SH = 96, PW = 3, PANEL = 645, N = 690; // strip height, playhead width, side panel width, 11.5 s as clip 1
const STRIPS = process.env.STRIPS_DIR || 'out/d2d5/strips';
const TIMER = '-0.3'; // ms after the first flick starts, as clip 1
const FOOT = `iPhone 15 Pro Max - Safari - robot replay of my own swipe - ${SPEED} - ms after the first flick starts`;
mkdirSync(dir, { recursive: true });

function side(i, n, label, left, tag, k) {
  const D = (n / 60).toFixed(6);
  return `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=${n},setpts=PTS-STARTPTS,` +
    `crop=1290:2294:0:162,scale=645:1147:flags=lanczos,setsar=1,format=yuv444p,pad=${left ? 651 : 645}:${1192 + SH}:0:45:color=white,` +
    `drawtext=${F}:text='${label}':x=13:y=11:fontsize=24:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t${TIMER})*1000)\\:d} ms':x=645-tw-13:y=13:fontsize=21:fontcolor=0x444444[${tag}x];\n` +
    `[${k}:v]setsar=1[${tag}s];[${tag}x][${tag}s]overlay=x=0:y=1192:format=auto[${tag}y];[${tag}y]split[${tag}y1][${tag}y2];[${tag}y2]crop=${PW}:${SH}:0:1192,drawbox=c=white:t=fill[${tag}p];` +
    `[${tag}y1][${tag}p]overlay=x='clip(t/${D}\\,0\\,1)*${PANEL - PW}':y=1192:eval=frame:format=auto[${tag}]`;
}
const pair = (a, b, out) => `[${a}][${b}]hstack=inputs=2,pad=1296:${1228 + SH}:0:0:color=white,drawtext=${F}:text='${FOOT}':x=(w-tw)/2:y=h-28:fontsize=19:fontcolor=0x444444[${out}]`;

const windows = [], cmds = {};
for (const [name, p] of Object.entries(PAIRS)) {
  const ids = ['A', 'B'].map((ab) => `${name}-60fps-${ab}`);
  ['A', 'B'].forEach((ab, j) => windows.push({ id: ids[j], mov: p[ab].mov, ss: p[ab].ss, mode: 'grid', a: 0, n: N, W: PANEL, SH, pw: PW }));
  const g = [side(0, N, p.la, true, 'h0', 2), side(1, N, p.lb, false, 'h1', 3), pair('h0', 'h1', 'out')];
  writeFileSync(`${dir}/${name}.txt`, g.join(';\n') + '\n');
  const t = (N / 60 + 0.3).toFixed(2);
  cmds[name] = `ffmpeg -nostdin -v error -y -ss ${p.A.ss} -t ${t} -i ${p.A.mov} -ss ${p.B.ss} -t ${t} -i ${p.B.mov} ` +
    `-i ${STRIPS}/${ids[0]}.png -i ${STRIPS}/${ids[1]}.png -filter_complex_script ${dir}/${name}.txt -map "[out]" ` +
    `-c:v libx264 -preset slow -crf ${CRF} -pix_fmt yuv420p -r 60 -movflags +faststart -an ${OUT}${name}-60fps-strip.mp4`;
  console.log(name, N, `${p.A.mov.split('/').pop()} from ${p.A.ss} s | ${p.B.mov.split('/').pop()} from ${p.B.ss} s`);
}
writeFileSync(`${dir}/windows.json`, JSON.stringify(windows, null, 1));
writeFileSync(`${dir}/cmds.json`, JSON.stringify(cmds, null, 1));

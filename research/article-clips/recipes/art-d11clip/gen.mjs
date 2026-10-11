// art-d11clip: Day 11 reveal flick, g0.0l (left) vs g0.0m (right), from the -ar-revealflick recordings (first pair of the
// A V V A block: 042723Z g0.0l, 042826Z g0.0m). Recipe = art-strip/g6/gen.mjs (gridClip: 60 Hz grid, real speed, labels,
// ms timer, footer, frame-time strip + playhead), with a per-side timer so each side reads ms after its own touch start
// (align.json: ss = midway before the movie frame nearest touch - 0.3 s; timer = t + (M0 - touch)).
// usage: node gen.mjs <outdir>  -> real.txt, cmds.json, windows.json (strip specs for strips.py)
import { readFileSync, writeFileSync } from 'node:fs';
const [dir] = process.argv.slice(2);
const AL = JSON.parse(readFileSync(dir + '/align.json', 'utf8'));
const OUT = 'out/article-video/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const CRF = Number(process.env.CRF || 17);
const STRIPS = dir + '/strips/';
const WINDOWS = [], cmds = {}, clips = [];
const tm = (off) => (off >= 0 ? `+${off.toFixed(5)}` : off.toFixed(5));
const LA = 'g0.0l (9 Oct)', LB = 'g0.0m (final build)';

// real speed: whole phone screen (rows 162-2456) at half device pixels, as g6
function real(name, n) {
  const SH = 96, PW = 3, PANEL = 645, D = (n / 60).toFixed(6);
  const side = (i, label, off, left, tag, k) =>
    `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=${n},setpts=PTS-STARTPTS,` +
    `crop=1290:2294:0:162,scale=645:1147:flags=lanczos,setsar=1,format=yuv444p,pad=${left ? 651 : 645}:${1192 + SH}:0:45:color=white,` +
    `drawtext=${F}:text='${label}':x=13:y=11:fontsize=24:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t${tm(off)})*1000)\\:d} ms':x=645-tw-13:y=13:fontsize=21:fontcolor=0x444444[${tag}x];\n` +
    `[${k}:v]setsar=1[${tag}s];[${tag}x][${tag}s]overlay=x=0:y=1192:format=auto[${tag}y];[${tag}y]split[${tag}y1][${tag}y2];[${tag}y2]crop=${PW}:${SH}:0:1192,drawbox=c=white:t=fill[${tag}p];` +
    `[${tag}y1][${tag}p]overlay=x='clip(t/${D}\\,0\\,1)*${PANEL - PW}':y=1192:eval=frame:format=auto[${tag}]`;
  const foot = 'iPhone 15 Pro Max - Safari - robot fast flick to the People card - real speed, every 60 Hz screen frame once - ms after the touch';
  const g = [side(0, LA, AL.A.off, true, 'h0', 2), side(1, LB, AL.B.off, false, 'h1', 3),
    `[h0][h1]hstack=inputs=2,pad=1296:${1228 + SH}:0:0:color=white,drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-28:fontsize=19:fontcolor=0x444444,format=yuv420p[out]`];
  for (const ab of ['A', 'B']) WINDOWS.push({ id: `${name}-${ab}`, mov: AL[ab].mov, ss: AL[ab].ss, mode: 'grid', a: 0, n, W: PANEL, SH, pw: PW });
  writeFileSync(`${dir}/${name}.txt`, g.join(';\n') + '\n');
  const t = (n / 60 + 0.3).toFixed(2);
  cmds[name] = `ffmpeg -nostdin -v error -y -ss ${AL.A.ss} -t ${t} -i ${AL.A.mov} -ss ${AL.B.ss} -t ${t} -i ${AL.B.mov} -i ${STRIPS}${name}-A.png -i ${STRIPS}${name}-B.png ` +
    `-filter_complex_script ${dir}/${name}.txt -map "[out]" -c:v libx264 -preset slow -crf ${CRF} -pix_fmt yuv420p -r 60 -movflags +faststart -an ${OUT}${name}-strip.mp4`;
  clips.push({ name, frames: n, seconds: n / 60 });
}
// 2x close-up: rows 162 + y0 .. + h of the screen, as g2x/menu.txt (796 px wide per side, 112 px strip, 1 s end hold)
function close2x(name, n, y0, h, title) {
  const SH = 112, PW = 3, PANEL = 796, D = (n / 60).toFixed(6), H = Math.round(h * 796 / 1290);
  const side = (i, label, off, left, tag, k) =>
    `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=${n},setpts=PTS-STARTPTS,` +
    `crop=1290:${h}:0:${162 + y0},scale=796:${H}:flags=lanczos,setsar=1,pad=${left ? 804 : 796}:${H + 48 + SH}:0:48:color=white,` +
    `drawtext=${F}:text='${label}':x=14:y=12:fontsize=26:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t${tm(off)})*1000)\\:d} ms':x=796-tw-14:y=14:fontsize=22:fontcolor=0x444444[${tag}x];\n` +
    `[${k}:v]setsar=1[${tag}s];[${tag}x][${tag}s]overlay=x=0:y=${H + 48}:format=auto[${tag}y];[${tag}y]split[${tag}y1][${tag}y2];[${tag}y2]crop=${PW}:${SH}:0:${H + 48},drawbox=c=white:t=fill[${tag}p];` +
    `[${tag}y1][${tag}p]overlay=x='clip(t/${D}\\,0\\,1)*${PANEL - PW}':y=${H + 48}:eval=frame:format=auto[${tag}]`;
  const foot = 'iPhone 15 Pro Max - Safari - upper part of the screen - 2x slower (33 ms per phone frame) - ms after the touch';
  const g = [side(0, LA, AL.A.off, true, 'h0', 2), side(1, LB, AL.B.off, false, 'h1', 3),
    `[h0][h1]hstack=inputs=2,pad=1600:${H + 48 + SH + 84}:0:0:color=white,drawtext=${FB}:text='${title}':x=(w-tw)/2:y=h-80:fontsize=28:fontcolor=black,` +
    `drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-38:fontsize=21:fontcolor=0x444444,setpts=round(N/30/TB),fps=60,tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]`];
  for (const ab of ['A', 'B']) WINDOWS.push({ id: `${name}-${ab}`, mov: AL[ab].mov, ss: AL[ab].ss, mode: 'grid', a: 0, n, W: PANEL, SH, pw: PW });
  writeFileSync(`${dir}/${name}.txt`, g.join(';\n') + '\n');
  const t = (n / 60 + 0.3).toFixed(2);
  cmds[name] = `ffmpeg -nostdin -v error -y -ss ${AL.A.ss} -t ${t} -i ${AL.A.mov} -ss ${AL.B.ss} -t ${t} -i ${AL.B.mov} -i ${STRIPS}${name}-A.png -i ${STRIPS}${name}-B.png ` +
    `-filter_complex_script ${dir}/${name}.txt -map "[out]" -c:v libx264 -preset slow -crf ${CRF} -pix_fmt yuv420p -r 60 -movflags +faststart -an ${OUT}${name}-strip.mp4`;
  clips.push({ name, frames: n, seconds: 2 * n / 60 + 1 });
}
real('day11-reveal-60fps', Number(process.env.N || 318));
if (process.env.CU) { const [n, y0, h] = process.env.CU.split(',').map(Number); close2x('day11-reveal-2x', n, y0, h, 'Close-up - the People card appears during a fast flick'); }
writeFileSync(`${dir}/cmds.json`, JSON.stringify(cmds, null, 1));
writeFileSync(`${dir}/windows.json`, JSON.stringify(WINDOWS, null, 1));
writeFileSync(`${dir}/clips.json`, JSON.stringify(clips, null, 1));
console.log(JSON.stringify(clips));

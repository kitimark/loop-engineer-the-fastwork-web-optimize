// art-60fps: 60 fps, real-speed re-cuts of the article's real-iPhone side-by-side clips, straight from the -wc-/-ar-/-pb-
// screen recordings. Same pairs, start times, alignment and labels as the GIF recipes (art-gif-pb/*50.txt,
// art-rec/day5-50.txt + montage.mjs clip 4, art-ar-gifs/car50/menu50/pt50.txt); each phone side at half device
// pixels (crop 1290x2294 from row 162 -> 645x1147), fonts ~1.6x, every 60 Hz grid frame once at 60 fps, no end hold.
// Raw-frame windows of the old art-gif-pb recipes (trim=start_frame=a:end_frame=b on decoded frames) become the same
// window on the 60 Hz grid built from the recordings' timestamps: grid start = raw frame a's time, length b-a.
// art-strip hero-gesture-long: herocatch v2 pair, 11.5 s from 0.3 s before the first flick (through the second title stop).
// art-strip (T-170 #191): + a frame-time strip under each side (strips.py: the phone's rAF log on the clip's window via
// the clock chain) and a white playhead over it (overlay x = t/D on each side's own clock, before any slow-down).
// usage: node gen60.mjs <outdir>  -> <name>.txt, cmds.json, windows60.json (strip specs for strips.py)
import { readFileSync, writeFileSync } from 'node:fs';
const [dir] = process.argv.slice(2);
const W = '.claude/worktrees/';
const R = W + 'agent-a4147eb3c10989361/out/iphone-screen/';
const RP = W + 'agent-ac97cdb0aa8f3a8b2/out/iphone-screen/';
const OUT = 'out/article-video/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const SPEED = 'real speed, every 60 Hz screen frame once';
const CRF = Number(process.env.CRF || 17);
const SH = 96, PW = 3, PANEL = 645; // strip height, playhead width, side panel width
const STRIPS = new URL("../strips/", import.meta.url).pathname;
const WINDOWS = [];

// grid frame index of raw decoded frame a after -ss ss (movie t = frames.json pts - first pts, as art-gif-pb/pace.py)
function gridStart(path, ss, a) {
  const fr = JSON.parse(readFileSync(path.replace(/\.mov$/, '.frames.json'), 'utf8')).frames;
  const p0 = fr[0][0];
  const after = fr.map((f) => f[0] - p0).filter((t) => t >= ss - 1e-6);
  return Math.round((after[a] - after[0]) * 60);
}

// one side: input i, grid frames [s, s+n), label, timer offset (s), left side gets a 6 px gap
function side(i, s, n, label, timer, left, tag, k) {
  const D = (n / 60).toFixed(6);
  return `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=${s}:end_frame=${s + n},setpts=PTS-STARTPTS,` +
    `crop=1290:2294:0:162,scale=645:1147:flags=lanczos,setsar=1,format=yuv444p,pad=${left ? 651 : 645}:${1192 + SH}:0:45:color=white,` +
    `drawtext=${F}:text='${label}':x=13:y=11:fontsize=24:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t${timer})*1000)\\:d} ms':x=645-tw-13:y=13:fontsize=21:fontcolor=0x444444[${tag}x];\n` +
    `[${k}:v]setsar=1[${tag}s];[${tag}x][${tag}s]overlay=x=0:y=1192:format=auto[${tag}y];[${tag}y]split[${tag}y1][${tag}y2];[${tag}y2]crop=${PW}:${SH}:0:1192,drawbox=c=white:t=fill[${tag}p];` +
    `[${tag}y1][${tag}p]overlay=x='clip(t/${D}\\,0\\,1)*${PANEL - PW}':y=1192:eval=frame:format=auto[${tag}]`;
}
// footer: small (one line, old 22 px band) or big (title + line, old 48 px band)
function pair(a, b, foot, title, titleSize, out) {
  const base = `[${a}][${b}]hstack=inputs=2,`;
  if (!title) return base + `pad=1296:${1228 + SH}:0:0:color=white,drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-28:fontsize=19:fontcolor=0x444444[${out}]`;
  return base + `pad=1296:${1270 + SH}:0:0:color=white,drawtext=${FB}:text='${title}':x=(w-tw)/2:y=h-75:fontsize=${titleSize}:fontcolor=black,` +
    `drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-36:fontsize=19:fontcolor=0x444444[${out}]`;
}

const CLIPS = [];
// art-gif-pb raw-frame recipes (footer one line; timer zero at window frame 12)
function rawClip(name, A, B, n, la, lb, foot) {
  const sa = gridStart(A.p, A.ss, A.a), sb = gridStart(B.p, B.ss, B.a);
  const g = [side(0, sa, n, la, '-12/60', true, 'h0', 2), side(1, sb, n, lb, '-12/60', false, 'h1', 3), pair('h0', 'h1', foot, null, 0, 'out')];
  const strips = [[A, sa, 'A'], [B, sb, 'B']].map(([X, s, ab]) => { const id = `${name}-60fps-${ab}`;
    WINDOWS.push({ id, mov: X.p, ss: X.ss, mode: 'grid', a: s, n, W: PANEL, SH, pw: PW }); return `${STRIPS}${id}.png`; });
  CLIPS.push({ name, inputs: [[A.ss, A.p], [B.ss, B.p]], strips, t: (Math.max(sa, sb) + n) / 60 + 0.3, g, frames: n,
    window: `${A.p.split('/').pop()} raw ${A.a}-${A.a + n} after ${A.ss} s (grid ${sa}) | ${B.p.split('/').pop()} raw ${B.a}-${B.a + n} after ${B.ss} s (grid ${sb})` });
}
// grid recipes: (name, [[ss, path] x2 per segment], n per segment, labels, timer, footer, title)
function gridClip(name, segs, n, la, lb, timer, foot, titles, titleSize) {
  const g = [], inputs = [], strips = [], ni = segs.length * 2;
  segs.forEach((pr, k) => {
    inputs.push(pr[0], pr[1]);
    for (const [X, ab] of [[pr[0], 'A'], [pr[1], 'B']]) { const id = `${name}-60fps-${segs.length > 1 ? `s${k + 1}-` : ''}${ab}`;
      WINDOWS.push({ id, mov: X[1], ss: X[0], mode: 'grid', a: 0, n, W: PANEL, SH, pw: PW }); strips.push(`${STRIPS}${id}.png`); }
    g.push(side(2 * k, 0, n, la, timer, true, `h${k}0`, ni + 2 * k), side(2 * k + 1, 0, n, lb, timer, false, `h${k}1`, ni + 2 * k + 1));
    g.push(pair(`h${k}0`, `h${k}1`, foot, titles ? titles[k] : null, titleSize, segs.length > 1 ? `c${k}` : 'out'));
  });
  if (segs.length > 1) g.push(`${segs.map((_, k) => `[c${k}]`).join('')}concat=n=${segs.length}:v=1:a=0[out]`);
  CLIPS.push({ name, inputs, strips, t: n / 60 + 0.3, g, frames: n * segs.length,
    window: segs.map((pr) => `${pr[0][1].split('/').pop()} from ${pr[0][0]} s | ${pr[1][1].split('/').pop()} from ${pr[1][0]} s, ${n} grid frames`).join('; ') });
}
gridClip('hero-gesture-long', [[[40.814, R + '20261010T110844Z-ar-herocatch-orig.mov'], [23.548, R + '20261010T111222Z-ar-herocatch-g0m.mov']]], 690,
  'before (original site)', 'after (final build g0.0m)', '-0.3',
  `iPhone 15 Pro Max - Safari - robot replay of my own swipe - ${SPEED} - ms after the first flick starts`, null);
const q = (s) => s;
const cmds = {};
for (const c of CLIPS) {
  writeFileSync(`${dir}/${c.name}.txt`, c.g.join(';\n') + '\n');
  const ins = c.inputs.map(([ss, p]) => `-ss ${ss} -t ${c.t.toFixed(2)} -i ${q(p)}`).join(' ') + ' ' + c.strips.map((p) => `-i ${p}`).join(' ');
  cmds[c.name] = `ffmpeg -nostdin -v error -y ${ins} -filter_complex_script ${q(`${dir}/${c.name}.txt`)} -map "[out]" ` +
    `-c:v libx264 -preset slow -crf ${CRF} -pix_fmt yuv420p -r 60 -movflags +faststart -an ${q(OUT + c.name + '-60fps-strip.mp4')}`;
  console.log(c.name, c.frames, c.window);
}
writeFileSync(`${dir}/clips.json`, JSON.stringify(CLIPS.map(({ name, frames, window }) => ({ name, frames, window })), null, 1));
writeFileSync(`${dir}/cmds.json`, JSON.stringify(cmds, null, 1));
writeFileSync(`${dir}/windows-long.json`, JSON.stringify(WINDOWS, null, 1));

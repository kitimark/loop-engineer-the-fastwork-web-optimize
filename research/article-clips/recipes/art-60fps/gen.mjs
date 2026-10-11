// art-60fps: 60 fps, real-speed re-cuts of the article's real-iPhone side-by-side clips, straight from the -wc-/-ar-/-pb-
// screen recordings. Same pairs, start times, alignment and labels as the GIF recipes (art-gif-pb/*50.txt,
// art-rec/day5-50.txt + montage.mjs clip 4, art-ar-gifs/car50/menu50/pt50.txt); each phone side at half device
// pixels (crop 1290x2294 from row 162 -> 645x1147), fonts ~1.6x, every 60 Hz grid frame once at 60 fps, no end hold.
// Raw-frame windows of the old art-gif-pb recipes (trim=start_frame=a:end_frame=b on decoded frames) become the same
// window on the 60 Hz grid built from the recordings' timestamps: grid start = raw frame a's time, length b-a.
// usage: node gen.mjs <outdir for filter scripts>  -> writes <name>.txt and run-1.sh / run-2.sh
import { readFileSync, writeFileSync } from 'node:fs';
const [dir] = process.argv.slice(2);
const W = '.claude/worktrees/';
const R = W + 'agent-a4147eb3c10989361/out/iphone-screen/';
const RP = W + 'agent-ac97cdb0aa8f3a8b2/out/iphone-screen/';
const OUT = 'out/article-video/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const SPEED = 'real speed, every 60 Hz screen frame once';
const CRF = Number(process.env.CRF || 17);

// grid frame index of raw decoded frame a after -ss ss (movie t = frames.json pts - first pts, as art-gif-pb/pace.py)
function gridStart(path, ss, a) {
  const fr = JSON.parse(readFileSync(path.replace(/\.mov$/, '.frames.json'), 'utf8')).frames;
  const p0 = fr[0][0];
  const after = fr.map((f) => f[0] - p0).filter((t) => t >= ss - 1e-6);
  return Math.round((after[a] - after[0]) * 60);
}

// one side: input i, grid frames [s, s+n), label, timer offset (s), left side gets a 6 px gap
function side(i, s, n, label, timer, left, tag) {
  return `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=${s}:end_frame=${s + n},setpts=PTS-STARTPTS,` +
    `crop=1290:2294:0:162,scale=645:1147:flags=lanczos,setsar=1,format=yuv444p,pad=${left ? 651 : 645}:1192:0:45:color=white,` +
    `drawtext=${F}:text='${label}':x=13:y=11:fontsize=24:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t${timer})*1000)\\:d} ms':x=645-tw-13:y=13:fontsize=21:fontcolor=0x444444[${tag}]`;
}
// footer: small (one line, old 22 px band) or big (title + line, old 48 px band)
function pair(a, b, foot, title, titleSize, out) {
  const base = `[${a}][${b}]hstack=inputs=2,`;
  if (!title) return base + `pad=1296:1228:0:0:color=white,drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-28:fontsize=19:fontcolor=0x444444[${out}]`;
  return base + `pad=1296:1270:0:0:color=white,drawtext=${FB}:text='${title}':x=(w-tw)/2:y=h-75:fontsize=${titleSize}:fontcolor=black,` +
    `drawtext=${F}:text='${foot}':x=(w-tw)/2:y=h-36:fontsize=19:fontcolor=0x444444[${out}]`;
}

const CLIPS = [];
// art-gif-pb raw-frame recipes (footer one line; timer zero at window frame 12)
function rawClip(name, A, B, n, la, lb, foot) {
  const sa = gridStart(A.p, A.ss, A.a), sb = gridStart(B.p, B.ss, B.a);
  const g = [side(0, sa, n, la, '-12/60', true, 'h0'), side(1, sb, n, lb, '-12/60', false, 'h1'), pair('h0', 'h1', foot, null, 0, 'out')];
  CLIPS.push({ name, inputs: [[A.ss, A.p], [B.ss, B.p]], t: (Math.max(sa, sb) + n) / 60 + 0.3, g, frames: n,
    window: `${A.p.split('/').pop()} raw ${A.a}-${A.a + n} after ${A.ss} s (grid ${sa}) | ${B.p.split('/').pop()} raw ${B.a}-${B.a + n} after ${B.ss} s (grid ${sb})` });
}
rawClip('day10-people',
  { p: RP + 'fix-scrollcb-g0-pb-V-20261009T064210Z-1791528140392.mov', ss: 52.9, a: 22 },
  { p: RP + 'fix-scrollcb-g0-pb-K-20261009T064518Z-1791528432500.mov', ss: 21.86, a: 23 }, 156,
  'before (g0.0j)', 'after (no reveal fade)', `iPhone 15 Pro Max\\, same flick - ${SPEED} - ms after flick start`);
rawClip('day10-people-wc',
  { p: R + '20261009T134759Z-wc-people-orig.mov', ss: 25.0, a: 71 },
  { p: R + '20261009T134853Z-wc-people-g0l.mov', ss: 8.28, a: 73 }, 156,
  'before (original site)', 'after (final build g0.0l)', `iPhone 15 Pro Max\\, one flick each - ${SPEED} - ms after flick start`);
rawClip('middle',
  { p: R + '20261009T135711Z-wc-middle-orig.mov', ss: 84.09, a: 10 },
  { p: R + '20261009T135904Z-wc-middle-g0l.mov', ss: 15.98, a: 23 }, 132,
  'before (original site)', 'after (final build g0.0l)', `iPhone 15 Pro Max\\, drag into the dark section - ${SPEED} - ms after scroll start`);

// grid recipes: (name, [[ss, path] x2 per segment], n per segment, labels, timer, footer, title)
function gridClip(name, segs, n, la, lb, timer, foot, titles, titleSize) {
  const g = [], inputs = [];
  segs.forEach((pr, k) => {
    inputs.push(pr[0], pr[1]);
    g.push(side(2 * k, 0, n, la, timer, true, `h${k}0`), side(2 * k + 1, 0, n, lb, timer, false, `h${k}1`));
    g.push(pair(`h${k}0`, `h${k}1`, foot, titles ? titles[k] : null, titleSize, segs.length > 1 ? `c${k}` : 'out'));
  });
  if (segs.length > 1) g.push(`${segs.map((_, k) => `[c${k}]`).join('')}concat=n=${segs.length}:v=1:a=0[out]`);
  CLIPS.push({ name, inputs, t: n / 60 + 0.3, g, frames: n * segs.length,
    window: segs.map((pr) => `${pr[0][1].split('/').pop()} from ${pr[0][0]} s | ${pr[1][1].split('/').pop()} from ${pr[1][0]} s, ${n} grid frames`).join('; ') });
}
gridClip('day7-end', [[[183.3483, R + '20261009T144540Z-wc-end-orig.mov'], [111.8933, R + '20261009T141903Z-wc-end-g0l.mov']]], 102,
  'before (original site)', 'after (final build g0.0l)', '-12/60',
  `iPhone 15 Pro Max\\, end of page\\, open push - ${SPEED} - ms after the menu moves`, null);
gridClip('opening-end', [[[183.348, R + '20261009T144540Z-wc-end-orig.mov'], [111.893, R + '20261009T141903Z-wc-end-g0l.mov']]], 80,
  'before (original site)', 'after (final build g0.0l)', '+-0.2',
  `iPhone 15 Pro Max - ${SPEED} - ms after the menu starts to move`, ['4/4  End of the page - one push opens the menu (both runs at Critical heat)'], 26);
gridClip('day5-hero', [[[50.4, R + '20261009T132512Z-wc-hero-orig.mov'], [95.571, R + '20261009T132633Z-wc-hero-g0l.mov']]], 432,
  'before (original site)', 'after (final build g0.0l)', '',
  `iPhone 15 Pro Max - Safari - three slow drags - ${SPEED} - ms into the clip`, ['From the top of the page - the hero cards move out - the People section fades in'], 24);
gridClip('day3-carousel', [[[36.9, R + '20261010T042754Z-ar-carousel-orig.mov'], [20.44, R + '20261010T042903Z-ar-carousel-g0m.mov']]], 252,
  'before (original site)', 'after (final build g0.0m)', '+0',
  `iPhone 15 Pro Max - Safari - page at rest - ${SPEED} - ms into the clip`, ['The People section at rest - the profile photos in the pill change about every second'], 24);
gridClip('day8-ptitle', [[[49.53, R + '20261010T071845Z-ar-ptitle-orig.mov'], [26.02, R + '20261010T071753Z-ar-ptitle-g0m.mov']]], 240,
  'before (original site)', 'after (final build g0.0m)', '-1.8',
  `iPhone 15 Pro Max - Safari - same robot drag on both - ${SPEED} - ms after the o starts to open`, ['People still need people - a slow drag back up to the title\\, then its o opens into faces'], 24);
gridClip('day8-menu', [
  [[80.4, R + '20261010T041207Z-ar-menu-orig.mov'], [76.68, R + '20261010T041016Z-ar-menu-v14.mov']],
  [[88.01, R + '20261010T041207Z-ar-menu-orig.mov'], [84.17, R + '20261010T041016Z-ar-menu-v14.mov']]], 264,
  'before (original site)', 'after (v14)', '+-0.2',
  `iPhone 15 Pro Max - Safari - same robot push on both - ${SPEED} - ms after the push starts`,
  ['1/2  End of the page - one slow push up opens the menu', '2/2  One slow push down closes it again'], 26);

const q = (s) => s;
const cmds = {};
for (const c of CLIPS) {
  writeFileSync(`${dir}/${c.name}.txt`, c.g.join(';\n') + '\n');
  const ins = c.inputs.map(([ss, p]) => `-ss ${ss} -t ${c.t.toFixed(2)} -i ${q(p)}`).join(' ');
  cmds[c.name] = `ffmpeg -nostdin -v error -y ${ins} -filter_complex_script ${q(`${dir}/${c.name}.txt`)} -map "[out]" ` +
    `-c:v libx264 -preset slow -crf ${CRF} -pix_fmt yuv420p -r 60 -movflags +faststart -an ${q(OUT + c.name + '-60fps.mp4')}`;
  console.log(c.name, c.frames, c.window);
}
writeFileSync(`${dir}/clips.json`, JSON.stringify(CLIPS.map(({ name, frames, window }) => ({ name, frames, window })), null, 1));
writeFileSync(`${dir}/cmds.json`, JSON.stringify(cmds, null, 1));

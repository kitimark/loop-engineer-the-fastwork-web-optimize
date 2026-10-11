// art-join-closeup: writes an ffmpeg filter graph for one side-by-side close-up GIF (N panels).
// usage: node graph.mjs <spec.json> <out filter file>   (SHEET=n: a contact sheet of every n-th frame instead)
// spec: { crop:[w,h,x,y], scale (panel width after crop, optional), P: video s per gif s, lead: gif s before the first
//   change, from: real s skipped after it, real: real s shown, hold: gif s held at the end, fps, colors, dither, line,
//   foot, sides:[{label, first}] } (first = s into the video of the first change)
import { readFileSync, writeFileSync } from 'node:fs';
const [specF, out] = process.argv.slice(2);
const S = JSON.parse(readFileSync(specF, 'utf8'));
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', SLOW = 3;
const [CW, CH, X, Y] = S.crop, TOP = 46, GUT = 24, M = 16;
const W = S.scale || CW, H = Math.round(CH * W / CW / 2) * 2;
const n = S.sides.length, gifDur = S.lead + S.real * SLOW;
const g = S.sides.map((s, i) => {
  const a = Math.max(0, s.first + (S.from || 0) * SLOW * S.P - S.lead * S.P), b = gifDur * S.P;
  return `[${i}:v]trim=start=${a.toFixed(4)}:duration=${b.toFixed(4)},setpts=(PTS-STARTPTS)/${S.P},crop=${CW}:${CH}:${X}:${Y},` +
    (S.scale ? `scale=${W}:${H}:flags=lanczos,` : '') + `fps=${S.fps},` +
    (S.line != null ? `drawbox=x=${S.line}:y=0:w=2:h=ih:color=red@0.6:t=fill,` : '') +
    `pad=${W + (i < n - 1 ? GUT : 0)}:${H + TOP}:0:${TOP}:color=white,` +
    `drawtext=${F}:text='${s.label}':x=0:y=12:fontsize=24:fontcolor=0x17221e,` +
    `drawtext=${F}:text='%{eif\\:(t-${S.lead})*1000/${SLOW}+${(S.from || 0) * 1000}\\:d} ms':x=${W}-tw:y=16:fontsize=18:fontcolor=0x50605a[h${i}]`;
});
const ins = S.sides.map((_, i) => `[h${i}]`).join('');
if (process.env.SHEET) g.push(`${ins}hstack=inputs=${n},select='not(mod(n\\,${process.env.SHEET}))',scale=iw/2:-1,tile=2x10`);
else g.push(`${ins}hstack=inputs=${n},pad=iw+${2 * M}:ih+${M + 40}:${M}:${M}:color=white,` +
  `drawtext=${F}:text='${S.foot}':x=${M}:y=h-30:fontsize=16:fontcolor=0x50605a,` +
  `tpad=stop_mode=clone:stop_duration=${S.hold},split[s0][s1];` +
  `[s0]palettegen=max_colors=${S.colors}:stats_mode=${S.stats || 'full'}[p];[s1][p]paletteuse=dither=${S.dither || 'bayer:bayer_scale=4'}:diff_mode=rectangle`);
writeFileSync(out, g.join(';\n') + '\n');
console.log(`gif ${(gifDur + S.hold).toFixed(2)} s, width ${n * W + (n - 1) * GUT + 2 * M}, height ${H + TOP + M + 40}`);

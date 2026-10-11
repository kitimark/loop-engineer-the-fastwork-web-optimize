// Writes ffmpeg filter graphs for 2-row still strips (before/after, 5 frames 100 ms apart) from two recordings.
// Each pre chain ends on a 60 Hz grid whose frame 0 is the event's zero (ms 0), same zero as art-gif-pb's GIFs.
// usage: node strip.mjs <outdir>
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc';
const FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
function graph(pre0, pre1, S, footer) {
  const f0 = Math.round(S * 60 / 1000);
  const row = (i, pre, label) => `[${i}:v]${pre},trim=start_frame=${f0}:end_frame=${f0 + 25},setpts=PTS-STARTPTS,select='not(mod(n\\,6))',` +
    `crop=1290:2295:0:162,scale=228:406:flags=lanczos,setsar=1,pad=228:434:0:28:color=white,` +
    `drawtext=${F}:text='+%{eif\\:${S}+n*100\\:d} ms':x=(w-tw)/2:y=6:fontsize=17:fontcolor=0x444444,` +
    `tile=5x1:padding=8:color=white,pad=1188:ih+40:8:40:color=white,drawtext=${FB}:text='${label}':x=8:y=12:fontsize=22:fontcolor=black[r${i}]`;
  return [row(0, pre0, 'before (original site)'), row(1, pre1, 'after (final build g0.0l)'),
    `[r0][r1]vstack=inputs=2,pad=1188:ih+44:0:0:color=white,drawtext=${F}:text='${footer}':x=(w-tw)/2:y=h-30:fontsize=15:fontcolor=0x444444`].join(';\n') + '\n';
}
const tr = (k) => `trim=start_frame=${k},setpts=PTS-STARTPTS,fps=60`;
const grid = 'setpts=PTS-STARTPTS,fps=60,trim=start_frame=12,setpts=PTS-STARTPTS';
writeFileSync(`${dir}/hero.txt`, graph(tr(44), tr(43), 1300, 'iPhone 15 Pro Max - Safari - slow drag 2 of 3 at the top of the page - ms after the drag starts on screen'));
writeFileSync(`${dir}/people.txt`, graph(tr(83), tr(85), 300, 'iPhone 15 Pro Max - Safari - one fast flick from the top - ms after the flick starts on screen'));
writeFileSync(`${dir}/end.txt`, graph(grid, grid, 0, 'iPhone 15 Pro Max - Safari - end of the page - one push opens the menu - ms after the menu starts to move'));

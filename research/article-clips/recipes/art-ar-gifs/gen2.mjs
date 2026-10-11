// art-ar-gifs: People title v2 GIFs (same look as gen.mjs). Zero = first frame where the "o" starts to open
// (by eye, 100 ms sheets: orig 071845Z 51.33 s, g0m 071753Z 27.82 s; both = held mark - 0.20 s).
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/';
const O = 'out/article-gifs/';
const F = 'fontfile=/System/Library/Fonts/Helvetica.ttc', FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc';
const A = '20261010T071845Z-ar-ptitle-orig.mov', B = '20261010T071753Z-ar-ptitle-g0m.mov';
const Z = [51.33, 27.82];
const BA = 'before (original site)', AG = 'after (final build g0.0m)';
const pre = (i, n) => `[${i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=${n},setpts=PTS-STARTPTS`;
const pal = (c, b = 5) => `split[s0][s1];[s0]palettegen=max_colors=${c}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${b}:diff_mode=rectangle`;
const inp = (lead, T) => [[A, Z[0] - lead], [B, Z[1] - lead]].flatMap(([f, s]) => ['-ss', s.toFixed(3), '-t', String(T), '-i', R + f]);
const jobs = [];
const job = (name, args, graph, out) => { writeFileSync(`${dir}/${name}.txt`, graph + '\n'); jobs.push(`ffmpeg -nostdin -v error -y ${args.map((a) => `'${a}'`).join(' ')} -filter_complex_script ${dir}/${name}.txt ${out}`); };
// 50 fps: from 1.8 s before the "o" starts (title coming back down) to 2.2 s after, full view side by side
{
  const L = 1.8, N = 240, T = (N / 60 + 0.3).toFixed(2);
  const half = (i, lab, w) => `${pre(i, N)},crop=1290:2295:0:162,scale=398:708:flags=lanczos,setsar=1,pad=${w}:736:0:28:color=white,` +
    `drawtext=${F}:text='${lab}':x=8:y=7:fontsize=15:fontcolor=black,drawtext=${F}:text='%{eif\\:round((t-${L})*1000)\\:d} ms':x=398-tw-8:y=8:fontsize=13:fontcolor=0x444444[h${i}]`;
  const g = [half(0, BA, 402), half(1, AG, 398),
    `[h0][h1]hstack=inputs=2,pad=800:784:0:0:color=white,drawtext=${FB}:text='People still need people - a slow drag back up to the title, then its o opens into faces':x=(w-tw)/2:y=h-46:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - same robot drag on both - 1.2x slower (60 fps phone frames at 50 fps) - ms after the o starts to open':x=(w-tw)/2:y=h-22:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/50/TB,fps=50,tpad=stop_mode=clone:stop_duration=0.6,${pal(128)}`];
  job('pt50', inp(L, T), g.join(';\n'), O + 'day8-ptitle-50fps.gif');
}
// 3x close-up on the title (device x 200..1090, y 480..800), rows stacked, 0.5 s before to 1.5 s after the "o" starts
{
  const L = 0.5, N = 120, T = (N / 60 + 0.3).toFixed(2);
  const row = (i, lab) => `${pre(i, N)},crop=890:320:200:480,scale=623:224:flags=lanczos,setsar=1,pad=643:256:10:30:color=white,drawtext=${F}:text='${lab}':x=10:y=7:fontsize=16:fontcolor=black,` +
    `drawtext=${F}:text='%{eif\\:round((t-${L})*1000)\\:d} ms':x=w-tw-10:y=8:fontsize=14:fontcolor=0x444444[r${i}]`;
  const g = [row(0, BA), row(1, AG), `[r0][r1]vstack=inputs=2,pad=643:ih+50:0:0:color=white,drawtext=${FB}:text='Close-up - the o in People opens into a row of faces':x=(w-tw)/2:y=h-44:fontsize=15:fontcolor=black,` +
    `drawtext=${F}:text='iPhone 15 Pro Max - Safari - 3x slower (60 fps phone frames at 20 fps) - ms after the o starts to open':x=(w-tw)/2:y=h-21:fontsize=12:fontcolor=0x444444,` +
    `setpts=N/20/TB,fps=20,tpad=stop_mode=clone:stop_duration=1.0,${pal(128, 3)}`];
  job('pt3x', inp(L, T), g.join(';\n'), O + 'day8-ptitle-3x.gif');
}
writeFileSync(`${dir}/run3.sh`, `set -e\n${jobs.join('\n')}\nls -la ${O}day8-ptitle-*\necho EXIT 0\n`);
console.log(jobs.length, 'jobs');

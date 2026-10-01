// ca-check video analysis: decode the screen recording at 430 px width (1 px = 1 CSS px), find the page's top bar
// (grey #888 / red #d00 = block), then per lane (11 rows of 55 CSS px below the 22 px bar) the mean absolute frame
// difference. A lane "moves" in a frame when its diff > THR. Report, per block window (bar red), how many frames
// each lane moved, plus the same for the 1 s before the block as a reference.
// usage: node caan.mjs <video.mov> [out.json]
import { spawn } from 'node:child_process';
import { writeFileSync, statSync, readFileSync } from 'node:fs';
const [video, outJson] = process.argv.slice(2);
const isDir = statSync(video).isDirectory(); // WDA screenshot directory (wdacap.mjs): NNNN.png + times.json
const src = isDir ? `${video}/%04d.png` : video;
const inArgs = isDir ? ['-framerate', '10', '-start_number', '0', '-i', src] : ['-i', video];
const W = 430, LANES = ['Ta', 'Tb', 'Tc', 'Fa', 'Fb', 'Fc', 'D1', 'D2', 'E', 'S', 'W'];
const probe = await new Promise((res) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', isDir ? `${video}/0000.png` : video]); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => res(o.trim())); });
const [vw, vh] = probe.split(',').map(Number);
const H = Math.round((vh * W) / vw / 2) * 2;
const FR = W * H * 3;
console.log(`video ${vw}x${vh} -> ${W}x${H}; ${probe}`);
const ff = spawn('ffmpeg', ['-v', 'error', ...inArgs, '-vf', `scale=${W}:${H},format=rgb24`, '-vsync', 'passthrough', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
const ptsDone = isDir ? Promise.resolve() : null; const ptsP = isDir ? null : spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', video]); const ptsClosed = ptsP ? new Promise((r) => ptsP.on('close', r)) : ptsDone;
let ptsTxt = ''; if (ptsP) ptsP.stdout.on('data', (d) => (ptsTxt += d));
let buf = Buffer.alloc(0), prev = null, top = null, n = 0;
const rows = []; // per frame: {bar: 'grey'|'red'|'?', diff: [lane diffs]}
const px = (f, x, y) => { const i = (y * W + x) * 3; return [f[i], f[i + 1], f[i + 2]]; };
const isGrey = ([r, g, b]) => Math.abs(r - 136) < 30 && Math.abs(g - 136) < 30 && Math.abs(b - 136) < 30;
const isRed = ([r, g, b]) => r > 160 && g < 60 && b < 60;
const findTop = (f) => { for (let y = 0; y < H - 600; y++) { let ok = 0; for (let x = 200; x < 420; x += 10) { const p = px(f, x, y); if (isGrey(p) || isRed(p)) ok++; } if (ok >= 20) return y; } return null; };
const onFrame = (f) => {
  if (top === null) top = findTop(f);
  if (top === null) { rows.push({ bar: '?', diff: null }); prev = f; return; }
  const bp = px(f, 400, top + 9); const bar = isRed(bp) ? 'red' : isGrey(bp) ? 'grey' : '?';
  const diff = LANES.map((_, k) => {
    if (!prev) return 0;
    const y0 = top + 22 + 55 * k + 2, y1 = y0 + 50; let s = 0, c = 0;
    for (let y = y0; y < y1; y += 2) for (let x = 24; x < W; x += 2) { const i = (y * W + x) * 3; s += Math.abs(f[i] - prev[i]) + Math.abs(f[i + 1] - prev[i + 1]) + Math.abs(f[i + 2] - prev[i + 2]); c++; }
    return Math.round((s / c) * 100) / 100;
  });
  rows.push({ bar, diff }); prev = f;
};
ff.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); while (buf.length >= FR) { onFrame(buf.subarray(0, FR)); buf = buf.subarray(FR); n++; } });
await new Promise((r) => ff.on('close', r));
await ptsClosed;
const pts = isDir ? JSON.parse(readFileSync(`${video}/times.json`, 'utf8')).times.filter((t) => t[0] >= 0).map((t) => t[2] / 1000) : ptsTxt.trim().split('\n').map(Number);
const THR = Number(process.env.THR || 0.3);
// block windows = runs of red bar
const blocks = []; let s = -1;
rows.forEach((r, i) => { if (r.bar === 'red' && s < 0) s = i; if (r.bar !== 'red' && s >= 0) { blocks.push([s, i - 1]); s = -1; } });
if (s >= 0) blocks.push([s, rows.length - 1]);
const res = { video, frames: rows.length, top, thr: THR, blocks: [] };
for (const [a, b] of blocks) {
  const dur = pts[b] != null && pts[a] != null ? Math.round((pts[b] - pts[a]) * 1000) : null;
  const pre = rows.slice(Math.max(1, a - Math.round(((b - a + 1) * 1000) / Math.max(1, dur || 1000))), a);
  const inb = rows.slice(a + 1, b + 1); // frames whose diff vs the previous frame lies inside the red window
  const moved = (set) => Object.fromEntries(LANES.map((l, k) => [l, set.filter((r) => r.diff && r.diff[k] > THR).length]));
  const blk = { startFrame: a, endFrame: b, startT: pts[a], durMs: dur, frames: inb.length, movedInBlock: moved(inb), movedBefore: moved(pre), framesBefore: pre.length,
    maxDiffInBlock: Object.fromEntries(LANES.map((l, k) => [l, Math.max(0, ...inb.map((r) => (r.diff ? r.diff[k] : 0)))])) };
  res.blocks.push(blk);
  console.log(`block @${pts[a]?.toFixed(2)}s ${dur} ms (${inb.length} fr) moved frames in block: ${LANES.map((l) => `${l}:${blk.movedInBlock[l]}`).join(' ')} | before (${pre.length} fr): ${LANES.map((l) => `${l}:${blk.movedBefore[l]}`).join(' ')}`);
}
if (!blocks.length) console.log('no red block window found; top bar row', top);
if (outJson) writeFileSync(outJson, JSON.stringify({ ...res, rows: rows.map((r, i) => [pts[i], r.bar, r.diff]) }));

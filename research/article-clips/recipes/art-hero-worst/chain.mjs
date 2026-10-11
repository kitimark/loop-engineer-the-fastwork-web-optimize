// art-hero-worst: phone rAF frames of a wc-hero run mapped to .mov seconds (same clock chain as wc-offsets.mjs).
// usage: node chain.mjs <run> [minDt=34] -> JSON lines; prints drag starts and frames > minDt with movS
import fs from 'node:fs';
const W = '.claude/worktrees/agent-a4147eb3c10989361/';
const [run, minS = '34'] = process.argv.slice(2);
const stamps = fs.readFileSync(W + 'out/wc/runs/stamps.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const rec = JSON.parse(fs.readFileSync(W + `out/wc/runs/${run}.json`, 'utf8'));
const fr = JSON.parse(fs.readFileSync(W + `out/iphone-screen/${run}.frames.json`, 'utf8')).frames;
const st = stamps.find((s) => s.label === `${run}-rec`) || stamps.find((s) => s.label === `${run}-pre`);
const upMinusWallMs = (st.upRawNs - st.wallNs) / 1e6;
const seg = rec.run.segments.find((s) => (s.marks || []).length);
const offs = seg.sync.map(([a, p, c]) => (a + c) / 2 - p);
const wallMinusPerf = median(offs);
const halfRtt = seg.sync.map(([a, , c]) => (c - a) / 2);
const pts0 = fr[0][0];
const toMov = (t) => (t + wallMinusPerf + upMinusWallMs) / 1000 - pts0;
const mk = Object.fromEntries(seg.marks.map(([t, n]) => [n, t]));
console.log(run, 'sync n', offs.length, 'offset spread ms', (Math.max(...offs) - Math.min(...offs)).toFixed(1), 'halfRTT median', median(halfRtt).toFixed(1), 'max', Math.max(...halfRtt).toFixed(1), 'stamp label', st.label);
console.log('marks', Object.entries(mk).map(([n, t]) => `${n}@${toMov(t).toFixed(3)}`).join(' '));
const f = seg.frames.filter((x) => x[0] >= mk.fade && x[0] <= mk.end);
const starts = []; let still = 0;
for (let i = 1; i < f.length; i++) { const dy = Math.abs(f[i][2] - f[i - 1][2]); if (dy >= 0.5) { if (still >= 150 || !starts.length) starts.push(f[i - 1][0]); still = 0; } else still += f[i][0] - f[i - 1][0]; }
console.log('drag starts movS', starts.map((t) => toMov(t).toFixed(3)).join(' '));
const out = f.filter((x) => x[1] > +minS).map((x) => ({ movS: +toMov(x[0]).toFixed(3), prevMovS: +toMov(x[0] - x[1]).toFixed(3), dt: Math.round(x[1]), y: Math.round(x[2]) }));
for (const o of out) console.log(JSON.stringify(o));
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(f.map((x) => [+toMov(x[0]).toFixed(4), +x[1].toFixed(1), +x[2].toFixed(1)])));

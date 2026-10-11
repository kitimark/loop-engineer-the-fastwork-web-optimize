// art-d2d5 read.mjs (2026-10-11): frame counts of the -ar-herocatch4- runs from the phone's own rAF log, the window of
// Fig. 14 / src-24 and fixes/worst-cases-capture/wc-read.mjs case herocatch: (mark finger, mark end]. A frame
// [t, dt, scrollY, innerHeight] counts when t is in the window. Phone thresholds: > 34 and > 50 ms with the +-4 ms twins
// (30/38, 46/54), > 100 ms, longest; Fig. 14's bins (<= 16.7, 34, 50, 100, 200, over). Numbers only; prints no URL.
// usage (repo root): node research/article-clips/recipes/art-d2d5/read.mjs [out/wc/runs] [--json out/d2d5/read.json]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const dir = args.find((a, i) => !a.startsWith('--') && i !== ji + 1) || 'out/wc/runs';
const c = (fr, x) => fr.filter((f) => f[1] > x).length;
const mark = (seg, n) => (seg.marks || []).find((m) => m[1] === n)?.[0];
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => /-ar-herocatch4-(orig|aw1|v6)\.json$/.test(x)).sort()) {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const segs = rec.run?.segments || [];
  const seg = segs.find((s) => (s.marks || []).length) || segs[0];
  if (!seg) { rows.push({ file: f, error: 'no segment' }); continue; }
  const end = seg.frames.length ? seg.frames[seg.frames.length - 1][0] : null;
  const a = mark(seg, 'finger'), b = mark(seg, 'end') ?? end;
  const fr = seg.frames.filter((x) => x[0] > a && x[0] <= b);
  const edges = [16.7, 34, 50, 100, 200];
  const bins = edges.map((e, i) => fr.filter((x) => x[1] > (i ? edges[i - 1] : -1) && x[1] <= e).length).concat([c(fr, 200)]);
  const p = rec.meta?.profile || {};
  let cap = null;
  try { const s = JSON.parse(fs.readFileSync(path.join('out/iphone-screen', f), 'utf8')); cap = { frames: s.frames ?? s.result?.frames ?? null, distinctFps: s.distinctFps ?? s.result?.distinctFps ?? null }; } catch { /* none */ }
  rows.push({ file: f.replace(/\.json$/, ''), arm: f.match(/-(orig|aw1|v6)\.json$/)[1],
    thermal: { start: p.start ? `${p.start.state} ${p.start.battC}` : null, end: p.end ? `${p.end.state} ${p.end.battC}` : null, drift: !!p.drift },
    load1: [rec.meta?.mac?.start?.load1, rec.meta?.mac?.end?.load1], errors: (rec.run?.errors || []).length, aborted: !!rec.run?.aborted,
    windowS: a != null && b != null ? +((b - a) / 1000).toFixed(1) : null,
    n: fr.length, gt30: c(fr, 30), gt34: c(fr, 34), gt38: c(fr, 38), gt46: c(fr, 46), gt50: c(fr, 50), gt54: c(fr, 54), gt100: c(fr, 100),
    max: fr.length ? Math.max(...fr.map((x) => x[1])) : null, bins, capture: cap });
}
for (const r of rows) {
  if (r.error) { console.log(r.file, r.error); continue; }
  console.log(`${r.file}  ${r.thermal.start} -> ${r.thermal.end}${r.thermal.drift ? ' DRIFT' : ''}  load1 ${r.load1.join('/')}  err ${r.errors}${r.aborted ? ' ABORTED' : ''}  ` +
    `window ${r.windowS} s  frames ${r.n}  >34 ${r.gt34} (${r.gt30}/${r.gt38})  >50 ${r.gt50} (${r.gt46}/${r.gt54})  >100 ${r.gt100}  max ${r.max}  bins ${r.bins.join('/')}  rec ${r.capture?.frames ?? '-'} fr`);
}
if (ji >= 0) fs.writeFileSync(args[ji + 1], JSON.stringify({ readAt: new Date().toISOString(), rows }, null, 1));

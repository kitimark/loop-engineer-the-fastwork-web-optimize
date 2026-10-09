// Worst-case captures (cap-worst, 2026-10-09): where the driver's marks (flick, fade, approach, E-pushes ...) fall in
// each screen recording, as seconds from the recording's first frame. Numbers only; reads no picture.
// Clock chain (as phone-clips.mjs, art-worst-cases): page performance.now() -> Mac wall ms (the gesture's sync pairs
// [wallBefore, perf, wallAfter], median offset) -> CLOCK_UPTIME_RAW (stamps.jsonl, written by wc-hold.sh around each
// run: wallNs + upRawNs) -> the recorder's PTS (out/iphone-screen/<run>.frames.json, seconds; that PTS is on the
// host's uptime clock is OBSERVED, not confirmed). No numbers-only cross-check: in these recordings every frame's content
// hash differs from the previous one (2068 of 2068 in the first people run), so hash bursts can't mark motion; whoever
// exports pictures checks the first stroke against the predicted time by eye.
// usage: node fixes/worst-cases-capture/wc-offsets.mjs [--json out/wc/offsets.json]
import fs from 'node:fs';

const O = 'out/wc/runs', S = 'out/iphone-screen';
const ji = process.argv.indexOf('--json');
const stamps = fs.readFileSync(`${O}/stamps.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const out = [];
for (const f of fs.readdirSync(O).filter((x) => /-wc-[a-z]+-(orig|g0l)\.json$/.test(x)).sort()) {
  const L = f.replace(/\.json$/, '');
  let rec, fr;
  try { rec = JSON.parse(fs.readFileSync(`${O}/${f}`, 'utf8')); fr = JSON.parse(fs.readFileSync(`${S}/${L}.frames.json`, 'utf8')).frames; } catch { continue; }
  const st = stamps.find((s) => s.label === `${L}-rec`) || stamps.find((s) => s.label === `${L}-pre`);
  if (!st || !fr?.length) continue;
  const upMinusWallMs = (st.upRawNs - st.wallNs) / 1e6;
  const seg = (rec.run?.segments || []).find((s) => (s.marks || []).length);
  if (!seg?.sync?.length) continue;
  const wallMinusPerf = median(seg.sync.map(([a, p, c]) => (a + c) / 2 - p));
  const pts0 = fr[0][0];
  const toMov = (perfMs) => (perfMs + wallMinusPerf + upMinusWallMs) / 1000 - pts0;
  const marks = seg.marks.map(([t, name]) => ({ name, movS: Math.round(toMov(t) * 100) / 100 }));
  const lastPts = fr[fr.length - 1][0] - pts0;
  out.push({ run: L, movSeconds: Math.round(lastPts * 10) / 10, segStartMovS: Math.round(toMov(seg.t0 ?? 0) * 100) / 100, marks });
  console.log(`${L}  mov ${lastPts.toFixed(1)} s  page segment from ${toMov(seg.t0 ?? 0).toFixed(2)} s`);
  for (const m of marks) console.log(`  ${m.name.padEnd(28)} ${m.movS.toFixed(2).padStart(7)} s`);
}
if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));

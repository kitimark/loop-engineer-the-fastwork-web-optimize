// cap-end-openclose: g-ar-endoc-v1 marks AND the four pushes' WDA send/return times as seconds into each .mov
// (clock chain of wc-offsets.mjs: page perf -> Mac wall (sync pairs) -> CLOCK_UPTIME_RAW (stamps.jsonl) -> recorder PTS; OBSERVED)
import fs from 'node:fs';
const O = 'out/wc/runs', S = 'out/iphone-screen';
const stamps = fs.readFileSync(`${O}/stamps.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r2 = (x) => Math.round(x * 100) / 100;
const runs = [];
for (const f of fs.readdirSync(O).filter((x) => /-ar-endoc-(orig|g0m)\.json$/.test(x)).sort()) {
  const L = f.replace(/\.json$/, '');
  const rec = JSON.parse(fs.readFileSync(`${O}/${f}`, 'utf8'));
  const fr = JSON.parse(fs.readFileSync(`${S}/${L}.frames.json`, 'utf8')).frames;
  const st = stamps.find((s) => s.label === `${L}-rec`);
  const upMinusWallMs = (st.upRawNs - st.wallNs) / 1e6, pts0 = fr[0][0];
  const seg = rec.run.segments.find((s) => (s.marks || []).length);
  const wallMinusPerf = median(seg.sync.map(([a, p, c]) => (a + c) / 2 - p));
  const wallToMov = (w) => (w + upMinusWallMs) / 1000 - pts0;
  const perfToMov = (p) => wallToMov(p + wallMinusPerf);
  const marks = Object.fromEntries(seg.marks.map(([t, n]) => [n, r2(perfToMov(t))]));
  const o1 = marks['O1-open-fast-60px-50ms'];
  const pushes = rec.run.strokes.slice(-4).map((s, i) => ({ push: ['O1 open', 'C1 close', 'O2 open', 'C2 close'][i], dir: s.kin.dir, px: s.kin.px,
    sentMovS: r2(wallToMov(s.sentAt)), returnedMovS: r2(wallToMov(s.returnedAt)), sentAfterO1: r2(wallToMov(s.sentAt) - o1), httpMs: Math.round(s.httpMs) }));
  const p = rec.meta.profile;
  runs.push({ run: L, arm: L.endsWith('orig') ? 'A original' : 'V g0.0m', movSeconds: r2(fr[fr.length - 1][0] - pts0),
    thermal: { start: `${p.start.state} ${p.start.battC} C`, end: `${p.end.state} ${p.end.battC} C`, drift: !!p.drift },
    window: { from: 'O1-open-fast-60px-50ms', to: 'after-1s', startMovS: o1, endMovS: marks['after-1s'], seconds: r2(marks['after-1s'] - o1) },
    marks, marksAfterO1: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, r2(v - o1)])), pushes });
}
const out = { about: 'cap-end-openclose 2026-10-10, g-ar-endoc-v1 (hash 3d9f1908acf9): marks and pushes as seconds into each .mov (OBSERVED clock chain, as wc-offsets.mjs). One continuous window per run: window.startMovS (first open push mark) to window.endMovS (~1 s after the last close stroke returned). A push touches the glass between sentMovS and returnedMovS (WDA call).', runs };
fs.writeFileSync('out/wc/eo-offsets.json', JSON.stringify(out, null, 1));
for (const r of runs) {
  console.log(`${r.run} ${r.thermal.start} -> ${r.thermal.end}; window ${r.window.startMovS} -> ${r.window.endMovS} s (${r.window.seconds} s) of ${r.movSeconds} s`);
  for (const p of r.pushes) console.log(`   ${p.push.padEnd(8)} sent ${p.sentMovS} (+${p.sentAfterO1}) returned ${p.returnedMovS}  http ${p.httpMs} ms`);
}

// F-165 readout (fix-nav-morph): which WebKit Composite records repaint the countdown digit faces.
//   node fixes/morph-webkit/composite-faces.mjs <timeline record.json> ...   (iphone.mjs/sim.mjs Timeline files: {recs})
// Paint data.clip is a page-coordinate quad; a digit face is a clip < 25 px wide and 30-45 px tall (17-18 x 36-37 on
// the phone). A "full face repaint" is a Composite with >= 70 such Paint children (one 8-digit clock x 10 faces = 80).
// Records carry no layer or node id, so the element mapping is by geometry and count only.
import { readFileSync } from 'node:fs';

const box = (q) => {
  const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const isDigit = (b) => b.w < 25 && b.h > 30 && b.h < 45;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length / 2)].toFixed(1) : null; };

for (const f of process.argv.slice(2)) {
  const t = JSON.parse(readFileSync(f, 'utf8'));
  const cs = [];
  const walk = (r) => { if (r.type === 'Composite') cs.push(r); for (const c of r.children || []) walk(c); };
  for (const r of t.recs) walk(r.record || r);
  const rows = cs.map((c) => {
    const ps = (c.children || []).filter((p) => p.type === 'Paint' && p.data?.clip);
    const dg = ps.map((p) => box(p.data.clip)).filter(isDigit);
    return { t: c.startTime, dur: (c.endTime - c.startTime) * 1000, nd: dg.length, ymin: dg.length ? Math.min(...dg.map((b) => b.y)) : null,
      pms: ps.reduce((s, p) => s + (p.endTime - p.startTime) * 1000, 0) };
  });
  const full = rows.filter((r) => r.nd >= 70), part = rows.filter((r) => r.nd > 0 && r.nd < 70), none = rows.filter((r) => r.nd === 0);
  const over = (a, ms) => a.filter((r) => r.dur > ms).length;
  console.log(f.split('/').pop(), JSON.stringify({
    composites: rows.length, over50: over(rows, 50), over34: over(rows, 34),
    fullFaceRepaints: full.length, fullOver50: over(full, 50), fullOver34: over(full, 34), fullMedianMs: med(full.map((r) => r.dur)),
    fullPaintMsMedian: med(full.map((r) => r.pms)), fullPageY: full.length ? [Math.round(Math.min(...full.map((r) => r.ymin))), Math.round(Math.max(...full.map((r) => r.ymin)))] : null,
    partialDigitMedianMs: med(part.map((r) => r.dur)), noDigitMedianMs: med(none.map((r) => r.dur)),
    over50WithoutFull: rows.filter((r) => r.dur > 50 && r.nd < 70).map((r) => `${r.t.toFixed(1)}s ${r.dur.toFixed(0)}ms nd${r.nd}`),
  }));
}

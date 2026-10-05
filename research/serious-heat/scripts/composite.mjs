// What else runs inside the Timeline "Composite" windows that hold no-stack invalidations (DESCRIPTIVE, post hoc).
// On Cocoa the Composite record stays open from willStartRenderingUpdateDisplay until the commit queue's flush posts
// back to the main run loop, so it nests whatever main-thread work ran meanwhile. Per Composite record that starts in a
// heavy / control / out-of-view step frame: duration, and descendant types (EventDispatch with its event type).
//   node composite.mjs <sim125 dir> <read-inval126.mjs path>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, readerPath] = process.argv.slice(2);
const { loadRun } = await import(readerPath);
const names = ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5', 'wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'];
const A = {};
for (const n of names) {
  const R = loadRun(dir, n), fr = R.frames;
  const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8'));
  const off = tl.offsetMs || 0;
  const cls = (q) => (q.heavy ? 'heavy' : q.ctrl ? 'ctrl' : q.moving && q.view !== 1 && q.y < 3250 ? 'outStep' : null);
  const idx = (w) => fr.findIndex((q) => w > q.t - q.dt && w <= q.t);
  const visit = (r) => {
    if (r.type === 'Composite') {
      const i = idx(r.startTime * 1000 - off), c = i >= 0 ? cls(fr[i]) : null;
      if (c) {
        const a = (A[c] ||= { n: 0, dur: [], withNoStack: 0, desc: {} });
        a.n++; if (r.endTime != null) a.dur.push((r.endTime - r.startTime) * 1000);
        const seen = new Set(); let ns = 0;
        const d = (x) => { for (const ch of x.children || []) { const k = ch.type === 'EventDispatch' ? `EventDispatch:${ch.data?.type}` : ch.type === 'ObserverCallback' ? `ObserverCallback:${ch.data?.type}` : ch.type; seen.add(k); if ((ch.type === 'ScheduleStyleRecalculation' || ch.type === 'InvalidateLayout') && !ch.stackTrace) ns++; d(ch); } };
        d(r);
        if (ns) { a.withNoStack++; for (const k of seen) a.desc[k] = (a.desc[k] || 0) + 1; }
      }
    }
    for (const ch of r.children || []) visit(ch);
  };
  for (const r of tl.recs || []) visit(r);
}
for (const [c, a] of Object.entries(A)) {
  const d = a.dur.sort((x, y) => x - y);
  console.log(`${c}: Composite records ${a.n}, median ${d[d.length >> 1]?.toFixed(1)} ms, p90 ${d[Math.floor(d.length * 0.9)]?.toFixed(1)} ms; with no-stack invalidations inside: ${a.withNoStack}`);
  console.log('   descendant types in those (count of Composite records):', JSON.stringify(Object.fromEntries(Object.entries(a.desc).sort((x, y) => y[1] - x[1]))));
}

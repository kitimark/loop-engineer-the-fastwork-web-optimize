// Split of P-126's no-stack surplus (DESCRIPTIVE, post hoc, decides nothing; lead's 4c, 2026-10-05).
// Reads the P-125 Simulator Timeline captures (out/toolbar-resize/sim125 in fix-toolbar-resize's worktree) with the
// frozen frame rules of read-inval126.mjs (loadRun: heavy = moving, y<3250, in view, Layout >= 10 ms; control = in-view
// rest). Every ScheduleStyleRecalculation / InvalidateLayout record WITHOUT stackTrace in a frame's own interval is
// split by: record type; context (the chain of ancestor record types, top first); whether a dom-call record (one
// "[native code]" frame) started earlier in the same frame; and, for heavy frames, whether it starts before or after
// the start of the frame's largest outer Layout.
//   node nostack.mjs <sim125 dir> <read-inval126.mjs path>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, readerPath] = process.argv.slice(2);
const { loadRun } = await import(readerPath);
const sets = { C: ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5'], R: ['wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'] };
const out = {};
for (const [lab, names] of Object.entries(sets)) {
  const A = { heavy: {}, ctrl: {}, outStep: {}, F: { heavy: 0, ctrl: 0, outStep: 0 }, dataKeys: {} };
  for (const n of names) {
    const R = loadRun(dir, n), fr = R.frames;
    const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8'));
    const recs = [];
    const walk = (r, anc) => {
      recs.push({ type: r.type, t: r.startTime * 1000 - (tl.offsetMs || 0), st: r.stackTrace, anc, data: r.data || {} });
      for (const c of r.children || []) walk(c, [...anc, r.type]);
    };
    for (const r of tl.recs || []) walk(r, []);
    recs.sort((a, b) => a.t - b.t);
    const idx = (w) => fr.findIndex((q) => w > q.t - q.dt && w <= q.t);
    const cls = (q) => (q.heavy ? 'heavy' : q.ctrl ? 'ctrl' : q.moving && q.view !== 1 && q.y < 3250 ? 'outStep' : null);
    fr.forEach((q) => { const c = cls(q); if (c) A.F[c]++; });
    const domSeen = new Map();
    for (const r of recs) {
      if (r.type !== 'ScheduleStyleRecalculation' && r.type !== 'InvalidateLayout') continue;
      const i = idx(r.t); if (i < 0) continue;
      const q = fr[i], c = cls(q);
      const f0 = r.st?.callFrames?.[0];
      if (f0) { if (f0.url === '[native code]') domSeen.set(i, true); continue; }
      if (!c) continue;
      for (const k of Object.keys(r.data)) A.dataKeys[`${r.type}.${k}`] = (A.dataKeys[`${r.type}.${k}`] || 0) + 1;
      const ctx = r.anc.length ? r.anc.join('>') : 'top-level';
      const phase = c === 'heavy' && q.L ? (r.t < q.L.t ? 'beforeLayout' : 'inOrAfterLayout') : '-';
      const key = `${r.type} | ${ctx} | ${domSeen.get(i) ? 'after dom-call' : 'no dom-call before'} | ${phase}`;
      A[c][key] = (A[c][key] || 0) + 1;
    }
  }
  const per = (o, F) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v} (${(v / F).toFixed(2)}/frame)`]));
  out[lab] = { frames: A.F, heavy: per(A.heavy, A.F.heavy), control: per(A.ctrl, A.F.ctrl), outOfViewStep: per(A.outStep, A.F.outStep), dataKeys: A.dataKeys };
}
console.log(JSON.stringify(out, null, 1));

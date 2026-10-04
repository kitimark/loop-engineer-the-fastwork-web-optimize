// P-091 post-hoc check of the RenderingFrame record nesting (fix-nav-morph; data only, reads Timeline files, never a device).
// Per Timeline file: FireAnimationFrame records with / without a RenderingFrame ancestor, top-level RecalculateStyles
// records (no RenderingFrame ancestor) and their total ms, and RenderingFrame records by parent (top level vs inside a
// Composite). It checks the OBSERVED claim "at Serious, WebKit records much of the rendering update outside any
// RenderingFrame record (RenderingFrame nested inside Composite)" against the 10-01 fixtures.
//   node fixes/nav-morph/rf-nesting.mjs <timeline.json>...
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  let T = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(T)) T = T[0];
  const c = { rafIn: 0, rafOut: 0, styleOut: 0, styleOutMs: 0, styleIn: 0, rfTop: 0, rfInComposite: 0, rfOther: 0 };
  const walk = (r, inRF, parent) => {
    if (r.type === 'FireAnimationFrame') inRF ? c.rafIn++ : c.rafOut++;
    if (r.type === 'RecalculateStyles') { if (inRF) c.styleIn++; else if (parent == null || parent.type !== 'RecalculateStyles') { c.styleOut++; c.styleOutMs += (r.endTime - r.startTime) * 1000; } }
    if (r.type === 'RenderingFrame') { if (!parent) c.rfTop++; else if (parent.type === 'Composite') c.rfInComposite++; else c.rfOther++; }
    for (const ch of r.children || []) walk(ch, inRF || r.type === 'RenderingFrame', r);
  };
  for (const r of T.recs) walk(r, false, null);
  c.styleOutMs = Math.round(c.styleOutMs);
  console.log(`${f.split('/').pop()}: rAF in RF ${c.rafIn} / outside ${c.rafOut}; RecalculateStyles in RF ${c.styleIn} / outside ${c.styleOut} (${c.styleOutMs} ms); RenderingFrame top-level ${c.rfTop}, inside Composite ${c.rfInComposite}, other parent ${c.rfOther}`);
}

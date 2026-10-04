#!/usr/bin/env node
// toolbar-resize: per-run mechanism evidence from the G records + Timelines (ops N1, N3).
//   node fixes/toolbar-resize/mech-tr.mjs <folder> <run> ...
// Per run: page height (segment docH / docH1), resize EventDispatch records (count, total ms, how many hold a
// Layout or a FunctionCall >= 0.5 ms, and the script lines of the handlers they ran), and the top FunctionCall script lines by count (to show which JS paths ran).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...runs] = process.argv.slice(2);
for (const n of runs) {
  const g = JSON.parse(readFileSync(join(dir, `g-${n}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8'));
  const seg = [...g.run.segments].sort((a, b) => b.frames.length - a.frames.length)[0];
  const ms = (r) => (r.endTime - r.startTime) * 1000;
  const rs = { n: 0, ms: 0, withLayout: 0, withCall: 0, lines: {} }, calls = {};
  const has = (r, f) => (r.children || []).some((c) => f(c) || has(c, f));
  const walk = (r) => {
    if (r.type === 'EventDispatch' && r.data?.type === 'resize' && r.endTime != null) {
      rs.n++; rs.ms += ms(r);
      if (has(r, (c) => c.type === 'Layout')) rs.withLayout++;
      if (has(r, (c) => c.type === 'FunctionCall' && c.endTime != null && ms(c) >= 0.5)) rs.withCall++;
      const inner = (x) => (x.children || []).forEach((c) => { if (c.type === 'FunctionCall' && c.data?.scriptLine) { const k = `${c.data.scriptLine}:${c.data.scriptColumn ?? ''}`; rs.lines[k] = (rs.lines[k] || 0) + 1; } inner(c); });
      inner(r);
    }
    if (r.type === 'FunctionCall' && r.data?.scriptLine) { const k = `${(r.data.scriptName || '').split('/').pop()}:${r.data.scriptLine}:${r.data.scriptColumn ?? ''}`; calls[k] = (calls[k] || 0) + 1; }
    (r.children || []).forEach(walk);
  };
  tl.recs.forEach(walk);
  const top = Object.entries(calls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} x${v}`).join(', ');
  console.log(`${n.padEnd(10)} docH ${seg.docH}->${seg.docH1} resize ${rs.n} (${rs.ms.toFixed(1)} ms, withLayout ${rs.withLayout}, withCall>=0.5ms ${rs.withCall}, handler lines ${JSON.stringify(rs.lines)}) | calls ${top}`);
}

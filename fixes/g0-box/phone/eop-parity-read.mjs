#!/usr/bin/env node
// Candidate 1 jack parity reader (fix-g0-box, lead 2026-10-09): reads Simulator gesture records of g-fling1600-g0.json /
// g-reloadend-g0.json (out/sim/fix-g0-box-gesture-<label>-<ts>.json, label eopp-<prog>-<arm>-<n>) and prints per record:
// the y range of the touchmoves before the "end-swipe" mark that were cancelable (= a non-passive touch listener was
// attached), the scrollY at the end-swipe's touchstart, and the end-swipe's moves: cancelable / prevented of all, and
// whether it opened (any prevented finger-up move, g0b-read's rule). Parity = the arm's end-swipe is held like g0.0h's.
// Usage: node fixes/g0-box/phone/eop-parity-read.mjs [label prefix, default eopp-]
import { readdirSync, readFileSync } from 'node:fs';
const D = new URL('../../../out/sim/', import.meta.url).pathname;
const pre = 'fix-g0-box-gesture-' + (process.argv[2] || 'eopp-');
for (const f of readdirSync(D).filter((x) => x.startsWith(pre)).sort()) {
  const g = JSON.parse(readFileSync(D + f, 'utf8'));
  let before = [], swipe = [], ySwipe = null;
  for (const s of g.run.segments) {
    const m = (s.marks || []).find((x) => x[1] === 'end-swipe'); const t = m ? m[0] : Infinity;
    for (const r of s.touches || []) { if (r[0] < t) before.push(r); else { swipe.push(r); if (r[1] === 's' && ySwipe == null) ySwipe = r[5]; } }
  }
  const mv = (a) => a.filter((r) => r[1] === 'm');
  const canc = mv(before).filter((r) => r[3] === 1).map((r) => r[5]);
  let prevY = null, opened = 0;
  for (const r of swipe) { if (r[1] === 's') { prevY = r[6]; continue; } if (r[1] !== 'm' || prevY == null) continue; if (prevY - r[6] > 0 && r[4] === 1) opened++; prevY = r[6]; }
  const sm = mv(swipe);
  console.log(`PARITY ${f.slice(pre.length - 5).replace(/-\d+\.json$/, '')}: aborted ${g.run.aborted ? 'YES' : 'no'} reloads ${g.run.reloads?.length ?? 0} | before end-swipe: cancelable moves ${canc.length} of ${mv(before).length}${canc.length ? ` (y ${Math.min(...canc)}-${Math.max(...canc)})` : ''} | end-swipe at y ${ySwipe}: moves ${sm.length}, cancelable ${sm.filter((r) => r[3] === 1).length}, prevented ${sm.filter((r) => r[4] === 1).length} -> ${opened ? 'HELD (opens)' : 'NOT held'}`);
}

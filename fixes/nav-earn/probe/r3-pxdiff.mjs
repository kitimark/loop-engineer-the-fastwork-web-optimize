#!/usr/bin/env node
// nav-earn rev 3: A vs R3 pixel diff of r3-probe.mjs nav-strip stills at the same trigger and time (levels > 8 count
// as different, pxlib's A/A convention; PR-010 wide numbers for a look-alike: fill 64, edge 128, 0.5 %).
//   node fixes/nav-earn/probe/r3-pxdiff.mjs out/nav-earn/r3-<tag> [...]   (PX_ARMS=A,R3)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels, delta } from '../../v8-best/gates/pxlib.mjs';
const [a1, a2] = (process.env.PX_ARMS || 'A,R3').split(',');
for (const d of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(join(d, 'probe.json'), 'utf8'));
  for (const vp of [...new Set(j.runs.map((r) => r.vp))]) {
    const A = j.runs.find((r) => r.vp === vp && r.arm === a1), B = j.runs.find((r) => r.vp === vp && r.arm === a2);
    if (!A || !B) continue;
    for (const seq of Object.keys(A.stills || {})) {
      const row = [];
      for (const sa of A.stills[seq]) {
        const sb = (B.stills[seq] || []).find((s) => s.ms === sa.ms); if (!sb) continue;
        const X = pngPixels(readFileSync(sa.strip)), Y = pngPixels(readFileSync(sb.strip));
        const dd = delta(X, Y); let n = 0, mx = 0, n64 = 0, n128 = 0;
        for (const v of dd) { if (v > 8) n++; if (v > 64) n64++; if (v > 128) n128++; if (v > mx) mx = v; }
        row.push({ ms: sa.ms, pct: +(100 * n / dd.length).toFixed(3), pct64: +(100 * n64 / dd.length).toFixed(3), pct128: +(100 * n128 / dd.length).toFixed(3), max: mx, wA: sa.earnW, wB: sb.earnW, opA: sa.op, opB: sb.op });
      }
      console.log(JSON.stringify({ pair: `${a1}~${a2}`, vp, seq, worstPct: Math.max(0, ...row.map((r) => r.pct)), worstPct64: Math.max(0, ...row.map((r) => r.pct64)), row }));
    }
  }
}

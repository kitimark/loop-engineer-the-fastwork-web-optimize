#!/usr/bin/env node
// nav-earn: A vs B full-frame pixel diff of earn-probe.mjs stills (same morph time), inside and outside the nav box
// (PX_ARMS=A,A2 for an A/A pair; union of both arms' nav rects, +4 CSS px). Levels > 8 count as different (pxlib's A/A convention).
//   node fixes/nav-earn/probe/pxdiff.mjs out/nav-earn/probe-<tag> [...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels, delta } from '../../v8-best/gates/pxlib.mjs';
for (const d of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(join(d, 'probe.json'), 'utf8'));
  const vps = [...new Set(j.runs.map((r) => r.vp))];
  for (const vp of vps) {
    const [a1, a2] = (process.env.PX_ARMS || 'A,B').split(',');
    const A = j.runs.find((r) => r.vp === vp && r.arm === a1), B = j.runs.find((r) => r.vp === vp && r.arm === a2);
    if (!A || !B) continue;
    const dpr = A.dpr;
    for (const sa of A.stills.filter((s) => s.full)) {
      const sb = B.stills.find((s) => s.ms === sa.ms && s.full); if (!sb) continue;
      const X = pngPixels(readFileSync(sa.full)), Y = pngPixels(readFileSync(sb.full));
      const dd = delta(X, Y);
      const x0 = Math.floor((Math.min(sa.nav.x, sb.nav.x) - 4) * dpr), y0 = Math.floor((Math.min(sa.nav.y, sb.nav.y) - 4) * dpr);
      const x1 = Math.ceil((Math.max(sa.nav.x + sa.nav.w, sb.nav.x + sb.nav.w) + 4) * dpr), y1 = Math.ceil((Math.max(sa.nav.y + sa.nav.h, sb.nav.y + sb.nav.h) + 4) * dpr);
      let inN = 0, inD = 0, outN = 0, outD = 0, outMax = 0, inMax = 0; const ob = [1e9, 1e9, -1, -1];
      for (let p = 0; p < dd.length; p++) {
        const x = p % X.w, y = (p / X.w) | 0, inside = x >= x0 && x < x1 && y >= y0 && y < y1;
        if (inside) { inN++; if (dd[p] > 8) inD++; if (dd[p] > inMax) inMax = dd[p]; } else { outN++; if (dd[p] > 8) { outD++; ob[0] = Math.min(ob[0], x); ob[1] = Math.min(ob[1], y); ob[2] = Math.max(ob[2], x); ob[3] = Math.max(ob[3], y); } if (dd[p] > outMax) outMax = dd[p]; }
      }
      console.log(JSON.stringify({ pair: a1 + '~' + a2, vp, ms: sa.ms, morphA: (+sa.morph || 0).toFixed(3), morphB: (+sb.morph || 0).toFixed(3),
        outsideNav: { px: outN, diffPct: outN ? +(100 * outD / outN).toFixed(4) : null, max: outMax, bboxCss: outD ? ob.map((v) => Math.round(v / dpr)) : null }, navCss: [x0, y0, x1, y1].map((v) => Math.round(v / dpr)),
        insideNav: { diffPct: +(100 * inD / inN).toFixed(3), max: inMax } }));
    }
  }
}

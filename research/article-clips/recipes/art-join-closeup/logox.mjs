// art-join-closeup: the logo glyph's left edge (device px) per exported band frame, for aligning recordings of
// different builds on the morph's own clock. usage: node logox.mjs <band dir> <showinfo log> <seek s> [x0 x1]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const { png } = await import('.claude/worktrees/agent-ae93aece29993f5ae/fixes/best-build/gates/lib.mjs');
const [dir, log, seek, x0s = '60', x1s = '640'] = process.argv.slice(2);
const pts = [...readFileSync(log, 'utf8').matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]) + Number(seek));
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const out = [];
files.forEach((f, i) => {
  const A = png(readFileSync(join(dir, f)));
  let x = null;
  for (let c = Number(x0s); c < Number(x1s) && x === null; c++) {
    let n = 0; for (let y = 0; y < A.h; y++) { const p = (y * A.w + c) * A.bpp; if (Math.min(A.px[p], A.px[p + 1], A.px[p + 2]) >= 250) n++; }
    if (n >= 4) x = c;
  }
  out.push([Number(pts[i].toFixed(4)), x]);
});
console.log(JSON.stringify(out));

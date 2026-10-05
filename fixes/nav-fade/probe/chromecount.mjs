#!/usr/bin/env node
// nav-fade Chrome count reader: per run folder of `motion.mjs --engine chrome --passes counts`, per arm and scene: style
// recalcs, layouts, frames, and paints of the Join button's layers (button.is-earn and, with nav-fade, .fw-nf-mk /
// .fw-nf-mki) and of the language switch. Counts only.
//   node fixes/nav-fade/probe/chromecount.mjs <motion dir> [...]          one line per arm and scene
//   node fixes/nav-fade/probe/chromecount.mjs <dirs...> --json            the same as JSON
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rows = [];
for (const d of dirs) {
  const J = JSON.parse(readFileSync(join(d, 'motion.json'), 'utf8'));
  for (const r of J.runs) for (const [sc, s] of Object.entries(r.scen || {})) {
    const c = s.counts || {}, p = c.paints || {};
    let join = 0, lang = 0;
    for (const [k, v] of Object.entries(p)) {
      if (/is-earn|fw-nf-mk|earn-box|nav-earn/.test(k)) join += v;
      else if (/language-switch/.test(k)) lang += v;
    }
    rows.push({ run: basename(d), cpu: J.cpu, arm: r.arm, served: r.served, scene: sc, frames: s.frames, style: c.style, layout: c.layout, joinPaints: join, langPaints: lang, errors: (r.errors || []).length, failed: (r.failed || []).length });
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const x of rows) console.log(`${x.run.slice(0, 34)} cpu ${x.cpu} ${x.arm.padEnd(8)} ${x.scene.padEnd(9)} style ${x.style} layout ${x.layout} join ${x.joinPaints} lang ${x.langPaints} frames ${x.frames} err ${x.errors} fail ${x.failed} js ${x.served?.js} css ${x.served?.css}`);

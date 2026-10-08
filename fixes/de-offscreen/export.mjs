#!/usr/bin/env node
// de-offscreen: write the committed raw summary (compact, one row per layer; no URLs, device ids or addresses) from
// summarize.mjs's JSON: fixes/de-offscreen/data/<engine>-layers.json.
//   node fixes/de-offscreen/export.mjs <summary.json> <engine> <out.json> [--source <label>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [src, eng, dst] = process.argv.slice(2);
const label = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : src;
const S = JSON.parse(readFileSync(src, 'utf8'))[eng];
const PAINT = { chrome: (x) => (x.idle || 0) + (x.scroll || 0), sim: (x) => (x.pcNet ?? x.total ?? 0) };
const out = { engine: eng === 'sim' ? 'webkit (iOS Simulator, Mobile Safari)' : 'chrome (headless, 430x775 DPR 3)', source: label,
  fields: ['owner', 'path', 'seen', 'gapPx', 'dir', 'box [x,y,w,h] viewport css px', 'MB', 'paints', 'reasons', 'anims (own+subtree, running; @timeline, ∞ infinite)', 'will-change', 'hiddenBy'],
  notes: eng === 'sim' ? 'MB = WebKit backingStoreMemoryEstimate; paints = repaintCount delta over 3 s idle + short scroll, net of a back-to-back census (new layers: total since creation)'
    : 'MB = estimate drawsContent area x 9 x 4 B (upper bound, Chrome rasters tiles near the viewport only); paints = paintCount delta over 3 s idle + short scroll (after a warm-up enable)', builds: {} };
for (const [arm, a] of Object.entries(S)) {
  out.builds[arm] = { served: a.served, positions: {} };
  for (const [pos, p] of Object.entries(a.positions)) {
    out.builds[arm].positions[pos] = { y: p.y, layers: p.n, mb: p.mb, byWhere: p.byWhere,
      rows: p.rows.map((x) => [x.sel, x.path.slice(-80), x.seen, x.gap, x.dir || null, x.box, Math.round(x.mem / 1e4) / 100, PAINT[eng](x), x.reasons, [...x.own, ...x.sub].slice(0, 4), x.wc, x.hiddenBy || null]) };
  }
}
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, JSON.stringify(out));
console.log(`wrote ${dst}`);

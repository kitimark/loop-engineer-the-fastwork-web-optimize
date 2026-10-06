#!/usr/bin/env node
// i219-hydrate: list a cost load's screencast frames (time from navigation start, mean luma, % pixels changed > 8 levels
// against the previous frame) in a time window, to look for a flash at the hydrate / re-mount. Offline, no Chrome.
//   node fixes/i219-hydrate/probe/frames.mjs out/i219/cost-<stamp> [fromMs] [toMs]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, a = '0', b = '1e9'] = process.argv.slice(2);
const p = JSON.parse(readFileSync(join(dir, 'probe.json'), 'utf8'));
for (const [n, l] of p.loads.entries()) {
  const L = l.frames.list.filter((f) => f.tMs >= Number(a) && f.tMs <= Number(b));
  console.log(`${l.k} (load ${n}, ${l.frames.dir}): ${l.frames.n} frames; big mutation ${JSON.stringify((l.end.big || [])[0] || null)}`);
  console.log('  ' + L.map((f) => `f${f.i}@${f.tMs}:${f.luma}/${f.chgPct}`).join('  '));
}

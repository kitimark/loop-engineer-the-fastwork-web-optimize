#!/usr/bin/env node
// v10 (int-v8): score an em-px.mjs px.json whose four loads are all saved but whose stops were never scored (the last split
// session was stopped at its cap after the last load, before em-px's scoring step). Same scorer as em-px: pxlib scoreStop
// per stop key over A, V, A2, V2 (shots <arm>-<k>.png in the folder, hits from each load), top 0. Cross-stop lines are not
// rebuilt. Writes the stops into px.json (scoredBy noted). Pixels only, nothing run.
//   node fixes/v10/pxscore.mjs <px dir>      exit 0 scored, 2 usage or a load missing
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { scoreStop, line } = await import(new URL('../v9-best/gates/pxlib.mjs', import.meta.url));
const dir = process.argv[2];
if (!dir) { console.error('usage: pxscore.mjs <px dir>'); process.exit(2); }
const f = join(dir, 'px.json'), R = JSON.parse(readFileSync(f, 'utf8'));
const ARMS = ['A', 'V', 'A2', 'V2'];
const load = (a) => R.loads.find((l) => l.arm === a && !l.void);
const miss = ARMS.filter((a) => !load(a));
if (miss.length) { console.error(`loads missing or void: ${miss.join(',')}`); process.exit(2); }
R.stops = [];
for (const k of R.stopKeys) {
  const hits = (a) => load(a).stops.find((s) => s.k === k)?.hits;
  const row = { k, m: load('A').stops.find((s) => s.k === k)?.m ?? null, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, join(dir, `${a}-${k}.png`)])), { V: hits('V'), V2: hits('V2') }, 3, 0) };
  R.stops.push(row); console.log(line(k, row));
}
R.scoredBy = `fixes/v10/pxscore.mjs ${new Date().toISOString()} (stops only; cross-stop lines not rebuilt)`;
delete R.partial;
writeFileSync(f, JSON.stringify(R, null, 1));
console.log('wrote', f);

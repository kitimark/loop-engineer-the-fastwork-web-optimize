#!/usr/bin/env node
// end-bg P-144 scorer, FROZEN (rules in p144-lib.mjs): after the last hold, only on holds whose check-p144.mjs passed.
//   node fixes/end-bg/sim/score-p144.mjs out/end-bg/simp144 <hold> ... [--json fixes/end-bg/sim/p144-score.json]
// Per hold, both metrics (M1 paint ms per band-moving frame, M2 composite ms), each run against the nearest C before and
// after it in its own hold: ratio, call (LOCATES <= 0.30, PARTIAL <= 0.70, NONE), replication gate, drift (VOID > 0.30),
// GEOMETRY (> 2 px docH difference), nob control (LOCATES or PARTIAL). Then the metric switch (chooseMetric: M2 only when
// M1's control fails in every hold and M2 replicates with its control passing in every hold) and the card reading
// (cardReading: NOT REPRODUCED | CONTROL-FAILED | AA-FAILED | READ -> PICTURES | TITLES | BOTH | JOINT | INSUFFICIENT).
// Descriptive, deciding nothing: paints per frame, painted area, the additivity line (1 - pic) + (1 - tit) vs (1 - nob).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { summarize, scoreHold, chooseMetric, cardReading, r3 } from './p144-lib.mjs';
import { appliedWhy } from './eb-inject.mjs';
import { PLANS } from './sim-p144.mjs';
import { injectValue } from './check-p144.mjs';
const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
const [root, ...holds] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
if (!root || !holds.length || holds.some((h) => !PLANS[h])) { console.error('usage: score-p144.mjs <root> <hold> ... [--json f]'); process.exit(1); }
const perHold = holds.map((hold) => {
  const runs = [];
  for (const s of PLANS[hold]) {
    const [arm, h] = s.split(':'), name = `${arm}-${h}`, F = join(root, hold, `g-${name}.json`), TL = join(root, hold, `tl-${name}.json`);
    if (!existsSync(F) || !existsSync(TL)) continue;
    const g = JSON.parse(readFileSync(F, 'utf8')), tl = JSON.parse(readFileSync(TL, 'utf8'));
    runs.push({ name, arm, applied: appliedWhy(arm, injectValue(g)).length === 0, ...summarize(g, tl) });
  }
  return { hold, runs, m1: scoreHold(runs, 'm1'), m2: scoreHold(runs, 'm2') };
});
const metric = chooseMetric(perHold.map((h) => h.m1), perHold.map((h) => h.m2));
const card = cardReading(perHold.map((h) => h[metric]));
const add = card.arms.pic?.mean != null && card.arms.tit?.mean != null && card.arms.nob?.mean != null
  ? { picPlusTit: r3(2 - card.arms.pic.mean - card.arms.tit.mean), nob: r3(1 - card.arms.nob.mean) } : null;
const out = { scorer: 'fixes/end-bg/sim/score-p144.mjs', metric, holds: perHold, card, additivity: add };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
for (const h of perHold) {
  for (const r of h.runs) {
    const v1 = h.m1.verdicts[r.name], v2 = h.m2.verdicts[r.name];
    console.log(`${h.hold} ${r.name.padEnd(8)} n ${r.n} M1 ${r.m1} ms M2 ${r.m2} ms paints ${r.medPaints} areaK ${r.medAreaK}${r.applied ? '' : ' NOT-APPLIED'}${v1 ? ` | M1 ${v1.ratio} ${v1.call} | M2 ${v2.ratio} ${v2.call}` : ''}`);
  }
  console.log(`${h.hold} M1 REPLICA ${h.m1.replica} DRIFT ${h.m1.drift} VOID ${h.m1.void} CONTROL ${h.m1.control} | M2 REPLICA ${h.m2.replica} DRIFT ${h.m2.drift} VOID ${h.m2.void} CONTROL ${h.m2.control}`);
}
console.log(`METRIC ${metric} | ${card.status}${card.reading ? ' ' + card.reading : ''} | ${Object.entries(card.arms).map(([k, v]) => `${k} ${v.call} (${v.mean}, ${v.runs} runs)`).join(', ')}${add ? ` | additivity pic+tit ${add.picPlusTit} vs nob ${add.nob}` : ''}`);

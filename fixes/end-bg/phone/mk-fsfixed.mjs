#!/usr/bin/env node
// Builds fixes/end-bg/phone/g-fastshort-fixed-v1.json from fixes/morph-scroll/g-fastshort-v1.json (P-137o, lead decision
// option A with V, 2026-10-11). Why: the original page pins at y ~5213 at the end and never reports atEnd (worst-cases
// README "End of the page"), so fs-v1's required `until atEnd` steps abort every run on it. The variant gives every arm
// the same input and keeps fs-v1's pushes, their order, sizes and speeds, the reload and the 4 s pause before the first touch:
//   - approach `repeat 30 until atEnd`      -> exactly 11 drags (what C and V took on 5 Oct and today: 11 in every run)
//   - `repeat 6 until atEnd` after a close  -> exactly 1 drag; after an open (already at the end on C/V) -> none (C/V took 1 / 0)
//   - `until atEnd timeoutMs 4000`          -> a fixed 1.5 s pause, then the guard `until y>=3000` (4 s) the compiler
//                                             wants before a down stroke (pull-to-refresh rule, as g-ar-endoc-v1)
//   - the optional `until settled` waits stay as in fs-v1 (so C and V follow fs-v1's own rhythm).
//   node fixes/end-bg/phone/mk-fsfixed.mjs        (writes the JSON next to this file; prints its sha256)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(here, '..', '..', 'morph-scroll', 'g-fastshort-v1.json'), 'utf8'));
let lastMark = 'approach';
const steps = [];
for (const s of src.steps) {
  if (s.type === 'mark') lastMark = s.name;
  if (s.type === 'repeat' && s.until === 'atEnd') {
    const n = lastMark === 'approach' ? 11 : /close/.test(lastMark) ? 1 : 0;
    if (n > 0) steps.push({ type: 'repeat', times: n, steps: s.steps });
    continue;
  }
  if (s.type === 'until' && s.cond === 'atEnd') { steps.push({ type: 'pause', ms: 1500 }, { type: 'until', cond: 'y>=3000', timeoutMs: 4000 }); continue; }
  steps.push(s);
}
const out = { name: 'ms-fastshort-fixed-v1', version: 1, screen: src.screen,
  about: 'P-137o (cap-end-orig, 2026-10-11): g-fastshort-v1 with fixed counts instead of atEnd waits, so the original page (pinned at the end) gets the same input as C and V: approach 11 drags, 1 re-approach drag after each close push, none after an open push, 1.5 s pause plus a y>=3000 guard where fs-v1 waited for atEnd; pushes, order, sizes, speeds and the optional settled waits as fs-v1. Built by fixes/end-bg/phone/mk-fsfixed.mjs.',
  params: src.params, steps };
const txt = JSON.stringify(out, null, 1) + '\n';
writeFileSync(join(here, 'g-fastshort-fixed-v1.json'), txt);
console.log(`wrote g-fastshort-fixed-v1.json sha256 ${createHash('sha256').update(txt).digest('hex').slice(0, 12)}, ${steps.length} top-level steps`);

#!/usr/bin/env node
// end-bg P-144 per-hold check, FROZEN, run right after each hold and before anything is scored:
//   node fixes/end-bg/sim/check-p144.mjs out/end-bg/simp144 <hold> [--json fixes/end-bg/sim/p144-check-<hold>.json]
// Runs = the hold's carded steps that have a g-<run>.json (steps the budget stop dropped are listed, not failed).
// HOLD-FAIL (exit 3; the hold is not scored, no rescue: no rerun, no dropped run, no re-filter; to the lead) when any run
// that ran has: no g or tl file, an aborted gesture, a gesture error, an approach loop that did not end at the end of the
// page, cycle strokes != 12 (6 down 400 px + 6 up 440 px), or n < 8 band-moving frames.
// Applied-arm gate (never fails the hold): appliedWhy(arm, inject value) from eb-inject.mjs; a run that fails it is
// INSUFFICIENT in the scorer (a C run that fails it fails the replication gate).
// Reported for every run, never failing: n and n below the target 12, the logger's band toolbar steps, docH, the inject
// css sha.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bandFrames, CYCLE_STROKES, N_MIN, N_TARGET } from './p144-lib.mjs';
import { appliedWhy } from './eb-inject.mjs';
import { PLANS } from './sim-p144.mjs';
export function injectValue(g) { let v = (g?.run?.inject || g?.inject || [])[0]?.value ?? null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } } return v; }
export function runWhy(g, hasTl) {
  const run = g?.run || {}, why = [];
  if (!hasTl) why.push('no tl file');
  if (run.aborted) why.push('aborted');
  if ((run.errors || []).length) why.push(`errors ${run.errors.length}`);
  const lp = run.loops || [];
  if (lp.length !== 1 || lp[0].ended === 'max' || lp[0].ended === 'pull guard') why.push(`approach loop ${JSON.stringify(lp)}`);
  const st = run.strokes || [];
  const down = st.filter((s) => s.kin?.dir === 'down' && s.kin?.px === 400).length, up = st.filter((s) => s.kin?.dir === 'up' && s.kin?.px === 440).length;
  if (down !== 6 || down + up !== CYCLE_STROKES) why.push(`cycle strokes ${down} down + ${up} up`);
  const n = bandFrames(g).frames.length;
  if (n < N_MIN) why.push(`n ${n} < ${N_MIN}`);
  return { why, n };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  const [root, hold] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
  if (!root || !PLANS[hold]) { console.error('usage: check-p144.mjs <root> <hold> [--json f]'); process.exit(1); }
  const D = join(root, hold), out = { hold, runs: [], dropped: [], fail: false };
  for (const s of PLANS[hold]) {
    const [arm, h] = s.split(':'), name = `${arm}-${h}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
    if (!existsSync(F)) { out.dropped.push(name); continue; }
    let g = null; try { g = JSON.parse(readFileSync(F, 'utf8')); } catch {}
    const { why, n } = g ? runWhy(g, existsSync(TL)) : { why: ['unreadable g file'], n: 0 };
    const v = injectValue(g), aw = appliedWhy(arm, v);
    const b = g ? bandFrames(g) : {};
    out.runs.push({ name, arm, n, belowTarget: n < N_TARGET, why, applied: aw.length === 0, appliedWhy: aw, bandSteps: v?.bandSteps ?? null, cssSha: v?.cssSha ?? null, docH: [b.docH0 ?? null, b.docH1 ?? null] });
    if (why.length) out.fail = true;
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
  for (const r of out.runs) console.log(`${r.name.padEnd(8)} n ${r.n}${r.belowTarget ? ' (below 12)' : ''} bandSteps ${r.bandSteps} applied ${r.applied ? 'yes' : 'NO ' + r.appliedWhy.join('; ')} docH ${r.docH.join('->')}${r.why.length ? ' FAIL ' + r.why.join('; ') : ''}`);
  if (out.dropped.length) console.log(`dropped (budget stop, not scored): ${out.dropped.join(' ')}`);
  console.log(out.fail ? `HOLD-FAIL ${hold}` : `HOLD-OK ${hold}`);
  process.exit(out.fail ? 3 : 0);
}

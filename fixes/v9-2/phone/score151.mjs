#!/usr/bin/env node
// P-151 (the P-142 bisect) scorer: P-142's scorer (fixes/v9-2/phone/score142.mjs 8960b2d9a721, which wraps P-122's
// fixes/v9-best/phone/p122/score.mjs d1dddb910cd9; both refused if changed) with the block's arm pins, plus the bisect
// reading per gate (fixes/v9-2/README.md "P-151"):
//   gates read: EX (part X), ES (part S): the V ceiling as P-142 on the block's test arm V; FLICKER X and FLICKER S: G1
//   (test monotone blinks 0). GM / FLICKER M / parity M are not run in P-151 (no M part) and are not read.
//   control (arm C) per gate: EX / ES: the valid control runs of that part, counted in the same window (into1 .. end),
//   pass = >= MIN (X 3, S 2) valid runs and 0 frames > 50 ms (twins > 46 / > 54 reported); FLICKER: pass = the gate's
//   control monotone blinks 0 on >= 3 control files.
//   reading: test passes -> "not reproduced"; test fails and control passes -> "cleared by removal" (Q1 / Q2: CAUSE
//   <section> for that gate; Q3: "7d alone fails the gate"); test fails and control fails -> "both fail" (Q1 / Q2: not
//   the cause alone; Q3 has no such reading: its control is v9-final, see the card); control too few valid runs ->
//   "insufficient (control)"; test insufficient -> "insufficient (test)".
//   Q3 reads the test arm C7 = v9-final + 7d: "7d alone fails <gate>" when C7 fails, "7d alone passes <gate>" when it
//   passes (then the P-142 WORSE needs scb or g11 together with 7d: INTERACTION).
//   node fixes/v9-2/phone/score151.mjs --block Q1|Q2|Q3 <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// Parity X (BEHAVIOUR) as P-142 (reported; BEHAVIOUR FAIL leads).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const SCORE142 = ['score142.mjs', '8960b2d9a721'];
{ const got = sha(join(here, SCORE142[0])).slice(0, 12); if (got !== SCORE142[1]) { console.error(`${SCORE142[0]} changed (${got}, pinned ${SCORE142[1]}): refuse`); process.exit(3); } }
const M142 = await import(join(here, SCORE142[0]));
export const Q = M142.Q;
const self = sha(fileURLToPath(import.meta.url));
const B = {
  V: { js: '941aa13e5bdf0b7a89278eae21e99630d345047377f21ea40d00c9fe97ec408e', css: 'f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308' },
  mScb: { js: '1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428', css: 'f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308' },
  mG11: { js: '941aa13e5bdf0b7a89278eae21e99630d345047377f21ea40d00c9fe97ec408e', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
  F: { js: '647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
  C7: { js: '1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
};
// the block's arms (C = control, V = test); P142 = P-142's own pair (replay only, the self-test)
export const BLOCKS = {
  Q1: { suspect: 'scroll-cb', C: B.mScb, V: B.V },
  Q2: { suspect: 'g11', C: B.mG11, V: B.V },
  Q3: { suspect: 'rev 7d', C: B.F, V: B.C7 },
  P142: { suspect: '(replay of P-142)', C: B.F, V: B.V },
};
export const MIN_CTRL = { X: 3, S: 2 }, MIN_FLICKER = 3;

function ctrlWindow(out, part) {
  const runs = out.runs.filter((r) => r.kind === 'G' && r.part === part && r.arm === 'C' && !r.void.length && r.window);
  const sum = (k) => runs.reduce((a, r) => a + (r.window[k] || 0), 0);
  const n = runs.length, gt50 = sum('gt50'), gt46 = sum('gt46'), gt54 = sum('gt54');
  const pass = n >= MIN_CTRL[part] ? gt50 === 0 : null;
  return { n, gt50, gt46, gt54, pass, thresholdSensitive: n >= MIN_CTRL[part] && ((gt46 === 0) !== (gt50 === 0) || (gt54 === 0) !== (gt50 === 0)) };
}
function ctrlFlicker(out, part) {
  const p = out.gates.FLICKER.parts?.[part]; if (!p) return { pass: null, why: 'no flicker part' };
  const line = (p.out || []).find((l) => /^G1 V monotone blinks/.test(l)) || '';
  const m = line.match(/^G1 V monotone blinks (\d+) \(C (\d+)\)/);
  const nC = p.files?.C ?? 0;
  if (!m) return { pass: null, nC, why: 'no G1 line' };
  return { pass: nC >= MIN_FLICKER ? +m[2] === 0 : null, nC, Cmonotone: +m[2], Vmonotone: +m[1] };
}
export function reading(block, test, ctrl) {
  if (/^insufficient/.test(test)) return 'insufficient (test)';
  const fails = /^(WORSE|NEW CLUSTER)/.test(test);
  if (block === 'Q3') return fails ? '7d alone fails the gate' : '7d alone passes the gate (INTERACTION if Q1 / Q2 named nothing)';
  if (!fails) return 'not reproduced';
  if (ctrl.pass === null) return 'insufficient (control)';
  return ctrl.pass ? `cleared by removal: CAUSE ${BLOCKS[block].suspect}` : 'both fail: not the cause alone';
}
export function score151(block, entries, flicker = null) {
  if (!BLOCKS[block]) throw new Error(`unknown block ${block}`);
  const bad = entries.filter((e) => /^(wg|g)[MHR]/.test(e.item)).map((e) => e.item);
  if (bad.length) throw new Error(`P-151 runs parts X and S only: refuse ${bad.join(', ')}`);
  const out = M142.score142(entries, flicker);
  const fx = out.gates.FLICKER.parts || {};
  const g = {
    EX: { test: out.gates.EX.verdict, control: ctrlWindow(out, 'X') },
    ES: { test: out.gates.ES.verdict, control: ctrlWindow(out, 'S') },
    'FLICKER X': { test: fx.X?.verdict ?? 'insufficient (no part X)', control: ctrlFlicker(out, 'X') },
    'FLICKER S': { test: fx.S?.verdict ?? 'insufficient (no part S)', control: ctrlFlicker(out, 'S') },
  };
  for (const [k, x] of Object.entries(g)) x.reading = reading(block, x.test, x.control);
  out.bisect = { block, suspect: BLOCKS[block].suspect, gates: g, parity: out.reported.parity.parts?.X?.verdict ?? out.reported.parity.verdict };
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const bi = args.indexOf('--block'), block = bi >= 0 ? args[bi + 1] : null;
  const ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  if (!BLOCKS[block]) { console.error('usage: score151.mjs --block Q1|Q2|Q3 <item>:<file> ... [--json out.json]'); process.exit(1); }
  Q.V9S.pin({ C: BLOCKS[block].C, V: BLOCKS[block].V });
  const skip = new Set([bi, bi + 1, ji, ji + 1].filter((i) => i >= 0));
  const entries = Q.V9S.loadEntries(args.filter((a, i) => !skip.has(i) && !a.startsWith('--')));
  const bad = entries.filter((e) => /^(wg|g)[MHR]/.test(e.item));
  if (bad.length) { console.error(`P-151 runs parts X and S only: refuse ${bad.map((e) => e.item).join(', ')}`); process.exit(3); }
  const fbase = jsonOut ? jsonOut.replace(/\.json$/, '') : null;
  const runF = (P, C, V) => {
    const fj = fbase ? `${fbase}-flicker-${P}.json` : null;
    return { ...spawnSync(process.execPath, [Q.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V, ...(fj ? ['--json', fj] : [])], { encoding: 'utf8' }), json: fj };
  };
  const out = score151(block, entries, Q.flickerGate(Q.flickerFiles(entries), runF));
  for (const r of out.runs) {
    const what = r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : `${JSON.stringify(r.window ?? r.counts)}${r.path?.outs ? '; outs ' + JSON.stringify(r.path.outs.map((o) => [o.name, o.fv, o.travel, o.fromEnd])) : ''}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  for (const [k, x] of Object.entries(out.bisect.gates)) console.log(`${block} ${k}: test ${x.test}; control ${JSON.stringify(x.control)}; READING ${x.reading}`);
  console.log(`${block} parity: ${out.bisect.parity}`);
  console.log(`BLOCK ${block} (${out.bisect.suspect}) test verdict ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self} (wraps score142.mjs ${SCORE142[1]})`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v9-2/phone/score151.mjs', sha256: self, wraps: [SCORE142], ...out }, null, 1));
}

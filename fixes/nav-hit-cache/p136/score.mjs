#!/usr/bin/env node
// P-136 scorer (nav-hit-cache U2 short phone no-worse check: C = v9-final + rev 7d, main 189ca7ed, JS 1b2eecc66011, vs
// V = C + U2, JS c7435c24dc56; CSS e1359ab9994a both; README "P-136"). Written before any P-136 data.
// A thin wrapper on P-122's scorer fixes/v9-best/phone/p122/score.mjs (pinned below, refused if changed; it pins its own
// imports: P-120's score.mjs, P-121's gate.mjs, nav-hit-cache's flicker-gate.mjs), with P-136's arms and gates:
// Items (hold136.sh): g<P><arm><n> G runs, P = X (flick-end-v2 speed=fast) or S (speed=slow) · sCo / sCc S sentinels on
//   C · wg<P><arm> warm-ups (skipped). Any M, R, n or w<arm> item is refused (not in this card).
// Per run: P-122's scoreRun unchanged (P-111's G record voids, the served check log, P-121's path gate: gX C leaves the
//   end by >= 1600 px, V's out strokes meet the release rule's stroke criteria; gS meets neither, both arms), plus: a G
//   run whose served check log (serve136.sh check, before the item) does not name P-136's C and V bytes is VOID
//   ("served check: not P-136's arms"; G records carry no served hashes themselves), and so is a record whose
//   meta.served (if any) names other bytes than its arm ("served not arm").
// Sentinels: P-111's rule (a failing sCo / sCc voids every run since the last passing one).
// Gates (block verdict):
//   GX       P-111's G gate on part X, C vs V: > 50 WORSE when the median V - C count is up by more than 2, twins 46 / 54
//            (threshold-sensitive when a twin's verdict differs); a NEW 250 px V cluster (>= 2 V runs, no C run within one
//            bin) fails. Needs >= 3 valid runs per arm.
//   ES       V ceiling on part S, P-122's rule: every valid V run has 0 frames with dt > 50 ms in into1 .. end; twins
//            46 / 54, frames in (46, 54] flagged. Needs >= 2 valid V runs. (S's C - V relative counts are reported.)
//   FLICKER  nav-hit-cache's flicker gate, once per part (X, S: the gate VOIDs mixed scripts), as P-122 after the
//            lead's 08:20Z / 08:55Z rulings: G1 (V monotone blinks = 0) decides in every part; the >= 3 valid runs per
//            arm is pooled over X and S; G2 / G3 and the gate's own word are reported only.
//   BEHAVIOUR  P-122's fling-distance parity on part X (first stroke after into1; |median V - C| > 300 px with >= 2 of
//            the pairs the same way = BEHAVIOUR FAIL, printed on its own line). Part S's parity is reported only.
// Reported only: EX (P-122's V ceiling on part X), GS (P-111's G gate on part S, needs 2 a side), F-260 depth lines.
// Verdict: WORSE if GX, ES or FLICKER is WORSE (or GX has a NEW cluster); else insufficient if any of them is; else
//   no-worse. A BEHAVIOUR FAIL prefixes the verdict.
//   node fixes/nav-hit-cache/p136/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const PINS = { 'p122/score.mjs': ['../../v9-best/phone/p122/score.mjs', 'd1dddb910cd9'] };
for (const [n, [p, h]] of Object.entries(PINS)) {
  const got = sha(join(here, p)).slice(0, 12);
  if (got !== h) { console.error(`${n} changed (${got}, pinned ${h}): refuse`); process.exit(3); }
}
export const P = await import(join(here, PINS['p122/score.mjs'][0]));
const { V9S } = P, S = V9S.S;
const self = sha(fileURLToPath(import.meta.url));

export const P136 = {
  C: { js: '1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
  V: { js: 'c7435c24dc5619bf4dd761c9d7653c2541062ba4e347aafe78d8e71daf62f015', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
};
export const MIN = { GX: 3, ES: 2, GS: 2, FLICKER: 3 };
export const PARTS = ['X', 'S'];
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';

export function parse(item) {
  if (!/^(sC[oc]|wg[XS][CV]|g[XS][CV]\d+)$/.test(item)) throw new Error(`not a P-136 item: ${item} refused`);
  return P.parse(item);
}

// the check log's lines "C pid .. port .. served JS <12> CSS <12> ok" and the same for V must carry P-136's pins
export function checkLogVoid(log) {
  if (log == null) return null; // P-111's scoreG already voids "no served check log"
  const has = (A) => new RegExp(`^${A} .*served JS ${P136[A].js.slice(0, 12)} CSS ${P136[A].css.slice(0, 12)} ok$`, 'm').test(log);
  return has('C') && has('V') ? null : "served check: not P-136's arms";
}
export function servedVoid(j, arm) {
  const sv = j?.meta?.served; if (!sv) return null;
  const ok = (pin, got) => typeof got === 'string' && got.length >= 12 && pin.startsWith(got);
  return ok(P136[arm].js, sv[NODE]) && ok(P136[arm].css, sv[CSS]) ? null : `served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`;
}

// P-122's ceiling (not exported there), the same rule
export function ceiling(V, min) {
  const n = V.length; if (n < min) return { nV: n, verdict: `insufficient (V ${n}, need ${min})` };
  const k = (key) => V.reduce((a, r) => a + (r.window?.[key] ?? 0), 0), worse = (key) => k(key) > 0;
  const out = { nV: n, gt50: k('gt50'), gt46: k('gt46'), gt54: k('gt54'), near: V.flatMap((r) => r.window?.near ?? []) };
  out.thresholdSensitive = worse('gt46') !== worse('gt50') || worse('gt54') !== worse('gt50');
  out.verdict = (worse('gt50') ? `WORSE (V ceiling: ${out.gt50} frame(s) > 50 ms)` : 'no-worse') + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

function relGate(C, V, min) {
  const g = S.gate(C.map((r) => r.counts), V.map((r) => r.counts), min);
  if (!/^insufficient/.test(g.verdict)) {
    g.cluster = S.clusters(C, V, 'gt50');
    g.clusterThresholdSensitive = ['gt46', 'gt54'].some((k) => (S.clusters(C, V, k).newClusters.length > 0) !== (g.cluster.newClusters.length > 0));
    if (g.cluster.newClusters.length) g.verdict = `NEW CLUSTER at ${g.cluster.newClusters.join(', ')}` + (g.verdict.startsWith('WORSE') ? `; ${g.verdict}` : '');
  }
  return g;
}

// the flicker gate per part (X, S), pooled run count; run(P, Cfiles, Vfiles) -> { status, stdout, json }
export function flickerGate(entries, run) {
  const ff = Object.fromEntries(PARTS.map((Pt) => [Pt, { C: [], V: [] }]));
  for (const e of entries) { const p = parse(e.item); if (!p.warmup && p.kind === 'G' && e.j) ff[p.part][p.arm].push(e.file); }
  const parts = {}, valid = { C: 0, V: 0 };
  for (const Pt of PARTS) {
    const x = ff[Pt], files = { C: x.C.length, V: x.V.length };
    if (!files.C || !files.V) { parts[Pt] = { verdict: `insufficient (flicker gate: no G runs, C ${files.C} V ${files.V})`, files }; continue; }
    const r = run(Pt, x.C, x.V), p = P.flickerPart(r.status, r.stdout);
    valid.C += p.valid.C; valid.V += p.valid.V;
    parts[Pt] = { ...p, exit: r.status, files, json: r.json ?? null, out: (r.stdout || '').trim().split('\n').slice(-12) };
  }
  const tag = PARTS.map((Pt) => `${Pt} ${parts[Pt].verdict.split(' ')[0]}`).join(', ') + `; valid G runs C ${valid.C} V ${valid.V}`;
  const vs = Object.values(parts).map((p) => p.verdict), short = valid.C < MIN.FLICKER || valid.V < MIN.FLICKER;
  const verdict = vs.some((v) => /^WORSE/.test(v)) ? `WORSE (per part: ${tag})`
    : vs.some((v) => /^insufficient/.test(v)) || short ? `insufficient (per part: ${tag}${short ? `, need >= ${MIN.FLICKER} each over X, S` : ''})` : `no-worse (per part: ${tag})`;
  return { verdict, parts, valid };
}

export function scoreP136(entries, flicker = null) {
  for (const e of entries) parse(e.item); // refuses foreign items before anything is scored
  const runs = entries.map((e) => {
    const r = P.scoreRun(e.item, e.j, e.checkLog); if (!r) return null;
    if (r.kind === 'G') for (const v of [checkLogVoid(e.checkLog), servedVoid(e.j, r.arm)]) if (v) r.void.push(v);
    return r;
  }).filter(Boolean);
  S.applySentinel(runs);
  const ok = (f) => runs.filter((r) => !r.void.length && r.kind !== 'S' && f(r));
  const G = (Pt, A) => ok((r) => r.kind === 'G' && r.part === Pt && r.arm === A);
  const gates = { GX: relGate(G('X', 'C'), G('X', 'V'), MIN.GX), ES: ceiling(G('S', 'V'), MIN.ES) };
  if (flicker) gates.FLICKER = flicker;
  const par = P.parity(entries);
  const behaviour = par.parts.X ? { ...par.parts.X, runs: undefined } : { verdict: 'insufficient (no X runs)' };
  const reported = { EX: ceiling(G('X', 'V'), MIN.GX), GS: relGate(G('S', 'C'), G('S', 'V'), MIN.GS),
    paritySpart: par.parts.S ? { C: par.parts.S.C, V: par.parts.S.V } : null, parity: par };
  const vs = Object.values(gates).map((g) => g.verdict);
  let verdict = !flicker ? 'insufficient (no flicker gate)' : vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  if (behaviour.verdict === 'BEHAVIOUR FAIL') verdict = `BEHAVIOUR FAIL; frames ${verdict}`;
  const thresholdSensitive = Object.values(gates).some((g) => g.thresholdSensitive || g.clusterThresholdSensitive);
  return { runs, gates, behaviour, reported, verdict, thresholdSensitive };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  V9S.pin(P136);
  const entries = V9S.loadEntries(args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)));
  const fbase = jsonOut ? jsonOut.replace(/\.json$/, '') : null;
  const flicker = flickerGate(entries, (Pt, C, V) => {
    const fj = fbase ? `${fbase}-flicker-${Pt}.json` : null;
    return { ...spawnSync(process.execPath, [P.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V, ...(fj ? ['--json', fj] : [])], { encoding: 'utf8' }), json: fj };
  });
  const out = scoreP136(entries, flicker);
  for (const r of out.runs) {
    const what = r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}` : `${JSON.stringify(r.window ?? r.counts)}${r.path?.outs ? '; outs ' + JSON.stringify(r.path.outs.map((o) => [o.name, o.fv, o.travel, o.fromEnd])) : ''}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify({ ...g, parts: undefined })}`);
  for (const [Pt, x] of Object.entries(out.gates.FLICKER.parts)) console.log(`FLICKER ${Pt}: ${x.verdict}${x.files ? ` (files C ${x.files.C} V ${x.files.V})` : ''}`);
  console.log(`EX (report): ${JSON.stringify(out.reported.EX)}`);
  console.log(`GS (report): ${JSON.stringify(out.reported.GS)}`);
  console.log(`BEHAVIOUR X: ${out.behaviour.verdict}${out.behaviour.gap != null ? ` (median C ${out.behaviour.C} V ${out.behaviour.V} gap ${out.behaviour.gap}; pairs ${JSON.stringify((out.behaviour.pairs || []).map((q) => [q.n, q.gap, q.counts]))})` : ''}`);
  console.log(`parity S (report): ${JSON.stringify(out.reported.paritySpart)}`);
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/nav-hit-cache/p136/score.mjs', sha256: self, ...out, reported: { ...out.reported, parity: undefined } }, null, 1));
}

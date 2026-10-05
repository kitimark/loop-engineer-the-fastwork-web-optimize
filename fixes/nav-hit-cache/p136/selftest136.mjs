#!/usr/bin/env node
// P-136 scorer self-test (before any P-136 data). Part 1 (synthetic): item parsing, served pins. Part 2 (replay): P-122's
// own part X and S records (gitignored, in int-v8's worktree: out/p122/runs, given as --records <dir>), relabeled as
// P-136's arms (C -> 1b2eecc66011, V -> c7435c24dc56), scored by score.mjs; the per-run verdicts, EX, ES and the flicker
// gate's per-part G1 lines must equal P-122's score-final (out/p122/score-final.txt, gSC3 excluded as there), and the
// P-136-only gates (GX, pooled flicker count) must give what their rules say on those counts.
//   node fixes/nav-hit-cache/p136/selftest136.mjs --records <int-v8 worktree>/out/p122/runs
// Prints SELFTEST-136 OK <n> or the failures (exit 1); without --records only part 1 runs (SELFTEST-136 PART1 OK <n>).
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const T = await import(join(here, 'score.mjs'));
const { P136, P, parse, servedVoid, checkLogVoid, scoreP136, flickerGate } = T;
let n = 0; const bad = [];
const ok = (c, what) => { n++; if (!c) bad.push(what); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const asArm = (j, A) => { const k = clone(j); k.meta = k.meta || {}; k.meta.served = { [NODE]: P136[A].js.slice(0, 12), [CSS]: P136[A].css.slice(0, 12) }; return k; };
P.V9S.pin(P136);

// part 1: items and pins
for (const i of ['gMC1', 'gMV2', 'gRV1', 'wgMC', 'nC1', 'wC', 'wV', 'gEV1', 'mC1']) {
  let threw = false; try { parse(i); } catch (e) { threw = /not a P-136 item/.test(e.message); } ok(threw, `item ${i} refused`);
}
ok(parse('gXC1').part === 'X' && parse('gSV3').arm === 'V' && parse('sCo').kind === 'S' && parse('wgSV').warmup, 'P-136 items parsed');
ok(P136.C.js.startsWith('1b2eecc66011') && P136.V.js.startsWith('c7435c24dc56') && P136.C.css === P136.V.css && P136.V.css.startsWith('e1359ab9994a'), 'arm pins');
const fake = { meta: {} };
ok(servedVoid(asArm(fake, 'C'), 'C') === null && servedVoid(asArm(fake, 'V'), 'V') === null, 'served pins accept their arm');
ok(/served not arm C/.test(servedVoid(asArm(fake, 'V'), 'C') ?? '') && /served not arm V/.test(servedVoid(asArm(fake, 'C'), 'V') ?? ''), 'served pins refuse the other arm');
ok(/served not arm V/.test(servedVoid({ meta: { served: { [NODE]: '647c9ef2b1e2', [CSS]: 'e1359ab9994a' } } }, 'V') ?? ''), 'served pins refuse v9-final (pre-7d) as V');
ok(servedVoid({ meta: {} }, 'V') === null, 'no served field: left to the served check log');
const LOG = (c, v) => `B pid 1 port 1 served JS 4606120cf392 CSS 27776f3d4138 ok\nC pid 2 port 2 served JS ${c} CSS e1359ab9994a ok\nV pid 3 port 3 served JS ${v} CSS e1359ab9994a ok\n`;
ok(checkLogVoid(LOG('1b2eecc66011', 'c7435c24dc56')) === null, 'check log with P-136 arms accepted');
ok(checkLogVoid(LOG('1b2eecc66011', '647c9ef2b1e2')) !== null && checkLogVoid(LOG('c7435c24dc56', '1b2eecc66011')) !== null, 'check log with other or swapped arms refused');

// part 1b: the count scorer counts.mjs on synthetic records
const CN = await import(join(here, 'counts.mjs'));
const K12 = '1b2eecc66011', V12 = 'c7435c24dc56', E12 = 'e1359ab9994a';
const cload = (arm, vp, rep, efp, fl, fs, pp, js = arm === 'K' ? K12 : V12, errors = []) => ({ rep, arm, vp, served: [js, E12], steps: 600, errors,
  counts: { 'Layout.forced': fl, 'UpdateLayoutTree.forced': fs, 'PrePaint.forced': pp, 'PrePaint.frame': 600 }, api: { nav: { efp }, all: { efp } } });
const sload = (arm, rep, efp, fl, fs, js = arm === 'K' ? K12 : V12) => ({ arm, rep, engine: 'sim', served: { js, css: E12 }, api: { nav: { efp }, all: { efp } }, window: { forcedLayouts: fl, forcedStyleRecalcs: fs, scroll: { n: 600 } } });
const chrome = { loads: [cload('K', 'mobile', 0, 400, 230, 800, 600), cload('V', 'mobile', 0, 310, 228, 795, 600), cload('V', 'mobile', 1, 312, 229, 796, 600), cload('K', 'mobile', 1, 402, 231, 801, 600),
  cload('K', 'desktop', 0, 700, 300, 900, 500), cload('V', 'desktop', 0, 701, 300, 900, 500), cload('V', 'desktop', 1, 699, 301, 901, 501), cload('K', 'desktop', 1, 700, 300, 900, 500)] };
const aa = { loads: [cload('K', 'mobile', 0, 400, 230, 800, 600, K12), cload('V', 'mobile', 0, 401, 231, 801, 600, K12), cload('K', 'desktop', 0, 700, 300, 900, 500, K12), cload('V', 'desktop', 0, 700, 301, 900, 500, K12)] };
const sim = { loads: [sload('K', 1, 380, 200, 300), sload('V', 1, 290, 199, 300), sload('V', 2, 291, 200, 299), sload('K', 2, 381, 200, 300)] };
const simAa = { loads: [sload('K', 1, 380, 200, 300, K12), sload('V', 1, 381, 200, 301, K12)] };
const parity = { audit: { mobile: { task10: { deferred: 187 } } } };
const c0 = CN.score({ chrome, aa, sim, simAa, parity });
ok(c0.part1 === 'PASS' && ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].every((k) => c0.preds[k].verdict === 'hit'), `counts: synthetic pass (${c0.part1}, ${JSON.stringify(Object.fromEntries(Object.entries(c0.preds).map(([k, p]) => [k, p.verdict])))})`);
ok(c0.tol.mobile.efpNav === 2 && c0.tol.mobile.forcedLayout === 2 && c0.tol.sim.efpNav === 2, 'counts: A/A tolerance floor 2');
const c1 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 1 ? { ...l, api: { nav: { efp: 370 }, all: { efp: 370 } } } : l)) }, aa, sim, simAa, parity });
ok(c1.preds.C1.verdict === 'miss' && c1.part1 === 'FAIL', 'counts: a pair dropping < 40 misses C1, part 1 FAIL');
const c2 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 4 ? { ...l, counts: { ...l.counts, 'Layout.forced': 320 } } : l)) }, aa, sim, simAa, parity });
ok(c2.preds.C5.verdict === 'miss' && c2.part1 === 'FAIL', 'counts: a desktop forced-Layout shift of 10 (median 310 vs 300.5, tol 2) misses C5');
const c3 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 1 ? { ...l, served: ['647c9ef2b1e2', E12] } : l)) }, aa, sim, simAa, parity });
ok(c3.preds.C8.verdict === 'miss' && c3.preds.C1.verdict === 'insufficient' && c3.part1 === 'FAIL', 'counts: a load serving other bytes is VOID (C8 miss, C1 short)');
const c4 = CN.score({ chrome, aa, sim: null, simAa: null, parity });
ok(c4.preds.C6.verdict === 'insufficient' && c4.preds.C7.verdict === 'insufficient' && c4.part1 === 'INSUFFICIENT', 'counts: no Simulator record: C6 / C7 insufficient, part 1 INSUFFICIENT (never a pass)');
const c5 = CN.score({ chrome, aa: { loads: aa.loads.map((l) => ({ ...l, served: [V12, E12] })) }, sim, simAa, parity });
ok(c5.tol.mobile === null && c5.preds.C3.verdict === 'insufficient', 'counts: an A/A not on K bytes gives no tolerance');

const ri = process.argv.indexOf('--records'), dir = ri > 0 ? process.argv[ri + 1] : null;
if (!dir) { console.log(bad.length ? `SELFTEST-136 FAIL\n  ${bad.join('\n  ')}` : `SELFTEST-136 PART1 OK ${n}`); process.exit(bad.length ? 1 : 0); }

// part 2: P-122's X and S records in their block order (score-final.txt; gSC3 excluded as there)
const ORDER = ['sCo-H4a', 'gXC1', 'gXV1', 'gXV2', 'sCc-H4a', 'sCo-H4b', 'gXC2', 'gXC3', 'gXV3', 'sCc-H4b',
  'sCo-H5a', 'gSC1', 'gSV1', 'sCc-H5a', 'sCo-H5b', 'gSV2', 'gSC2', 'sCc-H5b', 'sCo-H5c', 'gSV3', 'sCc-H5c'];
const files = ORDER.map((k) => join(dir, `p122-${k}.json`));
const missing = files.filter((f) => !existsSync(f));
if (missing.length) { console.log(`SELFTEST-136 SKIP records missing (${missing.length}, e.g. ${missing[0].split('/').pop()})`); process.exit(2); }
const CHECK = LOG('1b2eecc66011', 'c7435c24dc56');
const entries = ORDER.map((k, i) => {
  const item = k.split('-')[0], j = JSON.parse(readFileSync(files[i], 'utf8')), arm = item.startsWith('sC') ? 'C' : item[2];
  return { item, file: files[i], j: asArm(j, arm), checkLog: CHECK };
});
const flick = flickerGate(entries, (Pt, C, V) => spawnSync(process.execPath, [P.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V], { encoding: 'utf8' }));
const out = scoreP136(entries, flick);
const want = { gXC1: 'valid', gXV1: 'valid', gXV2: 'valid', gXC2: 'valid', gXC3: 'valid', gXV3: 'valid', gSC1: 'valid', gSV1: 'VOID path', gSV2: 'valid', gSC2: 'valid', gSV3: 'VOID path' };
for (const r of out.runs) {
  if (r.kind === 'S') { ok(!r.void.length && r.sentinel?.pass === true, `${r.item} sentinel valid as in P-122`); continue; }
  const got = r.void.length ? (r.void.every((v) => /^path: /.test(v)) ? 'VOID path' : 'VOID ' + r.void.join(' | ')) : 'valid';
  ok(got === want[r.item], `${r.item}: ${got}, P-122 ${want[r.item]}`);
}
ok(out.runs.filter((r) => r.kind === 'G').length === 11, 'eleven G runs scored');
const W = Object.fromEntries(out.runs.filter((r) => r.kind === 'G').map((r) => [r.item, r.window]));
ok(W.gXC1?.gt50 === 2 && W.gXV1?.gt46 === 1 && W.gSV2?.gt46 === 1 && W.gXC2?.frames === 612, 'window counts equal P-122 score-final');
ok(out.reported.EX.nV === 3 && out.reported.EX.gt50 === 0 && out.reported.EX.gt46 === 1 && out.reported.EX.verdict === 'no-worse (threshold-sensitive)', `EX (report) equals P-122's EX: ${out.reported.EX.verdict}`);
ok(out.gates.ES.verdict === 'insufficient (V 1, need 2)', `ES equals P-122's ES: ${out.gates.ES.verdict}`);
// GX by its rule on these counts: gt50 C [2, 1, 1] median 1, V [0, 0, 0] median 0: d = -1 (no-worse); no V bin at all
ok(out.gates.GX.nC === 3 && out.gates.GX.nV === 3 && out.gates.GX.delta?.gt50 === -1 && /^no-worse/.test(out.gates.GX.verdict) && !out.gates.GX.cluster.newClusters.length, `GX by rule: ${out.gates.GX.verdict}`);
ok(/^no-worse \(G1: V monotone blinks 0, C 1\)/.test(out.gates.FLICKER.parts.X.verdict), `FLICKER X G1 as P-122: ${out.gates.FLICKER.parts.X.verdict}`);
ok(/^no-worse \(G1: V monotone blinks 0, C 0\)/.test(out.gates.FLICKER.parts.S.verdict), `FLICKER S G1 as P-122: ${out.gates.FLICKER.parts.S.verdict}`);
ok(out.gates.FLICKER.valid.C >= 3 && out.gates.FLICKER.valid.V >= 3 && /^no-worse/.test(out.gates.FLICKER.verdict), `FLICKER pooled over X, S: ${out.gates.FLICKER.verdict}`);
ok(out.verdict === 'insufficient', `block verdict insufficient (ES short), got ${out.verdict}`);
// BEHAVIOUR X on P-122's records: v8 vs v9-final (7c), the gap passed there only by the clipped-end exemption
ok(out.behaviour.verdict === 'pass' && out.behaviour.gap === 871, `BEHAVIOUR X as P-122 (pass, gap 871): ${out.behaviour.verdict} gap ${out.behaviour.gap}`);
// negative: P-122's own check log (v8 / v9-final bytes) for gXV1 makes it VOID
const raw = entries.map((e) => (e.item === 'gXV1' ? { ...e, checkLog: readFileSync(join(dir, 'p122-H4a-check-gXV1.log'), 'utf8') } : e));
const o2 = scoreP136(raw, flick);
ok(o2.runs.find((r) => r.item === 'gXV1').void.some((v) => v === "served check: not P-136's arms"), 'a run whose check log names other bytes is VOID');
ok(o2.gates.GX.verdict === 'insufficient (C 3, V 2, need 3)', `GX insufficient without it: ${o2.gates.GX.verdict}`);
// negative: a failing closing sentinel voids the hold's runs
const sfail = entries.map((e, i) => (i === 4 ? { ...e, j: (() => { const k = clone(e.j); k.meta.sentinel = { ...(k.meta.sentinel || {}), pass: false }; return k; })() } : e));
const o3 = scoreP136(sfail, flick);
ok(['gXC1', 'gXV1', 'gXV2'].every((it) => o3.runs.find((r) => r.item === it).void.some((v) => /voided by failing sentinel/.test(v))), 'a failing sCc voids its hold');
// negative: a foreign item is refused before scoring
let threw = false; try { scoreP136([...entries, { item: 'gMV1', file: 'x', j: null, checkLog: CHECK }], flick); } catch (e) { threw = /not a P-136 item/.test(e.message); }
ok(threw, 'scoreP136 refuses an M item');
// no flicker gate given: insufficient
ok(scoreP136(entries, null).verdict === 'insufficient (no flicker gate)', 'no flicker gate: insufficient');
console.log(bad.length ? `SELFTEST-136 FAIL ${bad.length} of ${n}\n  ${bad.join('\n  ')}` : `SELFTEST-136 OK ${n}`);
process.exit(bad.length ? 1 : 0);

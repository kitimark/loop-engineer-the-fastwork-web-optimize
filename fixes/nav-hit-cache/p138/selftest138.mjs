#!/usr/bin/env node
// P-138 self-test: the part 1 scorer p138/counts.mjs on synthetic records (README "D card P-138"). Written before any
// P-138 data. Covers: the range tolerance and its floor 2, the >= 3 loads per arm rule (A/A and K / V), the A0 cap
// (a wide tolerance makes part 1 INSUFFICIENT, never a pass or a fail), a pass, a C1 miss, a C5 miss, a load on
// other bytes (VOID, C8 miss), no Simulator record, and the P-136 import pin. Phone part 2 reuses p136/score.mjs
// unchanged; its tests are p136/selftest136.mjs. Prints SELFTEST-138 OK <n> or SELFTEST-138 FAIL.
//   node fixes/nav-hit-cache/p138/selftest138.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
let n = 0; const bad = [];
const ok = (c, msg) => { n++; if (!c) bad.push(msg); };
const CN = await import(join(here, 'counts.mjs'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
ok(sha(join(here, '../p136/counts.mjs')) === 'b93a69de05f0', 'P-136 counts.mjs is the pinned b93a69de05f0');
ok(/if \(got !== P136_SHA\) throw/.test(readFileSync(join(here, 'counts.mjs'), 'utf8')), 'counts.mjs refuses a changed P-136 import');

const K12 = '1b2eecc66011', V12 = 'c7435c24dc56', E12 = 'e1359ab9994a';
ok(CN.PIN.K === K12 && CN.PIN.V === V12 && CN.PIN.css === E12, 'arm pins K / V / CSS as P-136');
const cload = (arm, vp, rep, efp, fl, fs, pp, js = arm === 'K' ? K12 : V12) => ({ rep, arm, vp, served: [js, E12], steps: 600, errors: [],
  counts: { 'Layout.forced': fl, 'UpdateLayoutTree.forced': fs, 'PrePaint.forced': 0, 'PrePaint.frame': pp }, api: { nav: { efp }, all: { efp } } });
const sload = (arm, rep, efp, fl, fs, js = arm === 'K' ? K12 : V12) => ({ arm, rep, engine: 'sim', served: { js, css: E12 }, api: { nav: { efp }, all: { efp } }, window: { forcedLayouts: fl, forcedStyleRecalcs: fs, scroll: { n: 600 } } });
// three pairs in probe.mjs order (K V, V K, K V) per viewport
const trio = (vp, k, v) => [cload('K', vp, 0, ...k[0]), cload('V', vp, 0, ...v[0]), cload('V', vp, 1, ...v[1]), cload('K', vp, 1, ...k[1]), cload('K', vp, 2, ...k[2]), cload('V', vp, 2, ...v[2])];
const aaTrio = (vp, rows) => trio(vp, [rows[0], rows[2], rows[4]], [rows[1], rows[3], rows[5]]).map((l) => ({ ...l, served: [K12, E12] }));
const aa = { loads: [
  ...aaTrio('mobile', [[454, 200, 773, 1225], [455, 198, 774, 1220], [454, 202, 772, 1228], [454, 199, 775, 1224], [455, 201, 773, 1222], [454, 197, 774, 1226]]),
  ...aaTrio('desktop', [[535, 262, 1244, 1400], [536, 260, 1245, 1397], [537, 259, 1245, 1402], [536, 261, 1246, 1399], [535, 262, 1244, 1404], [537, 260, 1245, 1398]])] };
const chrome = { loads: [
  ...trio('mobile', [[454, 200, 774, 1225], [455, 199, 773, 1228], [454, 201, 775, 1222]], [[361, 198, 773, 1120], [361, 199, 772, 1125], [362, 197, 774, 1130]]),
  ...trio('desktop', [[535, 261, 1245, 1401], [536, 260, 1244, 1399], [535, 262, 1245, 1403]], [[536, 260, 1245, 1398], [535, 261, 1244, 1400], [536, 260, 1245, 1397]])] };
const S6 = (rows, js) => ['K:1', 'V:1', 'V:2', 'K:2', 'K:3', 'V:3'].map((t, i) => { const [a, r] = t.split(':'); return sload(a, +r, ...rows[i], js ?? (a === 'K' ? K12 : V12)); });
const sim = { loads: S6([[380, 200, 300], [290, 199, 300], [291, 200, 299], [381, 200, 300], [380, 201, 301], [290, 200, 300]]) };
const simAa = { loads: S6([[380, 200, 300], [381, 200, 301], [380, 201, 300], [379, 200, 300], [380, 200, 299], [381, 201, 300]], K12) };
const parity = { audit: { mobile: { task10: { deferred: 187 } } } };
const V = (o) => JSON.stringify(Object.fromEntries(Object.entries(o.preds).map(([k, p]) => [k, p.verdict])));

// pass
const c0 = CN.score({ chrome, aa, sim, simAa, parity });
ok(c0.part1 === 'PASS' && ['A0', 'C1', 'C2', 'C3', 'C5', 'C6', 'C7', 'C8'].every((k) => c0.preds[k].verdict === 'hit'), `synthetic pass (${c0.part1} ${V(c0)})`);
// range tolerance: desktop prePaint 1397..1404 -> 7; mobile forcedLayout 197..202 -> 5; floor 2 on desktop efpNav range 2 and sim efpNav range 2
ok(c0.tol.desktop.prePaint.tol === 7 && c0.tol.mobile.forcedLayout.tol === 5 && c0.tol.desktop.efpNav.tol === 2 && c0.tol.sim.efpNav.tol === 2, `range tolerance and floor 2 (${JSON.stringify(c0.tol.desktop.prePaint)})`);
ok(c0.tol.mobile.forcedStyle.tol === 3 && c0.tol.mobile.forcedStyle.median === 773.5, 'tolerance carries the A/A median');
// the P-136 case: desktop prePaint V - K = -5.5 is inside a range tolerance of 7 (P-136's single-pair tol was 4)
const p136like = { loads: chrome.loads.map((l) => (l.vp === 'desktop' ? { ...l, counts: { ...l.counts, 'PrePaint.frame': l.arm === 'K' ? 1404 : 1398 } } : l)) };
const cP = CN.score({ chrome: p136like, aa, sim, simAa, parity });
ok(cP.preds.C5.verdict === 'hit', 'a desktop prePaint gap of 6 within an A/A range of 7 hits C5');
// C5 miss: desktop prePaint V - K = 10 > tol 7
const c5 = CN.score({ chrome: { loads: chrome.loads.map((l) => (l.vp === 'desktop' && l.arm === 'V' ? { ...l, counts: { ...l.counts, 'PrePaint.frame': 1412 } } : l)) }, aa, sim, simAa, parity });
ok(c5.preds.C5.verdict === 'miss' && c5.part1 === 'FAIL', `a desktop prePaint shift beyond the range misses C5, part 1 FAIL (${c5.part1})`);
// C1 miss: one mobile pair drops < 40
const c1 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 2 ? { ...l, api: { nav: { efp: 430 }, all: { efp: 430 } } } : l)) }, aa, sim, simAa, parity });
ok(c1.preds.C1.verdict === 'miss' && c1.part1 === 'FAIL', 'a pair dropping < 40 misses C1, part 1 FAIL');
// A0: a wide mobile forcedLayout tolerance (range 20 > max(5, 5 % of ~200 = 10)) -> A0 miss, part 1 INSUFFICIENT even with a C1 miss
const wideAa = { loads: aa.loads.map((l, i) => (i === 0 ? { ...l, counts: { ...l.counts, 'Layout.forced': 217 } } : l)) };
const cw = CN.score({ chrome, aa: wideAa, sim, simAa, parity });
ok(cw.preds.A0.verdict === 'miss' && cw.part1 === 'INSUFFICIENT', `A0 cap miss -> INSUFFICIENT (${JSON.stringify(cw.preds.A0)})`);
const cw1 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 2 ? { ...l, api: { nav: { efp: 430 }, all: { efp: 430 } } } : l)) }, aa: wideAa, sim, simAa, parity });
ok(cw1.part1 === 'INSUFFICIENT', 'A0 miss outranks a C1 miss: INSUFFICIENT, not FAIL');
// A0 cap edge: tolerance exactly at 5 % of the median passes (desktop forcedStyle median ~1245: cap 62.25; range 62 ok)
const edgeAa = { loads: aa.loads.map((l, i) => (i === 6 ? { ...l, counts: { ...l.counts, 'UpdateLayoutTree.forced': 1244 + 62 } } : l)) };
const ce = CN.score({ chrome, aa: edgeAa, sim, simAa, parity });
ok(ce.preds.A0.verdict === 'hit', `A0 cap: a range of 62 under 5 % of 1245 passes (${JSON.stringify(ce.preds.A0)})`);
// cap floor 5 on small counts: a sim efpNav tolerance is not capped (not used by C3 / C5 / C7), sim forced range 5 on ~200 passes
ok(c0.preds.A0.wide.length === 0, 'no wide tolerance in the pass case');
// >= 3 loads per arm: an A/A with 2 per arm gives no tolerance -> A0 insufficient -> INSUFFICIENT
const aa2 = { loads: aa.loads.filter((l) => l.rep !== 2) };
const c2 = CN.score({ chrome, aa: aa2, sim, simAa, parity });
ok(c2.tol.mobile === null && c2.tol.desktop === null && c2.preds.A0.verdict === 'insufficient' && c2.part1 === 'INSUFFICIENT', 'A/A with 2 loads per arm: no tolerance, A0 insufficient');
// a K / V with 2 per arm is insufficient (C1)
const kv2 = { loads: chrome.loads.filter((l) => !(l.vp === 'mobile' && l.rep === 2)) };
const c3 = CN.score({ chrome: kv2, aa, sim, simAa, parity });
ok(c3.preds.C1.verdict === 'insufficient' && c3.part1 === 'INSUFFICIENT', 'K / V with 2 mobile loads per arm: C1 insufficient');
// other bytes: VOID, C8 miss, the arm short of 3 -> C1 insufficient
const c4 = CN.score({ chrome: { loads: chrome.loads.map((l, i) => (i === 1 ? { ...l, served: ['647c9ef2b1e2', E12] } : l)) }, aa, sim, simAa, parity });
ok(c4.preds.C8.verdict === 'miss' && c4.preds.C1.verdict === 'insufficient' && c4.part1 === 'FAIL', 'a load serving other bytes is VOID (C8 miss)');
// an A/A load not on K bytes is dropped (A/A VOID); with it the arm falls to 2 -> no tolerance
const cA = CN.score({ chrome, aa: { loads: aa.loads.map((l, i) => (i === 1 ? { ...l, served: [V12, E12] } : l)) }, sim, simAa, parity });
ok(cA.aaVoids.length === 1 && cA.tol.mobile === null && cA.part1 === 'INSUFFICIENT', 'an A/A load not on K bytes is VOID and leaves the arm short');
// no Simulator record
const cS = CN.score({ chrome, aa, sim: null, simAa: null, parity });
ok(cS.preds.C6.verdict === 'insufficient' && cS.preds.C7.verdict === 'insufficient' && cS.preds.A0.verdict === 'insufficient' && cS.part1 === 'INSUFFICIENT', 'no Simulator record: C6 / C7 / A0 insufficient, never a pass');
// C7: a sim forced-Layout rise beyond tol misses
const c7 = CN.score({ chrome, aa, sim: { loads: sim.loads.map((l) => (l.arm === 'V' ? { ...l, window: { ...l.window, forcedLayouts: 210 } } : l)) }, simAa, parity });
ok(c7.preds.C7.verdict === 'miss' && c7.part1 === 'FAIL', 'a Simulator forced-Layout rise beyond the A/A range misses C7');
// C2 uses the parity reference / 2 within 25 %
ok(c0.preds.C2.verdict === 'hit' && c0.preds.C2.ref === 93.5, 'C2 against parity task10 deferred / 2');

console.log(bad.length ? `SELFTEST-138 FAIL\n  ${bad.join('\n  ')}` : `SELFTEST-138 OK ${n}`);
process.exit(bad.length ? 1 : 0);

#!/usr/bin/env node
// v9 scorer self-test (run before the pre-data read; needs P-111's own records in this checkout's out/p111/runs and
// P-111's committed result out/p111/score.json, both gitignored, from int-v8's P-111 block):
//   node fixes/v9-best/phone/selftest.mjs   -> "SELFTEST OK <n> checks" (exit 0), the first failure (exit 1), or
//                                              "SELFTEST NO DATA" (exit 2) when the P-111 records are not here
// Checks: (1) re-scoring P-111's M leg and G parts M and E (its own files, in its block order) with P-111's pins gives
// exactly P-111's Mmoving, Mtweens, GM and GE gates; (2) the v9 block verdict is built from those four gates only;
// (3) under the v9 pins the same records are void as "served not arm" (v7 is no v8, v8 is no v9), so the re-pin
// reaches P-111's served check; (4) item mapping: sCo/sCc -> sC, every warm-up skipped, unknown items refused.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pin, P111, V9, mapItem, scoreV9, loadEntries, GATED, S } from './score.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const R = join(root, 'out/p111/runs'), ref = join(root, 'out/p111/score.json');
if (!existsSync(R) || !existsSync(ref)) { console.log('SELFTEST NO DATA (out/p111/runs or out/p111/score.json missing)'); process.exit(2); }
let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.log(`SELFTEST FAIL ${name}: ${e.message}`); process.exit(1); } };
const f = (x) => `${x}:${join(R, `p111-${x}.json`)}`;
const sc = (h) => `sC:${join(R, `p111-sC-${h}.json`)}`;
// P-111's block order for these legs (H3, H4 = M; H7 = G part M; H8 = G part E; each G hold opens and closes with sC)
const pairs = [
  ...['mC1', 'mV2', 'mV3', 'mC4', 'mC5', 'mV6', 'mV7', 'mC8'].map(f),
  sc('H7'), ...['gMC1', 'gMV1', 'gMV2', 'gMC2', 'gMC3', 'gMV3'].map(f), sc('H7'),
  sc('H8'), ...['gEC1', 'gEV1', 'gEV2', 'gEC2', 'gEC3', 'gEV3'].map(f), sc('H8'),
];
const want = JSON.parse(readFileSync(ref, 'utf8'));

pin(P111);
const p = scoreV9(loadEntries(pairs));
for (const k of GATED) check(`P-111 ${k} reproduced`, () => assert.deepEqual(p.gates[k], want.gates[k]));
check('only the four v9 gates', () => assert.deepEqual(Object.keys(p.gates), GATED));
check('verdict from the four gates', () => {
  const vs = GATED.map((k) => want.gates[k].verdict);
  const exp = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  assert.equal(p.verdict, exp);
});
check('no run void under P-111 pins beyond P-111 itself', () => {
  const mine = Object.fromEntries(p.runs.filter((r) => r.item !== 'sC').map((r) => [r.item, r.void.length > 0]));
  const theirs = Object.fromEntries(want.runs.filter((r) => mine[r.item] !== undefined).map((r) => [r.item, r.void.length > 0]));
  assert.deepEqual(mine, theirs);
});

pin(V9);
check('re-pinned EXPECT is v9', () => { assert.equal(S.EXPECT.V.js, V9.V.js); assert.equal(S.EXPECT.C.css, V9.C.css); });
const v = scoreV9(loadEntries(pairs));
check('v7 record on C is void under v9 pins', () => assert.ok(v.runs.find((r) => r.item === 'mC1').void.some((x) => /served not arm C/.test(x))));
check('v8 record on V is void under v9 pins', () => assert.ok(v.runs.find((r) => r.item === 'mV2').void.some((x) => /served not arm V/.test(x))));
check('v9 pins leave every M gate insufficient on P-111 data', () => { assert.match(v.gates.Mmoving.verdict, /^insufficient/); assert.equal(v.verdict, 'insufficient'); });

check('sCo/sCc map to sC', () => { assert.equal(mapItem('sCo'), 'sC'); assert.equal(mapItem('sCc'), 'sC'); });
check('warm-ups skipped', () => { for (const w of ['wC', 'wV', 'wgMC', 'wgMV', 'wgEC', 'wgEV']) assert.equal(mapItem(w), null); });
check('counted items kept', () => { for (const w of ['mC1', 'mV6', 'gMC3', 'gEV2']) assert.equal(mapItem(w), w); });
check('unknown items refused', () => { for (const w of ['C1', 'gHC1', 'gFV2', 'wgHC', 'x']) assert.throws(() => mapItem(w)); });
console.log(`SELFTEST OK ${n} checks`);

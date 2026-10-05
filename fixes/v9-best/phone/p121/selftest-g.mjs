#!/usr/bin/env node
// P-121 gate self-test (needs H3a2's G records out/pv9/runs/pv9-gM{C1,V1,V2}.json and P-111's out/p111/runs/p111-g*.json,
// gitignored): node fixes/v9-best/phone/p121/selftest-g.mjs -> "SELFTEST-G OK <n> checks" | first failure (exit 1) |
// "SELFTEST-G NO DATA" (exit 2). Checks: (1) the Fv replay matches the page's formula on a hand-made touch list;
// (2) part M: H3a2's V records (rev 7c end screen) VOID on traversals and max y; H3a2's C record and P-111's six
// part-M records have >= 5 traversals but VOID on max y >= 5000 (flick-middle-v1 reaches v8's end: why v2 exists);
// a synthetic mid-page copy (frames clamped to 1900-4300) passes; (3) part E fast: P-111's six part-E records pass
// (out strokes released by travel 560 >= 300, fling leaves the end by >= 1600 px); a synthetic caught copy (frames
// after out1 held at the closed rest) VOIDs; (4) part E slow: the same records VOID as "too fast"; a synthetic short
// stroke (travel 180, Fv about -2) passes; near-line strokes are flagged.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strokes, gateM, gateE, RULE } from './gate.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const P = (f) => join(root, 'out', f);
const need = ['pv9/runs/pv9-gMC1.json', 'pv9/runs/pv9-gMV1.json', 'pv9/runs/pv9-gMV2.json', ...[1, 2, 3].flatMap((i) => [`p111/runs/p111-gMC${i}.json`, `p111/runs/p111-gMV${i}.json`, `p111/runs/p111-gEC${i}.json`, `p111/runs/p111-gEV${i}.json`])];
if (!need.every((f) => existsSync(P(f)))) { console.log('SELFTEST-G NO DATA (H3a2 / P-111 G records missing)'); process.exit(2); }
const L = (f) => JSON.parse(readFileSync(P(f), 'utf8'));
let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.log(`SELFTEST-G FAIL ${name}: ${e.message}`); process.exit(1); } };

// (1) Fv replay: moves every 10 ms of 30 px down (finger down = close): EMA -> -3 px/ms; a > 50 ms gap resets it
{
  const T = [[0, 's', 1, 0, 0, 0, 400], [10, 'm', 1, 0, 0, 0, 430], [20, 'm', 1, 0, 0, 0, 460], [30, 'm', 1, 0, 0, 0, 490], [35, 'e', 0, 0, 0, 0, 490]];
  const s = strokes({ touches: T })[0];
  check('Fv replay: three 3 px/ms moves down -> -3', () => assert.equal(s.fv, -3));
  check('Fv replay: travel 90, down, flick', () => { assert.equal(s.travel, 90); assert.equal(s.dir, 'down'); assert.equal(s.flick, true); });
  const T2 = [[0, 's', 1, 0, 0, 0, 400], [10, 'm', 1, 0, 0, 0, 430], [100, 'm', 1, 0, 0, 0, 440], [140, 'e', 0, 0, 0, 0, 440]];
  check('Fv replay: a move > 50 ms after the last restarts the speed', () => assert.equal(strokes({ touches: T2 })[0].fv, 0));
}
// (2) part M
for (const v of ['pv9-gMV1', 'pv9-gMV2']) {
  const r = gateM(L(`pv9/runs/${v}.json`));
  check(`${v} (H3a2 V, rev 7c end screen): VOID, < 5 traversals`, () => { assert.equal(r.ok, false); assert.ok(r.why.some((w) => /traversals of \[2200,3800\] < 5/.test(w))); });
  check(`${v}: VOID on max y too (6035)`, () => assert.ok(r.why.some((w) => /max y 6035 >= 5000/.test(w))));
}
for (const c of ['pv9/runs/pv9-gMC1', ...[1, 2, 3].flatMap((i) => [`p111/runs/p111-gMC${i}`, `p111/runs/p111-gMV${i}`])]) {
  const r = gateM(L(`${c}.json`));
  check(`${c.split('/').pop()}: >= 5 traversals (path covered)`, () => { assert.ok(r.traversals >= 5); assert.ok(!r.why.some((w) => /traversals/.test(w))); });
  check(`${c.split('/').pop()}: VOID on max y >= 5000 (v1 reaches v8's end)`, () => { assert.equal(r.ok, false); assert.ok(r.why.every((w) => /max y \d+ >= 5000/.test(w))); });
}
{
  const j = L('pv9/runs/pv9-gMC1.json');
  for (const s of j.run.segments) for (const f of s.frames) f[2] = Math.min(4300, Math.max(1900, f[2]));
  const r = gateM(j);
  check('synthetic mid-page copy of gMC1 (1900-4300): PASS', () => assert.deepEqual(r.why, []));
  check('the report carries window, moving frames, max y, strokes', () => { assert.ok(r.windowS > 20); assert.ok(r.moving > 100); assert.equal(r.maxY, 4300); assert.equal(r.strokes.length, 6); });
}
// (3) part E, fast
for (const e of [1, 2, 3].flatMap((i) => [`p111-gEC${i}`, `p111-gEV${i}`])) {
  const r = gateE(L(`p111/runs/${e}.json`), 'fast');
  check(`${e} fast: PASS (released by travel, leaves the end)`, () => { assert.deepEqual(r.why, []); assert.ok(r.outs.every((o) => o.by.includes('travel') && o.fromEnd >= 1600)); });
}
{
  const j = L('p111/runs/p111-gEV1.json'), seg = j.run.segments.find((s) => s.marks.some((m) => m[1] === 'out1'));
  const t = Object.fromEntries(seg.marks.map((m) => [m[1], m[0]])), rest = Math.max(seg.docH, seg.docH1) - seg.vh0 - 800;
  for (const f of seg.frames) if (f[0] >= t.out1 && f[0] <= t.into2) f[2] = Math.max(f[2], rest);
  const r = gateE(j, 'fast');
  check('synthetic caught copy (out1 held at the closed rest): VOID "left the end"', () => { assert.equal(r.ok, false); assert.ok(r.why.some((w) => /out1: path not covered: the fling left the end by \d+ < 1600/.test(w))); });
  const r2 = gateE(j, 'fast', { rule: { ...RULE, travel: 1000 } });
  check('a stroke meeting neither condition: VOID "not released by the rule"', () => assert.ok(r2.why.some((w) => /out2: out stroke not released by the rule/.test(w))));
}
// (4) part E, slow
for (const e of ['p111-gEC1', 'p111-gEV1']) check(`${e} slow: VOID too fast (travel 560)`, () => assert.ok(gateE(L(`p111/runs/${e}.json`), 'slow').why.some((w) => /too fast for the slow item/.test(w))));
{
  const j = L('p111/runs/p111-gEC1.json'), seg = j.run.segments.find((s) => s.marks.some((m) => m[1] === 'out1'));
  const t = Object.fromEntries(seg.marks.map((m) => [m[1], m[0]]));
  for (const name of ['out1', 'out2']) {
    const i = seg.touches.findIndex((x) => x[1] === 's' && x[0] >= t[name]); let y = seg.touches[i][6];
    for (let k = i + 1; seg.touches[k] && seg.touches[k][1] === 'm'; k++) { y += 8; seg.touches[k][6] = y; }
  }
  const r = gateE(j, 'slow');
  check('synthetic short out strokes (8 px per move): slow PASS', () => { assert.deepEqual(r.why, []); assert.ok(r.outs.every((o) => !o.released && o.travel < 300 && o.fv > -4.5)); });
  check('gateE refuses an unknown speed', () => assert.throws(() => gateE(j, 'medium')));
}
check('near-line flag: Fv -5.37 is within 0.5 of 5', () => assert.equal(gateE(L('p111/runs/p111-gEV3.json'), 'fast').outs[0].near, true));
console.log(`SELFTEST-G OK ${n} checks`);

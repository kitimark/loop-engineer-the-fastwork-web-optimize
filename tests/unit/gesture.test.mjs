// tools/lib/gesture.mjs: gesture scripts -> W3C touch actions for WebDriverAgent (research/architecture/
// finger-simulation.md §4.2). Pure: profile shapes, the 8 ms point spacing, the safe zone, the
// pull-to-refresh guard, caps, variants/params and a stable compiled hash. No phone, no WDA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../helpers.mjs';
import { profilePos, profileVel, compileStroke, compileScript, strokeOps, SAFE, STEP_MS, SCREEN } from '../../tools/lib/gesture.mjs';

const PROTOCOL = JSON.parse(readFileSync(join(REPO, 'tools', 'gestures', 'finger-protocol-v1.json'), 'utf8'));
const stroke = (o) => compileStroke({ dir: 'up', px: 400, ms: 600, profile: 'minjerk', pressMs: 40, holdMs: 0, x: 215, ...o });
const moves = (c) => c.actions.actions[0].actions.filter((a) => a.type === 'pointerMove');
const script = (steps, extra = {}) => ({ name: 't', version: 1, screen: [430, 932], steps, ...extra });
const S = (o) => ({ type: 'stroke', dir: 'up', px: 400, ms: 600, profile: 'minjerk', ...o });

test('profiles: minjerk starts and ends at rest; fling peaks at lift-off with 1.875 px/ms per (px/ms)', () => {
  for (const p of ['minjerk', 'still', 'fling']) {
    assert.equal(profilePos(p, 0), 0, p);
    assert.ok(Math.abs(profilePos(p, 1) - 1) < 1e-12, p);
    assert.equal(profileVel(p, 0), 0, p);
    for (let u = 0.05; u <= 1; u += 0.05) assert.ok(profilePos(p, u) >= profilePos(p, u - 0.05), `${p} monotone`);
  }
  assert.equal(profileVel('minjerk', 1), 0);
  assert.equal(profileVel('minjerk', 0.5), 1.875);
  assert.equal(profileVel('fling', 1), 1.875);
  for (let u = 0; u < 1; u += 0.01) assert.ok(profileVel('fling', u) <= profileVel('fling', 1), 'fling: velocity never above its lift-off value');
});

test('compileStroke: touch down at the start, press pause, one pointerMove per 8 ms, lift', () => {
  const c = stroke({ ms: 605 });
  const a = c.actions.actions[0];
  assert.deepEqual([a.type, a.id, a.parameters], ['pointer', 'finger1', { pointerType: 'touch' }]);
  assert.deepEqual(a.actions[0], { type: 'pointerMove', duration: 0, x: 215, y: 680 });
  assert.deepEqual(a.actions[1], { type: 'pointerDown', button: 0 });
  assert.deepEqual(a.actions[2], { type: 'pause', duration: 40 });
  assert.deepEqual(a.actions.at(-1), { type: 'pointerUp', button: 0 });
  const m = moves(c).slice(1);
  assert.equal(m.length, Math.ceil(605 / STEP_MS));
  assert.ok(m.slice(0, -1).every((x) => x.duration === STEP_MS));
  assert.equal(m.at(-1).duration, 605 - STEP_MS * (m.length - 1));
  assert.equal(m.reduce((t, x) => t + x.duration, 0), 605);
  assert.equal(m.at(-1).y, 280); // up 400 from 680
  assert.ok(m.every((x) => x.x === 215));
  for (let i = 1; i < m.length; i++) assert.ok(m[i].y <= m[i - 1].y, 'finger moves up monotonically');
  assert.equal(c.kin.moves, m.length);
  assert.equal(c.kin.contactMs, 645);
  // a hold adds a pause before the lift; down strokes start high
  const d = compileStroke({ dir: 'down', px: 300, ms: 400, profile: 'still', pressMs: 0, holdMs: 200, x: 200 });
  const da = d.actions.actions[0].actions;
  assert.deepEqual(da.slice(0, 2), [{ type: 'pointerMove', duration: 0, x: 200, y: 330 }, { type: 'pointerDown', button: 0 }]);
  assert.equal(da[2].type, 'pointerMove', 'pressMs 0: no pause');
  assert.deepEqual(da.slice(-2), [{ type: 'pause', duration: 200 }, { type: 'pointerUp', button: 0 }]);
  assert.equal(moves(d).at(-1).y, 630);
});

test('compileStroke kinematics: fling lifts off at ~1.875 px/ms, minjerk has (almost) stopped', () => {
  const f = stroke({ px: 520, ms: 160, profile: 'fling' });
  assert.equal(f.kin.analyticPeakPxPerS, 6094);
  assert.ok(f.kin.liftoffPxPerS > 5900 && f.kin.liftoffPxPerS <= 6094, f.kin.liftoffPxPerS);
  assert.equal(f.kin.peakPxPerS, f.kin.liftoffPxPerS, 'fling: peak at lift-off');
  const mj = stroke({ px: 450, ms: 900 });
  assert.ok(mj.kin.liftoffPxPerS < 30, `minjerk ends near rest (${mj.kin.liftoffPxPerS})`);
  assert.ok(mj.kin.peakPxPerS > 850 && mj.kin.peakPxPerS < 1000, mj.kin.peakPxPerS);
  assert.equal(stroke({ profile: 'still', holdMs: 150 }).kin.liftoffPxPerS, 0, 'a hold means no velocity at lift-off');
});

test('compileStroke refuses: outside the safe zone, too short (a tap), too long, too fast, still without a hold', () => {
  assert.throws(() => stroke({ x: 100 }), /x \(safe zone\) 100 is outside 140-290/);
  assert.throws(() => stroke({ x: 300 }), /outside 140-290/);
  assert.throws(() => stroke({ y: 760, dir: 'down' }), /end y \(safe zone\) 1160/);
  assert.throws(() => stroke({ y: 150 }), /start y \(safe zone\) 150/);
  assert.throws(() => stroke({ px: 600 }), /px 600 is outside 40-560/);
  assert.throws(() => stroke({ px: 20 }), /px 20 is outside/);
  assert.throws(() => stroke({ ms: 9000 }), /ms 9000/);
  assert.throws(() => stroke({ pressMs: 600 }), /pressMs 600 is outside 0-200/, 'a long press would open a context menu');
  assert.throws(() => stroke({ px: 560, ms: 100, profile: 'fling' }), /lift-off speed \d+ px\/s exceeds 8000/);
  assert.throws(() => stroke({ profile: 'still', holdMs: 100 }), /still needs holdMs >= 150/);
  assert.throws(() => stroke({ profile: 'swipe' }), /profile must be/);
  assert.throws(() => stroke({ dir: 'left' }), /dir must be up or down/);
  assert.throws(() => stroke({ ms: 5000, holdMs: 4000, pressMs: 200, profile: 'still' }), /exceeds 8000/);
  // the extremes of the zone are fine
  const full = stroke({ px: 560 });
  assert.equal(full.kin.y0, SAFE.y[1]); assert.equal(full.kin.y1, SAFE.y[0]);
});

test('every stroke of the protocol script stays inside the safe zone and the screen', () => {
  for (const variant of ['asPerformed', 'slow']) for (const toolbarAtEnd of ['collapsed', 'expanded']) {
    const p = compileScript(PROTOCOL, { params: { variant, toolbarAtEnd } });
    for (const o of strokeOps(p.ops)) for (const a of o.actions.actions[0].actions) {
      if (a.type !== 'pointerMove') continue;
      assert.ok(a.x >= SAFE.x[0] && a.x <= SAFE.x[1] && a.y >= SAFE.y[0] && a.y <= SAFE.y[1], `${o.id} ${a.x},${a.y}`);
      assert.ok(a.x < SCREEN[0] && a.y < SCREEN[1]);
    }
  }
});

test('pull-to-refresh guard: a down stroke needs a guaranteed scrollY >= max(300, px) before it', () => {
  assert.throws(() => compileScript(script([{ type: 'reload' }, S({ dir: 'down' })])), /pull-to-refresh guard: a down stroke of 400 px needs a guaranteed scrollY >= 400 .* only guarantees 0/);
  assert.throws(() => compileScript(script([S({ dir: 'down', px: 100 })])), /needs a guaranteed scrollY >= 300/, 'no reload: unknown position counts as the top');
  // an up drag first: 450 - 15 slop = 435 >= 400
  assert.ok(compileScript(script([S({ px: 450 }), S({ dir: 'down', px: 400 })])));
  assert.throws(() => compileScript(script([S({ px: 400 }), S({ dir: 'down', px: 400 })])), /only guarantees 385/);
  // until y>=N guarantees N; atEnd guarantees endY; atTop resets
  assert.ok(compileScript(script([{ type: 'until', cond: 'y>=600' }, S({ dir: 'down', px: 500 })])));
  assert.ok(compileScript(script([{ type: 'until', cond: 'atEnd' }, S({ dir: 'down', px: 500 })])));
  assert.throws(() => compileScript(script([{ type: 'until', cond: 'atEnd' }, { type: 'until', cond: 'atTop' }, S({ dir: 'down', px: 500 })])), /only guarantees 0/);
  // an optional until guarantees nothing
  assert.throws(() => compileScript(script([{ type: 'until', cond: 'y>=600', optional: true }, S({ dir: 'down', px: 500 })])), /only guarantees 0/);
  // a down fling may end anywhere: the next down stroke is refused...
  assert.throws(() => compileScript(script([{ type: 'until', cond: 'atEnd' }, S({ dir: 'down', px: 520, ms: 140, profile: 'fling' }), S({ dir: 'down', px: 300 })])), /only guarantees 0/);
  // ...also when repeated by an unrolled repeat...
  assert.throws(() => compileScript(script([{ type: 'until', cond: 'atEnd' }, { type: 'repeat', times: 2, steps: [S({ dir: 'down', px: 520, ms: 140, profile: 'fling' })] }])), /repeat\)#2/);
  // ...but a runtime loop with `until` is allowed: the runner reads scrollY before every down stroke and ends the loop
  const p = compileScript(script([{ type: 'until', cond: 'atEnd' }, { type: 'repeat', times: 3, until: 'atTop', steps: [S({ dir: 'down', px: 520, ms: 140, profile: 'fling' }), { type: 'pause', ms: 1500 }] }]));
  const loop = p.ops.find((o) => o.op === 'loop');
  assert.equal(loop.runtimeGuarded, true);
  assert.equal(loop.max, 3);
  assert.deepEqual(loop.until, { kind: 'atTop' });
  assert.equal(loop.body[0].minScrollY, 520);
  assert.equal(p.strokes.length, 1, 'a loop body is compiled once');
  // the first pass of a loop is still checked statically
  assert.throws(() => compileScript(script([{ type: 'reload' }, { type: 'repeat', times: 3, until: 'atTop', steps: [S({ dir: 'down', px: 520, ms: 140, profile: 'fling' })] }])), /only guarantees 0/);
  // up strokes are never guarded
  assert.equal(compileScript(script([{ type: 'reload' }, S({})])).ops[1].minScrollY, null);
});

test('params, $refs and when: variants; unknown or bad fields are errors', () => {
  const sc = script([
    { type: 'repeat', times: '$n', steps: [S({ px: '$px' })] },
    S({ when: { v: 'b' }, ms: 700 }),
  ], { params: { n: 2, px: 300, v: 'a' } });
  let p = compileScript(sc);
  assert.equal(p.strokes.length, 2);
  assert.deepEqual(p.strokes.map((s) => s.px), [300, 300]);
  p = compileScript(sc, { params: { n: '3', v: 'b', px: '200' } }); // CLI strings become numbers
  assert.deepEqual(p.strokes.map((s) => [s.px, s.ms]), [[200, 600], [200, 600], [200, 600], [400, 700]]);
  assert.equal(p.params.n, 3);
  assert.throws(() => compileScript(script([S({ px: '$nope' })])), /unknown param "nope"/);
  assert.throws(() => compileScript(script([S({ when: { nope: 1 } })])), /when refers to unknown param "nope"/);
  assert.throws(() => compileScript(script([{ type: 'swipe' }])), /unknown step type "swipe"/);
  assert.throws(() => compileScript(script([{ type: 'until', cond: 'atMiddle' }, S({})])), /cond must be/);
  assert.throws(() => compileScript(script([{ type: 'pause', ms: 1 }])), /no strokes/);
  assert.throws(() => compileScript({ ...script([S({})]), screen: [390, 844] }), /screen must be \[430,932\]/);
  assert.throws(() => compileScript({ ...script([S({})]), version: 0 }), /version/);
  assert.throws(() => compileScript(script([{ type: 'mark', name: 'a b' }, S({})])), /name must be/);
  assert.throws(() => compileScript(script([{ type: 'repeat', times: 51, steps: [S({})] }])), /times 51/);
  assert.throws(() => compileScript(script([S({})]), { params: { 'bad-name': 1 } }), /bad param name/);
});

test('the protocol script: both variants compile, ~1 min each; the compiled hash is stable', () => {
  const a = compileScript(PROTOCOL);
  const s = compileScript(PROTOCOL, { params: { variant: 'slow' } });
  assert.equal(a.params.variant, 'asPerformed');
  for (const p of [a, s]) {
    assert.equal(p.name, 'finger-protocol-v1');
    assert.ok(p.estMs > 40000 && p.estMs < 90000, `estMs ${p.estMs}`);
    assert.deepEqual(p.ops.slice(0, 3).map((o) => o.op), ['reload', 'mark', 'pause']);
    assert.equal(p.ops[2].ms, 6000, 'the 6 s idle phase at the top');
  }
  const kinds = (p) => p.strokes.map((x) => x.profile);
  assert.ok(kinds(a).includes('fling') && kinds(s).filter((k) => k === 'still').length >= 10);
  assert.notEqual(a.hash, s.hash);
  assert.equal(compileScript(PROTOCOL).hash, a.hash, 'deterministic');
  assert.notEqual(compileScript(PROTOCOL, { params: { pushes: 5 } }).hash, a.hash);
  assert.notEqual(compileScript(PROTOCOL, { params: { x: 216 } }).hash, a.hash);
  // Pinned: a change to the compiler, the profiles or the protocol script changes the stimulus. If that is
  // intended, bump the script's version (or COMPILER_VERSION) and update these; gesture numbers compare only
  // between runs with the same hash.
  assert.equal(a.hash, '03aade25b820b5d39163e9c112c6d0aae801ad9f8ad8b8f87f3d58f2be8e5097');
  assert.equal(s.hash, '6b27d1800ad7729b6da34715a427761553cc07cb45b049d69918f2ba3dc6327b');
});

// tools/lib/gesture.mjs: gesture scripts -> W3C touch actions for WebDriverAgent (research/architecture/
// finger-simulation.md §4.2). Pure: profile shapes, the 8 ms point spacing, the safe zone, the
// pull-to-refresh guard, caps, variants/params and a stable compiled hash. No phone, no WDA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../helpers.mjs';
import { profilePos, profileVel, compileStroke, compileScript, strokeOps, segmentTimes, SAFE, SEG_MIN_MS, SEG_TOL_PX, SCREEN, COMPILER_VERSION } from '../../tools/lib/gesture.mjs';

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

test('compileStroke: touch down at the start, press pause, piecewise-linear moves of >= 40 ms, lift', () => {
  const c = stroke({ ms: 605 });
  const a = c.actions.actions[0];
  assert.deepEqual([a.type, a.id, a.parameters], ['pointer', 'finger1', { pointerType: 'touch' }]);
  assert.deepEqual(a.actions[0], { type: 'pointerMove', duration: 0, x: 215, y: 680 });
  assert.deepEqual(a.actions[1], { type: 'pointerDown', button: 0 });
  assert.deepEqual(a.actions[2], { type: 'pause', duration: 40 });
  assert.deepEqual(a.actions.at(-1), { type: 'pointerUp', button: 0 });
  const m = moves(c).slice(1);
  assert.ok(m.length >= 8 && m.length <= 20, `${m.length} moves: a few per stroke, not one per 8 ms (I-042)`);
  assert.ok(m.every((x) => x.duration >= SEG_MIN_MS), `every segment >= ${SEG_MIN_MS} ms: ${m.map((x) => x.duration)}`);
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

test('I-042, compiler v2: segments >= 40 ms that stay within 1 px of the profile; a 4.5 s drag is a few points, not 558', () => {
  assert.equal(COMPILER_VERSION, 2);
  const cases = [['minjerk', 450, 900], ['minjerk', 560, 600], ['fling', 520, 160], ['drag', 560, 4458], ['still', 200, 800], ['minjerk', 40, 40], ['fling', 300, 79], ['fling', 300, 90], ['drag', 560, 200]];
  for (const [p, px, ms] of cases) {
    const ts = segmentTimes(p, px, ms);
    const tag = `${p} ${px} px ${ms} ms: ${ts}`;
    assert.deepEqual([ts[0], ts.at(-1)], [0, ms], tag);
    const segs = ts.slice(1).map((t, i) => t - ts[i]);
    assert.ok(segs.every((d) => d >= SEG_MIN_MS), `${tag}: a segment under ${SEG_MIN_MS} ms`);
    if (ms < 2 * SEG_MIN_MS) assert.equal(segs.length, 1, tag);
    // a segment the greedy made LONGER than the minimum stays within tolerance (a 40 ms one, and the last, may be
    // forced where the profile bends faster than 1 px per 40 ms)
    const pos = (t) => px * profilePos(p, t / ms, ms);
    for (let i = 1; i < ts.length - 1; i++) {
      if (ts[i] - ts[i - 1] <= SEG_MIN_MS) continue;
      for (let t = ts[i - 1]; t <= ts[i]; t += 1) {
        const lin = pos(ts[i - 1]) + ((pos(ts[i]) - pos(ts[i - 1])) * (t - ts[i - 1])) / (ts[i] - ts[i - 1]);
        assert.ok(Math.abs(lin - pos(t)) <= SEG_TOL_PX + 0.25, `${tag}: ${Math.abs(lin - pos(t)).toFixed(2)} px off at ${t} ms`);
      }
    }
  }
  assert.ok(segmentTimes('minjerk', 450, 900).length - 1 <= 20, 'a 900 ms minjerk: ~15 points (v1: 113)');
  assert.ok(segmentTimes('drag', 560, 4458).length - 1 <= 8, 'a 4458 ms drag: the plateau is one segment (v1: 558)');
  // the durations are what is sent: the compiled moves are the segment lengths
  const c = stroke({ px: 450, ms: 900 });
  const ts = segmentTimes('minjerk', 450, 900);
  assert.deepEqual(moves(c).slice(1).map((x) => x.duration), ts.slice(1).map((t, i) => t - ts[i]));
  assert.equal(c.kin.moves, ts.length - 1);
});

test('compileStroke kinematics: fling lifts off at ~1.875 px/ms, minjerk has (almost) stopped', () => {
  const f = stroke({ px: 520, ms: 160, profile: 'fling' });
  assert.equal(f.kin.analyticPeakPxPerS, 6094);
  // v2: the last segment is >= 40 ms long and XCTest moves at its average speed (v1's last 8 ms sample: > 5900)
  assert.ok(f.kin.liftoffPxPerS > 0.95 * 6094 && f.kin.liftoffPxPerS <= 6094, f.kin.liftoffPxPerS);
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
  // compiler v2 (I-042): v1 was 03aade25b820... / 6b27d1800ad7...
  assert.equal(a.hash, 'ee84ebd4e9163f6b971b092905be79b8f4037f1318f44e70ffeb896bb4adb9b0');
  assert.equal(s.hash, 'd6cc74723029a840796e3360ca76a3ea3201611b4d4513bb22659cc89cabdd89');
});

test('drag profile: smooth 150 ms ramps around a constant plateau, starts and ends at rest; plateau px/s in kin', () => {
  const ms = 4458, a = 150 / ms;
  assert.equal(profilePos('drag', 0, ms), 0);
  assert.ok(Math.abs(profilePos('drag', 1, ms) - 1) < 1e-12);
  assert.equal(profileVel('drag', 0, ms), 0);
  assert.equal(profileVel('drag', 1, ms), 0);
  for (let u = 0.01; u <= 1; u += 0.01) assert.ok(profilePos('drag', u, ms) >= profilePos('drag', u - 0.01, ms), 'monotone');
  for (const u of [0.1, 0.5, 0.9]) assert.ok(Math.abs(profileVel('drag', u, ms) - 1 / (1 - a)) < 1e-12, `plateau at ${u}`);
  // continuous at the ramp ends (the position has no kink)
  for (const u of [a, 1 - a]) assert.ok(Math.abs(profilePos('drag', u - 1e-9, ms) - profilePos('drag', u + 1e-9, ms)) < 1e-6);
  // a short drag: the ramps take at most a quarter each
  assert.ok(Math.abs(profileVel('drag', 0.5, 200) - 1 / 0.75) < 1e-12);
  const d = stroke({ px: 560, ms, profile: 'drag' });
  assert.equal(d.kin.plateauPxPerS, 130, '560 px over 4458 ms with 150 ms of ramps: 130 px/s');
  assert.equal(d.kin.analyticPeakPxPerS, 130);
  assert.ok(Math.abs(d.kin.peakPxPerS - 130) <= 15, `sampled peak ${d.kin.peakPxPerS}`);
  assert.ok(d.kin.liftoffPxPerS <= 15, `ends at rest (${d.kin.liftoffPxPerS})`);
  assert.ok(moves(d).length <= 1 + 8, `the touch-down point, then a few points: the plateau is one long segment (${moves(d).length - 1})`);
  // only drag strokes carry plateauPxPerS: the other profiles' kin (and so v1 scripts' hashes) are unchanged
  assert.equal('plateauPxPerS' in stroke({}).kin, false);
  assert.throws(() => stroke({ profile: 'swipe' }), /profile must be minjerk, fling, still or drag/);
});

test('the slow-drag script (U5): ~130 px/s drags through y 400-900 and back, after a positioning stroke; hash pinned', () => {
  const SLOW = JSON.parse(readFileSync(join(REPO, 'tools', 'gestures', 'slow-drag-v1.json'), 'utf8'));
  const p = compileScript(SLOW);
  assert.equal(p.name, 'slow-drag-v1');
  const drags = p.strokes.filter((s) => s.profile === 'drag');
  assert.equal(drags.length, 2 * p.params.reps);
  for (const s of drags) assert.ok(Math.abs(s.plateauPxPerS - 130) <= 2, `${s.id} ${s.plateauPxPerS} px/s`);
  assert.deepEqual([...new Set(drags.map((s) => s.dir))].sort(), ['down', 'up']);
  const pos = p.strokes[0];
  assert.equal(pos.profile, 'minjerk');
  // positioning lands near 400 (px - 15 of slop) and the up drag then covers the hero band to past 900
  assert.ok(pos.px - 15 <= 400 && pos.px - 15 + drags[0].px - 15 >= 900, `${pos.px} then ${drags[0].px}`);
  for (const o of strokeOps(p.ops)) for (const act of o.actions.actions[0].actions) {
    if (act.type === 'pointerMove') assert.ok(act.x >= SAFE.x[0] && act.x <= SAFE.x[1] && act.y >= SAFE.y[0] && act.y <= SAFE.y[1], `${o.id} ${act.x},${act.y}`);
  }
  assert.ok(p.estMs > 20000 && p.estMs < 60000, `estMs ${p.estMs}`);
  assert.equal(p.ops[2].ms, 6000, 'the 6 s idle phase at the top');
  assert.equal(compileScript(SLOW).hash, p.hash, 'deterministic');
  assert.equal(p.hash, '5bd9f52ed38ec521e5b37797113dcd007cca4648912fabf5b4460cc38793709c', 'pinned like the protocol: a change is a new script version (compiler v2, I-042; v1: ffdf747c4889...)');
});

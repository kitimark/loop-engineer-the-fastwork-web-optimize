// tools/lib/perf-page.mjs: the exact page code verify.mjs injects (LOGGER) and evaluates per phase
// (RESET, COLLECT, COLLECT_AT), run in node:vm with a simulated clock, rAF and a PerformanceObserver
// that delivers entries late, the way Chrome does. verify-fake.test.mjs checks that verify.mjs sends
// exactly these strings. Incident I-002 review: phases now run back to back (idle collect, then the
// scroll reset), so a LoAF from the idle phase's last frame, delivered after the scroll reset, must
// not be counted in the scroll phase; nor may a frame interval that began before the reset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { LOGGER, RESET, COLLECT, COLLECT_AT } from '../../tools/lib/perf-page.mjs';

function page() {
  let now = 0, raf = [], observer = null;
  const ctx = {
    scrollY: 0,
    performance: { now: () => now },
    requestAnimationFrame: (cb) => raf.push(cb),
    PerformanceObserver: class { constructor(cb) { observer = cb; } observe(o) { assert.deepEqual(o, { type: 'long-animation-frame', buffered: false }); } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(LOGGER, ctx);
  const run = (expr) => JSON.parse(JSON.stringify(vm.runInContext(expr, ctx)));
  return {
    at(t) { now = t; },
    frame(t) { now = t; const cbs = raf; raf = []; for (const cb of cbs) cb(t); },
    deliver(...starts) { observer({ getEntries: () => starts.map((s) => ({ startTime: s, duration: 60, blockingDuration: 10, renderStart: 0, styleAndLayoutStart: 0, scripts: [] })) }); },
    reset() { return run(RESET); },
    collect(at = false) { return run(at ? COLLECT_AT : COLLECT); },
    ctx,
  };
}

test('LOGGER + RESET/COLLECT: frames and LoAF of one phase; nothing recorded while off', () => {
  const p = page();
  for (const t of [0, 16, 32]) p.frame(t);
  p.deliver(10); // recording is off
  p.at(40); p.reset();
  assert.equal(p.ctx.__perf.t0, 40, 'RESET stamps the phase start');
  for (const t of [48, 64, 80]) p.frame(t);
  p.deliver(50);
  p.at(90);
  const r = p.collect(true);
  assert.deepEqual(r.frames, [16, 16], 'the 32->48 interval straddles the reset and is not counted');
  assert.deepEqual(r.loaf.map((e) => e.start), [50]);
  assert.equal(r.on, false);
  assert.equal(r.scrollY, 0, 'COLLECT_AT reports scrollY');
  assert.equal('scrollY' in p.collect(), false, 'plain COLLECT is unchanged');
});

test('a LoAF from the previous phase, delivered after the next RESET, is not counted there (back-to-back phases)', () => {
  const p = page();
  p.frame(0);
  p.at(5); p.reset(); // idle phase
  for (const t of [16, 32, 48]) p.frame(t);
  p.deliver(20);
  p.at(60);
  const idle = p.collect(true);
  assert.deepEqual(idle.loaf.map((e) => e.start), [20]);
  // idle's last frame (started at 48) has its LoAF entry still in flight: the scroll reset comes first
  p.at(61); p.reset();
  p.deliver(48, 70); // late idle entry + a real scroll-phase entry, in one callback
  for (const t of [64, 80, 96]) p.frame(t);
  p.ctx.scrollY = 500;
  p.at(100);
  const scroll = p.collect();
  assert.deepEqual(scroll.loaf.map((e) => e.start), [70], 'late idle entry dropped, own entry kept');
  assert.deepEqual(scroll.frames, [16, 16], 'the 48->64 interval began in the idle phase');
});

test('entries delivered after COLLECT are dropped (recording off), as before', () => {
  const p = page();
  p.frame(0);
  p.at(1); p.reset();
  p.frame(16);
  p.at(20);
  const r = p.collect();
  p.deliver(18);
  assert.deepEqual(r.loaf, []);
  assert.equal(p.ctx.__perf.loaf.length, 0);
});

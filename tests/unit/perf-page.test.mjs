// tools/lib/perf-page.mjs: the exact page code verify.mjs injects (LOGGER) and evaluates per phase
// (RESET, COLLECT, COLLECT_AT), run in node:vm with a simulated clock, rAF and a PerformanceObserver
// that delivers entries late, the way Chrome does. verify-fake.test.mjs checks that verify.mjs sends
// exactly these strings. Incident I-002 review: phases now run back to back (idle collect, then the
// scroll reset), so a LoAF from the idle phase's last frame, delivered after the scroll reset, must
// not be counted in the scroll phase; nor may a frame interval that began before the reset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { LOGGER, RESET, COLLECT, COLLECT_AT, loggerSource } from '../../tools/lib/perf-page.mjs';
import { TRACE_ARM, TRACE_DISARM, attributeFrames } from '../../tools/lib/trace-frames.mjs';
import { TRACE_TS, TRACE_EVENTS, TRACE_SYNC, TRACE_WINDOW } from '../fixtures/trace-fixture.mjs';

function page(source = LOGGER) {
  let now = 0, raf = [], observer = null;
  const ctx = {
    scrollY: 0,
    performance: { now: () => now },
    requestAnimationFrame: (cb) => raf.push(cb),
    PerformanceObserver: class { constructor(cb) { observer = cb; } observe(o) { assert.deepEqual(o, { type: 'long-animation-frame', buffered: false }); } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const run = (expr) => JSON.parse(JSON.stringify(vm.runInContext(expr, ctx)));
  return {
    at(t) { now = t; },
    frame(t) { now = t; const cbs = raf; raf = []; for (const cb of cbs) cb(t); },
    deliver(...starts) { observer({ getEntries: () => starts.map((s) => ({ startTime: s, duration: 60, blockingDuration: 10, renderStart: 0, styleAndLayoutStart: 0, scripts: [] })) }); },
    reset() { return run(RESET); },
    collect(at = false) { return run(at ? COLLECT_AT : COLLECT); },
    run,
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

test('loggerSource(): the default is exactly LOGGER; --frame-log adds [t, dt, scrollY] per recorded frame, per phase', () => {
  assert.equal(loggerSource(), LOGGER);
  assert.equal(loggerSource({ frameLog: false }), LOGGER);
  const p = page(loggerSource({ frameLog: true }));
  p.frame(4);
  p.at(4); p.reset();
  p.ctx.scrollY = 100; p.frame(20);
  p.ctx.scrollY = 150; p.frame(54);
  p.at(60);
  const a = p.collect();
  assert.deepEqual(a.frames, [16, 34], 'frames unchanged');
  assert.deepEqual(a.log, [[20, 16, 100], [54, 34, 150]]);
  p.frame(66); // recording off: nothing logged
  p.at(70); p.reset();
  p.ctx.scrollY = 151.6; p.frame(82); p.frame(99);
  p.at(100);
  const b = p.collect();
  assert.deepEqual(b.log, [[99, 17, 152]], 'a new phase starts a new log; the interval straddling the reset is not logged, like frames');
  assert.deepEqual(b.frames, [17]);
});

// --trace-frames (incident I-018 review): the trace recorder (TRACE_ARM) runs next to LOGGER; the window it
// reports (the phase's t0, the last frame recorded before COLLECT) clips the traced frames to exactly the
// phase's frames[], so the traced frames > 20 ms are the phase's gt20 (fixture: tests/fixtures/trace-fixture.mjs).
test('--trace-frames window: traced frames == the logger frames of the phase; traced frames > 20 ms == its gt20', () => {
  const p = page();
  p.ctx.performance.mark = (name) => ({ name, startTime: p.ctx.performance.now() });
  p.at(TRACE_SYNC);
  assert.equal(p.run(TRACE_ARM), TRACE_SYNC, 'the mark is the clock sync point');
  const [first, ...rest] = TRACE_TS;
  p.frame(first); // before the reset
  p.at(TRACE_WINDOW.t0); p.reset();
  for (const t of rest.filter((t) => t <= TRACE_WINDOW.lastOn)) p.frame(t);
  p.at(1120);
  const scroll = p.collect();
  for (const t of rest.filter((t) => t > TRACE_WINDOW.lastOn)) p.frame(t); // after COLLECT
  const d = p.run(TRACE_DISARM);
  assert.deepEqual(d, { ts: TRACE_TS, t0: TRACE_WINDOW.t0, lastOn: TRACE_WINDOW.lastOn });
  const r = attributeFrames(TRACE_EVENTS, { frameTs: d.ts, syncStartTime: TRACE_SYNC, window: { from: d.t0, to: d.lastOn } });
  const gt20 = scroll.frames.filter((x) => x > 20).length;
  assert.equal(gt20, 2);
  assert.equal(r.summary.frames, gt20, 'traced frames > 20 ms == the phase gt20');
  assert.equal(r.summary.windowFrames, scroll.frames.length, 'traced frames == the phase frames');
  assert.deepEqual(r.frames.map((f) => f.dur), scroll.frames.filter((x) => x > 20));
});

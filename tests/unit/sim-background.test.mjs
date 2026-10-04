// tools/lib/sim-background.mjs (incident I-082): the Simulator's own background CPU, read from two process tables.
// Synthetic tables only: no real ps (a sh stand-in for psSnapshot's stamp), no Simulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as BG from '../../tools/lib/sim-background.mjs';

// a Mac with one booted fw-sim: launchd_sim (pid 100) and its tree; a host process and the host-side Sim services outside it
const table = (cpu) => ({
  1: { ppid: 0, cpuSec: 0, command: 'launchd' },
  50: { ppid: 1, cpuSec: cpu.host ?? 0, command: 'node' },
  60: { ppid: 1, cpuSec: cpu.render ?? 0, command: 'SimRenderServer' },
  100: { ppid: 1, cpuSec: cpu.launchd ?? 0, command: 'launchd_sim' },
  101: { ppid: 100, cpuSec: cpu.widget ?? 0, command: 'SleepWidgetExtension' },
  102: { ppid: 100, cpuSec: cpu.diag ?? 0, command: 'diagnosticd' },
  103: { ppid: 100, cpuSec: cpu.safari ?? 0, command: 'MobileSafari' },
  104: { ppid: 103, cpuSec: cpu.wc ?? 0, command: 'com.apple.WebKit.WebContent' },
  105: { ppid: 100, cpuSec: cpu.wda ?? 0, command: 'WebDriverAgentRunner-Runner' },
  106: { ppid: 100, cpuSec: cpu.bbd ?? 0, command: 'backboardd' },
  107: { ppid: 100, cpuSec: cpu.search ?? 0, command: 'searchd' },
});
const snap = (atSec, cpu) => ({ at: atSec * 1000, wall: Date.UTC(2026, 9, 3, 6, 44) + atSec * 1000, procs: table(cpu) });

test('simTree: every launchd_sim and its descendants, nothing else; kindOf: page, driver, background', () => {
  const t = BG.simTree(table({}));
  assert.deepEqual(t.roots, [100]);
  assert.deepEqual([...t.pids].sort((a, b) => a - b), [100, 101, 102, 103, 104, 105, 106, 107]);
  assert.equal(BG.simTree({ 1: { ppid: 0, cpuSec: 0, command: 'launchd' } }).roots.length, 0, 'no Simulator: no tree');
  assert.equal(BG.kindOf('com.apple.WebKit.WebContent'), 'page');
  assert.equal(BG.kindOf('MobileSafari'), 'page');
  assert.equal(BG.kindOf('WebDriverAgentRunner-Runner'), 'driver');
  assert.equal(BG.kindOf('testmanagerd'), 'driver');
  assert.equal(BG.kindOf('backboardd'), 'render');
  assert.equal(BG.kindOf('diagnosticd'), 'log');
  assert.equal(BG.kindOf('logd'), 'log');
  assert.equal(BG.kindOf('SleepWidgetExtension'), 'background');
  assert.equal(BG.kindOf('searchd'), 'background');
});

test('between: CPU-time deltas in % of one core per class; the page, its compositor, the log relay, WDA and host processes are not background; host-side Sim services apart', () => {
  // 3 s: the widget burns 3 s (100 %), searchd 0.9 s (30 %), diagnosticd 1.5 s (50 %), backboardd 0.6 s (20 %),
  // WebContent 2.7 s (90 %), the host node 6 s (not the Sim)
  const w = BG.between(snap(0, {}), snap(3, { widget: 3, search: 0.9, diag: 1.5, bbd: 0.6, wc: 2.7, safari: 0.3, wda: 0.3, host: 6, render: 0.6 }));
  assert.equal(w.windowSec, 3);
  assert.equal(w.sims, 1);
  assert.equal(w.bgPct, 130);
  assert.equal(w.pagePct, 100);
  assert.equal(w.renderPct, 20);
  assert.equal(w.logPct, 50);
  assert.equal(w.driverPct, 10);
  assert.equal(w.hostSimPct, 20);
  assert.deepEqual(w.top, [{ command: 'SleepWidgetExtension', kind: 'background', cpuPct: 100 }, { command: 'searchd', kind: 'background', cpuPct: 30 }]);
  assert.equal(w.page[0].command, 'com.apple.WebKit.WebContent');
  assert.equal(BG.between(null, snap(3, {})), null);
  assert.equal(BG.between(snap(3, {}), snap(3, {})), null, 'no window');
});

test('between: a process born in the window counts all its CPU; a reused pid with another command does not subtract the old one\'s time', () => {
  const a = snap(0, { search: 100 });
  const b = snap(2, { search: 101 });
  b.procs[106] = { ppid: 100, cpuSec: 1, command: 'searchd' }; // born inside the window
  b.procs[107] = { ppid: 100, cpuSec: 1, command: 'swcd' }; // pid 107 was searchd at a (cpuSec 100)
  const w = BG.between(a, b);
  assert.deepEqual(w.top.map((x) => [x.command, x.cpuPct]), [['searchd', 50], ['swcd', 50]]);
});

test('describe / settleLine / summaryLine: one line each, the busiest background processes named', () => {
  const w = BG.between(snap(0, {}), snap(3, { widget: 3, search: 1.5, diag: 1.5, bbd: 0.6, wc: 2.7 }));
  assert.equal(BG.describe(w, 37.4), 'sim background 150 % of a core (SleepWidgetExtension 100 %, searchd 50 %), page 90 %, render 20 %, log 50 %, load1 37');
  assert.equal(BG.describe(null), 'sim background unknown');
  assert.match(BG.settleLine({ settled: false, waitedSec: 45, limitPct: 60, maxSec: 45, last: w, load1End: 40 }), /^SIM_QUIET NOT settled after 45 s \(limit 60 % of a core, max 45 s\): sim background 150 %/);
  assert.equal(BG.settleLine({ skipped: 'a test process without FW_PS' }), 'SIM_QUIET skipped (a test process without FW_PS)');
  const s = { everySec: 10, limitPct: 60, n: 6, bgMax: 150, bgMean: 70.4, pageMean: 80, renderMean: 30.2, logMean: 61, busy: 2, top: [{ command: 'SleepWidgetExtension', cpuPct: 55 }], load1Max: 40.2 };
  assert.match(BG.summaryLine(s), /^SIM_BACKGROUND 6 windows of 10 s: sim background mean 70 %, max 150 % of a core; 2 window\(s\) above 60 %; busiest over the command: SleepWidgetExtension 55 %; means: page 80 %, render 30 %, log 61 %; load1 max 40/);
  assert.equal(BG.summaryLine({ skipped: 'FW_SIM_BG_EVERY_SEC=0' }), 'SIM_BACKGROUND skipped (FW_SIM_BG_EVERY_SEC=0)');
  assert.match(BG.summaryLine({ ...s, n: 0 }), /no complete window/);
});

test('config: defaults, env overrides, bad values refused', () => {
  assert.deepEqual(BG.config({}), { settleSec: 60, limitPct: 60, windowSec: 3, everySec: 10 });
  assert.deepEqual(BG.config({ FW_SIM_SETTLE_SEC: '0', FW_SIM_BG_LIMIT_PCT: '120', FW_SIM_BG_EVERY_SEC: '0' }), { settleSec: 0, limitPct: 120, windowSec: 3, everySec: 0 });
  assert.throws(() => BG.config({ FW_SIM_SETTLE_SEC: '-1' }), /FW_SIM_SETTLE_SEC must be a number >= 0/);
  assert.throws(() => BG.config({ FW_SIM_BG_LIMIT_PCT: 'x' }), /FW_SIM_BG_LIMIT_PCT/);
});

test('refused: a test process (node --test, or a stubbed host) never reads the real ps without FW_PS', () => {
  assert.equal(BG.refused({ NODE_TEST_CONTEXT: 'child' }), true);
  assert.equal(BG.refused({ FW_TEST_HOST: '/x/fake-host.mjs' }), true);
  assert.equal(BG.refused({ NODE_TEST_CONTEXT: 'child', FW_PS: '/x/ps' }), false);
  assert.equal(BG.refused({}), false);
  assert.equal(BG.psSnapshot({ env: { NODE_TEST_CONTEXT: 'child' } }), null);
});

// a sequence of tables, one per snap() call; time advances by the fake sleep
function fakeClock(perWindow) {
  let t = 0, i = 0, cum = {};
  const sleep = async (ms) => { t += ms / 1000; };
  const snapF = () => {
    const add = perWindow[Math.min(i, perWindow.length - 1)];
    if (i > 0) for (const [k, v] of Object.entries(add)) cum[k] = (cum[k] ?? 0) + v;
    i++;
    return snap(t, cum);
  };
  return { sleep, snap: snapF, calls: () => i };
}

test('settle: waits windows until the background is at or below the limit, then stops; records every window', async () => {
  // windows of 3 s: the widget at 100 % twice, then quiet (searchd 30 %; diagnosticd at 100 % is the log relay, not background)
  const c = fakeClock([{}, { widget: 3, search: 0.9 }, { widget: 3, search: 0.9 }, { search: 0.9, diag: 3 }, { search: 0.9 }]);
  const r = await BG.settle({ maxSec: 45, limitPct: 60, sleep: c.sleep, snap: c.snap, load: () => 12 });
  assert.equal(r.settled, true);
  assert.equal(r.windows.length, 3);
  assert.deepEqual(r.windows.map((w) => w.bgPct), [130, 130, 30]);
  assert.equal(r.windows[0].top[0].command, 'SleepWidgetExtension');
  assert.equal(r.last.bgPct, 30);
  assert.equal(r.load1Start, 12);
});

test('settle: a background that never settles ends at maxSec, NOT settled, never throws; maxSec 0 takes one reading only; skipped without ps', async () => {
  let wall = 0;
  const realNow = Date.now;
  Date.now = () => wall;
  try {
    const c = fakeClock([{}, { widget: 3 }]);
    const sleep = async (ms) => { wall += ms; await c.sleep(ms); };
    const r = await BG.settle({ maxSec: 10, limitPct: 60, sleep, snap: c.snap, load: () => 1 });
    assert.equal(r.settled, false);
    assert.equal(r.windows.length, 3, '3 windows of 3 s fit in 10 s, a 4th would not');
    assert.ok(r.windows.every((w) => w.bgPct === 100));
    const c0 = fakeClock([{}, { widget: 3 }]);
    const r0 = await BG.settle({ maxSec: 0, limitPct: 60, sleep: async (ms) => { wall += ms; await c0.sleep(ms); }, snap: c0.snap, load: () => 1 });
    assert.equal(r0.windows.length, 1, 'one reading, no wait beyond it');
    assert.equal(r0.settled, false);
  } finally { Date.now = realNow; }
  const s = await BG.settle({ maxSec: 10, limitPct: 60, env: { NODE_TEST_CONTEXT: 'child' } });
  assert.deepEqual(s, { skipped: 'a test process without FW_PS', limitPct: 60 });
});

test('monitor: one window per tick, onWindow gets each, stop() summarizes (mean, max, busy windows, busiest over the whole command); off with everySec 0', async () => {
  const c = fakeClock([{}, { widget: 0.3, search: 0.03 }, { search: 0.03 }, { widget: 0.3 }]);
  let t = 0;
  const snapF = () => { t += 0.1; const s = c.snap(); return { ...s, at: t * 1000 }; };
  const seen = [];
  const m = BG.monitor({ everySec: 0.05, limitPct: 60, snap: snapF, load: () => 20, onWindow: (w) => seen.push(w.bgPct) });
  for (let i = 0; i < 500 && seen.length < 2; i++) await new Promise((r) => setTimeout(r, 10)); // two ticks, however loaded the host
  const s = m.stop();
  assert.ok(s.n >= 3, `windows: ${s.n}`);
  assert.equal(seen.length, s.n);
  assert.deepEqual(s.windows.slice(0, 3).map((w) => w.bgPct), [330, 30, 300]);
  assert.equal(s.bgMax, 330);
  assert.ok(s.busy >= 2);
  assert.equal(s.top[0].command, 'SleepWidgetExtension');
  assert.equal(s.load1Max, 20);
  assert.deepEqual(BG.monitor({ everySec: 0 }).stop(), { skipped: 'FW_SIM_BG_EVERY_SEC=0' });
  assert.deepEqual(BG.monitor({ everySec: 1, env: { FW_TEST_HOST: 'x' } }).stop(), { skipped: 'a test process without FW_PS' });
});

// I-120: a ps call that takes `span` s, the table read at an instant inside it (readAt 0 = its start, 1 = its end), as with a
// ps (or the tests' node fake ps) slowed by host load. bg: the Sim background's true CPU, % of one core (widget + searchd 30 %).
// step: fake seconds between two calls (the monitor's timer); settle's sleep advances the clock too.
function slowPs({ bg = 130, calls = [], step = 0 } = {}) {
  let t = 0, k = 0;
  const sleep = async (ms) => { t += ms / 1000; };
  const snapF = () => {
    if (k > 0) t += step;
    const { span = 0.02, readAt = 0.5 } = calls[k++] ?? {};
    const read = t + span * readAt;
    const s = { at: (t + span / 2) * 1000, span: span * 1000, wall: Date.UTC(2026, 9, 4, 6, 12) + t * 1000, procs: table({ widget: (read * (bg - 30)) / 100, search: read * 0.3 }) };
    t += span;
    return s;
  };
  return { sleep, snap: snapF, now: () => t, calls: () => k };
}
const within = (ws, bg) => ws.every((w) => w.bgPct >= bg * (1 - BG.MAX_SKEW) - 0.1 && w.bgPct <= bg * (1 + BG.MAX_SKEW) + 0.1);

test('I-120 psSnapshot: stamped at the middle of the ps call, with the call\'s span (ps reads the table somewhere inside it)', () => {
  const d = mkdtempSync(join(tmpdir(), 'fw-simbg-'));
  const ps = join(d, 'ps');
  writeFileSync(ps, '#!/bin/sh\necho "  100     1   0:01.50 /x/launchd_sim"\necho "  101   100   0:03.00 /x/SleepWidgetExtension"\n', { mode: 0o755 });
  const times = [1000, 1400];
  let i = 0;
  try {
    const s = BG.psSnapshot({ env: { FW_PS: ps }, now: () => times[i++] });
    assert.equal(i, 2, 'one clock reading before ps, one after');
    assert.equal(s.at, 1200);
    assert.equal(s.span, 400);
    assert.equal(s.procs[101].cpuSec, 3);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('I-120 between: skew = the stamps\' uncertainty (half of each ps call) over the window; 0 without spans', () => {
  const c = slowPs({ calls: [{ span: 0.35, readAt: 0 }, { span: 0.02, readAt: 1 }], step: 0.4 });
  const w = BG.between(c.snap(), c.snap());
  assert.equal(w.windowSec, 0.6);
  assert.ok(Math.abs(w.skew - 0.185 / 0.585) < 0.001, `skew ${w.skew}`);
  assert.ok(w.skew > BG.MAX_SKEW);
  assert.equal(BG.between(snap(0, {}), snap(3, { widget: 3 })).skew, 0);
});

test('I-120 monitor: a slow ps call (host load) no longer inflates or deflates a window: a window whose stamps are too uncertain extends to the next tick; a real overrun still counts', async () => {
  const calls = [{ span: 0.35, readAt: 0 }, { span: 0.02, readAt: 1 }, {}, { span: 0.3, readAt: 1 }, { span: 0.02, readAt: 0 }, {}, { span: 0.3, readAt: 0 }, {}];
  for (const bg of [130, 200]) {
    const c = slowPs({ bg, calls, step: 0.4 });
    const m = BG.monitor({ everySec: 0.05, limitPct: 60, snap: c.snap, load: () => 34 });
    for (let i = 0; i < 500 && c.calls() < calls.length; i++) await new Promise((r) => setTimeout(r, 10));
    const s = m.stop();
    assert.ok(s.n >= 1, `windows: ${s.n}`);
    assert.ok(s.n < c.calls() - 1, `uncertain windows merged: ${s.n} windows from ${c.calls()} readings`);
    assert.ok(within(s.windows, bg), `bg ${bg}: every window within ±${BG.MAX_SKEW * 100} %: ${s.windows.map((w) => w.bgPct)}`);
    assert.ok(s.windows.every((w) => !w.uncertain));
    assert.equal(s.busy, s.n, 'every window is above the limit');
    assert.ok(s.bgMax >= bg * (1 - BG.MAX_SKEW));
  }
  // the command ended within one uncertain window: kept, flagged, rather than no window at all
  const c = slowPs({ calls: [{ span: 0.35, readAt: 0 }], step: 0.4 });
  const s = BG.monitor({ everySec: 0.05, limitPct: 60, snap: c.snap, load: () => 34 }).stop();
  assert.equal(s.n, 1);
  assert.equal(s.windows[0].uncertain, true);
});

test('I-120 settle: an uncertain window extends to the next reading; when time is up with nothing else read, it is kept and flagged', async () => {
  let c = null; // the wall clock follows the fake one (sleeps and ps calls)
  const realNow = Date.now;
  Date.now = () => c.now() * 1000;
  try {
    for (const bg of [130, 200]) {
      c = slowPs({ bg, calls: [{ span: 3, readAt: 0 }, {}, {}, {}, { span: 2.5, readAt: 1 }, { span: 0.02, readAt: 0 }] });
      const r = await BG.settle({ maxSec: 30, limitPct: 60, sleep: c.sleep, snap: c.snap, load: () => 34 });
      assert.equal(r.settled, false);
      assert.ok(r.windows.length >= 2 && r.windows.length < c.calls() - 1, `windows ${r.windows.length} from ${c.calls()} readings`);
      assert.ok(within(r.windows, bg), `bg ${bg}: ${r.windows.map((w) => w.bgPct)}`);
      assert.ok(r.windows.every((w) => !w.uncertain));
    }
    c = slowPs({ calls: [{ span: 3, readAt: 0 }] });
    const r = await BG.settle({ maxSec: 0, limitPct: 60, sleep: c.sleep, snap: c.snap, load: () => 34 });
    assert.equal(r.windows.length, 1, 'one reading, no wait beyond it');
    assert.equal(r.windows[0].uncertain, true);
    assert.equal(r.last.bgPct, r.windows[0].bgPct);
  } finally { Date.now = realNow; }
});

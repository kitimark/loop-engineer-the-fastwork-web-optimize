// tests/fixtures/fake-host.mjs (the stubbed host of every default test): its CPU accounting runs on its fake
// clock only (I-027 E). verify-fake's "host record per run and phase" asserted chromeCpuPct 5 and failed with
// 5.1 under load: the Chrome window (treeCpu before the start snapshot, after the end snapshot) also counted
// the real time between those calls. Here that real time is injected on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const fake = await import('../fixtures/fake-host.mjs');
const host = await import('../../tools/lib/host.mjs');
const realDelay = (ms) => new Promise((r) => setTimeout(r, ms)); // real time, not the stub's sleep

/** verify.mjs hostStart/hostEnd, with a real delay around each snapshot (a loaded test host). */
async function phase(windowMs, gapMs) {
  const samplers = fake;
  const c0 = await host.treeCpuSec(process.pid, { samplers });
  await realDelay(gapMs);
  const a = await host.snapshot({ samplers });
  await realDelay(gapMs);
  await fake.sleep(windowMs);
  await realDelay(gapMs);
  const b = await host.snapshot({ samplers });
  await realDelay(gapMs);
  const c1 = await host.treeCpuSec(process.pid, { samplers });
  const dt = b.ticks.total - a.ticks.total;
  const pct = (x) => Math.round((1000 * x) / dt) / 10;
  return { busy: pct(b.ticks.busy - a.ticks.busy), sys: pct(b.ticks.sys - a.ticks.sys), chrome: pct((c1 - c0) * 1000) };
}

test('fake host: CPU busy, sys and Chrome tree CPU are exact over a window, whatever real time passes between the readings', async () => {
  for (const [windowMs, gapMs] of [[1000, 0], [1000, 80], [500, 150]]) {
    assert.deepEqual(await phase(windowMs, gapMs), { busy: 5, sys: 1.5, chrome: 5 }, `${windowMs} ms window, ${gapMs} ms real gaps`);
  }
});

test('fake host: no fake time, no CPU time (real time alone accrues nothing)', async () => {
  const t0 = fake.treeCpu(), c0 = fake.cpus()[0].times;
  await realDelay(60);
  assert.equal(fake.treeCpu(), t0);
  assert.deepEqual(fake.cpus()[0].times, c0);
  await fake.sleep(1000);
  assert.equal(Math.round((fake.treeCpu() - t0) * 1000), 400, '0.4 cores for 1 s of fake time');
});

test('I-031 fake host: procTable lists FAKE_HOST_PROCS (default WindowServer 12 %, mds_stores 3 % of one core), exact on its mono clock', async () => {
  const a = await host.procsSnapshot({ samplers: fake });
  await realDelay(40);
  await fake.sleep(2000);
  const b = await host.procsSnapshot({ samplers: fake });
  const t = host.topProcs(a, b);
  assert.ok(t.windowSec >= 2 && t.windowSec < 2.5, `window ${t.windowSec}`);
  assert.deepEqual(t.top, [{ pid: 427, command: 'WindowServer', cpuPct: 12 }, { pid: 377, command: 'mds_stores', cpuPct: 3 }]);
});

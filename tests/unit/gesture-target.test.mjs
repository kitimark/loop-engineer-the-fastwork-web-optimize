// Where a gesture run plays (tools/lib/gesture-run.mjs phoneTarget, tools/lib/sim-scroll.mjs gestureTarget) and the
// /appium/settings echo a run records (I-042). The end-to-end runs are tests/e2e/iphone-gesture.test.mjs (phone) and
// tests/e2e/sim.test.mjs (sim.mjs gesture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

process.env.FW_STATE_DIR = tempDir('fw-gtarget-');
process.env.FW_SIM_WDA_PORT = '8199';
const { settingsEcho, phoneTarget, TOOL_FILES } = await import('../../tools/lib/gesture-run.mjs');
const { gestureTarget, SIM_TOOL_FILES } = await import('../../tools/lib/sim-scroll.mjs');

test('settingsEcho: the values WDA applied for our keys, and how many it echoed; nothing else', () => {
  assert.deepEqual(settingsEcho({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: 'com.apple.mobilesafari', boundElementsByIndex: false, snapshotMaxDepth: 50 }),
    { waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: 'com.apple.mobilesafari', echoed: 5 });
  assert.deepEqual(settingsEcho({ waitForIdleTimeout: 10 }), { waitForIdleTimeout: 10, animationCoolOffTimeout: null, defaultActiveApplication: null, echoed: 1 });
  assert.deepEqual(settingsEcho(null), { waitForIdleTimeout: null, animationCoolOffTimeout: null, defaultActiveApplication: null, echoed: 0 });
});

test('phoneTarget: the iphone lease guards it; without the lease, lost() names it', () => {
  const t = phoneTarget({ owner: 'me' });
  assert.equal(t.device, 'iPhone 15 Pro Max, iOS 26.6.1 Safari');
  assert.equal(t.outDir, 'iphone');
  assert.equal(t.wdaBase, undefined, 'the phone uses WDA_URL() ($FW_WDA_URL or :8100)');
  assert.deepEqual(t.toolFiles, TOOL_FILES);
  assert.match(t.lost(), /lost the iphone lease/);
  assert.match(t.wdaHint, /iphone\.mjs wda start --owner me/);
});

test('I-056 phoneTarget.preflight: the phone measure guard of iphone.mjs run (a G run refuses beside someone\'s normal hold or a shared group; the runner\'s own hold passes)', async () => {
  const { tryAcquire, release, setSharedSwitch, releaseReader } = await import('../../tools/lib/lock.mjs');
  assert.equal((await tryAcquire('iphone', { owner: 'me', ttlSec: 900 })).ok, true);
  const t = phoneTarget({ owner: 'me' });
  assert.equal(t.preflight(60000).pageSource, 'your lease', 'chrome-measure free: the run goes');
  assert.equal((await tryAcquire('chrome-measure', { owner: 'fix-ab', ttlSec: 600 })).ok, true);
  assert.throws(() => t.preflight(60000), /^Error: WAIT: chrome-measure is held by "fix-ab" \(a normal hold/);
  assert.equal(phoneTarget({ owner: 'me', allowDuringMeasure: true }).preflight(60000).pageSource, 'your lease', '--allow-during-measure (diagnostics)');
  await release('chrome-measure', { owner: 'fix-ab' });
  assert.equal((await tryAcquire('chrome-measure', { owner: 'me', ttlSec: 600 })).ok, true);
  assert.equal(t.preflight(60000).pageSource, 'your lease', 'the same owner\'s hold');
  await release('chrome-measure', { owner: 'me' });
  await setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'unit test' });
  const g = await tryAcquire('chrome-measure', { owner: 'de-counts-sim', shared: true, weight: 3, maxSec: 120 }); // the opener: no load check
  assert.equal(g.ok, true);
  assert.throws(() => t.preflight(60000), /^Error: WAIT: chrome-measure is held by the shared lane \("de-counts-sim" w3\)/);
  await releaseReader('chrome-measure', g.reader.token);
  await release('iphone', { owner: 'me' });
});

test('gestureTarget (Simulator): the session and the hold guard it; WDA-sim on the session WDA port; meta.sim and n/a settings', async () => {
  let T = 1_000_000, inSession = true, checks = 0;
  const END = T + 300000;
  const requireSession = () => { if (!inSession) throw new Error('no live Simulator session'); return { id: 's1' }; };
  const t = gestureTarget({ id: 's1', window: 'hidden', proxyPorts: { list: 1, tabs: 2, wda: 8199 } }, { requireSession, holdEndsAt: () => END, now: () => T, check: async () => { checks++; }, load: async () => ({ load1: 1 }) });
  assert.equal(t.device, 'simulator');
  assert.equal(t.outDir, 'sim');
  assert.equal(t.wdaBase, 'http://127.0.0.1:8199');
  for (const f of [...SIM_TOOL_FILES, ...TOOL_FILES]) assert.ok(t.toolFiles.includes(f), f);
  await assert.rejects(t.preflight(200000), /needs about 330 s, but your chrome-measure hold leaves 260 s/);
  assert.deepEqual(await t.preflight(60000), { pageUrl: null, pageSource: null });
  assert.equal(checks, 1, 'the SIMULATOR-only proxy check ran');
  assert.equal(t.lost(), null);
  T += 270000;
  assert.match(t.lost(), /hold is ending: stopped between strokes/);
  inSession = false;
  assert.match(t.lost(), /lost the Simulator session: no live Simulator session/);
  const x = await t.extra();
  assert.deepEqual(x.settings, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  assert.deepEqual(x.sim.hostLoad, { start: { load1: 1 }, end: { load1: 1 } });
  assert.equal(x.sim.window, 'hidden');
});

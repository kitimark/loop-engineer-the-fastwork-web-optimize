// The fakes and helpers of the sim.mjs end-to-end tests (tests/e2e/sim.test.mjs: the session itself;
// tests/e2e/sim-tools.test.mjs: the tools inside a session), split in two files so they run in parallel (user T-105 #2,
// ts-testspeed). Importing it registers the per-test hooks: a fresh temp dir, state dir, fake simctl / iwdp / tools and
// free ports per test, and the I-072 fixture kill. Nothing here is shared between the two files (each runs in its own
// process with its own temp dirs and ports).
import { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, killFixtures } from '../helpers.mjs';

export const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs');
export const FX = (n) => join(TESTS, 'fixtures', n);
export const PHONE = '00008130-0011223344556677'; // made up, the shape of a real iPhone UDID
export const PHONE2 = '00008101-0A0B0C0D0E0F1011';
export const RUNTIME = { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77', isAvailable: true, platform: 'iOS' };
export const UUID = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;
export let dir, env; // live bindings: the test files read the values the beforeEach below sets
// I-072: every fixture a test's tools started detached (runner, iproxy, iwdp, tab) dies with that test, pass or fail
let fixturesSince = 0;
beforeEach(() => { fixturesSince = Date.now(); });
afterEach(() => { killFixtures({ since: fixturesSince }); });

export function wrapper(name, script, pre = []) {
  const f = join(dir, 'bin', name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${pre.map((x) => `"${x}"`).join(' ')} "$@"\n`);
  chmodSync(f, 0o755);
  return f;
}
beforeEach(async () => {
  dir = tempDir('fw-sim-');
  writeFileSync(join(dir, 'simctl.json'), JSON.stringify({ runtimes: [RUNTIME], devices: [] }));
  const xcb = join(dir, 'bin', 'xcodebuild');
  wrapper('x', FX('fake-sim-tools.mjs'));
  // `xcodebuild -version` answers like Xcode 26.6; anything else is tests/fixtures/fake-xcodebuild.mjs (WDA build / runner)
  writeFileSync(xcb, `#!/bin/sh\nif [ "$1" = "-version" ]; then echo "Xcode 26.6"; echo "Build version 17F113"; exit 0; fi\nexec "${process.execPath}" "${FX('fake-xcodebuild.mjs')}" "$@"\n`); chmodSync(xcb, 0o755);
  env = {
    FW_STATE_DIR: join(dir, 'state'),
    FW_SIMCTL: wrapper('simctl', FX('fake-simctl.mjs')), FW_IWDP: wrapper('iwdp', FX('fake-iwdp.mjs')),
    FW_LSOF: wrapper('lsof', FX('fake-sim-tools.mjs'), ['lsof']), FW_IDEVICE_ID: wrapper('idevice_id', FX('fake-sim-tools.mjs'), ['idevice_id']),
    FW_OPEN: wrapper('open', FX('fake-sim-tools.mjs'), ['open']), FW_OSASCRIPT: wrapper('osascript', FX('fake-sim-tools.mjs'), ['osascript']), FW_XCODEBUILD: xcb,
    FAKE_SIMCTL_STATE: join(dir, 'simctl.json'), FAKE_SIMCTL_LOG: join(dir, 'simctl.jsonl'), FAKE_IWDP_LOG: join(dir, 'iwdp.jsonl'), FAKE_SIMTOOLS_LOG: join(dir, 'tools.jsonl'),
    FAKE_MACAPP_STATE: join(dir, 'app'), FAKE_IDEVICE_IDS: PHONE, FAKE_IWDP_PHONES: PHONE,
    FW_SIM_DEVICE_PORT: String(await freePort()), FW_SIM_PORT: String(await freePort()), FW_SIM_WDA_PORT: String(await freePort()),
    FW_SIM_IDLE_SEC: '0', // I-063: these tests cover the cold path (shutdown at the end); the warm device: tests/e2e/sim-warm.test.mjs
  };
});
export const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const simctlCalls = () => lines(env.FAKE_SIMCTL_LOG).map((a) => a[0]);
export const device = () => JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')).devices[0];
export const simDir = () => join(env.FW_STATE_DIR, 'sim');
export const setup = () => { const r = node(SIM, ['setup'], { env }); assert.equal(r.code, 0, r.out); return device().udid; };
/** `lock.mjs run chrome-measure --owner me [lockArgs] -- node sim.mjs session --owner me --window hidden [sessArgs] -- <cmd...>` */
export const inHold = (cmd, { lockArgs = [], sessArgs = ['--window', 'hidden'], e = env, timeout = 90000 } = {}) =>
  nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', ...lockArgs, '--', process.execPath, SIM, 'session', '--owner', 'me', ...sessArgs, '--', ...cmd], { env: e, timeout });
export const childJs = (js) => [process.execPath, '-e', js];
export function noIds(text, udid) {
  for (const id of [PHONE, PHONE2, udid].filter(Boolean)) assert.ok(!text.toLowerCase().includes(id.toLowerCase()), `an id leaked: ${text}`);
  assert.ok(!/Test Person/.test(text), 'a device name leaked');
}
export function cleanedUp() {
  assert.equal(device().state, 'Shutdown', 'the Simulator is shut down');
  assert.ok(simctlCalls().includes('shutdown'), 'simctl shutdown was called');
  assert.ok(!existsSync(join(simDir(), 'proxy.pid.json')), 'proxy pidfile removed');
  assert.ok(!existsSync(join(simDir(), 'session.json')), 'session record removed');
}

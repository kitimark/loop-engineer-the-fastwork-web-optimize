// tools/sim.mjs --device (incident I-087, user T-040) end to end on fakes only (no Simulator is ever booted, no phone
// touched): fw-sim stays the default with its config.json and behaviour; an iPad (fw-ipad, ...) is created on demand
// from an installed device type on an installed runtime (never downloaded), drives a session like fw-sim, one Simulator
// at a time (a warm device of the other key is shut down first), and `sim.mjs orient` rotates it through WDA-sim
// (a fake WDA on FW_SIM_WDA_PORT) while the phone's WDA is never asked (tests/unit/wda.test.mjs).
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, sleep, killFixtures } from '../helpers.mjs';
import { startFakeWda } from '../fixtures/fake-wda.mjs';

const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs');
const FX = (n) => join(TESTS, 'fixtures', n);
const PHONE = '00008130-0011223344556677'; // made up, the shape of a real iPhone UDID
const IPHONE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max';
const IPAD_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB';
const RUNTIME = { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77', isAvailable: true, platform: 'iOS' };
let dir, env;
let fixturesSince = 0;
const fakes = [];
beforeEach(() => { fixturesSince = Date.now(); });
afterEach(() => { killFixtures({ since: fixturesSince }); const k = keeper(); if (k) { try { process.kill(k.pid, 'SIGKILL'); } catch {} } });
after(() => Promise.all(fakes.map((f) => f.close())));

function wrapper(name, script, pre = []) {
  const f = join(dir, 'bin', name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${pre.map((x) => `"${x}"`).join(' ')} "$@"\n`);
  chmodSync(f, 0o755);
  return f;
}
beforeEach(async () => {
  dir = tempDir('fw-simdev-');
  writeFileSync(join(dir, 'simctl.json'), JSON.stringify({ runtimes: [RUNTIME], devices: [] }));
  const xcb = join(dir, 'bin', 'xcodebuild');
  wrapper('x', FX('fake-sim-tools.mjs'));
  writeFileSync(xcb, `#!/bin/sh\nif [ "$1" = "-version" ]; then echo "Xcode 26.6"; echo "Build version 17F113"; exit 0; fi\nexec "${process.execPath}" "${FX('fake-xcodebuild.mjs')}" "$@"\n`); chmodSync(xcb, 0o755);
  env = {
    FW_STATE_DIR: join(dir, 'state'),
    FW_SIMCTL: wrapper('simctl', FX('fake-simctl.mjs')), FW_IWDP: wrapper('iwdp', FX('fake-iwdp.mjs')),
    FW_LSOF: wrapper('lsof', FX('fake-sim-tools.mjs'), ['lsof']), FW_IDEVICE_ID: wrapper('idevice_id', FX('fake-sim-tools.mjs'), ['idevice_id']),
    FW_OPEN: wrapper('open', FX('fake-sim-tools.mjs'), ['open']), FW_OSASCRIPT: wrapper('osascript', FX('fake-sim-tools.mjs'), ['osascript']), FW_XCODEBUILD: xcb,
    FAKE_SIMCTL_STATE: join(dir, 'simctl.json'), FAKE_SIMCTL_LOG: join(dir, 'simctl.jsonl'), FAKE_IWDP_LOG: join(dir, 'iwdp.jsonl'), FAKE_SIMTOOLS_LOG: join(dir, 'tools.jsonl'),
    FAKE_MACAPP_STATE: join(dir, 'app'), FAKE_IDEVICE_IDS: PHONE, FAKE_IWDP_PHONES: PHONE,
    FW_SIM_DEVICE_PORT: String(await freePort()), FW_SIM_PORT: String(await freePort()), FW_SIM_WDA_PORT: String(await freePort()),
    FW_SIM_IDLE_SEC: '0', FW_SIM_KEEPER_POLL_MS: '150', FW_SIM_SETTLE_SEC: '0',
  };
});

const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const devices = () => JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')).devices;
const byName = (re) => devices().find((d) => re.test(d.name));
const simDir = () => join(env.FW_STATE_DIR, 'sim');
const readJ = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const keeper = () => (env ? readJ(join(simDir(), 'keeper.pid.json')) : null);
const creates = () => lines(env.FAKE_SIMCTL_LOG).filter((a) => a[0] === 'create');
function noIds(text) { for (const d of [{ udid: PHONE }, ...devices()]) assert.ok(!text.toLowerCase().includes(d.udid.toLowerCase()), `an id leaked: ${text}`); }
const childOut = () => join(dir, 'child.json');
/** <cmd> of a session: writes its env and the session record, then runs `extra` (sim.mjs calls) and prints their output */
const probe = (extra = []) => `const fs = require('fs'), cp = require('child_process');
fs.writeFileSync(${JSON.stringify(childOut())}, JSON.stringify({ device: process.env.FW_SIM_DEVICE, udid: process.env.FW_SIM_UDID, session: JSON.parse(fs.readFileSync(${JSON.stringify(join(simDir(), 'session.json'))}, 'utf8')) }));
for (const a of ${JSON.stringify(extra)}) { const r = cp.spawnSync(process.execPath, [${JSON.stringify(SIM)}, ...a], { encoding: 'utf8' }); console.log('RUN ' + a.join(' ') + ' -> ' + r.status + ' ' + (r.stdout + r.stderr).trim().replace(/\\n/g, ' | ')); }`;
/** a functional session in the shared lane: `lock.mjs run --shared --weight simulator -- sim.mjs session --functional [sessArgs] -- node -e probe` */
const fn = (sessArgs = [], extra = [], e = env) => nodeAsync(LOCK, ['run', 'chrome-measure', '--shared', '--weight', 'simulator', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--functional', '--owner', 'me', '--window', 'hidden', ...sessArgs, '--', process.execPath, '-e', probe(extra)], { env: e, timeout: 90000 });

test('I-087 setup --device fw-ipad: an iPad Pro 13-inch (M5) named fw-ipad on the installed runtime, its own config (mode 600); fw-sim\'s config.json untouched; unknown devices refused; status lists both; no UDID printed', () => {
  let r = node(SIM, ['setup'], { env });
  assert.equal(r.code, 0, r.out);
  const cfgSim = readFileSync(join(simDir(), 'config.json'), 'utf8');
  assert.equal(JSON.parse(cfgSim).device, 'fw-sim');
  r = node(SIM, ['setup', '--device', 'fw-ipad'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /created fw-ipad Pro 13 M5 on iOS 26\.5/);
  assert.match(r.stdout, /config-fw-ipad\.json: device set, iOS 26\.5 \(23F77\), iPad-Pro-13-inch-M5-12GB, Xcode 26\.6/);
  const ipad = byName(/^fw-ipad/);
  assert.deepEqual([ipad.name, ipad.deviceTypeIdentifier, ipad.runtimeId, ipad.state], ['fw-ipad Pro 13 M5', IPAD_TYPE, RUNTIME.identifier, 'Shutdown']);
  const f = join(simDir(), 'config-fw-ipad.json');
  assert.equal(statSync(f).mode & 0o777, 0o600);
  const cfg = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual([cfg.device, cfg.udid, cfg.deviceType, cfg.runtime], ['fw-ipad', ipad.udid, IPAD_TYPE, 'iOS 26.5']);
  assert.equal(readFileSync(join(simDir(), 'config.json'), 'utf8'), cfgSim, 'fw-sim\'s config is untouched');
  assert.equal(byName(/^fw-sim/).deviceTypeIdentifier, IPHONE_TYPE);
  r = node(SIM, ['setup', '--device', 'fw-ipad'], { env });
  assert.match(r.stdout, /fw-ipad Pro 13 M5 exists \(Shutdown\)/);
  assert.equal(creates().length, 2, 'created once each');
  r = node(SIM, ['setup', '--device', 'fw-tablet'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /unknown Simulator device "fw-tablet" \(known: fw-sim, fw-ipad, fw-ipad-a16, fw-ipad-mini\)/);
  r = node(SIM, ['status', '--device', 'fw-ipad'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^device: {3}fw-ipad Pro 13 M5: Shutdown$/m);
  assert.match(r.stdout, /^devices: {2}fw-sim Shutdown, fw-ipad \(shown\) Shutdown; known: fw-sim, fw-ipad, fw-ipad-a16, fw-ipad-mini$/m);
  r = node(SIM, ['status'], { env });
  assert.match(r.stdout, /^device: {3}fw-sim 15 Pro Max: Shutdown$/m, 'without --device: fw-sim');
  noIds(r.out);
});

test('I-087 setup: a device type no installed runtime supports is refused (nothing created, nothing downloaded); a runtime that does not list its types lets simctl create decide', () => {
  const rt = { ...RUNTIME, supportedDeviceTypes: [{ identifier: IPHONE_TYPE, name: 'iPhone 15 Pro Max' }] };
  writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify({ runtimes: [rt], devices: [] }));
  let r = node(SIM, ['setup', '--device', 'fw-ipad-mini'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no installed iOS runtime supports iPad-mini-A17-Pro \(fw-ipad-mini; installed: iOS 26\.5\); a runtime or device type download is the user's decision/);
  r = node(SIM, ['setup', '--device', 'fw-ipad-mini', '--runtime', 'iOS 26.5'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /the iOS runtime iOS 26\.5 does not support iPad-mini-A17-Pro \(fw-ipad-mini\)/);
  assert.equal(creates().length, 0);
  assert.ok(!existsSync(join(simDir(), 'config-fw-ipad-mini.json')));
  r = node(SIM, ['setup'], { env });
  assert.equal(r.code, 0, r.out, 'fw-sim on a runtime that lists its type');
  writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify({ runtimes: [RUNTIME], devices: devices() }));
  r = node(SIM, ['setup', '--device', 'fw-ipad-a16'], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(byName(/^fw-ipad A16$/).deviceTypeIdentifier, 'com.apple.CoreSimulator.SimDeviceType.iPad-A16');
});

test('I-087 default unchanged: a session without --device drives fw-sim (FW_SIM_DEVICE=fw-sim in <cmd>, session record device fw-sim); no iPad is created', async () => {
  node(SIM, ['setup'], { env });
  const r = await fn();
  assert.equal(r.code, 0, r.out);
  const c = readJ(childOut());
  const sim = byName(/^fw-sim/);
  assert.deepEqual([c.device, c.udid, c.session.device], ['fw-sim', sim.udid, 'fw-sim']);
  assert.match(r.stdout, /booting fw-sim 15 Pro Max/);
  assert.equal(devices().length, 1, 'no iPad');
  assert.equal(sim.state, 'Shutdown', 'shut down at the end (FW_SIM_IDLE_SEC=0)');
  noIds(r.out);
});

test('I-087 session --device fw-ipad: created on demand under the simulator lock, booted, <cmd> drives it (FW_SIM_DEVICE, FW_SIM_UDID); orient rotates it through WDA-sim and reads it back; a command for another device is refused; fw-sim never booted', async () => {
  node(SIM, ['setup'], { env });
  const w = await startFakeWda({ port: Number(env.FW_SIM_WDA_PORT) });
  fakes.push(w);
  const r = await fn(['--device', 'fw-ipad'], [['orient', 'landscape', '--settle-ms', '0'], ['orient', 'portrait', '--settle-ms', '0'], ['orient', 'sideways'], ['--device', 'fw-sim', 'orient', 'portrait']]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /created fw-ipad Pro 13 M5 on iOS 26\.5/);
  assert.match(r.stdout, /booting fw-ipad Pro 13 M5/);
  const ipad = byName(/^fw-ipad/), sim = byName(/^fw-sim/);
  const c = readJ(childOut());
  assert.deepEqual([c.device, c.udid, c.session.device], ['fw-ipad', ipad.udid, 'fw-ipad']);
  assert.match(r.stdout, /^RUN orient landscape --settle-ms 0 -> 0 rotated portrait -> landscape \(WDA-sim\) \| ORIENTATION landscape$/m);
  assert.match(r.stdout, /^RUN orient portrait --settle-ms 0 -> 0 rotated landscape -> portrait \(WDA-sim\) \| ORIENTATION portrait$/m);
  assert.match(r.stdout, /^RUN orient sideways -> 1 usage: node tools\/sim\.mjs orient portrait\|landscape/m);
  assert.match(r.stdout, /^RUN --device fw-sim orient portrait -> 1 the live Simulator session drives fw-ipad, not fw-sim/m);
  const posts = w.calls.filter((x) => x.method === 'POST' && x.path.endsWith('/orientation')).map((x) => x.body.orientation);
  assert.deepEqual(posts, ['LANDSCAPE', 'PORTRAIT']);
  assert.ok(!w.calls.some((x) => x.forbidden));
  const calls = lines(env.FAKE_SIMCTL_LOG).filter((a) => ['boot', 'shutdown', 'openurl'].includes(a[0]));
  assert.ok(calls.length && calls.every((a) => a[1] === ipad.udid), 'only the iPad was booted / shut down');
  assert.deepEqual([ipad.state, sim.state], ['Shutdown', 'Shutdown']);
  assert.ok(existsSync(join(simDir(), 'config-fw-ipad.json')));
  noIds(r.out);
});

test('I-087 one Simulator at a time: a warm fw-sim is shut down before an iPad session boots; the iPad is then kept warm (warm.device fw-ipad), status / doctor without --device look at it, and the timed tools\' reap shuts it down', async () => {
  node(SIM, ['setup'], { env });
  const e = { ...env, FW_SIM_IDLE_SEC: '300' };
  let r = await fn([], [], e);
  assert.equal(r.code, 0, r.out);
  assert.equal(byName(/^fw-sim/).state, 'Booted');
  assert.equal(readJ(join(simDir(), 'warm.json')).device, 'fw-sim');
  r = await fn(['--device', 'fw-ipad'], [], e);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /sim session: the warm fw-sim was shut down first \(shut down\): one Simulator at a time \(I-087\)/);
  const sim = byName(/^fw-sim/), ipad = byName(/^fw-ipad/);
  assert.deepEqual([sim.state, ipad.state], ['Shutdown', 'Booted'], 'fw-sim down, the iPad kept warm');
  const w = readJ(join(simDir(), 'warm.json'));
  assert.deepEqual([w.device, w.udid], ['fw-ipad', ipad.udid]);
  const k = keeper();
  assert.ok(k, 'the iPad\'s keeper runs');
  let s = node(SIM, ['status'], { env: e });
  assert.match(s.stdout, /^device: {3}fw-ipad Pro 13 M5: Booted$/m);
  assert.match(s.stdout, /^warm: {5}fw-ipad booted, idle/m);
  let d = node(SIM, ['doctor'], { env: e });
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^ok: warm: fw-ipad booted/m);
  d = node(SIM, ['doctor', '--device', 'fw-sim'], { env: e });
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^ok: no session, nothing booted, no proxy \(fw-sim; the warm fw-ipad: node tools\/sim\.mjs doctor --device fw-ipad\)$/m, 'another device\'s warm record is not "stale"');
  assert.ok(existsSync(join(simDir(), 'warm.json')));
  const reap = node(SIM, ['shutdown', '--warm-only', '--reason', 'test', '--by', 'verify'], { env: e });
  assert.equal(reap.code, 0, reap.out);
  assert.match(reap.stdout, /^SIM_WARM_SHUTDOWN \(test; by verify\): fw-ipad shut down, warm since \S+$/m);
  assert.equal(byName(/^fw-ipad/).state, 'Shutdown');
  assert.ok(!existsSync(join(simDir(), 'warm.json')));
  for (let i = 0; i < 50 && keeper(); i++) await sleep(100);
  assert.equal(keeper(), null, 'the keeper went with it');
  noIds(`${r.out}${s.out}${d.out}${reap.out}`);
});

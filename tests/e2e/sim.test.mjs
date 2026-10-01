// tools/sim.mjs end to end on fakes only (no Simulator is ever booted, no phone touched): $FW_SIMCTL
// (tests/fixtures/fake-simctl.mjs, a JSON device state), $FW_IWDP (fake-iwdp.mjs: reads the -c config like iwdp and
// serves the fake Safari tab of fake-run-proxy.mjs for SIMULATOR), $FW_LSOF / $FW_IDEVICE_ID / $FW_OPEN /
// $FW_OSASCRIPT (fake-sim-tools.mjs), a temp lock dir ($FW_STATE_DIR) and free ports for :9231 / :9232 / :8101.
// Covers research/simulator/README.md §7: the hold gate, the iwdp config (content, mode 600), UDIDs never in
// stdout / stderr / JSON, the :9231 SIMULATOR-only check, cleanup on success, failure and SIGTERM (shutdown always,
// only our own pids killed), meta.device / meta.sim.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, TESTS, sleep } from '../helpers.mjs';
import { deviceOf } from '../../tools/lib/stats.mjs';

const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs');
const FX = (n) => join(TESTS, 'fixtures', n);
const PHONE = '00008130-0011223344556677'; // made up, the shape of a real iPhone UDID
const PHONE2 = '00008101-0A0B0C0D0E0F1011';
const RUNTIME = { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77', isAvailable: true, platform: 'iOS' };
const UUID = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;
let dir, env;

function wrapper(name, script, pre = []) {
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
  };
});
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const simctlCalls = () => lines(env.FAKE_SIMCTL_LOG).map((a) => a[0]);
const device = () => JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')).devices[0];
const simDir = () => join(env.FW_STATE_DIR, 'sim');
const setup = () => { const r = node(SIM, ['setup'], { env }); assert.equal(r.code, 0, r.out); return device().udid; };
/** `lock.mjs run chrome-measure --owner me [lockArgs] -- node sim.mjs session --owner me --window hidden [sessArgs] -- <cmd...>` */
const inHold = (cmd, { lockArgs = [], sessArgs = ['--window', 'hidden'], e = env, timeout = 90000 } = {}) =>
  nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', ...lockArgs, '--', process.execPath, SIM, 'session', '--owner', 'me', ...sessArgs, '--', ...cmd], { env: e, timeout });
const childJs = (js) => [process.execPath, '-e', js];
function noIds(text, udid) {
  for (const id of [PHONE, PHONE2, udid].filter(Boolean)) assert.ok(!text.toLowerCase().includes(id.toLowerCase()), `an id leaked: ${text}`);
  assert.ok(!/Test Person/.test(text), 'a device name leaked');
}
function cleanedUp() {
  assert.equal(device().state, 'Shutdown', 'the Simulator is shut down');
  assert.ok(simctlCalls().includes('shutdown'), 'simctl shutdown was called');
  assert.ok(!existsSync(join(simDir(), 'proxy.pid.json')), 'proxy pidfile removed');
  assert.ok(!existsSync(join(simDir(), 'session.json')), 'session record removed');
}

test('setup: creates fw-sim 15 Pro Max on the newest runtime once; config.json mode 600; no UDID printed', () => {
  let r = node(SIM, ['setup'], { env });
  assert.equal(r.code, 0, r.out);
  const d = device();
  assert.deepEqual([d.name, d.deviceTypeIdentifier, d.runtimeId], ['fw-sim 15 Pro Max', 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max', RUNTIME.identifier]);
  assert.match(r.stdout, /created fw-sim 15 Pro Max on iOS 26\.5/);
  assert.match(r.stdout, /device set, iOS 26\.5 \(23F77\), iPhone-15-Pro-Max, Xcode 26\.6 \(17F113\)/);
  noIds(r.out, d.udid);
  const cfgF = join(simDir(), 'config.json');
  assert.equal(statSync(cfgF).mode & 0o777, 0o600);
  const cfg = JSON.parse(readFileSync(cfgF, 'utf8'));
  assert.deepEqual([cfg.udid, cfg.runtime, cfg.runtimeBuild, cfg.xcode], [d.udid, 'iOS 26.5', '23F77', '26.6 (17F113)']);
  r = node(SIM, ['setup'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /fw-sim 15 Pro Max exists \(Shutdown\)/);
  assert.equal(simctlCalls().filter((c) => c === 'create').length, 1);
  r = node(SIM, ['status'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^config: {3}device set, iOS 26\.5/m);
  assert.match(r.stdout, /^session: {2}none/m);
  noIds(r.out, d.udid);
});

test('session: refused without the caller\'s own normal chrome-measure hold (none, someone else\'s, a short-lane one); nothing booted', async () => {
  setup();
  const cmd = ['--owner', 'me', '--window', 'hidden', '--', process.execPath, '-e', '0'];
  let r = node(SIM, ['session', ...cmd], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing sim session: chrome-measure is free, but this process does not hold it.*\n {2}node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 420 -- node tools\/sim\.mjs session --owner me/s);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'other'], { env }).code, 0);
  r = node(SIM, ['session', ...cmd], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /chrome-measure is held by "other", not by this process/);
  r = node(SIM, ['session', ...cmd], { env: { ...env, FW_LOCK_HELD: 'chrome-measure:0123456789ab' } });
  assert.match(r.stderr, /held by "other", not by this process/, 'a forged token is not the holder\'s');
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'other'], { env }).code, 0);
  r = await inHold(childJs('0'), { lockArgs: ['--short', '--max-seconds', '60'] });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /your chrome-measure hold is a short-lane job \(max 60 s\)/);
  assert.deepEqual(simctlCalls().filter((c) => !['list', 'create'].includes(c)), [], 'no boot, no shutdown');
  assert.equal(device().state, 'Shutdown');
});

test('session: boot, proxy with the mode-600 config file (phones at -1), <cmd> with the ports, then cleanup; no UDID anywhere', async () => {
  const udid = setup();
  const out = join(dir, 'child.json');
  const r = await inHold(childJs(`require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ port: process.env.FW_IPHONE_PORT, simPort: process.env.FW_SIM_PORT, list: process.env.FW_SIM_DEVICE_PORT, session: process.env.FW_SIM_SESSION, held: process.env.FW_LOCK_HELD }));
    console.log('CHILD udid ' + process.env.FW_SIM_UDID); console.error('CHILD err ${PHONE}');
    fetch('http://localhost:' + process.env.FW_SIM_DEVICE_PORT + '/json').then((x) => x.json()).then((j) => console.log('LIST ' + JSON.stringify(j.map((d) => d.deviceId))));`));
  assert.equal(r.code, 0, r.out);
  const c = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual([c.port, c.simPort, c.list], [env.FW_SIM_PORT, env.FW_SIM_PORT, env.FW_SIM_DEVICE_PORT]);
  assert.match(c.session, /^[0-9a-f]{12}$/);
  assert.match(c.held, /chrome-measure:[0-9a-f]{12}/);
  assert.match(r.stdout, /^CHILD udid <(udid|uuid)>$/m, 'the child\'s output is scrubbed');
  assert.match(r.stderr, /^CHILD err <udid>$/m);
  assert.match(r.stdout, /^LIST \["SIMULATOR"\]$/m, 'the attached phone is ignored (-1), only the Simulator is listed');
  assert.match(r.stdout, /SIM_READY tabs :\d+/);
  noIds(r.out, udid);
  const [iw] = lines(env.FAKE_IWDP_LOG);
  const cfgF = join(simDir(), 'iwdp.cfg');
  assert.deepEqual(iw.argv, ['-c', cfgF, '-s', 'unix:/private/var/tmp/com.apple.launchd.FAKE0/com.apple.webinspectord_sim.socket', '-F'], 'no UDID in argv: the config is a file');
  assert.equal(iw.cfgMode, '600');
  assert.equal(iw.cfg, `null:${env.FW_SIM_DEVICE_PORT}\n${PHONE}:-1\n:${env.FW_SIM_PORT}\n`, 'list port, every idevice_id entry once at -1, then the Simulator');
  assert.equal(statSync(cfgF).mode & 0o777, 0o600);
  assert.deepEqual(simctlCalls().filter((x) => x !== 'list' && x !== 'create'), ['boot', 'bootstatus', 'launch', 'shutdown']);
  assert.ok(!lines(env.FAKE_SIMTOOLS_LOG).some((x) => x.tool === 'open' || x.tool === 'osascript'), '--window hidden: no Simulator.app');
  for (const f of ['session.json', 'proxy.pid.json', 'proxy.log', 'config.json']) { const p = join(simDir(), f); if (existsSync(p)) noIds(readFileSync(p, 'utf8').replace(udid, ''), null); }
  assert.ok(!readFileSync(join(simDir(), 'proxy.log'), 'utf8').includes(PHONE));
  cleanedUp();
});

test('session: <cmd> fails -> its exit code, cleanup done; --window shown opens Simulator.app and quits it only if it opened it', async () => {
  setup();
  let r = await inHold(childJs('process.exit(3)'), { sessArgs: [] });
  assert.equal(r.code, 3, r.out);
  cleanedUp();
  const app = lines(env.FAKE_SIMTOOLS_LOG).filter((x) => x.tool === 'open' || x.tool === 'osascript').map((x) => x.tool === 'open' ? `open ${x.argv.slice(0, 4).join(' ')}` : x.argv[1]);
  assert.deepEqual(app, ['application "Simulator" is running', 'open -a Simulator --args -CurrentDeviceUDID', 'quit app "Simulator"'], 'shown is the default');
  writeFileSync(env.FAKE_MACAPP_STATE, 'true'); // the user's own Simulator.app was already open
  writeFileSync(env.FAKE_SIMTOOLS_LOG, '');
  r = await inHold(childJs('0'), { sessArgs: ['--window', 'shown'] });
  assert.equal(r.code, 0, r.out);
  assert.ok(!lines(env.FAKE_SIMTOOLS_LOG).some((x) => x.tool === 'osascript' && /quit/.test(x.argv[1])), 'not ours to quit');
  cleanedUp();
});

test('session: a non-simulator device on :9231 (a phone idevice_id did not list) stops the proxy, prints no id, never runs <cmd>; idevice_id failing refuses the proxy', async () => {
  const udid = setup();
  const marker = join(dir, 'ran');
  let r = await inHold(childJs(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), { e: { ...env, FAKE_IWDP_PHONES: `${PHONE},${PHONE2}` } });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /proxy sees a non-simulator device \(1 non-simulator device\(s\) listed on :\d+\): proxy stopped/);
  noIds(r.out, udid);
  assert.ok(!existsSync(marker), '<cmd> never ran');
  cleanedUp();
  r = await inHold(childJs(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), { e: { ...env, FAKE_IDEVICE_ID_FAIL: '1' } });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /idevice_id -l failed .*not starting it/);
  assert.equal(lines(env.FAKE_IWDP_LOG).length, 1, 'no second proxy start');
  assert.ok(!existsSync(marker));
  cleanedUp();
});

test('session: refused when fw-sim is already booted (someone else\'s, or a leak): nothing shut down; doctor finds the leak, --fix shuts it', async () => {
  setup();
  const st = JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8'));
  st.devices[0].state = 'Booted';
  writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st));
  const r = await inHold(childJs('0'));
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /refusing: fw-sim 15 Pro Max is already Booted/);
  assert.equal(device().state, 'Booted');
  assert.ok(!simctlCalls().includes('shutdown'));
  let d = node(SIM, ['doctor'], { env });
  assert.equal(d.code, 3, d.out);
  assert.match(d.stdout, /LEAK: fw-sim 15 Pro Max is Booted with no live session/);
  d = node(SIM, ['doctor', '--fix'], { env });
  assert.equal(d.code, 0, d.out);
  assert.equal(device().state, 'Shutdown');
  assert.match(node(SIM, ['doctor'], { env }).stdout, /^ok: no session/m);
});

test('session: SIGTERM mid-<cmd> stops <cmd>\'s group, the proxy and the Simulator (shutdown always); a foreign pid in a pidfile is never killed', async () => {
  setup();
  const marker = join(dir, 'child.pid');
  const p = await startProc(process.execPath, [LOCK, 'run', 'chrome-measure', '--owner', 'me', '--', process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', '--',
    process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1e9)`], { env, ready: (s) => /SIM_READY/.test(s), timeout: 30000 });
  for (let i = 0; i < 100 && !existsSync(marker); i++) await sleep(100);
  const childPid = Number(readFileSync(marker, 'utf8'));
  const sess = JSON.parse(readFileSync(join(simDir(), 'session.json'), 'utf8'));
  const proxyPid = JSON.parse(readFileSync(join(simDir(), 'proxy.pid.json'), 'utf8')).pid;
  process.kill(sess.pid, 'SIGTERM');
  const exit = await new Promise((res) => { const t = setInterval(() => { if (p.proc.exitCode !== null || p.proc.signalCode !== null) { clearInterval(t); res(p.proc.exitCode); } }, 100); });
  assert.equal(exit, 143, p.stdout() + p.stderr());
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  assert.ok(!alive(childPid), '<cmd> stopped');
  assert.ok(!alive(proxyPid), 'proxy stopped');
  cleanedUp();
  // a pidfile whose pid is not our proxy (reused pid): `proxy stop` removes the file, kills nothing
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' });
  writeFileSync(join(simDir(), 'proxy.pid.json'), JSON.stringify({ pid: sleeper.pid, name: 'proxy', match: join(simDir(), 'iwdp.cfg') }));
  const r = node(SIM, ['proxy', 'stop'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /no longer ours; removing its pidfile \(nothing killed\)/);
  assert.ok(alive(sleeper.pid));
  sleeper.kill('SIGKILL');
});

test('scroll inside a session: iphone.mjs scroll\'s probe on the tabs port -> out JSON with meta.device "simulator" and meta.sim; outside a session: refused', async () => {
  const udid = setup();
  let r = node(SIM, ['scroll', '--label', 'x'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  const out = join(dir, 'scroll.json');
  r = await inHold([process.execPath, SIM, 'scroll', '--label', 'fp2', '--out', out], { timeout: 110000, e: { ...env, FAKE_IWDP_TAB_ARGS: '--doc-height=1500' } });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.equal(j.meta.device, 'simulator');
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.deepEqual([j.meta.owner, j.meta.label], ['me', 'fp2']);
  assert.deepEqual(j.meta.settings, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  const s = j.meta.sim;
  assert.deepEqual([s.runtime, s.runtimeBuild, s.deviceType, s.xcode, s.window], ['iOS 26.5', '23F77', 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max', '26.6 (17F113)', 'hidden']);
  assert.deepEqual(s.proxyPorts, { list: Number(env.FW_SIM_DEVICE_PORT), tabs: Number(env.FW_SIM_PORT), wda: Number(env.FW_SIM_WDA_PORT) });
  assert.ok(s.hostLoad.start && s.hostLoad.end, 'host load sampled at start and end');
  assert.ok('tipDismissed' in s);
  assert.deepEqual(Object.keys(j.summary), ['idle', 'scroll', 'bottom']);
  assert.ok(j.frames.length > 10 && j.finalY >= j.maxY - 5, `scrolled to the bottom (${j.finalY} of ${j.maxY})`);
  cleanedUp();
});

test('run inside a session: iphone.mjs run\'s std probe with the Simulator target (no lease, no battery, meta.device "simulator", meta.sim, Simulator tool files)', async () => {
  const udid = setup();
  const out = join(dir, 'run.json');
  const r = await inHold([process.execPath, SIM, 'run', '--driver', 'scroll', '--probe', 'std', '--label', 'srun', '--settle', '0', '--idle', '0.2', '--bottom', '0.2', '--out', out], { timeout: 110000, e: { ...env, FAKE_IWDP_TAB_ARGS: '--doc-height=1500', FW_IDEVICEDIAGNOSTICS: join(dir, 'never-called') } });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.deepEqual([j.meta.schema, j.meta.driverName, j.meta.device, j.meta.owner, j.meta.label, j.meta.battery], ['fw-iphone-run/1', 'scroll', 'simulator', 'me', 'srun', null]);
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.deepEqual(j.meta.settings, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  assert.equal(j.meta.sim.window, 'hidden');
  assert.ok(j.meta.sim.hostLoad.start && j.meta.sim.hostLoad.end);
  assert.ok(Object.keys(j.meta.tool.files).includes('tools/lib/sim.mjs') && Object.keys(j.meta.tool.files).includes('tools/lib/iphone-run.mjs'));
  assert.ok(j.frames.length > 5);
  assert.match(r.stdout, /^srun \[S\]: /m);
  cleanedUp();
});

test('wda: build refused outside a normal hold; inside one: unsigned Simulator build in DerivedData-sim; start inside a session on the sim WDA port, stopped by the session', async () => {
  const udid = setup();
  const home = join(dir, 'wda');
  mkdirSync(join(home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  const e = { ...env, FW_WDA_HOME: home, FAKE_XCODEBUILD_LOG: join(dir, 'xcb.jsonl') };
  let r = node(SIM, ['wda', 'build', '--owner', 'me'], { env: e });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing sim wda build: chrome-measure is free/);
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--short', '--max-seconds', '60', '--', process.execPath, SIM, 'wda', 'build', '--owner', 'me'], { env: e });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /short-lane job/);
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', process.execPath, SIM, 'wda', 'build', '--owner', 'me'], { env: e });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /WDA_SIM_BUILT \S+\.xctestrun/);
  noIds(r.out, udid);
  const [b] = lines(e.FAKE_XCODEBUILD_LOG);
  assert.deepEqual(b, ['-project', join(home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), '-scheme', 'WebDriverAgentRunner', '-destination', `platform=iOS Simulator,id=${udid}`, '-derivedDataPath', join(home, 'DerivedData-sim'), 'CODE_SIGNING_ALLOWED=NO', 'build-for-testing']);
  assert.ok(!existsSync(join(home, 'DerivedData')), 'the phone\'s DerivedData is untouched');
  r = node(SIM, ['wda', 'start'], { env: e });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" wda start && "${process.execPath}" -e "fetch('http://127.0.0.1:${env.FW_SIM_WDA_PORT}/status').then((x) => x.text()).then(console.log)"`], { e });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`WDA_SIM_READY http://127\\.0\\.0\\.1:${env.FW_SIM_WDA_PORT}`));
  assert.match(r.stdout, /"ready":true/);
  assert.match(r.stdout, /cleanup: stopped wda/);
  noIds(r.out, udid);
  const run = lines(e.FAKE_XCODEBUILD_LOG)[1];
  assert.deepEqual([run[0], run[3], run[4]], ['test-without-building', '-destination', `platform=iOS Simulator,id=${udid}`]);
  assert.ok(!existsSync(join(simDir(), 'wda.pid.json')));
  assert.equal(await fetch(`http://127.0.0.1:${env.FW_SIM_WDA_PORT}/status`).then(() => 'up', () => 'down'), 'down');
  cleanedUp();
});

test('open inside a session: simctl openurl (never the proxy), waits for the tab, screenshot to out/sim', async () => {
  setup();
  const r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "http://127.0.0.1:${env.FW_SIM_PORT}/"`]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /Safari \(Simulator\) now on http:\/\/127\.0\.0\.1:\d+\/; screenshot .*out\/sim\/me-open-\d+\.png/);
  const calls = lines(env.FAKE_SIMCTL_LOG).filter((a) => a[0] === 'openurl');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], `http://127.0.0.1:${env.FW_SIM_PORT}/`);
  cleanedUp();
});

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

test('ts-lock-share: session --functional in a shared reader slot of weight 3 (switch on) or its short form (switch off); the simulator lock held; timing commands refused; a light slot refused', async () => {
  const udid = setup();
  const e = { ...env, FW_LOCK_SHARED_JOIN_LOAD: '1000' };
  assert.equal(node(LOCK, ['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env: e }).code, 0);
  const out = join(dir, 'fn.json'), gScript = join(dir, 'fn-gesture.json');
  writeFileSync(gScript, JSON.stringify({ name: 'fn', version: 1, screen: [430, 932], steps: [{ type: 'stroke', dir: 'up', px: 300, ms: 300, profile: 'minjerk' }] }));
  const probe = `const fs = require('fs'), { execFileSync: x } = require('child_process');
    const st = (r) => JSON.parse(x(process.execPath, [${JSON.stringify(LOCK)}, 'status', r, '--json'], { encoding: 'utf8' }))[0];
    let scroll; try { x(process.execPath, [${JSON.stringify(SIM)}, 'scroll', '--label', 'nope'], { encoding: 'utf8', stdio: 'pipe' }); scroll = 'ran'; } catch (err) { scroll = String(err.stderr); }
    let gesture; try { x(process.execPath, [${JSON.stringify(SIM)}, 'gesture', ${JSON.stringify(gScript)}, '--label', 'nope'], { encoding: 'utf8', stdio: 'pipe' }); gesture = 'ran'; } catch (err) { gesture = String(err.stderr); }
    fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({ shared: process.env.FW_LOCK_SHARED || null, held: process.env.FW_LOCK_HELD || null, session: JSON.parse(fs.readFileSync(${JSON.stringify(join(env.FW_STATE_DIR, 'sim', 'session.json'))}, 'utf8')), cm: st('chrome-measure').holder, sim: st('simulator').holder, scroll, gesture }));`;
  const fn = (lockArgs, e2 = e) => nodeAsync(LOCK, ['run', 'chrome-measure', ...lockArgs, '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--functional', '--owner', 'me', '--window', 'hidden', '--', ...childJs(probe)], { env: e2, timeout: 90000 });
  let r = await fn(['--shared', '--weight', 'simulator']);
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  let c = JSON.parse(readFileSync(out, 'utf8'));
  assert.match(c.shared, /^chrome-measure:[0-9a-f]{12}$/);
  assert.equal(c.held, null, 'a reader child never gets FW_LOCK_HELD');
  assert.deepEqual([c.session.functional, c.session.lock], [true, { mode: 'shared' }]);
  assert.deepEqual([c.cm.shared, c.cm.readers.map((x) => [x.owner, x.weight])], [true, [['me', 3]]]);
  assert.deepEqual([c.sim.owner, c.sim.kind], ['me', 'process'], 'the simulator lock is held for the session');
  assert.match(c.scroll, /refusing: this is a functional Simulator session.*takes no timing runs/s);
  assert.match(c.gesture, /refusing: this is a functional Simulator session.*takes no timing runs/s, 'sim.mjs gesture saves frame timing: timed like record (I-042)');
  assert.match(r.stdout, /sim session [0-9a-f]{12} \(owner me, window hidden, functional, lock mode shared\)/);
  cleanedUp();
  const st = (res) => JSON.parse(node(LOCK, ['status', res, '--json'], { env: e }).stdout)[0];
  assert.equal(st('simulator').holder, null, 'the simulator lock is released with the session');
  assert.equal(st('chrome-measure').holder, null);
  // a light slot (weight 1) is refused before anything boots
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await fn(['--shared', '--weight', '1']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /your shared slot has weight 1, and a functional Simulator session needs weight 3/);
  assert.deepEqual(simctlCalls().filter((x) => x !== 'list'), [], 'nothing booted');
  // the switch off: `run --shared` is an exclusive short job, and the functional session runs in it
  assert.equal(node(LOCK, ['shared', 'off', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env: e }).code, 0);
  r = await fn(['--shared', '--weight', 'simulator']);
  assert.equal(r.code, 0, r.out);
  c = JSON.parse(readFileSync(out, 'utf8'));
  // review-lock-share N2: its command gets FW_LOCK_SHARED (the stand-in's token), never FW_LOCK_HELD
  assert.deepEqual([c.held, c.session.lock, c.cm.short, !!c.cm.shared, c.cm.functional, c.cm.weight], [null, { mode: 'short' }, true, false, true, 3]);
  assert.equal(c.shared, `chrome-measure:${c.cm.token}`);
  cleanedUp();
  // a normal session in a no-timing hold (ts-lock-bundle: no host gate): it boots, but its timed commands are refused
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--no-timing', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', '--', ...childJs(probe)], { env: e, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  c = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(c.cm.noTiming, true);
  assert.match(c.scroll, /refusing: your chrome-measure hold is a no-timing hold/);
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
  r = await inHold(childJs(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), { e: { ...env, FAKE_IDEVICE_ID_FAIL: '-n' } });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /idevice_id -n failed .*network phones.*not starting it/, 'the network list failing fails closed too');
  assert.equal(lines(env.FAKE_IWDP_LOG).length, 1, 'no proxy start');
  assert.ok(!existsSync(marker));
  cleanedUp();
});

test('session: a phone paired over Wi-Fi only (idevice_id -n, not -l) gets its -1 line too; the list shows only SIMULATOR (review-sim B2)', async () => {
  const udid = setup();
  const r = await inHold(childJs(`fetch('http://localhost:' + process.env.FW_SIM_DEVICE_PORT + '/json').then((x) => x.json()).then((j) => console.log('LIST ' + JSON.stringify(j.map((d) => d.deviceId))))`),
    { e: { ...env, FAKE_IDEVICE_IDS: PHONE, FAKE_IDEVICE_NET_IDS: `${PHONE2},${PHONE}`, FAKE_IWDP_PHONES: `${PHONE},${PHONE2}` } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^LIST \["SIMULATOR"\]$/m);
  const [iw] = lines(env.FAKE_IWDP_LOG);
  assert.equal(iw.cfg, `null:${env.FW_SIM_DEVICE_PORT}\n${PHONE}:-1\n${PHONE2}:-1\n:${env.FW_SIM_PORT}\n`, 'USB and network phones, each once');
  assert.deepEqual(lines(env.FAKE_SIMTOOLS_LOG).filter((x) => x.tool === 'idevice_id').map((x) => x.argv[0]), ['-l', '-n']);
  noIds(r.out, udid);
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
  // review-sim B1: the phone's WDA runner is `xcodebuild test-without-building` too; a wda pidfile whose pid now runs
  // such a command WITHOUT the Simulator's DerivedData-sim path is not ours: nothing killed (wda stop, doctor --fix)
  const phoneRunner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', 'test-without-building', '-xctestrun', '/x/DerivedData/Build/Products/W.xctestrun'], { stdio: 'ignore' });
  writeFileSync(join(simDir(), 'wda.pid.json'), JSON.stringify({ pid: phoneRunner.pid, name: 'wda', match: join(dir, 'wda', 'DerivedData-sim'), session: 'gone' }));
  const w = node(SIM, ['wda', 'stop'], { env });
  assert.equal(w.code, 0, w.out);
  assert.match(w.stdout, /wda: pid \d+ is gone or no longer ours; removing its pidfile \(nothing killed\)/);
  assert.ok(alive(phoneRunner.pid), 'the phone\'s runner lives');
  phoneRunner.kill('SIGKILL');
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
  // review-sim R1: the running WDA-sim's pidfile must match only the Simulator's DerivedData-sim, never a generic
  // `test-without-building` (the phone's WDA runner has that too: a stop/cleanup would kill it)
  const pidfile = join(simDir(), 'wda.pid.json');
  r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" wda start && "${process.execPath}" -e "fetch('http://127.0.0.1:${env.FW_SIM_WDA_PORT}/status').then((x) => x.text()).then(console.log)" && "${process.execPath}" -e "console.log('PIDMATCH=' + JSON.parse(require('fs').readFileSync('${pidfile}', 'utf8')).match)"`], { e });
  assert.equal(r.code, 0, r.out);
  assert.equal((r.stdout.match(/^PIDMATCH=(.*)$/m) || [])[1], join(home, 'DerivedData-sim'), r.out);
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

test('open inside a session: simctl openurl (never the proxy), waits for the tab, screenshot (--out)', async () => {
  setup();
  const shot = join(dir, 'shots', 'open.png');
  const wip = join(dir, 'wip.jsonl');
  const r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "http://127.0.0.1:${env.FW_SIM_PORT}/" --out "${shot}"`], { e: { ...env, FAKE_WIP_LOG: wip } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /Safari \(Simulator\) now on http:\/\/127\.0\.0\.1:\d+\/; screenshot .*shots\/open\.png/);
  assert.equal(readFileSync(shot).subarray(0, 4).toString('hex'), '89504e47', 'the screenshot is written where --out says');
  const evals = lines(wip).filter((x) => x.evaluate).map((x) => x.evaluate);
  assert.ok(evals.length > 0, 'the tab was read over the proxy');
  assert.ok(!evals.some((x) => /location\s*\.\s*(href\s*=(?!=)|assign|replace)|location\s*=(?!=)|reload\(/.test(x)), `no navigation over the proxy: ${JSON.stringify(evals)}`);
  const calls = lines(env.FAKE_SIMCTL_LOG).filter((a) => a[0] === 'openurl');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], `http://127.0.0.1:${env.FW_SIM_PORT}/`);
  cleanedUp();
});

test('safari-restart inside a session: WDA-sim down, so simctl terminate + launch on the configured Simulator, then the tab answers; outside a session: refused', async () => {
  const udid = setup();
  let r = node(SIM, ['safari-restart'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  r = await inHold([process.execPath, SIM, 'safari-restart', '--timeout', '20'], { timeout: 110000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^restarting Safari via simctl$/m);
  assert.match(r.stdout, /^SAFARI_RESTARTED via simctl in \d+ ms: /m);
  noIds(r.out, udid);
  const calls = lines(env.FAKE_SIMCTL_LOG);
  const t = calls.findIndex((a) => a[0] === 'terminate');
  assert.ok(t >= 0, 'simctl terminate was called');
  assert.deepEqual(calls.slice(t, t + 2), [['terminate', udid, 'com.apple.mobilesafari'], ['launch', udid, 'com.apple.mobilesafari']]);
  cleanedUp();
});

test('gesture inside a session: strokes to WDA-sim, the page over the session proxy, an out/sim record with meta.device "simulator"; outside a session: refused; --dry-run needs none', async () => {
  const udid = setup();
  const f = join(dir, 'script.json');
  const S = (o) => ({ type: 'stroke', dir: 'up', px: 450, ms: 900, profile: 'minjerk', ...o });
  writeFileSync(f, JSON.stringify({ name: 'sim-e2e', version: 1, screen: [430, 932], steps: [{ type: 'mark', name: 'go' }, S({}), { type: 'pause', ms: 300 }, S({ px: 300, ms: 300, profile: 'still', holdMs: 200 })] }));
  let r = node(SIM, ['gesture', f, '--dry-run'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GESTURE_HASH [0-9a-f]{64}$/m);
  r = node(SIM, ['gesture', f], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  const out = join(dir, 'gesture.json'), wdaLog = join(dir, 'wda.jsonl');
  const e = { ...env, FAKE_IWDP_TAB: 'webkit', FAKE_IWDP_TAB_ARGS: `--wda-port=${env.FW_SIM_WDA_PORT} --url=http://127.0.0.1:1/ --doc-height=2800`, FAKE_WDA_LOG: wdaLog };
  r = await inHold([process.execPath, SIM, 'gesture', f, '--label', 'sg', '--out', out], { timeout: 110000, e });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.deepEqual([j.meta.kind, j.meta.device, j.meta.owner, j.meta.label], ['gesture', 'simulator', 'me', 'sg']);
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.ok(j.meta.sim.hostLoad.start && j.meta.sim.hostLoad.end);
  assert.ok(Object.keys(j.meta.tool.files).includes('tools/lib/sim.mjs') && Object.keys(j.meta.tool.files).includes('tools/lib/gesture-run.mjs'));
  assert.equal(typeof j.meta.wda.settings.echoed, 'number', 'the /appium/settings echo is recorded');
  assert.equal(j.run.aborted, null);
  assert.deepEqual(j.run.errors, []);
  assert.equal(j.run.strokes.length, 2);
  const acts = lines(wdaLog).filter((c) => /\/actions$/.test(c.path));
  assert.equal(acts.length, 2, 'both strokes went to WDA-sim (the fake on the session\'s WDA port)');
  assert.ok(j.run.segments[0].touches.length > 0, 'the page saw the touches');
  cleanedUp();
});

test('I-050: Safari restored an earlier session\'s tab (a dead server, never answers): gesture alone refuses (AMBIGUOUS, I-037); after open in the same session it picks only the open\'s host and never touches the stale tab; the next session refuses again', async () => {
  const udid = setup();
  const f = join(dir, 'script.json');
  writeFileSync(f, JSON.stringify({ name: 'sim-e2e', version: 1, screen: [430, 932], steps: [{ type: 'stroke', dir: 'up', px: 300, ms: 500, profile: 'minjerk' }] }));
  const url = `http://127.0.0.1:${env.FW_SIM_PORT}/`;
  const wip = join(dir, 'wip.jsonl');
  const e = { ...env, FAKE_WIP_LOG: wip, FAKE_IWDP_TAB: 'webkit', FAKE_IWDP_TAB_ARGS: `--wda-port=${env.FW_SIM_WDA_PORT} --url=${url} --doc-height=2800 --stale-tab=http://localhost:63765/` };
  const gestureAlone = () => inHold([process.execPath, SIM, 'gesture', f, '--label', 'stale', '--out', join(dir, 'g0.json')], { timeout: 110000, e });
  let r = await gestureAlone();
  assert.match(r.out, /AMBIGUOUS: 2 tabs match any page: http:\/\/localhost:63765\/ \[PID:4242\], http:\/\/127\.0\.0\.1:\d+\/ \[PID:4242\]/, 'two Safari pages and no open: never picks one (I-037)');
  const out = join(dir, 'g1.json'), shot = join(dir, 'shots', 'open.png');
  r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "${url}" --out "${shot}" && "${process.execPath}" "${SIM}" gesture "${f}" --label sg --out "${out}"`], { timeout: 110000, e });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /Safari \(Simulator\) now on http:\/\/127\.0\.0\.1:\d+\/; screenshot /);
  assert.match(r.stdout, /^Safari also lists 1 page of another server \(restored from an earlier session\?\): this session's scroll \/ record \/ run \/ gesture pick only tabs on 127\.0\.0\.1:\d+ \(I-050\)$/m);
  assert.ok(!lines(wip).some((x) => x.staleConnected), 'nothing ever connects to the restored tab (it would never answer)');
  assert.deepEqual(lines(wip).filter((x) => x.navigate), [], 'no navigation over the proxy');
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.run.aborted, null);
  assert.equal(j.run.strokes.length, 1);
  cleanedUp();
  r = await gestureAlone();
  assert.match(r.out, /AMBIGUOUS: 2 tabs match any page/, 'the record of an earlier session\'s open does not scope this one');
  cleanedUp();
});


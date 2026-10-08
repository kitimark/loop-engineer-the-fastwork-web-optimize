// I-220: `iphone.mjs wda ensure` against fake xcodebuild / iproxy / idevice_id (tests/fixtures), never the phone, its
// WDA or the real locks (FW_STATE_DIR, FW_WDA_HOME temp; FW_WDA_URL a free port). Phone block kits restarted WDA at
// every part start (wda stop/start/check); 6 of 22 starts on 2026-10-06 ended in XCTest "Timed out while enabling
// automation mode", later ones had the runner up while usbmux saw no USB device, and each needed a cable re-plug.
// ensure keeps a READY runner, checks usbmux first, restarts only iproxy when the runner is up, retries a start once
// after a clean stop on the automation-mode timeout, and exits 4 (WDA REPLUG NEEDED) when a re-plug is the way out.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, sleep, killFixtures, cleanEnv } from '../helpers.mjs';
import { pidAlive } from '../../tools/lib/lock.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FIX = join(TESTS, 'fixtures');
const UDID = '00008130-0011223344556677';
let base;
before(async () => { base = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()) }; });
let fixturesSince = 0;
beforeEach(() => { fixturesSince = Date.now(); });
afterEach(() => { killFixtures({ since: fixturesSince }); });

/** A built WDA (xctestrun + config) in a temp FW_WDA_HOME, fakes for every executable, our own iphone lease. */
async function setup(extra = {}) {
  const home = tempDir('fw-wdahome-'), logs = tempDir('fw-wdalogs-');
  for (const f of ['fake-xcodebuild.mjs', 'fake-iproxy.mjs', 'fake-idevice-id.mjs']) chmodSync(join(FIX, f), 0o755);
  const products = join(home, 'DerivedData', 'Build', 'Products');
  mkdirSync(products, { recursive: true });
  writeFileSync(join(products, 'WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun'), '<plist/>');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ team: 'ABCDE12345', udid: UDID, bundleId: 'fw.wda.abcde12345.WebDriverAgentRunner', deviceName: 'Kitchen Phone 7' }));
  const env = {
    ...base, FW_STATE_DIR: tempDir('fw-ensure-'), FW_WDA_HOME: home, FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FAKE_RUNNER_PORT: String(await freePort()),
    FW_XCODEBUILD: join(FIX, 'fake-xcodebuild.mjs'), FW_IPROXY: join(FIX, 'fake-iproxy.mjs'), FW_IDEVICE_ID: join(FIX, 'fake-idevice-id.mjs'), FAKE_USB_UDIDS: UDID,
    FW_SECURITY: '/usr/bin/false', FAKE_XCODEBUILD_LOG: join(logs, 'xb.jsonl'), FAKE_IPROXY_LOG: join(logs, 'ip.jsonl'), FAKE_WDA_LOG: join(logs, 'wda.jsonl'), ...extra,
  };
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env }).code, 0);
  const count = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  return {
    env, home,
    runs: () => count(env.FAKE_XCODEBUILD_LOG), iproxies: () => count(env.FAKE_IPROXY_LOG),
    pid: (n) => { try { return JSON.parse(readFileSync(join(env.FW_STATE_DIR, 'wda', `${n}.json`), 'utf8')).pid; } catch { return null; } },
    ensure: (...a) => nodeAsync(IPHONE, ['wda', 'ensure', '--owner', 'me', '--timeout', '30', '--retry-wait', '0', '--usb-wait', '1', '--forward-wait', '3', ...a], { env, timeout: 120000 }),
  };
}
const lastLine = (s) => s.trim().split('\n').at(-1);
const IDS = [/ABCDE12345/i, /0011223344556677/, /Kitchen Phone/];

test('I-220: wda ensure needs the lease; starts a runner that is down, then keeps a READY one (no restart)', async () => {
  const w = await setup();
  let r = node(IPHONE, ['wda', 'ensure'], { env: w.env });
  assert.match(r.stderr, /--owner <topic> is required/);
  r = await w.ensure();
  assert.equal(r.code, 0, r.out);
  assert.match(lastLine(r.stdout), /^WDA READY \(restarted: it was not running\) build fake/);
  assert.equal(w.runs(), 1);
  const calls = readFileSync(w.env.FAKE_WDA_LOG, 'utf8');
  assert.match(calls, /wda\/apps\/activate/, 'Safari brought to the front after a start, like wda start');
  const runner = w.pid('runner');
  r = await w.ensure();
  assert.equal(r.code, 0, r.out);
  assert.match(lastLine(r.stdout), /^WDA READY \(kept, no restart\) build fake/);
  assert.equal(w.runs(), 1, 'no second xcodebuild');
  assert.equal(w.pid('runner'), runner);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

test('I-220: one automation-mode timeout: seen early in runner.log (not at the deadline), clean stop, one retry, READY', async () => {
  const w = await setup({ FAKE_XCODEBUILD_RUN_MODES: 'automation,ok' });
  const t0 = Date.now();
  const r = await w.ensure('--timeout', '60');
  assert.equal(r.code, 0, r.out);
  assert.ok(Date.now() - t0 < 45000, `ensure stopped waiting at the signature, not the 60 s deadline (${Date.now() - t0} ms)`);
  assert.match(r.stdout, /^WDA start 1 failed: XCTest timed out enabling automation mode on the iPhone/m);
  assert.match(r.stdout, /retrying once after a clean stop/);
  assert.match(lastLine(r.stdout), /^WDA READY \(restarted after one retry: XCTest timed out enabling automation mode/);
  assert.equal(w.runs(), 2);
});

test('I-220: the automation-mode timeout twice: exit 4 WDA REPLUG NEEDED, nothing left running, stale runners of this tool killed', async () => {
  const w = await setup({ FAKE_XCODEBUILD_RUN_MODES: 'automation' });
  // a runner this tool started earlier whose pidfile is gone (the ledger still names it), and the Simulator's runner
  // (DerivedData-sim): the first is ours and stale, the second must survive
  const xct = join(w.home, 'DerivedData', 'Build', 'Products', 'WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun');
  const sim = join(w.home, 'DerivedData-sim', 'Build', 'Products', 'x.xctestrun');
  const keep = (args) => { const p = spawn(process.execPath, ['--import', new URL('../fixtures/lifeline.mjs', import.meta.url).href, '-e', 'setInterval(() => {}, 1e9)', ...args], { detached: true, stdio: 'ignore', env: cleanEnv() }); p.unref(); return p.pid; };
  const stale = keep(['test-without-building', '-xctestrun', xct, '-destination', 'id=x']);
  const simRunner = keep(['test-without-building', '-xctestrun', sim, '-destination', 'id=y']);
  mkdirSync(join(w.env.FW_STATE_DIR, 'wda'), { recursive: true });
  writeFileSync(join(w.env.FW_STATE_DIR, 'wda', 'started.jsonl'), JSON.stringify({ pid: stale, name: 'runner', match: 'test-without-building' }) + '\n' + JSON.stringify({ pid: simRunner, name: 'runner', match: 'test-without-building' }) + '\n');
  await sleep(300);
  const r = await w.ensure();
  assert.equal(r.code, 4, r.out);
  assert.match(lastLine(r.stdout), /^WDA REPLUG NEEDED: XCTest timed out enabling automation mode twice \(a start and one retry after a clean stop\)\. Re-plug the iPhone cable \(phone unlocked\), then re-run: node tools\/iphone\.mjs wda ensure --owner me$/);
  assert.match(r.stdout, new RegExp(`killed stale runner \\(pid ${stale}\\)`));
  assert.equal(w.runs(), 2);
  for (let i = 0; i < 50 && pidAlive(stale); i++) await sleep(100);
  assert.ok(!pidAlive(stale), 'the stale runner of this tool is gone');
  assert.ok(pidAlive(simRunner), 'the Simulator\'s runner (DerivedData-sim) is not ours to kill');
  process.kill(simRunner, 'SIGKILL');
  assert.equal(w.pid('runner'), null, 'no runner pidfile left');
  assert.equal(w.pid('iproxy'), null);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
  // --no-retry: the first timeout already asks for the re-plug
  const r2 = await w.ensure('--no-retry');
  assert.equal(r2.code, 4, r2.out);
  assert.match(lastLine(r2.stdout), /^WDA REPLUG NEEDED: XCTest timed out enabling automation mode \(no retry\)/);
  assert.equal(w.runs(), 3);
});

test('I-220: usbmux lists no USB device: exit 4 before any xcodebuild (preflight)', async () => {
  const w = await setup({ FAKE_USB_UDIDS: '' });
  const r = await w.ensure();
  assert.equal(r.code, 4, r.out);
  assert.match(lastLine(r.stdout), /^WDA REPLUG NEEDED: the iPhone is not on USB for usbmux \(idevice_id -l lists 0 devices, not this one, for 1 s\)/);
  assert.equal(w.runs(), 0, 'no xcodebuild');
  assert.equal(w.iproxies(), 0);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

test('I-220: runner up but iproxy finds no USB device (the 09:53Z start): exit 4 after the forward wait, not the full timeout', async () => {
  // idevice_id unavailable (unknown: no preflight verdict), iproxy reports usbmux has no device
  const w = await setup({ FW_IDEVICE_ID: '/usr/bin/false', FAKE_IPROXY_MODES: 'nodevice' });
  const t0 = Date.now();
  const r = await w.ensure('--timeout', '90');
  assert.equal(r.code, 4, r.out);
  assert.ok(Date.now() - t0 < 60000, `${Date.now() - t0} ms`);
  assert.match(lastLine(r.stdout), /^WDA REPLUG NEEDED: the iPhone is not on USB for usbmux \(iproxy: "No connected\/matching device found"\) while the runner is up/);
  assert.equal(w.runs(), 1);
  assert.equal(w.pid('runner'), null);
});

test('I-220: runner up, forward not answering: restart only iproxy (the runner stays), READY', async () => {
  const w = await setup({ FAKE_IPROXY_MODES: 'dead,forward' });
  const r = await w.ensure();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /runner is up \(ServerURLHere\) but the USB forward does not answer: restarting iproxy only/);
  assert.match(lastLine(r.stdout), /^WDA READY \(restarted: it was not running\) build fake/);
  assert.equal(w.runs(), 1, 'one xcodebuild: the runner was not started again for the forward');
  assert.equal(w.iproxies(), 2);
  // later the forward dies by itself (iproxy killed): ensure restarts iproxy only, the runner keeps its pid
  const runner = w.pid('runner');
  process.kill(w.pid('iproxy'), 'SIGKILL');
  await sleep(200);
  const r2 = await w.ensure();
  assert.equal(r2.code, 0, r2.out);
  assert.match(lastLine(r2.stdout), /^WDA READY \(restarted iproxy only\)/);
  assert.equal(w.pid('runner'), runner);
  assert.equal(w.runs(), 1);
});

test('I-220: a runner that fails to launch (no known signature): exit 3 WDA NOT READY with the log tail, nothing left running, no retry', async () => {
  const w = await setup({ FAKE_XCODEBUILD_RUN_FAIL: '1' });
  const r = await w.ensure();
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^ {2}\| \*\* TEST EXECUTE FAILED \*\*$/m);
  assert.match(lastLine(r.stdout), /^WDA NOT READY: the runner did not report its server \(no ServerURLHere\)\. .*Re-run: node tools\/iphone\.mjs wda ensure --owner me$/);
  assert.equal(w.runs(), 1);
  assert.equal(w.pid('runner'), null);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

// I-251: CoreDeviceService (the user's, up 7 days) kept a stale device-preparation error after a link loss; every start
// timed out waiting for the destination, a re-plug and an unlocked phone did not help, restarting the service did.
test('I-251: xcodebuild times out waiting for the destination (stale CoreDeviceService preparation error): exit 3 WDA NOT READY naming the shape and the user-approved workaround; no retry, nothing killed', async () => {
  const w = await setup({ FAKE_XCODEBUILD_RUN_MODES: 'coredevice' });
  const r = await w.ensure();
  assert.equal(r.code, 3, r.out);
  assert.equal(w.runs(), 1, 'no retry: a second start meets the same stale error');
  assert.match(r.stdout, /^WDA start 1 failed: xcodebuild timed out waiting for the iPhone as a destination/m);
  assert.match(r.stdout, /^ {2}\| xcodebuild: error: Timed out waiting for all destinations/m, 'the log tail is shown');
  const last = lastLine(r.stdout);
  assert.match(last, /^WDA NOT READY: xcodebuild timed out waiting for the iPhone as a destination \("may need to be unlocked to recover from previously reported preparation errors"\): Xcode's CoreDeviceService kept a stale device-preparation error \(I-251\)\./);
  assert.match(last, /A re-plug or unlocking the phone does not fix this\./);
  assert.match(last, /ask the user's OK first \(CoreDeviceService is the user's process; no tool kills it\)/);
  assert.match(last, /killall CoreDeviceService.*xcrun devicectl list devices.*node tools\/iphone\.mjs wda ensure --owner me$/);
  assert.doesNotMatch(last, /Unlocked phone\?/, 'not the generic hint: unlocking does not help here');
  assert.equal(w.pid('runner'), null);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

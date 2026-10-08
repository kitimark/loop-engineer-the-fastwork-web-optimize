// I-227: `iphone.mjs preflight` against fakes only: xcodebuild / iproxy / idevice_id (tests/fixtures), a fake usbmuxd on a
// temp unix socket (its device list rewritten between runs), a fake WebDriverAgent (the fake runner's, or one in this
// process for a phone that is locked or not authorized) and a fake proxy /json for Safari's tabs. Never the phone, its
// WDA, the Mac's usbmuxd or the real locks. On 2026-10-06 (16:42-16:56Z) a re-plugged phone set three traps, each found
// only as a late failure mid-block: XCTest's Code 41 (locked / UI Automation off), a restored second Safari tab
// (AMBIGUOUS, I-037) and a stale WDA runner (I-212, "point.x != INFINITY"). The preflight names each up front, in one
// plain last line, with its own exit code.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, killFixtures } from '../helpers.mjs';
import { startFakeUsbmuxd } from '../fixtures/fake-usbmuxd.mjs';
import { startFakeWda } from '../fixtures/fake-wda.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FIX = join(TESTS, 'fixtures');
const UDID = '00008130-0011223344556677';
const IDS = [/ABCDE12345/i, /0011223344556677/, /Kitchen Phone/];
let fixturesSince = 0;
const closers = [];
before(() => { for (const f of ['fake-xcodebuild.mjs', 'fake-iproxy.mjs', 'fake-idevice-id.mjs']) chmodSync(join(FIX, f), 0o755); });
beforeEach(() => { fixturesSince = Date.now(); });
afterEach(async () => { killFixtures({ since: fixturesSince }); while (closers.length) await closers.pop()(); });

/** A built WDA in a temp FW_WDA_HOME, fakes for every executable, a fake usbmuxd (the phone on USB attach #3), a fake
 *  proxy listing Safari's tabs, our own iphone lease. */
async function setup(extra = {}) {
  const home = tempDir('fw-pfhome-'), logs = tempDir('fw-pflogs-');
  const products = join(home, 'DerivedData', 'Build', 'Products');
  mkdirSync(products, { recursive: true });
  writeFileSync(join(products, 'WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun'), '<plist/>');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ team: 'ABCDE12345', udid: UDID, bundleId: 'fw.wda.abcde12345.WebDriverAgentRunner', deviceName: 'Kitchen Phone 7' }));
  const mux = await startFakeUsbmuxd(tempDir('fw-mux-'));
  closers.push(() => mux.close());
  mux.set([{ id: 3, udid: UDID, raw: true }, { id: 2, udid: UDID, type: 'Network' }]);
  let tabs = [{ url: 'about:blank', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/1' }];
  const proxy = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(tabs)); });
  const proxyPort = await freePort();
  await new Promise((r) => proxy.listen(proxyPort, '127.0.0.1', r));
  closers.push(() => new Promise((r) => { proxy.closeAllConnections?.(); proxy.close(() => r()); }));
  const wdaPort = await freePort();
  const env = {
    FW_IPHONE_PORT: String(proxyPort), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_STATE_DIR: tempDir('fw-pf-'), FW_WDA_HOME: home, FW_WDA_URL: `http://127.0.0.1:${wdaPort}`,
    FW_XCODEBUILD: join(FIX, 'fake-xcodebuild.mjs'), FW_IPROXY: join(FIX, 'fake-iproxy.mjs'), FW_IDEVICE_ID: join(FIX, 'fake-idevice-id.mjs'), FAKE_USB_UDIDS: UDID,
    FW_USBMUXD_SOCKET: mux.socket, FW_SECURITY: '/usr/bin/false', FAKE_XCODEBUILD_LOG: join(logs, 'xb.jsonl'), FAKE_WDA_LOG: join(logs, 'wda.jsonl'), ...extra,
  };
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env }).code, 0);
  const count = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  return {
    env, mux, wdaPort, setTabs: (t) => { tabs = t; },
    runs: () => count(env.FAKE_XCODEBUILD_LOG),
    runner: () => { try { return JSON.parse(readFileSync(join(env.FW_STATE_DIR, 'wda', 'runner.json'), 'utf8')); } catch { return null; } },
    preflight: (...a) => nodeAsync(IPHONE, ['preflight', ...a, '--owner', 'me', '--settle', '0', '--usb-wait', '1', '--timeout', '30', '--retry-wait', '0', '--forward-wait', '3'], { env, timeout: 120000 }),
  };
}
const lastLine = (s) => s.trim().split('\n').at(-1);
const clean = (r) => { for (const s of IDS) assert.doesNotMatch(r.out, s); };

test('I-227: preflight needs the phone hold; a fresh phone: starts WDA on the current USB attach, settles, PREFLIGHT OK', async () => {
  const w = await setup();
  let r = node(IPHONE, ['preflight'], { env: { ...w.env, FW_STATE_DIR: tempDir('fw-pf-nolease-') } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /--owner <topic> is required|lock\.mjs run iphone/);
  r = await w.preflight('--settle', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^usb: the iPhone is on USB attach #3$/m);
  assert.match(r.stdout, /^WDA READY \(restarted: it was not running\)/m);
  assert.match(r.stdout, /^SETTLE 1 s after the WDA restart \(I-225\)$/m);
  assert.match(r.stdout, /^automation: authorized \(Safari in front, state 4\)$/m);
  assert.match(lastLine(r.stdout), /^PREFLIGHT OK: WDA restarted: it was not running, USB attach #3, automation authorized \(Safari in front\), 0 Safari pages$/);
  assert.equal(w.runs(), 1);
  assert.equal(w.runner().usbAttach, 3, 'the runner\'s pidfile records the USB attach it started on');
  const calls = readFileSync(w.env.FAKE_WDA_LOG, 'utf8');
  assert.match(calls, /wda\/apps\/state/);
  assert.doesNotMatch(calls, /wda\/apps\/(launch|terminate)|\/url"|\/actions"/, 'the probe launches nothing, opens nothing, touches nothing');
  clean(r);
});

test('I-227: same USB attach: the READY runner is kept (no restart, no settle); a re-plug (new attach): a fresh runner (I-212)', async () => {
  const w = await setup();
  assert.equal((await w.preflight()).code, 0);
  const pid = w.runner().pid;
  let r = await w.preflight('--settle', '5');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^wda: runner pid \d+ READY; same USB attach #3 as at the runner's start$/m);
  assert.doesNotMatch(r.stdout, /SETTLE/);
  assert.match(lastLine(r.stdout), /^PREFLIGHT OK: WDA kept, USB attach #3,/);
  assert.equal(w.runs(), 1);
  assert.equal(w.runner().pid, pid);
  // the cable out and back in: usbmuxd gives the phone a new DeviceID; WDA still answers READY (the I-212 trap)
  w.mux.set([{ id: 4, udid: UDID, raw: true }]);
  r = await w.preflight();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /stale: the phone was re-plugged since the runner started \(USB attach #3 then, #4 now\)/);
  assert.match(r.stdout, /^WDA READY \(restarted: the phone was re-plugged since the runner started/m);
  assert.match(lastLine(r.stdout), /^PREFLIGHT OK: WDA restarted: the phone was re-plugged .*USB attach #4,/);
  assert.equal(w.runs(), 2, 'a fresh runner');
  assert.notEqual(w.runner().pid, pid);
  assert.equal(w.runner().usbAttach, 4);
  clean(r);
});

test('I-227: a READY runner with no attach record (started before I-227) is replaced once; usbmuxd silent: kept, no verdict', async () => {
  const w = await setup();
  assert.equal((await w.preflight()).code, 0);
  const f = join(w.env.FW_STATE_DIR, 'wda', 'runner.json');
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  delete rec.usbAttach;
  writeFileSync(f, JSON.stringify(rec));
  let r = await w.preflight();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /stale: the runner recorded no USB attach at its start/);
  assert.equal(w.runs(), 2);
  r = await nodeAsync(IPHONE, ['preflight', '--owner', 'me', '--settle', '0'], { env: { ...w.env, FW_USBMUXD_SOCKET: 'off' }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^NOTE usb: usbmuxd gave no device list; no re-plug verdict/m);
  assert.match(lastLine(r.stdout), /^PREFLIGHT OK: WDA kept, automation authorized/);
  assert.equal(w.runs(), 2);
});

test('I-227: the phone not on USB (only on Wi-Fi): exit 4 PREFLIGHT REPLUG before any xcodebuild', async () => {
  const w = await setup();
  w.mux.set([{ id: 2, udid: UDID, type: 'Network' }]);
  const r = await w.preflight();
  assert.equal(r.code, 4, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT REPLUG: the iPhone is not on USB \(usbmuxd lists 0 USB devices, not this phone, for 1 s\): plug the iPhone cable in \(or unplug it and plug it back in\), keep the phone unlocked, then re-run$/);
  assert.equal(w.runs(), 0);
  clean(r);
});

test('I-227: XCTest Code 41 (locked / UI Automation off) on the probe, or Safari not in front after activate: exit 10 PREFLIGHT AUTH', async () => {
  const w = await setup();
  // a WDA that is up (not ours: kept) but refuses UI actions, like the phone after the re-plug at 16:42Z
  let wda = await startFakeWda({ port: w.wdaPort, unauthorized: true });
  let r = await w.preflight();
  await wda.close();
  assert.equal(r.code, 10, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT AUTH: XCTest refused a UI action \(Code 41, not authorized for UI testing: the phone is locked or UI Automation is off\): unlock the iPhone and keep it unlocked, check Settings > Developer > Enable UI Automation is on \(accept any prompt on the phone\), then re-run$/);
  assert.equal(w.runs(), 0);
  // the lock screen: activate answers OK, SpringBoard stays in front
  wda = await startFakeWda({ port: w.wdaPort, locked: true });
  r = await w.preflight();
  await wda.close();
  assert.equal(r.code, 10, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT AUTH: Safari did not come to the front \(in front: SpringBoard \(the lock or home screen\); Safari state 1\): the iPhone is probably locked: unlock the iPhone/);
  clean(r);
});

test('I-227: a fresh runner whose start meets Code 41, or XCTest timing out enabling automation mode twice: exit 10 PREFLIGHT AUTH', async () => {
  let w = await setup({ FAKE_WDA_UNAUTHORIZED: '1' });
  let r = await w.preflight();
  assert.equal(r.code, 10, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT AUTH: XCTest refused to bring Safari to the front \(Code 41, not authorized for UI testing\): unlock the iPhone/);
  clean(r);
  w = await setup({ FAKE_XCODEBUILD_RUN_MODES: 'automation' });
  r = await w.preflight();
  assert.equal(r.code, 10, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT AUTH: XCTest could not enable automation mode on the iPhone: unlock the iPhone, check Settings > Developer > Enable UI Automation is on, then re-run; if the phone was unlocked and it is on, unplug the iPhone cable, plug it back in and re-run$/);
  assert.equal(w.runs(), 2, 'ensure\'s start and its one retry');
  clean(r);
});

test('I-251: a stale CoreDeviceService preparation error at the runner start: PREFLIGHT WDA points to the user-approved CoreDeviceService restart, not to trusting the runner', async () => {
  const w = await setup({ FAKE_XCODEBUILD_RUN_MODES: 'coredevice' });
  const r = await w.preflight();
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stdout, /^WDA NOT READY: .*CoreDeviceService/m);
  assert.match(lastLine(r.stdout), /^PREFLIGHT WDA: WDA is not ready \(xcodebuild timed out waiting for the iPhone as a destination.*\): Xcode's CoreDeviceService kept a stale device-preparation error; a re-plug or unlock does not fix it: see the WDA NOT READY line above \(ask the user's OK, then restart CoreDeviceService\), then re-run$/);
  assert.doesNotMatch(lastLine(r.stdout), /trusted/);
  assert.equal(w.runs(), 1);
  clean(r);
});

test('I-227: Safari restored a second tab (AMBIGUOUS for open, I-037): exit 11 PREFLIGHT TABS; blank views never count; proxy down: exit 12', async () => {
  const w = await setup();
  w.setTabs([
    { url: 'about:blank', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/1' },
    { url: 'http://192.168.1.20:5301/', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/2' },
    { url: 'https://fastwork.com/selling', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/3' },
  ]);
  let r = await w.preflight();
  assert.equal(r.code, 11, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT TABS: Safari has 2 pages open \(lan-host:5301, fastwork\.com\); a block needs at most one \(open refuses several, I-037\): on the iPhone, close every Safari tab but one \(Safari's tabs button, then close the others\), then re-run$/);
  assert.doesNotMatch(r.out, /192\.168/, 'no LAN address (Hard rule 12)');
  w.setTabs([{ url: 'about:blank', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/1' }, { url: 'http://192.168.1.20:5301/', appId: 'PID:4242', webSocketDebuggerUrl: 'ws://x/2' }]);
  r = await w.preflight();
  assert.equal(r.code, 0, r.out);
  assert.match(lastLine(r.stdout), /, 1 Safari page$/);
  r = await nodeAsync(IPHONE, ['preflight', '--owner', 'me', '--settle', '0'], { env: { ...w.env, FW_IPHONE_PORT: String(await freePort()) }, timeout: 60000 });
  assert.equal(r.code, 12, r.out);
  assert.match(lastLine(r.stdout), /^PREFLIGHT PROXY: ios_webkit_debug_proxy does not answer on :\d+ /);
});

// tools/lib/usblink.mjs (incident I-222): the iPhone's USB link from three reads (IOUSB, usbmux, the proxy's device
// list), its states and exit codes, the proxy-ownership rule behind the only repair, and the re-plug step rule. The
// 2026-10-07 04:44:27Z drop (usbmuxd log: "MuxReceivedUSBData device disconnected" while IOUSB kept the iPhone) is the
// usb-lost row; I-235 (usbmux back after the re-plug, the proxy still listing nothing) the proxy-stale row. Fakes only:
// injected reads, an in-process usbmuxd socket and HTTP server, tests/fixtures/fake-ioreg.mjs; never the Mac's USB bus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { tempDir, TESTS } from '../helpers.mjs';
import { startFakeUsbmuxd } from '../fixtures/fake-usbmuxd.mjs';

const state = tempDir('usblink-unit-');
process.env.FW_STATE_DIR = state; // audit lines and the console store of these tests go here
process.env.FW_WDA_HOME = join(state, 'wda'); // no WDA config: never the Mac's real phone udid (knownDevice)
const L = await import('../../tools/lib/usblink.mjs');
const { parseIoreg, ioUsbIphone, ioUsbLinkCause, muxPhone, proxyDevices, sample, evaluate, sampleFacts, isOurProxy, replugStepPass, LINK_EXIT, LINK_STATES, proxyConfigArg, proxyPorts, auditFile } = L;

const UDID = '00008130-0011223344556677';
const IOREG = `+-o iPhone@00100000  <class IOUSBHostDevice, id 0x10009dfef, registered, matched, active, busy 0 (238 ms), retain 65>
    {
      "kUSBSerialNumberString" = "FAKESERIAL0000000000000A"
      "USB Product Name" = "iPhone"
      "Device Speed" = 2
      "kUSBCurrentConfiguration" = 6
    }
  +-o AppleUSBHostCompositeDevice@00100000  <class IOService, id 0x10009dff0, !registered, !matched, active, busy 0, retain 4>
    {
      "kUSBCurrentConfiguration" = 1
    }
`;

test('parseIoreg: the iPhone node, its configuration and speed code; nothing else, no serial', () => {
  assert.deepEqual(parseIoreg(IOREG), { count: 1, config: 6, speed: 2 });
  assert.deepEqual(parseIoreg(''), { count: 0, config: null, speed: null }, 'ioreg prints nothing when no node matches');
  assert.deepEqual(parseIoreg('+-o iPad@00200000  <class IOUSBHostDevice, id 0x1>\n    {\n      "Device Speed" = 3\n    }\n'), { count: 0, config: null, speed: null });
  assert.deepEqual(parseIoreg('+-o iPhone@00100000  <class IOUSBDevice, id 0x1>\n'), { count: 1, config: null, speed: null }, 'the older class name counts');
  assert.equal(parseIoreg(`${IOREG}${IOREG}`).count, 2);
  assert.doesNotMatch(JSON.stringify(parseIoreg(IOREG)), /FAKESERIAL/);
});

test('ioUsbIphone / ioUsbLinkCause: $FW_IOREG off -> no read; the fake bus -> usb-lost or unplugged; a failing ioreg -> null', () => {
  const fake = join(TESTS, 'fixtures', 'fake-ioreg.mjs'), file = join(state, 'ioreg-mode'), log = join(state, 'ioreg.log');
  assert.equal(ioUsbIphone({ exe: 'off' }), null);
  assert.equal(ioUsbLinkCause({ exe: 'off' }), null);
  process.env.FAKE_IOREG_FILE = file; process.env.FAKE_IOREG_LOG = log;
  try {
    writeFileSync(file, 'iphone');
    assert.deepEqual(ioUsbIphone({ exe: fake }), { count: 1, config: 6, speed: 2 });
    assert.equal(ioUsbLinkCause({ exe: fake }), 'usb-lost');
    writeFileSync(file, 'none');
    assert.equal(ioUsbLinkCause({ exe: fake }), 'unplugged');
    writeFileSync(file, 'fail');
    assert.equal(ioUsbIphone({ exe: fake }), null);
    assert.equal(ioUsbIphone({ exe: join(state, 'no-such-ioreg') }), null);
    assert.equal(readFileSync(log, 'utf8').split('\n')[0], '-p IOUSB -w0 -l -r -n iPhone', 'the IOUSB plane, the iPhone subtree only');
  } finally { delete process.env.FAKE_IOREG_FILE; delete process.env.FAKE_IOREG_LOG; }
});

test('muxPhone: USB entries of usbmuxd (network ones do not count); the configured phone, else the only USB device; null without a daemon', async () => {
  const mux = await startFakeUsbmuxd(tempDir('usblink-mux-'));
  try {
    mux.set([{ id: 131, udid: UDID, raw: true }, { id: 7, udid: UDID, type: 'Network' }]);
    assert.deepEqual(await muxPhone({ socket: mux.socket, udid: UDID }), { count: 1, listed: true, id: 131 });
    assert.deepEqual(await muxPhone({ socket: mux.socket, udid: null }), { count: 1, listed: true, id: 131 });
    assert.deepEqual(await muxPhone({ socket: mux.socket }), { count: 1, listed: true, id: 131 }, 'no WDA config: the only USB device');
    mux.set([{ id: 7, udid: UDID, type: 'Network' }]);
    assert.deepEqual(await muxPhone({ socket: mux.socket, udid: UDID }), { count: 0, listed: false, id: null }, 'the phone on Wi-Fi only (devicectl network) is off USB');
    mux.set([{ id: 9, udid: '00008130-0099999999999999' }]);
    assert.deepEqual(await muxPhone({ socket: mux.socket, udid: UDID }), { count: 1, listed: false, id: null }, 'another USB device is not the phone');
    assert.equal(await muxPhone({ socket: 'off' }), null);
    assert.equal(await muxPhone({ socket: join(state, 'no-such.sock') }), null);
  } finally { await mux.close(); }
});

test('proxyDevices: counts the list (never keeps it); refused when nothing listens; an error for a non-list answer', async () => {
  let body = '[{"deviceId":"00008130-0011223344556677","deviceName":"Test Person\'s iPhone","url":"localhost:9222"}]';
  const srv = http.createServer((req, res) => res.end(body));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    assert.deepEqual(await proxyDevices({ port }), { count: 1 });
    body = '[]';
    assert.deepEqual(await proxyDevices({ port }), { count: 0 });
    body = '{"x":1}';
    assert.deepEqual(await proxyDevices({ port }), { error: 'not a device list' });
  } finally { await new Promise((r) => srv.close(r)); }
  const r = await proxyDevices({ port });
  assert.equal(r.refused, true, JSON.stringify(r));
});

test('sample: the proxy is asked only when usbmux has the phone; a throwing read is no read', async () => {
  let asked = 0;
  const proxy = async () => { asked++; return { count: 1 }; };
  let s = await sample({ now: () => 5, ioreg: () => ({ count: 1, config: 6, speed: 2 }), mux: async () => ({ count: 0, listed: false, id: null }), proxy });
  assert.deepEqual(s, { at: 5, iousb: { count: 1, config: 6, speed: 2 }, mux: { count: 0, listed: false, id: null }, proxy: null });
  assert.equal(asked, 0);
  s = await sample({ now: () => 6, ioreg: () => { throw new Error('x'); }, mux: async () => ({ count: 1, listed: true, id: 132 }), proxy });
  assert.deepEqual(s, { at: 6, iousb: null, mux: { count: 1, listed: true, id: 132 }, proxy: { count: 1 } });
  assert.equal(asked, 1);
  s = await sample({ now: () => 7, ioreg: () => null, mux: async () => { throw new Error('socket'); }, proxy });
  assert.equal(s.mux, null);
});

const IO = { count: 1, config: 6, speed: 2 }, NO_IO = { count: 0, config: null, speed: null };
const ON = { count: 1, listed: true, id: 132 }, OFF = { count: 0, listed: false, id: null };
const at = (sec) => 1_000_000 + sec * 1000;

test('evaluate: one state per case, an exit code per state; usb-lost is the 2026-10-06/07 drop shape', () => {
  const cases = [
    [{ iousb: IO, mux: ON, proxy: { count: 1 } }, 'ok', /the iPhone is on USB \(usbmux attach #132\) and the proxy :9221 lists 1 device$/],
    [{ iousb: IO, mux: OFF, proxy: null }, 'usb-lost', /the Mac's USB bus still has the iPhone, but usbmux does not list it: .*re-plug the iPhone's cable \(phone unlocked\)$/],
    [{ iousb: NO_IO, mux: OFF, proxy: null }, 'unplugged', /no iPhone on the Mac's USB bus or on usbmux: plug the cable in/],
    [{ iousb: null, mux: OFF, proxy: null }, 'unknown', /IOUSB is not readable \(unplugged or usb-lost\)/],
    [{ iousb: IO, mux: null, proxy: null }, 'unknown', /usbmuxd gave no device list/],
    [{ iousb: IO, mux: ON, proxy: { refused: true, code: 'ECONNREFUSED' } }, 'proxy-down', /nothing answers on :9221 \(ECONNREFUSED\): start the proxy \(node tools\/usblink.mjs proxy start --by <you>\)/],
    [{ iousb: IO, mux: { count: 2, listed: false, id: null }, proxy: null }, 'usb-lost', /does not list it \(2 other USB devices\)/],
  ];
  for (const [s, want, re] of cases) {
    const e = evaluate({ at: at(0), ...s });
    assert.equal(e.state, want, JSON.stringify(s));
    assert.match(e.line, re, want);
    assert.ok(LINK_STATES.includes(e.state));
    assert.ok(Number.isInteger(LINK_EXIT[e.state]));
  }
  assert.deepEqual(LINK_EXIT, { ok: 0, usage: 2, unplugged: 3, 'usb-lost': 4, 'proxy-stale': 5, 'proxy-down': 6, unknown: 7 });
  assert.equal(new Set(Object.values(LINK_EXIT)).size, Object.keys(LINK_EXIT).length, 'a distinct exit code per state');
});

test('evaluate: an empty proxy list is attaching until staleAfter, then proxy-stale (I-235); a list resets it; since carries over', () => {
  const o = { staleAfterMs: 30000 };
  let e = evaluate({ at: at(0), iousb: IO, mux: ON, proxy: { count: 0 } }, {}, o);
  assert.equal(e.state, 'attaching');
  assert.equal(e.emptySince, at(0));
  e = evaluate({ at: at(29), iousb: IO, mux: ON, proxy: { count: 0 } }, e, o);
  assert.equal(e.state, 'attaching', 'the proxy re-attaches by itself within seconds after a re-plug (I-239)');
  e = evaluate({ at: at(30), iousb: IO, mux: ON, proxy: { count: 0 } }, e, o);
  assert.equal(e.state, 'proxy-stale');
  assert.match(e.line, /usbmux has the iPhone \(attach #132\), but the proxy :9221 has listed no device for 30 s: restart it/);
  const since = e.since;
  e = evaluate({ at: at(200), iousb: IO, mux: ON, proxy: { error: 'TimeoutError' } }, e, o);
  assert.equal(e.state, 'proxy-stale', 'a hung proxy counts like an empty one');
  assert.equal(e.since, since);
  assert.match(e.line, /has not answered \(TimeoutError\) for 3 min.*\(since \d\d:\d\dZ, 3 min\)$/);
  e = evaluate({ at: at(201), iousb: IO, mux: ON, proxy: { count: 1 } }, e, o);
  assert.equal(e.state, 'ok');
  assert.equal(e.emptySince, null);
  e = evaluate({ at: at(202), iousb: IO, mux: ON, proxy: { count: 0 } }, e, o);
  assert.equal(e.state, 'attaching', 'a new empty spell starts its own grace');
  // a drop: usb-lost carries its start
  let d = evaluate({ at: at(300), iousb: IO, mux: OFF }, {}, o);
  d = evaluate({ at: at(420), iousb: IO, mux: OFF }, d, o);
  assert.equal(d.since, at(300));
  assert.match(d.line, /\(since \d\d:\d\dZ, 2 min\)$/);
});

test('sampleFacts: the numbers for the audit log, no ids or names', () => {
  const f = sampleFacts({ at: 1, iousb: IO, mux: ON, proxy: { count: 1 } });
  assert.deepEqual(f, { iousb: { count: 1, config: 6, speed: 2 }, mux: { usb: 1, listed: true, attach: 132 }, proxy: { count: 1 } });
  assert.deepEqual(sampleFacts({ at: 1, iousb: null, mux: null, proxy: { refused: true, code: 'ECONNREFUSED' } }), { iousb: null, mux: null, proxy: { refused: 'ECONNREFUSED' } });
});

test('proxyConfigArg / proxyPorts: the lead\'s command line (-c null:9221,:9222-9322); ports from the iphone.mjs variables', () => {
  assert.equal(proxyConfigArg(), 'null:9221,:9222-9322');
  assert.deepEqual(proxyPorts({ FW_IPHONE_DEVICE_PORT: '7001', FW_IPHONE_PORT: '7002' }), { list: 7001, tabs: 7002, last: 7102 });
  assert.equal(proxyConfigArg(proxyPorts({ FW_IPHONE_DEVICE_PORT: '7001', FW_IPHONE_PORT: '7002' })), 'null:7001,:7002-7102');
});

test('isOurProxy: only the recorded, live process with our -c argument, no -s unix: and the recorded start time', () => {
  const rec = { pid: 4242, match: '-c null:9221,:9222-9322', procStart: 1_000_000, by: 'lead', startedAt: 'T' };
  const ps = (cmd, start = 1_000_500, alive = true) => ({ alive: () => alive, command: () => cmd, start: () => start });
  assert.deepEqual(isOurProxy(null), { ours: false, why: 'no proxy started by usblink.mjs (no pidfile)' });
  assert.equal(isOurProxy(rec, ps('ios_webkit_debug_proxy -c null:9221,:9222-9322')).ours, true);
  let o = isOurProxy(rec, ps('', null, false));
  assert.equal(o.ours, false); assert.equal(o.dead, true);
  o = isOurProxy(rec, ps('/usr/bin/some-other-program --serve'));
  assert.equal(o.ours, false); assert.match(o.why, /another program now/);
  o = isOurProxy(rec, ps('ios_webkit_debug_proxy -c null:9221,:9222-9322 -s unix:/private/tmp/com.apple.launchd.x/com.apple.webinspectord_sim.socket'));
  assert.equal(o.ours, false, 'never a Simulator proxy'); assert.match(o.why, /Simulator proxy/);
  o = isOurProxy(rec, ps('ios_webkit_debug_proxy -c null:9221,:9222-9322', 1_090_000));
  assert.equal(o.ours, false, 'a reused pid running the same command line (the lead\'s hand-started proxy)'); assert.match(o.why, /reused pid/);
  o = isOurProxy(rec, ps('ios_webkit_debug_proxy -c null:9221,:9222-9322', null));
  assert.equal(o.ours, false, 'no start time readable: not provably ours');
});

/** A fake console store: steps with a status the test sets. */
function fakeConsole() {
  const steps = new Map();
  let n = 0;
  return {
    steps,
    post: async (p) => { const s = { id: `C-${String(++n).padStart(3, '0')}`, status: 'pending', ...p }; steps.set(s.id, s); return s; },
    get: (id) => { const s = steps.get(id); if (!s) throw new Error(`no console step ${id}`); return s; },
    cancel: async (id) => { steps.get(id).status = 'cancelled'; },
    open: (s) => s.status === 'pending' || s.status === 'active',
  };
}

test('replugStepPass: one step after 60 s of loss, none while ours is open, cancelled when the link is ok, the next only 60 s after a Done', async () => {
  const c = fakeConsole(), by = 'lead', afterMs = 60000;
  let st = { state: 'usb-lost', since: at(0), step: null, stepClosedAt: null };
  let r = await replugStepPass(st, { by, now: at(59), afterMs, console: c });
  assert.deepEqual(r, { step: null, stepClosedAt: null }, 'not before 60 s');
  r = await replugStepPass(st, { by, now: at(60), afterMs, console: c });
  assert.equal(r.posted, 'C-001');
  const s = c.steps.get('C-001');
  assert.equal(s.kind, 'action'); assert.equal(s.title, "Re-plug the iPhone's USB cable"); assert.equal(s.by, 'lead');
  assert.doesNotMatch(s.instructions, /\d{8}-|Test Person/);
  st = { ...st, step: r.step, stepClosedAt: r.stepClosedAt };
  for (const t of [61, 300, 900]) assert.deepEqual(await replugStepPass(st, { by, now: at(t), afterMs, console: c }), { step: 'C-001', stepClosedAt: null }, `still open at ${t} s: no second step`);
  // the re-plug brought usbmux back; the proxy attaches: the step stays until the link is ok
  assert.deepEqual(await replugStepPass({ ...st, state: 'attaching' }, { by, now: at(910), afterMs, console: c }), { step: 'C-001', stepClosedAt: null });
  r = await replugStepPass({ ...st, state: 'ok' }, { by, now: at(920), afterMs, console: c });
  assert.equal(r.closed, 'C-001');
  assert.equal(c.steps.get('C-001').status, 'cancelled');
  assert.equal(c.steps.size, 1);

  // the user pressed Done but the link is still lost: the next step only after another 60 s
  st = { state: 'usb-lost', since: at(1000), step: null, stepClosedAt: null };
  r = await replugStepPass(st, { by, now: at(1060), afterMs, console: c });
  assert.equal(r.posted, 'C-002');
  c.steps.get('C-002').status = 'done';
  st = { ...st, step: r.step, stepClosedAt: r.stepClosedAt };
  r = await replugStepPass(st, { by, now: at(1100), afterMs, console: c });
  assert.deepEqual(r, { step: null, stepClosedAt: at(1100) });
  st = { ...st, step: r.step, stepClosedAt: r.stepClosedAt };
  assert.equal((await replugStepPass(st, { by, now: at(1159), afterMs, console: c })).posted, undefined);
  r = await replugStepPass(st, { by, now: at(1160), afterMs, console: c });
  assert.equal(r.posted, 'C-003');
  // ok again after a Done: nothing to close, the next episode starts fresh
  c.steps.get('C-003').status = 'done';
  assert.deepEqual(await replugStepPass({ state: 'ok', since: at(1200), step: 'C-003', stepClosedAt: null }, { by, now: at(1200), afterMs, console: c }), { step: null, stepClosedAt: null });
  // a proxy-stale or unknown link never posts a re-plug step
  assert.equal((await replugStepPass({ state: 'proxy-stale', since: at(0), step: null }, { by, now: at(9999), afterMs, console: c })).posted, undefined);
  // a failing post is reported, not thrown
  r = await replugStepPass({ state: 'unplugged', since: at(0), step: null }, { by, now: at(9999), afterMs, console: { ...c, post: async () => { throw new Error('store busy'); } } });
  assert.equal(r.error, 'store busy');
  const audit = readFileSync(auditFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(audit.map((a) => a.event), ['replug-step', 'replug-step-closed', 'replug-step', 'replug-step']);
});

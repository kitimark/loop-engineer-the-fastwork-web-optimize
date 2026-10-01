// tools/lib/sim.mjs pure parts: the hold gate (own normal chrome-measure hold only), iwdp's config text (phones at -1,
// never a bad id), the lsof socket parse, the port rules (the phone's 9221/9222/8100 refused), scrub() (no UDID
// leaves the machine) and sim-scroll's meta (meta.device "simulator" and meta.sim, no battery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { holdGate, iwdpConfigText, parseLsofSockets, ports, scrub, mask, proxyCheck, IWDP_ID, SIM_DEVICE, SIM_WEIGHT, SIM_LOCK, takeSimLock } from '../../tools/lib/sim.mjs';
import { status as lockStatus } from '../../tools/lib/lock.mjs';
import { simMeta, SIM_SETTINGS, runTarget } from '../../tools/lib/sim-scroll.mjs';
import { tempDir } from '../helpers.mjs';

const T0 = Date.parse('2026-10-01T12:00:00Z');
const holder = (o = {}) => ({ owner: 'me', token: 'aaaaaaaaaaaa', pid: process.pid, kind: 'process', acquiredAt: new Date(T0).toISOString(), ...o });
const st = (h) => ({ holder: h, stale: false, queue: [] });

test('holdGate: only this process\'s own normal hold passes; it ends at acquiredAt + expectSec (or a lease\'s expiresAt)', () => {
  let g = holdGate(st(holder({ meta: { expectSec: 420 } })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 420000 });
  g = holdGate(st(holder({ kind: 'lease', pid: undefined, expiresAt: new Date(T0 + 600000).toISOString() })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.equal(g.endsAt, T0 + 600000);
  g = holdGate(st(holder()), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.deepEqual(g, { ok: true, endsAt: Infinity });
});

test('holdGate: refuses a free lock, someone else\'s hold, a forged token and a short-lane hold, naming the command to run', () => {
  let g = holdGate({ holder: null, queue: [] }, undefined, { owner: 'me' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /chrome-measure is free, but this process does not hold it/);
  assert.match(g.reason, /node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 420 -- node tools\/sim\.mjs session --owner me/);
  g = holdGate(st(holder({ owner: 'other' })), undefined, { owner: 'me', now: T0 });
  assert.match(g.reason, /held by "other", not by this process/);
  g = holdGate(st(holder({ owner: 'other' })), 'chrome-measure:bbbbbbbbbbbb', { owner: 'me', now: T0 });
  assert.equal(g.ok, false);
  g = holdGate(st(holder({ short: true, maxSec: 300 })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.equal(g.ok, false);
  assert.match(g.reason, /short-lane job \(max 300 s\)/);
  g = holdGate({ ...st(holder()), stale: true }, 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.equal(g.ok, false, 'a stale hold is no hold');
});

// ts-lock-share §3: a functional session also accepts its own shared-lane reader slot (weight >= 3) and its own short hold
const reader = (o = {}) => ({ owner: 'me', token: 'cccccccccccc', kind: 'process', pid: process.pid, acquiredAt: new Date(T0).toISOString(), deadline: new Date(T0 + 305000).toISOString(), maxSec: 300, weight: 3, ...o });
const group = (readers) => ({ owner: '(shared)', kind: 'lease', short: true, shared: true, format: 'rw1', token: 'dddddddddddd', acquiredAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 315000).toISOString(), readers });

test('holdGate functional: its own live reader slot of weight >= SIM_WEIGHT (ends at acquiredAt + maxSec), or its own short hold; mode named', () => {
  assert.equal(SIM_WEIGHT, 3);
  let g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 300000, mode: 'shared' });
  g = holdGate(st(holder({ short: true, maxSec: 300, expiresAt: new Date(T0 + 305000).toISOString() })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, functional: true });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 300000, mode: 'short' }, 'the switch-off form of `run --shared`');
  g = holdGate(st(holder()), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, functional: true });
  assert.deepEqual(g, { ok: true, endsAt: Infinity, mode: 'exclusive' });
});

test('holdGate functional: refuses a light slot, someone else\'s slot, a dead or expired slot; a non-functional session never takes a slot', () => {
  let g = holdGate(st(group([reader({ weight: 1 })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /weight 1, and a Simulator session needs weight 3/);
  assert.match(g.reason, /lock\.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner me -- node tools\/sim\.mjs session --functional --owner me/);
  g = holdGate(st(group([reader({ owner: 'other' })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:bbbbbbbbbbbb' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /shared by functional readers \("other"\), and none of them is this process/);
  g = holdGate(st(group([reader({ pid: 999999 })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false, 'a reader whose process is gone is no slot');
  g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 306000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false, 'past its deadline');
  g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 1000, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /a shared slot is no normal hold.*\n {2}node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 420/s);
  g = holdGate(st(holder({ short: true, maxSec: 60 })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.match(g.reason, /short-lane job \(max 60 s\).*session --functional/s, 'the refusal names the functional form');
});

test('takeSimLock: one Simulator session at a time; a second waits, gives up after its wait (dequeued, holder named); release frees it', async () => {
  const prev = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = join(tempDir('fw-simlock-'), 'state');
  try {
    const a = await takeSimLock('one', { waitSec: 0 });
    assert.equal(lockStatus(SIM_LOCK).holder.owner, 'one');
    await assert.rejects(takeSimLock('two', { waitSec: 0, log: () => {} }), /the Simulator is busy: the simulator lock is held by "one"/);
    assert.deepEqual(lockStatus(SIM_LOCK).queue, [], 'the giving-up waiter left the queue');
    await assert.rejects(takeSimLock('one', { waitSec: 0 }), /already held by "one"/);
    await a.release();
    assert.equal(lockStatus(SIM_LOCK).holder, null);
    const b = await takeSimLock('two', { waitSec: 0 });
    await a.release(); // a stale handle never frees someone else's hold
    assert.equal(lockStatus(SIM_LOCK).holder.owner, 'two');
    await b.release();
  } finally { if (prev === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = prev; }
});

test('iwdpConfigText: list port, each phone once at -1, then the Simulator; a non-id line is refused', () => {
  const a = '00008130-0011223344556677', b = 'abcdef0123456789abcdef0123456789abcdef01';
  assert.equal(iwdpConfigText([a, b, a], { list: 9231, tabs: 9232 }), `null:9231\n${a}:-1\n${b}:-1\n:9232\n`);
  assert.equal(iwdpConfigText([], { list: 9231, tabs: 9232 }), 'null:9231\n:9232\n');
  assert.throws(() => iwdpConfigText(['* evil'], { list: 1, tabs: 2 }), /not an iwdp device id/);
  assert.throws(() => iwdpConfigText([''], { list: 1, tabs: 2 }));
  assert.ok(IWDP_ID.test(a) && !IWDP_ID.test('SIMULATOR') && !IWDP_ID.test('short-123'));
});

test('parseLsofSockets: the webinspectord_sim sockets of field n, deduplicated', () => {
  const s = '/private/var/tmp/com.apple.launchd.X1/com.apple.webinspectord_sim.socket';
  assert.deepEqual(parseLsofSockets(`p12\nf5\nn${s}\nf6\nn/tmp/other.socket\nn${s}\n`), [s]);
  assert.deepEqual(parseLsofSockets(''), []);
  assert.deepEqual(parseLsofSockets(null), []);
});

test('ports: 9231 / 9232 / 8101 by default; the phone\'s 9221, 9222, 8100 and duplicates refused', () => {
  assert.deepEqual(ports({}), { list: 9231, tabs: 9232, wda: 8101 });
  assert.deepEqual(ports({ FW_SIM_DEVICE_PORT: '6001', FW_SIM_PORT: '6002', FW_SIM_WDA_PORT: '6003' }), { list: 6001, tabs: 6002, wda: 6003 });
  for (const [k, v] of [['FW_SIM_PORT', '9222'], ['FW_SIM_DEVICE_PORT', '9221'], ['FW_SIM_WDA_PORT', '8100']]) assert.throws(() => ports({ [k]: v }), /are the iPhone's/);
  assert.throws(() => ports({ FW_SIM_PORT: '9231' }), /must differ/);
  assert.throws(() => ports({ FW_SIM_PORT: 'x' }), /bad simulator tabs port/);
});

test('scrub: known ids (any case) and any UUID / UDID shape are replaced; mask never shows the id', () => {
  const sim = 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF', phone = '00008130-0011223344556677';
  const out = scrub(`boot ${sim} failed; phone ${phone.toLowerCase()} and ${sim.toLowerCase()}`, [sim, phone]);
  assert.ok(!out.includes(sim) && !out.toLowerCase().includes(phone.toLowerCase()) && !out.toLowerCase().includes(sim.toLowerCase()), out);
  assert.match(scrub(`unknown 11111111-2222-3333-4444-555555555555 here`, []), /^unknown <[a-z]+> here$/);
  assert.equal(scrub('', []), '');
  assert.equal(mask(sim), 'set');
  assert.equal(mask(''), '(unset)');
});

test('simMeta: device "simulator", runtime / Xcode / window / tip / ports / host load; settings are n/a (no battery)', () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-'); // no config: the fields are null, never the real one
  assert.equal(SIM_DEVICE, 'simulator');
  assert.deepEqual(SIM_SETTINGS, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  const m = simMeta({ window: 'shown', tipDismissed: 'absent', proxyPorts: { list: 9231, tabs: 9232, wda: 8101 } }, { hostStart: { load1: 1 }, hostEnd: { load1: 2 } });
  assert.equal(m.window, 'shown');
  assert.equal(m.tipDismissed, 'absent');
  assert.deepEqual(m.proxyPorts, { list: 9231, tabs: 9232, wda: 8101 });
  assert.deepEqual(m.hostLoad, { start: { load1: 1 }, end: { load1: 2 } });
  for (const k of ['runtime', 'runtimeBuild', 'deviceType', 'xcode', 'lockdownMode']) assert.ok(k in m, k);
  assert.ok(!JSON.stringify(m).match(/udid/i), 'no udid field');
});

test('proxyCheck (before every timed run): exactly SIMULATOR passes; a phone that appeared later, or no Simulator, throws without printing its id', async () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-');
  let list = [];
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(list)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = { list: srv.address().port, tabs: 1, wda: 2 };
  try {
    list = [{ deviceId: 'SIMULATOR' }];
    assert.equal((await proxyCheck(p)).ok, true);
    list = [{ deviceId: 'SIMULATOR' }, { deviceId: '00008130-0011223344556677', deviceName: "Test Person's iPhone" }];
    await assert.rejects(proxyCheck(p), (e) => /proxy sees a non-simulator device \(1 non-simulator/.test(e.message) && !/00008130|Test Person/.test(e.message));
    list = [];
    await assert.rejects(proxyCheck(p), /lists no Simulator/);
  } finally { srv.close(); }
  await assert.rejects(proxyCheck(p), /not reachable/);
});

test('runTarget: the Simulator target of iphone.mjs run; renew() refuses a run that would outlast the hold (minus cleanup)', async () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-');
  const t = runTarget({ window: 'hidden' }, { requireSession: () => {}, holdEndsAt: () => T0 + 100000, cleanupMs: 40000, now: () => T0 });
  assert.equal(t.device, 'simulator');
  assert.equal(t.outDir, 'sim');
  assert.deepEqual(t.toolFiles.slice(0, 3), ['tools/sim.mjs', 'tools/lib/sim.mjs', 'tools/lib/sim-scroll.mjs']);
  assert.ok(t.toolFiles.includes('tools/lib/iphone-run.mjs'));
  await t.renew(60000);
  await assert.rejects(t.renew(61000), /needs about 61 s, but your chrome-measure hold leaves 60 s/);
  assert.deepEqual(Object.keys(t.extra()), ['sim']);
  assert.equal(t.extra().sim.window, 'hidden');
});

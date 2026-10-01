// tools/lib/sim.mjs pure parts: the hold gate (own normal chrome-measure hold only), iwdp's config text (phones at -1,
// never a bad id), the lsof socket parse, the port rules (the phone's 9221/9222/8100 refused), scrub() (no UDID
// leaves the machine) and sim-scroll's meta (meta.device "simulator" and meta.sim, no battery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdGate, iwdpConfigText, parseLsofSockets, ports, scrub, mask, IWDP_ID, SIM_DEVICE } from '../../tools/lib/sim.mjs';
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

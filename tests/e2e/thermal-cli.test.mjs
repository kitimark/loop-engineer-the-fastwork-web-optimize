// I-199: tools/thermal.mjs end to end against tests/fixtures/fake-coredevice.mjs (a fake RSD over HTTP/2 + RemoteXPC and
// a fake DTServiceHub on ::1; fake netstat and lsof name it), in a temp state dir: the phone-hold rule, usage, probe /
// list / status / set / clear, and that every way a `set` ends leaves no condition behind (hold elapsed, SIGTERM,
// `clear`, SIGKILL -> the device's auto-clear on close, a dropped connection). Never the real tunnel, locks or phone;
// output never names the tunnel address, the ports or the device id.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tempDir, node, nodeAsync, tool, freePort, sleep, startProc, cleanEnv, FIXTURES, REPO } from '../helpers.mjs';

const LOCK = tool('lock.mjs'), THERMAL = tool('thermal.mjs'), FAKE = join(FIXTURES, 'fake-coredevice.mjs');
const OWNER = 'user-thermal-test'; // a user lease: the test may hold the phone directly (lock.mjs acquire iphone)
let base, env, state, dev;

before(async () => {
  base = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '1', FW_NO_CAFFEINATE: '1',
    FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FW_DEVICECTL: join(FIXTURES, 'fake-devicectl.mjs'), FW_NETSTAT: FAKE, FW_LSOF: FAKE, FW_THERMAL_LOOPBACK: '1' };
});
beforeEach(() => {
  state = tempDir('fw-thermal-e2e-');
  env = { ...base, FW_STATE_DIR: join(state, 'fw'), FAKE_CD_STATE: join(state, 'device.json'), FAKE_CD_LOG: join(state, 'device.log'), FAKE_CD_PORTS: join(state, 'ports.json') };
});
afterEach(async () => { if (dev) await dev.stop(); dev = null; });

/** Start the fake phone (faults in `extra` reach the server; netstat/lsof faults go in the thermal call's env). */
async function device(extra = {}) {
  Object.assign(env, extra);
  dev = await startProc(process.execPath, [FAKE, 'serve'], { env, ready: (s) => s.includes('FAKE_CD_READY') });
  return JSON.parse(readFileSync(env.FAKE_CD_PORTS, 'utf8'));
}
const events = () => (existsSync(env.FAKE_CD_LOG) ? readFileSync(env.FAKE_CD_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const active = () => (existsSync(env.FAKE_CD_STATE) ? JSON.parse(readFileSync(env.FAKE_CD_STATE, 'utf8')).active : null);
const inHold = (args, extra = {}) => nodeAsync(LOCK, ['run', 'iphone', '--owner', 't-thermal', '--', process.execPath, THERMAL, ...args], { env: { ...env, ...extra } });
const holdPhone = () => assert.equal(node(LOCK, ['acquire', 'iphone', '--owner', OWNER, '--ttl', '600'], { env }).code, 0);
const holderFile = () => join(env.FW_STATE_DIR, 'thermal', 'holder.json');

/** Nothing secret in tool output: no tunnel address, no port of the fake, no device id. */
function clean(out, ports) {
  assert.doesNotMatch(out, /::1|fd00|FAKE-UDID/, out);
  for (const p of [ports.rsd, ports.hub]) assert.doesNotMatch(out, new RegExp(`\\b${p}\\b`), out);
}

/** A `set` started directly (the test holds the phone as a user), so it can be signalled. */
function startSet(args = []) {
  const c = spawn(process.execPath, [THERMAL, 'set', 'serious', '--owner', OWNER, ...args], { cwd: REPO, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => (out += d));
  c.stderr.on('data', (d) => (out += d));
  const exited = new Promise((r) => c.on('exit', (code, signal) => r({ code, signal })));
  return { c, out: () => out, exited, until: async (re, ms = 10000) => { const t0 = Date.now(); while (!re.test(out)) { if (Date.now() - t0 > ms) throw new Error(`no ${re} in: ${out}`); await sleep(25); } } };
}

test('I-199: outside a phone hold every command refuses before touching the device; usage errors exit 2', async () => {
  await device();
  for (const cmd of ['probe', 'list', 'status', 'clear']) {
    const r = node(THERMAL, [cmd, '--owner', 'fix-x'], { env });
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /iphone/i);
  }
  assert.equal(events().filter((e) => e.ev !== 'serve').length, 0, 'the device saw nothing');
  for (const args of [[], ['frobnicate'], ['set'], ['set', 'serious', '--hold-seconds', 'x'], ['list', '--timeout', '0']]) {
    const r = node(THERMAL, args, { env });
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
  }
});

test('I-199: probe lists RSD services and does the DTX handshake only; list / status read the groups; ids and the tunnel never printed', async () => {
  const ports = await device();
  let r = await inHold(['probe']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROBE ok: RSD listed 2 services; DTServiceHub answered the capabilities handshake \(3 capabilities; ConditionInducer offered: yes\)$/m);
  clean(r.out, ports);
  const calls = events().filter((e) => e.ev === 'call').map((e) => e.selector);
  assert.deepEqual(calls, ['_notifyOfPublishedCapabilities:'], 'no channel, no condition call');
  assert.ok(events().some((e) => e.ev === 'services'));
  r = await inHold(['list']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ThermalCondition \(Thermal State\)$/m);
  assert.match(r.stdout, /^ {2}ThermalSerious {2}Serious/m);
  clean(r.out, ports);
  r = await inHold(['status']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout.trim(), 'NONE');
  r = await inHold(['list', '--json']);
  const j = JSON.parse(r.stdout);
  assert.equal(j.groups.length, 2);
  assert.equal(j.active, null);
  r = await inHold(['set', 'nominal']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no condition profile "nominal".*ThermalSerious/);
  assert.equal(active(), null);
});

test('I-199: set --hold-seconds enables, holds, then disables (CLEARED); status in between shows ACTIVE and HOLDER', async () => {
  const ports = await device();
  holdPhone();
  const s = startSet(['--hold-seconds', '2']);
  await s.until(/^SET ThermalCondition ThermalSerious/m);
  assert.deepEqual(active() && { group: active().group, profile: active().profile }, { group: 'ThermalCondition', profile: 'ThermalSerious' });
  const st = node(THERMAL, ['status', '--owner', OWNER], { env });
  assert.match(st.stdout, /^ACTIVE ThermalCondition ThermalSerious$/m);
  assert.match(st.stdout, /^HOLDER thermal\.mjs set pid \d+ \(user-thermal-test\) ThermalCondition\/ThermalSerious since \S+ until \S+$/m);
  const second = node(THERMAL, ['set', 'critical', '--owner', OWNER], { env });
  assert.equal(second.code, 1, second.out);
  assert.match(second.stderr, /already holds ThermalCondition\/ThermalSerious.*thermal\.mjs clear/);
  const { code } = await s.exited;
  assert.equal(code, 0, s.out());
  assert.match(s.out(), /^CLEARED ThermalCondition ThermalSerious \(2 s elapsed\)$/m);
  clean(s.out(), ports);
  assert.equal(active(), null);
  assert.equal(existsSync(holderFile()), false);
  assert.ok(events().some((e) => e.selector === 'disableActiveCondition'));
});

test('I-199: SIGTERM ends a set cleanly (CLEARED, exit 0); `clear` stops a running set and then finds nothing active', async () => {
  await device();
  holdPhone();
  let s = startSet();
  await s.until(/^SET /m);
  s.c.kill('SIGTERM');
  let x = await s.exited;
  assert.equal(x.code, 0, s.out());
  assert.match(s.out(), /^CLEARED ThermalCondition ThermalSerious \(SIGTERM\)$/m);
  assert.equal(active(), null);
  s = startSet();
  await s.until(/^SET /m);
  const r = await nodeAsync(THERMAL, ['clear', '--owner', OWNER], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^STOPPED thermal\.mjs set pid \d+ \(user-thermal-test, ThermalCondition\/ThermalSerious\)$/m);
  assert.match(r.stdout, /^NONE no active condition$/m);
  x = await s.exited;
  assert.equal(x.code, 0);
  assert.match(s.out(), /^CLEARED .*\(SIGTERM\)$/m);
  assert.equal(active(), null);
  // a condition set by someone else (Xcode) is cleared by `clear`
  const k = JSON.stringify({ active: { group: 'ThermalCondition', profile: 'ThermalFair', conn: 'xcode' } });
  (await import('node:fs')).writeFileSync(env.FAKE_CD_STATE, k);
  const c2 = await nodeAsync(THERMAL, ['clear', '--owner', OWNER], { env });
  assert.equal(c2.code, 0, c2.out);
  assert.match(c2.stdout, /^CLEARED the active condition$/m);
  assert.equal(active(), null);
});

test('I-199: SIGKILL of a set: its connection closes, the device drops the condition, no process stays; the stale holder file is ignored', async () => {
  await device();
  holdPhone();
  const s = startSet();
  await s.until(/^SET /m);
  const pid = s.c.pid;
  s.c.kill('SIGKILL');
  await s.exited;
  for (let i = 0; i < 100 && active(); i++) await sleep(20);
  assert.equal(active(), null, 'auto-clear on close');
  assert.ok(events().some((e) => e.ev === 'autoclear'));
  assert.throws(() => process.kill(pid, 0));
  assert.equal(existsSync(holderFile()), true, 'a SIGKILL leaves the file');
  const st = node(THERMAL, ['status', '--owner', OWNER], { env });
  assert.equal(st.stdout.trim(), 'NONE', 'a dead holder is not shown');
  const again = startSet(['--hold-seconds', '1']);
  const x = await again.exited;
  assert.equal(x.code, 0, again.out());
});

test('I-199: a set whose connection drops prints LOST and exits 3; an enable error exits 1 and leaves no holder', async () => {
  await device({ FAKE_CD_DROP_MS: '300' });
  holdPhone();
  const s = startSet();
  const x = await s.exited;
  assert.equal(x.code, 3, s.out());
  assert.match(s.out(), /^SET /m);
  assert.match(s.out(), /^LOST .*the device ends the condition$/m);
  assert.equal(active(), null);
  assert.equal(existsSync(holderFile()), false);
  await dev.stop();
  await device({ FAKE_CD_DROP_MS: '', FAKE_CD_ENABLE_ERROR: '1' });
  const r = await nodeAsync(THERMAL, ['set', 'serious', '--owner', OWNER], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /could not be enabled/);
  assert.equal(existsSync(holderFile()), false);
});

test('I-199: tunnel and RSD refusals stop with a plain message (exit 1) and never print the address', async () => {
  const ports = await device();
  holdPhone();
  const t = (extra) => nodeAsync(THERMAL, ['probe', '--owner', OWNER, '--timeout', '2'], { env: { ...env, ...extra } });
  const cases = [
    [{ FAKE_CD_NETSTAT: 'none' }, /no CoreDevice tunnel/],
    [{ FAKE_CD_NETSTAT: 'two' }, /2 CoreDevice tunnels/],
    [{ FAKE_CD_NETSTAT_EXIT: '3' }, /netstat failed/],
    [{ FAKE_CD_LSOF: 'none' }, /no process of yours .* <tunnel>/],
    [{ FAKE_CD_LSOF: 'two' }, /2 addresses behind <tunnel>/],
    [{ FW_THERMAL_LOOPBACK: '' }, /no CoreDevice tunnel/],
  ];
  for (const [extra, re] of cases) {
    const r = await t(extra);
    assert.equal(r.code, 1, `${JSON.stringify(extra)}: ${r.out}`);
    assert.match(r.stderr, re);
    clean(r.out, ports);
  }
  await dev.stop();
  const p2 = await device({ FAKE_CD_RSD_REJECT: '1' });
  let r = await t({});
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /RSD on <tunnel> refused the connection \(HTTP\/2 GOAWAY, error code 11\)/);
  clean(r.out, p2);
  await dev.stop();
  await device({ FAKE_CD_RSD_REJECT: '', FAKE_CD_NO_HUB: '1' });
  r = await t({});
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /lists 1 services but not com\.apple\.instruments\.dtservicehub/);
  await dev.stop();
  await device({ FAKE_CD_NO_HUB: '', FAKE_CD_NO_CAPS: '1' });
  r = await t({});
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no capabilities from the device within 2 s/);
});

test('I-233: a condition another client holds survives disableActiveCondition (the device answers "nothing active"): clear says ACTIVE held by another client, takes it over and ends it; if that fails too, exit 4 and still ACTIVE', async () => {
  const ports = await device({ FAKE_CD_FOREIGN_DISABLE: 'nserror' });
  holdPhone();
  const { writeFileSync } = await import('node:fs');
  const xcodeOn = () => writeFileSync(env.FAKE_CD_STATE, JSON.stringify({ active: { group: 'ThermalCondition', profile: 'ThermalSerious', conn: 'xcode' } }));
  xcodeOn();
  let r = await nodeAsync(THERMAL, ['clear', '--owner', OWNER], { env });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /^NONE/m, 'never NONE while the list shows it ACTIVE (P-158 03:09Z)');
  assert.match(r.stdout, /^ACTIVE ThermalCondition ThermalSerious held by another client \(e\.g\. Xcode\): disableActiveCondition answered an error \(.*No active condition.*\) and it is still on; taking it over to end it \(I-233\)$/m);
  assert.match(r.stdout, /^CLEARED ThermalCondition ThermalSerious \(taken over from another client, then disabled\)$/m);
  assert.equal(active(), null);
  const sel = events().filter((e) => e.ev === 'call' && /^(enable|disable|available)/.test(e.selector)).map((e) => e.selector);
  assert.deepEqual(sel, ['disableActiveCondition', 'availableConditionInducers', 'enableConditionWithIdentifier:profileIdentifier:', 'disableActiveCondition', 'availableConditionInducers'], 'disable, re-read, take over, disable, re-read');
  clean(r.out, ports);
  // the takeover's enable is refused too: still ACTIVE, exit 4, the line says where to stop it
  await dev.stop();
  await device({ FAKE_CD_ENABLE_ERROR: '1' });
  xcodeOn();
  r = await nodeAsync(THERMAL, ['clear', '--owner', OWNER], { env });
  assert.equal(r.code, 4, r.out);
  assert.match(r.stdout, /^TAKEOVER-FAILED /m);
  assert.match(r.stdout, /^ACTIVE ThermalCondition ThermalSerious held by another client: clear could not end it; stop it where it was started \(Xcode > Devices and Simulators > Device Conditions > Stop\)$/m);
  assert.equal(active()?.conn, 'xcode');
});

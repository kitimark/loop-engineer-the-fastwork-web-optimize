// I-225: `iphone.mjs rearm` end to end without the phone: the thermal reads are tests/fixtures/fake-thermal.mjs (a read
// sequence, FAKE_THERMAL_SEQ), the condition is tests/fixtures/fake-coredevice.mjs behind the real tools/thermal.mjs
// (clear, then a detached `set serious` that outlives rearm), $FW_STATE_DIR a temp dir (locks, ledgers, console steps,
// the set's holder file). And `iphone.mjs profile --condition tool`: no user step, a pointer to rearm. Never the real
// phone, tunnel, locks or console store.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, FIXTURES, TESTS } from '../helpers.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs'), THERMAL = tool('thermal.mjs'), CONSOLE = tool('console.mjs'), FAKE = join(FIXTURES, 'fake-coredevice.mjs');
const OWNER = 'user-rearm-test'; // a user lease: the test may hold the phone directly
let base, env, dir, dev;

before(async () => {
  base = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '1', FW_NO_CAFFEINATE: '1',
    FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FW_NETSTAT: FAKE, FW_LSOF: FAKE, FW_THERMAL_LOOPBACK: '1', FW_REARM_PROBE_MS: '100' };
});
beforeEach(() => {
  dir = tempDir('fw-rearm-e2e-');
  env = { ...base, FW_STATE_DIR: join(dir, 'fw'), FW_IDEVICEDIAGNOSTICS: join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs'),
    FAKE_CD_STATE: join(dir, 'device.json'), FAKE_CD_LOG: join(dir, 'device.log'), FAKE_CD_PORTS: join(dir, 'ports.json'),
    FAKE_THERMAL_SEQ: join(dir, 'seq.txt'), FAKE_THERMAL_LOG: join(dir, 'thermal.jsonl') };
});
afterEach(async () => {
  // end a set rearm left running (it outlives rearm by design), then the fake phone
  if (dev) { await nodeAsync(THERMAL, ['clear', '--owner', OWNER], { env }); await dev.stop(); }
  dev = null;
});

async function device() {
  dev = await startProc(process.execPath, [FAKE, 'serve'], { env, ready: (s) => s.includes('FAKE_CD_READY') });
  return JSON.parse(readFileSync(env.FAKE_CD_PORTS, 'utf8'));
}
const events = () => (existsSync(env.FAKE_CD_LOG) ? readFileSync(env.FAKE_CD_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const active = () => (existsSync(env.FAKE_CD_STATE) ? JSON.parse(readFileSync(env.FAKE_CD_STATE, 'utf8')).active : null);
const reads = () => (existsSync(env.FAKE_THERMAL_LOG) ? readFileSync(env.FAKE_THERMAL_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.cmd === 'record').length : 0);
const holdPhone = () => assert.equal(node(LOCK, ['acquire', 'iphone', '--owner', OWNER, '--ttl', '600'], { env }).code, 0);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const rearm = (...a) => nodeAsync(IPHONE, ['rearm', '--owner', OWNER, '--settle', '0', ...a], { env, timeout: 90000 });
const rmCounter = () => rmSync(`${env.FAKE_THERMAL_SEQ}.n`, { force: true }); // the sequence starts over
const steps = () => JSON.parse(node(CONSOLE, ['list', '--all', '--json'], { env }).stdout);

test('I-225 rearm: Xcode\'s Serious on, the phone Critical above it: clear, plain reads until Nominal, set serious (left running), the profile read passes -> exit 0, no user step', async () => {
  const ports = await device();
  writeFileSync(env.FAKE_CD_STATE, JSON.stringify({ active: { group: 'ThermalCondition', profile: 'ThermalSerious', conn: 'xcode' } }));
  writeFileSync(env.FAKE_THERMAL_SEQ, ['Critical Yes 34.5 Serious', 'Critical No 34.09', 'Serious No 34.09', 'Nominal No 34.19', 'Serious Yes 34.2 Serious'].join('\n'));
  holdPhone();
  const r = await rearm();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REARM start: phone is Critical \(Xcode condition Serious\), battery 34\.5 C \(gate xcode-serious code 3, reason phone-above-condition\)/m);
  assert.match(r.stdout, /^REARM CLEAR CLEARED the active condition$/m);
  assert.match(r.stdout, /^REARM PROBE 3 \(0 min after the clear\): phone is Nominal, battery 34\.19 C: clear/m);
  assert.match(r.stdout, /^REARM SET SET ThermalCondition ThermalSerious .*\(thermal\.mjs set pid (\d+), log .*set-user-rearm-test\.log; it holds the condition until node tools\/thermal\.mjs clear --owner user-rearm-test\)$/m);
  assert.match(r.stdout, /^REARM CLEARED: phone is Serious \(induced by thermal\.mjs\), battery 34\.2 C; the condition stays set by thermal\.mjs \(pid \d+\) \(exit 0\)$/m); // I-233: the holder named
  assert.equal(reads(), 5);
  // the condition is ours now and held after rearm exited
  assert.deepEqual(active() && [active().group, active().profile], ['ThermalCondition', 'ThermalSerious']);
  assert.notEqual(active().conn, 'xcode');
  const pid = Number(r.stdout.match(/thermal\.mjs set pid (\d+)/)[1]);
  assert.ok(alive(pid), 'the set outlives rearm');
  const sel = events().filter((e) => e.ev === 'call').map((e) => e.selector);
  assert.ok(sel.indexOf('disableActiveCondition') >= 0 && sel.indexOf('disableActiveCondition') < sel.indexOf('enableConditionWithIdentifier:profileIdentifier:'), sel.join(', '));
  assert.doesNotMatch(r.out, /::1|FAKE-UDID/);
  for (const p of [ports.rsd, ports.hub]) assert.doesNotMatch(r.out, new RegExp(`\\b${p}\\b`));
  assert.deepEqual(steps(), [], 'no console step');
  // a second rearm on a phone that fits: NOT-NEEDED, the set untouched
  const r2 = await rearm();
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.stdout, /^REARM NOT-NEEDED: /m);
  assert.ok(alive(pid));
});

test('I-225 rearm: still Critical after the settle exits 8 (the set stays, the line says how to end it); no clear read within --max-wait exits 13 and sets nothing; outside a phone hold it refuses; --profile fair is a usage error', async () => {
  await device();
  writeFileSync(env.FAKE_THERMAL_SEQ, ['Critical Yes 34.5 Serious', 'Fair No 34', 'Critical Yes 34.5 Serious'].join('\n'));
  // outside the phone hold: refused before any read
  let r = await rearm();
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /iphone/i);
  assert.equal(reads(), 0);
  r = await nodeAsync(IPHONE, ['rearm', '--owner', OWNER, '--profile', 'fair'], { env });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /rearm re-arms the serious profile only/);
  holdPhone();
  r = await rearm();
  assert.equal(r.code, 8, r.out);
  assert.match(r.stdout, /^REARM STILL-CRITICAL: REFUSED profile serious .*reason phone-above-condition, I-186\); the condition stays set by thermal\.mjs \(pid \d+; end it: node tools\/thermal\.mjs clear --owner user-rearm-test\) \(exit 8\)$/m);
  assert.equal(active()?.profile, 'ThermalSerious');
  // timeout: cleared, never Nominal/Fair; nothing set
  writeFileSync(env.FAKE_THERMAL_SEQ, ['Critical Yes 36 Serious', 'Critical No 36'].join('\n'));
  rmCounter();
  r = await rearm('--max-wait', '0.3');
  assert.equal(r.code, 13, r.out);
  assert.match(r.stdout, /^REARM TIMEOUT: the phone did not read Nominal or Fair with no condition within 0 min of the clear \(last: Critical, battery 36 C\); nothing set/m);
  assert.match(r.stdout, /^REARM CLEAR STOPPED thermal\.mjs set pid \d+ .*$/m, 'the clear stopped the earlier rearm\'s set');
  assert.equal(active(), null, 'no condition on');
  assert.equal(existsSync(join(env.FW_STATE_DIR, 'thermal', 'holder.json')), false);
});

test('I-225 profile --condition tool (or FW_PHONE_CONDITION=tool): the misfit refuses (exit 8) with the pointer to rearm and posts no user step; the Xcode mode still posts one', async () => {
  writeFileSync(env.FAKE_THERMAL_SEQ, 'Critical Yes 34.5 Serious\n');
  holdPhone();
  let r = node(IPHONE, ['profile', '--owner', OWNER, '--condition', 'tool'], { env, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^REFUSED profile serious .*reason phone-above-condition, I-186\)$/m);
  assert.match(r.stderr, /^REARM the thermal tool fixes it \(no user step\): node tools\/iphone\.mjs rearm --owner user-rearm-test /m);
  r = node(IPHONE, ['profile', '--owner', OWNER], { env: { ...env, FW_PHONE_CONDITION: 'tool' }, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^REARM the thermal tool fixes it/m);
  assert.deepEqual(steps(), []);
  r = node(IPHONE, ['profile', '--owner', OWNER, '--condition', 'both'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /--condition must be xcode .* or tool/);
  r = node(IPHONE, ['profile', '--owner', OWNER], { env, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^STEP C-\d+ posted on the user console/m);
});

test('I-233 tool mode with Xcode\'s Serious left on (P-158 03:07Z): profile --condition tool refuses (condition-not-ours), rearm takes it over (no NOT-NEEDED) and the condition is ours after; the Xcode mode still passes it', async () => {
  await device({ FAKE_CD_FOREIGN_DISABLE: 'nserror' });
  writeFileSync(env.FAKE_CD_STATE, JSON.stringify({ active: { group: 'ThermalCondition', profile: 'ThermalSerious', conn: 'xcode' } }));
  writeFileSync(env.FAKE_THERMAL_SEQ, 'Serious Yes 34 Serious\n');
  holdPhone();
  let r = node(IPHONE, ['profile', '--owner', OWNER], { env, timeout: 30000 });
  assert.equal(r.code, 0, `the Xcode mode accepts Xcode's condition: ${r.out}`);
  assert.match(r.stdout, /^PROFILE serious ok .*phone is Serious \(induced by Xcode\)/m);
  r = node(IPHONE, ['profile', '--owner', OWNER, '--condition', 'tool'], { env, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^REFUSED profile serious \(Serious, induced by thermal\.mjs\): phone is Serious \(induced by Xcode\), battery 34 C; the Serious condition is held by Xcode, not by our thermal\.mjs set: .*\(gate xcode-serious code 0, reason condition-not-ours, I-186\)$/m);
  assert.match(r.stderr, /^REARM the thermal tool fixes it/m);
  r = await rearm();
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /NOT-NEEDED/);
  assert.match(r.stdout, /^REARM TAKEOVER: phone is Serious \(induced by Xcode\), battery 34 C, but the condition is not ours/m);
  assert.match(r.stdout, /^REARM CLEARED: phone is Serious \(induced by thermal\.mjs\), battery 34 C/m);
  assert.notEqual(active()?.conn, 'xcode');
  assert.equal(active()?.profile, 'ThermalSerious');
  // now ours: the tool-mode gate passes and names the holder
  r = node(IPHONE, ['profile', '--owner', OWNER, '--condition', 'tool'], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /phone is Serious \(induced by thermal\.mjs\)/);
});

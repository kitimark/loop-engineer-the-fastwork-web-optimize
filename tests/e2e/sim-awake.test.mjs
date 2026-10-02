// I-070 (user C-024: "Keep awake only during measurements"): a Simulator session is a measurement (its memory counts
// too, functional included), so `sim.mjs session` keeps the Mac awake for its own lifetime (caffeinate -i -s -w <its
// pid>, lib/awake.mjs keepAwakeFor), whatever hold wraps it: a --shared slot keeps nothing awake by itself, the session
// does. Fakes only, as in sim.test.mjs (no Simulator boots, no phone); a fake caffeinate ($FW_CAFFEINATE) logs argv + pid.
// Its own file so it never collides with sim.test.mjs edits (ts-i063, I-063).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, sleep } from '../helpers.mjs';

const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs');
const FX = (n) => join(TESTS, 'fixtures', n);
const PHONE = '00008130-0011223344556677'; // made up, the shape of a real iPhone UDID
const RUNTIME = { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77', isAvailable: true, platform: 'iOS' };
let dir, env;

function wrapper(name, script, pre = []) {
  const f = join(dir, 'bin', name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${pre.map((x) => `"${x}"`).join(' ')} "$@"\n`);
  chmodSync(f, 0o755);
  return f;
}
beforeEach(async () => {
  dir = tempDir('fw-simawake-');
  writeFileSync(join(dir, 'simctl.json'), JSON.stringify({ runtimes: [RUNTIME], devices: [] }));
  env = {
    FW_STATE_DIR: join(dir, 'state'),
    FW_SIMCTL: wrapper('simctl', FX('fake-simctl.mjs')), FW_IWDP: wrapper('iwdp', FX('fake-iwdp.mjs')),
    FW_LSOF: wrapper('lsof', FX('fake-sim-tools.mjs'), ['lsof']), FW_IDEVICE_ID: wrapper('idevice_id', FX('fake-sim-tools.mjs'), ['idevice_id']),
    FW_OPEN: wrapper('open', FX('fake-sim-tools.mjs'), ['open']), FW_OSASCRIPT: wrapper('osascript', FX('fake-sim-tools.mjs'), ['osascript']),
    FAKE_SIMCTL_STATE: join(dir, 'simctl.json'), FAKE_SIMCTL_LOG: join(dir, 'simctl.jsonl'), FAKE_IWDP_LOG: join(dir, 'iwdp.jsonl'), FAKE_SIMTOOLS_LOG: join(dir, 'tools.jsonl'),
    FAKE_MACAPP_STATE: join(dir, 'app'), FAKE_IDEVICE_IDS: PHONE, FAKE_IWDP_PHONES: PHONE,
    FW_SIM_DEVICE_PORT: String(await freePort()), FW_SIM_PORT: String(await freePort()), FW_SIM_WDA_PORT: String(await freePort()),
    FW_CAFFEINATE: FX('fake-caffeinate.mjs'), FAKE_CAFFEINATE_LOG: join(dir, 'caffeinate.jsonl'),
    FW_SIM_IDLE_SEC: '0', // I-063: no warm device (and no detached keeper) after the functional session; review-i063
    FW_LOCK_SHARED_JOIN_LOAD: '1000', FW_LOCK_SHARED_JOIN_BUSY: '100',
  };
});
const calls = () => (existsSync(env.FAKE_CAFFEINATE_LOG) ? readFileSync(env.FAKE_CAFFEINATE_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const until = async (f) => { for (let i = 0; i < 100 && !f(); i++) await sleep(50); return f(); };

test('I-070 (C-024): sim.mjs session keeps the Mac awake for its own lifetime (-i -s -w <session pid>): in a --shared slot only the session\'s assertion, in a timing hold the hold\'s too; all gone after', async () => {
  assert.equal(node(SIM, ['setup'], { env }).code, 0);
  assert.equal(node(LOCK, ['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env }).code, 0);
  const out = join(dir, 'pid.json');
  const child = [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ session: process.ppid }))`];
  // a functional session in a shared reader slot: the slot keeps nothing awake, the session does
  let r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--shared', '--weight', 'simulator', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--functional', '--owner', 'me', '--window', 'hidden', '--', ...child], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  const { session } = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(calls().length, 1, `one assertion, the session's: ${JSON.stringify(calls().map((c) => c.args))}`);
  assert.deepEqual(calls()[0].args, ['-i', '-s', '-w', String(session)]);
  assert.ok(await until(() => !alive(calls()[0].pid)), 'gone with the session');
  // a session in a normal (timing) hold: the hold's assertion (-w lock.mjs run) and the session's
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', '--', ...child], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  const two = calls().slice(1);
  assert.equal(two.length, 2, JSON.stringify(two.map((c) => c.args)));
  assert.ok(two.some((c) => c.args.join(' ') === `-i -s -w ${JSON.parse(readFileSync(out, 'utf8')).session}`), 'the session\'s own');
  for (const c of two) assert.ok(await until(() => !alive(c.pid)), `gone after the hold: ${c.args.join(' ')}`);
});

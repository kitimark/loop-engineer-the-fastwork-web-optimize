// Incident I-100: `sim.mjs session [--functional] --reduce-motion on|off -- <cmd>` end to end on fakes only (no
// Simulator, no phone): the fake simctl keeps the device's defaults (spawn defaults read/write/delete) and the fake
// Safari page's matchMedia('(prefers-reduced-motion: reduce)') follows them (tests/fixtures/fake-run-dom.mjs).
// Covers: set before Safari launches, recorded in the session record, open's page check, `sim.mjs reduce-motion`,
// the restore at the end (also after a failed <cmd> and a signal), a record left by a killed session restored by the
// next session / doctor --fix, a failed restore (kept for the next session, device not kept warm), bad values refused.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, TESTS, killFixtures } from '../helpers.mjs';

const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs');
const FX = (n) => join(TESTS, 'fixtures', n);
const PHONE = '00008130-0011223344556677'; // made up
const RUNTIME = { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77', isAvailable: true, platform: 'iOS' };
const DOM = 'com.apple.Accessibility', KEY = 'ReduceMotionEnabled';
let dir, env;
let fixturesSince = 0;
beforeEach(() => { fixturesSince = Date.now(); });
afterEach(() => { killFixtures({ since: fixturesSince }); });

function wrapper(name, script, pre = []) {
  const f = join(dir, 'bin', name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${pre.map((x) => `"${x}"`).join(' ')} "$@"\n`);
  chmodSync(f, 0o755);
  return f;
}
beforeEach(async () => {
  dir = tempDir('fw-simrm-');
  writeFileSync(join(dir, 'simctl.json'), JSON.stringify({ runtimes: [RUNTIME], devices: [] }));
  const xcb = join(dir, 'bin', 'xcodebuild');
  wrapper('x', FX('fake-sim-tools.mjs'));
  writeFileSync(xcb, `#!/bin/sh\nif [ "$1" = "-version" ]; then echo "Xcode 26.6"; echo "Build version 17F113"; exit 0; fi\nexec "${process.execPath}" "${FX('fake-xcodebuild.mjs')}" "$@"\n`); chmodSync(xcb, 0o755);
  env = {
    FW_STATE_DIR: join(dir, 'state'),
    FW_SIMCTL: wrapper('simctl', FX('fake-simctl.mjs')), FW_IWDP: wrapper('iwdp', FX('fake-iwdp.mjs')),
    FW_LSOF: wrapper('lsof', FX('fake-sim-tools.mjs'), ['lsof']), FW_IDEVICE_ID: wrapper('idevice_id', FX('fake-sim-tools.mjs'), ['idevice_id']),
    FW_OPEN: wrapper('open', FX('fake-sim-tools.mjs'), ['open']), FW_OSASCRIPT: wrapper('osascript', FX('fake-sim-tools.mjs'), ['osascript']), FW_XCODEBUILD: xcb,
    FAKE_SIMCTL_STATE: join(dir, 'simctl.json'), FAKE_SIMCTL_LOG: join(dir, 'simctl.jsonl'), FAKE_IWDP_LOG: join(dir, 'iwdp.jsonl'), FAKE_SIMTOOLS_LOG: join(dir, 'tools.jsonl'),
    FAKE_MACAPP_STATE: join(dir, 'app'), FAKE_IDEVICE_IDS: PHONE, FAKE_IWDP_PHONES: PHONE,
    FW_SIM_DEVICE_PORT: String(await freePort()), FW_SIM_PORT: String(await freePort()), FW_SIM_WDA_PORT: String(await freePort()),
    FW_SIM_IDLE_SEC: '0', FW_SIM_LEAK_WAIT_SEC: '0',
  };
});

const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const state = () => JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8'));
const device = () => state().devices[0];
const devSet = (o) => { const st = state(); Object.assign(st.devices[0], o); writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st, null, 1)); };
/** The fake device's Reduce Motion: true / false / undefined (key absent). */
const rm = () => device().defaults?.[DOM]?.[KEY];
const setRm = (v) => { const d = device(); const defs = d.defaults || {}; defs[DOM] = { ...(defs[DOM] || {}) }; if (v === undefined) delete defs[DOM][KEY]; else defs[DOM][KEY] = v; devSet({ defaults: defs }); };
const simDir = () => join(env.FW_STATE_DIR, 'sim');
const pendingF = () => join(simDir(), 'reduce-motion.json');
const setup = () => { const r = node(SIM, ['setup'], { env }); assert.equal(r.code, 0, r.out); return device().udid; };
const sess = (sessArgs, cmd, { e = env, lockArgs = [] } = {}) => nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', ...lockArgs, '--', process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', ...sessArgs, '--', ...cmd], { env: e, timeout: 110000 });
const sh = (s) => ['sh', '-c', s];
const N = `"${process.execPath}"`, S_ = `"${SIM}"`;
const url = () => `http://127.0.0.1:${env.FW_SIM_PORT}/`;
const copySession = (to) => `${N} -e "require('fs').copyFileSync('${join(simDir(), 'session.json')}', '${to}')"`;
function noIds(text, udid) { for (const id of [PHONE, udid]) assert.ok(!text.toLowerCase().includes(id.toLowerCase()), `an id leaked: ${text}`); }
const spawnCalls = () => lines(env.FAKE_SIMCTL_LOG).filter((a) => a[0] === 'spawn').map((a) => a.slice(2).join(' '));

test('I-100 --reduce-motion on: set before Safari launches, recorded, the page reports reduce (open + reduce-motion), restored to unset at the end', async () => {
  const udid = setup();
  const rec = join(dir, 'rec.json');
  const r = await sess(['--functional', '--reduce-motion', 'on'], sh(`${copySession(rec)} && ${N} ${S_} open "${url()}" --out "${join(dir, 'o.png')}" && ${N} ${S_} reduce-motion; echo "RM_EXIT $?"`), { lockArgs: ['--shared', '--weight', 'simulator', '--max-seconds', '100'] });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /^REDUCE_MOTION on: the Simulator's Reduce Motion is on \(was unset \(off\)\); restored at the end of this session \(I-100\)$/m);
  assert.match(r.stdout, /^REDUCE_MOTION page reduce \(session --reduce-motion on\): ok$/m, 'open checks the page');
  assert.match(r.stdout, /^REDUCE_MOTION setting on, page reduce \(session --reduce-motion on\): ok\nRM_EXIT 0$/m);
  assert.match(r.stdout, /^cleanup: Reduce Motion restored to unset \(off\) \(I-100\)$/m);
  const s = JSON.parse(readFileSync(rec, 'utf8'));
  assert.deepEqual(s.reduceMotion, { requested: 'on', previous: null, value: true });
  // the order: written after Safari was terminated and before it launched; restored before the shutdown
  const calls = lines(env.FAKE_SIMCTL_LOG).map((a) => (a[0] === 'spawn' ? `spawn ${a[3]}` : a[0])).filter((c) => !['list', 'create', 'io', 'openurl'].includes(c));
  assert.deepEqual(calls, ['boot', 'bootstatus', 'terminate', 'get_app_container', 'spawn read', 'spawn write', 'spawn read', 'launch', 'spawn read', 'spawn delete', 'spawn read', 'shutdown']);
  assert.equal(rm(), undefined, 'back to unset');
  assert.ok(!existsSync(pendingF()), 'no pending record left');
  assert.equal(device().state, 'Shutdown');
});

test('I-100 --reduce-motion off over a device left on: the page reports no-preference, then the device is on again (its previous value)', async () => {
  setup();
  devSet({ state: 'Booted' }); setRm(true); devSet({ state: 'Shutdown' });
  const r = await sess(['--reduce-motion', 'off'], sh(`${N} ${S_} open "${url()}" --out "${join(dir, 'o.png')}" && ${N} ${S_} reduce-motion`));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REDUCE_MOTION off: the Simulator's Reduce Motion is off \(was on\)/m);
  assert.match(r.stdout, /^REDUCE_MOTION page no-preference \(session --reduce-motion off\): ok$/m);
  assert.match(r.stdout, /^cleanup: Reduce Motion restored to on \(I-100\)$/m);
  assert.equal(rm(), true);
});

test('I-100 without --reduce-motion: no defaults call at all; reduce-motion reports and exits 0; open says nothing about it', async () => {
  setup();
  const r = await sess([], sh(`${N} ${S_} open "${url()}" --out "${join(dir, 'o.png')}" && ${N} ${S_} reduce-motion`));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REDUCE_MOTION setting unset \(off\), page no-preference \(session without --reduce-motion: not checked\)$/m);
  assert.ok(!/REDUCE_MOTION page/.test(r.stdout), 'open checks only a session that set it');
  assert.deepEqual(spawnCalls(), ['defaults read com.apple.Accessibility ReduceMotionEnabled'], 'only the reduce-motion command read it');
});

test('I-100 the page disagrees: open fails with MISMATCH, reduce-motion exits 3, and the session still restores', async () => {
  setup();
  const e = { ...env, FAKE_PAGE_IGNORES_RM: '1' };
  let r = await sess(['--reduce-motion', 'on'], sh(`${N} ${S_} reduce-motion; echo "RM_EXIT $?"; ${N} ${S_} open "${url()}" --out "${join(dir, 'o.png')}"`), { e });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^REDUCE_MOTION setting on, page no-preference \(session --reduce-motion on\): MISMATCH: the page should report reduce \(I-100\)\nRM_EXIT 3$/m);
  assert.match(r.stderr, /REDUCE_MOTION page no-preference \(session --reduce-motion on\): MISMATCH/);
  assert.equal(rm(), undefined);
  assert.ok(!existsSync(pendingF()));
  // the <cmd> fails (exit 7): restored all the same
  r = await sess(['--reduce-motion', 'on'], sh('exit 7'));
  assert.equal(r.code, 7, r.out);
  assert.match(r.stdout, /^cleanup: Reduce Motion restored to unset \(off\) \(I-100\)$/m);
  assert.equal(rm(), undefined);
});

test('I-100 a bad or missing value is refused before anything boots; reduce-motion outside a session is refused', async () => {
  setup();
  for (const args of [['--reduce-motion', 'yes'], ['--reduce-motion'], ['--reduce-motion=']]) {
    const r = await sess(args, ['true']);
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.stderr, /--reduce-motion takes on or off/);
  }
  assert.ok(!lines(env.FAKE_SIMCTL_LOG).some((a) => a[0] === 'boot'), 'nothing booted');
  const r = node(SIM, ['reduce-motion'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
});

test('I-100 a record left by a killed session: status and doctor show it; the next session restores it before Safari launches; doctor --fix restores it on a booted device', async () => {
  setup();
  // a session that set it on and was killed (SIGKILL: no cleanup): the record and the setting stay
  const left = (state) => { devSet({ state: 'Booted' }); setRm(true); devSet({ state }); writeFileSync(pendingF(), JSON.stringify({ session: 'deadbeef0001', owner: 'gone', device: 'fw-sim', previous: false, set: true, at: '2026-10-04T00:00:00.000Z' })); };
  mkdirSync(simDir(), { recursive: true });
  left('Shutdown');
  const line = /Reduce Motion left on by session deadbeef0001 \(owner gone, fw-sim\) at 2026-10-04T00:00:00\.000Z: the next fw-sim session restores it to off \(I-100\)/;
  assert.match(node(SIM, ['status'], { env }).stdout, line);
  let d = node(SIM, ['doctor'], { env });
  assert.match(d.stdout, line);
  assert.equal(d.code, 0, 'a pending record alone is no leak');
  let r = await sess([], ['true']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REDUCE_MOTION restored to off: session deadbeef0001 \(owner gone\) set it on and did not restore it \(I-100\)$/m);
  assert.equal(rm(), false);
  assert.ok(!existsSync(pendingF()));
  const calls = lines(env.FAKE_SIMCTL_LOG).map((a) => (a[0] === 'spawn' ? `spawn ${a[3]}` : a[0])).filter((c) => !['list', 'create'].includes(c));
  assert.ok(calls.indexOf('spawn write') < calls.indexOf('launch'), `restored before Safari launched: ${calls}`);
  // the killed session left its device booted (a leak): doctor --fix restores, then shuts down
  left('Booted');
  d = node(SIM, ['doctor', '--fix'], { env });
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^Reduce Motion restored to off \(left on by session deadbeef0001\) \(I-100\)$/m);
  assert.equal(device().state, 'Shutdown');
  assert.equal(rm(), false);
  assert.ok(!existsSync(pendingF()));
  // another device's record is left for that device
  writeFileSync(pendingF(), JSON.stringify({ session: 'deadbeef0002', owner: 'gone', device: 'fw-ipad', previous: null, set: true, at: '2026-10-04T00:00:00.000Z' }));
  r = await sess([], ['true']);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(pendingF()), 'fw-ipad\'s record stays');
});

test('I-100 a failed restore keeps the record, and the device is not kept warm; the next session restores it', async () => {
  setup();
  const e = { ...env, FW_SIM_IDLE_SEC: '300' };
  const r = await sess(['--functional', '--reduce-motion', 'on'], [process.execPath, '-e', `const f=${JSON.stringify(env.FAKE_SIMCTL_STATE)};const s=JSON.parse(require('fs').readFileSync(f,'utf8'));s.devices[0].defaultsFail=true;require('fs').writeFileSync(f,JSON.stringify(s))`],
    { e, lockArgs: ['--shared', '--weight', 'simulator', '--max-seconds', '100'] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^cleanup: Reduce Motion restore failed \(.*\): the record stays and the next fw-sim session restores it; not keeping fw-sim booted \(I-100\)$/m);
  assert.equal(device().state, 'Shutdown', 'shut down, not kept warm');
  assert.ok(!existsSync(join(simDir(), 'warm.json')));
  assert.ok(existsSync(pendingF()));
  assert.equal(rm(), true);
  devSet({ defaultsFail: false });
  const r2 = await sess([], ['true']);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.stdout, /^REDUCE_MOTION restored to unset \(off\): session [0-9a-f]{12} \(owner me\) set it on and did not restore it \(I-100\)$/m);
  assert.equal(rm(), undefined);
});

test('I-100 a session stopped by SIGTERM restores in its cleanup', async () => {
  setup();
  const marker = join(dir, 'ready');
  const p = sess(['--reduce-motion', 'on'], sh(`touch "${marker}"; sleep 30`));
  const t0 = Date.now();
  while (!existsSync(marker) && Date.now() - t0 < 30000) await new Promise((res) => setTimeout(res, 100));
  assert.ok(existsSync(marker), 'the command started');
  assert.equal(rm(), true);
  const sessRec = JSON.parse(readFileSync(join(simDir(), 'session.json'), 'utf8'));
  process.kill(sessRec.pid, 'SIGTERM');
  const r = await p;
  assert.notEqual(r.code, 0);
  assert.match(r.stdout, /^cleanup: Reduce Motion restored to unset \(off\) \(I-100\)$/m);
  assert.equal(rm(), undefined);
  assert.ok(!existsSync(pendingF()));
});

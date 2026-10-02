// Incident I-063 end to end on fakes only (no Simulator is ever booted, no phone touched; the fakes of
// tests/e2e/sim.test.mjs): a functional sim session keeps fw-sim booted for the next one (warm.json + a detached keeper),
// the next session takes it over without a boot, the keeper shuts it down at its idle timeout or when chrome-measure
// gets a timing holder, never while a session holds the simulator lock; `sim.mjs shutdown [--warm-only]`, doctor,
// status; the timed tools' backstop (verify.mjs, phone runs asking for a quiet Mac).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, run, tool, freePort, TESTS, sleep } from '../helpers.mjs';

const SIM = tool('sim.mjs'), LOCK = tool('lock.mjs'), VERIFY = tool('verify.mjs');
const FX = (n) => join(TESTS, 'fixtures', n);
const PHONE = '00008130-0011223344556677'; // made up
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
  dir = tempDir('fw-simwarm-');
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
    FW_SIM_IDLE_SEC: '300', FW_SIM_KEEPER_POLL_MS: '150',
  };
});
// never leave a keeper behind (it would exit by itself once the temp dir is gone)
afterEach(() => { const k = keeper(); if (k) { try { process.kill(k.pid, 'SIGKILL'); } catch {} } });

const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const simctlCalls = () => lines(env.FAKE_SIMCTL_LOG).map((a) => a[0]).filter((c) => c !== 'list' && c !== 'create');
const device = () => JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')).devices[0];
const simDir = () => join(env.FW_STATE_DIR, 'sim');
const readJ = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const warm = () => readJ(join(simDir(), 'warm.json'));
const keeper = () => (env ? readJ(join(simDir(), 'keeper.pid.json')) : null);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const setup = () => { const r = node(SIM, ['setup'], { env }); assert.equal(r.code, 0, r.out); return device().udid; };
async function until(fn, ms = 10000, what = 'condition') { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(50); } assert.fail(`timed out waiting for ${what}`); }
const sessOut = () => join(dir, 'sess.json');
const probe = () => `require('fs').writeFileSync(${JSON.stringify(sessOut())}, require('fs').readFileSync(${JSON.stringify(join(env.FW_STATE_DIR, 'sim', 'session.json'))}, 'utf8'))`;
/** a functional session in the shared lane (switch off: an exclusive short job) */
const fn = (e = env) => nodeAsync(LOCK, ['run', 'chrome-measure', '--shared', '--weight', 'simulator', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--functional', '--owner', 'me', '--window', 'hidden', '--', process.execPath, '-e', probe()], { env: e, timeout: 90000 });
function noIds(text, udid) { for (const id of [PHONE, udid]) assert.ok(!text.toLowerCase().includes(id.toLowerCase()), `an id leaked: ${text}`); }

test('I-063: a functional session keeps fw-sim booted (Safari quit, warm.json mode 600, keeper); status / lock status / doctor show it; the next session reuses it without a boot (Safari reset); sim.mjs shutdown ends it', async () => {
  const udid = setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /cleanup: fw-sim kept booted for the next session \(I-063\): Safari quit; shuts down at \S+ \(idle 300 s, FW_SIM_IDLE_SEC\)/);
  assert.deepEqual(simctlCalls(), ['boot', 'bootstatus', 'terminate', 'get_app_container', 'launch', 'terminate'], 'booted once, Safari quit at the end, no shutdown');
  assert.deepEqual([device().state, !!device().safari], ['Booted', false]);
  let s1 = readJ(sessOut());
  assert.deepEqual([s1.boot.mode, s1.boot.sessionsOnBoot], ['cold', 1]);
  const w1 = warm();
  assert.equal(statSync(join(simDir(), 'warm.json')).mode & 0o777, 0o600);
  assert.deepEqual([w1.udid, w1.runtimeId, w1.sessions, w1.lastOwner, w1.idleSec], [udid, RUNTIME.identifier, 1, 'me', 300]);
  assert.ok(Date.parse(w1.idleUntil) - Date.parse(w1.lastSessionEndedAt) === 300000);
  const k1 = keeper();
  assert.ok(k1 && alive(k1.pid), 'the keeper runs');
  assert.ok(!existsSync(join(simDir(), 'session.json')) && !existsSync(join(simDir(), 'proxy.pid.json')), 'session over, proxy stopped');
  const st = node(SIM, ['status'], { env });
  assert.match(st.stdout, /^warm: {5}fw-sim booted, idle \d+ s since the session of "me" \(1 session\(s\) on this boot since \S+\); shuts down by \S+ or when a timing hold is queued; keeper pid \d+$/m);
  assert.match(st.stdout, /^keeper {4}running pid \d+/m);
  noIds(st.out, udid);
  assert.match(node(LOCK, ['status', 'simulator', '--no-host'], { env }).stdout, /^simulator +free\n +warm: fw-sim booted, idle/m, 'lock.mjs status shows the warm device under simulator');
  const doc = node(SIM, ['doctor'], { env });
  assert.equal(doc.code, 0, doc.out);
  assert.match(doc.stdout, /^ok: warm: fw-sim booted/m, 'a warm device with its keeper is no leak');
  // the next session takes it over: no boot; Safari terminated, its cache emptied, relaunched
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await fn();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /reusing the booted fw-sim 15 Pro Max \(I-063: idle \d+ s, session 2 on this boot\)/);
  assert.match(r.stdout, /reused the booted fw-sim \(no boot\), Safari relaunched/);
  assert.deepEqual(simctlCalls(), ['bootstatus', 'terminate', 'get_app_container', 'launch', 'terminate'], 'no boot; Safari reset as after a cold boot (I-052 cache cleared)');
  s1 = readJ(sessOut());
  assert.deepEqual([s1.boot.mode, s1.boot.sessionsOnBoot, s1.boot.bootedAt], ['warm', 2, w1.bootedAt]);
  assert.ok(!alive(k1.pid), 'the first keeper was stopped when the session took the device over');
  const k2 = keeper();
  assert.ok(k2 && k2.pid !== k1.pid && alive(k2.pid));
  assert.deepEqual([warm().sessions, warm().bootedAt], [2, w1.bootedAt]);
  // sim.mjs shutdown: keeper stopped, device shut down, record gone
  const sd = node(SIM, ['shutdown'], { env });
  assert.equal(sd.code, 0, sd.out);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!alive(k2.pid) && !keeper() && !warm());
  assert.match(node(SIM, ['status'], { env }).stdout, /^warm: {5}none \(idle timeout 300 s/m);
});

test('I-063 keeper: shuts fw-sim down at its idle timeout; FW_SIM_IDLE_SEC=0 keeps nothing (shutdown at the end, as before)', async () => {
  setup();
  let r = await fn({ ...env, FW_SIM_IDLE_SEC: '1' });
  assert.equal(r.code, 0, r.out);
  assert.equal(device().state, 'Booted');
  const k = keeper();
  await until(() => device().state === 'Shutdown', 10000, 'the idle shutdown');
  await until(() => !alive(k.pid) && !keeper() && !warm(), 5000, 'the keeper to exit with its records');
  assert.match(readFileSync(join(simDir(), 'keeper.log'), 'utf8'), /SIM_WARM_SHUTDOWN \(idle \d+ s; by keeper\): fw-sim shut down/);
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await fn({ ...env, FW_SIM_IDLE_SEC: '0' });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(simctlCalls(), ['boot', 'bootstatus', 'terminate', 'get_app_container', 'launch', 'shutdown']);
  assert.ok(!warm() && !keeper(), 'nothing kept');
});

test('I-063 keeper: a timing holder of chrome-measure shuts fw-sim down at once; a short job does not', async () => {
  setup();
  const r = await fn();
  assert.equal(r.code, 0, r.out);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'npm', '--short', '--max-seconds', '60'], { env }).code, 0);
  await sleep(800);
  assert.equal(device().state, 'Booted', 'a short job is no timing hold');
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'npm'], { env }).code, 0);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'ab'], { env }).code, 0);
  await until(() => device().state === 'Shutdown', 10000, 'the shutdown for the timing hold');
  await until(() => !keeper() && !warm(), 5000, 'the records to go');
  assert.match(readFileSync(join(simDir(), 'keeper.log'), 'utf8'), /SIM_WARM_SHUTDOWN \(chrome-measure is held by "ab" \(a timing hold\); by keeper\)/);
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'ab'], { env }).code, 0);
});

test('I-063 keeper vs a session (lead note 2): it never shuts fw-sim down while the simulator lock is held (backs off, polls again); a session that waited for a keeper mid-shutdown re-reads the device and cold-boots', async () => {
  setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  // (a) a session holds the simulator lock (here a lease stand-in), and the idle timeout has passed
  assert.equal(node(LOCK, ['acquire', 'simulator', '--owner', 'other-session', '--ttl', '60'], { env }).code, 0);
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify({ ...warm(), idleUntil: new Date(Date.now() - 1000).toISOString() }));
  await until(() => /but not now: the Simulator is busy/.test(existsSync(join(simDir(), 'keeper.log')) ? readFileSync(join(simDir(), 'keeper.log'), 'utf8') : ''), 10000, 'the keeper to back off');
  await sleep(500);
  assert.equal(device().state, 'Booted', 'never shut down under a held simulator lock');
  assert.ok(alive(k.pid), 'the keeper keeps polling');
  assert.equal(node(LOCK, ['release', 'simulator', '--owner', 'other-session'], { env }).code, 0);
  await until(() => device().state === 'Shutdown' && !warm(), 10000, 'the shutdown once the lock is free');
  // (b) the keeper holds the simulator lock mid-shutdown (a lease stand-in) while a session starts: the session waits,
  // then finds the device shut down (warm record gone) and cold-boots instead of using a device being shut down
  r = await fn();
  assert.equal(r.code, 0, r.out);
  assert.equal(device().state, 'Booted');
  assert.equal(node(SIM, ['shutdown'], { env }).code, 0); // stop that keeper; set up a warm record by hand below
  const st = JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')); st.devices[0].state = 'Booted'; writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st));
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify({ id: 'abcabcabcabc', udid: device().udid, runtimeId: RUNTIME.identifier, bootedAt: new Date().toISOString(), sessions: 1, lastOwner: 'me', lastSessionEndedAt: new Date().toISOString(), idleSec: 300, idleUntil: new Date(Date.now() + 300000).toISOString() }));
  assert.equal(node(LOCK, ['acquire', 'simulator', '--owner', 'sim-keeper', '--ttl', '60'], { env }).code, 0);
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  const p = fn();
  await until(() => JSON.parse(node(LOCK, ['status', 'simulator', '--json', '--no-host'], { env }).stdout)[0].queue.some((w) => w.owner === 'me'), 20000, 'the session to queue for the simulator lock');
  const st2 = JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')); st2.devices[0].state = 'Shutdown'; st2.devices[0].safari = false; writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st2));
  writeFileSync(join(simDir(), 'warm.json'), ''); // what the keeper does under the lock: device shut down, record removed
  assert.equal(node(LOCK, ['release', 'simulator', '--owner', 'sim-keeper'], { env }).code, 0);
  r = await p;
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readJ(sessOut()).boot.mode, 'cold');
  assert.equal(simctlCalls()[0], 'boot', 'a cold boot after the keeper\'s shutdown');
  node(SIM, ['shutdown'], { env });
});

test('I-063: a dead keeper is a LEAK in doctor; a normal (timing) session reuses the warm device but always shuts it down at its end', async () => {
  const udid = setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  process.kill(k.pid, 'SIGKILL');
  await until(() => !alive(k.pid), 5000, 'the keeper to die');
  let d = node(SIM, ['doctor'], { env });
  assert.equal(d.code, 3, d.out);
  assert.match(d.stdout, /LEAK: fw-sim 15 Pro Max is Booted with no live session \(a warm record, but its keeper is gone\)/);
  assert.match(node(SIM, ['status'], { env }).stdout, /keeper pid \d+ DEAD: node tools\/sim\.mjs shutdown/);
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', '--', process.execPath, '-e', probe()], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.equal(readJ(sessOut()).boot.mode, 'warm');
  assert.deepEqual(simctlCalls(), ['bootstatus', 'terminate', 'get_app_container', 'launch', 'shutdown'], 'reused, then shut down: a timing session keeps nothing');
  assert.ok(!warm() && !keeper());
  // doctor --fix on a warm device whose keeper died
  r = await fn();
  process.kill(keeper().pid, 'SIGKILL');
  await sleep(200);
  d = node(SIM, ['doctor', '--fix'], { env });
  assert.equal(d.code, 0, d.out);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!warm(), 'the warm record removed');
  assert.match(node(SIM, ['doctor'], { env }).stdout, /^ok: no session/m);
});

test('I-063 backstop: sim.mjs shutdown --warm-only shuts only a warm device (none: SIM_WARM none); a booted fw-sim without a warm record is refused by a session as before', async () => {
  setup();
  let r = node(SIM, ['shutdown', '--warm-only', '--reason', 'x', '--by', 'verify'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SIM_WARM none/m);
  r = await fn();
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  r = node(SIM, ['shutdown', '--warm-only', '--reason', 'verify.mjs timing hold', '--by', 'verify'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /SIM_WARM_SHUTDOWN \(verify\.mjs timing hold; by verify\): fw-sim shut down, warm since \S+/);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!alive(k.pid) && !warm() && !keeper());
  // a Booted fw-sim with a warm record of another runtime: refused, nothing shut down
  const st = JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')); st.devices[0].state = 'Booted'; writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st));
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify({ id: 'x', udid: device().udid, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0', sessions: 1, lastSessionEndedAt: new Date().toISOString(), idleUntil: new Date(Date.now() + 60000).toISOString() }));
  r = await fn();
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /refusing: fw-sim 15 Pro Max is already Booted .*the warm record does not match it \(another iOS runtime\)/);
  assert.equal(device().state, 'Booted');
});

test('I-063 phone runs: a warm fw-sim beside a phone run gives a NOTE and mac.start.simWarm; with --require-quiet (lead note 1) it is shut down first under the simulator lock', async () => {
  setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  const guard = (q) => run(process.execPath, ['--input-type=module', '-e', `import { phoneGuard } from ${JSON.stringify(tool('lib/lock.mjs'))};
    const g = phoneGuard({ owner: 'phone', requireQuiet: ${q}, st: { holder: null, queue: [] }, load1: 1 }); console.log('G ' + JSON.stringify(g));`], { env });
  r = guard(false);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator \(fw-sim, booted and idle until \S+\) is on the Mac beside this phone run/);
  let g = JSON.parse(r.stdout.match(/^G (.*)$/m)[1]);
  assert.equal(g.start.simWarm.keeperAlive, true);
  assert.equal(device().state, 'Booted', 'no shutdown without a quiet request');
  r = guard(true);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator .* was still booted at the start of this phone run: shut down before the first run/);
  g = JSON.parse(r.stdout.match(/^G (.*)$/m)[1]);
  assert.deepEqual([g.requireQuiet, g.start.simWarm.action, g.start.simWarm.ok], [true, 'shut down', true]);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!warm() && !keeper());
});

test('I-063 verify.mjs backstop (MEASUREMENT CODE: before the first run only): a warm fw-sim still booted at the start of the hold is shut down, a NOTE printed, host.simWarm recorded; without one nothing is recorded', async () => {
  setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  process.kill(k.pid, 'SIGKILL'); // the keeper died: only the backstop is left
  const e = { ...env, CHROME: FX('fake-chrome.mjs'), FAKE_CHROME_LOG: join(dir, 'chrome.jsonl'), FAKE_CHROME_METRICS: 'step', FW_MIRROR_HOME: dir };
  const args = (n) => ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--idle', '0', '--out', join(dir, `out${n}`), '--result', join(dir, `result${n}.json`), '--profile', join(dir, 'profile'), '--owner', 'v'];
  r = await nodeAsync(VERIFY, args(1), { env: e, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator \(fw-sim, idle since \S+, keeper not running\) was still booted at the start of this verify hold: shut down before the first run \(I-063; recorded as simWarm\)/);
  const res = JSON.parse(readFileSync(join(dir, 'result1.json'), 'utf8'));
  assert.deepEqual([res.host.simWarm.action, res.host.simWarm.ok, res.host.simWarm.keeperAlive], ['shut down', true, false]);
  assert.equal(device().state, 'Shutdown');
  r = await nodeAsync(VERIFY, args(2), { env: e, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.ok(!/warm Simulator/.test(r.out));
  assert.equal('simWarm' in JSON.parse(readFileSync(join(dir, 'result2.json'), 'utf8')).host, false);
});

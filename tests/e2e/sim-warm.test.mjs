// Incident I-063 end to end on fakes only (no Simulator is ever booted, no phone touched; the fakes of
// tests/e2e/sim.test.mjs): a functional sim session keeps fw-sim booted for the next one (warm.json + a detached keeper),
// the next session takes it over without a boot, the keeper shuts it down at its idle timeout or when chrome-measure
// gets a timing holder, never while a session holds the simulator lock; `sim.mjs shutdown [--warm-only]`, doctor,
// status; the timed tools' backstop (verify.mjs, phone runs asking for a quiet Mac).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, runAsync, run, tool, freePort, TESTS, sleep } from '../helpers.mjs';

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
/** fake simctl state edits (the state file is shared with detached keepers) */
function devSet(fields) { const st = JSON.parse(readFileSync(env.FAKE_SIMCTL_STATE, 'utf8')); Object.assign(st.devices[0], fields); writeFileSync(env.FAKE_SIMCTL_STATE, JSON.stringify(st)); }
/** a warm record by hand (no keeper), for the cases a live keeper would end before the code under test runs */
const warmRec = (over = {}) => ({ id: 'abcabcabcabc', udid: device().udid, runtimeId: RUNTIME.identifier, bootedAt: new Date().toISOString(), sessions: 1, lastOwner: 'me', lastSessionEndedAt: new Date().toISOString(), idleSec: 300, idleUntil: new Date(Date.now() + 300000).toISOString(), ...over });
/**
 * A script that makes fw-sim warm (Booted, warm.json, no keeper; `shutdownFail`: simctl shutdown refuses) and then runs
 * `cmd`, for `lock.mjs run chrome-measure -- sh <it>`: the warm device appears INSIDE a timing hold, after its host gate
 * (which would otherwise shut it down first, review-i063 N1), as when the gate timed out or the hold was re-entered.
 */
function inHoldScript(cmd, { shutdownFail = false } = {}) {
  const mk = join(dir, 'mkwarm.mjs');
  writeFileSync(mk, `import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const st = JSON.parse(readFileSync(${JSON.stringify(env.FAKE_SIMCTL_STATE)}, 'utf8'));
Object.assign(st.devices[0], { state: 'Booted', shutdownFail: ${shutdownFail} });
writeFileSync(${JSON.stringify(env.FAKE_SIMCTL_STATE)}, JSON.stringify(st));
mkdirSync(${JSON.stringify(simDir())}, { recursive: true });
writeFileSync(${JSON.stringify(join(simDir(), 'warm.json'))}, JSON.stringify(${JSON.stringify(warmRec())}));\n`);
  const sh = join(dir, 'inhold.sh');
  writeFileSync(sh, `set -e\n"${process.execPath}" "${mk}"\n${cmd.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')}\n`);
  return sh;
}
const timingSession = () => [process.execPath, SIM, 'session', '--owner', 'me', '--window', 'hidden', '--', process.execPath, '-e', probe()];

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

test('I-063: a dead keeper is a LEAK in doctor; a timing hold\'s host gate shuts the warm device down before the grant (review-i063 N1), so its timing session cold-boots and keeps nothing', async () => {
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
  assert.match(node(LOCK, ['status', 'simulator', '--no-host'], { env }).stdout, /warm: fw-sim recorded as booted \(state unchecked\), idle .*keeper pid \d+ DEAD/, 'lock.mjs status (no simctl) does not claim "booted" without its keeper (N3)');
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', ...timingSession()], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stderr, /\[lock chrome-measure\] a warm Simulator \(fw-sim\) at the host gate: shut down \(I-063\)/);
  assert.deepEqual([readJ(sessOut()).boot.mode, 'afterWarm' in readJ(sessOut()).boot], ['cold', false]);
  assert.deepEqual(simctlCalls(), ['shutdown', 'boot', 'bootstatus', 'terminate', 'get_app_container', 'launch', 'shutdown'], 'the gate shut it down; a cold boot; a timing session keeps nothing');
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
    const g = phoneGuard({ owner: 'phone', requireQuiet: ${q}, st: { holder: null, queue: [] }, load1: 1 }); console.log('G ' + JSON.stringify(g));`], { env: { ...env, FW_SIM_SETTLE_SEC: '1' } });
  r = guard(false);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator \(fw-sim, booted and idle until \S+\) is on the Mac beside this phone run/);
  let g = JSON.parse(r.stdout.match(/^G (.*)$/m)[1]);
  assert.equal(g.start.simWarm.keeperAlive, true);
  assert.equal(device().state, 'Booted', 'no shutdown without a quiet request');
  const t0 = Date.now();
  r = guard(true);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /waiting 1 s for the Mac to settle after the Simulator shutdown \(I-063; FW_SIM_SETTLE_SEC\)/, 'review-i063 N6: a settle after the shutdown');
  assert.ok(Date.now() - t0 >= 1000, 'the settle waited');
  assert.match(r.stdout, /NOTE: a warm Simulator .* was still booted at the start of this phone run: shut down before the first run/);
  g = JSON.parse(r.stdout.match(/^G (.*)$/m)[1]);
  assert.deepEqual([g.requireQuiet, g.start.simWarm.action, g.start.simWarm.ok, g.start.simWarm.shutDown, g.start.simWarm.settledSec], [true, 'shut down', true, true, 1]);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!warm() && !keeper());
  // review-i063 N3: a record from before the Mac's last start is STALE (lock.mjs status, no simctl); the reap finds
  // fw-sim already shut down: no settle, recorded as stale
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify(warmRec({ bootedAt: '2000-01-01T00:00:00.000Z', lastSessionEndedAt: '2000-01-01T00:10:00.000Z' })));
  assert.match(node(LOCK, ['status', 'simulator', '--no-host'], { env }).stdout, /warm: STALE record: the Mac restarted at \S+, after the session of "me" at 2000-01-01T00:10:00\.000Z \(fw-sim not booted since\)/);
  assert.match(node(SIM, ['status'], { env }).stdout, /^warm: {5}STALE record: fw-sim is Shutdown/m, 'sim.mjs status reads the real state');
  const js = JSON.parse(node(LOCK, ['status', 'simulator', '--json', '--no-host'], { env }).stdout)[0];
  assert.deepEqual([js.simWarm.stale, js.simWarm.lastSessionEndedAt], [true, '2000-01-01T00:10:00.000Z'], 'lock.mjs status --json carries the warm state');
  r = guard(true);
  assert.equal(r.code, 0, r.out);
  assert.ok(!/settle/.test(r.stdout), 'nothing was shut down: no settle');
  assert.match(r.stdout, /NOTE: a stale warm Simulator record \(fw-sim, session ended 2000-01-01T00:10:00\.000Z\) was found at the start of this phone run: fw-sim was not booted, the record was removed/);
  g = JSON.parse(r.stdout.match(/^G (.*)$/m)[1]);
  assert.deepEqual([g.start.simWarm.action, g.start.simWarm.ok, g.start.simWarm.stale, 'shutDown' in g.start.simWarm], ['already shut down (a stale record, removed)', true, true, false]);
  assert.ok(!warm());
});

test('I-063 verify.mjs (MEASUREMENT CODE: before the first run only): the host gate shuts a warm fw-sim down before the grant (N1); inside the hold verify\'s own backstop does; either is recorded as host.simWarm; a failed shutdown refuses (WAIT, exit 1: review-i063 B2); without one nothing is recorded', async () => {
  setup();
  let r = await fn();
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  process.kill(k.pid, 'SIGKILL'); // the keeper died: only the gate and the backstop are left
  const e = { ...env, CHROME: FX('fake-chrome.mjs'), FAKE_CHROME_LOG: join(dir, 'chrome.jsonl'), FAKE_CHROME_METRICS: 'step', FW_MIRROR_HOME: dir };
  const args = (n) => ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--idle', '0', '--out', join(dir, `out${n}`), '--result', join(dir, `result${n}.json`), '--profile', join(dir, 'profile'), '--owner', 'v'];
  const result = (n) => JSON.parse(readFileSync(join(dir, `result${n}.json`), 'utf8'));
  // (1) verify's own hold: its host gate finds the warm device (keeper dead) and shuts it down before the grant
  r = await nodeAsync(VERIFY, args(1), { env: e, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /\[lock chrome-measure\] a warm Simulator \(fw-sim\) at the host gate: shut down \(I-063\)/);
  assert.match(r.stdout, /NOTE: the host gate of this hold found a warm Simulator \(fw-sim\): shut down, before the grant \(I-063; recorded as simWarm\)/);
  assert.deepEqual([result(1).host.simWarm.action, result(1).host.simWarm.ok, result(1).host.simWarm.keeperAlive, result(1).host.simWarm.gate], ['shut down', true, false, true]);
  assert.equal(device().state, 'Shutdown');
  // (1b) review-i063: verify re-entering an outer lock.mjs run hold (the usual sh -c 'fix.mjs ab' path) records that
  // hold's gate reap from the holder's gate record (gate.simWarm), once (not again under host.gate)
  devSet({ state: 'Booted' });
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify(warmRec()));
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'v', '--', process.execPath, VERIFY, ...args(5)], { env: e, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: the host gate of this hold found a warm Simulator \(fw-sim\): shut down, before the grant/);
  assert.deepEqual([result(5).host.simWarm.action, result(5).host.simWarm.ok, result(5).host.simWarm.gate, 'simWarm' in (result(5).host.gate || {})], ['shut down', true, true, false]);
  assert.equal(device().state, 'Shutdown');
  // (2) a warm device that appears inside the hold (after its gate): verify's own backstop before the first run
  const inHold = (n, o) => nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'v', '--', 'sh', inHoldScript([process.execPath, VERIFY, ...args(n)], o)], { env: e, timeout: 120000 });
  r = await inHold(2);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator \(fw-sim, idle since \S+, keeper not running\) was still booted at the start of this verify hold: shut down before the first run \(I-063; recorded as simWarm\)/);
  assert.deepEqual([result(2).host.simWarm.action, result(2).host.simWarm.ok, result(2).host.simWarm.shutDown, 'gate' in result(2).host.simWarm], ['shut down', true, true, false]);
  assert.equal(device().state, 'Shutdown');
  // (3) B2: its shutdown fails: verify measures nothing (WAIT, exit 1, no result), the record stays and says so
  writeFileSync(e.FAKE_CHROME_LOG, '');
  r = await inHold(3, { shutdownFail: true });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /WAIT: a warm Simulator \(fw-sim\) may still be booted and its shutdown failed \(.*\): nothing is timed beside it, so this verify hold stops here/);
  assert.ok(!existsSync(join(dir, 'result3.json')), 'no result');
  assert.equal(readFileSync(join(dir, 'chrome.jsonl'), 'utf8'), '', 'no Chrome started');
  assert.equal(device().state, 'Booted');
  assert.match(warm().shutdownFailed.why, /shutdown failed \(exit 164\).*; fw-sim is Booted/);
  devSet({ shutdownFail: false });
  assert.equal(node(SIM, ['shutdown'], { env }).code, 0);
  // (4) no warm device: nothing printed, nothing recorded
  r = await nodeAsync(VERIFY, args(4), { env: e, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.ok(!/warm Simulator/.test(r.out));
  assert.equal('simWarm' in result(4).host, false);
});

test('I-063 B1 (review-i063): a shutdown counts only when fw-sim reads Shutdown: on failure the keeper keeps the (marked) record and polls on (n1: retries backed off), logging each line once; status, doctor, --warm-only and plain shutdown all say so; once the device can shut down, the keeper finishes', async () => {
  setup();
  const ek = { ...env, FW_SIM_KEEPER_RETRY_MS: '3000' }; // the keeper inherits it
  let r = await fn(ek);
  assert.equal(r.code, 0, r.out);
  const k = keeper();
  devSet({ shutdownFail: true });
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify({ ...warm(), idleUntil: new Date(Date.now() - 1000).toISOString() }));
  const klog = () => (existsSync(join(simDir(), 'keeper.log')) ? readFileSync(join(simDir(), 'keeper.log'), 'utf8') : '');
  await until(() => /SIM_WARM_SHUTDOWN_FAILED/.test(klog()), 10000, 'the keeper\'s failed shutdown');
  await sleep(1500); // ~10 more polls, each a failed attempt
  assert.equal(device().state, 'Booted');
  assert.ok(alive(k.pid), 'the keeper keeps polling');
  assert.ok(warm()?.shutdownFailed, 'the record stays, marked');
  assert.match(warm().shutdownFailed.why, /shutdown failed \(exit 164\).*; fw-sim is Booted/);
  assert.equal(klog().match(/SIM_WARM_SHUTDOWN_FAILED/g).length, 1, `N7: one line, not one per poll:\n${klog()}`);
  assert.equal(klog().match(/but not now/g).length, 1, klog());
  assert.equal(simctlCalls().filter((c) => c === 'shutdown').length, 1, `n1: the failed simctl shutdown is retried after a back-off (3 s here), not every 150 ms poll: ${simctlCalls()}`);
  assert.ok(!/SIM_WARM_SHUTDOWN \(/.test(klog()), 'never logged as done');
  assert.match(node(SIM, ['status'], { env }).stdout, /^warm: {5}fw-sim booted, .*its last shutdown FAILED \(\S+, by keeper\): node tools\/sim\.mjs doctor --fix$/m);
  let d = node(SIM, ['doctor'], { env });
  assert.equal(d.code, 3, d.out);
  assert.match(d.stdout, /LEAK: fw-sim 15 Pro Max is Booted with no live session \(a warm record, but its last shutdown FAILED: /);
  r = node(SIM, ['shutdown', '--warm-only', '--reason', 'verify.mjs timing hold', '--by', 'verify'], { env });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^SIM_WARM_SHUTDOWN_FAILED \(verify\.mjs timing hold; by verify\): /m);
  assert.ok(warm(), 'the record stays');
  // plain shutdown (stops the keeper) and doctor --fix: not done while the device stays Booted
  r = node(SIM, ['shutdown'], { env });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /fw-sim is still Booted after the shutdown \(the warm record stays\)/);
  assert.ok(warm() && !alive(k.pid));
  d = node(SIM, ['doctor', '--fix'], { env });
  assert.equal(d.code, 3, d.out);
  assert.match(d.stdout, /NOT fixed: fw-sim 15 Pro Max is still Booted after the shutdown \(the warm record stays\)/);
  assert.ok(warm());
  devSet({ shutdownFail: false });
  d = node(SIM, ['doctor', '--fix'], { env });
  assert.equal(d.code, 0, d.out);
  assert.ok(device().state === 'Shutdown' && !warm());
  // the keeper path: it finishes once the device shuts down (its retry after the back-off)
  r = await fn(ek);
  assert.equal(r.code, 0, r.out);
  devSet({ shutdownFail: true });
  writeFileSync(join(simDir(), 'warm.json'), JSON.stringify({ ...warm(), idleUntil: new Date(Date.now() - 1000).toISOString() }));
  await until(() => warm()?.shutdownFailed, 10000, 'a failed attempt');
  devSet({ shutdownFail: false });
  await until(() => device().state === 'Shutdown' && !warm() && !keeper(), 10000, 'the retried shutdown');
});

test('I-063 N5 (review-i063): a timing session never takes over a warm device: it shuts it down under its simulator lock and cold-boots (boot.afterWarm); if that shutdown fails it refuses and the record stays', async () => {
  const udid = setup();
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  let r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', 'sh', inHoldScript(timingSession())], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /booting fw-sim 15 Pro Max \(a timing session cold-boots: the warm device was shut down first, I-063\)/);
  const b = readJ(sessOut()).boot;
  assert.deepEqual([b.mode, b.sessionsOnBoot, typeof b.afterWarm?.shutDownAt, b.afterWarm?.sessions], ['cold', 1, 'string', 1]);
  assert.deepEqual(simctlCalls(), ['shutdown', 'boot', 'bootstatus', 'terminate', 'get_app_container', 'launch', 'shutdown']);
  assert.ok(!warm() && !keeper() && device().state === 'Shutdown');
  rmSync(sessOut(), { force: true });
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', 'sh', inHoldScript(timingSession(), { shutdownFail: true })], { env, timeout: 90000 });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /refusing: a timing session cold-boots, but the warm fw-sim 15 Pro Max did not shut down \(shutdown failed \(exit 164\).*; it is Booted\): node tools\/sim\.mjs doctor --fix/);
  assert.ok(!existsSync(sessOut()), 'its command never ran');
  assert.ok(warm()?.shutdownFailed, 'the record stays, marked');
  devSet({ shutdownFail: false });
  assert.equal(node(SIM, ['shutdown'], { env }).code, 0);
});

test('I-063 N9 (review-i063): a functional session that ends while a timing hold waits for chrome-measure keeps nothing ("not keeping fw-sim booted")', async () => {
  setup();
  // its command queues a timing waiter (a lease, not short) behind the session's own slot
  const q = `import { tryAcquire } from ${JSON.stringify(tool('lib/lock.mjs'))}; const r = await tryAcquire('chrome-measure', { owner: 'ab', kind: 'lease', ttlSec: 60 }); console.log('QUEUED ' + !r.ok);`;
  const r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--shared', '--weight', 'simulator', '--max-seconds', '120', '--owner', 'me', '--', process.execPath, SIM, 'session', '--functional', '--owner', 'me', '--window', 'hidden', '--', process.execPath, '--input-type=module', '-e', q], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /QUEUED true/);
  assert.match(r.stdout, /cleanup: not keeping fw-sim booted: "ab" waits for a timing hold of chrome-measure/);
  assert.equal(device().state, 'Shutdown');
  assert.ok(!warm() && !keeper());
});

test('I-063 review-i063 n1/n2/n3: a warm fw-sim whose shutdown fails twice at the host gate ends the wait (WAIT, dequeued) instead of closing the gate for gateMaxWaitSec; a failed attempt the device later recovers from is annotated resolvedLater and kept in the holder\'s gate record (gate.simWarm) for tools that re-enter the hold; a reap whose record went is "gone", not "stale"', async () => {
  setup();
  const mkWarm = () => { devSet({ state: 'Booted', shutdownFail: true }); mkdirSync(simDir(), { recursive: true }); writeFileSync(join(simDir(), 'warm.json'), JSON.stringify(warmRec())); };
  // n1: two failed reaps (every FW_SIM_GATE_REAP_SEC) end the wait; the record and the device stay; nobody is left queued
  mkWarm();
  const t0 = Date.now();
  let r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', process.execPath, '-e', '0'], { env: { ...env, FW_SIM_GATE_REAP_SEC: '1' }, timeout: 60000 });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /\[lock chrome-measure\] a warm Simulator \(fw-sim\) at the host gate: shutdown FAILED \(.*\); attempt 1 of 2 \(I-063\)/);
  assert.match(r.stderr, /attempt 2 of 2 \(I-063\)/);
  assert.match(r.out, /WAIT: a warm Simulator \(fw-sim\) is booted and its shutdown failed 2 times at the host gate \(.*\): nothing timed starts beside it, so this wait ends \(dequeued\); node tools\/sim\.mjs doctor --fix/);
  assert.ok(Date.now() - t0 < 30000, `fast, not gateMaxWaitSec: ${Date.now() - t0} ms`);
  assert.deepEqual(readJ(join(env.FW_STATE_DIR, 'locks', 'chrome-measure.queue.json')) ?? [], [], 'dequeued');
  assert.ok(!existsSync(join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json')), 'nothing granted');
  assert.ok(device().state === 'Booted' && warm()?.shutdownFailed, 'the record stays, marked');
  // n3 + item 3: the first gate reap fails, then the device goes (shut down outside the gate) before the second: the
  // grant's gate record carries the failed attempt, annotated resolvedLater; the hold's command sees it (status --json)
  mkWarm();
  const p = nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', process.execPath, LOCK, 'status', 'chrome-measure', '--json', '--no-host'], { env: { ...env, FW_SIM_GATE_REAP_SEC: '6' }, timeout: 60000 });
  await until(() => readJ(join(simDir(), 'warm.json'))?.shutdownFailed?.by === 'me', 15000, 'the gate\'s failed attempt');
  await sleep(500); // its sim.mjs shutdown --warm-only has exited
  devSet({ state: 'Shutdown', shutdownFail: false });
  rmSync(join(simDir(), 'warm.json'));
  r = await p;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /attempt 1 of 2/);
  assert.ok(!/attempt 2 of 2/.test(r.stderr), r.stderr);
  const held = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))).find((x) => x.resource === 'chrome-measure').holder;
  const sw = held.gate.simWarm;
  assert.deepEqual([sw.ok, sw.action, typeof sw.resolvedLater], [false, 'shutdown FAILED', 'string'], JSON.stringify(held.gate));
  // n2: a shutdown of a record that is gone by the time it holds the simulator lock: "gone", not a stale record
  const probeGone = `import(${JSON.stringify(tool('lib/sim.mjs'))}).then(async (S) => console.log(JSON.stringify(await S.shutdownWarm({ reason: 't', by: 't' }))))`;
  writeFileSync(env.FAKE_SIMCTL_LOG, '');
  r = await runAsync(process.execPath, ['--input-type=module', '-e', probeGone], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  const g = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.deepEqual([g.done, g.gone], [false, true]);
  assert.match(g.why, /the warm record was removed before this shutdown got the simulator lock/);
  assert.ok(!simctlCalls().includes('shutdown'), 'nothing shut down');
});

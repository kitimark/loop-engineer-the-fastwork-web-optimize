// I-186: the phone's thermal test profile end to end, without the phone: `iphone.mjs run|scroll|record --profile
// serious|fair`, `iphone.mjs profile`, and the hold's end read made by `lock.mjs run`. The thermal read is
// tests/fixtures/fake-thermal.mjs (cleanEnv's $FW_XCTRACE / $FW_THERMAL_BATTERY; its state from FAKE_THERMAL_FILE), the
// Safari tab tests/fixtures/fake-run-proxy.mjs, $FW_STATE_DIR a temp dir (locks, ledgers, console steps): the real
// phone, xctrace, the real locks and the user's console are never touched.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, TESTS } from '../helpers.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs'), CONSOLE = tool('console.mjs');
const procs = [];
after(async () => { await Promise.all(procs.map((p) => p.stop())); });
let env, dir, thermal;
beforeEach(async () => {
  dir = tempDir('fw-iphone-profile-');
  thermal = join(dir, 'thermal.txt');
  writeFileSync(thermal, 'Fair No 34.5\n');
  env = { FW_STATE_DIR: join(dir, 'state'), FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '2.5',
    FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FW_WDA_HOME: tempDir('fw-profile-wdahome-'), FW_IDEVICEDIAGNOSTICS: join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs'),
    FAKE_THERMAL_FILE: thermal, FAKE_THERMAL_LOG: join(dir, 'thermal.jsonl') };
});
const reads = () => (existsSync(env.FAKE_THERMAL_LOG) ? readFileSync(env.FAKE_THERMAL_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.cmd === 'record').length : 0);
const lock = (...a) => node(LOCK, a, { env });
const steps = () => JSON.parse(node(CONSOLE, ['list', '--all', '--json'], { env }).stdout);

async function fakePhone() {
  const log = join(tempDir('fw-wip-profile-'), 'wip.jsonl');
  const p = await startProc(process.execPath, [join(TESTS, 'fixtures', 'fake-run-proxy.mjs')], { env: { FAKE_WIP_LOG: log }, ready: (s) => s.match(/^FAKE_WIP_PORT=(\d+)$/m) });
  procs.push(p);
  const port = p.stdout().match(/^FAKE_WIP_PORT=(\d+)$/m)[1];
  const events = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { port, events };
}
const RUN = (out, ...a) => ['run', '--driver', 'window', '--probe', 'std', '--owner', 'me', '--from', '1500', '--to', '1600', '--settle', '0', '--idle', '0.2', '--hold', '0.2', '--sentinel', '0.2', '--no-park', '--out', out, ...a];

test('serious (the default) is refused on a Fair phone before Safari is touched: exit 8, what to switch in Xcode, ONE console step for the tester', async () => {
  const phone = await fakePhone();
  env.FW_IPHONE_PORT = phone.port;
  assert.equal(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me', '--ttl', '300').code, 0);
  const out = join(dir, 'r.json');
  let r = await nodeAsync(IPHONE, RUN(out), { env, timeout: 60000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^REFUSED profile serious \(Serious, induced by Xcode\): phone is Fair, battery 34\.5 C; set Xcode > Window > Devices and Simulators > the phone > Device Conditions > Thermal State > Serious > Start \(leave it on\), then run again \(gate xcode-serious code 2, I-186\)$/m);
  const id = r.stderr.match(/^STEP (C-\d+) posted on the user console/m)?.[1];
  assert.ok(id, r.stderr);
  assert.deepEqual(phone.events().filter((e) => e.evaluate || e.reload), [], 'Safari untouched');
  assert.ok(!existsSync(out), 'no record');
  // the second refusal names the same step, posts none
  r = await nodeAsync(IPHONE, RUN(out), { env, timeout: 60000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, new RegExp(`^STEP ${id} already open on the user console`, 'm'));
  const s = steps().filter((x) => x.meta?.phoneProfile);
  assert.equal(s.length, 1, 'posted once');
  assert.deepEqual([s[0].id, s[0].kind, s[0].by, s[0].meta.phoneProfile.profile, s[0].meta.phoneProfile.fix], [id, 'action', 'me', 'serious', 'set-serious']);
  assert.match(s[0].instructions, /Leave it on/);
  assert.equal(reads(), 2, 'a refused start read is not kept: each run reads');
  // scroll and record refuse the same way, before the (absent) Safari proxy is reached
  env.FW_IPHONE_PORT = String(await freePort());
  for (const cmd of [['scroll'], ['record', '--seconds', '1']]) {
    r = node(IPHONE, [...cmd, '--owner', 'me'], { env, timeout: 30000 });
    assert.equal(r.code, 8, `${cmd[0]}: ${r.out}`);
    assert.match(r.stderr, /^REFUSED profile serious/m);
    assert.doesNotMatch(r.stderr, /fetch failed|ECONNREFUSED|openTab/);
  }
  assert.equal(steps().filter((x) => x.meta?.phoneProfile).length, 1, 'still one step');
  // --profile none does not exist
  r = node(IPHONE, ['scroll', '--owner', 'me', '--profile', 'none'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--profile must be serious .* or fair .*There is no profile "none"/);
});

test('fair passes on a Fair phone: the record carries meta.profile (the start read); one read per hold; iphone.mjs profile --end stamps the end read', async () => {
  const phone = await fakePhone();
  env.FW_IPHONE_PORT = phone.port;
  assert.equal(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me', '--ttl', '300').code, 0);
  const a = join(dir, 'a.json'), b = join(dir, 'b.json');
  let r = await nodeAsync(IPHONE, RUN(a, '--profile', 'fair'), { env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROFILE fair ok at the hold's start: phone is Fair, battery 34\.5 C \(gate real-fair; read \d+ s\)$/m);
  r = await nodeAsync(IPHONE, RUN(b, '--profile', 'fair'), { env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(reads(), 1, 'the second run of the hold reuses the start read');
  let m = JSON.parse(readFileSync(a, 'utf8')).meta;
  assert.deepEqual([m.profile.name, m.profile.gate, m.profile.start.state, m.profile.start.induced, m.profile.start.battC, m.profile.start.code, m.profile.start.cached, m.profile.end, m.profile.drift, m.profileDrift],
    ['fair', 'real-fair', 'Fair', 'No', 34.5, 0, false, null, null, null]);
  assert.match(m.profile.hold, /^iphone:[0-9a-f]{12}$/);
  assert.ok(m.mac, 'beside meta.mac');
  assert.equal(JSON.parse(readFileSync(b, 'utf8')).meta.profile.start.cached, true);
  assert.doesNotMatch(readFileSync(a, 'utf8'), /FAKE-UDID/, 'no device id in the record');
  // the hold's end: the phone drifted to Serious (real heat): both records marked, data kept
  writeFileSync(thermal, 'Serious No 39\n');
  r = node(IPHONE, ['profile', '--owner', 'me', '--end'], { env, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stdout, /^PROFILE-DRIFT fair: at the hold's end the phone is Serious \(real heat, not induced\), battery 39 C .*2 of 2 run records marked profileDrift: true \(data kept, I-186\)$/m);
  for (const f of [a, b]) {
    m = JSON.parse(readFileSync(f, 'utf8')).meta;
    assert.deepEqual([m.profileDrift, m.profile.drift, m.profile.end.state, m.profile.end.induced, m.profile.end.battC], [true, true, 'Serious', 'No', 39]);
  }
  assert.equal(reads(), 2);
  r = node(IPHONE, ['profile', '--owner', 'me', '--end'], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROFILE nothing to close/m);
  // `profile` needs the lease, and reads now (exit 0 fits, 8 misfit)
  assert.equal(lock('release', 'iphone', '--owner', 'me').code, 0);
  r = node(IPHONE, ['profile', '--owner', 'me'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /don't hold the iphone lease/);
  assert.equal(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me', '--ttl', '300').code, 0);
  writeFileSync(thermal, 'Serious Yes 33\n');
  r = node(IPHONE, ['profile', '--owner', 'me'], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROFILE serious ok at the hold's start: phone is Serious \(induced by Xcode\), battery 33 C/m);
  r = node(IPHONE, ['profile', '--owner', 'me', '--profile', 'fair'], { env, timeout: 30000 });
  assert.equal(r.code, 8, r.out);
  assert.match(r.stderr, /^REFUSED profile fair \(Nominal or Fair, not induced\): phone is Serious \(induced by Xcode\), battery 33 C; stop it: Xcode > .* > Stop \(leave it off\)/m);
  assert.match(r.stderr, /^STEP C-\d+ posted on the user console/m);
});

test('inside lock.mjs run chrome-measure --no-timing: the hold\'s first run reads, the rest reuse it; the hold makes the end read, marks drift and logs phoneProfile in holds.log', async () => {
  const phone = await fakePhone();
  env.FW_IPHONE_PORT = phone.port;
  writeFileSync(thermal, 'Serious Yes 33\n');
  assert.equal(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me', '--ttl', '300').code, 0);
  const a = join(dir, 'a.json'), b = join(dir, 'b.json');
  const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const cmd = [process.execPath, IPHONE, ...RUN(a)].map(q).join(' ') + ` && printf 'Nominal No 31\\n' > ${q(thermal)} && ` + [process.execPath, IPHONE, ...RUN(b)].map(q).join(' ');
  const r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--no-timing', '--max-seconds', '120', '--', 'sh', '-c', cmd], { env, timeout: 110000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(reads(), 2, 'one start read (the first run), one end read (the hold)');
  assert.match(r.stderr, /^\[lock chrome-measure\] PROFILE-DRIFT serious: at the hold's end the phone is Nominal, battery 31 C .*2 of 2 run records marked profileDrift: true/m);
  for (const f of [a, b]) {
    const m = JSON.parse(readFileSync(f, 'utf8')).meta;
    assert.match(m.profile.hold, /^chrome-measure:[0-9a-f]{12}$/);
    assert.deepEqual([m.profile.start.state, m.profile.end.state, m.profileDrift], ['Serious', 'Nominal', true]);
  }
  const logDir = join(env.FW_STATE_DIR, 'locks');
  const line = readFileSync(join(logDir, 'holds.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((x) => x.owner === 'me' && x.phoneProfile);
  assert.ok(line, readdirSync(logDir).join(','));
  assert.deepEqual(line.phoneProfile.map((x) => [x.profile, x.drift, x.runs, x.stamped, x.start.state, x.end.state]), [['serious', true, 2, 2, 'Serious', 'Nominal']]);
  assert.equal(line.code, 0, 'the exit code stays the command\'s');
});

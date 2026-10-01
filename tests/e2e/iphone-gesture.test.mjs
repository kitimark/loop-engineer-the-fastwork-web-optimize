// tools/iphone.mjs gesture and wda, without the phone (NEW measurement code, finger simulation):
// - gesture end to end against tests/fixtures/fake-webkit-proxy.mjs --wda-port: a fake Safari page (vm window,
//   rAF, touch listeners, scroll + momentum + toolbar model) driven by an in-process fake WebDriverAgent;
// - the guards: lease (like scroll/record), Safari in front, the runtime pull-to-refresh check, a lease lost
//   mid-run, no /source or element calls;
// - wda build|start|status|stop against fake xcodebuild/iproxy, with FW_WDA_HOME and FW_STATE_DIR in temp dirs.
// Never the real phone, its proxy ports, the real WDA (FW_WDA_URL always points at a fake or a free port) or
// the real locks.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, TESTS, REPO, sleep } from '../helpers.mjs';
import { compileScript } from '../../tools/lib/gesture.mjs';
import { pidAlive } from '../../tools/lib/lock.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FIX = join(TESTS, 'fixtures');
const PROTOCOL = join(REPO, 'tools', 'gestures', 'finger-protocol-v1.json');
let env;
before(async () => { env = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_WDA_URL: `http://127.0.0.1:${await freePort()}` }; });
beforeEach(() => { env = { ...env, FW_STATE_DIR: tempDir('fw-gesture-') }; });
const lock = (...a) => node(LOCK, a, { env });
const procs = [];
after(() => Promise.all(procs.map((p) => p.stop())));

const S = (o) => ({ type: 'stroke', dir: 'up', px: 520, ms: 160, profile: 'fling', ...o });
function scriptFile(steps, extra = {}) {
  const f = join(tempDir('fw-gscript-'), 'script.json');
  writeFileSync(f, JSON.stringify({ name: 'e2e', version: 1, screen: [430, 932], steps, ...extra }));
  return f;
}
async function fakePhone(args = []) {
  const dir = tempDir('fw-gphone-');
  const wipLog = join(dir, 'wip.jsonl'), wdaLog = join(dir, 'wda.jsonl');
  const p = await startProc(process.execPath, [join(FIX, 'fake-webkit-proxy.mjs'), '--port=0', '--url=http://192.168.0.2:5441/', '--wda-port=0', ...args],
    { env: { FAKE_WIP_LOG: wipLog, FAKE_WDA_LOG: wdaLog }, ready: (s) => /^FAKE_WDA_PORT=\d+$/m.test(s) });
  procs.push(p);
  const out = p.stdout();
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return {
    env: { ...env, FW_IPHONE_PORT: out.match(/^FAKE_WIP_PORT=(\d+)$/m)[1], FW_WDA_URL: `http://127.0.0.1:${out.match(/^FAKE_WDA_PORT=(\d+)$/m)[1]}` },
    wda: () => read(wdaLog), wip: () => read(wipLog), dir,
  };
}
const actionsCalls = (calls) => calls.filter((c) => /\/actions$/.test(c.path));

test('gesture --dry-run: compiles and prints the strokes and the hash; needs no lease and touches nothing', () => {
  const r = node(IPHONE, ['gesture', PROTOCOL, '--dry-run', '--variant', 'slow', '--param', 'pushes=4'], { env });
  assert.equal(r.code, 0, r.out);
  const want = compileScript(JSON.parse(readFileSync(PROTOCOL, 'utf8')), { params: { variant: 'slow', pushes: '4' } });
  assert.match(r.stdout, new RegExp(`^GESTURE_HASH ${want.hash}$`, 'm'));
  assert.match(r.stdout, /^finger-protocol-v1 v1 hash [0-9a-f]{12} .*"variant":"slow".*"pushes":4.*: 20 strokes/m);
  assert.match(r.stdout, /^ {2}s1 up 450 px \/ 900 ms minjerk: x 215 y 705->255/m);
  const bad = node(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({ dir: 'down' })]), '--dry-run'], { env });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /pull-to-refresh guard/);
});

test('gesture and wda start refuse without the lease (no --owner, nobody holds it, someone else holds it)', () => {
  const f = scriptFile([S({})]);
  for (const cmd of [['gesture', f], ['wda', 'start']]) {
    let r = node(IPHONE, cmd, { env });
    assert.equal(r.code, 1, cmd.join(' '));
    assert.match(r.stderr, /--owner <topic> is required/);
    r = node(IPHONE, [...cmd, '--owner', 'me'], { env });
    assert.match(r.stderr, /you \("me"\) don't hold the iphone lease/);
  }
  lock('acquire', 'iphone', '--owner', 'someone-else');
  for (const cmd of [['gesture', f], ['wda', 'start']]) assert.match(node(IPHONE, [...cmd, '--owner', 'me'], { env }).stderr, /\(holder: "someone-else"\)/);
});

test('gesture end to end on the fake phone: strokes as real touches, recorder, marks, reload, loops, summary', async () => {
  const phone = await fakePhone(['--doc-height=2800', '--prevent-at-end']); // maxY 1985 collapsed
  const f = scriptFile([
    { type: 'reload', scrollAfterMs: 200 },
    { type: 'mark', name: 'go' },
    { type: 'repeat', times: 6, until: 'atEnd', steps: [S({}), { type: 'pause', ms: 300 }] },
    { type: 'until', cond: 'atEnd', timeoutMs: 6000 },
    { type: 'until', cond: 'settled', timeoutMs: 6000, optional: true },
    S({ px: 300, ms: 300, profile: 'still', holdMs: 200 }),
    S({ dir: 'down', px: 450, ms: 400, profile: 'still' }),
    { type: 'repeat', times: 3, until: 'atTop', steps: [S({ dir: 'down', ms: 140 }), { type: 'pause', ms: 800 }] },
  ], { params: { endY: 1900 } });
  lock('acquire', 'iphone', '--owner', 'me', '--url', 'http://192.168.0.2:5441/');
  const out = join(phone.dir, 'run.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--label', 'e2e', '--out', out], { env: phone.env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GESTURE e2e v1 hash [0-9a-f]{12} .* on http:\/\/192\.168\.0\.2:5441\/$/m);
  assert.match(r.stdout, new RegExp(`^saved ${out.replace(/[./]/g, '\\$&')}$`, 'm'));
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.aborted, null);
  assert.deepEqual(doc.run.errors, []);
  assert.equal(doc.program.hash, compileScript(JSON.parse(readFileSync(f, 'utf8'))).hash);
  assert.equal(doc.meta.kind, 'gesture');
  // one page load (the script starts with a reload); every stroke ran in it
  assert.equal(doc.run.segments.length, 1);
  assert.equal(doc.run.reloads.length, 1);
  const seg = doc.run.segments[0];
  assert.ok(seg.frames.length > 50 && seg.frames.every((x) => x.length === 4), 'record-style frames');
  assert.deepEqual(seg.marks.map((m) => m[1]), ['go']);
  assert.ok(seg.sync.length >= 2 && seg.sync.every(([a, , b]) => b >= a));
  const n = doc.run.strokes.length;
  assert.ok(n >= 4, `strokes ${n}`);
  assert.ok(doc.run.strokes.every((s) => s.seg === 0 && s.returnedAt >= s.sentAt));
  // the fake WDA saw exactly those strokes, no bundleId, the idle settings, and never /source or elements
  const calls = phone.wda();
  assert.equal(actionsCalls(calls).length, n);
  assert.ok(!calls.some((c) => c.forbidden));
  assert.ok(!JSON.stringify(calls.find((c) => c.path === '/session').body).includes('bundleId'));
  assert.deepEqual(calls.find((c) => c.path.endsWith('/appium/settings')).body.settings, { waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: 'com.apple.mobilesafari' });
  assert.equal(calls.at(-1).method, 'DELETE');
  // touches: one sequence per stroke, the push at the end prevented by the page, momentum after the flings
  const sm = doc.summary;
  assert.equal(sm.segments[0].touchSequences, n);
  assert.equal(sm.segments[0].aligned, true);
  assert.ok(sm.touchmove.total > 50 && sm.touchmove.endPrevented > 10, JSON.stringify(sm.touchmove));
  assert.ok(sm.momentum.flings >= 2, JSON.stringify(sm.momentum));
  assert.ok(sm.momentum.tauMedianS > 0.3 && sm.momentum.tauMedianS < 0.7, `the fake decays with tau 0.45 s: ${sm.momentum.tauMedianS}`);
  const still = sm.segments[0].perStroke.find((p) => p.profile === 'still' && p.dir === 'down');
  assert.equal(still.tauS, null, 'no momentum after a still stroke');
  assert.ok(sm.toolbar.transitions >= 1);
  // loops: the traverse ended at the end, the fling-to-top loop at the top
  assert.equal(doc.run.loops[0].until, 'atEnd');
  assert.equal(doc.run.loops.at(-1).until, 'atTop');
  assert.ok(['atTop', 'pull guard'].includes(doc.run.loops.at(-1).ended), JSON.stringify(doc.run.loops));
  // the recorder was installed through WIP (passive listeners) after the reload
  assert.ok(phone.wip().some((e) => e.reloaded));
});

test('gesture refuses when Safari is not in front: no stroke is sent', async () => {
  const phone = await fakePhone(['--foreground=com.apple.springboard']);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing: com\.apple\.springboard is in front, not Safari/);
  assert.equal(actionsCalls(phone.wda()).length, 0);
  assert.equal(phone.wda().at(-1).method, 'DELETE', 'the session is closed');
});

test('gesture: the WDA runner itself in front is named without its team id (review-gesture 2)', async () => {
  const phone = await fakePhone(['--foreground=fw.wda.abcde12345.WebDriverAgentRunner.xctrunner']);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing: <runner-bundle-id>\.xctrunner is in front, not Safari/);
  assert.doesNotMatch(r.out, /abcde12345/i);
  assert.equal(actionsCalls(phone.wda()).length, 0);
});

test('gesture: no WDA running is a clean error that says how to start it', async () => {
  lock('acquire', 'iphone', '--owner', 'me');
  const phone = await fakePhone();
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: { ...phone.env, FW_WDA_URL: env.FW_WDA_URL }, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /ECONNREFUSED/);
  assert.match(r.stderr, /node tools\/iphone\.mjs wda start --owner me/);
});

test('runtime pull-to-refresh guard: a down stroke on a short page is refused before it is sent; partial data saved', async () => {
  const phone = await fakePhone(['--doc-height=1100']); // maxY 285-325: below the 450 px the down stroke needs
  const f = scriptFile([{ type: 'reload' }, S({}), { type: 'until', cond: 'atEnd', timeoutMs: 6000 }, S({ dir: 'down', px: 450, ms: 400, profile: 'still' })]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'guard.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /aborted: error: pull-to-refresh guard: s2 \(down 450 px\) needs scrollY >= 450, the page is at \d+; nothing was sent/);
  assert.equal(actionsCalls(phone.wda()).length, 1);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.strokes.length, 1);
  assert.ok(doc.run.segments[0].frames.length > 10, 'the recorder was read despite the abort');
});

test('a lease lost mid-run stops before the next stroke', async () => {
  const phone = await fakePhone();
  const f = scriptFile([{ type: 'reload' }, { type: 'pause', ms: 6000 }, S({})]);
  lock('acquire', 'iphone', '--owner', 'me');
  const run = nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', join(phone.dir, 'lost.json')], { env: phone.env, timeout: 60000 });
  for (let i = 0; i < 100 && !phone.wip().some((e) => e.reloaded); i++) await sleep(100);
  await sleep(1000);
  lock('release', 'iphone', '--owner', 'me');
  const r = await run;
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /lost the iphone lease/);
  assert.equal(actionsCalls(phone.wda()).length, 0);
});

test('a lease too short for the run is refused up front', async () => {
  lock('acquire', 'iphone', '--owner', 'me', '--ttl', '20');
  const r = node(IPHONE, ['gesture', PROTOCOL, '--owner', 'me'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /your iphone lease ends in \d+ s, the run needs ~\d+ s: node tools\/lock\.mjs renew iphone --owner me --ttl 900/);
});

test('--morph-log: installed after each page load, read per segment, morph-active stats in the summary', async () => {
  const phone = await fakePhone();
  const mlog = join(phone.dir, 'morph-calls.jsonl');
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'm.json');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({}), { type: 'reload' }, S({})]), '--owner', 'me', '--label', 'ml', '--out', out, '--morph-log', join(FIX, 'fake-morph-log.mjs')],
    { env: { ...phone.env, FAKE_MORPH_LOG: mlog }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const calls = readFileSync(mlog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls.map((c) => [c[0], c.at(-1)]), [['install', 'me'], ['read', 'me'], ['install', 'me'], ['read', 'me']]);
  assert.ok(calls[1].includes('ml-seg0') && calls[3].includes('ml-seg1'));
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.morph.length, 2);
  assert.ok(existsSync(doc.run.morph[1].file));
  assert.deepEqual(doc.summary.morph, { frames: 6, p50: 30, p95: 60, gt50Pct: 33.3 });
});

// ---- wda build | start | status | stop -------------------------------------------------------------------
function wdaEnv() {
  const home = tempDir('fw-wdahome-');
  for (const f of ['fake-xcodebuild.mjs', 'fake-iproxy.mjs', 'fake-ideviceinfo.mjs']) chmodSync(join(FIX, f), 0o755);
  const logs = tempDir('fw-wdalogs-');
  return { home, logs, env: { ...env, FW_WDA_HOME: home, FW_XCODEBUILD: join(FIX, 'fake-xcodebuild.mjs'), FW_IPROXY: join(FIX, 'fake-iproxy.mjs'), FW_IDEVICE_ID: '/usr/bin/false', FW_IDEVICEINFO: join(FIX, 'fake-ideviceinfo.mjs'), FW_SECURITY: '/usr/bin/false', FAKE_XCODEBUILD_LOG: join(logs, 'xb.jsonl'), FAKE_IPROXY_LOG: join(logs, 'ip.jsonl'), FAKE_WDA_LOG: join(logs, 'wda.jsonl') } };
}

/** The made-up account/device ids of the fakes: never in what the tools print (review-gesture 2, Hard rule 12). */
const IDS = [/ABCDE12345/i, /0011223344556677/, /Kitchen Phone/, /Test Person/, /example\.com/, /00AABBCCDDEEFF00/, /1A2B3C4D-1111/, /0123456789abcdef0123/];

/** `wda build` inside our own chrome-measure hold, the only way it runs (review-gesture 1). */
const heldBuild = (w, args, extra = {}) => node(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--max-seconds', '600', '--', process.execPath, IPHONE, 'wda', 'build', '--owner', 'me', ...args], { env: { ...w.env, ...extra }, timeout: 60000 });

test('wda build: lease; only inside our own chrome-measure hold (not on a free lock, not under someone\'s short job); sources outside the repo', () => {
  const w = wdaEnv();
  const wda = (...a) => node(IPHONE, ['wda', ...a], { env: w.env, timeout: 30000 });
  assert.match(wda('build').stderr, /--owner <topic> is required/);
  assert.match(wda('build', '--owner', 'me').stderr, /you \("me"\) don't hold the iphone lease/);
  lock('acquire', 'iphone', '--owner', 'me');
  let r = wda('status');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^sources: +missing; run: git clone --depth 1 --branch v[0-9.]+ https://github\\.com/appium/WebDriverAgent ${w.home}/WebDriverAgent$`, 'm'));
  assert.match(r.stdout, /^build: +none/m);
  assert.match(r.stdout, /^wda: +not reachable/m);
  const HOLD = /\n {2}node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 600 -- node tools\/iphone\.mjs wda build --owner me/;
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  const xbCalls = () => (existsSync(w.env.FAKE_XCODEBUILD_LOG) ? readFileSync(w.env.FAKE_XCODEBUILD_LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  // a free lock: a queued A/B would be granted it mid-build
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is free, but this process does not hold it/);
  assert.match(r.stderr, HOLD);
  // someone measuring
  lock('acquire', 'chrome-measure', '--owner', 'measurer', '--ttl', '300');
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is held by "measurer", not by this process/);
  lock('release', 'chrome-measure', '--owner', 'measurer');
  // someone's short-lane job (npm test): it ends within 300 s and the next A/B would start mid-build
  lock('acquire', 'chrome-measure', '--owner', 'npm-test', '--short', '--max-seconds', '120');
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is held by "npm-test" \(a short-lane job\), not by this process/);
  lock('release', 'chrome-measure', '--owner', 'npm-test');
  assert.equal(xbCalls(), 0, 'xcodebuild never ran outside our hold');
  // inside our own hold (lock.mjs run): the remaining checks
  rmSync(join(w.home, 'WebDriverAgent'), { recursive: true });
  r = heldBuild(w, []);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /WebDriverAgent sources missing .* Fetch them once:\n {2}git clone --depth 1 --branch/s);
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  r = heldBuild(w, []);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no signing team .*Xcode > Settings > Accounts/s);
  r = heldBuild(w, ['--team', 'ABCDE12345']);
  assert.match(r.stderr, /no iPhone .*on USB/);
  r = heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677'], { FAKE_XCODEBUILD_FAIL: '1' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /xcodebuild build-for-testing failed \(exit 65\); last lines of .*build\.log:\n.*requires a development team/s);
  // review-gesture 2: the log tail is scrubbed (team, UDIDs, device names, runner bundle id, e-mail, identity name)...
  for (const s of IDS) assert.doesNotMatch(r.out, s, `${s} printed:\n${r.stderr}`);
  assert.match(r.stderr, /No Account for Team "<team>"/);
  assert.match(r.stderr, /name:<device>/);
  assert.match(r.stderr, /"<device-name>" is busy/);
  // ...while the local log outside the repo keeps the real values (read there, never printed)
  assert.match(readFileSync(join(w.home, 'build.log'), 'utf8'), /Kitchen Phone 7.*ABCDE12345/s);
  r = heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /inside your chrome-measure hold \(stopped after 540 s\)/);
  assert.match(r.stdout, /^WDA_BUILT .*WebDriverAgentRunner_iphoneos26\.6-arm64\.xctestrun$/m);
  for (const s of IDS) assert.doesNotMatch(r.out, s, 'account and device ids are not printed in full');
  const args = JSON.parse(readFileSync(w.env.FAKE_XCODEBUILD_LOG, 'utf8').trim().split('\n').at(-1));
  for (const a of ['build-for-testing', '-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=ABCDE12345', 'PRODUCT_BUNDLE_IDENTIFIER=fw.wda.abcde12345.WebDriverAgentRunner', 'id=00008130-0011223344556677', '-derivedDataPath']) assert.ok(args.includes(a), a);
  assert.ok(args[args.indexOf('-derivedDataPath') + 1].startsWith(w.home), 'DerivedData outside the repo');
  const cfg = JSON.parse(readFileSync(join(w.home, 'config.json'), 'utf8'));
  assert.deepEqual([cfg.team, cfg.udid, cfg.deviceName], ['ABCDE12345', '00008130-0011223344556677', 'Kitchen Phone 7'], 'the device name is kept locally, to scrub it');
  r = wda('status');
  assert.match(r.stdout, /^build: +ok \(WebDriverAgentRunner_iphoneos26\.6-arm64\.xctestrun\)/m);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

test('wda start: a runner that fails to launch is a clean error whose xcodebuild log tail carries no ids (review-gesture 2)', async () => {
  const w = wdaEnv();
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  lock('acquire', 'iphone', '--owner', 'me');
  assert.equal(heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']).code, 0);
  const r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me', '--timeout', '20'], { env: { ...w.env, FAKE_XCODEBUILD_RUN_FAIL: '1' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /WDA did not come up at http:\/\/127\.0\.0\.1:\d+; last lines of .*runner\.log:\n.*TEST EXECUTE FAILED/s);
  assert.match(r.stderr, /No profiles for '<runner-bundle-id>\.xctrunner'/);
  for (const s of IDS) assert.doesNotMatch(r.out, s, `${s} printed:\n${r.stderr}`);
  assert.ok(!existsSync(join(env.FW_STATE_DIR, 'wda', 'runner.json')), 'the failed runner was cleaned up');
});

test('wda start (lease) runs the runner and iproxy, activates Safari; status sees them; stop kills only them', async () => {
  const w = wdaEnv();
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  lock('acquire', 'iphone', '--owner', 'me');
  assert.equal(heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']).code, 0);
  let r = node(IPHONE, ['wda', 'start'], { env: w.env });
  assert.match(r.stderr, /--owner <topic> is required/);
  r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me', '--timeout', '30'], { env: w.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^WDA_READY http:\/\/127\.0\.0\.1:\d+ \(Safari in front\)$/m);
  const pids = ['runner', 'iproxy'].map((n) => JSON.parse(readFileSync(join(env.FW_STATE_DIR, 'wda', `${n}.json`), 'utf8')));
  assert.ok(pids.every((p) => pidAlive(p.pid) && p.owner === 'me'));
  assert.ok(!JSON.stringify(pids).includes('0011223344556677'), 'pidfiles do not store the device id');
  assert.deepEqual(JSON.parse(readFileSync(w.env.FAKE_IPROXY_LOG, 'utf8').trim()), ['8100:8100', '-u', '00008130-0011223344556677']);
  const calls = readFileSync(w.env.FAKE_WDA_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(calls.some((c) => c.path.endsWith('/wda/apps/activate') && c.body.bundleId === 'com.apple.mobilesafari'));
  // again: already running is fine
  r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me'], { env: w.env, timeout: 30000 });
  assert.match(r.stdout, /already running/);
  r = await nodeAsync(IPHONE, ['wda', 'status'], { env: w.env, timeout: 30000 });
  assert.match(r.stdout, /^runner +running pid \d+ .*\(by me\)$/m);
  assert.match(r.stdout, /^wda: +ready=true build fake/m);
  r = await nodeAsync(IPHONE, ['wda', 'stop'], { env: w.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /stopped runner \(pid \d+\)\nstopped iproxy \(pid \d+\)/);
  for (let i = 0; i < 50 && pids.some((p) => pidAlive(p.pid)); i++) await sleep(100);
  assert.ok(pids.every((p) => !pidAlive(p.pid)));
  assert.match((await nodeAsync(IPHONE, ['wda', 'stop'], { env: w.env })).stdout, /WDA was not running/);
});

// tools/iphone.mjs without the phone: lease gating for open/scroll/record, argument handling, and
// `status` when ios_webkit_debug_proxy is not reachable. FW_IPHONE_PORT / FW_IPHONE_DEVICE_PORT point at
// ports with nothing listening and FW_STATE_DIR at a temp lock dir, so the real (shared) iPhone, its
// proxy on :9221/:9222 and the real iphone lease are never touched.
// `open` against a self-signed --https mirror (incident I-003) runs end to end against
// tests/fixtures/fake-webkit-proxy.mjs, a fake proxy + Safari that does not trust the certificate.
// I-037: with another app's background about:blank web view listed before Safari's tab, open still drives Safari's.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startServe, startProc, request, sleep, TESTS } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
let env;
before(async () => {
  env = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '4.5', // load1: never the host's (I-056 records it, I-057)
    // open's restart fallback (I-077) never reaches the real WDA or the real phone: no WDA here, no device configured
    FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FW_WDA_HOME: tempDir('fw-iphone-wdahome-'), FW_DEVICECTL: join(TESTS, 'fixtures', 'fake-devicectl.mjs') };
});
beforeEach(() => { env = { ...env, FW_STATE_DIR: tempDir('fw-iphone-') }; });
const iphone = (...a) => node(IPHONE, a, { env, timeout: 20000 });
const lock = (...a) => node(LOCK, a, { env });

test('status: proxy not reachable is reported, not a crash; lease state shown', () => {
  const r = iphone('status');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^device: \\{"error":"proxy not reachable on :${env.FW_IPHONE_DEVICE_PORT}`, 'm'));
  assert.match(r.stdout, new RegExp(`^tabs: \\[\\{"error":"proxy not reachable on :${env.FW_IPHONE_PORT}`, 'm'));
  assert.match(r.stdout, /^lease: free/m);
  lock('acquire', 'iphone', '--owner', 'topic-a');
  lock('acquire', 'iphone', '--owner', 'topic-b');
  assert.match(iphone('status').stdout, /^lease: topic-a until .* queue: topic-b$/m);
});

test('open / scroll / record refuse without the lease (no --owner, nobody holds it, someone else holds it)', () => {
  for (const cmd of [['open', 'https://192.168.1.2:5231/'], ['scroll'], ['record', '--seconds', '1']]) {
    let r = iphone(...cmd);
    assert.equal(r.code, 1, cmd.join(' '));
    assert.match(r.stderr, /--owner <topic> is required/);
    r = iphone(...cmd, '--owner', 'me');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /you \("me"\) don't hold the iphone lease\. Run: node tools\/lock\.mjs acquire iphone --owner me/);
  }
  lock('acquire', 'iphone', '--owner', 'someone-else');
  for (const cmd of [['open', 'https://192.168.1.2:5231/'], ['scroll'], ['record']]) {
    const r = iphone(...cmd, '--owner', 'me');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /\(holder: "someone-else"\)/);
  }
});

test('an expired lease does not count, even for its former owner', () => {
  lock('acquire', 'iphone', '--owner', 'me', '--ttl', '1');
  const wait = Date.now() + 1300; while (Date.now() < wait); // let the 1 s lease expire
  const r = iphone('scroll', '--owner', 'me');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /\(holder: "me", stale\)/);
});

test('with the lease: bad open URL is a usage error; unreachable proxy fails cleanly (FW_LOCK_OWNER works)', () => {
  lock('acquire', 'iphone', '--owner', 'me');
  let r = iphone('open', 'not-a-url', '--owner', 'me');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /usage: node tools\/iphone\.mjs open <url>/);
  r = node(IPHONE, ['scroll'], { env: { ...env, FW_LOCK_OWNER: 'me' } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /fetch failed|ECONNREFUSED/);
  assert.doesNotMatch(r.stderr, /don't hold/);
});

test('I-056: scroll / record refuse (WAIT) beside someone else\'s normal hold, and beside a shared group with --require-quiet, before Safari (by default a shared group only gets a NOTE); the runner\'s own --no-timing hold passes', () => {
  lock('acquire', 'iphone', '--owner', 'me');
  // past the guard, scroll fails at once on the missing proxy; record retries openTab, so it is cut short (4 s)
  const past = (r) => /fetch failed|ECONNREFUSED|openTab try 1/.test(r.stderr) && !/WAIT/.test(r.stderr);
  const rec = (...a) => node(IPHONE, ['record', '--seconds', '1', '--owner', 'me', ...a], { env, timeout: 4000 });
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'fix-ab').code, 0);
  for (const r of [iphone('scroll', '--owner', 'me'), rec()]) {
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /^WAIT: chrome-measure is held by "fix-ab" \(a normal hold, e\.g\. a goal A\/B\): .*lock\.mjs run chrome-measure --owner me --no-timing/m);
  }
  assert.ok(past(iphone('scroll', '--owner', 'me', '--allow-during-measure')), 'scroll --allow-during-measure goes on to Safari');
  assert.ok(past(rec('--allow-during-measure')), 'record --allow-during-measure goes on to Safari');
  assert.equal(lock('release', 'chrome-measure', '--owner', 'fix-ab').code, 0);
  assert.equal(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
  assert.equal(lock('acquire', 'chrome-measure', '--shared', '--weight', '3', '--max-seconds', '60', '--owner', 'sim-x').code, 0);
  // default (Mac-quiet preferred, not required): past the guard, with one NOTE line
  for (const r of [iphone('scroll', '--owner', 'me'), rec()]) {
    assert.ok(past(r), r.out);
    assert.match(r.stdout, /^NOTE: shared jobs hold chrome-measure beside this phone run \("sim-x" w3; load1 4\.5\)/m);
  }
  // --require-quiet, or FW_PHONE_REQUIRE_QUIET=1: WAIT, before Safari
  for (const r of [iphone('scroll', '--owner', 'me', '--require-quiet'), rec('--require-quiet'), node(IPHONE, ['scroll', '--owner', 'me'], { env: { ...env, FW_PHONE_REQUIRE_QUIET: '1' }, timeout: 20000 })]) {
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /^WAIT: chrome-measure is held by the shared lane \("sim-x" w3\), and this run asks for a quiet Mac/m);
    assert.doesNotMatch(r.stderr, /fetch failed|ECONNREFUSED|openTab/);
  }
  assert.equal(lock('release', 'chrome-measure', '--shared', '--owner', 'sim-x').code, 0);
  // the runner's own hold: inside its --no-timing `run` (another owner name: FW_LOCK_HELD carries the hold) ...
  const r = lock('run', 'chrome-measure', '--owner', 'g1-hold', '--no-timing', '--max-seconds', '60', '--', 'sh', '-c',
    `${JSON.stringify(process.execPath)} ${JSON.stringify(IPHONE)} scroll --owner me; echo "scroll=$?"`);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^scroll=1$/m);
  assert.ok(past(r), `no refusal inside the own no-timing hold: ${r.stderr}`);
  // ... or a hold of the same owner
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'me').code, 0);
  assert.ok(past(rec()), 'record in the same owner\'s hold goes on to Safari');
});

test('unknown command prints usage', () => {
  const r = iphone('dance');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^usage: node tools\/iphone\.mjs status \| open/);
});

// ---- incident I-003: self-signed https stops Safari at its certificate warning page -------------------
const procs = [];
after(async () => { await Promise.all(procs.map((p) => p.stop())); });
let home;
async function mirror(args) {
  home ||= tempDir('fw-iphone-home-');
  if (!existsSync(join(home, 'site'))) makeFixtureHome(home);
  const s = await startServe(['--port', '0', '--quiet', ...args], { env: { FW_MIRROR_HOME: home } });
  procs.push(s);
  return s;
}
async function fakePhone(args = []) {
  const log = join(tempDir('fw-wip-'), 'wip.jsonl');
  const wda = args.includes('--wda-port=0'); // also a fake WDA (safari-restart's driver, I-077)
  const p = await startProc(process.execPath, [join(TESTS, 'fixtures', 'fake-webkit-proxy.mjs'), '--port=0', '--url=http://127.0.0.1:9/start', ...args],
    { env: { FAKE_WIP_LOG: log, FAKE_WDA_LOG: `${log}.wda` }, ready: (s) => (wda ? /^FAKE_WDA_PORT=\d+$/m : /^FAKE_WIP_PORT=\d+$/m).test(s) });
  procs.push(p);
  const port = p.stdout().match(/^FAKE_WIP_PORT=(\d+)$/m)[1];
  const events = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const navigations = () => events().filter((e) => e.navigate).map((e) => e.navigate);
  const blankConnects = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter((l) => l.includes('"blankViewConnected"')).length : 0);
  const wdaCalls = () => (existsSync(`${log}.wda`) ? readFileSync(`${log}.wda`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((c) => `${c.method} ${c.path.replace(/FAKE-\d+/, ':id')}`) : []);
  const wdaEnv = wda ? { FW_WDA_URL: `http://127.0.0.1:${p.stdout().match(/^FAKE_WDA_PORT=(\d+)$/m)[1]}` } : {};
  return { env: { ...env, FW_IPHONE_PORT: port, ...wdaEnv }, port, navigations, blankConnects, events, wdaCalls };
}
const infoOf = async (s) => JSON.parse((await request(s.url + '__mirror/info')).text);
const lan = (s) => s.url.replace('localhost', '127.0.0.1'); // what an agent passes: the LAN-style URL, not localhost

test('I-003: open <self-signed https mirror URL> navigates Safari to the plain-http twin instead', async () => {
  const s = await mirror(['--https']);
  const twin = (await infoOf(s)).httpTwin;
  assert.ok(twin > 0, 'serve.mjs --https reports its plain-http twin port');
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['open', lan(s) + 'sub/', '--owner', 'me'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const want = `http://127.0.0.1:${twin}/sub/`;
  assert.match(r.stdout, /self-signed/);
  assert.ok(r.stdout.includes(`plain-http twin ${want}`), r.stdout);
  assert.match(r.stdout, new RegExp(`^Safari now on ${want.replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(phone.navigations(), [want]);
});

test('I-003: open --keep-https that lands on the certificate warning fails loudly and names the http URL', async () => {
  const s = await mirror(['--https']);
  const twin = (await infoOf(s)).httpTwin;
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me', '--keep-https'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(phone.navigations(), [lan(s)]);
  assert.match(r.stderr, /certificate warning/i);
  assert.match(r.stderr, new RegExp(`http://127\\.0\\.0\\.1:${twin}/`));
  assert.doesNotMatch(r.stdout, /^Safari now on/m);
});

test('I-003: a self-signed https mirror without a twin is refused before touching Safari', async () => {
  const s = await mirror(['--https', '--no-http-twin']);
  assert.equal((await infoOf(s)).httpTwin, null);
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /self-signed/);
  assert.match(r.stderr, /without --https/);
  assert.deepEqual(phone.navigations(), []);
});

test('I-003: open <plain http mirror URL> works as before and checks it landed on the mirror', async () => {
  const s = await mirror([]);
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^Safari now on ${lan(s).replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(phone.navigations(), [lan(s)]);
});

test('I-073: open http://lan:<port>/ (and lan-host) resolves the placeholder to the LAN address now, then follows the I-003 twin rule; no LAN address fails before Safari', async () => {
  const s = await mirror(['--https']);
  const port = new URL(s.url).port, twin = (await infoOf(s)).httpTwin;
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const lanEnv = { ...phone.env, FW_LAN_ADDRESS: '127.0.0.1' }; // the fake phone and the mirror live on loopback
  let r = await nodeAsync(IPHONE, ['open', `https://lan:${port}/sub/`, '--owner', 'me'], { env: lanEnv, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const want = `http://127.0.0.1:${twin}/sub/`;
  assert.match(r.stdout, new RegExp(`^Safari now on ${want.replace(/[./]/g, '\\$&')}$`, 'm'));
  r = await nodeAsync(IPHONE, ['open', `http://lan-host:${twin}/`, '--owner', 'me'], { env: lanEnv, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(phone.navigations(), [want, `http://127.0.0.1:${twin}/`]);
  r = await nodeAsync(IPHONE, ['open', `http://lan:${twin}/`, '--owner', 'me'], { env: { ...phone.env, FW_LAN_IFACES: '{}' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no LAN address/);
  assert.equal(phone.navigations().length, 2, 'Safari untouched');
});

test('I-037: another app\'s about:blank web view listed before Safari\'s tab is never picked; open drives Safari\'s tab; status shows appIds', async () => {
  const s = await mirror([]);
  const phone = await fakePhone(['--blank-view']);
  const st = await nodeAsync(IPHONE, ['status'], { env: phone.env, timeout: 20000 });
  assert.match(st.stdout, /^tabs: \[\{"url":"about:blank","title":"","appId":"PID:1304"\},\{"url":"http:\/\/127\.0\.0\.1:9\/start","title":"start","appId":"PID:4242"\}\]$/m, st.out);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^Safari now on ${lan(s).replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(phone.navigations(), [lan(s)]);
  assert.equal(phone.blankConnects(), 0, 'the blank view was never connected to');
  assert.doesNotMatch(r.stderr, /openTab try/, 'first try');
});

test('I-047: park needs the lease, navigates Safari\'s tab (not another app\'s blank view) to about:blank, and is a no-op when parked', async () => {
  const phone = await fakePhone(['--blank-view']);
  let r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /you \("me"\) don't hold the iphone lease/);
  lock('acquire', 'iphone', '--owner', 'someone-else');
  r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.match(r.stderr, /\(holder: "someone-else"\)/);
  assert.deepEqual(phone.navigations(), [], 'nothing touched without the lease');
  lock('release', 'iphone', '--owner', 'someone-else');
  lock('acquire', 'iphone', '--owner', 'me');
  r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, 'PARKED Safari on about:blank (was http://127.0.0.1:9/start)\n');
  assert.deepEqual(phone.navigations(), ['about:blank']);
  assert.equal(phone.blankConnects(), 0, 'the other app\'s blank view was never connected to (I-037)');
  const st = await nodeAsync(IPHONE, ['status'], { env: phone.env, timeout: 20000 });
  assert.match(st.stdout, /^tabs: \[\{"url":"about:blank","title":"","appId":"PID:1304"\},\{"url":"about:blank","title":"","appId":"PID:4242"\}\]$/m, st.out);
  r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, 'PARKED already: Safari shows no web page\n');
  assert.deepEqual(phone.navigations(), ['about:blank'], 'parked once');
  assert.match(iphone('dance').stdout, /\| park --owner <topic> \|/, 'the usage names park');
});

// ---- incident I-077: after a park the proxy lists only blank views; open used to fail with BLOCKED ----------------
test('I-077: after a park, open loads the URL in Safari\'s parked tab (the visible one of Safari\'s blank views), never in another app\'s view or Safari\'s hidden one', async () => {
  const s = await mirror([]);
  const phone = await fakePhone(['--blank-view', '--parked-twin']);
  lock('acquire', 'iphone', '--owner', 'me');
  let r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  const st = await nodeAsync(IPHONE, ['status'], { env: phone.env, timeout: 20000 });
  assert.match(st.stdout, /^tabs: \[\{"url":"about:blank","title":"","appId":"PID:1304"\},\{"url":"about:blank","title":"","appId":"PID:4242"\},\{"url":"about:blank","title":"","appId":"PID:4242"\}\]$/m, 'what the phone lists after a park: Safari\'s two blank views (and another app\'s)');
  r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Safari is parked \(only blank views listed, I-047\): loading the URL in Safari's parked tab \(PID:4242, I-077\)$/m);
  assert.match(r.stdout, new RegExp(`^Safari now on ${lan(s).replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(phone.navigations(), ['about:blank', lan(s)]);
  assert.deepEqual(phone.events().filter((e) => e.twinNavigate), [], 'Safari\'s hidden blank view was not navigated');
  assert.equal(phone.blankConnects(), 0, 'the other app\'s blank view was never connected to (I-037)');
  assert.doesNotMatch(r.out, /BLOCKED|openTab try 1:/);
  assert.deepEqual(phone.wdaCalls(), [], 'no restart');
});

test('I-077: no record of Safari\'s app, or a stale one (Safari restarted since the park): open restarts Safari and loads the URL; --no-restart and a Simulator session refuse with what works', async () => {
  const s = await mirror([]);
  const phone = await fakePhone(['--blank-view', '--parked-twin', '--new-pid-on-launch', '--launch-ms=200', '--wda-port=0']);
  const fresh = { ...phone.env, FW_STATE_DIR: tempDir('fw-iphone-') }; // no park recorded here
  node(LOCK, ['acquire', 'iphone', '--owner', 'me'], { env: fresh });
  lock('acquire', 'iphone', '--owner', 'me');
  let r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);

  r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me', '--no-restart'], { env: fresh, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^Safari is parked \(only blank views listed, I-047\) and open can't use its tab: no record of Safari's app \(a park records it, I-077\)[^\n]*; without --no-restart, open restarts Safari and loads the URL \(iphone\.mjs safari-restart --owner me --url <url>\)$/m);
  r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me'], { env: { ...fresh, FW_SIM_SESSION: 'sim-test' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /in a Simulator session: node tools\/sim\.mjs safari-restart --url <url>/);
  assert.deepEqual(phone.navigations(), ['about:blank'], 'nothing navigated');
  assert.deepEqual(phone.wdaCalls(), [], 'nothing restarted');

  // Safari restarts (a new pid), the tab it restores is still about:blank: the recorded pid is stale
  await request(`http://127.0.0.1:${phone.port}/__fake/app?kind=terminate`);
  await request(`http://127.0.0.1:${phone.port}/__fake/app?kind=launch`);
  for (let i = 0; i < 100 && !(await request(`http://127.0.0.1:${phone.port}/json`)).text.includes('PID:4243'); i++) await new Promise((r) => setTimeout(r, 50)); // --launch-ms=200
  const st = await nodeAsync(IPHONE, ['status'], { env: phone.env, timeout: 20000 });
  assert.match(st.stdout, /"appId":"PID:4243"/, st.out);
  r = await nodeAsync(IPHONE, ['open', lan(s), '--owner', 'me', '--timeout', '9'], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Safari is parked \(only blank views listed, I-047\) and open can't use its tab: Safari's app at the last park \(PID:4242\) is not listed: Safari restarted since[^\n]*; restarting Safari to load the URL \(I-077\)$/m);
  assert.match(r.stdout, /^restarting Safari via wda, then loading /m);
  assert.match(r.stdout, new RegExp(`^SAFARI_RESTARTED via wda in \\d+ ms: ${lan(s).replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.match(r.stdout, new RegExp(`^Safari now on ${lan(s).replace(/[./]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(phone.wdaCalls().filter((c) => /apps\/(terminate|launch)|\/url$/.test(c)), ['POST /session/:id/wda/apps/terminate', 'POST /session/:id/wda/apps/launch', 'POST /session/:id/url']);
  assert.deepEqual(phone.events().filter((e) => e.twinNavigate), [], 'Safari\'s hidden blank view was not navigated');
  assert.equal(phone.blankConnects(), 0, 'the other app\'s blank view was never connected to (I-037)');
});

test('I-060: a phone run marks the lease with what it runs (from --label, or --doing), clears it at its end; a killed run leaves a dead-pid marker the page ignores', async () => {
  const { deviceView } = await import('../../tools/lib/progress.mjs');
  const phone = await fakePhone(['--page']); // a page model: record's in-page logger runs
  const state = phone.env.FW_STATE_DIR, outDir = tempDir('fw-iphone-out-');
  const leaseFile = () => JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
  lock('acquire', 'iphone', '--owner', 'me', '--url', 'http://192.168.77.3:5231/');
  // a bad --doing is refused before the phone is touched
  let r = await nodeAsync(IPHONE, ['record', '--owner', 'me', '--seconds', '1', '--doing', 'see http://192.168.77.3:5231/'], { env: phone.env, timeout: 20000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /--doing contains a url.*Hard rule 12/);
  assert.equal(leaseFile().meta.run, undefined);
  // during a record: meta.run from --label, with the run's pid; gone after it ends
  const rec = (args) => startProc(process.execPath, [IPHONE, 'record', '--owner', 'me', '--out', join(outDir, `r-${Date.now()}.json`), ...args], { env: phone.env, ready: (s) => /^RECORDING/m.test(s), timeout: 30000 });
  let p = await rec(['--seconds', '2', '--label', 'finger-a']);
  procs.push(p);
  let run = leaseFile().meta.run;
  assert.equal(run.text, 'finger recording "finger-a" (a person scrolls the phone)');
  assert.equal(run.pid, p.proc.pid);
  assert.equal(leaseFile().meta.url, 'http://192.168.77.3:5231/', 'the lease URL stays');
  assert.equal((await p.exited).code, 0, p.stdout() + p.stderr());
  assert.equal(leaseFile().meta.run, undefined, 'cleared when the run ends');
  // --doing wins over the label; a killed run leaves its marker, which the page ignores (its pid is gone)
  p = await rec(['--seconds', '30', '--label', 'finger-b', '--doing', 'finger test for the blur change']);
  procs.push(p);
  assert.equal(leaseFile().meta.run.text, 'finger test for the blur change');
  await p.stop('SIGKILL');
  run = leaseFile().meta.run;
  assert.equal(run.pid, p.proc.pid);
  const view = deviceView({ holder: leaseFile(), queue: [] }, { resource: 'iphone', board: [] });
  assert.equal(view.jobs[0].run, null, 'a dead run marker is not shown');
  // a failing scroll (no proxy) clears its marker too
  r = iphone('scroll', '--owner', 'me', '--label', 'patched');
  assert.equal(r.code, 1, r.out);
  assert.equal(leaseFile().meta.run, undefined);
});

// I-141 (C-045 / C-046: a 45 s finger recording lost whole when its one final read timed out)
async function recordWith(control, { seconds = 4, after = 1500, extra = [] } = {}) {
  const phone = await fakePhone(['--page']);
  node(LOCK, ['acquire', 'iphone', '--owner', 'me'], { env: phone.env });
  const out = join(tempDir('fw-iphone-out-'), 'rec.json');
  const p = await startProc(process.execPath, [IPHONE, 'record', '--owner', 'me', '--seconds', String(seconds), '--poll', '1', '--out', out, ...extra],
    { env: { ...phone.env, FW_RECORD_READ_MS: '800' }, ready: (s) => /^RECORDING/m.test(s), timeout: 30000 });
  procs.push(p);
  await sleep(after);
  if (control) assert.equal((await request(`http://127.0.0.1:${phone.port}${control}`)).text, 'ok');
  const x = await p.exited;
  return { code: x.code, out: p.stdout() + p.stderr(), stdout: p.stdout(), rec: existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null, phone };
}

test('I-141: record polls (--poll 1) and saves; a page that stops answering and leaves the tab list ends as PARTIAL (exit 6) with the frames so far and a diag', async () => {
  const r = await recordWith('/__fake/stall?ms=30000&unlist=1');
  assert.equal(r.code, 6, r.out);
  assert.match(r.stdout, /^PARTIAL saved \S+rec\.json: a poll \d+(\.\d)? s into the run failed \(Runtime\.evaluate timed out after 800ms/m);
  assert.equal(r.rec.partial, true);
  assert.ok(r.rec.frames.length > 20, `frames up to the last poll: ${r.rec.frames.length}`);
  assert.ok(r.rec.stream.polls >= 1);
  assert.deepEqual(r.rec.summary.all.frames, r.rec.frames.length, 'the summary covers the partial frames');
  assert.equal(r.rec.meta.owner, 'me');
  const [d] = r.rec.diag;
  assert.equal(d.phase, 'poll');
  assert.deepEqual(d.tabs, [], 'the proxy listed no tab');
  assert.equal(d.reconnect.ok, false);
  assert.match(d.reconnect.error, /BLOCKED: cannot reach Safari tab/);
});

test('I-141: the tab navigated away (a link): its target is destroyed; one reconnect sees the new page without the logger; PARTIAL with where it went', async () => {
  const r = await recordWith(`/__fake/navigate?url=${encodeURIComponent('http://127.0.0.1:9/next')}`);
  assert.equal(r.code, 6, r.out);
  assert.equal(r.rec.partial, true);
  assert.ok(r.rec.targetEvents.some((e) => e.event === 'targetDestroyed'), JSON.stringify(r.rec.targetEvents));
  const [d] = r.rec.diag;
  assert.deepEqual([d.reconnect.ok, d.reconnect.href, d.reconnect.logger, d.reconnect.sameDocument], [true, 'http://127.0.0.1:9/next', false, false]);
  assert.match(r.rec.reason, /after a reconnect the tab shows http:\/\/127\.0\.0\.1:9\/next \(visible\) without this run's logger/);
});

test('I-141: a short stall: the failed poll reconnects once, finds the logger and the run goes on (recovered, exit 0, the final read is whole)', async () => {
  const r = await recordWith('/__fake/stall?ms=2000', { seconds: 6 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^saved \S+rec\.json$/m);
  assert.equal(r.rec.partial, undefined);
  assert.equal(r.rec.recovered, true);
  assert.equal(r.rec.diag.length, 1);
  assert.equal(r.rec.diag[0].reconnect.sameDocument, true);
  assert.ok(r.rec.frames.length > 200, `every frame of the run: ${r.rec.frames.length}`);
  assert.equal(r.rec.stop, true, 'the old final read\'s record');
  const evs = r.phone.events().filter((e) => e.evaluate && e.evaluate.includes('window.__fr.stop = true'));
  assert.equal(evs.length, 1, 'one final read');
});

test('I-070 (C-024): scroll / record / run / gesture keep the Mac awake for their own lifetime (caffeinate -i -s -w <own pid>), gone after; status, open, park, a dry-run gesture and a refused run (no lease) do not', async () => {
  const log = join(env.FW_STATE_DIR, 'caffeinate.jsonl');
  const cenv = { ...env, FW_CAFFEINATE: join(TESTS, 'fixtures', 'fake-caffeinate.mjs'), FAKE_CAFFEINATE_LOG: log };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
  const wait = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 50)); return f(); };
  const ip = (args, timeout = 20000) => node(IPHONE, args, { env: cenv, timeout });
  const GESTURE = join(TESTS, '..', 'tools', 'gestures', 'slow-drag-v1.json');
  // no lease: refused before anything starts
  assert.equal(ip(['scroll', '--owner', 'me']).code, 1);
  assert.equal(ip(['status']).code, 0);
  assert.equal(ip(['gesture', GESTURE, '--dry-run']).code, 0);
  assert.equal(lock('acquire', 'iphone', '--owner', 'me').code, 0);
  ip(['open', 'not-a-url', '--owner', 'me']);
  ip(['park', '--owner', 'me']);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(calls(), [], 'no measurement, no assertion');
  // the phone runs: each fails on the missing proxy, after it started its own assertion
  const runs = [['scroll', '--owner', 'me'], ['record', '--seconds', '1', '--owner', 'me'], ['run', '--driver', 'scroll', '--probe', 'std', '--owner', 'me'], ['gesture', GESTURE, '--owner', 'me']];
  for (const [i, a] of runs.entries()) {
    const r = ip(a, a[0] === 'record' ? 4000 : 20000);
    assert.notEqual(r.code, 0, `${a[0]} cannot reach the (absent) phone: ${r.out}`);
    assert.ok(await wait(() => calls().length > i), `${a[0]} started an assertion`);
    const c = calls()[i];
    assert.deepEqual(c.args.slice(0, 3), ['-i', '-s', '-w'], a[0]);
    assert.ok(!alive(Number(c.args[3])), `${a[0]}: -w names the phone run's own process, which has ended`);
    const gone = await wait(() => !alive(c.pid));
    if (!gone) process.kill(c.pid, 'SIGKILL');
    assert.ok(gone, `${a[0]}: the assertion ended with the run`);
  }
  assert.equal(calls().length, runs.length, 'one assertion per run');
});

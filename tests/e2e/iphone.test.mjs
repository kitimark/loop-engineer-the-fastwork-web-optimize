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
import { tempDir, node, nodeAsync, tool, freePort, startServe, startProc, request, TESTS } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
let env;
before(async () => {
  env = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '4.5' }; // load1: never the host's (I-056 records it, I-057)
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
  const p = await startProc(process.execPath, [join(TESTS, 'fixtures', 'fake-webkit-proxy.mjs'), '--port=0', '--url=http://127.0.0.1:9/start', ...args],
    { env: { FAKE_WIP_LOG: log }, ready: (s) => s.match(/^FAKE_WIP_PORT=(\d+)$/m) });
  procs.push(p);
  const port = p.stdout().match(/^FAKE_WIP_PORT=(\d+)$/m)[1];
  const navigations = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.navigate).map((e) => e.navigate) : []);
  const blankConnects = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter((l) => l.includes('"blankViewConnected"')).length : 0);
  return { env: { ...env, FW_IPHONE_PORT: port }, navigations, blankConnects };
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

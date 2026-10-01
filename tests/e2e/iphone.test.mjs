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
  env = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()) };
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

// tools/iphone.mjs without the phone: lease gating for open/scroll/record, argument handling, and
// `status` when ios_webkit_debug_proxy is not reachable. FW_IPHONE_PORT / FW_IPHONE_DEVICE_PORT point at
// ports with nothing listening and FW_STATE_DIR at a temp lock dir, so the real (shared) iPhone, its
// proxy on :9221/:9222 and the real iphone lease are never touched.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir, node, tool, freePort } from '../helpers.mjs';

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

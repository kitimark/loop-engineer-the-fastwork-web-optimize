// tools/lock.mjs, incident I-171: the delegated lock powers on the command line. `repair --move --by mgmt-devices`
// applies inside the priority order and is refused past a timing hold; `release iphone --owner <holder> --by <delegate>
// --reason` releases an idle lease with a ready waiter, audited, and refuses a non-delegate or a fresh lease.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-lockdel-'); env = { FW_STATE_DIR: state }; mkdirSync(join(state, 'locks'), { recursive: true }); });
const lock = (...a) => node(LOCK, a, { env });
const lf = (f) => join(state, 'locks', f);
const audit = () => (existsSync(lf('audit.log')) ? readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

test('I-171: repair --move --by mgmt-devices moves inside the order, is refused past a queued timing hold; both audited only when applied', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'holder').code, 0);
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'timed').code, 3);
  // two queued --no-timing holds (only `run` takes --no-timing; their entries as lib/lock.mjs writes them)
  const q = JSON.parse(readFileSync(lf('chrome-measure.queue.json'), 'utf8'));
  const now = new Date().toISOString();
  for (const o of ['a', 'b']) q.push({ owner: o, kind: 'lease', checkout: '/x', since: now, lastSeen: now, queueTtlSec: 600, noTiming: true });
  writeFileSync(lf('chrome-measure.queue.json'), JSON.stringify(q));
  const past = lock('repair', 'chrome-measure', '--move', 'b', '--to', '1', '--by', 'mgmt-devices', '--reason', 'x', '--apply');
  assert.equal(past.code, 1, past.out);
  assert.match(past.stderr, /--by mgmt-devices \(a delegate, I-171\): moving "b" from #3 to #1 would pass "timed", a queued timing hold/);
  assert.deepEqual(audit(), []);
  const ok = lock('repair', 'chrome-measure', '--move', 'b', '--to', '2', '--by', 'mgmt-devices', '--reason', 'b first among the builds', '--apply');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^MOVED chrome-measure: "b" #3 -> #2 by "mgmt-devices"/);
  assert.match(lock('status', 'chrome-measure').stdout, /2\. b \(no-timing, since [^)]*, moved by mgmt-devices\)/);
  assert.deepEqual(audit().map((x) => [x.code, x.by, x.reason]), [['queue-move', 'mgmt-devices', 'b first among the builds']]);
  const other = lock('repair', 'chrome-measure', '--move', 'a', '--to', '1', '--by', 'fix-z', '--reason', 'x');
  assert.equal(other.code, 1);
  assert.match(other.stderr, /only the lead reorders the queue \(--by lead\), or a delegate inside the board's priority order \(mgmt-devices, mgmt-desk\*; I-171\)/);
});

test('I-171: release iphone --owner <holder> --by <delegate> --reason: an idle lease with a waiter goes, audited; a fresh one and a non-delegate are refused', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-x', '--ttl', '3600').code, 0);
  assert.equal(lock('acquire', 'iphone', '--owner', 'w').code, 3, 'a ready waiter');
  const fresh = lock('release', 'iphone', '--owner', 'fix-x', '--by', 'mgmt-devices', '--reason', 'x');
  assert.equal(fresh.code, 1, fresh.out);
  assert.match(fresh.stderr, /"fix-x" is idle 0 min, under 5/);
  const h = JSON.parse(readFileSync(lf('iphone.json'), 'utf8'));
  writeFileSync(lf('iphone.json'), JSON.stringify({ ...h, acquiredAt: new Date(Date.now() - 7 * 60000 - 5000).toISOString() }));
  const nope = lock('release', 'iphone', '--owner', 'fix-x', '--by', 'fix-y', '--reason', 'x');
  assert.equal(nope.code, 1);
  assert.match(nope.stderr, /only the lead or a delegate/);
  const noWhy = lock('release', 'iphone', '--owner', 'fix-x', '--by', 'mgmt-devices');
  assert.equal(noWhy.code, 1);
  assert.match(noWhy.stderr, /needs --reason/);
  assert.equal(JSON.parse(lock('status', 'iphone', '--json').stdout)[0].holder.owner, 'fix-x', 'refusals change nothing');
  const out = lock('release', 'iphone', '--owner', 'fix-x', '--by', 'mgmt-devices', '--reason', 'idle 7 min after one nudge');
  assert.equal(out.code, 0, out.out);
  assert.match(out.stdout, /^RELEASED iphone \(was "fix-x", idle 7 min with waiters; by "mgmt-devices"\), logged to .*audit\.log/);
  assert.equal(JSON.parse(lock('status', 'iphone', '--json').stdout)[0].holder, null);
  assert.deepEqual(audit().map((x) => [x.code, x.by, x.owner, x.idleMin, x.reason]), [['lease-release', 'mgmt-devices', 'fix-x', 7, 'idle 7 min after one nudge']]);
  // the holder's own release with --by itself is the plain release (no delegate path)
  assert.equal(lock('acquire', 'iphone', '--owner', 'w').code, 0);
  assert.match(lock('release', 'iphone', '--owner', 'w', '--by', 'w').stdout, /^RELEASED iphone \(was "w"\)/);
});

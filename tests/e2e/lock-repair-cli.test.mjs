// tools/lock.mjs doctor / repair (incident I-012): exit codes, output, dry run by default, --apply needs
// --by/--reason and writes locks/audit.log, --force-holder prints the holder and never removes a live
// iphone lease; repair --move (I-019): the lead reorders waiting entries, audited, and the moved waiter is
// granted first.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, sleep } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-lockrepcli-'); env = { FW_STATE_DIR: state }; mkdirSync(join(state, 'locks'), { recursive: true }); });
const lock = (...a) => node(LOCK, a, { env });
const lf = (f) => join(state, 'locks', f);
const bytes = () => Object.fromEntries(readdirSync(lf('')).sort().map((n) => [n, readFileSync(lf(n), 'latin1')]));

test('doctor: exit 0 when clean, 1 with each problem and its fix; --json', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab').code, 0);
  const ok = lock('doctor');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^OK chrome-measure: held by "ab"$/m);
  assert.match(ok.stdout, /^OK iphone: no live holder$/m);

  // I-011: an old client took the lock without writing last-grant.json
  const h = JSON.parse(readFileSync(lf('chrome-measure.json'), 'utf8'));
  writeFileSync(lf('chrome-measure.last-grant.json'), JSON.stringify({ owner: 'ts-x', short: true, at: new Date(Date.parse(h.acquiredAt) - 60000).toISOString() }));
  const bad = lock('doctor', 'chrome-measure');
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.stdout, /^PROBLEMS chrome-measure: 1 \(held by "ab"\)/m);
  assert.match(bad.stdout, /\[last-grant-mismatch\] chrome-measure\.last-grant\.json: records "ts-x" \(short/);
  assert.match(bad.stdout, /fix: rewrite it from the holder/);
  const j = JSON.parse(lock('doctor', 'chrome-measure', '--json').stdout);
  assert.equal(j[0].problems[0].code, 'last-grant-mismatch');
  assert.equal(j[0].problems[0].after.owner, 'ab');
});

test('repair: dry run by default (nothing changes), --apply needs --by/--reason, then fixes and audits', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab').code, 0);
  writeFileSync(lf('chrome-measure.last-grant.json'), JSON.stringify({ owner: 'ts-x', short: true, at: '2026-01-01T00:00:00.000Z' }));
  const before = bytes();
  const dry = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'I-011');
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^REPAIR chrome-measure \(dry run, nothing changed\): 1 change\(s\)/);
  assert.match(dry.stdout, /before: \{"owner":"ts-x","short":true/);
  assert.match(dry.stdout, /after: {2}\{"owner":"ab","short":false/);
  assert.deepEqual(bytes(), before, 'dry run leaves every byte as it was');

  const noWho = lock('repair', 'chrome-measure', '--apply');
  assert.equal(noWho.code, 1);
  assert.match(noWho.stderr, /needs --by <who> and --reason/);
  assert.deepEqual(bytes(), before);

  const ap = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'I-011 stale short', '--apply');
  assert.equal(ap.code, 0, ap.out);
  assert.match(ap.stdout, /^REPAIRED chrome-measure: 1 change\(s\) by "lead", logged to .*audit\.log/);
  assert.equal(JSON.parse(readFileSync(lf('chrome-measure.last-grant.json'), 'utf8')).owner, 'ab');
  const audit = readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].by, 'lead');
  assert.equal(audit[0].reason, 'I-011 stale short');
  assert.equal(lock('doctor').code, 0);
  assert.match(lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'x', '--apply').stdout, /REPAIRED chrome-measure: 0 change\(s\)/);
});

test('repair --force-holder prints the holder; refuses the live iphone lease; removes another live holder', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'phone-topic').code, 0);
  const before = bytes();
  const r = lock('repair', 'iphone', '--by', 'lead', '--reason', 'x', '--apply', '--force-holder');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^holder: \{.*"owner":"phone-topic"/);
  assert.match(r.stderr, /refusing to touch the iphone lease of a live holder/);
  assert.deepEqual(bytes(), before);
  const plain = lock('repair', 'iphone', '--by', 'lead', '--reason', 'x', '--apply');
  assert.equal(plain.code, 0);
  assert.equal(existsSync(lf('iphone.json')), true, 'without --force-holder a live holder is not a problem to fix');

  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'hung').code, 0);
  const f = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'hung A/B', '--apply', '--force-holder');
  assert.equal(f.code, 0, f.out);
  assert.match(f.stdout, /^holder: \{.*"owner":"hung"/);
  assert.match(f.stdout, /\[holder-live-forced\]/);
  assert.equal(existsSync(lf('chrome-measure.json')), false);
  assert.match(lock('status', 'chrome-measure').stdout, /free/);
});

test('repair --move (I-019): two real waiting runs; the lead moves the later one to #1 and it is granted first', async (t) => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'holder').code, 0);
  t.after(() => lock('release', 'chrome-measure', '--owner', 'holder')); // on a failure, let the waiting runs finish
  const orderFile = join(state, 'order.log');
  const cmd = (name) => [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(orderFile)}, ${JSON.stringify(name + '\n')}); setTimeout(() => {}, 300);`];
  const queue = () => JSON.parse(lock('status', 'chrome-measure', '--json').stdout)[0].queue.map((w) => w.owner);
  const queued = async (o) => { for (let i = 0; i < 200 && !queue().includes(o); i++) await sleep(50); assert.ok(queue().includes(o), `${o} queued`); };
  const first = nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'first', '--', ...cmd('first')], { env });
  await queued('first');
  const prio = nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'e1-prio', '--', ...cmd('e1-prio')], { env });
  await queued('e1-prio');
  assert.deepEqual(queue(), ['first', 'e1-prio']);

  const args = ['repair', 'chrome-measure', '--move', 'e1-prio', '--to', '1', '--by', 'lead', '--reason', 'E1 is priority 1 (DIRECTION.md)'];
  const dry = lock(...args);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^MOVE chrome-measure \(dry run, nothing changed\): "e1-prio" #2 -> #1; apply with --apply/);
  assert.match(dry.stdout, /before: 1\. first \(since [^)]*\), 2\. e1-prio \(since [^)]*\)$/m);
  assert.match(dry.stdout, /after: {2}1\. e1-prio \(since [^)]*, moved by lead\), 2\. first \(since [^)]*\)$/m);
  assert.deepEqual(queue(), ['first', 'e1-prio'], 'the dry run moved nothing');
  const notLead = lock(...args.map((a) => (a === 'lead' ? 'ts-prio' : a)), '--apply');
  assert.equal(notLead.code, 1);
  assert.match(notLead.stderr, /only the lead reorders the queue/);
  const holderMove = lock('repair', 'chrome-measure', '--move', 'holder', '--to', '1', '--by', 'lead', '--reason', 'x', '--apply');
  assert.equal(holderMove.code, 1);
  assert.match(holderMove.stderr, /"holder" holds chrome-measure; --move only reorders waiting entries/);
  assert.ok(!existsSync(lf('audit.log')), 'refusals are not audited changes');

  const ap = lock(...args, '--apply');
  assert.equal(ap.code, 0, ap.out);
  assert.match(ap.stdout, /^MOVED chrome-measure: "e1-prio" #2 -> #1 by "lead", logged to .*audit\.log/);
  assert.match(lock('status', 'chrome-measure').stdout, /queue: 1\. e1-prio \(since [^)]*, moved by lead\), 2\. first \(since [^)]*\)$/m);
  const audit = readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].code, 'queue-move');
  assert.equal(audit[0].reason, 'E1 is priority 1 (DIRECTION.md)');
  assert.deepEqual([audit[0].before, audit[0].after], [['first', 'e1-prio'], ['e1-prio', 'first']]);

  assert.equal(lock('release', 'chrome-measure', '--owner', 'holder').code, 0);
  const [a, b] = await Promise.all([prio, first]);
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.equal(readFileSync(orderFile, 'utf8'), 'e1-prio\nfirst\n', 'the moved waiter ran first, the other one kept its entry and ran next');
  assert.deepEqual(queue(), []);
});

test('repair --move to the entry\'s own position (I-035): the dry run and --apply say "marked", status shows it, a repeat is a no-op', () => {
  assert.equal(lock('acquire', 'test-res', '--owner', 'h').code, 0);
  assert.equal(lock('acquire', 'test-res', '--owner', 'a').code, 3);
  assert.equal(lock('acquire', 'test-res', '--owner', 's', '--short', '--max-seconds', '60').code, 3);
  const args = ['repair', 'test-res', '--move', 'a', '--to', '1', '--by', 'lead', '--reason', 'E1 first'];
  const dry = lock(...args);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^MOVE test-res \(dry run, nothing changed\): "a" stays #1, marked as moved by "lead"; apply with --apply$/m);
  assert.doesNotMatch(lock('status', 'test-res', '--no-host').stdout, /moved by/);
  const ap = lock(...args, '--apply');
  assert.equal(ap.code, 0, ap.out);
  assert.match(ap.stdout, /^MOVED test-res: "a" stays #1, marked as moved by "lead" \(served before the short jobs behind it, I-020\/I-035\), logged to .*audit\.log$/m);
  assert.match(lock('status', 'test-res', '--no-host').stdout, /queue: 1\. a \(since [^)]*, moved by lead\), 2\. s \(short, max 60 s, since [^)]*\)$/m);
  const audit = readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(audit.map((x) => [x.code, x.owner, x.from, x.to]), [['queue-move', 'a', 1, 1]]);
  const before = bytes();
  const again = lock(...args, '--apply');
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^MOVE test-res: "a" is already #1 and moved by "lead", nothing to do$/m);
  assert.deepEqual(bytes(), before, 'a repeat writes nothing');
});

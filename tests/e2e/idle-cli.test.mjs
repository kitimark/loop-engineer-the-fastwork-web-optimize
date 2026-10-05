// tools/idle.mjs end to end (incident I-105, user T-058 #4) on a temp state dir: `check` exit codes (0 nothing idle,
// 3 alarm, 1 usage), one console thread per idle episode (as the lead, assigned to the steward only, I-175),
// print-only without --by lead, the episode's end closing its thread, `watch`'s 30 s floor and its one line per new
// alarm, and that it never changes a lock (holder, queue). The test clock is FW_IDLE_NOW. No port 5173, phone,
// Chrome, real locks or real store (I-041).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc } from '../helpers.mjs';

const IDLE = tool('idle.mjs');
const LOCK = tool('lock.mjs');
const ST = tool('status.mjs');
const CON = tool('console.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-idle-e2e-'); env = { FW_STATE_DIR: state }; });

const later = (min) => new Date(Date.now() + min * 60000).toISOString();
const idle = (args, min = 0) => node(IDLE, args, { env: { ...env, FW_IDLE_NOW: later(min) } });
const lock = (...a) => node(LOCK, a, { env });
const lockFiles = () => ['iphone.json', 'iphone.queue.json', 'chrome-measure.json', 'chrome-measure.queue.json'].map((f) => { const p = join(state, 'locks', f); return existsSync(p) ? readFileSync(p, 'utf8') : null; });

/** The iPhone lease was used and released, and fix-w still queues for it (its `acquire --wait 0` kept its place). */
function phoneReleasedWithWaiter() {
  let r = lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900');
  assert.equal(r.code, 0, r.out);
  r = lock('acquire', 'iphone', '--owner', 'fix-w', '--ttl', '900', '--wait', '0');
  assert.equal(r.code, 3, r.out);
  r = lock('release', 'iphone', '--owner', 'runner');
  assert.equal(r.code, 0, r.out);
}

test('check: exit 0 with nothing idle; usage errors exit 1', () => {
  let r = idle(['check']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK iphone: free for 0 min .*no ready work$/m);
  assert.match(r.stdout, /^OK chrome-measure: /m);
  assert.equal(idle(['check', '--phone-min', '0']).code, 1);
  assert.equal(idle(['check', '--by', 'bad name']).code, 1);
  assert.equal(idle(['frob']).code, 1);
  assert.equal(node(IDLE, []).code, 1);
  r = idle(['watch', '--interval', '10']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--interval must be at least 30 s/);
});

test('check: a queued waiter on a free iPhone is an alarm only past the limit; one thread per episode; it never changes a lock', () => {
  phoneReleasedWithWaiter();
  const before = lockFiles();
  let r = idle(['check', '--by', 'lead'], 4);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK iphone: free for 4 min \(since \d\d:\d\dZ, released by runner\), under the 5 min limit; waiting: fix-w \(queued for it\)$/m);
  r = idle(['check', '--by', 'lead'], 6);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^IDLE iphone: iPhone free for 6 min .* over the 5 min limit, while work waits: fix-w \(queued for it\)$/m);
  assert.match(r.stdout, /^POSTED T-001 iphone: iPhone free for 6 min while 1 job waits$/m, 'I-175: no steward set: no assignee (the lead\'s triage), never the waiter');
  // the same episode again: still exit 3, no second post
  r = idle(['check', '--by', 'lead'], 9);
  assert.equal(r.code, 3, r.out);
  assert.doesNotMatch(r.stdout, /POSTED/);
  assert.match(r.stdout, /\[posted in T-001\]$/m);
  const t = node(CON, ['thread', 'show', 'T-001'], { env });
  assert.equal(t.code, 0, t.out);
  assert.match(t.stdout, /The iPhone has had no holder for 6 min/);
  assert.match(t.stdout, /Queued for it: fix-w\./);
  assert.doesNotMatch(t.stdout, /assign: fix-w/, 'I-175: the waiting worker is never assigned');
  assert.match(t.stdout, /No steward on duty \(no steward set\): the lead handles this thread \(I-175\)\./);
  assert.equal(node(CON, ['thread', 'list', '--json'], { env }).stdout.match(/"id": "T-/g).length, 1);
  assert.deepEqual(lockFiles(), before, 'read-only on the locks: holder and queue files unchanged');
  // the slot is taken: the episode ends, its thread closes, exit 0
  r = lock('acquire', 'iphone', '--owner', 'fix-w', '--ttl', '900');
  assert.equal(r.code, 0, r.out);
  // ops' check sees the end first; the thread closes on the lead's next run (only the lead or an assignee may close)
  r = idle(['check', '--by', 'mgmt-ops-10'], 10);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ENDED iphone: idle period from \d\d:\d\dZ is over \(now held by fix-w\); thread T-001$/m);
  assert.doesNotMatch(r.stdout, /CLOSED/);
  assert.doesNotMatch(node(CON, ['thread', 'show', 'T-001'], { env }).stdout, /closed/);
  r = idle(['check', '--by', 'lead'], 11);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /ENDED/, 'the end is reported once');
  assert.match(r.stdout, /^CLOSED T-001 \(iphone: taken by fix-w\)$/m);
  assert.doesNotMatch(idle(['check', '--by', 'lead'], 12).stdout, /CLOSED/, 'closed once');
  assert.match(node(CON, ['thread', 'show', 'T-001'], { env }).stdout, /closed/);
});

test('check: a status-board row waiting on the phone is ready work; without --by lead it prints only, and the lead posts later', () => {
  let r = lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900');
  assert.equal(r.code, 0, r.out);
  assert.equal(lock('release', 'iphone', '--owner', 'runner').code, 0);
  r = node(ST, ['set', 'morph-gpu', '--by', 'fix-morph-gpu', '--kind', 'fix', '--title', 'Morph on the GPU', '--state', 'waiting', '--waiting-on', 'other:queued for the iphone lease behind P-091'], { env });
  assert.equal(r.code, 0, r.out);
  // T-169 (I-182 follow-up): a row waiting on an agent whose NOTE only names the phone is no phone waiter
  r = node(ST, ['set', 'nav-hit', '--by', 'fix-nav-hit', '--kind', 'fix', '--title', 'Nav hit cache', '--state', 'waiting', '--waiting-on', 'agent:mgmt-ops-10', '--note', 'phone ticket after the ops read'], { env });
  assert.equal(r.code, 0, r.out);
  r = node(ST, ['set', 'ops', '--by', 'mgmt-ops-10', '--kind', 'ops', '--title', 'Ops', '--state', 'waiting', '--waiting-on', 'agent:iphone-runner', '--note', 'block running (iphone-runner)'], { env });
  assert.equal(r.code, 0, r.out);
  r = idle(['check', '--by', 'mgmt-ops-10'], 7);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^IDLE iphone: .*while work waits: morph-gpu \(owner fix-morph-gpu; its wait names the phone\)$/m);
  assert.doesNotMatch(r.stdout, /nav-hit/, 'T-169: a note naming the phone is no wait on it');
  assert.doesNotMatch(r.stdout, /mgmt-ops-10 \(|ops \(owner/, 'iphone-runner as a name is not the phone');
  assert.match(r.stdout, /^NOT POSTED iphone: posting needs --by lead/m);
  assert.equal(idle(['check'], 8).code, 3);
  assert.match(node(CON, ['thread', 'steward', 'set', 'mgmt-devices', '--by', 'lead'], { env }).stdout, /^STEWARD mgmt-devices/);
  r = idle(['check', '--by', 'lead'], 9);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^POSTED T-001 iphone: iPhone free for 9 min while 1 job waits \(to mgmt-devices\)$/m, 'I-175: the steward, not the row owner');
  assert.match(node(CON, ['thread', 'show', 'T-001'], { env }).stdout, /Steward \(mgmt-devices\): nudge fix-morph-gpu by message/);
});

test('check --json: the verdict per resource and the exit code agree', () => {
  phoneReleasedWithWaiter();
  const r = idle(['check', '--json'], 12);
  assert.equal(r.code, 3, r.out);
  const j = JSON.parse(r.stdout);
  assert.equal(j.alarm, true);
  const ph = j.resources.find((x) => x.resource === 'iphone');
  assert.equal(ph.alarm, true);
  assert.equal(ph.freeMin, 12);
  assert.deepEqual(ph.queue, [{ owner: 'fix-w' }]);
  assert.equal(j.resources.find((x) => x.resource === 'chrome-measure').alarm, false);
});

test('watch: one IDLE line and one post for a new episode; stops on SIGTERM', async () => {
  phoneReleasedWithWaiter();
  const p = await startProc(process.execPath, [IDLE, 'watch', '--by', 'lead', '--interval', '30'], { env: { ...env, FW_IDLE_NOW: later(20) }, ready: (s) => /POSTED T-001/.test(s), timeout: 20000 });
  try {
    assert.match(p.stdout(), /WATCH idle alarm every 30 s: iphone > 5 min, chrome-measure > 10 min; posting as the lead/);
    assert.equal(p.stdout().match(/IDLE iphone/g).length, 1);
  } finally { await p.stop(); }
  assert.match(p.stdout(), /STOPPED/);
});

// I-111 (2026-10-04): fix-nav-morph held the lease ~6 min without a phone run while others queued; check said OK.
test('I-111 check: a held iPhone lease with no phone run past the limit is IDLE while another owner queues; the holder is addressed; release ends it', () => {
  let r = lock('acquire', 'iphone', '--owner', 'fix-h', '--ttl', '1800');
  assert.equal(r.code, 0, r.out);
  r = lock('acquire', 'iphone', '--owner', 'fix-w', '--ttl', '900', '--wait', '0');
  assert.equal(r.code, 3, r.out);
  const before = lockFiles();
  r = idle(['check', '--by', 'lead'], 4);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK iphone: held by fix-h; no phone run for 4 min \(since \d\d:\d\dZ, lease taken by fix-h\), under the 5 min limit; waiting: fix-w \(queued for it\)$/m);
  r = idle(['check', '--by', 'lead'], 6);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^IDLE iphone: iPhone held by fix-h but unused for 6 min \(no phone run since \d\d:\d\dZ, lease taken by fix-h\), over the 5 min limit, while work waits: fix-w \(queued for it\)$/m);
  assert.match(r.stdout, /^POSTED T-001 iphone: iPhone held by fix-h, unused for 6 min while 1 job waits$/m, 'I-175: never the holder or the waiter');
  assert.match(r.stdout, /^NOTIFY fix-h: /m, 'the NOTIFY lines still name the concerned owners');
  assert.match(node(CON, ['thread', 'show', 'T-001'], { env }).stdout, /fix-h has held the iPhone lease for 6 min without a phone run/);
  assert.deepEqual(lockFiles(), before, 'read-only on the locks');
  // the holder releases: the episode ends (released), its thread closes
  assert.equal(lock('release', 'iphone', '--owner', 'fix-h').code, 0);
  r = idle(['check', '--by', 'lead'], 7);
  assert.match(r.stdout, /^ENDED iphone: idle period from \d\d:\d\dZ is over \(released by fix-h\); thread T-001$/m);
  assert.match(r.stdout, /^CLOSED T-001 \(iphone: released by fix-h\)$/m);
});

// I-189 (2026-10-04 22:34Z, T-167): between two holds of the marked P-118 block the holder queued for its next Mac hold
// and the block's own result row (waiting on the holder) made a false IDLE. Marked: exit 0; the same unmarked: exit 3.
test('I-189 check: a block-marked holder queued for its next Mac hold is not idle; without the mark the Mac-wait alarm stands', () => {
  let r = lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '1800', '--block', 'P-118');
  assert.equal(r.code, 0, r.out);
  r = lock('acquire', 'chrome-measure', '--owner', 'mac-x', '--ttl', '1200');
  assert.equal(r.code, 0, r.out);
  r = lock('acquire', 'chrome-measure', '--owner', 'runner', '--wait', '0');
  assert.equal(r.code, 3, r.out);
  r = lock('acquire', 'iphone', '--owner', 'fix-w', '--ttl', '900', '--wait', '0');
  assert.equal(r.code, 3, r.out);
  r = node(ST, ['set', 'dd-fix', '--by', 'lead', '--kind', 'fix', '--title', 'Double drive', '--state', 'waiting', '--waiting-on', 'agent:runner', '--note', 'P-118 phone runs next'], { env });
  assert.equal(r.code, 0, r.out);
  r = idle(['check', '--by', 'lead'], 7);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK iphone: held by runner, which waits for its next Mac hold inside phone block P-118 since \d\d:\d\dZ \(7 min; a Mac wait inside the block, not idle; I-189\); waiting: fix-w \(queued for it\)$/m);
  assert.doesNotMatch(r.stdout, /dd-fix/, 'a row waiting on the holder is no phone waiter');
  assert.doesNotMatch(r.stdout, /POSTED/);
  // the block ends (mark cleared), the holder still queued for the Mac, fix-w still waits: T0's Mac-wait alarm
  r = lock('doing', 'iphone', '--owner', 'runner', '--block', 'none');
  assert.equal(r.code, 0, r.out);
  r = idle(['check', '--by', 'lead'], 8);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^IDLE iphone: iPhone held by runner, which has waited 8 min for its Mac hold .* while work waits: fix-w \(queued for it\)$/m);
});

// I-182 (user T-159 #6/#7): the iPhone stood free 15+ min while P-117, signed to run next, waited only on Mac-side
// pre-checks; nothing was queued or marked waiting, so check said "no ready work". A startable mark on the board counts.
test('I-182 check: a free iPhone and a row with startable phone work (--phone-next, arm-neutral) alarm; a pre-check that may change the arms does not', () => {
  let r = lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900');
  assert.equal(r.code, 0, r.out);
  assert.equal(lock('release', 'iphone', '--owner', 'runner').code, 0);
  r = node(ST, ['set', 'p117', '--by', 'fix-p', '--kind', 'phone', '--title', 'P-117 block', '--state', 'waiting', '--waiting-on', 'chrome:pre-checks', '--phone-next', 'P-117', '--phone-needs', 'arms change'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ADDED p117: waiting; waiting on chrome "pre-checks"; phone next P-117 \(waits on arms change, which may change the arms: not startable yet\)$/m);
  r = idle(['check'], 6);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK iphone: free for 6 min .*no ready work$/m);
  r = node(ST, ['set', 'p117', '--by', 'fix-p', '--phone-needs', 'Chrome counts', '--arm-neutral'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /; phone next P-117 \(waits only on Chrome counts, arm-neutral: startable\)$/m);
  r = idle(['check'], 6);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^IDLE iphone: iPhone free for 6 min .* while work waits: p117 \(owner fix-p; startable: P-117, waits only on Chrome counts \(arm-neutral\)\)$/m);
  assert.match(node(ST, ['show', 'p117'], { env }).stdout, /phone next: P-117 \(waits only on Chrome counts, arm-neutral: startable\)/);
  r = node(ST, ['set', 'p117', '--by', 'fix-p', '--phone-next', 'none'], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(idle(['check'], 7).code, 0);
});

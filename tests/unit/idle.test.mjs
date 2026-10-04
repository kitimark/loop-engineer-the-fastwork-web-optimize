// tools/lib/idle.mjs (incident I-105, user T-058 #4): the idle alarm's "ready work" rule, its time math (free since
// the last release / hold end / lease expiry, after the last grant; its own sighting as the fallback), the threshold,
// de-duplication per idle episode, the words it posts (names and minutes only), and the lock library's release record
// (lib/lock.mjs noteRelease) it reads. Every test uses its own $FW_STATE_DIR (never the live .git/fastwork-mirror/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const D = await import('../../tools/lib/idle.mjs');
const L = await import('../../tools/lib/lock.mjs');

let state;
beforeEach(() => { state = tempDir('fw-idle-'); process.env.FW_STATE_DIR = state; });

const T0 = Date.parse('2026-10-04T03:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const free = (queue = []) => ({ resource: 'iphone', holder: null, stale: null, queue });
const row = (id, owner, extra = {}) => ({ id, owner, state: 'waiting', ...extra });

test('rowWaitsOn: explicit phone/chrome waits win; user and incident waits never count; words only in a waiting row', () => {
  const r = (x) => D.rowWaitsOn(x).map((y) => y.resource);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'phone' }, note: 'chrome later' })), ['iphone']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'chrome' }, note: 'phone later' })), ['chrome-measure']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'user', text: 'phone swipe answer' } })), []);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'incident', target: 'I-042' }, note: 'phone run blocked' })), []);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'mgmt-ops-10' }, note: 'queued for the iphone lease behind P-091' })), ['iphone']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'lead', text: 'phone ticket turn' } })), ['iphone']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'other', text: 'Chrome slot for the A/B' } })), ['chrome-measure']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'x' }, note: 'next: measuring the cost card' })), ['chrome-measure']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'x' }, note: 'queued on chrome-measure' })), ['chrome-measure']);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'x' }, note: 'in the lock queue' })), ['chrome-measure']);
  // "lock" next to the phone is the phone's lease, not Chrome
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'x' }, note: 'phone lock next' })), ['iphone']);
  // whole words only: agent names such as iphone-runner, and past tense "measured", do not count
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'iphone-runner' }, note: 'P-088 block running (iphone-runner)' })), []);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'lead', text: 'land request' }, note: 'counts measured on main' })), []);
  // not waiting: nothing, whatever it says
  assert.deepEqual(r({ id: 'a', owner: 'x', state: 'measuring', note: 'on the phone now' }), []);
  assert.deepEqual(r({ id: 'a', owner: 'x', state: 'ready-to-land', waitingOn: { kind: 'phone' } }), []);
  assert.deepEqual(r(row('a', 'x', { waitingOn: { kind: 'agent', target: 'x' }, note: 'iPhone and Chrome both' })), ['iphone', 'chrome-measure']);
  assert.match(D.rowWaitsOn(row('a', 'x', { waitingOn: { kind: 'lead', text: 'phone turn' } }))[0].why, /its wait names the phone/);
  assert.match(D.rowWaitsOn(row('a', 'x', { waitingOn: { kind: 'lead' }, note: 'phone turn' }))[0].why, /its note names the phone/);
});

test('readyWork: queued waiters once each; a row whose owner (or alias) is queued is not listed again', () => {
  const st = free([{ owner: 'fix-a' }, { owner: 'fix-b' }, { owner: 'fix-a' }]);
  const rows = [
    row('a1', 'fix-a', { waitingOn: { kind: 'phone' } }),
    row('c1', 'fix-c', { waitingOn: { kind: 'phone' } }),
    row('d1', 'fix-d', { waitingOn: { kind: 'phone' }, aliases: ['fix-b'] }),
    row('e1', 'fix-e', { waitingOn: { kind: 'chrome' } }),
  ];
  const w = D.readyWork('iphone', { st, rows });
  assert.deepEqual(w.queue, [{ owner: 'fix-a' }, { owner: 'fix-b' }]);
  assert.deepEqual(w.rows, [{ id: 'c1', owner: 'fix-c', why: 'waits on the phone' }]);
  assert.deepEqual(D.readyWork('chrome-measure', { st: free(), rows }).rows.map((x) => x.id), ['e1']);
});

test('freeSince: held while a live holder (a shared group too) has it', () => {
  assert.equal(D.freeSince({ st: { holder: { owner: 'a', token: 't1' }, stale: null }, now: T0 }).held, true);
  assert.equal(D.freeSince({ st: { holder: { owner: '(shared)', shared: true, readers: [] }, stale: null }, now: T0 }).held, true);
});

test('freeSince: the release after the last grant; older evidence belongs to an earlier free period', () => {
  const grant = { owner: 'a', token: 'g1', at: at(0) };
  const rel = { owner: 'a', token: 'g1', at: at(10), how: 'release' };
  const f = D.freeSince({ st: free(), rel, grant, now: T0 + 25 * 60000 });
  assert.equal(f.held, false);
  assert.equal(f.since, T0 + 10 * 60000);
  assert.equal(f.observed, false);
  assert.match(f.how, /released by a/);
  assert.equal(D.freeMinutes(f.since, T0 + 25 * 60000), 15);
  // a newer grant (b) whose end left no record: the release of a is not this period's start
  const g2 = { owner: 'b', token: 'g2', at: at(12) };
  const f2 = D.freeSince({ st: free(), rel, grant: g2, now: T0 + 25 * 60000 });
  assert.equal(f2.observed, true);
  assert.equal(f2.since, T0 + 25 * 60000, 'no usable evidence: counts from now');
  // holds.log end after the grant counts; the latest of several pieces of evidence wins
  const f3 = D.freeSince({ st: free(), rel, grant: g2, holdsEnd: T0 + 14 * 60000, now: T0 + 25 * 60000 });
  assert.equal(f3.since, T0 + 14 * 60000);
  assert.match(f3.how, /holds\.log/);
  const f4 = D.freeSince({ st: free(), rel: { ...rel, at: at(16) }, grant: g2, holdsEnd: T0 + 14 * 60000, now: T0 + 25 * 60000 });
  assert.equal(f4.since, T0 + 16 * 60000);
  // no grant record (removed when a short hold ends with nobody queued): every end counts
  assert.equal(D.freeSince({ st: free(), rel, grant: null, now: T0 + 25 * 60000 }).since, T0 + 10 * 60000);
  // evidence in the future (clock skew) is not used
  assert.equal(D.freeSince({ st: free(), rel: { ...rel, at: at(30) }, grant, now: T0 + 25 * 60000 }).observed, true);
});

test('freeSince: a stale lease is free since its expiry; a dead process holder falls back to the alarm\'s sighting', () => {
  const lease = { owner: 'iphone-runner', token: 'L1', kind: 'lease', acquiredAt: at(0), expiresAt: at(15) };
  const f = D.freeSince({ st: { holder: lease, stale: `expired at ${at(15)}`, queue: [] }, grant: { token: 'L1', at: at(0) }, rel: { token: 'old', at: at(-5) }, now: T0 + 30 * 60000 });
  assert.equal(f.held, false);
  assert.equal(f.since, T0 + 15 * 60000);
  assert.match(f.how, /lease of iphone-runner ran out/);
  const dead = { owner: 'fix-a', token: 'P1', kind: 'process', pid: 999999, acquiredAt: at(0) };
  const st = { holder: dead, stale: 'pid 999999 is gone', queue: [] };
  const first = D.freeSince({ st, grant: { token: 'P1', at: at(0) }, now: T0 + 20 * 60000 });
  assert.equal(first.observed, true);
  assert.equal(first.since, T0 + 20 * 60000);
  // the next poll: the sighting of the same free period (same key) holds the start
  const seen = { key: first.key, at: at(20) };
  assert.equal(D.freeSince({ st, grant: { token: 'P1', at: at(0) }, seen, now: T0 + 27 * 60000 }).since, T0 + 20 * 60000);
  // a sighting of another free period (another grant since) does not
  assert.equal(D.freeSince({ st, grant: { token: 'P2', at: at(21) }, seen, now: T0 + 27 * 60000 }).since, T0 + 27 * 60000);
});

test('assess: alarm only when free for MORE than the limit and work is ready', () => {
  const grant = { token: 'g', at: at(0) }, rel = { owner: 'a', token: 'g', at: at(1) };
  const rows = [row('m', 'fix-m', { waitingOn: { kind: 'phone' } })];
  const exactly = D.assess('iphone', { st: free(), rel, grant, rows, min: 5, now: T0 + 6 * 60000 });
  assert.equal(exactly.freeMin, 5);
  assert.equal(exactly.alarm, false, 'exactly 5 min is not more than 5');
  const over = D.assess('iphone', { st: free(), rel, grant, rows, min: 5, now: T0 + 6 * 60000 + 1 });
  assert.equal(over.alarm, true);
  assert.equal(over.ready, true);
  assert.equal(D.assess('iphone', { st: free(), rel, grant, rows: [], min: 5, now: T0 + 60 * 60000 }).alarm, false, 'no ready work');
  assert.equal(D.assess('iphone', { st: free([{ owner: 'w' }]), rel, grant, rows: [], min: 5, now: T0 + 60 * 60000 }).alarm, true, 'a queued waiter is ready work');
  const held = D.assess('chrome-measure', { st: { holder: { owner: 'fix-x', token: 'h' }, stale: null, queue: [{ owner: 'w' }] }, now: T0 });
  assert.equal(held.alarm, false);
  assert.equal(held.holder, 'fix-x');
  assert.equal(D.RESOURCES.iphone.defaultMin, 5);
  assert.equal(D.RESOURCES['chrome-measure'].defaultMin, 10);
  assert.equal(D.assess('chrome-measure', { st: free([{ owner: 'w' }]), rel, grant, now: T0 + 10 * 60000 }).alarm, false, 'Chrome default 10 min: 9 min free');
  assert.equal(D.assess('chrome-measure', { st: free([{ owner: 'w' }]), rel, grant, now: T0 + 12 * 60000 }).alarm, true);
});

test('holdsLogEnd / holdsLogTail: the newest end of this resource; a partial first line of the tail is dropped', () => {
  const lines = [
    JSON.stringify({ resource: 'chrome-measure', owner: 'a', endedAt: at(3) }),
    'not json',
    JSON.stringify({ resource: 'chrome-measure', owner: 'b', endedAt: at(9) }),
    JSON.stringify({ resource: 'iphone', owner: 'c', endedAt: at(20) }),
  ];
  assert.equal(D.holdsLogEnd('chrome-measure', lines), T0 + 9 * 60000);
  assert.equal(D.holdsLogEnd('iphone', lines), T0 + 20 * 60000);
  assert.equal(D.holdsLogEnd('simulator', lines), null);
  assert.deepEqual(D.holdsLogTail(), []);
  mkdirSync(L.lockDir(), { recursive: true });
  writeFileSync(L.holdsLogFile(), lines.join('\n') + '\n');
  assert.equal(D.holdsLogTail().length, 4);
  const tail = D.holdsLogTail(lines[3].length + lines[2].length + 2 + 5); // starts inside line 2 ("not json")
  assert.equal(tail.length, 2);
  assert.equal(D.holdsLogEnd('chrome-measure', tail), T0 + 9 * 60000);
});

test('lock library: every way a holder leaves writes the release record the alarm reads (lease, process, last reader)', async () => {
  assert.equal(L.lastRelease('iphone'), null);
  await L.acquire('iphone', { owner: 'runner', kind: 'lease', ttlSec: 900, log: () => {} });
  const g = L.lastGrant('iphone');
  assert.equal(g.owner, 'runner');
  const t1 = Date.now();
  await L.release('iphone', { owner: 'runner' });
  const r1 = L.lastRelease('iphone');
  assert.equal(r1.owner, 'runner');
  assert.equal(r1.token, g.token);
  assert.equal(r1.how, 'release');
  assert.ok(Date.parse(r1.at) >= t1 - 5);
  // the alarm reads it: free since that release
  const f = D.freeSince({ st: L.status('iphone'), rel: r1, grant: L.lastGrant('iphone'), now: Date.now() });
  assert.equal(f.held, false);
  assert.equal(f.since, Date.parse(r1.at));
  // a process hold that ends (its handle's release)
  const h = await L.acquire('chrome-measure', { owner: 'fix-p', kind: 'process', short: true, maxSec: 60, log: () => {}, awake: false });
  h.release();
  assert.equal(L.lastRelease('chrome-measure').owner, 'fix-p');
  assert.equal(L.lastRelease('chrome-measure').how, 'process hold ended');
  // release --force by someone else says so
  await L.acquire('iphone', { owner: 'gone', kind: 'lease', ttlSec: 900, log: () => {} });
  await L.release('iphone', { owner: 'lead', force: true });
  assert.equal(L.lastRelease('iphone').how, 'release --force');
  assert.equal(L.lastRelease('iphone').owner, 'gone');
});

test('lock library: the last shared reader leaving writes the release record', async () => {
  await L.setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'test' });
  process.env.FW_LOCK_LOAD1 = '0';
  try {
    const a = await L.acquire('chrome-measure', { owner: 'reader-a', kind: 'lease', shared: true, weight: 1, maxSec: 60, log: () => {}, cpuSampler: () => ({ idle: 0, total: 0 }) });
    assert.equal(a.mode, 'shared');
    await L.release('chrome-measure', { owner: 'reader-a', shared: true });
    const rel = L.lastRelease('chrome-measure');
    assert.match(rel.how, /last reader "reader-a" left/);
    assert.equal(D.freeSince({ st: L.status('chrome-measure'), rel, grant: L.lastGrant('chrome-measure'), now: Date.now() }).since, Date.parse(rel.at));
  } finally { delete process.env.FW_LOCK_LOAD1; }
});

test('record: one alarm per idle episode; one post claim; the end of the episode is reported once with its thread', async () => {
  const grant = { token: 'g', at: at(0) }, rel = { owner: 'runner', token: 'g', at: at(1) };
  const rows = [row('m', 'fix-m', { waitingOn: { kind: 'phone' } })];
  const A = (now, extra = {}) => D.assess('iphone', { st: free(), rel, grant, rows, min: 5, now, ...extra });
  const r1 = await D.record([A(T0 + 7 * 60000)], { now: T0 + 7 * 60000, claim: true, pid: 111 });
  assert.equal(r1[0].news, 'alarm');
  assert.equal(r1[0].post, true);
  // a second poster (another process) while the claim is live: no news, no claim
  const r2 = await D.record([A(T0 + 8 * 60000)], { now: T0 + 8 * 60000, claim: true, pid: 222 });
  assert.equal(r2[0].news, null);
  assert.equal(r2[0].post, false);
  // the post failed: the claim goes, the next poster may claim
  await D.settle('iphone', at(1), { error: 'only the lead starts threads', now: T0 + 8 * 60000 });
  const r3 = await D.record([A(T0 + 9 * 60000)], { now: T0 + 9 * 60000, claim: true, pid: 222 });
  assert.equal(r3[0].news, null, 'the same episode is not news again');
  assert.equal(r3[0].post, true);
  await D.settle('iphone', at(1), { thread: 'T-007', by: 'lead', now: T0 + 9 * 60000 });
  const r4 = await D.record([A(T0 + 30 * 60000)], { now: T0 + 30 * 60000, claim: true, pid: 333 });
  assert.deepEqual([r4[0].news, r4[0].post, r4[0].thread], [null, false, 'T-007'], 'posted once: later polls only see the thread');
  // a claim by a dead poster expires after CLAIM_TTL_MS
  const s = D.readState();
  delete s.resources.iphone.episode.thread;
  s.resources.iphone.episode.claim = { pid: 444, at: at(30) };
  writeFileSync(D.stateFile(), JSON.stringify(s));
  assert.equal((await D.record([A(T0 + 31 * 60000)], { now: T0 + 31 * 60000, claim: true, pid: 555 }))[0].post, false);
  assert.equal((await D.record([A(T0 + 33 * 60000)], { now: T0 + 33 * 60000, claim: true, pid: 555 }))[0].post, true);
  await D.settle('iphone', at(1), { thread: 'T-007', by: 'lead', now: T0 + 33 * 60000 });
  // held again: the episode ends once, with its thread
  const held = D.assess('iphone', { st: { holder: { owner: 'fix-m', token: 'h2' }, stale: null, queue: [] }, now: T0 + 40 * 60000 });
  const e1 = await D.record([held], { now: T0 + 40 * 60000 });
  assert.equal(e1[0].ended.thread, 'T-007');
  assert.equal(e1[0].ended.since, at(1));
  assert.equal((await D.record([held], { now: T0 + 41 * 60000 }))[0].ended, null);
  // its thread waits for the lead's run to close it, once
  assert.deepEqual((await D.takeToClose()).map((x) => [x.thread, x.resource, x.note]), [['T-007', 'iphone', 'taken by fix-m']]);
  assert.deepEqual(await D.takeToClose(), []);
  // a new free period after it: a new episode, news again
  const rel2 = { owner: 'fix-m', token: 'h2', at: at(50) }, grant2 = { token: 'h2', at: at(40) };
  const n = await D.record([D.assess('iphone', { st: free(), rel: rel2, grant: grant2, rows, min: 5, now: T0 + 56 * 60000 })], { now: T0 + 56 * 60000 });
  assert.equal(n[0].news, 'alarm');
  assert.equal(n[0].post, false, 'no claim without claim: true (a print-only check)');
});

test('record: a free period that changes start without a holder ends the old episode; the sighting is kept per period', async () => {
  const dead = { owner: 'fix-a', token: 'P1', kind: 'process', pid: 999999, acquiredAt: at(0) };
  const st = { holder: dead, stale: 'pid 999999 is gone', queue: [{ owner: 'w' }] };
  const grant = { token: 'P1', at: at(0) };
  const assessAt = (min) => D.assess('chrome-measure', { st, grant, seen: D.readState().resources['chrome-measure']?.seen || null, min: 10, now: T0 + min * 60000 });
  const a1 = assessAt(20);
  assert.equal(a1.observed, true);
  await D.record([a1], { now: T0 + 20 * 60000 });
  assert.equal(D.readState().resources['chrome-measure'].seen.at, at(20));
  const a2 = assessAt(31);
  assert.equal(a2.since, T0 + 20 * 60000, 'the sighting holds the start across polls');
  assert.equal(a2.alarm, true);
  assert.equal((await D.record([a2], { now: T0 + 31 * 60000 }))[0].news, 'alarm');
  // evidence appears for a later period (a release after a new grant): the old episode ends, a new one starts
  const a3 = D.assess('chrome-measure', { st: free([{ owner: 'w' }]), rel: { owner: 'b', token: 'g2', at: at(40) }, grant: { token: 'g2', at: at(35) }, min: 10, now: T0 + 55 * 60000 });
  const r = await D.record([a3], { now: T0 + 55 * 60000 });
  assert.equal(r[0].ended.since, at(20));
  assert.equal(r[0].news, 'alarm');
  assert.equal(D.readState().resources['chrome-measure'].seen, undefined, 'evidence replaces the sighting');
});

test('words: the line and the thread name the resource, minutes and owners; nothing personal; addressees bounded', () => {
  const rel = { owner: 'iphone-runner', token: 'g', at: at(10) }, grant = { token: 'g', at: at(0) };
  const rows = [row('morph-gpu', 'fix-morph-gpu', { waitingOn: { kind: 'agent', target: 'mgmt-ops-10' }, note: 'queued for the iphone lease, open http://192.168.77.12:5497/' })];
  const a = D.assess('iphone', { st: free([{ owner: 'fix-nav-morph' }]), rel, grant, rows, min: 5, now: T0 + 24 * 60000 });
  const line = D.lineFor(a);
  assert.match(line, /^IDLE iphone: iPhone free for 14 min \(since 03:10Z, released by iphone-runner\), over the 5 min limit, while work waits: fix-nav-morph \(queued for it\), morph-gpu \(owner fix-morph-gpu; its note names the phone\)$/);
  const { title, text } = D.threadFor(a, { desk: 'mgmt-ops-10' });
  assert.equal(title, 'iPhone free for 14 min while 2 jobs wait');
  assert.match(text, /The iPhone has had no holder for 14 min \(since 03:10Z; released by iphone-runner\)\. The limit is 5 min\./);
  assert.match(text, /Queued for it: fix-nav-morph\./);
  assert.match(text, /morph-gpu \(owner fix-morph-gpu; its note names the phone\)/);
  assert.match(text, /Desk \(mgmt-ops-10\)/);
  assert.doesNotMatch(text + title + line, /192\.168|http/, 'a row note is never copied (Hard rule 12)');
  assert.deepEqual(D.addressees(a, 'mgmt-ops-10'), ['mgmt-ops-10', 'fix-nav-morph', 'fix-morph-gpu']);
  const many = { queue: Array.from({ length: 10 }, (_, i) => ({ owner: `fix-${i}` })), rows: [{ owner: 'lead' }, { owner: 'user' }] };
  assert.equal(D.addressees(many, 'desk-x').length, 8);
  assert.equal(D.addressees(many, null).includes('lead'), false);
  assert.match(D.lineFor({ resource: 'chrome-measure', held: true, holder: 'fix-x' }), /^OK chrome-measure: held by fix-x$/);
  assert.match(D.lineFor({ ...a, alarm: false, ready: false, queue: [], rows: [] }), /^OK iphone: free for 14 min .*, no ready work$/);
  assert.match(D.lineFor({ ...a, alarm: false }), /under the 5 min limit; waiting: fix-nav-morph/);
  assert.match(D.lineFor({ ...a, freeMin: 75 }), /free for 1 h 15 min/);
});

// ---- I-111: a held iPhone lease nobody uses -------------------------------------------------------------------
// fix-nav-morph held the lease ~6 min (04:00-04:07Z, 2026-10-04) without a phone run while others queued, and the
// alarm said OK ("held"). Now a held iPhone lease with no phone run (iphone.mjs run/scroll/record/gesture, a --warmup
// pre-warm run too) for MORE than --phone-min minutes is idle too, while someone else waits for the phone.
const phoneLease = (extra = {}) => ({ resource: 'iphone', owner: 'fix-nav-morph', kind: 'lease', token: 'L1', acquiredAt: at(0), expiresAt: at(60), meta: {}, ...extra });
const heldSt = (h, queue = [{ owner: 'iphone-runner' }]) => ({ resource: 'iphone', holder: h, stale: null, queue });

test('I-111 lock library: a phone run marker (start and end) stamps the holder\'s lastRunAt; the meta stays as it was', async () => {
  assert.equal((await L.tryAcquire('iphone', { owner: 'fix-h', kind: 'lease', ttlSec: 600 })).ok, true);
  assert.equal(L.status('iphone').holder.lastRunAt, undefined, 'nothing run yet');
  const t1 = Date.now();
  await L.describeHold('iphone', { owner: 'fix-h', run: { text: 'phone test run', since: new Date(t1).toISOString(), pid: 4242 } });
  const h1 = L.status('iphone').holder;
  assert.ok(Date.parse(h1.lastRunAt) >= t1 - 5, 'the start stamps it');
  await L.describeHold('iphone', { owner: 'fix-h', run: null, runPid: 999, now: t1 + 60000 });
  assert.equal(L.status('iphone').holder.lastRunAt, h1.lastRunAt, 'another pid clears nothing and stamps nothing');
  await L.describeHold('iphone', { owner: 'fix-h', run: null, runPid: 4242, now: t1 + 120000 });
  const h2 = L.status('iphone').holder;
  assert.equal(h2.lastRunAt, new Date(t1 + 120000).toISOString(), 'the end stamps it');
  assert.deepEqual(h2.meta, {}, 'meta unchanged (the run marker is gone)');
  // a job description is not phone activity
  await L.describeHold('iphone', { owner: 'fix-h', job: { text: 'block next', at: new Date().toISOString() }, now: t1 + 300000 });
  assert.equal(L.status('iphone').holder.lastRunAt, h2.lastRunAt);
});

test('I-111 assess: a held iPhone lease without a phone run for MORE than the limit is idle while someone else waits', () => {
  const A = (h, now, extra = {}) => D.assess('iphone', { st: heldSt(h, extra.queue), rows: extra.rows || [], activity: extra.activity || null, min: 5, now });
  // taken at 0, nothing run since
  const exactly = A(phoneLease(), T0 + 5 * 60000);
  assert.deepEqual([exactly.held, exactly.heldIdle, exactly.alarm, exactly.freeMin], [true, true, false, 5], 'exactly 5 min is not more than 5');
  const over = A(phoneLease(), T0 + 6 * 60000 + 1);
  assert.deepEqual([over.held, over.heldIdle, over.alarm, over.holder, over.since, over.freeMin], [true, true, true, 'fix-nav-morph', T0, 6]);
  assert.match(over.how, /lease taken by fix-nav-morph/);
  assert.deepEqual(over.queue, [{ owner: 'iphone-runner' }]);
  // nobody else waits: the holder's own queue entry or board row is not ready work
  assert.equal(A(phoneLease(), T0 + 60 * 60000, { queue: [] }).alarm, false, 'no waiter');
  const own = A(phoneLease(), T0 + 60 * 60000, { queue: [{ owner: 'fix-nav-morph' }], rows: [row('f3', 'fix-nav-morph', { waitingOn: { kind: 'phone' } })] });
  assert.deepEqual([own.alarm, own.queue, own.rows], [false, [], []]);
  assert.equal(A(phoneLease(), T0 + 60 * 60000, { queue: [], rows: [row('g1', 'fix-morph-gpu', { waitingOn: { kind: 'phone' } })] }).alarm, true, 'a board row of someone else is');
  // a run in progress (its process alive) is use, however long it takes
  const running = A(phoneLease({ meta: { run: { text: 'phone test run', since: at(1), pid: process.pid } } }), T0 + 40 * 60000);
  assert.deepEqual([running.held, running.heldIdle, running.alarm, running.runLive], [true, false, false, true]);
  // a run marker whose process is gone (a killed run) counts from its start
  const killed = phoneLease({ meta: { run: { text: 'x', since: at(4), pid: 999999 } } });
  assert.equal(A(killed, T0 + 9 * 60000).alarm, false);
  const k = A(killed, T0 + 9 * 60000 + 1);
  assert.deepEqual([k.alarm, k.since], [true, T0 + 4 * 60000]);
  assert.match(k.how, /phone run of fix-nav-morph started/);
  // the end of the last run (lastRunAt) counts
  const ran = phoneLease({ lastRunAt: at(10) });
  assert.equal(A(ran, T0 + 15 * 60000).alarm, false);
  const r = A(ran, T0 + 15 * 60000 + 1);
  assert.deepEqual([r.alarm, r.since], [true, T0 + 10 * 60000]);
  assert.match(r.how, /last phone run of fix-nav-morph/);
  // the alarm's own sighting of a live run (a checkout on older lock code stamps no lastRunAt): this lease only
  assert.equal(A(phoneLease(), T0 + 25 * 60000, { activity: { token: 'L1', at: at(20) } }).alarm, false);
  const seen = A(phoneLease(), T0 + 25 * 60000 + 1, { activity: { token: 'L1', at: at(20) } });
  assert.deepEqual([seen.alarm, seen.since], [true, T0 + 20 * 60000]);
  assert.match(seen.how, /run seen by the idle alarm/);
  assert.equal(A(phoneLease(), T0 + 25 * 60000, { activity: { token: 'L0', at: at(20) } }).since, T0, 'a sighting under another lease does not count');
  // Chrome is unchanged: a held chrome-measure lock is never idle by this rule
  const ch = D.assess('chrome-measure', { st: { resource: 'chrome-measure', holder: { owner: 'fix-x', token: 'h', kind: 'lease', acquiredAt: at(0) }, stale: null, queue: [{ owner: 'w' }] }, min: 10, now: T0 + 60 * 60000 });
  assert.deepEqual([ch.held, ch.heldIdle, ch.alarm], [true, undefined, false]);
});

test('I-111 record: one alarm per held-idle episode; a phone run ends it (thread closed: used again); the sighting of a live run is kept per lease', async () => {
  const A = (h, now) => D.assess('iphone', { st: heldSt(h), activity: D.readState().resources.iphone?.activity || null, min: 5, now });
  const r1 = await D.record([A(phoneLease(), T0 + 7 * 60000)], { now: T0 + 7 * 60000, claim: true, pid: 111 });
  assert.deepEqual([r1[0].news, r1[0].post], ['alarm', true]);
  await D.settle('iphone', at(0), { thread: 'T-009', by: 'lead', now: T0 + 7 * 60000 });
  assert.equal((await D.record([A(phoneLease(), T0 + 9 * 60000)], { now: T0 + 9 * 60000 }))[0].news, null, 'the same episode is not news again');
  // the holder starts a phone run: the episode ends once, and the live run is remembered for this lease
  const live = phoneLease({ meta: { run: { text: 'phone test run', since: at(10), pid: process.pid } } });
  const e = await D.record([A(live, T0 + 10 * 60000)], { now: T0 + 10 * 60000 });
  assert.equal(e[0].ended.thread, 'T-009');
  assert.match(e[0].ended.note, /fix-nav-morph used the phone again/);
  assert.deepEqual(D.readState().resources.iphone.activity, { token: 'L1', at: at(10) });
  assert.deepEqual((await D.takeToClose()).map((x) => [x.thread, x.note]), [['T-009', 'fix-nav-morph used the phone again']]);
  // the run ended without a stamp (older lock code): idle counts from the sighting, a new episode past the limit
  assert.equal((await D.record([A(phoneLease(), T0 + 14 * 60000)], { now: T0 + 14 * 60000 }))[0].news, null);
  const n = await D.record([A(phoneLease(), T0 + 16 * 60000)], { now: T0 + 16 * 60000 });
  assert.equal(n[0].news, 'alarm');
  assert.equal(n[0].a.since, T0 + 10 * 60000);
  // released: the held-idle episode ends (released), and the free rule takes over
  const freeA = D.assess('iphone', { st: { resource: 'iphone', holder: null, stale: null, queue: [{ owner: 'iphone-runner' }] }, rel: { owner: 'fix-nav-morph', token: 'L1', at: at(17) }, grant: { token: 'L1', at: at(0) }, min: 5, now: T0 + 18 * 60000 });
  const f = await D.record([freeA], { now: T0 + 18 * 60000 });
  assert.equal(f[0].ended.since, at(10));
  assert.match(f[0].ended.note, /released/);
  assert.equal(D.readState().resources.iphone.activity, undefined, 'the sighting goes with the lease');
});

test('I-111 words: the held-idle line and thread name the holder, the minutes and the waiters; the holder is addressed', () => {
  const a = D.assess('iphone', { st: heldSt(phoneLease()), rows: [row('morph-gpu', 'fix-morph-gpu', { waitingOn: { kind: 'phone' } })], min: 5, now: T0 + 6 * 60000 + 1 });
  assert.match(D.lineFor(a), /^IDLE iphone: iPhone held by fix-nav-morph but unused for 6 min \(no phone run since 03:00Z, lease taken by fix-nav-morph\), over the 5 min limit, while work waits: iphone-runner \(queued for it\), morph-gpu \(owner fix-morph-gpu; waits on the phone\)$/);
  const { title, text } = D.threadFor(a, { desk: 'mgmt-ops-10' });
  assert.equal(title, 'iPhone held by fix-nav-morph, unused for 6 min while 2 jobs wait');
  assert.match(text, /fix-nav-morph has held the iPhone lease for 6 min without a phone run \(iphone\.mjs run, scroll, record or gesture; since 03:00Z, lease taken by fix-nav-morph\)\. The limit is 5 min\./);
  assert.match(text, /fix-nav-morph: run your phone part now, or release the lease \(node tools\/lock\.mjs release iphone --owner fix-nav-morph\)/);
  assert.deepEqual(D.addressees(a, 'mgmt-ops-10'), ['mgmt-ops-10', 'fix-nav-morph', 'iphone-runner', 'fix-morph-gpu']);
  const under = D.assess('iphone', { st: heldSt(phoneLease()), min: 5, now: T0 + 3 * 60000 });
  assert.match(D.lineFor(under), /^OK iphone: held by fix-nav-morph; no phone run for 3 min \(since 03:00Z, lease taken by fix-nav-morph\), under the 5 min limit; waiting: iphone-runner \(queued for it\)$/);
  const busy = D.assess('iphone', { st: heldSt(phoneLease({ meta: { run: { since: at(1), pid: process.pid } } })), min: 5, now: T0 + 30 * 60000 });
  assert.match(D.lineFor(busy), /^OK iphone: held by fix-nav-morph \(a phone run is on\)$/);
});

// ---- I-125: a held lease whose holder's step the user is on is a user wait, not idle --------------------------
// C-038 (2026-10-04) sat "ready" for the user's Start while the I-111 rule called iphone-runner's lease unused.
const step = (status, states, extra = {}) => ({ id: 'C-038', by: 'fix-nav-morph', kind: 'swipe-pair', status, cur: 0, parts: states.map((state) => ({ state, gate: true })), ...extra });

test('I-125 assess: the holder\'s phone step the user is on (ready, started, recording, reset by Start over) exempts the lease; the runner still preparing does not', () => {
  const A = (steps) => D.assess('iphone', { st: heldSt(phoneLease()), steps, min: 5, now: T0 + 30 * 60000 });
  for (const s of [step('pending', ['ready', 'waiting']), step('active', ['started', 'waiting']), step('active', ['recording', 'waiting']),
    step('active', ['loading', 'waiting'], { epoch: 1 }), step('active', ['done', 'waiting'], { cur: 1 })]) {
    const a = A([s]);
    assert.deepEqual([a.held, a.heldIdle, a.alarm, a.freeMin], [true, false, false, 0], JSON.stringify(s.parts));
    assert.match(D.lineFor(a), /^OK iphone: held by fix-nav-morph; the user's step C-038 by fix-nav-morph \((pending|active), part \d\/2 \w+\) is on the phone \(a user wait, not idle\)$/);
  }
  // not a user wait: a pending step not prepared yet, a step of someone else, a closed step, a non-phone step past Start
  // (I-165: a pending step whose part is loading now waits for the user's Start, tests/unit/self-wait.test.mjs)
  for (const s of [step('pending', ['waiting', 'waiting']), step('active', ['ready', 'waiting'], { by: 'iphone-runner' }),
    step('answered', ['done', 'done']), step('active', ['started'], { kind: 'action', parts: [{ state: 'started' }] })]) {
    const a = A([s]);
    assert.deepEqual([a.heldIdle, a.alarm], [true, true], JSON.stringify(s));
  }
  // no steps passed (older callers): the I-111 rule as before
  assert.equal(D.assess('iphone', { st: heldSt(phoneLease()), min: 5, now: T0 + 30 * 60000 }).alarm, true);
});

test('I-125 record: a user step ends the held-idle episode (the user is on the step) and counts as use, so the clock starts again after it', async () => {
  const A = (steps, now) => D.assess('iphone', { st: heldSt(phoneLease()), steps, activity: D.readState().resources.iphone?.activity || null, min: 5, now });
  const r1 = await D.record([A([], T0 + 7 * 60000)], { now: T0 + 7 * 60000, claim: true, pid: 111 });
  assert.equal(r1[0].news, 'alarm');
  await D.settle('iphone', at(0), { thread: 'T-010', by: 'lead', now: T0 + 7 * 60000 });
  const e = await D.record([A([step('pending', ['ready', 'waiting'])], T0 + 8 * 60000)], { now: T0 + 8 * 60000 });
  assert.equal(e[0].ended.thread, 'T-010');
  assert.match(e[0].ended.note, /the user is on fix-nav-morph's step/);
  assert.deepEqual(D.readState().resources.iphone.activity, { token: 'L1', at: at(8) });
  assert.equal((await D.record([A([step('active', ['started', 'waiting'])], T0 + 20 * 60000)], { now: T0 + 20 * 60000 }))[0].news, null);
  // the step is over: idle counts from the last sighting of it (20), not from the lease's grant (0)
  const after = A([step('answered', ['done', 'done'])], T0 + 24 * 60000);
  assert.deepEqual([after.heldIdle, after.alarm, after.since], [true, false, T0 + 20 * 60000]);
  assert.equal(A([], T0 + 25 * 60000 + 1).alarm, true);
});

// ---- I-144: a lease for the user's own hand test is never idle ------------------------------------------------
// T-121 (2026-10-04): the lead took the lease as "user-try" while the user tried PR-018 on the phone by hand; the I-111
// rule posted an IDLE thread telling the user that their own phone time was unused.
test('I-144: a lease owned by `user` or `user-*` (the user\'s hand test) is not held-idle, however long; it ends an earlier episode; other owners are unchanged', async () => {
  for (const owner of ['user', 'user-try', 'user-PR-018']) {
    assert.equal(D.isUserLease(owner), true, owner);
    const a = D.assess('iphone', { st: heldSt(phoneLease({ owner })), min: 5, now: T0 + 90 * 60000 });
    assert.deepEqual([a.held, a.heldIdle, a.userLease, a.alarm, a.ready], [true, false, true, false, true], owner);
    assert.equal(D.lineFor(a), `OK iphone: held by ${owner} for the user's own hand test (the user's phone time, not idle; I-144)`);
  }
  for (const owner of ['users', 'userX', 'iphone-runner', 'fix-user-try', 'user-', '']) assert.equal(D.isUserLease(owner), false, owner);
  assert.equal(D.assess('iphone', { st: heldSt(phoneLease({ owner: 'fix-user-try' })), min: 5, now: T0 + 30 * 60000 }).alarm, true, 'only the user- prefix');
  // an earlier held-idle episode of an agent ends when the user's lease takes over; nothing new is posted
  const r1 = await D.record([D.assess('iphone', { st: heldSt(phoneLease()), min: 5, now: T0 + 7 * 60000 })], { now: T0 + 7 * 60000, claim: true, pid: 111 });
  assert.equal(r1[0].news, 'alarm');
  const r2 = await D.record([D.assess('iphone', { st: heldSt(phoneLease({ owner: 'user-try', token: 'L2', acquiredAt: at(8) })), min: 5, now: T0 + 30 * 60000 })], { now: T0 + 30 * 60000, claim: true, pid: 111 });
  assert.deepEqual([r2[0].news, r2[0].post, r2[0].ended?.note], [null, false, 'taken by user-try']);
  assert.equal(D.readState().resources.iphone.episode, undefined);
});

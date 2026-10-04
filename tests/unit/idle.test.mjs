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

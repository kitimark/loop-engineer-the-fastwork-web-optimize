// I-171 (mgmt-devices, AGENT_ROLES d0f7aa32): the desk and mgmt-devices hold delegated lock powers (queue moves inside
// the board's priority order; release of an idle iphone lease with waiters after one nudge), but `repair --move` took
// only --by lead and an idle lease could only go by an unaudited --force. Now: --by lead, mgmt-devices, mgmt-desk*, or
// the agent `thread desk set` names; a delegate's move is bounded (never past a user step, a queued timing hold, the
// lead's move or a better-ranked owner; a phone holder's --no-timing hold may pass a timing hold, as I-172 does); the
// delegated release takes only an idle lease with a ready waiter. Both are audited with by and reason.
// Every test uses its own $FW_STATE_DIR (I-041).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, REPO } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const X = await import('../../tools/lib/lock-repair.mjs');
const S = await import('../../tools/lib/status.mjs');
const TR = await import('../../tools/lib/thread-routing.mjs');
const R = 'chrome-measure';
let state;
delete process.env.FW_LOCK_SHARED;
beforeEach(() => { state = tempDir('fw-delegate-'); process.env.FW_STATE_DIR = state; mkdirSync(join(state, 'locks'), { recursive: true }); });
const lf = (f) => join(state, 'locks', f);
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const iso = (t) => new Date(t).toISOString();
const order = (r = R) => L.status(r).queue.map((w) => w.owner);
const auditLines = () => (existsSync(lf('audit.log')) ? readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
/** chrome-measure held by "h"; waiters queued as given: [owner, {noTiming, short, ...}] in order. */
async function queue(...ws) {
  assert.equal((await L.tryAcquire(R, { owner: 'h', kind: 'process', pid: livePid(), noTiming: true })).ok, true);
  for (const [o, extra = {}] of ws) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease', noTiming: true, ...extra })).ok, false);
}
const row = (id, owner) => S.set(id, { by: owner, kind: 'fix', title: `Item ${id}` });

test('I-171: who may move: the lead, mgmt-devices, mgmt-desk*, and the agent the desk names; nobody else', async () => {
  for (const by of ['lead', 'mgmt-devices', 'mgmt-desk', 'mgmt-desk-2']) assert.equal(X.isLockDelegate(by) || by === 'lead', true, by);
  for (const by of ['fix-a', 'mgmt-ops-10', 'Lead', 'mgmt-devicesx', undefined, '']) assert.equal(X.isLockDelegate(by), false, String(by));
  await queue(['a'], ['b']);
  await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 1, by: 'mgmt-ops-10', reason: 'x', apply: true }), /only the lead reorders the queue \(--by lead\), or a delegate/);
  await TR.setDesk({ agent: 'mgmt-ops-10', by: 'lead' });
  assert.equal(X.isLockDelegate('mgmt-ops-10'), true, 'the desk named by the lead');
  const m = await X.moveWaiter(R, { owner: 'b', to: 1, by: 'mgmt-ops-10', reason: 'desk: b is next in the board order', apply: true });
  assert.equal(m.applied, true);
  assert.deepEqual(order(), ['b', 'a']);
  assert.equal(L.status(R).queue[0].movedBy, 'mgmt-ops-10');
  const [line] = auditLines();
  assert.deepEqual([line.code, line.by, line.reason, line.owner, line.from, line.to], ['queue-move', 'mgmt-ops-10', 'desk: b is next in the board order', 'b', 2, 1]);
  await assert.rejects(X.moveWaiter(R, { owner: 'a', to: 1, by: 'mgmt-devices', apply: true }), /needs --reason/);
});

test('I-171: a delegate\'s move is bounded: never past a user step, a queued timing hold, the lead\'s move or a better-ranked owner; the lead is not', async () => {
  await queue(['a'], ['user-try'], ['timed', { noTiming: false }], ['b']);
  const refused = async (owner, to, re) => {
    const before = readFileSync(lf(`${R}.queue.json`), 'utf8');
    await assert.rejects(X.moveWaiter(R, { owner, to, by: 'mgmt-devices', reason: 'x', apply: true }), re);
    await assert.rejects(X.moveWaiter(R, { owner, to, by: 'mgmt-devices', reason: 'x' }), re, 'the dry run refuses the same');
    assert.equal(readFileSync(lf(`${R}.queue.json`), 'utf8'), before, 'nothing written');
  };
  await refused('b', 1, /would pass "user-try", a user step/);
  await refused('b', 3, /would pass "timed", a queued timing hold/);
  await refused('user-try', 3, /would put "user-try", a user step, behind "timed"/);
  await refused('timed', 4, /would put "timed", a queued timing hold, behind "b"/);
  assert.deepEqual(auditLines(), []);
  // passing plain no-timing waiters is fine (both unranked)
  await X.moveWaiter(R, { owner: 'user-try', to: 1, by: 'mgmt-devices', reason: 'x', apply: true });
  assert.deepEqual(order(), ['user-try', 'a', 'timed', 'b']);
  // the board's priority order: a better-ranked owner is never passed by a delegate
  await row('fix-a-row', 'a');
  await row('fix-b-row', 'b');
  await S.setPriority('fix-a-row', 1, { by: 'lead' });
  await S.setPriority('fix-b-row', 2, { by: 'lead' });
  await X.moveWaiter(R, { owner: 'b', to: 3, by: 'lead', reason: 'the lead is not bounded', apply: true });
  assert.deepEqual(order(), ['user-try', 'a', 'b', 'timed']);
  await refused('b', 2, /would pass "a", ranked #1 on the board \(ahead of "b", #2\)/);
  await refused('a', 3, /would put "a", ranked #1 on the board, behind "b" \(#2\)/);
  // the lead's move is never passed by a delegate
  const q = JSON.parse(readFileSync(lf(`${R}.queue.json`), 'utf8')).map((w) => (w.owner === 'user-try' ? { ...w, owner: 'c', movedBy: 'lead', movedAt: iso(Date.now()) } : w));
  writeFileSync(lf(`${R}.queue.json`), JSON.stringify(q));
  await S.setPriority('fix-a-row', 'none', { by: 'lead' });
  await S.setPriority('fix-b-row', 'none', { by: 'lead' });
  await refused('a', 1, /would pass "c", moved by the lead/);
});

test('I-171: a delegate may move the iphone holder\'s --no-timing hold past a queued timing hold (as I-172 does by itself)', async () => {
  await queue(['timed', { noTiming: false }], ['b']);
  // "b" holds the phone, but its entry is a lease (as written before I-172 marks it); I-172 would move it on its next poll
  await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 1, by: 'mgmt-devices', reason: 'x' }), /a queued timing hold/, 'not without the phone');
  assert.equal((await L.tryAcquire('iphone', { owner: 'b', kind: 'lease', ttlSec: 900 })).ok, true);
  const m = await X.moveWaiter(R, { owner: 'b', to: 1, by: 'mgmt-devices', reason: 'b holds the phone (19:13Z case)', apply: true });
  assert.equal(m.applied, true);
  assert.deepEqual(order(), ['b', 'timed']);
});

// ---- delegated release of an idle iphone lease ----------------------------------------------------------------------
const NOW = Date.now();
/** The iphone lease of `owner`, taken `minAgo` minutes ago, plus a ready waiter "w" unless waiter is false. */
async function idleLease(owner, minAgo, { waiter = true, meta } = {}) {
  assert.equal((await L.tryAcquire('iphone', { owner, kind: 'lease', ttlSec: 3600, now: NOW - minAgo * 60000, ...(meta ? { meta } : {}) })).ok, true);
  if (waiter) assert.equal((await L.tryAcquire('iphone', { owner: 'w', kind: 'lease', ttlSec: 900 })).ok, false);
}

test('I-171: release of an idle iphone lease by a delegate: lease idle >= 5 min with a ready waiter; audited with by, reason, idle minutes', async () => {
  await idleLease('fix-x', 7);
  await assert.rejects(X.releaseIdleLease('iphone', { owner: 'fix-x', by: 'fix-y', reason: 'x' }), /only the lead or a delegate/);
  await assert.rejects(X.releaseIdleLease('iphone', { owner: 'fix-x', by: 'mgmt-devices' }), /needs --reason/);
  await assert.rejects(X.releaseIdleLease('chrome-measure', { owner: 'fix-x', by: 'mgmt-devices', reason: 'x' }), /only the iphone lease/);
  await assert.rejects(X.releaseIdleLease('iphone', { owner: 'fix-z', by: 'mgmt-devices', reason: 'x' }), /"fix-z" does not hold iphone \(holder: "fix-x"\)/);
  const out = await X.releaseIdleLease('iphone', { owner: 'fix-x', by: 'mgmt-devices', reason: 'idle 7 min after a nudge, w waits' });
  assert.equal(out.released.owner, 'fix-x');
  assert.equal(out.idleMin, 7);
  assert.equal(L.status('iphone').holder, null);
  const [line] = auditLines();
  assert.deepEqual([line.code, line.by, line.reason, line.resource, line.owner, line.idleMin], ['lease-release', 'mgmt-devices', 'idle 7 min after a nudge, w waits', 'iphone', 'fix-x', 7]);
  assert.equal(line.before.owner, 'fix-x');
  assert.equal(line.after, null);
});

test('I-171: the delegated release refuses a lease in use, idle under 5 min, with no ready waiter, a process hold, or a marked block; user-try goes any time', async () => {
  const refuse = async (re, msg) => { await assert.rejects(X.releaseIdleLease('iphone', { owner: L.status('iphone').holder.owner, by: 'mgmt-devices', reason: 'x' }), re, msg); assert.ok(L.status('iphone').holder, 'still held'); };
  await idleLease('fix-x', 3);
  await refuse(/idle 3 min, under 5/, 'too fresh');
  await L.release('iphone', { owner: 'fix-x' }); await L.dequeue('iphone', 'w');
  await idleLease('fix-x', 9, { waiter: false });
  await refuse(/no ready waiter/);
  await L.dequeue('iphone', 'w');
  assert.equal((await L.tryAcquire('iphone', { owner: 'w', kind: 'lease', ttlSec: 900, notReady: true })).ok, false);
  await refuse(/no ready waiter/, 'a --not-ready entry is no ready waiter (I-155)');
  await L.release('iphone', { owner: 'fix-x' }); await L.dequeue('iphone', 'w');
  // in use: the holder holds its Mac hold
  await idleLease('fix-x', 9);
  assert.equal((await L.tryAcquire(R, { owner: 'fix-x', kind: 'process', pid: livePid(), noTiming: true })).ok, true);
  await refuse(/in use: it holds chrome-measure/);
  await L.release(R, { owner: 'fix-x' });
  await L.release('iphone', { owner: 'fix-x' }); await L.dequeue('iphone', 'w');
  // a ticketed block is marked on the lease (I-160): never released by a delegate
  await idleLease('fix-x', 9, { meta: { block: { id: 'P-1', at: iso(NOW) } } });
  await refuse(/a phone block \(P-1\) is marked on it/);
  await L.release('iphone', { owner: 'fix-x' }); await L.dequeue('iphone', 'w');
  // a process hold of the phone ends with its process
  assert.equal((await L.tryAcquire('iphone', { owner: 'fix-p', kind: 'process', pid: livePid(), now: NOW - 9 * 60000 })).ok, true);
  assert.equal((await L.tryAcquire('iphone', { owner: 'w', kind: 'lease', ttlSec: 900 })).ok, false);
  await refuse(/a process hold/);
  await L.release('iphone', { owner: 'fix-p' }); await L.dequeue('iphone', 'w');
  // the user's own hand test: the delegate releases it on the user's "done", any time, waiters or not
  await idleLease('user-try', 0, { waiter: false });
  const out = await X.releaseIdleLease('iphone', { owner: 'user-try', by: 'mgmt-devices', reason: 'the user said done' });
  assert.equal(out.released.owner, 'user-try');
  assert.equal(L.status('iphone').holder, null);
});

// I-207 (P-130, 2026-10-05 11:03-11:22Z): during a marked phone block every part takes its own --no-timing chrome-measure
// hold, and the block's next part (moved by phone-block priority, I-172) went first at every hand-over: a 1-weight reader
// queued since 11:05:31 waited through the 11:08 and 11:15 gaps (the I-049 10-min rule loses to a moved entry, I-097).
// Now, in a phone-block gap, the readers queued before the block's next part re-queued (or queued >= readerMaxWaitSec)
// form ONE group (cap, load and a 300 s window), and then the part goes first; a hand-made move keeps precedence.
// I-202 (P-122): `doing iphone --between <min>` refused once the runner's phone hold had ended; the block owner may now
// mark the gap for a short while after its hold ends, while that hold carried the block (PHONE_HOLD.gapMarkSec), and
// phoneBlock() / simDeferral / status see it. Everyone else is still refused. Every test uses its own $FW_STATE_DIR.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, REPO } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const R = 'chrome-measure';
let state;
delete process.env.FW_LOCK_SHARED;
delete process.env.FW_LOCK_HELD;
beforeEach(() => { state = tempDir('fw-blockgap-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const on = (cap = 3) => L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test', cap });
const iso = (t) => new Date(t).toISOString();
const MIN = 60000;
const order = () => L.status(R).queue.map((x) => x.owner);
const holder = () => JSON.parse(readFileSync(lockFile(`${R}.json`), 'utf8'));
// a waiting reader's queue entry as `lock.mjs run --shared` writes it (lastSeen fresh, so a hand-over counts it)
const rdEntry = (owner, since, now, o = {}) => ({ owner, kind: 'process', pid: o.pid ?? livePid(), checkout: REPO, since: iso(since), lastSeen: iso(now), queueTtlSec: 60, short: true, maxSec: o.maxSec ?? 300, shared: true, weight: o.weight ?? 1, ...(o.movedBy ? { movedBy: o.movedBy, movedAt: iso(now) } : {}) });
const exEntry = (owner, since, now, o = {}) => ({ owner, kind: 'process', pid: o.pid ?? livePid(), checkout: REPO, since: iso(since), lastSeen: iso(now), queueTtlSec: 600, ...o, ...(o.movedBy ? { movedAt: iso(now) } : {}) });
const rd = (w, now, o = {}) => L.tryAcquire(R, { owner: w.owner, kind: 'process', pid: w.pid, shared: true, weight: w.weight, maxSec: w.maxSec, load1: 0, ncpu: 8, now, ...o });
// the phone block's runner: a process hold of the iphone, and its next part's --no-timing hold of chrome-measure
const runnerPhone = async (pR, now) => assert.equal((await L.tryAcquire('iphone', { owner: 'runner', kind: 'process', pid: pR, now })).ok, true);
const part = (pR, now) => L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now });
// the block's previous part: its --no-timing hold ends (lock free, last release = the runner's): the gap begins
const prevPart = async (pR, at) => { assert.equal((await part(pR, at)).ok, true); await L.release(R, { owner: 'runner' }); };

test('I-207: in a phone-block gap the readers queued before the next part form one group first (the 11:15:43Z race); a reader queued after it waits; then the part goes first', async () => {
  await on(3);
  const now = Date.now(), pR = livePid();
  await runnerPhone(pR, now - 30 * MIN);
  await prevPart(pR, now - 7 * MIN);
  // the free lock at the gap: P-130's queue at 11:15:43Z (int-v8 9:52 min, nav-morph, a timing hold, people-word)
  const iv8 = rdEntry('int-v8', now - 9.8 * MIN, now), nm = rdEntry('nav-morph', now - 9.6 * MIN, now);
  const tb = exEntry('toolbar', now - 7 * MIN, now), pw = rdEntry('people-word', now - 1 * MIN, now);
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([iv8, nm, tb, pw]));
  const p = await part(pR, now);
  assert.equal(p.ok, false, 'the part re-queues (phone-block priority) but does not take the gap');
  assert.deepEqual(order(), ['runner', 'int-v8', 'nav-morph', 'toolbar', 'people-word']);
  assert.equal(L.status(R).queue[0].movedBy, L.PHONE_BLOCK_BY);
  assert.equal(p.next, 'int-v8', 'the first reader queued before the part is served first');
  assert.equal((await part(pR, now + 500)).ok, false, 'the part polls again: still the reader first');
  const late = rdEntry('late', now + 1000, now + 1000);
  const lw = await rd(late, now + 1000);
  assert.equal(lw.ok, false, 'a reader queued after the part waits');
  const a = await rd(iv8, now + 1500);
  assert.equal(a.ok, true);
  assert.equal(a.opened, true, 'int-v8 opens the gap group');
  assert.equal((await rd(nm, now + 2000)).ok, true, 'nav-morph joins it (queued before the part)');
  assert.equal((await rd(pw, now + 2500)).ok, true, 'people-word joins it too, past the timing hold that waits behind the part anyway');
  const l2 = await rd(late, now + 3000);
  assert.equal(l2.ok, false);
  assert.match(l2.why, /"runner" waits for an exclusive hold, moved ahead by phone-block priority/);
  assert.deepEqual(holder().readers.map((x) => x.owner), ['int-v8', 'nav-morph', 'people-word']);
  // the group ends: the part goes first, before "late" and the timing hold
  for (const x of holder().readers) await L.releaseReader(R, x.token);
  assert.equal(L.status(R).next, 'runner');
  assert.equal((await rd(late, now + 4000)).ok, false);
  const g = await part(pR, now + 4500);
  assert.equal(g.ok, true, 'the part is served at the end of the one gap group');
  assert.deepEqual(order(), ['toolbar', 'late']);
});

test('I-207: one gap group per part, bounded to 300 s: a reader that would end later, does not fit, or has a longer cap waits; at the group\'s end the part goes first', async () => {
  await on(3);
  const now = Date.now(), pR = livePid();
  await runnerPhone(pR, now - 30 * MIN);
  await prevPart(pR, now - 7 * MIN);
  const a = rdEntry('a', now - 5 * MIN, now), npm = rdEntry('npm', now - 4 * MIN, now, { weight: 2, maxSec: 480 });
  const big = rdEntry('big', now - 3 * MIN, now, { weight: 3 }), slow = rdEntry('slow', now - 2 * MIN, now);
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([npm, a, big, slow]));
  assert.equal((await part(pR, now)).next, 'a', 'a reader whose cap is longer than the gap window (480 s npm-test) does not open the gap group');
  assert.equal((await rd(npm, now + 200, { job: 'npm-test' })).ok, false);
  const ga = await rd(a, now + 500);
  assert.equal(ga.opened, true);
  const gb = await rd(big, now + 1000);
  assert.equal(gb.ok, false, 'weight 1 + 3 > cap 3');
  assert.match(gb.why, /full/);
  // a 300 s reader polling 40 s into the gap (and on, every 50 s, as a waiting reader does) would end after the window
  for (let s = 40; s <= 290; s += 50) {
    const gs = await rd(slow, now + s * 1000);
    assert.equal(gs.ok, false);
    assert.match(gs.why, /would end after the phone block's gap .*I-207/);
  }
  assert.equal((await rd(slow, now + 290 * 1000, { maxSec: 10 })).ok, true, 'a 10 s job still ends inside the window');
  for (const x of holder().readers) await L.releaseReader(R, x.token);
  assert.equal(L.status(R).next, 'runner', 'no second gap group: "big" and "npm" wait for the next gap');
  assert.equal((await rd(big, now + 300 * 1000)).ok, false);
  assert.equal((await part(pR, now + 301 * 1000)).ok, true);
});

test('I-207: a group running when the part re-queues is its gap group (the 11:03/11:22Z case): readers queued before it join, then the part goes first', async () => {
  await on(3);
  const now = Date.now(), pR = livePid();
  await runnerPhone(pR, now - 30 * MIN);
  await prevPart(pR, now - 9 * MIN);
  const iv8 = rdEntry('int-v8', now - 8 * MIN, now), cd = rdEntry('cd-roll', now - 8 * MIN, now), hx = rdEntry('hero-exit', now - 1 * MIN, now, { weight: 2 });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([iv8, cd, hx]));
  assert.equal((await rd(iv8, now)).opened, true, 'int-v8 got in 90 ms before the part re-queued');
  assert.equal((await part(pR, now + 90)).ok, false);
  assert.equal(L.status(R).queue[0].owner, 'runner');
  assert.equal((await rd(cd, now + 1000)).ok, true, 'cd-roll (queued before the part) joins the running group');
  const h = await rd(hx, now + 1500);
  assert.equal(h.ok, false, '1 + 1 + 2 > cap 3');
  for (const x of holder().readers) await L.releaseReader(R, x.token);
  assert.equal(L.status(R).next, 'runner', 'the running group was the gap: the part goes first now');
  assert.equal((await part(pR, now + 2000)).ok, true);
});

test('I-207: a reader queued after the part but waiting readerMaxWaitSec counts too; a hand-made move keeps precedence; no block (no phone) = no gap rule', async () => {
  await on(3);
  const now = Date.now(), pR = livePid();
  await runnerPhone(pR, now - 30 * MIN);
  await prevPart(pR, now - 13 * MIN);
  const runner = exEntry('runner', now - 12 * MIN, now, { pid: pR, noTiming: true, movedBy: L.PHONE_BLOCK_BY });
  const old = rdEntry('old', now - 10.5 * MIN, now), young = rdEntry('young', now - 9 * MIN, now);
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([runner, old, young]));
  assert.equal(L.status(R).next, 'old', 'queued after the part, but for 10 min (I-049)');
  // a hand-made move ahead of the part goes first, before the gap readers
  const moved = exEntry('ab', now - 1 * MIN, now, { movedBy: 'lead' });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([moved, runner, old, young]));
  assert.equal(L.status(R).next, 'ab');
  // a reader the lead moved ahead of the part: plain I-097 order, it goes first
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([rdEntry('lead-moved', now - 1 * MIN, now, { movedBy: 'lead' }), runner, young]));
  assert.equal(L.status(R).next, 'lead-moved');
  // no gap before the block's first part, or after someone else's hold: I-172's plain priority (the part first)
  writeFileSync(lockFile(`${R}.queue.json`), '[]');
  assert.equal((await L.tryAcquire(R, { owner: 'build', kind: 'process', pid: livePid(), noTiming: true, now })).ok, true);
  await L.release(R, { owner: 'build' });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([runner, old, young]));
  assert.equal(L.status(R).next, 'runner', 'the last hold to end was not the runner\'s: no gap');
  // the phone is gone: no phone-block entry, so no gap rule (a lead-moved exclusive entry still goes first)
  await L.release('iphone', { owner: 'runner', force: true });
  const plain = exEntry('runner', now - 12 * MIN, now, { pid: pR, noTiming: true, movedBy: 'lead' });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([plain, old]));
  assert.equal(L.status(R).next, 'runner');
});

test('I-202: the block owner marks --between after its phone hold ended; phoneBlock, simDeferral and status see the gap; others and late marks are refused', async () => {
  const t0 = Date.now(), pR = livePid();
  await runnerPhone(pR, t0);
  await L.describeHold('iphone', { owner: 'runner', block: 'P-122', now: t0 });
  await L.release('iphone', { owner: 'runner' });
  assert.equal(L.status('iphone').holder, null);
  await assert.rejects(L.describeHold('iphone', { owner: 'other', betweenMin: 2 }), /not held/);
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', job: { text: 'x' } }), /not held/, 'only the block marks, no job text');
  const now = Date.now();
  const g = await L.describeHold('iphone', { owner: 'runner', betweenMin: 2, now });
  assert.equal(g.meta.block.id, 'P-122');
  assert.deepEqual(g.meta.between, { at: iso(now), until: iso(now + 2 * MIN) });
  const b = L.phoneBlock(undefined, now + 1000);
  assert.equal(b.owner, 'runner');
  assert.equal(b.id, 'P-122');
  assert.equal(b.between.until, iso(now + 2 * MIN));
  assert.equal(L.simDeferral({ owner: 'sim', maxSec: 60, h: null, q: [], now: now + 1000 }), null, 'a session that fits the gap starts');
  assert.match(L.simDeferral({ owner: 'sim', maxSec: 300, h: null, q: [], now: now + 1000 }), /phone block P-122 of "runner".*before this session's 300 s would/);
  assert.equal(L.status('iphone').blockGap.id, 'P-122', 'status shows the gap of the free phone');
  // --between 0 ends the window, the owner may set it again; --block none ends the gap
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 0 });
  assert.equal(L.phoneBlock(), null);
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 1 });
  assert.ok(L.phoneBlock());
  await L.describeHold('iphone', { owner: 'runner', block: null });
  assert.equal(L.phoneBlock(), null);
  // after the window ends, or past gapMarkSec after the hold's end, a mark is refused
  assert.equal(L.PHONE_HOLD.gapMarkSec, 180);
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', betweenMin: 2, now: now + 181 * 1000 }), /not held/);
});

test('I-202: no gap without a block on the ended hold; another owner\'s hold ends the gap; the window ends with its until', async () => {
  const pR = livePid(), pX = livePid();
  await runnerPhone(pR, Date.now());
  await L.release('iphone', { owner: 'runner' });
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', betweenMin: 2 }), /not held/, 'the ended hold carried no block');
  await runnerPhone(pR, Date.now());
  await L.describeHold('iphone', { owner: 'runner', block: 'P-7' });
  await L.release('iphone', { owner: 'runner' });
  const now = Date.now();
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 1, now });
  assert.equal(L.phoneBlock(undefined, now + 59 * 1000)?.id, 'P-7');
  assert.equal(L.phoneBlock(undefined, now + 61 * 1000), null, 'past its until the gap is no block any more');
  // someone else takes the phone: the gap is gone (that holder decides), also after it leaves
  assert.equal((await L.tryAcquire('iphone', { owner: 'x', kind: 'process', pid: pX })).ok, true);
  assert.equal(L.phoneBlock(), null);
  await L.release('iphone', { owner: 'x' });
  assert.equal(L.phoneBlock(), null);
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', betweenMin: 1 }), /not held/);
});

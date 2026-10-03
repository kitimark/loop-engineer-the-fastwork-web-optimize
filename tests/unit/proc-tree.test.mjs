// tools/lib/proc-tree.mjs (I-099): what is left of a killed command's tree, and the bounded wait after the SIGKILL
// until it is gone, so `lock.mjs run` never releases its lock beside a dying process. treeState runs on hand-made ps
// rows; waitTreeGone on a fake clock with a scripted sample (a kill that lands late, one that never lands).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { psTable, descendants, treeState, waitTreeGone } from '../../tools/lib/proc-tree.mjs';

const SELF = 100;
// [pid, ppid, pgid, stat]
const rows = [
  [1, 0, 1, 'Ss'], [SELF, 1, SELF, 'S'],
  [200, SELF, 200, 'S'], // the command (its own group: detached)
  [201, 200, 200, 'S'], // a child in the command's group
  [202, 201, 202, 'S'], // a grandchild that left the group
  [300, 1, 300, 'S'], // unrelated
];

test('descendants: the whole subtree with each pgid', () => {
  assert.deepEqual(descendants(rows, 200), [[201, 200], [202, 202]]);
  assert.deepEqual(descendants(rows, 300), []);
});

test('treeState: the command and its descendants run; unrelated processes do not count', () => {
  assert.deepEqual(treeState(rows, 200, new Map(), SELF), { alive: [200, 201, 202], dying: [] });
});

test('treeState: an orphan seen earlier still counts (pid + pgid), a reused pid does not', () => {
  // the command exited; 202 was reparented to launchd; 201 is gone and its pid reused by another group
  const later = [[1, 0, 1, 'Ss'], [SELF, 1, SELF, 'S'], [202, 1, 202, 'S'], [201, 1, 999, 'S']];
  const seen = new Map([[201, 200], [202, 202]]);
  assert.deepEqual(treeState(later, 200, seen, SELF), { alive: [202], dying: [] });
});

test('treeState: a zombie of this process counts as gone (it reaps it); an orphan zombie is dying, not alive', () => {
  const z = [[1, 0, 1, 'Ss'], [SELF, 1, SELF, 'S'], [200, SELF, 200, 'Z'], [202, 1, 202, 'Z']];
  assert.deepEqual(treeState(z, 200, new Map([[202, 202]]), SELF), { alive: [], dying: [202] });
});

/** A fake clock: sleep() advances it. */
function clock() {
  let t = 5_000;
  return { now: () => t, sleep: (ms) => { t += ms; } };
}

test('waitTreeGone: a SIGKILL that lands late (I-099 race) is waited out, not raced: gone once the sample is empty', () => {
  const c = clock();
  const diesAt = 5_000 + 400; // the process is in the table for 400 ms after the kill
  let polls = 0;
  const r = waitTreeGone(() => (c.now() < diesAt ? { alive: [202], dying: [] } : { alive: [], dying: [] }), { boundMs: 1500, pollMs: 25, ...c, onPoll: () => polls++ });
  assert.equal(r.gone, true);
  assert.deepEqual([r.alive, r.dying], [[], []]);
  assert.ok(r.waitedMs >= 400 && r.waitedMs < 450, `waited ${r.waitedMs} ms`);
  assert.ok(polls >= 16, `onPoll ran before every sample (${polls})`);
});

test('waitTreeGone: an orphan zombie (launchd not yet reaped it) is waited for too', () => {
  const c = clock();
  const r = waitTreeGone(() => (c.now() < 5_100 ? { alive: [], dying: [202] } : { alive: [], dying: [] }), { boundMs: 1500, ...c });
  assert.equal(r.gone, true);
  assert.ok(r.waitedMs >= 100);
});

test('waitTreeGone: at the bound it stops and names what still runs (the caller reports it)', () => {
  const c = clock();
  const r = waitTreeGone(() => ({ alive: [202, 203], dying: [204] }), { boundMs: 1500, pollMs: 25, ...c });
  assert.equal(r.gone, false);
  assert.deepEqual(r.alive, [202, 203]);
  assert.deepEqual(r.dying, [204]);
  assert.equal(r.waitedMs, 1500, 'never sleeps past the bound');
});

test('waitTreeGone: an empty tree returns at once, without sleeping', () => {
  let slept = 0;
  const r = waitTreeGone(() => ({ alive: [], dying: [] }), { sleep: () => slept++ });
  assert.deepEqual([r.gone, slept], [true, 0]);
});

test('psTable + treeState on a real process: running, then gone once killed and reaped', async () => {
  const c = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  const st = treeState(psTable(), c.pid);
  assert.deepEqual(st.alive, [c.pid]);
  const exited = new Promise((r) => c.on('exit', r));
  process.kill(c.pid, 'SIGKILL');
  await exited; // libuv reaps the child before 'exit'
  const r = waitTreeGone(() => treeState(psTable(), c.pid, new Map([[c.pid, c.pid]])), { boundMs: 1500 });
  assert.equal(r.gone, true);
});

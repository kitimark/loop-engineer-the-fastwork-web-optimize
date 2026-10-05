// Incident I-123 (user T-078) end to end on a temp state dir: a console step on the iPhone versus the iphone lease.
// C-037 (2026-10-04): the user's Start over came 0.5 s before the runner armed `console.mjs wait --until answered`, the
// runner's lease ran out mid-step and went to the next waiter, which navigated the phone and posted its own step.
// One test per part: (a) `lock.mjs status` KEPT and the next waiter's acquire waits, (b) `console.mjs wait` REDO at once
// for a missed Start over and --epoch, (c) `idle.mjs check` STUCK + one thread to the steward (I-175), (d)
// `iphone.mjs` WAIT before it touches the phone, (f) `console.mjs post` of a phone step needs the lease and no other
// open phone step. No port 5173, phone (FW_IPHONE_PORT points at a closed port), Chrome, real locks or real store.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, freePort } from '../helpers.mjs';

const CON = tool('console.mjs'), LOCK = tool('lock.mjs'), IDLE = tool('idle.mjs'), IPHONE = tool('iphone.mjs');
const A = 'http://page-a.invalid:5401/', B = 'http://page-b.invalid:5402/';
let state, env;
beforeEach(async () => { state = tempDir('fw-phonestep-e2e-'); env = { FW_STATE_DIR: state, FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()) }; });
const con = (...a) => node(CON, a, { env });
const lock = (...a) => node(LOCK, a, { env });
const ok = (r) => { assert.equal(r.code, 0, r.out); return r; };
const postPair = (by) => con('post', '--by', by, '--kind', 'swipe-pair', '--title', 'Pair', '--url', A, '--url2', B);

/** C-001 by fix-nav-morph (holding the lease): both parts done, then the user's Start over; the runner has not acted since. */
async function c037() {
  ok(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'fix-nav-morph', '--ttl', '900'));
  assert.match(ok(postPair('fix-nav-morph')).stdout, /^POSTED C-001/m);
  process.env.FW_STATE_DIR = state; // the user's clicks, as the page sends them (lib calls on the same store)
  const C = await import('../../tools/lib/console.mjs');
  for (const n of [1, 2]) {
    ok(con('ack', 'C-001', '--by', 'fix-nav-morph', '--part', String(n), '--state', 'ready'));
    await C.start('C-001', { part: n });
    ok(con('ack', 'C-001', '--by', 'fix-nav-morph', '--part', String(n), '--state', 'recording'));
    await C.done('C-001', { part: n });
  }
  await C.restart('C-001');
  return C;
}

test('I-123 f: post of a phone step needs the poster\'s lease and no other open phone step; the lead and questions are exempt', () => {
  let r = postPair('fix-x');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /needs your iphone lease first: you \("fix-x"\) don't hold it\. Post and run the step inside your phone hold: node tools\/lock\.mjs run iphone --owner fix-x -- /);
  r = con('post', '--by', 'fix-x', '--kind', 'action', '--title', 'Hold the phone', '--phone');
  assert.equal(r.code, 1, '--phone marks a phone step');
  ok(con('post', '--by', 'fix-x', '--kind', 'question', '--title', 'Phone charged?'));
  ok(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'iphone-runner', '--ttl', '900'));
  assert.match(ok(postPair('iphone-runner')).stdout, /^POSTED C-002/m);
  r = con('post', '--by', 'iphone-runner', '--kind', 'action', '--title', 'Finger scroll', '--record');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /another phone step is open: C-002 by iphone-runner \(pending, part 1\/2 waiting\)\. One phone step at a time/);
  assert.match(ok(con('post', '--by', 'lead', '--kind', 'action', '--title', 'Finger scroll', '--record')).stdout, /^POSTED C-003/m);
  assert.equal(JSON.parse(con('list', '--json').stdout).length, 3, 'nothing written for a refused post');
});

test('I-123 b: a wait armed just after an unacked Start over exits 5 REDO at once ("missed"); --epoch names the epoch the runner saw', async () => {
  await c037();
  const t0 = Date.now();
  let r = con('wait', 'C-001', '--until', 'answered', '--timeout', '30', '--json', '--quiet');
  assert.equal(r.code, 5, r.out);
  assert.ok(Date.now() - t0 < 10000, 'at once, not at the timeout');
  assert.deepEqual((({ action, by, epoch, attempts, missed }) => ({ action, by, epoch, attempts, missed }))(JSON.parse(r.stdout)), { action: 'restart', by: 'user', epoch: 1, attempts: [2, 2], missed: true });
  ok(con('ack', 'C-001', '--by', 'fix-nav-morph', '--part', '1', '--attempt', '2', '--state', 'loading', '--message', 'loading page 1 again'));
  r = con('wait', 'C-001', '--until', 'started', '--part', '1', '--timeout', '1', '--quiet');
  assert.equal(r.code, 3, `acked: an ordinary wait now\n${r.out}`);
  r = con('wait', 'C-001', '--until', 'started', '--part', '1', '--epoch', '0', '--timeout', '30', '--quiet');
  assert.equal(r.code, 5, r.out);
  assert.match(r.stdout, /^REDO console C-001 part 1 started: \{.*"epoch":1/m);
  r = con('wait', 'C-001', '--until', 'redo', '--epoch', '0', '--timeout', '30', '--quiet');
  assert.equal(r.code, 0, r.out);
  assert.equal(con('wait', 'C-001', '--epoch', 'x', '--timeout', '1').code, 1);
});

test('I-123 a: lock.mjs status says KEPT for a lease that ran out under its owner\'s step; the next waiter waits; the step\'s end frees it', async () => {
  const C = await c037();
  const f = join(state, 'locks', 'iphone.json');
  const h = JSON.parse(readFileSync(f, 'utf8'));
  h.expiresAt = new Date(Date.now() - 5000).toISOString(); // 06:27:44Z
  writeFileSync(f, JSON.stringify(h));
  let r = ok(lock('status'));
  assert.match(r.stdout, /^iphone +held by "fix-nav-morph"/m);
  assert.match(r.stdout, /KEPT: lease ran out at .*; kept for its owner's step C-001 on the phone until .* \(I-123\)/);
  r = lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'iphone-runner', '--ttl', '900', '--wait', '0');
  assert.equal(r.code, 3, r.out);
  assert.match(readFileSync(join(state, 'locks', 'step-grace.log'), 'utf8'), /"owner":"fix-nav-morph".*"step":"C-001".*"seenBy":"iphone-runner"/);
  await C.skip('C-001');
  r = ok(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'iphone-runner', '--ttl', '900', '--wait', '0'));
  assert.match(r.stdout, /^ACQUIRED iphone for "iphone-runner"/m);
});

test('I-123 d: iphone.mjs refuses (WAIT, exit 1) under another owner\'s step before it touches the phone; its own runner and --ignore-step pass', async () => {
  const C = await c037();
  ok(lock('release', 'iphone', '--owner', 'fix-nav-morph')); // say the lease went to the next waiter anyway
  ok(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'iphone-runner', '--ttl', '900'));
  for (const args of [['open', 'http://page-c.invalid:5403/'], ['park'], ['scroll'], ['record', '--seconds', '1']]) {
    const r = node(IPHONE, [...args, '--owner', 'iphone-runner'], { env });
    assert.equal(r.code, 1, `${args[0]}: ${r.out}`);
    assert.match(r.stderr, /^WAIT: the user's step C-001 by fix-nav-morph \(active, part 1\/2 waiting\) is on the iPhone: don't navigate the phone/m, args[0]);
    assert.match(r.stderr, /node tools\/console\.mjs wait C-001 --until answered/);
  }
  // --ignore-step names it on purpose: the guard passes (and park then fails on the closed proxy port, not on WAIT)
  const r = node(IPHONE, ['park', '--owner', 'iphone-runner', '--ignore-step', 'C-001'], { env });
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.stderr, /WAIT: the user's step/);
  await C.cancel('C-001', { by: 'fix-nav-morph' });
  assert.doesNotMatch(node(IPHONE, ['park', '--owner', 'iphone-runner'], { env }).stderr, /WAIT: the user's step/);
});

test('I-123 c: idle.mjs check says STUCK after 2 min without the runner (exit 3), one thread to the steward (I-175: not the runner or the desk), closed when the step moves on', async () => {
  await c037();
  const C = await import('../../tools/lib/console.mjs');
  const at = (min) => new Date(Date.parse(C.get('C-001').updatedAt) + min * 60000).toISOString();
  const idle = (min, ...a) => node(IDLE, ['check', ...a], { env: { ...env, FW_IDLE_NOW: at(min) } });
  let r = idle(1.9, '--by', 'lead');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /STUCK/);
  assert.match(r.stdout, /^OK iphone: held by fix-nav-morph; the user's step C-001 by fix-nav-morph \(active, part 1\/2 waiting\) is on the phone \(a user wait, not idle\)$/m, 'I-125');
  const TR = await import('../../tools/lib/thread-routing.mjs');
  await TR.setDesk({ agent: 'mgmt-ops-10', by: 'lead' });
  await TR.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  r = idle(10, '--by', 'lead');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^STUCK C-001: part 1 \(attempt 2\) waits on fix-nav-morph for 10 min \(gated, waiting: Start stays off until fix-nav-morph acks ready; nothing since the user's Start over at \d\d:\d\dZ\)$/m);
  assert.match(r.stdout, /^POSTED T-001 C-001: C-001 part 1 waits on fix-nav-morph for 10 min \(to mgmt-devices\)$/m);
  const TH = await import('../../tools/lib/console-threads.mjs');
  const t = TH.getThread('T-001');
  assert.deepEqual(t.assignees, ['mgmt-devices']);
  assert.match(t.messages[0].text, /^Steward \(mgmt-devices\): nudge fix-nav-morph by message/m);
  assert.doesNotMatch(t.messages[0].text, /invalid|Pair/, 'no URL or step title in the thread');
  r = idle(11, '--by', 'lead');
  assert.equal(r.code, 3);
  assert.doesNotMatch(r.stdout, /POSTED/, 'one thread per stuck period');
  r = node(IDLE, ['check', '--step-min', '30'], { env: { ...env, FW_IDLE_NOW: at(12) } });
  assert.doesNotMatch(r.stdout, /STUCK|ENDED/, '--step-min: not stuck under a larger limit, and the episode goes on');
  ok(con('ack', 'C-001', '--by', 'fix-nav-morph', '--part', '1', '--state', 'loading'));
  r = node(IDLE, ['check', '--by', 'lead'], { env: { ...env, FW_IDLE_NOW: new Date(Date.parse(C.get('C-001').updatedAt) + 30000).toISOString() } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ENDED C-001: the step moved on; thread T-001$/m);
  assert.match(r.stdout, /^CLOSED T-001 \(C-001 moved on\)$/m);
  assert.equal(TH.getThread('T-001').status, 'closed');
});

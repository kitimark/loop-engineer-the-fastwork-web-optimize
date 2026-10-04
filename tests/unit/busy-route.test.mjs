// I-164 (user T-147, memory/busy-workers-answer-later.md): a user question on a thread whose owner is busy (its status
// row is implementing, testing or measuring, or it holds chrome-measure or the iphone lease) does not wake the owner: the
// router hands it to the next free listener (the desk) or nobody (the lead's triage wakes at once), and the busy owner
// gets it as a non-waking FYI (message `later: [agents]`) that wakes its listener once its step ends. Exceptions: the
// user's answer to the owner's own question (its --ask), a `thread wait --thread` (it waits for that reply), and
// proposal decisions (another path, proposal.mjs). Own $FW_STATE_DIR; fake agent names only.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const T = await import('../../tools/lib/console-threads.mjs');
const R = await import('../../tools/lib/thread-routing.mjs');
const W = await import('../../tools/lib/waits.mjs');
const S = await import('../../tools/lib/status.mjs');
const L = await import('../../tools/lib/lock.mjs');
const DATA = { items: [] };
let live = [];
beforeEach(() => { for (const w of live) w.end(); live = []; process.env.FW_STATE_DIR = tempDir('fw-busy-'); });

const listen = (agent) => live.push(W.startWait({ tool: R.WAIT_TOOL, owner: agent, what: 'a user reply', timeoutSec: 3600, onExit: false }));
const row = (id, owner, state) => S.set(id, { by: owner, kind: 'fix', title: `Row ${id}`, state, progressData: DATA });
const news = (c) => { const r = c.check(); return r.met ? JSON.parse(r.detail) : []; };

test('I-164: busyState (pure): a row implementing/testing/measuring, or a busy lock held under the agent\'s name or its row id; never the lead', () => {
  const statusRows = [
    { id: 'hero-x', owner: 'fix-hero', state: 'measuring' },
    { id: 'nav', owner: 'fix-nav', state: 'researching' },
    { id: 'blur', owner: 'fix-blur', state: 'waiting' },
    { id: 'glow', owner: 'fix-glow', state: 'designing' },
    { id: 'lead-row', owner: 'lead', state: 'implementing' },
  ];
  const holders = [{ resource: 'iphone', owner: 'blur' }, { resource: 'chrome-measure', owner: 'fix-glow' }];
  const b = R.busyState({ statusRows, holders });
  assert.deepEqual(b('fix-hero'), { busy: true, why: 'hero-x measuring' });
  assert.deepEqual(b('fix-nav'), { busy: false, why: '' }, 'researching is not busy');
  assert.deepEqual(b('fix-blur'), { busy: true, why: 'holds iphone' }, 'a lock held under its row id');
  assert.deepEqual(b('fix-glow'), { busy: true, why: 'holds chrome-measure' });
  assert.deepEqual(b('lead'), { busy: false, why: '' });
  assert.deepEqual(b('fix-none'), { busy: false, why: '' });
  assert.deepEqual(R.BUSY_STATES, ['implementing', 'testing', 'measuring']);
});

test('I-164: lockHolders reads the live holder of chrome-measure and iphone (an expired lease is no holder); loadBusy reads rows and locks', async () => {
  assert.deepEqual(R.lockHolders(), []);
  await L.acquire('iphone', { owner: 'fix-phone', kind: 'lease', ttlSec: 600, log: () => {} });
  assert.deepEqual(R.lockHolders(), [{ resource: 'iphone', owner: 'fix-phone' }]);
  await row('hero-x', 'fix-hero', 'testing');
  const busy = await R.loadBusy();
  assert.deepEqual(busy()('fix-phone'), { busy: true, why: 'holds iphone' });
  assert.deepEqual(busy()('fix-hero'), { busy: true, why: 'hero-x testing' });
  await L.release('iphone', { owner: 'fix-phone' });
  assert.deepEqual(R.lockHolders(), []);
  assert.equal(busy({ now: Date.now() + 10000 })('fix-phone').busy, false, 'read again after the cache');
});

test('I-164: a user question to a busy listening owner goes to the free desk; the owner gets a non-waking FYI that wakes it when its step ends', async () => {
  listen('fix-hero'); listen('mgmt-desk');
  await R.setDesk({ agent: 'mgmt-desk', by: 'lead' });
  await row('hero-x', 'fix-hero', 'measuring');
  const t = (await T.createThread({ by: 'lead', title: 'Hero question', text: 'hi', to: 'fix-hero' })).thread;
  const r = await T.replyUser(t.id, { text: 'what are the two page parts?' });
  assert.deepEqual(r.thread.assignees, ['fix-hero', 'mgmt-desk'], 'routed on to the desk');
  assert.equal(r.thread.history.at(-1).note, 'mgmt-desk (the desk; fix-hero busy: hero-x measuring)');
  assert.deepEqual(r.thread.messages.at(-1).later, ['fix-hero'], 'the busy owner gets it later');
  const busy = await R.loadBusy();
  assert.deepEqual(news(T.threadWaitCondition({ as: 'fix-hero', busy })), [], 'busy: its listener does not wake');
  assert.equal(news(T.threadWaitCondition({ as: 'mgmt-desk', busy })).length, 1, 'the desk wakes');
  assert.equal(news(T.threadWaitCondition({ as: 'fix-hero', thread: t.id, busy })).length, 1, 'a --thread wait still wakes');
  assert.deepEqual(news(T.threadWaitCondition({ as: 'lead', triage: true, busy })), [], 'the desk listens: the lead sleeps');
  // the step ends: the FYI wakes the owner's listener, marked as such
  await S.set('hero-x', { by: 'fix-hero', state: 'designing', progressData: DATA });
  const n = news(T.threadWaitCondition({ as: 'fix-hero', busy: await R.loadBusy() }));
  assert.deepEqual(n.map((x) => x.messages.map((m) => [m.n, m.fyi])), [[[2, true]]]);
  assert.match(T.wakeLines(n[0])[0], /^WAKE new T-001 #2 by user \(FYI: sent while you were busy; the desk or the lead answered\): what are/);
  assert.match(T.newsText(n[0], 'fix-hero'), /#2 by user \(FYI: sent while you were busy; the desk or the lead answered\)/);
});

test('I-164: a busy owner with nobody free: no routing, the lead\'s triage wakes at once with the reason; a free owner wakes as before', async () => {
  listen('fix-hero');
  await L.acquire('iphone', { owner: 'fix-hero', kind: 'lease', ttlSec: 600, log: () => {} });
  const t = (await T.createThread({ by: 'lead', title: 'Hero question', text: 'hi', to: 'fix-hero' })).thread;
  const r = await T.replyUser(t.id, { text: 'why?' });
  assert.deepEqual(r.thread.assignees, ['fix-hero']);
  assert.equal(r.thread.history.filter((h) => h.who === 'router').length, 0);
  const busy = await R.loadBusy();
  assert.deepEqual(news(T.threadWaitCondition({ as: 'lead', triage: true, busy })).map((x) => x.why), [['#2 nobody free (fix-hero busy: holds iphone)']]);
  assert.deepEqual(news(T.threadWaitCondition({ as: 'fix-hero', busy })), []);
  await L.release('iphone', { owner: 'fix-hero' });
  // free now: a new question goes to it and wakes it at once (no FYI mark)
  const r2 = await T.replyUser(t.id, { text: 'and now?' });
  assert.equal(r2.thread.messages.at(-1).later, undefined);
  const n = news(T.threadWaitCondition({ as: 'fix-hero', busy: await R.loadBusy() }));
  assert.deepEqual(n[0].messages.map((m) => [m.n, !!m.fyi]), [[2, true], [3, false]], 'the FYI comes along with the waking message');
});

test('I-164: the user\'s answer to the busy owner\'s own question (--ask) still wakes it; no busy test given: every message wakes (old behaviour)', async () => {
  listen('fix-hero'); listen('mgmt-desk');
  await R.setDesk({ agent: 'mgmt-desk', by: 'lead' });
  await row('hero-x', 'fix-hero', 'implementing');
  const t = (await T.createThread({ by: 'lead', title: 'Hero question', text: 'hi', to: 'fix-hero' })).thread;
  await T.replyAgent(t.id, { by: 'fix-hero', text: 'which swipe felt slow, A or B?', ask: true });
  const r = await T.replyUser(t.id, { text: 'B' });
  assert.equal(r.thread.messages.at(-1).later, undefined, 'an answer to its own question');
  assert.deepEqual(r.thread.assignees, ['fix-hero'], 'not routed: the owner is the one asking');
  assert.equal(news(T.threadWaitCondition({ as: 'fix-hero', busy: await R.loadBusy() })).length, 1);
  await R.setDesk({ agent: null, by: 'lead' });
  const lead = async (min) => news(T.threadWaitCondition({ as: 'lead', triage: true, busy: await R.loadBusy(), now: () => Date.now() + min * 60000 })).map((x) => x.why);
  assert.deepEqual(await lead(0), [], 'the asking owner has its answer: the lead sleeps');
  assert.deepEqual(await lead(10), [['#3 unanswered 10 min (owner: fix-hero)']]);
  await T.commitWait('fix-hero', news(T.threadWaitCondition({ as: 'fix-hero' })));
  const r2 = await T.replyUser(t.id, { text: 'also, a new question' });
  assert.deepEqual(r2.thread.messages.at(-1).later, ['fix-hero'], 'a new question after the answer: later');
  assert.equal(news(T.threadWaitCondition({ as: 'fix-hero' })).length, 1, 'no busy test: wakes');
});

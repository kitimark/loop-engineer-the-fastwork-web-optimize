// T-050 / T-051 thread routing (research/architecture/thread-routing.md §4-§5, "Decisions"): tools/lib/thread-routing.mjs
// in-process. listening (a live thread wait, or a read/write within 5 min), routeOwner's order (anchor owner > the
// lead's topic map > the status-board owner > desk > nobody; agents not listening skipped), the desk and the topic
// map (lead only). Own $FW_STATE_DIR; fake names only.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const R = await import('../../tools/lib/thread-routing.mjs');
beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-routing-'); });

const NOW = Date.parse('2026-10-03T12:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const wait = (owner, tool = R.WAIT_TOOL) => ({ schema: 'fw-wait/1', owner, tool, pid: 1, since: ago(30) });
const L = (...names) => (a) => names.includes(a);
const rows = [
  { id: 'cd-strip', owner: 'fix-cd-strip', progress: 'countdown' },
  { id: 'hero-exit', owner: 'fix-hero-exit' },
];
const steps = [{ id: 'C-007', by: 'fix-probe' }];
const proposals = [{ id: 'PR-004', by: 'de-glow' }];

test('listening: a live thread wait counts (other waits do not); a read or a reply 4 min ago counts, 6 min ago does not', () => {
  const threads = [
    { readsAt: { 'fix-a': ago(4), 'fix-b': ago(6) }, messages: [{ n: 1, by: 'user', at: ago(1) }, { n: 2, by: 'fix-c', at: ago(4) }, { n: 3, by: 'fix-d', at: ago(6) }] },
  ];
  const s = R.listeningState({ now: NOW, waits: [wait('fix-w'), wait('fix-x', 'wait.mjs file')], threads });
  assert.deepEqual(s('fix-w'), { listening: true, how: 'waiting' });
  assert.equal(s('fix-x').listening, false, 'a non-thread wait is not listening for threads');
  assert.deepEqual(s('fix-a'), { listening: true, how: 'active 4 min ago' });
  assert.equal(s('fix-b').listening, false);
  assert.equal(s('fix-c').listening, true, 'replied 4 min ago');
  assert.equal(s('fix-d').listening, false, 'replied 6 min ago');
  assert.equal(s('user').listening, false);
  assert.equal(s(undefined).listening, false);
  const f = R.listeningFn({ now: NOW, waits: [], threads });
  assert.equal(f('fix-a'), true);
  assert.equal(f('fix-w'), false, 'no live wait given: only activity counts');
});

test('listening: listWaits drops a wait whose pid is dead (the registry\'s rule)', async () => {
  const W = await import('../../tools/lib/waits.mjs');
  const live = W.startWait({ tool: R.WAIT_TOOL, owner: 'fix-live', what: 'a user reply', timeoutSec: 600, onExit: false });
  W.startWait({ tool: R.WAIT_TOOL, owner: 'fix-dead', what: 'a user reply', timeoutSec: 600, pid: 999999, onExit: false });
  const s = R.listeningState({ threads: [] });
  assert.equal(s('fix-live').listening, true);
  assert.equal(s('fix-dead').listening, false);
  live.end();
});

test('routeOwner order: anchor owner > the lead\'s topic map > status-board owner > desk > null', () => {
  const ctx = { statusRows: rows, steps, proposals, topics: { 'hero-exit': { owner: 'arch-hero' } }, desk: 'mgmt-ops-10' };
  const all = () => true;
  assert.deepEqual(R.routeOwner({ anchor: { page: 'status', item: 'status:cd-strip' }, topic: 'hero-exit' }, { ...ctx, listening: all }), { owner: 'fix-cd-strip', why: 'owner of cd-strip' });
  assert.deepEqual(R.routeOwner({ anchor: { page: 'progress', item: 'progress:countdown' } }, { ...ctx, listening: all }), { owner: 'fix-cd-strip', why: 'owner of cd-strip' });
  assert.deepEqual(R.routeOwner({ anchor: { page: 'steps', item: 'step:C-007' } }, { ...ctx, listening: all }), { owner: 'fix-probe', why: 'author of C-007' });
  assert.deepEqual(R.routeOwner({ anchor: { page: 'proposals', item: 'PR-004/section:gain' } }, { ...ctx, listening: all }), { owner: 'de-glow', why: 'author of PR-004' });
  // T-051: the lead's map wins over the status-board owner
  assert.deepEqual(R.routeOwner({ topic: 'hero-exit' }, { ...ctx, listening: all }), { owner: 'arch-hero', why: 'topic hero-exit, set by the lead' });
  assert.deepEqual(R.routeOwner({ topic: 'cd-strip' }, { ...ctx, listening: all }), { owner: 'fix-cd-strip', why: 'owner of cd-strip' });
  assert.deepEqual(R.routeOwner({ anchor: { page: 'status', item: 'part:page' } }, { ...ctx, listening: all }), { owner: 'mgmt-ops-10', why: 'the desk' });
  assert.equal(R.routeOwner({}, { ...ctx, desk: null, listening: all }), null);
});

test('routeOwner skips agents that are not listening, the map\'s owner included; nobody listening: null', () => {
  const ctx = { statusRows: rows, steps, proposals, topics: { 'hero-exit': { owner: 'arch-hero' } }, desk: 'mgmt-ops-10' };
  // T-051: the map's owner is not listening -> the status-board owner
  assert.deepEqual(R.routeOwner({ topic: 'hero-exit' }, { ...ctx, listening: L('fix-hero-exit', 'mgmt-ops-10') }), { owner: 'fix-hero-exit', why: 'owner of hero-exit' });
  assert.deepEqual(R.routeOwner({ topic: 'hero-exit' }, { ...ctx, listening: L('mgmt-ops-10') }), { owner: 'mgmt-ops-10', why: 'the desk' });
  assert.deepEqual(R.routeOwner({ anchor: { page: 'proposals', item: 'PR-004' } }, { ...ctx, listening: L('mgmt-ops-10') }), { owner: 'mgmt-ops-10', why: 'the desk' });
  assert.equal(R.routeOwner({ topic: 'hero-exit' }, { ...ctx, listening: L() }), null, 'a desk that is not listening counts for nothing');
  // the lead and the user are never routed to
  assert.equal(R.routeOwner({ topic: 'x' }, { statusRows: [{ id: 'x', owner: 'lead' }], desk: 'lead', listening: () => true }), null);
});

test('desk and topic map: lead only; set, show and clear', async () => {
  await assert.rejects(R.setDesk({ agent: 'mgmt-ops-10', by: 'mgmt-ops-10' }), /only the lead names the desk/);
  await assert.rejects(R.setTopicOwner('hero-exit', { owner: 'arch-hero', by: 'fix-a' }), /only the lead sets topic owners/);
  assert.equal(R.getDesk(), null);
  assert.equal(R.deskText({ waits: [] }), 'no desk set: the lead is the desk');
  await R.setDesk({ agent: 'mgmt-ops-10', by: 'lead' });
  assert.equal(R.getDesk().agent, 'mgmt-ops-10');
  assert.match(R.deskText({ waits: [] }), /^mgmt-ops-10, not listening: the lead is the desk until it arms `thread wait --as mgmt-ops-10`$/);
  assert.match(R.deskText({ waits: [wait('mgmt-ops-10')] }), /^mgmt-ops-10, listening \(waiting\)/);
  await R.setDesk({ agent: null, by: 'lead' });
  assert.equal(R.getDesk(), null);
  await assert.rejects(R.setDesk({ agent: 'lead', by: 'lead' }), /use --clear/);
  await assert.rejects(R.setDesk({ agent: 'bad name', by: 'lead' }), /agent name/);
  await R.setTopicOwner('hero-exit', { owner: 'arch-hero', by: 'lead' });
  await R.setTopicOwner('cd-strip', { owner: 'fix-cd-strip', by: 'lead' });
  assert.deepEqual(Object.keys(R.getTopics()).sort(), ['cd-strip', 'hero-exit']);
  assert.equal(R.getTopics()['hero-exit'].owner, 'arch-hero');
  await R.setTopicOwner('cd-strip', { owner: null, by: 'lead' });
  assert.deepEqual(Object.keys(R.getTopics()), ['hero-exit']);
  await assert.rejects(R.setTopicOwner('Bad Tag', { owner: 'x', by: 'lead' }), /bad topic/);
  await assert.rejects(R.setTopicOwner('t', { owner: 'lead', by: 'lead' }), /other than the lead/);
});

test('routeContext reads the stores and never throws', async () => {
  const c = await R.routeContext();
  assert.deepEqual(c.statusRows, []);
  assert.deepEqual(c.steps, []);
  assert.deepEqual(c.proposals, []);
  assert.deepEqual(c.topics, {});
  assert.equal(c.desk, null);
});

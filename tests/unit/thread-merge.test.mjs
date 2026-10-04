// tools/lib/console-threads.mjs thread merge / relate / unmerge and the SIMILAR check (user T-024 #13, 2026-10-04: "add
// the related threads and you may close the duplicated thread and put the related into closed thread. we will catch up
// the one topic as single thread"). In-process, each test on its own $FW_STATE_DIR. Checks: a merge closes the duplicate
// with a pointer and links both threads (stored in both files), refuses a self-merge, an unknown id and a cycle, resolves
// a chain to the final kept thread and never stores one; relate links two threads both ways; unmerge undoes a merge; a
// user message written in a merged thread lands in the kept thread (via: the duplicate), so the kept thread's owner's
// wait and the router (T-050) see it as a message on the kept thread; `thread new` with a topic or a title close to an
// open thread's finds it (SIMILAR) unless forced; old threads without the new fields read as before.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { tempDir } from '../helpers.mjs';

const T = await import('../../tools/lib/console-threads.mjs');
let state;
beforeEach(() => { state = tempDir('fw-thread-merge-'); process.env.FW_STATE_DIR = state; });

const user = (title, text = 'question') => T.createThread({ title, text, fromPage: true }).then((r) => r.thread);
const raw = (id) => JSON.parse(readFileSync(join(state, 'console', 'threads', `${id}.json`), 'utf8'));

test('merge: closes the duplicate with a pointer, links both threads (stored in both files), history on both', async () => {
  const keep = await user('Countdown clock re-renders');
  const dup = await user('Countdown swipe test');
  const r = await T.mergeThread(dup.id, { into: keep.id, by: 'lead', note: 'one thread per topic' });
  assert.equal(r.into, keep.id);
  const d = raw(dup.id), k = raw(keep.id);
  assert.equal(d.status, 'closed');
  assert.equal(d.merged.into, keep.id);
  assert.equal(d.merged.by, 'lead');
  assert.equal(d.merged.closed, true, 'remembers that the merge closed it (unmerge reopens)');
  assert.deepEqual(d.related.map((x) => [x.id, x.kind]), [[keep.id, 'merged-into']]);
  assert.deepEqual(k.related.map((x) => [x.id, x.kind]), [[dup.id, 'merged']]);
  assert.equal(k.status, 'open', 'the kept thread stays as it was');
  assert.match(d.history.at(-1).note, new RegExp(`^into ${keep.id}: one thread per topic$`));
  assert.equal(d.history.at(-1).action, 'merge');
  assert.equal(k.history.at(-1).action, 'merge');
  assert.match(k.history.at(-1).note, new RegExp(`^${dup.id} merged here`));
  // the views
  const s = T.summary(T.getThread(dup.id));
  assert.equal(s.mergedInto, keep.id);
  assert.deepEqual(T.summary(T.getThread(keep.id)).related, [{ id: dup.id, kind: 'merged' }]);
  const pk = T.pageThread(T.getThread(keep.id), null, { lan: () => null });
  assert.deepEqual(pk.related, [{ id: dup.id, kind: 'merged', title: 'Countdown swipe test', state: 'closed' }]);
  const pd = T.pageThread(T.getThread(dup.id), null, { lan: () => null });
  assert.deepEqual(pd.into, { id: keep.id, title: 'Countdown clock re-renders', state: 'open' });
  // a closed duplicate merges too (it stays closed; unmerge leaves it closed)
  const old = await user('Old one');
  await T.setStatus(old.id, { status: 'closed', by: 'lead' });
  await T.mergeThread(old.id, { into: keep.id, by: 'lead' });
  assert.equal(raw(old.id).merged.closed, false);
});

test('merge refuses: a self-merge, an unknown id, a thread already merged, a cycle; who may merge', async () => {
  const a = await user('A'), b = await user('B'), c = await user('C');
  await assert.rejects(T.mergeThread(a.id, { into: a.id, by: 'lead' }), /into itself/);
  await assert.rejects(T.mergeThread(a.id, { into: 'T-099', by: 'lead' }), /no thread T-099/);
  await assert.rejects(T.mergeThread('T-098', { into: a.id, by: 'lead' }), /no thread T-098/);
  await assert.rejects(T.mergeThread(a.id, { by: 'lead' }), /--into/);
  await assert.rejects(T.mergeThread(a.id, { into: b.id, by: 'fix-x' }), /fix-x may not merge/);
  await T.assign(a.id, { by: 'lead', to: 'fix-x' });
  await T.assign(b.id, { by: 'lead', to: 'fix-x' });
  await T.mergeThread(a.id, { into: b.id, by: 'fix-x' }); // an agent that follows both threads may
  await assert.rejects(T.mergeThread(a.id, { into: c.id, by: 'lead' }), new RegExp(`${a.id} is already merged into ${b.id}: thread unmerge ${a.id}`));
  await assert.rejects(T.mergeThread(a.id, { into: b.id, by: 'lead' }), /already merged/);
  // a cycle: B into A resolves A to its final kept thread, B itself
  await assert.rejects(T.mergeThread(b.id, { into: a.id, by: 'lead' }), /cycle/);
  assert.equal(raw(b.id).status, 'open', 'nothing written on a refusal');
  assert.equal(raw(b.id).merged, undefined);
});

test('merge never stores a chain: --into a merged thread resolves to the final kept one; a kept thread merged on takes its duplicates along', async () => {
  const keep = await user('Best build'), mid = await user('Best build catch-up'), d1 = await user('Plan A/B'), d2 = await user('Any fixes?');
  await T.mergeThread(d1.id, { into: mid.id, by: 'lead' });
  // into a merged thread: resolved
  const rm = await T.mergeThread(mid.id, { into: keep.id, by: 'lead' });
  assert.deepEqual(rm.moved, [d1.id], 'the duplicates of a thread merged on move to the new kept thread');
  const r = await T.mergeThread(d2.id, { into: mid.id, by: 'lead' });
  assert.equal(r.into, keep.id);
  assert.equal(r.resolved, mid.id, 'names the thread it resolved');
  // d1 was merged into mid, then mid into keep: d1 now points at keep (moved), mid has no duplicates left
  assert.deepEqual(r.moved ?? [], [], 'nothing moved on this merge');
  assert.equal(raw(d1.id).merged.into, keep.id);
  assert.deepEqual(raw(d1.id).related.map((x) => [x.id, x.kind]), [[keep.id, 'merged-into']]);
  assert.deepEqual(raw(mid.id).related.map((x) => [x.id, x.kind]), [[keep.id, 'merged-into']]);
  assert.deepEqual(raw(keep.id).related.map((x) => [x.id, x.kind]).sort(), [[d1.id, 'merged'], [d2.id, 'merged'], [mid.id, 'merged']].sort());
  for (const t of T.listThreads()) if (t.merged) assert.equal(T.getThread(t.merged.into).merged, undefined, `${t.id} points at a kept thread, never at a merged one`);
});

test('relate: both threads list each other as related; refuses itself, unknown, twice; --remove; merged links are left to unmerge', async () => {
  const a = await user('Countdown'), b = await user('Countdown roll on the GPU');
  await assert.rejects(T.relateThreads(a.id, a.id, { by: 'lead' }), /itself/);
  await assert.rejects(T.relateThreads(a.id, 'T-077', { by: 'lead' }), /no thread T-077/);
  await assert.rejects(T.relateThreads(a.id, b.id, { by: 'fix-x' }), /fix-x may not relate/);
  await T.relateThreads(a.id, b.id, { by: 'lead' });
  assert.deepEqual(raw(a.id).related.map((x) => [x.id, x.kind]), [[b.id, 'related']]);
  assert.deepEqual(raw(b.id).related.map((x) => [x.id, x.kind]), [[a.id, 'related']]);
  assert.equal(raw(b.id).status, 'open', 'related threads stay open');
  await assert.rejects(T.relateThreads(b.id, a.id, { by: 'lead' }), /already/);
  await T.relateThreads(a.id, b.id, { by: 'lead', remove: true });
  assert.deepEqual(raw(a.id).related, []);
  assert.deepEqual(raw(b.id).related, []);
  await assert.rejects(T.relateThreads(a.id, b.id, { by: 'lead', remove: true }), /not related/);
  const c = await user('C');
  await T.mergeThread(c.id, { into: a.id, by: 'lead' });
  await assert.rejects(T.relateThreads(a.id, c.id, { by: 'lead', remove: true }), /merged.*unmerge/);
});

test('unmerge: undoes the links on both threads and reopens what the merge closed; refused on a thread that is not merged', async () => {
  const keep = await user('Keep'), dup = await user('Dup');
  await T.relateThreads(keep.id, dup.id, { by: 'lead' });
  await assert.rejects(T.unmergeThread(dup.id, { by: 'lead' }), /is not merged/);
  await T.relateThreads(keep.id, dup.id, { by: 'lead', remove: true });
  await T.mergeThread(dup.id, { into: keep.id, by: 'lead' });
  const r = await T.unmergeThread(dup.id, { by: 'lead' });
  assert.equal(r.from, keep.id);
  assert.equal(r.reopened, true);
  const d = raw(dup.id), k = raw(keep.id);
  assert.equal(d.status, 'open');
  assert.equal(d.merged, undefined);
  assert.deepEqual(d.related, []);
  assert.deepEqual(k.related, []);
  assert.equal(d.history.at(-1).action, 'unmerge');
  assert.equal(k.history.at(-1).action, 'unmerge');
  await assert.rejects(T.unmergeThread(dup.id, { by: 'fix-x' }), /may not unmerge|is not merged/);
});

test('a merged thread: reopen and agent replies refused with the pointer; a thread wait on it ends NEVER naming the kept thread', async () => {
  const keep = await user('Keep'), dup = await user('Dup');
  await T.mergeThread(dup.id, { into: keep.id, by: 'lead' });
  await assert.rejects(T.setStatus(dup.id, { status: 'open', by: 'lead' }), new RegExp(`merged into ${keep.id}`));
  await assert.rejects(T.setStatus(dup.id, { status: 'open', fromPage: true }), new RegExp(`merged into ${keep.id}`));
  await assert.rejects(T.replyAgent(dup.id, { by: 'lead', text: 'hi' }), new RegExp(`merged into ${keep.id}: reply there`));
  const w = T.threadWaitCondition({ as: 'lead', thread: dup.id });
  const c = w.check();
  assert.equal(c.met, false);
  assert.match(c.never, new RegExp(`merged into ${keep.id}`));
});

test('routing: a user message written in a merged thread lands in the kept thread (via), wakes the kept owner\'s wait, and the router treats it as the kept thread\'s', async () => {
  const keep = await user('Best build');
  await T.assign(keep.id, { by: 'lead', to: 'mgmt-ops-10' });
  await T.replyAgent(keep.id, { by: 'mgmt-ops-10', text: 'Here.' });
  const dup = await user('Best build again');
  await T.assign(dup.id, { by: 'lead', to: 'fix-old' });
  await T.mergeThread(dup.id, { into: keep.id, by: 'lead' });
  const before = raw(dup.id).messages.length;
  const r = await T.replyUser(dup.id, { text: 'Any news on the best build?' });
  assert.equal(r.thread.id, keep.id, 'the result is the kept thread (the page shows it)');
  assert.equal(r.via, dup.id);
  const k = raw(keep.id);
  const m = k.messages.at(-1);
  assert.equal(m.by, 'user');
  assert.equal(m.text, 'Any news on the best build?', 'stored as typed');
  assert.equal(m.via, dup.id);
  assert.equal(raw(dup.id).messages.length, before, 'nothing added to the merged thread');
  assert.equal(raw(dup.id).status, 'closed', 'the merged thread stays closed');
  // the kept thread's owner wakes on it; the duplicate's old assignee does not
  const owner = T.threadWaitCondition({ as: 'mgmt-ops-10' }).check();
  assert.equal(owner.met, true);
  const news = JSON.parse(owner.detail);
  assert.deepEqual(news.map((t) => t.id), [keep.id]);
  assert.equal(news[0].messages[0].via, dup.id);
  assert.match(T.newsText(news[0], 'mgmt-ops-10'), new RegExp(`\\(written in ${dup.id}, merged here\\)`));
  const old = T.threadWaitCondition({ as: 'fix-old' }).check();
  assert.ok(!old.met || !JSON.parse(old.detail).some((t) => t.id === keep.id), 'the duplicate\'s old assignee is not woken by the kept thread');
  // the page view of the kept thread names where it was written
  const pv = T.pageThread(T.getThread(keep.id), null, { lan: () => null });
  assert.equal(pv.messages.at(-1).via, dup.id);
  // a closed kept thread opens again, as for any user message
  await T.setStatus(keep.id, { status: 'closed', by: 'lead' });
  const r2 = await T.replyUser(dup.id, { text: 'again' });
  assert.equal(r2.thread.status, 'open');
  // a kept thread that is gone: the message stays in the thread the user wrote in
  const lone = await user('Lone'), gone = await user('Gone');
  await T.mergeThread(lone.id, { into: gone.id, by: 'lead' });
  writeFileSync(join(state, 'console', 'threads', `${gone.id}.json`), 'not json');
  const r3 = await T.replyUser(lone.id, { text: 'still here?' });
  assert.equal(r3.thread.id, lone.id);
});

test('similarThread: an open thread with the same topic or a close title; closed and merged ones never; nothing clever', async () => {
  const a = (await T.createThread({ by: 'lead', title: 'Countdown clock re-renders all digits', text: 'x', topic: 'cd-strip' })).thread;
  const threads = () => T.listThreads();
  assert.equal(T.similarThread({ title: 'Something else entirely', topic: 'cd-strip' }, threads()).thread.id, a.id);
  assert.match(T.similarThread({ title: 'x', topic: 'cd-strip' }, threads()).why, /same topic cd-strip/);
  assert.equal(T.similarThread({ title: 'Countdown clock re-renders all the digits' }, threads()).thread.id, a.id);
  assert.match(T.similarThread({ title: 'countdown CLOCK re-renders digits!' }, threads()).why, /similar title/);
  assert.equal(T.similarThread({ title: 'Hero exit lag on the phone' }, threads()), null);
  await T.setStatus(a.id, { status: 'closed', by: 'lead' });
  assert.equal(T.similarThread({ title: 'Countdown clock re-renders all digits', topic: 'cd-strip' }, threads()), null, 'closed threads are not candidates');
});

test('createThread checkSimilar: returns {similar, why} and stores nothing; --force (no check) starts it; other callers never checked', async () => {
  const a = (await T.createThread({ by: 'lead', title: 'Best build and what lands next', text: 'x' })).thread;
  const r = await T.createThread({ by: 'lead', title: 'What lands next in the best build', text: 'y', checkSimilar: true });
  assert.equal(r.similar.id, a.id);
  assert.match(r.why, /similar title/);
  assert.equal(r.thread, undefined);
  assert.equal(T.listThreads().length, 1, 'nothing stored');
  const f = await T.createThread({ by: 'lead', title: 'What lands next in the best build', text: 'y', checkSimilar: false });
  assert.equal(f.thread.id, 'T-002');
  // the page's threads and the alarms (no checkSimilar) are never refused
  const u = await T.createThread({ title: 'Best build and what lands next', text: 'z', fromPage: true });
  assert.equal(u.thread.id, 'T-003');
});

test('old threads (no related, no merged) read and show as before: no new keys in the views', async () => {
  const t = await user('Old');
  const s = T.summary(T.getThread(t.id));
  assert.equal('related' in s, false);
  assert.equal('mergedInto' in s, false);
  const p = T.pageThread(T.getThread(t.id), null, { lan: () => null });
  assert.equal('related' in p, false);
  assert.equal('into' in p, false);
  assert.equal('via' in p.messages[0], false);
  assert.doesNotMatch(T.threadLine(T.getThread(t.id)), /merged|related/);
});

test('feedView: a merged thread with an unread reply adds nothing to the badge (its topic is read in the kept thread)', async () => {
  const keep = await user('Keep'), dup = await user('Dup');
  await T.replyAgent(dup.id, { by: 'lead', text: 'an answer', ask: true });
  assert.equal(T.feedView().badge, 1);
  await T.mergeThread(dup.id, { into: keep.id, by: 'lead' });
  const f = T.feedView();
  assert.equal(f.badge, 0);
  assert.equal(f.unread, 0);
  assert.ok(f.threads.some((r) => r.id === dup.id), 'the row stays in the feed');
});

test('threadLine: a merged thread names where it went; a kept thread lists what was merged and related', async () => {
  const keep = await user('Keep'), dup = await user('Dup'), rel = await user('Rel');
  await T.mergeThread(dup.id, { into: keep.id, by: 'lead' });
  await T.relateThreads(keep.id, rel.id, { by: 'lead' });
  assert.match(T.threadLine(T.getThread(dup.id)), new RegExp(`merged into ${keep.id}: Dup$`));
  assert.match(T.threadLine(T.getThread(keep.id)), new RegExp(`merged here: ${dup.id}; related: ${rel.id}: Keep$`));
  assert.deepEqual(T.relatedLines(T.getThread(keep.id)), [
    `merged here: ${dup.id} [closed] Dup`,
    `related: ${rel.id} [open] Rel`,
  ]);
  assert.deepEqual(T.relatedLines(T.getThread(dup.id)), [`merged into: ${keep.id} [open] Keep`]);
});

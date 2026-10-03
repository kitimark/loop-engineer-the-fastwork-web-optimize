// T-050 / T-051 in console-threads.mjs (research/architecture/thread-routing.md §4-§5, "Decisions"): the router on a
// user message (no listening assignee -> the first listening owner, history "router"), the lead's
// `thread wait --as lead --triage` (nobody listening, "for the lead", an escalation, 10 min unanswered; a fake clock),
// escalate, the desk (counts only while listening; may assign only to a listening owner) and the refusals.
// Listening is a live `console.mjs thread wait` in the waits registry (this process's pid) or a read/reply within
// 5 min. Own $FW_STATE_DIR; fake names and addresses only (192.168.77.12, .invalid hosts).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { tempDir } from '../helpers.mjs';

const T = await import('../../tools/lib/console-threads.mjs');
const R = await import('../../tools/lib/thread-routing.mjs');
const W = await import('../../tools/lib/waits.mjs');
let live = [];
beforeEach(() => { for (const w of live) w.end(); live = []; process.env.FW_STATE_DIR = tempDir('fw-triage-'); });

/** `agent` has a live thread wait (counts as listening). */
const listen = (agent) => live.push(W.startWait({ tool: R.WAIT_TOOL, owner: agent, what: 'a user reply', timeoutSec: 3600, onExit: false }));
const userThread = (o = {}) => T.createThread({ title: 'Hero question', text: 'why?', fromPage: true, ...o }).then((r) => r.thread);
const file = (id) => join(T.threadsDir(), `${id}.json`);
/** Move a stored message's time back (the store writes real times). */
function age(id, n, min) {
  const t = JSON.parse(readFileSync(file(id), 'utf8'));
  t.messages.find((m) => m.n === n).at = new Date(Date.now() - min * 60000).toISOString();
  writeFileSync(file(id), JSON.stringify(t));
}
const triage = (offsetMin = 0) => T.threadWaitCondition({ as: 'lead', triage: true, now: () => Date.now() + offsetMin * 60000 });
const news = (c) => { const r = c.check(); return r.met ? JSON.parse(r.detail) : []; };

test('triage, fake clock: a listening owner has 10 min; an answer in time keeps the lead asleep; the mark stays before a running timer', async () => {
  listen('fix-h');
  const t = await userThread({ topic: 'hero-exit' });
  await T.assign(t.id, { by: 'lead', to: 'fix-h' });
  assert.deepEqual(news(triage(0)), [], 'the owner listens: the lead sleeps');
  assert.deepEqual(news(triage(9)), [], '9 min: still the owner\'s');
  const at10 = news(triage(10));
  assert.deepEqual(at10.map((x) => [x.id, x.why]), [[t.id, ['#1 unanswered 10 min (owner: fix-h)']]]);
  assert.match(T.newsText(at10[0], 'lead'), /^TRIAGE T-001 "Hero question" \[hero-exit\]: #1 unanswered 10 min \(owner: fix-h\)\nNEW T-001/);
  // an answer before the 10 min: nothing for the lead, ever
  const u = await userThread();
  await T.assign(u.id, { by: 'lead', to: 'fix-h' });
  await T.replyAgent(u.id, { by: 'fix-h', text: 'because of the blur' });
  assert.deepEqual(news(triage(30)).map((x) => x.id), [t.id]);
  // two messages: #2 is 11 min old (due), #3 is new (its timer runs): the lead's mark moves to 2, not 3
  await T.replyUser(t.id, { text: 'second' });
  age(t.id, 1, 11); age(t.id, 2, 11);
  await T.replyUser(t.id, { text: 'third' });
  const due = news(triage(0)).find((x) => x.id === t.id);
  assert.deepEqual(due.messages.map((m) => m.n), [1, 2]);
  assert.equal(due.markTo, 2);
  await T.commitWait('lead', [due]);
  assert.deepEqual(news(triage(0)), [], 'printed once; #3 still runs');
  assert.deepEqual(news(triage(10)).map((x) => x.messages.map((m) => m.n)), [[3]], '#3 after its 10 min');
});

test('router: a user message whose assignee is not listening goes to the lead\'s topic owner (history "router"); nobody listening wakes the lead at once', async () => {
  const t = await userThread({ topic: 'hero-exit' });
  await T.assign(t.id, { by: 'lead', to: 'fix-old' }); // finished agent: no wait, no recent read
  assert.deepEqual(news(triage(0)).map((x) => x.why), [['#1 nobody listening (assigned: fix-old)']]);
  await T.commitWait('lead', news(triage(0)));
  await R.setTopicOwner('hero-exit', { owner: 'fix-new', by: 'lead' });
  listen('fix-new');
  const r = await T.replyUser(t.id, { text: 'still there?' });
  assert.deepEqual(r.thread.assignees, ['fix-old', 'fix-new'], 'former assignees stay');
  assert.deepEqual(r.thread.history.at(-1), { at: r.thread.history.at(-1).at, who: 'router', action: 'assign', note: 'fix-new (topic hero-exit, set by the lead)' });
  assert.deepEqual(news(triage(0)), [], 'a listening owner has it');
  // the owner's own wait wakes on it (the backlog of an assignment)
  assert.equal(T.threadWaitCondition({ as: 'fix-new' }).check().met, true);
  // a listening assignee: the router leaves the thread alone
  const again = await T.replyUser(t.id, { text: 'one more' });
  assert.equal(again.thread.history.filter((h) => h.who === 'router').length, 1);
  // a new comment from the page routes too (createThread, fromPage)
  const c = await userThread({ topic: 'hero-exit' });
  assert.deepEqual(c.assignees, ['fix-new']);
  // the lead's thread is never routed (it is not a user message)
  const l = (await T.createThread({ by: 'lead', title: 'FYI', text: 'note', topic: 'hero-exit' })).thread;
  assert.deepEqual(l.assignees, []);
});

test('"For the lead" and escalate: each wakes the triage wait once; the tick is the user\'s only', async () => {
  listen('fix-h');
  const t = await userThread();
  await T.assign(t.id, { by: 'lead', to: 'fix-h' });
  await T.replyUser(t.id, { text: 'stop the phone run please', forLead: true });
  const a = news(triage(0));
  assert.deepEqual(a.map((x) => x.why), [['#2 for the lead']]);
  assert.match(T.newsText(a[0], 'lead'), /#2 by user \(for the lead\) at /);
  await T.commitWait('lead', a);
  assert.deepEqual(news(triage(0)), [], 'once');
  assert.equal(T.getThread(t.id).messages[1].forLead, true);
  // an answered "for the lead" message still went to the lead (it is the lead's)
  await T.replyUser(t.id, { text: 'and decide B', forLead: true });
  await T.replyAgent(t.id, { by: 'fix-h', text: 'noted, the lead decides' });
  assert.deepEqual(news(triage(0)).map((x) => x.why), [['#3 for the lead']]);
  await T.commitWait('lead', news(triage(0)));
  // escalation: once per escalation, against the lead's escalation mark (a history index, not a time: no delay here,
  // an escalation in the same millisecond as the lead's read still counts)
  await T.escalate(t.id, { by: 'fix-h', note: 'needs a priority call' });
  const e = news(triage(0));
  assert.deepEqual(e.map((x) => [x.why, x.messages.length]), [[['escalated by fix-h: needs a priority call'], 0]]);
  // one made between the check and the commit is not swallowed by the commit
  await T.escalate(t.id, { by: 'fix-h', note: 'second question' });
  await T.commitWait('lead', e);
  assert.deepEqual(news(triage(0)).map((x) => x.why), [['escalated by fix-h: second question']]);
  await T.commitWait('lead', news(triage(0)));
  assert.deepEqual(news(triage(0)), []);
  // the lead reading the thread (thread show --as lead) or writing in it has seen the escalations
  await T.escalate(t.id, { by: 'fix-h', note: 'third' });
  await T.markRead(t.id, 'lead');
  assert.deepEqual(news(triage(0)), []);
  await T.escalate(t.id, { by: 'fix-h', note: 'fourth' });
  await T.replyAgent(t.id, { by: 'lead', text: 'on it' });
  assert.deepEqual(news(triage(0)), []);
  await T.escalate(t.id, { by: 'fix-h', note: 'fifth' });
  assert.deepEqual(news(triage(0)).map((x) => x.why), [['escalated by fix-h: fifth']]);
  // the tick is for the user's messages: an agent or the lead can't set it
  const l = (await T.createThread({ by: 'lead', title: 'x', text: 'y', forLead: true })).thread;
  assert.equal(l.messages[0].forLead, undefined);
});

test('refusals: triage is the lead\'s, without --thread; escalate by the lead or a stranger; assign by a non-desk agent; the desk never removes', async () => {
  const t = await userThread();
  await T.assign(t.id, { by: 'lead', to: 'fix-h' });
  assert.throws(() => T.threadWaitCondition({ as: 'fix-h', triage: true }), /--triage is the lead's wait/);
  assert.throws(() => T.threadWaitCondition({ as: 'lead', triage: true, thread: t.id }), /leave out --thread/);
  await assert.rejects(T.escalate(t.id, { by: 'lead', note: 'x' }), /the lead decides/);
  await assert.rejects(T.escalate(t.id, { by: 'fix-other', note: 'x' }), /not assigned to T-001 and is not the desk/);
  await assert.rejects(T.escalate(t.id, { by: 'fix-h', note: '' }), /note/);
  await assert.rejects(T.assign(t.id, { by: 'fix-h', to: 'fix-x' }), /only the lead assigns threads/);
  await R.setDesk({ agent: 'desk-a', by: 'lead' });
  await assert.rejects(T.assign(t.id, { by: 'desk-a', to: 'fix-h', remove: true }), /only the lead removes/);
  await assert.rejects(T.assign(t.id, { by: 'fix-h', to: 'fix-x' }), /only the lead or the desk \(desk-a\) assigns/);
  // the desk escalates any thread
  await T.escalate(t.id, { by: 'desk-a', note: 'for the lead' });
  assert.equal(T.getThread(t.id).history.at(-1).who, 'desk-a');
});

test('scrub: an escalation note is stored without LAN addresses or e-mails; history names only', async () => {
  const t = await userThread();
  await T.assign(t.id, { by: 'lead', to: 'fix-h' });
  const r = await T.escalate(t.id, { by: 'fix-h', note: 'phone at 192.168.77.12 says ask someone@example.invalid' });
  const h = T.getThread(t.id).history.at(-1);
  assert.doesNotMatch(h.note, /192\.168\.77\.12|someone@example\.invalid/);
  assert.ok(r.scrubbed.length >= 2, `scrubbed: ${r.scrubbed}`);
});

test('the desk counts only while listening: not listening -> nobody routed, triage wakes at once; listening -> routed to the desk, triage sleeps', async () => {
  await R.setDesk({ agent: 'desk-a', by: 'lead' });
  const t = await userThread();
  assert.deepEqual(t.assignees, [], 'a desk that is not listening gets nothing');
  assert.deepEqual(news(triage(0)).map((x) => x.why), [['#1 nobody listening']]);
  listen('desk-a');
  const u = await userThread();
  assert.deepEqual(u.assignees, ['desk-a']);
  assert.equal(u.history.at(-1).note, 'desk-a (the desk)');
  assert.deepEqual(news(triage(0)).map((x) => x.id), [t.id], 'only the unrouted one');
  // summary.toState: the page's recipients line
  const s = T.summary(T.getThread(u.id), T.USER, R.listeningState({ threads: T.listThreads() }));
  assert.deepEqual(s.toState.map((x) => [x.name, x.listening]), [['lead', true], ['desk-a', true]]);
  assert.equal(s.backstopMin, 10);
  assert.match(T.threadLine(T.getThread(t.id), null, R.listeningState({ threads: T.listThreads() })), /: Hero question$/);
});

test('the desk assigns only to a listening owner (else escalate); the lead assigns anyone', async () => {
  await R.setDesk({ agent: 'desk-a', by: 'lead' });
  const t = await userThread();
  await assert.rejects(T.assign(t.id, { by: 'desk-a', to: 'fix-away' }), /fix-away is not listening .* escalate to the lead instead/);
  listen('fix-here');
  const r = await T.assign(t.id, { by: 'desk-a', to: 'fix-here' });
  assert.deepEqual(r.thread.assignees, ['fix-here']);
  assert.match(T.threadLine(r.thread, null, R.listeningState({ threads: T.listThreads() })), /-> fix-here \(listening\)/);
  await T.assign(t.id, { by: 'lead', to: 'fix-away' });
  assert.match(T.threadLine(T.getThread(t.id), null, R.listeningState({ threads: T.listThreads() })), /-> fix-here \(listening\),fix-away \(not listening\)/);
});

// tools/lib/console-threads.mjs in-process (ts-console-threads): the thread store, who may write (lead decision
// 2026-10-02: the lead starts threads and may always reply; other agents only in threads assigned to them), the
// derived states, unread per reader (each reader's mark is its own), the agent-text scrub (Hard rule 12: no LAN
// address, e-mail, device id or home path from an agent reaches the page; localhost links survive), the wait
// condition behind `console.mjs thread wait`, and the new-reply rule shared with the page (console-nav.js).
// Every test uses its own $FW_STATE_DIR. Fake addresses only (192.168.77.12, .invalid hosts, /Users/someone).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { tempDir, TOOLS } from '../helpers.mjs';

const T = await import('../../tools/lib/console-threads.mjs');
let state;
beforeEach(() => { state = tempDir('fw-threads-'); process.env.FW_STATE_DIR = state; });

const userThread = (title = 'Why is the hero janky?', text = 'On the phone the hero stutters.\nSee 192.168.77.12 please') =>
  T.createThread({ title, text, fromPage: true }).then((r) => r.thread);

test('store: threads/T-001.json in the console dir, ids T-001…, parseThreadId short forms, the user text kept as typed', async () => {
  const a = await userThread();
  const b = await userThread('Second', 'two');
  assert.deepEqual([a.id, b.id], ['T-001', 'T-002']);
  assert.equal(T.threadsDir(), join(state, 'console', 'threads'));
  assert.ok(existsSync(join(state, 'console', 'threads', 'T-001.json')));
  const raw = JSON.parse(readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8'));
  assert.equal(raw.messages[0].text, 'On the phone the hero stutters.\nSee 192.168.77.12 please', 'the user text stays as typed (local store)');
  assert.equal(raw.messages[0].by, 'user');
  assert.equal(raw.reads.user, 1);
  for (const s of ['2', 't-2', 'T-002', 'T002']) assert.equal(T.parseThreadId(s), 'T-002');
  assert.throws(() => T.parseThreadId('../T-1'), /bad thread id/);
  assert.throws(() => T.getThread('T-9'), /no thread T-009/);
  assert.deepEqual(T.listThreads().map((t) => t.id), ['T-001', 'T-002']);
});

test('validation: empty and too long text, bad topic, CR/LF and control characters', async () => {
  await assert.rejects(T.createThread({ title: ' ', text: 'x', fromPage: true }), /title is empty/);
  await assert.rejects(T.createThread({ title: 'x', text: '', fromPage: true }), /first message is empty/);
  await assert.rejects(T.createThread({ title: 'x'.repeat(161), text: 'y', fromPage: true }), /title is too long/);
  await assert.rejects(T.createThread({ title: 'x', text: 'y'.repeat(8001), fromPage: true }), /too long/);
  await assert.rejects(T.createThread({ title: 'x', text: 'y', topic: '../etc', fromPage: true }), /--topic must be/);
  const t = (await T.createThread({ title: 'a\n  b', text: 'l1\r\nl2\u0007', topic: 'Hero-Exit', fromPage: true })).thread;
  assert.equal(t.title, 'a b');
  assert.equal(t.messages[0].text, 'l1\nl2');
  assert.equal(t.topic, 'hero-exit');
});

test('who writes: the lead starts and always replies; others only when assigned ("ask the lead to assign you"); never --by user', async () => {
  await assert.rejects(T.createThread({ by: 'fix-hero', title: 't', text: 'x' }), /only the lead starts threads/);
  await assert.rejects(T.createThread({ by: 'user', title: 't', text: 'x' }), /"user" writes only from the console page/);
  await assert.rejects(T.createThread({ by: 'bad name!', title: 't', text: 'x' }), /bad agent name/);
  const t = await userThread();
  await assert.rejects(T.replyAgent(t.id, { by: 'fix-hero', text: 'hi' }), /fix-hero is not assigned to T-001: ask the lead to assign you/);
  await assert.rejects(T.replyAgent(t.id, { by: 'User', text: 'hi' }), /"user" writes only/);
  await assert.rejects(T.assign(t.id, { by: 'fix-hero', to: 'fix-hero' }), /only the lead assigns/);
  const r = await T.replyAgent(t.id, { by: 'lead', text: 'Looking.' });
  assert.equal(r.n, 2);
  await T.assign(t.id, { by: 'lead', to: 'fix-hero, fix-other' });
  assert.deepEqual(T.getThread(t.id).assignees, ['fix-hero', 'fix-other']);
  assert.equal((await T.replyAgent(t.id, { by: 'fix-hero', text: 'Mine now.' })).n, 3);
  await T.assign(t.id, { by: 'lead', to: 'fix-hero', remove: true });
  await assert.rejects(T.replyAgent(t.id, { by: 'fix-hero', text: 'again' }), /not assigned .*assigned: fix-other/);
  await assert.rejects(T.setStatus(t.id, { status: 'closed', by: 'fix-hero' }), /ask the lead to assign you/);
  const h = T.getThread(t.id).history.map((x) => `${x.who} ${x.action} ${x.note || ''}`.trim());
  assert.deepEqual(h, ['lead assign fix-hero,fix-other', 'lead unassign fix-hero']);
  const n = await T.createThread({ by: 'lead', title: 'Hero results', text: 'Ask me here.', to: 'fix-hero', topic: 'hero-exit' });
  assert.deepEqual([n.thread.id, n.thread.createdBy, n.thread.assignees, n.thread.topic], ['T-002', 'lead', ['fix-hero'], 'hero-exit']);
});

test('states: open (user last), answered (agent last), waiting-on-you (agent asked), closed; a user message reopens', async () => {
  const t = await userThread();
  assert.equal(T.threadState(T.getThread(t.id)), 'open');
  await T.replyAgent(t.id, { by: 'lead', text: 'Answer.' });
  assert.equal(T.threadState(T.getThread(t.id)), 'answered');
  await T.replyAgent(t.id, { by: 'lead', text: 'Which page?', ask: true });
  assert.equal(T.threadState(T.getThread(t.id)), 'waiting-on-you');
  await T.replyUser(t.id, { text: 'The home page.' });
  assert.equal(T.threadState(T.getThread(t.id)), 'open');
  await T.setStatus(t.id, { status: 'closed', by: 'lead', note: 'done, see /Users/someone/x' });
  assert.equal(T.threadState(T.getThread(t.id)), 'closed');
  assert.equal(T.getThread(t.id).history.at(-1).note, 'done, see ~/x', 'agent notes are scrubbed');
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x' }), /T-001 is closed: .*thread reopen T-001/);
  await assert.rejects(T.setStatus(t.id, { status: 'closed', by: 'lead' }), /already closed/);
  await T.replyUser(t.id, { text: 'One more thing' });
  const t2 = T.getThread(t.id);
  assert.equal(t2.status, 'open');
  assert.deepEqual(t2.history.at(-1).who + ' ' + t2.history.at(-1).action, 'user reopen');
  await T.setStatus(t.id, { status: 'closed', fromPage: true });
  await T.setStatus(t.id, { status: 'open', fromPage: true });
  assert.equal(T.getThread(t.id).status, 'open');
});

test('unread: per reader and independent (the lead\'s mark never moves an assignee\'s); agents\' messages wake no agent', async () => {
  const t = await userThread();
  let x = T.getThread(t.id);
  assert.equal(T.unreadFor(x, 'user').length, 0);
  assert.equal(T.unreadFor(x, 'lead').length, 1);
  assert.equal(T.unreadFor(x, 'fix-hero').length, 0, 'not assigned: sees nothing');
  await T.assign(t.id, { by: 'lead', to: 'fix-hero' });
  x = T.getThread(t.id);
  assert.equal(T.unreadFor(x, 'fix-hero').length, 1, 'assigning wakes the assignee on the backlog');
  await T.markRead(t.id, 'lead');
  x = T.getThread(t.id);
  assert.equal(T.unreadFor(x, 'lead').length, 0);
  assert.equal(T.unreadFor(x, 'fix-hero').length, 1, 'the lead\'s read mark is its own');
  await T.replyAgent(t.id, { by: 'fix-hero', text: 'On it.' });
  x = T.getThread(t.id);
  assert.equal(T.unreadFor(x, 'fix-hero').length, 0, 'replying marks the writer read');
  assert.equal(T.unreadFor(x, 'lead').length, 0, 'an agent message does not wake the lead');
  assert.equal(T.unreadFor(x, 'user').length, 1, 'the user has a reply');
  await T.markRead(t.id, 'user', 99);
  assert.equal(T.getThread(t.id).reads.user, 2, 'capped at the last message');
  await T.markRead(t.id, 'user', 1);
  assert.equal(T.getThread(t.id).reads.user, 2, 'never backwards');
  const s = T.summary(T.getThread(t.id));
  assert.deepEqual([s.count, s.unread, s.lastBy, s.lastAgentN, s.state], [2, 0, 'fix-hero', 2, 'answered']);
  const p = T.pageThread(T.getThread(t.id));
  assert.ok(!('reads' in p) && !('history' in p), 'the page gets no agents\' read marks or history');
  assert.equal(p.readUser, 2);
});

test('scrubAgentText: LAN address, URL, e-mail, device id, home path and .local host replaced; localhost links kept', async () => {
  const s = T.scrubAgentText('Open http://192.168.77.12:5497/ or 192.168.77.12, mail someone@example.invalid, udid 00008130-001234567890ABCD, file /Users/someone/x.json, host my-mac.local, page http://localhost:5559/progress#hero and http://127.0.0.1:5559/threads');
  assert.equal(s.text, 'Open <link> or <ip address>, mail <e-mail>, udid <device id>, file ~/x.json, host <local host name>, page http://localhost:5559/progress#hero and http://127.0.0.1:5559/threads');
  assert.deepEqual(s.scrubbed.sort(), ['device id', 'e-mail', 'home path', 'ip address', 'local host name', 'url']);
  assert.deepEqual(T.scrubAgentText('All fine.\nLine two').scrubbed, []);
  assert.equal(T.scrubAgentText('http://localhost:5559/Users/someone/x').text, '<link>', 'a localhost link with personal data in its path is scrubbed');
  assert.match(T.scrubAgentText('Team 7ABCDE1234 here').text, /<team>/, 'redact.mjs runs too');
  assert.deepEqual(T.scrubAgentText('Team 7ABCDE1234 here').scrubbed, ['device id']);
  assert.deepEqual(T.scrubAgentText('at http://192.168.77.12:5497/x').scrubbed, ['url'], 'an address inside a link counts once, as the link');
  // without localhost links, exactly progress.mjs sanitize (the page's other scrubber): one rule set
  const P = await import('../../tools/lib/progress.mjs');
  for (const s of ['a 192.168.77.12 b', 'x@example.invalid', 'fe80::1:2:3:4', 'host.local', '/home/someone/q', 'udid 00008130-001234567890ABCD', 'ECID: 0x1A2B3C4D5E', 'Someone’s iPhone', 'plain text 16:21:39'])
    assert.equal(T.scrubAgentText(s).text, P.sanitize(s, Infinity), s);
});

test('agent replies and titles are stored scrubbed (the page, feed and notifications never see the raw text)', async () => {
  const n = await T.createThread({ by: 'lead', title: 'Phone at 192.168.77.12', text: 'See http://192.168.77.12:5497/ and someone@example.invalid' });
  assert.deepEqual(n.scrubbed.sort(), ['e-mail', 'ip address', 'url']);
  const t = T.getThread(n.thread.id);
  assert.equal(t.title, 'Phone at <ip address>');
  assert.equal(t.messages[0].text, 'See <link> and <e-mail>');
  const r = await T.replyAgent(t.id, { by: 'lead', text: 'home /Users/someone/a' });
  assert.deepEqual(r.scrubbed, ['home path']);
  assert.equal(T.getThread(t.id).messages[1].text, 'home ~/a');
  // a user title with a LAN address: kept in the store and the page list, sanitized in the feed (badge, notifications)
  await userThread('Is 192.168.77.12 ok?', 'x');
  const f = T.feedView();
  assert.ok(!JSON.stringify(f).includes('192.168'), JSON.stringify(f));
  assert.equal(f.threads[1].title, 'Is <ip address> ok?');
  assert.deepEqual(T.threadNotificationText(f.threads[0], 'thread'), { title: 'Console: new thread', body: 'T-001: Phone at <ip address>' });
});

test('feedView: badge = threads with unread replies or a question for the user; pageOrder puts them first', async () => {
  const a = await userThread('A', 'a');
  const b = await userThread('B', 'b');
  const c = await userThread('C', 'c');
  await T.replyAgent(a.id, { by: 'lead', text: 'reply' });
  await T.replyAgent(b.id, { by: 'lead', text: 'which?', ask: true });
  await T.markRead(b.id, 'user');
  await T.setStatus(c.id, { status: 'closed', by: 'lead' });
  const f = T.feedView();
  assert.deepEqual([f.badge, f.unread, f.yourTurn], [2, 1, 1]);
  const rows = T.listThreads().map((t) => T.summary(t)).sort(T.pageOrder).map((s) => s.id);
  assert.equal(rows[2], 'T-003', 'closed last');
  assert.deepEqual(rows.slice(0, 2).sort(), ['T-001', 'T-002']);
});

test('thread wait condition: met at once on a backlog, every unread message of every thread in one wake, commit moves only this reader', async () => {
  const a = await userThread('A', 'first');
  await T.replyUser(a.id, { text: 'second' });
  const b = await userThread('B', 'other');
  await T.assign(b.id, { by: 'lead', to: 'fix-b' });
  const w = T.threadWaitCondition({ as: 'lead' });
  const r = w.check();
  assert.equal(r.met, true);
  const news = JSON.parse(r.detail);
  assert.deepEqual(news.map((t) => [t.id, t.messages.map((m) => m.text)]), [['T-001', ['first', 'second']], ['T-002', ['other']]]);
  await T.commitWait('lead', news);
  assert.equal(w.check().met, false, 'no re-fire after commit');
  const wb = T.threadWaitCondition({ as: 'fix-b' });
  assert.deepEqual(JSON.parse(wb.check().detail).map((t) => t.id), ['T-002'], 'the assignee still has its own backlog, only its thread');
  // a message that lands after the check stays unread for the next wait
  await T.replyUser(a.id, { text: 'third' });
  const again = JSON.parse(w.check().detail);
  assert.deepEqual(again[0].messages.map((m) => m.text), ['third']);
  assert.match(T.newsText(again[0], 'lead'), /^NEW T-001 "A" #3 by user at \S+:\n  third\n  reply: node tools\/console\.mjs thread reply T-001 --by lead/);
  // agents' messages never wake the lead
  await T.commitWait('lead', again);
  await T.replyAgent(a.id, { by: 'lead', text: 'ok' });
  assert.equal(w.check().met, false);
  // --thread: that thread only; closed -> never
  const wt = T.threadWaitCondition({ as: 'lead', thread: 'T-2' });
  assert.equal(wt.check().met, false, 'the lead read T-002 in the first wake');
  await T.replyUser(b.id, { text: 'ping' });
  assert.deepEqual(JSON.parse(wt.check().detail).map((t) => t.id), ['T-002']);
  await T.markRead(b.id, 'lead');
  await T.setStatus(b.id, { status: 'closed', by: 'lead' });
  assert.match(wt.check().never, /T-002 was closed/);
  assert.throws(() => T.threadWaitCondition({ as: 'lead', thread: 'T-9' }), /no thread T-009/);
  assert.throws(() => T.threadWaitCondition({}), /--as <agent> is required/);
});

// one table of cases for the new-reply rule, run against the library and the page's copy (console-nav.js)
const row = (id, lastAgentN, unread) => ({ id, title: id, lastAgentN, unread });
const CASES = [
  { name: 'first call seeds silently', state: null, threads: [row('T-001', 2, 1)], events: [] },
  { name: 'a new agent reply with unread', state: { seeded: true, seen: { 'T-001': 1 } }, threads: [row('T-001', 2, 1)], events: [['reply', 'T-001']] },
  { name: 'same reply again: nothing', state: { seeded: true, seen: { 'T-001': 2 } }, threads: [row('T-001', 2, 1)], events: [] },
  { name: 'a reply the user already read (other tab): nothing', state: { seeded: true, seen: { 'T-001': 1 } }, threads: [row('T-001', 2, 0)], events: [] },
  { name: 'a thread the lead started', state: { seeded: true, seen: {} }, threads: [row('T-002', 1, 1)], events: [['thread', 'T-002']] },
  { name: 'a thread the user started: nothing', state: { seeded: true, seen: {} }, threads: [row('T-003', 0, 0)], events: [] },
];

function navCore() {
  const src = readFileSync(join(TOOLS, 'lib', 'console-nav.js'), 'utf8');
  return new Function('window', `${src}\nreturn window.ConsoleNotify;`)({}); // as console-notify.test.mjs: no DOM, core only
}

test('diffThreads: the same table of cases for the library and console-nav.js', () => {
  const nav = navCore();
  assert.equal(typeof nav.diffThreads, 'function', 'console-nav.js exports ConsoleNotify.diffThreads');
  for (const c of CASES) {
    for (const [who, fn] of [['lib', T.diffThreads], ['nav', nav.diffThreads]]) {
      const before = JSON.stringify(c.state);
      const r = fn(c.state, c.threads);
      assert.deepEqual(r.events.map((e) => [e.kind, e.thread.id]), c.events, `${who}: ${c.name}`);
      assert.equal(r.state.seeded, true);
      assert.equal(JSON.stringify(c.state), before, `${who}: inputs not mutated`);
    }
  }
  const w = [];
  const watch = T.threadWatcher({ notify: (t, k) => w.push(`${k} ${t.id}`) });
  watch([row('T-001', 1, 1)]);
  watch([row('T-001', 2, 1), row('T-002', 1, 1)]);
  assert.deepEqual(w, ['reply T-001', 'thread T-002']);
});

test('threads-page.html: its inline script compiles, renders text only (no innerHTML / insertAdjacentHTML / document.write), loads nothing external', () => {
  const html = readFileSync(join(TOOLS, 'lib', 'threads-page.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]), 'the inline script parses');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(scripts[0]), 'no HTML sinks');
  assert.match(html, /<script src="\/console-nav\.js"><\/script>/);
  assert.match(html, /<!--console-menu-->/);
  assert.ok(!/(src|href)=["'](https?:)?\/\//.test(html), 'no external src/href');
});

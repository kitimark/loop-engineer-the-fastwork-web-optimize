// tools/lib/console-threads.mjs in-process (ts-console-threads): the thread store, who may write (lead decision
// 2026-10-02: the lead starts threads and may always reply; other agents only in threads assigned to them), the
// derived states, unread per reader (each reader's mark is its own), the agent-text scrub (Hard rule 12: no LAN
// address, e-mail, device id or home path from an agent reaches the page; localhost links survive), the wait
// condition behind `console.mjs thread wait`, and the new-reply rule shared with the page (console-nav.js).
// Every test uses its own $FW_STATE_DIR. Fake addresses only (192.168.77.12, .invalid hosts, /Users/someone).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync, writeFileSync, readdirSync, truncateSync } from 'node:fs';
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

// ---- I-084 (user T-038): the reply box and the list say who gets the user's message ---------------------------------

test('I-084 summary.to: the lead always, then the assignees; names only', async () => {
  const t = await userThread();
  assert.deepEqual(T.summary(t).to, ['lead']);
  await T.assign(t.id, { by: 'lead', to: 'fix-nav-morph,ts-i084' });
  assert.deepEqual(T.summary(T.getThread(t.id)).to, ['lead', 'fix-nav-morph', 'ts-i084']);
  assert.deepEqual(T.pageThread(T.getThread(t.id)).to, ['lead', 'fix-nav-morph', 'ts-i084'], 'the page\'s thread view too');
  assert.deepEqual(T.summary({ ...T.getThread(t.id), assignees: ['someone@example.invalid'] }).to, ['lead'], 'a hand-edited unsafe name is not shown');
});

/** threads-page.html on a tiny fake DOM (no browser): elements by id are created on first use. */
async function threadsPage({ hash, list = [], thread = null, replied = null }) {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this.listeners = {}; this._t = text ?? ''; this.hidden = false; this.className = ''; this.value = ''; this.disabled = false; this.attrs = {}; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    get lastElementChild() { return this.children.at(-1) || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
    scrollIntoView() {} focus() {} requestSubmit() { for (const f of this.listeners.submit || []) f({ preventDefault() {} }); }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  }
  const html = readFileSync(join(TOOLS, 'lib', 'threads-page.html'), 'utf8');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ids = {};
  // the static markup of the two "goes to" lines (the script rewrites the reply one per thread)
  for (const m of html.matchAll(/<p class="to" id="([a-z-]+)">([^<]*)<b>([^<]*)<\/b><\/p>/g)) { ids[m[1]] = new N('p', m[2]); ids[m[1]].appendChild(new N('b', m[3])); }
  const document = {
    getElementById: (i) => (ids[i] ||= new N('div')), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t),
    addEventListener() {}, visibilityState: 'visible',
  };
  const calls = [];
  const res = (j) => ({ ok: true, status: 200, json: async () => j });
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (init?.method === 'POST') return res({ thread: replied || thread });
    if (url === '/api/threads') return res({ now: new Date().toISOString(), threads: list });
    return res({ thread });
  };
  const location = { hash };
  // I-089: the composer reads the user's files with FileReader (data: previews); a fake that answers at once
  class FileReader { readAsDataURL(f) { this.result = `data:${f.type};base64,${Buffer.from(f.bytes).toString('base64')}`; setImmediate(() => this.onload && this.onload()); } }
  new Function('window', 'document', 'location', 'fetch', 'setInterval', 'setTimeout', 'clearTimeout', 'localStorage', 'FileReader', js)(
    { addEventListener() {} }, document, location, fetch, () => 0, () => 0, () => 0, undefined, FileReader);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return { ids, calls, $: document.getElementById };
}

test('I-084 threads page: "Your reply goes to: lead, <assignees>" by the reply box, a "to:" chip per thread, the confirmation names them', async () => {
  const t = await userThread('Nav morph lag');
  await T.assign(t.id, { by: 'lead', to: 'fix-nav-morph' });
  const view = T.pageThread(T.getThread(t.id));
  const after = T.pageThread((await T.replyUser(t.id, { text: 'Any news?' })).thread);
  const p = await threadsPage({ hash: `#${t.id}`, thread: view, replied: after });
  assert.equal(p.ids['reply-to'].textContent, 'Your reply goes to: lead, fix-nav-morph');
  assert.equal(p.ids['new-to'].textContent, 'Your question goes to: lead', 'a new thread goes to the lead');
  p.ids['reply-text'].value = 'Any news?';
  p.ids['reply-form'].requestSubmit();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.calls.filter((c) => c.url.endsWith('/reply')).map((c) => JSON.parse(c.init.body)), [{ text: 'Any news?' }]);
  assert.equal(p.ids.toast.textContent, 'Sent to lead, fix-nav-morph.');
  // the list: every row carries its recipients, the lead alone when nobody is assigned; a summary without `to` says lead
  const u = await userThread('Second question');
  const rows = [T.summary(T.getThread(t.id)), T.summary(T.getThread(u.id))];
  const legacy = { ...rows[1], id: 'T-099' }; delete legacy.to;
  const l = await threadsPage({ hash: '', list: [...rows, legacy] });
  const chips = l.ids.threads.all().filter((n) => n.className === 'chip to-chip').map((n) => n.textContent);
  assert.deepEqual(chips, ['to: lead, fix-nav-morph', 'to: lead', 'to: lead']);
  // no assignee: the reply box says lead
  const q = await threadsPage({ hash: `#${u.id}`, thread: T.pageThread(T.getThread(u.id)) });
  assert.equal(q.ids['reply-to'].textContent, 'Your reply goes to: lead');
});

test('T-050 threads page: the recipients line names who listens, else "the lead"; the "For the lead" tick goes with the message', async () => {
  const t = await userThread('Nav morph lag');
  await T.assign(t.id, { by: 'lead', to: 'fix-nav-morph' });
  const on = () => ({ listening: true, how: 'waiting' }), off = () => ({ listening: false, how: '' });
  const view = T.pageThread(T.getThread(t.id), on);
  assert.deepEqual(view.toState.map((x) => [x.name, x.listening]), [['lead', true], ['fix-nav-morph', true]]);
  const p = await threadsPage({ hash: `#${t.id}`, thread: view, replied: view });
  assert.equal(p.ids['reply-to'].textContent, 'Your reply goes to: fix-nav-morph (listening); the lead if no answer in 10 min');
  assert.match(readFileSync(join(TOOLS, 'lib', 'threads-page.html'), 'utf8'), /id="new-lead">[^<]*For the lead[\s\S]*id="reply-lead">[^<]*For the lead/);
  p.ids['reply-lead'].checked = true;
  for (const f of p.ids['reply-lead'].listeners.change) f();
  assert.equal(p.ids['reply-to'].textContent, 'Your reply goes to: fix-nav-morph (listening) and the lead');
  p.ids['reply-text'].value = 'Decide B please';
  p.ids['reply-form'].requestSubmit();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.calls.filter((c) => c.url.endsWith('/reply')).map((c) => JSON.parse(c.init.body)), [{ text: 'Decide B please', forLead: true }]);
  assert.equal(p.ids.toast.textContent, 'Sent to fix-nav-morph (listening) and the lead.');
  assert.equal(p.ids['reply-lead'].checked, false, 'the tick is per message');
  // nobody listening: the lead
  const q = await threadsPage({ hash: `#${t.id}`, thread: T.pageThread(T.getThread(t.id), off) });
  assert.equal(q.ids['reply-to'].textContent, 'Your reply goes to: the lead');
  // a new thread with the tick
  const n = await threadsPage({ hash: '', list: [], replied: view });
  n.$('new-title').value = 'Q'; n.$('new-text').value = 'x'; n.$('new-lead').checked = true;
  n.$('new-form').requestSubmit();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  assert.equal(JSON.parse(n.calls.find((c) => c.url === '/api/threads' && c.init?.method === 'POST').init.body).forLead, true);
});

// ---- I-089 (user PR-009 note): images in threads ------------------------------------------------------------------
// Fake images: a PNG header with an IHDR (pixel size), a JPEG start; non-images by content whatever their name.
const pngBytes = (w = 1170, h = 2532) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpgBytes = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
function imgFiles() {
  const d = tempDir('fw-thread-img-');
  const f = (name, bytes) => { const p = join(d, name); writeFileSync(p, bytes); return p; };
  return {
    dir: d,
    png: f('phone shot.png', pngBytes()), jpg: f('b.jpeg', jpgBytes()),
    fakePng: f('not-really.png', Buffer.from('hello, I am text\n')),
    video: f('clip.png', Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(40)])),
  };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('I-089 parseImageArgs: --image repeats, a --caption belongs to the --image before it; = forms; misuse refused', () => {
  assert.deepEqual(T.parseImageArgs(['thread', 'reply', 'T-1', '--by', 'lead', '--text', 'x']), []);
  assert.deepEqual(T.parseImageArgs(['--image', 'a.png', '--caption', 'hero at 0 s', '--text', 'x', '--image=b.jpg', '--image', 'c.png', '--caption=end, phone']),
    [{ file: 'a.png', caption: 'hero at 0 s' }, { file: 'b.jpg' }, { file: 'c.png', caption: 'end, phone' }]);
  assert.throws(() => T.parseImageArgs(['--caption', 'orphan', '--image', 'a.png']), /--caption belongs to the --image before it/);
  assert.throws(() => T.parseImageArgs(['--image', 'a.png', '--caption', 'one', '--caption', 'two']), /two --caption flags/);
  assert.throws(() => T.parseImageArgs(['--image']), /--image needs a value/);
  assert.throws(() => T.parseImageArgs(['--image', '--ask']), /--image needs a value/);
  assert.throws(() => T.parseImageArgs(['--image=']), /--image needs a path/);
});

test('I-089 store: an agent reply with images -> threads/T-001/m2-1.png, m2-2.jpg; metadata names only (no source path); captions scrubbed', async () => {
  const f = imgFiles();
  const t = await userThread();
  const r = await T.replyAgent(t.id, { by: 'lead', text: 'Here is the phone at 0 s.', images: [{ file: f.png, caption: 'hero, phone at 192.168.77.12' }, { file: f.jpg }] });
  assert.equal(r.n, 2);
  assert.equal(r.images, 2);
  assert.deepEqual(r.scrubbed, ['ip address'], 'the caption scrub is reported');
  const dir = join(state, 'console', 'threads', 'T-001');
  assert.equal(T.threadMediaDir('T-001'), dir);
  assert.deepEqual(readdirSync(dir).sort(), ['m2-1.png', 'm2-2.jpg']);
  assert.deepEqual(readFileSync(join(dir, 'm2-1.png')), pngBytes(), 'copied byte for byte (nothing stripped)');
  const raw = readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8');
  const m = JSON.parse(raw).messages[1];
  assert.deepEqual(m.images, [{ name: 'm2-1.png', caption: 'hero, phone at <ip address>', w: 1170, h: 2532, bytes: 64 }, { name: 'm2-2.jpg', bytes: 64 }]);
  const mj = JSON.stringify(m);
  assert.ok(!raw.includes(f.dir) && !raw.includes('phone shot') && !mj.includes('192.168.77.12'), 'no source path, file name or LAN address stored');
  // the page view: URLs into the store; the files for an agent's terminal
  const v = T.pageThread(T.getThread(t.id));
  assert.deepEqual(v.messages[1].images, [
    { url: '/thread-media/T-001/m2-1.png', name: 'm2-1.png', caption: 'hero, phone at <ip address>', w: 1170, h: 2532 },
    { url: '/thread-media/T-001/m2-2.jpg', name: 'm2-2.jpg' },
  ]);
  const cur = T.getThread(t.id);
  assert.deepEqual(T.imageLines(cur, cur.messages[1]), [`[image 1: ${join(dir, 'm2-1.png')} "hero, phone at <ip address>"]`, `[image 2: ${join(dir, 'm2-2.jpg')}]`]);
  assert.deepEqual(T.imageLines(cur, cur.messages[0]), []);
  // the lead starts a thread with an image and no text
  const n = await T.createThread({ by: 'lead', title: 'Look at this', images: [{ file: f.jpg, caption: 'end' }] });
  assert.equal(n.thread.messages[0].text, '');
  assert.deepEqual(n.thread.messages[0].images, [{ name: 'm1-1.jpg', caption: 'end', bytes: 64 }]);
  assert.ok(existsSync(join(state, 'console', 'threads', 'T-002', 'm1-1.jpg')));
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: ' ' }), /the reply is empty/, 'no images: the text is still required');
});

test('I-089 sniffing: refused by content (text named .png, a video), over 15 MB, more than 6, a bad caption; nothing stored', async () => {
  const f = imgFiles();
  const t = await userThread();
  const before = readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8');
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: f.png }, { file: f.fakePng }] }), /not-really\.png: not a PNG, JPEG, WebP or GIF image/);
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: f.video }] }), /image 1 \(.*clip\.png\): a video; only PNG, JPEG, GIF or WebP images/);
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: join(f.dir, 'missing.png') }] }), /no such file/);
  const big = join(f.dir, 'big.png'); writeFileSync(big, pngBytes()); truncateSync(big, 15 * 1024 * 1024 + 1);
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: big }] }), /over the 15 MB limit/);
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: Array.from({ length: 7 }, () => ({ file: f.png })) }), /at most 6 images per message \(got 7\)/);
  await assert.rejects(T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: f.png, caption: 'c'.repeat(161) }] }), /caption is too long/);
  await assert.rejects(T.replyAgent(t.id, { by: 'fix-other', text: 'x', images: [{ file: f.png }] }), /not assigned/);
  assert.equal(readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8'), before, 'the thread is unchanged');
  assert.ok(!existsSync(join(state, 'console', 'threads', 'T-001')), 'no image directory');
  assert.equal(T.prepareImages(undefined).items.length, 0);
});

test('I-089 backward compatible: a message without images is stored and shown with exactly the old fields', async () => {
  const t = await userThread('Plain', 'just text');
  await T.replyAgent(t.id, { by: 'lead', text: 'plain reply', ask: true });
  await T.replyUser(t.id, { text: 'ok' });
  const raw = JSON.parse(readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8'));
  const keys = [['n', 'at', 'by', 'text'], ['n', 'at', 'by', 'text', 'ask'], ['n', 'at', 'by', 'text']];
  assert.deepEqual(raw.messages.map((m) => Object.keys(m)), keys);
  assert.deepEqual(T.pageThread(T.getThread(t.id)).messages.map((m) => Object.keys(m)), keys);
  assert.ok(!existsSync(T.threadMediaDir(t.id)));
  const w = T.threadWaitCondition({ as: 'lead' }).check();
  const news = JSON.parse(w.detail)[0];
  assert.deepEqual(news.messages.map((m) => Object.keys(m)), [['n', 'at', 'by', 'text']], 'the lead read #1 when it replied');
  assert.match(T.newsText(news, 'lead'), /^NEW T-001 "Plain" #3 by user at \S+:\n  ok\n  reply: /);
});

test('I-089 the user\'s images from the page: base64, sniffed, 20 MB together; kept as typed; thread wait prints the files', async () => {
  const t = await userThread();
  const png = pngBytes(400, 300).toString('base64');
  const r = await T.replyUser(t.id, { text: '', images: [{ data: png, caption: 'my phone at 192.168.77.12' }, { data: jpgBytes().toString('base64') }] });
  assert.equal(r.n, 2);
  const m = T.getThread(t.id).messages[1];
  assert.deepEqual(m.images, [{ name: 'm2-1.png', caption: 'my phone at 192.168.77.12', w: 400, h: 300, bytes: 64 }, { name: 'm2-2.jpg', bytes: 64 }], 'the user\'s caption as typed (local store)');
  assert.equal(m.text, '');
  await assert.rejects(T.replyUser(t.id, { text: 'x', images: [{ data: Buffer.from('<svg onload=alert(1)>').toString('base64') }] }), /image 1: not a PNG, JPEG/);
  await assert.rejects(T.replyUser(t.id, { text: 'x', images: [{ data: 'not base64!' }] }), /image 1: the image data is not base64/);
  await assert.rejects(T.replyUser(t.id, { text: 'x', images: [{ file: '/etc/hosts' }] }), /the image data is not base64/, 'the page never names a file');
  await assert.rejects(T.replyUser(t.id, { text: 'x', images: 'm2-1.png' }), /images must be a list/);
  const eleven = Buffer.concat([pngBytes(), Buffer.alloc(11 * 1024 * 1024)]).toString('base64');
  await assert.rejects(T.replyUser(t.id, { text: 'x', images: [{ data: eleven }, { data: eleven }] }), /together, over the 20 MB limit/);
  await assert.rejects(T.replyUser(t.id, { text: '' }), /the message is empty/);
  const n = await T.createThread({ title: 'Screenshot', text: '', images: [{ data: png }], fromPage: true });
  assert.deepEqual(n.thread.messages[0].images.map((x) => x.name), ['m1-1.png']);
  // the lead's wake: the files to open with Read, under the text
  const w = T.threadWaitCondition({ as: 'lead' }).check();
  const news = JSON.parse(w.detail);
  const dir = join(state, 'console', 'threads', 'T-001');
  assert.deepEqual(news[0].messages[1].images, [{ file: join(dir, 'm2-1.png'), caption: 'my phone at 192.168.77.12' }, { file: join(dir, 'm2-2.jpg') }]);
  const txt = T.newsText(news[0], 'lead');
  assert.match(txt, new RegExp(`#2 by user at \\S+:\\n  \\[image 1: ${esc(join(dir, 'm2-1.png'))} "my phone at 192\\.168\\.77\\.12"\\]\\n  \\[image 2: ${esc(join(dir, 'm2-2.jpg'))}\\]\\n`));
  assert.match(txt, /--image <png\|jpg\|gif\|webp> \[--caption "…"\], up to 6/);
});

test('I-089 threadMediaFile: only stored names a message carries; traversal, unknown names and ids refused', async () => {
  const f = imgFiles();
  const t = await userThread();
  await T.replyAgent(t.id, { by: 'lead', text: 'x', images: [{ file: f.png }] });
  assert.deepEqual(T.threadMediaFile('T-001', 'm2-1.png'), { file: join(state, 'console', 'threads', 'T-001', 'm2-1.png'), type: 'image/png' });
  writeFileSync(join(state, 'console', 'threads', 'T-001', 'm9-1.png'), pngBytes()); // on disk, but no message carries it
  for (const [id, name] of [['T-001', 'm9-1.png'], ['T-001', '../T-001.json'], ['T-001', 'm2-1.png/..'], ['T-001', 'T-001.json'], ['T-1', 'm2-1.png'],
    ['T-002', 'm2-1.png'], ['../T-001', 'm2-1.png'], ['T-001', 'm2-1.svg'], ['T-001', 'M2-1.png'], ['T-001', '']]) {
    assert.equal(T.threadMediaFile(id, name), null, `${id} ${name}`);
  }
});

test('I-089 threads page: images under the message as thumbnails with captions, open full size in place; none for a text message', async () => {
  const f = imgFiles();
  const t = await userThread();
  await T.replyAgent(t.id, { by: 'lead', text: 'Two shots', images: [{ file: f.png, caption: 'hero at 0 s' }, { file: f.jpg }] });
  await T.replyAgent(t.id, { by: 'lead', images: [{ file: f.jpg, caption: 'only a picture' }] });
  const view = T.pageThread(T.getThread(t.id));
  view.messages.push({ n: 9, at: view.messages[0].at, by: 'lead', text: 'evil', images: [{ url: 'https://evil.invalid/x.png', caption: 'outside' }] });
  const p = await threadsPage({ hash: `#${t.id}`, thread: view });
  const lis = p.ids['tv-msgs'].children;
  const imgsOf = (li) => li.all().filter((n) => n.tagName === 'img');
  assert.equal(imgsOf(lis[0]).length, 0, 'the user\'s text message: no images');
  assert.ok(!lis[0].all().some((n) => n.className === 'mimgs'));
  assert.deepEqual(imgsOf(lis[1]).map((n) => [n.src, n.alt, n.width, n.height]), [['/thread-media/T-001/m2-1.png', 'hero at 0 s', 1170, 2532], ['/thread-media/T-001/m2-2.jpg', 'Image 2', undefined, undefined]]);
  assert.deepEqual(lis[1].all().filter((n) => n.tagName === 'figcaption').map((n) => n.textContent), ['hero at 0 s']);
  assert.equal(lis[1].all().find((n) => n.className === 'mtext').textContent, 'Two shots');
  assert.ok(!lis[2].all().some((n) => n.className === 'mtext'), 'an image-only message has no empty text line');
  assert.equal(imgsOf(lis[2]).length, 1);
  assert.equal(imgsOf(lis[3]).length, 0, 'a URL outside the store is never loaded');
  const a = lis[1].all().find((n) => n.className === 'thumb');
  assert.equal(a.href, '/thread-media/T-001/m2-1.png'); assert.equal(a.target, '_blank');
  let prevented = false;
  for (const fn of a.listeners.click) fn({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(p.ids.lightbox.hidden, false);
  assert.equal(p.ids['lb-img'].src, '/thread-media/T-001/m2-1.png');
  assert.equal(p.ids['lb-cap'].textContent, 'hero at 0 s');
  for (const fn of p.ids.lightbox.listeners.click) fn({ target: p.ids.lightbox });
  assert.equal(p.ids.lightbox.hidden, true, 'a click closes it');
});

test('I-089 threads page: the user attaches images (type, count and size checked), captions them, and they go with the reply as base64', async () => {
  const t = await userThread();
  const view = T.pageThread(T.getThread(t.id));
  const p = await threadsPage({ hash: `#${t.id}`, thread: view, replied: view });
  const file = (name, type, bytes) => ({ name, type, size: bytes.length, bytes });
  const input = p.ids['reply-file'];
  input.files = [file('a.png', 'image/png', pngBytes()), file('notes.svg', 'image/svg+xml', Buffer.from('<svg/>'))];
  for (const fn of input.listeners.change) fn();
  assert.match(p.ids.toast.textContent, /notes\.svg: only PNG, JPEG, GIF or WebP images/);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  const box = p.ids['reply-imgs'];
  assert.equal(box.children.length, 1);
  assert.equal(p.ids['reply-text'].required, false, 'an image alone is a message');
  const cap = box.all().find((n) => n.tagName === 'input');
  cap.value = 'my phone'; for (const fn of cap.listeners.input) fn();
  input.files = [file('big.jpg', 'image/jpeg', { length: 16 * 1024 * 1024 })];
  for (const fn of input.listeners.change) fn();
  assert.match(p.ids.toast.textContent, /big\.jpg is over 15 MB/);
  p.ids['reply-text'].value = '';
  p.ids['reply-form'].requestSubmit();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const sent = p.calls.filter((c) => c.url.endsWith('/reply')).map((c) => JSON.parse(c.init.body));
  assert.deepEqual(sent, [{ text: '', images: [{ data: pngBytes().toString('base64'), caption: 'my phone' }] }]);
  assert.equal(box.children.length, 0, 'sent: the attachments are cleared');
  assert.equal(p.ids['reply-text'].required, true);
  // the server takes what the page sends
  const r = await T.replyUser(t.id, sent[0]);
  assert.deepEqual(T.getThread(t.id).messages[r.n - 1].images, [{ name: 'm2-1.png', caption: 'my phone', w: 1170, h: 2532, bytes: 64 }]);
  // a message without attachments sends no images key (the old body)
  p.ids['reply-text'].value = 'plain';
  p.ids['reply-form'].requestSubmit();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.calls.filter((c) => c.url.endsWith('/reply')).map((c) => JSON.parse(c.init.body)).at(-1), { text: 'plain' });
});

// ---- I-090 (user T-043): a comment's thread quotes its item, with a link back ------------------------------------------

test('I-090 threads page: a comment shows its item as a quote with a link back; messages can be commented; a plain thread shows none', async () => {
  const anchor = { page: 'proposals', item: 'PR-009/option:both/shot:2', quote: 'the blur edge', label: 'Blur the strip' };
  const t = (await T.createThread({ title: 'Comment on PR-009', text: 'Looks soft', fromPage: true, anchor })).thread;
  const view = T.pageThread(T.getThread(t.id));
  const p = await threadsPage({ hash: `#${t.id}`, thread: view });
  const box = p.ids['tv-anchor'];
  assert.equal(box.hidden, false);
  assert.equal(box.textContent, 'Comment on PR-009 option both, shot 2 "Blur the strip"Open itthe blur edge');
  const link = box.all().find((n) => n.tagName === 'a');
  assert.equal(link.href, '/proposals#PR-009');
  assert.equal(box.all().find((n) => n.tagName === 'q').textContent, 'the blur edge');
  const li = p.ids['tv-msgs'].children[0];
  assert.equal(li.attrs['data-anchor'], `thread:${t.id}/msg:1`);
  assert.equal(li.attrs['data-anchor-label'], 'Comment on PR-009 #1');
  // a hand-edited store never puts a foreign link on the page
  const bad = await threadsPage({ hash: `#${t.id}`, thread: { ...view, anchor: { ...view.anchor, url: 'javascript:alert(1)' } } });
  assert.ok(!bad.ids['tv-anchor'].all().some((n) => n.tagName === 'a'), 'no link');
  const plain = (await T.createThread({ title: 'x', text: 'y', fromPage: true })).thread;
  const q = await threadsPage({ hash: `#${plain.id}`, thread: T.pageThread(T.getThread(plain.id)) });
  assert.equal(q.ids['tv-anchor'].hidden, true);
  // the list row names the item
  const l = await threadsPage({ hash: '', list: [T.summary(T.getThread(t.id))] });
  assert.ok(l.ids.threads.textContent.includes('comment on PR-009 option both, shot 2'), l.ids.threads.textContent);
});

// ---- I-119 (user T-076): phone links in threads: http://lan:<port>/ stored as written, resolved only when shown --------
// Fake addresses only: the resolver is injected (or FW_LAN_ADDRESS is a made-up 192.168.77.12), never the host's.

const FAKE_LAN = '192.168.77.12';
const IPV4_ANY = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

test('I-119 scrubAgentText: http(s)://lan:<port>/<path> is kept as written; raw IPs, .local hosts, e-mails and bad lan forms still scrubbed', () => {
  for (const ok of ['http://lan:5231/', 'https://lan:5231/', 'http://lan:5231', 'http://lan:1/x', 'http://lan:65535/a/b-c_d.e~f/%20', 'http://lan:5231/?arm=b&v=2', 'http://lan:5231/#top', 'HTTP://LAN:5231/x'])
    assert.deepEqual(T.scrubAgentText(`Try ${ok} on the phone`), { text: `Try ${ok} on the phone`, scrubbed: [] }, ok);
  // sentence punctuation after a link is not part of it
  assert.equal(T.scrubAgentText('A: http://lan:5231/, B: http://lan:5232/. (C: http://lan:5233/)').text, 'A: http://lan:5231/, B: http://lan:5232/. (C: http://lan:5233/)');
  // the rest of the text is scrubbed as before
  const s = T.scrubAgentText(`Phone: http://lan:5231/ not http://${FAKE_LAN}:5231/ nor http://my-mac.local:5231/ nor ${FAKE_LAN}; mail someone@example.invalid`);
  assert.equal(s.text, 'Phone: http://lan:5231/ not <link> nor <link> nor <ip address>; mail <e-mail>');
  assert.deepEqual(s.scrubbed.sort(), ['e-mail', 'ip address', 'url']);
  // only a numeric port 1-65535 and a plain path: anything else stays scrubbed, whole
  for (const bad of ['http://lan/', 'http://lan:0/', 'http://lan:65536/', 'http://lan:99999/', 'http://lan:abc/', 'http://lan:5231x/', 'http://lan:5231/a@example.invalid',
    `http://lan:5231/?h=${FAKE_LAN}`, 'http://lan:5231/Users/someone/x', 'http://lan:5231/a<b>', 'http://lan:5231/a"b', "http://lan:5231/a'b", 'http://lan:5231/a\\b',
    'http://lan-host:5231/', 'http://lan.example.invalid:5231/', 'http://user@lan:5231/', 'http://lan:5231@evil.invalid/', 'ftp://lan:5231/', 'http://lan:5231/a b'.split(' ')[0] + 'é'])
    assert.equal(T.scrubAgentText(`x ${bad} y`).text, 'x <link> y', bad);
});

test('I-119 lanLinks: the valid placeholders of a text, resolved by the injected resolver; unresolvable -> href null', () => {
  const text = 'A http://lan:5231/x, B https://lan:5232/?v=2. Not http://lan:0/ nor http://localhost:5559/ nor <link>. A again http://lan:5231/x';
  assert.deepEqual(T.lanLinks(text, () => FAKE_LAN), [
    { text: 'http://lan:5231/x', href: `http://${FAKE_LAN}:5231/x` },
    { text: 'https://lan:5232/?v=2', href: `https://${FAKE_LAN}:5232/?v=2` },
  ]);
  let calls = 0;
  T.lanLinks(text, () => { calls++; return FAKE_LAN; });
  assert.equal(calls, 1, 'resolved once per text');
  assert.deepEqual(T.lanLinks(text, () => { throw new Error('no LAN address'); }), [
    { text: 'http://lan:5231/x', href: null }, { text: 'https://lan:5232/?v=2', href: null },
  ]);
  assert.deepEqual(T.lanLinks('no links here', () => { throw new Error('never asked'); }), []);
  assert.deepEqual(T.lanLinks('http://lan:5231/', () => 'not-an-ip'), [{ text: 'http://lan:5231/', href: null }], 'a resolver answer that is not an IPv4 address is not used');
});

test('I-119 store: a lan link is stored as written (no address resolved before storing); pageThread resolves it at view time', async () => {
  const old = process.env.FW_LAN_ADDRESS;
  process.env.FW_LAN_ADDRESS = FAKE_LAN; // if anything resolved before storing, the address would land in the store
  try {
    const n = await T.createThread({ by: 'lead', title: 'Try it on the phone', text: 'A: http://lan:5231/\nB: http://lan:5232/x?arm=b' });
    assert.deepEqual(n.scrubbed, []);
    const r = await T.replyAgent(n.thread.id, { by: 'lead', text: `Also https://lan:5233/ and not http://${FAKE_LAN}:5233/` });
    assert.deepEqual(r.scrubbed, ['url']);
    const raw = readFileSync(join(state, 'console', 'threads', `${n.thread.id}.json`), 'utf8');
    assert.doesNotMatch(raw, IPV4_ANY, 'no IP address in the stored thread');
    const t = T.getThread(n.thread.id);
    assert.deepEqual(t.messages.map((m) => m.text), ['A: http://lan:5231/\nB: http://lan:5232/x?arm=b', 'Also https://lan:5233/ and not <link>']);
    // view time: the default resolver (lan.mjs, here FW_LAN_ADDRESS), or an injected one
    const p = T.pageThread(t);
    assert.deepEqual(p.messages.map((m) => m.lan), [
      [{ text: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }, { text: 'http://lan:5232/x?arm=b', href: `http://${FAKE_LAN}:5232/x?arm=b` }],
      [{ text: 'https://lan:5233/', href: `https://${FAKE_LAN}:5233/` }],
    ]);
    assert.equal(p.messages[0].text, 'A: http://lan:5231/\nB: http://lan:5232/x?arm=b', 'the text itself keeps the placeholder');
    const q = T.pageThread(t, null, { lan: () => { throw new Error('no LAN address'); } });
    assert.deepEqual(q.messages[1].lan, [{ text: 'https://lan:5233/', href: null }]);
    const plain = (await T.createThread({ title: 'x', text: 'y', fromPage: true })).thread;
    assert.ok(!('lan' in T.pageThread(plain, null, { lan: () => { throw new Error('never asked'); } }).messages[0]), 'a message without lan links has no lan key');
    assert.doesNotMatch(readFileSync(join(state, 'console', 'threads', `${n.thread.id}.json`), 'utf8'), IPV4_ANY, 'viewing stores nothing');
  } finally { if (old === undefined) delete process.env.FW_LAN_ADDRESS; else process.env.FW_LAN_ADDRESS = old; }
});

test('I-119 threads page: a lan link opens the address resolved at view time; unresolved: the text and a plain note; only listed links', async () => {
  const n = await T.createThread({ by: 'lead', title: 'Try it', text: 'A: http://lan:5231/x and the console http://localhost:5559/progress and B: http://lan:5232/' });
  const view = T.pageThread(T.getThread(n.thread.id), null, { lan: () => FAKE_LAN });
  const p = await threadsPage({ hash: `#${n.thread.id}`, thread: view });
  const msg = p.ids['tv-msgs'].children[0];
  const links = msg.all().filter((x) => x.tagName === 'a').map((a) => [a.textContent, a.href]);
  assert.deepEqual(links, [[`http://${FAKE_LAN}:5231/x`, `http://${FAKE_LAN}:5231/x`], ['http://localhost:5559/progress', 'http://localhost:5559/progress'], [`http://${FAKE_LAN}:5232/`, `http://${FAKE_LAN}:5232/`]]);
  assert.equal(msg.all().find((x) => x.className === 'mtext').textContent, `A: http://${FAKE_LAN}:5231/x and the console http://localhost:5559/progress and B: http://${FAKE_LAN}:5232/`);
  // unresolvable: the placeholder as text with a plain note, no link, no error
  const off = T.pageThread(T.getThread(n.thread.id), null, { lan: () => { throw new Error('no LAN address'); } });
  const q = await threadsPage({ hash: `#${n.thread.id}`, thread: off });
  const m2 = q.ids['tv-msgs'].children[0];
  assert.deepEqual(m2.all().filter((x) => x.tagName === 'a').map((a) => a.href), ['http://localhost:5559/progress']);
  assert.equal(m2.all().find((x) => x.className === 'mtext').textContent, 'A: http://lan:5231/x (Wi-Fi address not available) and the console http://localhost:5559/progress and B: http://lan:5232/ (Wi-Fi address not available)');
  assert.equal(m2.all().filter((x) => x.className === 'lannote').length, 2);
  // a placeholder the server did not list (an old reply, or a hand-edited store) is plain text, never a link
  const bare = await threadsPage({ hash: `#${n.thread.id}`, thread: { ...view, messages: view.messages.map((m) => ({ ...m, lan: undefined })) } });
  assert.deepEqual(bare.ids['tv-msgs'].children[0].all().filter((x) => x.tagName === 'a').map((a) => a.href), ['http://localhost:5559/progress']);
  // a listed href that is not an http(s) URL is not linked either
  const evil = await threadsPage({ hash: `#${n.thread.id}`, thread: { ...view, messages: view.messages.map((m) => ({ ...m, lan: [{ text: 'http://lan:5231/x', href: 'javascript:alert(1)' }] })) } });
  assert.ok(!evil.ids['tv-msgs'].children[0].all().some((x) => x.tagName === 'a' && /^javascript:/.test(x.href)));
});

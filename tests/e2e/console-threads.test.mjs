// Console threads end to end (ts-console-threads): `console.mjs serve --port 0 --notify` on a temp state dir
// ($FW_STATE_DIR) with $FW_CONSOLE_NOTIFY_LOG (the notifier writes its osascript argv there). The user's actions are
// sent over HTTP like the page sends them; the lead and agents use the CLI. Checks: the Threads menu entry and page,
// a background `thread wait --as lead` waking on a user message (every unread message in one wake), assignment and
// who may reply, the agent-text scrub through the store, API, event feed and notifications, mark-read clearing the
// badge, and the POST guards (localhost Host, x-console, Origin, body size). No port 5173 or 5559, no real osascript.
// Fake addresses only (192.168.77.12, .invalid hosts, /Users/someone).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { tempDir, node, nodeAsync, tool, startProc, request, sleep } from '../helpers.mjs';

const CON = tool('console.mjs');
let state, env, srv, base, notifyLog;
const cli = (...a) => node(CON, a, { env });
const cliAsync = (...a) => nodeAsync(CON, a, { env, timeout: 60000 });
async function until(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(50); } }
const notifyLines = () => (existsSync(notifyLog) ? readFileSync(notifyLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function req(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const data = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
  return request(new URL(path, base).href, { method, headers: { ...(data !== undefined && { 'content-type': 'application/json' }), ...headers }, body: data })
    .then((r) => { let json; try { json = JSON.parse(r.text); } catch {} return { ...r, json }; });
}
const userPost = (path, body, headers = {}) => req(path, { method: 'POST', body, headers: { 'x-console': '1', ...headers } });

/** GET /api/events, keeping the `threads` events. */
function sse() {
  const events = [];
  let buf = '';
  const r = http.get(new URL('api/events', base), (res) => {
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (ev === 'threads' && data) events.push({ at: Date.now(), raw: data, v: JSON.parse(data) });
      }
    });
  });
  r.on('error', () => {});
  return { events, close: () => r.destroy() };
}

before(async () => {
  state = tempDir('fw-threads-e2e-');
  notifyLog = join(state, 'notify.log');
  env = { FW_STATE_DIR: state, FW_CONSOLE_NOTIFY_LOG: notifyLog };
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0', '--notify'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('menu: Threads with its badge on every page; /threads served; nothing external', async () => {
  assert.notEqual(srv.port, 5173); assert.notEqual(srv.port, 5559);
  for (const p of ['/', '/progress', '/threads']) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /href="\/threads">Threads<span class="badge" data-thread-badge hidden>0<\/span><\/a>/, p);
  }
  const t = await req('/threads');
  assert.match(t.text, /<title>Threads<\/title>/);
  assert.match(t.text, /class="mbtn on" aria-current="page" title="[^"]*" href="\/threads">Threads/);
  assert.ok(!t.text.includes('<!--console-menu-->'));
  assert.ok(!/innerHTML/.test(t.text), 'the page never renders data as HTML');
  assert.match(t.headers['content-security-policy'], /default-src 'none'/);
  const body = t.text.replace(/http:\/\/www\.w3\.org[^"']*/g, '');
  assert.ok(!/https?:\/\/(?!localhost)[a-z0-9]/i.test(body), `nothing external: ${(body.match(/https?:\/\/(?!localhost)\S+/i) || [])[0]}`);
});

test('the user starts a thread; a background thread wait --as lead wakes with every unread message; the lead replies', async () => {
  const w = cliAsync('thread', 'wait', '--as', 'lead', '--timeout', '30', '--quiet');
  await sleep(600);
  const c = await userPost('/api/threads', { title: 'Hero on the phone', text: 'Does it still stutter?\nI use 192.168.77.12', topic: 'hero-exit' });
  assert.equal(c.status, 200, c.text);
  const id = c.json.thread.id;
  assert.equal(id, 'T-001');
  await userPost(`/api/threads/${id}/reply`, { text: 'Second line, sent right after.' });
  const r = await w;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^NEW T-001 "Hero on the phone" \[hero-exit\] #1 by user at \S+:\n {2}Does it still stutter\?\n {2}I use 192\.168\.77\.12$/m, 'the user text as typed');
  assert.match(r.stdout, /^NEW T-001 .* #2 by user at \S+:\n {2}Second line, sent right after\.$/m, 'a burst arrives in one wake');
  assert.match(r.stdout, /^MET threads all for lead: 2 new message\(s\) in T-001 .*marked read for lead/m);
  // read: a second wait does not re-fire
  const again = cli('thread', 'wait', '--as', 'lead', '--timeout', '1', '--quiet');
  assert.equal(again.code, 3, again.out);
  assert.match(again.stdout, /^TIMEOUT threads all for lead/m);
  const list = cli('thread', 'list', '--unread', '--as', 'lead');
  assert.match(list.stdout, /no threads with unread user messages for lead/);

  const feed = sse();
  await until(() => feed.events.length >= 1);
  const rep = cli('thread', 'reply', id, '--by', 'lead', '--text', 'Checking at http://192.168.77.12:5497/ for someone@example.invalid in /Users/someone/x; see http://localhost:5559/progress', '--ask');
  assert.equal(rep.code, 0, rep.out);
  assert.match(rep.stdout, /^REPLIED T-001 #3 \(waiting on the user\)$/m);
  assert.match(rep.stdout, /scrubbed before storing \(Hard rule 12\): url, e-mail, home path/);
  const stored = JSON.parse(readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8'));
  assert.equal(stored.messages[2].text, 'Checking at <link> for <e-mail> in ~/x; see http://localhost:5559/progress');
  assert.equal(stored.messages[0].text, 'Does it still stutter?\nI use 192.168.77.12', 'the user text kept as typed');

  const got = await until(() => feed.events.find((e) => e.v.badge === 1), 3000);
  assert.ok(got, 'the reply reached the threads feed');
  const row = got.v.threads.find((t) => t.id === id);
  assert.deepEqual([row.state, row.unread, row.lastAgentN, row.lastBy], ['waiting-on-you', 1, 3, 'lead']);
  for (const e of feed.events) for (const bad of ['192.168', 'someone@', 'Does it still', '/Users/']) assert.ok(!e.raw.includes(bad), `${bad} in the feed: ${e.raw}`);

  const n = await until(() => notifyLines().find((l) => l.argv[7] === `${id}: Hero on the phone`));
  assert.ok(n, `a macOS notification: ${JSON.stringify(notifyLines())}`);
  assert.deepEqual(n.argv.slice(0, 6), ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']);
  assert.equal(n.argv[6], 'Console: new reply');
  assert.equal(notifyLines().filter((l) => l.argv[7].startsWith('T-001')).length, 1, 'once');

  // the page: list and thread; then mark read clears the badge
  const lj = (await req('/api/threads')).json;
  assert.deepEqual(lj.threads.map((t) => [t.id, t.state, t.unread]), [['T-001', 'waiting-on-you', 1]]);
  const tj = (await req(`/api/threads/${id}`)).json.thread;
  assert.deepEqual(tj.messages.map((m) => [m.n, m.by, !!m.ask]), [[1, 'user', false], [2, 'user', false], [3, 'lead', true]]);
  assert.ok(!('reads' in tj) && !('history' in tj));
  assert.equal(tj.readUser, 2);
  const rd = await userPost(`/api/threads/${id}/read`, { n: 3 });
  assert.equal(rd.status, 200, rd.text);
  const cleared = await until(() => feed.events.find((e) => e.v.badge === 1 && e.v.threads[0].unread === 0), 3000);
  assert.ok(cleared, 'unread cleared (the badge stays 1: the thread asks the user)');
  await userPost(`/api/threads/${id}/reply`, { text: 'Yes, still.' });
  const zero = await until(() => feed.events.find((e) => e.v.badge === 0), 3000);
  assert.ok(zero, 'answering clears the badge');
  feed.close();
});

test('assign: only the lead; the assignee wakes on the backlog; a non-assignee is refused; the lead\'s and the assignee\'s marks are separate', async () => {
  const c = await userPost('/api/threads', { title: 'Blur question', text: 'Is the blur fix landed?' });
  const id = c.json.thread.id;
  const no = cli('thread', 'reply', id, '--by', 'fix-blur', '--text', 'hi');
  assert.equal(no.code, 1);
  assert.match(no.stderr, /fix-blur is not assigned to T-002: ask the lead to assign you/);
  const notLead = cli('thread', 'assign', id, '--to', 'fix-blur', '--by', 'fix-blur');
  assert.equal(notLead.code, 1);
  assert.match(notLead.stderr, /only the lead assigns/);
  const lw = cli('thread', 'wait', '--as', 'lead', '--timeout', '5', '--quiet');
  assert.equal(lw.code, 0, lw.out);
  assert.match(lw.stdout, /^NEW T-002 "Blur question" #1 by user/m);
  const a = cli('thread', 'assign', id, '--to', 'fix-blur', '--by', 'lead');
  assert.equal(a.code, 0, a.out);
  assert.match(a.stdout, /^ASSIGNED T-002: fix-blur$/m);
  const aw = cli('thread', 'wait', '--as', 'fix-blur', '--timeout', '5', '--quiet', '--json');
  assert.equal(aw.code, 0, aw.out);
  assert.deepEqual(JSON.parse(aw.stdout).map((t) => [t.id, t.messages.map((m) => m.text)]), [['T-002', ['Is the blur fix landed?']]], 'only its thread, with the backlog the lead already read');
  const empty = node(CON, ['thread', 'reply', id, '--by', 'fix-blur', '--file', '-'], { env, input: '' });
  assert.equal(empty.code, 1, 'empty stdin');
  assert.match(empty.stderr, /the reply is empty/);
  const f = join(state, 'reply.txt');
  writeFileSync(f, 'Not yet: review round 2.\n');
  const ok2 = cli('thread', 'reply', id, '--by', 'fix-blur', '--file', f);
  assert.equal(ok2.code, 0, ok2.out);
  const stdin = node(CON, ['thread', 'reply', id, '--by', 'lead', '--file', '-'], { env, input: 'From stdin,\ntwo lines.\n' });
  assert.equal(stdin.code, 0, stdin.out);
  assert.match(stdin.stdout, /^REPLIED T-002 #3$/m);
  const show = cli('thread', 'show', id, '--as', 'lead');
  assert.match(show.stdout, /#2 fix-blur at \S+:\n {4}Not yet: review round 2\.\n {2}#3 lead at \S+:\n {4}From stdin,\n {4}two lines\./);
  const cl = cli('thread', 'close', id, '--by', 'fix-blur', '--note', 'answered');
  assert.equal(cl.code, 0, cl.out);
  const page = (await req('/api/threads')).json.threads.find((t) => t.id === id);
  assert.equal(page.state, 'closed');
  const all = cli('thread', 'list');
  assert.ok(!all.stdout.includes('T-002'), 'closed threads only with --all');
  assert.match(cli('thread', 'list', '--all').stdout, /^T-002 {2}\[closed\]/m);
  // the user writes in a closed thread: it opens again and the lead and the assignee both wake
  await userPost(`/api/threads/${id}/reply`, { text: 'Thanks, when then?' });
  assert.equal((await req('/api/threads')).json.threads.find((t) => t.id === id).state, 'open');
  for (const who of ['lead', 'fix-blur']) {
    const r = cli('thread', 'wait', '--as', who, '--thread', id, '--timeout', '5', '--quiet');
    assert.equal(r.code, 0, `${who}: ${r.out}`);
    assert.match(r.stdout, /#4 by user at \S+:\n {2}Thanks, when then\?/);
  }
  const lead2 = cli('thread', 'new', '--by', 'lead', '--title', 'Weekly summary', '--text', 'Ask me here.', '--to', 'mgmt-ops-6', '--topic', 'whole');
  assert.equal(lead2.code, 0, lead2.out);
  assert.match(lead2.stdout, /^STARTED T-003: Weekly summary \(assigned: mgmt-ops-6\)$/m);
  const byUser = cli('thread', 'reply', 'T-003', '--by', 'user', '--text', 'x');
  assert.equal(byUser.code, 1);
  assert.match(byUser.stderr, /"user" writes only from the console page/);
});

test('thread POSTs: localhost Host, x-console, same Origin, JSON body under 64 KB; bad ids and actions', async () => {
  const port = new URL(base).port;
  assert.equal((await req('/api/threads', { headers: { host: `evil.invalid:${port}` } })).status, 421);
  assert.equal((await req('/threads', { headers: { host: `evil.invalid:${port}` } })).status, 421);
  assert.equal((await req('/api/threads', { method: 'POST', body: { title: 't', text: 'x' } })).status, 403, 'no x-console');
  assert.equal((await userPost('/api/threads', { title: 't', text: 'x' }, { origin: 'http://evil.invalid' })).status, 403, 'foreign origin');
  assert.equal((await userPost('/api/threads', { title: 't', text: 'x' }, { origin: `http://localhost:${Number(port) + 1}` })).status, 403, 'another local port');
  assert.equal((await userPost('/api/threads/T-001/reply', { text: 'x' }, { origin: 'null' })).status, 403);
  const okOrigin = await userPost('/api/threads', { title: 'Same origin', text: 'ok' }, { origin: `http://localhost:${port}` });
  assert.equal(okOrigin.status, 200, okOrigin.text);
  const big = await req('/api/threads', { method: 'POST', headers: { 'x-console': '1' }, raw: JSON.stringify({ title: 't', text: 'x'.repeat(70 * 1024) }) });
  assert.equal(big.status, 413);
  assert.equal((await req('/api/threads', { method: 'POST', headers: { 'x-console': '1' }, raw: '[1]' })).status, 400);
  assert.equal((await req('/api/threads', { method: 'POST', headers: { 'x-console': '1' }, raw: 'nope' })).status, 400);
  assert.equal((await userPost('/api/threads', { title: '', text: 'x' })).status, 409);
  assert.equal((await userPost('/api/threads/T-099/reply', { text: 'x' })).status, 404);
  assert.equal((await userPost('/api/threads/T-001/delete', {})).status, 404);
  assert.equal((await req('/api/threads/T-099')).status, 404);
  assert.equal((await req('/api/threads/..%2fserver')).status, 404);
  // the user's markup stays text in the API (the page renders it with textContent)
  const x = await userPost('/api/threads', { title: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script>' });
  assert.equal(x.json.thread.title, '<img src=x onerror=alert(1)>');
});

test('I-084: the list, the thread and the reply\'s answer name who reads the user\'s messages: the lead, then the assignees', async () => {
  const c = await userPost('/api/threads', { title: 'Who gets this?', text: 'Trace me' });
  const id = c.json.thread.id;
  assert.deepEqual(c.json.thread.to, ['lead'], 'a new thread: the lead');
  assert.equal(cli('thread', 'assign', id, '--to', 'fix-nav-morph', '--by', 'lead').code, 0);
  assert.deepEqual((await req('/api/threads')).json.threads.find((t) => t.id === id).to, ['lead', 'fix-nav-morph']);
  assert.deepEqual((await req(`/api/threads/${id}`)).json.thread.to, ['lead', 'fix-nav-morph']);
  const r = await userPost(`/api/threads/${id}/reply`, { text: 'More' });
  assert.deepEqual(r.json.thread.to, ['lead', 'fix-nav-morph'], 'the page\'s "Sent to …" reads it from here');
  const page = await req('/threads');
  assert.match(page.text, /id="reply-to"/);
});

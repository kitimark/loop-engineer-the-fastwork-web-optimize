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
import { THREAD_BODY_MAX } from '../../tools/lib/console-server.mjs';

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

test('thread POSTs: localhost Host, x-console, same Origin, JSON body under 64 KB (a new thread or a reply: room for images, I-089); bad ids and actions', async () => {
  const port = new URL(base).port;
  assert.equal((await req('/api/threads', { headers: { host: `evil.invalid:${port}` } })).status, 421);
  assert.equal((await req('/threads', { headers: { host: `evil.invalid:${port}` } })).status, 421);
  assert.equal((await req('/api/threads', { method: 'POST', body: { title: 't', text: 'x' } })).status, 403, 'no x-console');
  assert.equal((await userPost('/api/threads', { title: 't', text: 'x' }, { origin: 'http://evil.invalid' })).status, 403, 'foreign origin');
  assert.equal((await userPost('/api/threads', { title: 't', text: 'x' }, { origin: `http://localhost:${Number(port) + 1}` })).status, 403, 'another local port');
  assert.equal((await userPost('/api/threads/T-001/reply', { text: 'x' }, { origin: 'null' })).status, 403);
  const okOrigin = await userPost('/api/threads', { title: 'Same origin', text: 'ok' }, { origin: `http://localhost:${port}` });
  assert.equal(okOrigin.status, 200, okOrigin.text);
  // I-089: a new thread and a reply carry images (base64), so they take up to THREAD_BODY_MAX (~27 MB); every other
  // POST keeps 64 KB. Text alone is still held to 8000 chars by the store (409).
  const big = await req('/api/threads/T-001/read', { method: 'POST', headers: { 'x-console': '1' }, raw: JSON.stringify({ n: 1, pad: 'x'.repeat(70 * 1024) }) });
  assert.equal(big.status, 413);
  assert.match(big.json.error, /64 KB max/);
  const longText = await req('/api/threads', { method: 'POST', headers: { 'x-console': '1' }, raw: JSON.stringify({ title: 't', text: 'x'.repeat(70 * 1024) }) });
  assert.equal(longText.status, 409);
  assert.match(longText.json.error, /too long/);
  const huge = await req('/api/threads', { method: 'POST', headers: { 'x-console': '1' }, raw: JSON.stringify({ title: 't', text: 'x', images: [{ data: 'A'.repeat(THREAD_BODY_MAX) }] }) });
  assert.equal(huge.status, 413);
  assert.match(huge.json.error, /body too large \(\d+ MB max\)/);
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

// ---- I-089 (user PR-009 note): images in threads ------------------------------------------------------------------
const pngBytes = (w = 1170, h = 2532) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpgBytes = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);

test('I-089 CLI: thread new|reply --image <path> [--caption "…"] stores the images; the page API lists them; /thread-media serves only those', async () => {
  const d = tempDir('fw-thread-img-e2e-');
  const png = join(d, 'hero shot.png'); writeFileSync(png, pngBytes());
  const jpg = join(d, 'end.jpg'); writeFileSync(jpg, jpgBytes());
  const fake = join(d, 'fake.png'); writeFileSync(fake, 'just text');
  const s = cli('thread', 'new', '--by', 'lead', '--title', 'Pictures', '--image', jpg, '--caption', 'end of page');
  assert.equal(s.code, 0, s.out);
  const id = /^STARTED (T-\d+): Pictures with 1 image$/m.exec(s.stdout)?.[1];
  assert.ok(id, s.stdout);
  const r = cli('thread', 'reply', id, '--by', 'lead', '--text', 'Two shots', '--image', png, '--caption', 'hero at 192.168.77.12', '--image', jpg, '--ask');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^REPLIED ${id} #2 with 2 images \\(waiting on the user\\)$`, 'm'));
  assert.match(r.stdout, /scrubbed before storing \(Hard rule 12\): ip address/);
  const dir = join(state, 'console', 'threads', id);
  assert.deepEqual(readFileSync(join(dir, 'm2-1.png')), pngBytes());
  assert.ok(existsSync(join(dir, 'm2-2.jpg')) && existsSync(join(dir, 'm1-1.jpg')));
  const stored = readFileSync(join(state, 'console', 'threads', `${id}.json`), 'utf8');
  assert.ok(!stored.includes(d) && !stored.includes('hero shot') && !stored.includes('192.168.77.12'), 'no source path or LAN address in the store');
  // refused: not an image by content, a caption with no image, too many; nothing changes
  const bad = cli('thread', 'reply', id, '--by', 'lead', '--text', 'x', '--image', fake);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.stderr, /fake\.png: not a PNG, JPEG, WebP or GIF image/);
  const orphan = cli('thread', 'reply', id, '--by', 'lead', '--caption', 'what?', '--text', 'x');
  assert.equal(orphan.code, 1);
  assert.match(orphan.stderr, /--caption belongs to the --image before it/);
  const seven = cli('thread', 'reply', id, '--by', 'lead', ...Array.from({ length: 7 }, () => ['--image', png]).flat());
  assert.equal(seven.code, 1);
  assert.match(seven.stderr, /at most 6 images per message/);
  assert.equal(readFileSync(join(state, 'console', 'threads', `${id}.json`), 'utf8'), stored, 'unchanged');
  // thread show prints the files under the text
  const sh = cli('thread', 'show', id);
  assert.match(sh.stdout, new RegExp(`#2 lead \\(asks the user\\) at \\S+:\\n {4}Two shots\\n {4}\\[image 1: .*m2-1\\.png "hero at <ip address>"\\]\\n {4}\\[image 2: .*m2-2\\.jpg\\]`));
  assert.match(sh.stdout, /#1 lead at \S+:\n {4}\[image 1: .*m1-1\.jpg "end of page"\]/, 'an image-only message prints no empty line');
  // the page API and the media route
  const tj = (await req(`/api/threads/${id}`)).json.thread;
  assert.deepEqual(tj.messages[1].images, [
    { url: `/thread-media/${id}/m2-1.png`, name: 'm2-1.png', caption: 'hero at <ip address>', w: 1170, h: 2532 },
    { url: `/thread-media/${id}/m2-2.jpg`, name: 'm2-2.jpg' },
  ]);
  const img = await req(`/thread-media/${id}/m2-1.png`);
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal(img.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(img.body, pngBytes());
  writeFileSync(join(dir, 'm7-1.png'), pngBytes()); // in the folder, but no message carries it
  for (const p of [`/thread-media/${id}/m7-1.png`, `/thread-media/${id}/..%2f${id}.json`, `/thread-media/${id}/../${id}.json`, `/thread-media/${id}/${id}.json`, '/thread-media/T-999/m2-1.png', `/thread-media/${id}/m2-1.svg`]) {
    assert.equal((await req(p)).status, 404, p);
  }
  const port = new URL(base).port;
  assert.equal((await req(`/thread-media/${id}/m2-1.png`, { headers: { host: `evil.invalid:${port}` } })).status, 421, 'localhost only');
});

test('I-089 page: the user sends images with a reply or a new thread; sniffed and size-checked; the lead\'s thread wait prints the files', async () => {
  const c = await userPost('/api/threads', { title: 'My screenshot', text: '', images: [{ data: pngBytes(400, 300).toString('base64'), caption: 'my phone' }] });
  assert.equal(c.status, 200, c.text);
  const id = c.json.thread.id;
  assert.deepEqual(c.json.thread.messages[0].images, [{ url: `/thread-media/${id}/m1-1.png`, name: 'm1-1.png', caption: 'my phone', w: 400, h: 300 }]);
  assert.equal((await req(`/thread-media/${id}/m1-1.png`)).status, 200);
  const w = cliAsync('thread', 'wait', '--as', 'lead', '--timeout', '30', '--quiet');
  await sleep(300);
  const rp = await userPost(`/api/threads/${id}/reply`, { text: 'and the end', images: [{ data: jpgBytes().toString('base64') }] });
  assert.equal(rp.status, 200, rp.text);
  const out = await w;
  assert.equal(out.code, 0, out.out);
  const dir = join(state, 'console', 'threads', id);
  assert.ok(out.stdout.includes(`[image 1: ${join(dir, 'm1-1.png')} "my phone"]`), out.stdout);
  assert.match(out.stdout, new RegExp(`#2 by user at \\S+:\\n {2}and the end\\n {2}\\[image 1: .*${id}/m2-1\\.jpg\\]`));
  // refused: not an image by content, bad base64, a video; the guards stay
  const svg = await userPost(`/api/threads/${id}/reply`, { text: 'x', images: [{ data: Buffer.from('<svg onload=alert(1)>').toString('base64') }] });
  assert.equal(svg.status, 409);
  assert.match(svg.json.error, /not a PNG, JPEG, WebP or GIF image/);
  assert.equal((await userPost(`/api/threads/${id}/reply`, { text: 'x', images: [{ data: '%%%' }] })).status, 409);
  assert.equal((await req(`/api/threads/${id}/reply`, { method: 'POST', body: { text: 'x', images: [{ data: pngBytes().toString('base64') }] } })).status, 403, 'no x-console');
  assert.equal(T_count(id), 2, 'nothing stored by the refused posts');
});
const T_count = (id) => JSON.parse(readFileSync(join(state, 'console', 'threads', `${id}.json`), 'utf8')).messages.length;

// ---- I-090 (user T-043): comments on console items --------------------------------------------------------------------

test('I-090: every page loads the comment script with its name; /console-comments.js served; GET /api/comments gives the markers', async () => {
  for (const [p, name] of [['/', 'steps'], ['/status', 'status'], ['/progress', 'progress'], ['/build', 'build'], ['/threads', 'threads'], ['/proposals', 'proposals']]) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
    assert.ok(r.text.includes(`<script src="/console-comments.js" data-page="${name}" defer></script>`), p);
  }
  const js = await req('/console-comments.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /^text\/javascript/);
  assert.match(js.text, /Your comment goes to: /);
  assert.equal((await req('/api/comments?page=admin')).status, 400);
  assert.equal((await req('/api/comments')).status, 400);
  const m = await req('/api/comments?page=status');
  assert.equal(m.status, 200);
  assert.deepEqual(m.json, { page: 'status', items: {} });
});

test('I-090: POST /api/comments starts a thread with the anchor; the lead\'s thread wait wakes and names the item; guards and anchor checks refuse', async () => {
  cli('thread', 'wait', '--as', 'lead', '--timeout', '1', '--quiet'); // take what earlier tests left unread
  const w = cliAsync('thread', 'wait', '--as', 'lead', '--timeout', '30', '--quiet');
  await sleep(300);
  const anchor = { page: 'status', item: 'status:cd-strip', quote: 'waiting for:\nthe phone', label: 'Countdown strips' };
  const c = await userPost('/api/comments', { anchor, text: 'Why is this still waiting?' });
  assert.equal(c.status, 200, c.text);
  const t = c.json.thread;
  assert.equal(t.title, 'Comment on status cd-strip "Countdown strips": Why is this still waiting?');
  assert.deepEqual(t.anchor, { page: 'status', item: 'status:cd-strip', quote: 'waiting for: the phone', label: 'Countdown strips', url: '/status#cd-strip', itemText: 'status cd-strip' });
  assert.deepEqual(t.to, ['lead']);
  const out = await w;
  assert.equal(out.code, 0, out.out);
  assert.match(out.stdout, new RegExp(`NEW ${t.id} "Comment on status cd-strip[^\\n]*#1 by user at \\S+:\\n {2}\\(comment on status cd-strip \\(/status#cd-strip\\): "waiting for: the phone"\\)\\n {2}Why is this still waiting\\?`));
  // the markers, the thread page API, thread show
  const m = await req('/api/comments?page=status');
  assert.deepEqual(m.json.items['status:cd-strip'], { count: 1, open: 1, threads: [{ id: t.id, state: 'open' }] });
  assert.deepEqual((await req(`/api/threads/${t.id}`)).json.thread.anchor, t.anchor);
  assert.ok((await req('/api/threads')).json.threads.find((x) => x.id === t.id).anchor);
  assert.match(cli('thread', 'show', t.id).stdout, /^ {2}\(comment on status cd-strip \(\/status#cd-strip\): "waiting for: the phone"\)$/m);
  // refused: no x-console, a foreign origin, a bad anchor, an empty comment, a big body, a foreign host; nothing stored
  const n = (await req('/api/threads')).json.threads.length;
  assert.equal((await req('/api/comments', { method: 'POST', body: { anchor, text: 'x' } })).status, 403);
  const port = new URL(base).port;
  assert.equal((await userPost('/api/comments', { anchor, text: 'x' }, { origin: 'http://evil.invalid' })).status, 403);
  for (const [a, re] of [[{ page: 'status', item: 'status:../x' }, /not an item of the status page/], [{ page: 'admin', item: 'x' }, /anchor\.page must be one of/], [undefined, /anchor must be an object/]]) {
    const r = await userPost('/api/comments', { anchor: a, text: 'x' });
    assert.equal(r.status, 409, JSON.stringify(a));
    assert.match(r.json.error, re);
  }
  assert.match((await userPost('/api/comments', { anchor, text: '  ' })).json.error, /empty/);
  assert.equal((await userPost('/api/comments', { anchor, text: 'x'.repeat(70 * 1024) })).status, 413);
  assert.equal((await req('/api/comments', { method: 'POST', body: { anchor, text: 'x' }, headers: { 'x-console': '1', host: `evil.invalid:${port}` } })).status, 421);
  assert.equal((await req('/api/threads')).json.threads.length, n, 'nothing stored by the refused posts');
  assert.equal((await userPost('/api/comments', { anchor, text: 'again' }, { origin: `http://localhost:${port}` })).status, 200, 'its own origin is fine');
  assert.equal((await req('/api/comments?page=status')).json.items['status:cd-strip'].count, 2);
});

// ---- T-050 (user): routing, listening, the "For the lead" tick ----------------------------------------------------
test('T-050: the API names who listens (toState, backstopMin); a message ticked "For the lead" wakes `thread wait --as lead --triage`; desk and topic CLI', async () => {
  const c = await userPost('/api/threads', { title: 'Routing check', text: 'First', forLead: true });
  const id = c.json.thread.id;
  assert.deepEqual(c.json.thread.toState, [{ name: 'lead', listening: true, how: 'lead' }]);
  assert.equal(cli('thread', 'assign', id, '--to', 'fix-gone', '--by', 'lead').code, 0);
  const row = (await req('/api/threads')).json.threads.find((t) => t.id === id);
  assert.deepEqual(row.toState.map((x) => [x.name, x.listening]), [['lead', true], ['fix-gone', false]]);
  assert.equal(row.backstopMin, 10);
  const w = await cliAsync('thread', 'wait', '--as', 'lead', '--triage', '--timeout', '20', '--quiet');
  assert.equal(w.code, 0, w.stderr);
  assert.match(w.stdout, new RegExp(`TRIAGE ${id} "Routing check": #1 for the lead`));
  assert.match(w.stdout, new RegExp(`NEW ${id} "Routing check" #1 by user \\(for the lead\\) at `));
  assert.match(w.stdout, /Re-arm: node tools\/console\.mjs thread wait --as lead --triage/);
  const r = await userPost(`/api/threads/${id}/reply`, { text: 'Second', forLead: true });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(readFileSync(join(state, 'console', 'threads', `${id}.json`), 'utf8')).messages[1].forLead, true);
  assert.match(cli('thread', 'list').stdout, new RegExp(`${id} .*-> fix-gone \\(not listening\\): Routing check`));
  // desk and topic map: the lead only
  assert.equal(cli('thread', 'desk', 'set', 'desk-a', '--by', 'fix-gone').code, 1);
  assert.match(cli('thread', 'desk', 'set', 'desk-a', '--by', 'lead').stdout, /^DESK desk-a: desk-a, not listening: the lead is the desk/);
  assert.match(cli('thread', 'topic', 'set', 'hero-exit', '--owner', 'fix-h', '--by', 'lead').stdout, /^TOPIC hero-exit -> fix-h/);
  assert.match(cli('thread', 'topic', 'list').stdout, /^hero-exit -> fix-h \(not listening\)/);
  assert.match(cli('thread', 'escalate', id, '--by', 'fix-gone', '--note', 'needs a decision').stdout, new RegExp(`^ESCALATED ${id}`));
  assert.match(cli('thread', 'desk', 'set', '--clear', '--by', 'lead').stdout, /^DESK cleared/);
});

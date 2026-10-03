// T-048 (user: talk inside a proposal to clarify questions), end to end on the real server and CLI:
// `console.mjs serve --port 0` on a temp $FW_STATE_DIR with a proposal by de-hero; the proposals page rendered by
// tests/fixtures/page-dom.mjs (its own scripts and console-comments.js, fetch to the server). The user asks under the
// proposal -> a thread anchored on it, assigned to the author -> the author's `thread wait` wakes, `proposal talk`
// shows it -> the author answers with `thread reply` -> the page shows the answer and the user replies in place.
// No port 5173 or 5559. Fake names only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';
import { loadPage } from '../fixtures/page-dom.mjs';

const CON = tool('console.mjs');
let env, srv, base;
const ok = (r) => { assert.equal(r.code, 0, r.stdout + r.stderr); return r; };
const json = async (path) => (await fetch(new URL(path, base))).json();

before(async () => {
  env = { FW_STATE_DIR: tempDir('fw-talk-e2e-') };
  const src = tempDir('fw-talk-e2e-src-');
  writePng(join(src, 'a-0.png'), 8, 6, [10, 20, 30]);
  writePng(join(src, 'b-0.png'), 8, 6, [10, 20, 30], [250, 250, 250]);
  writeFileSync(join(src, 'p.json'), JSON.stringify({
    schema: 'fw-proposal/1', title: 'Hero glow as a pre-rendered image', area: 'hero', topic: 'style-recalc-r4',
    problem: 'Every scroll frame restyles 412 elements.', idea: 'Draw the glow once into an image.',
    looksSame: 'The glow is static while you scroll.', visualDiff: ['The glow no longer follows the cursor.'],
    gain: [{ what: 'Elements restyled per frame', before: '412', after: '38', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' }],
    risk: 'A design change needs a new image.',
    compare: { a: { label: 'Original', url: 'https://localhost:5612/' }, b: { label: 'PoC', url: 'https://localhost:5613/' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'b-0.png' }], view: 'blink' },
  }));
  ok(node(CON, ['proposal', 'post', '--by', 'de-hero', '--file', join(src, 'p.json')], { env, cwd: src }));
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('the user asks under a proposal; the author is woken, reads it with proposal talk, answers; the page shows it and the user replies there', async () => {
  // the page: sections are anchors of their own, the card names who reads a comment, the talk box is there
  let p = await loadPage(base, '/proposals', { hash: '#PR-001' });
  let doc = p.document;
  const items = doc.querySelectorAll('[data-anchor]').map((n) => n.getAttribute('data-anchor'));
  for (const it of ['PR-001/section:problem', 'PR-001/section:idea', 'PR-001/section:gain', 'PR-001/section:risk']) assert.ok(items.includes(it), `${it} in ${items.join(', ')}`);
  assert.equal(doc.querySelector('article.detail').getAttribute('data-comment-to'), 'de-hero, lead');
  const talk = doc.getElementById('talk');
  assert.match(talk.textContent, /Questions and answers/);
  assert.match(talk.textContent, /A question is not a decision: nothing changes until you accept, reject or request a change below\./);
  assert.match(talk.textContent, /Goes to: de-hero, lead/);
  // ask
  const ask = talk.querySelector('textarea.talk-ask');
  ask.value = 'What does 412 mean here?';
  p.fire(ask, 'input');
  p.fire([...talk.querySelectorAll('button')].find((b) => b.textContent === 'Ask'), 'click');
  await p.settle(300);
  const sent = p.calls.find((c) => c.init?.method === 'POST' && String(c.url).endsWith('/api/comments'));
  assert.ok(sent, 'posted to /api/comments');
  assert.deepEqual(JSON.parse(sent.init.body).anchor, { page: 'proposals', item: 'PR-001', label: 'Hero glow as a pre-rendered image' });
  // the store: one thread on PR-001, assigned to the author at once
  let v = (await json('/api/proposals/PR-001/talk')).talk;
  assert.equal(v.threads.length, 1);
  const tid = v.threads[0].id;
  assert.deepEqual(v.threads[0].assignees, ['de-hero']);
  assert.deepEqual(v.threads[0].to, ['lead', 'de-hero']);
  // the list carries the count for the chip
  const lp = (await json('/api/proposals')).proposals.find((x) => x.id === 'PR-001');
  assert.deepEqual(lp.talk, { count: 1, open: 1, waiting: 1, unread: 0, yourTurn: 0 });
  // the author's wait wakes on it; another agent's does not
  const w = ok(node(CON, ['thread', 'wait', '--as', 'de-hero', '--timeout', '5'], { env }));
  assert.match(w.stdout, /What does 412 mean here\?/);
  assert.equal(node(CON, ['thread', 'wait', '--as', 'fix-other', '--timeout', '1'], { env }).code, 3, 'an agent not on it is not woken (TIMEOUT)');
  // the author's view and answer
  const t1 = ok(node(CON, ['proposal', 'talk', 'PR-001', '--as', 'de-hero'], { env }));
  assert.match(t1.stdout, /^PR-001 "Hero glow as a pre-rendered image" by de-hero/);
  assert.match(t1.stdout, /What does 412 mean here\?/);
  assert.match(t1.stdout, /thread reply <T-id> --by de-hero/);
  assert.match(ok(node(CON, ['proposal', 'talk', '--unanswered'], { env })).stdout, /^PR-001 {2}1 thread\(s\), 1 waiting for an answer/m);
  ok(node(CON, ['thread', 'reply', tid, '--by', 'de-hero', '--text', 'Elements restyled in each frame; 38 after the change.'], { env }));
  assert.match(ok(node(CON, ['proposal', 'talk', '--unanswered'], { env })).stdout, /no questions waiting for an answer/);
  // the page shows the answer under the proposal, with a reply box
  p = await loadPage(base, '/proposals', { hash: '#PR-001' });
  doc = p.document;
  const box = doc.getElementById('talk');
  assert.match(box.textContent, /de-hero · .*Elements restyled in each frame; 38 after the change\./);
  assert.ok(p.calls.some((c) => c.init?.method === 'POST' && String(c.url).endsWith(`/api/threads/${tid}/read`)), 'seen here: marked read');
  const ta = box.querySelector('textarea.talk-in');
  ta.value = 'Thanks, and on the phone?';
  p.fire([...box.querySelectorAll('button')].find((b) => b.textContent === 'Send'), 'click');
  await p.settle(300);
  v = (await json('/api/proposals/PR-001/talk')).talk;
  assert.deepEqual(v.threads[0].messages.map((m) => m.by), ['user', 'de-hero', 'user']);
  assert.equal(v.threads[0].messages[2].text, 'Thanks, and on the phone?');
  // a question changed nothing in the decision
  const pr = (await json('/api/proposals/PR-001')).proposal;
  assert.equal(pr.state, 'proposed');
  assert.equal(pr.rev, 1);
});

test('a Comment on a section of the proposal goes to the author too, with the section named', async () => {
  const p = await loadPage(base, '/proposals', { hash: '#PR-001' });
  const doc = p.document;
  const gain = doc.querySelector('[data-anchor="PR-001/section:gain"]');
  p.fire(gain.querySelector('h3'), 'mouseover');
  p.fire(doc.querySelector('.cmt-btn'), 'click');
  const box = doc.querySelector('.cmt-box');
  assert.equal(box.querySelector('.cmt-what').textContent, 'Comment on What it saves');
  assert.equal(box.querySelector('.cmt-to').textContent, 'Your comment goes to: de-hero, lead');
  box.querySelector('textarea').value = 'Is 38 measured?';
  p.fire(box.querySelector('.cmt-send'), 'click');
  await p.settle(300);
  const v = (await json('/api/proposals/PR-001/talk')).talk;
  const t = v.threads.find((x) => x.anchor?.item === 'PR-001/section:gain');
  assert.ok(t, 'a thread on the section');
  assert.deepEqual(t.assignees, ['de-hero']);
  assert.equal(t.anchor.itemText, 'PR-001, what it saves');
  assert.match(ok(node(CON, ['proposal', 'talk', 'PR-001'], { env })).stdout, /comment on PR-001, what it saves/);
});

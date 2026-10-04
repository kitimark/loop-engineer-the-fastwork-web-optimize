// I-096 (user T-043 #6: comments worked only inside a thread): every console page, rendered whole. The real server
// (`console.mjs serve --port 0` on a temp $FW_STATE_DIR with a step, a status row, a thread and a proposal) serves each
// page; tests/fixtures/page-dom.mjs parses it, runs its scripts against the server and runs /console-comments.js on
// top. Checks per page: the items carry anchors of the page's own pattern, every visible text on the page sits inside
// a commentable item (the page itself is the fallback, "part:page"), and pointing at text shows the Comment button;
// a comment sent from a page part reaches the store with the pointed-at text as its quote.
// No port 5173 or 5559. Fake names only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';
import { loadPage } from '../fixtures/page-dom.mjs';
import { normAnchor } from '../../tools/lib/console-comments.mjs';

const CON = tool('console.mjs');
let state, env, srv, base;

before(async () => {
  state = tempDir('fw-anchors-e2e-');
  env = { FW_STATE_DIR: state };
  const ok = (r) => assert.equal(r.code, 0, r.stdout + r.stderr);
  ok(node(CON, ['post', '--by', 'fix-probe', '--kind', 'question', '--title', 'Which page follows your finger better?'], { env }));
  ok(node(tool('status.mjs'), ['set', 'cd-strip', '--by', 'fix-cd-strip', '--kind', 'fix', '--title', 'Countdown strips', '--state', 'implementing', '--note', 'building the strip'], { env }));
  ok(node(CON, ['thread', 'new', '--by', 'lead', '--title', 'Why does the hero stutter?', '--text', 'A first answer.'], { env }));
  const src = tempDir('fw-anchors-e2e-src-');
  writePng(join(src, 'a-0.png'), 8, 6, [10, 20, 30]);
  writePng(join(src, 'b-0.png'), 8, 6, [10, 20, 30], [250, 250, 250]);
  const p = {
    schema: 'fw-proposal/1', title: 'Hero glow as a pre-rendered image', area: 'hero', topic: 'style-recalc-r4',
    problem: 'Every scroll frame restyles 412 elements.', idea: 'Draw the glow once into an image.',
    looksSame: 'The glow is static while you scroll.', visualDiff: ['The glow no longer follows the cursor.'],
    gain: [{ what: 'Elements restyled per frame', before: '412', after: '38', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' }],
    risk: 'A design change needs a new image.',
    live: { none: 'Test fixture: no page to try.' }, // I-109
    compare: { a: { label: 'Original', url: 'https://localhost:5612/' }, b: { label: 'PoC', url: 'https://localhost:5613/' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'b-0.png' }], view: 'blink' },
  };
  writeFileSync(join(src, 'p.json'), JSON.stringify(p));
  ok(node(CON, ['proposal', 'post', '--by', 'de-hero', '--file', join(src, 'p.json')], { env, cwd: src }));
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

const PAGES = [
  // [path, hash, page name, an item it must show, the page's own title]
  ['/', '', 'steps', 'step:C-001', 'Your steps'],
  ['/status', '', 'status', 'status:cd-strip', 'Who is doing what'],
  ['/progress', '', 'progress', null, 'Fix progress'],
  ['/build', '', 'build', null, 'Today’s best build'],
  ['/proposals', '', 'proposals', 'PR-001', 'Proposals'],
  ['/proposals', '#PR-001', 'proposals', 'PR-001/shot:1', null],
  ['/threads', '', 'threads', 'thread:T-001', 'Threads'],
  ['/threads', '#T-001', 'threads', 'thread:T-001/msg:1', null],
];
const valid = (page, item) => { try { normAnchor({ page, item }); return true; } catch { return false; } };

/** Every visible text under the page's .wrap whose nearest anchor is missing or not of this page's pattern. */
function uncovered(doc, page) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) {
        if (!c.data.trim()) continue;
        const a = c.parentNode.closest('[data-anchor]');
        if (!a || !valid(page, a.getAttribute('data-anchor'))) out.push(`${c.parentNode.tagName}: ${c.data.trim().slice(0, 50)}`);
        continue;
      }
      if (c.nodeType !== 1 || c.hidden || c.hasAttribute('data-no-comment') || ['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION'].includes(c.tagName)) continue;
      walk(c);
    }
  };
  walk(doc.querySelector('.wrap'));
  return out;
}

for (const [path, hash, page, item, title] of PAGES) {
  test(`${path}${hash}: items anchored with ${page} ids, every visible text commentable, pointing at it shows Comment`, async () => {
    const p = await loadPage(base, path, { hash });
    const doc = p.document;
    assert.ok(p.window.ConsoleComments, 'console-comments.js runs on the page');
    assert.equal(p.window.ConsoleComments.page, page);
    const items = doc.querySelectorAll('[data-anchor]').map((n) => n.getAttribute('data-anchor'));
    assert.ok(items.length > 0, 'the page has commentable items');
    for (const it of items) assert.ok(valid(page, it), `${it} is an item of the ${page} page`);
    if (item) assert.ok(items.some((it) => it.startsWith(item)), `${item} is commentable (got ${items.join(', ')})`);
    assert.deepEqual(uncovered(doc, page), [], 'every visible text sits inside a commentable item');
    // pointing at the page's title: the Comment button, and the box names the page
    const h1 = doc.querySelector('h1');
    p.fire(h1, 'mouseover');
    const btn = doc.querySelector('.cmt-btn');
    assert.equal(btn.hidden, false, 'hovering the title shows Comment');
    if (title) {
      p.fire(btn, 'click');
      const box = doc.querySelector('.cmt-box');
      assert.equal(box.hidden, false);
      assert.equal(box.querySelector('.cmt-what').textContent, `Comment on ${title}`);
      assert.equal(box.querySelector('.cmt-quote').textContent, title, 'the pointed-at text is the quote');
      p.fire(box.querySelector('.cmt-cancel'), 'click');
    }
  });
}

test('a comment sent from a page part: a thread with {page, item: part:page, quote: the pointed-at text, label}; its marker sits in the header', async () => {
  const p = await loadPage(base, '/status');
  const doc = p.document;
  const filters = doc.getElementById('fgroup');
  const target = filters.querySelector('button');
  p.fire(target, 'mouseover');
  const btn = doc.querySelector('.cmt-btn');
  assert.equal(btn.hidden, false);
  p.fire(btn, 'click');
  const box = doc.querySelector('.cmt-box');
  assert.match(box.querySelector('.cmt-quote').textContent, /^Show by state:/, 'the quote is the pointed-at block, not the whole page');
  box.querySelector('textarea').value = 'What does "Not started" mean?';
  p.fire(box.querySelector('.cmt-send'), 'click');
  await p.settle(300);
  const post = p.calls.find((c) => c.init?.method === 'POST');
  assert.ok(post, 'sent');
  const sent = JSON.parse(post.init.body);
  assert.equal(sent.anchor.page, 'status');
  assert.equal(sent.anchor.item, 'part:page');
  assert.equal(sent.anchor.label, 'Who is doing what');
  assert.match(sent.anchor.quote, /^Show by state:/);
  const list = await (await fetch(new URL('/api/threads', base))).json();
  const t = list.threads.find((x) => x.anchor?.item === 'part:page');
  assert.ok(t, 'stored as a thread with its anchor');
  assert.equal(t.anchor.url, '/status');
  // the marker for the page part goes into the page header, not into a row's slot
  await p.window.ConsoleComments.load();
  const marker = doc.querySelector('.cmt-marker');
  assert.ok(marker, 'a marker');
  assert.equal(marker.parentNode.tagName, 'HEADER');
  assert.equal(marker.getAttribute('href'), `/threads#${t.id}`);
});

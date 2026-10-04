// I-090 (user T-043, "comments like Claude artifacts"): comments on console items. The anchor model
// (tools/lib/console-comments.mjs: pages, item id allowlist, caps, the link back, markers), the store (a comment is a
// thread that carries its anchor, console-threads.mjs), and the browser side (tools/lib/console-comments.js) on a tiny
// fake DOM: the Comment button on hover / click / selection, the box ("Your comment goes to: lead"), the POST, the
// markers with their counts. Every test uses its own $FW_STATE_DIR. Fake addresses only (192.168.77.12).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { tempDir, TOOLS } from '../helpers.mjs';

const C = await import('../../tools/lib/console-comments.mjs');
const T = await import('../../tools/lib/console-threads.mjs');
let state;
beforeEach(() => { state = tempDir('fw-comments-'); process.env.FW_STATE_DIR = state; });

test('anchor model: known pages, an allowlisted item id per page, caps; anything else refused', () => {
  const ok = [
    ['steps', 'step:C-032'], ['proposals', 'PR-009'], ['proposals', 'PR-009/option:both'], ['proposals', 'PR-009/option:both/shot:2'],
    ['proposals', 'PR-009/video:b'], ['proposals', 'PR-012/option:gpu-roll.v2/video:both'], ['status', 'status:cd-strip'],
    ['progress', 'progress:style-recalc'], ['build', 'progress:hero-exit'], ['threads', 'thread:T-003'], ['threads', 'thread:T-003/msg:4'],
    ['agents', 'agent:wi-stack'], ['agents', 'agent:mgmt-ops-10'], ['agents', 'part:page'], // I-118
  ];
  for (const [page, item] of ok) assert.deepEqual(C.normAnchor({ page, item }), { page, item }, `${page} ${item}`);
  const bad = [
    [{ page: 'admin', item: 'step:C-1' }, /anchor\.page must be one of/],
    [{ page: 'steps', item: 'PR-009' }, /not an item of the steps page/],
    [{ page: 'steps', item: 'step:C-032 ' }, /not an item/],
    [{ page: 'proposals', item: 'PR-009/option:Both' }, /not an item/],
    [{ page: 'proposals', item: 'PR-009/shot:2/option:x' }, /not an item/],
    [{ page: 'status', item: 'status:../../etc' }, /not an item/],
    [{ page: 'status', item: `status:${'a'.repeat(200)}` }, /not an item/],
    [{ page: 'threads', item: 'thread:T-1/msg:1/x' }, /not an item/],
    [{ page: 'threads', item: 7 }, /not an item/],
    [{ page: 'agents', item: 'agent:../x' }, /not an item/], [{ page: 'agents', item: 'agent:a b' }, /not an item/],
    [{ page: 'agents', item: 'status:cd-strip' }, /not an item/],
    [{ page: 'steps', item: 'step:C-1', quote: { x: 1 } }, /anchor\.quote must be text/],
    [null, /anchor must be an object/], [['steps'], /anchor must be an object/],
  ];
  for (const [a, re] of bad) assert.throws(() => C.normAnchor(a), re, JSON.stringify(a));
  const long = C.normAnchor({ page: 'status', item: 'status:cd-strip', quote: `a\nb c ${'x'.repeat(400)}`, label: ' Countdown\tstrips ' });
  assert.equal(long.quote.length, C.LIMITS.quote);
  assert.ok(long.quote.startsWith('a b c x') && long.quote.endsWith('…'), 'one plain line, cut with …');
  assert.equal(long.label, 'Countdown strips');
  assert.deepEqual(Object.keys(C.normAnchor({ page: 'steps', item: 'step:C-1', quote: '  ', label: '' })), ['page', 'item'], 'empty quote and label are left out');
});

test('anchor model: the link back, the words for the item, the thread title', () => {
  const u = (page, item) => C.anchorUrl({ page, item });
  assert.equal(u('steps', 'step:C-032'), '/#C-032');
  assert.equal(u('proposals', 'PR-009/option:both/shot:2'), '/proposals#PR-009');
  assert.equal(u('status', 'status:cd-strip'), '/status#cd-strip');
  assert.equal(u('progress', 'progress:style-recalc'), '/progress#style-recalc');
  assert.equal(u('build', 'progress:hero-exit'), '/build#hero-exit');
  assert.equal(u('threads', 'thread:T-003/msg:4'), '/threads#T-003');
  assert.equal(u('agents', 'agent:wi-stack'), '/agent/wi-stack'); // I-118
  assert.equal(u('agents', 'part:page'), '/agents');
  assert.equal(u('steps', 'javascript:alert(1)'), null);
  assert.equal(C.itemText({ page: 'proposals', item: 'PR-009/option:both/shot:2' }), 'PR-009 option both, shot 2');
  assert.equal(C.itemText({ page: 'threads', item: 'thread:T-003/msg:4' }), 'T-003 #4');
  assert.equal(C.itemText({ page: 'status', item: 'status:cd-strip' }), 'status cd-strip');
  assert.equal(C.commentTitle({ page: 'steps', item: 'step:C-032', label: 'Swipe A/B' }, 'the second\none felt slower'),
    'Comment on C-032 "Swipe A/B": the second one felt slower');
  assert.ok(C.commentTitle({ page: 'steps', item: 'step:C-1' }, 'x'.repeat(500)).length <= 160);
  assert.deepEqual(C.anchorView({ page: 'steps', item: 'step:C-1' }), { page: 'steps', item: 'step:C-1', url: '/#C-1', itemText: 'C-1' });
  assert.equal(C.anchorView(undefined), undefined);
});

test('markers: counts per item on one page, open vs closed, newest last; proposal sub-items count for the proposal', () => {
  const th = (id, page, item, status = 'open') => ({ id, status, anchor: { page, item } });
  const list = [th('T-001', 'proposals', 'PR-009/option:both/shot:2'), th('T-002', 'proposals', 'PR-009', 'closed'),
    th('T-003', 'steps', 'step:C-1'), { id: 'T-004', status: 'open' }, th('T-005', 'proposals', 'PR-009/option:both/shot:2'),
    th('T-006', 'proposals', 'step:C-1')];
  const m = C.markersFor('proposals', list, (t) => `s-${t.status}`);
  assert.deepEqual(Object.keys(m.items).sort(), ['PR-009', 'PR-009/option:both/shot:2']);
  assert.deepEqual(m.items['PR-009/option:both/shot:2'], { count: 2, open: 2, threads: [{ id: 'T-001', state: 's-open' }, { id: 'T-005', state: 's-open' }] });
  assert.deepEqual(m.items['PR-009'].threads.map((t) => t.id), ['T-001', 'T-002', 'T-005']);
  assert.equal(m.items['PR-009'].open, 2);
  assert.deepEqual(C.markersFor('steps', list).items, { 'step:C-1': { count: 1, open: 1, threads: [{ id: 'T-003', state: 'open' }] } });
  assert.deepEqual(C.markersFor('status', list).items, {});
});

test('store: a comment is a user thread with its anchor; plain threads keep their exact shape; agents cannot set one', async () => {
  const anchor = { page: 'proposals', item: 'PR-009/option:both/shot:2', quote: 'the blur\nedge', label: 'Blur the strip' };
  const { thread } = await T.createThread({ title: C.commentTitle(C.normAnchor(anchor), 'Looks soft on 192.168.77.12'), text: 'Looks soft on 192.168.77.12', fromPage: true, anchor });
  const raw = JSON.parse(readFileSync(join(state, 'console', 'threads', `${thread.id}.json`), 'utf8'));
  assert.deepEqual(raw.anchor, { page: 'proposals', item: 'PR-009/option:both/shot:2', quote: 'the blur edge', label: 'Blur the strip' });
  assert.equal(raw.messages[0].text, 'Looks soft on 192.168.77.12', 'the user text as typed (local store)');
  assert.equal(raw.title, 'Comment on PR-009 option both, shot 2 "Blur the strip": Looks soft on 192.168.77.12');
  const view = T.pageThread(T.getThread(thread.id));
  assert.deepEqual(view.anchor, { ...raw.anchor, url: '/proposals#PR-009', itemText: 'PR-009 option both, shot 2' });
  assert.deepEqual(T.summary(T.getThread(thread.id)).anchor, view.anchor);
  const plain = (await T.createThread({ title: 'x', text: 'y', fromPage: true })).thread;
  const rawPlain = JSON.parse(readFileSync(join(state, 'console', 'threads', `${plain.id}.json`), 'utf8'));
  assert.ok(!('anchor' in rawPlain) && !('anchor' in T.pageThread(rawPlain)) && !('anchor' in T.summary(rawPlain)), 'no anchor key without one');
  await assert.rejects(T.createThread({ title: 'x', text: 'y', fromPage: true, anchor: { page: 'steps', item: 'PR-1' } }), /not an item of the steps page/);
  await assert.rejects(T.createThread({ title: 'x', text: 'y', by: 'lead', anchor }), /only the user's comments carry an anchor/);
  assert.equal(T.listThreads().length, 2, 'nothing stored by the refused ones');
  // the lead's wait: the comment wakes it and names the item and the quote
  const w = T.threadWaitCondition({ as: 'lead' }).check();
  assert.ok(w.met);
  const news = JSON.parse(w.detail);
  assert.deepEqual(news.map((n) => [n.id, !!n.anchor]), [[thread.id, true], [plain.id, false]]);
  const txt = T.newsText(news[0], 'lead');
  assert.match(txt, new RegExp(`${thread.id} .*Comment on PR-009`));
  assert.match(txt, /comment on PR-009 option both, shot 2 \(\/proposals#PR-009\): "the blur edge"/);
});

test('pages: every console page marks its items with an anchor id of its own page\'s pattern', () => {
  const want = {
    'console-page.html': [/'data-anchor': \/\^C-\\d\{1,6\}\$\/\.test\(s\.id\) \? 'step:' \+ s\.id : null/],
    'status-page.html': [/'data-anchor': SLUG\.test\(v\.id\) \? 'status:' \+ v\.id : null/, /'data-comment-slot': true/],
    'progress-page.html': [/'data-anchor': anchorId\(it\.id\)/, /'data-anchor': anchorId\(a\.id\)/, /\? 'progress:' \+ id : null/],
    'proposals-page.html': [/'data-anchor': \/\^PR-\\d\{1,6\}\$\/\.test\(p\.id\) \? p\.id : null/, /p\.id \+ '\/option:' \+ o\.name/, /an \+ '\/shot:' \+ \(i \+ 1\)/, /an \+ '\/video:both'/],
    'threads-page.html': [/'thread:' \+ t\.id \+ '\/msg:' \+ x\.n/, /id="tv-anchor"/],
  };
  // I-096: the list lines too (proposals, threads, "Waiting on you"), and every page's wrapper as its fallback
  want['proposals-page.html'].push(/href: '#' \+ p\.id, 'data-anchor': \/\^PR-\\d\{1,6\}\$\/\.test\(p\.id\) \? p\.id : null/);
  want['threads-page.html'].push(/li\.setAttribute\('data-anchor', 'thread:' \+ t\.id\)/, /<form id="new-form"[^>]* data-no-comment>/, /<form class="card" id="reply-form"[^>]* data-no-comment>/);
  want['status-page.html'].push(/ul\.appendChild\(el\('li', \{ 'data-anchor': SLUG\.test\(x\.id\) \? 'status:' \+ x\.id : null/);
  for (const [f, res] of Object.entries(want)) {
    const html = readFileSync(join(TOOLS, 'lib', f), 'utf8');
    for (const re of res) assert.match(html, re, f);
    assert.match(html, /<div class="wrap" id="page-part" data-anchor="part:page" data-anchor-label="[^"]+">[^\n]*\n {2}<header data-comment-slot>/, `${f}: the page is its own fallback anchor`);
  }
  const css = readFileSync(join(TOOLS, 'lib', 'console-nav.css'), 'utf8');
  for (const c of ['.cmt-btn', '.cmt-box', 'a.cmt-marker', '.cmt-note', '.cmt-list']) assert.ok(css.includes(c), c);
});

/** console-comments.js on a tiny fake DOM: elements with attributes, closest/querySelector for the few selectors it uses. */
function commentsPage({ page = 'steps', markers = {}, posted = { thread: { id: 'T-008', to: ['lead'] } }, build } = {}) {
  const matches = (n, sel) => sel.split(',').some((s) => {
    s = s.trim();
    if (s[0] === '.') return (n.className || '').split(/\s+/).includes(s.slice(1));
    if (s[0] === '[') return n.attrs && s.slice(1, -1) in n.attrs;
    return n.tagName === s;
  });
  class N {
    constructor(tag, attrs = {}, text = '') { this.tagName = tag; this.attrs = { ...attrs }; this.children = []; this.parentNode = null; this.listeners = {}; this._t = text; this.hidden = false; this.className = attrs.class || ''; this.style = {}; this.value = ''; this.nodeType = 1; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    get href() { return this.attrs.href; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matches(n, sel)) return n; return null; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
    querySelectorAll(sel) { return this.all().filter((n) => matches(n, sel)); }
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
    getBoundingClientRect() { return { top: 100, right: 400, bottom: 140, left: 20, width: 380 }; }
    focus() {}
  }
  const body = new N('body');
  const item = body.appendChild(new N('section', { 'data-anchor': 'step:C-032', 'data-anchor-label': 'Swipe A/B' }));
  const words = item.appendChild(new N('p', {}, 'Swipe the first page, then the second'));
  const own = item.appendChild(new N('button', {}, 'Start'));
  const other = body.appendChild(new N('section', { 'data-anchor': 'step:C-033' }));
  const otherWords = other.appendChild(new N('p', {}, 'Rate it'));
  const extra = build ? build(body, N) : {};
  const docListeners = {};
  const document = {
    body, readyState: 'complete', currentScript: new N('script', { 'data-page': page }), documentElement: { clientWidth: 1200 },
    createElement: (t) => new N(t), createTextNode: (t) => Object.assign(new N('#text', {}, t), { nodeType: 3 }),
    addEventListener: (e, f) => (docListeners[e] ||= []).push(f), visibilityState: 'visible',
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };
  // events bubble from the target to the document
  const fire = (target, type, extra = {}) => {
    const e = { type, target, preventDefault() {}, ...extra };
    for (let n = target; n; n = n.parentNode) for (const f of n.listeners?.[type] || []) f(e);
    for (const f of docListeners[type] || []) f(e);
  };
  const calls = [];
  const res = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (init?.method === 'POST') return posted.error ? res({ error: posted.error }, 409) : res(posted);
    return res({ page, items: markers });
  };
  let selection = null;
  const window = { scrollX: 0, scrollY: 0, getSelection: () => selection };
  const src = readFileSync(join(TOOLS, 'lib', 'console-comments.js'), 'utf8');
  new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', src)(window, document, fetch, setTimeout, clearTimeout, () => 0);
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 60)); };
  const select = (text, a = words, b = a) => { selection = { isCollapsed: !text, rangeCount: text ? 1 : 0, anchorNode: a, focusNode: b, toString: () => text, getRangeAt: () => ({ getBoundingClientRect: () => ({ top: 10, right: 300, width: 120 }) }) }; };
  return { ...extra, window, document, body, item, words, own, other, otherWords, fire, calls, settle, select, btn: () => body.querySelector('.cmt-btn'), box: () => body.querySelector('.cmt-box') };
}

test('console-comments.js: hover shows Comment; the box says who gets it; Send POSTs the anchor with x-console; the note names the thread', async () => {
  const p = commentsPage();
  await p.settle();
  assert.equal(p.window.ConsoleComments.page, 'steps');
  assert.equal(p.btn().hidden, true);
  p.fire(p.words, 'mouseover');
  assert.equal(p.btn().hidden, false);
  // I-103 (user T-056 #3): an icon, its name in aria-label and title (was the word "Comment")
  assert.equal(p.btn().textContent, '', 'icon only, no words');
  assert.equal(p.btn().getAttribute('aria-label'), 'Comment');
  assert.equal(p.btn().getAttribute('title'), 'Comment');
  p.fire(p.btn(), 'click');
  const box = p.box();
  assert.equal(box.hidden, false);
  assert.equal(box.querySelector('.cmt-what').textContent, 'Comment on Swipe A/B');
  assert.equal(box.querySelector('.cmt-to').textContent, 'Your comment goes to: lead');
  assert.equal(box.querySelector('.cmt-quote').hidden, true, 'no selection, no quote');
  p.fire(box.querySelector('.cmt-send'), 'click');
  assert.equal(box.querySelector('.cmt-msg').textContent, 'Write your comment first.');
  assert.equal(p.calls.filter((c) => c.init?.method === 'POST').length, 0);
  box.querySelector('textarea').value = '  The second one lagged  ';
  p.fire(box.querySelector('.cmt-send'), 'click');
  await p.settle();
  const post = p.calls.find((c) => c.init?.method === 'POST');
  assert.equal(post.url, '/api/comments');
  assert.equal(post.init.headers['x-console'], '1');
  assert.deepEqual(JSON.parse(post.init.body), { anchor: { page: 'steps', item: 'step:C-032', label: 'Swipe A/B' }, text: 'The second one lagged' });
  assert.equal(box.hidden, true);
  assert.equal(p.body.querySelector('.cmt-note').textContent, 'Sent to lead as T-008.');
  assert.ok(p.calls.filter((c) => c.url === '/api/comments?page=steps').length >= 2, 'markers reloaded after sending');
});

test('console-comments.js (T-048): an enclosing data-comment-to names who reads it (a proposal: its author, lead); its words only', async () => {
  const p = commentsPage({ page: 'proposals', build: (body, N) => {
    const card = body.appendChild(new N('article', { 'data-anchor': 'PR-004', 'data-anchor-label': 'Glow tiles', 'data-comment-to': 'de-glow, lead<b>' }));
    const sec = card.appendChild(new N('div', { 'data-anchor': 'PR-004/section:gain', 'data-anchor-label': 'What it saves' }));
    return { gain: sec.appendChild(new N('p', {}, '412 to 38 elements')) };
  } });
  await p.settle();
  p.fire(p.gain, 'mouseover');
  p.fire(p.btn(), 'click');
  const box = p.box();
  assert.equal(box.querySelector('.cmt-what').textContent, 'Comment on What it saves');
  assert.equal(box.querySelector('.cmt-to').textContent, 'Your comment goes to: de-glow, leadb', 'names only: no markup characters');
  p.fire(box.querySelector('.cmt-cancel'), 'click');
  // outside the card: back to the lead
  p.fire(p.words, 'mouseover');
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-to').textContent, 'Your comment goes to: lead');
});

test('console-comments.js: a selection inside one item becomes the quote; across two items, or on the item\'s own buttons, nothing', async () => {
  const p = commentsPage();
  await p.settle();
  p.select('  the second\n page ');
  p.fire(p.words, 'mouseup');
  await p.settle();
  assert.equal(p.btn().hidden, false);
  assert.equal(p.btn().getAttribute('aria-label'), 'Comment on the selection');
  assert.equal(p.btn().getAttribute('title'), 'Comment on the selection');
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-quote').textContent, 'the second page');
  p.box().querySelector('textarea').value = 'why?';
  p.fire(p.box().querySelector('.cmt-send'), 'click');
  await p.settle();
  assert.deepEqual(JSON.parse(p.calls.find((c) => c.init?.method === 'POST').init.body).anchor, { page: 'steps', item: 'step:C-032', quote: 'the second page', label: 'Swipe A/B' });
  // across two items: no single anchor
  const q = commentsPage();
  await q.settle();
  q.select('first … Rate', q.words, q.otherWords);
  q.fire(q.words, 'mouseup');
  await q.settle();
  assert.equal(q.btn().hidden, true);
  // text selected while typing in a field (a step's answer box) is no quote
  q.document.activeElement = { tagName: 'TEXTAREA' };
  q.select('my answer');
  q.fire(q.words, 'mouseup');
  await q.settle();
  assert.equal(q.btn().hidden, true);
  q.document.activeElement = null;
  // the item's own button works as before: a click on it shows no Comment button
  q.select('');
  q.fire(q.own, 'click');
  assert.equal(q.btn().hidden, true);
  q.fire(q.words, 'click');
  assert.equal(q.btn().hidden, false, 'a click on the item itself (touch) shows it');
  // Escape closes the box without sending
  q.fire(q.btn(), 'click');
  q.fire(q.box().querySelector('textarea'), 'keydown', { key: 'Escape' });
  assert.equal(q.box().hidden, true);
  assert.equal(q.calls.filter((c) => c.init?.method === 'POST').length, 0);
});

test('console-comments.js: markers show the count and link to the newest thread; a refused POST shows the server\'s words; unknown pages do nothing', async () => {
  const p = commentsPage({ markers: { 'step:C-032': { count: 2, open: 1, threads: [{ id: 'T-004', state: 'closed' }, { id: 'T-007', state: 'open' }] }, 'step:C-033': { count: 1, open: 1, threads: [{ id: 'javascript:x' }] } }, posted: { error: 'anchor.item is not an item of the steps page' } });
  await p.settle();
  const m = p.item.querySelector('.cmt-marker');
  assert.equal(m.textContent, '2 comments');
  assert.equal(m.getAttribute('href'), '/threads#T-007');
  assert.equal(m.title, 'Comments: T-004, T-007 (1 closed)');
  // I-156 (user T-137): with two threads the first one is reachable too: a list links to each
  const list = p.item.querySelector('.cmt-list');
  assert.deepEqual(list.querySelectorAll('a').map((a) => [a.textContent, a.getAttribute('href')]), [['T-004 (closed)', '/threads#T-004'], ['T-007', '/threads#T-007']]);
  assert.equal(list.textContent, 'T-004 (closed) · T-007');
  assert.equal(p.other.querySelector('.cmt-list'), null, 'one thread: the badge is enough');
  assert.equal(p.other.querySelector('.cmt-marker').getAttribute('href'), '/threads', 'a bad id is never put in a link');
  assert.equal(p.other.querySelector('.cmt-marker').textContent, '1 comment');
  p.window.ConsoleComments.apply();
  assert.equal(p.item.querySelectorAll('.cmt-marker').length, 1, 'applied twice, one marker');
  assert.equal(p.item.querySelectorAll('.cmt-list').length, 1, 'applied twice, one list');
  assert.equal(p.item.querySelector('.cmt-list'), list, 'unchanged threads: the same list node (no redraw loop)');
  p.window.ConsoleComments.open(p.item);
  p.box().querySelector('textarea').value = 'x';
  p.fire(p.box().querySelector('.cmt-send'), 'click');
  await p.settle();
  assert.equal(p.box().hidden, false, 'kept open with the text');
  assert.equal(p.box().querySelector('.cmt-msg').textContent, 'anchor.item is not an item of the steps page');
  const u = commentsPage({ page: 'admin' });
  await u.settle();
  assert.equal(u.window.ConsoleComments, undefined);
  assert.equal(u.calls.length, 0);
  const src = readFileSync(join(TOOLS, 'lib', 'console-comments.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(src), 'no HTML sinks');
  assert.ok(!/https?:\/\//.test(src), 'nothing external');
});

// ---- I-096 (user T-043 #6/#8: "comment anywhere"): every page part takes a comment ----

test('anchor model: "part:<slug>" on every page (the page itself), with its link and words; other parts refused', () => {
  for (const page of C.PAGES) {
    assert.deepEqual(C.normAnchor({ page, item: 'part:page' }), { page, item: 'part:page' }, page);
    assert.deepEqual(C.normAnchor({ page, item: 'part:waiting-on-you' }).item, 'part:waiting-on-you');
  }
  for (const item of ['part:', 'part:Page', 'part:a/b', 'part:page/msg:1', `part:${'a'.repeat(60)}`, 'parts:page']) assert.throws(() => C.normAnchor({ page: 'status', item }), /not an item/, item);
  assert.equal(C.anchorUrl({ page: 'status', item: 'part:page' }), '/status');
  assert.equal(C.anchorUrl({ page: 'steps', item: 'part:page' }), '/');
  assert.equal(C.anchorUrl({ page: 'build', item: 'part:page' }), '/build');
  assert.equal(C.itemText({ page: 'status', item: 'part:page' }), 'the Status page');
  assert.equal(C.itemText({ page: 'progress', item: 'part:right-now' }), 'Progress: right now');
  assert.equal(C.commentTitle({ page: 'status', item: 'part:page', label: 'Who is doing what' }, 'what is this?'), 'Comment on the Status page "Who is doing what": what is this?');
  assert.equal(C.markersFor('status', [{ id: 'T-001', status: 'open', anchor: { page: 'status', item: 'part:page' } }]).items['part:page'].count, 1);
});

/** A page wrapper "part:page" with a header slot, two plain lines, an item with its own slot, a text field, a form. */
function partPage(opts = {}) {
  return commentsPage({ page: 'status', ...opts, build: (body, N) => {
    const part = body.appendChild(new N('div', { class: 'wrap', 'data-anchor': 'part:page', 'data-anchor-label': 'Who is doing what' }));
    const header = part.appendChild(new N('header', { 'data-comment-slot': '' }));
    const h1 = header.appendChild(new N('h1', {}, 'Who is doing what'));
    const ul = part.appendChild(new N('ul'));
    const line1 = ul.appendChild(new N('li', {}, 'Countdown roll: you: C-033 swipe A/B'));
    const line2 = ul.appendChild(new N('li', {}, 'Hero fade: you: rate it'));
    const row = part.appendChild(new N('section', { 'data-anchor': 'status:cd-strip', 'data-anchor-label': 'Countdown strips' }));
    const rowSlot = row.appendChild(new N('div', { 'data-comment-slot': '' }));
    const rowWords = rowSlot.appendChild(new N('p', {}, 'building the strip'));
    const field = part.appendChild(new N('textarea'));
    const form = part.appendChild(new N('form', { 'data-no-comment': '' }));
    const formWords = form.appendChild(new N('p', {}, 'Your reply'));
    return { N, part, header, h1, line1, line2, row, rowSlot, rowWords, field, formWords };
  } });
}

test('console-comments.js: a line in a page part shows Comment by that line and goes as the quote; an item inside wins; typing fields and [data-no-comment] show nothing', async () => {
  const p = partPage();
  await p.settle();
  p.fire(p.line1, 'mouseover');
  assert.equal(p.btn().hidden, false, 'a plain line takes a comment');
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-what').textContent, 'Comment on Who is doing what');
  assert.equal(p.box().querySelector('.cmt-quote').textContent, 'Countdown roll: you: C-033 swipe A/B', 'the line pointed at is the quote');
  p.box().querySelector('textarea').value = 'what does this wait for?';
  p.fire(p.box().querySelector('.cmt-send'), 'click');
  await p.settle();
  assert.deepEqual(JSON.parse(p.calls.find((c) => c.init?.method === 'POST').init.body).anchor,
    { page: 'status', item: 'part:page', quote: 'Countdown roll: you: C-033 swipe A/B', label: 'Who is doing what' });
  // the next line in the same part: the button follows, the quote is that line
  p.fire(p.line2, 'mouseover');
  assert.equal(p.btn().hidden, false);
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-quote').textContent, 'Hero fade: you: rate it');
  p.fire(p.box().querySelector('.cmt-cancel'), 'click');
  // an item inside the part is a comment on that item, without a made-up quote
  p.fire(p.rowWords, 'mouseover');
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-what').textContent, 'Comment on Countdown strips');
  assert.equal(p.box().querySelector('.cmt-quote').hidden, true);
  p.fire(p.box().querySelector('.cmt-cancel'), 'click');
  // the user's own typing field and a [data-no-comment] form: nothing
  const q = partPage();
  await q.settle();
  q.fire(q.field, 'mouseover');
  assert.equal(q.btn().hidden, true, 'no Comment over a text field');
  q.fire(q.formWords, 'mouseover');
  assert.equal(q.btn().hidden, true, 'no Comment inside [data-no-comment]');
  q.fire(q.formWords, 'click');
  assert.equal(q.btn().hidden, true);
});

test('console-comments.js: the part\'s marker goes into its own slot (the header), not into an item\'s; a redrawn item is found again by its id', async () => {
  const p = partPage({ markers: { 'part:page': { count: 1, open: 1, threads: [{ id: 'T-009', state: 'open' }] }, 'status:cd-strip': { count: 2, open: 2, threads: [{ id: 'T-010' }, { id: 'T-011' }] } } });
  await p.settle();
  assert.equal(p.header.querySelector('.cmt-marker').textContent, '1 comment');
  assert.equal(p.rowSlot.querySelector('.cmt-marker').textContent, '2 comments');
  assert.equal(p.rowSlot.querySelectorAll('.cmt-marker').length, 1, 'the part\'s marker is not put into the row');
  // the page redraws the row between the hover and the click: the box opens on the new node
  p.fire(p.rowWords, 'mouseover');
  p.row.remove(); p.row.isConnected = false;
  p.part.appendChild(new p.N('section', { 'data-anchor': 'status:cd-strip', 'data-anchor-label': 'Countdown strips (new)' }));
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-what').textContent, 'Comment on Countdown strips (new)');
});

// ---- I-103 (user T-056): the Comment button covered PR-013 option B's "open in a new tab" link ----
// The button floated at the line's right end (top - 4, right - 90) over whatever sat there. Now it takes a spot that
// covers no other control (link, button, field, frame); the item it belongs to and its ancestors don't count.

/** The button's size like in the browser (console-nav.css: 34 x 34). */
function sized(N) {
  Object.defineProperty(N.prototype, 'offsetWidth', { get() { return (this.className || '').includes('cmt-btn') ? 34 : 0; } });
  Object.defineProperty(N.prototype, 'offsetHeight', { get() { return (this.className || '').includes('cmt-btn') ? 34 : 0; } });
}
/** The Try-it panel of a proposal option: a part with a bar of buttons, then two framed pages, each with a caption
 * line "B: proposal …" + "open in a new tab" and its frame. Rects are viewport boxes; `w` is the window width. */
function tryItPage(w) {
  return commentsPage({ page: 'proposals', build: (body, N) => {
    sized(N);
    const at = (n, left, right, top, bottom) => { n.getBoundingClientRect = () => ({ left, right, top, bottom, width: right - left, height: bottom - top }); return n; };
    const part = at(body.appendChild(new N('div', { 'data-anchor': 'part:page', 'data-anchor-label': 'Proposals' })), 0, w, 0, 1400);
    const bar = at(part.appendChild(new N('div')), 16, w - 16, 150, 186);
    at(bar.appendChild(new N('button', {}, 'Show A')), 16, 116, 150, 186);
    at(bar.appendChild(new N('button', {}, 'One at a time')), 124, 256, 150, 186);
    const pair = at(part.appendChild(new N('div')), 16, w - 16, 196, 1160);
    const fig = (x, label) => {
      const f = at(pair.appendChild(new N('figure')), x, x + 432, 200, 1155);
      const cap = at(f.appendChild(new N('figcaption')), x, x + 432, 200, 217);
      const words = at(cap.appendChild(new N('span', {}, label)), x, x + 232, 201, 216);
      const link = at(cap.appendChild(new N('a', { href: 'http://localhost:5301/', target: '_blank' }, 'open in a new tab')), x + 327, x + 432, 201, 216);
      const frame = at(f.appendChild(new N('iframe')), x, x + 432, 221, 1155);
      return { cap, words, link, frame };
    };
    return { part, A: fig(16, 'A: original'), B: fig(464, "B: proposal (A: keep st6-rb2's slider)") };
  } });
}
/** Where the button is now (viewport box), and every control it overlaps besides its own item's elements. */
function btnBox(p) {
  const b = p.btn();
  const left = parseFloat(b.style.left) - p.window.scrollX, top = parseFloat(b.style.top) - p.window.scrollY;
  return { left, top, right: left + b.offsetWidth, bottom: top + b.offsetHeight };
}
function covered(p, owner) {
  const r = btnBox(p);
  return p.body.querySelectorAll('a,button,input,textarea,select,summary,label,video,iframe')
    .filter((n) => n !== p.btn() && !n.contains(owner) && !(p.box() && p.box().contains(n)))
    .filter((n) => { const o = n.getBoundingClientRect(); return Math.min(r.right, o.right) > Math.max(r.left, o.left) && Math.min(r.bottom, o.bottom) > Math.max(r.top, o.top); })
    .map((n) => `${n.tagName} "${n.textContent}"`);
}

test('console-comments.js (I-103): the Comment button covers no other control: not the option\'s "open in a new tab" link, its frame or the bar; desktop and phone width', async () => {
  for (const w of [1200, 400]) {
    const p = tryItPage(w);
    p.document.documentElement.clientWidth = w;
    await p.settle();
    const lines = w === 400 ? [p.A] : [p.A, p.B]; // at phone width B is scrolled off to the right of the pair
    for (const f of lines) {
      for (const at of [f.words, f.cap]) {
        p.fire(at, 'mouseover');
        assert.equal(p.btn().hidden, false, `${w}px: Comment shows by the caption`);
        assert.deepEqual(covered(p, f.cap), [], `${w}px: the button covers no other control (hovering ${at.tagName})`);
        const r = btnBox(p), line = f.cap.getBoundingClientRect();
        assert.ok(r.left >= 0 && r.right <= w, `${w}px: inside the window (${r.left}..${r.right})`);
        assert.ok(r.bottom >= line.top && r.top <= line.bottom, `${w}px: next to its line (${r.top}..${r.bottom} vs ${line.top}..${line.bottom})`);
        p.fire(p.part, 'mouseover'); // off the line
      }
      // the covered link is still the link: a click on it opens the page, no box
      p.fire(f.link, 'click');
      assert.ok(!p.box() || p.box().hidden, 'a click on the link opens no comment box');
    }
    // the selection's button stays inside the window and off the link too
    p.select('keep st6-rb2', p.A.words);
    p.fire(p.A.words, 'mouseup');
    await p.settle();
    assert.equal(p.btn().getAttribute('title'), 'Comment on the selection');
    const r = btnBox(p);
    assert.ok(r.left >= 0 && r.right <= w, `${w}px: the selection button is inside the window (${r.left}..${r.right})`);
    assert.deepEqual(covered(p, p.part), [], `${w}px: the selection button covers no control`);
  }
});

test('console-comments.js (I-103): a line that is all controls gets the button just above it; on the way there the button waits for the pointer', async () => {
  const p = commentsPage({ page: 'status', build: (body, N) => {
    sized(N);
    const at = (n, left, right, top, bottom) => { n.getBoundingClientRect = () => ({ left, right, top, bottom, width: right - left, height: bottom - top }); return n; };
    const part = at(body.appendChild(new N('div', { 'data-anchor': 'part:page', 'data-anchor-label': 'Who is doing what' })), 0, 400, 0, 1000);
    const words = at(part.appendChild(new N('p', {}, 'Show by state:')), 20, 380, 240, 264);
    const row = at(part.appendChild(new N('p')), 20, 380, 300, 324);
    const all = at(row.appendChild(new N('button', {}, 'All of them, in priority order')), 20, 380, 300, 324);
    return { part, words, row, all };
  } });
  p.document.documentElement.clientWidth = 400;
  await p.settle();
  p.fire(p.all, 'mouseover');
  assert.equal(p.btn().hidden, false);
  assert.deepEqual(covered(p, p.row), [], 'the row\'s button is not covered');
  const r = btnBox(p);
  assert.equal(r.bottom, 300, 'just above the row, touching it');
  // the pointer crosses the line above on its way to the button: the button stays put, and once on it, stays
  const where = p.btn().style.top;
  p.fire(p.words, 'mouseover');
  assert.equal(p.btn().style.top, where, 'not moved at once');
  p.fire(p.btn(), 'mouseover');
  await new Promise((res) => setTimeout(res, 450));
  assert.equal(p.btn().style.top, where, 'reaching the button keeps it');
  p.fire(p.btn(), 'click');
  assert.equal(p.box().querySelector('.cmt-quote').textContent, 'All of them, in priority order', 'the comment is on the row');
  p.fire(p.box().querySelector('.cmt-cancel'), 'click');
  // staying on the other line moves it there
  p.fire(p.words, 'mouseover');
  await new Promise((res) => setTimeout(res, 450));
  assert.notEqual(p.btn().style.top, where, 'resting on another line moves the button');
});

test('console-comments.js (I-103, user T-056 #3): the button is an icon, named Comment, a tap target of at least 32 px, drawn without images or URLs', () => {
  const css = readFileSync(join(TOOLS, 'lib', 'console-nav.css'), 'utf8');
  const rule = (sel) => (css.match(new RegExp('^' + sel.replace(/[.:]/g, '\\$&') + ' \\{([^}]*)\\}', 'm')) || [])[1] || '';
  const btn = rule('.cmt-btn');
  for (const k of ['width', 'height']) {
    const m = btn.match(new RegExp('(?:^|;)\\s*' + k + ':\\s*(\\d+)px'));
    assert.ok(m && Number(m[1]) >= 32, `.cmt-btn ${k} >= 32px (${m && m[1]})`);
  }
  assert.match(btn, /padding: 0/, 'the size is the box, no words to pad');
  assert.match(rule('.cmt-btn::before'), /content: ""/, 'the bubble is drawn in CSS');
  assert.match(rule('.cmt-btn::after'), /currentColor/, 'its tail follows the button colour (hover too)');
  assert.ok(!/url\(/.test(btn + rule('.cmt-btn::before') + rule('.cmt-btn::after')), 'no image');
  const src = readFileSync(join(TOOLS, 'lib', 'console-comments.js'), 'utf8');
  assert.match(src, /el\('button', 'cmt-btn'\);/, 'created without words');
  assert.match(src, /nameBtn\('Comment'\)/);
});

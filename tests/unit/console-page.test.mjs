// tools/lib/console-page.html (the "Your steps" page) run on a tiny fake DOM (no jsdom, no browser): the page's own
// inline script loads /api/steps from a stubbed fetch and renders. The steps are real publicView()s built with
// tools/lib/console.mjs in a temp $FW_STATE_DIR. I-059: a runner-ended part shows no Done button, only "Running, please
// wait; this ends by itself" with the runner's latest message; parts without the flag render as before.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tempDir } from '../helpers.mjs';

const C = await import('../../tools/lib/console.mjs');
beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-console-page-'); });

const HTML = readFileSync(new URL('../../tools/lib/console-page.html', import.meta.url), 'utf8');
const JS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

class Node {
  constructor(tag, text) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = text ?? ''; this.hidden = false; this.className = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'disabled') this.disabled = true; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c.map((x) => (x === null || x === undefined ? new Node('#text', String(x)) : x))); } // as the DOM: a non-Node becomes text
  replaceChildren(...c) { this.children = c; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  /** Every descendant (depth first). */
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

/** Render `steps` (publicViews) with the page's script; returns the "open" container. */
async function renderPage(steps, { postStep } = {}) {
  const ids = {};
  for (const i of ['open', 'done', 'done-h', 'conn', 'toast']) ids[i] = new Node('div');
  const document = {
    getElementById: (i) => ids[i] || null,
    createElement: (t) => new Node(t),
    createTextNode: (t) => new Node('#text', t),
    querySelectorAll: () => [],
    activeElement: null,
  };
  const calls = [];
  // a POST answers {step} like the server (postStep: the step after the click); every GET the steps
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => (init?.method === 'POST' && postStep ? { step: postStep } : { now: new Date().toISOString(), steps }) }; };
  const noop = () => 0;
  new Function('window', 'document', 'location', 'fetch', 'setInterval', 'setTimeout', 'clearTimeout', JS)(
    {}, document, { hash: '' }, fetch, noop, noop, noop);
  await settle();
  ids.open.calls = calls;
  ids.open.ids = ids;
  return ids.open;
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
const tap = (root, label) => { const b = root.all().find((n) => n.tagName === 'button' && n.textContent === label); assert.ok(b, `a "${label}" button`); for (const f of b.listeners.click || []) f({ target: b }); };
const buttons = (root) => root.all().filter((n) => n.tagName === 'button').map((b) => b.textContent);

test('the fake DOM renders the page: an action at its Start, then Done after Start (unchanged behaviour)', async () => {
  const s = await C.post({ by: 'r', kind: 'action', title: 'Finger scroll' });
  let open = await renderPage([C.publicView(C.get(s.id))]);
  assert.match(open.textContent, /Finger scroll/);
  assert.deepEqual(buttons(open), ['Start', 'Skip / not now']);
  await C.start(s.id, { part: 1 });
  open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Done', 'Start over', 'Skip / not now'], 'a user-ended part keeps its Done; a started step can be started over');
  assert.doesNotMatch(open.textContent, /ends by itself/);
});

test('I-059: a runner-ended part has no Done button: "Running, please wait; this ends by itself" and the runner\'s message', async () => {
  const s = await C.post({ by: 'iphone-runner', kind: 'action', title: 'Visual check', parts: [{ label: 'Open the page' }, { label: 'Versions 1-4 play', ends: 'runner' }] });
  await C.start(s.id, { part: 1 }); await C.done(s.id, { part: 1 });
  let open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Start versions 1-4 play', 'Start over', 'Skip / not now'], 'Start is still the user\'s');
  assert.match(open.textContent, /After Start, don’t tap anything: this part ends by itself, and the console will say when\./);
  await C.start(s.id, { part: 2 });
  await C.ack(s.id, { by: 'iphone-runner', part: 2, message: 'version 2 of 4 playing' });
  open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Start over', 'Skip / not now'], 'no Done while the runner runs it');
  assert.match(open.textContent, /Running, please wait; this ends by itself\./);
  assert.match(open.textContent, /version 2 of 4 playing/);
  assert.match(open.textContent, /Don’t tap anything; the console will say when\./);
  assert.ok(open.all().some((n) => n.getAttribute('data-runner-ends') === '1'));
  // a recorded runner-ended part: "recording… swipe now", still no Done
  const r = await C.post({ by: 'iphone-runner', kind: 'action', title: 'Rec', record: true, runnerEnds: '1' });
  await C.start(r.id, { part: 1 });
  await C.ack(r.id, { by: 'iphone-runner', part: 1, state: 'recording' });
  open = await renderPage([C.publicView(C.get(r.id))]);
  assert.match(open.textContent, /Recording… swipe now/);
  assert.deepEqual(buttons(open), ['Start over', 'Skip / not now']);
});

test('I-059 "Start over": two taps (Keep going backs out), then POST restart; the new try shows on the part', async () => {
  const s = await C.post({ by: 'iphone-runner', kind: 'action', title: 'Visual check', parts: [{ label: 'Open' }, { label: 'Play', ends: 'runner' }] });
  const pendingPage = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(pendingPage), ['Start open', 'Skip / not now'], 'nothing to start over before the first Start');
  await C.start(s.id, { part: 1 });
  const open = await renderPage([C.publicView(C.get(s.id))]);
  tap(open, 'Start over');
  assert.match(open.textContent, /Start the whole step over\? Every part runs again from the first one; iphone-runner resets the phone first\./);
  assert.deepEqual(buttons(open), ['Done', 'Yes, start over', 'Keep going', 'Skip / not now']);
  tap(open, 'Keep going');
  assert.deepEqual(buttons(open), ['Done', 'Start over', 'Skip / not now'], 'backed out: nothing sent');
  assert.equal(open.calls.filter((c) => c.init?.method === 'POST').length, 0);
  tap(open, 'Start over'); tap(open, 'Yes, start over');
  await settle();
  const posts = open.calls.filter((c) => c.init?.method === 'POST');
  assert.deepEqual(posts.map((c) => c.url), [`/api/steps/${s.id}/restart`]);
  assert.equal(posts[0].init.headers['x-console'], '1');
  // what the page shows after the restart: part 1 again, try 2
  await C.restart(s.id);
  const again = await renderPage([C.publicView(C.get(s.id))]);
  assert.match(again.textContent, /Open · try 2/);
  assert.match(again.textContent, /You started over \(try 2\)\./);
  assert.deepEqual(buttons(again), ['Start open', 'Start over', 'Skip / not now']);
});

test('I-085: answer buttons without --scale show no "null" text (DOM append() turns null into the text "null")', async () => {
  for (const post of [{ kind: 'question', title: 'Smoother?' }, { kind: 'choice', title: 'Which?', options: 'a,b' }]) {
    const s = await C.post({ by: 'r', ...post });
    await C.start(s.id);
    const open = await renderPage([C.publicView(C.get(s.id))]);
    assert.ok(buttons(open).length >= 2, 'the answer buttons render');
    assert.doesNotMatch(open.textContent, /null|undefined/, `${post.kind}: no stray text`);
  }
  const sc = await C.post({ by: 'r', kind: 'question', title: 'Rate', scale: '1-3' });
  await C.start(sc.id);
  const open = await renderPage([C.publicView(C.get(sc.id))]);
  assert.match(open.textContent, /\(optional, choose before your pick\)/, 'with --scale the label and the scale still show');
  assert.deepEqual(buttons(open).slice(0, 3), ['1', '2', '3']);
  assert.doesNotMatch(open.textContent, /null|undefined/);
});

// ---- I-084 (user T-038): every answer panel says who receives the answer ------------------------------------------
const toLines = (root) => root.all().filter((n) => n.attrs['data-to'] === '1').map((n) => n.textContent);

test('I-084: question, action and swipe pair: "Your answer goes to: <poster> (topic …)" in the panel, at every phase', async () => {
  const q = await C.post({ by: 'fix-hero-exit-threaded', kind: 'question', title: 'Did it feel smoother?', topic: 'hero-exit-threaded' });
  let open = await renderPage([C.publicView(C.get(q.id))]);
  assert.deepEqual(toLines(open), ['Your answer goes to: fix-hero-exit-threaded (topic hero-exit-threaded)'], 'pending: next to Start');
  await C.start(q.id);
  open = await renderPage([C.publicView(C.get(q.id))]);
  assert.deepEqual(toLines(open), ['Your answer goes to: fix-hero-exit-threaded (topic hero-exit-threaded)'], 'next to the yes / no buttons');
  assert.deepEqual(buttons(open).slice(0, 2), ['yes', 'no']);

  const a = await C.post({ by: 'fix-nav-morph', kind: 'action', title: 'Finger scroll' });
  await C.start(a.id, { part: 1 });
  open = await renderPage([C.publicView(C.get(a.id))]);
  assert.deepEqual(toLines(open), ['Your answer goes to: fix-nav-morph'], 'next to Done; no topic, no brackets');

  const p = await C.post({ by: 'iphone-runner', kind: 'swipe-pair', title: 'Pair', url: 'http://a.invalid/', url2: 'http://b.invalid/', topic: 'pill-swap' });
  for (const part of [1, 2]) { await C.ack(p.id, { by: 'iphone-runner', part, state: 'ready' }); await C.start(p.id, { part }); await C.done(p.id, { part }); }
  open = await renderPage([C.publicView(C.get(p.id))]);
  assert.deepEqual(buttons(open).slice(0, 3), ['1', '2', 'same']);
  assert.deepEqual(toLines(open), ['Your answer goes to: iphone-runner (topic pill-swap)'], 'next to the pick');
  assert.ok(!/invalid/.test(toLines(open)[0]), 'names only, never a URL');
});

test('I-084: the confirmation after a click names the recipient; the finished list has a "to:" chip; a nameless step says "lead"', async () => {
  const q = await C.post({ by: 'fix-hero-exit-threaded', kind: 'question', title: 'Smoother?', topic: 'hero-exit-threaded' });
  await C.start(q.id);
  const after = C.publicView(await C.answer(q.id, { value: 'yes' }));
  const open = await renderPage([C.publicView(C.get(q.id))].map((v) => ({ ...v, status: 'active', phase: 'answer', result: undefined })), { postStep: after });
  tap(open, 'yes');
  await settle();
  assert.equal(open.ids.toast.textContent, 'Answer sent to fix-hero-exit-threaded (topic hero-exit-threaded).');
  assert.equal(open.ids.toast.hidden, false);
  // the finished list (the trace back): "to: <agent>" per answered step
  const page = await renderPage([C.publicView(C.get(q.id))]);
  const chips = page.ids.done.all().filter((n) => n.className === 'who to-chip').map((n) => n.textContent);
  assert.deepEqual(chips, ['to: fix-hero-exit-threaded']);
  // fallback: a record without a usable poster name, and a view from before I-084 (no `to` at all)
  const v = C.publicView({ ...C.get(q.id), by: '', status: 'pending', result: undefined });
  assert.deepEqual(v.to, ['lead']);
  let p2 = await renderPage([{ ...v, topic: undefined }]);
  assert.deepEqual(toLines(p2), ['Your answer goes to: lead']);
  const legacy = { ...v }; delete legacy.to; delete legacy.topic;
  p2 = await renderPage([legacy]);
  assert.deepEqual(toLines(p2), ['Your answer goes to: lead'], 'never blank');
  p2 = await renderPage([{ ...legacy, status: 'answered', result: { value: 'no' } }]);
  assert.deepEqual(p2.ids.done.all().filter((n) => n.className === 'who to-chip').map((n) => n.textContent), ['to: lead']);
});

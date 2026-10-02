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
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  /** Every descendant (depth first). */
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

/** Render `steps` (publicViews) with the page's script; returns the "open" container. */
async function renderPage(steps) {
  const ids = {};
  for (const i of ['open', 'done', 'done-h', 'conn', 'toast']) ids[i] = new Node('div');
  const document = {
    getElementById: (i) => ids[i] || null,
    createElement: (t) => new Node(t),
    createTextNode: (t) => new Node('#text', t),
    querySelectorAll: () => [],
    activeElement: null,
  };
  const fetch = async () => ({ ok: true, json: async () => ({ now: new Date().toISOString(), steps }) });
  const noop = () => 0;
  new Function('window', 'document', 'location', 'fetch', 'setInterval', 'setTimeout', 'clearTimeout', JS)(
    {}, document, { hash: '' }, fetch, noop, noop, noop);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return ids.open;
}
const buttons = (root) => root.all().filter((n) => n.tagName === 'button').map((b) => b.textContent);

test('the fake DOM renders the page: an action at its Start, then Done after Start (unchanged behaviour)', async () => {
  const s = await C.post({ by: 'r', kind: 'action', title: 'Finger scroll' });
  let open = await renderPage([C.publicView(C.get(s.id))]);
  assert.match(open.textContent, /Finger scroll/);
  assert.deepEqual(buttons(open), ['Start', 'Skip / not now']);
  await C.start(s.id, { part: 1 });
  open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Done', 'Skip / not now'], 'a user-ended part keeps its Done');
  assert.doesNotMatch(open.textContent, /ends by itself/);
});

test('I-059: a runner-ended part has no Done button: "Running, please wait; this ends by itself" and the runner\'s message', async () => {
  const s = await C.post({ by: 'iphone-runner', kind: 'action', title: 'Visual check', parts: [{ label: 'Open the page' }, { label: 'Versions 1-4 play', ends: 'runner' }] });
  await C.start(s.id, { part: 1 }); await C.done(s.id, { part: 1 });
  let open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Start versions 1-4 play', 'Skip / not now'], 'Start is still the user\'s');
  assert.match(open.textContent, /After Start, don’t tap anything: this part ends by itself, and the console will say when\./);
  await C.start(s.id, { part: 2 });
  await C.ack(s.id, { by: 'iphone-runner', part: 2, message: 'version 2 of 4 playing' });
  open = await renderPage([C.publicView(C.get(s.id))]);
  assert.deepEqual(buttons(open), ['Skip / not now'], 'no Done while the runner runs it');
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
  assert.deepEqual(buttons(open), ['Skip / not now']);
});

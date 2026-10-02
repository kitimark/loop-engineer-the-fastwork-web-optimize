// I-061 (user T-021): today's best build on the console. fixes/PROGRESS.json gets an optional top-level `build`
// {name, since, summary, fixes, combined} and per item `inBuild`, `whyNot`, `writeup`; `progress --check` validates
// them; the model (buildView().build), the text (`console.mjs progress`), the /build page (progress-page.html in its
// build view) and the read-only /writeup/<path> reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const P = await import('../../tools/lib/progress.mjs');
const NOW = Date.parse('2026-10-02T10:30:00Z');

const item = (o) => ({ id: 'x', title: 'X', area: 'end', state: 'testing', stage: 'F', next: 'n', owner: 'fix-x', ...o });
const base = () => ({
  schema: 'fw-progress/1', updatedAt: '2026-10-02T10:00:00Z', updatedBy: 'mgmt-ops-7', goal: 'No frame over 50 ms on the iPhone.', complaints: [],
  items: [
    item({ id: 'wave1-base', title: 'Wave 1 base', state: 'base', stage: 'L' }),
    item({ id: 'cdwc', title: 'Countdown fix', inBuild: true, fixes: 'The countdown digits stop repainting.', writeup: 'fixes/cdwc/README.md',
      best: [{ what: 'frames over 50 ms while the panel moves', before: '1-27', after: '0', tag: 'OBSERVED', driver: 'scripted panel driver', ref: 'P-029' },
        { what: 'median frame time', before: '29-40 ms', after: '18-23 ms', tag: 'OBSERVED', driver: 'scripted panel driver' }],
      felt: { answer: 'same', text: '3 blind pairs' } }),
    item({ id: 'blur-cubic', title: 'Blur change' }),
    item({ id: 'lc-cq3', title: 'Container query trick', state: 'dropped', stage: 'F', why: 'no gain on the phone' }),
    item({ id: 'r4-v3', title: 'Rotator v3', state: 'diagnosing', stage: 'D', whyNot: 'parked: the gain was inside the noise' }),
    item({ id: 'style-recalc', title: 'Style recalc' }),
  ],
  build: {
    name: 'stack5', since: '2026-10-02T08:00:00Z', summary: 'The end of the page no longer stalls when the panel moves.',
    fixes: ['cdwc', 'blur-cubic'],
    combined: [{ what: 'frames over 50 ms, scripted scroll', before: '4-9', after: '0-2', tag: 'OBSERVED', driver: 'scripted scroll', when: '2026-10-02T08:40:00Z', how: 'phone block A1, 9 runs', ref: 'P-062' }],
  },
});

test('validate: a good build passes; the committed PROGRESS.json still passes', () => {
  assert.deepEqual(P.validateProgress(base()), []);
  const committed = JSON.parse(readFileSync(new URL('../../fixes/PROGRESS.json', import.meta.url), 'utf8'));
  assert.deepEqual(P.validateProgress(committed), []);
});

test('validate: build and item fields are checked (ids exist, inBuild agrees, dropped not in it, ISO times, tags, write-up paths, nothing personal)', () => {
  const bad = (f, re) => { const p = base(); f(p); const e = P.validateProgress(p); assert.ok(e.some((x) => re.test(x)), `${re}: ${JSON.stringify(e)}`); };
  bad((p) => { p.build.fixes.push('nope'); }, /^build\.fixes\[2\]: no item "nope"$/);
  bad((p) => { p.build.fixes.push('cdwc'); }, /"cdwc" twice/);
  bad((p) => { delete p.build.name; }, /^build\.name: required$/);
  bad((p) => { p.build.since = 'today'; }, /^build\.since: must be an ISO UTC time/);
  bad((p) => { p.build.combined[0].tag = 'GOOD'; }, /^build\.combined\[0\]\.tag: must be one of/);
  bad((p) => { delete p.build.combined[0].when; }, /^build\.combined\[0\]\.when: must be an ISO UTC time \(when it was measured\)/);
  bad((p) => { p.build.combined[0].ref = 'PR-003'; }, /^build\.combined\[0\]\.ref:/);
  bad((p) => { p.build = []; }, /^build: must be an object$/);
  bad((p) => { p.items[2].inBuild = false; }, /^items\[2\]\.inBuild: false, but build\.fixes lists "blur-cubic"$/);
  bad((p) => { p.items[5].inBuild = true; }, /^items\[5\]\.inBuild: true, but build\.fixes does not list "style-recalc"$/);
  bad((p) => { p.items[1].inBuild = 'yes'; }, /^items\[1\]\.inBuild: true or false$/);
  bad((p) => { delete p.build; }, /^items\[1\]\.inBuild: true, but there is no top-level build$/);
  bad((p) => { p.build.fixes.push('lc-cq3'); }, /^items\[3\]: a dropped item can't be in build\.fixes$/);
  bad((p) => { p.items[1].whyNot = 'x'; }, /^items\[1\]\.whyNot: "cdwc" is in the build$/);
  bad((p) => { p.items[4].whyNot = 'x'.repeat(201); }, /^items\[4\]\.whyNot: too long/);
  for (const w of ['../x.md', 'fixes/../../etc/passwd.md', 'fixes/x/README.txt', '/Users/x/fixes/a.md', 'tools/a.md', 'fixes/.hidden/a.md', 'fixes/a/../b.md']) {
    bad((p) => { p.items[1].writeup = w; }, /^items\[1\]\.writeup: a \.md file under fixes\/ or research\//);
  }
  bad((p) => { p.build.summary = 'see http://192.168.77.4:5200/'; }, /^build\.summary: contains a url/);
  const ok = base(); ok.items[3].writeup = 'research/architecture/claims-audit.md'; delete ok.build.combined; delete ok.build.summary;
  assert.deepEqual(P.validateProgress(ok), [], 'combined and summary are optional');
});

test('the model: in it (each fix with its own headline gain), the whole build, tried and not applied (dropped or whyNot) with the reason and write-up, still open', () => {
  const v = P.buildView({ progress: base(), now: NOW, writeups: (w) => w === 'fixes/cdwc/README.md' || w === 'fixes/lc-cq3/README.md' });
  const b = v.build;
  assert.equal(b.name, 'stack5');
  assert.deepEqual(b.applied.map((a) => [a.id, a.gain?.after ?? null, a.more.length, a.writeup?.url ?? null]),
    [['cdwc', '0', 1, '/writeup/fixes/cdwc/README.md'], ['blur-cubic', null, 0, null]]);
  assert.equal(b.applied[0].felt.plain, 'you felt no difference');
  assert.equal(b.combined[0].how, 'phone block A1, 9 runs');
  assert.deepEqual(b.tried, [
    { id: 'lc-cq3', title: 'Container query trick', state: 'dropped', why: 'no gain on the phone', writeup: { path: 'fixes/lc-cq3/README.md', url: '/writeup/fixes/lc-cq3/README.md' } },
    { id: 'r4-v3', title: 'Rotator v3', state: 'diagnosing', why: 'parked: the gain was inside the noise', writeup: null },
  ]);
  assert.deepEqual(b.open, [{ id: 'style-recalc', title: 'Style recalc', state: 'testing' }], 'the base is neither tried nor open');
  const nob = base(); delete nob.build;
  assert.equal(P.buildView({ progress: nob, now: NOW }).build, null);
  assert.equal(P.buildView({ progress: null, now: NOW }).build, null);
});

test('the text: TODAY\'S BEST BUILD at the top of `console.mjs progress`', () => {
  const t = P.renderText(P.buildView({ progress: base(), now: NOW, writeups: (w) => w === 'fixes/lc-cq3/README.md' }));
  assert.match(t, /TODAY'S BEST BUILD: stack5 \(the best build since 08:00Z 2026-10-02\)\n {2}The end of the page no longer stalls when the panel moves\.\n {2}In it:\n {4}- Countdown fix: frames over 50 ms while the panel moves: 1-27 -> 0 \(OBSERVED, scripted panel driver, P-029\)\n {4}- Blur change: no measured phone gain yet\n/);
  assert.match(t, /The whole build vs the original page:\n {4}frames over 50 ms, scripted scroll: 4-9 -> 0-2 \(OBSERVED, scripted scroll; measured 08:40Z 2026-10-02, phone block A1, 9 runs; P-062\)/);
  assert.match(t, /Tried, not applied:\n {4}- Container query trick: no gain on the phone {2}\[fixes\/lc-cq3\/README\.md\]\n {4}- Rotator v3: parked: the gain was inside the noise\n {2}Still being worked on: Style recalc/);
  assert.ok(t.indexOf('TODAY\'S BEST BUILD') < t.indexOf('\nNOW'), 'before the live part');
});

test('/writeup reader: only .md files under fixes/ or research/ inside the root; no traversal or symlink out; scrubbed', () => {
  const root = tempDir('fw-writeup-'), out = tempDir('fw-writeup-out-');
  mkdirSync(join(root, 'fixes', 'cdwc'), { recursive: true });
  writeFileSync(join(root, 'fixes', 'cdwc', 'README.md'), '# cdwc\nServed at http://192.168.77.4:5200/ from /Users/someone/x\n');
  writeFileSync(join(out, 'secret.md'), 'secret');
  symlinkSync(join(out, 'secret.md'), join(root, 'fixes', 'cdwc', 'link.md'));
  const t = P.readWriteup('fixes/cdwc/README.md', root);
  assert.match(t, /^# cdwc\nServed at <link> from ~/);
  assert.ok(!t.includes('192.168') && !t.includes('/Users/'));
  for (const rel of ['fixes/cdwc/link.md', 'fixes/../../x.md', 'fixes/cdwc/missing.md', 'fixes/cdwc', 'README.md', '/etc/passwd']) assert.equal(P.readWriteup(rel, root), null, rel);
  assert.equal(P.writeupExists('fixes/cdwc/README.md', root), true);
});

// ---- the page (progress-page.html at /build; a tiny fake DOM as in progress-now.test.mjs) ------------------------

const HTML = readFileSync(new URL('../../tools/lib/progress-page.html', import.meta.url), 'utf8');
const JS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
class Node {
  constructor(tag, text) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = text ?? ''; this.className = ''; this.classList = { add() {} }; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get childNodes() { return this.children; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}
async function renderAt(pathname, view) {
  const ids = { upd: new Node('span'), banners: new Node('div'), main: new Node('main'), h1: new Node('h1', 'Fix progress') };
  const document = { getElementById: (i) => ids[i] || null, createElement: (t) => new Node(t), createTextNode: (t) => new Node('#text', t), querySelector: () => null };
  const fetch = async () => ({ json: async () => view });
  new Function('window', 'document', 'location', 'fetch', 'setInterval', JS)({}, document, { hash: '', pathname }, fetch, () => 0);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return { main: ids.main, h1: ids.h1, document };
}

test('the /build page: in it with each gain and tag, the whole build with when and how, tried and not applied with reasons and write-up links; /progress gets a card linking to it', async () => {
  const v = JSON.parse(JSON.stringify(P.buildView({ progress: base(), now: NOW, writeups: (w) => w === 'fixes/lc-cq3/README.md' || w === 'fixes/cdwc/README.md' })));
  const { main, h1, document } = await renderAt('/build', v);
  const text = main.textContent;
  assert.equal(h1.textContent, 'Today’s best build');
  assert.equal(document.title, 'Best build');
  assert.match(text, /stack5The best build since 08:00Z 2026-10-02 · 2 fixes in it/);
  assert.match(text, /In today’s best buildCountdown fix Write-upThe countdown digits stop repainting\.frames over 50 ms while the panel moves1-27 → 0OBSERVEDscripted panel driver · P-029/);
  assert.match(text, /Blur changeNo measured phone gain yet\./);
  assert.match(text, /The whole build vs the original pageframes over 50 ms, scripted scroll4-9 → 0-2OBSERVEDscripted scroll · measured 08:40Z 2026-10-02 · phone block A1, 9 runs · P-062/);
  assert.match(text, /Tried, not appliedContainer query trick: no gain on the phone Write-upRotator v3: parked: the gain was inside the noise/);
  assert.match(text, /Still being worked on: Style recalc \(see Progress\)/);
  const links = main.all().filter((n) => n.tagName === 'a').map((n) => n.attrs.href);
  assert.deepEqual(links, ['/writeup/fixes/cdwc/README.md', '/writeup/fixes/lc-cq3/README.md', '/progress']);
  assert.ok(!/Fixes being tested|What changed/.test(text), 'only the build view');
  // /progress: a short card with a link to /build
  const p = await renderAt('/progress', v);
  assert.match(p.main.textContent, /Today’s best buildstack5: 2 fixes in it, 2 tried and not applied\. See what is in it and why/);
  assert.ok(p.main.all().some((n) => n.tagName === 'a' && n.attrs.href === '/build'));
  assert.equal(p.h1.textContent, 'Fix progress');
  // no build yet: a plain sentence on /build, no card on /progress
  const none = JSON.parse(JSON.stringify(P.buildView({ progress: null, now: NOW })));
  assert.match((await renderAt('/build', none)).main.textContent, /No best build is written up yet/);
  assert.ok(!/Today’s best build/.test((await renderAt('/progress', none)).main.textContent));
});

// I-109 (user T-063 #2, on PR-015): every proposal the user sees carries a Try-it entry on every option: a live patch
// (I-074/I-093), or `live: {none: "<why>"}` that says why there is no page to try, shown in the Try-it spot. post,
// revise to a non-draft state and publish refuse without one; drafts may lack it; proposals stored before the rule keep
// loading and showing. Temp state dir ($FW_STATE_DIR), fake images, no git (a {none} entry reads nothing), fake DOM.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

let P, dir;
before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-tryit-');
  P = await import('../../tools/lib/proposal.mjs');
  dir = tempDir('fw-proposal-tryit-src-');
  writePng(join(dir, 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
});

const single = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Countdown faces', area: 'hero', problem: 'The countdown restyles every second.',
  idea: 'Swap whole faces.', looksSame: 'Same digits.', visualDiff: ['None at 1x.'], risk: 'Low.',
  gain: [{ what: 'Restyles per second', before: '120', after: '4', tag: 'OBSERVED', how: 'trace' }],
  compare: { a: { label: 'Original' }, b: { label: 'Faces' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'b-0.png' }] },
  ...over,
});
const opt = (name, over = {}) => ({
  name, label: `L ${name}`, idea: `I ${name}.`, looksSame: 'Same.', visualDiff: ['None.'], risk: 'Low.',
  gain: [{ what: 'Restyles', before: '9', after: '1', tag: 'OBSERVED', how: 'trace' }],
  compare: { b: { label: `B ${name}` }, shots: [{ a: 'a-0.png', b: 'b-0.png' }] }, ...over,
});
const withOptions = (a, b) => single({ title: 'Two ways', options: [a, b], visualDiff: undefined, looksSame: undefined, risk: undefined, gain: undefined, compare: { a: { label: 'Original' } } });
const errs = (raw, o = {}) => P.normalize(raw, { baseDir: dir, ...o }).errors.join('\n');

test('normalize: no live entry -> refused (not for a draft); {none: why} is a Try-it entry; its shape is checked', () => {
  assert.match(errs(single()), /^live: required: a Try-it panel \(user T-063, I-109\): --live-patch .* --live-none "<why>"/m);
  assert.doesNotMatch(errs(single(), { draft: true }), /live/, 'a draft may lack it');
  const n = P.normalize(single({ live: { none: '  Keep the original: B = A.  ' } }), { baseDir: dir });
  assert.deepEqual(n.errors, []);
  assert.deepEqual(n.fields.live, { none: 'Keep the original: B = A.' });
  assert.match(errs(single({ live: { none: '' } })), /^live\.none: required$/m);
  assert.match(errs(single({ live: { none: 'x'.repeat(301) } })), /^live\.none: 301 characters, at most 300$/m);
  assert.match(errs(single({ live: { none: 'why', patch: 'fixes/demo/patch.diff' } })), /^live: either .* or \{none: .*\}, not both \(got patch next to none\)$/m);
  const lan = P.normalize(single({ live: { none: 'Seen on https://192.168.77.12:5612/ only.' } }), { baseDir: dir });
  assert.ok(!lan.fields.live.none.includes('192.168'), lan.fields.live.none);
  assert.ok(lan.scrubbed.some((s) => s.startsWith('live.none: ')), lan.scrubbed.join());
  // the CLI's --live-none (normalize's `live`) is the same entry, named by its flag
  assert.deepEqual(P.normalize(single(), { baseDir: dir, live: { none: 'No page.' } }).fields.live, { none: 'No page.' });
  assert.match(errs(single(), { live: { none: '' } }), /^--live-none\.none: required$/m);
});

test('normalize with options: EVERY option needs its entry; the error names the option; --live-none goes to --option', () => {
  const both = withOptions(opt('full', { live: { none: 'Built later.' } }), opt('keep', { live: { none: 'Keep the original: B = A.' } }));
  assert.equal(errs(both), '');
  const one = withOptions(opt('full', { live: { none: 'Built later.' } }), opt('keep'));
  assert.match(errs(one), /^options\[1\]\.live \(keep\): required: a Try-it panel \(user T-063, I-109\)/m);
  assert.doesNotMatch(errs(one), /options\[0\]\.live/);
  assert.doesNotMatch(errs(one, { draft: true }), /live/);
  const viaCli = P.normalize(one, { baseDir: dir, option: 'keep', live: { none: 'B = A.' } });
  assert.deepEqual(viaCli.errors, []);
  assert.deepEqual(viaCli.fields.options.map((o) => o.live), [{ none: 'Built later.' }, { none: 'B = A.' }]);
  assert.match(errs(one, { live: { none: 'B = A.' } }), /--live-none: this proposal has options: say which one it is for/);
});

test('parseMarkdown: "live: none: <why>" (front matter and option blocks); "live: <path>" stays a patch', () => {
  const md = `---\ntitle: T\narea: hero\nlive: none: Keep the original: B = A.\n---\n## Problem\nP.\n`;
  assert.deepEqual(P.parseMarkdown(md).live, { none: 'Keep the original: B = A.' });
  assert.deepEqual(P.parseMarkdown(md.replace('none: Keep the original: B = A.', 'fixes/demo/patch.diff')).live, { patch: 'fixes/demo/patch.diff' });
  const mo = `---\ntitle: T\narea: hero\n---\n## Option keep: Keep it\nlive: None: same page\n### Idea\nI.\n`;
  assert.deepEqual(P.parseMarkdown(mo).options[0].live, { none: 'same page' });
});

test('post refuses without it, a draft does not; publish and revise --publish refuse until the draft has one', async () => {
  await assert.rejects(P.postProposal({ by: 'de-t', raw: single(), baseDir: dir }), /post: the proposal is not valid:\n {2}live: required/);
  const ok = (await P.postProposal({ by: 'de-t', raw: single({ live: { none: 'Keep the original.' } }), baseDir: dir })).proposal;
  assert.equal(ok.state, 'proposed');
  assert.deepEqual(ok.live, { none: 'Keep the original.' });
  const d = (await P.postProposal({ by: 'de-t', raw: single(), baseDir: dir, draft: true })).proposal;
  assert.equal(d.state, 'draft');
  await assert.rejects(P.publishProposal(d.id, { by: 'de-t' }), /publish PR-\d+: the proposal is not valid:\n {2}live: required/);
  await assert.rejects(P.reviseProposal(d.id, { by: 'de-t', note: 'go', publish: true }), /revise PR-\d+: .*\n {2}live: required/);
  assert.equal((await P.reviseProposal(d.id, { by: 'de-t', note: 'still a draft' })).proposal.state, 'draft', 'a draft revision may still lack it');
  const r = (await P.reviseProposal(d.id, { by: 'de-t', note: 'go', publish: true, live: { none: 'No page yet: the build is not committed.' } })).proposal;
  assert.equal(r.state, 'proposed');
  assert.deepEqual(r.live, { none: 'No page yet: the build is not committed.' });
  // a later revise without a file keeps (and re-checks) the stored entry
  assert.deepEqual((await P.reviseProposal(d.id, { by: 'de-t', note: 'wording' })).proposal.live, { none: 'No page yet: the build is not committed.' });
});

test('a proposal stored before the rule (no live) still loads and shows; a non-draft revise of it needs the entry; setLive --none adds it', async () => {
  const { proposal: base } = await P.postProposal({ by: 'de-old', raw: single({ live: { none: 'tmp' } }), baseDir: dir });
  const file = join(P.proposalsDir(), `${base.id}.json`);
  const old = JSON.parse(readFileSync(file, 'utf8'));
  delete old.live; // as PR-014/PR-015 were stored
  writeFileSync(file, JSON.stringify(old, null, 2));
  const p = P.get(base.id);
  const v = P.publicView(p);
  assert.equal(v.live, undefined);
  assert.equal(v.title, 'Countdown faces');
  assert.doesNotMatch(P.showText(p), /live/);
  assert.ok(P.pageProposals().some((x) => x.id === base.id));
  await assert.rejects(P.reviseProposal(base.id, { by: 'de-old', note: 'wording' }), /live: required/);
  await assert.rejects(P.setLive(base.id, { by: 'de-old', none: '' }), /--none: say why/);
  await assert.rejects(P.setLive(base.id, { by: 'de-old', none: 'x', patch: 'fixes/demo/patch.diff' }), /--none "<why>" stands alone/);
  await assert.rejects(P.setLive(base.id, { by: 'de-old', none: 'x'.repeat(301) }), /at most 300/);
  const s = await P.setLive(base.id, { by: 'de-old', none: 'Keep the original: B = A.' });
  assert.equal(s.rev, 1, 'no new revision');
  assert.deepEqual(s.live, { none: 'Keep the original: B = A.' });
  assert.equal(s.history.at(-1).action, 'live');
  assert.deepEqual(P.publicView(s).live, { none: 'Keep the original: B = A.' });
  assert.match(P.showText(s), /^ {2}live: none \(Keep the original: B = A\.\)$/m);
  assert.equal((await P.reviseProposal(base.id, { by: 'de-old', note: 'wording' })).proposal.state, 'proposed');
});

test('options: setLive --none per option; publicView and showText carry the reason', async () => {
  const raw = withOptions(opt('full', { live: { none: 'a' } }), opt('keep', { live: { none: 'b' } }));
  const { proposal: p } = await P.postProposal({ by: 'de-o', raw, baseDir: dir });
  await assert.rejects(P.setLive(p.id, { by: 'de-o', none: 'x' }), /has options: say which one/);
  const s = await P.setLive(p.id, { by: 'de-o', option: 'keep', none: 'Keep the original: B = A.' });
  assert.deepEqual(P.publicView(s).options.map((o) => o.live), [{ none: 'a' }, { none: 'Keep the original: B = A.' }]);
  assert.match(P.showText(s), /^ {4}live: none \(Keep the original: B = A\.\)$/m);
});

// ---- the page: the Try-it spot shows the reason ----
function page() {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this.listeners = {}; this._t = text ?? ''; this.attrs = {}; this.className = ''; this.style = {}; this.hidden = false; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    appendChild(c) { this.children.push(c); return c; }
    insertBefore(c) { this.children.unshift(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
    querySelector() { return null; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  }
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const ids = {};
  const document = { getElementById: (i) => (ids[i] ||= new N('div')), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t), querySelector: () => null };
  const api = new Function('window', 'document', 'location', 'fetch', 'setInterval', 'clearInterval', `${js}\nreturn { renderTryIt: renderTryIt };`)(
    { addEventListener() {} }, document, { hash: '' }, () => new Promise(() => {}), () => 0, () => {});
  return { ...api, ids };
}

test('page: a {none} entry fills the Try-it spot with its reason and no Open button; a patch entry still offers the pages', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-pg', raw: single({ live: { none: 'Keep the original: B = A.' } }), baseDir: dir });
  const pg = page();
  pg.renderTryIt(P.publicView(P.get(p.id)));
  const box = pg.ids.tryit;
  assert.match(box.textContent, /^Try it: no live pages/);
  assert.match(box.textContent, /Keep the original: B = A\./);
  assert.ok(!box.all().some((n) => n.tagName === 'button'), 'nothing to open');
  // a live patch entry (as publicView serves it): the panel with its Open button, as before
  const pg2 = page();
  pg2.renderTryIt({ ...P.publicView(P.get(p.id)), id: 'PR-900', live: { patch: 'fixes/demo/patch.diff', version: 'abcdef012345', files: 1 } });
  assert.ok(pg2.ids.tryit.all().some((n) => n.tagName === 'button' && n.textContent === 'Open both pages'));
  // no entry at all (a proposal stored before the rule): the spot stays empty
  const pg3 = page();
  const legacy = P.publicView(P.get(p.id)); delete legacy.live;
  pg3.renderTryIt(legacy);
  assert.equal(pg3.ids.tryit.children.length, 0);
});

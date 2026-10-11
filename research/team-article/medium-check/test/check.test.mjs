// check.mjs and its parts: a fake Medium story built from the article model, clean and with seeded faults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { extractArticleFile } from '../lib/article.mjs';
import { readDump, dumpFromHtml, streamEvidence } from '../lib/medium.mjs';
import { compareModels } from '../lib/compare.mjs';
import { editorHtml, publishedHtml, withTransfer, deepCopy } from './helpers/fake-medium.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'article-mini.html');
const CHECK = join(HERE, '..', 'check.mjs');
const src = () => extractArticleFile(MINI);

// article model -> fake Medium page -> medium-dump.js (in Node) -> Medium model -> compare
function run(mutate, { flavour = 'editor', opts = {}, page = {} } = {}) {
  const s = src();
  const m = deepCopy(s);
  if (mutate) mutate(m);
  const html = flavour === 'editor' ? editorHtml(m, page) : publishedHtml(m, page);
  const med = readDump(withTransfer(dumpFromHtml(html)));
  return { ...compareModels(s, med, opts), med };
}
const types = (r) => r.issues.map((i) => i.type);
const P = (m, n) => m.blocks.find((b) => b.kind === 'picture' && b.n === n);
const C = (m, n) => m.blocks.find((b) => b.kind === 'clip' && b.n === n);
const para = (m, start) => m.blocks.find((b) => b.kind === 'p' && b.text.startsWith(start));

test('a clean editor draft passes', () => {
  const r = run(null);
  assert.equal(r.med.medium.mode, 'graf');
  assert.equal(r.med.medium.transfer.state, 'OK');
  assert.deepEqual(r.issues, []);
  assert.equal(r.stats.pictures.ok, 3);
  assert.equal(r.stats.clips.ok, 2);
});

test('a clean published page passes (pull quotes are a note: the markup does not say)', () => {
  const r = run(null, { flavour: 'published' });
  assert.equal(r.med.medium.mode, 'selectable');
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.notes.map((n) => n.type), ['PULL?']);
  assert.equal(r.med.title, 'Twelve Milliseconds: A Test Story');
});

test('missing picture', () => {
  const r = run((m) => { m.blocks = m.blocks.filter((b) => !(b.kind === 'picture' && b.n === '02')); });
  assert.deepEqual(types(r), ['MISSING']);
  assert.match(r.issues[0].where, /Picture 02 \(02-console-mini\.png\)/);
});

test('a changed word shows as a word diff', () => {
  const r = run((m) => { const p = para(m, 'At 17:05'); p.text = p.text.replace('connect', 'attach'); });
  assert.deepEqual(types(r), ['TEXT']);
  assert.match(r.issues[0].detail, /\[-connect-\]\{\+attach\+\}/);
  assert.match(r.issues[0].where, /^Day 1 · Wed 30 Sep, paragraph 1/);
});

test('wrong clip uid', () => {
  const r = run((m) => { C(m, '02').uid = 'ffffffffffffffffffffffffffffffff'; });
  assert.deepEqual(types(r), ['CLIP-UID']);
  assert.match(r.issues[0].detail, /embeds Stream uid ffff.* the article links fedcba98/);
});

test('missing player parameter (autoplay off)', () => {
  const r = run((m) => { C(m, '01').params = { loop: 'true', muted: 'true' }; });
  assert.deepEqual(types(r), ['CLIP-PARAMS']);
  assert.match(r.issues[0].detail, /autoplay=\(not visible\)/);
});

test('leftover kit markers: a [PICTURE] line, a Caption: line, a Stream link left as text', () => {
  const r = run((m) => {
    const i = m.blocks.findIndex((b) => b.kind === 'picture' && b.n === '01');
    m.blocks.splice(i, 0, { kind: 'p', text: '[PICTURE 01 · 01-fig-1.png]' });
    m.blocks.splice(i + 2, 0, { kind: 'p', text: 'Caption: The frame ruler (Fig. 1; source)' });
    m.blocks.push({ kind: 'p', text: 'https://iframe.videodelivery.net/fedcba9876543210fedcba9876543210?loop=true&autoplay=true&muted=true' });
  });
  assert.deepEqual(types(r), ['MARKER', 'MARKER', 'MARKER'], 'a marker line is reported once, not again as EXTRA');
  assert.match(r.issues[2].detail, /Stream link left as text/);
});

test('caption, alt and image faults on a picture', () => {
  const r = run((m) => { P(m, '01').caption = 'The frame ruler'; P(m, '02').alt = ''; P(m, '03').caption = ''; });
  assert.deepEqual(types(r).sort(), ['ALT', 'CAPTION', 'CAPTION']);
  assert.match(r.issues.find((i) => i.type === 'ALT').detail, /alt text missing/);
  assert.match(r.issues.find((i) => i.where.startsWith('Picture 03')).detail, /caption missing in Medium/);
});

test('alt text cut at Medium\'s limit is a note, or a difference with strictAlt', () => {
  const s = src();
  const long = 'word '.repeat(150).trim();
  P(s, '01').alt = long;
  const m = deepCopy(s);
  P(m, '01').alt = long.slice(0, 500);
  const med = readDump(withTransfer(dumpFromHtml(editorHtml(m))));
  const r = compareModels(s, med);
  assert.deepEqual(types(r), []);
  assert.deepEqual(r.notes.map((n) => n.type), ['ALT-CUT']);
  assert.deepEqual(types(compareModels(s, med, { strictAlt: true })), ['ALT-CUT']);
});

test('heading level, plain vs pull quote, list kind', () => {
  const r = run((m) => {
    m.blocks.find((b) => b.kind === 'heading' && b.level === 2).level = 1;
    m.blocks.find((b) => b.kind === 'quote' && b.pull).pull = false;
    for (const b of m.blocks.filter((x) => x.kind === 'li').slice(0, 2)) b.list = 'ol';
  });
  assert.deepEqual(types(r).sort(), ['LEVEL', 'LIST', 'LIST', 'PULL']);
});

test('two paragraphs swapped: one MOVED, nothing missing', () => {
  const r = run((m) => {
    const a = m.blocks.findIndex((b) => b.kind === 'p' && b.text.startsWith('At 17:05'));
    const [blk] = m.blocks.splice(a, 1);
    m.blocks.splice(m.blocks.findIndex((b) => b.kind === 'p' && b.text === 'The end.') + 1, 0, blk);
  });
  assert.deepEqual(types(r), ['MOVED']);
});

test('title, subtitle and disclaimer are exact; italics count for the disclaimer', () => {
  const r = run((m) => {
    m.title = 'Twelve Milliseconds: A Test Story!';
    m.subtitle = null;
    const d = m.blocks.find((b) => b.role === 'disclaimer');
    d.em = false;
  });
  assert.deepEqual(types(r).sort(), ['DISCLAIMER', 'SUBTITLE', 'TITLE']);
  assert.match(r.issues.find((i) => i.type === 'DISCLAIMER').detail, /not italic/);
});

test('a missing link target is a difference (--no-links turns it off)', () => {
  const mutate = (m) => { para(m, 'The reference').links = []; };
  assert.deepEqual(types(run(mutate)), ['LINKS']);
  assert.deepEqual(types(run(mutate, { opts: { noLinks: true } })), []);
});

test('published page: the clip target comes from the page data; without it the clip is unproven', () => {
  assert.deepEqual(types(run(null, { flavour: 'published' })), []);
  const r = run(null, { flavour: 'published', page: { apollo: false } });
  assert.deepEqual(types(r), ['CLIP-UNPROVEN', 'CLIP-UNPROVEN']);
  assert.deepEqual(types(run(null, { flavour: 'published', page: { apollo: false }, opts: { allowUnproven: true } })), []);
});

test('Stream evidence is found inside an Embedly address (encoded once or twice)', () => {
  const direct = 'https://iframe.videodelivery.net/0123456789abcdef0123456789abcdef?loop=true&autoplay=true&muted=true';
  const once = `https://cdn.embedly.com/widgets/media.html?src=${encodeURIComponent(direct)}&type=text%2Fhtml`;
  const twice = `https://medium.com/media/abc?src=${encodeURIComponent(once)}`;
  for (const u of [direct, once, twice]) {
    const ev = streamEvidence({ embeds: [{ src: u, nested: [] }], urls: [] });
    assert.equal(ev.stream && ev.stream.uid, '0123456789abcdef0123456789abcdef', u);
    assert.deepEqual(ev.stream.params, { loop: 'true', autoplay: 'true', muted: 'true' });
  }
});

test('a dump whose copied text was cut is TRANSFER MISMATCH', () => {
  const s = src();
  const text = withTransfer(dumpFromHtml(editorHtml(s)));
  const broken = JSON.parse(text);
  broken.blocks[3].text += ' x';
  const med = readDump(JSON.stringify(broken));
  assert.equal(med.medium.transfer.state, 'MISMATCH');
  assert.ok(types(compareModels(s, med)).includes('TRANSFER'));
});

test('check.mjs: exit 0 clean, 1 differences, 2 usage; --json; --html reads a saved page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-check-'));
  const s = src();
  const clean = join(dir, 'clean.json'), bad = join(dir, 'bad.json'), saved = join(dir, 'saved.html');
  writeFileSync(clean, withTransfer(dumpFromHtml(editorHtml(s))));
  const m = deepCopy(s); C(m, '01').uid = 'ffffffffffffffffffffffffffffffff';
  writeFileSync(bad, withTransfer(dumpFromHtml(editorHtml(m))));
  writeFileSync(saved, publishedHtml(s));
  const cli = (...a) => spawnSync(process.execPath, [CHECK, '--article', MINI, '--kit', 'none', '--clips', join(HERE, 'fixtures', 'clips-mini.tsv'), ...a], { encoding: 'utf8' });
  const ok = cli('--dump', clean, '--list');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /TRANSFER OK/);
  assert.match(ok.stdout, /OK +Picture 03 03-fig-2\.png/);
  assert.match(ok.stdout.trim().split('\n').at(-1), /^CHECK CLEAN$/);
  const fail = cli('--dump', bad);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /CLIP-UID +Clip 01/);
  assert.match(fail.stdout.trim().split('\n').at(-1), /^CHECK FAIL 1 differences$/);
  const js = JSON.parse(cli('--dump', bad, '--json').stdout);
  assert.equal(js.clean, false);
  assert.equal(js.issues[0].type, 'CLIP-UID');
  assert.equal(cli('--html', saved).status, 0);
  assert.equal(cli().status, 2);
  assert.equal(cli('--dump', join(dir, 'nope.json')).status, 2);
  assert.equal(cli('--dump', clean, '--bogus').status, 2);
  assert.equal(cli('--url', 'http://medium.com/x').status, 2, 'plain http is refused before any request');
  assert.equal(spawnSync(process.execPath, [CHECK, '--help'], { encoding: 'utf8' }).status, 0);
  assert.match(readFileSync(CHECK, 'utf8'), /Exit 0 clean, 1 differences, 2 usage/);
});

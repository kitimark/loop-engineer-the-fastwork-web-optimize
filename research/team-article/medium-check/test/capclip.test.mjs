// A drawn figure (figure.cap) followed by a Medium embed line (p.mlink) is a clip on Medium, not a picture (the
// article's Fig. 2 canvas, v109): the model, the check against a fake Medium story, and the kit's text files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArticleFile, clipRowByUid, loadClipTable, label } from '../lib/article.mjs';
import { readDump, dumpFromHtml } from '../lib/medium.mjs';
import { compareModels } from '../lib/compare.mjs';
import { render } from '../kit/render.mjs';
import { editorHtml, withTransfer, deepCopy } from './helpers/fake-medium.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, 'fixtures', 'article-capclip.html');
const CLIPS = join(HERE, 'fixtures', 'clips-capclip.tsv');
const URL1 = 'https://iframe.videodelivery.net/abcdef0123456789abcdef0123456789?loop=true&autoplay=true&muted=true';
const both = (t) => ({ md: t, html: t, text: t });

test('figure.cap + p.mlink is clip 01 (name from the clip table by uid); figure.cap alone stays a picture', () => {
  const m = extractArticleFile(PAGE, { clips: CLIPS });
  assert.deepEqual(m.warnings, []);
  const kinds = m.blocks.map((b) => b.kind + (b.kind === 'heading' ? b.level : ''));
  assert.deepEqual(kinds, ['p', 'p', 'heading1', 'picture', 'p', 'clip', 'p', 'clip', 'picture', 'p']);
  const [c1, c2] = m.blocks.filter((b) => b.kind === 'clip');
  assert.deepEqual([c1.n, c1.from, c1.id, c1.clip, c1.uid, c1.url], ['01', 'figure.cap', 'fig-2', 'mini-drawn-60fps', 'abcdef0123456789abcdef0123456789', URL1]);
  assert.deepEqual(c1.params, { loop: 'true', autoplay: 'true', muted: 'true' });
  assert.equal(c1.caption, 'Illustration: the same motion with three frame rhythms (Fig. 2; source)', 'caption from the figcaption.note');
  assert.equal(c1.aria, 'Illustration. Three dots follow the same motion; the top one stalls, the bottom one glides.', 'description from the canvas aria-label');
  assert.equal(label(c1), 'Clip 01 (mini-drawn-60fps)');
  assert.deepEqual([c2.n, c2.from, c2.clip, c2.video], ['02', 'figure.gif', 'mini-clip-two', 'mini-clip-two.mp4']);
  const pics = m.blocks.filter((b) => b.kind === 'picture');
  assert.deepEqual(pics.map((p) => [p.n, p.file]), [['01', '01-fig-1.png'], ['02', '02-fig-3.png']], 'pictures renumber around the clip');
  assert.ok(!m.blocks.some((b) => b.kind === 'p' && /Medium embed/.test(b.text)), 'the embed line is consumed, not a paragraph');
});

test('a drawn clip whose uid is not in the clip table is a warning; without a table it has no name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-cc-'));
  const tsv = join(dir, 'clips.tsv');
  writeFileSync(tsv, readFileSync(CLIPS, 'utf8').split('\n').filter((l) => !l.startsWith('mini-drawn')).join('\n'));
  const m = extractArticleFile(PAGE, { clips: tsv });
  assert.equal(m.warnings.length, 1);
  assert.match(m.warnings[0], /clip 01 \(#fig-2\): Stream uid abcdef0123456789abcdef0123456789 is not in the clip table/);
  const bare = extractArticleFile(PAGE);
  const c1 = bare.blocks.find((b) => b.kind === 'clip');
  assert.equal(c1.clip, null);
  assert.equal(label(c1), 'Clip 01 (#fig-2)');
});

test('clipRowByUid: by uid or by Stream link; unknown or ambiguous is null', () => {
  const t = loadClipTable(CLIPS);
  assert.equal(clipRowByUid(t, 'ABCDEF0123456789ABCDEF0123456789').clip, 'mini-drawn-60fps');
  assert.equal(clipRowByUid(CLIPS, URL1).clip, 'mini-drawn-60fps');
  assert.equal(clipRowByUid(t, 'ffffffffffffffffffffffffffffffff'), null);
  assert.equal(clipRowByUid(t, 'https://example.org/x'), null);
  assert.equal(clipRowByUid([...t, { ...t[0], clip: 'copy' }], URL1), null);
});

test('check: the clip embedded passes; the old picture in its place is exactly picture extra + clip missing', () => {
  const src = extractArticleFile(PAGE, { clips: CLIPS });
  const read = (model) => readDump(withTransfer(dumpFromHtml(editorHtml(model))));
  const ok = compareModels(src, read(deepCopy(src)));
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.stats.clips.ok, 2);
  // the Medium story from before the swap: Fig. 2 as a picture (caption + alt), the clip not there
  const before = deepCopy(src);
  const k = before.blocks.findIndex((b) => b.kind === 'clip' && b.from === 'figure.cap');
  before.blocks[k] = { kind: 'picture', n: '02', caption: src.blocks[k].caption, alt: src.blocks[k].aria, links: [] };
  const r = compareModels(src, read(before));
  assert.deepEqual(r.issues.map((i) => i.type).sort(), ['EXTRA', 'MISSING']);
  assert.match(r.issues.find((i) => i.type === 'MISSING').where, /^Clip 01 \(mini-drawn-60fps\)/);
  assert.match(r.issues.find((i) => i.type === 'EXTRA').detail, /Illustration: the same motion/);
});

test('render: a drawn clip is a [CLIP] marker with its link where the picture was; no one-frame note', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-cc-kit-'));
  writeFileSync(join(dir, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', page: 'test/fixtures/article-capclip.html', builtAt: '2026-10-11T00:00:00Z', warn: [], overflow: [],
    blocks: [
      { t: 'h1', ...both('Drawn Clips: A Test Story') },
      { t: 'p', cls: 'byline', ...both('Part one') },
      { t: 'h3', ...both('Before the start') },
      { t: 'picture', kind: 'cap', id: 'fig-1', n: '01', file: '01-fig-1.png', cap: both('The frame ruler (Fig. 1; source)'), capFrom: 'figcaption', alt: 'A scale', px: { w: 2400, h: 400 } },
      { t: 'p', cls: '', ...both('This is what those numbers feel like:') },
      { t: 'clip', kind: 'cap', id: 'fig-2', n: '01', clip: 'mini-drawn-60fps', url: URL1, cap: both('Illustration: the same motion (Fig. 2; source)'), aria: 'Illustration. Three dots.' },
      { t: 'p', cls: '', ...both('Under each clip: one bar per frame.') },
      { t: 'picture', kind: 'cap', id: 'fig-3', n: '02', file: '02-fig-3.png', cap: both('Fig. 3: slow frames per day.'), capFrom: 'p.note after figure (no figcaption)', alt: 'Slow frames per day', px: { w: 2400, h: 300 } },
    ] }));
  const s = render(dir);
  assert.deepEqual([s.pictures, s.clips], [2, 1]);
  const md = readFileSync(join(dir, 'story.md'), 'utf8');
  assert.ok(md.includes('feel like:\n\n[CLIP 01 · paste on its own line, then Enter]\n\n' + URL1 + '\n\nCaption: Illustration: the same motion (Fig. 2; source)\n\nUnder each clip'));
  assert.ok(!md.includes('fig-2.png'));
  assert.match(readFileSync(join(dir, 'story.html'), 'utf8'), /<p class="mark">\[CLIP 01 · paste on its own line, then Enter\]<\/p><p>https:\/\/iframe\.videodelivery\.net\/abcdef01/);
  assert.equal(readFileSync(join(dir, 'alt.txt'), 'utf8'), '01\t01-fig-1.png\tA scale\n02\t02-fig-3.png\tSlow frames per day\n');
  const cl = readFileSync(join(dir, 'CHECKLIST.md'), 'utf8');
  assert.match(cl, /\| clip 01 \| \(Stream link: mini-drawn-60fps\) \| Before the start \|/);
  assert.match(cl, /except #fig-2 \(clip 01\): Medium shows that drawing as a Stream clip/);
  assert.doesNotMatch(cl, /one frame/);
});

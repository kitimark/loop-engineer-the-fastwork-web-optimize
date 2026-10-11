// The article model: the mini fixture block by block, and the committed article page as a whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArticleFile, parseStreamUrl, applyKit } from '../lib/article.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'article-mini.html');
const CLIPS = join(HERE, 'fixtures', 'clips-mini.tsv');
const REAL = join(HERE, '..', '..', 'artifacts', 'sixteen-milliseconds', 'index.html');
const REAL_CLIPS = join(HERE, '..', '..', '..', 'article-clips', 'cf-stream-links.tsv');

test('mini article: header, blocks in order, pictures, clips, captions, alt', () => {
  const m = extractArticleFile(MINI, { clips: CLIPS });
  assert.deepEqual(m.warnings, []);
  assert.equal(m.title, 'Twelve Milliseconds: A Test Story');
  assert.equal(m.subtitle, 'A tiny article with every block kind the Medium checker knows - and nothing else.');
  assert.equal(m.byline, 'Part one · A fixture for the tests');
  assert.deepEqual(m.disclaimer, ['A personal test page. Not affiliated with anyone.', 'Times are UTC.']);
  const kinds = m.blocks.map((b) => b.kind + (b.kind === 'heading' ? b.level : ''));
  assert.deepEqual(kinds, ['p', 'p', 'p', 'heading1', 'p', 'p', 'heading2', 'li', 'li', 'picture', 'p', 'picture', 'clip', 'quote', 'hr',
    'heading1', 'p', 'quote', 'quote', 'clip', 'quote', 'quote', 'quote', 'picture', 'p', 'hr', 'heading2', 'p', 'li', 'li']);
  const p2 = m.blocks[4];
  assert.equal(p2.text, 'It started with a headline on a quiet evening, and the page "felt" slow.');
  assert.deepEqual(m.blocks[5].links, ['https://example.org/frames'], 'only external links count; #Day 1 is dropped');
  const [f1, img, f2] = m.blocks.filter((b) => b.kind === 'picture');
  assert.deepEqual([f1.n, f1.file, f1.caption, f1.altFrom], ['01', '01-fig-1.png', 'The frame ruler (Fig. 1; source)', 'aria-label']);
  assert.equal(f1.alt, 'A scale from 0 to 60 ms: grey up to 34, amber over 34, red over 50.');
  assert.deepEqual([img.n, img.file, img.source, img.alt], ['02', '02-console-mini.png', 'copy', 'The console with one step card and a Start button']);
  assert.deepEqual([f2.file, f2.caption, f2.captionFrom, f2.alt], ['03-fig-2.png', "Fig. 2: slow frames per day, from the phone's own log.", 'p.note after figure', "Fig. 2: slow frames per day, from the phone's own log."]);
  const [c1, c2] = m.blocks.filter((b) => b.kind === 'clip');
  assert.deepEqual([c1.n, c1.uid, c1.params, c1.video], ['01', '0123456789abcdef0123456789abcdef', { loop: 'true', autoplay: 'true', muted: 'true' }, 'mini-clip-strip.mp4']);
  assert.equal(c2.caption, '2 of 2. The end of the page.');
  const pulls = m.blocks.filter((b) => b.kind === 'quote' && b.pull);
  assert.deepEqual(pulls.map((b) => b.text), ['Laggy the same.']);
  assert.deepEqual(m.blocks.filter((b) => b.role === 'teambox').map((b) => b.text), ['How I ran the team', '• Day 1. One agent per problem.', '• Day 2. I left the chat.']);
  assert.equal(m.blocks[16].section, 'Day 1 · Wed 30 Sep: One goal');
  assert.equal(m.blocks[16].nth, 1);
});

test('a clip whose uid differs from the clip table is a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'));
  const tsv = join(dir, 'clips.tsv');
  writeFileSync(tsv, readFileSync(CLIPS, 'utf8').replace(/fedcba9876543210fedcba9876543210/, 'ffffffffffffffffffffffffffffffff'));
  const m = extractArticleFile(MINI, { clips: tsv });
  assert.equal(m.warnings.length, 1);
  assert.match(m.warnings[0], /clip 02 .*the clip table has ffff/);
});

test('the kit: alt text from alt.txt, and a stale kit is named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-kit-'));
  writeFileSync(join(dir, 'alt.txt'), ['01\t01-fig-1.png\tKit alt one', '02\t02-console-mini.png\tKit alt two', '03\t03-fig-2.png\tKit alt three'].join('\n') + '\n');
  const m = extractArticleFile(MINI, { kit: dir });
  assert.deepEqual(m.blocks.filter((b) => b.kind === 'picture').map((b) => [b.alt, b.altFrom]), [['Kit alt one', 'kit alt.txt'], ['Kit alt two', 'kit alt.txt'], ['Kit alt three', 'kit alt.txt']]);
  assert.deepEqual(m.kit.stale, []);
  writeFileSync(join(dir, 'alt.txt'), ['01\t01-fig-1.png\tKit alt one', '02\t02-fig-9.png\tOld'].join('\n') + '\n');
  const s = applyKit(extractArticleFile(MINI), dir);
  assert.equal(s.kit.stale.length, 2);
  assert.match(s.kit.stale.join('\n'), /picture 02: the kit has 02-fig-9.png/);
  assert.match(s.kit.stale.join('\n'), /picture 03 .* is not in the kit/);
});

test('Stream links: uid and player parameters', () => {
  assert.deepEqual(parseStreamUrl('https://iframe.videodelivery.net/0123456789abcdef0123456789abcdef?loop=true&autoplay=true&muted=true'),
    { uid: '0123456789abcdef0123456789abcdef', host: 'iframe.videodelivery.net', params: { loop: 'true', autoplay: 'true', muted: 'true' } });
  assert.equal(parseStreamUrl('https://example.org/x'), null);
  assert.equal(parseStreamUrl('not a url'), null);
});

test('the committed article page reads without warnings, and its clips match the clip table', { skip: !existsSync(REAL) && 'article page not in this checkout' }, () => {
  const m = extractArticleFile(REAL, { clips: existsSync(REAL_CLIPS) ? REAL_CLIPS : null });
  assert.deepEqual(m.warnings, []);
  assert.ok(m.title && m.subtitle && m.byline);
  assert.ok(m.disclaimer.length >= 1);
  const pics = m.blocks.filter((b) => b.kind === 'picture'), clips = m.blocks.filter((b) => b.kind === 'clip');
  assert.ok(pics.length >= 30 && clips.length >= 10, `${pics.length} pictures, ${clips.length} clips`);
  assert.deepEqual(pics.map((p) => p.n), pics.map((_, i) => String(i + 1).padStart(2, '0')));
  for (const p of pics) { assert.ok(p.caption, `picture ${p.n} has a caption`); assert.ok(p.alt, `picture ${p.n} has alt text`); }
  for (const c of clips) { assert.match(c.uid || '', /^[0-9a-f]{32}$/, `clip ${c.n} has a Stream uid`); assert.deepEqual(c.params, { loop: 'true', autoplay: 'true', muted: 'true' }); }
  assert.ok(!m.blocks.some((b) => b.role === 'unhandled'));
});

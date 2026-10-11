// The kit's text files (kit/render.mjs, no Chrome) and the guard of kit/build.mjs; model.mjs on the same files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { render } from '../kit/render.mjs';
import { extractArticleFile } from '../lib/article.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'article-mini.html');
const both = (t) => ({ md: t, html: t, text: t });

// kit.json as the in-page walker of kit/build.mjs writes it, for the mini article
function miniKit() {
  return { schema: 'fw-medium-kit/1', page: 'test/fixtures/article-mini.html', builtAt: '2026-10-11T00:00:00Z', warn: [],
    overflow: [{ fig: 'fig-1', over: 12, text: '0 ms' }],
    blocks: [
      { t: 'h1', ...both('Twelve Milliseconds: A Test Story') },
      { t: 'subtitle', ...both('A tiny article') },
      { t: 'p', cls: 'byline', ...both('Part one') },
      { t: 'p', cls: '', md: '*Times are UTC.*', html: '<em>Times are UTC.</em>', text: 'Times are UTC.' },
      { t: 'h3', ...both('Before the start') },
      { t: 'picture', kind: 'cap', id: 'fig-1', n: '01', file: '01-fig-1.png', cap: both('The frame ruler (Fig. 1; source)'), capFrom: 'figcaption', alt: 'A scale', px: { w: 2400, h: 400 } },
      { t: 'clip', n: '01', src: 'videos/mini-clip-strip.mp4', url: 'https://iframe.videodelivery.net/0123456789abcdef0123456789abcdef?loop=true&autoplay=true&muted=true', cap: both('1 of 2. A swipe.') },
      { t: 'quote', pull: true, paras: [both('Laggy the same.')] },
      { t: 'hr' },
    ] };
}

test('render: story.md markers, alt.txt, checklist notes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-kit-'));
  writeFileSync(join(dir, 'kit.json'), JSON.stringify(miniKit()));
  const s = render(dir);
  assert.deepEqual([s.pictures, s.clips, s.pulls, s.disclaimer], [1, 1, 1, 1]);
  const md = readFileSync(join(dir, 'story.md'), 'utf8');
  assert.match(md, /^# Twelve Milliseconds: A Test Story\n/);
  assert.match(md, /\[PICTURE 01 · 01-fig-1\.png\]\n\nCaption: The frame ruler/);
  assert.match(md, /\[CLIP 01 · paste on its own line, then Enter\]\n\nhttps:\/\/iframe\.videodelivery\.net\/0123/);
  assert.equal(readFileSync(join(dir, 'alt.txt'), 'utf8'), '01\t01-fig-1.png\tA scale\n');
  const cl = readFileSync(join(dir, 'CHECKLIST.md'), 'utf8');
  assert.match(cl, /Text past the edge in 01/);
  assert.match(cl, /check\.mjs --dump/);
  assert.match(readFileSync(join(dir, 'contact-sheet.html'), 'utf8'), /2400×400 px/);
});

test('the article model reads the kit.json that build.mjs writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-kit-'));
  const k = miniKit();
  // a kit for the whole mini article: three pictures
  k.blocks.push({ t: 'picture', kind: 'img', n: '02', file: '02-console-mini.png', src: 'gifs/console-mini.png', cap: both('The first console, one step card'), alt: 'Kit alt two' });
  k.blocks.push({ t: 'picture', kind: 'cap', id: 'fig-2', n: '03', file: '03-fig-2.png', cap: both("Fig. 2: slow frames per day, from the phone's own log."), alt: 'Kit alt three' });
  k.blocks.push({ t: 'clip', n: '02', url: 'https://iframe.videodelivery.net/fedcba9876543210fedcba9876543210?loop=true&autoplay=true&muted=true', cap: both('2 of 2.') });
  writeFileSync(join(dir, 'kit.json'), JSON.stringify(k));
  const m = extractArticleFile(MINI, { kit: dir });
  assert.equal(m.kit.from, 'kit.json');
  assert.deepEqual(m.kit.stale, []);
  assert.deepEqual(m.blocks.filter((b) => b.kind === 'picture').map((b) => b.alt), ['A scale', 'Kit alt two', 'Kit alt three']);
});

test('build.mjs refuses to start Chrome outside a chrome-measure hold', () => {
  const env = { ...process.env };
  delete env.FW_LOCK_HELD;
  const r = spawnSync(process.execPath, [join(HERE, '..', 'kit', 'build.mjs'), '--page', MINI, '--out', mkdtempSync(join(tmpdir(), 'mc-b-'))], { encoding: 'utf8', env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refused: run me inside `node tools\/lock\.mjs run chrome-measure/);
  assert.equal(spawnSync(process.execPath, [join(HERE, '..', 'kit', 'build.mjs'), '--help'], { encoding: 'utf8', env }).status, 0);
});

test('model.mjs prints the model, or a summary', () => {
  // the page as it is (--sources artifact), and the Medium default (none: no Sources heading, note and list)
  const r = spawnSync(process.execPath, [join(HERE, '..', 'model.mjs'), MINI, '--kit', 'none', '--summary', '--sources', 'artifact'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.deepEqual(s.counts, { p: 9, heading: 4, li: 4, picture: 3, clip: 2, quote: 6, hr: 2 });
  const n = JSON.parse(spawnSync(process.execPath, [join(HERE, '..', 'model.mjs'), MINI, '--kit', 'none', '--summary'], { encoding: 'utf8' }).stdout);
  assert.deepEqual(n.counts, { p: 8, heading: 3, li: 2, picture: 3, clip: 2, quote: 6, hr: 2 });
  const full = JSON.parse(spawnSync(process.execPath, [join(HERE, '..', 'model.mjs'), MINI, '--kit', 'none'], { encoding: 'utf8' }).stdout);
  assert.equal(full.schema, 'fw-article-model/1');
  assert.equal(full.blocks.find((b) => b.kind === 'picture').areaHtml, undefined, 'the figure HTML stays out of the printed model');
});

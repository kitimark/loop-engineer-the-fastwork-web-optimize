// Medium's alt text (lib/alt.mjs, kit/alt-medium.json): one source for the kit and the check, never cut, never over
// the limit; and Medium's automatic punctuation (curly quotes, en/em dashes) is not a difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyAltMedium, altProblems, loadAltMedium, altKey, ALT_FILE, ALT_LIMIT, ALT_TARGET } from '../lib/alt.mjs';
import { render, AltError } from '../kit/render.mjs';
import { extractArticleFile } from '../lib/article.mjs';
import { readDump, dumpFromHtml } from '../lib/medium.mjs';
import { compareModels } from '../lib/compare.mjs';
import { norm } from '../lib/text.mjs';
import { DEFAULT_ARTICLE } from '../lib/cli.mjs';
import { editorHtml, withTransfer, deepCopy } from './helpers/fake-medium.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'article-mini.html');
const CUT = String.fromCharCode(0x2026);
const both = (t) => ({ md: t, html: t, text: t });
const types = (r) => r.issues.map((i) => i.type);
const P = (m, n) => m.blocks.find((b) => b.kind === 'picture' && b.n === n);

test('applyAltMedium: by figure id or image file, idempotent, keeps the page alt; unused keys reported', () => {
  const pics = [
    { t: 'picture', kind: 'cap', id: 'fig-1', n: '01', file: '01-fig-1.png', alt: 'long page alt', altFrom: 'aria-label' },
    { t: 'picture', kind: 'img', src: 'gifs/console.png', n: '02', file: '02-console.png', alt: 'img alt', altFrom: 'img alt' },
    { t: 'picture', kind: 'cap', id: 'fig-3', n: '03', file: '03-fig-3.png', alt: 'kept', altFrom: 'figcaption' },
  ];
  assert.deepEqual(pics.map(altKey), ['fig-1', 'console.png', 'fig-3']);
  const src = { _about: 'a comment', 'fig-1': 'Short one.', 'console.png': 'Short two.', 'fig-gone': 'x' };
  const r = applyAltMedium(pics, src);
  assert.deepEqual(r, { applied: ['fig-1', 'console.png'], unused: ['fig-gone'] });
  assert.deepEqual(pics.map((p) => [p.alt, p.altFrom, p.altPage]), [
    ['Short one.', 'kit/alt-medium.json', 'long page alt'], ['Short two.', 'kit/alt-medium.json', 'img alt'], ['kept', 'figcaption', 'kept']]);
  applyAltMedium(pics, { 'fig-1': 'Changed.' }); // again, with another file: the page alt comes back where none is given
  assert.deepEqual(pics.map((p) => p.alt), ['Changed.', 'img alt', 'kept']);
  assert.equal(pics[1].altFrom, 'img alt');
  assert.equal(loadAltMedium(join(tmpdir(), 'no-such-alt.json')).size, 0);
  assert.equal(loadAltMedium(false).size, 0);
});

test('altProblems: over the limit, a cut mark, or empty; nothing is ever cut', () => {
  const p = (alt) => ({ n: '01', id: 'fig-1', alt });
  assert.deepEqual(altProblems([p('fine')]), []);
  assert.match(altProblems([p('x'.repeat(ALT_LIMIT + 1))])[0], /501 characters, over 500/);
  assert.equal(altProblems([p('x'.repeat(ALT_LIMIT))]).length, 0);
  assert.match(altProblems([p('then lost ' + CUT)])[0], /cut mark/);
  assert.match(altProblems([p('then lost...')])[0], /cut mark/);
  assert.match(altProblems([p('')])[0], /no alt text/);
});

test('kit/alt-medium.json: every alt at most 480 characters, uncut, for a picture the article has', () => {
  const map = loadAltMedium(ALT_FILE);
  assert.ok(map.size >= 16, 'the 16 pictures a Medium draft showed over 500 characters (11 Oct)');
  for (const [k, v] of map) {
    assert.ok(v.length <= ALT_TARGET, `${k}: ${v.length} characters`);
    assert.ok(!v.endsWith(CUT) && !v.endsWith('...'), `${k} ends in a cut mark`);
    assert.equal(v, v.trim(), `${k}: no leading or trailing space`);
  }
  const m = extractArticleFile(DEFAULT_ARTICLE, { altMedium: false });
  const ids = new Set(m.blocks.filter((b) => b.kind === 'picture').map(altKey));
  assert.deepEqual([...map.keys()].filter((k) => !ids.has(k)), [], 'every key is a figure of the article');
  // with the file applied (as the check does), no picture of the article is over Medium's limit
  const withAlt = extractArticleFile(DEFAULT_ARTICLE);
  assert.deepEqual(altProblems(withAlt.blocks.filter((b) => b.kind === 'picture')), []);
});

function kitDir(alt) {
  const dir = mkdtempSync(join(tmpdir(), 'mc-alt-'));
  writeFileSync(join(dir, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', page: 'x.html', builtAt: '2026-10-11T00:00:00Z', warn: [], overflow: [],
    blocks: [
      { t: 'h1', ...both('Title') }, { t: 'subtitle', ...both('Sub') },
      { t: 'p', cls: '', md: 'See `fixes/g0-0m/README.md` and fixes/g0-0l/README.md, about 1,000-1,700 px.', html: 'See <code>fixes/g0-0m/README.md</code> and fixes/g0-0l/README.md, about 1,000-1,700 px.', text: 'See fixes/g0-0m/README.md and fixes/g0-0l/README.md, about 1,000-1,700 px.' },
      { t: 'picture', kind: 'cap', id: 'fig-1', n: '01', file: '01-fig-1.png', cap: both('Cap'), capFrom: 'figcaption', alt, altFrom: 'aria-label' },
      { t: 'quote', pull: true, paras: [both('Laggy the same.')] },
    ] }));
  return dir;
}

test('render: a long alt with no short one refuses and writes nothing', () => {
  const dir = kitDir('word '.repeat(120).trim());
  assert.throws(() => render(dir, { altMedium: false }), (e) => e instanceof AltError && /over 500/.test(e.message));
  assert.ok(!existsSync(join(dir, 'alt.txt')) && !existsSync(join(dir, 'CHECKLIST.md')));
  const cli = spawnSync(process.execPath, [join(HERE, '..', 'kit', 'render.mjs'), '--out', kitDir('x ' + CUT)], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /refused: alt text Medium cannot take/);
});

test('render: the short alt goes into alt.txt and kit.json (page alt kept); the checklist has the Medium notes', () => {
  const long = 'word '.repeat(120).trim();
  const dir = kitDir(long);
  render(dir, { altMedium: { 'fig-1': 'A short alt.' } });
  assert.equal(readFileSync(join(dir, 'alt.txt'), 'utf8'), '01\t01-fig-1.png\tA short alt.\n');
  const k = JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8'));
  const p = k.blocks.find((b) => b.t === 'picture');
  assert.deepEqual([p.alt, p.altFrom, p.altPage, p.altPageFrom], ['A short alt.', 'kit/alt-medium.json', long, 'aria-label']);
  const cl = readFileSync(join(dir, 'CHECKLIST.md'), 'utf8');
  assert.match(cl, /1 alt texts are Medium's short versions\*\* from `kit\/alt-medium.json` \(01\)/);
  assert.doesNotMatch(cl, /over 500 characters\*\*/);
  assert.match(cl, /first line \(the h1\) becomes the story title by itself/);
  assert.match(cl, /small heading \(⌘⌥2\)/);
  assert.match(cl, /goes in ABOVE the line, so delete the empty line after it \(OBSERVED\)/);
  assert.match(cl, /clip's caption can only be edited after clicking the player/);
  assert.match(cl, /quote button once more \(or ⌘⌥5\)/);
  assert.match(cl, /Backspace while a picture is selected deletes the picture/);
  assert.match(cl, /## Tags \(set in the publish dialog; 5 tags, OBSERVED/);
  assert.match(cl, /## Medium's automatic punctuation \(OBSERVED in the Medium editor, 11 Oct\)/);
  assert.match(cl, /Paths and code with a hyphen between digits.*`fixes\/g0-0m\/README.md`, `fixes\/g0-0l\/README.md`\./);
  assert.doesNotMatch(cl, /general knowledge of Medium/);
  // render again without the short alt: the page alt comes back from altPage, is too long, so nothing changes
  assert.throws(() => render(dir, { altMedium: false }), AltError);
  assert.equal(readFileSync(join(dir, 'alt.txt'), 'utf8'), '01\t01-fig-1.png\tA short alt.\n');
  assert.equal(JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')).blocks.find((b) => b.t === 'picture').alt, 'A short alt.');
});

test('build.mjs never cuts an alt (no "…" cut in the walker) and checks it before writing', () => {
  const src = readFileSync(join(HERE, '..', 'kit', 'build.mjs'), 'utf8');
  assert.doesNotMatch(src, /lastIndexOf\(' ', 900\)/);
  assert.match(src, /altProblems\(pics\)/);
  assert.ok(src.indexOf('if (refused)') < src.indexOf("writeFileSync(join(KIT, 'kit.json')"), 'refuses before kit.json is written');
});

test('check: the short alt is the reference, with or without a kit; a kit with another alt is stale', () => {
  const alt = { 'fig-1': 'A short “alt” for Medium.' };
  const s = extractArticleFile(MINI, { altMedium: alt });
  assert.equal(P(s, '01').alt, 'A short "alt" for Medium.');
  assert.equal(P(s, '01').altFrom, 'kit/alt-medium.json');
  const med = readDump(withTransfer(dumpFromHtml(editorHtml(deepCopy(s)))));
  assert.deepEqual(types(compareModels(s, med)), []);
  const wrong = deepCopy(s); P(wrong, '01').alt = 'The long page description';
  assert.deepEqual(types(compareModels(s, readDump(withTransfer(dumpFromHtml(editorHtml(wrong)))))), ['ALT']);
  // a kit with the old long alt: KIT stale, and the reference stays the short alt
  const dir = mkdtempSync(join(tmpdir(), 'mc-alt-kit-'));
  writeFileSync(join(dir, 'alt.txt'), '01\t01-fig-1.png\tThe long page description\n02\t02-console-mini.png\tTwo\n03\t03-fig-2.png\tThree\n');
  const sk = extractArticleFile(MINI, { altMedium: alt, kit: dir });
  assert.equal(P(sk, '01').alt, 'A short "alt" for Medium.');
  assert.deepEqual(sk.kit.stale, ["picture 01 (01-fig-1.png): the kit's alt text is not the one in kit/alt-medium.json"]);
  writeFileSync(join(dir, 'alt.txt'), '01\t01-fig-1.png\tA short "alt" for Medium.\n02\t02-console-mini.png\tTwo\n03\t03-fig-2.png\tThree\n');
  assert.deepEqual(extractArticleFile(MINI, { altMedium: alt, kit: dir }).kit.stale, []);
});

test("Medium's automatic punctuation is not a difference: curly quotes, digit hyphen -> en dash, en -> em dash", () => {
  // each pair: what the kit pastes, what Medium shows (OBSERVED in the Medium editor, 11 Oct)
  const pairs = [
    ['the page "felt" slow, it\'s fine', 'the page “felt” slow, it’s fine'],
    ['1,000-1,700 px', '1,000–1,700 px'],
    ['fixes/g0-0m/README.md', 'fixes/g0–0m/README.md'],
    ['smooth – but not yet', 'smooth — but not yet'],
  ];
  for (const [a, b] of pairs) assert.equal(norm(a), norm(b), b);
  // the same through the whole check: a paragraph and a picture caption with all four changes
  const s = extractArticleFile(MINI, { altMedium: false });
  const para = s.blocks.find((b) => b.kind === 'p' && b.text.startsWith('At 17:05'));
  para.text = norm(pairs.map((p) => p[0]).join('; '));
  const m = deepCopy(s);
  m.blocks.find((b) => b.kind === 'p' && b.text.startsWith('the page')).text = pairs.map((p) => p[1]).join('; ');
  P(m, '03').caption = P(m, '03').caption.replace(/'/g, '’');
  const r = compareModels(s, readDump(withTransfer(dumpFromHtml(editorHtml(m)))));
  assert.deepEqual(r.issues, []);
});

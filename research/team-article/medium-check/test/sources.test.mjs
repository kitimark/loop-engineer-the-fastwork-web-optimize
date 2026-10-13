// Sources mode (lib/sources.mjs): none drops the Sources section and every reference to it, github links them,
// artifact (no flag) leaves the model as it was; the kit, check.mjs and changes.mjs use the same transform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { extractArticle, extractArticleFile } from '../lib/article.mjs';
import { applySourcesDom, sourcesConfig, sourceResidue, seedMap, loadSourcesMap, MAP_FILE, SourcesError } from '../lib/sources.mjs';
import { parseHTML, find, isTag } from '../lib/html.mjs';
import { readDump, dumpFromHtml } from '../lib/medium.mjs';
import { compareModels } from '../lib/compare.mjs';
import { changes } from '../changes.mjs';
import { render } from '../kit/render.mjs';
import { editorHtml, withTransfer } from './helpers/fake-medium.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures', 'article-sources.html');
const MINI = join(HERE, 'fixtures', 'article-mini.html');
const HTML = readFileSync(FIX, 'utf8');
const ARTICLE = join(HERE, '..', '..', 'artifacts', 'sixteen-milliseconds', 'index.html');
// the counts below are v109's (v112 took the link out of the lessons picture): that test reads the committed v109
const V109 = join(HERE, '..', '..', 'artifacts', 'sixteen-milliseconds', 'versions', 'p1-v109.html');
const BASE = 'https://example.test/owner/repo/blob/main';
const texts = (m) => m.blocks.flatMap((b) => [b.text, b.caption, b.alt]).filter(Boolean);
const block = (m, start) => m.blocks.find((b) => (b.text || '').startsWith(start));
const cap = (m, kind, n) => m.blocks.find((b) => b.kind === kind && b.n === n).caption;

test('none: every reference pattern goes, without dangling punctuation or double spaces', () => {
  const m = extractArticle(HTML, { sources: 'none' });
  assert.equal(cap(m, 'picture', '01'), 'The frame ruler for every count (Fig. 1)');
  assert.equal(cap(m, 'clip', '01'), '1 of 2. The swipe. Real iPhone screen, address bar cropped off, real speed.');
  assert.equal(cap(m, 'picture', '02'), 'How fast each page warmed the phone, and the same test on 11 Oct (Fig. 6)');
  assert.equal(cap(m, 'picture', '03'), 'The phone check behind v6 (Fig. 7). Top: 4 Oct. Bottom: 11 Oct.');
  assert.equal(block(m, 'No carousel').text, 'No carousel picture took more than 34 ms in every run (4 runs each). Clip 1 at the top shows the carousel. It stays.');
  assert.equal(block(m, 'The two only').text, 'The two only compare how each felt (table below).');
  assert.equal(block(m, 'Against 2 and 6').text, "Against 2 and 6 (Serious set by a tool). Not yet checked against WebKit's source.");
  assert.equal(block(m, 'A first item').text, 'A first item before the reference (Fig. 9) and a middle one (Fig. 9; 11 Oct).');
  assert.equal(block(m, '4 more').text, '4 more were rejected, withdrawn or sent back.');
  assert.equal(cap(m, 'picture', '04'), 'If we did it again, from our own logs');
  assert.equal(cap(m, 'picture', '05'), 'Fig. 9: slow frames in four moments.', 'a p.note caption');
  assert.equal(cap(m, 'clip', '02'), '2 of 2. The end of the page.');
  // the Sources section: heading, both note paragraphs and the list are gone; the closing note stays
  assert.ok(!m.blocks.some((b) => b.kind === 'heading' && /Sources/.test(b.text)));
  assert.ok(!m.blocks.some((b) => /its own entry|Run ids|thresholds from CLAUDE/.test(b.text || '')));
  assert.equal(m.blocks.at(-1).text, 'Draft built from the day log. Not affiliated with anyone.');
  for (const t of texts(m)) assert.ok(!/ {2}| [.,;)]|\(\s*\)|\( |;\)/.test(t), `dangling punctuation or double space: "${t}"`);
  // nothing that reads as a reference is left; the prose uses of "source" stay
  assert.deepEqual(texts(m).flatMap(sourceResidue), []);
  assert.ok(!texts(m).some((t) => /#src-|\bSources\b|\(source\)|; source/.test(t)));
  assert.deepEqual(texts(m).filter((t) => /\bsource\b/i.test(t)), [
    'The optimized page and the source code are not public yet.',
    "Against 2 and 6 (Serious set by a tool). Not yet checked against WebKit's source.",
    'The lead read the WebKit source, and see Day 1 for the start.',
  ]);
  // the reference drawn inside a picture stays (pictures never change) and is reported
  assert.equal(m.sources.mode, 'none');
  assert.equal(m.sources.footer, 'removed');
  assert.deepEqual(m.sources.inPicture.map((p) => [p.src, p.figure]), [['src-7', 'lessons']]);
  assert.ok(m.warnings.some((w) => /drawn inside picture #lessons/.test(w)));
  assert.equal(m.sources.removed, 16);
  assert.deepEqual(m.sources.unhandled, []);
});

test('none: a reference in an unknown shape is reported, not guessed', () => {
  const html = HTML.replace('<p>The two only', '<p>For the numbers see <a href="#src-5">the list</a> at the end.</p>\n<p>The two only');
  const m = extractArticle(html, { sources: 'none' });
  assert.equal(block(m, 'For the numbers').text, 'For the numbers see the list at the end.', 'left as it was');
  assert.equal(m.sources.unhandled.length, 1);
  assert.ok(m.warnings.some((w) => /not removed \(no known pattern\): "For the numbers see the list/.test(w)));
});

test('github: references link to <base>/<path> from the map; the Sources list stays; a src without a path goes', () => {
  const map = { 'src-1': 'CLAUDE.md', 'src-2': 'fixes/worst-cases-capture/README.md', 'src-3': 'research/phone heat/README.md', 'src-4': 'research/phone-heat/README.md', 'src-5': 'fixes/st6-rb2/README.md', 'src-6': null, 'src-7': 'fixes/BEST_BUILDS.md' };
  const cfg = sourcesConfig({ mode: 'github', base: BASE + '/', map });
  const m = extractArticle(HTML, { sources: cfg });
  assert.equal(m.sources.label, `github (${BASE})`);
  const pic1 = m.blocks.find((b) => b.kind === 'picture' && b.n === '01');
  assert.equal(pic1.caption, 'The frame ruler for every count (Fig. 1; source)');
  assert.deepEqual(pic1.links, [`${BASE}/CLAUDE.md`]);
  assert.deepEqual(m.blocks.find((b) => b.kind === 'picture' && b.n === '02').links, [`${BASE}/research/phone%20heat/README.md`, `${BASE}/research/phone-heat/README.md`]);
  assert.deepEqual(block(m, 'No carousel').links, [`${BASE}/fixes/st6-rb2/README.md`, `${BASE}/fixes/st6-rb2/README.md`]);
  // src-6 has no path: removed as in none, with a warning
  assert.equal(block(m, '4 more').text, '4 more were rejected, withdrawn or sent back.');
  assert.deepEqual(m.sources.unmapped, ['src-6']);
  assert.ok(m.warnings.some((w) => /no repo path for src-6/.test(w)));
  // the list is kept, its entries unchanged
  assert.equal(m.sources.footer, 'kept');
  assert.ok(m.blocks.some((b) => b.kind === 'heading' && b.text === 'Sources'));
  assert.equal(m.blocks.filter((b) => b.kind === 'li' && b.list === 'ol').length, 7);
  assert.equal(m.sources.linked, 13);
  assert.equal(m.sources.removed, 3, 'only the src-6 references');
  assert.throws(() => sourcesConfig({ mode: 'github' }), SourcesError);
  assert.throws(() => sourcesConfig({ mode: 'bogus' }), SourcesError);
});

test('artifact (no flag): the model is the page as it is', () => {
  const plain = extractArticle(HTML);
  assert.deepEqual(extractArticle(HTML, { sources: 'artifact' }), plain);
  assert.deepEqual(extractArticle(HTML, { sources: null }), plain);
  assert.equal(plain.sources, undefined);
  assert.equal(cap(plain, 'picture', '01'), 'The frame ruler for every count (Fig. 1; source)');
  assert.ok(plain.blocks.some((b) => b.kind === 'heading' && b.text === 'Sources'));
  assert.equal(plain.blocks.filter((b) => b.kind === 'li' && b.list === 'ol').length, 7);
  // the mini fixture: same model with and without an explicit artifact mode, and none changes only its sources
  assert.deepEqual(extractArticleFile(MINI, { sources: 'artifact' }), extractArticleFile(MINI));
});

test('the real article v109: none leaves no reference; artifact keeps all 74 links as before', () => {
  const none = extractArticleFile(V109, { sources: 'none' });
  assert.deepEqual(texts(none).flatMap(sourceResidue), []);
  assert.equal(none.sources.footer, 'removed');
  assert.equal(none.sources.removed, 73);
  assert.deepEqual(none.sources.inPicture.map((p) => p.figure), ['lessons-numbers']);
  assert.deepEqual(none.sources.unhandled, []);
  const art = extractArticleFile(V109);
  assert.ok(art.blocks.some((b) => b.kind === 'heading' && b.text === 'Sources'));
  assert.equal(texts(art).filter((t) => /\(source\)|; source\)/.test(t)).length, 67, 'captions and paragraphs with a reference');
  // none removes exactly: the heading, its note paragraph and the 44 entries
  assert.equal(art.blocks.length - none.blocks.length, 46);
});

test('the transform is self-contained: its source text (what kit/build.mjs injects into Chrome) runs alone', () => {
  const fn = new Function(`return (${applySourcesDom.toString()})`)();
  const run = (f) => { const d = parseHTML(HTML); const main = find(d, isTag('main')); const r = f(main, { mode: 'none' }); return { r, html: main.innerHTML }; };
  const a = run(fn), b = run(applySourcesDom);
  assert.equal(a.html, b.html);
  assert.equal(a.r.removed, 16);
  assert.ok(!/href="#src-/.test(a.html.replace(/<div class="cap-area">[\s\S]*?<\/div>/g, '')));
});

test('the mapping file: seeded from the paths in the Sources entries, every key a src id', () => {
  const seeded = seedMap(find(parseHTML(HTML), isTag('main')));
  assert.deepEqual(seeded, { 'src-1': 'CLAUDE.md', 'src-2': 'fixes/worst-cases-capture/README.md', 'src-3': 'research/phone-heat/README.md', 'src-4': null, 'src-5': 'fixes/st6-rb2/README.md', 'src-6': null, 'src-7': 'fixes/BEST_BUILDS.md' });
  const map = loadSourcesMap(MAP_FILE);
  assert.ok(Object.keys(map).length >= 44);
  for (const [k, v] of Object.entries(map)) {
    assert.match(k, /^src-\d+$/);
    assert.ok(v === null || /^[A-Za-z0-9._\-/]+$/.test(v), `${k}: ${v}`);
  }
});

test('check: a Medium draft pasted with sources, checked in mode none, lists exactly the source edits', () => {
  const art = extractArticle(HTML);
  const none = extractArticle(HTML, { sources: 'none' });
  const med = readDump(withTransfer(dumpFromHtml(editorHtml(art))));
  assert.deepEqual(compareModels(art, med).issues, [], 'clean in artifact mode');
  const r = compareModels(none, med);
  const by = (t) => r.issues.filter((i) => i.type === t);
  assert.equal(by('CAPTION').length, 7, r.issues.map((i) => i.type + ' ' + i.where).join('\n'));
  assert.equal(by('TEXT').length, 5);
  assert.equal(by('EXTRA').length, 10, 'heading, 2 notes, 7 entries');
  assert.equal(r.issues.length, 22);
  const medNone = readDump(withTransfer(dumpFromHtml(editorHtml(none))));
  assert.deepEqual(compareModels(none, medNone).issues, [], 'clean after the edits');
});

test('check.mjs: --sources, and a WARN when the kit was built in another mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-src-'));
  const dumpArt = join(dir, 'art.json'), dumpNone = join(dir, 'none.json');
  writeFileSync(dumpArt, withTransfer(dumpFromHtml(editorHtml(extractArticle(HTML)))));
  writeFileSync(dumpNone, withTransfer(dumpFromHtml(editorHtml(extractArticle(HTML, { sources: 'none' })))));
  const cli = (...a) => spawnSync(process.execPath, [join(HERE, '..', 'check.mjs'), '--article', FIX, '--clips', join(HERE, 'fixtures', 'clips-mini.tsv'), ...a], { encoding: 'utf8' });
  const clean = cli('--kit', 'none', '--dump', dumpNone);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /sources mode none: 16 reference\(s\) removed, 0 linked, Sources section removed/);
  const old = cli('--kit', 'none', '--dump', dumpArt);
  assert.equal(old.status, 1);
  assert.match(old.stdout, /CHECK FAIL 22 differences/);
  assert.equal(cli('--kit', 'none', '--dump', dumpArt, '--sources', 'artifact').status, 0);
  assert.equal(cli('--kit', 'none', '--dump', dumpArt, '--sources', 'github').status, 2, 'github needs a base');
  assert.equal(cli('--kit', 'none', '--dump', dumpArt, '--sources', 'bogus').status, 2);
  // a kit built before the switch (no "sources" in kit.json) is an artifact kit: WARN in mode none
  const kit = join(dir, 'kit');
  spawnSync('mkdir', [kit]);
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', blocks: [] }));
  const warn = cli('--kit', kit, '--dump', dumpNone);
  assert.match(warn.stdout, /WARN article: sources: the kit was built in sources mode artifact, this run uses none/);
  assert.match(warn.stdout, /sources mode none \(kit: artifact\)/);
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', sources: { mode: 'none' }, blocks: [] }));
  assert.doesNotMatch(cli('--kit', kit, '--dump', dumpNone).stdout, /built in sources mode/);
});

test('model.mjs and changes.mjs take --sources (default none); changes --from-sources makes the to-do list', () => {
  const model = (...a) => JSON.parse(spawnSync(process.execPath, [join(HERE, '..', 'model.mjs'), FIX, '--kit', 'none', '--summary', ...a], { encoding: 'utf8' }).stdout);
  assert.equal(model().sources.mode, 'none');
  assert.equal(model('--sources', 'artifact').sources, undefined);
  assert.equal(model('--sources', 'github', '--github-base', BASE).sources.mode, 'github');
  const r = changes(HTML, HTML, { fromSources: null, sources: sourcesConfig({ mode: 'none' }) });
  const L = r.ops.map((o) => `${o.at}: ${o.text}`);
  assert.equal(r.ops.filter((o) => o.op === 'delete').length, 10, L.join('\n'));
  assert.ok(L.some((l) => /^Picture 01 \(01-fig-1\.png\): caption: .*\(Fig\. \[-1; source\)-\]\{\+1\)\+\}/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /delete small heading: "Sources"/.test(l)), L.join('\n'));
  assert.deepEqual(r.rebuild, [], 'no picture to rebuild');
  assert.deepEqual(r.sources, ['artifact', 'none']);
  const out = spawnSync(process.execPath, [join(HERE, '..', 'changes.mjs'), FIX, FIX, '--from-sources', 'artifact'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /sources mode artifact -> none/);
  assert.match(out.stdout, /To do in Medium, in story order \(22\):/);
  assert.match(spawnSync(process.execPath, [join(HERE, '..', 'changes.mjs'), FIX, FIX], { encoding: 'utf8' }).stdout, /Nothing to change in Medium/);
});

test('render: the checklist says what the sources mode left out, and flags anything left', () => {
  const both = (t) => ({ md: t, html: t, text: t });
  const kit = (sources, capText) => ({ schema: 'fw-medium-kit/1', page: 'x.html', builtAt: 'now', warn: [], overflow: [], ...(sources ? { sources } : {}),
    blocks: [{ t: 'h1', ...both('T') }, { t: 'picture', kind: 'cap', id: 'lessons', n: '01', file: '01-lessons.png', cap: both(capText), alt: 'a' }] });
  const run = (k) => { const dir = mkdtempSync(join(tmpdir(), 'mc-src-kit-')); writeFileSync(join(dir, 'kit.json'), JSON.stringify(k)); render(dir); return readFileSync(join(dir, 'CHECKLIST.md'), 'utf8'); };
  const none = run(kit({ mode: 'none', report: { removed: 16, blocks: [1, 2], inPicture: [{ src: 'src-7', text: 'source', figure: 'lessons' }], unhandled: [] } }, 'From our logs'));
  assert.match(none, /sources mode none\./);
  assert.match(none, /No Sources section on Medium.*\n.*\(16 references in 2 captions and paragraphs\)/);
  assert.match(none, /01 \(`01-lessons\.png`\) still shows "\(source\)" inside the picture/);
  assert.doesNotMatch(none, /Source references left/);
  assert.match(run(kit({ mode: 'none', report: null }, 'From our logs (source)')), /Source references left in the text.*"From our logs \(source\)"/);
  const old = run(kit(null, 'From our logs (source)'));
  assert.match(old, /sources mode artifact\./);
  assert.match(old, /The numbered Sources list at the end stays as it is/);
  assert.match(run(kit({ mode: 'github', base: BASE, report: { unmapped: ['src-6'] } }, 'x')), /Source links go to GitHub.*example\.test[\s\S]*No repo path for src-6/);
});

// github-inline (owner's decision T-279 #10): the references link to GitHub as in github, the footer goes as in none
const MAP = { 'src-1': 'CLAUDE.md', 'src-2': 'fixes/worst-cases-capture/README.md', 'src-3': 'research/phone heat/README.md', 'src-4': 'research/phone-heat/README.md', 'src-5': 'fixes/st6-rb2/README.md', 'src-6': null, 'src-7': 'fixes/BEST_BUILDS.md' };

test('github-inline: the Sources section goes; the inline references stay and link to <base>/<path>', () => {
  const m = extractArticle(HTML, { sources: sourcesConfig({ mode: 'github-inline', base: BASE, map: MAP }) });
  assert.equal(m.sources.mode, 'github-inline');
  assert.equal(m.sources.label, `github-inline (${BASE})`);
  // the footer: heading, both note paragraphs and the list are gone, the closing note stays (as in none)
  assert.equal(m.sources.footer, 'removed');
  assert.ok(!m.blocks.some((b) => b.kind === 'heading' && /Sources/.test(b.text)));
  assert.ok(!m.blocks.some((b) => /its own entry|Run ids|thresholds from CLAUDE/.test(b.text || '')));
  assert.equal(m.blocks.filter((b) => b.kind === 'li' && b.list === 'ol').length, 0);
  assert.equal(m.blocks.at(-1).text, 'Draft built from the day log. Not affiliated with anyone.');
  // the references: words kept, links at the base (as in github)
  const pic1 = m.blocks.find((b) => b.kind === 'picture' && b.n === '01');
  assert.equal(pic1.caption, 'The frame ruler for every count (Fig. 1; source)');
  assert.deepEqual(pic1.links, [`${BASE}/CLAUDE.md`]);
  assert.deepEqual(m.blocks.find((b) => b.kind === 'picture' && b.n === '02').links, [`${BASE}/research/phone%20heat/README.md`, `${BASE}/research/phone-heat/README.md`]);
  assert.deepEqual(block(m, 'No carousel').links, [`${BASE}/fixes/st6-rb2/README.md`, `${BASE}/fixes/st6-rb2/README.md`]);
  for (const b of m.blocks) for (const l of b.links || []) assert.ok(!/#src-/.test(l), `${l} still points into the page`);
  assert.equal(m.sources.linked, 13);
  // src-6 has no path: removed as in none, with a warning
  assert.equal(block(m, '4 more').text, '4 more were rejected, withdrawn or sent back.');
  assert.deepEqual(m.sources.unmapped, ['src-6']);
  assert.equal(m.sources.removed, 3);
  // the "(source)" words are links now, not residue; nothing points at the dropped list
  assert.ok(texts(m).some((t) => /\(source\)|; source\)/.test(t)));
  assert.ok(!m.warnings.some((w) => /still reads as a source reference/.test(w)), m.warnings.join('\n'));
  assert.deepEqual(texts(m).flatMap((t) => sourceResidue(t, 'github-inline')), []);
  assert.deepEqual(sourceResidue('see the Sources list (source)', 'github-inline'), ['see the Sources list (source)', 'see the Sources list (source)']);
  // the same blocks as github minus the footer; the same footer as none
  const gh = extractArticle(HTML, { sources: sourcesConfig({ mode: 'github', base: BASE, map: MAP }) });
  const none = extractArticle(HTML, { sources: 'none' });
  assert.equal(gh.blocks.length - m.blocks.length, 10, 'heading, 2 notes, 7 entries');
  assert.equal(m.blocks.length, none.blocks.length);
  assert.throws(() => sourcesConfig({ mode: 'github-inline' }), /--sources github-inline needs --github-base/);
});

test('github-inline: the transform source text runs alone, like the kit injects it', () => {
  const cfg = sourcesConfig({ mode: 'github-inline', base: BASE, map: MAP });
  const fn = new Function(`return (${applySourcesDom.toString()})`)();
  const run = (f) => { const d = parseHTML(HTML); const main = find(d, isTag('main')); const r = f(main, JSON.parse(JSON.stringify(cfg))); return { r, html: main.innerHTML }; };
  const a = run(fn), b = run(applySourcesDom);
  assert.equal(a.html, b.html);
  assert.equal(a.r.footer, 'removed');
  assert.equal(a.r.linked, 13);
  assert.ok(!/class="figsrc"/.test(a.html));
  assert.ok(a.html.includes(`href="${BASE}/CLAUDE.md"`));
});

test('github-inline on the CLIs: check, model and changes take it; a kit in github mode is a WARN', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-src-gi-'));
  const mapFile = join(dir, 'map.json');
  writeFileSync(mapFile, JSON.stringify(MAP));
  const flags = ['--sources', 'github-inline', '--github-base', BASE, '--sources-map', mapFile];
  const inl = extractArticle(HTML, { sources: sourcesConfig({ mode: 'github-inline', base: BASE, map: MAP }) });
  const dump = join(dir, 'gi.json');
  writeFileSync(dump, withTransfer(dumpFromHtml(editorHtml(inl))));
  const cli = (...a) => spawnSync(process.execPath, [join(HERE, '..', 'check.mjs'), '--article', FIX, '--clips', join(HERE, 'fixtures', 'clips-mini.tsv'), ...a], { encoding: 'utf8' });
  const clean = cli('--kit', 'none', '--dump', dump, ...flags);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /sources mode github-inline \(https:\/\/example\.test\/owner\/repo\/blob\/main\): 3 reference\(s\) removed, 13 linked, Sources section removed/);
  assert.equal(cli('--kit', 'none', '--dump', dump, '--sources', 'github-inline').status, 2, 'github-inline needs a base');
  // a github kit checked in github-inline: WARN
  const kit = join(dir, 'kit');
  spawnSync('mkdir', [kit]);
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', sources: { mode: 'github', base: BASE }, blocks: [] }));
  assert.match(cli('--kit', kit, '--dump', dump, ...flags).stdout, /the kit was built in sources mode github, this run uses github-inline/);
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', sources: { mode: 'github-inline', base: BASE }, blocks: [] }));
  assert.doesNotMatch(cli('--kit', kit, '--dump', dump, ...flags).stdout, /built in sources mode|the kit links sources to/);
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ schema: 'fw-medium-kit/1', sources: { mode: 'github-inline', base: 'https://example.test/other' }, blocks: [] }));
  assert.match(cli('--kit', kit, '--dump', dump, ...flags).stdout, /the kit links sources to https:\/\/example\.test\/other, this run to github-inline/);
  // model.mjs
  const model = JSON.parse(spawnSync(process.execPath, [join(HERE, '..', 'model.mjs'), FIX, '--kit', 'none', '--summary', ...flags], { encoding: 'utf8' }).stdout);
  assert.equal(model.sources.mode, 'github-inline');
  assert.equal(model.sources.footer, 'removed');
  assert.equal(model.sources.linked, 13);
  // changes.mjs: from a Medium draft in none to github-inline: the references come back as links, no footer edit
  const r = changes(HTML, HTML, { fromSources: sourcesConfig({ mode: 'none' }), sources: sourcesConfig({ mode: 'github-inline', base: BASE, map: MAP }) });
  const L = r.ops.map((o) => `${o.at}: ${o.text}`);
  assert.deepEqual(r.sources, ['none', `github-inline (${BASE})`]);
  assert.equal(r.ops.filter((o) => o.op === 'delete' || o.op === 'add').length, 0, L.join('\n'));
  assert.ok(L.some((l) => /^Picture 01 \(01-fig-1\.png\): caption: .*\(Fig\. \[-1\)-\]\{\+1; source\)\+\}/.test(l)), L.join('\n'));
  const out = spawnSync(process.execPath, [join(HERE, '..', 'changes.mjs'), FIX, FIX, '--from-sources', 'none', ...flags], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /sources mode none -> github-inline \(https:\/\/example\.test/);
});

test('render: the github-inline checklist says the links go to GitHub and the Sources list is left out', () => {
  const both = (t) => ({ md: t, html: t, text: t });
  const kit = (sources, capText) => ({ schema: 'fw-medium-kit/1', page: 'x.html', builtAt: 'now', warn: [], overflow: [], sources,
    blocks: [{ t: 'h1', ...both('T') }, { t: 'picture', kind: 'cap', id: 'lessons', n: '01', file: '01-lessons.png', cap: both(capText), alt: 'a' }] });
  const run = (k) => { const dir = mkdtempSync(join(tmpdir(), 'mc-src-kit-')); writeFileSync(join(dir, 'kit.json'), JSON.stringify(k)); render(dir); return readFileSync(join(dir, 'CHECKLIST.md'), 'utf8'); };
  const md = run(kit({ mode: 'github-inline', base: BASE, report: { linked: 70, removed: 3, blocks: [], unmapped: ['src-6'], inPicture: [{ src: 'src-7', text: 'source', figure: 'lessons' }], unhandled: [] } }, 'From our logs (source)'));
  assert.match(md, new RegExp(`sources mode github-inline \\(${BASE.replace(/[./]/g, '\\$&')}\\)\\.`));
  assert.match(md, /Source links go to GitHub, no Sources section.*\n.*\(70 links\); the\n\s+numbered Sources list at the end is left out/);
  assert.doesNotMatch(md, /Source references left/, 'a "(source)" link is no residue in github-inline');
  assert.match(md, /01 \(`01-lessons\.png`\) still shows "\(source\)" inside the picture/);
  assert.match(md, /No repo path for src-6/);
  assert.match(run(kit({ mode: 'github-inline', base: BASE, report: null }, 'See the Sources list')), /Source references left in the text\*\* although the kit is in sources mode github-inline.*"See the Sources list"/);
});

test('the real article: github-inline with the repo map links every mapped reference and drops the footer', { skip: !/src-44/.test(readFileSync(ARTICLE, 'utf8')) && 'article changed' }, () => {
  const base = 'https://github.com/kitimark/loop-engineer-the-fastwork-web-optimize/blob/v1.0';
  const m = extractArticleFile(ARTICLE, { sources: sourcesConfig({ mode: 'github-inline', base }) });
  const none = extractArticleFile(ARTICLE, { sources: 'none' });
  assert.equal(m.sources.footer, 'removed');
  assert.equal(m.blocks.length, none.blocks.length, 'the same blocks as none: only the footer goes');
  assert.ok(!m.blocks.some((b) => b.kind === 'heading' && b.text === 'Sources'));
  assert.deepEqual(m.sources.unhandled, []);
  assert.equal(m.sources.linked + m.sources.removed, none.sources.removed, 'every reference none removes is linked, or removed for want of a path');
  assert.ok(m.sources.linked > 50, `${m.sources.linked} linked`);
  const links = m.blocks.flatMap((b) => b.links || []);
  assert.ok(links.filter((l) => l.startsWith(base + '/')).length >= m.sources.linked);
  assert.ok(!links.some((l) => /#src-/.test(l)));
  assert.ok(!m.warnings.some((w) => /still reads as a source reference/.test(w)), m.warnings.join('\n'));
});

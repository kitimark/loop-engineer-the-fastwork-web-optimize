// changes.mjs: the to-do list between two article versions, and which kit pictures to rebuild.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { changes } from '../changes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = readFileSync(join(HERE, 'fixtures', 'article-mini.html'), 'utf8');
const ART = join(HERE, '..', '..', 'artifacts', 'sixteen-milliseconds');
const CHANGES = join(HERE, '..', 'changes.mjs');
const lines = (r) => r.ops.map((o) => `${o.at}: ${o.text}`);

test('same page: nothing to do', () => {
  const r = changes(MINI, MINI);
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.rebuild, []);
  assert.deepEqual(r.pageWide, []);
});

test('text edit, new and deleted blocks, picture drawing, caption, clip link, new picture', () => {
  const v2 = MINI
    .replace('At 17:05 I asked how to connect the phone.', 'At 17:05 I asked how to attach the phone.')
    .replace('<p>The end.</p>', '<p>The end.</p>\n<p>A new closing line.</p>')
    .replace('<li>A very slow frame took over 50 ms.</li>', '')
    .replace('<text x="2" y="18">0 ms</text>', '<text x="2" y="18">0 to 60 ms</text>')
    .replace('<figcaption>The first console, one step card</figcaption>', '<figcaption>The first console, with one step card</figcaption>')
    .replace(/fedcba9876543210fedcba9876543210/g, 'abababababababababababababababab')
    .replace('<figure class="cap" data-capture="ready" id="fig-2">', '<figure class="cap" data-capture="ready" id="fig-3"><div class="cap-area"><svg role="img" aria-label="New chart"></svg></div><figcaption>A new chart</figcaption></figure>\n<figure class="cap" data-capture="ready" id="fig-2">');
  const r = changes(MINI, v2);
  const L = lines(r);
  assert.ok(L.some((l) => /^Day 1 · Wed 30 Sep, paragraph 1 \("At 17:05.*change text: .*\[-connect-\]\{\+attach\+\}/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /add paragraph: "A new closing line\."/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /delete list item: "A very slow frame took over 50 ms\."/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /^Picture 01 \(01-fig-1\.png\): picture changed: re-upload 01-fig-1\.png/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /^Picture 02 \(02-console-mini\.png\): caption: .*\{\+with\+\}/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /^Clip 02: replace the embed: .*abababab/.test(l)), L.join('\n'));
  assert.ok(L.some((l) => /^after Day 1 · Wed 30 Sep, quote 5 \(".*Day 2\. I left the chat\."\): add picture 03-fig-3\.png .*A new chart/.test(l)), L.join('\n'));
  assert.deepEqual(r.rebuild.map(([n]) => n), ['01', '03']);
  assert.deepEqual(r.renumbered, [['03', '04', '04-fig-2.png']], 'Fig. 2 moves from 03 to 04');
  // story order: the Day 1 edit comes before the new chart, the new closing line comes last
  assert.ok(L.findIndex((l) => /attach/.test(l)) < L.findIndex((l) => /03-fig-3/.test(l)));
  assert.match(L.at(-1), /add paragraph: "A new closing line\."/);
});

test('a style change asks for a full rebuild', () => {
  const r = changes(MINI, MINI.replace('.cap-area { padding: 8px; }', '.cap-area { padding: 12px; }'));
  assert.deepEqual(r.ops, []);
  assert.equal(r.pageWide.length, 1);
  assert.match(r.pageWide[0], /styles/);
});

test('committed versions: v104 -> v105 is one paragraph; v105 -> v106 rebuilds Fig. 4 and Fig. 6', { skip: !existsSync(join(ART, 'versions', 'p1-v105.html')) && 'versions not in this checkout' }, () => {
  const v = (n) => readFileSync(join(ART, 'versions', `p1-v${n}.html`), 'utf8');
  const a = changes(v(104), v(105));
  assert.equal(a.ops.length, 1);
  assert.match(a.ops[0].text, /^change text: .*criticism of fastwork\.com/);
  assert.deepEqual(a.rebuild, []);
  const b = changes(v(105), v(106));
  assert.deepEqual(b.rebuild.map(([n, why]) => `${n} ${why}`), ['05 #fig-4 drawing changed', '13 #fig-6 drawing changed']);
  assert.equal(b.ops.length, 2);
});

test('changes.mjs CLI: two files, --json, usage errors exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-ch-'));
  const a = join(dir, 'a.html'), b = join(dir, 'b.html');
  writeFileSync(a, MINI);
  writeFileSync(b, MINI.replace('Times are UTC.', 'Times are in UTC.'));
  const out = spawnSync(process.execPath, [CHANGES, a, b], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /To do in Medium, in story order \(1\):/);
  assert.match(out.stdout, /change text: Times are \{\+in\+\} UTC\./);
  const js = JSON.parse(spawnSync(process.execPath, [CHANGES, a, b, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(js.ops.length, 1);
  assert.equal(spawnSync(process.execPath, [CHANGES, a], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CHANGES, a, join(dir, 'missing.html')], { encoding: 'utf8' }).status, 2);
});

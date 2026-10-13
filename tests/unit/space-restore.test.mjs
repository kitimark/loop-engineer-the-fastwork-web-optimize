// I-275 restore (tools/lib/space-restore.mjs): images the I-124 auto-clean deleted come back from their frames-pruned.json
// records, from the same path in site/ or an exact name + size match (console store, out/, research/, git history) whose
// candidates all have one content; ambiguous and unmatched ones stay out; records leave deploy trees for pruned-records/.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tempDir, git } from '../helpers.mjs';

const R = await import('../../tools/lib/space-restore.mjs');
const { RECORD, THUMB_DIR } = await import('../../tools/lib/space-prune.mjs');
const MTIME = '2026-10-05T01:02:03.000Z';
let root, main, out, site, consoleDir, otherOut;

const put = (p, body = 'x') => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); return p; };
const record = (dir, images) => {
  put(join(dir, RECORD), JSON.stringify({ schema: 'fw-frames-pruned/1', images: images.map(([name, body]) => ({ name, bytes: Buffer.byteLength(body), mtime: MTIME })), thumbs: { dir: THUMB_DIR, files: ['a.png'] } }));
  put(join(dir, THUMB_DIR, 'a.png'), 'thumb');
};
const opts = (o = {}) => ({ outRoots: [out], siteRoot: site, searchDirs: [consoleDir, out, otherOut, join(main, 'research')], gitRoot: main, ...o });
const status = (pl, rel) => Object.fromEntries(pl.folders.find((f) => f.rel === rel).images.map((i) => [i.name, i.status]));

beforeEach(() => {
  root = tempDir('fw-restore-');
  main = join(root, 'main');
  out = join(main, 'out');
  site = join(root, 'site');
  consoleDir = join(root, 'state', 'console');
  otherOut = join(root, 'wt', 'out');
  mkdirSync(main, { recursive: true });
  git(main, 'init', '-q', '-b', 'main');
  // only in git history: committed, then deleted
  put(join(main, 'research', 'old', 'gitonly.png'), 'GITONLY');
  git(main, 'add', '-A');
  git(main, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'x');
  rmSync(join(main, 'research', 'old'), { recursive: true });
  put(join(site, 'images', 'logo.png'), 'LOGO');
  put(join(site, '_app', 'hero.webp'), 'HERO!');
  put(join(consoleDir, 'proposals', 'PR-022', 'r1-a-1.png'), 'PROPOSAL');
  put(join(main, 'research', 'r', 'twin.png'), 'TWIN');
  put(join(otherOut, 'x', 'twin.png'), 'TWIN');
  put(join(main, 'research', 'r', 'clash.png'), 'CLASH-1');
  put(join(otherOut, 'y', 'clash.png'), 'CLASH-2');
  put(join(otherOut, 'y', 'wrongsize.png'), 'WRONG-SIZE-HERE');
  put(join(main, 'research', 'r', 'fig.png'), 'FIGURE');
  // a deploy tree (index.html at its top) and article material
  put(join(out, 'pages-export', 'index.html'), '<html>');
  record(join(out, 'pages-export', 'builds', 'v7', 'images'), [['logo.png', 'LOGO'], ['hero.webp', 'HERO!'], ['r1-a-1.png', 'PROPOSAL'], ['twin.png', 'TWIN'], ['clash.png', 'CLASH-0'], ['wrongsize.png', 'WRONG'], ['gitonly.png', 'GITONLY'], ['here.png', 'HERE']]);
  put(join(out, 'pages-export', 'builds', 'v7', 'images', 'here.png'), 'HERE');
  record(join(out, 'article', 'medium-kit'), [['fig.png', 'FIGURE']]);
  record(join(out, 'archive', 'agent-x', 'out', 'sim'), [['fig.png', 'FIGURE']]);
  // the lead's hand-moved record: no origin
  record(join(out, 'cf-review', 'original', 'pruned-records', 'selling'), [['logo.png', 'LOGO']]);
});

test('plan: site/ path first, then name + size with one content; ambiguous, wrong size, present; archive only on request; hand-moved records unmapped', () => {
  const pl = R.planRestore(opts());
  assert.deepEqual(pl.folders.map((f) => f.rel).sort(), ['article/medium-kit', 'pages-export/builds/v7/images']);
  assert.deepEqual(status(pl, 'pages-export/builds/v7/images'), {
    'logo.png': 'site', 'hero.webp': 'match', 'r1-a-1.png': 'match', 'twin.png': 'match', 'clash.png': 'ambiguous', 'wrongsize.png': 'not-found', 'gitonly.png': 'match', 'here.png': 'present',
  });
  const im = (n) => pl.folders.find((f) => f.rel.startsWith('pages')).images.find((i) => i.name === n);
  assert.equal(im('logo.png').from.path, join(site, 'images', 'logo.png'));
  assert.equal(im('gitonly.png').from.kind, 'git');
  assert.equal(im('twin.png').candidates, 2);
  assert.equal(pl.folders.find((f) => f.rel.startsWith('pages')).deployRoot, join(out, 'pages-export'));
  assert.equal(pl.folders.find((f) => f.rel.startsWith('article')).deployRoot, null);
  assert.deepEqual(pl.unmapped.map((u) => u.why), ['in pruned-records/ without origin (moved by hand)']);
  assert.ok(R.planRestore(opts({ archive: true })).folders.some((f) => f.rel === 'archive/agent-x/out/sim'));
  // one of the two contents gone: the other one is restorable
  rmSync(join(otherOut, 'y', 'clash.png'));
  assert.equal(status(R.planRestore(opts()), 'pages-export/builds/v7/images')['clash.png'], 'match');
  // no git: the history-only image is not found
  assert.equal(status(R.planRestore(opts({ gitRoot: null })), 'pages-export/builds/v7/images')['gitonly.png'], 'not-found');
});

test('apply: restores exact bytes with the record mtime, moves deploy-tree records to pruned-records/ with origin; a second run is a no-op', () => {
  const dir = join(out, 'pages-export', 'builds', 'v7', 'images');
  const res = R.applyRestore(R.planRestore(opts()), { gitRoot: main, by: 'test' });
  assert.equal(res.failed.length, 0, JSON.stringify(res.failed));
  assert.equal(res.restored.length, 6);
  for (const [n, b] of [['logo.png', 'LOGO'], ['hero.webp', 'HERO!'], ['r1-a-1.png', 'PROPOSAL'], ['twin.png', 'TWIN'], ['gitonly.png', 'GITONLY']]) {
    assert.equal(readFileSync(join(dir, n), 'utf8'), b, n);
    assert.equal(statSync(join(dir, n)).mtime.toISOString(), MTIME);
  }
  for (const n of ['clash.png', 'wrongsize.png']) assert.equal(existsSync(join(dir, n)), false, `${n} stays out`);
  assert.equal(readFileSync(join(out, 'article', 'medium-kit', 'fig.png'), 'utf8'), 'FIGURE');
  // records: out of the deploy tree, kept beside it; article material keeps its record in place
  assert.equal(existsSync(join(dir, RECORD)) || existsSync(join(dir, THUMB_DIR)), false);
  const home = join(out, 'pruned-records', 'pages-export', 'builds', 'v7', 'images');
  const moved = JSON.parse(readFileSync(join(home, RECORD), 'utf8'));
  assert.equal(moved.origin, 'pages-export/builds/v7/images');
  assert.equal(moved.images.length, 8);
  assert.deepEqual(readdirSync(join(home, THUMB_DIR)), ['a.png']);
  assert.ok(existsSync(join(out, 'article', 'medium-kit', RECORD)));
  assert.deepEqual(res.moved.map((m) => m.to), [home]);
  // the moved record still maps to its folder; nothing more to do
  const again = R.planRestore(opts());
  const st = status(again, 'pages-export/builds/v7/images');
  assert.deepEqual([st['logo.png'], st['gitonly.png'], st['clash.png']], ['present', 'present', 'ambiguous']);
  const res2 = R.applyRestore(again, { gitRoot: main });
  assert.deepEqual([res2.restored.length, res2.moved.length, res2.failed.length], [0, 0, 0]);
});

test('apply checks again: a source that changed since the plan, or a file now in place, is not written', () => {
  const dir = join(out, 'pages-export', 'builds', 'v7', 'images');
  const pl = R.planRestore(opts());
  put(join(consoleDir, 'proposals', 'PR-022', 'r1-a-1.png'), 'PROPOSAX');
  put(join(dir, 'twin.png'), 'NEW!');
  const res = R.applyRestore(pl, { gitRoot: main });
  assert.deepEqual(res.failed.map((f) => f.why).sort(), ['a file is there now', 'the source changed since the plan']);
  assert.equal(existsSync(join(dir, 'r1-a-1.png')), false);
  assert.equal(readFileSync(join(dir, 'twin.png'), 'utf8'), 'NEW!');
});

test('renderRestore: a per-folder table, unmapped records, dry run wording', () => {
  const txt = R.renderRestore(R.planRestore(opts()), null, (p) => relative(main, p));
  assert.match(txt, /^RESTORE PLAN \(dry run\): 2 record\(s\)/);
  assert.match(txt, /out\/pages-export\s+1\s+8\s+1\s+1\s+4\s+1\s+1$/m);
  assert.match(txt, /out\/article\s+1\s+1\s+0\s+0\s+1\s+0\s+0$/m);
  assert.match(txt, /UNMAPPED 1 record\(s\) under out\/cf-review\/original: in pruned-records\/ without origin/);
  assert.match(txt, /1 record\(s\) in deploy trees would move to pruned-records\//);
  assert.equal(existsSync(join(out, 'pages-export', 'builds', 'v7', 'images', 'logo.png')), false, 'a plan writes nothing');
});

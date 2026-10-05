// tools/fix.mjs in a throwaway repo: the fixture baseline sits in the temp main checkout (like the real
// site/ + site-pretty/), commands run from a real linked worktree and find it via git-common-dir.
// Covers doctor, new (+ main-checkout guard, --allow-main), list, grep, show, edit, diff, apply
// (--check, --reset byte-identical), combine (clean + CONFLICT), --on stacking, serve, ab validation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeTempRepo, node, startProc, request, sha256, git } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS, CHUNK_JS } from '../fixtures/baseline.mjs';

let repo, fx;
const fix = (cwd, args, env = {}) => node(join(cwd, 'tools', 'fix.mjs'), args, { cwd, env });
const wt = (...args) => fix(repo.wt, args);
const ov = (t, p = '') => join(repo.wt, 'fixes', t, 'overlay', p.replace(/^\//, ''));
function snapshot(dir) {
  const out = {};
  const walk = (d) => { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f); else out[relative(dir, f)] = sha256(readFileSync(f)); } };
  if (existsSync(dir)) walk(dir);
  return out;
}
function replaceIn(file, from, to) {
  const s = readFileSync(file, 'utf8');
  assert.ok(s.includes(from), `${from} not in ${file}`);
  writeFileSync(file, s.replace(from, to));
}

before(() => {
  repo = makeTempRepo({ worktree: 'fix-wt' });
  fx = makeFixtureHome(repo.main);
});
after(() => {});

test('doctor: main checkout vs linked worktree, baseline and lock dir', () => {
  const d = wt('doctor');
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^linked worktree\s+yes$/m);
  assert.match(d.stdout, new RegExp(`^mirror home\\s+${repo.main}$`, 'm'));
  assert.match(d.stdout, new RegExp(`^baseline\\s+${repo.main}/site-pretty OK$`, 'm'));
  assert.match(d.stdout, new RegExp(`^byte-identical mirror\\s+${repo.main}/site OK$`, 'm'));
  assert.match(d.stdout, new RegExp(`^lock dir\\s+${repo.main}/\\.git/fastwork-mirror/locks$`, 'm'));
  assert.match(d.stdout, /^serve --port auto starts at\s+5[2-9]\d\d$/m);
  assert.match(d.stdout, /chrome-measure\s+free/);
  const m = fix(repo.main, ['doctor']);
  assert.match(m.stdout, /^linked worktree\s+no \(main checkout\)$/m);
  const missing = fix(repo.wt, ['doctor'], { FW_MIRROR_HOME: join(repo.root, 'nowhere') });
  assert.match(missing.stdout, /^baseline\s+.*MISSING$/m);
});

test('usage: no command prints help (0), unknown command exits 2', () => {
  const h = wt();
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Per-fix workflow/);
  assert.equal(wt('frobnicate').code, 2);
});

test('new: refuses the main checkout unless --allow-main / FW_ALLOW_MAIN=1; validates topic', () => {
  const r = fix(repo.main, ['new', 'main-topic']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /refusing to create a fix in the main checkout/);
  assert.equal(existsSync(join(repo.main, 'fixes', 'main-topic')), false);
  assert.equal(fix(repo.main, ['new', 'main-topic', '--allow-main']).code, 0);
  assert.ok(existsSync(join(repo.main, 'fixes', 'main-topic', 'overlay')));
  assert.equal(fix(repo.main, ['new', 'main-topic2'], { FW_ALLOW_MAIN: '1' }).code, 0);
  rmSync(join(repo.main, 'fixes', 'main-topic'), { recursive: true });
  rmSync(join(repo.main, 'fixes', 'main-topic2'), { recursive: true });
  for (const bad of ['Bad_Topic', 'x', '-lead', '../escape']) assert.equal(wt('new', bad).code, 2, bad);
});

test('new in a worktree: README from the template, empty overlay; README is never overwritten', () => {
  const r = wt('new', 't1');
  assert.equal(r.code, 0, r.out);
  const readme = join(repo.wt, 'fixes', 't1', 'README.md');
  assert.match(readFileSync(readme, 'utf8'), /^# Fix: t1$/m);
  assert.doesNotMatch(readFileSync(readme, 'utf8'), /<topic>/);
  assert.ok(existsSync(ov('t1')));
  writeFileSync(readme, 'my notes\n');
  assert.equal(wt('new', 't1').code, 0);
  assert.equal(readFileSync(readme, 'utf8'), 'my notes\n');
});

test('grep and show read the pretty baseline (FW_BASE=site switches to the minified tree)', () => {
  const g = wt('grep', 'getBoundingClientRect');
  assert.equal(g.code, 0);
  assert.match(g.stdout, /^_app\/immutable\/nodes\/2\.fixture\.js:4: return e \? e\.getBoundingClientRect\(\)\.top : 0;$/m);
  assert.match(wt('grep', 'GETBOUNDINGCLIENTRECT', '-i').stdout, /2\.fixture\.js:4:/);
  assert.match(wt('grep', 'GETBOUNDINGCLIENTRECT', '--i').stdout, /2\.fixture\.js:4:/);
  const nf = wt('grep', 'x', '/nope.js');
  assert.equal(nf.code, 2);
  assert.match(nf.stderr, /^not in baseline: nope\.js$/m);
  assert.equal(wt('grep', 'getBoundingClientRect', CHUNK_JS).stdout, '');
  assert.match(wt('grep', 'e', '--max', '2').stdout, /stopped at --max 2/);
  assert.match(wt('grep', 'start-selling-top-nav').stdout, /index\.html:\d+:/);
  const min = fix(repo.wt, ['grep', 'getBoundingClientRect'], { FW_BASE: 'site' });
  assert.match(min.stdout, /2\.fixture\.js:1: import\{clamp/);

  const s = wt('show', PAGE_JS, '--lines', '2-4');
  assert.equal(s.stdout, '     2  function measure() {\n     3    const e = document.querySelector(".hero");\n     4    return e ? e.getBoundingClientRect().top : 0;\n');
  assert.equal(wt('show', 'site-pretty' + PAGE_JS, '--lines', '2').stdout, '     2  function measure() {\n');
  assert.equal(wt('show', '/nope.js').code, 2);
  assert.equal(wt('show', '/../etc/passwd').code, 2);
});

test('edit copies baseline files into the overlay (once), rejects unknown and escaping paths', () => {
  const r = wt('edit', 't1', PAGE_JS);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(ov('t1', PAGE_JS), 'utf8'), fx.prettyFiles[PAGE_JS]);
  writeFileSync(ov('t1', PAGE_JS), 'changed');
  assert.match(wt('edit', 't1', PAGE_JS).stdout, /already in overlay/);
  assert.equal(readFileSync(ov('t1', PAGE_JS), 'utf8'), 'changed');
  assert.equal(wt('edit', 't1', PAGE_JS, '--force').code, 0);
  assert.equal(readFileSync(ov('t1', PAGE_JS), 'utf8'), fx.prettyFiles[PAGE_JS]);
  assert.equal(wt('edit', 't1', '/not/there.js').code, 2);
  assert.match(wt('edit', 't1', '/_app/../../x').stderr, /bad path/);
  assert.equal(wt('edit', 't1').code, 2);
  assert.equal(fix(repo.main, ['edit', 't1', PAGE_JS]).code, 2, 'main checkout guard');
});

test('diff: refuses empty / unchanged overlays, writes a git-style patch with base hashes', () => {
  wt('new', 'empty-one');
  assert.match(wt('diff', 'empty-one').stderr, /overlay is empty/);
  const same = wt('diff', 't1');
  assert.equal(same.code, 2);
  assert.match(same.stderr, /identical to the baseline/);

  replaceIn(ov('t1', PAGE_JS), 'n.style.transform = "translateY(" + c(t / 10, -5, 5) + "px)";', 'n.style.translate = "0 " + c(t / 10, -5, 5) + "px";');
  mkdirSync(ov('t1', '/_app/extra'), { recursive: true });
  writeFileSync(ov('t1', '/_app/extra/new.js'), 'export const added = 1;\n');
  const d = wt('diff', 't1');
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /wrote fixes\/t1\/patch\.diff: 2 file\(s\), \+2 -1 lines/);
  const patch = readFileSync(join(repo.wt, 'fixes', 't1', 'patch.diff'), 'utf8');
  assert.match(patch, /^# fastwork mirror fix: t1$/m);
  assert.match(patch, /^# baseline: site-pretty\//m);
  assert.match(patch, /^# rebuild the overlay with: node tools\/fix\.mjs apply t1$/m);
  assert.match(patch, /never push/);
  assert.ok(patch.includes(`# base-sha256 _app/immutable/nodes/2.fixture.js ${sha256(fx.prettyFiles[PAGE_JS])}`));
  assert.ok(patch.includes('# base-sha256 _app/extra/new.js (new file)'));
  assert.ok(patch.includes('diff --git a/_app/immutable/nodes/2.fixture.js b/_app/immutable/nodes/2.fixture.js\n--- a/_app/immutable/nodes/2.fixture.js\n+++ b/_app/immutable/nodes/2.fixture.js\n@@'));
  assert.ok(patch.includes('-    n.style.transform = "translateY(" + c(t / 10, -5, 5) + "px)";\n+    n.style.translate = "0 " + c(t / 10, -5, 5) + "px";'));
  assert.ok(patch.includes('diff --git a/_app/extra/new.js b/_app/extra/new.js\nnew file mode 100644\n--- /dev/null\n+++ b/_app/extra/new.js'));
  assert.ok(!patch.includes(repo.root), 'no absolute paths leak into the patch');
});

test('apply: --check, refuses a non-empty overlay, --reset rebuilds it byte-identically', () => {
  const before = snapshot(ov('t1'));
  const chk = wt('apply', 't1', '--check');
  assert.equal(chk.code, 1, 'check against an already-patched overlay fails: ' + chk.out);
  const busy = wt('apply', 't1');
  assert.equal(busy.code, 2);
  assert.match(busy.stderr, /not empty; add --reset/);
  const r = wt('apply', 't1', '--reset');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK\s+fixes\/t1\/patch\.diff/m);
  assert.deepEqual(snapshot(ov('t1')), before);
  // from scratch (a fresh clone of the branch has no overlay)
  rmSync(ov('t1'), { recursive: true });
  assert.equal(wt('apply', 't1').code, 0);
  assert.deepEqual(snapshot(ov('t1')), before);
  // --check on a clean overlay dir passes and writes nothing
  wt('new', 'probe');
  const c2 = wt('apply', 'probe', '--from', 't1', '--check');
  assert.equal(c2.code, 0, c2.out);
  assert.deepEqual(Object.keys(snapshot(ov('probe'))).filter((f) => f.endsWith('new.js')), []);
});

test('combine: independent patches apply cleanly; overlapping ones are reported as CONFLICT', () => {
  // t2: CSS only (independent of t1)
  wt('new', 't2'); wt('edit', 't2', PAGE_CSS);
  replaceIn(ov('t2', PAGE_CSS), 'animation: spin 2s linear infinite;', 'animation: spin 4s linear infinite;');
  assert.equal(wt('diff', 't2').code, 0);
  // t3: same line of the page JS as t1, different change
  wt('new', 't3'); wt('edit', 't3', PAGE_JS);
  replaceIn(ov('t3', PAGE_JS), 'n.style.transform = "translateY(" + c(t / 10, -5, 5) + "px)";', 'n.style.top = c(t / 10, -5, 5) + "px";');
  assert.equal(wt('diff', 't3').code, 0);

  const ok = wt('combine', 'wave1', 't1', 't2');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /all 2 patches applied/);
  assert.match(readFileSync(ov('wave1', PAGE_JS), 'utf8'), /n\.style\.translate = /);
  assert.match(readFileSync(ov('wave1', PAGE_CSS), 'utf8'), /spin 4s/);
  assert.equal(readFileSync(ov('wave1', '/_app/extra/new.js'), 'utf8'), 'export const added = 1;\n');

  const bad = wt('combine', 'clash', 't1', 't3');
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /^applied\s+t1\s/m);
  assert.match(bad.stdout, /^CONFLICT t3\s+_app\/immutable\/nodes\/2\.fixture\.js/m);
  assert.match(bad.stdout, /1 patch\(es\) did not apply/);
  assert.match(readFileSync(ov('clash', PAGE_JS), 'utf8'), /n\.style\.translate = /, 't1 stays applied');
  assert.equal(wt('combine', 'solo', 't1').code, 2, 'needs >= 2 topics');
});

test('--on: stack a fix on a combined overlay (edit copies from it, diff/apply are relative to it)', () => {
  assert.equal(wt('new', 'stack').code, 0);
  assert.equal(wt('edit', 'stack', PAGE_JS, '--on', 'wave1').code, 0);
  assert.equal(readFileSync(ov('stack', PAGE_JS), 'utf8'), readFileSync(ov('wave1', PAGE_JS), 'utf8'), 'copied from the wave, not the baseline');
  replaceIn(ov('stack', PAGE_JS), 'const b = document.body;', 'const b = document.documentElement;');
  const d = wt('diff', 'stack', '--on', 'wave1');
  assert.equal(d.code, 0, d.out);
  const patch = readFileSync(join(repo.wt, 'fixes', 'stack', 'patch.diff'), 'utf8');
  assert.match(patch, /^# STACKED on fixes\/wave1\/overlay/m);
  assert.match(patch, /^# rebuild the overlay with: node tools\/fix\.mjs apply stack --on wave1$/m);
  assert.ok(patch.includes('+    const b = document.documentElement;'));
  assert.ok(!patch.includes('+    n.style.translate'), 'the wave\'s own change is not part of this patch');
  const before = snapshot(ov('stack'));
  assert.equal(wt('apply', 'stack', '--reset', '--on', 'wave1').code, 0);
  assert.deepEqual(snapshot(ov('stack')), before);
  const missing = wt('diff', 'stack', '--on', 'no-such-wave');
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /--on no-such-wave: fixes\/no-such-wave\/overlay does not exist/);
});

test('list shows every fix with overlay / patch / results state (skips _template)', () => {
  const l = wt('list');
  assert.equal(l.code, 0);
  assert.match(l.stdout, /^t1\s+overlay\s+2 files\s+patch\.diff yes\s+results\.json no$/m);
  assert.match(l.stdout, /^empty-one\s+overlay\s+0 files\s+patch\.diff no/m);
  assert.doesNotMatch(l.stdout, /_template/);
});

test('serve <topic>: baseline + overlay on an auto port with the calibrated defaults; SIGTERM stops the server', async (t) => {
  // a failed assertion must not leave the server running: its live child kept this file's event loop up and hung
  // npm test for 24 min (I-065); stop() on an already-stopped process is a no-op
  const procs = [];
  t.after(() => Promise.all(procs.map((x) => x.stop())));
  const s = await startProc(process.execPath, [join(repo.wt, 'tools', 'fix.mjs'), 'serve', 't1'], { cwd: repo.wt });
  procs.push(s);
  assert.match(s.url, /^https:\/\/localhost:5[2-9]\d\d\/$/);
  assert.match(s.stdout(), /tools\/serve\.mjs --root .*site-pretty --overlay .*fixes\/t1\/overlay --port auto --state .*serve-t1\.json --vendors=local --https --latency 150/);
  const js = await request(s.url + PAGE_JS.slice(1));
  assert.equal(js.headers['x-mirror-source'], 'overlay');
  assert.equal(js.text, readFileSync(ov('t1', PAGE_JS), 'utf8'));
  const chunk = await request(s.url + CHUNK_JS.slice(1));
  assert.equal(chunk.headers['x-mirror-source'], 'base');
  const stateFile = join(repo.wt, 'out', 'serve-t1.json');
  const st = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(st.url, s.url);
  await s.stop();
  for (let i = 0; i < 40 && existsSync(stateFile); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(existsSync(stateFile), false, 'the serve.mjs child exited too (it removes its state file)');
  let alive = true;
  try { process.kill(st.pid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'serve.mjs child must not outlive fix.mjs serve');

  // passthrough args replace the defaults
  const p = await startProc(process.execPath, [join(repo.wt, 'tools', 'fix.mjs'), 'serve', 't1', '--', '--quiet', '--vendors=block'], { cwd: repo.wt });
  procs.push(p);
  assert.match(p.url, /^http:\/\//);
  await p.stop();
  assert.equal(wt('serve', 'no-such-topic').code, 2);
});

test('ab: argument validation happens before any server or Chrome starts', () => {
  const cases = [
    [fix(repo.main, ['ab', 't1']), /refusing to write results in the main checkout/],
    [wt('ab', 'Bad_Topic'), /topic must be kebab-case/],
    [wt('ab', 'empty-one'), /overlay is empty/],
    [wt('ab', 't1', '--viewport', 'both'), /--viewport must be mobile or desktop/],
  ];
  for (const [r, re] of cases) { assert.equal(r.code, 2, r.out); assert.match(r.stderr, re); }
  assert.equal(existsSync(join(repo.wt, 'out', 'ab')), false, 'nothing was started');
});

test('the overlays are gitignored: only README.md / patch.diff show up as changes', () => {
  const st = git(repo.wt, 'status', '--porcelain', '--untracked-files=all');
  assert.doesNotMatch(st, /overlay\//);
  assert.match(st, /fixes\/t1\/patch\.diff/);
  assert.match(st, /fixes\/t1\/README\.md/);
  assert.doesNotMatch(st, /^.. out\//m);
});

test('I-209 diff: a binary overlay file is listed in a note (patch.diff cannot carry it; the Try-it takes it from the overlay), text files are unaffected', () => {
  assert.equal(wt('new', 'bin-note').code, 0);
  assert.equal(wt('edit', 'bin-note', PAGE_CSS).code, 0);
  writeFileSync(ov('bin-note', PAGE_CSS), fx.prettyFiles[PAGE_CSS] + '/* text change */\n');
  const text = wt('diff', 'bin-note');
  assert.equal(text.code, 0, text.out);
  assert.doesNotMatch(text.stdout, /binary/i, 'no note when every changed file is text');
  mkdirSync(ov('bin-note', '/img'), { recursive: true });
  writeFileSync(ov('bin-note', '/img/end.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 0xff]));
  const d = wt('diff', 'bin-note');
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^wrote fixes\/bin-note\/patch\.diff: 2 file\(s\), \+1 -0 lines$/m, 'the output format is unchanged');
  assert.match(d.stdout, /^note: binary files differ and are not carried by patch\.diff \(Binary files differ\): img\/end\.png$/m);
  assert.match(d.stdout, /--live-overlay fixes\/bin-note\/overlay/, 'the note names the way to show them in a proposal');
  const patch = readFileSync(join(repo.wt, 'fixes', 'bin-note', 'patch.diff'), 'utf8');
  assert.ok(!patch.includes('\u0089PNG'), 'no image bytes in the patch');
  rmSync(join(repo.wt, 'fixes', 'bin-note'), { recursive: true, force: true });
});

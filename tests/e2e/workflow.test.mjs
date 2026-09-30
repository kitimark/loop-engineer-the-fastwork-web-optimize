// The workflow a fix agent actually runs (CLAUDE.md "Fix workflow in a worktree", AGENT_PROMPT.md),
// start to finish in a throwaway repo whose main checkout holds the fixture baseline:
//   git worktree add (teammate step 0) -> doctor -> new -> grep/show -> edit -> change + node --check
//   -> diff -> apply --reset -> fix.mjs serve (background) -> patched vs base file over HTTPS
//   -> commit only the deliverables (pre-commit hook active) -> remove the worktree and branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, run, git, startProc, startServe, request, sha256 } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, CHUNK_JS } from '../fixtures/baseline.mjs';

test('fix-agent workflow in a real git worktree, end to end', async (t) => {
  const repo = makeTempRepo({ worktree: null, withHooks: true });
  const fx = makeFixtureHome(repo.main);
  git(repo.main, 'config', 'core.hooksPath', '.githooks');
  const topic = 'nav-raf';
  const wt = join(repo.main, '.claude', 'worktrees', `fix-${topic}`);
  const fix = (...a) => { const r = node(join(wt, 'tools', 'fix.mjs'), a, { cwd: wt }); assert.equal(r.code, 0, `fix.mjs ${a.join(' ')}\n${r.out}`); return r.stdout; };
  const servers = [];
  t.after(async () => { await Promise.all(servers.map((s) => s.stop())); });

  // 0. the teammate enters its own worktree (as in CLAUDE.md)
  git(repo.main, 'worktree', 'add', '-q', wt, '-b', `fix/${topic}`);
  assert.equal(existsSync(join(wt, 'site-pretty')), false, 'a worktree has no copy of the baseline');

  // 1. doctor
  const doc = fix('doctor');
  assert.match(doc, /^linked worktree\s+yes$/m);
  assert.match(doc, /^baseline\s+.*site-pretty OK$/m);

  // 2. new + find the code
  fix('new', topic);
  const hit = fix('grep', 'getBoundingClientRect').trim().split('\n')[0];
  const [, file, line] = hit.match(/^(.+?):(\d+): /);
  assert.equal('/' + file, PAGE_JS);
  assert.match(fix('show', PAGE_JS, '--lines', `${line}-${line}`), /getBoundingClientRect/);

  // 3. copy into the overlay, change it, node --check
  fix('edit', topic, PAGE_JS);
  const ovFile = join(wt, 'fixes', topic, 'overlay', PAGE_JS.slice(1));
  const src = readFileSync(ovFile, 'utf8');
  const patched = src.replace('function tick() {\n  const n = document.querySelector(".start-selling-top-nav");', 'const nav = document.querySelector(".start-selling-top-nav");\nfunction tick() {\n  const n = nav;');
  assert.notEqual(patched, src);
  writeFileSync(ovFile, patched);
  assert.equal(run(process.execPath, ['--check', ovFile]).code, 0);

  // 4. diff -> patch.diff; apply --reset reproduces the overlay byte for byte
  assert.match(fix('diff', topic), /wrote fixes\/nav-raf\/patch\.diff: 1 file\(s\), \+2 -1 lines/);
  const before = sha256(readFileSync(ovFile));
  fix('apply', topic, '--reset');
  assert.equal(sha256(readFileSync(ovFile)), before);

  // 5. serve the fix (background, calibrated defaults) and a plain baseline; compare what they serve
  const fixSrv = await startProc(process.execPath, [join(wt, 'tools', 'fix.mjs'), 'serve', topic], { cwd: wt });
  servers.push(fixSrv);
  const baseSrv = await startServe(['--root', 'site-pretty', '--port', 'auto', '--https', '--quiet'], { cwd: wt, script: join(wt, 'tools', 'serve.mjs') });
  servers.push(baseSrv);
  assert.notEqual(fixSrv.port, baseSrv.port);
  for (const s of [fixSrv, baseSrv]) assert.ok(s.port >= 5200 && s.port <= 6059 && s.port !== 5173);
  const [p, b] = await Promise.all([request(fixSrv.url + PAGE_JS.slice(1)), request(baseSrv.url + PAGE_JS.slice(1))]);
  assert.equal(p.headers['x-mirror-source'], 'overlay');
  assert.equal(p.text, patched);
  assert.equal(b.text, fx.prettyFiles[PAGE_JS]);
  assert.equal(b.headers['x-mirror-source'], undefined);
  const other = await request(fixSrv.url + CHUNK_JS.slice(1));
  assert.equal(other.headers['x-mirror-source'], 'base');
  const doc2 = await request(fixSrv.url);
  assert.match(doc2.text, /vendor-shim\.js/, 'fix.mjs serve uses --vendors=local');
  await Promise.all(servers.map((s) => s.stop()));

  // 6. commit the deliverables only; the overlay cannot sneak in, even forced
  writeFileSync(join(wt, 'fixes', topic, 'README.md'), readFileSync(join(wt, 'fixes', topic, 'README.md'), 'utf8').replace('**Status:** draft | measured | rejected', '**Status:** draft'));
  git(wt, 'add', `fixes/${topic}`);
  assert.deepEqual(git(wt, 'diff', '--cached', '--name-only').split('\n').sort(), [`fixes/${topic}/README.md`, `fixes/${topic}/patch.diff`]);
  const c = run('git', ['commit', '-q', '-m', `fix(${topic}): patch`], { cwd: wt });
  assert.equal(c.code, 0, c.out);
  git(wt, 'add', '-f', `fixes/${topic}/overlay`);
  const forced = run('git', ['commit', '-q', '-m', 'oops'], { cwd: wt });
  assert.notEqual(forced.code, 0);
  assert.match(forced.stderr, /refusing to commit/);
  git(wt, 'reset', '-q');
  assert.deepEqual(git(wt, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), [`fixes/${topic}/README.md`, `fixes/${topic}/patch.diff`]);

  // 7. clean up the worktree and branch like the lead would after merging
  git(repo.main, 'worktree', 'remove', '--force', wt);
  git(repo.main, 'branch', '-D', `fix/${topic}`);
  assert.doesNotMatch(git(repo.main, 'worktree', 'list'), /fix-nav-raf/);
  assert.equal(existsSync(wt), false);
});

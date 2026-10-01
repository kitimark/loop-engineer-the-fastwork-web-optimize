// Smoke test against the REAL private mirror (skipped when it is absent, e.g. on a fresh clone):
// it is discovered from this checkout and from a fresh detached worktree of this repo, and serve.mjs
// replays it byte-identically. Read-only: only paths listed in the manifest are requested, so nothing
// is appended to site/.mirror/missing-local.txt; the temp worktree is removed afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, TOOLS, run, git, startServe, request, sha256, tempDir, registerRealWorktree, unregisterRealWorktree } from '../helpers.mjs';

const r = run(process.execPath, ['--input-type=module', '-e', `const p = await import(${JSON.stringify(join(TOOLS, 'lib/paths.mjs'))}); console.log(p.mirrorHome())`]);
const HOME = r.stdout.trim();
const MANIFEST = join(HOME, 'site', '.mirror', 'manifest.json');
// The committed snapshot must be unchanged here (tools/lib/baseline.mjs): while the user reviews a re-mirror in
// the main checkout (BASELINE-MODIFIED), this smoke test of the real baseline is skipped, not failed.
const st = run(process.execPath, ['--input-type=module', '-e', `const b = await import(${JSON.stringify(join(TOOLS, 'lib/baseline.mjs'))}); const s = b.baselineStatus(); console.log(JSON.stringify({ ok: s.ok, state: s.state }))`]);
const BL = JSON.parse(st.stdout || '{"ok":false,"state":"(status failed)"}');
const skip = (!existsSync(MANIFEST) && `no real mirror at ${HOME}/site (run tools/mirror.mjs in the main checkout)`)
  || (!BL.ok && `the real baseline is not the pinned snapshot (state ${BL.state}): node tools/baseline.mjs status`);

test('real baseline: served byte-identically (site/), vendor scripts from site/ even with --root site-pretty', { skip }, async (t) => {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const js = Object.keys(m.files).find((p) => /^\/_app\/immutable\/.*\.js$/.test(p) && m.files[p].status === 200);
  const s = await startServe(['--port', '0', '--quiet']);
  t.after(() => s.stop());
  const doc = await request(s.url);
  assert.equal(doc.status, 200);
  assert.equal(sha256(doc.body), m.files['/'].sha256, 'index.html is byte-identical to production');
  const j = await request(s.url + js.slice(1));
  assert.equal(sha256(j.body), m.files[js].sha256, js);
  assert.equal(j.headers['content-type'], m.files[js].type);
  assert.equal(j.headers['cache-control'], m.files[js].cacheControl);
  assert.doesNotMatch(doc.headers['content-security-policy'], /https?:\/\/|\*\./, 'CSP egress fence');

  const vendor = Object.entries(m.vendors || {})[0];
  if (vendor && existsSync(join(HOME, 'site-pretty'))) {
    const v = await startServe(['--port', '0', '--quiet', '--vendors=local', '--root', 'site-pretty']);
    t.after(() => v.stop());
    const res = await request(v.url + '__vendor/' + vendor[0]);
    assert.equal(res.status, 200);
    assert.equal(sha256(res.body), sha256(readFileSync(join(HOME, 'site', vendor[1].file))), 'vendor script must be the byte-identical site/ copy (SRI)');
  }
});

test('real baseline: a fresh detached worktree of this repo finds it with no copy and no env', { skip }, () => {
  const wt = join(tempDir('fw-realwt-'), 'wt');
  registerRealWorktree(wt);
  try {
    git(REPO, 'worktree', 'add', '--detach', '-q', wt, 'HEAD');
    rmSync(join(wt, 'tools'), { recursive: true, force: true });
    cpSync(TOOLS, join(wt, 'tools'), { recursive: true }); // test the working-tree tools, not HEAD's
    if (run('git', ['cat-file', '-e', 'HEAD:site'], { cwd: wt }).code === 0) {
      // the snapshot is committed: a new worktree checks out a full copy; agent worktrees go sparse (fix.mjs new)
      const sp = run(process.execPath, [join(wt, 'tools', 'baseline.mjs'), 'sparse'], { cwd: wt });
      assert.equal(sp.code, 0, sp.out);
      assert.match(run(process.execPath, [join(wt, 'tools', 'baseline.mjs'), 'status'], { cwd: wt }).stdout, /^state\s+ok$/m);
    }
    const d = run(process.execPath, [join(wt, 'tools', 'fix.mjs'), 'doctor'], { cwd: wt });
    assert.equal(d.code, 0, d.out);
    assert.match(d.stdout, /^linked worktree\s+yes$/m);
    assert.match(d.stdout, new RegExp(`^baseline\\s+${HOME}/site-pretty OK$`, 'm'));
    assert.match(d.stdout, new RegExp(`^byte-identical mirror\\s+${HOME}/site OK$`, 'm'));
    assert.equal(existsSync(join(wt, 'site')), false);
  } finally {
    run('git', ['-C', REPO, 'worktree', 'remove', '--force', wt]);
    run('git', ['-C', REPO, 'worktree', 'prune']);
    unregisterRealWorktree(wt);
  }
  assert.doesNotMatch(git(REPO, 'worktree', 'list'), new RegExp(wt));
});

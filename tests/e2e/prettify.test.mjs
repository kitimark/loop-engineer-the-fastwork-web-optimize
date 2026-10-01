// tools/prettify.mjs on a copy: site/ -> site-pretty/ with parseable, reformatted JS/CSS, HTML and
// site/ untouched, vendor scripts (odd file names) formatted with the babel parser. It shells out to
// `npx prettier@<baseline.json prettier, else 3>`; the test runs it offline-first and is skipped if prettier is not in the npx cache.
// A committed site-pretty/ (the baseline snapshot) is refused without --new-snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tempDir, run, git, TOOLS, sha256 } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS, VENDOR_FILE } from '../fixtures/baseline.mjs';

const npmEnv = { npm_config_prefer_offline: 'true', npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' };
const probe = run('npx', ['--yes', 'prettier@3', '--version'], { env: npmEnv, timeout: 60000 });
const hash = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), sha256(readFileSync(f))]));
function walk(d, out = []) { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; }

test('prettify: readable, parseable copy; site/ and HTML untouched', { skip: probe.code !== 0 && `npx prettier@3 unavailable offline: ${probe.out.slice(0, 200)}` }, () => {
  const d = tempDir('fw-pretty-');
  cpSync(join(TOOLS, 'prettify.mjs'), join(d, 'tools', 'prettify.mjs'));
  const fx = makeFixtureHome(d);
  rmSync(fx.pretty, { recursive: true });
  const before = hash(fx.site);
  const r = run(process.execPath, [join(d, 'tools', 'prettify.mjs')], { cwd: d, env: npmEnv, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /readable copy: site-pretty\//);
  assert.deepEqual(hash(fx.site), before, 'site/ is never modified');

  const js = readFileSync(join(fx.pretty, PAGE_JS.slice(1)), 'utf8');
  assert.ok(js.split('\n').length > 15, 'JS was reformatted');
  assert.match(js, /^function measure\(\) \{$/m);
  for (const f of walk(fx.pretty).filter((f) => f.endsWith('.js') && !f.includes('__vendor'))) {
    const chk = run(process.execPath, ['--check', f]);
    assert.equal(chk.code, 0, `${f}: ${chk.out}`);
  }
  assert.ok(readFileSync(join(fx.pretty, PAGE_CSS.slice(1)), 'utf8').split('\n').length > 10, 'CSS was reformatted');
  assert.equal(readFileSync(join(fx.pretty, 'index.html'), 'utf8'), fx.html, 'HTML is copied verbatim (hydration markers)');
  assert.equal(readFileSync(join(fx.pretty, VENDOR_FILE), 'utf8'), 'window.__beacon = (window.__beacon || 0) + 1;\n', 'vendor file formatted with --parser babel');
  assert.ok(existsSync(join(fx.pretty, '.mirror', 'manifest.json')));
});

test('prettify refuses to run without site/', () => {
  const d = tempDir('fw-pretty-');
  cpSync(join(TOOLS, 'prettify.mjs'), join(d, 'tools', 'prettify.mjs'));
  const r = run(process.execPath, [join(d, 'tools', 'prettify.mjs')], { cwd: d });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /site\/ missing/);
});

test('a committed site-pretty/ (the baseline snapshot) is never rebuilt without --new-snapshot', () => {
  const d = tempDir('fw-pretty-snap-');
  cpSync(join(TOOLS, 'prettify.mjs'), join(d, 'tools', 'prettify.mjs'));
  const fx = makeFixtureHome(d);
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'add', 'site', 'site-pretty');
  git(d, 'commit', '-q', '-m', 'snapshot');
  const before = hash(fx.pretty);
  const r = run(process.execPath, [join(d, 'tools', 'prettify.mjs')], { cwd: d });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /^PRETTIFY-REFUSED: .*site-pretty is part of the committed baseline snapshot \(\d+ tracked files/);
  assert.match(r.stderr, /node tools\/prettify\.mjs --new-snapshot/);
  assert.deepEqual(hash(fx.pretty), before, 'site-pretty/ untouched (refused before rm/npx)');
  assert.equal(git(d, 'status', '--porcelain', '--', 'site', 'site-pretty'), '');
});

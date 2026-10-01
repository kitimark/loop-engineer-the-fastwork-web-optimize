// The guard rails themselves: removing one of them makes `npm test` (and so the pre-commit hook) fail.
// Policy: tools/ and tests/ may be edited without prompts; the test suite + pre-commit hook are the guard.
// Rule syntax per https://code.claude.com/docs/en/permissions.md: Edit(...) rules cover every built-in
// file-editing tool (Write included); Write(...)/NotebookEdit(...) path rules are never consulted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../helpers.mjs';

const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
const { allow = [], ask = [], deny = [] } = settings.permissions;

test('.claude/settings.json: the test gate cannot be skipped silently; rule syntax is valid', () => {
  for (const r of ['Bash(git commit *--no-verify*)', 'Bash(git config *core.hooksPath*)']) assert.ok(ask.includes(r) || deny.includes(r), r);
  // path rules on Write/NotebookEdit/MultiEdit are silently ignored by Claude Code: use Edit(...)
  assert.deepEqual([...allow, ...ask, ...deny].filter((r) => /^(Write|NotebookEdit|MultiEdit)\(/.test(r)), []);
});

test('.claude/settings.json: baseline edits and pushes stay denied', () => {
  for (const r of ['Bash(git push *)', 'Bash(git add -f *)', 'Bash(git add --force *)', 'Edit(/site/**)', 'Edit(/site-pretty/**)']) assert.ok(deny.includes(r), r);
});

test('package.json has the test scripts and the hook setup', () => {
  const s = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts;
  assert.match(s.test, /node --test .*tests\/unit.*tests\/e2e.*tests\/hooks/);
  assert.match(s['test:chrome'], /tests\/chrome/);
  // one short-lane hold for the whole run: the files re-enter it, no queue wait inside test timeouts (I-022)
  assert.match(s['test:chrome'], /^node tools\/lock\.mjs run chrome-measure --short --max-seconds 300 --owner test-chrome -- node --test /);
  assert.match(s.test, /--test-concurrency=3/, 'postmortem 2026-09-30 fix (b)');
  assert.equal(s['test:bench'], 'node tools/bench.mjs reconfirm', 'lead decision Q4: Tier A on everything landed');
  assert.match(s['test:all'], /npm test && npm run test:chrome/);
  assert.equal(s.setup, 'git config core.hooksPath .githooks');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).dependencies || {}), [], 'no runtime deps');
});

test('package.json: test:unit (non-tooling roles, I-021) runs the scope guard first, then only the unit tests', () => {
  const s = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts;
  assert.equal(s['test:scope'], 'node tools/scope.mjs');
  assert.match(s['test:unit'], /^node tools\/scope\.mjs && node --test .*"tests\/unit\/\*\.test\.mjs"$/);
  assert.doesNotMatch(s['test:unit'], /tests\/(e2e|hooks|chrome)/);
  assert.doesNotMatch(s['test:unit'], /--tooling|FW_TOOLING/, 'the opt-out is the caller\'s explicit choice');
  const md = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8');
  assert.match(md, /npm run test:unit/);
  assert.match(md, /FW_TOOLING=1/);
});

test('.githooks/pre-commit is executable and guards the expected paths', () => {
  const f = join(REPO, '.githooks', 'pre-commit');
  assert.ok(statSync(f).mode & 0o111, 'executable');
  const src = readFileSync(f, 'utf8');
  for (const needle of ['^site\\/', '^site-pretty\\/', '^out\\/', 'overlay\\/', '\\.pem$', '^tools\\/', '^tests\\/', 'npm test']) assert.ok(src.includes(needle), needle);
});

test('docs state the rule: tool changes come with tests; npm test must pass', () => {
  const md = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8');
  assert.match(md, /## Tooling is guarded by tests/);
  assert.match(md, /comes with a test/);
  assert.match(readFileSync(join(REPO, 'README.md'), 'utf8'), /npm test/);
});

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
  assert.match(s['test:all'], /npm test && npm run test:chrome/);
  assert.equal(s.setup, 'git config core.hooksPath .githooks');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).dependencies || {}), [], 'no runtime deps');
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

// tools/incident.mjs CLI on a temp repo with two worktrees sharing one $FW_STATE_DIR: output words
// (OPENED / JOINED / KNOWN), exit codes, concurrent reporters from separate processes, the "fix must be
// on main" rule, KNOWN until the reporter rebases, recurrence after, and `wait` in the background.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, makeTempRepo, git } from '../helpers.mjs';

function setup() {
  const repo = makeTempRepo({ worktree: 'fix-a' });
  const wt2 = join(repo.main, '.claude', 'worktrees', 'fix-b');
  git(repo.main, 'worktree', 'add', '-q', wt2, '-b', 'wt/fix-b');
  const env = { FW_STATE_DIR: tempDir('fw-incli-') };
  const cli = (checkout) => (...a) => node(join(checkout, 'tools', 'incident.mjs'), a, { cwd: checkout, env });
  const cliAsync = (checkout) => (...a) => nodeAsync(join(checkout, 'tools', 'incident.mjs'), a, { cwd: checkout, env });
  return { ...repo, wt2, env, A: cli(repo.wt), B: cli(wt2), M: cli(repo.main), Aasync: cliAsync(repo.wt), Masync: cliAsync(repo.main) };
}

const ERR = 'TypeError: Cannot read properties of undefined (reading \'phase\') at summarize (/x/tools/verify.mjs:812:17)';

test('open / join / list / show / update / announce, exit codes and usage errors', () => {
  const { A, B, M, wt, env } = setup();
  const log = join(wt, 'ab.log');
  writeFileSync(log, 'line 1\nline 2\n' + ERR + '\n');
  const o = A('open', '--by', 'fix-a', '--title', 'fix.mjs ab crashes after run 3', '--error', ERR, '--class', 'tool', '--cmd', 'node tools/fix.mjs ab a --runs 5', '--output-file', log, '--suspect', 'tools/verify.mjs summarize', '--blocking', 'yes');
  assert.equal(o.code, 0, o.out);
  assert.match(o.stdout, /^OPENED I-001: fix\.mjs ab crashes after run 3$/m);
  const j = B('open', '--by', 'fix-b', '--title', 'ab dies', '--error', ERR.replace('812:17', '815:3'), '--blocking', 'no');
  assert.equal(j.code, 0, j.out);
  assert.match(j.stdout, /^JOINED I-001 \[open\]: fix\.mjs ab crashes after run 3$/m);
  assert.match(j.stdout, /Don't fix it in parallel/);

  const l = M('list');
  assert.match(l.stdout, /^I-001 {2}\[open, tool, blocking\] {2}fix\.mjs ab crashes after run 3\n.*affected: fix-a, fix-b$/m);
  const s = JSON.parse(M('show', '1', '--json').stdout);
  assert.equal(s.cmd, 'node tools/fix.mjs ab a --runs 5');
  assert.match(s.output, /line 2/);
  assert.equal(s.env.branch, 'wt/fix-a', 'records the reporter\'s checkout and branch');
  assert.equal(s.affected[1].branch, 'wt/fix-b');
  assert.match(M('show', 'I-001').stdout, /suspect: tools\/verify\.mjs summarize[\s\S]*history:\n.*fix-a opened\n.*fix-b joined/);

  const u = M('update', '1', '--by', 'lead', '--status', 'fixing', '--priority', 'P0', '--assignee', 'ts-i001', '--workaround', 'use --runs 3');
  assert.equal(u.code, 0, u.out);
  assert.match(u.stdout, /^UPDATED I-001 {2}\[fixing, tool, P0, -> ts-i001, blocking\]/);
  // I-183: --blocking no clears the flag (the line drops "blocking"), --blocking yes sets it again
  const nb = M('update', '1', '--by', 'lead', '--blocking', 'no');
  assert.equal(nb.code, 0, nb.out);
  assert.match(nb.stdout, /^UPDATED I-001 {2}\[fixing, tool, P0, -> ts-i001\]/);
  assert.match(M('update', '1', '--by', 'lead', '--blocking', 'yes').stdout, /^UPDATED I-001 {2}\[fixing, tool, P0, -> ts-i001, blocking\]/);
  assert.notEqual(M('update', '1', '--by', 'lead', '--blocking', 'maybe').code, 0);
  assert.match(M('announce', '1').stdout, /FIXING P0, assigned to ts-i001[\s\S]*Workaround meanwhile: use --runs 3/);

  // FW_AGENT stands in for --by
  const viaEnv = node(join(wt, 'tools', 'incident.mjs'), ['open', '--title', 'env reporter', '--error', 'other failure'], { cwd: wt, env: { ...env, FW_AGENT: 'from-env' } });
  assert.equal(viaEnv.code, 0, viaEnv.out);
  assert.equal(JSON.parse(M('show', '2', '--json').stdout).reportedBy, 'from-env');

  for (const bad of [
    ['open', '--title', 'no by', '--error', 'x'],
    ['open', '--by', 'a', '--error', 'no title'],
    ['open', '--by', 'a', '--title', 't', '--class', 'bogus'],
    ['open', '--by', 'a', '--title', 't', '--blocking', 'maybe'],
    ['show', '42'],
    ['show'],
    ['update', '1', '--by', 'lead', '--status', 'resolved'],
    ['frobnicate', '1'],
  ]) {
    const r = M(...bad);
    assert.equal(r.code, 1, `${bad.join(' ')} -> ${r.out}`);
  }
  assert.equal(M('list', '--all').code, 0);
});

test('concurrent reporters in separate processes: exactly one OPENED, the rest JOINED', async () => {
  const s = setup();
  const res = await Promise.all(Array.from({ length: 6 }, (_, k) => (k % 2 ? s.Aasync : s.Masync)('open', '--by', `agent-${k}`, '--title', `chrome ${k}`, '--error', `Error: Chrome exited early (code ${k}, pid ${4000 + k})`)));
  assert.ok(res.every((r) => r.code === 0), res.map((r) => r.out).join('\n'));
  assert.equal(res.filter((r) => /^OPENED I-001/m.test(r.stdout)).length, 1, res.map((r) => r.out).join('\n'));
  assert.equal(res.filter((r) => /^JOINED I-001/m.test(r.stdout)).length, 5);
  assert.equal(JSON.parse(s.M('show', '1', '--json').stdout).affected.length, 6);
  assert.match(s.M('list', '--all').stdout, /^I-001/);
  assert.doesNotMatch(s.M('list', '--all').stdout, /I-002/);
});

test('resolve needs the fix on main; KNOWN until the reporter rebases; recurrence after; wait wakes up', async () => {
  const s = setup();
  assert.match(s.A('open', '--by', 'fix-a', '--title', 'serve 404s overlay', '--error', ERR, '--class', 'tool').stdout, /^OPENED I-001/m);
  assert.match(s.B('open', '--by', 'fix-b', '--title', 'same', '--error', ERR).stdout, /^JOINED I-001/m);

  // an affected agent waits in the background
  const waiting = s.Aasync('wait', 'I-001', '--timeout', '30', '--poll', '0.2');

  // a toolsmith fixes it on its branch (here: the fix-a worktree) ...
  mkdirSync(join(s.wt, 'tools', 'lib'), { recursive: true });
  writeFileSync(join(s.wt, 'tools', 'lib', 'fixed.mjs'), 'export const fixed = true;\n');
  git(s.wt, 'add', 'tools/lib/fixed.mjs');
  git(s.wt, 'commit', '-q', '-m', 'tools: fix summarize crash (incident I-001)');
  const sha = git(s.wt, 'rev-parse', 'HEAD');

  // ... which cannot be announced before it lands on main
  const early = s.M('resolve', '1', '--by', 'lead', '--commit', sha);
  assert.equal(early.code, 1, early.out);
  assert.match(early.stderr, /not on main yet: land it first/);
  assert.equal(s.M('resolve', '1', '--by', 'lead', '--commit', 'nope').code, 1);

  // land (fast-forward) and resolve
  git(s.main, 'merge', '--ff-only', 'wt/fix-a');
  const r = s.M('resolve', '1', '--by', 'lead', '--commit', sha, '--remeasure');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^\\[incident I-001\\] RESOLVED \\(fixed\\): serve 404s overlay\\nFix: ${sha.slice(0, 10)} on main: tools: fix summarize crash`));
  assert.match(r.stdout, /Re-measure: /);
  assert.match(r.stdout, /Affected: fix-a, fix-b$/m);

  const w = await waiting;
  assert.equal(w.code, 0, w.out);
  assert.match(w.stdout, /RESOLVED \(fixed\)[\s\S]*git rebase main/);
  assert.deepEqual(s.M('list').stdout.trim(), 'no active incidents');

  // fix-b has not rebased: the same failure is KNOWN, nothing new is opened
  const k = s.B('open', '--by', 'fix-b', '--title', 'still broken', '--error', ERR);
  assert.equal(k.code, 0, k.out);
  assert.match(k.stdout, new RegExp(`^KNOWN I-001: fixed in ${sha.slice(0, 10)} on main, which your branch doesn't contain\\.`, 'm'));
  assert.match(k.stdout, /git rebase main/);
  assert.equal(JSON.parse(s.M('list', '--all', '--json').stdout).length, 1);

  // after rebasing, the same failure is a recurrence: a new incident that points at the old one
  git(s.wt2, 'rebase', '-q', 'main');
  const again = s.B('open', '--by', 'fix-b', '--title', 'still broken after rebase', '--error', ERR);
  assert.match(again.stdout, /^OPENED I-002 \(recurrence of I-001/m);
  assert.equal(JSON.parse(s.M('show', '2', '--json').stdout).recurrenceOf, 'I-001');

  // wait times out with exit 3 while the incident is active
  const t = s.M('wait', '2', '--timeout', '0.3', '--poll', '0.1');
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^STILL OPEN I-002/);
  const res = s.M('resolve', '2', '--by', 'lead', '--resolution', 'workaround', '--note', 'use --port auto');
  assert.equal(res.code, 0, res.out);
  assert.match(s.M('wait', '2', '--timeout', '1').stdout, /RESOLVED \(workaround\)[\s\S]*Note: use --port auto/);
});

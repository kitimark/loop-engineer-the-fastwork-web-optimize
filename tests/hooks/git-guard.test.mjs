// Tests for .claude/hooks/git-guard.mjs, the Claude Code PreToolUse hook that enforces CLAUDE.md
// "Hard rules" 1-2 on Bash commands. Each case runs the hook as Claude Code does: JSON on stdin,
// then checks the exit code (2 = blocked, reason on stderr) or the JSON "ask" decision on stdout
// (https://code.claude.com/docs/en/hooks.md, "PreToolUse decision control", "Exit code 2").
// Run: node --test tests/hooks/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'git-guard.mjs');

// When this suite runs inside a git hook (e.g. a pre-commit that runs `npm test`), git exports
// GIT_DIR/GIT_INDEX_FILE/...: drop them so the temp repos below never touch the real repository.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|PREFIX|CONFIG_(COUNT|PARAMETERS|KEY_|VALUE_))/.test(k)));

function runHook(input, { raw = false } = {}) {
  const r = spawnSync(process.execPath, [HOOK], { input: raw ? input : JSON.stringify(input), encoding: 'utf8', timeout: 10000, env: ENV });
  let decision = 'allow';
  if (r.status === 2) decision = 'deny';
  else if (r.status === 0 && r.stdout.trim()) {
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    decision = out.hookSpecificOutput.permissionDecision;
    assert.ok(out.hookSpecificOutput.permissionDecisionReason);
  } else assert.equal(r.status, 0, `unexpected exit ${r.status}: ${r.stderr}`);
  if (decision === 'deny') assert.match(r.stderr, /git-guard/);
  return { decision, stderr: r.stderr, stdout: r.stdout };
}

const bash = (command, cwd = ROOT) => ({
  session_id: 'test', transcript_path: '/dev/null', cwd, permission_mode: 'default',
  hook_event_name: 'PreToolUse', tool_name: 'Bash',
  tool_input: { command, description: 'test' }, tool_use_id: 'toolu_test',
});

const DENY = [
  // merge without --ff-only / with merge-commit flags
  'git merge feature',
  'git merge --no-ff feature',
  'git merge --ff-only --no-ff feature',
  'git merge --squash feature',
  'git merge --ff-only --squash feature',
  'git merge --continue',
  'git merge --ff-only --no-verify feature',
  'git -C . merge feature',
  'git -C /tmp/x -c user.name=a merge feature',
  '/usr/bin/git merge feature',
  "git 'merge' feature",
  'g\\it merge feature',
  'GIT_EDITOR=true git merge feature',
  'env FOO=1 git merge feature',
  'timeout 30 git merge feature',
  'nice -n 5 nohup git merge feature',
  'cd /tmp && git merge feature',
  'git status; git merge feature',
  'true || git merge feature',
  'echo $(git merge feature)',
  'echo "`git merge feature`"',
  '(git merge feature)',
  'if true; then git merge feature; fi',
  "sh -c 'git merge feature'",
  'bash -lc "cd /tmp && git merge feature"',
  'bash -o pipefail -c "git merge feature"',
  "eval 'git merge feature'",
  'bash <<EOF\ngit merge feature\nEOF',
  'echo feature | xargs git merge',
  'git --git-dir=.git --work-tree=. merge feature',
  // pull without --rebase / --ff-only
  'git pull',
  'git pull . feature',
  'git pull --no-rebase . feature',
  'git pull --rebase=false',
  'git pull --rebase --squash',
  'git pull --no-ff',
  // push of any kind
  'git push',
  'git push origin main',
  'git -C . push',
  'git -c push.default=current push',
  'sh -c "git push"',
  'git send-pack ../other main',
  'cd /tmp && git push --dry-run',
  // hook bypasses
  'git commit --no-verify -m x',
  'git commit -n -m x',
  'git commit -anm x',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git -c core.hookspath=/dev/null merge --ff-only x',
  'git --config-env=core.hooksPath=HP commit -m x',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
  'export GIT_CONFIG_PARAMETERS="\'core.hooksPath\'=\'/dev/null\'"',
  'git -c alias.m=merge m feature',
  // publishing with gh
  'gh repo create me/mirror --public --source .',
  'gh pr create --fill',
  'gh pr merge 1 --merge',
  'gh gist create fixes/a/patch.diff',
];

const ALLOW = [
  'git merge --ff-only feature',
  'git -C /Users/x/repo merge --ff-only wt/hard-rules',
  'git -c merge.ff=only merge feature',
  'git merge --no-ff --ff-only feature',
  'git merge --abort',
  'git merge --quit',
  'git merge-base main HEAD',
  'git rebase main',
  'git rebase --continue',
  'git pull --rebase',
  'git pull -r . main',
  'git pull --ff-only',
  'git -c pull.ff=only pull',
  'git commit -m "merge the push rules"',
  'git commit -am "x"',
  'git commit -F msg.txt',
  'git log --oneline --merges',
  'git status && git diff',
  'git config --get merge.ff',
  'git config --list',
  'git config user.name kit',
  'git worktree add .claude/worktrees/x -b wt/x',
  'echo "git push"',
  "echo 'git merge --no-ff x' > notes.txt",
  'grep -rn "git push" CLAUDE.md',
  'node tools/fix.mjs ab topic --runs 5',
  'npm test 2>&1 | tail -5',
  'git log --grep=merge 2>/dev/null >/dev/null',
  'ls -la # git push in a comment',
  "git commit -m \"$(cat <<'EOF'\nDon't merge (or push) anything.\n\nCo-Authored-By: x <y>\nEOF\n)\"",
  "git commit -F - <<'EOF'\nIt's done: git push is denied, merges are ff-only\nEOF",
  'cat <<EOF > x\ngit push\nEOF',
  'gh pr view 3',
  'gh repo view',
  'command -v git',
  'git branch --merged',
  'git fetch . main:tmp 2>&1',
];

const ASK = [
  'git config core.hooksPath /dev/null',
  'git config --unset merge.ff',
  'git config pull.rebase false',
  'git config alias.m "merge --no-ff"',
  'git remote add origin https://github.com/me/x.git',
  'git config set remote.origin.url https://example.com/x.git',
];

for (const c of DENY) test(`deny: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c)).decision, 'deny'));
for (const c of ALLOW) test(`allow: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c)).decision, 'allow'));
for (const c of ASK) test(`ask: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c)).decision, 'ask'));

test('non-Bash tools pass through', () => {
  const r = runHook({ ...bash('x'), tool_name: 'Edit', tool_input: { file_path: '/x', old_string: 'git push', new_string: '' } });
  assert.equal(r.decision, 'allow');
});

test('deny reason explains the rebase workflow', () => {
  const r = runHook(bash('git merge --no-ff feature'));
  assert.match(r.stderr, /git rebase main/);
  assert.match(r.stderr, /--ff-only/);
});

test('fail-closed: unparseable command that mentions a guarded op is blocked', () => {
  assert.equal(runHook(bash('git merge "unterminated')).decision, 'deny');
  assert.equal(runHook(bash('echo $(git push')).decision, 'deny');
});

test('fail-open: unparseable unrelated command is allowed', () => {
  assert.equal(runHook(bash('echo "unterminated')).decision, 'allow');
});

test('fail-closed on malformed hook input that mentions a guarded op', () => {
  assert.equal(runHook('{"tool_name":"Bash","tool_input":{"command":"git push"', { raw: true }).decision, 'deny');
  assert.equal(runHook('not json', { raw: true }).decision, 'allow');
});

test('git aliases are expanded (repo-local alias in cwd)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-alias-'));
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: ENV });
    git('init', '-q');
    git('config', 'alias.land', 'merge --no-ff');
    git('config', 'alias.ffland', 'merge --ff-only');
    git('config', 'alias.shpush', '!git push');
    assert.equal(runHook(bash('git land feature', dir)).decision, 'deny');
    assert.equal(runHook(bash(`git -C ${dir} land feature`, '/')).decision, 'deny');
    assert.equal(runHook(bash('git ffland feature', dir)).decision, 'allow');
    assert.equal(runHook(bash('git shpush', dir)).decision, 'deny');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

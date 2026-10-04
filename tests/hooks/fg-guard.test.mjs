// Tests for .claude/hooks/fg-guard.mjs, the Claude Code PreToolUse hook that refuses known long commands run in
// the Bash tool's foreground (incident I-170, user T-152): a foreground command makes an agent deaf to messages and
// user threads until it ends. Each case runs the hook as Claude Code does: JSON on stdin, then checks the exit code
// (2 = blocked, reason on stderr; https://code.claude.com/docs/en/hooks.md, "Exit code 2").
// Run: node --test tests/hooks/fg-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'fg-guard.mjs');

function runHook(input, { raw = false } = {}) {
  const r = spawnSync(process.execPath, [HOOK], { input: raw ? input : JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
  if (r.status === 2) return { decision: 'deny', stderr: r.stderr };
  assert.equal(r.status, 0, `unexpected exit ${r.status}: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '', 'an allowed command prints nothing');
  assert.equal(r.stderr.trim(), '', 'an allowed command logs nothing');
  return { decision: 'allow', stderr: r.stderr };
}

const bash = (command, extra = {}) => ({
  session_id: 'test', transcript_path: '/dev/null', cwd: ROOT, permission_mode: 'default',
  hook_event_name: 'PreToolUse', tool_name: 'Bash',
  tool_input: { command, description: 'test', ...extra }, tool_use_id: 'toolu_test',
});

const DENY = [
  // the full test suite and the Chrome suites (they run for minutes)
  'npm test',
  'npm t',
  'npm --silent test',
  'npm run test',
  'npm run test:all',
  'npm run test:chrome',
  'npm run test:chrome:fn',
  'npm run-script test:all',
  'npm run test:bench',
  'npm run serve',
  'npm run verify',
  'node --test',
  'node --test --test-concurrency=6 "tests/unit/*.test.mjs" "tests/e2e/*.test.mjs" "tests/hooks/*.test.mjs"',
  'node --test tests/e2e/fix.test.mjs',
  'node --test tests/chrome/bench.chrome.test.mjs',
  // locks: a run holds and waits its turn; acquire --wait and wait block
  'node tools/lock.mjs run chrome-measure --owner x --shared --weight npm-test --max-seconds 480 -- npm test',
  'node tools/lock.mjs run chrome-measure --owner x -- node tools/scope.mjs',
  'node tools/lock.mjs run chrome-measure --short --max-seconds 30 --owner x -- true',
  'node tools/lock.mjs acquire chrome-measure --owner x --shared --weight npm-test --max-seconds 480 --wait 1800',
  'node tools/lock.mjs acquire iphone --owner x --ttl 900 --wait 61',
  'node tools/lock.mjs acquire iphone --owner x --wait=3600',
  'node tools/lock.mjs wait chrome-measure --until free --owner x',
  'node tools/lock.mjs wait chrome-measure --until free --owner x --timeout 61',
  'node tools/lock.mjs wait chrome-measure --until idle --for 120 --owner x --timeout 2m',
  'node tools/lock.mjs wait chrome-measure --until free --owner x --timeout 1h',
  // measuring, serving, the phone
  'node tools/fix.mjs ab topic --runs 5',
  'node tools/fix.mjs serve topic',
  'node tools/verify.mjs live=https://fastwork.com/ local=http://localhost:5200/',
  'node tools/bench.mjs reconfirm',
  'node tools/bench.mjs mech',
  'node tools/serve.mjs --root site-pretty --port auto --https',
  'node tools/iphone.mjs scroll --owner x --label patched',
  'node tools/iphone.mjs record --owner x --seconds 25 --label finger',
  'node tools/iphone.mjs run --owner x',
  'node tools/iphone.mjs gesture --owner x',
  'node tools/ioscap.mjs record --owner x --seconds 20',
  'node tools/sim.mjs session --functional --owner x -- true',
  // waits without a short --timeout
  'node tools/wait.mjs serve out/serve-x.json',
  "node tools/wait.mjs file out/x.log --match '^EXIT' --pid 123 --timeout 61",
  'node tools/wait.mjs git --grep x --timeout 3600 --owner x',
  'node tools/wait.mjs pid 123 --timeout=90',
  'node tools/wait.mjs time 10m --reason x',
  'node tools/console.mjs wait C-1 --until answered',
  'node tools/console.mjs wait C-1 --until done --part 2 --timeout 600',
  'node tools/console.mjs thread wait --as x --timeout 3500',
  'node tools/console.mjs thread wait --as lead --triage',
  'node tools/incident.mjs wait I-170',
  'node tools/incident.mjs wait I-170 --timeout 3600',
  'node tools/finding.mjs wait --as x --topic t',
  // caffeinate keeps running (or runs its command)
  'caffeinate -i -s node tools/scope.mjs',
  'caffeinate -t 30',
  'caffeinate -i -s node tools/fix.mjs ab topic --runs 3',
  // compound commands, wrappers, paths, node options
  'git status && npm test',
  'echo hi; node tools/fix.mjs ab topic',
  'node tools/wait.mjs serve out/s.json | tail -1',
  'true || node tools/verify.mjs a=b',
  'cd /tmp && FOO=1 timeout 600 node tools/fix.mjs ab topic',
  'env FW_AGENT=x node tools/wait.mjs pid 123',
  'nice -n 5 nohup npm test',
  'nohup npm test > out/t.log 2>&1',
  'tools/wait.mjs pid 1',
  './tools/verify.mjs a=b',
  'node --no-warnings tools/verify.mjs a=b',
  'node -r ./x.cjs /abs/path/tools/serve.mjs --port auto',
  'node tools/lock.mjs --owner x run chrome-measure -- true',
  'echo $(node tools/wait.mjs serve s.json)',
  // shells, heredocs, a background job that the same command waits for
  "sh -c 'npm test'",
  'bash -lc "cd /tmp && node tools/verify.mjs a=b"',
  "zsh -c 'node tools/console.mjs thread wait --as x'",
  'bash <<EOF\nnpm test\nEOF',
  'npm test & wait',
  'node tools/fix.mjs serve topic & node tools/wait.mjs serve out/serve-topic.json --timeout 600',
];

const ALLOW = [
  // the quick suites
  'npm run test:unit',
  'npm run test:scope',
  'FW_TOOLING=1 npm run test:unit',
  'node --test tests/unit/lock.test.mjs',
  'node --test "tests/unit/*.test.mjs"',
  'node --test tests/hooks/fg-guard.test.mjs',
  'node --test "tests/hooks/*.test.mjs"', // ~16 s (2026-10-04)
  'npm run test:hooks',
  'node tools/scope.mjs --tooling',
  // lock bookkeeping
  'node tools/lock.mjs status',
  'node tools/lock.mjs release chrome-measure --shared --owner x',
  'node tools/lock.mjs renew iphone --owner x --ttl 900',
  'node tools/lock.mjs doing iphone --owner x --text "run 3 of 9"',
  'node tools/lock.mjs leave chrome-measure --owner x',
  'node tools/lock.mjs doctor',
  'node tools/lock.mjs acquire iphone --owner x --ttl 900',
  'node tools/lock.mjs acquire iphone --owner x --ttl 900 --wait 60',
  'node tools/lock.mjs acquire iphone --owner x --wait 0',
  // waits with --timeout N <= 60
  'node tools/lock.mjs wait chrome-measure --until free --owner x --timeout 60',
  'node tools/lock.mjs wait chrome-measure --until free --owner x --timeout=60',
  'node tools/lock.mjs wait chrome-measure --until free --owner x --timeout 1m',
  'node tools/wait.mjs serve out/serve-x.json --timeout 60',
  'node tools/wait.mjs url https://localhost:5200/ --timeout 30s',
  'node tools/console.mjs wait C-1 --until started --timeout 30',
  'node tools/console.mjs thread wait --as x --timeout 0',
  'node tools/incident.mjs wait I-170 --timeout 5',
  'node tools/finding.mjs wait --as x --timeout 60',
  // short subcommands of the same tools
  'node tools/status.mjs set fg-guard --by x --state implementing --note "y"',
  'node tools/fix.mjs doctor',
  "node tools/fix.mjs grep 'getBoundingClientRect'",
  'node tools/fix.mjs show /_app/x.js --lines 1-20',
  'node tools/fix.mjs diff topic',
  'node tools/fix.mjs new topic',
  'node tools/iphone.mjs open https://lan:5300/ --owner x',
  'node tools/iphone.mjs park --owner x',
  'node tools/sim.mjs status',
  'node tools/console.mjs list',
  'node tools/console.mjs thread reply T-1 --by x --text "ok"',
  'node tools/console.mjs post --by x --kind action --title "t" --instructions "i"',
  'node tools/incident.mjs list',
  'node tools/incident.mjs open --by x --title t --error e --cmd c --class tool --blocking no',
  'node tools/finding.mjs list --unread --as x',
  // --help (and -h) only print usage
  'node tools/serve.mjs --help',
  'node tools/fix.mjs ab --help',
  'node tools/lock.mjs run --help',
  'node tools/verify.mjs -h',
  'node tools/wait.mjs --help',
  'node tools/iphone.mjs scroll --help',
  'node tools/bench.mjs --help',
  // unrelated commands, and the guarded words only as text
  'git status',
  'ls -la tools',
  'echo "npm test"',
  "grep -n 'lock.mjs run' CLAUDE.md",
  'git commit -m "npm test and fix.mjs ab"',
  'cat package.json | grep test',
  // started in the shell's background (the command returns at once)
  'node tools/serve.mjs --port auto > out/s.log 2>&1 &',
  'nohup node tools/console.mjs serve > out/c.log 2>&1 &',
  'node tools/fix.mjs serve topic > out/serve.log 2>&1 & echo started',
];

for (const c of DENY) test(`deny in the foreground: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c)).decision, 'deny'));
for (const c of DENY) test(`allow with run_in_background: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c, { run_in_background: true })).decision, 'allow'));
for (const c of ALLOW) test(`allow: ${JSON.stringify(c)}`, () => assert.equal(runHook(bash(c)).decision, 'allow'));

test('run_in_background must be exactly true', () => {
  assert.equal(runHook(bash('npm test', { run_in_background: false })).decision, 'deny');
  assert.equal(runHook(bash('npm test', { run_in_background: 'true' })).decision, 'deny');
});

test('the deny reason is one line naming the command and the way out (CLAUDE.md, user T-152)', () => {
  const { stderr } = runHook(bash('git status && node tools/fix.mjs ab topic --runs 5'));
  assert.equal(stderr.trim().split('\n').length, 1, stderr);
  assert.match(stderr, /^fg-guard: /);
  assert.match(stderr, /fix\.mjs ab/);
  assert.match(stderr, /run it with run_in_background: true; a foreground long command makes you deaf to messages \(CLAUDE\.md, user T-152\)/);
});

test('a wait names the --timeout way out; npm names the script', () => {
  assert.match(runHook(bash('node tools/wait.mjs serve s.json')).stderr, /--timeout N with N <= 60/);
  assert.match(runHook(bash('npm run test:all')).stderr, /npm run test:all/);
});

test('--timeout edge: 60 s is allowed, 61 s is not', () => {
  for (const t of ['60', '60s', '1m', '0']) assert.equal(runHook(bash(`node tools/incident.mjs wait I-1 --timeout ${t}`)).decision, 'allow', t);
  for (const t of ['61', '61s', '2m', '1h', 'soon']) assert.equal(runHook(bash(`node tools/incident.mjs wait I-1 --timeout ${t}`)).decision, 'deny', t);
});

test('no escape hatch: an environment variable does not let a foreground long command through', () => {
  for (const v of ['FG_GUARD_OFF=1', 'FW_FG_GUARD=0', 'CLAUDE_FG_OK=1']) assert.equal(runHook(bash(`${v} npm test`)).decision, 'deny', v);
  const src = readFileSync(HOOK, 'utf8');
  assert.doesNotMatch(src, /process\.env\.(?!CLAUDE_PROJECT_DIR\b)\w+/, 'the hook reads no switch from the environment');
});

test('fail open: unparseable commands, malformed input and other tools pass, with nothing logged', () => {
  assert.equal(runHook(bash("npm test 'unterminated")).decision, 'allow');
  assert.equal(runHook(bash('echo $(npm test')).decision, 'allow');
  assert.equal(runHook('{"tool_name":"Bash","tool_input":{"command":"npm test"', { raw: true }).decision, 'allow');
  assert.equal(runHook('not json', { raw: true }).decision, 'allow');
  assert.equal(runHook({ ...bash('x'), tool_name: 'Monitor', tool_input: { command: 'node tools/console.mjs thread wait --as x --monitor --timeout 86400' } }).decision, 'allow');
  assert.equal(runHook({ ...bash('x'), tool_input: {} }).decision, 'allow');
});

test('settings.json registers fg-guard as a Bash PreToolUse hook next to git-guard (timeout 10)', () => {
  const { hooks } = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const bashHooks = hooks.PreToolUse.filter((h) => h.matcher === 'Bash').flatMap((h) => h.hooks);
  const fg = bashHooks.find((h) => (h.args ?? []).some((a) => a.endsWith('/.claude/hooks/fg-guard.mjs')));
  assert.ok(fg, 'fg-guard registered');
  assert.equal(fg.type, 'command');
  assert.equal(fg.command, 'node');
  assert.deepEqual(fg.args, ['${CLAUDE_PROJECT_DIR}/.claude/hooks/fg-guard.mjs']);
  assert.equal(fg.timeout, 10);
  assert.ok(bashHooks.some((h) => (h.args ?? []).some((a) => a.endsWith('/.claude/hooks/git-guard.mjs'))), 'git-guard still registered');
});

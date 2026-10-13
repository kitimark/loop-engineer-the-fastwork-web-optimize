// Test stub for tools/release/rewrite.mjs (I-269), staged by tests/fixtures/release/stage.mjs. Same command line and
// outputs as I-269's tool: rewrite.mjs <source-repo> <out-dir> [--known <file>] makes the bare release mirror
// <out-dir>/repo.git (branch main: the source HEAD tree minus site/ and site-pretty/, every text file scrubbed: like
// filter-repo's --replace-text, everywhere, allow entries included; its commit keeps the source HEAD's author, as the
// real rewrite keeps the user's identity; plus one evidence branch, as rewrite.mjs runs evidence.mjs itself), writes
// <out-dir>/rewrite-report.json (counts only) and prints REWRITE and MIRROR= lines. Its arguments go to
// <out-dir>/rewrite-args.json. FW_TEST_REWRITE_LEAK=1 leaves one known value in a file (the residual case);
// FW_TEST_REWRITE_FAIL=1 exits 1 without a report.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { loadKnown, buildRules, scrubText } from './rules.mjs';

const argv = process.argv.slice(2);
const ki = argv.indexOf('--known');
const knownPath = argv[ki + 1];
const [source, out] = argv.filter((a, i) => !a.startsWith('--') && i !== ki + 1);
if (process.env.FW_TEST_REWRITE_FAIL === '1') { console.log('REWRITE failed (exit 1): asked to fail'); process.exit(1); }
const known = loadKnown(knownPath);
const rules = buildRules(known);
const git = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout; };
let gitEnv = {};
const [authorName, authorEmail] = git(source, 'log', '-1', '--format=%an%x00%ae').trim().split('\0');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'rewrite-args.json'), JSON.stringify(argv));
const stage = join(out, '.stage');
mkdirSync(stage);
git(stage, 'init', '-q', '-b', 'main');
git(stage, 'config', 'commit.gpgsign', 'false');
let changed = 0;
for (const f of git(source, 'ls-files').split('\n').filter(Boolean)) {
  if (/^site(-pretty)?\//.test(f)) continue;
  const r = scrubText(readFileSync(join(source, f), 'utf8'), rules);
  if (r.hits.length) changed++;
  const text = r.text;
  mkdirSync(dirname(join(stage, f)), { recursive: true });
  writeFileSync(join(stage, f), text);
}
if (process.env.FW_TEST_REWRITE_LEAK === '1') writeFileSync(join(stage, 'LEAK.md'), `left over: ${known.literals[0].value}\n`);
git(stage, 'add', '-A');
gitEnv = { GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail };
git(stage, 'commit', '-q', '-m', 'rewritten history (stub)');
gitEnv = {};
const mirror = join(out, 'repo.git');
git(out, 'clone', '-q', '--bare', '--no-local', stage, mirror);
rmSync(stage, { recursive: true, force: true });
spawnSync('git', ['--git-dir', mirror, 'remote', 'remove', 'origin'], { stdio: 'ignore' });
git(out, '--git-dir', mirror, 'branch', 'evidence/stub', 'main');
writeFileSync(join(out, 'rewrite-report.json'), JSON.stringify({ tool: 'stub', commits: { before: 2, withEvidence: 3, after: 2 }, branches: 2, evidence: [{ branch: 'evidence/stub', modified: 1, untracked: 0, deleted: 0 }], stats: { files: 3, text: 3, changed, binary: 0, binaryChanged: 0, renamed: 0, shaRewrites: 0 }, check: { residual: 0, rules: [] } }, null, 1) + '\n');
console.log(`REWRITE commits 2 -> 2 branches 2 (evidence 1)`);
console.log(`MIRROR=${mirror.split(homedir() + '/').join('~/')}`); // as rewrite.mjs prints it (show(): the home folder as ~)

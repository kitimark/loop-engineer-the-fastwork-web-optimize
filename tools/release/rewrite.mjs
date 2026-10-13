// tools/release/rewrite.mjs: build the release's rewritten history in a folder outside this repo (I-269;
// memory/public-release.md). Never pushes, never adds a remote: the user publishes the result.
//   node tools/release/rewrite.mjs <source-repo> <out-dir> [--known <file>] [--no-evidence]
// Steps:
//   1. refuses unless `git filter-repo --version` is the pinned v2.47.0 build (a40bce548d2c), <out-dir> is empty or
//      new and outside the source repo and its worktrees, and the known values file loads (tools/release/rules.mjs);
//   2. mirror-clones <source-repo> (every local branch and tag) to <out-dir>/repo.git and drops the origin remote,
//      refs/stash and every other ref outside refs/heads/ and refs/tags/ at once;
//   3. saves each worktree's uncommitted work as branch evidence/<worktree-name> in that mirror (evidence.mjs;
//      --no-evidence skips it);
//   4. writes the filter-repo expressions from the rules (a private temp file, mode 600, deleted after) and runs
//      tools/release/rewrite.py (filter-repo as a library): --replace-text/--replace-message, --invert-paths for
//      site/ site-pretty/ */__pycache__/*, --prune-empty never --prune-degenerate never, --date-order, cited SHAs
//      remapped in file text; then expires reflogs and prunes, so no old object stays;
//   5. copies filter-repo's old->new commit-map (and ref-map) to <out-dir>/, counts commits and branches, the cited
//      SHAs on main's tip that still name an old commit (dangling), and runs the residual check (check.mjs).
// Prints REWRITE/EVIDENCE/DANGLING lines, the check's HIT lines and "CHECK <n> residual", then MIRROR=<path>; writes
// <out-dir>/rewrite-report.json (counts only, no values). Exit 0 clean, 1 rewrite failed or residual hits, 2 refused.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, statSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, delimiter, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { loadKnown, buildRules, filterRepoExpressions, safeText, tildify } from './rules.mjs';
import { check, formatHits, gitEnv } from './check.mjs';
import { makeEvidence } from './evidence.mjs';

exitOnHelp(import.meta.url);

export const PINNED_FILTER_REPO = { release: 'v2.47.0', id: 'a40bce548d2c' };
const HERE = dirname(fileURLToPath(import.meta.url));
export const DROP_PATHS = ['--path', 'site/', '--path', 'site-pretty/', '--path-glob', '*/__pycache__/*'];
const DATA = /\.(json|jsonl|ndjson|csv|tsv|log|txt|raw)$/;
const GITLOG = /^research\/article-clips\/recipes\/[^/]+\/(gitlog|firstadds)\.txt$/;   // real git log output: prose (rewrite.py)

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 2 ** 31, env: gitEnv(opts.env), cwd: opts.cwd, input: opts.input, stdio: ['pipe', 'pipe', 'pipe'] });
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (p, dir) => { const a = real(p), b = real(dir); return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep); };

/** The git-filter-repo file `git filter-repo` runs: git's exec path first, then $PATH (git's own order). */
export function findFilterRepo(env = process.env) {
  const dirs = [];
  try { dirs.push(git(['--exec-path']).trim()); } catch {}
  dirs.push(...(env.PATH || '').split(delimiter).filter(Boolean));
  for (const d of dirs) {
    const f = join(d, 'git-filter-repo');
    try { accessSync(f, constants.X_OK); if (statSync(f).isFile()) return f; } catch {}
  }
  return null;
}

/** {path, id} of the installed filter-repo (`--version` prints the 12-hex id of its source), or {path:null}. */
export function filterRepoVersion(env = process.env) {
  const path = findFilterRepo(env);
  if (!path) return { path: null, id: null };
  const r = spawnSync('python3', ['-I', path, '--version'], { encoding: 'utf8', env: gitEnv({ PATH: env.PATH }), cwd: tmpdir() });
  return { path, id: r.status === 0 ? r.stdout.trim() : null };
}

/** Tokens in main-tip text files that name an old commit and no new one: {dangling, inData, toNew, files}. */
export function danglingCited(mirror, oldCommits, newCommits, ref = 'main') {
  const idx = (list) => { const m = new Map(); for (const h of list) { const k = h.slice(0, 7); m.set(k, [...(m.get(k) || []), h]); } return m; };
  const O = idx(oldCommits), N = idx(newCommits), newSet = new Set(newCommits);
  const one = (m, t) => (m.get(t.slice(0, 7)) || []).filter((h) => h.startsWith(t)).length === 1;
  const res = { toNew: 0, dangling: 0, inData: 0, files: [] };
  let out = '';
  try { out = git(['--git-dir', mirror, 'grep', '-I', '-o', '-w', '-E', '[0-9a-f]{7,40}', ref, '--']); } catch { return res; }
  const files = new Set();
  for (const l of out.split('\n')) {
    const m = l.match(/^[^:]+:(.+):([0-9a-f]{7,40})$/);
    if (!m) continue;
    const t = m[2];
    if (one(N, t)) { res.toNew++; continue; }
    if (!one(O, t) || newSet.has(t)) continue;
    res.dangling++;
    if (DATA.test(m[1]) && !GITLOG.test(m[1])) res.inData++;
    files.add(m[1]);
  }
  res.files = [...files].sort();
  return res;
}

/** Run the whole rewrite; returns {code, report}. log(line) prints. */
export async function rewrite({ source, out, knownPath, evidence = true, log = (l) => console.log(l), env = process.env }) {
  const refuse = (why) => { log(`REFUSED ${why}`); return { code: 2 }; };
  let rules;
  try { rules = buildRules(loadKnown(knownPath)); } catch (e) { return refuse(e.message); }
  const show = (s) => safeText(tildify(s), rules);
  let common;
  try { common = real(resolve(source, git(['-C', source, 'rev-parse', '--git-common-dir']).trim())); } catch { return refuse(`${show(source)} is not a git repo`); }
  const bare = git(['--git-dir', common, 'rev-parse', '--is-bare-repository']).trim() === 'true';
  const guarded = [common];
  if (!bare) for (const l of git(['--no-optional-locks', '-C', source, 'worktree', 'list', '--porcelain']).split('\n')) if (l.startsWith('worktree ')) guarded.push(l.slice(9));
  if (guarded.some((d) => inside(out, d) || inside(d, out))) return refuse(`out dir ${show(out)} is inside (or contains) the source repo or one of its worktrees`);
  if (existsSync(out) && readdirSync(out).length) return refuse(`out dir ${show(out)} is not empty`);
  const fr = filterRepoVersion(env);
  if (!fr.path) return refuse(`git-filter-repo not found (install ${PINNED_FILTER_REPO.release}, id ${PINNED_FILTER_REPO.id})`);
  if (fr.id !== PINNED_FILTER_REPO.id) return refuse(`git filter-repo --version is ${fr.id || '(failed)'}, not the pinned ${PINNED_FILTER_REPO.release} build ${PINNED_FILTER_REPO.id}`);

  const t0 = Date.now();
  mkdirSync(out, { recursive: true });
  const mirror = join(real(out), 'repo.git');
  const M = (args, opts) => git(['--git-dir', mirror, ...args], opts);
  git(['clone', '--quiet', '--mirror', '--no-local', common, mirror], { env: { GIT_OPTIONAL_LOCKS: '0' } });
  try { M(['remote', 'remove', 'origin']); } catch {}
  const allRefs = M(['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  const drop = allRefs.filter((r) => !/^refs\/(heads|tags)\//.test(r));
  if (drop.length) M(['update-ref', '--stdin'], { input: drop.map((r) => `delete ${r}\n`).join('') });
  const kinds = [...new Set(drop.map((r) => r.split('/').slice(0, 2).join('/')))].sort();
  log(`CLONED branches ${allRefs.filter((r) => r.startsWith('refs/heads/')).length} tags ${allRefs.filter((r) => r.startsWith('refs/tags/')).length} dropped ${drop.length}${kinds.length ? ` (${kinds.join(', ')})` : ''}`);
  const oldCommits = M(['rev-list', '--all']).split('\n').filter(Boolean);

  let ev = [];
  if (evidence && !bare) ev = makeEvidence({ source, mirror, log: (l) => log(show(l)) });
  const oldAll = M(['rev-list', '--all']).split('\n').filter(Boolean);

  const priv = mkdtempSync(join(tmpdir(), 'fw-release-expr-'));
  let stats = null;
  try {
    const expr = join(priv, 'expr.txt');
    writeFileSync(expr, filterRepoExpressions(rules), { mode: 0o600 });
    const r = spawnSync('python3', ['-I', join(HERE, 'rewrite.py'), '--force', '--quiet', '--date-order',
      '--invert-paths', ...DROP_PATHS, '--replace-text', expr, '--replace-message', expr,
      '--prune-empty', 'never', '--prune-degenerate', 'never'],
    { cwd: mirror, encoding: 'utf8', maxBuffer: 2 ** 28, env: gitEnv({ FW_FILTER_REPO_PATH: fr.path }) });
    const m = (r.stdout || '').match(/^RELEASE_REWRITE (\{.*\})$/m);
    if (r.status !== 0 || !m) {
      log(`REWRITE failed (exit ${r.status}): ${show(((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join(' | '))}`);
      return { code: 1 };
    }
    stats = JSON.parse(m[1]);
  } finally { rmSync(priv, { recursive: true, force: true }); }
  M(['reflog', 'expire', '--expire=now', '--all']);
  M(['gc', '--quiet', '--prune=now']);
  for (const f of ['commit-map', 'ref-map']) if (existsSync(join(mirror, 'filter-repo', f))) copyFileSync(join(mirror, 'filter-repo', f), join(real(out), f));

  const newCommits = M(['rev-list', '--all']).split('\n').filter(Boolean);
  const branches = M(['for-each-ref', '--format=%(refname)', 'refs/heads/']).split('\n').filter(Boolean);
  const hasMain = branches.includes('refs/heads/main');
  const dangling = hasMain ? danglingCited(mirror, oldAll, newCommits, 'main') : null;
  const seconds = Math.round((Date.now() - t0) / 1000);
  log(`REWRITE commits ${oldAll.length} -> ${newCommits.length} branches ${branches.length} (evidence ${ev.length}) seconds ${seconds}`);
  log(`REWRITE files ${stats.files} text ${stats.text} changed ${stats.changed} binary ${stats.binary} binaryChanged ${stats.binaryChanged} renamed ${stats.renamed} shaRewrites ${stats.shaRewrites}`);
  log(`COMMIT_MAP ${show(join(real(out), 'commit-map'))}`);
  if (dangling) log(`DANGLING main ${dangling.dangling} (data files ${dangling.inData}) cited-to-new ${dangling.toNew}${dangling.files.length ? ` in ${dangling.files.slice(0, 8).map(show).join(', ')}` : ''}`);
  const res = await check(mirror, rules);
  for (const l of formatHits(res.hits).trimEnd().split('\n')) log(l);
  const report = {
    tool: 'tools/release/rewrite.mjs', filterRepo: PINNED_FILTER_REPO, seconds,
    commits: { before: oldCommits.length, withEvidence: oldAll.length, after: newCommits.length },
    branches: branches.length, droppedRefs: drop.length, evidence: ev.map((e) => ({ branch: show(e.branch), modified: e.modified.length, untracked: e.untracked.length, deleted: e.deleted.length })),
    stats, danglingMain: dangling && { dangling: dangling.dangling, inData: dangling.inData, toNew: dangling.toNew, files: dangling.files.map(show) },
    check: { residual: res.hits.length, rules: [...new Set(res.hits.map((h) => h.id))] }, rules: rules.map((r) => r.id),
  };
  writeFileSync(join(real(out), 'rewrite-report.json'), JSON.stringify(report, null, 1) + '\n');
  log(`MIRROR=${show(mirror)}`);
  return { code: res.hits.length ? 1 : 0, report };
}

async function main(argv) {
  const pos = [], opt = { evidence: true };
  const usage = 'usage: rewrite.mjs <source-repo> <out-dir> [--known <file>] [--no-evidence]';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--known') opt.known = argv[++i];
    else if (argv[i] === '--no-evidence') opt.evidence = false;
    else if (argv[i].startsWith('--')) { console.error(`${usage} (unknown option ${argv[i]})`); return 2; }
    else pos.push(argv[i]);
  }
  if (pos.length !== 2) { console.error(usage); return 2; }
  const r = await rewrite({ source: resolve(pos[0]), out: resolve(pos[1]), knownPath: opt.known, evidence: opt.evidence });
  return r.code;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

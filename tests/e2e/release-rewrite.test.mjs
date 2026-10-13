// I-269: tools/release/rewrite.mjs, evidence.mjs and check.mjs end to end on small fixture repos in temp dirs
// (memory/public-release.md). Made-up values only; nothing is pushed, no remote is added. The rewrite tests need the
// pinned git-filter-repo v2.47.0 (tools/release/rewrite.mjs PINNED_FILTER_REPO) and skip, saying so, without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, lstatSync, existsSync, unlinkSync, chmodSync, utimesSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, node, git, run, tool } from '../helpers.mjs';

const RW = await import('../../tools/release/rewrite.mjs');
const REWRITE = tool('release/rewrite.mjs'), CHECK = tool('release/check.mjs'), EVIDENCE = tool('release/evidence.mjs');
const fr = RW.filterRepoVersion();
const NO_FR = fr.id === RW.PINNED_FILTER_REPO.id ? false : `git-filter-repo ${RW.PINNED_FILTER_REPO.release} (${RW.PINNED_FILTER_REPO.id}) is not installed (found ${fr.id || 'none'})`;

const VALUES = ['zqhome', "Zed's iPhone 99", 'zq.person@mail.invalid', 'zq-tunnel-77'];
const KNOWN = {
  literals: [
    { value: 'zqhome', token: '<user>' },
    { value: "Zed's iPhone 99", token: '<device-name>' },
    { value: 'zq.person@mail.invalid', token: '<email>' },
    { value: 'zq-tunnel-77', token: '<subdomain>' },
  ],
  lanPrefixes: ['10.77.3'],
  allow: [],
};
function knownFile(known = KNOWN) {
  const f = join(tempDir('fw-known-'), 'known.json');
  writeFileSync(f, JSON.stringify(known), { mode: 0o600 });
  return f;
}
const w = (dir, rel, data) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), data); };
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', 'HEAD'); };
const lower = (s) => s.toLowerCase();
// private-link samples built at run time: this file holds none itself (the release scrubs and checks it too)
const ART_ID = ['Ab1Cd2Ef3', 'Gh4Ij5Kl6Mn7'].join(''), MED_ID = ['1a2b3c', '4d5e6f'].join('');
const hasValue = (s) => VALUES.some((v) => lower(s).includes(lower(v))) || /10\.77\.3\.\d/.test(s);

/** sha256 of every file under dir (lstat-based, symlinks by target): the "byte-identical" witness. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n), st = lstatSync(p);
      if (st.isDirectory()) walk(p);
      else out[relative(dir, p)] = st.isFile() ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'other';
    }
  };
  walk(dir);
  return out;
}

/** Paths added, removed or changed between two snapshot() results. */
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();

/** A commit whose 7-char abbreviation is all digits (about 1 in 27 commits): the "pure" token case. */
function digitCommit(dir) {
  writeFileSync(join(dir, 'counter.txt'), 'x');
  git(dir, 'add', 'counter.txt');
  const tree = git(dir, 'write-tree'), parent = git(dir, 'rev-parse', 'HEAD');
  for (let i = 0; i < 2000; i++) {
    const c = git(dir, 'commit-tree', tree, '-p', parent, '-m', `counter ${i}`);
    if (/^[0-9]{7}/.test(c)) { git(dir, 'reset', '-q', '--soft', c); return c; }
  }
  throw new Error('no all-digit commit in 2000 tries');
}

/** The fixture: main with values in blobs, messages, a binary, site/ and __pycache__; a feature branch; a tag; a stash
 *  ref; a linked worktree with modified, untracked, deleted and ignored files. */
function fixture() {
  const root = tempDir('fw-release-src-');
  const src = join(root, 'src');
  mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'commit.gpgsign', 'false');
  w(src, '.gitignore', 'out/\n');
  w(src, 'README.md', 'Study by zqhome, logs in /Users/zqhome/src/x.\nPhone LAN 10.77.3.42.\nPlan https://claude.ai/code/artifact/' + ART_ID + ', draft https://medium.com/p/' + MED_ID + '/edit.\n');
  w(src, 'site/index.html', '<p>snapshot zqhome</p>\n');
  w(src, 'tools/__pycache__/x.cpython-313.pyc', 'zqhome');
  w(src, 'img/shot.bin', Buffer.concat([Buffer.from([0x89, 0, 1, 2, 0]), Buffer.from("device Zed's iPhone 99 end", 'utf8')]));
  w(src, 'tests/keep.mjs', 'export const n = 1;\n');
  w(src, 'notes/zqhome-todo.md', 'a file whose name holds a value, deleted later\n');
  const c1 = commit(src, "first: from Zed's iPhone 99 at 10.77.3.9");
  const cd = digitCommit(src);
  w(src, 'docs/notes.md', `See ${c1} and ${c1.slice(0, 9)}; the counter landed in ${cd.slice(0, 7)} (prose).\n`);
  w(src, 'data/numbers.json', `{"count": ${cd.slice(0, 7)}, "commit": "${c1.slice(0, 10)}"}\n`);
  w(src, 'research/article-clips/recipes/art-x/gitlog.txt', `${cd.slice(0, 7)} counter\n${c1.slice(0, 7)} first\n`);
  w(src, 'research/article-clips/recipes/art-x/other.txt', `${cd.slice(0, 7)} stays\n`);
  unlinkSync(join(src, 'notes/zqhome-todo.md'));
  const c3 = commit(src, `docs: cite ${c1.slice(0, 8)}, plan at https://claude.ai/artifact/${ART_ID}`);
  git(src, 'tag', 'v1');
  git(src, 'checkout', '-q', '-b', 'feature');
  w(src, 'feature.md', 'mail zq.person@mail.invalid via zq-tunnel-77.workers.dev\n');
  commit(src, 'feature: contact zq.person@mail.invalid');
  git(src, 'checkout', '-q', 'main');
  // a stash-like ref holding a value only it reaches: dropped by the mirror step
  w(src, 'stashed.md', 'zqhome stash only\n');
  git(src, 'add', 'stashed.md');
  const st = git(src, 'commit-tree', git(src, 'write-tree'), '-p', 'HEAD', '-m', 'WIP zqhome');
  git(src, 'update-ref', 'refs/stash', st);
  git(src, 'reset', '-q', '--hard', 'HEAD');
  const wt = join(root, 'wt-agent');
  git(src, 'worktree', 'add', '-q', wt, '-b', 'wt-branch');
  w(wt, 'README.md', 'edited in the worktree by zqhome at 10.77.3.5\n');
  w(wt, 'notes/untracked.md', `new file citing ${c3.slice(0, 10)}, Zed's iPhone 99\n`);
  unlinkSync(join(wt, 'tests/keep.mjs'));
  w(wt, 'out/ignored.txt', 'zqhome ignored\n');
  // same content, new mtime: a `git status` that may write would refresh (rewrite) the worktree's index here
  const later = new Date(Date.now() + 5000);
  utimesSync(join(wt, 'docs/notes.md'), later, later);
  return { root, src, wt, c1, cd, c3 };
}

const commitMap = (out) => new Map(readFileSync(join(out, 'commit-map'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(' ')));
const show = (mirror, spec) => git(mirror, 'show', spec);

test('I-269 rewrite: values out of every blob, message, branch and evidence branch; site/ dropped; SHAs remapped; source untouched', { skip: NO_FR }, () => {
  const f = fixture();
  const before = snapshot(f.root);
  const out = join(tempDir('fw-release-out-'), 'release');
  const r = node(REWRITE, [f.src, out, '--known', knownFile()], { timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CHECK 0 residual \(\d+ rules\)$/m);
  assert.match(r.stdout, /^CLONED branches 3 tags 1 dropped 1 \(refs\/stash\)$/m);
  assert.match(r.stdout, /^EVIDENCE evidence\/wt-agent base [0-9a-f]{10} modified 1 untracked 1 deleted 1$/m);
  assert.match(r.stdout, /^DANGLING main 2 \(data files 2\) /m, "the two data-file numbers are left alone");
  assert.ok(!hasValue(r.out), 'the tool prints no value');
  assert.deepEqual(changed(before, snapshot(f.root)), [], 'source repo, its index files and the worktree are byte-identical');

  const mirror = join(out, 'repo.git');
  assert.deepEqual(git(mirror, 'for-each-ref', '--format=%(refname)').split('\n').sort(),
    ['refs/heads/evidence/wt-agent', 'refs/heads/feature', 'refs/heads/main', 'refs/heads/wt-branch', 'refs/tags/v1']);
  assert.equal(git(mirror, 'remote'), '', 'no remote');
  const log = run('git', ['--git-dir', mirror, 'log', '--all', '-p', '--binary', '--format=%B']).stdout;
  assert.ok(!hasValue(log), 'no value in any message or diff of any ref');
  assert.match(log, /first: from <device-name> at 192\.168\.0\.9/);
  assert.match(log, /feature: contact <email>/);
  assert.equal(run('git', ['--git-dir', mirror, 'log', '--all', '--format=%H', '--', 'site', 'tools/__pycache__']).stdout.trim(), '', 'site/ and __pycache__ gone from history');
  assert.equal(show(mirror, 'main:README.md'), 'Study by <user>, logs in /Users/<user>/src/x.\nPhone LAN 192.168.0.42.\nPlan https://claude.ai/artifact/<private-artifact>, draft https://medium.com/p/<draft>.');
  assert.ok(!/Ab1Cd2Ef3Gh4Ij5Kl6Mn7|p\/1a2b3c4d5e6f/.test(log), 'private links gone from blobs and messages (filter-repo runs the same regexes in Python)');
  const bin = run('git', ['--git-dir', mirror, 'cat-file', 'blob', 'main:img/shot.bin'], {}).stdout;
  assert.ok(bin.includes('device <device-name> end') && !bin.includes('Zed'), 'binary blob: literal values replaced');
  // a path holding a value is renamed in every commit, and its later deletion deletes the renamed path (filter-repo
  // passes deletions to no callback: rewrite.py renames them itself)
  assert.equal(run('git', ['--git-dir', mirror, 'cat-file', '-e', `${commitMap(out).get(f.c1)}:notes/<user>-todo.md`]).code, 0);
  assert.equal(run('git', ['--git-dir', mirror, 'ls-tree', '-r', '--name-only', 'main', 'notes/']).stdout, '', 'the deleted file stays deleted');

  const map = commitMap(out);
  const n1 = map.get(f.c1), nd = map.get(f.cd), n3 = map.get(f.c3);
  assert.ok(n1 && nd && n3 && n1 !== f.c1 && nd !== f.cd);
  assert.equal(show(mirror, 'main:docs/notes.md'), `See ${n1} and ${n1.slice(0, 9)}; the counter landed in ${nd.slice(0, 7)} (prose).`);
  assert.equal(show(mirror, 'main:data/numbers.json'), `{"count": ${f.cd.slice(0, 7)}, "commit": "${n1.slice(0, 10)}"}`, 'a data file keeps its all-digit token (a number), mixed hex is remapped');
  assert.equal(show(mirror, 'main:research/article-clips/recipes/art-x/gitlog.txt'), `${nd.slice(0, 7)} counter\n${n1.slice(0, 7)} first`, 'gitlog.txt is real git log output: remapped');
  assert.equal(show(mirror, 'main:research/article-clips/recipes/art-x/other.txt'), `${f.cd.slice(0, 7)} stays`);
  assert.equal(git(mirror, 'log', '-1', '--format=%s', 'main'), `docs: cite ${n1.slice(0, 8)}, plan at https://claude.ai/artifact/<private-artifact>`, 'messages: filter-repo remaps cited SHAs');

  // the evidence branch: worktree HEAD + its files now (scrubbed, remapped), deletions applied, ignored files absent
  const ev = 'evidence/wt-agent';
  assert.equal(git(mirror, 'rev-parse', `${ev}^`), git(mirror, 'rev-parse', 'wt-branch'));
  assert.equal(show(mirror, `${ev}:README.md`), 'edited in the worktree by <user> at 192.168.0.5');
  assert.equal(show(mirror, `${ev}:notes/untracked.md`), `new file citing ${n3.slice(0, 10)}, <device-name>`);
  assert.equal(run('git', ['--git-dir', mirror, 'cat-file', '-e', `${ev}:tests/keep.mjs`]).code === 0, false, 'deleted file removed');
  assert.equal(run('git', ['--git-dir', mirror, 'cat-file', '-e', `${ev}:out/ignored.txt`]).code === 0, false, 'ignored file not saved');
  assert.match(git(mirror, 'log', '-1', '--format=%B', ev), new RegExp(`Base: ${map.get(git(f.src, 'rev-parse', 'wt-branch'))}`));

  const rep = JSON.parse(readFileSync(join(out, 'rewrite-report.json'), 'utf8'));
  assert.equal(rep.check.residual, 0);
  assert.equal(rep.commits.after, rep.commits.withEvidence);
  assert.ok(!hasValue(JSON.stringify(rep)));
  // check.mjs on the result: clean; and fail-closed once a value is planted (an unreachable blob counts)
  const k = knownFile();
  const c0 = node(CHECK, [mirror, '--known', k, '--source', f.src]);
  assert.equal(c0.code, 0, c0.out);
  assert.match(c0.stdout, /^CHECK 0 residual \((1[0-9]) rules\)\n$/, 'the rule count is printed (4 literals, home, 3 LAN, 2 links, 6 secrets)');
  run('git', ['--git-dir', mirror, 'hash-object', '-w', '--stdin'], { input: 'planted ZQHOME\n' });
  const c1 = node(CHECK, [mirror, '--known', k]);
  assert.equal(c1.code, 1);
  assert.match(c1.stdout, /^HIT lit0-user \(unreachable\)@[0-9a-f]{10}:1$/m);
  assert.ok(!hasValue(c1.out));
  // every commit header line is scanned (here `encoding`); with --source an identity the source history has is kept,
  // any other is a hit identity-unknown; without --source identity lines are scanned like the rest
  const planted = run('git', ['--git-dir', mirror, 'hash-object', '-t', 'commit', '-w', '--literally', '--stdin'], { input:
    `tree ${git(mirror, 'rev-parse', 'main^{tree}')}\nauthor Other One <o@x.invalid> 1 +0000\ncommitter fw-test <fw-test@example.invalid> 1 +0000\nencoding zq-tunnel-77\n\nclean message\n` }).stdout.trim();
  const mine = (out) => out.split('\n').filter((l) => l.includes(`commit@${planted.slice(0, 10)}`));
  const c2 = node(CHECK, [mirror, '--known', k, '--source', f.src]);
  assert.equal(c2.code, 1);
  assert.deepEqual(mine(c2.stdout), [`HIT identity-unknown commit@${planted.slice(0, 10)}:2`, `HIT lit3-subdomain commit@${planted.slice(0, 10)}:4`]);
  assert.deepEqual(c2.stdout.split('\n').filter((l) => l.startsWith('HIT identity-unknown') && !l.includes(planted.slice(0, 10))), [],
    'the fixture identity (and the evidence commits, which take their HEAD commit identity) are kept');
  const c3 = node(CHECK, [mirror, '--known', k]);
  assert.deepEqual(mine(c3.stdout), [`HIT lit3-subdomain commit@${planted.slice(0, 10)}:4`]);
  const zq = run('git', ['--git-dir', mirror, 'hash-object', '-t', 'commit', '-w', '--literally', '--stdin'], { input:
    `tree ${git(mirror, 'rev-parse', 'main^{tree}')}\nauthor zqhome <z@x.invalid> 1 +0000\ncommitter fw-test <fw-test@example.invalid> 1 +0000\n\nm\n` }).stdout.trim();
  assert.match(node(CHECK, [mirror, '--known', k]).stdout, new RegExp(`^HIT lit0-user commit@${zq.slice(0, 10)}:2$`, 'm'), 'without --source a value in an identity is a hit');
  assert.equal(node(CHECK, [mirror, '--known', k, '--source', join(f.root, 'nope')]).code, 2);
});

test('I-269 rewrite refuses a git-filter-repo that is not the pinned v2.47.0 build, an out dir in the source, a non-empty out dir', { skip: NO_FR }, () => {
  const f = fixture();
  const fake = tempDir('fw-fake-fr-');
  writeFileSync(join(fake, 'git-filter-repo'), '#!/usr/bin/env python3\nprint("0badc0ffee00")\n');
  chmodSync(join(fake, 'git-filter-repo'), 0o755);
  const out = join(tempDir('fw-release-out-'), 'release');
  const r = node(REWRITE, [f.src, out, '--known', knownFile()], { env: { PATH: `${fake}:${process.env.PATH}` } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stdout, /^REFUSED git filter-repo --version is 0badc0ffee00, not the pinned v2\.47\.0 build a40bce548d2c$/m);
  assert.equal(existsSync(out), false, 'nothing written');
  const r2 = node(REWRITE, [f.src, join(f.wt, 'release'), '--known', knownFile()]);
  assert.equal(r2.code, 2);
  assert.match(r2.stdout, /REFUSED out dir .* is inside \(or contains\) the source repo/);
  // through a symlink, to a dir that does not exist yet: the nearest existing ancestor is resolved
  const link = join(tempDir('fw-release-link-'), 'wt');
  symlinkSync(f.wt, link);
  const r4 = node(REWRITE, [f.src, join(link, 'new', 'release'), '--known', knownFile()]);
  assert.equal(r4.code, 2, r4.out);
  assert.match(r4.stdout, /REFUSED out dir .* is inside \(or contains\) the source repo/);
  assert.equal(existsSync(join(f.wt, 'new')), false);
  const full = tempDir('fw-release-full-');
  writeFileSync(join(full, 'x'), '');
  const r3 = node(REWRITE, [f.src, full, '--known', knownFile()]);
  assert.equal(r3.code, 2);
  assert.match(r3.stdout, /REFUSED out dir .* is not empty/);
});

test('I-269 evidence.mjs alone: a branch per dirty worktree in the mirror only, source byte-identical; --dry-run writes nothing', () => {
  const f = fixture();
  const mirror = join(tempDir('fw-release-mirror-'), 'm.git');
  git(f.root, 'clone', '-q', '--mirror', '--no-local', f.src, mirror);
  const before = snapshot(f.root);
  const dry = node(EVIDENCE, [f.src, mirror, '--dry-run']);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /EVIDENCE evidence\/wt-agent .*\(dry run\)/);
  assert.equal(git(mirror, 'for-each-ref', 'refs/heads/evidence/'), '');
  const r = node(EVIDENCE, [f.src, mirror]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^EVIDENCE_DONE 1 branches$/m, 'the clean main checkout gets none');
  assert.deepEqual(changed(before, snapshot(f.root)), [], "source byte-identical");
  assert.equal(git(mirror, 'show', 'evidence/wt-agent:notes/untracked.md').startsWith('new file citing'), true);
  assert.equal(git(mirror, 'log', '-1', '--format=%an <%ae>|%cn <%ce>', 'evidence/wt-agent'), git(mirror, 'log', '-1', '--format=%an <%ae>|%an <%ae>', 'wt-branch'), "the HEAD commit's identity");
  // a second run does not overwrite: it adds -2
  const r2 = node(EVIDENCE, [f.src, mirror]);
  assert.match(r2.stdout, /EVIDENCE evidence\/wt-agent-2 /);
  assert.deepEqual(changed(before, snapshot(f.root)), [], "source byte-identical");
  // never into the source: its git dir, a path inside it, a worktree's gitfile target, a mirror inside a worktree
  const inWt = join(f.wt, 'out', 'm.git');
  git(f.root, 'clone', '-q', '--mirror', '--no-local', f.src, inWt);
  const before2 = snapshot(f.root);
  for (const m of [join(f.src, '.git'), join(f.src, '.git', 'worktrees', 'wt-agent'), inWt]) {
    const x = node(EVIDENCE, [f.src, m]);
    assert.equal(x.code, 2, x.out);
    assert.match(x.stdout, /^REFUSED the mirror .* (is the source repo's git dir|is inside \(or contains\) a worktree)/m);
  }
  assert.deepEqual(changed(before2, snapshot(f.root)), [], 'nothing written by a refused run');
  assert.equal(git(f.src, 'for-each-ref', 'refs/heads/evidence/'), '');
});

test('I-269 the release tools print their header on --help and exit 0 before anything runs', () => {
  for (const t of [REWRITE, CHECK, EVIDENCE]) {
    const r = node(t, ['--help', '/nonexistent', '/nonexistent2']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, /^tools\/release\/\w+\.mjs: .*I-269/);
  }
});

test('I-269 check.mjs on a directory: exit 1 with HIT lines (rule id, path:line, names masked) on planted values, 0 when clean', () => {
  const d = tempDir('fw-release-dir-');
  const k = knownFile();
  w(d, 'a/clean.md', 'nothing here\n');
  w(d, 'tests/x.mjs', 'ip 192.168.0.4\n');
  const ok = node(CHECK, [d, '--known', k]);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^CHECK 0 residual \(\d+ rules\)\n$/);
  w(d, 'a/doc.md', 'line one\nhost 10.77.3.8\n');
  w(d, 'b/pic.png', Buffer.concat([Buffer.from([0, 0, 0]), Buffer.from('ZED\'S IPHONE 99 and 10.77.3.1')]));
  w(d, 'c/zqhome-notes.txt', 'plain\n');
  const bad = node(CHECK, [d, '--known', k]);
  assert.equal(bad.code, 1);
  const plain = (out) => out.trim().split('\n').map((l) => l.replace(/ \(\d+ rules\)$/, ''));
  assert.deepEqual(plain(bad.stdout), [
    'HIT lan0 a/doc.md:2',
    'HIT lit1-device-name b/pic.png:1',
    'HIT lit0-user name@c/<user>-notes.txt:0',
    'CHECK 3 residual',
  ], 'binary: literals only; a file name is reported masked');
  assert.ok(!hasValue(bad.out));
  // a checkout inside the dir is scanned as a git repo (its objects), not as raw pack bytes
  const repo = join(d, 'r');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  w(repo, 'f.md', 'clean\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'mail zq.person@mail.invalid');
  w(repo, 'f.md', 'clean again\n');
  const g = node(CHECK, [repo, '--known', k]);
  assert.equal(g.code, 1);
  assert.match(g.stdout, /^HIT lit2-email \.git:commit@[0-9a-f]{10}:\d+$/m);
  const usage = node(CHECK, [join(d, 'missing')]);
  assert.equal(usage.code, 2);
  const nok = node(CHECK, [d, '--known', join(d, 'none.json')]);
  assert.equal(nok.code, 2);
  assert.match(nok.stderr, /CHECK refused: known values file .* not found/);
  // fail-closed: an empty known file is refused, not "CHECK 0 residual" (review of 10cd1810)
  const empty = node(CHECK, [d, '--known', knownFile({})]);
  assert.equal(empty.code, 2, empty.out);
  assert.match(empty.stderr, /CHECK refused: .*no literals/);
  assert.doesNotMatch(empty.stdout, /CHECK 0/);
});

test('I-269 check.mjs finds secret shapes and private links (kind and path:line only, never the secret) in files and git objects', () => {
  const d = tempDir('fw-release-secret-');
  const k = knownFile();
  const tok = ['gh', 'p_', 'Q7'.repeat(18)].join(''), pem = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  w(d, 'docs/a.md', `fine\nuse ${tok} here\n`);
  w(d, 'keys/id.txt', `${pem}\nMIIE\n`);
  w(d, 'notes/links.md', `a\nb\nhttps://claude.ai/artifact/${ART_ID}\nmedium.com/p/${MED_ID}\nsee claude.ai/artifact/${ART_ID} (no scheme)\n`);
  const r = node(CHECK, [d, '--known', k]);
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(r.stdout.trim().split('\n').map((l) => l.replace(/ \(\d+ rules\)$/, '')), ['HIT secret-github docs/a.md:2', 'HIT secret-pem keys/id.txt:1',
    'HIT link-artifact notes/links.md:3', 'HIT link-medium-draft notes/links.md:4', 'HIT link-artifact notes/links.md:5', 'CHECK 5 residual']);
  assert.ok(!r.out.includes(tok.slice(4)), 'the secret is not printed');
  const repo = join(d, 'r');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  w(repo, 'f.md', 'clean\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `oops ${['AK', 'IA'].join('')}${'Z9'.repeat(8)}`);
  const g = node(CHECK, [join(repo, '.git'), '--known', k]);
  assert.equal(g.code, 1, g.out);
  assert.match(g.stdout, /^HIT secret-aws commit@[0-9a-f]{10}:\d+$/m);
});

test('I-269 check.mjs: an allow entry covers a blob only when it covers every path the blob has', () => {
  const k = knownFile({ ...KNOWN, allow: [{ path: 'tests/**', pattern: '10\\.77\\.3\\.\\d+' }] });
  const repo = join(tempDir('fw-release-allow-'), 'r');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  w(repo, 'tests/a.mjs', 'ip 10.77.3.4\n');
  w(repo, 'tests/b.mjs', 'ip 10.77.3.5\n');
  w(repo, 'other.txt', 'ip 10.77.3.5\n');   // the same blob as tests/b.mjs
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'm');
  const r = node(CHECK, [join(repo, '.git'), '--known', k]);
  assert.equal(r.code, 1, r.out);
  const hits = r.stdout.split('\n').filter((l) => l.startsWith('HIT'));
  assert.equal(hits.length, 1, r.stdout);
  assert.match(hits[0], /^HIT lan0 (tests\/b\.mjs|other\.txt)@[0-9a-f]{10}:1$/, 'the blob at tests/b.mjs and other.txt is not covered');
  // the working tree files: by their own path
  const d = node(CHECK, [repo, '--known', k]);
  assert.ok(d.stdout.split('\n').some((l) => l === 'HIT lan0 other.txt:1') && !d.stdout.includes('HIT lan0 tests/a.mjs'), d.stdout);
});

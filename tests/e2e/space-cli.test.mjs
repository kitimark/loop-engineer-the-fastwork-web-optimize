// tools/space.mjs report (incident I-095, disk full): read-only sizes by category in a temp repo with worktrees, board
// rows, scratch folders, Chrome profiles (leftover temp / probe / reused / in use / not ours) and an evidence manifest;
// the list file; nothing is deleted. Plus the free-space WARNING in lock.mjs status and fix.mjs doctor, and (review-i095)
// the refusal beside someone else's chrome-measure hold, landed = own commits on main, parked = active.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { makeTempRepo, tempDir, node, git } from '../helpers.mjs';
import { validateManifest, warnGb, lowSpaceWarning, profileKind, spaceRunRefusal, SPACE_HOLD_CMD } from '../../tools/lib/space.mjs';

let repo, state, scratch, tmp, list, holder, inUseDir;
const wts = {};
const put = (f, s = 'x') => { mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, s); };
const profile = (d, marker) => { put(join(d, 'Local State'), '{}'); put(join(d, 'Default', 'Cache', 'blob'), 'y'.repeat(4096)); if (marker) put(join(d, '.fw-temp-profile.json'), JSON.stringify(marker)); };
function tree(root) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(`${relative(root, p)} ${statSync(p).size}`); } };
  walk(root);
  return out.sort();
}
const env = () => ({ FW_STATE_DIR: state, TMPDIR: tmp });
const space = (...a) => node(join(repo.main, 'tools', 'space.mjs'), a, { cwd: repo.main, env: env(), timeout: 120000 });

before(async () => {
  repo = makeTempRepo({ worktree: 'done-wt' });
  wts.done = repo.wt;
  state = tempDir('fw-space-state-');
  scratch = tempDir('fw-space-scratch-');
  tmp = tempDir('fw-space-tmp-');
  // done-wt landed: a commit of its own, fast-forwarded onto main
  put(join(wts.done, 'fixes', 'tp1', 'README.md'), '# tp1\n');
  git(wts.done, 'add', '-A');
  git(wts.done, 'commit', '-q', '-m', 'tp1: work');
  git(repo.main, 'merge', '-q', '--ff-only', 'wt/done-wt');
  for (const [name, topic] of [['busy-wt', 'tp2'], ['parked-wt', 'tp3'], ['dropped-wt', 'tp4'], ['fresh-wt', null]]) {
    const w = join(repo.main, '.claude', 'worktrees', name);
    git(repo.main, 'worktree', 'add', '-q', w, '-b', `wt/${name}`);
    if (topic) {
      put(join(w, 'fixes', topic, 'README.md'), `# ${topic}\n`);
      git(w, 'add', '-A');
      git(w, 'commit', '-q', '-m', `${topic}: work`);
    }
    wts[name] = w;
  }
  for (const [id, by, st] of [['tp2', 'fix-tp2', 'implementing'], ['tp3', 'fix-tp3', 'parked'], ['tp4', 'fix-tp4', 'dropped']]) {
    const r = node(join(repo.main, 'tools', 'status.mjs'), ['set', id, '--by', by, '--kind', 'fix', '--title', `topic ${id}`, '--state', st, '--note', 'test row', ...(st === 'parked' ? ['--resume-on', 'decision:lead'] : [])], { cwd: repo.main, env: env() });
    assert.equal(r.code, 0, r.out);
  }
  // done-wt: landed; leftover temp profile (marker of a dead pid), a probe's profile, a reused
  // verify profile, raw output, and the evidence its manifest names
  profile(join(wts.done, 'out', 'probe', 'chrome', 'probe-123-abcdef01'), { schema: 'fw-temp-profile/1', pid: 2 ** 22 + 7, createdAt: '2026-10-01T00:00:00Z' });
  profile(join(wts.done, 'out', 'probe', 'chrome-profile'));
  profile(join(wts.done, 'out', 'chrome-verify-profile'));
  put(join(wts.done, 'out', 'probe', 'frames', 'key.png'), 'p'.repeat(2048));
  put(join(wts.done, 'out', 'probe', 'raw.json'), 'r'.repeat(8192));
  put(join(wts.done, 'fixes', 'tp1', 'evidence.json'), JSON.stringify({ schema: 'fw-evidence/1', topic: 'tp1', capMB: 200, items: [
    { path: 'out/probe/frames/key.png', why: 'key frame behind the pixel-diff claim', kind: 'frames', fastworkDerived: true },
    { path: 'out/probe/gone.json', why: 'run record behind the verdict', kind: 'result' }] }));
  put(join(wts['parked-wt'], 'out', 'old', 'trace.json'), 't'.repeat(16384));
  put(join(wts['busy-wt'], 'out', 'now', 'run.json'), 'n'.repeat(1024));
  put(join(wts['dropped-wt'], 'out', 'old', 'trace.json'), 'd'.repeat(16384));
  put(join(wts['fresh-wt'], 'out', 'only-copy', 'run.json'), 'f'.repeat(4096)); // never committed: not landed
  // main checkout: a profile a running process uses
  inUseDir = join(repo.main, 'out', 'probe-x', 'chrome-profile');
  profile(inUseDir);
  holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${inUseDir}`], { stdio: 'ignore' });
  // scratch: an idle agent folder with a leftover profile, and one whose board row is active
  profile(join(scratch, 'old-agent', 'chrome', 'x-99-0123abcd'));
  put(join(scratch, 'fix-tp2', 'notes.txt'), 'n');
  profile(join(tmp, 'cpu-calib-profile-abc')); // no marker of ours: maybe another app's
  profile(join(tmp, 'check-5-0a0b0c0d'), { schema: 'fw-temp-profile/1', pid: 2 ** 22 + 9, createdAt: '2026-10-01T00:00:00Z' });
  await new Promise((r) => setTimeout(r, 300));
});
after(() => { try { holder.kill('SIGKILL'); } catch {} });

test('usage: no command or an unknown argument exits 2', () => {
  assert.equal(space().code, 2);
  const r = space('report', '--bogus');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown argument --bogus/);
  assert.equal(space('report', '--top', '0').code, 2);
});

test('report --json --list: categories, statuses, evidence; nothing deleted (I-095)', () => {
  const before = [...tree(repo.root), ...tree(scratch), ...tree(tmp)];
  list = join(tempDir('fw-space-list-'), 'space.tsv');
  const r = space('report', '--json', '--idle-hours', '0', '--scratch', scratch, '--list', list);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([...tree(repo.root), ...tree(scratch), ...tree(tmp)], before, 'nothing created, changed or deleted');
  const j = JSON.parse(r.stdout);
  assert.equal(j.readOnly, true);
  assert.ok(j.free.freeBytes > 0 && j.free.totalBytes >= j.free.freeBytes);
  const prof = (end) => j.profiles.find((p) => p.path.endsWith(end));
  assert.deepEqual([prof('probe-123-abcdef01').kind, prof('probe-123-abcdef01').status], ['temp', 'leftover']);
  assert.deepEqual([prof(join('probe', 'chrome-profile')).kind, prof(join('probe', 'chrome-profile')).status], ['probe', 'probe'], 'a research probe\'s fixed-name profile, apart');
  assert.equal(prof('chrome-verify-profile').status, 'reused');
  assert.equal(prof(join('probe-x', 'chrome-profile')).status, 'in-use');
  assert.equal(prof(join('probe-x', 'chrome-profile')).inUse.pid, holder.pid);
  assert.equal(prof('x-99-0123abcd').status, 'leftover', 'in a scratch folder');
  assert.equal(prof('cpu-calib-profile-abc').status, 'not-ours', 'in the OS temp dir without our marker');
  assert.equal(prof('check-5-0a0b0c0d').status, 'leftover', 'in the OS temp dir with our marker');
  assert.equal(j.totals.leftoverProfiles, j.profiles.filter((p) => p.status === 'leftover').reduce((s, p) => s + p.bytes, 0));
  assert.equal(j.profiles.filter((p) => p.status === 'leftover').length, 3);
  assert.ok(j.profiles.every((p) => p.bytes > 0));
  const wt = (name) => j.worktrees.find((w) => w.path.endsWith(name));
  assert.equal(wt('done-wt').status, 'keep-evidence', 'landed, but holds evidence');
  assert.deepEqual([wt('done-wt').ahead, wt('done-wt').ownCommits, wt('done-wt').merged], [0, 1, true]);
  assert.deepEqual([wt('fresh-wt').ahead, wt('fresh-wt').ownCommits, wt('fresh-wt').merged, wt('fresh-wt').status], [0, 0, false, 'active'], 'never committed: not landed (review-i095 C)');
  assert.match(wt('fresh-wt').note, /no commit of its own/);
  assert.equal(wt('parked-wt').status, 'active', 'a parked board row may resume (review-i095 C)');
  assert.deepEqual(wt('parked-wt').board.map((b) => `${b.id} ${b.state}`), ['tp3 parked']);
  assert.equal(wt('dropped-wt').status, 'finished', 'its board row is dropped');
  assert.equal(wt('busy-wt').status, 'active', 'unlanded commit, board row implementing');
  assert.ok(!j.worktrees.some((w) => w.path === repo.main), 'the main checkout is not a candidate');
  const sc = (name) => j.scratch.find((s) => s.path.endsWith(name));
  assert.equal(sc('old-agent').status, 'idle');
  assert.equal(sc('fix-tp2').status, 'active');
  const [m] = j.evidence.manifests;
  assert.equal(j.evidence.manifests.length, 1);
  assert.deepEqual([m.topic, m.items.length, m.missing, m.fastworkDerived, m.overCap, m.problems.length], ['tp1', 2, 1, 1, false, 0]);
  assert.ok(m.bytes >= 2048);
  // the list file: header, one line per path, never "deleted"
  const lines = readFileSync(list, 'utf8').trim().split('\n');
  assert.match(lines[0], /read-only, nothing was deleted/);
  assert.equal(lines[1], 'category\tstatus\tbytes\tsize\tpath\tnote');
  assert.ok(lines.some((l) => l.startsWith('profile-temp\tleftover\t') && l.includes('probe-123-abcdef01')));
  assert.ok(lines.some((l) => l.startsWith('profile-probe\tin-use\t')));
  assert.ok(lines.some((l) => l.startsWith('worktree-out\tfinished\t') && l.includes('dropped-wt')));
  assert.ok(lines.some((l) => l.startsWith('profile-probe\tprobe\t')));
  assert.ok(lines.some((l) => l.startsWith('profile-probe\tnot-ours\t') && l.includes('cpu-calib-profile-abc')));
  assert.ok(lines.some((l) => l.startsWith('evidence\tkeep\t') && l.includes('Fastwork-derived')));
  assert.ok(lines.some((l) => l.startsWith('evidence\tmissing\t') && l.includes('gone.json')));
  assert.ok(lines.slice(2).every((l) => l.split('\t').length === 6));
});

test('report (text): the sections, read-only note, must-keep and missing evidence flagged', () => {
  const r = space('report', '--idle-hours', '0', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  for (const re of [/^SPACE REPORT .*read-only: nothing was deleted/m, /^free space: /m, /^1\. Throwaway Chrome profiles \(temp names or our marker\) no process uses: 3 = /m,
    /1 in use = .*never touch; 1 reused tool profiles = .*keep; 1 in the OS temp dir without our marker = /, /^ {3}research-probe profiles .*: 1 = /m,
    /^2\. out\/ of finished worktrees .*parked counts as active\): 1 = /m, /dropped-wt\/out .*board: tp4 dropped/,
    /check first .*: 1 = /, /done-wt\/out .*holds 1 evidence file\(s\)/, /^3\. Scratch folders: idle 1 = /m, /^4\. Must-keep evidence .*: 1 manifest\(s\), 2 item\(s\)/m,
    /tp1: 2 item\(s\), 1 Fastwork-derived \(gitignored, never commit, MUST KEEP\), 1 MISSING/]) assert.match(r.stdout, re);
});

test('a manifest with problems is reported, not trusted', () => {
  assert.deepEqual(validateManifest({ schema: 'fw-evidence/1', topic: 't', items: [{ path: 'out/a.json', why: 'w' }] }), []);
  const p = validateManifest({ schema: 'x', items: [{ path: '/abs/a.png' }, { path: 'out/../../etc' , why: 'w' }], capMB: -1 });
  assert.ok(p.some((x) => /schema/.test(x)) && p.some((x) => /topic missing/.test(x)) && p.some((x) => /capMB/.test(x)));
  assert.ok(p.some((x) => /items\[0\]\.path must be relative/.test(x)) && p.some((x) => /items\[0\]\.why missing/.test(x)) && p.some((x) => /items\[1\]\.path must be relative/.test(x)));
  assert.deepEqual(validateManifest(null), ['not a JSON object']);
  assert.equal(profileKind('/x/out/chrome-fn/check-12-0a0b0c0d'), 'temp');
  assert.equal(profileKind('/x/out/chrome-verify-profile'), 'reused');
});

test('free-space warning: threshold from FW_SPACE_WARN_GB (default 10, 0 = off) in lock.mjs status and fix.mjs doctor', () => {
  assert.equal(warnGb({}), 10);
  assert.equal(warnGb({ FW_SPACE_WARN_GB: '0' }), 0);
  assert.equal(warnGb({ FW_SPACE_WARN_GB: 'x' }), 10);
  assert.equal(lowSpaceWarning(repo.main, { FW_SPACE_WARN_GB: '0' }), null);
  assert.match(lowSpaceWarning(repo.main, { FW_SPACE_WARN_GB: '1000000' }), /^WARNING: low disk space: .* free on this disk \(under 1000000 GB\)\. .*node tools\/space\.mjs report/);
  const lock = (warn, ...a) => node(join(repo.main, 'tools', 'lock.mjs'), ['status', '--no-host', ...a], { cwd: repo.main, env: { ...env(), FW_SPACE_WARN_GB: warn } });
  assert.match(lock('1000000').stdout, /^WARNING: low disk space: /m);
  assert.doesNotMatch(lock('0').stdout, /WARNING: low disk space/);
  const js = lock('1000000', '--json');
  assert.doesNotThrow(() => JSON.parse(js.stdout), 'the JSON stays clean');
  assert.match(js.stderr, /WARNING: low disk space/);
  const doc = (warn) => node(join(wts.done, 'tools', 'fix.mjs'), ['doctor'], { cwd: wts.done, env: { ...env(), FW_SPACE_WARN_GB: warn, FW_MIRROR_HOME: join(repo.root, 'nowhere') } });
  const d = doc('1000000');
  assert.match(d.stdout, /^free disk space\s+\d/m);
  assert.match(d.stdout, /^WARNING: low disk space: /m);
  assert.doesNotMatch(doc('0').stdout, /WARNING: low disk space/);
});

test('refuses beside someone else\'s chrome-measure hold; runs in its own --no-timing hold (review-i095 B)', () => {
  const h = { owner: 'ab-run', token: 'aaaaaaaaaaaa', kind: 'process' };
  const st = (holder, stale = null) => ({ holder, stale });
  assert.equal(spaceRunRefusal({ st: st(null), env: {} }), null, 'free');
  assert.equal(spaceRunRefusal({ st: st(h, 'pid 1 is gone'), env: {} }), null, 'stale');
  assert.equal(spaceRunRefusal({ st: st({ ...h, shared: true }), env: {} }), null, 'a shared (functional) group');
  assert.equal(spaceRunRefusal({ st: st({ ...h, functional: true, short: true }), env: {} }), null, 'lane-off stand-in for a reader');
  assert.equal(spaceRunRefusal({ st: st({ ...h, short: true }), env: {} }), null, 'an exclusive short-lane job');
  assert.equal(spaceRunRefusal({ st: st(h), env: { FW_LOCK_HELD: 'chrome-measure:aaaaaaaaaaaa' } }), null, 'our own hold');
  assert.match(spaceRunRefusal({ st: st(h), env: { FW_LOCK_HELD: 'chrome-measure:bbbbbbbbbbbb' } }), /^WAIT: chrome-measure is held by "ab-run" \(a timing hold/);
  assert.match(spaceRunRefusal({ st: st({ ...h, noTiming: true }), env: {} }), /\(a no-timing hold: a build, or a phone part/);
  assert.ok(spaceRunRefusal({ st: st(h), env: {} }).endsWith(SPACE_HOLD_CMD));
  // the CLI: someone's A/B holds the lock
  const lock = (...a) => node(join(repo.main, 'tools', 'lock.mjs'), a, { cwd: repo.main, env: env(), timeout: 60000 });
  const before = [...tree(repo.root), ...tree(scratch), ...tree(tmp)];
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab-run', '--ttl', '60').code, 0);
  let r = space('report', '--scratch', scratch, '--list', join(tempDir('fw-space-list-'), 'x.tsv'));
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /^WAIT: chrome-measure is held by "ab-run" \(a timing hold, e\.g\. an A\/B\)/);
  assert.match(r.stderr, /node tools\/lock\.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools\/space\.mjs report/);
  assert.equal(r.stdout, '', 'no report, no list file');
  assert.equal(lock('release', 'chrome-measure', '--owner', 'ab-run').code, 0);
  // inside its own no-timing hold it runs
  r = lock('run', 'chrome-measure', '--owner', 'space-me', '--no-timing', '--max-seconds', '120', '--', process.execPath, join(repo.main, 'tools', 'space.mjs'), 'report', '--idle-hours', '0', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SPACE REPORT /m);
  assert.deepEqual([...tree(repo.root), ...tree(scratch), ...tree(tmp)], before, 'nothing created, changed or deleted');
});

// tools/space.mjs report (incident I-095, disk full): read-only sizes by category in a temp repo with worktrees, board
// rows, scratch folders, Chrome profiles (leftover temp / probe / reused / in use) and an evidence manifest; the list
// file; nothing is deleted. Plus the free-space WARNING in lock.mjs status and fix.mjs doctor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { makeTempRepo, tempDir, node, git } from '../helpers.mjs';
import { validateManifest, warnGb, lowSpaceWarning, profileKind } from '../../tools/lib/space.mjs';

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
  for (const [name, topic] of [['busy-wt', 'tp2'], ['parked-wt', 'tp3']]) {
    const w = join(repo.main, '.claude', 'worktrees', name);
    git(repo.main, 'worktree', 'add', '-q', w, '-b', `wt/${name}`);
    put(join(w, 'fixes', topic, 'README.md'), `# ${topic}\n`);
    git(w, 'add', '-A');
    git(w, 'commit', '-q', '-m', `${topic}: work`);
    wts[name] = w;
  }
  for (const [id, by, st] of [['tp2', 'fix-tp2', 'implementing'], ['tp3', 'fix-tp3', 'parked']]) {
    const r = node(join(repo.main, 'tools', 'status.mjs'), ['set', id, '--by', by, '--kind', 'fix', '--title', `topic ${id}`, '--state', st, '--note', 'test row'], { cwd: repo.main, env: env() });
    assert.equal(r.code, 0, r.out);
  }
  // done-wt: merged (no commit of its own); leftover temp profile (marker of a dead pid), a probe's profile, a reused
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
  // main checkout: a profile a running process uses
  inUseDir = join(repo.main, 'out', 'probe-x', 'chrome-profile');
  profile(inUseDir);
  holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${inUseDir}`], { stdio: 'ignore' });
  // scratch: an idle agent folder with a leftover profile, and one whose board row is active
  profile(join(scratch, 'old-agent', 'chrome', 'x-99-0123abcd'));
  put(join(scratch, 'fix-tp2', 'notes.txt'), 'n');
  profile(join(tmp, 'cpu-calib-profile-abc'));
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
  assert.deepEqual([prof(join('probe', 'chrome-profile')).kind, prof(join('probe', 'chrome-profile')).status], ['probe', 'leftover']);
  assert.equal(prof('chrome-verify-profile').status, 'reused');
  assert.equal(prof(join('probe-x', 'chrome-profile')).status, 'in-use');
  assert.equal(prof(join('probe-x', 'chrome-profile')).inUse.pid, holder.pid);
  assert.equal(prof('x-99-0123abcd').status, 'leftover', 'in a scratch folder');
  assert.equal(prof('cpu-calib-profile-abc').status, 'leftover', 'in the OS temp dir');
  assert.ok(j.profiles.every((p) => p.bytes > 0));
  const wt = (name) => j.worktrees.find((w) => w.path.endsWith(name));
  assert.equal(wt('done-wt').status, 'keep-evidence', 'merged, but holds evidence');
  assert.equal(wt('done-wt').ahead, 0);
  assert.equal(wt('parked-wt').status, 'finished', 'its board row is parked');
  assert.deepEqual(wt('parked-wt').board.map((b) => `${b.id} ${b.state}`), ['tp3 parked']);
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
  assert.ok(lines.some((l) => l.startsWith('worktree-out\tfinished\t') && l.includes('parked-wt')));
  assert.ok(lines.some((l) => l.startsWith('evidence\tkeep\t') && l.includes('Fastwork-derived')));
  assert.ok(lines.some((l) => l.startsWith('evidence\tmissing\t') && l.includes('gone.json')));
  assert.ok(lines.slice(2).every((l) => l.split('\t').length === 6));
});

test('report (text): the sections, read-only note, must-keep and missing evidence flagged', () => {
  const r = space('report', '--idle-hours', '0', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  for (const re of [/^SPACE REPORT .*read-only: nothing was deleted/m, /^free space: /m, /^1\. Throwaway Chrome profiles no process uses: 4 = /m,
    /1 in use = .*never touch; 1 reused tool profiles/, /^2\. out\/ of finished worktrees .*: 1 = /m, /parked-wt\/out .*board: tp3 parked/,
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

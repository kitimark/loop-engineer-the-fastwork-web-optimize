// I-124 end to end in a temp repo: `space.mjs prune` (dry run deletes nothing; --apply removes only the auto-clean
// classes, keeps JSON/logs/cited folders, writes the record and the kept log), the report's I-124 fields (writers,
// citations, owners), the DISK-LOW refusal of a new timing hold in `lock.mjs run`, and the disk alarm of
// `idle.mjs check --by lead`. Fake free space, fake lsof and sips; never the real temp dir or disk state.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, utimesSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, tempDir, node, git } from '../helpers.mjs';

let repo, state, scratch, tmp, bin;
const OLD = Date.now() - 3 * 24 * 3600e3;
const put = (f, s = 'x') => { mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, s); return f; };
function age(p) { if (statSync(p).isDirectory()) for (const e of readdirSync(p)) age(join(p, e)); utimesSync(p, OLD / 1000, OLD / 1000); }
const env = (extra = {}) => ({ FW_STATE_DIR: state, TMPDIR: tmp, FW_LSOF: join(bin, 'lsof'), FW_SIPS: join(bin, 'sips'), ...extra });
const space = (...a) => node(join(repo.main, 'tools', 'space.mjs'), a, { cwd: repo.main, env: env(), timeout: 120000 });
const frames = (d) => { for (let i = 0; i < 4; i++) put(join(d, `f${i}.png`), 'P'.repeat(2048)); put(join(d, 'result.json'), '{}'); put(join(d, 'run.log'), 'l'); age(d); return d; };

before(() => {
  repo = makeTempRepo({ worktree: 'px-wt' });
  state = tempDir('fw-sprune-state-');
  scratch = tempDir('fw-sprune-scratch-');
  tmp = tempDir('fw-sprune-tmp-');
  bin = tempDir('fw-sprune-bin-');
  put(join(bin, 'lsof'), '#!/bin/sh\nprintf "p1\\nfcwd\\nn/\\n"\n'); chmodSync(join(bin, 'lsof'), 0o755);
  put(join(bin, 'sips'), '#!/bin/sh\ncp "$3" "$5"\n'); chmodSync(join(bin, 'sips'), 0o755);
  // a committed write-up on main cites one frames folder
  put(join(repo.main, 'fixes', 'px', 'README.md'), '# px\nKey frames: `out/pixels/cited/` (see f2.png).\n');
  git(repo.main, 'add', '-A');
  git(repo.main, 'commit', '-q', '-m', 'px: write-up');
  frames(join(repo.wt, 'out', 'pixels', 'old'));
  frames(join(repo.wt, 'out', 'pixels', 'cited'));
  const prof = join(repo.wt, 'out', 'probe', 'chrome', 'rot-123-abcdef01');
  put(join(prof, 'Local State'), '{}'); put(join(prof, 'Default', 'Cache', 'b'), 'c'.repeat(8192)); age(prof);
  frames(join(repo.main, 'out', 'iphone-screen', 'clip'));
  put(join(repo.main, 'out', 'iphone-screen', 'clip.mov'), 'MOV');
});

test('prune: usage; a dry run lists only the auto-clean classes and deletes nothing', () => {
  assert.equal(space('prune', '--bogus').code, 2);
  assert.equal(space('prune', '--list', 'x').code, 2, '--list is a report option');
  const r = space('prune', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PRUNE PLAN .*: 2 item\(s\)/m);
  assert.match(r.stdout, /Chrome profiles .*: 1 = /);
  assert.match(r.stdout, /full-frame image files .*: 1 = 8 KB/);
  assert.match(r.stdout, /\.claude\/worktrees\/px-wt\/out\/pixels\/old /);
  assert.match(r.stdout, /kept \(why\):\n\s+1\s+frames: cited/);
  assert.match(r.stdout, /DRY RUN: nothing was deleted/);
  assert.ok(existsSync(join(repo.wt, 'out', 'pixels', 'old', 'f0.png')));
  assert.ok(existsSync(join(repo.wt, 'out', 'probe', 'chrome', 'rot-123-abcdef01')));
  assert.equal(existsSync(join(state, 'space', 'prune.log')), false);
});

test('prune --apply: removes the profile and the uncited frames (record + thumbnails first), keeps the rest, logs sizes', () => {
  const r = space('prune', '--apply', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /REMOVED 2 item\(s\)/);
  const old = join(repo.wt, 'out', 'pixels', 'old');
  assert.deepEqual(readdirSync(old).sort(), ['_pruned-thumbs', 'frames-pruned.json', 'result.json', 'run.log']);
  assert.equal(readdirSync(join(old, '_pruned-thumbs')).length, 4);
  assert.equal(existsSync(join(repo.wt, 'out', 'probe', 'chrome', 'rot-123-abcdef01')), false);
  assert.equal(readdirSync(join(repo.wt, 'out', 'pixels', 'cited')).filter((f) => f.endsWith('.png')).length, 4, 'cited stays');
  for (const f of ['clip/f0.png', 'clip.mov']) assert.ok(existsSync(join(repo.main, 'out', 'iphone-screen', f)), `${f} stays`);
  const log = readFileSync(join(state, 'space', 'prune.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((l) => l.cls).sort(), ['frames', 'profile']);
  assert.equal(log.find((l) => l.cls === 'frames').bytes, 4 * 2048);
  assert.ok(log.every((l) => !l.path.startsWith('/')), 'repo-relative paths in the log');
  const again = space('prune', '--scratch', scratch);
  assert.match(again.stdout, /^PRUNE PLAN .*: 0 item\(s\)/m);
});

test('report: out/ by writer and by checkout, citations, owners (I-124)', () => {
  const r = space('report', '--json', '--scratch', scratch);
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(r.stdout);
  const cited = j.items.find((i) => i.rel === 'out/pixels/cited');
  assert.deepEqual(cited.citedBy, ['fixes/px/README.md']);
  assert.equal(cited.checkoutRel, '.claude/worktrees/px-wt');
  assert.ok(j.byWriter.length && j.byCheckout.some((g) => g.key === '.claude/worktrees/px-wt'));
  assert.ok(j.citationCount >= 1);
  const t = space('report', '--scratch', scratch);
  assert.match(t.stdout, /^5\. out\/ by writer/m);
  assert.match(t.stdout, /^6\. out\/ by checkout/m);
  assert.match(t.stdout, /^7\. Landed, finished worktrees/m);
});

test('lock.mjs run: a new timing hold is refused under the disk floor (DISK-LOW); --no-timing, phone and shared holds run', () => {
  const lock = (...a) => node(join(repo.main, 'tools', 'lock.mjs'), a, { cwd: repo.main, env: env({ FW_TIMING_MIN_FREE_GB: '8', FW_DISK_FREE_GB: '2' }), timeout: 60000 });
  const r = lock('run', 'chrome-measure', '--owner', 'ab-x', '--max-seconds', '30', '--', 'true');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /DISK-LOW: only 2\.0 GB free on this disk \(under 8 GB\)/);
  assert.match(r.stderr, /prune --apply/);
  const nt = lock('run', 'chrome-measure', '--owner', 'build-x', '--no-timing', '--max-seconds', '30', '--', 'true');
  assert.equal(nt.code, 0, nt.out);
  // a phone run in a normal hold is not refused (the lead's ruling); the command only names the phone tool here
  const ph = lock('run', 'chrome-measure', '--owner', 'phone-x', '--max-seconds', '30', '--', 'sh', '-c', 'true iphone.mjs scroll');
  assert.equal(ph.code, 0, ph.out);
  const sh = lock('run', 'chrome-measure', '--owner', 'tests-x', '--shared', '--weight', '1', '--max-seconds', '30', '--', 'true');
  assert.equal(sh.code, 0, sh.out);
});

test('idle.mjs check --by lead: the disk alarm posts one thread (no prune in a check)', () => {
  const idle = (gb) => node(join(repo.main, 'tools', 'idle.mjs'), ['check', '--by', 'lead'], { cwd: repo.main, env: env({ FW_SPACE_ALARM_GB: '20', FW_DISK_FREE_GB: String(gb), FW_SPACE_AUTOPRUNE: '1' }), timeout: 120000 });
  const a = idle(5);
  assert.match(a.stdout, /^DISK-LOW 5\.0 GB free, under the 20 GB alarm$/m);
  assert.match(a.stdout, /^POSTED T-\d+ disk: 5\.0 GB free/m);
  assert.doesNotMatch(a.stdout, /PRUNE/);
  const b = idle(5);
  assert.doesNotMatch(b.stdout, /POSTED/);
  const c = idle(40);
  assert.match(c.stdout, /^ENDED disk: 40\.0 GB free again; thread T-\d+/m);
});

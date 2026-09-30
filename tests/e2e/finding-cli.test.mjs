// tools/finding.mjs CLI (incident I-013) on a temp repo with two worktrees sharing one $FW_STATE_DIR:
// output words (POSTED / SIMILAR / ACKED / RESOLVED), exit codes, the board seen from every worktree
// without a commit, concurrent posters in separate processes, and `wait` woken by another process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, makeTempRepo, git, sleep } from '../helpers.mjs';

function setup() {
  const repo = makeTempRepo({ worktree: 'fix-a' });
  const wt2 = join(repo.main, '.claude', 'worktrees', 'fix-b');
  git(repo.main, 'worktree', 'add', '-q', wt2, '-b', 'wt/fix-b');
  const env = { FW_STATE_DIR: tempDir('fw-findcli-') };
  const cli = (checkout, extra = {}) => (...a) => node(join(checkout, 'tools', 'finding.mjs'), a, { cwd: checkout, env: { ...env, ...extra } });
  const cliAsync = (checkout) => (...a) => nodeAsync(join(checkout, 'tools', 'finding.mjs'), a, { cwd: checkout, env });
  return { ...repo, wt2, env, A: cli(repo.wt), B: cli(wt2), M: cli(repo.main), cli, Aasync: cliAsync(repo.wt), Basync: cliAsync(wt2) };
}

test('post / SIMILAR / list / show / ack / unread / digest / resolve, exit codes and usage errors', () => {
  const { A, B, M, wt, cli } = setup();
  const p = A('post', '--by', 'fix-a', '--kind', 'technique', '--topics', 'commission,nav-morph', '--title', 'Write custom properties only on change', '--where', 'JS 3100-3155', '--evidence', 'frames >20 ms 96 -> 71', '--body', 'keep the last value in the closure');
  assert.equal(p.code, 0, p.out);
  assert.match(p.stdout, /^POSTED F-001: Write custom properties only on change$/m);

  // the other worktree sees it at once and gets SIMILAR for the same idea, nothing is posted
  const s = B('post', '--by', 'fix-b', '--kind', 'technique', '--topics', 'hero-exit', '--title', 'Only write custom properties on change');
  assert.equal(s.code, 0, s.out);
  assert.match(s.stdout, /^SIMILAR F-001 \[open\]: Write custom properties only on change$/m);
  assert.match(s.stdout, /ack F-001 --by fix-b/);
  assert.match(s.stdout, /--force/);
  assert.match(B('post', '--by', 'fix-b', '--kind', 'technique', '--topics', 'hero-exit', '--title', 'Only write custom properties on change', '--force').stdout, /^POSTED F-002/m);
  // FW_AGENT stands in for --by
  const viaEnv = cli(wt, { FW_AGENT: 'from-env' })('post', '--kind', 'pitfall', '--topics', 'all', '--title', 'blur(0) still repaints');
  assert.match(viaEnv.stdout, /^POSTED F-003/m, viaEnv.out);

  const l = M('list');
  assert.equal(l.code, 0, l.out);
  const lines = l.stdout.trim().split('\n');
  assert.equal(lines.length, 3, 'one line per finding');
  assert.match(lines[0], /^F-001 {2}technique {4}Write custom properties only on change {2}\(commission, nav-morph; fix-a \d{4}-\d\d-\d\d \d\d:\d\d; 0 acks\)$/);
  assert.match(lines[2], /^F-003 {2}pitfall {6}blur\(0\) still repaints {2}\(all; from-env /, 'newest last');
  assert.deepEqual(M('list', '--kind', 'pitfall').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-003']);
  assert.deepEqual(M('list', '--topic', 'hero-exit').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-002', 'F-003']);
  assert.deepEqual(M('list', '--since', 'F-002').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-003']);
  assert.equal(M('list', '--kind', 'question').stdout.trim(), 'no findings');

  const sh = M('show', '1');
  assert.match(sh.stdout, /^F-001 {2}technique {4}Write/);
  assert.match(sh.stdout, /where: JS 3100-3155\n {2}evidence: frames >20 ms 96 -> 71\n {2}body: keep the last value in the closure/);
  assert.match(sh.stdout, /posted from: wt\/fix-a @ [0-9a-f]+/);
  assert.equal(JSON.parse(M('show', 'F-001', '--json').stdout).branch, 'wt/fix-a');

  assert.deepEqual(B('list', '--unread', '--as', 'fix-b').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-001', 'F-003']);
  const ack = B('ack', '1', '--by', 'fix-b', '--note', 'applied in hero-exit');
  assert.equal(ack.code, 0, ack.out);
  assert.match(ack.stdout, /^ACKED F-001 by fix-b: applied in hero-exit$/m);
  assert.match(M('show', '1').stdout, /acks:\n {4}fix-b \S+ applied in hero-exit/);
  assert.match(M('list').stdout, /^F-001 .*; 1 ack\)$/m);
  assert.deepEqual(B('list', '--unread', '--as', 'fix-b').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-003']);
  assert.match(B('list', '--unread').stderr, /--unread needs --as/);

  const d = M('digest');
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, /^\| T1 \| \*\*Write custom properties only on change\.\*\* keep the last value in the closure \| commission, nav-morph: frames >20 ms 96 -> 71 \| JS 3100-3155; F-001 by fix-a; acks: fix-b \(applied in hero-exit\) \|$/m);
  assert.match(d.stdout, /^\| P1 \| \*\*blur\(0\) still repaints\.\*\* \| all; F-003 by from-env \| {2}\|$/m);

  const notLead = A('resolve', '1', '--by', 'fix-a', '--folded', 'T10');
  assert.equal(notLead.code, 1, notLead.out);
  assert.match(notLead.stderr, /only the lead/);
  const r = M('resolve', '1', '--by', 'lead', '--folded', 'T10', '--note', 'folded as T10');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^RESOLVED F-001 \(folded T10\): Write custom properties only on change$/m);
  assert.match(M('resolve', '2', '--by', 'lead', '--folded', 'duplicate:F-001').stdout, /^RESOLVED F-002 \(duplicate of F-001\)/m);
  assert.match(M('list').stdout, /^F-001 {2}technique {4}\[folded T10\] Write custom/m);
  assert.deepEqual(M('list', '--open').stdout.trim().split('\n').map((x) => x.slice(0, 5)), ['F-003']);
  assert.doesNotMatch(M('digest').stdout, /Write custom/);

  for (const bad of [
    ['post', '--kind', 'technique', '--topics', 'a', '--title', 'no by'],
    ['post', '--by', 'x', '--topics', 'a', '--title', 'no kind'],
    ['post', '--by', 'x', '--kind', 'rumour', '--topics', 'a', '--title', 'bad kind'],
    ['post', '--by', 'x', '--kind', 'technique', '--title', 'no topics'],
    ['show', '42'],
    ['show'],
    ['ack', '3'],
    ['resolve', '3', '--by', 'lead', '--folded', 'X1'],
    ['list', '--since', 'last tuesday'],
    ['wait', '--timeout', '0.1'],
    ['frobnicate'],
  ]) {
    const x = M(...bad);
    assert.equal(x.code, 1, `${bad.join(' ')} -> ${x.out}`);
  }
  assert.equal(M('help').code, 0);
});

test('concurrent posts from separate processes and worktrees get unique ids', async () => {
  const s = setup();
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const res = await Promise.all(words.map((w, k) => (k % 2 ? s.Aasync : s.Basync)('post', '--by', `agent-${k}`, '--kind', 'coupling', '--topics', 'scroll-engine', '--title', `Coupling ${w}`)));
  assert.ok(res.every((r) => r.code === 0), res.map((r) => r.out).join('\n'));
  const ids = res.map((r) => r.stdout.match(/^POSTED (F-\d+)/m)?.[1]);
  assert.deepEqual([...ids].sort(), ['F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006'], res.map((r) => r.out).join('\n'));
  assert.equal(s.M('list').stdout.trim().split('\n').length, 6);
});

test('wait (background) wakes on a post from another process; own posts and other topics do not wake it; timeout exit 3', async () => {
  const s = setup();
  s.A('post', '--by', 'fix-a', '--kind', 'technique', '--topics', 'nav-morph', '--title', 'Mount hidden heavy DOM lazily');
  const t = s.M('wait', '--as', 'fix-b', '--timeout', '0.3', '--poll', '0.1');
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^NO NEW FINDINGS after 0\.3 s/m, 'existing findings do not wake a new wait');

  const waiting = s.Basync('wait', '--as', 'fix-b', '--topic', 'hero-exit,scroll-engine', '--timeout', '30', '--poll', '0.1');
  await sleep(600);
  s.B('post', '--by', 'fix-b', '--kind', 'technique', '--topics', 'hero-exit', '--title', 'My own post');
  s.A('post', '--by', 'fix-a', '--kind', 'technique', '--topics', 'countdown', '--title', 'Another topic entirely');
  await sleep(400);
  s.A('post', '--by', 'fix-a', '--kind', 'coupling', '--topics', 'scroll-engine,nav-morph', '--title', 'Engine iE drives the nav callback');
  const w = await waiting;
  assert.equal(w.code, 0, w.out);
  assert.match(w.stdout, /^NEW F-004 {2}coupling {5}Engine iE drives the nav callback/m);
  assert.doesNotMatch(w.stdout, /My own post|Another topic/);
  assert.match(w.stdout, /finding\.mjs show F-004/);
});

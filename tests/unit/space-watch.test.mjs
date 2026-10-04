// I-124: the disk pass of idle.mjs watch (tools/lib/space-watch.mjs): one alarm thread per low-disk period to the
// steward (I-175; the owners of the biggest out/ folders are named in it, not assigned), one reply under the timing floor, closed when space is back; the
// automatic prune (default on, FW_SPACE_AUTOPRUNE=0 off) only for the lead's watch, on its interval, never beside
// someone's exclusive chrome-measure hold. Fake free-space readings, a temp $FW_STATE_DIR, a fake prune.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tempDir } from '../helpers.mjs';

const W = await import('../../tools/lib/space-watch.mjs');
const T = await import('../../tools/lib/console-threads.mjs');
const R = await import('../../tools/lib/thread-routing.mjs');
const L = await import('../../tools/lib/lock.mjs');
const H = 3600e3;
const T0 = Date.parse('2026-10-04T12:00:00Z');
const saved = {};
let calls;
beforeEach(async () => {
  saved.FW_STATE_DIR = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = tempDir('fw-swatch-');
  calls = [];
  await R.setDesk({ agent: 'mgmt-ops-10', by: 'lead' });
  await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
});
afterEach(() => { if (saved.FW_STATE_DIR === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = saved.FW_STATE_DIR; });

const env = (gb, extra = {}) => ({ FW_DISK_FREE_GB: String(gb), FW_SPACE_ALARM_GB: '20', FW_TIMING_MIN_FREE_GB: '8', ...extra });
const folders = [{ show: '.claude/worktrees/a/out/rest-script', bytes: 10 * 1024 ** 3, branch: 'worktree-a', owners: ['fix-rest-script'] }, { show: 'out/ab', bytes: 20 * 1024 ** 2, branch: 'main', owners: ['lead'] }];
const prune = (o) => { calls.push(o); return { plan: { kept: [1, 2] }, result: { removed: [{ bytes: 5 }], bytes: 5, skipped: [] } }; };
const pass = (gb, now, o = {}) => { const lines = []; return W.diskPass({ by: 'lead', log: (s) => lines.push(s), now, env: env(gb, o.env), mainRoot: '/nowhere', rows: [], folders, prune, ...o, ...(o.env ? { env: env(gb, o.env) } : {}) }).then((r) => ({ ...r, lines })); };

test('plenty of space: no thread; the lead\'s watch prunes on its interval (6 h), not every pass', async () => {
  const a = await pass(50, T0);
  assert.equal(a.alarm, false);
  assert.equal(T.listThreads().length, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].apply, calls[0].by], [true, 'lead']);
  assert.match(a.lines.join('\n'), /PRUNE removed 1 item\(s\)/);
  await pass(50, T0 + 5 * H);
  assert.equal(calls.length, 1, 'within 6 h: no second prune');
  await pass(50, T0 + 6 * H);
  assert.equal(calls.length, 2);
  await pass(50, T0 + 13 * H, { env: { FW_SPACE_PRUNE_EVERY_H: '24' } });
  assert.equal(calls.length, 2, 'FW_SPACE_PRUNE_EVERY_H');
});

test('auto-clean off: FW_SPACE_AUTOPRUNE=0, autoClean false (idle.mjs check), or a watch not run as the lead', async () => {
  await pass(50, T0, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  await pass(50, T0, { autoClean: false });
  await pass(50, T0, { by: 'ops' });
  assert.equal(calls.length, 0);
});

test('low disk: one thread to the steward (I-175: not the desk or the folder owners), a reply under the timing floor, closed when space is back', async () => {
  const a = await pass(15, T0, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(a.alarm, true);
  const [t] = T.listThreads();
  assert.equal(a.posted, t.id);
  assert.match(t.title, /^Disk nearly full: 15\.0 GB free \(I-124\)$/);
  assert.deepEqual(t.assignees, ['mgmt-devices']);
  const body = t.messages[0].text;
  assert.match(body, /10\.0 GB \.claude\/worktrees\/a\/out\/rest-script \(worktree-a, fix-rest-script\)/);
  assert.match(body, /every JSON, Markdown, log, phone record and recording stays/);
  assert.match(body, /node tools\/space\.mjs prune \(dry run\)/);
  await pass(14, T0 + 60e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(T.listThreads().length, 1, 'one thread per low period');
  const b = await pass(5, T0 + 120e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.match(b.lines.join('\n'), /under the 8 GB timing floor/);
  assert.equal(T.getThread(t.id).messages.length, 2);
  assert.match(T.getThread(t.id).messages[1].text, /lock\.mjs refuses new timing holds \(DISK-LOW\)/);
  await pass(4, T0 + 180e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(T.getThread(t.id).messages.length, 2, 'the floor reply once');
  await pass(21, T0 + 240e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(T.getThread(t.id).status, 'open', 'not over until alarm + 2 GB');
  const e = await pass(22.5, T0 + 300e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(e.ended, t.id);
  assert.equal(T.getThread(t.id).status, 'closed');
  await pass(15, T0 + 360e3, { env: { FW_SPACE_AUTOPRUNE: '0' } });
  assert.equal(T.listThreads().length, 2, 'a new low period, a new thread');
});

test('while low, auto-clean runs hourly; alarm 0 = off', async () => {
  await pass(15, T0);
  await pass(15, T0 + H);
  assert.equal(calls.length, 2);
  const lines = [];
  const r = await W.diskPass({ by: 'lead', log: (s) => lines.push(s), now: T0, env: env(1, { FW_SPACE_ALARM_GB: '0', FW_SPACE_AUTOPRUNE: '0' }), mainRoot: '/nowhere', rows: [], folders, prune });
  assert.equal(r.alarm, false);
});

test('without --by lead: says DISK-LOW once per low period, posts and saves nothing', async () => {
  const a = await pass(15, T0, { by: 'ops' });
  const b = await pass(15, T0 + 60e3, { by: 'ops' });
  assert.match(a.lines.join('\n'), /^DISK-LOW 15\.0 GB free, under the 20 GB alarm$/m);
  assert.equal(b.lines.length, 0);
  assert.equal(T.listThreads().length, 0);
  assert.equal(existsSync(W.watchFile()), false);
  await pass(50, T0 + 120e3, { by: 'ops' });
  assert.equal((await pass(15, T0 + 180e3, { by: 'ops' })).lines.length, 1, 'a new low period');
});

test('the automatic prune waits beside someone\'s exclusive chrome-measure hold or queued waiter', async () => {
  const h = await L.tryAcquire('chrome-measure', { owner: 'ab-run', kind: 'lease', ttlSec: 60 });
  assert.equal(h.ok, true);
  const a = await pass(50, T0);
  assert.equal(calls.length, 0);
  assert.match(a.lines.join('\n'), /PRUNE deferred: WAIT: chrome-measure is held by "ab-run"/);
  assert.equal((await pass(50, T0 + 60e3)).lines.length, 0, 'deferred is said once');
  await L.release('chrome-measure', { owner: 'ab-run' });
  await pass(50, T0 + 120e3);
  assert.equal(calls.length, 1, 'runs once the hold ends');
});

test('topFolders: biggest out/ entries over the checkouts, repo-relative, with branch and owners', () => {
  // the real report of this repo is not read here; a temp repo without out/ gives an empty list
  assert.deepEqual(W.topFolders({ mainRoot: tempDir('fw-swatch-repo-'), rows: [] }), []);
});

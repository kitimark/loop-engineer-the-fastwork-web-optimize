// tools/lib/agent-view.mjs (I-118, user T-074: "how do I trace the work of wi-stack? wi-gpu-bundle as well"): one
// agent's work from every place it leaves a trace (status rows it owns or updated, its lock holds, queue places and
// waits now, its holds.log lines, console steps, threads, commits tagged "(<name>)" on main, fixes/*/README.md that
// name it, incidents, findings, proposals), and the list of all agents. Pure builders on synthetic sources, plus the
// bounded readers (holds.log tail, git log, READMEs) on temp files and a temp git repo. Hard rule 12: no LAN address,
// URL or device id reaches a view. Example addresses are private-range or .invalid; none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, git, run } from '../helpers.mjs';

const A = await import('../../tools/lib/agent-view.mjs');

const LAN = 'http://192.168.77.12:5497/';
const NOW = Date.parse('2026-10-04T06:00:00Z');
const at = (min) => new Date(NOW - min * 60000).toISOString(); // `min` minutes ago

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-agent-view-'); });

/** Sources as gatherAgentSources returns them: wi-stack works on a row iphone-runner owns, holds Chrome, waits for the phone. */
function sources(extra = {}) {
  return {
    status: [
      { id: 'best-stack', title: 'Best stack on the phone', kind: 'fix', owner: 'iphone-runner', state: 'measuring', note: 'block 2 of 3', updatedAt: at(5), updatedBy: 'wi-stack', createdBy: 'iphone-runner', createdAt: at(300),
        history: [{ at: at(300), by: 'iphone-runner', action: 'created', changes: { state: 'queued' } }, { at: at(5), by: 'wi-stack', action: 'set', changes: { state: 'measuring', note: `block 2 of 3 at ${LAN}` } }] },
      { id: 'gpu-preview', title: 'GPU preview', kind: 'fix', owner: 'wi-gpu-bundle', state: 'implementing', updatedAt: at(10), updatedBy: 'wi-gpu-bundle', history: [{ at: at(10), by: 'wi-gpu-bundle', action: 'created', changes: { state: 'implementing' } }] },
      { id: 'cd-roll-ca', title: 'Countdown roll', kind: 'fix', owner: 'fix-cd-roll-ca', state: 'landed', updatedAt: at(600), updatedBy: 'fix-cd-roll-ca', history: [] },
      { id: 'old-try', title: 'An old try', kind: 'fix', owner: 'wi-stack', state: 'dropped', updatedAt: at(900), updatedBy: 'wi-stack', history: [{ at: at(900), by: 'wi-stack', action: 'set', changes: { state: 'dropped' } }] },
    ],
    locks: {
      'chrome-measure': { resource: 'chrome-measure', holder: { owner: '(shared)', shared: true, format: 'rw1', acquiredAt: at(3), readers: [
        { owner: 'wi-stack', weight: 1, acquiredAt: at(3), meta: { job: { text: `phone build check on ${LAN}` }, url: LAN } },
        { owner: 'cd-roll-ca', weight: 1, acquiredAt: at(2), meta: {} },
      ] }, stale: null, queue: [] },
      iphone: { resource: 'iphone', holder: { owner: 'iphone-runner', acquiredAt: at(20), expiresAt: at(-10), meta: { url: LAN } }, stale: null, queue: [{ owner: 'fix-x' }, { owner: 'wi-stack' }] },
      simulator: { resource: 'simulator', holder: null, stale: null, queue: [] },
    },
    holds: [
      { at: at(400), resource: 'chrome-measure', owner: 'wi-stack', mode: 'shared', weight: 1, acquiredAt: at(402), endedAt: at(400), durationSec: 132.3, code: 0 },
      { at: at(200), resource: 'chrome-measure', owner: 'fix-x', short: true, acquiredAt: at(201), endedAt: at(200), durationSec: 50, code: 0 },
      { at: at(100), resource: 'chrome-measure', owner: 'wi-stack', short: false, acquiredAt: at(110), endedAt: at(100), durationSec: 600, code: 124, killed: true },
      { at: at(90), resource: 'chrome-measure', owner: 'cd-roll-ca', mode: 'shared', weight: 1, acquiredAt: at(91), endedAt: at(90), durationSec: 22.6, code: 0 },
    ],
    waits: [{ schema: 'fw-wait/1', tool: 'lock.mjs wait', owner: 'wi-stack', what: 'iphone until mine', reason: 'the phone for block 3', since: at(4), pid: 1 }],
    steps: [
      { id: 'C-007', by: 'wi-stack', kind: 'action', title: `Swipe on ${LAN}`, url: LAN, instructions: `Open ${LAN}`, status: 'pending', createdAt: at(30), updatedAt: at(30) },
      { id: 'C-003', by: 'wi-stack', kind: 'question', title: 'Which felt smoother?', status: 'answered', createdAt: at(500), updatedAt: at(480) },
      { id: 'C-004', by: 'lead', kind: 'question', title: 'Not ours', status: 'pending', createdAt: at(40), updatedAt: at(40) },
    ],
    threads: [
      { id: 'T-001', title: 'How is the stack?', status: 'open', createdBy: 'user', createdAt: at(60), updatedAt: at(50), assignees: [], messages: [{ n: 1, at: at(60), by: 'user', text: 'how?' }, { n: 2, at: at(50), by: 'wi-stack', text: `see ${LAN}` }], reads: {} },
      { id: 'T-002', title: 'Assigned only', status: 'closed', createdBy: 'user', createdAt: at(700), updatedAt: at(650), assignees: ['wi-stack'], messages: [{ n: 1, at: at(700), by: 'user', text: 'x' }], reads: {} },
      { id: 'T-003', title: 'Not ours', status: 'open', createdBy: 'user', createdAt: at(10), updatedAt: at(10), assignees: ['lead'], messages: [{ n: 1, at: at(10), by: 'user', text: 'y' }], reads: {} },
    ],
    proposals: [{ id: 'PR-004', by: 'wi-stack', title: 'Stack look-alike', state: 'accepted', createdAt: at(800), updatedAt: at(700) }],
    incidents: [
      { id: 'I-001', title: `serve died on ${LAN}`, status: 'open', reportedBy: 'wi-stack', openedAt: at(70), affected: [], history: [{ at: at(70), by: 'wi-stack', action: 'opened' }] },
      { id: 'I-002', title: 'lock hung', status: 'resolved', reportedBy: 'fix-x', openedAt: at(1000), affected: [{ by: 'wi-stack', at: at(990), blocking: true }], history: [{ at: at(1000), by: 'fix-x', action: 'opened' }] },
      { id: 'I-003', title: 'not ours', status: 'open', reportedBy: 'fix-x', openedAt: at(20), affected: [], history: [] },
    ],
    findings: [
      { id: 'F-010', by: 'wi-stack', kind: 'pitfall', title: 'stack order matters', status: 'open', postedAt: at(120) },
      { id: 'F-011', by: 'fix-x', kind: 'technique', title: 'not ours', status: 'open', postedAt: at(110) },
    ],
    commits: [
      { sha: 'aaaaaaa1', at: at(15), subject: 'fix: stack block 2 results (wi-stack)' },
      { sha: 'bbbbbbb2', at: at(16), subject: 'ops: P-095 HIT (mgmt-ops-10)' },
      { sha: 'ccccccc3', at: at(17), subject: 'tools: (wi-stack) is not the tag here' },
      { sha: 'ddddddd4', at: at(18), subject: 'fix: stack tiles (wi-stack-2)' },
      { sha: 'eeeeeee5', at: at(19), subject: 'gpu: preview bundle (wi-gpu-bundle)' },
      { sha: 'fffffff6', at: at(21), subject: 'docs: waits take --owner (I-108)' },
      { sha: 'aaaaaab7', at: at(22), subject: 'cd-strip: picked the control (uncontrolled)' },
      { sha: 'aaaaaac8', at: at(23), subject: 'cd-roll-ca: roll results (cd-roll-ca)' },
    ],
    writeups: [
      { path: 'fixes/stack5/README.md', at: at(25), text: `# Stack 5\n\nBuilt by wi-stack.\nwi-stack ran the block on ${LAN}.\n` },
      { path: 'fixes/other/README.md', at: at(26), text: '# Other\n\nwi-stacked is not the name, nor wi-stack-2.\n' },
    ],
    errors: [],
    ...extra,
  };
}

test('parseAgent: an agent name, or refused (user, unknown, paths, spaces, too long)', () => {
  assert.equal(A.parseAgent('wi-stack'), 'wi-stack');
  assert.equal(A.parseAgent('mgmt-ops-10'), 'mgmt-ops-10');
  for (const bad of ['', 'user', 'unknown', '../x', 'a b', 'x/y', '-x', 'x'.repeat(62), LAN, undefined]) assert.throws(() => A.parseAgent(bad), /agent name/, String(bad));
});

test('buildAgentView: every trace of wi-stack, running now vs finished, newest first, nothing personal', () => {
  const v = A.buildAgentView('wi-stack', sources(), { now: NOW });
  assert.equal(v.schema, 'fw-agent/1');
  assert.equal(v.name, 'wi-stack');
  // running now: holds Chrome in the shared lane, in line for the phone, a live wait, a fresh row it updated
  assert.equal(v.running, true);
  assert.ok(v.runningWhy.some((w) => /using Chrome now \(shared\) since \d\d:\d\dZ: phone build check on <link>/.test(w)), v.runningWhy.join('\n'));
  assert.ok(v.runningWhy.some((w) => /in line for the phone, #2 of 2/.test(w)), v.runningWhy.join('\n'));
  assert.ok(v.runningWhy.some((w) => /best-stack/.test(w)), v.runningWhy.join('\n'));
  assert.equal(v.live.holds.length, 1);
  assert.deepEqual(v.live.holds.map((h) => [h.resource, h.shared]), [['chrome-measure', true]]);
  assert.deepEqual(v.live.queue.map((q) => [q.resource, q.position, q.of]), [['iphone', 2, 2]]);
  assert.equal(v.live.waits.length, 1);
  // status rows: the one it updated (owned by iphone-runner) and its own finished one; not wi-gpu-bundle's
  assert.deepEqual(v.rows.map((r) => [r.id, r.how, r.open]), [['best-stack', 'updated it', true], ['old-try', 'owns it', false]]);
  assert.equal(v.rows[0].href, '/status#best-stack');
  assert.equal(v.rows[0].owner, 'iphone-runner');
  // holds.log: its own lines only, newest first, plain
  assert.deepEqual(v.holds.map((h) => h.code), [124, 0]);
  assert.match(v.holds[0].plain, /^Chrome for 10 min, exit 124 \(stopped at its time limit\)$/);
  assert.match(v.holds[1].plain, /^Chrome \(shared, w1\) for 2 min 12 s, ok$/);
  // console steps it posted: the title only, open first
  assert.deepEqual(v.steps.map((s) => [s.id, s.open, s.href]), [['C-007', true, '/#C-007'], ['C-003', false, '/#C-003']]);
  assert.equal(v.steps[0].title, 'Swipe on <link>');
  // threads: one it wrote in, one it is assigned to
  assert.deepEqual(v.threads.map((t) => [t.id, t.open, t.how]), [['T-001', true, 'wrote 1 message'], ['T-002', false, 'assigned to it']]);
  assert.equal(v.threads[0].href, '/threads#T-001');
  // commits: only subjects ending in "(wi-stack)"
  assert.deepEqual(v.commits.map((c) => c.sha), ['aaaaaaa1']);
  // write-ups that name it as a word (not wi-stacked, not wi-stack-2)
  assert.deepEqual(v.writeups.map((w) => [w.path, w.mentions, w.href]), [['fixes/stack5/README.md', 2, '/writeup/fixes/stack5/README.md']]);
  assert.equal(v.writeups[0].line, 'Built by wi-stack.');
  // incidents it reported or that affect it; findings it posted; its proposals
  assert.deepEqual(v.incidents.map((i) => [i.id, i.open, i.how]), [['I-001', true, 'reported it'], ['I-002', false, 'affected']]);
  assert.deepEqual(v.findings.map((f) => f.id), ['F-010']);
  assert.deepEqual(v.proposals.map((p) => [p.id, p.href]), [['PR-004', '/proposals#PR-004']]);
  // the merged timeline: newest first, links where the console has a page
  const ts = v.timeline.map((e) => e.at);
  assert.deepEqual(ts, [...ts].sort().reverse(), 'newest first');
  assert.equal(v.timeline[0].kind, 'hold');
  assert.ok(v.timeline.some((e) => e.kind === 'commit' && /aaaaaaa1/.test(e.text)));
  assert.ok(v.timeline.some((e) => e.kind === 'status' && e.href === '/status#best-stack' && /measuring/.test(e.text)));
  assert.equal(v.lastAt, v.timeline[0].at);
  // Hard rule 12: nothing personal anywhere in the view
  const json = JSON.stringify(v);
  for (const bad of ['192.168', 'http://', 'instructions']) assert.ok(!json.includes(bad), `${bad} leaked`);
});

test('buildAgentView: a lock owner that is the id or alias of a row the agent owns counts as the agent (not another agent)', () => {
  const v = A.buildAgentView('fix-cd-roll-ca', sources(), { now: NOW });
  assert.deepEqual(v.aka, ['cd-roll-ca']);
  assert.deepEqual(v.live.holds.map((h) => [h.resource, h.as]), [['chrome-measure', 'cd-roll-ca']]);
  assert.deepEqual(v.holds.map((h) => h.as), ['cd-roll-ca']);
  assert.deepEqual(v.commits.map((c) => c.sha), ['aaaaaac8'], 'a commit tagged with its row id is its own');
  assert.equal(v.aliasOf, null);
  // the topic id's own page (a queue line links it) points at the agent it stands for
  const t = A.buildAgentView('cd-roll-ca', sources(), { now: NOW });
  assert.equal(t.aliasOf, 'fix-cd-roll-ca');
  assert.match(A.agentText(t), /cd-roll-ca is a status row id that fix-cd-roll-ca uses on the locks and in commits: node tools\/status\.mjs agent fix-cd-roll-ca/);
  assert.equal(v.running, true);
  // a row id that is another agent's own name is never taken as an alias
  const s = sources();
  s.status.push({ id: 'wi-stack', title: 'Named like an agent', kind: 'fix', owner: 'lead', state: 'testing', updatedAt: at(1), updatedBy: 'lead', history: [] });
  s.status.push({ id: 'x-row', title: 'wi-stack owns', kind: 'fix', owner: 'wi-stack', state: 'testing', updatedAt: at(1), updatedBy: 'wi-stack', history: [] });
  assert.deepEqual(A.buildAgentView('lead', s, { now: NOW }).live.holds, [], 'the lead does not get wi-stack\'s hold');
});

test('buildAgentView: a finished agent (nothing live, rows over) is not running; last activity from its newest trace', () => {
  const s = sources({ locks: {}, waits: [] });
  s.status = s.status.filter((r) => r.id !== 'best-stack');
  const v = A.buildAgentView('wi-stack', s, { now: NOW });
  assert.equal(v.running, false);
  assert.deepEqual(v.runningWhy, []);
  assert.equal(v.lastAt, at(15), 'the commit 15 min ago');
  assert.match(v.lastWhat, /aaaaaaa1/);
  // a stale active row it owns is not "running", but says so
  s.status.push({ id: 'st9', title: 'Stale row', kind: 'fix', owner: 'wi-stack', state: 'implementing', updatedAt: at(200), updatedBy: 'wi-stack', history: [] });
  const v2 = A.buildAgentView('wi-stack', s, { now: NOW, staleAfterMin: 45 });
  assert.equal(v2.running, false);
  assert.equal(v2.rows.find((r) => r.id === 'st9').stale, true);
  // an unknown agent: an empty view, not an error
  const none = A.buildAgentView('nobody-here', sources(), { now: NOW });
  assert.equal(none.running, false);
  assert.equal(none.lastAt, null);
  assert.deepEqual([none.rows, none.commits, none.timeline], [[], [], []]);
});

test('buildAgentsList: every agent seen anywhere, running first, then by last activity; lock topic ids folded into their owner', () => {
  const l = A.buildAgentsList(sources(), { now: NOW });
  assert.equal(l.schema, 'fw-agents/1');
  const names = l.agents.map((a) => a.name);
  for (const n of ['wi-stack', 'wi-gpu-bundle', 'iphone-runner', 'fix-cd-roll-ca', 'fix-x', 'mgmt-ops-10', 'lead']) assert.ok(names.includes(n), `${n} listed: ${names}`);
  for (const n of ['user', 'cd-roll-ca', '(shared)', 'I-108', 'uncontrolled']) assert.ok(!names.includes(n), `${n} not listed`);
  const by = Object.fromEntries(l.agents.map((a) => [a.name, a]));
  assert.equal(by['wi-stack'].running, true);
  assert.equal(by['fix-cd-roll-ca'].running, true, 'its row id holds Chrome');
  assert.equal(by['wi-gpu-bundle'].running, true, 'a fresh implementing row');
  assert.equal(by['mgmt-ops-10'].running, false);
  assert.equal(by['mgmt-ops-10'].lastAt, at(16));
  const firstDone = l.agents.findIndex((a) => !a.running);
  assert.ok(l.agents.slice(0, firstDone).every((a) => a.running) && l.agents.slice(firstDone).every((a) => !a.running), 'running first');
  const done = l.agents.slice(firstDone).map((a) => a.lastAt || '');
  assert.deepEqual(done, [...done].sort().reverse(), 'finished ones newest first');
  assert.equal(by['wi-stack'].href, '/agent/wi-stack');
  assert.ok(!JSON.stringify(l).includes('192.168'));
});

test('readHoldsTail: only the last bytes of holds.log, whole lines, bad lines skipped', () => {
  const d = tempDir('fw-holds-');
  const f = join(d, 'holds.log');
  const line = (i) => JSON.stringify({ at: at(1000 - i), resource: 'chrome-measure', owner: `a${i}`, code: 0, durationSec: 1 });
  writeFileSync(f, [...Array(2000).keys()].map(line).join('\n') + '\nnot json\n');
  const recs = A.readHoldsTail(f, 4096);
  assert.ok(recs.length > 10 && recs.length < 60, `a bounded tail: ${recs.length}`);
  assert.equal(recs[recs.length - 1].owner, 'a1999');
  assert.ok(recs.every((r) => r && r.owner), 'whole lines only');
  assert.deepEqual(A.readHoldsTail(join(d, 'missing.log')), []);
});

test('readCommits: subject, sha and date from git log main; bounded by -n; cached; a failing git reports instead of throwing', async () => {
  const repo = tempDir('fw-agent-git-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  for (const s of ['init', 'fix: one (wi-stack)', 'ops: two (mgmt-ops-10)']) git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', s);
  // git prints the committer's own offset (+07:00 here); every other time on the page is UTC, and they sort as strings
  const r = run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fix: three (wi-stack)'], { cwd: repo, env: { GIT_COMMITTER_DATE: '2030-10-04T12:19:00+07:00' } });
  assert.equal(r.code, 0, r.out);
  const c = await A.readCommits({ cwd: repo, n: 3, maxAgeMs: 0 });
  assert.deepEqual(c.map((x) => x.subject), ['fix: three (wi-stack)', 'ops: two (mgmt-ops-10)', 'fix: one (wi-stack)']);
  assert.match(c[0].sha, /^[0-9a-f]{7,12}$/);
  assert.equal(c[0].at, '2030-10-04T05:19:00.000Z', 'the +07:00 committer date as UTC');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fix: four (wi-stack)');
  assert.equal((await A.readCommits({ cwd: repo, n: 3 }))[0].subject, 'fix: three (wi-stack)', 'cached');
  assert.equal((await A.readCommits({ cwd: repo, n: 3, maxAgeMs: 0 }))[0].subject, 'fix: four (wi-stack)');
  await assert.rejects(A.readCommits({ cwd: tempDir('fw-agent-nogit-'), maxAgeMs: 0 }), /git log/);
});

test('readWriteups: fixes/*/README.md only, with mtime; re-read only when a file changed', () => {
  const root = tempDir('fw-agent-wu-');
  for (const t of ['a', 'b']) mkdirSync(join(root, 'fixes', t), { recursive: true });
  writeFileSync(join(root, 'fixes', 'a', 'README.md'), 'by wi-stack');
  writeFileSync(join(root, 'fixes', 'b', 'notes.md'), 'by wi-stack');
  writeFileSync(join(root, 'fixes', 'TOP.md'), 'by wi-stack');
  let w = A.readWriteups(root);
  assert.deepEqual(w.map((x) => x.path), ['fixes/a/README.md']);
  assert.ok(Number.isFinite(Date.parse(w[0].at)));
  writeFileSync(join(root, 'fixes', 'a', 'README.md'), 'by fix-x now');
  utimesSync(join(root, 'fixes', 'a', 'README.md'), new Date(NOW + 60000), new Date(NOW + 60000));
  w = A.readWriteups(root);
  assert.equal(w[0].text, 'by fix-x now');
  assert.deepEqual(A.readWriteups(join(root, 'none')), []);
});

test('agentText / agentsText: plain text for the CLI, running now first', () => {
  const t = A.agentText(A.buildAgentView('wi-stack', sources(), { now: NOW }));
  assert.match(t, /^wi-stack: RUNNING NOW/);
  assert.match(t, /using Chrome now \(shared\)/);
  assert.match(t, /status rows:\n.*best-stack/);
  assert.match(t, /commits on main:\n.*aaaaaaa1 fix: stack block 2 results \(wi-stack\)/);
  assert.match(t, /write-ups:\n.*fixes\/stack5\/README\.md \(2 mentions\)/);
  assert.match(t, /recent activity:/);
  assert.ok(!t.includes('192.168'));
  const s = sources({ locks: {}, waits: [] });
  s.status = s.status.filter((r) => r.id !== 'best-stack');
  assert.match(A.agentText(A.buildAgentView('wi-stack', s, { now: NOW })), /^wi-stack: finished \(not running\), last seen 15 min ago/);
  const lt = A.agentsText(A.buildAgentsList(sources(), { now: NOW }));
  assert.match(lt, /^RUNNING NOW \(\d+\):\n(?: {2}\S+ .*\n)* {2}wi-stack /m);
  assert.match(lt, /^FINISHED \(\d+\):/m);
});

test('gatherAgentSources: reads the real stores of $FW_STATE_DIR, each failure-tolerant', async () => {
  const S = await import('../../tools/lib/status.mjs');
  const C = await import('../../tools/lib/console.mjs');
  const L = await import('../../tools/lib/lock.mjs');
  await S.set('best-stack', { by: 'iphone-runner', kind: 'fix', title: 'Best stack', state: 'measuring' });
  await S.set('best-stack', { by: 'wi-stack', note: 'block 2' });
  await C.post({ by: 'wi-stack', kind: 'question', title: 'Which one?' });
  assert.equal((await L.tryAcquire('iphone', { owner: 'wi-stack', kind: 'lease', ttlSec: 600, meta: { url: LAN } })).ok, true);
  mkdirSync(L.lockDir(), { recursive: true });
  writeFileSync(L.holdsLogFile(), JSON.stringify({ at: at(5), resource: 'chrome-measure', owner: 'wi-stack', code: 0, durationSec: 3 }) + '\n');
  const root = tempDir('fw-agent-root-');
  const src = await A.gatherAgentSources({ writeups: true, root, gitCwd: root });
  assert.ok(src.errors.some((e) => /^commits: /.test(e)), 'not a git repo: reported, not thrown');
  const v = A.buildAgentView('wi-stack', src);
  assert.deepEqual(v.rows.map((r) => r.id), ['best-stack']);
  assert.equal(v.steps.length, 1);
  assert.deepEqual(v.live.holds.map((h) => h.resource), ['iphone']);
  assert.equal(v.holds.length, 1);
  assert.ok(!JSON.stringify(v).includes('192.168'));
});

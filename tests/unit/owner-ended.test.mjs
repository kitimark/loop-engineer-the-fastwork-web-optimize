// I-152 (PR-020 N9): board rows that derive themselves.
// (a) a ready-to-land or reviewing row whose work is on main reads "landed on main (from git)" (or its Progress label)
//     and is finished: no lead write needed.
// (b) an owner whose Claude Code transcript ended with a successful hand-back (SubagentHandback) is "owner ended": an
//     active row says so (may be out of date) unless the owner has a live, attached wait: a board hint only, the router
//     does not use it (I-163, the lead's ruling: agents between turns hand back while their own work runs).
// (c) I-163 (+ I-137): a wait whose parent chain no longer reaches a live Claude Code process (proctree.mjs) is an
//     orphan: the board says "owner ended (orphan wait)", and the router does not count its owner as listening, by the
//     wait or by the 5-min read rule; the lead is exempt.
// The transcript format belongs to Claude Code (OBSERVED, 2.1.x): fixtures here copy its shape, nothing real is read
// ($FW_STATE_DIR set: transcriptsDir() is null unless $FW_TRANSCRIPTS_DIR names a dir).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, utimesSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { tempDir, cleanEnv } from '../helpers.mjs';

const TR = await import('../../tools/lib/transcripts.mjs');
const S = await import('../../tools/lib/status.mjs');
const RT = await import('../../tools/lib/thread-routing.mjs');

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-ended-'); delete process.env.FW_TRANSCRIPTS_DIR; TR.clearCache(); });

const use = (id, name, at = '2026-10-04T16:00:00Z') => ({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: 'x' }, { type: 'tool_use', id, name, input: {} }] } });
const result = (id, success, at = '2026-10-04T16:00:01Z') => ({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: JSON.stringify({ success }) }] }] }, toolUseResult: { success } });
const text = (at) => ({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
const jsonl = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';

test('I-152 N9: handbackState: ended only after a successful hand-back with no tool call after it', () => {
  assert.deepEqual(TR.handbackState(jsonl(use('a', 'Bash'), result('a', true), use('h', 'SubagentHandback', '2026-10-04T16:05:00Z'), result('h', true), text('2026-10-04T16:05:02Z'))), { ended: true, at: '2026-10-04T16:05:00Z' });
  assert.deepEqual(TR.handbackState(jsonl(use('h', 'SubagentHandback'), result('h', true), use('b', 'Bash'), result('b', true))), { ended: false, at: null }, 'resumed after the hand-back');
  assert.deepEqual(TR.handbackState(jsonl(use('h', 'SubagentHandback'), result('h', false))), { ended: false, at: null }, 'a refused hand-back');
  assert.deepEqual(TR.handbackState(jsonl(use('h', 'SubagentHandback'))), { ended: false, at: null }, 'no result yet');
  assert.deepEqual(TR.handbackState(jsonl(use('h', 'SubagentHandback', 'T1'), result('h', true), use('h2', 'SubagentHandback', 'T2'), result('h2', false))), { ended: true, at: 'T1' }, 'a second, refused hand-back keeps it ended');
  assert.deepEqual(TR.handbackState(`{"cut line\n${jsonl(use('h', 'SubagentHandback', 'T3'), result('h', true))}`), { ended: true, at: 'T3' }, 'a tail whose first line is cut');
  assert.deepEqual(TR.handbackState(''), { ended: false, at: null });
});

test('I-152 N9: endedOwners reads <dir>/<session>/subagents/*.meta.json names; the newest transcript per name wins; old ones skipped', () => {
  const dir = tempDir('fw-transcripts-');
  const put = (session, id, meta, recs, mtimeSec) => {
    const sub = join(dir, session, 'subagents');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, `agent-${id}.meta.json`), JSON.stringify(meta));
    const f = join(sub, `agent-${id}.jsonl`);
    writeFileSync(f, jsonl(...recs));
    utimesSync(f, mtimeSec, mtimeSec);
  };
  const now = Date.parse('2026-10-04T16:10:00Z'), sec = (min) => (now - min * 60000) / 1000;
  put('s1', 'a1', { name: 'fix-a' }, [use('h', 'SubagentHandback', 'TA'), result('h', true)], sec(5));
  put('s1', 'b1', { name: 'fix-b' }, [use('h', 'SubagentHandback', 'TB'), result('h', true)], sec(30));
  put('s2', 'b2', { name: 'fix-b' }, [use('x', 'Bash'), result('x', true)], sec(2)); // fix-b respawned: the newer one runs
  put('s2', 'c1', { name: 'fix-c' }, [use('h', 'SubagentHandback', 'TC'), result('h', true)], sec(60 * 72)); // 3 days old
  put('s2', 'd1', { agentType: 'general-purpose' }, [use('h', 'SubagentHandback'), result('h', true)], sec(1)); // no name
  writeFileSync(join(dir, 'stray.jsonl'), 'not a session');
  const m = TR.endedOwners({ dir, now });
  assert.deepEqual(Object.fromEntries(m), { 'fix-a': { ended: true, at: 'TA' } });
  assert.deepEqual(Object.fromEntries(TR.endedOwners({ dir: join(dir, 'missing'), now })), {});
  assert.deepEqual(Object.fromEntries(TR.endedOwners({ dir: null, now })), {});
});

test('I-152 N9: transcriptsDir: $FW_TRANSCRIPTS_DIR (off = none); a test state dir never reads the machine; else ~/.claude/projects/<slug>', () => {
  assert.equal(TR.transcriptsDir({ env: { FW_TRANSCRIPTS_DIR: '/x/y' }, mainCheckout: '/a' }), '/x/y');
  assert.equal(TR.transcriptsDir({ env: { FW_TRANSCRIPTS_DIR: 'off' }, mainCheckout: '/a' }), null);
  assert.equal(TR.transcriptsDir({ env: { FW_STATE_DIR: '/tmp/t' }, mainCheckout: '/a' }), null);
  assert.equal(TR.transcriptsDir({ env: {}, mainCheckout: '/Users/someone/source/my_repo.x' }), join(homedir(), '.claude', 'projects', '-Users-someone-source-my-repo-x'));
  assert.equal(TR.projectSlug('/Users/someone/source/fastwork-com-web-optimize'), '-Users-someone-source-fastwork-com-web-optimize');
});

const NOW = Date.parse('2026-10-04T16:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const row = (id, state, extra = {}) => ({ id, title: `Row ${id}`, kind: 'fix', owner: `fix-${id}`, state, stateSince: ago(10), updatedAt: ago(10), priority: null, waitingOn: null, ...extra });

test('I-152 N9 (a): a ready-to-land row whose head is on main reads "landed on main (from git)", finished, no lead write', () => {
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const items = [
    row('rtl', 'ready-to-land', { waitingOn: { kind: 'lead', text: 'land request' }, branch: { name: 'wt-a', landHead: A } }),
    row('rtl-open', 'ready-to-land', { waitingOn: { kind: 'lead', text: 'land request' }, branch: { name: 'wt-b', landHead: B } }),
    row('in-best', 'ready-to-land', { waitingOn: { kind: 'lead', text: 'land request' }, branch: { name: 'wt-a', landHead: A } }),
  ];
  const progress = { build: { fixes: ['in-best'] }, versions: [{ id: 'v7-best', best: true, fixes: ['in-best'] }], items: [{ id: 'in-best', title: 'In', state: 'landed', stage: 'L', inBuild: true }] };
  const live = { git: { mainShas: [A], merged: [], shaAt: { [A]: ago(3) } } };
  const v = S.buildStatusView({ items, live, now: NOW, progress });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by.rtl.group, 'finished');
  assert.equal(by.rtl.stateText, 'landed on main (from git)');
  assert.equal(by.rtl.statePlain, 'landed on main (from git)');
  assert.deepEqual(by.rtl.landedFromGit, { sha: A, at: ago(3), branch: 'wt-a' });
  assert.equal(by.rtl.waiting, null, 'no longer "waiting for: land request"');
  assert.equal(by.rtl.stale, false);
  assert.equal(by['in-best'].stateText, 'in best build (v7)', 'its Progress label when the item is landed');
  assert.equal(by['rtl-open'].group, 'waiting', 'not on main: still waits for the lead');
  assert.equal(by['rtl-open'].landedFromGit, null);
  assert.equal(v.counts.finished, 2);
  assert.match(S.renderText(v, { all: true }), /rtl .*\n.*landed on main \(from git\)/);
  assert.doesNotMatch(S.renderText(v), / rtl {2}\[/,'finished: hidden without --all, like any finished row');
});

test('I-152 N9 (b): an active row whose owner ended with a hand-back says "owner ended"; parked and finished rows do not', () => {
  const items = [row('work', 'implementing'), row('wait', 'waiting', { waitingOn: { kind: 'agent', target: 'x', text: 'x' } }), row('park', 'parked', { note: 'n', resumeOn: { kind: 'never' } }), row('fin', 'done'), row('alive', 'implementing')];
  const live = { ended: { 'fix-work': { ended: true, at: '2026-10-04T15:42:10Z' }, 'fix-wait': { ended: true, at: '2026-10-04T15:50:00Z' }, 'fix-park': { ended: true, at: 'x' }, 'fix-fin': { ended: true, at: 'x' } } };
  const v = S.buildStatusView({ items, live, now: NOW });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.deepEqual(by.work.ownerEnded, { at: '2026-10-04T15:42:10Z' });
  assert.deepEqual(by.work.staleWhy, ['owner ended: fix-work handed back its report at 15:42Z; the lead resumes it with SendMessage or updates the row']);
  assert.equal(by.work.stale, true);
  assert.equal(by.wait.ownerEnded.at, '2026-10-04T15:50:00Z');
  for (const id of ['park', 'fin', 'alive']) { assert.equal(by[id].ownerEnded, null, id); assert.deepEqual(by[id].staleWhy, [], id); }
  // an ended owner with a live, attached wait (an agent between turns, its Monitor listener running) is not flagged
  const lw = (owner, extra = {}) => ({ tool: 'console.mjs thread wait', owner, what: 'x', since: ago(5), listener: true, pid: process.pid, ...extra });
  const v2 = S.buildStatusView({ items, live: { ...live, waits: [lw('fix-work')] }, now: NOW });
  const w2 = v2.items.find((x) => x.id === 'work');
  assert.equal(w2.ownerEnded, null, 'ended + attached wait: no flag');
  assert.deepEqual(w2.staleWhy, []);
  assert.equal(v2.items.find((x) => x.id === 'wait').ownerEnded.at, '2026-10-04T15:50:00Z', 'another owner stays flagged');
  // I-163: an orphan wait (gatherLive marks it from the process tree) is flagged, ended or not
  const v3 = S.buildStatusView({ items, live: { ...live, waits: [lw('fix-work', { orphan: true }), lw('fix-alive', { orphan: true })] }, now: NOW });
  const by3 = Object.fromEntries(v3.items.map((x) => [x.id, x]));
  assert.deepEqual(by3.work.ownerEnded, { at: '2026-10-04T15:42:10Z', orphanWait: true });
  assert.deepEqual(by3.work.staleWhy, ['owner ended (orphan wait): a wait of fix-work runs with no Claude Code session above it, so nobody reads it; it handed back its report at 15:42Z; the lead resumes it with SendMessage or updates the row']);
  assert.deepEqual(by3.alive.ownerEnded, { at: null, orphanWait: true }, 'no hand-back, but its only wait is an orphan');
  assert.deepEqual(by3.alive.staleWhy, ['owner ended (orphan wait): a wait of fix-alive runs with no Claude Code session above it, so nobody reads it; the lead resumes it with SendMessage or updates the row']);
  const v4 = S.buildStatusView({ items, live: { ...live, waits: [lw('fix-work', { orphan: true }), lw('fix-work')] }, now: NOW });
  assert.deepEqual(v4.items.find((x) => x.id === 'work').ownerEnded, { at: null, orphanWait: true }, 'an orphan beside an attached wait: flagged, no hand-back time');
  assert.match(S.staleText(v), /owner ended: fix-work handed back/);
  // the /status page names it on the row, not only in the "may be out of date" tooltip
  const page = readFileSync(new URL('../../tools/lib/status-page.html', import.meta.url), 'utf8');
  assert.match(page, /v\.ownerEnded \? \(v\.ownerEnded\.orphanWait \? 'owner ended \(orphan wait\)' : 'owner ended'\) : 'may be out of date'/);
});

test('I-152 N9: test runs never read the machine\'s transcripts (cleanEnv turns them off)', () => {
  assert.equal(cleanEnv().FW_TRANSCRIPTS_DIR, 'off');
  assert.equal(TR.transcriptsDir({ env: cleanEnv(), mainCheckout: '/a' }), null);
});

test('I-163 (+ I-137): the router: an orphan wait is no listener and costs its owner the 5-min rule; the lead is exempt; a hand-back alone changes nothing; the router moves on', async () => {
  const W = await import('../../tools/lib/waits.mjs');
  const dead = spawnSync(process.execPath, ['-e', '0']).pid; // a pid that has exited
  const live = [];
  const at = (owner, pid = process.pid) => live.push(W.startWait({ tool: RT.WAIT_TOOL, owner, what: 'x', timeoutSec: 600, listener: true, pid, onExit: false }));
  at('desk-orphan'); at('desk-dead', dead); at('fix-live'); at('lead'); at('fix-both'); at('fix-both');
  // every live record has this process's pid; which ones are orphans is injected per record (pid -> attached)
  const ORPHAN = 999001;
  const recs = W.listWaits();
  const orphanIds = new Set([...recs.filter((w) => w.owner === 'desk-orphan' || w.owner === 'lead'), recs.find((w) => w.owner === 'fix-both')].map((w) => w.id));
  const waits = recs.map((w) => (orphanIds.has(w.id) ? { ...w, pid: ORPHAN } : w));
  const attached = (pid) => pid !== ORPHAN;
  const recent = new Date(Date.now() - 60000).toISOString();
  const threads = [{ id: 'T-001', readsAt: { 'fix-recent': recent, 'desk-orphan': recent, lead: recent }, messages: [] }];
  const ls = RT.listeningState({ threads, waits, attached });
  assert.deepEqual(ls('desk-orphan'), { listening: false, how: 'owner ended (orphan wait)' }, 'orphan wait + a read 1 min ago (I-137): not listening');
  assert.deepEqual(ls('desk-dead'), { listening: false, how: '' }, 'a dead wait is no wait');
  assert.deepEqual(ls('fix-live'), { listening: true, how: 'waiting' });
  assert.deepEqual(ls('fix-both'), { listening: true, how: 'waiting' }, 'one attached wait is enough');
  assert.deepEqual(ls('lead'), { listening: true, how: 'active 1 min ago' }, 'the lead is exempt from the orphan rule');
  assert.equal(ls('fix-recent').listening, true, 'no wait at all: the 5-min rule as before');
  // the router moves on: the desk with an orphan wait is skipped for the next listening candidate, or nobody (lead)
  const t = { id: 'T-146', anchor: { page: 'status', item: 'status:orphan-row' } };
  const statusRows = [{ id: 'orphan-row', owner: 'desk-orphan' }];
  const L = RT.listeningFn({ threads, waits, attached });
  assert.equal(RT.routeOwner(t, { statusRows, desk: 'desk-orphan', listening: L }), null, 'only the orphan: nobody, the lead triages');
  assert.equal(RT.routeOwner(t, { statusRows, desk: 'fix-live', listening: L })?.owner, 'fix-live', 'next listener: the desk');
  // the lead's ruling: a hand-back in the transcript is no routing rule (an agent between turns keeps listening)
  process.env.FW_TRANSCRIPTS_DIR = tempDir('fw-tr-');
  const sub = join(process.env.FW_TRANSCRIPTS_DIR, 's1', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-x.meta.json'), JSON.stringify({ name: 'fix-recent' }));
  writeFileSync(join(sub, 'agent-x.jsonl'), jsonl(use('h', 'SubagentHandback'), result('h', true)));
  TR.clearCache();
  assert.equal(TR.endedNow().get('fix-recent')?.ended, true, 'the fixture is an ended transcript');
  assert.equal(RT.listeningState({ threads, waits: [] })('fix-recent').listening, true, 'handed back: still listening by its read');
  // default attachment test in a test state dir: off (every live wait attached), like the transcripts
  assert.deepEqual(RT.listeningState({ threads, waits })('desk-orphan'), { listening: true, how: 'waiting' });
  for (const w of live) w.end();
});

test('I-163: proctree: parse ps, walk the parent chain to a Claude Code process; off in a test state dir unless FW_PROC_TREE=on', async () => {
  const P = await import('../../tools/lib/proctree.mjs');
  const table = P.parsePs([
    '    1     0 /sbin/launchd',
    '  700     1 /Applications/iTerm.app/Contents/MacOS/iTerm2',
    ' 7457   700 claude',
    ' 7500   700 node /opt/x/node_modules/@anthropic-ai/claude-code/cli.js --resume',
    '14831  7457 /bin/zsh -c node tools/console.mjs thread wait --as lead',
    '14833 14831 node tools/console.mjs thread wait --as lead',
    '14900  7500 node tools/console.mjs thread wait --as fix-x',
    '15056     1 node tools/console.mjs thread wait --as mgmt-desk-2 --monitor',
    '16000   700 /bin/zsh',
    '16001 16000 node tools/x.mjs --reason claude',
    '',
    'garbage line',
  ].join('\n'));
  assert.deepEqual(table.get(14833), { ppid: 14831, claude: false });
  assert.equal(table.get(7457).claude, true, 'the native binary');
  assert.equal(table.get(7500).claude, true, 'node running the claude-code package');
  assert.equal(table.get(16001).claude, false, '"claude" as an argument is not Claude Code');
  assert.equal(P.attachedTo(14833, table), true, 'node <- zsh <- claude');
  assert.equal(P.attachedTo(14900, table), true);
  assert.equal(P.attachedTo(15056, table), false, 'reparented to launchd: the desk case');
  assert.equal(P.attachedTo(16001, table), false, 'a terminal shell, no Claude Code above');
  assert.equal(P.attachedTo(424242, table), false, 'not in the table');
  assert.equal(P.procCheckOn({ FW_STATE_DIR: '/t' }), false);
  assert.equal(P.procCheckOn({ FW_STATE_DIR: '/t', FW_PROC_TREE: 'on' }), true);
  assert.equal(P.procCheckOn({ FW_PROC_TREE: 'off' }), false);
  assert.equal(P.procCheckOn({}), true);
  assert.equal(P.attachedNow({ env: { FW_STATE_DIR: '/t' } }), null, 'off: no check (every live wait attached)');
  assert.equal(P.attachedNow({ table })(15056), false, 'an injected table is always used');
  assert.equal(P.procTable({ run: () => { throw new Error('no ps'); } }), null, 'ps fails: null, never throws');
});

test('I-163: a nohup\'d thread wait whose shell exits is reparented to launchd and reads as an orphan (real ps)', async () => {
  const P = await import('../../tools/lib/proctree.mjs');
  const tool = new URL('../../tools/console.mjs', import.meta.url).pathname;
  const env = { ...cleanEnv(), FW_STATE_DIR: process.env.FW_STATE_DIR };
  const r = spawnSync('sh', ['-c', `nohup "${process.execPath}" "${tool}" thread wait --as desk-nohup --monitor --timeout 30 >/dev/null 2>&1 & echo $!`], { env, encoding: 'utf8' });
  const pid = Number(r.stdout.trim());
  assert.ok(pid > 1, `started: ${r.stdout} ${r.stderr}`);
  try {
    const W = await import('../../tools/lib/waits.mjs');
    let w;
    for (let i = 0; i < 100 && !w; i++) { w = W.listWaits().find((x) => x.owner === 'desk-nohup'); if (!w) await new Promise((res) => setTimeout(res, 100)); }
    assert.ok(w, 'the wait registered');
    assert.equal(w.pid, pid);
    const table = P.procTable();
    assert.ok(table, 'ps runs');
    assert.equal(table.get(pid)?.ppid, 1, 'reparented to launchd once its shell exited (macOS)');
    assert.equal(P.attachedTo(pid, table), false);
    assert.equal(P.attachedNow({ env: { FW_PROC_TREE: 'on', FW_STATE_DIR: '/t' }, now: Date.now() + 1e9 })(pid), false, 'the live check agrees');
    assert.deepEqual(RT.listeningState({ threads: [], attached: (p) => P.attachedTo(p, table) })('desk-nohup'), { listening: false, how: 'owner ended (orphan wait)' });
  } finally { try { process.kill(pid); } catch {} }
});

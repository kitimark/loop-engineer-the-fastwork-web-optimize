// I-152 (PR-020 N9): board rows that derive themselves.
// (a) a ready-to-land or reviewing row whose work is on main reads "landed on main (from git)" (or its Progress label)
//     and is finished: no lead write needed.
// (b) an owner whose Claude Code transcript ended with a successful hand-back (SubagentHandback) is "owner ended": an
//     active row says so (may be out of date) unless the owner has a live wait, and the thread router counts it as
//     listening only through a live wait (not the 5-min read rule).
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
  // the lead's fix: an ended owner with a live wait (a persistent Monitor listener) is not flagged; a dead wait is no
  // live wait (listWaits drops it before the board sees it)
  const v2 = S.buildStatusView({ items, live: { ...live, waits: [{ tool: 'console.mjs thread wait', owner: 'fix-work', what: 'x', since: ago(5), listener: true, pid: process.pid }] }, now: NOW });
  const w2 = v2.items.find((x) => x.id === 'work');
  assert.equal(w2.ownerEnded, null, 'ended + live wait: no flag');
  assert.deepEqual(w2.staleWhy, []);
  assert.equal(v2.items.find((x) => x.id === 'wait').ownerEnded.at, '2026-10-04T15:50:00Z', 'another owner stays flagged');
  assert.match(S.staleText(v), /owner ended: fix-work handed back/);
  // the /status page names it on the row, not only in the "may be out of date" tooltip
  const page = readFileSync(new URL('../../tools/lib/status-page.html', import.meta.url), 'utf8');
  assert.match(page, /v\.ownerEnded \? 'owner ended' : 'may be out of date'/);
});

test('I-152 N9: test runs never read the machine\'s transcripts (cleanEnv turns them off)', () => {
  assert.equal(cleanEnv().FW_TRANSCRIPTS_DIR, 'off');
  assert.equal(TR.transcriptsDir({ env: cleanEnv(), mainCheckout: '/a' }), null);
});

test('I-152 N9 (b): the router: a live wait always listens, ended or not; "ended" cancels only the 5-min recency rule and a dead wait', async () => {
  const W = await import('../../tools/lib/waits.mjs');
  const dead = spawnSync(process.execPath, ['-e', '0']).pid; // a pid that has exited
  // the lead's case: mgmt-desk-2 hands back at the end of every turn but keeps a live `thread wait --monitor`
  W.startWait({ tool: RT.WAIT_TOOL, owner: 'desk-live', what: 'x', timeoutSec: 600, listener: true, onExit: false });
  W.startWait({ tool: RT.WAIT_TOOL, owner: 'desk-dead', what: 'x', timeoutSec: 600, listener: true, pid: dead, onExit: false });
  const recent = new Date(Date.now() - 60000).toISOString();
  const threads = [{ id: 'T-001', readsAt: { 'fix-recent': recent, 'fix-recent-ended': recent }, messages: [] }];
  const ls = RT.listeningState({ threads, ended: new Set(['desk-live', 'desk-dead', 'fix-recent-ended']) });
  assert.deepEqual(ls('desk-live'), { listening: true, how: 'waiting' }, 'ended + live wait = listening');
  assert.deepEqual(ls('desk-dead'), { listening: false, how: 'owner ended' }, 'ended + dead wait = not listening');
  assert.deepEqual(ls('fix-recent-ended'), { listening: false, how: 'owner ended' }, 'ended cancels the 5-min read rule');
  assert.equal(ls('fix-recent').listening, true, 'not ended: the 5-min rule as before');
  // default: the ended set from the transcripts (none in a test: $FW_STATE_DIR)
  assert.equal(RT.listeningState({ waits: [], threads })('fix-recent-ended').listening, true);
});

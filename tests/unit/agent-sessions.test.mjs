// I-265 (user T-276 #3: "Is it not automatable from observing Claude Code?"): the Agents page (/agents, `status.mjs
// agents`) showed only the lead under RUNNING NOW while 7 agent-team teammates were alive and working: read-only helpers
// hold no lock, run no wait and own no status row. Now Claude Code's own records count too (transcripts.mjs
// sessionsNow): a transcript written within ACTIVE_MS (10 min) whose run did not end with a hand-back reads "working
// (last step N min ago)"; one inside a foreground call keeps I-169's "deaf: in <cmd> for N min"; a quiet teammate
// (meta taskKind in_process_teammate) still on its live team (~/.claude/teams/<team>/config.json lists it, and the
// team's lead session wrote within TEAM_LIVE_MS) reads "idle between steps, waiting for messages": it is alive and wakes
// on a message, so it counts as running. Ended, stale and team-less ones do not. The format is Claude Code's and
// OBSERVED (2.1.x, 2026-10-12): fixtures copy its shape. Only names, times and plain reasons leave the module.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const TR = await import('../../tools/lib/transcripts.mjs');
const A = await import('../../tools/lib/agent-view.mjs');

const NOW = Date.parse('2026-10-12T10:20:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const SECRET = 'transcript text that must never leave the module';
const call = (id, name, input, at) => ({ type: 'assistant', requestId: `req_${id}`, timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const done = (id, at, extra = {}) => ({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: SECRET }] }, toolUseResult: { stdout: SECRET, ...extra } });
const say = (at) => ({ type: 'assistant', requestId: 'req_say', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: SECRET }] } });
const jsonl = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';

let TRD, TMD;
const LEAD_SESSION = '0f0e0d0c-1111-2222-3333-444455556666';
const TEAM = 'session-0f0e0d0c';
beforeEach(() => {
  process.env.FW_STATE_DIR = tempDir('fw-sess-state-');
  TRD = process.env.FW_TRANSCRIPTS_DIR = tempDir('fw-sess-tr-');
  TMD = process.env.FW_TEAMS_DIR = tempDir('fw-sess-teams-');
  TR.clearCache();
});

/** A subagent transcript (meta + jsonl, mtime `min` minutes ago) in session `session`. */
function put(name, recs, min, { session = LEAD_SESSION, meta = {} } = {}) {
  const sub = join(TRD, session, 'subagents');
  mkdirSync(sub, { recursive: true });
  const id = `a${name}-0123456789abcdef`;
  writeFileSync(join(sub, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: SECRET, name, ...meta }));
  const f = join(sub, `agent-${id}.jsonl`);
  writeFileSync(f, jsonl(...recs));
  const t = (NOW - min * 60000) / 1000;
  utimesSync(f, t, t);
}
const mate = (team = TEAM) => ({ taskKind: 'in_process_teammate', teamName: team, model: 'sonnet' });
/** The team's config.json and its lead session's transcript (written `leadMin` minutes ago). */
function team(members, leadMin = 1, { name = TEAM, session = LEAD_SESSION } = {}) {
  mkdirSync(join(TMD, name), { recursive: true });
  writeFileSync(join(TMD, name, 'config.json'), JSON.stringify({ name, createdAt: NOW - 3600e3, leadAgentId: `team-lead@${name}`, leadSessionId: session,
    members: ['team-lead', ...members].map((n) => ({ agentId: `${n}@${name}`, name: n, agentType: 'general-purpose', joinedAt: NOW - 3000e3, prompt: SECRET })) }));
  const f = join(TRD, `${session}.jsonl`);
  writeFileSync(f, jsonl(say(ago(leadMin))));
  const t = (NOW - leadMin * 60000) / 1000;
  utimesSync(f, t, t);
}

function fixture() {
  // a worktree subagent between tool calls, 2 min ago
  put('ts-x', [call('a', 'Bash', { command: 'npm test' }, ago(3)), done('a', ago(2))], 2);
  // a teammate that ended its turn (text) 40 min ago: idle on its live team
  put('de-reader', [call('a', 'Read', { file_path: '/x' }, ago(41)), done('a', ago(41)), say(ago(40))], 40, { meta: mate() });
  // a teammate working right now
  put('de-writer', [call('a', 'Edit', { file_path: '/y' }, ago(1)), done('a', ago(1))], 1, { meta: mate() });
  // a subagent that handed back 1 min ago: ended
  put('helper-done', [call('h', 'SubagentHandback', { message: SECRET }, ago(1)), done('h', ago(1), { success: true })], 1);
  // a subagent quiet for 30 min, no team: stale
  put('old-helper', [call('a', 'Bash', { command: 'ls' }, ago(31)), done('a', ago(30))], 30);
  // a teammate whose team is gone (no config): not running once quiet
  put('de-orphan', [say(ago(40))], 40, { meta: mate('session-gone0000') });
  // a teammate no longer listed on its team
  put('de-left', [say(ago(40))], 40, { meta: mate() });
  // inside a foreground call for 15 min: deaf (and running, though its transcript is quiet)
  put('fix-long', [call('a', 'Bash', { command: 'node tools/fix.mjs ab hero --runs 5' }, ago(15))], 15);
  // a session that crashed inside a call 3 h ago (past CALL_RUNNING_MS): nothing
  put('crashed', [call('a', 'Bash', { command: 'npm test' }, ago(180))], 180);
  team(['de-reader', 'de-writer', 'de-orphan']);
}

test('I-265: sessionsNow: working, idle teammate on a live team, deaf; ended, stale, team-less and departed ones are not', () => {
  fixture();
  const m = TR.sessionsNow({ now: NOW });
  assert.deepEqual(Object.fromEntries(m), {
    'ts-x': { state: 'working', at: ago(2), min: 2, text: 'working (last step 2 min ago)' },
    'de-writer': { state: 'working', at: ago(1), min: 1, text: 'working (last step 1 min ago)' },
    'de-reader': { state: 'idle', at: ago(40), min: 40, text: 'idle between steps, waiting for messages (last step 40 min ago)' },
    'fix-long': { state: 'deaf', at: ago(15), min: 15, text: 'deaf: in node tools/fix.mjs ab hero --runs 5 for 15 min' },
  });
  assert.equal(TR.ACTIVE_MS, 10 * 60000);
  // the edge of the working window, and under a minute
  assert.equal(TR.sessionsNow({ now: NOW + 8 * 60000 }).get('ts-x')?.state, 'working', '10 min after its last step');
  TR.clearCache();
  assert.equal(TR.sessionsNow({ now: NOW + 8 * 60000 + 1000 }).has('ts-x'), false, 'past 10 min: stale');
  put('fresh', [say(ago(0))], 0.2);
  TR.clearCache();
  assert.equal(TR.sessionsNow({ now: NOW }).get('fresh').text, 'working (last step under 1 min ago)');
  // nothing but names, times and plain reasons: no transcript text, no path, no prompt
  const j = JSON.stringify([...TR.sessionsNow({ now: NOW })]);
  for (const bad of [SECRET, TRD, TMD, LEAD_SESSION, '/x', '/y']) assert.ok(!j.includes(bad), `no ${bad}`);
});

test('I-265: a team is live only while its lead session writes (TEAM_LIVE_MS); a teammate must be on it, in that session', () => {
  put('de-reader', [say(ago(40))], 40, { meta: mate() });
  team(['de-reader'], 7 * 60);
  assert.equal(TR.TEAM_LIVE_MS, 6 * 3600e3);
  assert.equal(TR.sessionsNow({ now: NOW }).has('de-reader'), false, 'the lead session quiet for 7 h: the team is over');
  team(['de-reader'], 5 * 60);
  TR.clearCache();
  assert.equal(TR.sessionsNow({ now: NOW }).get('de-reader')?.state, 'idle', 'quiet for 5 h: still live');
  // the same name spawned as a teammate of another session that is not this team's lead session
  TR.clearCache();
  put('de-other', [say(ago(40))], 40, { session: 'ffffffff-0000-0000-0000-000000000000', meta: mate() });
  team(['de-reader', 'de-other'], 1);
  assert.equal(TR.sessionsNow({ now: NOW }).has('de-other'), false, 'its meta lives in another session than the team lead\'s');
  // no team config at all
  TR.clearCache();
  const t2 = process.env.FW_TEAMS_DIR = tempDir('fw-sess-noteams-');
  assert.ok(t2);
  assert.equal(TR.sessionsNow({ now: NOW }).has('de-reader'), false);
});

test('I-265: test isolation: $FW_STATE_DIR means no live transcripts or teams unless fixture dirs are named', () => {
  fixture();
  delete process.env.FW_TEAMS_DIR; // transcripts named, teams not: no team is live
  TR.clearCache();
  assert.deepEqual([...TR.sessionsNow({ now: NOW }).keys()].sort(), ['de-writer', 'fix-long', 'ts-x']);
  assert.equal(TR.teamsDir({ env: { FW_STATE_DIR: '/tmp/x' } }), null);
  assert.equal(TR.teamsDir({ env: { FW_TRANSCRIPTS_DIR: '/tmp/x' } }), null);
  assert.equal(TR.teamsDir({ env: { FW_TEAMS_DIR: 'off' } }), null);
  assert.equal(TR.teamsDir({ env: { FW_TEAMS_DIR: '/tmp/t' } }), '/tmp/t');
  assert.match(String(TR.teamsDir({ env: {} })), /[/\\]\.claude[/\\]teams$/);
  delete process.env.FW_TRANSCRIPTS_DIR;
  TR.clearCache();
  assert.equal(TR.sessionsNow({ now: NOW }).size, 0);
});

test('I-265: unreadable transcripts and team configs count as nothing', () => {
  const sub = join(TRD, LEAD_SESSION, 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-x.meta.json'), '{not json');
  writeFileSync(join(sub, 'agent-x.jsonl'), 'garbage\n');
  mkdirSync(join(TMD, TEAM), { recursive: true });
  writeFileSync(join(TMD, TEAM, 'config.json'), '{"members": 5');
  writeFileSync(join(TMD, 'stray-file'), 'x');
  put('de-reader', [say(ago(40))], 40, { meta: mate() });
  assert.deepEqual([...TR.sessionsNow({ now: NOW }).keys()], []);
});

test('I-265: the Agents page and one agent\'s view: a live team reads running with the plain reason', async () => {
  fixture();
  const src = await A.gatherAgentSources({ root: tempDir('fw-sess-root-'), gitCwd: tempDir('fw-sess-git-') });
  // gatherAgentSources reads the real clock; the fixture is dated at NOW, so build from sessionsNow at NOW
  src.sessions = [...TR.sessionsNow({ now: NOW })].map(([name, x]) => ({ name, ...x }));
  const l = A.buildAgentsList(src, { now: NOW });
  const by = Object.fromEntries(l.agents.map((a) => [a.name, a]));
  for (const n of ['ts-x', 'de-writer', 'de-reader', 'fix-long']) assert.equal(by[n]?.running, true, `${n} running`);
  for (const n of ['helper-done', 'old-helper', 'de-orphan', 'de-left', 'crashed']) assert.equal(by[n], undefined, `${n} not listed (no other trace)`);
  assert.equal(by['de-reader'].now, 'idle between steps, waiting for messages (last step 40 min ago)');
  assert.equal(by['ts-x'].lastAt, ago(2), 'no other trace: last activity from its Claude Code session');
  const txt = A.agentsText(l);
  assert.match(txt, /^RUNNING NOW \(4\):/);
  assert.match(txt, /\n {2}de-writer {2}working \(last step 1 min ago\)/);
  const v = A.buildAgentView('de-reader', src, { now: NOW });
  assert.equal(v.running, true);
  assert.deepEqual(v.runningWhy, ['idle between steps, waiting for messages (last step 40 min ago)']);
  assert.match(A.agentText(v), /^de-reader: RUNNING NOW/);
  assert.equal(A.buildAgentView('helper-done', src, { now: NOW }).running, false);
  // another trace (a fresh row) comes first; the session reason follows
  src.status = [{ id: 'xrow', title: 'X', kind: 'tool', owner: 'ts-x', state: 'implementing', updatedAt: ago(3), updatedBy: 'ts-x', history: [] }];
  assert.deepEqual(A.buildAgentView('ts-x', src, { now: NOW }).runningWhy, ['row xrow is implementing: X', 'working (last step 2 min ago)']);
  assert.ok(!JSON.stringify(l).includes(SECRET) && !JSON.stringify(l).includes(TRD));
});

test('I-265: gatherAgentSources reads sessionsNow (failure-tolerant) and a plain test state dir has none', async () => {
  delete process.env.FW_TRANSCRIPTS_DIR;
  delete process.env.FW_TEAMS_DIR;
  TR.clearCache();
  const src = await A.gatherAgentSources({ root: tempDir('fw-sess-root-'), gitCwd: tempDir('fw-sess-git-') });
  assert.deepEqual(src.sessions, []);
  assert.ok(!src.errors.some((e) => /^sessions/.test(e)));
  // live, with the real clock
  process.env.FW_TRANSCRIPTS_DIR = TRD;
  process.env.FW_TEAMS_DIR = TMD;
  TR.clearCache();
  const sub = join(TRD, 's-real', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-r.meta.json'), JSON.stringify({ name: 'ts-real' }));
  writeFileSync(join(sub, 'agent-r.jsonl'), jsonl(say(new Date().toISOString())));
  const src2 = await A.gatherAgentSources({ root: tempDir('fw-sess-root-'), gitCwd: tempDir('fw-sess-git-') });
  assert.deepEqual(src2.sessions.map((x) => [x.name, x.state]), [['ts-real', 'working']]);
});

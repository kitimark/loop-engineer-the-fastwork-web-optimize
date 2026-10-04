// I-169 (user T-152 #3): an owner inside a long foreground tool call hears nothing until the call returns. From its
// Claude Code transcript: the last model response's tool calls (one requestId) have a call with no tool_result yet, older
// than DEAF_AFTER_MS (30 s), that is not a background Bash (run_in_background) or a Monitor. Such an owner is "deaf": not
// listening, live wait or not (its Monitor's lines reach it only after the call), busy for the router (I-164: the message
// goes to the next free listener, the owner's copy is an FYI that wakes its listener when the call ends), and its board
// row says "deaf: in <cmd> for N min". The lead is exempt (no subagent transcript). The format is Claude Code's and
// OBSERVED (2.1.x, 2026-10-04): fixtures copy its shape; anything unparsable falls back to the rules before I-169.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const TR = await import('../../tools/lib/transcripts.mjs');
const RT = await import('../../tools/lib/thread-routing.mjs');
const T = await import('../../tools/lib/console-threads.mjs');
const W = await import('../../tools/lib/waits.mjs');
const S = await import('../../tools/lib/status.mjs');

let live = [];
beforeEach(() => {
  for (const w of live) w.end();
  live = [];
  process.env.FW_STATE_DIR = tempDir('fw-deaf-');
  process.env.FW_TRANSCRIPTS_DIR = tempDir('fw-deaf-tr-');
  TR.clearCache();
});

const NOW = Date.parse('2026-10-04T19:10:00Z');
const ago = (sec, now = NOW) => new Date(now - sec * 1000).toISOString();
const call = (id, name, input, at, requestId = 'req_1') => ({ type: 'assistant', requestId, timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const done = (id, at) => ({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, toolUseResult: { stdout: '' } });
const think = (at, requestId = 'req_9') => ({ type: 'assistant', requestId, timestamp: at, message: { role: 'assistant', content: [{ type: 'thinking', thinking: '' }] } });
const attach = (at) => ({ type: 'attachment', timestamp: at, attachment: {} });
const jsonl = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
const bash = (command, extra = {}) => ({ command, description: 'x', ...extra });

test('I-169: pendingCall: the last response\'s unanswered foreground call; background Bash, Monitor, answered calls and a talking model are not', () => {
  const P = (...recs) => TR.pendingCall(jsonl(...recs));
  assert.deepEqual(P(call('a', 'Bash', bash('npm test'), 'T1'), done('a', 'T2'), attach('T2'), call('b', 'Bash', bash('node tools/fix.mjs ab hero --runs 5'), 'T3', 'req_2')),
    { tool: 'Bash', cmd: 'node tools/fix.mjs ab hero --runs 5', since: 'T3' });
  assert.equal(P(call('a', 'Bash', bash('npm test'), 'T1'), done('a', 'T2')), null, 'answered');
  assert.equal(P(call('a', 'Bash', bash('npm test', { run_in_background: true }), 'T1')), null, 'a background Bash');
  assert.equal(P(call('a', 'Monitor', { command: 'node tools/console.mjs thread wait --as x --monitor' }, 'T1')), null, 'a Monitor');
  assert.equal(P(call('a', 'Bash', bash('npm test'), 'T1'), think('T2')), null, 'the model is past it (an unanswered call of an older response: interrupted)');
  assert.deepEqual(P(call('a', 'Read', { file_path: '/x' }, 'T1', 'req_3'), call('b', 'Bash', bash('sleepy job'), 'T2', 'req_3'), done('a', 'T3')),
    { tool: 'Bash', cmd: 'sleepy job', since: 'T2' }, 'parallel calls of one response: the one still running');
  assert.deepEqual(P(call('a', 'Agent', { description: 'map the bundle', prompt: 'x' }, 'T1')), { tool: 'Agent', cmd: 'Agent', since: 'T1' }, 'a foreground subagent');
  const long = `cd /a && ${'x'.repeat(100)}\nsecond line`;
  assert.equal(P(call('a', 'Bash', bash(long), 'T1')).cmd.length, 40, 'first line, 40 characters');
  assert.equal(P(call('a', 'Bash', bash(long), 'T1')).cmd.includes('\n'), false);
  for (const bad of ['', 'not json\n{', jsonl({ type: 'assistant' }), jsonl({ type: 'assistant', message: { content: 'text' } })]) assert.equal(TR.pendingCall(bad), null, `defensive: ${JSON.stringify(bad).slice(0, 30)}`);
  assert.equal(P(call('a', 'Bash', null, 'T1'))?.cmd, 'Bash', 'no input: the tool name');
});

const put = (name, recs, mtimeSec = NOW / 1000) => {
  const sub = join(process.env.FW_TRANSCRIPTS_DIR, 's1', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, `agent-${name}.meta.json`), JSON.stringify({ name }));
  const f = join(sub, `agent-${name}.jsonl`);
  writeFileSync(f, jsonl(...recs));
  utimesSync(f, mtimeSec, mtimeSec);
};

test('I-169: deafNow: names in a foreground call for more than 30 s, with the command and minutes; ended and fresh calls are not', () => {
  put('fix-long', [call('a', 'Bash', bash('node tools/fix.mjs ab hero --runs 5'), ago(185))]);
  put('fix-fresh', [call('a', 'Bash', bash('npm run test:unit'), ago(10))]);
  put('fix-idle', [call('a', 'Bash', bash('npm test'), ago(600)), done('a', ago(300))]);
  put('fix-bg', [call('a', 'Bash', bash('npm test', { run_in_background: true }), ago(600))]);
  const d = TR.deafNow({ now: NOW });
  assert.deepEqual(Object.fromEntries(d), { 'fix-long': { tool: 'Bash', cmd: 'node tools/fix.mjs ab hero --runs 5', since: ago(185), min: 3 } });
  assert.equal(TR.deafText(d.get('fix-long')), 'deaf: in node tools/fix.mjs ab hero --runs 5 for 3 min');
  assert.equal(TR.deafNow({ now: NOW + 25000 }).has('fix-fresh'), true, 'past 30 s');
  assert.equal(TR.endedNow({ now: NOW }).size, 0, 'no hand-back');
  delete process.env.FW_TRANSCRIPTS_DIR; // a test state dir: no transcripts at all
  TR.clearCache();
  assert.equal(TR.deafNow({ now: NOW }).size, 0);
});

test('I-169: the router: a deaf owner is not listening even with a live wait; busy for I-164 (FYI, next free listener); the board row says deaf', async () => {
  const now = Date.now();
  put('fix-hero', [call('a', 'Bash', bash('node tools/fix.mjs ab hero --runs 5'), new Date(now - 125000).toISOString())], now / 1000);
  put('mgmt-desk', [call('a', 'Bash', bash('ls'), new Date(now - 60000).toISOString()), done('a', new Date(now - 59000).toISOString())], now / 1000);
  for (const a of ['fix-hero', 'mgmt-desk', 'lead']) live.push(W.startWait({ tool: RT.WAIT_TOOL, owner: a, what: 'x', timeoutSec: 600, listener: true, onExit: false }));
  const ls = RT.listeningState({ threads: [] });
  assert.deepEqual(ls('fix-hero'), { listening: false, how: 'deaf: in node tools/fix.mjs ab hero --runs 5 for 2 min' });
  assert.deepEqual(ls('mgmt-desk'), { listening: true, how: 'waiting' });
  assert.deepEqual(ls('lead'), { listening: true, how: 'waiting' }, 'the lead is exempt');
  const busy = await RT.loadBusy();
  assert.deepEqual(busy()('fix-hero'), { busy: true, why: 'deaf: in node tools/fix.mjs ab hero --runs 5 for 2 min' });
  // a user question to it goes to the desk now; its copy is an FYI that waits for the call to end
  await RT.setDesk({ agent: 'mgmt-desk', by: 'lead' });
  const t = (await T.createThread({ by: 'lead', title: 'Hero question', text: 'hi', to: 'fix-hero' })).thread;
  const r = await T.replyUser(t.id, { text: 'is the hero still slow?' });
  assert.deepEqual(r.thread.assignees, ['fix-hero', 'mgmt-desk']);
  assert.equal(r.thread.history.at(-1).note, 'mgmt-desk (the desk; fix-hero busy: deaf: in node tools/fix.mjs ab hero --runs 5 for 2 min)');
  assert.deepEqual(r.thread.messages.at(-1).later, ['fix-hero']);
  assert.deepEqual(T.threadWaitCondition({ as: 'fix-hero', busy }).check().met, false, 'deaf: its listener stays quiet');
  // the call returns: the FYI wakes it
  put('fix-hero', [call('a', 'Bash', bash('node tools/fix.mjs ab hero --runs 5'), new Date(now - 125000).toISOString()), done('a', new Date(now - 1000).toISOString())], now / 1000 + 1);
  TR.clearCache();
  assert.equal(T.threadWaitCondition({ as: 'fix-hero', busy: await RT.loadBusy() }).check().met, true);
  // the board (gatherLive's live.deaf)
  const item = { id: 'hero', title: 'Hero', kind: 'fix', owner: 'fix-hero', state: 'implementing', stateSince: ago(600, now), updatedAt: ago(60, now), priority: null, waitingOn: null };
  const deaf = { 'fix-hero': { tool: 'Bash', cmd: 'node tools/fix.mjs ab hero --runs 5', since: ago(125, now), min: 2 } };
  const v = S.buildStatusView({ items: [item, { ...item, id: 'parked', state: 'parked', resumeOn: { kind: 'never' }, note: 'n' }], live: { deaf }, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by.hero.deaf, 'deaf: in node tools/fix.mjs ab hero --runs 5 for 2 min');
  assert.equal(by.parked.deaf, null, 'only active rows');
  assert.match(S.renderText(v), /\n {6}deaf: in node tools\/fix\.mjs ab hero --runs 5 for 2 min \(user questions go to the desk or the lead until it returns\)/);
});

test('I-169: transcripts that cannot be read fall back to the rules before (nobody deaf, nobody ended)', () => {
  const sub = join(process.env.FW_TRANSCRIPTS_DIR, 's1', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-x.meta.json'), '{not json');
  writeFileSync(join(sub, 'agent-x.jsonl'), 'garbage\n');
  writeFileSync(join(sub, 'agent-y.meta.json'), JSON.stringify({ name: 'fix-y' }));
  writeFileSync(join(sub, 'agent-y.jsonl'), '\u0000\u0001 binary\n{"type":"assistant","message":{"content":[{"type":"tool_use"}]}}\n');
  assert.equal(TR.deafNow().size, 0);
  assert.equal(TR.endedNow().size, 0);
  assert.equal(RT.listeningState({ threads: [], waits: [] })('fix-y').how, '');
});

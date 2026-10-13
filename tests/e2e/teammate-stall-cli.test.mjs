// I-274 end to end on fixture transcripts (made-up content) and a temp state dir: the lead's `console.mjs thread wait
// --as lead --triage --monitor` prints `WAKE stall <agent> <task> <N> min (…)` once per (agent, task), also across
// re-arms, and nobody else's listener does; `idle.mjs check` prints a `NOTIFY <agent>` line per stalled agent; the
// status board shows the red alert. No real transcripts, locks, port 5173, phone or Chrome.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool } from '../helpers.mjs';

const CON = tool('console.mjs');
const IDLE = tool('idle.mjs');
const ST = tool('status.mjs');
let env, trd;
const SESSION = '0f0e0d0c-1111-2222-3333-444455556666';
beforeEach(() => { trd = tempDir('fw-stall-e2e-tr-'); env = { FW_STATE_DIR: tempDir('fw-stall-e2e-'), FW_TRANSCRIPTS_DIR: trd }; });

const ago = (min, now = Date.now()) => new Date(now - min * 60000).toISOString();
const say = (at) => ({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: 'made-up report' }] } });
const notice = (task, at) => ({ type: 'attachment', timestamp: at, attachment: { type: 'queued_command', prompt: `<task-notification>\n<task-id>${task}</task-id>\n<status>completed</status>\n<summary>made-up</summary>\n</task-notification>` } });
const jsonl = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
function put(name, recs) {
  const sub = join(trd, SESSION, 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, `agent-a${name}.meta.json`), JSON.stringify({ name, taskKind: 'in_process_teammate', teamName: 'session-0f0e0d0c' }));
  writeFileSync(join(sub, `agent-a${name}.jsonl`), jsonl(...recs));
  writeFileSync(join(trd, `${SESSION}.jsonl`), jsonl(say(ago(0))));
}
const stallLines = (out) => out.split('\n').filter((l) => l.startsWith('WAKE stall '));

test('I-274: the lead\'s --monitor listener prints one WAKE stall line per (agent, task), across re-arms; other readers none', async () => {
  put('ts-stalled', [say(ago(20)), notice('bstall0001', ago(12))]);
  put('ts-woken', [say(ago(20)), notice('bwoken0001', ago(12)), say(ago(11))]);
  put('ts-fresh', [say(ago(5)), notice('bfresh0001', ago(0.1))]);
  const r = await nodeAsync(CON, ['thread', 'wait', '--as', 'lead', '--triage', '--monitor', '--timeout', '4'], { env });
  assert.equal(r.code, 3, r.out);
  for (const l of r.stdout.trim().split('\n')) assert.match(l, /^WAKE [a-z]+ \S+/, l);
  assert.deepEqual(stallLines(r.stdout), ['WAKE stall ts-stalled bstall0001 12 min (completed, not picked up; wake it with SendMessage)']);
  assert.doesNotMatch(r.stdout, /made-up/);
  // re-armed: reported already, nothing new; a new stall of the same agent wakes it again
  put('ts-stalled', [say(ago(20)), notice('bstall0001', ago(12)), notice('bstall0002', ago(2))]);
  const again = await nodeAsync(CON, ['thread', 'wait', '--as', 'lead', '--triage', '--monitor', '--timeout', '3'], { env });
  assert.deepEqual(stallLines(again.stdout), ['WAKE stall ts-stalled bstall0002 2 min (completed, not picked up; wake it with SendMessage)'], again.out);
  // not for another reader, not for a one-shot wait
  const other = await nodeAsync(CON, ['thread', 'wait', '--as', 'fix-a', '--monitor', '--timeout', '2'], { env });
  assert.deepEqual(stallLines(other.stdout), [], other.out);
  put('ts-late', [say(ago(20)), notice('blate00001', ago(3))]);
  const once = node(CON, ['thread', 'wait', '--as', 'lead', '--triage', '--timeout', '2'], { env });
  assert.equal(once.code, 3, once.out);
  assert.doesNotMatch(once.stdout, /stall/);
});

test('I-274: idle.mjs check prints a NOTIFY line per stalled agent (exit code unchanged); the board shows the alert', () => {
  put('ts-stalled', [say(ago(20)), notice('bstall0001', ago(12))]);
  put('ts-woken', [say(ago(20)), notice('bwoken0001', ago(12)), say(ago(11))]);
  const r = node(IDLE, ['check'], { env: { ...env, FW_IDLE_NOW: new Date().toISOString() } });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith('NOTIFY')),
    ['NOTIFY ts-stalled: your background job bstall0001 completed 12 min ago and you have not picked it up: nothing woke you (I-274); the lead wakes you with SendMessage']);
  assert.equal(node(ST, ['set', 'i274-row', '--by', 'ts-stalled', '--state', 'waiting', '--kind', 'tool', '--title', 'Row', '--note', 'waits for npm test', '--waiting-on', 'other:npm test'], { env }).code, 0);
  const l = node(ST, ['list'], { env });
  assert.match(l.stdout, /!! stalled: job done 12 min ago, not picked up \(its background job bstall0001 completed; the lead wakes it with SendMessage\)/, l.out);
});

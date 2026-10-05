// I-175 (user T-155 #4/#5; fixes/AGENT_ROLES.md "Automated threads: who answers"): the automated alarm threads (idle
// phone/Mac, stuck console step, disk nearly full) go to ONE lead-kept setting, the steward (mgmt-devices today), and
// the lead; worker agents are never assignees and no thread line addresses them (the steward nudges them by message).
// No steward set, or the steward parked: no assignee, so the lead's triage wait gets the thread at once.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const R = await import('../../tools/lib/thread-routing.mjs');
const SA = await import('../../tools/lib/step-alarm.mjs');
const W = await import('../../tools/lib/space-watch.mjs');
const T = await import('../../tools/lib/console-threads.mjs');
const D = await import('../../tools/lib/idle.mjs');

const saved = {};
beforeEach(() => {
  saved.FW_STATE_DIR = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = tempDir('fw-steward-');
});
afterEach(() => { if (saved.FW_STATE_DIR === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = saved.FW_STATE_DIR; });

const row = (id, owner, state) => ({ id, owner, state });

test('the steward: set and cleared by the lead only; never the lead or a bad name', async () => {
  assert.equal(R.getSteward(), null);
  await assert.rejects(R.setSteward({ agent: 'mgmt-devices', by: 'fix-hero' }), /only the lead names the steward/);
  await assert.rejects(R.setSteward({ agent: 'lead', by: 'lead' }), /--clear/);
  await assert.rejects(R.setSteward({ agent: 'bad name', by: 'lead' }), /agent name/);
  const d = await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  assert.equal(d.agent, 'mgmt-devices');
  assert.equal(R.getSteward().agent, 'mgmt-devices');
  assert.equal(R.getSteward().setBy, 'lead');
  await R.setSteward({ agent: null, by: 'lead' });
  assert.equal(R.getSteward(), null);
});

test('who is on duty: the steward unless unset or parked (every row it owns parked or finished); no rows still counts', async () => {
  assert.deepEqual(R.stewardState({ statusRows: [] }), { agent: null, named: null, why: 'no steward set' });
  await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  assert.equal(R.stewardState({ statusRows: [] }).agent, 'mgmt-devices', 'no board row: still on duty');
  assert.equal(R.stewardState({ statusRows: [row('devices', 'mgmt-devices', 'coordinating')] }).agent, 'mgmt-devices');
  assert.equal(R.stewardState({ statusRows: [row('devices', 'mgmt-devices', 'parked'), row('x', 'mgmt-devices', 'waiting')] }).agent, 'mgmt-devices', 'one live row is enough');
  const p = R.stewardState({ statusRows: [row('devices', 'mgmt-devices', 'parked'), row('old', 'mgmt-devices', 'done'), row('hero', 'fix-hero', 'implementing')] });
  assert.deepEqual(p, { agent: null, named: 'mgmt-devices', why: 'mgmt-devices is parked' });
  assert.deepEqual(R.stewardTo(p), []);
  assert.deepEqual(R.stewardTo(R.stewardState({ statusRows: [] })), ['mgmt-devices']);
  // the lines for the thread text: the steward nudges the workers; without one, the lead handles it
  assert.equal(R.stewardLine({ agent: 'mgmt-devices' }, ['fix-hero', 'fix-nav']), 'Steward (mgmt-devices): nudge fix-hero, fix-nav by message (SendMessage) and answer the user here; the lead is the second tier (I-175).');
  assert.equal(R.stewardLine({ agent: 'mgmt-devices' }, []), 'Steward (mgmt-devices): answer the user here; the lead is the second tier (I-175).');
  assert.equal(R.stewardLine(p, ['fix-hero']), 'No steward on duty (mgmt-devices is parked): the lead handles this thread (I-175).');
  // async form reads the status board itself
  assert.equal((await R.alarmSteward()).agent, 'mgmt-devices');
  assert.equal((await R.alarmSteward({ statusRows: [row('d', 'mgmt-devices', 'dropped')] })).agent, null);
});

test('`thread steward show` words: unset, on duty, parked', async () => {
  assert.match(R.stewardText({ statusRows: [] }), /^no steward set: alarm threads \(idle, stuck step, disk\) go to the lead$/);
  await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  assert.match(R.stewardText({ statusRows: [], waits: [], threads: [] }), /^mgmt-devices \(set by the lead at .+\): alarm threads \(idle, stuck step, disk\) go to it, not listening now \(the lead's triage takes them meanwhile\); the lead is the second tier$/);
  assert.match(R.stewardText({ statusRows: [row('d', 'mgmt-devices', 'parked')] }), /^mgmt-devices is parked: alarm threads go to the lead until it has a live row again$/);
});

test('stuck step: the thread no longer addresses the runner or the desk; the steward line names whom to nudge', async () => {
  const x = { id: 'C-045', by: 'iphone-runner', part: 3, attempt: 2, minutes: 3, after: "iphone-runner's redo", since: Date.parse('2026-10-04T12:44:40Z'), why: 'gated, waiting: Start stays off until iphone-runner acks ready' };
  const g = SA.stuckThread(x, { steward: { agent: 'mgmt-devices' } });
  assert.doesNotMatch(g.text, /^iphone-runner: /m, 'no line addressed to the worker');
  assert.doesNotMatch(g.text, /^Desk /m);
  assert.match(g.text, /^What unblocks it: iphone-runner acks the part with its current attempt \(node tools\/console\.mjs ack C-045 --by iphone-runner --part 3 --attempt 2 --state loading\|ready\|recording --message "<what it does, ETA>"\), or cancels the step\./m);
  assert.match(g.text, /STALE-ATTEMPT refusal changes nothing \(I-140\)/);
  assert.match(g.text, /^Steward \(mgmt-devices\): nudge iphone-runner by message \(SendMessage\)/m);
  assert.match(g.text.split('\n')[0], /^For you: you did nothing wrong\./, 'the user line stays first');
  assert.match(SA.stuckThread(x, { steward: { agent: null, why: 'no steward set' } }).text, /^No steward on duty \(no steward set\): the lead handles this thread/m);
  assert.deepEqual(SA.stuckAddressees(x, { agent: 'mgmt-devices' }), ['mgmt-devices']);
  assert.deepEqual(SA.stuckAddressees(x, { agent: null }), []);
  assert.deepEqual(SA.stuckAddressees({ ...x, by: 'mgmt-devices' }, { agent: 'mgmt-devices' }), ['mgmt-devices']);
});

test('disk: the thread goes to the steward only (not the desk, not the folder owners), with the folders kept as facts', async () => {
  await R.setDesk({ agent: 'mgmt-ops-10', by: 'lead' });
  await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  const folders = [{ show: '.claude/worktrees/a/out/rest-script', bytes: 10 * 1024 ** 3, branch: 'worktree-a', owners: ['fix-rest-script'] }];
  const lines = [];
  const env = { FW_DISK_FREE_GB: '15', FW_SPACE_ALARM_GB: '20', FW_TIMING_MIN_FREE_GB: '8', FW_SPACE_AUTOPRUNE: '0' };
  await W.diskPass({ by: 'lead', log: (s) => lines.push(s), now: Date.parse('2026-10-04T12:00:00Z'), env, mainRoot: '/nowhere', rows: [], folders });
  const [t] = T.listThreads();
  assert.deepEqual(t.assignees, ['mgmt-devices']);
  assert.match(lines.join('\n'), /^POSTED T-001 disk: 15\.0 GB free \(to mgmt-devices\)$/m);
  const body = t.messages[0].text;
  assert.match(body, /\(worktree-a, fix-rest-script\)/, 'folder owners stay as facts');
  assert.doesNotMatch(body, /^Owners: /m, 'no line addressed to the owners');
  assert.match(body, /^Steward \(mgmt-devices\): nudge fix-rest-script by message/m);
});

test('disk with the steward parked: no assignee (the lead\'s triage gets it), the lead line in the text', async () => {
  await R.setSteward({ agent: 'mgmt-devices', by: 'lead' });
  const env = { FW_DISK_FREE_GB: '15', FW_SPACE_ALARM_GB: '20', FW_TIMING_MIN_FREE_GB: '8', FW_SPACE_AUTOPRUNE: '0' };
  await W.diskPass({ by: 'lead', log: () => {}, now: Date.parse('2026-10-04T12:00:00Z'), env, mainRoot: '/nowhere', rows: [row('devices', 'mgmt-devices', 'parked')], folders: [] });
  const [t] = T.listThreads();
  assert.deepEqual(t.assignees, []);
  assert.match(t.messages[0].text, /^No steward on duty \(mgmt-devices is parked\): the lead handles this thread/m);
});

test('idle: the thread names no worker as addressee; the concerned owners (NOTIFY, red alert) stay addressees()', () => {
  const a = { resource: 'iphone', held: true, heldIdle: true, holder: 'fix-hero', freeMin: 7, min: 5, since: Date.parse('2026-10-04T12:00:00Z'), how: 'lease', queue: [{ owner: 'fix-nav-morph' }], rows: [{ id: 'morph-gpu', owner: 'fix-morph-gpu', why: 'phone' }], alarm: true, ready: true };
  const { text } = D.threadFor(a, { steward: { agent: 'mgmt-devices' } });
  assert.doesNotMatch(text, /^fix-hero: /m, 'no line addressed to the holder');
  assert.doesNotMatch(text, /Desk \(/);
  assert.match(text, /^What unblocks it: fix-hero runs its phone part now, or releases the lease \(node tools\/lock\.mjs release iphone --owner fix-hero\), or says why it waits\.$/m);
  assert.match(text, /^Steward \(mgmt-devices\): nudge fix-hero by message \(SendMessage\)/m);
  const free = { ...a, held: false, heldIdle: false, holder: null };
  const f = D.threadFor(free, { steward: { agent: null, why: 'no steward set' } }).text;
  assert.doesNotMatch(f, /^Owners: /m);
  assert.match(f, /^What unblocks it: the next of fix-nav-morph, fix-morph-gpu takes it \(node tools\/lock\.mjs run iphone --owner <you> \.\.\. -- <phone part>\)\.$/m); // I-168: agents hold the phone only in run
  assert.match(f, /^No steward on duty \(no steward set\): the lead handles this thread/m);
  assert.deepEqual(D.addressees(a), ['fix-hero', 'fix-nav-morph', 'fix-morph-gpu'], 'the concerned owners (NOTIFY lines, board alert) are unchanged');
});

// tools/lib/console.mjs in-process (ts-user-console): step building per kind, the store, the part state machine
// (gate: Start only after the agent's ready; record: "recording" only after the user's Start), answers, skip /
// reopen / redo / cancel, the page view (blind URLs and agent meta never reach the page) and the wait conditions
// that `console.mjs wait` polls. Every test uses its own $FW_STATE_DIR: the real shared store is never touched.
// Example URLs use reserved .invalid hosts (no LAN addresses in committed tests).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const C = await import('../../tools/lib/console.mjs');
let state;
beforeEach(() => { state = tempDir('fw-console-'); process.env.FW_STATE_DIR = state; });

const A = 'http://page-a.invalid:5401/';
const B = 'http://page-b.invalid:5402/';
const pair = (extra = {}) => C.post({ by: 'iphone-runner', kind: 'swipe-pair', title: 'Pair 3', instructions: 'Swipe each page.', url: A, url2: B, meta: { key: '1=patched' }, ...extra });

test('store lives in the shared state dir; ids C-001, C-002 …; parseId takes short forms', async () => {
  assert.equal(C.consoleDir(), join(state, 'console'));
  assert.equal(C.serverFile(), join(state, 'console', 'server.json'));
  const a = await C.post({ by: 'x', kind: 'question', title: 'Q1' });
  const b = await C.post({ by: 'y', kind: 'question', title: 'Q2' });
  assert.deepEqual([a.id, b.id], ['C-001', 'C-002']);
  for (const s of ['2', 'c-2', 'C-002', 'C002']) assert.equal(C.parseId(s), 'C-002');
  assert.throws(() => C.parseId('../C-1'), /bad console step id/);
  assert.deepEqual(C.list().map((s) => s.id), ['C-001', 'C-002'], 'oldest first');
  assert.throws(() => C.get('C-9'), /no console step C-009/);
});

test('buildStep: kind defaults and validation', () => {
  const q = C.buildStep({ by: 'a', kind: 'question', title: 'Phone charged?' });
  assert.deepEqual([q.parts.length, q.answer.mode, q.answer.options, q.status], [0, 'buttons', ['yes', 'no'], 'pending']);
  assert.equal(C.buildStep({ by: 'a', kind: 'question', title: 't', text: true }).answer.mode, 'text');
  const ch = C.buildStep({ by: 'a', kind: 'choice', title: 't', options: '1, 2,same,2' });
  assert.deepEqual(ch.answer.options, ['1', '2', 'same']);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'choice', title: 't' }), /needs --options/);
  const ac = C.buildStep({ by: 'a', kind: 'action', title: 'Finger scroll', url: A, record: true });
  assert.deepEqual(ac.parts.map((p) => [p.label, p.url, p.record, p.gate]), [['Do it', A, true, false]]);
  assert.equal(ac.answer.mode, 'none', 'an action is finished by Done');
  const sp = C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', url: A, url2: B });
  assert.deepEqual(sp.parts.map((p) => [p.label, p.url, p.record, p.gate]), [['Page 1', A, true, true], ['Page 2', B, true, true]]);
  assert.deepEqual(sp.answer.options, ['1', '2', 'same']);
  assert.equal(sp.showUrl, false, 'swipe pairs are blind by default');
  assert.equal(C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', url: A, url2: B, gate: false }).parts[0].gate, false);
  const custom = C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', parts: [{ label: 'A', url: A }, { label: 'B', url: B }, { label: 'C', url: A }] });
  assert.deepEqual(custom.parts.map((p) => [p.label, p.gate, p.record]), [['A', true, true], ['B', true, true], ['C', true, true]]);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', url: A }), /--url2/);
  assert.throws(() => C.buildStep({ kind: 'question', title: 't' }), /--by/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'poll', title: 't' }), /--kind must be one of/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'question', title: ' ' }), /--title/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'action', title: 't', url: 'javascript:alert(1)' }), /http or https only/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'question', title: 't', options: 'a', text: true }), /not both/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'question', title: 't', meta: '[1]' }), /JSON object/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'question', title: 't', meta: 'nope' }), /must be JSON/);
});

test('swipe pair: gate, Start, recording, Done per part, then the pick; history records who did what', async () => {
  const s = await pair();
  // gated: the user cannot start before the runner says ready; the runner cannot record before Start
  await assert.rejects(C.start(s.id, { part: 1 }), /not ready yet/);
  await assert.rejects(C.ack(s.id, { by: 'iphone-runner', state: 'recording' }), /has not clicked Start yet/);
  await C.ack(s.id, { by: 'iphone-runner', part: 1, state: 'loading', message: 'the tab is slow' });
  assert.equal(C.get(s.id).parts[0].message, 'the tab is slow');
  await C.ack(s.id, { by: 'iphone-runner', part: 1, state: 'ready' });
  assert.equal(C.get(s.id).parts[0].message, undefined, 'a new state clears the old message');
  await assert.rejects(C.start(s.id, { part: 2 }), /not the current part/);
  let x = await C.start(s.id, { part: 1 });
  assert.deepEqual([x.status, x.cur, x.parts[0].state], ['active', 0, 'started']);
  await assert.rejects(C.start(s.id, { part: 1 }), /already started/, 'a double click does not restart');
  await assert.rejects(C.ack(s.id, { by: 'iphone-runner', part: 1, state: 'ready' }), /only before the user's Start/);
  await C.ack(s.id, { by: 'iphone-runner', part: 1, state: 'recording' });
  await assert.rejects(C.answer(s.id, { value: '1' }), /answer after the last part/);
  x = await C.done(s.id, { part: 1 });
  assert.deepEqual([x.cur, x.parts[0].state, x.parts[1].state], [1, 'done', 'waiting']);
  await assert.rejects(C.done(s.id, { part: 1 }), /not the current part/, 'a stale page cannot finish part 1 twice');
  await assert.rejects(C.done(s.id, { part: 2 }), /not started/);
  await C.ack(s.id, { by: 'iphone-runner', part: 2, state: 'ready' });
  await C.start(s.id, { part: 2 });
  await C.ack(s.id, { by: 'iphone-runner', part: 2, state: 'recording' });
  x = await C.ack(s.id, { by: 'iphone-runner', part: 2, state: 'done' }); // the runner's own recording cap
  assert.equal(C.phase(x), 'answer');
  await assert.rejects(C.answer(s.id, { value: '3' }), /answer one of 1, 2, same/);
  x = await C.answer(s.id, { value: '2', notes: 'page 2 felt stickier at the top' });
  assert.equal(x.status, 'answered');
  assert.deepEqual([x.result.value, x.result.notes], ['2', 'page 2 felt stickier at the top']);
  assert.deepEqual(x.history.map((h) => `${h.who}:${h.action}${h.state ? ':' + h.state : ''}`), [
    'iphone-runner:posted', 'iphone-runner:ack:loading', 'iphone-runner:ack:ready', 'user:start', 'iphone-runner:ack:recording', 'user:done',
    'iphone-runner:ack:ready', 'user:start', 'iphone-runner:ack:recording', 'iphone-runner:ack:done', 'user:answer']);
  await assert.rejects(C.skip(s.id), /is answered/);
  assert.match(C.line(x), /^C-001 {2}\[answered\] {2}swipe-pair {2}by iphone-runner: Pair 3 -> "2" \(notes: page 2 felt stickier/);
});

test('question: Start then answer (or answer at once); action: the last Done answers "done" with notes', async () => {
  const q = await C.post({ by: 'lead', kind: 'question', title: 'Phone on the charger?' });
  let x = await C.start(q.id);
  assert.equal(C.phase(x), 'answer');
  await assert.rejects(C.start(q.id), /already started/);
  x = await C.answer(q.id, { value: 'yes' });
  assert.equal(x.result.value, 'yes');
  const q2 = await C.post({ by: 'lead', kind: 'question', title: 'Describe the lag', text: true });
  await assert.rejects(C.answer(q2.id, { value: '  ' }), /empty/);
  assert.equal((await C.answer(q2.id, { value: 'a small hitch at the hero' })).result.value, 'a small hitch at the hero');
  const a = await C.post({ by: 'fix-x', kind: 'action', title: 'Finger scroll top to bottom', url: A, record: true });
  await C.start(a.id);
  await C.ack(a.id, { by: 'fix-x', state: 'recording' });
  x = await C.done(a.id, { notes: 'pushed past the end twice' });
  assert.deepEqual([x.status, x.result.value, x.result.notes], ['answered', 'done', 'pushed past the end twice']);
  const a2 = await C.post({ by: 'fix-x', kind: 'action', title: 'Look at the hero', options: 'smooth,janky' });
  await C.start(a2.id); await C.done(a2.id);
  assert.equal(C.phase(C.get(a2.id)), 'answer', 'with options, Done leads to the answer');
});

test('skip, reopen (user: only skipped; agent: any), redo a part, cancel', async () => {
  const s = await pair();
  const other = await C.post({ by: 'x', kind: 'question', title: 'later one' });
  let x = await C.skip(s.id, { notes: 'phone is hot' });
  assert.equal(x.status, 'skipped');
  assert.deepEqual(C.list({ pending: true }).map((y) => y.id), [other.id]);
  x = await C.reopen(s.id);
  assert.equal(x.status, 'pending');
  assert.deepEqual(C.list({ pending: true }).map((y) => y.id), [other.id, s.id], 'a reopened step goes to the end of the queue');
  await assert.rejects(C.reopen(s.id), /already pending/);
  await C.ack(s.id, { by: 'r', state: 'ready' }); await C.start(s.id, { part: 1 }); await C.done(s.id, { part: 1 });
  await assert.rejects(C.reopen(s.id, { who: 'user' }), /only a skipped step/);
  await assert.rejects(C.redo(s.id, { by: 'r', part: 2 }).then(() => C.redo(s.id, { by: 'r', part: 3 })), /--part 3 is not one of them/);
  x = await C.redo(s.id, { by: 'r', part: 1, message: 'the recording missed your swipe, once more please' });
  assert.deepEqual([x.status, x.cur, x.parts[0].state, x.parts[0].message, x.parts[1].state], ['active', 0, 'waiting', 'the recording missed your swipe, once more please', 'waiting']);
  x = await C.reopen(s.id, { who: 'r', agent: true });
  assert.deepEqual([x.status, x.cur, x.parts.map((p) => p.state).join()], ['pending', 0, 'waiting,waiting']);
  x = await C.cancel(s.id, { by: 'r', note: 'not needed' });
  assert.equal(x.status, 'cancelled');
  assert.ok(!C.list({ all: false }).some((y) => y.id === s.id), 'cancelled steps are hidden unless --all');
  await assert.rejects(C.ack(s.id, { by: 'r', state: 'ready' }), /is cancelled/);
  await assert.rejects(C.cancel(other.id, {}), /--by/);
});

test('publicView: blind URLs, agent meta and history never reach the page', async () => {
  const s = await pair();
  const v = C.publicView(C.get(s.id));
  const txt = JSON.stringify(v);
  assert.ok(!txt.includes('page-a.invalid') && !txt.includes('page-b.invalid'), txt);
  assert.ok(!txt.includes('patched') && !('meta' in v) && !('history' in v));
  assert.deepEqual(v.parts.map((p) => p.label), ['Page 1', 'Page 2']);
  const shown = C.publicView(await pair({ showUrl: true }));
  assert.equal(shown.parts[0].url, A);
  const act = C.publicView(await C.post({ by: 'x', kind: 'action', title: 't', url: A }));
  assert.equal(act.url, A, 'non-blind kinds show their URL');
});

test('waitCondition: started / recording / done per part, answered with the value and meta, never on skip', async () => {
  const s = await pair();
  const started = C.waitCondition(s.id, { until: 'started', part: 1 });
  assert.equal(started.what, 'console C-001 part 1 started');
  assert.deepEqual(started.check(), { met: false, state: 'pending, part 1 waiting' });
  await C.ack(s.id, { by: 'r', state: 'ready' });
  await C.start(s.id, { part: 1 });
  let r = started.check();
  assert.equal(r.met, true);
  assert.deepEqual(JSON.parse(r.detail).part, 1);
  const rec = C.waitCondition(s.id, { until: 'recording' }); // default: the last part the user started
  assert.equal(rec.what, 'console C-001 part 1 recording');
  assert.equal(rec.check().met, false);
  await C.ack(s.id, { by: 'r', state: 'recording' });
  assert.equal(rec.check().met, true);
  const d2 = C.waitCondition(s.id, { until: 'done', part: 2 });
  assert.equal(d2.check().met, false);
  await C.done(s.id, { part: 1 });
  assert.equal(C.waitCondition(s.id, { until: 'started' }).what, 'console C-001 part 2 started', 'default started = the current part');
  const ans = C.waitCondition(s.id);
  assert.equal(ans.what, 'console C-001 answered');
  await C.ack(s.id, { by: 'r', state: 'ready' }); await C.start(s.id, { part: 2 }); await C.done(s.id, { part: 2 });
  assert.equal(d2.check().met, true);
  await C.answer(s.id, { value: 'same', notes: 'n' });
  r = ans.check();
  assert.equal(r.met, true);
  assert.deepEqual(JSON.parse(r.detail), { id: 'C-001', by: 'iphone-runner', title: 'Pair 3', value: 'same', notes: 'n', at: C.get(s.id).result.at, meta: { key: '1=patched' } });
  // never: skipped / cancelled before the condition is met
  const t = await pair();
  const w = C.waitCondition(t.id, { until: 'started', part: 1 });
  await C.skip(t.id, { notes: 'later' });
  r = w.check();
  assert.equal(r.met, false);
  assert.match(r.never, /the user skipped it \(not now\): later; node tools\/console\.mjs reopen C-002/);
  const u = await C.post({ by: 'x', kind: 'question', title: 'q' });
  const wq = C.waitCondition(u.id, { until: 'started' });
  assert.equal(wq.what, 'console C-003 started');
  await C.cancel(u.id, { by: 'x' });
  assert.equal(wq.check().never, 'it was cancelled');
  assert.throws(() => C.waitCondition(u.id, { until: 'done' }), /has no parts/);
  assert.throws(() => C.waitCondition(u.id, { until: 'soon' }), /--until must be one of/);
});

test('concurrent posts get unique ids (the store guard)', async () => {
  const ids = await Promise.all(Array.from({ length: 12 }, (_, i) => C.post({ by: `a${i}`, kind: 'question', title: `q${i}` }).then((s) => s.id)));
  assert.equal(new Set(ids).size, 12);
});

test('the page: its inline script parses, it loads nothing from outside, it has light and dark themes', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../../tools/lib/console-page.html', import.meta.url), 'utf8');
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(js), 'inline script is valid JavaScript');
  assert.ok(!/\b(src|href)=["']https?:/i.test(html) && !/@import|url\(/i.test(html), 'no external resources');
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  for (const a of ['start', 'done', 'answer', 'skip', 'reopen']) assert.ok(html.includes(`'${a}'`), `the page sends ${a}`);
  assert.match(html, /'x-console': '1'/);
});

test('forced choice with an optional 1-5 rating; the rating comes back with the answer', async () => {
  assert.deepEqual(C.parseScale('1-5', 'How different?'), { min: 1, max: 5, label: 'How different?' });
  for (const bad of ['5-1', '1', 'a-b', '0-20']) assert.throws(() => C.parseScale(bad), /--scale must be like 1-5/);
  assert.throws(() => C.buildStep({ by: 'a', kind: 'question', title: 't', text: true, scale: '1-5' }), /--scale goes with answer buttons/);
  const s = await pair({ options: '1,2', scale: '1-5', scaleLabel: 'How different did they feel?' });
  assert.deepEqual(s.answer, { mode: 'buttons', options: ['1', '2'], scale: { min: 1, max: 5, label: 'How different did they feel?' } });
  for (const p of [1, 2]) { await C.ack(s.id, { by: 'r', part: p, state: 'ready' }); await C.start(s.id, { part: p }); await C.done(s.id, { part: p }); }
  await assert.rejects(C.answer(s.id, { value: 'same' }), /answer one of 1, 2/);
  await assert.rejects(C.answer(s.id, { value: '1', scale: 6 }), /the rating must be 1-5/);
  await C.answer(s.id, { value: '1', scale: '4' });
  const r = C.waitCondition(s.id).check();
  assert.deepEqual([JSON.parse(r.detail).value, JSON.parse(r.detail).scale], ['1', 4]);
  const q = await C.post({ by: 'a', kind: 'question', title: 'q' });
  await assert.rejects(C.answer(q.id, { value: 'yes', scale: 3 }), /has no rating scale/);
  assert.equal((await C.answer(q.id, { value: 'yes' })).result.scale, undefined, 'the rating is optional');
});

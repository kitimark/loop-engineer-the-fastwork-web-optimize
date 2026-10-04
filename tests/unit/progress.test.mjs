// tools/lib/progress.mjs (ts-progress): the user's fix-progress page model. Schema validation of the curated
// fixes/PROGRESS.json (also the committed file itself, so a bad edit fails `npm run test:unit`), the ledger read,
// the view (new-result flags, grouping, staleness) and its text form, and Hard rule 12: no URL, LAN address,
// e-mail, device id or home path ever reaches the output, also when a console step, a lock holder or an incident
// carries one. Every test uses its own $FW_STATE_DIR. Example addresses are private-range or .invalid; none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tempDir, REPO } from '../helpers.mjs';

const P = await import('../../tools/lib/progress.mjs');
const L = await import('../../tools/lib/lock.mjs');
const C = await import('../../tools/lib/console.mjs');
const I = await import('../../tools/lib/incident.mjs');

let state;
beforeEach(() => { state = tempDir('fw-progress-'); process.env.FW_STATE_DIR = state; });

const LAN = 'http://192.168.77.12:5497/';
const NOW = Date.parse('2026-10-01T17:10:00Z');

function sample() {
  return {
    schema: 'fw-progress/1', updatedAt: '2026-10-01T17:00:00Z', updatedBy: 'mgmt-ops-5',
    goal: 'No frame over 50 ms on the iPhone.',
    complaints: [{ area: 'hero', text: 'the top feels laggy' }],
    changes: [
      { at: '2026-10-01T14:00:00Z', text: 'c1' }, { at: '2026-10-01T16:00:00Z', text: 'c3' }, { at: '2026-10-01T15:00:00Z', text: 'c2' },
      { at: '2026-10-01T16:10:00Z', text: 'c4' }, { at: '2026-10-01T16:20:00Z', text: 'c5' }, { at: '2026-10-01T16:30:00Z', text: 'c6' },
    ],
    items: [
      { id: 'cdwc', title: 'Countdown fix', area: 'end', state: 'testing', stage: 'V', fixes: 'end panel', owner: 'fix-nav-morph',
        best: [{ what: 'frames over 50 ms', before: '1-27', after: '0', tag: 'OBSERVED', driver: 'scripted', ref: 'P-029', note: 'threshold-sensitive' }],
        felt: { answer: 'same', text: '3 pairs' }, gate: 'P-032', next: 'land if it passes',
        checks: [{ id: 'P-032', what: 'robot finger', result: '' }, { id: 'P-029', what: 'scripted', result: 'better' }],
        details: ['CSS 5dc6e8e37388'] },
      { id: 'hero-a', title: 'Hero thing', area: 'hero', state: 'testing', stage: 'F', next: 'P-033', owner: 'fix-hero-exit' },
      { id: 'carousel', title: 'Carousel', area: 'hero', state: 'diagnosing', stage: 'D', next: 'P14', owner: 'de-pm-hero', checks: [{ id: 'P-025', what: 'P14' }] },
      { id: 'cq3', title: 'Containment', area: 'whole', state: 'dropped', stage: 'F', why: 'moved, not removed' },
      { id: 'base', title: 'Wave 1', area: 'whole', state: 'base', stage: 'L' },
    ],
    upcoming: [{ title: 'F3 swipe test', when: 'after P-036', item: 'cdwc' }],
  };
}
const LEDGER = [
  '| id | author | date | build vs base | driver | metric | predicted [interval] | measured | in? | ratio | lesson |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  '| P-025 | de-pm-hero | 10-01 | x | W | m | p | (queued) |  |  | l |',
  '| P-029 | fix-nav-morph | 10-01 | x | M | m | p | 1/2/3/27 -> 0 | **HIT** | – | l |',
  '| P-032 | fix-nav-morph | 10-01 | x | G | m | p | V better in 4/4 | **HIT** | – | l |',
].join('\n');

test('validateProgress: the sample is valid; required fields, enums, ids and references are checked', () => {
  assert.deepEqual(P.validateProgress(sample()), []);
  const bad = sample();
  bad.schema = 'x'; bad.updatedAt = '17:00'; delete bad.goal;
  bad.items[0].area = 'footer'; bad.items[0].stage = 'Z'; bad.items[0].state = 'done';
  bad.items[0].best[0].tag = 'SURE'; bad.items[0].checks[0].id = 'P14';
  bad.items[1].id = 'cdwc';
  delete bad.items[3].why;
  bad.upcoming[0].item = 'nope';
  bad.items[2].title = 'x'.repeat(91);
  const e = P.validateProgress(bad).join('\n');
  for (const re of [/^schema:/m, /^updatedAt:/m, /^goal: required/m, /items\[0\]\.area: must be one of/, /items\[0\]\.stage/, /items\[0\]\.state/,
    /best\[0\]\.tag/, /checks\[0\]\.id: a PREDICTIONS\.md row id/, /items\[1\]\.id: duplicate "cdwc"/, /items\[3\]\.why: required/,
    /upcoming\[0\]\.item: no item "nope"/, /items\[2\]\.title: too long/]) assert.match(e, re);
  assert.deepEqual(P.validateProgress([]), ['top level: must be a JSON object']);
});

test('validateProgress refuses anything personal or network-identifying (Hard rule 12)', () => {
  const cases = [
    ['a LAN URL', `open ${LAN} on the phone`, /contains a url/],
    ['a bare LAN IP', 'phone at 10.1.2.3', /contains a ip address/],
    ['an IPv6 link-local', 'fe80::1c2b:3d4e:5f60:7a8b', /contains a ip address/],
    ['a .local host', 'served from my-mac.local', /contains a local host name/],
    ['an e-mail', 'ask someone@example.com', /contains a e-mail/],
    ['a home path', 'see /Users/someone/x', /contains a home path/],
    ['a UDID', 'device 00008130-001234567890ABCD', /contains a device id/],
  ];
  for (const [what, text, re] of cases) {
    const p = sample();
    p.items[0].details.push(text);
    assert.match(P.validateProgress(p).join('\n'), re, what);
  }
  const ok = sample();
  ok.items[0].details.push('RenderLayerBacking::updateGeometry at 16:21:39Z, y≈1960, JS 3e2f599a1632, P-029 1/2/3/27');
  assert.deepEqual(P.validateProgress(ok), [], 'code names, clock times, short hashes and numbers are fine');
});

test('the committed fixes/PROGRESS.json is valid', { skip: !existsSync(join(REPO, 'fixes', 'PROGRESS.json')) && 'no fixes/PROGRESS.json in this commit' }, () => {
  delete process.env.FW_PROGRESS_FILE;
  const { errors, data } = P.readProgress(join(REPO, 'fixes', 'PROGRESS.json'));
  assert.deepEqual(errors, [], `fixes/PROGRESS.json: ${errors.join('; ')} (schema: header of tools/lib/progress.mjs)`);
  assert.ok(data.items.length > 0);
});

test('readProgress: missing file and bad JSON are reported, not thrown', () => {
  assert.match(P.readProgress(join(state, 'nope.json')).errors[0], /no progress file yet/);
  const f = join(state, 'bad.json'); writeFileSync(f, '{');
  assert.match(P.readProgress(f).errors[0], /not JSON/);
});

test('sanitize scrubs URLs, addresses, hosts, e-mails, ids and home paths; keeps ordinary text', () => {
  const s = P.sanitize(`go to ${LAN} or 10.0.0.5, host my-mac.local, mail a@b.co, path /Users/someone/repo, udid 00008130-001234567890ABCD`);
  for (const bad of ['192.168', '10.0.0.5', 'my-mac', 'a@b.co', 'someone', '00008130']) assert.ok(!s.includes(bad), `${bad} in ${s}`);
  assert.equal(P.sanitize('I-037 iPhone tools pick a web view; P-029 47-58 -> 0-1 at 16:21:39Z'), 'I-037 iPhone tools pick a web view; P-029 47-58 -> 0-1 at 16:21:39Z');
  assert.equal(P.sanitize('x'.repeat(50), 10).length, 10);
  assert.equal(P.sanitize(undefined), '');
});

test('parseLedger: the "in?" cell per row, bold stripped, empty while no result', () => {
  const m = P.parseLedger(LEDGER);
  assert.deepEqual([...m.keys()], ['P-025', 'P-029', 'P-032']);
  assert.equal(m.get('P-029').result, 'HIT');
  assert.equal(m.get('P-025').result, '');
  assert.equal(P.parseLedger('').size, 0);
});

// I-116: rows were split on ' | ', so an empty cell ('| |') read as '|' and a stray ' | ' inside a free-text cell shifted
// every later cell (P-090: predicted; P-091: measured): the Best build page showed false "new result"s. Cells are now
// split on unescaped pipes, and a row with more cells than the header is read from its end (in?, ratio, lesson).
test('I-116 parseLedger: empty cells stay empty; stray " | " in predicted or measured, |abs| bars and escaped \\| pipes do not shift "in?"', () => {
  const H = LEDGER.split('\n').slice(0, 2);
  const rows = [
    '| P-092 | fix-morph-gpu | 10-04 | V vs C | M | f50 | point 0 | pending | | | |',
    '| P-093 | a | d | b | G | m | p | | | | |',
    '| P-090 | fix-carousel-leaver | 10-03 | split | Sim | X matches base | Hold A: P(S matches base) 0.25; exactly | one) 0.6 | 10-03 20:22Z Hold A on screen S~base 1137 px | on screen: P(S matches) 0.25 -> MISS; Hold B 0.55 -> HIT |  | ops result read: re-scored from raw |',
    '| P-091 | fix-nav-morph | 10-04 | V vs C | G | owner of edge frames | STYLE 0.4 | 8 counted runs C1 V1 | V2 C2 C3 V3 | V4 C4 from VALID holds | **VOID** | n/a | the scorer was wrong |',
    '| P-056c | x | 10-02 | C vs V | a | b | \\|V - S0\\| <= A/A + 17 ms | q40x | (a) **FAIL** as written | – | lesson |',
    '| P-094 | x | 10-04 | b | d | m | p | measured | **MISS** | 0.5 | a lesson with a | pipe in it |',
    '| P-056a | x | 10-02 | C vs V | a | b | (c2) |V - S0| <= 250 ms | V built | (c1) **miss** strict; (c2) |V - S0| <= 17 ms: hit | – | lesson |',
    '| P-069 | x | 10-02 | V vs C | s | m | median V - median C |< 4 ms| | Sim stage 1 | Sim: faces in; |median diff| < 4 out | | |',
    '| P-095 | x | 10-04 | b | d | m | p | pending ||| |',
  ];
  const m = P.parseLedger([...H, ...rows].join('\n'));
  assert.equal(m.get('P-092').result, '', 'pending, empty in? cell');
  assert.equal(m.get('P-093').result, '', 'all trailing cells empty');
  assert.equal(m.get('P-090').result, 'on screen: P(S matches) 0.25 -> MISS; Hold B 0.55 -> HIT', 'stray pipe in predicted');
  assert.equal(m.get('P-091').result, 'VOID', 'two stray pipes in measured');
  assert.equal(m.get('P-056c').result, '(a) FAIL as written', 'escaped pipes are cell text');
  // a stray pipe after "in?" (in the lesson) cannot be told from one before it: read from the end, as documented
  assert.equal(m.get('P-094').result, '0.5');
  // a pipe that touches text is text (absolute-value bars), in any cell, the in? cell too
  assert.equal(m.get('P-056a').result, '(c1) miss strict; (c2) |V - S0| <= 17 ms: hit');
  assert.equal(m.get('P-069').result, 'Sim: faces in; |median diff| < 4 out');
  assert.equal(m.get('P-095').result, '', '"||" is an empty cell too');
  for (const id of ['P-092', 'P-093', 'P-095']) {
    const v = P.buildView({ progress: { ...sample(), items: [{ id: 'x', title: 'X', area: 'hero', state: 'testing', stage: 'V', checks: [{ id, what: 'w' }] }] }, ledger: m, live: {}, now: NOW });
    assert.equal(v.summary.newResults, 0, `${id}: no false "new result"`);
  }
});

test('I-116 parseLedger on fixes/PREDICTIONS.md: no result is a bare pipe or holds a column separator; P-090/P-091 read their in? cells', () => {
  const m = P.parseLedger(readFileSync(join(REPO, 'fixes', 'PREDICTIONS.md'), 'utf8'));
  assert.ok(m.size > 50);
  for (const [id, r] of m) assert.doesNotMatch(r.result, /(^|\s)\|(\s|$)/, `${id}: a column separator in the result`);
  if (m.has('P-090')) assert.match(m.get('P-090').result, /MISS|HIT/);
  if (m.has('P-091')) assert.match(m.get('P-091').result, /^(VOID|HIT|MISS|n\/a|)/);
});

test('buildView: new ledger results are flagged, curated results win, sections, staleness, last 5 changes', () => {
  const v = P.buildView({ progress: sample(), ledger: P.parseLedger(LEDGER), live: {}, now: NOW });
  const testing = v.sections.find((s) => s.key === 'testing').items;
  assert.deepEqual(testing.map((i) => i.id), ['hero-a', 'cdwc'], 'by area: hero before end');
  const cdwc = testing[1];
  assert.deepEqual(cdwc.checks.map((c) => [c.id, c.result, c.newResult]), [['P-032', null, true], ['P-029', 'better', false]]);
  assert.equal(cdwc.attention, true);
  assert.equal(cdwc.felt.plain, 'you felt no difference');
  assert.deepEqual(cdwc.stage, { code: 'V', name: 'review', plain: 'independent review', index: 4 });
  assert.equal(v.sections.find((s) => s.key === 'diagnosing').items[0].checks[0].ledger, 'no result yet');
  assert.deepEqual(v.sections.find((s) => s.key === 'dropped').items.map((i) => i.id), ['cq3']);
  assert.deepEqual(v.sections.find((s) => s.key === 'landed').items.map((i) => i.id), ['base']);
  assert.equal(v.summary.newResults, 1);
  assert.equal(v.summary.ageMin, 10);
  assert.equal(v.summary.stale, false);
  assert.deepEqual(v.changes.map((c) => c.text), ['c6', 'c5', 'c4', 'c3', 'c2'], 'newest first, 5 shown');
  assert.equal(P.buildView({ progress: sample(), now: NOW + 4 * 3600e3 }).summary.stale, true);
  const none = P.buildView({ progress: null, errors: ['no progress file yet'], now: NOW });
  assert.deepEqual([none.goal, none.sections.every((s) => !s.items.length), none.summary.errors], [null, true, ['no progress file yet']]);
});

test('renderText: the headline layer in order, details only on request', () => {
  const v = P.buildView({ progress: sample(), ledger: P.parseLedger(LEDGER), live: { locks: {}, incidents: [], steps: [] }, now: NOW });
  const t = P.renderText(v);
  const order = ['FIX PROGRESS', 'Goal: No frame over 50 ms', 'You flagged: the top feels laggy', 'WHAT CHANGED', 'NOW', 'FIXES BEING TESTED', 'BEING DIAGNOSED', 'LANDED', 'DROPPED OR NOT FELT', 'COMING UP FOR YOU'];
  let at = -1;
  for (const s of order) { const i = t.indexOf(s); assert.ok(i > at, `"${s}" after the previous heading:\n${t}`); at = i; }
  assert.match(t, /best: frames over 50 ms: 1-27 -> 0 \(OBSERVED, scripted, P-029; threshold-sensitive\)/);
  assert.match(t, /check P-032 robot finger: NEW in the ledger: HIT \(summary not updated yet\)/);
  assert.match(t, /stopped at stage F/);
  assert.match(t, /later: F3 swipe test \(after P-036\)/);
  assert.match(t, /nothing waiting on the console now/);
  assert.ok(!t.includes('CSS 5dc6e8e37388'));
  assert.ok(P.renderText(v, { details: true }).includes('· CSS 5dc6e8e37388'));
});

test('live state from the real stores: owners only, no LAN URL from a step, lease or incident ever reaches the output', async () => {
  // a console step that names the LAN host in its URL, its instructions, its parts and even its title
  await C.post({ by: 'iphone-runner', kind: 'action', title: `Open ${LAN} on the phone`, instructions: `Load ${LAN} and swipe`, url: LAN });
  await C.post({ by: 'iphone-runner', kind: 'swipe-pair', title: 'Swipe pair 4', url: LAN, url2: 'http://10.9.8.7:5498/' });
  assert.equal((await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 600, meta: { url: LAN } })).ok, true);
  await I.open({ by: 'iphone-runner', title: 'phone at 192.168.77.12 drops off', error: 'e', cls: 'env', blocking: true });
  const ledgerFile = join(state, 'PREDICTIONS.md'); writeFileSync(ledgerFile, LEDGER);
  const progFile = join(state, 'PROGRESS.json'); writeFileSync(progFile, JSON.stringify(sample()));
  process.env.FW_PROGRESS_FILE = progFile; process.env.FW_PREDICTIONS_FILE = ledgerFile;
  try {
    const v = await P.currentView({ now: NOW });
    assert.equal(v.live.phone.holder.owner, 'iphone-runner');
    assert.equal(v.live.chrome.holder, null);
    assert.deepEqual(Object.keys(v.live.phone.holder).sort(), ['owner', 'short', 'since', 'until'], 'no meta, checkout, host or pid');
    assert.equal(v.live.incidents.blocking.length, 1);
    assert.deepEqual(v.waiting.map((w) => Object.keys(w).sort()), [['id', 'status', 'title'], ['id', 'status', 'title']]);
    assert.equal(v.waiting[1].title, 'Swipe pair 4');
    const out = JSON.stringify(v) + '\n' + P.renderText(v) + '\n' + P.renderText(v, { details: true });
    for (const bad of ['192.168', '10.9.8.7', 'http://', 'https://', '/Users/', '/home/']) assert.ok(!out.includes(bad), `"${bad}" leaked:\n${out}`);
    assert.match(out, /Open <link> on the phone/);
  } finally { delete process.env.FW_PROGRESS_FILE; delete process.env.FW_PREDICTIONS_FILE; }
});

test('gatherLive tolerates an empty store', async () => {
  const live = await P.gatherLive();
  assert.deepEqual([live.incidents, live.steps, live.errors], [[], [], []]);
  assert.equal(P.lockView(live.locks.iphone).holder, null);
});

// ---- I-048: the chrome-measure shared lane (ts-lock-share) on the page and in the text --------------------------

const HOME = '/Users/someone-private';
/** A lock.status('chrome-measure') with a shared group of 2 readers (w2 + w1 = 3 of cap 3) and joins closed. */
function sharedStatus({ queue, sharedLane = { enabled: true, cap: 3 } } = {}) {
  const readers = [
    { owner: 'fix-a', token: 'a1a1a1a1a1a1', kind: 'process', pid: 424242, checkout: `${HOME}/wt-a`, acquiredAt: '2026-10-01T17:01:00Z', deadline: '2026-10-01T17:06:05Z', maxSec: 300, weight: 2, meta: { url: LAN } },
    { owner: 'fix-b', token: 'b2b2b2b2b2b2', kind: 'lease', checkout: `${HOME}/wt-b`, acquiredAt: '2026-10-01T17:03:00Z', deadline: '2026-10-01T17:07:00Z', maxSec: 240, weight: 1, meta: { note: `see ${LAN}` } },
  ];
  return {
    resource: 'chrome-measure', stale: null, next: 'fix-c', sharedLane,
    holder: { resource: 'chrome-measure', owner: '(shared)', kind: 'lease', token: 'g9g9g9g9g9g9', checkout: `${HOME}/main`, host: 'mac.local', acquiredAt: '2026-10-01T17:01:00Z', openedAt: '2026-10-01T17:01:00Z', expiresAt: '2026-10-01T17:07:10Z', short: true, maxSec: 300, shared: true, format: 'rw1', meta: { readers: 'fix-a (w2), fix-b (w1)' }, readers },
    queue: queue ?? [
      { owner: 'fix-d', kind: 'process', pid: 515151, checkout: `${HOME}/wt-d`, short: true, maxSec: 60, shared: true, weight: 1, since: '2026-10-01T17:04:00Z', lastSeen: '2026-10-01T17:09:50Z' },
      { owner: 'fix-c', kind: 'process', pid: 616161, checkout: `${HOME}/wt-c`, since: '2026-10-01T17:05:00Z', lastSeen: '2026-10-01T17:09:50Z' },
    ],
  };
}
const exclusiveStatus = (sharedLane) => ({
  resource: 'chrome-measure', stale: null, next: null, ...(sharedLane ? { sharedLane } : {}),
  holder: { resource: 'chrome-measure', owner: 'fix-x', kind: 'process', pid: 717171, token: 'x7x7x7x7x7x7', checkout: `${HOME}/wt-x`, acquiredAt: '2026-10-01T17:05:00Z', expiresAt: '2026-10-01T17:15:00Z', meta: { url: LAN } },
  queue: [],
});
const chromeLine = (st) => P.renderText(P.buildView({ progress: sample(), live: { locks: { 'chrome-measure': st } }, now: NOW })).split('\n').find((l) => /^ {2}Chrome: /.test(l));

test('I-048 lockView: a shared group shows every reader (owner, weight, since), the weight against the cap, joins closed', () => {
  const v = P.lockView(sharedStatus(), NOW);
  assert.equal(v.holder, null, 'the group owner "(shared)" is nobody\'s name');
  assert.deepEqual(v.shared, {
    readers: [{ owner: 'fix-a', weight: 2, since: '2026-10-01T17:01:00Z' }, { owner: 'fix-b', weight: 1, since: '2026-10-01T17:03:00Z' }],
    used: 3, cap: 3, joinsClosed: true, closedBy: 'fix-c',
  });
  assert.deepEqual(v.lane, { on: true, cap: 3 });
  assert.deepEqual(v.queue, ['fix-d', 'fix-c']);
  // privacy unchanged: owner names, weights and times only; never meta, checkout, pid, token or host
  const json = JSON.stringify(v);
  for (const bad of ['a1a1a1', 'b2b2b2', 'g9g9g9', '424242', '515151', '616161', 'someone-private', '192.168', 'mac.local', '(shared)', 'note', 'deadline']) assert.ok(!json.includes(bad), `"${bad}" leaked: ${json}`);
  assert.equal(chromeLine(sharedStatus()), '  Chrome: fix-a (w2, since 17:01Z), fix-b (w1, since 17:03Z) (shared lane 3/3); joins closed (fix-c waits for Chrome alone), 2 waiting (fix-d, fix-c)');
  // only readers waiting: joins are open
  const open = P.lockView(sharedStatus({ queue: [sharedStatus().queue[0]] }), NOW).shared;
  assert.deepEqual([open.joinsClosed, open.closedBy], [false, null]);
  assert.equal(chromeLine(sharedStatus({ queue: [] })), '  Chrome: fix-a (w2, since 17:01Z), fix-b (w1, since 17:03Z) (shared lane 3/3)');
  // the lead switched the lane off while the group runs: its readers finish, no new one joins
  assert.equal(chromeLine(sharedStatus({ queue: [], sharedLane: { enabled: false, cap: 3 } })), '  Chrome: fix-a (w2, since 17:01Z), fix-b (w1, since 17:03Z) (shared lane 3/3; switch off: no new reader joins)');
  // a group in a format this code does not know shows as one exclusive holder, as lock.mjs treats it
  const odd = sharedStatus({ queue: [] }); odd.holder.format = 'rw9';
  assert.deepEqual([P.lockView(odd, NOW).holder.owner, P.lockView(odd, NOW).shared], ['(shared)', null]);
});

test('I-048 lockView: an exclusive holder and a free lock read as before; the lane line only while the switch is on', () => {
  // no switch information (the iphone, or a status from before the lane): exactly as before plus shared/lane null
  assert.deepEqual(P.lockView(exclusiveStatus(), NOW), { holder: { owner: 'fix-x', since: '2026-10-01T17:05:00Z', until: '2026-10-01T17:15:00Z', short: false }, shared: null, lane: null, queue: [] });
  assert.equal(chromeLine(exclusiveStatus()), '  Chrome: fix-x (since 17:05Z)');
  assert.equal(chromeLine(exclusiveStatus({ enabled: false, cap: 3 })), '  Chrome: fix-x (since 17:05Z)', 'switch off: unchanged');
  assert.equal(chromeLine(exclusiveStatus({ enabled: true, cap: 3 })), '  Chrome: fix-x (since 17:05Z); shared lane on, cap 3');
  const free = (sharedLane) => ({ resource: 'chrome-measure', stale: null, next: null, holder: null, queue: [], ...(sharedLane ? { sharedLane } : {}) });
  assert.deepEqual(P.lockView(free(), NOW), { holder: null, shared: null, lane: null, queue: [] });
  assert.equal(chromeLine(free()), '  Chrome: free');
  assert.equal(chromeLine(free({ enabled: false, cap: 3 })), '  Chrome: free');
  assert.equal(chromeLine(free({ enabled: true, cap: 4 })), '  Chrome: free; shared lane on, cap 4');
  assert.ok(!JSON.stringify(P.lockView(exclusiveStatus({ enabled: true, cap: 3 }), NOW)).match(/717171|x7x7|someone-private|192\.168/));
});

test('I-051 lockView: a free lock shows whom it is handing over to and why (gated reasons, or not seen), on the page too', () => {
  const free = (handover) => ({ resource: 'chrome-measure', stale: null, next: 'fix-c', holder: null, handover,
    queue: [{ owner: 'fix-c', kind: 'process', pid: 616161, checkout: `${HOME}/wt-c`, since: '2026-10-01T17:05:00Z', lastSeen: '2026-10-01T17:09:50Z' }] });
  const g = P.lockView(free({ to: 'fix-c', gated: ['cpu 32.5 % > 25 %', 'load1 70.8 > 6'], gatedSince: '2026-10-01T17:05:00Z' }), NOW);
  assert.deepEqual(g.handover, { to: 'fix-c', text: 'handing over to fix-c (gated: cpu 32.5 % > 25 %, load1 70.8 > 6)' });
  assert.equal(chromeLine(free({ to: 'fix-c', gated: ['load1 70.8 > 6'] })), '  Chrome: free, handing over to fix-c (gated: load1 70.8 > 6), 1 waiting (fix-c)');
  assert.equal(chromeLine(free({ to: 'fix-c', notSeenSec: 42 })), '  Chrome: free, handing over to fix-c (not seen for 42 s), 1 waiting (fix-c)');
  assert.equal(chromeLine(free({ to: 'fix-c', seenSec: 1 })), '  Chrome: free, handing over to fix-c (seen 1 s ago), 1 waiting (fix-c)');
  assert.equal(P.lockView(free(undefined), NOW).handover, undefined, 'no hand-over record: the view is as before');
  assert.ok(!JSON.stringify(g).match(/616161|wt-c|someone-private/));
  // the page shows the same text under "free"
  const page = readFileSync(new URL('../../tools/lib/progress-page.html', import.meta.url), 'utf8');
  assert.match(page, /l\.handover\.text/);
});

test('I-051 gatherLive: a free chrome-measure lock carries the hand-over record from lock.mjs', async () => {
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-z', kind: 'lease', ttlSec: 600, short: true, maxSec: 60 })).ok, true);
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-y', kind: 'lease', ttlSec: 600, short: true, maxSec: 60 })).ok, false);
  await L.release('chrome-measure', { owner: 'fix-z' });
  const v = P.lockView((await P.gatherLive()).locks['chrome-measure']);
  assert.equal(v.holder, null);
  assert.equal(v.handover.to, 'fix-y');
  assert.match(v.handover.text, /^handing over to fix-y \(seen \d+ s ago\)$/);
});

test('I-048 gatherLive: the real shared group through lock.mjs (live readers only, the switch), joins closed by a writer', async () => {
  await L.setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'test', cap: 4 });
  const ghost = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  try {
    const rd = (owner, o) => L.tryAcquire('chrome-measure', { owner, shared: true, maxSec: 120, load1: 0, ncpu: 8, meta: { url: LAN }, ...o });
    assert.equal((await rd('fix-a', { kind: 'process', weight: 2 })).ok, true);
    assert.equal((await rd('ghost', { kind: 'process', pid: ghost.pid, weight: 1 })).ok, true);
    assert.equal((await rd('fix-b', { kind: 'lease', weight: 1 })).ok, true);
    assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-c', kind: 'lease', ttlSec: 600 })).ok, false, 'a writer waits');
    ghost.kill('SIGKILL');
    await new Promise((res) => ghost.once('exit', res));
    const live = await P.gatherLive();
    const v = P.lockView(live.locks['chrome-measure']);
    assert.deepEqual(v.shared.readers.map((x) => `${x.owner} w${x.weight}`), ['fix-a w2', 'fix-b w1'], 'the dead process reader is gone');
    assert.deepEqual([v.shared.used, v.shared.cap, v.shared.joinsClosed, v.shared.closedBy], [3, 4, true, 'fix-c']);
    assert.deepEqual(v.lane, { on: true, cap: 4 });
    assert.equal(P.lockView(live.locks.iphone).lane, null, 'the phone has no shared lane');
    const out = JSON.stringify(P.buildView({ progress: sample(), live })) + P.renderText(P.buildView({ progress: sample(), live }));
    for (const bad of ['192.168', 'http://', '/Users/', '"pid"', '"token"', '"checkout"']) assert.ok(!out.includes(bad), `"${bad}" leaked`);
    assert.match(out, /Chrome: fix-a \(w2, since \d\d:\d\dZ\), fix-b \(w1, since \d\d:\d\dZ\) \(shared lane 3\/4\); joins closed \(fix-c waits for Chrome alone\), 1 waiting \(fix-c\)/);
  } finally { try { ghost.kill('SIGKILL'); } catch {} }
});

// ---- T-079: the Versions section on /build ---------------------------------------------------------------------

function withVersions() {
  const p = sample();
  p.build = { name: 'Stack 6', since: '2026-10-02T08:00:00Z', fixes: ['cdwc'] };
  p.versions = [
    { id: 'v0', name: 'Original page', since: '2026-10-01T00:00:00Z', improvement: 'The page as the site serves it.',
      hashes: { js: '4606120cf392', css: '27776f3d4138' }, tryIt: { port: 5301, server: 'baseline' } },
    { id: 'st6-rb', name: 'Stack 6', since: '2026-10-02T08:00:00Z', improvement: 'The countdown no longer repaints the end panel.', fixes: ['cdwc'], verdict: 'smoother', best: true,
      result: [{ what: 'frames over 50 ms', before: '4-9', after: '0-2', tag: 'OBSERVED', driver: 'scripted scroll', when: '2026-10-02T08:40:00Z', how: 'phone block A1', ref: 'P-029' }],
      cost: 'nothing visible; 2 KB more CSS', hashes: { js: '59b23b3f57fd', css: 'd22542d0b5f8' }, tryIt: { port: 5302, scheme: 'https', path: '/?v=2' } },
    { id: 'gpu', name: 'GPU preview', since: '2026-10-03T08:00:00Z', improvement: 'The end morph runs on the GPU.',
      result: [{ what: 'frames over 34 ms', before: '3', after: '1', tag: 'UNRESOLVED', driver: 'robot finger' }],
      cost: 'none', landed: false, tryIt: { none: 'not served yet' } },
  ];
  return p;
}
const fakeLan = (u) => u.replace('//lan:', '//10.9.8.7:');

test('T-079 validateProgress: versions (oldest first, baseline first) with improvement, result vs the previous, cost, hashes and a Try-it port', () => {
  assert.deepEqual(P.validateProgress(withVersions()), []);
  assert.deepEqual(P.validateProgress(sample()), [], 'versions are optional');
  const bad = withVersions();
  bad.versions[1].id = 'v0';
  bad.versions[2].since = '2026-10-01T12:00:00Z';
  delete bad.versions[2].improvement;
  delete bad.versions[1].result;
  delete bad.versions[1].cost;
  bad.versions[1].fixes = ['nope'];
  bad.versions[0].hashes = { js: 'XYZ', css: '27776f3d4138aa27776f3d4138' };
  bad.versions[2].tryIt = { port: 5303, none: 'x' };
  const e = P.validateProgress(bad).join('\n');
  for (const re of [/versions\[1\]\.id: duplicate "v0"/, /versions\[2\]\.since: earlier than versions\[1\]/, /versions\[2\]\.improvement: required/,
    /versions\[1\]\.result: at least one number vs the previous version/, /versions\[1\]\.cost: required/, /versions\[1\]\.fixes\[0\]: no item "nope"/,
    /versions\[0\]\.hashes\.js: a short hex hash/, /versions\[0\]\.hashes\.css: a short hex hash/, /versions\[2\]\.tryIt: either \{port/]) assert.match(e, re);
  for (const [tryIt, re] of [
    [undefined, /versions\[0\]\.tryIt: required/],
    [{ port: 80 }, /versions\[0\]\.tryIt\.port: a port number 1024-65535/],
    [{ port: '5301' }, /versions\[0\]\.tryIt\.port: a port number 1024-65535/],
    [{ port: 70000 }, /versions\[0\]\.tryIt\.port/],
    [{ port: 5301, scheme: 'ftp' }, /versions\[0\]\.tryIt\.scheme: must be one of http, https/],
    [{ port: 5301, path: 'x' }, /versions\[0\]\.tryIt\.path: a path on that server/],
    [{ port: 5301, path: '//evil' }, /versions\[0\]\.tryIt\.path: a path on that server/],
    [{ port: 5301, host: 'lan' }, /versions\[0\]\.tryIt: unknown field "host"/],
    [{ none: '' }, /versions\[0\]\.tryIt\.none: required/],
    [{ port: 5301, server: 'a b' }, /versions\[0\]\.tryIt\.server: the server's short name/],
  ]) {
    const p = withVersions(); p.versions[0].tryIt = tryIt;
    assert.match(P.validateProgress(p).join('\n'), re, JSON.stringify(tryIt));
  }
  const url = withVersions(); url.versions[1].improvement = 'try http://lan:5302/';
  assert.match(P.validateProgress(url).join('\n'), /versions\[1\]\.improvement: contains a url/, 'no URL in the file: the console builds it');
  const notArr = withVersions(); notArr.versions = {};
  assert.match(P.validateProgress(notArr).join('\n'), /^versions: must be an array/m);
  const first = withVersions(); delete first.versions[0].result; delete first.versions[0].cost;
  assert.deepEqual(P.validateProgress(first), [], 'the baseline needs no result or cost');
  const long = withVersions(); long.versions[1].verdict = 'x'.repeat(81);
  assert.match(P.validateProgress(long).join('\n'), /versions\[1\]\.verdict: too long/);
});

test('T-079 versionsView: oldest first, fixes by title, result vs the previous, Try-it resolved at render time, running or not', () => {
  const v = P.versionsView(withVersions(), { lan: fakeLan, running: new Map([[5301, true], [5302, false]]) });
  assert.deepEqual(v.map((x) => x.id), ['v0', 'st6-rb', 'gpu']);
  assert.equal(v[0].base, true); assert.equal(v[1].base, false);
  assert.equal(v[0].previous, null); assert.equal(v[1].previous, 'Original page'); assert.equal(v[2].previous, 'Stack 6');
  assert.deepEqual(v[1].fixes, [{ id: 'cdwc', title: 'Countdown fix' }]);
  assert.deepEqual(v[0].tryIt, { placeholder: 'http://lan:5301/', url: 'http://10.9.8.7:5301/', port: 5301, server: 'baseline', running: true, noLan: false });
  assert.deepEqual(v[1].tryIt, { placeholder: 'https://lan:5302/?v=2', url: 'https://10.9.8.7:5302/?v=2', port: 5302, server: null, running: false, noLan: false });
  assert.deepEqual(v[2].tryIt, { none: 'not served yet' });
  assert.deepEqual(v[0].hashes, { js: '4606120cf392', css: '27776f3d4138' });
  assert.equal(v[2].hashes, null);
  assert.deepEqual(v.map((x) => x.verdict), [null, 'smoother', null]);
  assert.deepEqual(v.map((x) => x.current), [false, true, false], 'the one version with "best": true is today\'s best build, not the newest');
  assert.deepEqual(v.map((x) => x.toTry), [false, false, true], '"landed": false is a page to try');
  // no Wi-Fi address now (the resolver throws, or hands the placeholder back): no link, the placeholder stays
  for (const lan of [() => { throw new Error('no LAN address'); }, (u) => u]) {
    const off = P.versionsView(withVersions(), { lan });
    assert.deepEqual(off[0].tryIt, { placeholder: 'http://lan:5301/', url: null, port: 5301, server: 'baseline', running: null, noLan: true });
  }
  assert.deepEqual(P.versionsView(sample()), []);
});

test('T-079 the best-build chip: only "best": true, at most one; none or several -> no chip; "to try" by landed:false or the verdict', () => {
  const none = withVersions(); delete none.versions[1].best;
  assert.deepEqual(P.validateProgress(none), [], 'no "best" is valid');
  assert.deepEqual(P.versionsView(none).map((x) => x.current), [false, false, false], 'no flag: no chip, not the newest');
  const two = withVersions(); two.versions[0].best = true;
  assert.match(P.validateProgress(two).join('\n'), /versions: "best": true on versions\[0\], versions\[1\]; at most one version/);
  assert.deepEqual(P.versionsView(two).map((x) => x.current), [false, false, false], 'several flags: no chip');
  const both = withVersions(); both.versions[2].best = true; delete both.versions[1].best;
  assert.match(P.validateProgress(both).join('\n'), /versions\[2\]: "best": true and "landed": false/);
  const str = withVersions(); str.versions[1].best = 'yes'; str.versions[2].landed = 'no';
  const e = P.validateProgress(str).join('\n');
  assert.match(e, /versions\[1\]\.best: true or false/); assert.match(e, /versions\[2\]\.landed: true or false/);
  const verdict = withVersions(); delete verdict.versions[2].landed; verdict.versions[2].verdict = 'to try; not landed';
  assert.equal(P.versionsView(verdict)[2].toTry, true, 'a verdict starting "to try" marks it too');
  const landed = withVersions(); delete landed.versions[2].landed;
  assert.equal(P.versionsView(landed)[2].toTry, false);
  // main's v5 (e5a1c2df): no landed flag, the verdict says nothing; only the name carries "(to try; not landed)"
  const byName = withVersions(); delete byName.versions[2].landed;
  byName.versions[2].name = 'GPU preview c0c8ad4e (to try; not landed)'; byName.versions[2].verdict = 'less work at rest and in the hero; not timed as a whole';
  assert.deepEqual(P.validateProgress(byName), []);
  assert.deepEqual(P.versionsView(byName).map((x) => x.toTry), [false, false, true], 'the name marks it when there is no flag');
  byName.versions[2].landed = true;
  assert.equal(P.versionsView(byName)[2].toTry, false, 'an explicit "landed": true wins over the words');
  const bestWords = withVersions(); bestWords.versions[1].name = 'Stack 6 (was to try)';
  assert.equal(P.versionsView(bestWords)[1].toTry, false, 'the best build is never "to try"');
});

test('T-079 buildView and renderText: versions in the model; the text shows the lan placeholder, never the address', () => {
  const v = P.buildView({ progress: withVersions(), now: NOW, lan: fakeLan, versionPorts: new Map([[5301, true], [5302, false]]) });
  assert.equal(v.versions.length, 3);
  assert.equal(v.versions[0].tryIt.url, 'http://10.9.8.7:5301/');
  const t = P.renderText(v);
  const i = t.indexOf('VERSIONS (oldest first)');
  assert.ok(i > 0, t);
  const block = t.slice(i);
  assert.match(block, /1\. Original page \(since 00:00Z 2026-10-01\): The page as the site serves it\.\n {6}try it: http:\/\/lan:5301\/ \[baseline\] \(running\)\n {6}js 4606120cf392 · css 27776f3d4138/);
  assert.match(block, /2\. Stack 6 \(since 08:00Z 2026-10-02; today's best build\): The countdown no longer repaints the end panel\.\n {6}verdict: smoother\n {6}adds: Countdown fix\n {6}vs Original page: frames over 50 ms: 4-9 -> 0-2 \(OBSERVED, scripted scroll; measured 08:40Z 2026-10-02, phone block A1; P-029\)\n {6}cost: nothing visible; 2 KB more CSS\n {6}try it: https:\/\/lan:5302\/\?v=2 \(not running now\)/);
  assert.match(block, /3\. GPU preview \(since 08:00Z 2026-10-03; to try \(not landed\)\):[^\n]*\n(?: {6}[^\n]*\n)* {6}try it: none \(not served yet\)/);
  assert.match(block, /vs Stack 6: frames over 34 ms: 3 -> 1 \(UNRESOLVED, robot finger\)/, 'a result without when');
  assert.ok(!t.includes('10.9.8.7'), 'the LAN address stays off the text');
  assert.deepEqual(P.buildView({ progress: sample(), now: NOW }).versions, []);
});

test('T-079 probePorts: true for a port that accepts a connection on this Mac, false for a closed one, quickly', async () => {
  const net = await import('node:net');
  const srv = net.createServer((c) => c.destroy());
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const open = srv.address().port;
  const probe = net.createServer(); await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const closed = probe.address().port; await new Promise((r) => probe.close(r));
  try {
    const t0 = Date.now();
    const m = await P.probePorts([open, closed, open], { timeoutMs: 400 });
    assert.equal(m.get(open), true); assert.equal(m.get(closed), false); assert.equal(m.size, 2);
    assert.ok(Date.now() - t0 < 2000);
  } finally { await new Promise((r) => srv.close(r)); }
});

// ---- the lead (T-103 follow-up): build.since is the since of the version with "best": true ------------------------

test('validateProgress: build.since must equal the since of the version with "best": true; the message names both (T-103)', () => {
  assert.deepEqual(P.validateProgress(withVersions()), [], 'the fixture agrees: Stack 6 is best, since 08:00Z both');
  const stale = withVersions(); stale.build.since = '2026-10-01T09:00:00Z';
  const e = P.validateProgress(stale);
  assert.equal(e.length, 1, e.join('\n'));
  assert.match(e[0], /^build\.since: 2026-10-01T09:00:00Z, but the version with "best": true \(versions\[1\], "st6-rb"\) is since 2026-10-02T08:00:00Z;/);
  assert.match(e[0], /progress best <versionId>/, 'it says how to move both');
  // the same instant written another way is the same time
  const ms = withVersions(); ms.build.since = '2026-10-02T08:00:00.000Z';
  assert.deepEqual(P.validateProgress(ms), []);
  // no best version, or no build: nothing to compare
  const none = withVersions(); delete none.versions[1].best; none.build.since = '2026-10-01T09:00:00Z';
  assert.deepEqual(P.validateProgress(none), []);
  const noBuild = withVersions(); delete noBuild.build;
  assert.deepEqual(P.validateProgress(noBuild), []);
  // T-103 as it happened: the best flag moved to the newer version, the build block stayed on the older one
  const moved = withVersions(); delete moved.versions[1].best; delete moved.versions[2].landed; moved.versions[2].best = true;
  assert.match(P.validateProgress(moved).join('\n'), /build\.since: 2026-10-02T08:00:00Z, but the version with "best": true \(versions\[2\], "gpu"\) is since 2026-10-03T08:00:00Z/);
});

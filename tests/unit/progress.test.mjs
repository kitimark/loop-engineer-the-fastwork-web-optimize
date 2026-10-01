// tools/lib/progress.mjs (ts-progress): the user's fix-progress page model. Schema validation of the curated
// fixes/PROGRESS.json (also the committed file itself, so a bad edit fails `npm run test:unit`), the ledger read,
// the view (new-result flags, grouping, staleness) and its text form, and Hard rule 12: no URL, LAN address,
// e-mail, device id or home path ever reaches the output, also when a console step, a lock holder or an incident
// carries one. Every test uses its own $FW_STATE_DIR. Example addresses are private-range or .invalid; none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
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

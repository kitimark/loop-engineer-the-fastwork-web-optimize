// tools/lib/status.mjs (ts-status-board): the status board's store, validation, derived waits, staleness, sort,
// text and seed. Hard rule 12: personal data is refused on write and scrubbed on read (lock owners, step titles,
// incident titles). Every test uses its own $FW_STATE_DIR (never the live .git/fastwork-mirror/, I-041). Example
// addresses are private-range or .invalid; none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const S = await import('../../tools/lib/status.mjs');
const L = await import('../../tools/lib/lock.mjs');
const C = await import('../../tools/lib/console.mjs');
const I = await import('../../tools/lib/incident.mjs');
const P = await import('../../tools/lib/progress.mjs');

let state;
beforeEach(() => { state = tempDir('fw-status-'); process.env.FW_STATE_DIR = state; delete process.env.FW_STATUS_STALE_MIN; });

const LAN = 'http://192.168.77.12:5497/';
const add = (id, extra = {}) => S.set(id, { by: 'fix-a', kind: 'fix', title: `Item ${id}`, ...extra });

test('parseWaiting: kinds, targets, texts, none; bad input refused', () => {
  assert.equal(S.parseWaiting('none'), null);
  assert.equal(S.parseWaiting(''), null);
  assert.deepEqual(S.parseWaiting('lead:land request'), { kind: 'lead', text: 'land request' });
  assert.deepEqual(S.parseWaiting('chrome'), { kind: 'chrome' });
  assert.deepEqual(S.parseWaiting('agent:fix-nav-morph:the y answer: soon'), { kind: 'agent', target: 'fix-nav-morph', text: 'the y answer: soon' });
  assert.deepEqual(S.parseWaiting('incident:42'), { kind: 'incident', target: 'I-042' });
  assert.deepEqual(S.parseWaiting('review'), { kind: 'review' });
  assert.deepEqual(S.parseWaiting('review:review-cdwc'), { kind: 'review', target: 'review-cdwc' });
  assert.deepEqual(S.parseWaiting('item:st5'), { kind: 'item', target: 'st5' });
  assert.throws(() => S.parseWaiting('agent'), /needs a target/);
  assert.throws(() => S.parseWaiting('incident:soon'), /bad incident/);
  assert.throws(() => S.parseWaiting('coffee'), /kind one of/);
  assert.throws(() => S.parseWaiting('other'), /needs a text/);
  assert.throws(() => S.parseWaiting(`other:open ${LAN}`), /contains a url.*Hard rule 12/);
  assert.equal(S.waitingPlain({ kind: 'lead', text: 'land request' }), 'the lead: land request');
  assert.equal(S.waitingPlain({ kind: 'review', target: 'review-x' }), 'a review by review-x');
  assert.equal(S.waitingPlain({ kind: 'other', text: 'Xcode setup' }), 'Xcode setup');
});

test('set: creates on first use (needs --kind/--title), records history and stateSince; refuses bad input', async () => {
  await assert.rejects(S.set('st5', { by: 'fix-a', state: 'measuring' }), /give --kind .* and --title/);
  await assert.rejects(S.set('Bad Id', { by: 'fix-a', kind: 'fix', title: 't' }), /bad status id/);
  await assert.rejects(add('st5', { by: undefined }), /bad --by/);
  await assert.rejects(add('st5', { state: 'thinking' }), /bad --state/);
  await assert.rejects(add('st5', { kind: 'misc' }), /bad --kind/);
  const r = await add('st5', { state: 'implementing', note: 'building st5', progress: 'hero-carousel', refs: 'P-039,I-042', aliases: 'scroll-engine' });
  assert.equal(r.created, true);
  const it = S.get('st5');
  assert.equal(it.schema, 'fw-status/1');
  assert.equal(it.owner, 'fix-a');
  assert.equal(it.state, 'implementing');
  assert.equal(it.priority, null);
  assert.deepEqual(it.refs, ['P-039', 'I-042']);
  assert.deepEqual(it.aliases, ['scroll-engine']);
  assert.equal(it.history[0].action, 'created');
  assert.deepEqual(readdirSync(join(state, 'status')), ['st5.json']);
  const since = it.stateSince;
  await new Promise((res) => setTimeout(res, 5));
  await S.set('st5', { by: 'fix-a', note: 'half built' });
  assert.equal(S.get('st5').stateSince, since, 'a note does not move stateSince');
  const r2 = await S.set('st5', { by: 'mgmt-ops-6', state: 'measuring' });
  assert.equal(r2.prevState, 'implementing');
  const it2 = S.get('st5');
  assert.notEqual(it2.stateSince, since);
  assert.equal(it2.updatedBy, 'mgmt-ops-6');
  assert.equal(it2.note, 'half built', 'the note stays until replaced');
  assert.deepEqual(it2.history.map((h) => h.action), ['created', 'set', 'set']);
  await assert.rejects(S.set('st5', { by: 'fix-a', state: 'measuring' }), /nothing changed/);
});

test('set: waits are replaced on a state change, kept on a note update; waiting needs one; ready-to-land defaults to the lead', async () => {
  await add('w', { state: 'measuring', waitingOn: 'chrome:A/B of st5' });
  assert.deepEqual(S.get('w').waitingOn, { kind: 'chrome', text: 'A/B of st5' });
  await S.set('w', { by: 'fix-a', note: 'still queued' });
  assert.equal(S.get('w').waitingOn.kind, 'chrome', 'kept without --state');
  await S.set('w', { by: 'fix-a', state: 'implementing' });
  assert.equal(S.get('w').waitingOn, null, 'a state change without --waiting-on clears it');
  await assert.rejects(S.set('w', { by: 'fix-a', state: 'waiting' }), /needs --waiting-on/);
  await S.set('w', { by: 'fix-a', state: 'waiting', waitingOn: 'agent:fix-nav-morph' });
  await assert.rejects(S.set('w', { by: 'fix-a', waitingOn: 'none' }), /needs --waiting-on/, 'waiting cannot lose its wait');
  await S.set('w', { by: 'fix-a', state: 'ready-to-land' });
  assert.deepEqual(S.get('w').waitingOn, { kind: 'lead', text: 'land request' });
  await S.set('w', { by: 'fix-a', state: 'landed' });
  assert.equal(S.get('w').waitingOn, null);
});

test('set: history keeps the last 100 entries', async () => {
  await add('h');
  for (let i = 0; i < 105; i++) await S.set('h', { by: 'fix-a', note: `n${i}` });
  const it = S.get('h');
  assert.equal(it.history.length, 100);
  assert.equal(it.history.at(-1).changes.note, 'n104');
});

test('Hard rule 12: a URL, LAN address, e-mail, device id or home path is refused in every text field', async () => {
  const bad = [`see ${LAN}`, 'host 192.168.77.12', 'mail x@example.invalid', 'udid 00008130-001A2B3C4D5E6F70', 'in /Users/someone/x', 'at studio.local'];
  for (const b of bad) {
    await assert.rejects(add('p', { note: b }), /Hard rule 12/, b);
    await assert.rejects(add('p', { title: b }), /Hard rule 12/, b);
  }
  await assert.rejects(add('p', { waitingOn: `user:open ${LAN}`, state: 'waiting' }), /Hard rule 12/);
  await assert.rejects(add('p', { next: `ssh 192.168.77.12` }), /Hard rule 12/);
  assert.throws(() => S.get('p'), /no status item/);
});

test('priority: only --by lead; 1..99 or none; recorded in history', async () => {
  await add('a');
  await assert.rejects(S.setPriority('a', 1, { by: 'fix-a' }), /only the lead sets priority/);
  await assert.rejects(S.setPriority('a', 1, { by: 'mgmt-ops-6' }), /only the lead/);
  await assert.rejects(S.setPriority('a', 0, { by: 'lead' }), /bad priority/);
  await assert.rejects(S.setPriority('a', '100', { by: 'lead' }), /bad priority/);
  await assert.rejects(S.setPriority('nope', 1, { by: 'lead' }), /no status item/);
  await S.setPriority('a', '1', { by: 'lead', note: 'the user said so' });
  assert.equal(S.get('a').priority, 1);
  await S.setPriority('a', 'none', { by: 'lead' });
  const it = S.get('a');
  assert.equal(it.priority, null);
  assert.deepEqual(it.history.filter((h) => h.action === 'priority').map((h) => h.changes), [{ priority: 1, from: null }, { priority: null, from: 1 }]);
  await assert.rejects(S.set('a', { by: 'fix-a', priority: 3 }), /nothing changed/, 'set never takes a priority');
  assert.equal(S.get('a').priority, null);
});

test('derive: queue positions, holder, pending steps by the owner, blocking incidents, aliases; scrubbed', async () => {
  // chrome: holder-x holds, fix-b #1, fix-a #2; phone: fix-a holds (owner name with a LAN url must not leak)
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'holder-x', kind: 'lease', ttlSec: 600 })).ok, true);
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-b', kind: 'lease', ttlSec: 600 })).ok, false);
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-a', kind: 'lease', ttlSec: 600 })).ok, false);
  assert.equal((await L.tryAcquire('iphone', { owner: 'runner-alias', kind: 'lease', ttlSec: 600, meta: { url: LAN } })).ok, true);
  await C.post({ by: 'fix-a', kind: 'action', title: `Open ${LAN} on the phone`, url: LAN });
  await C.post({ by: 'someone-else', kind: 'question', title: 'Other?', yesno: true });
  await I.open({ by: 'fix-a', title: `WDA slow at ${LAN}`, error: 'boom one', blocking: true });
  await I.open({ by: 'fix-a', title: 'not blocking', error: 'boom two', blocking: false });
  await I.open({ by: 'fix-z', title: 'others', error: 'boom three', blocking: true });
  await add('a', { aliases: 'runner-alias', state: 'measuring' });
  const live = await P.gatherLive();
  const d = S.derive(S.get('a'), live);
  const kinds = d.derived.map((x) => x.kind);
  assert.deepEqual(kinds, ['chrome', 'using', 'user', 'incident']);
  assert.equal(d.derived[0].plain, 'in line for Chrome, #2 of 2');
  assert.equal(d.derived[1].plain, 'on the phone now');
  assert.match(d.derived[2].plain, /^waiting on you: C-001 Open <link> on the phone$/);
  assert.match(d.derived[3].plain, /^blocked by I-001: WDA slow at <link>$/);
  assert.equal(d.liveWait, true);
  const json = JSON.stringify(S.buildStatusView({ items: S.list(), live }));
  for (const bad of ['192.168', 'http://']) assert.ok(!json.includes(bad), `${bad} leaked`);
  // an item nobody queued for: nothing derived
  await S.set('b', { by: 'fix-q', kind: 'tool', title: 'B' });
  assert.deepEqual(S.derive(S.get('b'), live).derived, []);
});

test('I-044: the owner drops a derived incident link with --unlink; a later --waiting-on incident re-links it; none clears', async () => {
  // iphone-runner reported I-001 (blocking) and I-002 (blocking); the phone-queue row runs something unrelated to I-001
  const i1 = (await I.open({ by: 'iphone-runner', title: 'WDA slow', error: 'wda timeout', blocking: true })).incident.id;
  const i2 = (await I.open({ by: 'iphone-runner', title: 'proxy down', error: 'proxy refused', blocking: true })).incident.id;
  await S.set('phone-queue', { by: 'iphone-runner', kind: 'phone', title: 'Phone blocks', state: 'measuring' });
  const live = await P.gatherLive();
  const incs = (id) => S.derive(S.get(id), live).derived.filter((d) => d.kind === 'incident').map((d) => d.ref);
  assert.deepEqual(incs('phone-queue'), [i1, i2]);
  // an unlink alone is a change (no "nothing changed"), kept across later transitions
  const r = await S.set('phone-queue', { by: 'iphone-runner', unlink: `incident:${i1}` });
  assert.deepEqual(r.item.unlinked, [i1]);
  assert.deepEqual(incs('phone-queue'), [i2]);
  await S.set('phone-queue', { by: 'iphone-runner', state: 'researching', note: 'attribution runs' });
  assert.deepEqual(incs('phone-queue'), [i2], 'a state change keeps the unlink');
  assert.deepEqual(S.get('phone-queue').history.at(-2).changes, { unlinked: [i1] });
  await S.set('phone-queue', { by: 'iphone-runner', unlink: i2 });   // bare id works too; lists accumulate
  assert.deepEqual(S.get('phone-queue').unlinked, [i1, i2]);
  assert.deepEqual(incs('phone-queue'), []);
  assert.deepEqual(S.itemView(S.get('phone-queue'), { live }).unlinked, [i1, i2]);
  // waiting on it explicitly re-links it
  await S.set('phone-queue', { by: 'iphone-runner', state: 'waiting', waitingOn: `incident:${i1}` });
  assert.deepEqual(S.get('phone-queue').unlinked, [i2]);
  assert.deepEqual(incs('phone-queue'), [i1]);
  await S.set('phone-queue', { by: 'iphone-runner', unlink: 'none' });
  assert.equal(S.get('phone-queue').unlinked, undefined);
  assert.deepEqual(incs('phone-queue'), [i1, i2]);
  await assert.rejects(S.set('phone-queue', { by: 'iphone-runner', unlink: 'chrome' }), /bad --unlink "chrome"/);
  await assert.rejects(S.set('phone-queue', { by: 'iphone-runner', unlink: 'none' }), /nothing changed/);
});

test('derive: a self-reported wait that is over is flagged (resolved incident, finished or unknown item)', async () => {
  const inc = (await I.open({ by: 'x', title: 'gone soon', error: 'e1' })).incident;
  await add('dep', { state: 'landed' });
  await add('w1', { state: 'waiting', waitingOn: `incident:${inc.id}` });
  await add('w2', { state: 'waiting', waitingOn: 'item:dep' });
  await add('w3', { state: 'waiting', waitingOn: 'item:nowhere' });
  let live = await P.gatherLive();
  const byId = new Map(S.list().map((i) => [i.id, i]));
  assert.deepEqual(S.derive(S.get('w1'), live, byId).flags, []);
  assert.match(S.derive(S.get('w2'), live, byId).flags[0], /waits on dep, which is landed: update\?/);
  assert.match(S.derive(S.get('w3'), live, byId).flags[0], /not on the board/);
  await I.update(inc.id, { by: 'lead', status: 'parked' });
  live = await P.gatherLive();
  assert.match(S.derive(S.get('w1'), live, byId).flags[0], /I-001, which is no longer open/);
});

test('view: stale after 2 h without an update unless a live wait; finished/parked never; sort by priority, group, recency', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const mk = (id, state, min, extra = {}) => ({ id, title: id, kind: 'fix', owner: `o-${id}`, state, stateSince: at(min), updatedAt: at(min), priority: null, waitingOn: null, ...extra });
  const items = [
    mk('old-working', 'implementing', 121),
    mk('fresh', 'researching', 119),
    mk('old-queued-chrome', 'measuring', 300),
    mk('old-parked', 'parked', 600),
    mk('old-done', 'done', 600),
    mk('old-waiting', 'waiting', 130, { waitingOn: { kind: 'lead' } }),
    mk('top', 'waiting', 5, { priority: 1, waitingOn: { kind: 'user', text: 'swipe' } }),
    mk('second', 'landed', 5, { priority: 2 }),
  ];
  const live = { locks: { 'chrome-measure': { holder: null, queue: [{ owner: 'o-old-queued-chrome' }] } }, incidents: [], steps: [] };
  const v = S.buildStatusView({ items, live, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by['old-working'].stale, true);
  assert.equal(by.fresh.stale, false);
  assert.equal(by['old-queued-chrome'].stale, false, 'in the Chrome queue: a live wait, not stale');
  assert.equal(by['old-parked'].stale, false);
  assert.equal(by['old-done'].stale, false);
  assert.equal(by['old-waiting'].stale, true);
  assert.equal(by.top.waitingOnYou, true);
  assert.equal(by['old-working'].stateForMin, 121);
  assert.deepEqual(v.items.map((x) => x.id), ['top', 'second', 'fresh', 'old-working', 'old-queued-chrome', 'old-waiting', 'old-parked', 'old-done']);
  assert.deepEqual({ w: v.counts.working, wa: v.counts.waiting, p: v.counts.parked, f: v.counts.finished, s: v.counts.stale, y: v.counts.waitingOnYou }, { w: 3, wa: 2, p: 1, f: 2, s: 2, y: 1 });
  process.env.FW_STATUS_STALE_MIN = '600';
  assert.equal(S.buildStatusView({ items, live, now }).items.find((x) => x.id === 'old-working').stale, false);
});

test('renderText: plain board, waiting-on-you first, finished hidden unless --all', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const items = [
    { id: 'style-recalc', title: 'Style recalculation', kind: 'fix', owner: 'de-style-recalc', state: 'researching', stateSince: '2026-10-02T11:20:00Z', updatedAt: '2026-10-02T11:48:00Z', priority: 1, note: 'tracing', next: 'Timeline block', progress: 'style-recalc' },
    { id: 'ts-x', title: 'Tool X', kind: 'tool', owner: 'ts-x', state: 'waiting', stateSince: '2026-10-02T11:50:00Z', updatedAt: '2026-10-02T11:50:00Z', priority: null, waitingOn: { kind: 'user', text: 'yes/no on the menu' } },
    { id: 'gone', title: 'Gone', kind: 'review', owner: 'r', state: 'done', updatedAt: '2026-10-02T10:00:00Z', priority: null },
  ];
  const v = S.buildStatusView({ items, live: {}, now });
  const t = S.renderText(v);
  assert.match(t, /^STATUS BOARD {2}\(live 12:00Z; 1 working, 1 waiting, 1 waiting on you; stale after 2 h 0 min/);
  assert.match(t, /WAITING ON YOU\n {2}ts-x: you: yes\/no on the menu/);
  assert.match(t, /#1 {2}style-recalc {2}\[Fix\] Style recalculation\n {6}researching for 40 min: finding out where and why it is slow; owner de-style-recalc; updated 12 min ago/);
  assert.match(t, /note: tracing\n {6}next: Timeline block\n {6}progress item: style-recalc/);
  assert.ok(!t.includes('Gone'));
  assert.match(t, /\(1 finished; --all shows them\)/);
  assert.match(S.renderText(v, { all: true }), /–   gone {2}\[Review\] Gone/);
  assert.equal(S.forText(0), 'under a minute');
  assert.equal(S.forText(135), '2 h 15 min');
  assert.equal(S.STATES.coordinating.group, 'working', 'ops items coordinate');
});

test('seedPlan/applySeed: active PROGRESS items + a seed file; dry run writes nothing; existing ids skipped; no priority', async () => {
  const progress = { items: [
    { id: 'cdwc', title: 'Countdown fix', state: 'testing', stage: 'V', owner: 'fix-nav-morph' },
    { id: 'hero-carousel', title: 'Avatar carousel', state: 'testing', stage: 'F', owner: 'fix-scroll-engine with de-pm-hero' },
    { id: 'style-recalc', title: 'Style recalc', state: 'diagnosing', stage: 'R', owner: 'de-style-recalc' },
    { id: 'wave1-base', title: 'Wave 1', state: 'base', stage: 'L', owner: 'lead' },
    { id: 'lc-cq3', title: 'Dropped', state: 'dropped', stage: 'F' },
  ] };
  const seed = { schema: 'fw-status-seed/1', items: [
    { id: 'ts-status-board', kind: 'tool', title: 'Status board', owner: 'ts-status-board', state: 'implementing' },
    { id: 'style-recalc', note: 'Timeline block on the phone' },
  ] };
  const plan = S.seedPlan({ progress, seed });
  assert.deepEqual(plan.map((p) => p.id), ['cdwc', 'hero-carousel', 'style-recalc', 'ts-status-board']);
  const by = Object.fromEntries(plan.map((p) => [p.id, p]));
  assert.equal(by.cdwc.state, 'waiting'); assert.equal(by.cdwc.waitingOn, 'review');
  assert.equal(by['hero-carousel'].state, 'measuring'); assert.equal(by['hero-carousel'].owner, 'fix-scroll-engine');
  assert.equal(by['style-recalc'].state, 'researching'); assert.equal(by['style-recalc'].note, 'Timeline block on the phone'); assert.equal(by['style-recalc'].progress, 'style-recalc');
  const dry = await S.applySeed(plan, { by: 'lead' });
  assert.deepEqual(dry.map((r) => r.action), ['would-add', 'would-add', 'would-add', 'would-add']);
  assert.deepEqual(S.list(), []);
  await add('cdwc');
  const res = await S.applySeed(plan, { by: 'lead', apply: true });
  assert.deepEqual(res.map((r) => r.action), ['exists', 'added', 'added', 'added']);
  assert.equal(S.get('hero-carousel').createdBy, 'lead');
  assert.equal(S.get('hero-carousel').owner, 'fix-scroll-engine');
  assert.equal(S.get('style-recalc').priority, null);
  assert.throws(() => S.seedPlan({ seed: { schema: 'fw-status-seed/1', items: [{ id: 'x', priority: 1 }] } }), /no priority in a seed/);
  assert.throws(() => S.seedPlan({ seed: { schema: 'nope', items: [] } }), /schema/);
  const bad = await S.applySeed([{ id: 'leaky', kind: 'tool', title: `see ${LAN}` }], { by: 'lead' });
  assert.equal(bad[0].action, 'error');
  assert.match(bad[0].error, /Hard rule 12/);
});

test('progressLinks: a PROGRESS item id maps to its workstream\'s live state', () => {
  const v = S.buildStatusView({ items: [{ id: 'st5', title: 'st5', kind: 'fix', owner: 'fix-a', state: 'measuring', progress: 'hero-carousel', updatedAt: new Date().toISOString(), waitingOn: { kind: 'chrome' } }], live: {} });
  const m = S.progressLinks(v);
  assert.deepEqual(m.get('hero-carousel'), { id: 'st5', state: 'measuring', plain: 'measuring it on Chrome or the phone', stale: false, waits: ['waiting on the Chrome slot'] });
});

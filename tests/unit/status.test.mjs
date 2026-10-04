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
// T-124: set() reads fixes/PROGRESS.json (a landed item refuses parked/researching): never the repo's file here
beforeEach(() => { state = tempDir('fw-status-'); process.env.FW_STATE_DIR = state; process.env.FW_PROGRESS_FILE = join(state, 'no-progress.json'); delete process.env.FW_STATUS_STALE_MIN; });

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

test('I-183 derive: an incident that affects only the lead is not "blocked by" on a row the lead owns; workers still are', async () => {
  const mk = (affected, reportedBy) => ({ id: 'I-009', title: 'lead listener', blocking: true, reportedBy, affected: affected.map((by) => ({ by })) });
  await add('lr', { by: 'lead', state: 'testing' });   // a row the lead merely owns
  await add('wr', { by: 'fix-w', state: 'testing' });  // a worker's row
  const blocked = (id, inc) => S.derive(S.get(id), { locks: {}, steps: [], incidents: [inc] }).derived.filter((x) => x.kind === 'incident').map((x) => x.ref);
  assert.deepEqual(blocked('lr', mk(['lead'], 'lead')), [], 'reported by and affecting only the lead');
  assert.deepEqual(blocked('wr', mk(['lead'], 'lead')), [], 'a worker row is not blocked by it either');
  assert.deepEqual(blocked('lr', mk(['lead', 'fix-w'], 'fix-w')), [], 'the lead owns the row, a worker is the one affected');
  assert.deepEqual(blocked('wr', mk(['lead', 'fix-w'], 'lead')), ['I-009'], 'a worker affected next to the lead is still blocked');
  assert.deepEqual(blocked('wr', mk([], 'fix-w')), ['I-009'], 'the reporting worker is still blocked');
});

test('I-048 derive: every reader of a shared Chrome group is "using Chrome now (shared)"; an exclusive holder and a free lock as before', async () => {
  // a fake lock.status('chrome-measure'): 2 readers (w2 + w1 of cap 3), joins closed by the exclusive waiter fix-c
  const group = {
    resource: 'chrome-measure', stale: null, sharedLane: { enabled: true, cap: 3 },
    holder: { owner: '(shared)', kind: 'lease', token: 'g9g9g9g9g9g9', shared: true, format: 'rw1', acquiredAt: '2026-10-01T17:01:00Z', expiresAt: '2026-10-01T17:07:10Z',
      readers: [
        { owner: 'fix-a', token: 'a1a1a1a1a1a1', kind: 'process', pid: 424242, weight: 2, acquiredAt: '2026-10-01T17:01:00Z', deadline: '2026-10-01T17:06:05Z', meta: { url: LAN } },
        { owner: 'runner-alias', token: 'b2b2b2b2b2b2', kind: 'lease', weight: 1, acquiredAt: '2026-10-01T17:03:00Z', deadline: '2026-10-01T17:07:00Z' },
      ] },
    queue: [{ owner: 'fix-d', shared: true, weight: 1 }, { owner: 'fix-c', kind: 'process', pid: 616161 }],
  };
  await add('a', { state: 'testing' });                                         // owner fix-a: a reader
  await add('b', { by: 'fix-b', aliases: 'runner-alias', state: 'testing' });  // matched by its alias
  await add('fix-d', { by: 'someone', state: 'testing' });                     // matched by its id: a waiting reader
  await add('c', { by: 'fix-c', state: 'measuring' });                         // the exclusive waiter
  const live = { locks: { 'chrome-measure': group }, incidents: [], steps: [] };
  const plains = (id) => S.derive(S.get(id), live).derived.map((x) => x.plain);
  assert.deepEqual(plains('a'), ['using Chrome now (shared)']);
  assert.deepEqual(plains('b'), ['using Chrome now (shared)']);
  assert.deepEqual(plains('fix-d'), ['in line for Chrome, #1 of 2']);
  assert.deepEqual(plains('c'), ['in line for Chrome, #2 of 2']);
  // the group's own owner "(shared)" is nobody's: a row with that name (not a valid agent name) gets nothing
  assert.deepEqual(S.derive({ id: 'x', owner: '(shared)' }, live).derived, []);
  const d = S.derive(S.get('a'), live);
  assert.deepEqual(d.derived[0], { kind: 'using', resource: 'chrome', shared: true, plain: 'using Chrome now (shared)' });
  assert.equal(d.liveWait, true, 'a shared reader is a live wait: never stale');
  const json = JSON.stringify(S.buildStatusView({ items: S.list(), live }));
  for (const bad of ['192.168', 'a1a1a1', 'g9g9g9', '424242']) assert.ok(!json.includes(bad), `${bad} leaked`);
  // an exclusive holder: as before
  const excl = { locks: { 'chrome-measure': { resource: 'chrome-measure', stale: null, holder: { owner: 'fix-a', kind: 'lease', acquiredAt: '2026-10-01T17:05:00Z' }, queue: [] } }, incidents: [], steps: [] };
  assert.deepEqual(S.derive(S.get('a'), excl).derived, [{ kind: 'using', resource: 'chrome', plain: 'using Chrome now' }]);
  assert.deepEqual(S.derive(S.get('b'), excl).derived, []);
  // a free lock: nothing
  assert.deepEqual(S.derive(S.get('a'), { locks: { 'chrome-measure': { holder: null, queue: [] } } }).derived, []);
  // the real store: a lease reader in a real group (lane on) is using Chrome now (shared)
  await L.setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'test' });
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'fix-a', kind: 'lease', shared: true, weight: 2, maxSec: 120, load1: 0, ncpu: 8 })).ok, true);
  assert.equal((await L.tryAcquire('chrome-measure', { owner: 'runner-alias', kind: 'lease', shared: true, weight: 1, maxSec: 120, load1: 0, ncpu: 8 })).ok, true);
  const real = await P.gatherLive();
  assert.deepEqual(S.derive(S.get('a'), real).derived.map((x) => x.plain), ['using Chrome now (shared)']);
  assert.deepEqual(S.derive(S.get('b'), real).derived.map((x) => x.plain), ['using Chrome now (shared)']);
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

test('view: stale after 45 min (I-108; was 2 h) without an update unless a live wait; finished/parked never; sort by priority, group, recency', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const mk = (id, state, min, extra = {}) => ({ id, title: id, kind: 'fix', owner: `o-${id}`, state, stateSince: at(min), updatedAt: at(min), priority: null, waitingOn: null, ...extra });
  const items = [
    mk('old-working', 'implementing', 121),
    mk('fresh', 'researching', 44),
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
  assert.match(t, /^STATUS BOARD {2}\(live 12:00Z; 1 working, 1 waiting, 1 waiting on you; stale after 45 min/);
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

test('user T-044: a waiting row names its reason in its state line ("waiting for: …", "waiting (reason not given)"); the board text and the views carry it', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const mk = (id, state, waitingOn = null) => ({ id, title: id, kind: 'fix', owner: `o-${id}`, state, stateSince: '2026-10-02T11:50:00Z', updatedAt: '2026-10-02T11:50:00Z', priority: null, waitingOn });
  const items = [
    mk('on-agent', 'waiting', { kind: 'agent', target: 'fix-nav-morph', text: 'the morph patch' }),
    mk('on-user', 'waiting', { kind: 'user', text: 'yes/no on the menu' }),
    mk('legacy', 'waiting'), // a row from before `waiting` needed --waiting-on
    mk('ready', 'ready-to-land', { kind: 'lead', text: 'land request' }),
    mk('busy', 'implementing', { kind: 'chrome', text: 'A/B of st5' }),
  ];
  const v = S.buildStatusView({ items, live: {}, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by['on-agent'].statePlain, 'waiting for: fix-nav-morph: the morph patch');
  assert.equal(by['on-user'].statePlain, 'waiting for: you: yes/no on the menu');
  assert.equal(by.legacy.statePlain, 'waiting (reason not given)');
  assert.equal(by.ready.statePlain, 'finished; waiting for the lead to land it', 'other states keep their words');
  assert.equal(by.busy.statePlain, 'building the change');
  assert.ok(!JSON.stringify(v).includes('something else happens'), 'the vague words are gone, the legend too');
  assert.match(S.renderText(v), /on-agent {2}\[Fix\] on-agent\n {6}waiting for 10 min: waiting for: fix-nav-morph: the morph patch; owner o-on-agent/);
  assert.match(S.renderText(v), /waiting for 10 min: waiting \(reason not given\); owner o-legacy/);
  assert.equal(S.statePlain('measuring'), 'measuring it on Chrome or the phone');
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
  assert.deepEqual(m.get('hero-carousel'), { id: 'st5', state: 'measuring', plain: 'measuring it on Chrome or the phone', stale: false, priority: null, waits: ['waiting on the Chrome slot'] });
  // T-112: the lead's priority rides along, so /progress can sort by it
  const r = S.buildStatusView({ items: [{ id: 'st6', title: 'st6', kind: 'fix', owner: 'fix-a', state: 'measuring', priority: 2, progress: 'hero-x', updatedAt: new Date().toISOString() }], live: {} });
  assert.equal(S.progressLinks(r).get('hero-x').priority, 2);
});

// I-108 (user T-060 #3 "a lot of out dated status"; audit T-060 #6). (1) A plain thread-wait listener is not a wait on
// the user: it reads "listening for console messages", never "waiting for a user reply", and the row keeps the owner's
// own state and --waiting-on. (2) WAITING ON YOU: only --waiting-on user, or an open console step / proposal the owner
// posted. A listener's "a user reply …" record, old (no marker) or new, is neither.
test('I-108: a thread listener never reads as "waiting for a user reply" or waiting on you; steps and open proposals do', () => {
  const now = Date.parse('2026-10-04T04:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const mk = (id, owner, state, extra = {}) => ({ id, title: `Row ${id}`, kind: 'fix', owner, state, stateSince: at(10), updatedAt: at(10), priority: null, waitingOn: null, progress: id, ...extra });
  const items = [
    mk('lis', 'fix-l', 'implementing'),
    mk('lis-lead', 'fix-ll', 'waiting', { waitingOn: { kind: 'lead', text: 'land request' } }),
    mk('old-marker', 'fix-o', 'testing'),
    mk('asked', 'fix-q', 'waiting', { waitingOn: { kind: 'other', text: 'the yes/no in T-031' } }),
    mk('step', 'fix-s', 'measuring'),
    mk('prop', 'fix-p', 'waiting', { waitingOn: { kind: 'other', text: 'PR-009 decision' } }),
  ];
  const w = (id, owner, tool, what, extra = {}) => ({ schema: 'fw-wait/1', id, owner, tool, what, since: at(5), timeoutSec: 3600, pid: 1, ...extra });
  const waits = [
    w('1-a', 'fix-l', 'console.mjs thread wait', 'messages in its console threads or a proposal decision', { listener: true }),
    w('2-b', 'fix-ll', 'console.mjs thread wait', 'messages in its console threads or a proposal decision', { listener: true }),
    w('3-c', 'fix-o', 'console.mjs thread wait', 'a user reply in a console thread or a proposal decision'), // a record from before I-108
    w('4-d', 'fix-q', 'console.mjs thread wait', 'a user reply in T-031'), // waits on one thread: a real wait, still not "on you"
  ];
  const live = {
    waits, incidents: [],
    steps: [{ id: 'C-007', by: 'fix-s', title: 'Swipe the menu', status: 'pending' }],
    proposals: [{ id: 'PR-009', by: 'fix-p', title: 'Blur swap', state: 'proposed' }],
  };
  const v = S.buildStatusView({ items, live, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  for (const id of ['lis', 'lis-lead', 'old-marker']) {
    const r = by[id];
    assert.deepEqual(r.derived.map((d) => d.kind), ['listen'], `${id}: one listener line`);
    assert.match(r.derived[0].plain, /^listening for console messages since 03:55Z \(not waiting on anyone\)$/, id);
    assert.equal(r.waitingOnYou, false, `${id}: a listener is not waiting on you`);
    assert.equal(r.liveWait, false, `${id}: a listener is no live wait (it says nothing about the row being current)`);
  }
  assert.equal(by.lis.statePlain, 'building the change', 'the row keeps its own state');
  assert.equal(by['lis-lead'].statePlain, 'waiting for: the lead: land request', 'and its own --waiting-on');
  assert.equal(by.asked.derived[0].kind, 'wait');
  assert.match(by.asked.derived[0].plain, /^waiting for a user reply in T-031/);
  assert.equal(by.asked.waitingOnYou, false, 'a thread wait is not a step: WAITING ON YOU stays for steps, proposals and --waiting-on user');
  assert.equal(by.step.waitingOnYou, true);
  assert.equal(by.prop.waitingOnYou, true, 'an open proposal the owner posted waits on the user');
  assert.deepEqual(by.prop.derived.map((d) => [d.kind, d.ref, d.plain]), [['user', 'PR-009', 'waiting on you: PR-009 Blur swap (your decision)']]);
  assert.equal(v.counts.waitingOnYou, 2);
  const t = S.renderText(v);
  assert.ok(!/user reply in a console thread/.test(t), 'no listener reads as waiting for a user reply');
  assert.match(t, /WAITING ON YOU\n {2}step: waiting on you: C-007 Swipe the menu\n {2}prop: waiting on you: PR-009 Blur swap \(your decision\)\n\n/);
  // the progress page's views carry the row's own words, not the listener
  const links = S.progressLinks(v);
  assert.deepEqual(links.get('lis').waits, []);
  assert.deepEqual(links.get('lis-lead').waits, ['waiting on the lead: land request']);
  const ag = P.agentsView(v.items).agents.find((a) => a.owner === 'fix-l');
  assert.deepEqual(ag.waits, []);
  // no open proposal (decided, held): nothing waits on the user
  const v2 = S.buildStatusView({ items, live: { ...live, proposals: [] }, now });
  assert.equal(v2.items.find((x) => x.id === 'prop').waitingOnYou, false);
});

// I-108 (5): live data (queue places, lock holds, wait and listener lines, steps, proposals) attaches to the owner's
// ONE active row: the row its hold's --for or --doing names, else a row named by the record's own owner (a lock owner
// that is a topic id), else the owner's most recently updated working/waiting/not-started row. Never a parked or
// finished row; an owner with no active row goes to OTHER WAITS.
test('I-108: live data attaches to the owner\'s one active row (--for/--doing, else the newest), never to parked or finished rows', () => {
  const now = Date.parse('2026-10-04T04:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const mk = (id, owner, state, min) => ({ id, title: `Row ${id}`, kind: 'fix', owner, state, stateSince: at(min), updatedAt: at(min), priority: null, waitingOn: null });
  const items = [
    mk('m-old', 'fix-m', 'measuring', 30),
    mk('m-new', 'fix-m', 'testing', 5),
    mk('m-park', 'fix-m', 'parked', 1),
    mk('m-done', 'fix-m', 'done', 0),
    mk('p-park', 'fix-p', 'parked', 2),
    mk('topic-x', 'fix-t', 'measuring', 40),
    mk('t-other', 'fix-t', 'testing', 1),
  ];
  const lockSt = (holder, queue = []) => ({ holder, stale: null, queue });
  const live = {
    incidents: [],
    locks: {
      'chrome-measure': lockSt({ owner: 'fix-m', kind: 'process', meta: { job: { text: 'timing test', for: 'm-old' } } }, [{ owner: 'topic-x' }]),
      iphone: lockSt({ owner: 'fix-t', kind: 'lease', meta: { job: { text: 'finger check for t-other, part 2' } } }, [{ owner: 'fix-m' }, { owner: 'fix-p' }]),
    },
    steps: [{ id: 'C-009', by: 'fix-m', title: 'Swipe A/B', status: 'pending' }],
    waits: [
      { schema: 'fw-wait/1', id: '1-a', owner: 'fix-m', tool: 'wait.mjs phone-temp', what: 'the phone to cool', since: at(2), timeoutSec: 600, pid: 1 },
      { schema: 'fw-wait/1', id: '2-b', owner: 'fix-m', tool: 'console.mjs thread wait', what: 'messages', listener: true, since: at(2), timeoutSec: 3600, pid: 2 },
      { schema: 'fw-wait/1', id: '3-c', owner: 'fix-p', tool: 'lock.mjs wait', what: 'lock iphone free', since: at(1), timeoutSec: 600, pid: 3 },
    ],
  };
  const v = S.buildStatusView({ items, live, now });
  const kinds = (id) => v.items.find((x) => x.id === id).derived.map((d) => d.kind);
  assert.deepEqual(kinds('m-old'), ['using'], 'the hold\'s --for names m-old');
  assert.deepEqual(kinds('m-new'), ['phone', 'user', 'wait', 'listen'], 'the rest: the newest active row');
  assert.deepEqual(kinds('m-park'), [], 'never a parked row');
  assert.deepEqual(kinds('m-done'), [], 'never a finished row');
  assert.deepEqual(kinds('p-park'), [], 'a parked row, even as the owner\'s only one');
  assert.deepEqual(kinds('topic-x'), ['chrome'], 'a queue entry under a topic id goes to that row');
  assert.deepEqual(kinds('t-other'), ['using'], 'the --doing text names t-other');
  assert.equal(v.items.find((x) => x.id === 'm-new').derived[0].plain, 'in line for the phone, #1 of 2');
  assert.deepEqual(v.otherWaits.map((x) => x.owner), ['fix-p'], 'an owner with only a parked row: OTHER WAITS');
  assert.equal(v.counts.waitingOnYou, 1);
});

// I-108 (3): a row "may be out of date" (stale, with its reasons) when it was not updated for 45 min (no live wait),
// when its branch's work is already on main but the row is not landed/done, or when it waits on a step, proposal or
// thread that is already answered or decided. `status.mjs stale` lists them (staleText).
test('I-108: "may be out of date": 45 min without an update, work already on main, a wait on something answered or decided', () => {
  assert.equal(S.DEFAULT_STALE_MIN, 45);
  const now = Date.parse('2026-10-04T05:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
  const mk = (id, state, min, extra = {}) => ({ id, title: `Row ${id}`, kind: 'fix', owner: `o-${id}`, state, stateSince: at(min), updatedAt: at(min), priority: null, waitingOn: null, ...extra });
  const items = [
    mk('fresh', 'implementing', 44),
    mk('old', 'implementing', 46),
    mk('old-parked', 'parked', 300),
    mk('landed-rtl', 'ready-to-land', 5, { waitingOn: { kind: 'lead', text: 'land request' }, branch: { name: 'worktree-a', landHead: A } }),
    mk('landed-by-name', 'reviewing', 5, { branch: { name: 'worktree-b', landHead: B } }),
    // the lead's follow-up: a working or waiting row whose branch landed (notes, a phone ticket) is normal, no "landed?"
    mk('landed-waiting', 'waiting', 5, { waitingOn: { kind: 'phone' }, branch: { name: 'worktree-a', landHead: A } }),
    mk('landed-testing', 'testing', 5, { branch: { name: 'worktree-b', landHead: B } }),
    mk('landed-ops', 'coordinating', 5, { branch: { name: 'worktree-a', landHead: A } }), // an ongoing ops row (user T-075)
    mk('not-landed', 'testing', 5, { branch: { name: 'worktree-c', landHead: C } }),
    mk('no-commits', 'testing', 5, { branch: { name: 'worktree-d' } }),
    mk('done-landed', 'landed', 5, { branch: { name: 'worktree-a', landHead: A } }),
    mk('on-step', 'waiting', 5, { waitingOn: { kind: 'user', text: 'the swipe test C-004' } }),
    mk('on-step-open', 'waiting', 5, { waitingOn: { kind: 'user', text: 'the swipe test C-005' } }),
    mk('on-pr', 'waiting', 5, { waitingOn: { kind: 'other', text: 'PR-014 decision' } }),
    mk('on-thread', 'waiting', 5, { waitingOn: { kind: 'user', text: 'the yes/no in T-031' } }),
    mk('on-thread-asked', 'waiting', 5, { waitingOn: { kind: 'user', text: 'the yes/no in T-032' } }),
    mk('on-thread-old-reply', 'waiting', 5, { waitingOn: { kind: 'user', text: 'the yes/no in T-033' } }),
  ];
  const live = {
    refs: {
      steps: { 'C-004': 'answered', 'C-005': 'pending' },
      proposals: { 'PR-014': 'accepted' },
      threads: { 'T-031': { status: 'open', lastBy: 'user', lastAt: at(1) }, 'T-032': { status: 'open', lastBy: 'fix-x', lastAt: at(3) }, 'T-033': { status: 'open', lastBy: 'user', lastAt: at(20) } },
    },
    git: { mainShas: [A], merged: ['worktree-b', 'worktree-d'] },
  };
  const v = S.buildStatusView({ items, live, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  const why = (id) => by[id].staleWhy;
  assert.deepEqual(why('old'), ['not updated for 46 min']);
  // I-152 (PR-020 N9): a ready-to-land or reviewing row whose work is on main derives itself as landed (from git): it
  // is finished, not "may be out of date" (it used to say "...: landed?" and wait for the lead's write)
  for (const id of ['landed-rtl', 'landed-by-name']) {
    assert.equal(by[id].group, 'finished', id);
    assert.equal(by[id].stateText, 'landed on main (from git)', id);
    assert.equal(by[id].landedFromGit.branch, id === 'landed-rtl' ? 'worktree-a' : 'worktree-b');
  }
  assert.deepEqual(why('on-step'), ['it waits on C-004, which is already answered']);
  assert.deepEqual(why('on-pr'), ['it waits on PR-014, which is already decided (accepted)']);
  assert.deepEqual(why('on-thread'), ['it waits on T-031, where the user has already answered']);
  for (const id of ['fresh', 'old-parked', 'landed-rtl', 'landed-by-name', 'landed-waiting', 'landed-testing', 'landed-ops', 'not-landed', 'no-commits', 'done-landed', 'on-step-open', 'on-thread-asked', 'on-thread-old-reply']) {
    assert.equal(by[id].stale, false, id);
    assert.deepEqual(why(id), [], id);
  }
  for (const id of ['old', 'on-step', 'on-pr', 'on-thread']) assert.equal(by[id].stale, true, id);
  assert.equal(v.counts.stale, 4);
  const t = S.renderText(v);
  assert.match(t, /stale after 45 min without an update/);
  assert.match(t, /4 may be out of date/);
  assert.match(t, /\(MAY BE OUT OF DATE: it waits on PR-014, which is already decided \(accepted\)\)/);
  const st = S.staleText(v);
  assert.match(st, /^4 rows may be out of date \(stale after 45 min without an update\):\n/);
  assert.doesNotMatch(st, /landed-rtl/);
  assert.equal(S.staleText(S.buildStatusView({ items: [items[0]], live, now })), 'no row looks out of date (stale after 45 min without an update)');
  // no live sources (refs, git): nothing guessed
  const bare = S.buildStatusView({ items, live: {}, now });
  assert.deepEqual(bare.items.filter((x) => x.stale).map((x) => x.id), ['old']);
});

// I-108 (4): a waiting row's time counts from its last change of state OR of what it waits on, not from when it first
// started waiting; the owner's branch is recorded on its own sets only (the work the board checks against main).
test('I-108: wait time counts from the last change of the wait; set records the owner\'s branch (landHead only with commits of its own)', async () => {
  const now = Date.parse('2026-10-04T05:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const row = {
    id: 'w', title: 'W', kind: 'fix', owner: 'fix-w', state: 'waiting', stateSince: at(180), updatedAt: at(10), priority: null,
    waitingOn: { kind: 'agent', target: 'fix-x', text: 'the second patch' },
    history: [
      { at: at(180), by: 'fix-w', action: 'set', changes: { state: 'waiting', waitingOn: { kind: 'lead', text: 'land request' } } },
      { at: at(30), by: 'fix-w', action: 'set', changes: { note: 'still' } },
      { at: at(10), by: 'fix-w', action: 'set', changes: { waitingOn: { kind: 'agent', target: 'fix-x', text: 'the second patch' } } },
    ],
  };
  const v = S.itemView(row, { now });
  assert.equal(v.stateForMin, 10, 'a new --waiting-on restarts the wait time');
  assert.equal(S.itemView({ ...row, history: row.history.slice(0, 2) }, { now }).stateForMin, 180, 'a note does not');
  assert.equal(S.itemView({ ...row, state: 'measuring', stateSince: at(50) }, { now }).stateForMin, 50, 'a working row: its state time');

  const tip = 'd'.repeat(40);
  await S.set('br', { by: 'fix-br', kind: 'fix', title: 'Br', state: 'implementing', branch: { name: 'worktree-br', ahead: 0, head: tip } });
  assert.deepEqual(S.get('br').branch, { name: 'worktree-br' }, 'no commits of its own yet: no landHead');
  await S.set('br', { by: 'fix-br', state: 'ready-to-land', branch: { name: 'worktree-br', ahead: 2, head: tip } });
  assert.deepEqual(S.get('br').branch, { name: 'worktree-br', landHead: tip });
  await S.set('br', { by: 'mgmt-ops-1', note: 'nudged', branch: { name: 'worktree-ops', ahead: 1, head: 'e'.repeat(40) } });
  assert.deepEqual(S.get('br').branch, { name: 'worktree-br', landHead: tip }, 'someone else\'s set never records its own branch');
  await S.set('br', { by: 'fix-br', note: 'bad', branch: { name: 'x;rm -rf', ahead: 1, head: 'zz' } });
  assert.deepEqual(S.get('br').branch, { name: 'worktree-br', landHead: tip }, 'a bad branch name or sha is ignored');
});

// I-108 (3): the live sources behind "may be out of date": every step/proposal/thread id with its state (no text), and
// main's commits + the branches merged into it (read-only git, cached 20 s per checkout).
test('I-108: refsLive and gitLive feed the board the ids, states and main', async () => {
  const s1 = await C.post({ by: 'fix-a', kind: 'question', title: 'Yes?', yesno: true });
  const T = await import('../../tools/lib/console-threads.mjs');
  const { thread: t } = await T.createThread({ by: 'lead', title: 'Ask', text: 'one question', ask: true });
  const r = await P.refsLive();
  assert.equal(r.steps[s1.id], 'pending');
  assert.equal(r.threads[t.id].status, 'open');
  assert.equal(r.threads[t.id].lastBy, 'lead');
  assert.equal(typeof r.threads[t.id].lastAt, 'string');
  assert.deepEqual(r.proposals, {});

  const { git: g } = await import('../helpers.mjs');
  const d = tempDir('fw-status-git-');
  g(d, 'init', '-q', '-b', 'main');
  g(d, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one');
  g(d, 'branch', 'landed-b');
  g(d, 'checkout', '-q', '-b', 'open-b');
  g(d, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'two');
  const tip = g(d, 'rev-parse', 'HEAD');
  const live = P.gitLive(d, { maxAgeMs: 0 });
  assert.equal(live.mainShas.length, 1);
  assert.ok(live.merged.includes('main') && live.merged.includes('landed-b'));
  assert.ok(!live.merged.includes('open-b'));
  const row = { id: 'x', owner: 'fix-x', state: 'ready-to-land', branch: { name: 'open-b', landHead: tip } };
  assert.deepEqual(S.overFlags(row, { git: live }), []);
  g(d, 'checkout', '-q', 'main');
  g(d, 'merge', '-q', '--ff-only', 'open-b');
  assert.deepEqual(P.gitLive(d, { maxAgeMs: 60000 }), live, 'cached within maxAgeMs');
  assert.deepEqual(S.overFlags(row, { git: P.gitLive(d, { maxAgeMs: 0 }) }), ['its work is on main (branch open-b), but the row says ready-to-land: landed?']);
  assert.deepEqual(S.overFlags({ ...row, state: 'measuring' }, { git: P.gitLive(d, { maxAgeMs: 0 }) }), [], 'a working row with landed commits is normal');
  assert.throws(() => P.gitLive(tempDir('fw-status-nogit-'), { maxAgeMs: 0 }), /failed/);
});

// ---- I-104 (user T-057): links between Status rows and Progress items, both ways ----
const PROG = [
  { id: 'cd-roll-ca', title: 'Countdown roll', checks: [] },
  { id: 'f3-arm-scope', title: 'F3 arm scope', checks: [{ id: 'P-036' }, { id: 'P-071' }] },
  { id: 'cdwc', title: 'Countdown will-change', checks: [{ id: 'P-032' }], best: [{ ref: 'P-029' }] },
  { id: 'scene-scope', title: 'Scene scope', checks: [] },
  { id: 'hero-carousel', title: 'Hero carousel', checks: [] },
];

test('progressMatches (I-104): the owner\'s link, the same id, an alias, a P-id both name; only items that exist; none for the rest', () => {
  const m = (row) => S.progressMatches(row, PROG).map((x) => `${x.id} (${x.how})`);
  assert.deepEqual(m({ id: 'cd-roll-ca' }), ['cd-roll-ca (same id)'], 'no --progress set: the same id still links (T-057\'s row)');
  assert.deepEqual(m({ id: 'st5', progress: 'hero-carousel' }), ['hero-carousel (linked by its owner)']);
  assert.deepEqual(m({ id: 'style-recalc', aliases: ['scene-scope'] }), ['scene-scope (same topic)']);
  assert.deepEqual(m({ id: 'panel', refs: ['P-071', 'I-042'] }), ['f3-arm-scope (both name P-071)']);
  assert.deepEqual(m({ id: 'old', refs: ['P-029'] }), ['cdwc (both name P-029)'], 'a best[] ref counts too');
  assert.deepEqual(m({ id: 'cdwc', progress: 'cdwc', refs: ['P-032'] }), ['cdwc (linked by its owner)'], 'one link per item, the strongest reason');
  assert.deepEqual(m({ id: 'gone', progress: 'no-such-item' }), [], 'never a link to an item that is not there');
  assert.deepEqual(m({ id: 'ts-i104', owner: 'fix-nav-morph' }), [], 'no match, no link (an owner alone is not a match)');
  assert.deepEqual(S.progressMatches({ id: 'cd-roll-ca' }, null), [], 'progress unknown: no links');
  const two = S.progressMatches({ id: 'cdwc', refs: ['P-036'] }, PROG);
  assert.deepEqual(two.map((x) => x.id), ['cdwc', 'f3-arm-scope'], 'every matching item, strongest first');
  assert.deepEqual(two[0], { id: 'cdwc', title: 'Countdown will-change', how: 'same id' });
});

test('buildStatusView (I-104): each row carries its Progress items; progressLinks maps each item back to its best row, the others as "also"', () => {
  const now = Date.now(), at = new Date(now).toISOString();
  const row = (id, extra = {}) => ({ id, title: id, kind: 'fix', owner: 'fix-a', state: 'measuring', updatedAt: at, ...extra });
  const items = [row('cd-roll-ca'), row('panel', { refs: ['P-036'], priority: 1 }), row('f3-arm-scope', { state: 'waiting' }), row('lonely')];
  const v = S.buildStatusView({ items, live: {}, now, progress: PROG });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x.progressItems]));
  assert.deepEqual(by['cd-roll-ca'], [{ id: 'cd-roll-ca', title: 'Countdown roll', how: 'same id' }]);
  assert.deepEqual(by.panel.map((x) => x.id), ['f3-arm-scope']);
  assert.deepEqual(by.lonely, []);
  const links = S.progressLinks(v);
  assert.equal(links.get('cd-roll-ca').id, 'cd-roll-ca');
  assert.equal(links.get('f3-arm-scope').id, 'f3-arm-scope', 'the same id beats a shared P-id, even on a higher-priority row');
  assert.deepEqual(links.get('f3-arm-scope').also, [{ id: 'panel', title: 'panel' }]);
  assert.ok(!('also' in links.get('cd-roll-ca')), 'no "also" when one row links');
  assert.equal(links.has('cdwc'), false, 'no row, no link');
  // without the progress items: no links at all, never a guessed one
  const bare = S.buildStatusView({ items, live: {}, now });
  assert.ok(bare.items.every((x) => Array.isArray(x.progressItems) && x.progressItems.length === 0));
});

// ---- I-145 (PR-020 N1, user T-122): an event that ends a wait overrides the owner's older self-report ----
// The board kept "accent-ca: you: decision on PR-019" in WAITING ON YOU for 16 min after the user decided, because
// the row depended on the owner writing again. Now the decision (or an answered/skipped step, a closed or answered
// thread) ends the wait at read time; a wait on the user must name the id that can end it.
test('I-145: --waiting-on user needs a C-, PR- or T- id (with a hint); other kinds unchanged', async () => {
  assert.throws(() => S.parseWaiting('user'), /--waiting-on user needs the id of what the user answers.*user:"decision on PR-019".*other:"<what>"/);
  assert.throws(() => S.parseWaiting('user:yes or no on the menu'), /needs the id/);
  assert.throws(() => S.parseWaiting('user:PR19 soon'), /needs the id/);
  assert.deepEqual(S.parseWaiting('user:decision on PR-019'), { kind: 'user', text: 'decision on PR-019' });
  assert.deepEqual(S.parseWaiting('user:C-045'), { kind: 'user', text: 'C-045' });
  assert.deepEqual(S.parseWaiting('user:the yes/no in T-031'), { kind: 'user', text: 'the yes/no in T-031' });
  assert.throws(() => S.parseWaiting(`user:open ${LAN} PR-019`), /Hard rule 12/);
  await assert.rejects(add('u', { state: 'waiting', waitingOn: 'user' }), /needs the id/);
  assert.throws(() => S.get('u'), /no status item/, 'nothing written');
  await add('u', { state: 'waiting', waitingOn: 'user:decision on PR-019' });
  assert.deepEqual(S.get('u').waitingOn, { kind: 'user', text: 'decision on PR-019' });
  assert.deepEqual(S.parseWaiting('other:the user, some day'), { kind: 'other', text: 'the user, some day' }, 'no id needed outside user');
  // the seed checks the same
  const r = await S.applySeed([{ id: 'seeded', kind: 'tool', title: 'T', owner: 'ts-x', state: 'waiting', waitingOn: 'user:yes or no' }], { by: 'lead' });
  assert.equal(r[0].action, 'error');
  assert.match(r[0].error, /needs the id/);
});

test('I-145: a decided proposal, an answered or skipped step, a closed or answered thread end the wait on you at read time', () => {
  const now = Date.parse('2026-10-04T13:25:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const mk = (id, waitingOn, updMin = 30, extra = {}) => ({ id, title: `Row ${id}`, kind: 'fix', owner: `fix-${id}`, state: 'waiting', stateSince: at(updMin), updatedAt: at(updMin), priority: null, waitingOn, ...extra });
  const items = [
    mk('accent-ca', { kind: 'user', text: 'decision on PR-019' }),
    mk('pr-open', { kind: 'user', text: 'decision on PR-020' }),
    mk('step', { kind: 'user', text: 'swipe pair C-045' }),
    mk('skip', { kind: 'user', text: 'C-046' }),
    mk('two', { kind: 'user', text: 'C-045 and C-047' }),
    mk('thread-closed', { kind: 'user', text: 'yes/no in T-031' }),
    mk('thread-answered', { kind: 'user', text: 'yes/no in T-032' }),
    mk('thread-old', { kind: 'user', text: 'yes/no in T-033' }),
    mk('picked-up', { kind: 'user', text: 'decision on PR-019' }, 2, { stateSince: at(30) }),
    mk('legacy', { kind: 'user', text: 'yes or no on the menu' }),
    mk('withdrawn', { kind: 'other', text: 'PR-021 decision' }),
    mk('agent-pr', { kind: 'agent', target: 'fix-x', text: 'after PR-019' }),
    mk('parked', { kind: 'user', text: 'decision on PR-019' }, 30, { state: 'parked' }),
  ];
  const live = {
    refs: {
      steps: { 'C-045': 'answered', 'C-046': 'skipped', 'C-047': 'pending' },
      proposals: { 'PR-019': 'accepted', 'PR-020': 'proposed', 'PR-021': 'withdrawn' },
      threads: {
        'T-031': { status: 'closed', lastBy: 'lead', lastAt: at(20), closedAt: at(10) },
        'T-032': { status: 'open', lastBy: 'user', lastAt: at(5) },
        'T-033': { status: 'open', lastBy: 'user', lastAt: at(40) },
      },
      at: { 'C-045': at(8), 'C-046': at(7), 'PR-019': '2026-10-04T13:09:00.000Z', 'PR-021': at(3) },
    },
  };
  const v = S.buildStatusView({ items, live, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  const plain = (id) => by[id].waiting.plain;
  assert.equal(plain('accent-ca'), 'you decided PR-019 (accepted) at 13:09Z; fix-accent-ca has not picked it up (16 min)');
  assert.equal(by['accent-ca'].waiting.reported, 'you: decision on PR-019');
  assert.equal(by['accent-ca'].waiting.answered.at, '2026-10-04T13:09:00.000Z');
  assert.deepEqual(by['accent-ca'].waiting.answered.refs, ['PR-019']);
  assert.equal(by['accent-ca'].statePlain, 'waiting for: you decided PR-019 (accepted) at 13:09Z; fix-accent-ca has not picked it up (16 min)');
  assert.equal(plain('step'), 'you answered C-045 at 13:17Z; fix-step has not picked it up (8 min)');
  assert.equal(plain('skip'), 'you skipped C-046 at 13:18Z; fix-skip has not picked it up (7 min)');
  assert.equal(plain('thread-closed'), 'T-031 was closed at 13:15Z; fix-thread-closed has not picked it up (10 min)');
  assert.equal(plain('thread-answered'), 'you answered in T-032 at 13:20Z; fix-thread-answered has not picked it up (5 min)');
  assert.equal(plain('picked-up'), 'you decided PR-019 (accepted) at 13:09Z', 'the owner wrote the row after the event: no "not picked up"');
  assert.equal(plain('withdrawn'), 'PR-021 was withdrawn at 13:22Z; fix-withdrawn has not picked it up (3 min)');
  for (const id of ['accent-ca', 'step', 'skip', 'thread-closed', 'thread-answered', 'picked-up', 'withdrawn']) {
    assert.equal(by[id].waitingOnYou, false, id);
    assert.ok(by[id].waiting.answered, id);
  }
  // still open: some named id is not answered, the thread answer came before the wait, no id (a legacy row: no
  // migration)
  for (const id of ['pr-open', 'two', 'thread-old', 'legacy']) {
    assert.equal(by[id].waitingOnYou, true, id);
    assert.equal(by[id].waiting.answered, undefined, id);
  }
  assert.equal(by['agent-pr'].waiting.answered, undefined, 'an agent wait is not ended by the PR it mentions');
  assert.equal(by.parked.waiting.answered, undefined, 'a parked row takes no live data');
  assert.equal(v.counts.waitingOnYou, 5, 'pr-open, two, thread-old, legacy, and the parked row\'s own --waiting-on user');
  // the owner's row is still flagged for an update (I-108), beside the event text
  assert.match(by['accent-ca'].staleWhy.join(';'), /PR-019, which is already decided \(accepted\)/);
  const t = S.renderText(v);
  const you = t.split('\nWAITING ON YOU\n')[1].split('\n\n')[0];
  assert.doesNotMatch(you, /accent-ca|step:|skip|thread-closed|thread-answered|picked-up/);
  assert.match(you, /pr-open: you: decision on PR-020/);
  assert.match(t, /\n {6}wait over: you decided PR-019 \(accepted\) at 13:09Z; fix-accent-ca has not picked it up \(16 min\) \(the row says: waiting on you: decision on PR-019\)\n/);
  assert.match(t, /\n {6}waiting on: you: decision on PR-020\n/);
  // /progress links: the event text, not "waiting on you decided …"
  const links = S.progressLinks({ items: [{ ...by['accent-ca'], progress: 'accent-ca', progressItems: [] }] });
  assert.deepEqual(links.get('accent-ca').waits, ['you decided PR-019 (accepted) at 13:09Z; fix-accent-ca has not picked it up (16 min)']);
  // no live refs (a source down): nothing derived, the self-report stands
  assert.equal(S.buildStatusView({ items: [items[0]], live: {}, now }).items[0].waitingOnYou, true);
});

test('I-145: refsLive gives the time each step, proposal and thread reached its state', async () => {
  const s1 = await C.post({ by: 'fix-a', kind: 'question', title: 'Yes?', yesno: true });
  const s2 = await C.post({ by: 'fix-a', kind: 'question', title: 'Skip me', yesno: true });
  await C.answer(s1.id, { value: 'yes' });
  await C.skip(s2.id, {});
  const T = await import('../../tools/lib/console-threads.mjs');
  const { thread: t } = await T.createThread({ by: 'lead', title: 'Ask', text: 'one question' });
  await T.setStatus(t.id, { status: 'closed', by: 'lead' });
  const PR = await import('../../tools/lib/proposal.mjs');
  const { proposal: p } = await PR.postProposal({ by: 'de-a', raw: { title: 'Later', area: 'end' }, draft: true });
  const r = await P.refsLive();
  assert.equal(r.steps[s1.id], 'answered');
  assert.equal(r.at[s1.id], C.get(s1.id).result.at);
  assert.equal(r.at[s2.id], C.get(s2.id).skippedAt);
  assert.equal(r.threads[t.id].status, 'closed');
  assert.equal(r.threads[t.id].closedAt, T.getThread(t.id).history.at(-1).at);
  assert.equal(r.proposals[p.id], 'draft');
  assert.equal(r.at[p.id], p.history.at(-1).at);
});

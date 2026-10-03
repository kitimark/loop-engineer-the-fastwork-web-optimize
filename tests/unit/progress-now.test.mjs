// I-060 (user T-020): the progress page's "Right now" says what each device is used for, not only who holds it.
// - tools/lib/hold-job.mjs: the job description a holder gives (`lock.mjs acquire|run|renew --doing "…" [--for X]
//   [--eta-min N]`, `lock.mjs doing`), checked like the status board's text (Hard rule 12), and the default text of a
//   phone run (iphone.mjs scroll/record/run/gesture) from its --label;
// - tools/lib/lock.mjs describeHold: stores it on the holder record (meta.job, meta.run), only for the holder;
// - tools/lib/progress.mjs deviceView / agentsView: the device boxes (job in plain words, for whom, since, time left,
//   the phone run going on now, the holder's other jobs as "next") and one line per working agent, parked or stale rows
//   folded; the fallback when nobody described the job is the holder's status-board row, never a bare name;
// - tools/lib/progress-page.html renders both (run on a tiny fake DOM).
// Every test uses its own $FW_STATE_DIR; example addresses are private-range (192.168.77.x), none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tempDir } from '../helpers.mjs';

const J = await import('../../tools/lib/hold-job.mjs');
const L = await import('../../tools/lib/lock.mjs');
const P = await import('../../tools/lib/progress.mjs');
const S = await import('../../tools/lib/status.mjs');

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-progress-now-'); });

const NOW = Date.parse('2026-10-02T10:00:00Z');
const LAN = 'http://192.168.77.12:5497/';
const DEAD_PID = (() => { const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }); return Number(r.stdout); })();

// ---- hold-job.mjs ------------------------------------------------------------------------------------------------

test('parseJob: a plain line, an optional "for" and an estimate in minutes; refused when empty, too long or personal', () => {
  const j = J.parseJob({ text: '  timing test for the blur change,\n run 3 of 9 ', forWhom: 'wi-stack (PR-003 A)', etaMin: '20' }, NOW);
  assert.deepEqual(j, { text: 'timing test for the blur change, run 3 of 9', for: 'wi-stack (PR-003 A)', at: '2026-10-02T10:00:00.000Z', etaAt: '2026-10-02T10:20:00.000Z' });
  assert.deepEqual(J.parseJob({ text: 'npm test' }, NOW), { text: 'npm test', at: '2026-10-02T10:00:00.000Z' });
  assert.throws(() => J.parseJob({ text: '  ' }, NOW), /--doing needs a plain line/);
  assert.throws(() => J.parseJob({ text: 'x'.repeat(J.JOB_LIMITS.text + 1) }, NOW), /too long/);
  assert.throws(() => J.parseJob({ text: `scroll on ${LAN}` }, NOW), /url.*Hard rule 12/);
  assert.throws(() => J.parseJob({ text: 'phone at 192.168.77.12' }, NOW), /ip address/);
  assert.throws(() => J.parseJob({ text: 'ok', forWhom: 'someone@example.invalid' }, NOW), /--for contains a e-mail/);
  for (const bad of ['-1', 'soon', String(J.JOB_LIMITS.etaMin + 1)]) assert.throws(() => J.parseJob({ text: 'ok', etaMin: bad }, NOW), /--eta-min/);
});

test('phoneRunText: a plain default for each phone command from its --label (and the run labels), scrubbed', () => {
  assert.equal(J.phoneRunText('scroll', { label: 'patched' }), 'scripted scroll run "patched"');
  assert.equal(J.phoneRunText('scroll', {}), 'scripted scroll run');
  assert.equal(J.phoneRunText('record', { label: 'finger-v' }), 'finger recording "finger-v" (a person scrolls the phone)');
  assert.equal(J.phoneRunText('run', { label: 'a1-v3', driver: 'window', labels: { block: 'A1', arm: 'V', run: '3' } }), 'phone test run "a1-v3" (window driver; block A1, arm V, run 3)');
  assert.equal(J.phoneRunText('run', { driver: 'scroll', labels: { warmup: true } }), 'phone test run (scroll driver; warm-up)');
  assert.equal(J.phoneRunText('gesture', { label: 'g1b' }), 'robot-finger gesture run "g1b"');
  assert.doesNotMatch(J.phoneRunText('scroll', { label: `x ${LAN}` }), /192\.168|http/);
});

// ---- lock.mjs describeHold -------------------------------------------------------------------------------------

const holderMeta = (r) => L.status(r).holder.meta;

test('describeHold: the holder sets, replaces and clears its job; anyone else is refused; re-acquiring with a job updates it', async () => {
  assert.equal((await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 600, meta: { url: LAN } })).ok, true);
  const job = J.parseJob({ text: 'block B attribution', forWhom: 'illusion-proposals', etaMin: 30 });
  await L.describeHold('iphone', { owner: 'iphone-runner', job });
  assert.deepEqual(holderMeta('iphone'), { url: LAN, job }, 'the url stays; the job is added');
  await assert.rejects(L.describeHold('iphone', { owner: 'someone-else', job }), /iphone is held by "iphone-runner", not "someone-else"/);
  await assert.rejects(L.describeHold('chrome-measure', { owner: 'iphone-runner', job }), /chrome-measure is not held/);
  // re-acquire (the same owner's lease) with a new job replaces it; without one keeps it
  const job2 = J.parseJob({ text: 'timing test, run 1 of 9' });
  assert.equal((await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 600, meta: { job: job2 } })).reentrant, true);
  assert.deepEqual(holderMeta('iphone').job, job2);
  await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 600 });
  assert.deepEqual(holderMeta('iphone'), { url: LAN, job: job2 });
  // a phone run's marker: set, and cleared only by the process that set it
  await L.describeHold('iphone', { owner: 'iphone-runner', run: { text: 'scripted scroll run "v"', since: '2026-10-02T10:01:00Z', pid: 4242 } });
  await L.describeHold('iphone', { owner: 'iphone-runner', run: null, runPid: 999 });
  assert.equal(holderMeta('iphone').run.pid, 4242, 'another pid does not clear it');
  await L.describeHold('iphone', { owner: 'iphone-runner', run: null, runPid: 4242 });
  assert.equal(holderMeta('iphone').run, undefined);
  await L.describeHold('iphone', { owner: 'iphone-runner', job: null });
  assert.deepEqual(holderMeta('iphone'), { url: LAN });
});

test('describeHold: a shared reader describes its own slot; the group and the other readers are untouched', async () => {
  await L.setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'test', cap: 4 });
  const rd = (owner, weight) => L.tryAcquire('chrome-measure', { owner, shared: true, kind: 'lease', maxSec: 120, weight, load1: 0, ncpu: 8, meta: owner === 'fix-a' ? { job: J.parseJob({ text: 'npm test' }) } : {} });
  assert.equal((await rd('fix-a', 2)).ok, true);
  assert.equal((await rd('fix-b', 1)).ok, true);
  await L.describeHold('chrome-measure', { owner: 'fix-b', job: J.parseJob({ text: 'DOM probe of the end panel' }) });
  const g = L.status('chrome-measure').holder;
  assert.deepEqual(g.readers.map((x) => [x.owner, x.meta.job?.text]), [['fix-a', 'npm test'], ['fix-b', 'DOM probe of the end panel']]);
  assert.equal(g.readers.length, 2);
  await assert.rejects(L.describeHold('chrome-measure', { owner: 'fix-c', job: null }), /no reader "fix-c"/);
});

// ---- progress.mjs deviceView / agentsView -----------------------------------------------------------------------

/** A status-board item as buildStatusView makes it (the fields deviceView / agentsView read). */
function row(o) {
  return { id: o.id, title: o.title, owner: o.owner, aliases: o.aliases || [], state: o.state || 'measuring', statePlain: o.statePlain || 'measuring it on Chrome or the phone',
    group: o.group || 'working', waiting: o.waiting || null, derived: o.derived || [], note: o.note ?? null, next: o.next ?? null, stale: !!o.stale,
    updatedAt: o.updatedAt || '2026-10-02T09:50:00Z', ageMin: o.ageMin ?? 10 };
}
const BOARD = [
  row({ id: 'phone-queue', title: 'Phone blocks (timing and attribution on the iPhone)', owner: 'iphone-runner', note: 'block B attribution now', next: 'A1 (PR-003, wi-stack), then G1b', derived: [{ kind: 'using', resource: 'phone', plain: 'on the phone now' }] }),
  row({ id: 'best-stack', title: 'Stack test: five candidates', owner: 'iphone-runner', state: 'waiting', group: 'waiting', statePlain: 'waiting for: the Chrome slot: shared probe slot', waiting: { plain: 'the Chrome slot: shared probe slot' }, updatedAt: '2026-10-02T09:55:00Z' }),
  row({ id: 'phone-stack-test', title: 'Stack test RB vs stack5', owner: 'iphone-runner', state: 'parked', group: 'parked', statePlain: 'paused on purpose; may resume' }),
  row({ id: 'fwreskip', title: 'A size write in the middle of the page', owner: 'fix-scroll-engine', state: 'waiting', group: 'waiting', statePlain: 'waiting for: the phone: G1b third slot', note: 'idle until G1b', waiting: { plain: 'the phone: G1b third slot' }, derived: [{ kind: 'phone', plain: 'in line for the phone, #1 of 1' }] }),
  row({ id: 'hero-carousel', title: 'Avatar carousel', owner: 'fix-scroll-engine', state: 'parked', group: 'parked', statePlain: 'paused on purpose; may resume' }),
  row({ id: 'ts-i060', title: 'Progress page: what each device does', owner: 'ts-i060', state: 'implementing', statePlain: 'building the change', note: 'writing tests' }),
  row({ id: 'old-research', title: 'Old research line', owner: 'de-old', state: 'researching', statePlain: 'finding out where and why it is slow', stale: true, ageMin: 400 }),
  row({ id: 'later', title: 'Something later', owner: 'fix-later', state: 'queued', group: 'queued', statePlain: 'not started yet' }),
];

const lease = (meta, extra = {}) => ({ resource: 'iphone', stale: null, next: null, queue: [], holder: { resource: 'iphone', owner: 'iphone-runner', kind: 'lease', token: 't0k3n', checkout: '/Users/someone-private/wt', acquiredAt: '2026-10-02T08:35:00Z', expiresAt: '2026-10-02T10:10:00Z', meta, ...extra } });

test('deviceView: a described job in plain words, for whom, since, time left, the phone run now, the holder\'s other jobs as next', () => {
  const job = { text: 'timing test for the blur change (PR-003 A), run 3 of 9', for: 'wi-stack', at: '2026-10-02T09:40:00Z', etaAt: '2026-10-02T10:20:00Z' };
  const run = { text: 'phone test run "a1-v3" (window driver; block A1, arm V, run 3)', since: '2026-10-02T09:58:00Z', pid: process.pid };
  const st = lease({ url: LAN, job, run });
  st.queue = [{ owner: 'fix-scroll-engine', since: '2026-10-02T09:00:00Z' }];
  const d = P.deviceView(st, { resource: 'phone', board: BOARD, now: NOW });
  assert.equal(d.free, false);
  assert.equal(d.jobs.length, 1);
  const j = d.jobs[0];
  assert.deepEqual({ by: j.by, what: j.what, forWhom: j.forWhom, source: j.source, since: j.since, left: j.left }, {
    by: 'iphone-runner', what: 'timing test for the blur change (PR-003 A), run 3 of 9', forWhom: 'wi-stack', source: 'described', since: '2026-10-02T09:40:00Z',
    left: { min: 20, text: 'about 20 min left' } });
  assert.equal(j.line, 'timing test for the blur change (PR-003 A), run 3 of 9, about 20 min left');
  assert.equal(j.byLine, 'Run by iphone-runner for wi-stack, since 09:40Z.');
  assert.deepEqual(j.run, { text: 'phone test run "a1-v3" (window driver; block A1, arm V, run 3)', since: '2026-10-02T09:58:00Z' });
  // the holder's other active jobs (the board): its main row's own "next", then its other rows; parked rows are not next
  assert.deepEqual(j.next, ['A1 (PR-003, wi-stack), then G1b', 'Stack test: five candidates']);
  assert.deepEqual(d.waiting, ['fix-scroll-engine']);
  // never the lease's URL, checkout, token or pid
  const json = JSON.stringify(d);
  for (const bad of ['192.168', 'someone-private', 't0k3n', String(process.pid)]) assert.ok(!json.includes(bad), `${bad} leaked: ${json}`);
  // past the estimate; a run marker of a dead process is gone
  const late = P.deviceView(lease({ job, run: { ...run, pid: DEAD_PID } }), { resource: 'phone', board: BOARD, now: Date.parse('2026-10-02T10:27:00Z') }).jobs[0];
  assert.deepEqual(late.left, { min: -7, text: '7 min past its estimate' });
  assert.equal(late.run, null);
});

test('deviceView: no description: the holder\'s status-board row in plain words, else a sentence, never a bare name', () => {
  const j = P.deviceView(lease({ url: LAN }), { resource: 'phone', board: BOARD, now: NOW }).jobs[0];
  assert.equal(j.source, 'status board');
  assert.equal(j.what, 'Phone blocks (timing and attribution on the iPhone): block B attribution now');
  assert.equal(j.since, '2026-10-02T08:35:00Z', 'since the hold started');
  assert.equal(j.left, null, 'a lease has no planned end (its TTL is renewed)');
  assert.equal(j.byLine, 'Run by iphone-runner, since 08:35Z.');
  assert.deepEqual(j.next, ['A1 (PR-003, wi-stack), then G1b', 'Stack test: five candidates']);
  // an alias on the board matches too
  const al = P.deviceView({ ...lease({}), holder: { ...lease({}).holder, owner: 'runner-2' } }, { resource: 'phone', board: [row({ id: 'x', title: 'Block C', owner: 'iphone-runner', aliases: ['runner-2'] })], now: NOW }).jobs[0];
  assert.equal(al.what, 'Block C');
  const none = P.deviceView(lease({}), { resource: 'phone', board: [], now: NOW }).jobs[0];
  assert.deepEqual([none.source, none.what, none.line], ['none', null, 'iphone-runner has not said what it runs (no job description, no status-board row)']);
  assert.deepEqual(P.deviceView({ resource: 'iphone', holder: null, stale: null, queue: [], next: null }, { resource: 'phone', now: NOW }), { free: true, jobs: [], waiting: [] });
  assert.equal(P.deviceView(null, { resource: 'phone' }), null);
});

test('deviceView: a timed Chrome hold\'s planned length is "at most"; a shared group lists one job per reader', () => {
  const run = { resource: 'chrome-measure', stale: null, next: null, queue: [], holder: { resource: 'chrome-measure', owner: 'fix-x', kind: 'process', pid: process.pid, acquiredAt: '2026-10-02T09:55:00Z', meta: { expectSec: 600, job: { text: 'A/B of the countdown fix, 5 runs', at: '2026-10-02T09:55:00Z' } } } };
  const j = P.deviceView(run, { resource: 'chrome', board: [], now: NOW }).jobs[0];
  assert.deepEqual(j.left, { min: 5, text: 'at most 5 min left' });
  assert.equal(j.line, 'A/B of the countdown fix, 5 runs, at most 5 min left');
  const group = { resource: 'chrome-measure', stale: null, next: null, queue: [], holder: { owner: '(shared)', shared: true, format: 'rw1', acquiredAt: '2026-10-02T09:58:00Z', meta: {}, readers: [
    { owner: 'lead', weight: 2, kind: 'process', pid: 1, acquiredAt: '2026-10-02T09:58:00Z', deadline: '2026-10-02T10:03:05Z', meta: { job: { text: 'npm test before landing I-059', at: '2026-10-02T09:58:00Z' } } },
    { owner: 'wi-stack', weight: 1, kind: 'lease', acquiredAt: '2026-10-02T09:59:00Z', deadline: '2026-10-02T10:01:00Z', meta: { url: LAN } },
  ] } };
  const d = P.deviceView(group, { resource: 'chrome', board: [row({ id: 'best-stack', title: 'Stack test', owner: 'wi-stack', note: 'pixel check of B overlays', derived: [{ kind: 'using', resource: 'chrome', shared: true, plain: 'using Chrome now (shared)' }] })], now: NOW });
  assert.deepEqual(d.jobs.map((x) => [x.by, x.line, x.source]), [
    ['lead', 'npm test before landing I-059, at most 3 min left', 'described'],
    ['wi-stack', 'Stack test: pixel check of B overlays, at most 1 min left', 'status board'],
  ]);
  assert.ok(!JSON.stringify(d).includes('192.168'));
});

test('agentsView: one line per working or waiting agent (its main row, what it waits on, its other rows); parked, not started and stale rows folded', () => {
  const a = P.agentsView(BOARD);
  assert.deepEqual(a.agents.map((x) => x.owner), ['iphone-runner', 'ts-i060', 'fix-scroll-engine'], 'working agents first, then waiting ones');
  const r = a.agents[0];
  assert.equal(r.doing, 'Phone blocks (timing and attribution on the iPhone): block B attribution now');
  assert.equal(r.state, 'measuring it on Chrome or the phone');
  assert.deepEqual([r.using, r.waits], [['on the phone now'], []], 'holding a device is not a wait');
  assert.deepEqual(r.also, ['Stack test: five candidates (waiting on the Chrome slot: shared probe slot)']);
  const f = a.agents[2];
  assert.equal(f.doing, 'A size write in the middle of the page: idle until G1b');
  assert.equal(f.state, 'waiting for: the phone: G1b third slot', 'user T-044: a waiting row names its reason');
  assert.deepEqual([f.using, f.waits], [[], ['the phone: G1b third slot', 'in line for the phone, #1 of 1']]);
  assert.deepEqual(a.folded.map((x) => [x.owner, x.title, x.why]), [
    ['iphone-runner', 'Stack test RB vs stack5', 'parked'],
    ['fix-scroll-engine', 'Avatar carousel', 'parked'],
    ['de-old', 'Old research line', 'not updated for 6 h 40 min'],
    ['fix-later', 'Something later', 'not started'],
  ]);
  assert.deepEqual(P.agentsView([]), { agents: [], folded: [] });
});

test('buildView + renderText: the device jobs and the agent lines in the text; currentView reads the holder\'s job from the real lock', async () => {
  const job = { text: 'timing test for the blur change (PR-003 A), run 3 of 9', for: 'wi-stack', at: '2026-10-02T09:40:00Z', etaAt: '2026-10-02T10:20:00Z' };
  const v = P.buildView({ progress: null, live: { locks: { iphone: lease({ url: LAN, job }), 'chrome-measure': { resource: 'chrome-measure', holder: null, stale: null, queue: [], next: null } } }, board: BOARD, now: NOW });
  assert.equal(v.live.devices.phone.jobs[0].what, job.text);
  assert.equal(v.live.devices.chrome.free, true);
  assert.equal(v.agents.agents.length, 3);
  const t = P.renderText(v);
  assert.match(t, /^ {2}phone: iphone-runner \(since 08:35Z\)\n {4}doing: timing test for the blur change \(PR-003 A\), run 3 of 9, about 20 min left\. Run by iphone-runner for wi-stack, since 09:40Z\.\n {4}next: A1 \(PR-003, wi-stack\), then G1b\n {4}next: Stack test: five candidates$/m);
  assert.match(t, /\nWHO IS DOING WHAT\n {2}iphone-runner: Phone blocks .*block B attribution now \(measuring it on Chrome or the phone; on the phone now\)\n {4}also: Stack test: five candidates/);
  assert.match(t, /\n {2}\(4 more paused, not started or not updated: iphone-runner Stack test RB vs stack5 \(parked\); /);
  assert.ok(!t.includes('192.168'));
  // the real stores: a lease with a job, a status row
  assert.equal((await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 600, meta: { url: LAN, job: J.parseJob({ text: 'block B attribution', forWhom: 'illusion-proposals' }) } })).ok, true);
  await S.set('fwreskip', { by: 'fix-scroll-engine', kind: 'fix', title: 'A size write', state: 'waiting', waitingOn: 'phone:G1b slot' });
  const cv = await P.currentView();
  assert.equal(cv.live.devices.phone.jobs[0].line, 'block B attribution');
  assert.equal(cv.live.devices.phone.jobs[0].byLine.replace(/\d\d:\d\dZ/, 'HH:MMZ'), 'Run by iphone-runner for illusion-proposals, since HH:MMZ.');
  assert.deepEqual(cv.agents.agents.map((x) => [x.owner, x.doing, x.waits]), [['fix-scroll-engine', 'A size write', ['the phone: G1b slot']]]);
  assert.ok(!JSON.stringify(cv).includes('192.168'));
});

// ---- the page ---------------------------------------------------------------------------------------------------

const HTML = readFileSync(new URL('../../tools/lib/progress-page.html', import.meta.url), 'utf8');
const JS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
class Node {
  constructor(tag, text) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = text ?? ''; this.className = ''; this.classList = { add() {} }; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}
async function renderPage(view) {
  const ids = { upd: new Node('span'), banners: new Node('div'), main: new Node('main') };
  const document = { getElementById: (i) => ids[i] || null, createElement: (t) => new Node(t), createTextNode: (t) => new Node('#text', t), querySelector: () => null };
  const fetch = async () => ({ json: async () => view });
  new Function('window', 'document', 'location', 'fetch', 'setInterval', JS)({}, document, { hash: '' }, fetch, () => 0);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return ids.main;
}
const lines = (root, cls) => root.all().filter((n) => n.className === cls).map((n) => n.textContent);

test('the page: each device box says the job, for whom, since, time left, the run now and next; the agent lines; folded rows', async () => {
  const job = { text: 'timing test for the blur change (PR-003 A), run 3 of 9', for: 'wi-stack', at: '2026-10-02T09:40:00Z', etaAt: '2026-10-02T10:20:00Z' };
  const run = { text: 'scripted scroll run "v3"', since: '2026-10-02T09:58:00Z', pid: process.pid };
  const v = P.buildView({ progress: null, live: { locks: { iphone: { ...lease({ job, run }), queue: [{ owner: 'fix-scroll-engine' }] }, 'chrome-measure': { resource: 'chrome-measure', holder: null, stale: null, queue: [], next: null } } }, board: BOARD, now: NOW });
  const main = await renderPage(JSON.parse(JSON.stringify(v)));
  const text = main.textContent;
  assert.match(text, /On the phonetiming test for the blur change \(PR-003 A\), run 3 of 9, about 20 min left/);
  assert.ok(lines(main, 'q').includes('Run by iphone-runner for wi-stack, since 09:40Z.'));
  assert.ok(lines(main, 'q').includes('Right now: scripted scroll run "v3" (since 09:58Z)'));
  assert.ok(lines(main, 'q').includes('Next: A1 (PR-003, wi-stack), then G1b'));
  assert.ok(lines(main, 'q').includes('In line after it: fix-scroll-engine'));
  assert.match(text, /On Chrome \(Mac\)free/);
  assert.match(text, /Who is doing what/);
  assert.match(text, /iphone-runner: Phone blocks \(timing and attribution on the iPhone\): block B attribution now/);
  assert.match(text, /fix-scroll-engine: A size write in the middle of the page: idle until G1b/);
  assert.match(text, /Waiting on: the phone: G1b third slot · in line for the phone, #1 of 1/);
  const folded = main.all().find((n) => n.tagName === 'details' && /Paused, not started or not updated \(4\)/.test(n.textContent));
  assert.ok(folded, 'parked, queued and stale rows are in a closed details box');
  assert.equal(folded.open, undefined);
  assert.match(folded.textContent, /de-old: Old research line \(not updated for 6 h 40 min\)/);
  // no description and no row: a sentence, not a bare name
  const bare = P.buildView({ progress: null, live: { locks: { iphone: lease({}) } }, board: [], now: NOW });
  assert.match((await renderPage(JSON.parse(JSON.stringify(bare)))).textContent, /iphone-runner has not said what it runs/);
});

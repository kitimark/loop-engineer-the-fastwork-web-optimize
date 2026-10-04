// The status board end to end (ts-status-board): `status.mjs` set / priority / list / mine / show / seed on a temp
// state dir, `console.mjs serve` serving /status and /api/status (read-only, localhost only, in the menu), the
// progress page's live-status chip, and `console.mjs status`. A lock lease, a console step and an incident that name a
// LAN address never show. No port 5173, phone, Chrome, real locks or real store (I-041).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc, request } from '../helpers.mjs';
import { loadPage } from '../fixtures/page-dom.mjs';

const ST = tool('status.mjs');
const CON = tool('console.mjs');
const LAN = 'http://192.168.77.12:5497/';
let state, env, srv, base;

const progress = {
  schema: 'fw-progress/1', updatedAt: '2026-10-01T17:00:00Z', updatedBy: 'mgmt-ops-6',
  goal: 'No frame over 50 ms on the iPhone.', complaints: [{ area: 'end', text: 'the end feels laggy' }],
  items: [
    { id: 'style-recalc', title: 'Style recalc', area: 'whole', state: 'diagnosing', stage: 'R', next: 'Timeline block', owner: 'de-style-recalc' },
    { id: 'cdwc', title: 'Countdown fix', area: 'end', state: 'testing', stage: 'V', next: 'P-032', owner: 'fix-nav-morph' },
  ],
};

before(async () => {
  state = tempDir('fw-status-e2e-');
  const pf = join(state, 'PROGRESS.json'); writeFileSync(pf, JSON.stringify(progress));
  const lf = join(state, 'PREDICTIONS.md'); writeFileSync(lf, '');
  env = { FW_STATE_DIR: state, FW_PROGRESS_FILE: pf, FW_PREDICTIONS_FILE: lf };
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

const st = (...a) => node(ST, a, { env });

test('status.mjs set / priority / show / mine; refusals exit 1 with the reason', () => {
  let r = st('set', 'style-recalc', '--by', 'de-style-recalc', '--kind', 'fix', '--title', 'Style recalculation', '--state', 'researching', '--note', 'tracing the 19 ms frames', '--progress', 'style-recalc');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ADDED style-recalc: researching$/m);
  r = st('set', 'style-recalc', '--by', 'de-style-recalc', '--state', 'measuring', '--waiting-on', 'chrome:Timeline A/B');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SET style-recalc: measuring \(was researching\); waiting on chrome "Timeline A\/B"$/m);
  r = st('set', 'nope', '--by', 'x', '--state', 'testing');
  assert.equal(r.code, 1); assert.match(r.stderr, /give --kind/);
  r = st('set', 'style-recalc', '--by', 'x', '--note', `see ${LAN}`);
  assert.equal(r.code, 1); assert.match(r.stderr, /Hard rule 12/);
  r = st('priority', 'style-recalc', '1', '--by', 'de-style-recalc');
  assert.equal(r.code, 1); assert.match(r.stderr, /only the lead sets priority/);
  r = st('priority', 'style-recalc', '1', '--by', 'lead', '--note', 'the user made it the top priority');
  assert.equal(r.code, 0, r.out); assert.match(r.stdout, /^PRIORITY style-recalc: #1$/m);
  r = st('show', 'style-recalc');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^#1 {2}style-recalc {2}\[Fix\] Style recalculation/);
  assert.match(r.stdout, /waiting on: the Chrome slot: Timeline A\/B/);
  assert.match(r.stdout, /history:\n.* de-style-recalc created[\s\S]* lead priority \{"priority":1,"from":null\}: the user made it the top priority/);
  assert.equal(JSON.parse(st('show', 'style-recalc', '--json').stdout).view.priority, 1);
  r = st('mine', '--by', 'de-style-recalc');
  assert.match(r.stdout, /style-recalc/);
  assert.match(st('mine', '--by', 'nobody').stdout, /no status items owned by nobody/);
});

test('seed: dry run then --apply from PROGRESS + a seed file; existing ids skipped', () => {
  const seedFile = join(state, 'seed.json');
  writeFileSync(seedFile, JSON.stringify({ schema: 'fw-status-seed/1', items: [{ id: 'ts-x', kind: 'tool', title: 'Tool X', owner: 'ts-x', state: 'waiting', waitingOn: 'user:yes or no on the menu, C-009' }] }));
  let r = st('seed', '--by', 'lead', '--file', seedFile);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^EXISTS style-recalc \(skipped\)$/m);
  assert.match(r.stdout, /^WOULD ADD cdwc: waiting \[fix\] Countdown fix \(owner fix-nav-morph\)$/m);
  assert.match(r.stdout, /dry run: nothing written/);
  assert.equal(st('show', 'cdwc').code, 1);
  r = st('seed', '--by', 'lead', '--file', seedFile, '--apply');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ADDED cdwc/m); assert.match(r.stdout, /^ADDED ts-x/m);
  assert.equal(st('show', 'cdwc').code, 0);
});

test('derived waits on the board: lock queue, the owner\'s console step, a blocking incident; no LAN address anywhere', async () => {
  assert.equal(node(tool('lock.mjs'), ['acquire', 'iphone', '--owner', 'iphone-runner', '--ttl', '600', '--url', LAN], { env }).code, 0);
  assert.equal(node(CON, ['post', '--by', 'ts-x', '--kind', 'action', '--title', `Open ${LAN} on the phone`, '--url', LAN], { env }).code, 0);
  assert.equal(node(tool('incident.mjs'), ['open', '--by', 'fix-nav-morph', '--title', `WDA slow at ${LAN}`, '--error', 'slow', '--blocking', 'yes'], { env }).code, 0);
  const r = st('list');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^STATUS BOARD {2}\(live \d\d:\d\dZ; 1 working, 2 waiting, 1 waiting on you/);
  assert.match(r.stdout, /WAITING ON YOU\n {2}ts-x: you: yes or no on the menu, C-009; waiting on you: C-001 Open <link> on the phone/);
  assert.match(r.stdout, /cdwc[\s\S]*now: blocked by I-001: WDA slow at <link>/);
  assert.ok(r.stdout.indexOf('#1  style-recalc') < r.stdout.indexOf('cdwc'), 'priority first');
  for (const bad of ['192.168', 'http://']) assert.ok(!r.out.includes(bad), `${bad} leaked: ${r.out}`);
  const c = node(CON, ['status'], { env });
  assert.equal(c.code, 0, c.out);
  assert.equal(c.stdout.replace(/live \d\d:\d\dZ/, ''), r.stdout.replace(/live \d\d:\d\dZ/, ''));
  assert.equal(JSON.parse(node(CON, ['status', '--json'], { env }).stdout).schema, 'fw-status/1');
  // I-044: the owner drops the derived link to an incident unrelated to the current work
  const u = st('set', 'cdwc', '--by', 'fix-nav-morph', '--unlink', 'incident:I-001');
  assert.equal(u.code, 0, u.out);
  assert.match(u.stdout, /^SET cdwc: waiting; waiting on review; unlinked I-001$/m);
  assert.doesNotMatch(st('list').stdout, /blocked by I-001/);
  assert.match(st('show', 'cdwc').stdout, /not shown here \(unlinked by the owner\): I-001/);
});

test('GET /status: the page, in the menu (highlighted); /api/status: the model, scrubbed, read-only, localhost only', async () => {
  const p = await request(new URL('status', base).href);
  assert.equal(p.status, 200);
  assert.match(p.headers['content-type'], /text\/html/);
  assert.match(p.text, /<title>Status board<\/title>/);
  assert.match(p.text, /fetch\('\/api\/status'/);
  assert.match(p.text, /class="mbtn on" aria-current="page" title="[^"]*" href="\/status">Status</);
  for (const page of ['/', '/progress']) assert.match((await request(new URL(page, base).href)).text, /href="\/status">Status<\/a>/);
  const r = await request(new URL('api/status', base).href);
  assert.equal(r.status, 200);
  const v = JSON.parse(r.text);
  assert.equal(v.items[0].id, 'style-recalc');
  assert.equal(v.items[0].priority, 1);
  assert.ok(v.items.find((x) => x.id === 'ts-x').waitingOnYou);
  assert.deepEqual(v.otherWaits, [], 'I-058: live waits of owners without a row (none running here)');
  assert.match(p.text, /v\.otherWaits/, 'I-058: the page lists other waits');
  assert.match(p.text, /d\.kind === 'wait'/, 'I-058: a running wait is its own chip');
  for (const bad of ['192.168', 'http://', '/Users/']) assert.ok(!r.text.includes(bad), `${bad} leaked`);
  assert.equal((await request(new URL('api/status', base).href, { method: 'POST', headers: { 'x-console': '1' } })).status, 404);
  const port = new URL(base).port;
  assert.equal((await request(new URL('api/status', base).href, { headers: { host: `evil.invalid:${port}` } })).status, 421);
});

test('the progress page carries each linked workstream\'s live state (chip data and text)', async () => {
  const v = JSON.parse((await request(new URL('api/progress', base).href)).text);
  const sr = v.sections.flatMap((s) => s.items).find((i) => i.id === 'style-recalc');
  assert.equal(sr.status.id, 'style-recalc');
  assert.equal(sr.status.state, 'measuring');
  assert.deepEqual(sr.status.waits, ['waiting on the Chrome slot: Timeline A/B']);
  const page = await request(new URL('progress', base).href);
  assert.match(page.text, /href: '\/status#' \+ encodeURIComponent\(it\.status\.id\)/);
  const t = node(CON, ['progress'], { env });
  assert.match(t.stdout, /now: measuring \(measuring it on Chrome or the phone\); waiting on the Chrome slot: Timeline A\/B \[status board: style-recalc\]/);
});

// I-104 (user T-057 on /status#cd-roll-ca: "Can we link this row to each progress?"): rows link to their Progress
// items and the items link back, found by the owner's link, the same id or a P-id both name; never a link to nothing.
test('I-104: Status rows link to their Progress items and back (same id without --progress, a shared P-id); no match, no link', async () => {
  const pf = env.FW_PROGRESS_FILE;
  const more = { ...progress, items: [...progress.items, { id: 'cd-roll-ca', title: 'Countdown roll', area: 'end', state: 'testing', stage: 'V', owner: 'fix-cd-roll-ca', checks: [{ id: 'P-036', what: 'roll position' }] }] };
  writeFileSync(pf, JSON.stringify(more));
  try {
    assert.equal(st('set', 'cd-roll-ca', '--by', 'fix-cd-roll-ca', '--kind', 'fix', '--title', 'Countdown roll row', '--state', 'measuring').code, 0);
    assert.equal(st('set', 'panel', '--by', 'fix-nav-morph', '--kind', 'fix', '--title', 'Panel check', '--state', 'testing', '--refs', 'P-036').code, 0);
    assert.equal(st('set', 'lost', '--by', 'fix-x', '--kind', 'fix', '--title', 'Points nowhere', '--state', 'testing', '--progress', 'no-such-item').code, 0);
    const v = JSON.parse((await request(new URL('api/status', base).href)).text);
    const by = Object.fromEntries(v.items.map((x) => [x.id, x.progressItems]));
    assert.deepEqual(by['cd-roll-ca'], [{ id: 'cd-roll-ca', title: 'Countdown roll', how: 'same id' }]);
    assert.deepEqual(by.panel, [{ id: 'cd-roll-ca', title: 'Countdown roll', how: 'both name P-036' }]);
    assert.deepEqual(by['style-recalc'], [{ id: 'style-recalc', title: 'Style recalc', how: 'linked by its owner' }]);
    assert.deepEqual(by.lost, [], 'a --progress to an item that is not there: no link');
    assert.deepEqual(by['ts-x'], []);
    const pv = JSON.parse((await request(new URL('api/progress', base).href)).text);
    const it = pv.sections.flatMap((s) => s.items).find((i) => i.id === 'cd-roll-ca');
    assert.equal(it.status.id, 'cd-roll-ca', 'the item links back to its own row');
    assert.deepEqual(it.status.also, [{ id: 'panel', title: 'Panel check' }]);
    // the pages, rendered: real links, both ways
    const sp = await loadPage(base, '/status');
    const hrefs = (doc, re) => doc.querySelectorAll('a').map((a) => a.getAttribute('href')).filter((h) => re.test(h || ''));
    const rowLinks = (id) => hrefs(sp.document.querySelector(`tr[data-item="${id}"]`), /^\/progress/);
    assert.deepEqual(rowLinks('cd-roll-ca'), ['/progress#cd-roll-ca']);
    assert.deepEqual(rowLinks('panel'), ['/progress#cd-roll-ca']);
    assert.deepEqual(rowLinks('lost'), [], 'no broken link');
    assert.deepEqual(rowLinks('ts-x'), []);
    assert.match(sp.document.querySelector('tr[data-item="cd-roll-ca"]').textContent, /Progress: Countdown roll/);
    const pp = await loadPage(base, '/progress');
    const card = pp.document.querySelector('section[data-item="cd-roll-ca"]');
    assert.deepEqual(hrefs(card, /^\/status#/), ['/status#cd-roll-ca', '/status#panel']);
    for (const h of hrefs(pp.document.documentElement, /^\/status#/)) assert.ok(v.items.some((x) => `/status#${x.id}` === h), `${h} is a row on the board`);
    for (const h of hrefs(sp.document.documentElement, /^\/progress#/)) assert.ok(more.items.some((x) => `/progress#${x.id}` === h), `${h} is a Progress item`);
  } finally { writeFileSync(pf, JSON.stringify(progress)); }
});

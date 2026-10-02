// Console proposals end to end (ts-proposals): `console.mjs proposal …` on a temp state dir ($FW_STATE_DIR) with a
// page server on port 0 (never 5173 or the lead's 5559). Fake images (tests/fixtures/fake-media.mjs) and a fake LAN
// address (192.168.77.12). Checks: post (JSON and Markdown) copies the media into the store and scrubs text, a LAN
// compare URL is refused, list/show, the page and its menu entry, the API without LAN text, media with strict names
// and Range, the POST guards (x-console, Host), decide/undo with a stale-revision check, revise, withdraw, and
// `proposal wait` (MET 0 with the decision, TIMEOUT 3, NEVER 4, --any for one author or all), the badge model, and
// I-045: every decision event (reject, undo, change) reaches `wait --any`, `wait <id> --until changed|decided --since`
// and the lead's `thread wait --as lead`, each once. I-053: a proposal with options (post --option, the API and media,
// accept needs an option, decide --option, every wait and the thread wait carry `option`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, startProc, request } from '../helpers.mjs';
import { writePng, writeMp4, pngBytes } from '../fixtures/fake-media.mjs';

const CON = tool('console.mjs');
const LAN = 'https://192.168.77.12:5612/';
let state, env, srv, base, src;
const cli = (...a) => node(CON, ['proposal', ...a], { env });
const cliAsync = (...a) => nodeAsync(CON, ['proposal', ...a], { env });
const get = (p, headers = {}) => request(new URL(p, base).href, { headers });
const postJson = (p, body, headers = { 'x-console': '1' }) => request(new URL(p, base).href, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const json = (r) => JSON.parse(r.text);
const postedId = (r) => { assert.equal(r.code, 0, r.out); const m = r.stdout.match(/^POSTED (PR-\d+): /m); assert.ok(m, r.stdout); return m[1]; };

function proposal(over = {}) {
  return {
    schema: 'fw-proposal/1', title: 'Hero glow as a pre-rendered image', area: 'hero', topic: 'style-recalc-r4',
    problem: `Every scroll frame restyles 412 elements. Measured on ${LAN}.`, idea: 'Draw the glow once into an image.',
    looksSame: 'The glow is static while you scroll.', visualDiff: ['The glow no longer follows the cursor.'],
    gain: [{ what: 'Elements restyled per frame', before: '412', after: '38', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' },
      { what: 'Layers', before: '41', after: '12', tag: 'estimate', how: 'layer count', needsPhone: true }],
    risk: 'A design change needs a new image.',
    compare: { a: { label: 'Original', url: 'https://localhost:5612/' }, b: { label: 'PoC', url: 'https://localhost:5613/' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'b-0.png' }], view: 'blink' },
    ...over,
  };
}
const writeProposal = (name, p) => { const f = join(src, name); writeFileSync(f, typeof p === 'string' ? p : JSON.stringify(p)); return f; };

before(async () => {
  state = tempDir('fw-proposal-e2e-');
  env = { FW_STATE_DIR: state };
  src = tempDir('fw-proposal-e2e-src-');
  writePng(join(src, 'a-0.png'), 8, 6, [10, 20, 30]);
  writePng(join(src, 'b-0.png'), 8, 6, [10, 20, 30], [250, 250, 250]);
  writePng(join(src, 'a-1.png'), 8, 6);
  writePng(join(src, 'b-1.png'), 8, 6);
  writeMp4(join(src, 'a.mp4'));
  writeMp4(join(src, 'b.mp4'));
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('post: PR-001, media copied into the store, LAN text scrubbed and reported, the console link printed', () => {
  assert.notEqual(srv.port, 5173); assert.notEqual(srv.port, 5559);
  const r = cli('post', '--by', 'de-illusion-style', '--file', writeProposal('p1.json', proposal()), '--video-a', join(src, 'a.mp4'), '--video-b', join(src, 'b.mp4'));
  assert.equal(postedId(r), 'PR-001');
  assert.match(r.stderr, /scrubbed url in problem \(Hard rule 12\)/);
  assert.match(r.stdout, /1 screenshot pair\(s\), video, copied into the console store/);
  assert.match(r.stdout, /on the user console http:\/\/localhost:\d+\/proposals#PR-001/);
  const dir = join(state, 'console', 'proposals', 'PR-001');
  assert.deepEqual(readdirSync(dir).sort(), ['r1-a-1.png', 'r1-b-1.png', 'r1-video-a.mp4', 'r1-video-b.mp4']);
  const stored = readFileSync(join(state, 'console', 'proposals', 'PR-001.json'), 'utf8');
  assert.ok(!stored.includes('192.168'), 'no LAN address in the store');
  assert.ok(!stored.includes(src), 'no source path in the store');
});

test('post refuses a LAN compare URL, a missing --by or file, and a broken proposal (exit 1, nothing stored)', () => {
  const lan = cli('post', '--by', 'x', '--file', writeProposal('lan.json', proposal({ compare: { ...proposal().compare, b: { label: 'PoC', url: LAN } } })));
  assert.equal(lan.code, 1);
  assert.match(lan.stderr, /compare\.b\.url: must be a localhost URL/);
  assert.ok(!lan.stderr.includes('192.168'), 'the refusal does not echo the address');
  assert.match(cli('post', '--file', join(src, 'p1.json')).stderr, /--by <your agent name> is required/);
  assert.match(cli('post', '--by', 'x').stderr, /--file <proposal\.json\|md> is required/);
  assert.match(cli('post', '--by', 'x', '--file', writeProposal('bad.json', proposal({ gain: [] }))).stderr, /gain: at least one row/);
  assert.match(cli('post', '--by', 'x', '--file', writeProposal('pair.json', proposal()), '--shot-a', join(src, 'a-1.png')).stderr, /pair up by order/);
  assert.equal(readdirSync(join(state, 'console', 'proposals')).filter((f) => f.endsWith('.json')).length, 1);
});

test('post a Markdown proposal with --shot-a/--shot-b/--caption; a draft is not on the page', () => {
  const md = `---
title: Middle cards without backdrop blur
area: middle
a: Original | http://localhost:5700/
b: PoC | http://localhost:5701/
---
## Problem
The blur repaints 3 large layers per frame.
## Idea
A pre-blurred image behind the cards.
## Looks the same
The cards do not move against their background.
## Visual difference
- Content behind a card no longer shows through blurred while it scrolls.
## Gain
| what | before | after | tag | how |
|---|---|---|---|---|
| Paint area per frame | 2.1 MP | 0.3 MP | OBSERVED | paint rects, 3 runs |
## Risk
Low.
`;
  const id = postedId(cli('post', '--by', 'de-illusion-composite', '--file', writeProposal('p2.md', md), '--shot-a', join(src, 'a-0.png'), '--shot-b', join(src, 'b-0.png'), '--caption', 'Cards, scrollY 2400', '--shot-a', join(src, 'a-1.png'), '--shot-b', join(src, 'b-1.png')));
  assert.equal(id, 'PR-002');
  const s = cli('show', id);
  assert.match(s.stdout, /^PR-002 {2}\[proposed rev 1\] {2}middle {2}by de-illusion-composite: Middle cards without backdrop blur/);
  assert.match(s.stdout, /Paint area per frame: 2\.1 MP -> 0\.3 MP \[OBSERVED\]/);
  assert.match(s.stdout, /shot 1 "Cards, scrollY 2400": r1-a-1\.png \| r1-b-1\.png/);
  const d = postedId(cli('post', '--by', 'de-illusion-composite', '--draft', '--file', writeProposal('d.json', { title: 'Later idea', area: 'end' })));
  assert.equal(d, 'PR-003');
  assert.match(cli('list').stdout, /PR-003 {2}\[draft rev 1\]/);
  assert.match(cli('list', '--waiting').stdout, /^PR-001 .*\nPR-002 /);
  assert.ok(!cli('list', '--waiting').stdout.includes('PR-003'));
  assert.deepEqual(JSON.parse(cli('list', '--by', 'de-illusion-composite', '--json').stdout).map((p) => p.id), ['PR-002', 'PR-003']);
});

test('the page: menu entry on every console page, the proposals page, the API, nothing LAN, nothing external', async () => {
  for (const p of ['/', '/progress', '/proposals']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /href="\/proposals">Proposals<span class="badge" data-badge-proposals hidden>0<\/span><\/a>/, p);
  }
  const page = await get('/proposals');
  assert.match(page.text, /<title>Proposals<\/title>/);
  assert.match(page.text, /class="mbtn on" aria-current="page" title="[^"]*" href="\/proposals"/);
  assert.match(page.headers['content-security-policy'], /media-src 'self'/);
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  const list = json(await get('/api/proposals'));
  assert.deepEqual(list.proposals.map((p) => [p.id, p.state]), [['PR-001', 'proposed'], ['PR-002', 'proposed']]);
  const one = await get('/api/proposals/PR-001');
  assert.equal(one.status, 200);
  const v = json(one).proposal;
  assert.equal(v.compare.shots[0].a, '/media/PR-001/r1-a-1.png');
  assert.equal(v.compare.video.b, '/media/PR-001/r1-video-b.mp4');
  assert.equal(v.gain[1].needsPhone, true);
  assert.equal(v.history, undefined);
  for (const t of [one.text, JSON.stringify(list)]) assert.ok(!t.includes('192.168') && !t.includes(src), t);
  assert.equal((await get('/api/proposals/PR-003')).status, 404, 'a draft is not served');
  assert.equal((await get('/api/proposals/PR-999')).status, 404);
  const w = json(await get('/api/waiting'));
  assert.equal(w.proposals.count, 2);
  assert.deepEqual(w.proposals.items.map((p) => p.id), ['PR-001', 'PR-002']);
  assert.deepEqual(Object.keys(w.proposals.items[0]).sort(), ['id', 'queuedAt', 'status', 'title', 'updatedAt', 'yourTurn']);
});

test('media: the stored bytes with the right type; Range; strict names; no traversal; drafts hidden; localhost only', async () => {
  const img = await get('/media/PR-001/r1-b-1.png');
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal(img.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(img.body, pngBytes(8, 6, [10, 20, 30], [250, 250, 250]));
  const part = await get('/media/PR-001/r1-video-a.mp4', { range: 'bytes=4-11' });
  assert.equal(part.status, 206);
  assert.equal(part.headers['content-type'], 'video/mp4');
  assert.equal(part.text, 'ftypisom');
  assert.match(part.headers['content-range'], /^bytes 4-11\/\d+$/);
  assert.equal((await get('/media/PR-001/r1-video-a.mp4', { range: 'bytes=9999-' })).status, 416);
  for (const p of ['/media/PR-001/..%2FPR-001.json', '/media/PR-001/../PR-001.json', '/media/PR-001/r1-a-1.svg', '/media/PR-001/r2-a-1.png', '/media/PR-1/r1-a-1.png', '/media/PR-001/', '/media/PR-001/r1-a-1.png%00']) {
    assert.equal((await get(p)).status, 404, p);
  }
  const lan = await request(new URL('/media/PR-001/r1-a-1.png', base).href, { headers: { host: '192.168.77.12:' + srv.port } });
  assert.equal(lan.status, 421, 'localhost Host only');
});

test('POST guards: x-console header, localhost Host, JSON body; decide with a stale revision is refused', async () => {
  assert.equal((await postJson('/api/proposals/PR-001/decide', { value: 'accept' }, {})).status, 403);
  const h = await request(new URL('/api/proposals/PR-001/decide', base).href, { method: 'POST', headers: { 'x-console': '1', host: 'evil.invalid:' + srv.port }, body: '{}' });
  assert.equal(h.status, 421);
  const nj = await request(new URL('/api/proposals/PR-001/decide', base).href, { method: 'POST', headers: { 'x-console': '1' }, body: 'not json' });
  assert.equal(nj.status, 400);
  assert.equal((await postJson('/api/proposals/PR-001/delete', {})).status, 404);
  assert.equal((await postJson('/api/proposals/PR-003/decide', { value: 'accept' })).status, 404, 'no decision on a draft');
  const stale = await postJson('/api/proposals/PR-001/decide', { value: 'accept', rev: 7 });
  assert.equal(stale.status, 409);
  assert.match(json(stale).error, /was revised/);
  const noNote = await postJson('/api/proposals/PR-001/decide', { value: 'change', rev: 1 });
  assert.equal(noNote.status, 409);
  assert.match(json(noNote).error, /say what to change/);
});

test('wait: MET 0 with the decision after the user decides on the page; undo; revise; --any; TIMEOUT 3; NEVER 4', async () => {
  const waiting = cliAsync('wait', 'PR-001', '--until', 'decided', '--timeout', '20', '--json');
  const anyWait = cliAsync('wait', '--any', '--by', 'de-illusion-style', '--timeout', '20', '--quiet');
  await new Promise((r) => setTimeout(r, 700));
  const r = await postJson('/api/proposals/PR-001/decide', { value: 'change', notes: `Keep the glow moving (seen on ${LAN})`, rev: 1 });
  assert.equal(r.status, 200, r.text);
  assert.equal(json(r).proposal.state, 'changes-requested');
  const w = await waiting;
  assert.equal(w.code, 0, w.out);
  const d = JSON.parse(w.stdout);
  assert.deepEqual([d.id, d.rev, d.value], ['PR-001', 1, 'changes-requested']);
  assert.match(d.notes, /^Keep the glow moving \(seen on <link>\)$/, 'the user\'s notes are scrubbed too');
  const any = await anyWait;
  assert.equal(any.code, 0, any.out);
  assert.match(any.stdout, /^MET a decision on a proposal by de-illusion-style .*"decisions":\[\{"id":"PR-001"/);
  // the user changes their mind, then decides again; then the author revises
  assert.equal((await postJson('/api/proposals/PR-001/undo', { rev: 1 })).status, 200);
  assert.equal(json(await get('/api/proposals/PR-001')).proposal.state, 'proposed');
  assert.equal((await postJson('/api/proposals/PR-001/decide', { value: 'change', notes: 'still: keep it moving', rev: 1 })).status, 200);
  const rv = cli('revise', 'PR-001', '--by', 'de-illusion-style', '--note', 'the glow moves again (CSS transform only)', '--file', join(src, 'p1.json'), '--shot-a', join(src, 'a-1.png'), '--shot-b', join(src, 'b-1.png'));
  assert.equal(rv.code, 0, rv.out);
  assert.match(rv.stdout, /^REVISED PR-001 {2}\[proposed rev 2\]/);
  assert.ok(existsSync(join(state, 'console', 'proposals', 'PR-001', 'r2-a-2.png')));
  assert.equal((await get('/media/PR-001/r2-b-2.png')).status, 200);
  const stale = await postJson('/api/proposals/PR-001/decide', { value: 'accept', rev: 1 });
  assert.equal(stale.status, 409, 'a page that still shows revision 1 cannot accept revision 2');
  // CLI decide (the user answered in chat) and the plain-text MET
  const waitText = cliAsync('wait', 'PR-001', '--timeout', '20', '--quiet');
  await new Promise((r2) => setTimeout(r2, 500));
  assert.match(cli('decide', 'PR-001', '--by', 'lead', '--value', 'accept', '--notes', 'user said yes in chat').stdout, /^DECIDED PR-001 {2}\[accepted rev 2\]/);
  const wt = await waitText;
  assert.equal(wt.code, 0, wt.out);
  assert.match(wt.stdout, /^MET proposal PR-001 decided: \{"id":"PR-001","rev":2,"value":"accepted","notes":"user said yes in chat"/);
  // TIMEOUT and NEVER
  const to = cli('wait', 'PR-002', '--timeout', '1', '--quiet');
  assert.equal(to.code, 3, to.out);
  assert.match(to.stdout, /^TIMEOUT proposal PR-002 decided after \d+ s: proposed, rev 1/);
  const never = cliAsync('wait', 'PR-002', '--timeout', '20', '--quiet');
  await new Promise((r3) => setTimeout(r3, 500));
  assert.match(cli('withdraw', 'PR-002', '--by', 'de-illusion-composite', '--note', 'superseded').stdout, /^WITHDRAWN PR-002 {2}\[withdrawn rev 1\]/);
  const nv = await never;
  assert.equal(nv.code, 4, nv.out);
  assert.match(nv.stdout, /^NEVER proposal PR-002 decided: it was withdrawn/);
  assert.equal((await get('/api/proposals/PR-002')).status, 404, 'a withdrawn proposal leaves the page');
  assert.equal(cli('wait').code, 1);
  // I-045: --any without --by watches every proposal (the lead's wait); a bad --since is a usage error
  const all = cli('wait', '--any', '--timeout', '0', '--quiet');
  assert.equal(all.code, 3, all.out);
  assert.match(all.stdout, /^TIMEOUT a decision on any proposal after \d{4}-/);
  assert.match(cli('wait', '--any', '--since', 'yesterday').stderr, /--since must be an ISO time/);
});

test('publish a draft after adding shots; unknown commands and ids are usage errors', () => {
  assert.match(cli('publish', 'PR-003', '--by', 'de-illusion-composite').stderr, /problem: required/);
  const rv = cli('revise', 'PR-003', '--by', 'de-illusion-composite', '--note', 'complete', '--file', join(src, 'p1.json'), '--publish');
  assert.equal(rv.code, 0, rv.out);
  assert.match(rv.stdout, /^REVISED PR-003 {2}\[proposed rev 2\]/);
  assert.equal(cli('frobnicate').code, 1);
  assert.match(cli('show', 'X-1').stderr, /bad proposal id/);
  assert.match(cli('show', 'PR-77').stderr, /no proposal PR-077/);
  assert.equal(cli('help').code, 0);
});

// I-045: the user rejected PR-001 (21:02:13Z), undid it (21:02:45Z) and requested a change (21:04:04Z); the author's
// wait had exited on "rejected" and the lead had no wait covering proposals, so the change notified nobody.
test('I-045: reject -> undo -> change on the page reaches wait --any, wait --until changed/decided --since, and thread wait --as lead', async () => {
  const id = postedId(cli('post', '--by', 'de-seq', '--file', writeProposal('seq.json', proposal({ title: 'Sequence glow' }))));
  // the lead's standing wait existed before (its read mark starts when it is first armed: earlier decisions are not news)
  const first = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '0', '--quiet'], { env });
  assert.equal(first.code, 3, first.out);
  assert.ok(existsSync(join(state, 'console', 'proposal-reads.json')), 'the lead\'s proposal read mark is in the console store');
  const t0 = new Date().toISOString();
  // the author's first wait and the lead's thread wait, armed in the background
  const authorWait = cliAsync('wait', id, '--until', 'decided', '--timeout', '20', '--quiet');
  const leadWait = nodeAsync(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '20', '--quiet'], { env, timeout: 60000 });
  await new Promise((r) => setTimeout(r, 700));
  const dec = (body) => postJson(`/api/proposals/${id}/decide`, { rev: 1, ...body });
  assert.equal((await dec({ value: 'reject', notes: 'too different' })).status, 200);
  const aw = await authorWait;
  assert.equal(aw.code, 0, aw.out);
  assert.match(aw.stdout, new RegExp(`^MET proposal ${id} decided: \\{"id":"${id}","rev":1,"value":"rejected"`));
  const rejectAt = JSON.parse(aw.stdout.match(/: (\{.*\}) \(after/)[1]).at;
  assert.match(aw.stdout, new RegExp(`^Re-arm \\(wakes on an undo or a changed decision\\): node tools/console\\.mjs proposal wait ${id} --until changed --since ${rejectAt.replace(/\./g, '\\.')}$`, 'm'));
  const lw = await leadWait;
  assert.equal(lw.code, 0, lw.out);
  assert.match(lw.stdout, new RegExp(`^PROPOSAL ${id} decided rejected by user at \\S+: too different$`, 'm'));
  assert.match(lw.stdout, /^MET threads all for lead: 1 proposal decision event\(s\) in PR-\d+ \(after [\d.]+ s\); marked read for lead\. Re-arm: node tools\/console\.mjs thread wait --as lead$/m);
  // the author re-arms on the hint; the user undoes and requests a change
  const rearmed = cliAsync('wait', id, '--until', 'decided', '--since', rejectAt, '--timeout', '20', '--quiet', '--json');
  await new Promise((r) => setTimeout(r, 700));
  assert.equal((await postJson(`/api/proposals/${id}/undo`, { rev: 1 })).status, 200);
  const changedWait = cli('wait', id, '--until', 'changed', '--since', rejectAt, '--timeout', '5', '--quiet');
  assert.equal(changedWait.code, 0, changedWait.out);
  assert.match(changedWait.stdout, new RegExp(`^PROPOSAL ${id} undecided \\(was rejected\\) by user at `, 'm'));
  await new Promise((r) => setTimeout(r, 700));
  assert.equal((await dec({ value: 'change', notes: 'keep the glow moving' })).status, 200);
  const rw = await rearmed;
  assert.equal(rw.code, 0, rw.out);
  const rd = JSON.parse(rw.stdout);
  assert.deepEqual([rd.id, rd.value, rd.was, rd.notes], [id, 'changes-requested', 'rejected', 'keep the glow moving']);
  assert.match(rw.stderr, new RegExp(`Re-arm .*proposal wait ${id} --until changed --since `));
  // one --any window over all proposals (no --by) since before the reject: all three events, in order
  const any = cli('wait', '--any', '--since', t0, '--timeout', '5', '--json', '--quiet');
  assert.equal(any.code, 0, any.out);
  const ev = JSON.parse(any.stdout).events.filter((e) => e.id === id);
  assert.deepEqual(ev.map((e) => [e.event, e.value, e.was]), [['decided', 'rejected', null], ['undecided', 'proposed', 'rejected'], ['decided', 'changes-requested', 'rejected']]);
  const anyText = cli('wait', '--any', '--since', t0, '--timeout', '5', '--quiet');
  assert.match(anyText.stdout, /^MET a decision on any proposal after /);
  assert.match(anyText.stdout, new RegExp(`^PROPOSAL ${id} decided changes-requested \\(was rejected\\) by user at \\S+: keep the glow moving$`, 'm'));
  assert.match(anyText.stdout, new RegExp(`^Re-arm: node tools/console\\.mjs proposal wait --any --since ${ev[2].at.replace(/\./g, '\\.')}$`, 'm'));
  // the lead's thread wait, armed again: the undo and the change (made while no wait ran), once, then nothing
  const lw2 = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '5', '--quiet'], { env });
  assert.equal(lw2.code, 0, lw2.out);
  assert.match(lw2.stdout, new RegExp(`^PROPOSAL ${id} undecided \\(was rejected\\) by user at \\S+: back to proposed, waiting for the user$`, 'm'));
  assert.match(lw2.stdout, new RegExp(`^PROPOSAL ${id} decided changes-requested \\(was rejected\\) by user at \\S+: keep the glow moving$`, 'm'));
  assert.ok(!/decided rejected/.test(lw2.stdout), 'the reject was reported by the first wait');
  assert.match(lw2.stdout, /2 proposal decision event\(s\)/);
  const lw3 = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '1', '--quiet'], { env });
  assert.equal(lw3.code, 3, `each event once per reader: ${lw3.out}`);
  // the author's own standing thread wait sees its proposals' events; JSON items carry kind: proposal
  const own = node(CON, ['thread', 'wait', '--as', 'de-seq', '--timeout', '0', '--quiet'], { env });
  assert.equal(own.code, 3, own.out);
  assert.equal((await postJson(`/api/proposals/${id}/undo`, { rev: 1 })).status, 200);
  const ownJ = node(CON, ['thread', 'wait', '--as', 'de-seq', '--timeout', '5', '--quiet', '--json'], { env });
  assert.equal(ownJ.code, 0, ownJ.out);
  assert.deepEqual(JSON.parse(ownJ.stdout).map((x) => [x.kind, x.id, x.event, x.was]), [['proposal', id, 'undecided', 'changes-requested']]);
  assert.match(cli('wait', id, '--until', 'sometime').stderr, /--until must be decided or changed/);
});

// I-053 (user, PR-001 decision 2026-10-02 06:31Z): one proposal, several solutions; the user picks one when accepting.
test('I-053 options: post with --option media, show/list, the API and media, accept needs an option, waits and thread wait carry it', async () => {
  const opt = (name, b, over = {}) => ({
    name, label: `Way ${name}`, idea: `Idea ${name}.`, looksSame: `Same ${name}.`, visualDiff: [`${name}: 0.2 % of pixels differ`],
    gain: [{ what: 'Elements restyled per frame', before: '120', after: name === 'tiles' ? '0' : '6', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' }],
    risk: `Risk ${name}.`, compare: { b: { label: `B ${name}`, url: 'http://localhost:5613/' }, shots: [{ caption: 'Top', a: 'a-0.png', b }] }, ...over,
  });
  const file = writeProposal('opts.json', {
    schema: 'fw-proposal/1', title: 'Word swap, three ways', area: 'hero', problem: `Restyles 120 elements per frame (seen on ${LAN}).`,
    compare: { a: { label: 'Original', url: 'https://localhost:5612/' }, view: 'side' },
    options: [opt('tiles', 'b-0.png'), opt('video', 'b-1.png', { compare: { b: { label: 'B video' } } }), opt('copy', 'b-1.png')],
    recommended: { option: 'tiles', why: 'Fewest restyles.' },
  });
  // the CLI's media need --option when the proposal has options
  assert.match(cli('post', '--by', 'de-opts', '--file', file, '--shot-a', join(src, 'a-1.png'), '--shot-b', join(src, 'b-1.png')).stderr, /say which one the --shot-a\/--shot-b\/--video flags are for/);
  const r = cli('post', '--by', 'de-opts', '--file', file, '--option', 'video', '--video-a', join(src, 'a.mp4'), '--video-b', join(src, 'b.mp4'));
  const id = postedId(r);
  assert.match(r.stdout, /^ {2}3 options: tiles \(1 pair\(s\)\), video \(0 pair\(s\), video\), copy \(1 pair\(s\)\); recommended: tiles; media copied into the console store$/m);
  assert.match(r.stderr, /scrubbed url in problem/);
  assert.match(cli('list', '--waiting').stdout, new RegExp(`^${id} {2}\\[proposed rev 1\\] {2}hero {2}by de-opts: Word swap, three ways \\(3 options\\)$`, 'm'));
  const show = cli('show', id).stdout;
  assert.match(show, /^ {2}options: tiles, video, copy; recommended: tiles \(Fewest restyles\.\)$/m);
  assert.match(show, /^ {2}option video "Way video":$/m);
  assert.match(show, /^ {4}video: a=r1-o2-video-a\.mp4 b=r1-o2-video-b\.mp4$/m);
  // the page's API: options with /media URLs; the list row counts them; the media are served
  const v = json(await get(`/api/proposals/${id}`)).proposal;
  assert.deepEqual(v.options.map((o) => [o.name, o.label, o.compare.b.label, o.compare.shots.length]), [['tiles', 'Way tiles', 'B tiles', 1], ['video', 'Way video', 'B video', 0], ['copy', 'Way copy', 'B copy', 1]]);
  assert.equal(v.options[1].compare.video.b, `/media/${id}/r1-o2-video-b.mp4`);
  assert.deepEqual(v.recommended, { option: 'tiles', why: 'Fewest restyles.' });
  assert.ok(!JSON.stringify(v).includes('192.168'));
  assert.equal(json(await get('/api/proposals')).proposals.find((p) => p.id === id).options, 3);
  assert.equal((await get(`/media/${id}/r1-o3-b-1.png`)).status, 200);
  assert.equal((await get(`/media/${id}/r1-o2-video-a.mp4`, { range: 'bytes=4-11' })).status, 206);
  // the lead's standing thread wait: take what earlier tests left, so only this test's events follow
  node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '0', '--quiet'], { env });
  assert.equal(node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '0', '--quiet'], { env }).code, 3);
  // accept without an option is refused; with one (name or label) it is stored and every wait reports it
  const no = await postJson(`/api/proposals/${id}/decide`, { value: 'accept', rev: 1 });
  assert.equal(no.status, 409);
  assert.match(json(no).error, /has 3 options: say which one you accept \(--option <name>: tiles, video, copy\)/);
  assert.equal((await postJson(`/api/proposals/${id}/decide`, { value: 'accept', rev: 1, option: 'nope' })).status, 409);
  const waitJson = cliAsync('wait', id, '--timeout', '20', '--quiet', '--json');
  const waitText = cliAsync('wait', id, '--timeout', '20', '--quiet');
  await new Promise((res) => setTimeout(res, 700));
  const ok = await postJson(`/api/proposals/${id}/decide`, { value: 'accept', rev: 1, option: 'Way video', notes: 'the smallest file' });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual([json(ok).proposal.state, json(ok).proposal.decision.option], ['accepted', 'video']);
  const wj = await waitJson;
  assert.equal(wj.code, 0, wj.out);
  const wd = JSON.parse(wj.stdout);
  assert.deepEqual([wd.id, wd.value, wd.option], [id, 'accepted', 'video']);
  const wt = await waitText;
  assert.equal(wt.code, 0, wt.out);
  assert.match(wt.stdout, /^MET proposal PR-\d+ decided: \{.*"option":"video"\}/);
  assert.match(wt.stdout, /^ {2}option: video$/m);
  assert.match(cli('show', id).stdout, /^ {2}decision: accepted, option: video \(rev 1, /m);
  const lw = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '5', '--quiet'], { env });
  assert.equal(lw.code, 0, lw.out);
  assert.match(lw.stdout, new RegExp(`^PROPOSAL ${id} decided accepted, option: video by user at \\S+: the smallest file$`, 'm'));
  // the user changes their mind; the lead records the new pick from chat with decide --option
  assert.equal((await postJson(`/api/proposals/${id}/undo`, { rev: 1 })).status, 200);
  assert.match(cli('decide', id, '--by', 'lead', '--value', 'accept').stderr, /say which one you accept/);
  assert.match(cli('decide', id, '--by', 'lead', '--value', 'reject', '--option', 'tiles').stderr, /reject is for the whole proposal/);
  assert.match(cli('decide', id, '--by', 'lead', '--value', 'accept', '--option', 'tiles', '--notes', 'user said tiles in chat').stdout,
    new RegExp(`^DECIDED ${id} {2}\\[accepted rev 1\\] {2}hero {2}by de-opts: Word swap, three ways \\(3 options\\) -> accepted, option: tiles \\(notes: user said tiles in chat\\)$`, 'm'));
  const lw2 = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '5', '--quiet', '--json'], { env });
  assert.equal(lw2.code, 0, lw2.out);
  assert.deepEqual(JSON.parse(lw2.stdout).filter((x) => x.kind === 'proposal').map((x) => [x.event, x.option, x.wasOption]), [['undecided', null, 'video'], ['decided', 'tiles', 'video']]);
  const any = cli('wait', '--any', '--by', 'de-opts', '--since', wd.at, '--timeout', '5', '--quiet');
  assert.equal(any.code, 0, any.out);
  assert.match(any.stdout, new RegExp(`^PROPOSAL ${id} undecided \\(was accepted, option: video\\) by user at `, 'm'));
  assert.match(any.stdout, new RegExp(`^PROPOSAL ${id} decided accepted, option: tiles \\(was accepted, option: video\\) by lead at \\S+: user said tiles in chat$`, 'm'));
});

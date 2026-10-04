// Proposal holds and stale decisions end to end (ts-proposal-hold, user T-030): `console.mjs proposal hold|unhold`,
// `revise --keep-decision|--unhold`, the page API refusing a decision while held, `show --json` decisionState, the
// waits (not met while held or stale, met on the re-decision) and the lead's `thread wait` waking on the hold, the
// stale decision and the re-decision. Temp state dir, page server on port 0, fake images.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, startProc, request } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

const CON = tool('console.mjs');
let env, srv, base, src;
const cli = (...a) => node(CON, ['proposal', ...a], { env });
const cliAsync = (...a) => nodeAsync(CON, ['proposal', ...a], { env });
const get = (p) => request(new URL(p, base).href, {});
const postJson = (p, body) => request(new URL(p, base).href, { method: 'POST', headers: { 'content-type': 'application/json', 'x-console': '1' }, body: JSON.stringify(body) });
const json = (r) => JSON.parse(r.text);
const showJson = (id) => JSON.parse(cli('show', id, '--json').stdout);

before(async () => {
  env = { FW_STATE_DIR: tempDir('fw-proposal-hold-e2e-') };
  src = tempDir('fw-proposal-hold-e2e-src-');
  writePng(join(src, 'a.png'), 8, 6, [10, 20, 30]);
  writePng(join(src, 'b.png'), 8, 6, [10, 20, 30], [250, 250, 250]);
  writeFileSync(join(src, 'p.json'), JSON.stringify({
    schema: 'fw-proposal/1', title: 'Countdown strip', area: 'hero', problem: 'Forty layers repaint per tick.',
    idea: 'One strip.', looksSame: 'Same digits.', visualDiff: ['Nothing visible.'],
    gain: [{ what: 'Layers per tick', before: '40', after: '1', tag: 'OBSERVED', how: 'layer tree, 3 runs' }], risk: 'Font changes.',
    live: { none: 'Test fixture: no page to try.' }, // I-109
    compare: { a: { label: 'Original' }, b: { label: 'Strip' }, shots: [{ caption: 'Top', a: 'a.png', b: 'b.png' }] },
  }));
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('hold/unhold: the CLI, list, show --json, the page API refuses a decision, wait reports the hold', async () => {
  assert.notEqual(srv.port, 5173);
  assert.match(cli('post', '--by', 'fix-strip', '--file', join(src, 'p.json')).stdout, /^POSTED PR-001: /);
  assert.match(cli('hold', 'PR-001', '--by', 'lead').stderr, /--note/);
  const h = cli('hold', 'PR-001', '--by', 'lead', '--note', 'errors in the card; being revised');
  assert.equal(h.code, 0, h.out);
  assert.match(h.stdout, /^HELD PR-001 {2}\[proposed rev 1, on hold\].* ON HOLD \(lead\): errors in the card; being revised$/m);
  assert.match(h.stdout, /the page shows the note and the decision buttons are off until: node tools\/console\.mjs proposal unhold PR-001/);
  assert.match(cli('list').stdout, /^PR-001 {2}\[proposed rev 1, on hold\]/m);
  assert.equal(cli('list', '--waiting').stdout.trim(), 'no proposals waiting for the user');
  const s = showJson('PR-001');
  assert.deepEqual([s.hold.by, s.hold.note, s.decisionState], ['lead', 'errors in the card; being revised', null]);
  const v = json(await get('/api/proposals/PR-001')).proposal;
  assert.equal(v.hold.note, 'errors in the card; being revised');
  assert.equal(json(await get('/api/proposals')).proposals[0].hold.by, 'lead');
  const no = await postJson('/api/proposals/PR-001/decide', { value: 'accept', rev: 1 });
  assert.equal(no.status, 409);
  assert.match(json(no).error, /PR-001 is on hold \(lead: errors in the card; being revised\)/);
  const cd = cli('decide', 'PR-001', '--by', 'lead', '--value', 'accept');
  assert.equal(cd.code, 1, cd.out);
  assert.match(cd.stderr, /on hold/);
  const w = cli('wait', 'PR-001', '--timeout', '1', '--quiet');
  assert.equal(w.code, 3, w.out);
  assert.match(w.stdout, /^TIMEOUT proposal PR-001 decided after \d+ s: proposed, rev 1, on hold \(lead: errors in the card/);
  assert.match(w.stderr, /^note: PR-001 is on hold \(lead: errors in the card; being revised\): this wait is met only by a final decision, after it is released/m);
  const u = cli('unhold', 'PR-001', '--by', 'lead');
  assert.equal(u.code, 0, u.out);
  assert.match(u.stdout, /^UNHELD PR-001 {2}\[proposed rev 1\]/);
  assert.match(cli('unhold', 'PR-001', '--by', 'lead').stderr, /is not on hold/);
  assert.equal((await postJson('/api/proposals/PR-001/decide', { value: 'accept', rev: 1 })).status, 200);
  assert.equal(showJson('PR-001').decisionState, 'final');
});

test('PR-008: accepted, held (under review), revised (stale), released, re-decided; waits and the lead\'s thread wait follow', async () => {
  // the lead's standing wait: its read mark starts now
  assert.equal(node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '0', '--quiet'], { env }).code, 3);
  const h = cli('hold', 'PR-001', '--by', 'lead', '--note', 'a review found a missed difference');
  assert.equal(h.code, 0, h.out);
  assert.match(h.stdout, /^ {2}the decision \(accepted, rev 1\) is now under review: kept, but not final/m);
  assert.equal(showJson('PR-001').decisionState, 'under-review');
  assert.equal(cli('wait', 'PR-001', '--until', 'decided', '--timeout', '1', '--quiet').code, 3, 'an under-review decision does not satisfy decided');
  const rv = cli('revise', 'PR-001', '--by', 'fix-strip', '--note', 'corrected control rate; added the missed difference');
  assert.equal(rv.code, 0, rv.out);
  assert.match(rv.stdout, /^REVISED PR-001 {2}\[proposed rev 2, on hold\]/);
  assert.match(rv.stdout, /^ {2}the decision accepted on rev 1 is stale: the user decides again on rev 2 \(still on hold: proposal unhold PR-001, or revise --unhold\)$/m);
  const s = showJson('PR-001');
  assert.deepEqual([s.state, s.decisionState, s.decision, s.staleDecision.value, s.staleDecision.rev], ['proposed', 'stale', null, 'accepted', 1]);
  const decided = cliAsync('wait', 'PR-001', '--until', 'decided', '--timeout', '20', '--quiet', '--json');
  assert.match(cli('unhold', 'PR-001', '--by', 'lead', '--note', 'revision 2 is ready').stdout, /^UNHELD PR-001 {2}\[proposed rev 2\]/);
  const p = json(await get('/api/proposals/PR-001')).proposal;
  assert.deepEqual([p.decisionState, p.staleDecision.value, p.hold], ['stale', 'accepted', undefined]);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal((await postJson('/api/proposals/PR-001/decide', { value: 'accept', rev: 2, notes: 'yes, on the corrected card' })).status, 200);
  const dw = await decided;
  assert.equal(dw.code, 0, dw.out);
  const d = JSON.parse(dw.stdout);
  assert.deepEqual([d.rev, d.value, d.was], [2, 'accepted', 'accepted']);
  const lw = node(CON, ['thread', 'wait', '--as', 'lead', '--timeout', '5', '--quiet'], { env });
  assert.equal(lw.code, 0, lw.out);
  assert.match(lw.stdout, /^PROPOSAL PR-001 on hold, decision accepted under review \(not final\) by lead at \S+: a review found a missed difference$/m);
  assert.match(lw.stdout, /^PROPOSAL PR-001 decision stale \(was accepted on rev 1\): re-decide on rev 2, revised by fix-strip at \S+: corrected control rate/m);
  assert.match(lw.stdout, /^PROPOSAL PR-001 decided accepted \(was accepted\) by user at \S+: yes, on the corrected card$/m);
  assert.match(lw.stdout, /3 proposal decision event\(s\) in PR-001/);
  // a wording fix keeps the decision
  const k = cli('revise', 'PR-001', '--by', 'fix-strip', '--note', 'typo', '--keep-decision');
  assert.equal(k.code, 0, k.out);
  assert.match(k.stdout, /^REVISED PR-001 {2}\[accepted rev 3\]/);
  assert.match(k.stdout, /^ {2}the decision accepted \(rev 2\) is kept \(--keep-decision\)/m);
  assert.equal(showJson('PR-001').decisionState, 'final');
});

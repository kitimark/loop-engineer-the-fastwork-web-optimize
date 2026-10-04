// Overdue revisions end to end (incident I-177, user T-154 #7/#9): `console.mjs proposal revising` and `proposal
// overdue` as commands, and tools/idle.mjs check running the same rule in its pass: OVERDUE after --proposal-min
// (default 15) minutes without a mark, exit 3, one thread as the lead assigned to the lead only, closed once the author
// marks the revision. Temp state dir, the test clock FW_IDLE_NOW; no port 5173, phone, Chrome or real store.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

const IDLE = tool('idle.mjs');
const CON = tool('console.mjs');
let env, P, T, dir;

before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-overdue-e2e-');
  env = { FW_STATE_DIR: process.env.FW_STATE_DIR, FW_PROPOSAL_PHONE: 'off' };
  P = await import('../../tools/lib/proposal.mjs');
  T = await import('../../tools/lib/console-threads.mjs');
  dir = tempDir('fw-proposal-overdue-src-');
  mkdirSync(join(dir, 'shots'), { recursive: true });
  writePng(join(dir, 'shots', 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'shots', 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
});

const raw = {
  schema: 'fw-proposal/1', title: 'Strip the countdown layers', area: 'hero',
  problem: 'The countdown repaints 40 layers per tick.', idea: 'One strip, moved by transform.',
  looksSame: 'Same digits, same timing.', visualDiff: ['Nothing visible at 1x.'],
  gain: [{ what: 'Layers repainted per tick', before: '40', after: '1', better: 'better', tag: 'OBSERVED', how: 'Chrome layer tree, 3 runs' }],
  risk: 'A font change needs a new strip.', live: { none: 'Test fixture: no page to try.' },
  compare: { a: { label: 'Original' }, b: { label: 'Strip' }, shots: [{ caption: 'Top', a: 'shots/a-0.png', b: 'shots/b-0.png' }] },
};

test('idle.mjs check and proposal overdue: OVERDUE after 15 min without a mark (exit 3), one thread to the lead, closed by `proposal revising`', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-strip', raw, baseDir: dir });
  await P.decide(p.id, { value: 'change', notes: 'One row please', rev: 1 });
  const at = (min) => new Date(Date.parse(P.get(p.id).decision.at) + min * 60000).toISOString();
  const idle = (min, ...a) => node(IDLE, ['check', ...a], { env: { ...env, FW_IDLE_NOW: at(min) } });
  let r = idle(10, '--by', 'lead');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /OVERDUE/);
  r = idle(20, '--by', 'lead');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, new RegExp(`^OVERDUE ${p.id} rev 2 \\(de-strip\\): not started 20 min after the change request at \\d\\d:\\d\\dZ \\(limit 15 min\\)$`, 'm'));
  const posted = r.stdout.match(new RegExp(`^POSTED (T-\\d+) ${p.id}: .* \\(to lead\\)$`, 'm'));
  assert.ok(posted, r.stdout);
  assert.deepEqual(T.getThread(posted[1]).assignees, ['lead']);
  r = idle(21, '--by', 'lead');
  assert.equal(r.code, 3);
  assert.doesNotMatch(r.stdout, /POSTED/, 'one thread per overdue period');
  r = idle(22, '--proposal-min', '30');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /OVERDUE|ENDED/, '--proposal-min: under a larger limit, and the episode goes on');
  // the console command: the same rule; usage errors exit 1
  r = node(CON, ['proposal', 'overdue', '--start-min', '0'], { env }); // the real clock: a moment after the decision
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, new RegExp(`^OVERDUE ${p.id} rev 2`, 'm'));
  assert.equal(node(CON, ['proposal', 'overdue', '--start-min', 'soon'], { env }).code, 1);
  // the author marks it: no longer overdue, the lead's next pass closes the thread
  r = node(CON, ['proposal', 'revising', p.id, '--by', 'de-strip', '--note', 'Rebuilding the strip as one row', '--eta', '+40m'], { env });
  assert.equal(r.code, 0, r.err || r.out);
  assert.match(r.stdout, new RegExp(`^REVISING ${p.id} rev 2 by de-strip: Rebuilding the strip as one row \\(expected by \\d\\d:\\d\\dZ\\)$`, 'm'));
  r = node(CON, ['proposal', 'list'], { env });
  assert.match(r.stdout, new RegExp(`^${p.id} .* REVISING rev 2 \\(de-strip\\) since \\d\\d:\\d\\dZ, eta \\d\\d:\\d\\dZ: Rebuilding the strip as one row$`, 'm'));
  r = node(IDLE, ['check', '--by', 'lead'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^ENDED ${p.id}: its revision is no longer overdue; thread ${posted[1]}$`, 'm'));
  assert.match(r.stdout, new RegExp(`^CLOSED ${posted[1]} `, 'm'));
  assert.equal(T.getThread(posted[1]).status, 'closed');
  assert.equal(node(CON, ['proposal', 'overdue'], { env }).code, 0);
  // a worker who is not the author is refused
  r = node(CON, ['proposal', 'revising', p.id, '--by', 'fix-other', '--note', 'x'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /only its author \(de-strip\) or the lead/);
});

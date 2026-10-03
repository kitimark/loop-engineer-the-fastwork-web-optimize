// T-048 (user: talk inside a proposal to clarify questions): tools/lib/proposal-talk.mjs in-process, on top of the
// I-090 comments. A question on a proposal is a console thread anchored on it ("PR-001", "PR-001/section:gain", …);
// the server hands it to the author at once (talkRoute -> createThread routeTo), so the author's thread wait wakes.
// Checks: the section anchors, proposalOf, talkRoute (author / lead-authored / draft / other pages), createThread's
// routeTo (page only, history "console", lead and user never assignees), talkThreads/talkView/talkIndex counts, the
// author may reply, talkText/talkList, and that a question changes nothing in the proposal's decision.
// Own $FW_STATE_DIR; fake names only.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

let P, T, K, C, dir;
before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-talk-');
  P = await import('../../tools/lib/proposal.mjs');
  T = await import('../../tools/lib/console-threads.mjs');
  K = await import('../../tools/lib/proposal-talk.mjs');
  C = await import('../../tools/lib/console-comments.mjs');
  dir = tempDir('fw-proposal-talk-src-');
  mkdirSync(join(dir, 'shots'), { recursive: true });
  writePng(join(dir, 'shots', 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'shots', 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
});

const sample = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Hero glow as a pre-rendered image', area: 'hero', topic: 'style-recalc-r4',
  problem: 'Every scroll frame restyles 412 elements.', idea: 'Draw the glow once into an image.',
  looksSame: 'The glow is static while you scroll.', visualDiff: ['The glow no longer follows the cursor.'],
  gain: [{ what: 'Elements restyled per frame', before: '412', after: '38', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' }],
  risk: 'A design change needs a new image.',
  compare: { a: { label: 'Original', url: 'https://localhost:5612/' }, b: { label: 'PoC', url: 'https://localhost:5613/' }, shots: [{ caption: 'Top', a: 'shots/a-0.png', b: 'shots/b-0.png' }], view: 'blink' },
  ...over,
});
const post = async (by, over, opts = {}) => (await P.postProposal({ by, raw: sample(over), baseDir: dir, ...opts })).proposal;
const ask = (anchor, text = 'What does 412 mean here?') => {
  const route = K.talkRoute(anchor);
  return T.createThread({ title: C.commentTitle(anchor, text), text, anchor, fromPage: true, ...(route?.to.length && { routeTo: route.to, routeNote: route.note }) }).then((r) => r.thread);
};

test('anchors: proposal sections (also inside an option) are items of the proposals page; proposalOf names the proposal', () => {
  for (const it of ['PR-001/section:gain', 'PR-001/section:problem', 'PR-001/section:looks-same', 'PR-001/option:tiles/section:risk', 'PR-001/section:visual-diff']) {
    assert.equal(C.normAnchor({ page: 'proposals', item: it }).item, it);
  }
  for (const bad of ['PR-001/section:other', 'PR-001/section:gain/shot:1', 'PR-001/shot:1/section:gain']) assert.throws(() => C.normAnchor({ page: 'proposals', item: bad }), /item/);
  assert.equal(C.itemText({ page: 'proposals', item: 'PR-001/section:gain' }), 'PR-001, what it saves');
  assert.equal(C.itemText({ page: 'proposals', item: 'PR-001/option:tiles/section:risk' }), 'PR-001 option tiles, risk');
  assert.equal(C.proposalOf({ page: 'proposals', item: 'PR-001/option:tiles/section:risk' }), 'PR-001');
  assert.equal(C.proposalOf({ page: 'proposals', item: 'part:page' }), null, 'the page itself is no proposal');
  assert.equal(C.proposalOf({ page: 'status', item: 'status:cd-strip' }), null);
  assert.equal(C.proposalOf(null), null);
});

test('talkRoute: a shown proposal goes to its author; one by the lead to nobody else; drafts, unknown ids and other pages: null', async () => {
  const p = await post('de-hero');
  assert.deepEqual(K.talkRoute({ page: 'proposals', item: `${p.id}/section:gain` }), { id: p.id, to: ['de-hero'], note: `author of ${p.id}` });
  const d = await post('de-hero', { title: 'A draft' }, { draft: true });
  assert.equal(K.talkRoute({ page: 'proposals', item: d.id }), null, 'a draft is not on the page');
  assert.equal(K.talkRoute({ page: 'proposals', item: 'PR-999' }), null);
  assert.equal(K.talkRoute({ page: 'proposals', item: 'part:page' }), null);
  assert.equal(K.talkRoute({ page: 'status', item: 'status:cd-strip' }), null);
  let lp = null;
  try { lp = await post('lead', { title: 'By the lead' }); } catch {}
  if (lp) assert.deepEqual(K.talkRoute({ page: 'proposals', item: lp.id }).to, [], 'the lead reads every thread anyway');
});

test('createThread routeTo: only for the user\'s comments; assigned at once with a "console" history line; never lead or user', async () => {
  await assert.rejects(T.createThread({ by: 'lead', title: 'x', text: 'y', routeTo: ['de-hero'] }), /routeTo is for the user/);
  const t = (await T.createThread({ title: 'Comment on PR-001', text: 'Why?', anchor: { page: 'proposals', item: 'PR-001' }, fromPage: true, routeTo: ['de-hero', 'lead', 'user', 'de-hero', 'bad name!'], routeNote: 'author of PR-001' })).thread;
  assert.deepEqual(t.assignees, ['de-hero']);
  assert.deepEqual(t.history.map((h) => [h.who, h.action, h.note]), [['console', 'assign', 'de-hero (author of PR-001)']]);
  const plain = (await T.createThread({ title: 'Plain', text: 'no route', fromPage: true })).thread;
  assert.deepEqual(plain.assignees, []);
  assert.equal(plain.history.length, 0);
});

test('a question on a proposal: assigned to the author, the author\'s thread wait wakes, the author answers; talkView and talkIndex see it', async () => {
  const p = await post('de-glow', { title: 'Glow tiles' });
  const t = await ask({ page: 'proposals', item: `${p.id}/section:gain`, label: 'What it saves', quote: '412' });
  assert.deepEqual(t.assignees, ['de-glow']);
  // the author's wait wakes on it (an assigned thread with a user message the author has not read)
  const r = T.threadWaitCondition({ as: 'de-glow' }).check();
  assert.equal(r.met, true, JSON.stringify(r));
  assert.deepEqual(JSON.parse(r.detail).map((x) => x.id), [t.id]);
  assert.equal(JSON.parse(r.detail)[0].anchor.url, `/proposals#${p.id}`);
  assert.ok(!JSON.stringify(T.threadWaitCondition({ as: 'fix-other' }).check()).includes(t.id), 'an agent not on it does not wake');
  // the view under the proposal
  const v = K.talkView(p.id);
  assert.equal(v.id, p.id);
  assert.deepEqual(v.to, ['de-glow', 'lead']);
  assert.deepEqual(v.threads.map((x) => x.id), [t.id]);
  assert.equal(v.threads[0].anchor.itemText, `${p.id}, what it saves`);
  assert.equal(v.threads[0].messages[0].text, 'What does 412 mean here?');
  let idx = K.talkIndex();
  assert.deepEqual(idx[p.id], { count: 1, open: 1, waiting: 1, unread: 0, yourTurn: 0 });
  // the author answers (assigned: allowed); the user has an unread answer, nothing waits any more
  await T.replyAgent(t.id, { by: 'de-glow', text: 'Elements restyled in each frame; 38 after the change.' });
  idx = K.talkIndex();
  assert.deepEqual(idx[p.id], { count: 1, open: 1, waiting: 0, unread: 1, yourTurn: 0 });
  // an agent who is not the author nor the lead may not answer in it
  await assert.rejects(T.replyAgent(t.id, { by: 'fix-other', text: 'me too' }), /assigned|not/i);
  // the CLI text: every message, and how to answer
  const txt = K.talkText(p.id, 'de-glow');
  assert.match(txt, new RegExp(`^${p.id} "Glow tiles" by de-glow`));
  assert.ok(txt.includes('What does 412 mean here?') && txt.includes('38 after the change'), txt);
  assert.match(txt, /thread reply <T-id> --by de-glow/);
  assert.match(txt, /a question is no decision/);
  assert.ok(K.talkList({}).some((l) => l.startsWith(`${p.id}  1 thread(s), 0 waiting`)));
  assert.ok(!K.talkList({ unanswered: true }).some((l) => l.startsWith(p.id)), 'answered: not in --unanswered');
  // a question is not a decision: the proposal is unchanged
  const after = P.get(p.id);
  assert.equal(after.state, 'proposed');
  assert.equal(after.rev, p.rev);
  assert.equal((after.decisions || []).length, 0);
});

test('talkView: null for a draft and an unknown proposal; threads on other proposals and pages stay out', async () => {
  const d = await post('de-hero', { title: 'Another draft' }, { draft: true });
  assert.equal(K.talkView(d.id), null);
  assert.equal(K.talkView('PR-998'), null);
  const a = await post('de-a', { title: 'Proposal A' });
  const b = await post('de-b', { title: 'Proposal B' });
  const ta = await ask({ page: 'proposals', item: a.id });
  await ask({ page: 'proposals', item: `${b.id}/section:risk` });
  await T.createThread({ title: 'Status note', text: 'x', anchor: { page: 'status', item: 'status:cd-strip' }, fromPage: true });
  assert.deepEqual(K.talkView(a.id).threads.map((x) => x.id), [ta.id]);
  assert.deepEqual(K.talkThreads(b.id).map((x) => x.assignees), [['de-b']]);
  // markTalkRead: the author's reads move to the last message
  await K.markTalkRead(a.id, 'de-a');
  assert.equal(T.getThread(ta.id).reads['de-a'], 1);
});

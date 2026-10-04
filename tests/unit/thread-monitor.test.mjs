// I-147 (PR-020 N2): `console.mjs thread wait --monitor` prints every wake as ONE line that starts with
// `WAKE <kind> <id>`, so a Claude Code Monitor needs no grep. The CLAUDE.md filter kept only the TRIAGE/NEW lines
// and dropped a proposal decision (PR-019, the lead missed it for 16 min). Covered here: the formatters (new, triage,
// escalate, proposal, end, never), one line each with no line break, short text; the e2e test in
// tests/e2e/console-threads.test.mjs runs the persistent listener. Fake data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const T = await import('../../tools/lib/console-threads.mjs');
const PR = await import('../../tools/lib/proposal.mjs');

const oneLineEach = (L) => { for (const l of L) { assert.match(l, /^WAKE [a-z]+ \S+/, l); assert.doesNotMatch(l, /\n/, l); } };

test('I-147: a thread wake gives one WAKE new line per message: number, author, the text on one line, cut short', () => {
  const long = `word ${'x'.repeat(400)}`;
  const L = T.wakeLines({ id: 'T-004', title: 'Hero', messages: [
    { n: 3, by: 'user', at: '2026-10-04T10:00:00Z', text: 'First line\nsecond line' },
    { n: 4, by: 'user', at: '2026-10-04T10:00:01Z', text: long, forLead: true },
    { n: 5, by: 'user', at: '2026-10-04T10:00:02Z', text: '', images: [{ file: 'm5-1.png' }, { file: 'm5-2.png' }] },
  ] });
  oneLineEach(L);
  assert.equal(L.length, 3);
  assert.equal(L[0], 'WAKE new T-004 #3 by user: First line second line');
  assert.match(L[1], /^WAKE new T-004 #4 by user \(for the lead\): word x+…$/);
  assert.ok(L[1].length <= 'WAKE new T-004 #4 by user (for the lead): '.length + T.WAKE_TEXT_MAX, 'short text');
  assert.equal(L[2], 'WAKE new T-004 #5 by user: [2 images]');
});

test('I-147: a triage wake: WAKE triage per message with its reason, WAKE escalate per escalation; nothing else', () => {
  const L = T.wakeLines({ id: 'T-009', title: 'Routing', why: ['#2 for the lead', 'escalated by fix-a: needs a decision', '#4 nobody listening (assigned: fix-b)'], messages: [
    { n: 2, by: 'user', at: 'x', text: 'Please decide', forLead: true },
    { n: 4, by: 'user', at: 'x', text: 'Anyone?' },
  ] });
  oneLineEach(L);
  assert.deepEqual(L, [
    'WAKE triage T-009 #2 by user (for the lead): Please decide',
    'WAKE triage T-009 #4 by user (nobody listening (assigned: fix-b)): Anyone?',
    'WAKE escalate T-009 by fix-a: needs a decision',
  ]);
  // an escalation alone (no message) still wakes with one line
  assert.deepEqual(T.wakeLines({ id: 'T-010', why: ['escalated by fix-c: pick A or B'], messages: [] }), ['WAKE escalate T-010 by fix-c: pick A or B']);
});

test('I-147: a proposal decision is one WAKE proposal line (the line the old listener filter dropped)', () => {
  const e = { id: 'PR-019', event: 'decided', value: 'accepted', option: 'tiles', who: 'user', at: '2026-10-04T13:30:00Z', notes: 'Go with tiles\nand keep the old one', title: 'Hero word', rev: 2, by: 'de-x' };
  const l = PR.proposalWakeLine(e);
  oneLineEach([l]);
  assert.equal(l, 'WAKE proposal PR-019 decided accepted, option: tiles by user at 2026-10-04T13:30:00Z: Go with tiles and keep the old one');
  const s = PR.proposalWakeLine({ ...e, event: 'stale', was: 'accepted', wasRev: 1, rev: 2, notes: '' });
  assert.match(s, /^WAKE proposal PR-019 decision stale \(was accepted on rev 1\): re-decide on rev 2, revised by user at \S+$/);
  assert.ok(PR.proposalWakeLine({ ...e, notes: 'y'.repeat(900) }).length < 300, 'short text');
});

test('I-147: end and never lines name the reader and how to re-arm', () => {
  assert.equal(T.wakeEndLine({ reader: 'lead', triage: true, waitedSec: 3600 }), 'WAKE end lead timeout after 3600 s; re-arm: node tools/console.mjs thread wait --as lead --triage --monitor');
  assert.equal(T.wakeEndLine({ reader: 'fix-a', waitedSec: 5 }), 'WAKE end fix-a timeout after 5 s; re-arm: node tools/console.mjs thread wait --as fix-a --monitor');
  assert.equal(T.wakeNeverLine({ id: 'T-003', why: 'T-003 was closed\nfor good' }), 'WAKE never T-003 T-003 was closed for good');
});

test('I-181: the 1 s re-check after a wake: not met any more (another reader with the same name took the news) is null, not a crash', () => {
  const news = [{ id: 'T-002', title: 'x', messages: [{ n: 1, by: 'user', at: 'x', text: 'hi' }] }];
  const ev = [{ id: 'PR-001', event: 'decided' }];
  assert.equal(T.settledWake({ met: false, state: '2 thread(s), nothing new' }), null);
  // still met: the re-check is what prints (it may hold more of a burst), in both detail shapes
  assert.deepEqual(T.settledWake({ met: true, detail: JSON.stringify(news) }), { news, ev: [] });
  assert.deepEqual(T.settledWake({ met: true, detail: JSON.stringify({ news, ev }) }), { news, ev });
});

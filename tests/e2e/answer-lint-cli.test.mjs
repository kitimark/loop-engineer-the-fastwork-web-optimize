// Answer-format lint through the CLI (I-146, user T-123): `console.mjs thread reply|new|lint`, the step text of `post`
// and `proposal post|revise` refuse text that breaks memory/answer-format.md (exit 1, nothing stored), unless
// --force-format "<reason>" (logged); --check-format only checks. Temp store ($FW_STATE_DIR); the lint is on here
// (FW_ANSWER_LINT=on; tests/helpers.mjs switches it off for every other test).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const CON = tool('console.mjs');
let state, env;
const cli = (args, extra = {}) => node(CON, args, { env: { ...env, ...extra } });
const thread = (id) => JSON.parse(cli(['thread', 'show', id, '--json']).stdout);
const GOOD = 'Done: the width check passed.\nWhat you need to do: nothing.';
const BAD = "It was PR-015: you chose 'keep'. Merged here: T-040.";

before(() => {
  state = tempDir('fw-answer-lint-');
  env = { FW_STATE_DIR: state, FW_ANSWER_LINT: 'on' };
  const r = cli(['thread', 'new', '--by', 'lead', '--title', 'Screen widths', '--text', GOOD]);
  assert.equal(r.code, 0, r.out);
});

test('thread reply: a bad text is refused with one line per problem and the rule; nothing is stored', () => {
  const r = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--text', BAD]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^FORMAT REFUSED thread reply T-001: 3 error\(s\), nothing posted/);
  assert.match(r.stderr, /FORMAT error \(a\) action-line/);
  assert.match(r.stderr, /FORMAT error \(d\) unexplained-id, line 1: "PR-015"/);
  assert.match(r.stderr, /FORMAT error \(d\) unexplained-id, line 1: "T-040"/);
  assert.match(r.stderr, /Answer format \(memory\/answer-format\.md/);
  assert.equal(thread('T-001').messages.length, 1);
});

test('thread reply: a good text posts; the default (FW_ANSWER_LINT unset) lints too', () => {
  const r = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--text', 'Yes: the iPad check (T-040) is next.\nWhat you need to do: nothing.'], { FW_ANSWER_LINT: '' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REPLIED T-001 #2/);
  assert.equal(cli(['thread', 'reply', 'T-001', '--by', 'lead', '--text', BAD], { FW_ANSWER_LINT: '' }).code, 1);
});

test('thread reply: ids the user wrote in the thread need no explanation', () => {
  const t = JSON.parse(readFileSync(join(state, 'console', 'threads', 'T-001.json'), 'utf8'));
  t.messages.push({ n: t.messages.length + 1, at: new Date().toISOString(), by: 'user', text: 'what about PR-019 ?' });
  writeFileSync(join(state, 'console', 'threads', 'T-001.json'), JSON.stringify(t));
  const r = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--check-format', '--text', 'PR-019 is next.\nWhat you need to do: nothing.']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^FORMAT OK thread reply T-001/);
});

test('--check-format posts nothing (exit 0 ok, 1 not); thread lint checks a draft file', () => {
  const n = thread('T-001').messages.length;
  const ok = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--check-format', '--text', GOOD]);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /FORMAT OK thread reply T-001 \(nothing posted: --check-format\)/);
  const bad = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--check-format', '--text', BAD]);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /FORMAT FAIL thread reply T-001: 3 error\(s\)/);
  assert.equal(thread('T-001').messages.length, n);
  const f = join(state, 'draft.md');
  writeFileSync(f, BAD);
  const l = cli(['thread', 'lint', '--file', f]);
  assert.equal(l.code, 1);
  assert.match(l.stdout, /FORMAT FAIL draft: 3 error\(s\)/);
  writeFileSync(f, GOOD);
  assert.equal(cli(['thread', 'lint', 'T-001', '--file', f]).code, 0);
  assert.equal(cli(['thread', 'lint', '--kind', 'field', '--text', 'Swipe up twice.']).code, 0);
});

test('--force-format "<reason>" posts anyway and logs the reason for the lead', () => {
  const r = cli(['thread', 'reply', 'T-001', '--by', 'lead', '--force-format', 'quoting a tool line', '--text', BAD]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^REPLIED T-001 #\d+/);
  assert.match(r.stderr, /FORMAT OVERRIDE thread reply T-001: posted with 3 error\(s\), reason logged for the lead: quoting a tool line/);
  const log = readFileSync(join(state, 'console', 'answer-lint-overrides.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(log.at(-1).by, 'lead');
  assert.equal(log.at(-1).reason, 'quoting a tool line');
  assert.equal(log.at(-1).where, 'thread reply T-001');
  assert.equal(thread('T-001').messages.at(-1).text, BAD);
});

test('thread new is linted too; thread reply --help prints the rule', () => {
  const r = cli(['thread', 'new', '--by', 'lead', '--title', 'Another topic', '--text', 'See T-066.']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /FORMAT REFUSED thread new/);
  const h = cli(['thread', 'reply', '--help']);
  assert.equal(h.code, 0, h.out);
  assert.match(h.stdout, /--check-format/);
  assert.match(h.stdout, /Last line: "What you need to do: …"/);
  assert.match(h.stdout, /explain every code in a few words/);
});

test('post: the step text is checked as a field (ids explained; no action line needed)', () => {
  const bad = cli(['post', '--by', 'lead', '--kind', 'question', '--title', 'Did C-041 feel smooth?', '--yesno']);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.stderr, /FORMAT REFUSED post: 1 error\(s\)/);
  assert.match(bad.stderr, /title line 1: "C-041"/);
  assert.equal(existsSync(join(state, 'console', 'C-001.json')), false);
  const ok = cli(['post', '--by', 'lead', '--kind', 'question', '--title', 'Did the last swipe test feel smooth?', '--instructions', 'Answer yes or no.', '--yesno']);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^POSTED C-001/);
});

test('proposal post|revise: the text fields are checked before anything is read or stored', () => {
  const f = join(state, 'proposal.json');
  writeFileSync(f, JSON.stringify({ title: 'Countdown roll on the GPU', area: 'hero', problem: 'The clock repaints every frame (P-094).', idea: 'Use the K curve from P-095.', looksSame: 'Pixel-identical.', visualDiff: ['nothing visible'], gain: [] }));
  const r = cli(['proposal', 'post', '--by', 'lead', '--file', f, '--check-format']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /FORMAT FAIL proposal post: 1 error\(s\)/);
  assert.match(r.stdout, /idea line 1: "P-095"/);
  const p = cli(['proposal', 'post', '--by', 'lead', '--file', f, '--draft']);
  assert.equal(p.code, 1);
  assert.match(p.stderr, /FORMAT REFUSED proposal post/);
  assert.match(cli(['proposal', 'list', '--all']).stdout, /no proposals/);
  const rev = cli(['proposal', 'revise', 'PR-001', '--by', 'lead', '--note', 'fixed P-095', '--check-format']);
  assert.equal(rev.code, 1);
  assert.match(rev.stdout, /--note line 1: "P-095"/);
});

// Answer-format lint (I-146, user T-123): tools/lib/answer-lint.mjs checks agent text the user reads against
// memory/answer-format.md. The texts below are modelled on real replies in the console store (shortened, no personal data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintText, lintFields, proposalTexts, idsIn, sentences, gate, lintDisabled, logOverride, refusalText, LIMITS, RULE_SUMMARY } from '../../tools/lib/answer-lint.mjs';
import { tempDir } from '../helpers.mjs';

const END = 'What you need to do: nothing.';
const rules = (r) => r.errors.map((e) => `${e.rule}:${e.code}`);
const ids = (r) => r.errors.filter((e) => e.rule === 'd').map((e) => e.msg.match(/"([^"]+)"/)[1]);

test('a good answer passes: answer first, bullets, a table, explained codes, the action line last', () => {
  const r = lintText([
    '**Short answer: the width check passed on every screen.**',
    '',
    '| check | state |',
    '|---|---|',
    '| 11 widths, 375-1920 | done once: no errors |',
    '- The iPad and Mac Safari checks I promised (T-040) are next.',
    '- Fixed in a4f43dda (the table rendering fix).',
    END,
  ].join('\n'));
  assert.deepEqual(rules(r), []);
  assert.equal(r.ok, true);
});

test('the reply the user complained about (T-034 #6) is refused: unexplained codes and a long line', () => {
  const r = lintText([
    'Answer: the other-screen-width check is done, and one part is still open.',
    `- Done (de-breakpoints, finished 9 h ago): landed fixes compared with the original at 11 widths (375 to 1920 px), touch and mouse, phone landscape, Reduce Motion. No errors. Look matches in 13 of 14 setups. Savings hold at every width. Write-up: research/breakpoints/README.md.`,
    "- The one real difference (sharper hero photos on desktop with Reduce Motion) was PR-015: you chose 'keep'. Merged here: T-040, T-053, T-063.",
    END,
  ].join('\n'));
  assert.equal(r.ok, false);
  assert.ok(rules(r).includes('c:long-line'));
  assert.deepEqual(ids(r).sort(), ['PR-015', 'T-040', 'T-053', 'T-063']);
  for (const e of r.errors) assert.ok(e.hint && e.where, 'every problem has a fix hint and a line');
});

test('(a) the action line: missing, inline, heading with a short list', () => {
  assert.deepEqual(rules(lintText('Done: the server is stopped.')), ['a:action-line']);
  const inline = lintText('Received at 11:06Z: the listener works. What you need to do: nothing.');
  assert.deepEqual(rules(inline), ['a:action-line']);
  assert.match(inline.errors[0].msg, /not on its own last line/);
  assert.deepEqual(rules(lintText('Done.\n**What you need to do:** nothing.')), []);
  assert.deepEqual(rules(lintText('Done.\n\nWhat you need to do:\n- Open the two test pages.\n- Say "ready" when you can.')), []);
  assert.deepEqual(rules(lintText('Done.\nWhat you need to do: nothing.\nMore text after it.')), ['a:action-line']);
  // kind field (step text, proposal cards) has no action line
  assert.deepEqual(rules(lintText('Swipe up twice, slowly.', { kind: 'field' })), []);
});

test('(b) at most 18 non-empty lines; a table counts its rows, not its |---| line', () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `- point ${i + 1}`);
  assert.deepEqual(rules(lintText([...body(17), END].join('\n'))), []);
  assert.deepEqual(rules(lintText([...body(18), END].join('\n'))), ['b:too-long']);
  const table = ['| a | b |', '|---|---|', ...Array.from({ length: 15 }, (_, i) => `| row ${i} | ok |`), END];
  assert.equal(table.length, 18);
  assert.deepEqual(rules(lintText(table.join('\n'))), [], 'the separator line is not counted: 17 lines');
  assert.deepEqual(rules(lintText(['first', '', '', 'second', END].join('\n'))), [], 'empty lines are not counted');
});

test('(c) a line over 250 characters is refused; tables are exempt; kind field allows 600 and warns over 250', () => {
  const long = `- ${'word '.repeat(50)}`.trimEnd(); // 251 characters
  assert.equal(long.length, LIMITS.maxLineChars + 1);
  assert.deepEqual(rules(lintText(`${long}\n${END}`)), ['c:long-line']);
  assert.deepEqual(rules(lintText(`${long.slice(0, 250)}\n${END}`)), []);
  assert.deepEqual(rules(lintText(`| ${'cell '.repeat(80)} |\n${END}`)), []);
  const f = lintText(long, { kind: 'field' });
  assert.deepEqual(rules(f), []);
  assert.ok(f.warnings.some((w) => w.code === 'long-line'));
  assert.deepEqual(rules(lintText('x'.repeat(601), { kind: 'field' })), ['c:long-line']);
});

test('(d) explained ids pass: a parenthesis after words, a gloss after, a dash before, an apposition, a table row', () => {
  for (const line of [
    'The heat check (P-094) passed.',
    'Two steps are left (progress in T-100).',
    'PR-017 (the countdown fix) is ready.',
    'PR-017: the countdown fix is ready.',
    'PR-017 and PR-018 (the two countdown fixes) are ready.',
    'The countdown fix - PR-017 - is ready.',
    'The 1 is a closed thread, T-081, that still has 2 replies.',
    'The full report is in a new thread: T-105, Team bottleneck report.',
    '| PR-018 | end-of-page menu, ready to try |',
    'Open http://localhost:5173/proposals#PR-017 to see it.',
  ]) assert.deepEqual(ids(lintText(`${line}\n${END}`)), [], line);
});

test('(d) unexplained ids are refused: a bare id, a list, a clause after a colon, a commit id', () => {
  assert.deepEqual(ids(lintText(`Best build: T-066. Start over: T-087.\n${END}`)), ['T-066', 'T-087']);
  assert.deepEqual(ids(lintText(`Merged here: T-040, T-053.\n${END}`)), ['T-040', 'T-053']);
  assert.deepEqual(ids(lintText(`It was PR-015: you chose keep.\n${END}`)), ['PR-015']);
  assert.deepEqual(ids(lintText(`Land request ca9711f2 is in.\n${END}`)), ['ca9711f2']);
  assert.deepEqual(ids(lintText(`What you need to do: press Done on C-041.`)), ['C-041']);
  // each id is reported once
  assert.deepEqual(ids(lintText(`T-087 is open.\nT-087 again.\n${END}`)), ['T-087']);
});

test('(d) an id explained anywhere in the text, or known to the user in this thread, passes everywhere', () => {
  assert.deepEqual(ids(lintText(`Done: PR-018 is on the Wi-Fi.\n| PR-018 (end-of-page menu) | links below |\n${END}`)), []);
  assert.deepEqual(ids(lintText(`Decide PR-017 when ready.\n${END}`, { known: ['PR-017'] })), []);
  assert.deepEqual(ids(lintText(`Decide PR-017 when ready.\n${END}`)), ['PR-017']);
});

test('(e) a table without its |---| line under the header is refused (I-232: the console shows it as raw pipes)', () => {
  // the reply shape the user saw many times (T-230): a header row, then data rows, no separator
  const bare = lintText(['The check passed.', '| check | state |', '| widths | done |', '| touch | done |', END].join('\n'));
  assert.deepEqual(rules(bare), ['e:table-separator']);
  const e = bare.errors[0];
  assert.equal(e.line, 2, 'reported at the header row');
  assert.match(e.hint, /insert this line after line 2: "\| --- \| --- \|"/, 'consistent columns: the hint offers the separator');
  // the hint only offers it: the text itself is not rewritten
  assert.equal(lintText(['| a | b |', '| 1 | 2 |', END].join('\n')).errors[0].code, 'table-separator');
  // with the separator (any alignment form) it passes
  for (const sep of ['|---|---|', '| --- | --- |', '|:---|---:|', '| :---: | --- |', '|----|-------|']) {
    assert.deepEqual(rules(lintText(['The check passed.', '| check | state |', sep, '| widths | done |', END].join('\n'))), [], sep);
  }
  // a header with only the separator (no data rows) passes
  assert.deepEqual(rules(lintText(['| check | state |', '|---|---|', END].join('\n'))), []);
  // a single | line, pipes inside prose, a line that only starts with |, a code block: not a table, pass
  assert.deepEqual(rules(lintText(['| just one row |', END].join('\n'))), []);
  assert.deepEqual(rules(lintText(['Run a | b to pipe it, then c | d.', 'Either x | y or z.', END].join('\n'))), []);
  assert.deepEqual(rules(lintText(['| starts with a pipe', '| and again', END].join('\n'))), []);
  assert.deepEqual(rules(lintText(['```', '| a | b |', '| 1 | 2 |', '```', END].join('\n'))), []);
  // two tables split by a blank line: each checked on its own
  assert.deepEqual(rules(lintText(['| a | b |', '|---|---|', '| 1 | 2 |', '', '| c | d |', '| 3 | 4 |', END].join('\n'))), ['e:table-separator']);
  // the renderer takes 1+ dashes per cell, so the lint does too (lead, I-232 follow-up): nothing that renders is refused
  for (const sep of ['|-|-|', '| - | :-: |', '|:-|-:|']) {
    assert.deepEqual(rules(lintText(['| a | b |', sep, '| 1 | 2 |', END].join('\n'))), [], sep);
  }
  // a separator whose column count differs from the header's: the renderer shows raw pipes too, refused
  const short = lintText(['| a | b | c |', '|---|---|', '| 1 | 2 | 3 |', END].join('\n'));
  assert.deepEqual(rules(short), ['e:table-separator']);
  assert.equal(short.errors[0].line, 1);
  assert.match(short.errors[0].msg, /separator line 2 has 2 columns, the header 3/);
  assert.match(short.errors[0].hint, /replace line 2 with: "\| --- \| --- \| --- \|"/);
  const long = lintText(['| a | b |', '|-|-|-|', END].join('\n'));
  assert.deepEqual(rules(long), ['e:table-separator']);
  assert.match(long.errors[0].hint, /replace line 2 with: "\| --- \| --- \|"/);
  // wrong separator count and ragged rows: no ready line, even out the columns first
  const both = lintText(['| a | b |', '|---|', '| 1 | 2 | 3 |', END].join('\n'));
  assert.deepEqual(rules(both), ['e:table-separator']);
  assert.doesNotMatch(both.errors[0].hint, /replace line/);
  assert.match(both.errors[0].hint, /2, 3 columns/);
  // column counts differ: no ready line offered, the hint says to even them out (escaped \| is no column)
  const ragged = lintText(['| a | b |', '| 1 | 2 | 3 |', END].join('\n'));
  assert.deepEqual(rules(ragged), ['e:table-separator']);
  assert.doesNotMatch(ragged.errors[0].hint, /insert this line/);
  assert.match(ragged.errors[0].hint, /2, 3 columns/);
  assert.match(lintText(['| a \\| b | c |', '| 1 | 2 |', END].join('\n')).errors[0].hint, /insert this line after line 1: "\| --- \| --- \|"/);
  // kind field (proposal text, step text) and lintFields label it with the field
  assert.deepEqual(rules(lintText('| a | b |\n| 1 | 2 |', { kind: 'field' })), ['e:table-separator']);
  const f = lintFields([{ path: 'idea', text: '| a | b |\n| 1 | 2 |' }]);
  assert.equal(f.errors[0].where, 'idea line 1');
  assert.match(gate(bare, { where: 'thread reply T-230', disabled: false }).err[0], /FORMAT error \(e\) table-separator, line 2: .*Fix: insert this line after line 2: "\| --- \| --- \|"/);
});

test('ids: plain numbers, words and dates are not ids; URLs are skipped', () => {
  assert.deepEqual(idsIn('62 ms vs 55 ms on 2026-10-04 at 13:42Z, build b9c7d1eb, decade 1234567, http://x.test/T-123'), ['b9c7d1eb']);
  assert.deepEqual(idsIn('T-034 and PR-015 and I-146, P-094, F-071, C-045'), ['T-034', 'PR-015', 'I-146', 'P-094', 'F-071', 'C-045']);
});

test('warnings: a long first line and a paragraph of more than 3 sentences (the text still passes)', () => {
  const r = lintText(`${'Long first line '.repeat(11)}\nOne. Two. Three. Four.\n${END}`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings.map((w) => w.code).sort(), ['long-first-line', 'long-paragraph']);
  assert.equal(sentences('One, e.g. this. Two is 1.5 ms. Three!').length, 3);
});

test('lintFields labels each problem with its field; proposalTexts takes only the prose fields', () => {
  const raw = { schema: 'x', title: 'Countdown roll (P-094 heat check)', area: 'hero', topic: 'cd-roll-ca', problem: 'Done in P-095.', compare: { a: { label: 'Original', url: 'http://localhost:1/' }, shots: [{ a: 'a.png', b: 'b.png', caption: 'hero' }] }, gain: [{ what: 'paints', before: '12', after: '3', tag: 'Chrome', how: 'counted' }], options: [{ name: 'k', idea: 'Use C-041.' }], live: { patch: 'fixes/x/patch.diff' } };
  const t = proposalTexts(raw);
  assert.deepEqual(t.map((x) => x.path), ['title', 'problem', 'compare.a.label', 'compare.shots[0].caption', 'gain[0].what', 'gain[0].how', 'options[0].idea']);
  const r = lintFields(t);
  assert.deepEqual(r.errors.map((e) => `${e.where} ${e.msg.match(/"([^"]+)"/)[1]}`), ['problem line 1 P-095', 'options[0].idea line 1 C-041']);
});

test('gate: refuse (exit 1, stderr) / check (stdout, exit 0|1) / force (logged) / disabled only in a test store', () => {
  const bad = lintText('PR-015 done');
  const good = lintText(`Done.\n${END}`);
  const dir = tempDir('fw-lint-');
  const refused = gate(bad, { where: 'thread reply T-001', dir, disabled: false });
  assert.equal(refused.proceed, false);
  assert.equal(refused.exit, 1);
  const text = refused.err.join('\n');
  assert.match(text, /^FORMAT REFUSED thread reply T-001: 2 error\(s\), nothing posted/);
  assert.match(text, /FORMAT error \(a\) action-line, line 1: .*Fix: /);
  assert.match(text, /FORMAT error \(d\) unexplained-id, line 1: "PR-015"/);
  for (const l of RULE_SUMMARY) assert.ok(text.includes(l), 'the refusal teaches the rule');
  assert.match(text, /--check-format/);
  assert.match(text, /--force-format "<reason>"/);
  assert.deepEqual(gate(good, { where: 'x', check: true, disabled: false }), { proceed: false, exit: 0, out: ['FORMAT OK x (nothing posted: --check-format)'], err: [] });
  const chk = gate(bad, { where: 'x', check: true, disabled: true });
  assert.equal(chk.exit, 1, '--check-format checks even where the lint is off');
  assert.equal(gate(bad, { where: 'x', force: '', dir, disabled: false }).exit, 1, 'an empty reason is refused');
  assert.equal(gate(bad, { where: 'x', force: '--ask', dir, disabled: false }).exit, 1, 'a flag is not a reason');
  const forced = gate(bad, { where: 'thread reply T-001', force: 'quoting the user', by: 'lead', dir, disabled: false });
  assert.equal(forced.proceed, true);
  assert.match(forced.err[0], /^FORMAT OVERRIDE thread reply T-001: posted with 2 error\(s\), reason logged for the lead: quoting the user/);
  const log = readFileSync(join(dir, 'answer-lint-overrides.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.length, 1);
  assert.deepEqual({ ...log[0], at: undefined }, { at: undefined, by: 'lead', where: 'thread reply T-001', reason: 'quoting the user', errors: ['a action-line line 1', 'd unexplained-id line 1'] });
  logOverride(dir, { by: 'x', where: 'y', reason: 'z', errors: [] });
  assert.equal(readFileSync(join(dir, 'answer-lint-overrides.jsonl'), 'utf8').trim().split('\n').length, 2);
  assert.equal(gate(bad, { where: 'x', disabled: true }).proceed, true);
  assert.equal(refusalText(bad, { where: 'w' }).split('\n')[0], 'FORMAT REFUSED w: 2 error(s), nothing posted');
});

test('lintDisabled: FW_ANSWER_LINT=off counts only with $FW_STATE_DIR (a test store), never on the real store', () => {
  assert.equal(lintDisabled({ FW_ANSWER_LINT: 'off' }), false);
  assert.equal(lintDisabled({ FW_ANSWER_LINT: 'off', FW_STATE_DIR: '/tmp/x' }), true);
  assert.equal(lintDisabled({ FW_STATE_DIR: '/tmp/x' }), false);
  assert.equal(lintDisabled({ FW_ANSWER_LINT: 'on', FW_STATE_DIR: '/tmp/x' }), false);
});

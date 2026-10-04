// Proposal gain rows (I-146, user T-126: PR-018's "What it saves" table packed the claim, the numbers, the status tag,
// the driver and a long note into one cell). The lint (rule g, tools/lib/answer-lint.mjs), the `better` verdict in the
// schema (tools/lib/proposal.mjs) and the page (tools/lib/proposals-page.html): four short cells, What | Before | After |
// Better?, how we know folded below as "Details"; old rows (no `better`) still render; markdown tables in the text.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tempDir } from '../helpers.mjs';
import * as AL from '../../tools/lib/answer-lint.mjs';

let P;
before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-gain-format-');
  P = await import('../../tools/lib/proposal.mjs');
});

const GOOD = { what: 'Glide time after the finger lifts', before: '2.7 s', after: '2.7 s', better: 'same', tag: 'OBSERVED', how: 'G driver, 8 robot swipes per build (S/W runs agree); n=8.' };
const codes = (r) => r.errors.map((e) => `${e.code} ${e.where}`);

test('gainProblems: a 4-cell row with a verdict passes; tag, driver codes and notes may sit in tag/how', () => {
  assert.deepEqual(codes(AL.gainProblems({ gain: [GOOD] })), []);
  assert.deepEqual(codes(AL.gainProblems({ gain: [{ ...GOOD, before: '53-55 (SVG)', after: 'about 58 ms (+37 ms)', what: 'Paints (Simulator, 4 s)' }] })), [], 'a 1-word paren in a number, a qualifier in the claim');
  assert.deepEqual(codes(AL.gainProblems({})), []);
});

test('gainProblems: each cell is short, carries no status word, driver or run code, or note; the verdict is required', () => {
  const r = AL.gainProblems({
    gain: [
      { ...GOOD, what: 'Frames slower than 34 ms at rest at the top of the page, per 20 s' },
      { ...GOOD, after: 'OBSERVED same' },
      { ...GOOD, before: '19-27 (S1)', after: '0 G1b' },
      { ...GOOD, before: '55 (54-55 over 5 sessions)', after: '23; strip-rw 31' },
      { ...GOOD, better: undefined },
      { ...GOOD, better: 'faster' },
      { ...GOOD, after: 'a very long after cell that explains everything at once' },
    ],
    options: [{ name: 'keep', gain: [{ ...GOOD, after: 'estimate 1-2' }] }],
  });
  assert.deepEqual(codes(r), [
    'gain-cell gain[0].what',
    'gain-tag gain[1].after',
    'gain-driver gain[2].before', 'gain-driver gain[2].after',
    'gain-note gain[3].before', 'gain-note gain[3].after',
    'gain-better gain[4].better',
    'gain-better gain[5].better',
    'gain-cell gain[6].after',
    'gain-tag options[0] (keep).gain[0].after',
  ]);
  assert.ok(r.errors.every((e) => e.rule === 'g'));
  const hint = r.errors.find((e) => e.code === 'gain-note').hint;
  assert.match(hint, /move it to the notes \("how"\) below the table/);
  assert.match(r.errors.find((e) => e.code === 'gain-tag').hint, /put it in "tag"/);
  assert.equal(AL.LIMITS.gainCell, 40);
});

test('lintProposal: prose fields and gain rows together; warnOnly turns every error into a warning (stored revisions)', () => {
  const raw = { title: 'Glide', idea: 'Use the K curve from P-095.', gain: [{ ...GOOD, better: undefined }] };
  const r = AL.lintProposal(raw);
  assert.deepEqual(r.errors.map((e) => e.code).sort(), ['gain-better', 'unexplained-id']);
  assert.equal(r.ok, false);
  const w = AL.warnOnly(r);
  assert.equal(w.ok, true);
  assert.equal(w.errors.length, 0);
  assert.equal(w.warnings.length, 2);
  // the refusal prints the gain rule after the answer-format rule when asked
  const g = AL.gate(r, { where: 'proposal post', disabled: false, rule: [...AL.RULE_SUMMARY, ...AL.GAIN_RULE] });
  assert.equal(g.proceed, false);
  assert.match(g.err[0], /Gain rows \("What it saves", user T-126\)/);
  assert.match(g.err[0], /FORMAT error \(g\) gain-better, gain\[0\]\.better/);
});

test('normalize and parseMarkdown: `better` (better|same|worse, any case) is kept; anything else is refused; old rows need none', () => {
  const md = P.parseMarkdown('---\ntitle: T\narea: hero\n---\n## Gain\n| what | before | after | better? | tag | how |\n|---|---|---|---|---|---|\n| Paints | 9 | 4 | Better | OBSERVED | Chrome, 3 runs |\n| Layouts | 2 | 2 |  | OBSERVED | same runs |\n');
  assert.equal(md.gain[0].better, 'Better');
  assert.equal(md.gain[0].how, 'Chrome, 3 runs');
  const base = { schema: 'fw-proposal/1', title: 'T', area: 'hero', problem: 'p', idea: 'i', looksSame: 'l', visualDiff: ['v'], risk: 'r', live: { none: 'fixture' }, compare: { a: { label: 'A' }, b: { label: 'B' }, shots: [] } };
  const n = P.normalize({ ...base, gain: md.gain }, { draft: true });
  assert.deepEqual(n.errors, []);
  const rows = n.fields.gain;
  assert.equal(rows[0].better, 'better');
  assert.equal('better' in rows[1], false, 'an empty verdict cell stays absent (old rows render with "—")');
  const bad = P.normalize({ ...base, gain: [{ ...GOOD, better: 'faster' }] }, { draft: true });
  assert.match(bad.errors.join('\n'), /gain\[0\]\.better: one of better, same, worse/);
  assert.deepEqual(P.GAIN_BETTER, ['better', 'same', 'worse']);
});

// ---- the page (fake DOM, as in proposal.test.mjs) ----
function page() {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this.listeners = {}; this._t = text ?? ''; this.attrs = {}; this.className = ''; this.style = {}; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  }
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const document = { getElementById: () => new N('div'), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t), querySelector: () => null };
  return new Function('window', 'document', 'location', 'fetch', 'setInterval', `${js}\nreturn { gainTable: gainTable, para: para };`)(
    { addEventListener() {} }, document, { hash: '' }, () => new Promise(() => {}), () => 0);
}
const byTag = (n, t) => n.all().filter((x) => x.tagName === t);

test('page gainTable: What | Before | After | Better?; tag, phone flag and how only in the folded details', () => {
  const { gainTable } = page();
  const t = gainTable([GOOD, { what: 'Paints', before: '9', after: '4', better: 'better', tag: 'CONFIRMED', how: 'Chrome, 3 runs', needsPhone: true }]);
  assert.deepEqual(byTag(t, 'th').map((x) => x.textContent), ['What', 'Before', 'After', 'Better?']);
  const table = byTag(t, 'table')[0];
  const cells = byTag(table, 'tr').slice(1).map((tr) => byTag(tr, 'td').map((td) => td.textContent));
  assert.deepEqual(cells, [['Glide time after the finger lifts', '2.7 s', '2.7 s', 'same'], ['Paints', '9', '4', 'better']]);
  assert.ok(!/OBSERVED|CONFIRMED|phone check needed|Chrome, 3 runs/.test(table.textContent), 'nothing of how we know inside the table');
  const det = byTag(t, 'details')[0];
  assert.ok(det, 'a details block');
  assert.equal(byTag(det, 'summary')[0].textContent, 'Details: how we know');
  assert.match(det.textContent, /OBSERVED/);
  assert.match(det.textContent, /CONFIRMED/);
  assert.match(det.textContent, /phone check needed/);
  assert.match(det.textContent, /Chrome, 3 runs/);
  assert.equal(byTag(table, 'td').find((x) => x.textContent === 'better').className, 'verdict better');
});

test('page gainTable: old rows (no `better`) still render: a verdict-word how stands in, else "—"', () => {
  const { gainTable } = page();
  const t = gainTable([
    { what: 'Glide time after the finger lifts', before: '2.7 s', after: '2.7 s', tag: 'OBSERVED', how: 'same' }, // PR-018 rev 5
    { what: 'Elements restyled per scroll frame', before: '412', after: '38', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' },
  ]);
  const table = byTag(t, 'table')[0];
  assert.deepEqual(byTag(table, 'tr').slice(1).map((tr) => byTag(tr, 'td').at(-1).textContent), ['same', '—']);
  const notes = byTag(byTag(t, 'details')[0], 'li').map((li) => li.textContent);
  assert.equal(notes.length, 2);
  assert.ok(!/OBSERVEDsame$/.test(notes[0]) && !notes[0].endsWith('same'), 'the verdict word is not repeated as a note');
  assert.match(notes[1], /Chrome trace, 3 runs/);
});

test('page para: plain paragraphs stay <p>; a pipe table or bullets in the text render as a table / list (I-129 block)', () => {
  const { para } = page();
  const plain = para('One line.\n\nSecond paragraph | with a pipe.');
  assert.deepEqual(plain.map((n) => n.tagName), ['p', 'p']);
  const md = para('The two arms:\n\n| arm | paints |\n|---|--:|\n| A | 9 |\n| B | 4 |\n\n- first\n- second');
  assert.deepEqual(md.map((n) => n.tagName), ['p', 'div', 'div']);
  assert.equal(md[1].className, 'md');
  const t = byTag(md[1], 'table')[0];
  assert.equal(t.className, 'md-table');
  assert.deepEqual(byTag(t, 'th').map((x) => x.textContent), ['arm', 'paints']);
  assert.deepEqual(byTag(t, 'td').map((x) => x.textContent), ['A', '9', 'B', '4']);
  assert.deepEqual(byTag(md[2], 'li').map((x) => x.textContent), ['first', 'second']);
});

test('stored proposals keep rendering: every proposal shape the store holds goes through gainTable without a throw', () => {
  const { gainTable } = page();
  for (const rows of [[], [{ what: 'x', before: 1, after: 2, tag: 'estimate' }], [{ what: 'y', before: '-', after: 'none', tag: 'UNRESOLVED', how: 'Better.' }]]) {
    const t = gainTable(rows);
    assert.equal(byTag(byTag(t, 'table')[0], 'tr').length, rows.length + 1);
  }
  assert.equal(byTag(gainTable([{ what: 'y', before: '-', after: 'none', tag: 'UNRESOLVED', how: 'Better.' }]), 'td').at(-1).textContent, 'better');
});

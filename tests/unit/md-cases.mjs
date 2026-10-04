// I-129 (user T-091): the small markdown subset that thread messages render on the Threads page and in the Proposals
// page's talk (T-048, its richText port, I-126). One case list, run by both pages' tests on their fake DOMs:
// console-threads.test.mjs and live-phone.test.mjs. Not a test file itself (no .test.mjs).
import assert from 'node:assert/strict';

const els = (n, tag) => n.all().filter((x) => x.tagName === tag);
const kids = (n) => n.children.map((c) => (c.tagName === '#text' ? c.textContent : `<${c.tagName}${c.className ? '.' + c.className : ''}>`));

/**
 * `render(text)` returns the message's text element (after the page drew the message); `lan(port)` the resolved href
 * the page shows for http://lan:<port>/ in that message.
 */
export async function checkMarkdown(render, { lan }) {
  // a pipe table: a header row, then a separator row (alignment from the colons); cells may hold **bold**, an escaped \|;
  // a short row is padded; the blank lines next to the table go (the table has its own margin)
  const t = await render('Result at real Serious:\n\n| Run | >50 ms | note |\n|---|:--:|--:|\n| **C** | 0 | ok |\n| V | 1 \\| 2 |\n\nDone.');
  assert.deepEqual(kids(t), ['Result at real Serious:', '<div.md-wrap>', 'Done.']);
  assert.deepEqual(els(t, 'th').map((x) => [x.textContent, x.className]), [['Run', ''], ['>50 ms', 'md-c'], ['note', 'md-r']]);
  assert.deepEqual(els(t, 'tbody').flatMap((b) => b.children).map((tr) => tr.children.map((td) => td.textContent)), [['C', '0', 'ok'], ['V', '1 | 2', '']]);
  assert.deepEqual(els(t, 'strong').map((x) => x.textContent), ['C']);
  assert.equal(els(t, 'table')[0].className, 'md-table');
  assert.equal(t.textContent, 'Result at real Serious:Run>50 msnoteC0okV1 | 2Done.');

  // "- " bullets (two spaces per level), **bold**, and the links as before (localhost, the phone's lan link)
  const b = await render('Two things:\n- **first** see http://localhost:5559/progress\n  - nested <b>x</b>\n- phone http://lan:5231/\nend **bold** here');
  assert.deepEqual(kids(b), ['Two things:', '<ul.md-list>', 'end ', '<strong>', ' here']);
  assert.deepEqual(els(b, 'li').map((x) => [x.textContent, x.className]), [['first see http://localhost:5559/progress', ''], ['nested <b>x</b>', 'md-l1'], [`phone ${lan(5231)}`, '']]);
  assert.deepEqual(els(b, 'a').map((a) => a.href ?? a.attrs.href), ['http://localhost:5559/progress', lan(5231)]);
  assert.deepEqual(els(b, 'strong').map((x) => x.textContent), ['first', 'bold']);
  assert.equal(els(b, 'b').length, 0, 'HTML in the text stays text');

  // nothing in the text becomes HTML: tags, scripts and markdown links stay text, in a table too
  const evil = '| <img src=x onerror=alert(1)> | <script>alert(1)</script> |\n|---|---|\n| **<i>x</i>** | [a](javascript:alert(1)) |';
  const e = await render(evil);
  assert.deepEqual(e.all().map((x) => x.tagName).filter((x) => !['#text', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong'].includes(x)), []);
  assert.equal(e.textContent, '<img src=x onerror=alert(1)><script>alert(1)</script><i>x</i>[a](javascript:alert(1))');

  // not markdown: exactly the text as written, text nodes only
  for (const s of ['a | b\nc | d', 'x - y, 2 ** 3 = 8 and ** spaced **', '---\nnot a table', '| only a header |', 'A | B\n---', '-no space', '**unclosed', 'line one\n\n  indented\nlast']) {
    const n = await render(s);
    assert.deepEqual(n.all().filter((x) => x.tagName !== '#text').map((x) => x.tagName), [], s);
    assert.equal(n.textContent, s);
  }
}

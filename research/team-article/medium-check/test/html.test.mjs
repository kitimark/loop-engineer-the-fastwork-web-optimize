// The small HTML parser: what the article page and Medium pages need from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, find, findAll, isTag, hasClass, decodeEntities } from '../lib/html.mjs';
import { norm, wordDiff, similarity } from '../lib/text.mjs';

test('entities, void and raw-text elements', () => {
  const d = parseHTML('<p>a &amp; b &lt;c&gt; &#x2014; &rsquo;<br>d<img src="x.png" alt="say &quot;hi&quot;">e</p><script>if (a < b && c) {}</script><style>p > a {}</style>');
  const p = find(d, isTag('p'));
  assert.equal(p.textContent, 'a & b <c> — ’de');
  assert.equal(find(d, isTag('img')).getAttribute('alt'), 'say "hi"');
  assert.equal(find(d, isTag('script')).textContent, 'if (a < b && c) {}');
  assert.equal(find(d, isTag('style')).textContent, 'p > a {}');
  assert.equal(decodeEntities('&nbsp;&mdash;&unknown;'), ' —&unknown;');
});

test('implied end tags: p closed by a block, li by the next li; stray end tags ignored', () => {
  const d = parseHTML('<div><p>one<p>two<ul><li>a<li>b</ul></span><figure><figcaption>c</figcaption></figure></div>');
  const div = find(d, isTag('div'));
  assert.deepEqual(div.children.map((e) => e.localName), ['p', 'p', 'ul', 'figure']);
  assert.deepEqual(findAll(d, isTag('li')).map((e) => e.textContent), ['a', 'b']);
});

test('self-closing SVG tags, classes, siblings, innerHTML', () => {
  const d = parseHTML('<figure class="cap x"><div class="cap-area"><svg viewBox="0 0 1 1"><rect x="0"/><text>t</text></svg></div></figure><p class="note">n</p>');
  const fig = find(d, isTag('figure'));
  assert.ok(hasClass(fig, 'cap') && hasClass(fig, 'x') && !hasClass(fig, 'ca'));
  assert.equal(fig.nextElementSibling.localName, 'p');
  assert.equal(find(d, (e) => hasClass(e, 'cap-area')).innerHTML, '<svg viewbox="0 0 1 1"><rect x="0"></rect><text>t</text></svg>', 'attribute names are read case-insensitively (lower case)');
});

test('normalization ignores what Medium may change; the word diff shows what changed', () => {
  assert.equal(norm('It’s “fine” — really… ok​'), 'It\'s "fine" - really... ok');
  assert.equal(norm('a -- b'), 'a - b');
  const dd = wordDiff('the quick brown fox jumps over the lazy dog', 'the quick red fox jumps over the lazy dog');
  assert.match(dd, /\[-brown-\]\{\+red\+\}/);
  assert.equal(wordDiff('same words', 'same words'), '(same words)');
  assert.ok(similarity('abcdef ghij', 'abcdef ghik') > 0.8);
  assert.equal(similarity('short', 'a much much longer sentence than that'), 0);
});

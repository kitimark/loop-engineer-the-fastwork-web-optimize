// edit-article-p1: v65.tpl.html + p1-ten-days-draft.html (v64, read-only) -> articles/p1-v65-edit.html.
// @@La-b@@ = v64 lines a..b verbatim, @@TAIL@@ = from the </main> line to the end, @@FIG9@@ = fig9.svg.
// Then exact-count string replacements on the copied lines (each must hit the expected number of times).
import fs from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const SRC = D + '../../articles/p1-ten-days-draft.html', OUT = D + '../../articles/p1-v65-edit.html';
const L = fs.readFileSync(SRC, 'utf8').split('\n');
const tailAt = L.findIndex((x) => x.startsWith('</main>'));
let tpl = fs.readFileSync(D + 'v65.tpl.html', 'utf8');
const warn = [];
tpl = tpl.replace(/@@L(\d+)(?:-(\d+))?@@/g, (_, a, b) => {
  const seg = L.slice(+a - 1, +(b ?? a)); for (const s of seg) if (/#src-\d+/.test(s)) warn.push(`L${a}-${b ?? a} carries ${s.match(/#src-\d+/g)}`);
  return seg.join('\n');
});
tpl = tpl.replace('@@TAIL@@', L.slice(tailAt).join('\n').replace(/\n$/, ''));
tpl = tpl.replace('@@FIG9@@', fs.readFileSync(D + 'fig9.svg', 'utf8'));
const R = [
  // Fig. 3 canvas aria + lane label (tail JS)
  ['with a few late frames and jumps', 'with a few slow frames and jumps', 1],
  ["drawn: a few late frames (up to 58 ms) per loop", "drawn: a few slow frames (up to 58 ms) per loop", 1],
  ["// Frame-rhythm illustration for capture, from Part 1's pace script", "// Frame-rhythm illustration for capture, from my first post's pace script", 1],
  // Fig. 4
  ['(lower is better; the goal metric)', '(lower is better)', 1],
  ["Chrome's big gains were in frame rate and script time, not in the late frames a thumb feels.", "Chrome's big gains were in frame rate and script time. The slow frames a thumb feels stayed where they were.", 1],
  // Fig. 7
  ['Slow frames over 34 ms through the top card, per run.', 'Slow frames over 34 ms through the hero cards, per run.', 1],
  ['Slow frames through the top card: 27 → 12 per run', 'Slow frames through the hero cards: 27 → 12 per run', 1],
  ['Hero band, frames over 34 ms. iPhone 15 Pro Max at real Serious heat', 'Hero cards, slow frames (over 34 ms). iPhone 15 Pro Max at real Serious heat', 1],
  ['V: B-R2, became v6', 'V: became best build v6', 1],
  // Fig. 8
  ['iPhone at Xcode-set Serious, robot finger', 'iPhone at Serious set by a tool (Xcode), robot finger', 1],
  // Fig. 11 (old 13)
  ['aria-label="Frame-time histogram of the slow scroll from the top to about 3,500 px', 'aria-label="Frame-time histogram of the robot\'s slow drags on 9 Oct, from the top to about 3,500 px', 1],
  ['How much: about 1 frame in 9 is late on the original, 1 in 240 on the final build', 'Slow drags, 9 Oct: about 1 frame in 9 is slow on the original, 1 in 240 on g0.0l', 1],
  ['Slow scroll from the top to y ~3,500 px, 2 runs per build pooled (about 19 s each). Each bar counts frames in one time range.', 'The robot’s slow drags from the top to y ~3,500 px, original against g0.0l, 2 runs per build pooled (about 19 s each).', 1],
  ['Final build g0.0l · 2,178 frames', 'g0.0l (9 Oct) · 2,178 frames', 1],
  ['Final build g0.0l, ', 'g0.0l, ', 5],
  ['On time (34 ms or less)', 'Not slow (34 ms or less)', 1],
  ['Late (over 34 ms): the scale is 20x taller', 'Slow (over 34 ms): the scale is 20x taller', 1],
  ['50 ms: the goal limit', '50 ms: very slow', 1],
  ['>Over 34 ms: 197 of 1,822', '>Slow (over 34 ms): 197 of 1,822', 1],
  ['. Over 50 ms: 94 (5.2 %)', '. Very slow (over 50 ms): 94 (5.2 %)', 1],
  // Fig. 12 (old 14)
  ['On the original, frames over 34 ms gather in the hero, the People deck around 1,400 to 1,700 px', 'On the original, frames over 34 ms gather in the hero, the People title and profile deck around 1,000 to 1,700 px', 1],
  ['On the final build, 5 frames go over 34 ms', 'On g0.0l, 5 frames go over 34 ms', 1],
  ['When: on the original, late frames pile up from the hero to the dark section', 'When: on the original, slow frames pile up from the hero to the dark section', 1],
  ['Every frame of one slow scroll per build (the robot drags ~500 px, then rests; resting frames stack at one spot). Big dots: over 34 ms.', '9 Oct, robot slow drags, original against g0.0l: every frame of one run per build (resting frames stack at one spot). Big dots: slow, over 34 ms.', 1],
  ['>Final build g0.0l<', '>g0.0l (9 Oct)<', 1],
  ['>People title + deck<', '>People title + profile deck<', 1],
  ['>#platform<', '>platform section<', 1],
  ['50 ms (the goal limit)', '50 ms (very slow)', 1],
  ['OBSERVED, phone check P-095. I picked V', 'OBSERVED. I picked V', 1],
  ['OBSERVED, phone check P-137. Proof only', 'OBSERVED. Proof only', 1],
  ['<li>Phone problems: the lead fixes them first (T-256).</li>', '<li>Phone problems: the lead fixes them first.</li>', 1],
  // log-page charts
  ['"Your messages and answers"', '"My messages and answers"', 1],
  ['"your note: ultra smooth"', '"my note: ultra smooth"', 1],
  ['"cheaper section switch"', '"carousel calm, cheaper section switch"', 1],
  ['"instant people card"', '"instant People card"', 1],
  // Day 9 images copied verbatim: renumbered sources
  ['loading="lazy"><figcaption>Card corners, g0.0b against g0.0c', 'loading="lazy"><figcaption>Card corners, g0.0b against g0.0c', 1],
];
for (const [a, b, n] of R) { const c = tpl.split(a).length - 1; if (c !== n) throw new Error(`replace ${n}x expected, found ${c}: ${a}`); tpl = tpl.split(a).join(b); }
// source links on the two verbatim Day 9 stills
const fix = [['One style line clips it. iOS Simulator (<a href="#src-16">source</a>)', 'One style line clips it. iOS Simulator (<a href="#src-18">source</a>)'], ['frames held mid-fade (<a href="#src-17">source</a>)', 'frames held mid-fade (<a href="#src-19">source</a>)']];
for (const [a, b] of fix) { const c = tpl.split(a).length - 1; if (c !== 1) throw new Error(`src fix expected 1, found ${c}: ${a}`); tpl = tpl.replace(a, b); }
fs.writeFileSync(OUT, tpl);
console.log('wrote', OUT, tpl.length, 'bytes;', warn.length ? 'verbatim src links:\n  ' + warn.join('\n  ') : 'no verbatim src links');

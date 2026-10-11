// Rebuilds the article part of the day-by-day draft with Medium's elements only (lead's job after T-170 #133).
import fs from 'node:fs';
const S = '$SCRATCH';
const F = S + '/articles/p1-ten-days-draft.html';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('Medium layout preview')) throw new Error('already converted');

const head = s.slice(0, s.indexOf('<style>'));
const styleOld = s.slice(s.indexOf('<style>') + 7, s.indexOf('</style>'));
const mainOld = s.slice(s.indexOf('<main>'), s.indexOf('</main>') + 7);
const scripts = s.slice(s.indexOf('</main>') + 7);

// keep the figure and slot CSS as it is, only the breakout changes for the 680 px column
const keepA = styleOld.indexOf('/* Empty picture slot');
const keepB = styleOld.indexOf('.closing { display: grid');
if (keepA < 0 || keepB < 0) throw new Error('style markers');
let figCss = styleOld.slice(keepA, keepB)
  .replace(/@media \(min-width: 1320px\) \{[\s\S]*?\n\}/, `@media (min-width: 1320px) {
  .cap { width: 1200px; margin-left: calc((var(--measure) - 1200px) / 2); }  /* centred on the 680 px column */
}`);
if (!figCss.includes('calc((var(--measure) - 1200px) / 2)')) throw new Error('breakout');

const css = `
/* Medium layout preview: one serif column about 680 px wide, Medium's own elements only (title, subtitle, two heading
   sizes, paragraphs, bold, italic, links, block quote, pull quote, lists, separator, images with captions). The
   capture-ready figures stand in for the pictures Medium will show. Light and dark tokens as in the series. */
:root {
  color-scheme: light;
  --paper: #ffffff;
  --paper-2: #eef1ef;
  --ink: #17221e;
  --ink-soft: #55625d;
  --grid: #d3ddd8;
  --signal: #2743c9;
  --late: #c9472a;
  --warn: #b98a12;
  --display: "Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif;
  --body: "Literata", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  --measure: 680px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --paper: #121614; --paper-2: #1b221f; --ink: #e2e9e5; --ink-soft: #a3b3ac; --grid: #2a3631;
    --signal: #93a6ff; --late: #ff8a6b; --warn: #e2b84a;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --paper: #121614; --paper-2: #1b221f; --ink: #e2e9e5; --ink-soft: #a3b3ac; --grid: #2a3631;
  --signal: #93a6ff; --late: #ff8a6b; --warn: #e2b84a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 400 clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)/1.6 var(--body);
  padding-inline: max(16px, 4vw);
  padding-block: 2rem 5rem;
}
main { max-width: var(--measure); margin: 0 auto; display: flow-root; }
main > * { margin: 0; }
main > * + * { margin-top: 1.5em; }
h1, h3, h4 { font-family: var(--display); color: var(--ink); text-wrap: balance; }
h1 { font-size: clamp(2rem, 1.4rem + 2.6vw, 2.75rem); line-height: 1.15; font-weight: 800; letter-spacing: -0.015em; }
.subtitle { font-family: var(--display); font-size: clamp(1.15rem, 1rem + 0.7vw, 1.4rem); line-height: 1.35; color: var(--ink-soft); margin-top: 0.5em; }
main > .subtitle { margin-top: 0.5em; }
h3 { font-size: clamp(1.35rem, 1.15rem + 0.8vw, 1.65rem); line-height: 1.2; font-weight: 700; }
main > h3 { margin-top: 2.2em; }
h4 { font-size: 1.2rem; line-height: 1.3; font-weight: 700; }
main > h3 + *, main > h4 + * { margin-top: 0.6em; }
a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
a:focus-visible { outline: 2px solid var(--signal); outline-offset: 3px; }
ul, ol { padding-left: 1.6em; }
li + li { margin-top: 0.35em; }
blockquote { margin: 0; padding-left: 1.2em; border-left: 3px solid var(--ink); font-style: italic; }
blockquote.pull { border-left: 0; padding: 0 1.5em; font-style: normal; font-size: 1.5em; line-height: 1.35; color: var(--ink-soft); }
hr.sep { border: 0; height: auto; text-align: center; margin-block: 2.6em; }
hr.sep::before { content: "*  *  *"; white-space: pre; color: var(--ink); letter-spacing: 0.6em; font-size: 1.1rem; }
.preview { font: 400 0.85rem/1.5 var(--display); color: var(--ink-soft); border: 1px dashed var(--ink-soft); border-radius: 6px; padding: 0.7rem 0.9rem; }
.byline { font: 400 0.95rem/1.4 var(--display); color: var(--ink-soft); }
figure { margin: 0; }
figcaption.note, .slot + .caption { font: 400 0.85rem/1.45 var(--display); color: var(--ink-soft); text-align: center; }
footer { font-size: 0.95em; }
footer > * + * { margin-top: 1em; }
.figsrc li { overflow-wrap: anywhere; }
${figCss}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;

// ---------- the article ----------
let m = mainOld;
const thoughtsToPh = (ul) => {
  const qs = [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1].trim());
  return `<p><em>[My thoughts. Write over this. Prompts: ${qs.join(' ')}]</em></p>`;
};
// thoughts boxes -> italic placeholder paragraph
m = m.replace(/<div class="thoughts">\s*<span class="label">My thoughts<\/span>\s*<ul>([\s\S]*?)<\/ul>\s*<\/div>/g, (_, ul) => thoughtsToPh(ul));
// decided lists -> bold label + bullet list
m = m.replace(/<ul class="decided"><li class="decided-h"[^>]*>What I decided<\/li>/g, '<p><strong>What I decided</strong></p>\n    <ul>');
// said -> pull quote; goal -> block quote
m = m.replace(/<p class="said">([\s\S]*?)<\/p>/g, '<blockquote class="pull">$1</blockquote>');
m = m.replace(/<p class="goal">([\s\S]*?)<\/p>/g, '<blockquote>$1</blockquote>');
// days: rail -> H3 + italic count line; unwrap the body grid
let dayCount = 0;
m = m.replace(/<article class="day wide" id="(d\d+)">\s*<div class="rail"><span class="n">(\d+)<\/span><span class="m">([^<]+)<\/span><span class="k">([\s\S]*?)<\/span><\/div>\s*<div class="body">\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/div>\s*<\/article>/g,
  (_, id, n, date, k, title, body) => {
    dayCount++;
    const counts = k.split('<br>').map(x => x.trim()).join(' · ');
    const inner = body.replace(/\n {4}/g, '\n').trim();
    return `${n === '1' ? '' : '<hr class="sep">\n\n'}<h3 id="${id}">Day ${n} · ${date}: ${title}</h3>\n<p><em>${counts}</em></p>\n${inner}`;
  });
if (dayCount !== 10) throw new Error('days converted: ' + dayCount);
// before day one, closing sections: unwrap, h2 -> h3
m = m.replace(/<section>\s*<h2>Before day one<\/h2>([\s\S]*?)<\/section>/, (_, b) => `<h3>Before day one</h3>${b.replace(/\n {2}/g, '\n').replace(/\s+$/, '')}\n\n<hr class="sep">`);
m = m.replace(/<div class="rule"><\/div>\s*/, '<hr class="sep">\n\n');
m = m.replace(/<section class="closing">\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g, (_, h, b) => `<h3>${h}</h3>${b.replace(/\n {2}/g, '\n').replace(/\s+$/, '')}`);
m = m.replace('<ul class="arrow">', '<ul>');
// drop the day strip (multi-column nav)
m = m.replace(/<nav class="wide" aria-label="The ten days">[\s\S]*?<\/nav>\s*/, '');
// banner -> preview note; header -> title, subtitle, byline
m = m.replace(/<p class="banner">[\s\S]*?<\/p>/, `<p class="preview"><strong>Medium layout preview:</strong> every element maps to a Medium element; figures are captured as pictures. The bracketed italic lines are the owner's to write over; dashed boxes are pictures still to be made (after "plan OK"). The published Part 1 is unchanged.</p>`);
m = m.replace(/<header>\s*<span class="label">([\s\S]*?)<\/span>\s*<h1>([\s\S]*?)<\/h1>\s*<p style="font-size:1.2rem">([\s\S]*?)<\/p>\s*<p class="note">([\s\S]*?)<\/p>\s*<\/header>/,
  (_, label, h1, sub, note) => `<h1>${h1}</h1>\n<p class="subtitle">${sub}</p>\n<p class="byline">${label}</p>\n<p><em>${note}</em></p>`);
// footer: separator + small heading + plain paragraphs and the numbered list
m = m.replace(/<footer class="note">\s*<p><b>Figure sources\.<\/b>/, '<hr class="sep">\n\n<footer>\n  <h4>Sources</h4>\n  <p>');
m = m.replace('<ol class="figsrc src">', '<ol class="figsrc">');
m = m.replace(/<p class="src">/g, '<p>');
// figure captions: one Medium-style line
m = m.replace(/<figcaption class="note">([\s\S]*?) <a href="#src-(\d+)">Source<\/a>\.<\/figcaption>/g, (_, t, n) => `<figcaption class="note">${t.replace(/\.$/, '')} (Fig. ${n}; <a href="#src-${n}">source</a>)</figcaption>`);
// picture / animation slots stay as image placeholders
// sanity: nothing from the old layout left
for (const bad of ['class="rail"', 'class="body"', 'class="thoughts"', 'class="decided"', 'class="days"', 'class="banner"', 'class="goal"', 'class="said"', '<h2>', 'class="arrow"', '<section']) {
  if (m.includes(bad)) throw new Error('left over: ' + bad);
}
// tidy indentation of top-level elements
m = m.replace(/\n {2,4}(?=<(p|ul|\/ul|li|blockquote|figure|h3|h4|ol|\/ol)\b)/g, (x) => x);

const out = head + '<style>' + css + '</style>\n\n' + m + scripts;
fs.writeFileSync(F, out);
console.log('ok', dayCount, 'days');

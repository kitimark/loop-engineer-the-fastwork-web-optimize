import fs from 'node:fs';
const F = '$SCRATCH/articles/p1-ten-days-draft.html';
let s = fs.readFileSync(F, 'utf8');
const SPEED = 'Speed: 50 fps, every phone frame shown once (1.2x slower than real), plus a 3x slower close-up.';
const anim = (what, src, speed = SPEED) =>
  `<figure class="slot anim"><span class="label"><span class="tag">GIF</span> Animation planned (GIF, before | after)</span><figcaption>${what} <span class="why">Source: ${src}. ${speed}</span></figcaption></figure>\n    `;
function rep(oldStr, newStr) {
  const n = s.split(oldStr).length - 1;
  if (n !== 1) throw new Error(`expected 1 match, got ${n}: ${oldStr.slice(0, 80)}`);
  s = s.replace(oldStr, newStr);
}
// CSS
rep('.slot .why { color: var(--ink-soft); }',
  `.slot .why { color: var(--ink-soft); }
/* Animated slot: a planned before | after GIF (plan in T-170 #124); solid accent border and a GIF tag set it apart. */
.slot.anim { border: 1.5px solid var(--signal); background: var(--paper); }
.slot .tag { display: inline-block; font: 600 0.62rem/1 var(--mono); letter-spacing: 0.08em; padding: 0.22rem 0.4rem; margin-right: 0.35rem; border-radius: 3px; background: var(--signal); color: var(--paper); vertical-align: 0.08em; }`);
// Day 1
rep(`<figure class="slot"><span class="label">Picture planned</span><figcaption>Part 1's frame ruler (16.7 ms per frame, goal: no frame over 50 ms) and a small loop diagram.`,
  anim('Frame rhythm: a few very late frames, against one frame every 16.7 ms (Part 1\'s animation, as a GIF).', 'drawn, no recording', 'Speed: labelled on the GIF.') +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still: Part 1's frame ruler (16.7 ms per frame, goal: no frame over 50 ms) and a small loop diagram.`);
// Day 5
rep(`<figure class="slot"><span class="label">Picture planned</span><figcaption>Part 1's pace animation, and a bar: slow frames through the top card, 27 to 12 per run.`,
  anim('The top of the page, one fast flick: original against the final build.', 'real iPhone screen recordings (cap-worst, hero), address bar masked') +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still strip of the same flick, original against final, and a bar: slow frames through the top card, 27 to 12 per run.`);
// Day 7
rep(`<figure class="slot"><span class="label">Picture planned</span><figcaption>A frame strip of the end-of-page menu reveal.`,
  anim('The end-of-page menu opening: original against the final build.', 'real iPhone screen recordings (cap-worst, end), address bar masked') +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still strip of the same menu opening, original against final.`);
// Day 8
rep(`<figure class="slot"><span class="label">Picture planned</span><figcaption>Two strips: the menu follows the finger, against the menu opening by itself like the original.`,
  anim('The menu follows the finger, against the menu opening by itself like the original.', 'an iPhone or Simulator recording') +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still strips: the menu follows the finger, against the menu opening by itself like the original.`);
// Day 10
rep(`<figure class="slot"><span class="label">Picture planned</span><figcaption>Part 1's people-card strip (iPhone; needs my OK) and worst-case flicks, original against final.`,
  anim('The people card on a fast scroll: the blurred blink, against sharp at once.', 'the existing people-card recordings (iPhone), address bar masked') +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still: Part 1's people-card strip (iPhone; needs my OK) and worst-case flicks, original against final.`);
// banner and footer
rep(`Dashed "Picture planned" boxes mark where a picture could go; none is made until you say "plan OK".`,
  `Dashed "Picture planned" boxes and blue "Animation planned" boxes (before | after GIFs) mark where pictures could go; none is made until you say "plan OK".`);
rep(`<p class="src">Picture slots follow the plan in thread T-170 #122. No picture is made until the owner answers "plan OK"; the people-card strip also needs the owner's OK.</p>`,
  `<p class="src">Picture slots follow the plan in thread T-170 #122, animation slots the plan in #124 (GIFs from real iPhone screen recordings, before | after, same flick and crop on both sides, each labelled with its speed). Nothing is made until the owner answers "plan OK"; the people-card strip also needs the owner's OK, and the worst-case recordings the owner's guard line.</p>`);
fs.writeFileSync(F, s);
console.log('ok', (s.match(/class="slot anim"/g) || []).length, 'anim,', (s.match(/class="slot"/g) || []).length, 'picture');

import { block, figure, esc } from './_lib.mjs';

// One frame's pipeline, top to bottom. Left: the stage and the mistake groups that land there. Right: what enters
// at that stage, from the lessons and the platform facts table (section 6, rows cited in the caption).
const ROW = 76, X0 = 26, BW = 116, TX = 156, TOP = 40;
const stages = [
  { name: 'Script', sub: 'groups A · E · F', notes: ['rAF and scroll callbacks, timers,', 'typing, count-ups, the countdown', 'non-passive touchmove (scroll-jack)', 'a read after a write: loop at left'] },
  { name: 'Style', sub: 'groups A · C · E', notes: ['class flips, inherited --var writes,', 'pause rules on whole sections', 'WebKit ticks these here each frame:', 'steps(), linear() points, clip-path'] },
  { name: 'Layout', sub: 'groups B · C', notes: ['width, height, grid columns, margin', 'WebKit only: opacity to or from 1,', 'transform or filter to or from none,', 'dashoffset, size containers, toolbar'] },
  { name: 'Paint', sub: 'groups B · D', notes: ['background-position, SMIL, digits,', 'dashoffset in Chrome', 'WebKit: a resized composited layer', 'drops its pixels and repaints all'] },
  { name: 'Composite', sub: 'group D', notes: ['transform, opacity, filter,', 'backdrop-filter: both engines', 'Chrome: no blur animation here', 'cost: layer count, MB, first build'] },
];
const y = (i) => TOP + i * ROW + (i === 4 ? 30 : 0);
const H = y(4) + ROW + 8;
let s = '';
// lanes
s += `<rect class="s-main" x="4" y="${TOP - 14}" width="392" height="${y(3) + 58 - TOP + 22}" rx="6"/>`;
s += `<text class="t-m t-s" x="12" y="${TOP - 18}">MAIN THREAD · one per page, shared by every effect</text>`;
const gy = y(4) - 22;
s += `<rect class="s-gpu" x="4" y="${gy}" width="392" height="${ROW + 8}" rx="6"/>`;
s += `<text class="t-m t-s" x="12" y="${gy - 6}">COMPOSITOR / GPU · runs beside the main thread</text>`;
stages.forEach((st, i) => {
  const by = y(i);
  s += `<rect class="s-box" x="${X0}" y="${by}" width="${BW}" height="56" rx="4"/>`;
  const sw = { Style: 'g-style', Layout: 'g-layout', Paint: 'g-paint', Composite: 'g-comp' }[st.name];
  if (sw) s += `<rect class="${sw}" x="${X0 + BW - 18}" y="${by + 10}" width="10" height="10" rx="2"/>`;
  s += `<text class="t-d" x="${X0 + 10}" y="${by + 24}">${st.name}</text>`;
  s += `<text class="t-m t-s" x="${X0 + 10}" y="${by + 42}">${st.sub}</text>`;
  st.notes.forEach((n, k) => { s += `<text class="t-p" x="${TX}" y="${by + 12 + k * 15}">${esc(n)}</text>`; });
  if (i < 4) {
    const y1 = by + 56, y2 = y(i + 1);
    s += `<line class="s-line" x1="${X0 + BW / 2}" y1="${y1}" x2="${X0 + BW / 2}" y2="${y2 - 6}" stroke-width="1.5"/>`;
    s += `<polygon class="s-ink" points="${X0 + BW / 2 - 4},${y2 - 7} ${X0 + BW / 2 + 4},${y2 - 7} ${X0 + BW / 2},${y2}"/>`;
  }
});
// forced layout loop: Script -> Layout -> back to Script, dashed, on the left edge
const a = y(0) + 20, b = y(2) + 36;
s += `<path class="s-origs" d="M${X0},${b} C ${X0 - 22},${b} ${X0 - 22},${a} ${X0 - 6},${a}" stroke-width="2" stroke-dasharray="4 3"/>`;
s += `<polygon class="s-orig" points="${X0 - 7},${a - 4} ${X0 - 7},${a + 4} ${X0},${a}"/>`;

const svg = `<svg viewBox="0 0 400 ${H}" role="img" aria-label="One frame passes script, style, layout and paint on the main thread, then composite on the compositor. Layout properties enter at layout, paint-only animations at paint, and only transform, opacity and filters reach the compositor. A dashed loop shows a layout read after a style write forcing style and layout to run at once.">${s}</svg>`;

export default {
  key: 'before-a-script-on-every-frame',
  html: block({
    id: 'pipeline',
    title: 'Where each property enters the frame',
    status: ['CONFIRMED', 'DERIVED'],
    plain: `Every frame walks the same five stages. Work that enters near the top pays for every stage below it, all on
the one main thread every effect shares; only the last stage runs on its own. So the question for each animated property
is which stage it enters at, and that differs between WebKit and Chrome.`,
    formula: `<p>cost of a frame on the main thread</p>
<math display="block"><mrow><msub><mi>T</mi><mtext>main</mtext></msub><mo>=</mo><msub><mi>T</mi><mtext>script</mtext></msub><mo>+</mo><msub><mi>T</mi><mtext>style</mtext></msub><mo>+</mo><msub><mi>T</mi><mtext>layout</mtext></msub><mo>+</mo><msub><mi>T</mi><mtext>paint</mtext></msub><mo>+</mo><mi>k</mi><mo>·</mo><mo>(</mo><msub><mi>T</mi><mtext>style</mtext></msub><mo>+</mo><msub><mi>T</mi><mtext>layout</mtext></msub><mo>)</mo></mrow></math>
<p>k = forced passes: each layout read after a style write in the same frame (the dashed loop)</p>`,
    fig: figure(`<div class="mx-scroll">${svg}</div>`, `Groups A-F are the lesson groups below. Engine rules from section 6: dashoffset is an SVG layout change in
WebKit (row 3) and never composited in Chrome (row 1); WebKit's presence flips (row 4); <code>steps()</code> and
<code>linear()</code> points stay on the main thread on iOS 26 (row 5); what each engine accelerates (row 6); Chrome does not
composite blur animations (row 2); a resized layer repaints all (row 16); size containers (row 18); scroll-driven targets
restyled every update (row 23). The forced-pass term is our model of lesson 1, not an engine formula.`),
    source: '<code>research/knowledge-distillation/README.md</code> sections 3 and 6',
  }),
};

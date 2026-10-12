// Rendering-cost math, parts 2-3 (de-viz-math-render), items 7-19 and the limits, after review-viz's corrections.
import { block, bars, ranges, figure, svg, legendHtml, esc } from './_lib.mjs';

const n = (x) => `<span class="num">${x}</span>`;
const code = (x) => `<code>${x}</code>`;
const tbl = (head, rows) => `<div class="tbl"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const near = (a, b, tol, what) => { if (Math.abs(a - b) > tol) throw new Error(`${what}: ${a} vs ${b}`); return a; };

// cubic-bezier easing, solved by bisection on x
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; } return Y((lo + hi) / 2); };
}
// a plain x-y chart frame: returns {s, sx, sy}
function axes({ X0 = 44, X1 = 390, Y0, Y1 = 20, xmin = 0, xmax, ymin = 0, ymax, xt, yt, xl, yl, xfmt = (v) => v, yfmt = (v) => v, ylog = false }) {
  const sx = (v) => X0 + ((v - xmin) / (xmax - xmin)) * (X1 - X0);
  const sy = ylog ? (v) => Y0 - ((Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin))) * (Y0 - Y1) : (v) => Y0 - ((v - ymin) / (ymax - ymin)) * (Y0 - Y1);
  let s = '';
  for (const v of yt) s += `<line class="s-rule" x1="${X0}" y1="${sy(v).toFixed(1)}" x2="${X1}" y2="${sy(v).toFixed(1)}"/><text class="t-m t-s" x="${X0 - 5}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${yfmt(v)}</text>`;
  xt.forEach((v, i) => { s += `<text class="t-m t-s" x="${sx(v).toFixed(1)}" y="${Y0 + 15}" text-anchor="${i === xt.length - 1 && sx(v) > X1 - 12 ? 'end' : 'middle'}">${xfmt(v)}</text>`; });
  if (xl) s += `<text class="t-m t-s" x="${X1}" y="${Y0 + 29}" text-anchor="end">${xl}</text>`;
  if (yl) s += `<text class="t-m t-s" x="${X0 - 40 < 2 ? 2 : X0 - 40}" y="${Y1 - 8}">${yl}</text>`;
  return { s, sx, sy, H: Y0 + 33 };
}
const poly = (pts, cls, w = 2, extra = '') => `<polyline class="${cls}" stroke-width="${w}" points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"${extra}/>`;

// ---------- 7. State flips ----------
const cellRow = (label, total, on, note) => `<div class="ag-row"><span class="hb-l">${label}</span><span class="cells">${Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span><span class="hb-v">${on} / ${total}${note ? `<small>${note}</small>` : ''}</span></div>`;
const i7 = block({
  id: 'flips',
  title: 'State flips at a fixed rate: one big layout per flip',
  status: ['CONFIRMED', 'OBSERVED', 'WEAKENED'],
  plain: `Some style changes make WebKit lay out again even though nothing moves: opacity reaching exactly 1, a transform or
filter appearing or going away. An effect that flips like that once a second puts one big layout into one frame every
second, page at rest or not.`,
  formula: `<math display="block"><mrow><mtext>extra time per second</mtext><mo>=</mo><msub><mi>f</mi><mtext>flip</mtext></msub><mo>·</mo><msub><mi>T</mi><mtext>flip</mtext></msub><mspace width="1.2em"/><mtext>at 1 Hz:</mtext><mspace width="0.4em"/><mfrac><mn>1</mn><mn>60</mn></mfrac><mtext> of frames carries it, about 15 in a 15 s swipe</mtext></mrow></math>`,
  worked: `<ul><li>The avatar pill (104×32 px), phone Timeline, 30 s idle at y 1500. A view-rooted Layout of 10 ms or more followed ${n('71 of 71')} slide starts on the wave-1 build, ${n('24 of 35')} with the slots kept mounted (st5), ${n('1 of 36')} with rest values off the flip (st6).</li>
<li>At rest at the top, slow frames per run fell from ${n('19-27 to 0')}.</li>
<li>The #platform pause switch: one style recalc of ${n('29.2-32.2 ms')} = 3.7-4.7 own time + two nested Layouts of 25.5-27.5.</li>
<li>A lazy-render gate flapped ${n('800 times per 10 s')}, i.e. 80 flips per second (derived).</li></ul>`,
  fig: figure(`<div class="agree" role="img" aria-label="Slide starts followed by a view layout of 10 ms or more: 71 of 71 on the wave-1 build, 24 of 35 with slots kept mounted, 1 of 36 with rest values off the flip.">${cellRow('Wave-1 build', 71, 71)}${cellRow('st5: slots kept mounted', 35, 24)}${cellRow('st6: rest values off the flip', 36, 1)}</div>`, 'One cell per avatar slide start in 30 s at rest; filled when a view-rooted Layout of 10 ms or more followed. Filled cells are grouped; their order in time is not shown. WebKit\'s rule is CONFIRMED (StyleDifference.cpp); "always whole-view, 12-17 ms" is WEAKENED, so the size of each layout is not a law.'),
  source: `${code('fixes/rotator-st6/README.md')} l.36-46; ${code('fixes/scene-scope/README.md')} l.593-595; ${code('fixes/scroll-engine/README.md')} l.32; ${code('StyleDifference.cpp')} WK main ~l.213, 219, 228`,
});

// ---------- 8. Toolbar steps ----------
function toolbarFig() {
  const X0 = 104, X1 = 392, sx = (ms) => X0 + (ms / 300) * (X1 - X0);
  let s = '';
  for (let k = 0; k * (1000 / 60) <= 300.01; k++) s += `<line class="s-rule" x1="${sx(k * 1000 / 60).toFixed(1)}" y1="14" x2="${sx(k * 1000 / 60).toFixed(1)}" y2="80"/>`;
  s += `<text class="t-m t-s" x="8" y="10">18 frames at 60 Hz in ~300 ms; 6 toolbar steps</text>`;
  const row = (y, lab, sub, len, cls) => {
    s += `<text class="t-p" x="${X0 - 6}" y="${y + 9}" text-anchor="end">${lab}</text><text class="t-m t-s" x="${X0 - 6}" y="${y + 21}" text-anchor="end">${sub}</text>`;
    for (let i = 0; i < 6; i++) s += `<rect class="${cls}" x="${sx(i * 50).toFixed(1)}" y="${y}" width="${Math.max(1.5, sx(len) - sx(0)).toFixed(1)}" height="20" rx="1"><title>step ${i + 1}: ${len} ms of layout</title></rect>`;
  };
  row(22, 'aspect-ratio', '22.7 ms a step', 22.7, 'g-layout');
  row(54, 'width formula', '0.4 ms a step', 0.4, 'g-layout');
  for (const t of [0, 100, 200, 300]) s += `<text class="t-m t-s" x="${sx(t)}" y="96" text-anchor="${t === 300 ? 'end' : 'middle'}">${t}${t === 300 ? ' ms' : ''}</text>`;
  return svg(400, 100, 'Over the toolbar slide of about 300 ms, six steps each cost a 22.7 ms layout with aspect-ratio cards, 136 ms in all; with the width formula each step costs 0.4 ms.', s);
}
const i8 = block({
  id: 'toolbar',
  title: 'The toolbar slides in steps, and every step pays a layout',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED', 'UNRESOLVED'],
  plain: `While Safari's toolbar slides, the visible height changes in 6-14 steps, and each step lays out every sticky and fixed
element again, with what hangs off them. Six aspect-ratio cards made each step a 20-ms-plus layout; a definite height from
a width formula made it 0.4 ms.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>slide</mtext></msub><mo>=</mo><msub><mi>n</mi><mtext>steps</mtext></msub><mo>·</mo><msub><mi>T</mi><mtext>layout</mtext></msub><mo>(</mo><mtext>step</mtext><mo>)</mo><mspace width="1em"/><msub><mi>n</mi><mtext>steps</mtext></msub><mo>=</mo><mn>6-14</mn><mtext> in about 300 ms</mtext></mrow></math>`,
  worked: `<ul><li>Simulator, y 800-3400: median largest Layout per nudge ${n('25.7 / 22.7 ms')} in two loads. So ${n('6 × 22.7 = 136 ms')} to ${n('14 × 25.7 = 360 ms')} of layout inside ~300 ms: 45-120 % of the main thread (derived).</li>
<li>With ${code('height: calc(100cqi*764/353)')} the median was ${n('0.4 ms')}: 2.4-5.6 ms per slide (derived). The shell's height is 844.08 px (844.078125 in WebKit layout units of 1/64 px) = 390 × 764 / 353 = 844.079: the same box aspect-ratio gave.</li>
<li>Phone, robot finger-down at y 1000-3400: Layout records of 5 ms or more fell from ${n('152-159 to 0-1')}; frames over 34 ms from ${n('12-18 to 2-6')}.</li></ul>`,
  fig: figure(toolbarFig(), 'Six steps (the low end) at even spacing; frame slots as grey lines. Simulator ms illustrate the mechanism only and never count as a gain. Which link carries the layout into the shells is UNRESOLVED.'),
  source: `${code('fixes/toolbar-resize/README.md')} l.16-17; ${code('fixes/sticky-walk/README.md')} l.30, 43; ${code('fixes/g0-0j/README.md')} l.43-44, 56; ${code('LocalFrameView.cpp')}`,
});

// ---------- 9 (rewritten). The lesson-28 trap: binning by m instead of time ----------
const T = 680, mt = (t) => 1 - (1 - t / T) ** 3;
function trapFig() {
  // illustration from the measured shape: 30-50 ms frames for the first ~380 ms, ~17 ms after
  const pat = [34, 46, 38, 50, 42, 36, 44, 40, 48];
  const fr = []; let t = 0, i = 0;
  while (t < T) { const dt = t < 380 ? pat[i++ % pat.length] : 17; t = Math.min(T, t + dt); fr.push([t, dt]); }
  const W = 400, half = 196;
  const A = axes({ X0: 34, X1: half - 8, Y0: 140, Y1: 30, xmax: T, ymax: 60, xt: [0, 340, 680], yt: [0, 20, 40, 60], xl: 'ms since tween start', yl: 'frame ms' });
  const B = axes({ X0: half + 34, X1: W - 8, Y0: 140, Y1: 30, xmax: 1, ymax: 60, xt: [0, 0.5, 1], yt: [0, 20, 40, 60], xl: 'morph value m' });
  let s = A.s + B.s;
  s += `<text class="t-p" x="34" y="12">by time: a start transient</text><text class="t-p" x="${half + 34}" y="12">by m: looks like a hump</text>`;
  for (const [tt, dt] of fr) {
    s += `<circle class="${dt > 34 ? 's-slow' : 's-b34'}" cx="${A.sx(tt).toFixed(1)}" cy="${A.sy(dt).toFixed(1)}" r="2.8"/>`;
    s += `<circle class="${dt > 34 ? 's-slow' : 's-b34'}" cx="${B.sx(mt(tt)).toFixed(1)}" cy="${B.sy(dt).toFixed(1)}" r="2.8"/>`;
  }
  // the fitted area x radius shape, faded, peak scaled to 55 ms: refuted
  const ar = (m) => (52 + 739 * m) * 20 * (1 - m), peak = ar(687 / 1478);
  s += poly(Array.from({ length: 41 }, (_, k) => [B.sx(k / 40), B.sy((55 * ar(k / 40)) / peak)]), 's-mrule', 1.5, ' stroke-dasharray="4 3" opacity="0.8"');
  s += `<text class="t-m t-s" x="${B.sx(0.52)}" y="${B.sy(57)}" text-anchor="middle">area × radius: refuted</text>`;
  return svg(W, A.H, 'The same frames twice. Against time: frames of 30 to 50 ms for the first 380 ms, then 17 ms. Against the morph value: the ease-out squeezes the slow start into m 0.2 to 0.9, which looks like a mid-tween hump. A faded area times radius curve fitted to that hump is marked refuted.', s);
}
const i9 = block({
  id: 'trap',
  title: 'The binning trap: frames by morph value instead of by time',
  status: ['OBSERVED', 'REFUTED'],
  plain: `We binned the end-of-page frames by how far the menu had opened and saw a hump in the middle. It was not in the
middle at all. Every tween starts with a few slow frames, and the ease-out moves so fast at first that those early frames
cover most of the range of the morph value.`,
  formula: `<math display="block"><mrow><mi>m</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mn>1</mn><mo>−</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>−</mo><mfrac><mi>t</mi><mn>680 ms</mn></mfrac><mo>)</mo></mrow><mn>3</mn></msup></mrow></math>
<p>t → m: 50 → 0.20, 100 → 0.38, 150 → 0.53, 200 → 0.65, 300 → 0.83, 400 → 0.93, 680 → 1</p>`,
  worked: `<ul><li>Every build spends its first ~300-400 ms per tween at 30-50 ms frames: ${n('115-127 ms')} of excess per tween. Frames ending 400 ms or more after the start have p50 ${n('17-19 ms')} (g: 29); 73-77 % of the visible motion happens in the first 300 ms.</li>
<li>With the nav backdrop off (ghbn), moving p50 was ${n('25')}, against 26 / 27 for ghb / gh, and the transient was identical. The area × radius curve "was fitted to the m-image of a time transient": REFUTED.</li>
<li>What still holds from the blur math: a radius change changes a layer's bounds (outset ≈ 3r per side), and that repaints the content. blur(14px) on a 402×857 card adds 42 px per side: 486×941 → ${n('16.5 MB')}, +33 % area (derived).</li></ul>`,
  fig: figure(trapFig(), 'An illustration built from the measured shape (frames of 30-50 ms for the first ~380 ms, ~17 ms after), not one recorded run. Orange: over 34 ms. Dashed in the right panel: the fitted area × radius curve, scaled to the hump; the ablation refuted it.'),
  source: `${code('research/design-engineering/postmortem-morph.md')} l.20-28, 186-205; ${code('research/design-engineering/apple-math.md')} l.337-338, 417; lesson 28`,
});

// ---------- 10. Blur tail and the GPU retiming ----------
const E = bez(0.16, 1, 0.3, 1), blur = (t) => 14 * (1 - E(Math.min(1, t / 1.6)));
near(blur(0.9), 0.24, 0.01, 'blur 0.9 s'); near(blur(0.6), 1.01, 0.01, 'blur 0.6 s');
let tDev = 0; while (blur(tDev) >= 1 / 3) tDev += 0.001;
function blurFig() {
  const A = axes({ Y0: 130, Y1: 22, xmax: 1.6, ymax: 14, xt: [0, 0.4, 0.8, 1.2, 1.6], yt: [0, 7, 14], xl: 'seconds after the reveal starts', yl: 'blur, CSS px', xfmt: (v) => v.toFixed(1) });
  let s = A.s;
  s += `<rect class="s-orig" x="${A.sx(tDev).toFixed(1)}" y="${A.sy(14)}" width="${(A.sx(1.6) - A.sx(tDev)).toFixed(1)}" height="${A.sy(0) - A.sy(14)}" opacity="0.16"/>`;
  s += `<text class="t-s" x="${((A.sx(tDev) + A.sx(1.6)) / 2).toFixed(1)}" y="${A.sy(11)}" text-anchor="middle">under 1 device px</text>`;
  s += `<text class="t-s" x="${((A.sx(tDev) + A.sx(1.6)) / 2).toFixed(1)}" y="${A.sy(11) + 14}" text-anchor="middle">${tDev.toFixed(2)}-1.6 s, invisible</text>`;
  s += `<line class="s-mrule" x1="${A.sx(0)}" y1="${A.sy(1 / 3)}" x2="${A.sx(1.6)}" y2="${A.sy(1 / 3)}" stroke-dasharray="3 3"/>`;
  s += poly(Array.from({ length: 81 }, (_, k) => [A.sx((k / 80) * 1.6), A.sy(blur((k / 80) * 1.6))]), 's-fixs', 2.2);
  return svg(400, A.H, `Blur radius from 14 px down to 0 over 1.6 s on an ease-out curve. It is under one device pixel from ${tDev.toFixed(2)} s on, so the last ${(1.6 - tDev).toFixed(2)} s filter the full-screen card for no visible change.`, s);
}
const i10 = block({
  id: 'blurtail',
  title: 'The invisible tail of a blur, and the retiming that doubled Composite',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `The People card sharpens from a 14 px blur over 1.6 s on an ease-out. Most of the change happens early; for the last
0.77 s the blur is under one device pixel, so the phone filters a full-screen card for a change nobody can see (our model of visibility: a change under one device pixel does not show).`,
  formula: `<math display="block"><mrow><mtext>blur</mtext><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mn>14 px</mn><mo>·</mo><mo>(</mo><mn>1</mn><mo>−</mo><mi>E</mi><mo>(</mo><mi>t</mi><mo>/</mo><mn>1.6 s</mn><mo>)</mo><mo>)</mo><mspace width="1em"/><mi>E</mi><mo>=</mo><mtext>cubic-bezier(0.16, 1, 0.3, 1)</mtext><mspace width="1em"/><mtext>visible while</mtext><mo>≥</mo><mfrac><mn>1</mn><mn>3</mn></mfrac><mtext> CSS px</mtext></mrow></math>`,
  worked: `<ul><li>Samples (s: px): 0: 14.0, 0.1: 9.23, 0.2: 5.92, 0.3: 3.79, 0.45: 1.96, 0.6: 1.01, 0.75: 0.51, 0.9: 0.24, 1.0: 0.13, 1.2: 0.03, 1.4: 0.003, 1.6: 0.</li>
<li>Under 1 CSS px at ${n('0.60 s')}, under 1 device px at ${n(`${tDev.toFixed(2)} s`)}, ${n('0.24 px')} at 0.9 s: by our model the last ${n(`${(1.6 - tDev).toFixed(2)} s`)} of 1.6 (${Math.round((100 * (1.6 - tDev)) / 1.6)} %) is invisible. Cutting that tail took phone paint area from ${n('53.6-54.7 to 48.1-49.2 Mpx')} per run (CSS px², 3 runs each).</li>
<li>The "GPU-friendly" retiming: a cubic-bezier blur Core Animation could run raised the Simulator's Composite after the reveal from ${n('54.6 to 111.1 ms')} (medians); the 4 shells' backing went from 0 to 12,102 KB each (about ${n('48 MB')}). On the phone the frame after the reveal went from ${n('42 to 74 ms')}.</li></ul>`,
  fig: figure(blurFig(), 'The curve is exact (the page\'s own easing). Dashed: one device pixel, 0.33 CSS px; "invisible" below it is our model.') + bars({
    max: 120, ticks: [0, 30, 60, 90, 120], unit: 'ms',
    aria: 'Simulator Composite after the reveal: 54.6 ms with the original blur, 111.1 ms with the cubic-bezier retiming, plus 48 MB of layer memory.',
    rows: [{ group: 'Simulator Composite after the reveal (median)' }, { label: 'Original blur', v: 54.6, arm: 'orig' }, { label: 'cubic-bezier blur', v: 111.1, arm: 'mid', note: '+48 MB' }],
    caption: 'Moving the blur to the compositor doubled Composite and added memory. Chrome does not composite blur animations at all (CONFIRMED).',
  }),
  source: `${code('fixes/large-area-blur/README.md')} l.25, 36-40, 127; ${code('fixes/blur-cubic-v8/README.md')} l.18-19, 80-81, 110; Chromium ${code('compositor_animations.cc')} l.408-415`,
});

// ---------- 11. The reveal frame ----------
function threshFig() {
  let s = '';
  const tx = 30, ty = 14, th = 150;
  s += `<rect class="s-box" x="${tx}" y="${ty}" width="22" height="${th}" rx="3" style="stroke: var(--muted)"/>`;
  s += `<rect class="s-orig" x="${tx}" y="${ty + th * 0.72 - 1.5}" width="22" height="3"/>`;
  s += `<text class="t-s" x="${tx + 11}" y="${ty + th + 14}" text-anchor="middle">hero track</text><text class="t-s" x="${tx - 4}" y="${ty + th * 0.72 + 4}" text-anchor="end">0.72</text>`;
  const fx = 300, fy = ty + th * 0.72 - 26;
  s += `<rect class="s-orig" x="${fx}" y="${fy}" width="84" height="52" rx="4"/>`;
  s += `<text class="t-d" x="${fx + 42}" y="${fy + 22}" text-anchor="middle" style="fill: var(--on-light)">one frame</text><text class="t-s" x="${fx + 42}" y="${fy + 40}" text-anchor="middle" style="fill: var(--on-light)">58.2 ms</text>`;
  const owners = ['#people reveals', 'pain section turns dark', 'nav drops its hero pill'];
  owners.forEach((o, i) => {
    const y = ty + 28 + i * 52, x0 = tx + 30;
    s += `<text class="t-p" x="${x0 + 30}" y="${y - 4}">${o}</text>`;
    s += `<path class="s-line" d="M${x0},${ty + th * 0.72} C ${x0 + 30},${y} ${fx - 60},${y} ${fx - 6},${fy + 26 + (i - 1) * 12}" stroke-width="1.5"/>`;
    s += `<polygon class="s-ink" points="${fx - 7},${fy + 22 + (i - 1) * 12} ${fx - 7},${fy + 30 + (i - 1) * 12} ${fx},${fy + 26 + (i - 1) * 12}"/>`;
  });
  return svg(400, ty + th + 20, 'At hero progress 0.72, three separate components act in the same frame: the People section reveals, the pain section turns dark and the nav drops its hero pill; that frame took 58.2 ms.', s);
}
const i11 = block({
  id: 'reveal',
  title: 'The reveal frame: three owners, one frame, priced in ms and MB',
  status: ['OBSERVED', 'MODEL'],
  plain: `Three components listened for the same scroll position and all acted in one frame. The card they revealed had no
pixels yet, so that frame also built and painted its layers. Pre-painting the card moves the cost to load, paid in memory.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>flip</mtext></msub><mo>≈</mo><mo>(</mo><msub><mi>N</mi><mtext>card</mtext></msub><mo>+</mo><msub><mi>N</mi><mtext>nav</mtext></msub><mo>)</mo><mo>·</mo><msub><mi>c</mi><mtext>el</mtext></msub><mo>+</mo><mtext>raster(newly visible area)</mtext><mo>+</mo><mtext>transition start</mtext><mspace width="1em"/><mtext>memory</mtext><mo>=</mo><mo>∑</mo><mn>36</mn><mo>·</mo><mi>A</mi></mrow></math>`,
  worked: `<ul><li>Predicted: S = 450-1150 elements → 4.5-29 ms; first raster 3-4 Mpx → 3-4 ms. Measured on the phone: style about ${n('5 ms')} (1.9 + 3.1), at the bottom of the predicted 5-29 rather than inside it; Layout ${n('13.9')}, Composite ${n('23.7')} of a ${n('58.2 ms')} frame. The whole-view layout was the term the model did not have.</li>
<li>Simulator, g0.0l: the flip frame allocates about ${n('41 MB')} with the step driver (24.8 → 65.9 MB) and ${n('69 MB')} on a flick from the top (12.7 → 81.7 MB).</li>
<li>g0.0m keeps the card painted at opacity 0 on touch screens: the flick reveal frame fell from ${n('50 to 30.5 ms')} median (4 of 4 runs below 50, robot finger), for about ${n('+22 MB')} from load until the card shows.</li>
<li>Simulator flip frame: Composite ${n('72.9 → 26.8 ms')}, paint area 1559 → 972 kpx². The cost moves, it is not removed: the deck paints move into the 1-3 frames before the flip (10 frames before, max Composite 12.9 → 52.9 ms), ~22 MB is painted at load, and total paint over the 21 frames is the same. On the phone that moved paint did not show.</li></ul>`,
  fig: figure(threshFig(), 'Three owners of one threshold (hero progress 0.72, JS 11310). The 58.2 ms frame is the wave-1 build\'s flip, split in the 16.67 ms box above.') + bars({
    max: 60, ticks: [0, 15, 30, 45, 60], unit: 'ms',
    aria: 'Flick reveal frame, median: g0.0l 50 ms, g0.0m 30.5 ms.',
    rows: [{ group: 'flick reveal frame, phone, median of 4' }, { label: 'g0.0l', v: 50, arm: 'orig' }, { label: 'g0.0m, pre-painted', v: 30.5, arm: 'fix' }],
  }) + bars({
    max: 75, ticks: [0, 25, 50, 75], unit: 'MB',
    aria: 'Simulator memory: g0.0l allocates about 41 MB in the flip frame with the step driver and 69 MB on a flick; g0.0m paints about 22 MB at load instead.',
    rows: [{ group: 'Simulator memory, and when it is paid' }, { label: 'g0.0l, flip frame, step driver', v: 41, arm: 'mid' }, { label: 'g0.0l, flip frame, flick', v: 69, arm: 'mid' }, { label: 'g0.0m, at load', v: 22, arm: 'fix' }],
    caption: 'g0.0m paints about 22 MB at load instead of in the flip frame. Total paint over the 21 frames around the flip is the same: the cost moves, it is not removed.',
  }),
  source: `${code('research/design-engineering/hero.md')} l.235; ${code('research/design-engineering/apple-math.md')} l.301-302; ${code('research/design-engineering/postmortem-hero.md')} l.137-145; ${code('fixes/reveal-paint/README.md')} l.24-28; ${code('fixes/g0-0m/README.md')} l.25, 70-80, 302, 321-322`,
});

// ---------- 12. Building layers in the first frame ----------
const i12 = block({
  id: 'firstframe',
  title: 'Building layers in the frame the interaction starts',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `WebKit keeps no spare layers, so every layer a design creates when the menu opens is allocated and painted inside that
first frame. Building them earlier, at a still moment, takes the cost out of the frame and keeps it in memory.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>create</mtext></msub><mo>=</mo><msub><mi>c</mi><mi>L</mi></msub><mo>+</mo><mfrac><mrow><mn>36</mn><mi>A</mi></mrow><msub><mi>R</mi><mtext>alloc</mtext></msub></mfrac><mo>+</mo><mfrac><mrow><mn>9</mn><mi>A</mi></mrow><msub><mi>R</mi><mtext>paint</mtext></msub></mfrac></mrow></math>
<p>c_L, the fixed cost per layer, is unknown. A 350×450 card → 5.7 MB → about 1.1 + 2.8 ≈ 4 ms; a full-viewport layer about 8 ms, over budget alone</p>`,
  worked: `<ul><li>v12/v13 create 11 new layers on every menu open. Phone: first open ${n('38.5 vs 29.5 ms')}, +9 ms, so ${n('≈ 0.8 ms per created layer')}: our model, an upper bound, since it charges the whole v12 delta to the layer builds.</li>
<li>v14 builds them at a still moment: first open ${n('26.5 vs 28.5 ms')}, at ${n('+10.6 MB')} held while the page rests near the end.</li>
<li>The original morph's first frame creates about 88 layers (3 tiled tracks + 85 faces) and takes ${n('91-96 ms')} under a warm finger (49-54 ms under the driver; lesson 28 calls the finger figure about 2x inflated).</li></ul>`,
  fig: bars({
    max: 40, ticks: [0, 10, 20, 30, 40], unit: 'ms',
    aria: 'First menu open on the phone: v14 26.5 ms against its control 28.5; v12 38.5 ms against its control 29.5.',
    rows: [{ group: 'v14 builds its layers at a still moment (P-161)' }, { label: 'Control', v: 28.5, arm: 'ink' }, { label: 'v14, pre-built', v: 26.5, arm: 'fix', note: '+10.6 MB held' }, { group: 'v12 builds 11 layers in the open frame (P-159)' }, { label: 'Control', v: 29.5, arm: 'ink' }, { label: 'v12', v: 38.5, arm: 'mid', note: '11 new layers' }],
    caption: 'Each build against its own control, first open on the phone. Not on this chart: the original morph\'s first tween frame with ~88 new layers, 91-96 ms under a warm finger (49-54 ms under the driver). Detach without a layer pool is CONFIRMED (GraphicsLayerCA.cpp l.3074-3116).',
  }),
  source: `${code('research/design-engineering/apple-math.md')} l.231, 241, 246-247, 405; ${code('research/end-of-page-fresh/README.md')} l.53-57; ${code('fixes/BEST_BUILDS.md')} l.21, 24; ${code('research/design-engineering/postmortem-morph.md')} l.212`,
});

// ---------- 13. Work at rest ----------
const grid = (on, label) => `<div class="restgrid"><span class="hb-l">${label}</span><span class="rg-cells">${Array.from({ length: 60 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span></div>`;
const i13 = block({
  id: 'rest',
  title: 'Work at rest: frames per second × work per frame',
  status: ['OBSERVED', 'MODEL'],
  plain: `A page that nobody is scrolling should draw nothing. The original drew a frame every refresh at rest, because a few
loops never stopped. The target is zero frames and zero rAF callbacks when nothing visible changes.`,
  formula: `<math display="block"><mrow><mtext>idle cost per second</mtext><mo>=</mo><msub><mi>f</mi><mtext>frames</mtext></msub><mo>·</mo><mtext>work per frame</mtext><mspace width="1em"/><mtext>target:</mtext><mspace width="0.4em"/><msub><mi>f</mi><mtext>frames</mtext></msub><mo>=</mo><mn>0</mn><mo>,</mo><mspace width="0.4em"/><mtext>rAF</mtext><mo>=</mo><mn>0</mn></mrow></math>`,
  worked: `<ul><li>Chrome 154 headless, no CPU throttle, counts only, at rest at y 2796 (no clock on screen): the original ran ${n('60 frames/s')}, ${n('1,816')} elements restyled/s, ${n('167')} paints/s and ${n('64')} rAF fires/s, all of them the countdown spring. The best build: ${n('8.2')} frames/s, ${n('122')} elements/s, ${n('8.7')} paints/s, ${n('0')} rAF.</li>
<li>At ~9-10 µs per element (unthrottled Chrome, n = 1) that is ${n('16-18 ms')} of style per second against ${n('~1.1 ms')}: our model.</li>
<li>At the page end: ${n('60 → 2.2')} frames/s. Simulator, hero covered by the People card: ${n('65 → 2')} layouts and ${n('74 → 0')} paints per 2 s.</li>
<li>Heat on the phone, absolute slopes (3 Oct; not comparable with section 2's over-the-floor numbers): the original ${n('+0.620 / +0.400')} °C/min, apple.com ${n('+0.055 / −0.013')}. Frames per second do not convert to °C here.</li></ul>`,
  fig: figure(`<div class="agree" role="img" aria-label="One second at rest: the original draws 60 of 60 frames, the best build about 8.">${grid(60, 'Original, 60 frames/s')}${grid(8, 'Best build, 8.2 frames/s')}</div>`, 'One second at rest at y 2796, 60 refresh cells; a filled cell is a frame drawn.') + ranges({
    max: 0.7, min: -0.1, ticks: [-0.1, 0, 0.2, 0.4, 0.6], unit: '°C/min',
    aria: 'Heat slopes at rest-heavy routine: original 0.620 and 0.400 degrees per minute, apple.com 0.055 and minus 0.013.',
    rows: [{ group: 'phone heat slope, two sessions each (3 Oct)' }, { label: 'Original', runs: [0.62, 0.4], arm: 'orig', show: '0.620, 0.400' }, { label: 'apple.com', runs: [0.055, -0.013], arm: 'fix', show: '0.055, −0.013' }],
    caption: 'Absolute slopes; the axis starts below zero because one apple.com session cooled the phone.',
  }),
  source: `${code('research/design-engineering/frame-audit.md')} l.111-116, 129-134, 144; ${code('research/design-engineering/hero.md')} l.59-61; ${code('fixes/hero-covered-pause/README.md')} l.73, 80; ${code('research/phone-heat/README.md')} l.362-363; ${code('research/design-engineering/apple-math.md')} l.106, 408`,
});

// ---------- 14. One record per frame ----------
function recFig() {
  const X0 = 10, X1 = 392, N = 54, w = (X1 - X0) / N;
  let s = `<text class="t-m t-s" x="${X0}" y="10">0.9 s at 60 Hz: a style, layout and paint record a frame</text>`;
  for (let i = 0; i < N; i++) {
    const x = X0 + i * w + 0.6;
    s += `<rect class="g-paint" x="${x.toFixed(1)}" y="18" width="${(w - 1.2).toFixed(1)}" height="9"/><rect class="g-layout" x="${x.toFixed(1)}" y="29" width="${(w - 1.2).toFixed(1)}" height="9"/><rect class="g-style" x="${x.toFixed(1)}" y="40" width="${(w - 1.2).toFixed(1)}" height="9"/>`;
  }
  for (const [t, a] of [[0, 'start'], [0.45, 'middle'], [0.9, 'end']]) s += `<text class="t-m t-s" x="${X0 + (t / 0.9) * (X1 - X0)}" y="64" text-anchor="${a}">${t} s</text>`;
  return svg(400, 68, 'Fifty-four frame columns across 0.9 seconds, each with one paint, one layout and one style record.', s);
}
function flipFig() {
  let s = '';
  const y = 46, em = 22, D = 4.6458 * em;
  s += `<text class="t-m t-s" x="8" y="12">FLIP: set the final width at once, slide the letters back</text>`;
  const ox = 200 - (5.25 * em) / 2;
  s += `<rect class="s-fix" x="${ox}" y="${y - 22}" width="${5.25 * em}" height="30" rx="15" opacity="0.25"/><text class="t-s" x="200" y="${y + 24}" text-anchor="middle">"o" at its final 5.25 em</text>`;
  s += `<text class="t-d" x="${ox - 4}" y="${y}" text-anchor="end" style="font-size: 26px">p</text><text class="t-d" x="${ox + 5.25 * em + 4}" y="${y}" style="font-size: 26px">ople</text>`;
  const ar = (x1, x2) => `<line class="s-origs" x1="${x1}" y1="${y + 36}" x2="${x2}" y2="${y + 36}" stroke-width="1.5"/><polygon class="s-orig" points="${x2},${y + 32} ${x2},${y + 40} ${x2 + (x2 > x1 ? 6 : -6)},${y + 36}"/>`;
  // p starts shifted right by Δ/2 and slides left to rest; ople starts shifted left and slides right: outward
  s += ar(ox - 36 + D / 2, ox - 36) + ar(ox + 5.25 * em + 50 - D / 2, ox + 5.25 * em + 50);
  s += `<text class="t-s" x="200" y="${y + 56}" text-anchor="middle">p from +Δ/2, ople from −Δ/2 (Δ = 4.6458 em), out to 0</text>`;
  return svg(400, y + 62, 'The FLIP fix: the o takes its final width at once; p starts shifted right and ople shifted left by half the width change, and both slide outward to rest with a transform.', s);
}
const i14 = block({
  id: 'perframe',
  title: 'One record per frame: a main-thread animation costs duration × 60',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `An animation the compositor cannot run makes the main thread restyle, lay out and paint once per frame for as long as
it lasts. So its cost is easy to predict: about 60 records of each kind per second. This holds for the "o" (lesson 5),
the dashoffset stroke (lesson 6) and typing (lesson 7).`,
  formula: `<math display="block"><mrow><msub><mi>N</mi><mtext>records</mtext></msub><mo>≈</mo><mn>60</mn><mo>·</mo><mi>T</mi><mspace width="1em"/><mtext>(each of style, layout, paint)</mtext><mspace width="1.2em"/><mtext>typing: layouts</mtext><mo>=</mo><mtext>text writes</mtext></mrow></math>`,
  worked: `<ul><li>The accent "you" draw lasts 0.9 s: the model says ${n('54')}. The Simulator counted per draw: style ${n('57.8')}, Layout ${n('57.3')}, Paint ${n('61.3')}, Composite 54.3.</li>
<li>The "o"'s grid-template-columns transition lasts 0.92 s: model ${n('55')}. Chrome 6x counted ${n('57')} layouts while it grows (56-58 in a second fix), against 3 with the transitions off.</li>
<li>Platform sweep titles: ${n('240')} style passes per 4 s cycle = 60/s in Chrome; 8 after the fix.</li>
<li>Typing, Chrome 1x, 9.3 s: Layout count = text writes, exactly ${n('226 = 226')}; two characters per step gives ${n('97 = 97')}. One character per 18-32 ms is 31-56 writes per second (derived).</li>
<li>The FLIP fix: Δ = (5.25 − 0.6042) em = 4.6458 em; p starts at +Δ/2 = +2.32 em and ople at −2.32 em (height δ 0.0416 em), and both slide outward to 0 over 920 ms, so the letters spread apart as the o opens. Layouts ${n('56 → 4')} in Chrome, ${n('30 → 8')} in the Simulator with the rest of the page paused.</li></ul>`,
  fig: figure(recFig() + legendHtml([['g-paint', 'Paint'], ['g-layout', 'Layout'], ['g-style', 'Style']]).replace(/a-g-/g, 'g-')) + bars({
    max: 70, ticks: [0, 20, 40, 60], unit: 'records',
    aria: 'Accent draw: 54 predicted; counted style 57.8, layout 57.3, paint 61.3.',
    rows: [{ group: 'accent draw, per 0.9 s (Simulator)' }, { label: 'Predicted, 60 × 0.9', v: 54, arm: 'ink' }, { label: 'Style counted', v: 57.8, arm: 'orig' }, { label: 'Layout counted', v: 57.3, arm: 'orig' }, { label: 'Paint counted', v: 61.3, arm: 'orig' }],
  }) + figure(flipFig()),
  source: `${code('fixes/illusion-accent-frames/README.md')} l.25, 33; ${code('fixes/people-avatars/README.md')} l.23; ${code('fixes/people-gpu/README.md')} l.28, 43-44, 65-67; ${code('fixes/platform-idle/README.md')} l.117; ${code('fixes/illusion-typing-chunks/README.md')} l.19, 43-50; ${code('StyleDifference.cpp')} l.172, 417`,
});

// ---------- 15. Where a stall lands on an ease-out ----------
const v = (t) => ((3 * 739) / T) * (1 - t / T) ** 2;
const jump = (t0, dt) => 739 * (mt(t0 + dt) - mt(t0)) * (1 - 16.67 / dt);
near(jump(16.67, 48), 90, 1, 'JUMP frame 2'); near(jump(300, 48), 28, 0.5, 'JUMP 300'); near(v(0), 3.26, 0.01, 'v0');
function easeFig() {
  const A = axes({ Y0: 150, Y1: 26, xmax: 680, ymax: 3.5, xt: [0, 170, 340, 510, 680], yt: [0, 1, 2, 3], xl: 'ms since the tween starts', yl: 'nav edge speed, px/ms' });
  let s = A.s;
  s += poly(Array.from({ length: 69 }, (_, k) => [A.sx(k * 10), A.sy(v(k * 10))]), 's-fixs', 2.2);
  for (const t0 of [16.67, 300, 600]) {
    const j = jump(t0, 48);
    s += `<rect class="s-orig" x="${A.sx(t0).toFixed(1)}" y="${A.sy(3.5)}" width="${(A.sx(t0 + 48) - A.sx(t0)).toFixed(1)}" height="${(A.sy(0) - A.sy(3.5)).toFixed(1)}" opacity="0.22"/>`;
    s += `<text class="t-s" x="${(A.sx(t0 + 24) + (t0 > 500 ? -4 : 4)).toFixed(1)}" y="${(Math.min(A.sy(v(t0)) - 8, A.sy(0.7))).toFixed(1)}" text-anchor="${t0 > 500 ? 'end' : 'start'}">48 ms gap: ${j < 1 ? j.toFixed(1) : Math.round(j)} px jump</text>`;
  }
  return svg(400, A.H, 'The nav edge moves at 3.26 px per ms at the start of the ease-out and slows to 0 at 680 ms. The same 48 ms gap makes a 90 px jump at the start, 28 px at 300 ms and 0.7 px at 600 ms.', s);
}
const i15 = block({
  id: 'easeout',
  title: 'Where a stall lands on an ease-out',
  status: ['MODEL', 'OBSERVED'],
  plain: `An ease-out moves fastest at the start. A late frame there skips a long stretch of motion; the same late frame in the
slow landing skips almost nothing. The original menu's slowest frame was frame 2, at peak speed.`,
  formula: `<math display="block"><mrow><mi>m</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mn>1</mn><mo>−</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>−</mo><mfrac><mi>t</mi><mi>T</mi></mfrac><mo>)</mo></mrow><mn>3</mn></msup><mspace width="0.8em"/><mi>v</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mfrac><mrow><mn>3</mn><mo>·</mo><mn>739</mn></mrow><mi>T</mi></mfrac><msup><mrow><mo>(</mo><mn>1</mn><mo>−</mo><mfrac><mi>t</mi><mi>T</mi></mfrac><mo>)</mo></mrow><mn>2</mn></msup><mspace width="0.8em"/><mtext>JUMP</mtext><mo>=</mo><mi>dx</mi><mo>·</mo><mo>(</mo><mn>1</mn><mo>−</mo><mfrac><mn>16.67</mn><mi>dt</mi></mfrac><mo>)</mo></mrow></math>
<p>T = 680 ms (page code JS 12688-12698); the nav height is 52 + 739m px, so v peaks at 3.26 px/ms; JUMP is the motion skipped beyond one frame's share</p>`,
  worked: `<ul><li>Frame 2 starts at 16.7 ms with dt = 48 ms (p50): dx = 739 · [(1 − 16.67/680)³ − (1 − 64.67/680)³] = ${n('138 px')}, so JUMP = ${n('90 px')} (derived). Measured JUMP p50: ${n('94 px')} (morph driver, 16 cool runs, 96 tweens).</li>
<li>The same 48 ms gap at t = 300 ms: ${n('28 px')}; at 600 ms: ${n('0.7 px')}. Frames 2-5 carry 61 % of all excess px.</li>
<li>Perception, one user: the same three 50 ms gaps placed in the landing were picked as smoother in ${n('8 of 8')} forced choices.</li></ul>`,
  fig: figure(easeFig(), 'The curve is exact (the page\'s own easing). Shaded: three 48 ms gaps placed at 16.7, 300 and 600 ms.'),
  source: `${code('research/design-engineering/unknowns-ux.md')} l.57, 124-135; baseline JS 12688-12698; ${code('research/design-engineering/pacing-result.md')}`,
});

// ---------- 16. Waiting behind a busy main thread ----------
function waitFig() {
  const X0 = 96, X1 = 392, MAX = 300, sx = (ms) => X0 + (ms / MAX) * (X1 - X0);
  let s = '';
  const rows = [['Clean page', 'every 16.7 ms', Array(18).fill(16.7)], ['Original morph', 'mixed frames', [65, 30, 110, 45, 50]]];
  const arrivals = [23, 71, 118, 152, 201, 266];
  rows.forEach(([lab, sub, seq], r) => {
    const y = 20 + r * 52;
    s += `<text class="t-p" x="${X0 - 6}" y="${y + 9}" text-anchor="end">${lab}</text><text class="t-m t-s" x="${X0 - 6}" y="${y + 21}" text-anchor="end">${sub}</text>`;
    let t = 0; const ends = [];
    for (const d of seq) { if (t >= MAX) break; const e = Math.min(MAX, t + d); s += `<rect class="${d > 34 ? 's-slow' : 's-frame'}" x="${(sx(t) + 0.5).toFixed(1)}" y="${y}" width="${(sx(e) - sx(t) - 1).toFixed(1)}" height="16" rx="1.5"/>`; ends.push(e); t = e; }
    for (const a of arrivals) {
      const e = ends.find((x) => x > a) ?? MAX;
      s += `<line class="s-line" x1="${sx(a).toFixed(1)}" y1="${y + 26}" x2="${sx(e).toFixed(1)}" y2="${y + 26}" stroke-width="1.5"/><circle class="s-ink" cx="${sx(a).toFixed(1)}" cy="${y + 26}" r="3"><title>touch at ${a} ms waits ${(e - a).toFixed(0)} ms</title></circle>`;
    }
  });
  for (const t of [0, 100, 200, 300]) s += `<text class="t-m t-s" x="${sx(t)}" y="122" text-anchor="${t === 300 ? 'end' : 'middle'}">${t}${t === 300 ? ' ms' : ''}</text>`;
  return svg(400, 126, 'The same six touch arrivals on two frame strips. On the clean page each waits a few ms for its frame to end; behind long frames the waits are much longer.', s);
}
const i16 = block({
  id: 'wait',
  title: 'Waiting behind a busy main thread: long frames count twice',
  status: ['MODEL', 'OBSERVED'],
  plain: `A touch arrives at a random moment and waits for the current frame to end. It is more likely to land inside a long
frame, and then it also waits longer. So the average wait grows with the square of the frame length, and a few long frames
dominate it.`,
  formula: `<math display="block"><mrow><mi>E</mi><mo>[</mo><mtext>wait</mtext><mo>]</mo><mo>=</mo><mfrac><mrow><mi>E</mi><mo>[</mo><msup><mi>T</mi><mn>2</mn></msup><mo>]</mo></mrow><mrow><mn>2</mn><mi>E</mi><mo>[</mo><mi>T</mi><mo>]</mo></mrow></mfrac><mo>=</mo><mfrac><mrow><msup><mi>μ</mi><mn>2</mn></msup><mo>+</mo><msup><mi>σ</mi><mn>2</mn></msup></mrow><mrow><mn>2</mn><mi>μ</mi></mrow></mfrac><mo>=</mo><mfrac><mtext>MWFI</mtext><mn>2</mn></mfrac></mrow></math>
<p>the mean residual time of a renewal process (the inspection paradox); MWFI = Σdt² / Σdt at constant speed. Applying it to touch is our model; whether WebKit queues touches exactly this way is not checked.</p>`,
  worked: `<ul><li>Clean page, T = 16.7 ms: ${n('8.3 ms')}.</li>
<li>The original morph, μ ≈ 65, σ ≈ 40: ${n('(65² + 40²) / 130 ≈ 45 ms')} per touchmove.</li>
<li>Phone data: touchmove frames were 10-30 ms slower (${n('65 vs 53')} p50). A scripted scroll cannot see it: passive against non-passive ${n('52.7 vs 52.5 fps')} on the phone.</li></ul>`,
  fig: figure(waitFig(), 'Illustration: dots are touches, lines their wait until the frame ends. Frame lengths are examples around the morph\'s μ and σ, not a recorded run.') + bars({
    max: 50, ticks: [0, 25, 50], unit: 'ms',
    aria: 'Mean wait for a touch: clean page 8.3 ms, original morph about 45 ms.',
    rows: [{ group: 'mean wait for a touch, by the formula' }, { label: 'Clean page', v: 8.35, arm: 'fix', show: '8.3' }, { label: 'Original morph', v: 44.8, arm: 'orig', show: '45' }],
  }),
  source: `${code('research/design-engineering/apple-math.md')} l.256-260, 270; ${code('research/design-engineering/unknowns-ux.md')} l.49-51; lesson 21`,
});

// ---------- 17 + M16. A 1 s timer drifting on a hot phone ----------
function timerFig() {
  const X0 = 10, X1 = 392, sx = (s) => X0 + (s / 60) * (X1 - X0);
  let s = '';
  for (let k = 0; k <= 60; k++) s += `<line class="${k % 10 ? 's-rule' : 's-mrule'}" x1="${sx(k).toFixed(1)}" y1="18" x2="${sx(k).toFixed(1)}" y2="${k % 10 ? 30 : 34}"/>`;
  s += `<text class="t-m t-s" x="${X0}" y="12">true seconds</text>`;
  let skip = null;
  for (let k = 0; k * 1.02 <= 60; k++) {
    const t = k * 1.02, isSkip = k > 0 && Math.floor(t) - Math.floor((k - 1) * 1.02) === 2;
    if (isSkip) skip = { k, t };
    s += `<line class="${isSkip ? 's-origs' : 's-fixs'}" x1="${sx(t).toFixed(1)}" y1="40" x2="${sx(t).toFixed(1)}" y2="54" stroke-width="${isSkip ? 2.5 : 1.2}"><title>fire ${k} at ${t.toFixed(2)} s</title></line>`;
  }
  s += `<text class="t-m t-s" x="${X0}" y="68">a fire every 1.02 s, drifting 20 ms further each time</text>`;
  s += `<text class="t-s" x="${sx(skip.t)}" y="84" text-anchor="end">fire ${skip.k} at ${skip.t.toFixed(2)} s: a second is skipped</text>`;
  for (const t of [0, 20, 40, 60]) s += `<text class="t-m t-s" x="${sx(t)}" y="100" text-anchor="${t === 0 ? 'start' : t === 60 ? 'end' : 'middle'}">${t}${t === 60 ? ' s' : ''}</text>`;
  return { html: svg(400, 104, `Sixty seconds of true time with a timer firing every 1.02 s: the fires drift against the second marks until fire ${skip.k}, at ${skip.t.toFixed(2)} s, lands two seconds after the previous one's second and a shown second is skipped.`, s), skip };
}
const tf = timerFig();
const i17 = block({
  id: 'timer',
  title: 'A 1 s timer at 1,020 ms skips a second every 50 fires',
  status: ['CONFIRMED', 'DERIVED', 'OBSERVED', 'UNRESOLVED'],
  plain: `Under heat, WebKit nudges repeating timers onto a 30 ms grid, so each one-second fire lands a little late, and the
next one is aimed a full second after that late fire. The lateness adds up, and every so often the countdown jumps two
seconds at once.`,
  formula: `<math display="block"><mrow><mtext>period</mtext><mo>=</mo><mn>30</mn><mo>·</mo><mo>⌈</mo><mfrac><mn>1000</mn><mn>30</mn></mfrac><mo>⌉</mo><mo>=</mo><mn>30</mn><mo>·</mo><mn>34</mn><mo>=</mo><mn>1020 ms</mn><mspace width="1.2em"/><mtext>skip every</mtext><mspace width="0.4em"/><mfrac><mn>1000</mn><mrow><mtext>period</mtext><mo>−</mo><mn>1000</mn></mrow></mfrac><mo>=</mo><mn>50</mn><mtext> fires</mtext></mrow></math>
<p>under thermal mitigation, at nesting level 5 or more: re-armed at the actual fire time + 1000 ms, then rounded up to the 30 ms grid; 1000 = 33 · 30 + 10, so each fire lands 20 ms later (derived from the CONFIRMED mechanism; matches the OBSERVED ~1,020 ms). At Fair there is no alignment: ~1,005 ms is plain latency (OBSERVED).</p>`,
  worked: `<ul><li>About ${n('1,020 ms')} per fire at real Serious and ${n('1,005 ms')} at Fair. So a shown second is skipped every 1000/20 = ${n('50 fires')} (about 51 s; the digits go 12 → 10), and every ${n('200 fires')} at Fair.</li>
<li>A load whose start lands within ~30 ms of a second boundary (about 2.5 % of loads) skips and repeats every few seconds.</li>
<li>In our setup Chrome did not drift. The fix: derive the shown time from the clock and aim each fire at an absolute time.</li></ul>`,
  fig: figure(tf.html, `Blue: fires; orange: fire ${tf.skip.k}, where the shown second jumps by two. Mechanism CONFIRMED on WebKit main (DOMTimer.cpp l.59-61, 180, 343; Page.cpp l.3348); that shipping iOS 26 behaves the same is UNRESOLVED.`),
  source: `${code('fixes/countdown-tick/README.md')} l.31-37, 89; ${code('research/serious-heat/README.md')} l.52 (render item 17 and measurement M16)`,
});

// ---------- 18. Picture bytes ----------
function picFig() {
  const S = 0.075, x0 = 20, y0 = 10;
  let s = `<rect class="s-orig" x="${x0}" y="${y0}" width="${1200 * S}" height="${2133 * S}" opacity="0.3"/><rect class="s-fix" x="${x0 + (1200 - 477) * S / 2}" y="${y0 + (2133 - 848) * S / 2}" width="${477 * S}" height="${848 * S}"/>`;
  s += `<text class="t-p" x="${x0 + 1200 * S + 14}" y="${y0 + 30}">natural 1200×2133</text><text class="t-m t-s" x="${x0 + 1200 * S + 14}" y="${y0 + 46}">9.76 MiB decoded</text>`;
  s += `<text class="t-p" x="${x0 + 1200 * S + 14}" y="${y0 + 96}">needed at 3x: 477×848</text><text class="t-m t-s" x="${x0 + 1200 * S + 14}" y="${y0 + 112}">1.54 MiB · 6.3x less area</text>`;
  return svg(400, y0 + 2133 * S + 8, 'A 1200 by 2133 picture drawn to scale, with the 477 by 848 pixels its box needs at 3x inside it: 9.76 against 1.54 MiB decoded.', s);
}
const wall = [1.22, 1.91, 1.19, 1.19, 1.19];
const i18 = block({
  id: 'pictures',
  title: 'Picture bytes: decoded = w · h · 4, and waste grows with the square',
  status: ['CONFIRMED', 'OBSERVED'],
  plain: `A picture costs memory for its decoded pixels, 4 bytes each, whatever its file size. A picture twice as wide as its box
holds four times the pixels it needs.`,
  formula: `<math display="block"><mrow><mtext>decoded</mtext><mo>=</mo><mi>w</mi><mo>·</mo><mi>h</mi><mo>·</mo><mn>4</mn><mspace width="1.2em"/><mtext>waste</mtext><mo>=</mo><msup><mrow><mo>(</mo><mfrac><mtext>natural</mtext><mtext>needed</mtext></mfrac><mo>)</mo></mrow><mn>2</mn></msup><mspace width="1.2em"/><mtext>3x instead of 2x:</mtext><mspace width="0.4em"/><msup><mrow><mo>(</mo><mn>3</mn><mo>/</mo><mn>2</mn><mo>)</mo></mrow><mn>2</mn></msup><mo>=</mo><mn>2.25</mn></mrow></math>
<p>WebKit may decode large images at the drawn size (CONFIRMED in main source, not checked on iOS 26), so natural-size bytes are an upper bound</p>`,
  worked: `<ul><li>hero/peter-cover: 1200×2133 → ${n('9.76 MiB')} at natural size, against ${n('1.54 MiB')} needed at 3x for its 159×149 CSS box with cover: 2.5x linear, (1200/477)² = ${n('6.3x')} in area.</li>
<li>The menu wall: five 1282×1282 PNGs of ${n('6.6 MB')} decoded each, ~33 MB. Each holds 1.19-1.91 times the pixels its box needs (linear), so at the cover need they would take 6.6 / x²:</li></ul>
${tbl(['image', 'pixels ÷ need', 'at need, MB', 'saved'], wall.map((x, i) => [i + 1, x.toFixed(2), (6.6 / x / x).toFixed(1), `${Math.round(100 * (1 - 1 / x / x))} %`]).concat([['wall', '', `${wall.reduce((a, x) => a + 6.6 / x / x, 0).toFixed(0)} of 33`, `${Math.round(100 * (1 - wall.reduce((a, x) => a + 6.6 / x / x, 0) / 33))} %`]]))}
<ul><li>Page-wide, re-saving 45 files took the natural-size decode from ${n('95.0 to 35.3 MB')} (an upper bound), with no frame or memory gain beyond the A/A spread. What moved frames was switching the end-of-page backgrounds off: slow frames per run ${n('16 → 3')} (median).</li></ul>`,
  fig: figure(picFig(), 'To scale: the orange rectangle is the decoded picture, the blue one the pixels its box can show at 3x.') + bars({
    max: 10, ticks: [0, 2.5, 5, 7.5, 10], unit: 'MiB',
    aria: 'Decoded size of hero/peter-cover: 9.76 MiB at natural size, 1.54 MiB needed.',
    rows: [{ label: 'Natural size', v: 9.76, arm: 'orig' }, { label: 'Needed at 3x', v: 1.54, arm: 'fix' }],
  }),
  source: `${code('research/image-cost/README.md')} l.101, 107; ${code('research/design-engineering/apple-math.md')} l.367; ${code('fixes/end-bg/README.md')} l.23, 52-70; ${code('fixes/image-size/README.md')} l.25-30, 46`,
});

// ---------- 19. Script easing for an effect nobody can see ----------
const stopN = (e0) => Math.ceil(Math.log(8e-4 / e0) / Math.log(0.78));
function decayFig() {
  const A = axes({ Y0: 140, Y1: 22, xmax: 500, ymin: 1e-4, ymax: 1, ylog: true, xt: [0, 100, 200, 300, 400, 500], yt: [1, 0.1, 0.01, 0.001, 0.0001], xl: 'ms after the target changes', yl: 'error left (log)', yfmt: (v) => (v >= 0.01 ? v : v.toExponential(0).replace('e-', 'e−')) });
  let s = A.s;
  s += `<line class="s-mrule" x1="${A.sx(0)}" y1="${A.sy(8e-4)}" x2="${A.sx(500)}" y2="${A.sy(8e-4)}" stroke-dasharray="4 3"/><text class="t-s" x="${A.sx(500)}" y="${A.sy(8e-4) - 5}" text-anchor="end">stop at 8·10⁻⁴</text>`;
  for (const [hz, cls] of [[60, 'orig'], [120, 'fix']]) {
    const p = 1000 / hz, N = stopN(1);
    const pts = Array.from({ length: N + 1 }, (_, k) => [A.sx(k * p), A.sy(0.78 ** k)]);
    s += poly(pts, `s-${cls}s`, 1.5) + pts.map(([x, y]) => `<circle class="s-${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"/>`).join('');
    s += `<text class="t-s" x="${(A.sx(N * p) + (hz === 60 ? -4 : 4)).toFixed(1)}" y="${(A.sy(0.78 ** N) + (hz === 60 ? -10 : 14)).toFixed(1)}" text-anchor="${hz === 60 ? 'end' : 'start'}">${hz} Hz: ${N} frames, ${Math.round(N * p)} ms</text>`;
  }
  return svg(400, A.H, `Error left after each frame of a 22 percent per-frame ease: at 60 Hz it reaches the stop line after ${stopN(1)} frames, ${Math.round(stopN(1) * 1000 / 60)} ms; at 120 Hz after the same frames in half the time.`, s);
}
const i19 = block({
  id: 'easing',
  title: 'Script easing for an effect nobody can see',
  status: ['MODEL', 'OBSERVED'],
  plain: `The "shrink" effects ease 22 % of the way to their target every frame, reading rects each time, until the error is
tiny. On phones CSS had switched the effect off, so all those frames did work for nothing. Per-frame easing also runs twice
as fast on a 120 Hz screen as on a 60 Hz one, so desktop and phone show different motion.`,
  formula: `<math display="block"><mrow><msub><mi>x</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msub><mo>=</mo><msub><mi>x</mi><mi>n</mi></msub><mo>+</mo><mn>0.22</mn><mo>(</mo><mtext>target</mtext><mo>−</mo><msub><mi>x</mi><mi>n</mi></msub><mo>)</mo><mspace width="0.6em"/><mo>⇒</mo><mspace width="0.6em"/><msub><mi>e</mi><mi>n</mi></msub><mo>=</mo><msup><mn>0.78</mn><mi>n</mi></msup><msub><mi>e</mi><mn>0</mn></msub><mspace width="1em"/><mi>n</mi><mo>=</mo><mo>⌈</mo><mfrac><mrow><mo>ln</mo><mo>(</mo><mn>8·10⁻⁴</mn><mo>/</mo><msub><mi>e</mi><mn>0</mn></msub><mo>)</mo></mrow><mrow><mo>ln</mo><mn>0.78</mn></mrow></mfrac><mo>⌉</mo></mrow></math>`,
  worked: `<ul><li>The loop stops when the error is under 8·10⁻⁴: ${n(`${stopN(0.1)} frames`)} from e₀ = 0.1, ${n(`${stopN(1)} frames`)} from e₀ = 1 (derived; TOPICS says "~20 frames after scroll stops"). Each of those frames reads rects.</li>
<li>Gating the shrinks on phones took Chrome 6x from ${n('66.5 to 71.6 fps')}, i.e. 15.04 → 13.97 ms per frame (−1.07 ms, derived). Phone frames over 20 ms fell from ${n('60-64 to 40-43')}.</li></ul>`,
  fig: figure(decayFig(), 'From e₀ = 1, one dot per frame. Same frame count at both rates, half the time at 120 Hz.'),
  source: `${code('fixes/phone-invisible-shrink/README.md')} l.38; ${code('fixes/TOPICS.md')} l.23; ${code('fixes/FINDINGS.md')} l.16`,
});

// ---------- limits ----------
const limits = block({
  id: 'limits',
  title: 'Limits of the math on this page',
  status: ['MODEL'],
  plain: `The formulas are ours unless a chip says CONFIRMED. They are there to show orders of magnitude and which terms add,
not to predict a frame to the millisecond.`,
  worked: `<ul><li>Every rate (raster Gpx/s, allocation GB/s, cost per restyled element, cost per new layer) is an assumption or a fit from our runs, not a device spec. Budget rows built on the per-layer cost and on render-server time are order-of-magnitude only.</li>
<li>Medians of stages do not add up to the median frame. Timeline-on runs add about 1-3 ms per frame (${code('research/design-engineering/safari-render-signals.md')} l.333-334).</li>
<li>Render-server and GPU time (blur, backdrop) is not on the main-thread bars; how it couples to the rAF gap is inference.</li>
<li>Simulator ms are counts-only evidence; the toolbar and blur boxes use them only to show a mechanism, never as a gain.</li>
<li>Chrome numbers are Chrome's pipeline; its CPU throttle slows only the main thread (CONFIRMED).</li>
<li>Phone frames drawn on a 16.67 ms grid are a model: phone rAF gaps are not vsync-quantized above one period (claims-audit §2.3).</li></ul>`,
  source: `${code('research/design-engineering/apple-math.md')} l.462-463; ${code('research/architecture/claims-audit.md')} §2.3, §2.6`,
});

export default [
  { key: 'lesson-3', html: i19 },
  { key: 'lesson-5', html: i14 },
  { key: 'lesson-8', html: i7 },
  { key: 'lesson-9', html: i8 },
  { key: 'lesson-13', html: i12, order: 40 },
  { key: 'lesson-14', html: i11 },
  { key: 'lesson-15', html: i10 },
  { key: 'lesson-16', html: i18 },
  { key: 'lesson-18', html: i13 },
  { key: 'lesson-19', html: i17 },
  { key: 'lesson-21', html: i16 },
  { key: 'lesson-22', html: i15 },
  { key: 'lesson-28', html: i9 },
  { key: 'before-7-sources', html: limits },
];

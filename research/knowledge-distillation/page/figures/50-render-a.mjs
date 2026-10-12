// Rendering-cost math, part 1 (de-viz-math-render): P0 frame split, items 1-6.
import { block, bars, ranges, figure, svg, legendHtml, esc } from './_lib.mjs';

const n = (x) => `<span class="num">${x}</span>`;
const code = (x) => `<code>${x}</code>`;

// Stacked ms bars on one linear axis. rows: {label, sub, segs: [{v, cls, name, inner?: {v, name}}]}.
// inner = a hatched part drawn inside the segment (Paint inside Composite on iOS), never an extra length.
function msStack({ id, max, ticks, rows, lines, aria, X0 = 122 }) {
  const X1 = 392, RH = 38, TOP = 34, sx = (v) => X0 + (v / max) * (X1 - X0);
  const H = TOP + rows.length * RH + 24;
  let s = `<defs><pattern id="hp-${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" class="g-comp"/><rect width="2.4" height="5" class="g-paint"/></pattern><pattern id="hn-${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" class="s-box" style="stroke: none"/><rect width="2" height="5" class="g-other"/></pattern></defs>`;
  for (const t of ticks) s += `<text class="t-m t-s" x="${sx(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${t}</text>`;
  s += `<text class="t-m t-s" x="${X0 - 8}" y="${H - 6}" text-anchor="end">ms</text>`;
  rows.forEach((r, i) => {
    const y = TOP + i * RH;
    s += `<text class="t-p" x="${X0 - 8}" y="${y + 9}" text-anchor="end">${esc(r.label)}</text><text class="t-m t-s" x="${X0 - 8}" y="${y + 22}" text-anchor="end">${esc(r.sub)}</text>`;
    let x = 0;
    r.segs.forEach((g, k) => {
      const a = sx(x) + (k ? 1 : 0), w = Math.max(0.6, sx(x + g.v) - sx(x) - (k ? 2 : 1));
      s += `<rect ${g.cls === 'g-none' ? `fill="url(#hn-${id})" style="stroke: var(--b34)"` : `class="${g.cls}"`} x="${a.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="20"><title>${esc(g.name)}: ${g.v} ms</title></rect>`;
      if (g.inner) s += `<rect fill="url(#hp-${id})" x="${a.toFixed(1)}" y="${y}" width="${(sx(g.inner.v) - sx(0)).toFixed(1)}" height="20"><title>${esc(g.inner.name)}: ${g.inner.v} ms (inside ${esc(g.name)})</title></rect>`;
      if (w > 24) s += `<text class="t-s" x="${(a + w / 2).toFixed(1)}" y="${y + 14}" text-anchor="middle" style="${g.cls === 'g-none' ? 'fill: var(--ink); paint-order: stroke; stroke: var(--sheet); stroke-width: 3px' : `fill: var(${g.cls === 'g-layout' || g.cls === 'g-other' ? '--on-light' : g.cls === 'g-style' ? '--on-style' : '--on-dark'})`}">${g.v}</text>`;
      x += g.v;
    });
  });
  for (const l of lines) {
    s += `<line class="s-line" x1="${sx(l.v).toFixed(1)}" y1="${TOP - 8}" x2="${sx(l.v).toFixed(1)}" y2="${H - 20}" stroke-width="${l.thin ? 1 : 1.5}"${l.dash ? ' stroke-dasharray="3 3"' : ''}/>`;
    if (l.label) s += `<text class="t-s" x="${(sx(l.v) + (l.anchor === 'end' ? -3 : 3)).toFixed(1)}" y="${TOP - 12}" text-anchor="${l.anchor || 'start'}">${l.label}</text>`;
  }
  return svg(400, H, aria, s);
}
const frameLines = [{ v: 1000 / 60, label: '16.67', anchor: 'end' }, { v: 1000 / 30, dash: true, thin: true }, { v: 34, label: '34' }, { v: 50, label: '50' }];
const stageLegend = legendHtml([['g-other', 'fixed (model)'], ['g-none', 'not itemized'], ['g-style', 'Style'], ['g-layout', 'Layout'], ['g-comp', 'Composite'], ['g-paint', 'Paint, inside Composite']]).replace(/a-g-/g, 'g-');

// ---------- P0 ----------
const p0 = block({
  id: 'budget',
  title: 'The 16.67 ms frame, split by stage',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `A 60 Hz frame has 16.67 ms. About half goes to fixed work every frame pays, which leaves roughly 8-12 ms for
everything the page changes. The measured frames below show where a slow frame actually spent its time.`,
  formula: `<math display="block"><mrow><mn>16.67</mn><mo>≈</mo><munder><munder><mrow><mn>1</mn><mo>+</mo><mn>2</mn><mo>+</mo><mn>1</mn></mrow><mo>⏟</mo></munder><mtext>JS, commit, walk</mtext></munder><mo>+</mo><munder><munder><mrow><mn>3</mn><mo>+</mo><mn>2</mn><mo>+</mo><mn>3</mn><mo>+</mo><mn>2</mn></mrow><mo>⏟</mo></munder><mtext>style, layout, raster, new layers</mtext></munder><mo>+</mo><munder><munder><mn>3-4</mn><mo>⏟</mo></munder><mtext>composite</mtext></munder></mrow></math>
<p>rounded model: the parts add to about 17 ms; Chrome at 120 Hz has 8.33 ms</p>`,
  worked: `<ul><li>People reveal on a flick (robot finger, tool-induced Serious, medians of 4 runs): g0.0l ${n('50 ms')} = Style 7.0 + Layout 4.1 + Composite 38.3 (Paint 9.8 inside it) + 0.6; g0.0m ${n('30.5 ms')} = 4.5 + 2.6 + 20.3 (Paint 2.2) + 3.1. Medians do not add exactly. The 5 frames before the reveal: max 17 ms, Paint 0.5, Composite 11.4 / 11.7.</li>
<li>Hero 0.72 flip on the wave-1 build: ${n('58.2 ms')} = style 1.9 + 3.1, Layout 13.9, Composite 23.7, and 15.6 ms not itemized. The next frame is 43.3 ms: Layout 12.1 plus 14.0 of layout inside a Composite of 23.1.</li>
<li>Tension with the model: at rest the Timeline shows a fixed Composite floor of ${n('6-8 ms')}, above the model's 3-4 (mechanism unknown, possibly part Timeline overhead).</li></ul>`,
  fig: figure(msStack({
    id: 'p0', max: 60, ticks: [0, 10, 20, 30, 40, 50, 60], lines: frameLines,
    aria: 'Stacked frame times on a 0-60 ms axis: the 17.5 ms rounded budget model; g0.0l reveal 50 ms, mostly Composite; g0.0m reveal 30.5 ms; the hero flip frame 58.2 ms with 13.9 ms of layout.',
    rows: [
      { label: 'Budget model', sub: 'rounded, 17.5 ms', segs: [{ v: 4, cls: 'g-other', name: 'fixed: JS 1, commit 2, update walk 1' }, { v: 3, cls: 'g-style', name: 'Style' }, { v: 2, cls: 'g-layout', name: 'Layout' }, { v: 8.5, cls: 'g-comp', name: 'Composite: ordinary 3.5, new layers 2, raster 3', inner: { v: 3, name: 'raster' } }] },
      { label: 'Reveal, g0.0l', sub: '50 ms', segs: [{ v: 7.0, cls: 'g-style', name: 'Style' }, { v: 4.1, cls: 'g-layout', name: 'Layout' }, { v: 38.3, cls: 'g-comp', name: 'Composite', inner: { v: 9.8, name: 'Paint' } }, { v: 0.6, cls: 'g-none', name: 'not itemized' }] },
      { label: 'Reveal, g0.0m', sub: '30.5 ms', segs: [{ v: 4.5, cls: 'g-style', name: 'Style' }, { v: 2.6, cls: 'g-layout', name: 'Layout' }, { v: 20.3, cls: 'g-comp', name: 'Composite', inner: { v: 2.2, name: 'Paint' } }, { v: 3.1, cls: 'g-none', name: 'not itemized' }] },
      { label: 'Hero flip, wave 1', sub: '58.2 ms', segs: [{ v: 5.0, cls: 'g-style', name: 'Style (1.9 + 3.1)' }, { v: 13.9, cls: 'g-layout', name: 'Layout' }, { v: 23.7, cls: 'g-comp', name: 'Composite' }, { v: 15.6, cls: 'g-none', name: 'not itemized' }] },
    ],
  }) + stageLegend, `Phone Timeline (Safari Web Inspector). On iOS, Composite spans the transaction, buffer allocation, all paint
recording and the wait for GPU-process raster (WebKit's own comment, ${code('Page.cpp')} l.2757-2758, CONFIRMED), so Paint is drawn
hatched inside Composite, never as an extra length. The hatched grey end is dt minus Style, Layout and Composite: medians per column do
not add up, and dt also holds work outside these records. Lines: one frame (16.67), two frames (33.3, dashed), slow (34) and
very slow (50). Not on these bars: GPU and render-server time and the UI-process apply.`),
  source: `${code('research/design-engineering/apple-math.md')} l.393-398; ${code('fixes/g0-0m/README.md')} l.264, 315-318; ${code('research/design-engineering/postmortem-hero.md')} l.134-139; ${code('research/design-engineering/safari-render-signals.md')} l.41-43, 155-160, 357`,
});

// ---------- 1. Costs add ----------
const terms = [
  ['panel content raster + allocation', 4, 10, 'measured g → gh'],
  ['panel and #platform filter radii', 2, 7, 'measured g → gb'],
  ['nav box layout + realloc + repaint', 0, 3, 'up to ~3'],
  ['fixed: --morph restyle, flush, commit, JS', 2, 4, 'derived'],
];
function sumFig() {
  const X0 = 14, X1 = 392, MAX = 55, sx = (v) => X0 + (v / MAX) * (X1 - X0), y = 40;
  let s = '', x = 16.7;
  s += `<rect class="s-frame" x="${sx(0)}" y="${y}" width="${sx(16.7) - sx(0) - 1}" height="22"><title>one frame, 16.7 ms</title></rect>`;
  s += `<text class="t-s" x="${(sx(0) + sx(16.7)) / 2}" y="${y + 15}" text-anchor="middle">16.7 base</text>`;
  terms.forEach(([name, lo, hi], i) => {
    const mid = (lo + hi) / 2, a = sx(x) + 1, w = sx(x + mid) - sx(x) - 2;
    s += `<rect class="s-orig" x="${a.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="22"><title>${esc(name)}: ${lo}-${hi} ms, drawn at ${mid}</title></rect>`;
    s += `<text class="t-s" x="${(a + w / 2).toFixed(1)}" y="${y + 15}" text-anchor="middle" style="fill: var(--on-light)">${i + 1}</text>`;
    x += mid;
  });
  // measured band and the derived range of the sum
  s += `<rect class="s-fix" x="${sx(29)}" y="${y + 30}" width="${sx(35) - sx(29)}" height="10" opacity="0.8"><title>measured p50 29-35 ms</title></rect>`;
  s += `<text class="t-s" x="${sx(29) - 4}" y="${y + 39}" text-anchor="end">measured p50 29-35</text>`;
  s += `<line class="s-line" x1="${sx(24.7)}" y1="${y + 52}" x2="${sx(40.7)}" y2="${y + 52}" stroke-width="1.5"/><line class="s-line" x1="${sx(24.7)}" y1="${y + 47}" x2="${sx(24.7)}" y2="${y + 57}"/><line class="s-line" x1="${sx(40.7)}" y1="${y + 47}" x2="${sx(40.7)}" y2="${y + 57}"/>`;
  // the refuted backdrop term, as a ghost after the stack
  s += `<rect class="s-rule" x="${sx(x) + 1}" y="${y}" width="${sx(x + 6) - sx(x) - 2}" height="22" stroke-dasharray="3 2" style="fill: none; stroke: var(--muted)"><title>nav backdrop re-blur, ~4-8 ms: REFUTED by the ghbn ablation</title></rect>`;
  s += `<text class="t-m t-s" x="${(sx(x) + sx(x + 6)) / 2}" y="${y - 3}" text-anchor="middle">refuted</text>`;
  s += `<text class="t-s" x="${sx(24.7) - 4}" y="${y + 56}" text-anchor="end">sum of the ranges 24.7-40.7</text>`;
  for (const [v, lab] of [[16.7, '16.7'], [34, '34'], [50, '50']]) {
    s += `<line class="s-mrule" x1="${sx(v)}" y1="${y - 10}" x2="${sx(v)}" y2="${y + 62}" stroke-dasharray="3 3"/><text class="t-m t-s" x="${sx(v)}" y="${y - 14}" text-anchor="middle">${lab}</text>`;
  }
  s += `<text class="t-m t-s" x="${sx(x + 6)}" y="${y + 15}" dx="4">${x.toFixed(1)} ms</text>`;
  return svg(400, y + 66, 'One stacked bar: a 16.7 ms base plus four cost terms at their midpoints, 32.7 ms in all, and a dashed ghost for a fifth term that was refuted. The sum of the term ranges is 24.7 to 40.7 ms; the measured median frame was 29 to 35 ms.', s);
}
const i1 = block({
  id: 'add',
  title: 'Costs add: many cheap terms share one frame',
  status: ['MODEL', 'OBSERVED'],
  plain: `The terms of a frame run one after another, so they add. A frame turns slow when the sum crosses 34 ms, even when no
single term is big. Taking one term out saves only that term, and only if nothing else takes its place.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>frame</mtext></msub><mo>≈</mo><mtext>base</mtext><mo>+</mo><munder><mo>∑</mo><mi>i</mi></munder><msub><mi>t</mi><mi>i</mi></msub><mspace width="0.8em"/><mtext>(not</mtext><mspace width="0.3em"/><mo>max</mo><msub><mi>t</mi><mi>i</mi></msub><mtext>)</mtext><mspace width="1.2em"/><mtext>slow</mtext><mo>⇔</mo><msub><mi>T</mi><mtext>frame</mtext></msub><mo>&gt;</mo><mn>34</mn></mrow></math>`,
  worked: `<p>End-of-page morph, scripted driver, excess over 16.7 ms per moving frame:</p><ul>${terms.map(([name, lo, hi, basis], i) => `<li>${i + 1}. ${esc(name)}: ${n(`${lo === 0 ? '≤ ' : `${lo}-`}${hi} ms`)} (${basis})</li>`).join('')}</ul>
<p>A fifth term, the nav backdrop's re-blur (~4-8 ms), was dropped: the ablation with the backdrop off (ghbn) changed nothing (REFUTED, lesson 28). The four terms sum to ${n('8-24 ms')}, so the frame is about ${n('25-41 ms')} (derived); measured g p50 ${n('29-35 ms')}. The ablations fit a sum: g ${n('35')} → gh ${n('26')} (−9) and gb ${n('29')} (−6). The accent word alone made 0 slow frames; on the full page it sat in 4-8 per run.</p>`,
  fig: figure(sumFig(), 'Terms drawn at the middle of their ranges, numbered as in the list; the dashed ghost is the refuted backdrop term. Serial coupling is our inference; the savings alone no longer tell a sum from other shapes.') + bars({
    max: 40, ticks: [0, 10, 20, 30, 40], unit: 'ms p50',
    aria: 'Morph frame p50: build g 35 ms, gh 26 ms, gb 29 ms.',
    rows: [{ label: 'g', v: 35, arm: 'orig' }, { label: 'gh (panel size fixed)', v: 26, arm: 'fix' }, { label: 'gb (filter radii fixed)', v: 29, arm: 'fix' }],
  }),
  source: `${code('research/design-engineering/morph-endpage.md')} l.15, 388-396; ${code('research/design-engineering/postmortem-morph.md')} l.186-205 (ghbn); ${code('research/design-engineering/apple-math.md')} l.211-213; ${code('research/design-engineering/safari-render-signals.md')} l.302-306`,
});

// ---------- 2. Layer memory ----------
const MB = (w, h) => (36 * w * h) / 1e6;
const layers = [['Full screen', 430, 932], ['Deck shell', 402, 857], ['Nav, m = 1', 406, 791], ['Nav pill', 398, 52], ['Digit face', 18, 37]];
function phonesFig() {
  const S = 0.15, PW = 430 * S, PH = 932 * S, GAP = 14;
  let s = '';
  layers.forEach(([name, w, h], i) => {
    const x = 6 + i * (PW + GAP), y = 6;
    s += `<rect class="s-box" x="${x}" y="${y}" width="${PW}" height="${PH}" rx="7" style="stroke: var(--muted)"/>`;
    const lw = w * S, lh = h * S, lx = x + (PW - lw) / 2, ly = name.startsWith('Nav') ? y + 16 * S : y + (PH - lh) / 2;
    s += `<rect class="s-fix" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${Math.max(1.5, lw).toFixed(1)}" height="${Math.max(1.5, lh).toFixed(1)}" rx="${name === 'Nav pill' ? 2 : 0}"><title>${name}: ${w}×${h} CSS px, ${MB(w, h).toFixed(w < 50 ? 3 : 1)} MB</title></rect>`;
    s += `<text class="t-p" x="${x + PW / 2}" y="${y + PH + 16}" text-anchor="middle">${name}</text>`;
    s += `<text class="t-m t-s" x="${x + PW / 2}" y="${y + PH + 30}" text-anchor="middle">${w}×${h}</text>`;
  });
  return svg(400, 6 + PH + 36, 'Five layers drawn to scale inside a 430 by 932 phone screen: full screen 14.4 MB, deck shell 12.4 MB, nav at m = 1 11.6 MB, nav pill 0.75 MB, a digit face 0.024 MB.', s);
}
const i2 = block({
  id: 'memory',
  title: 'Layer memory: 4 bytes per device pixel, so 36 · w · h at DPR 3',
  status: ['MODEL', 'CONFIRMED'],
  plain: `A composited layer is a buffer of pixels. On this phone every CSS pixel is 3 × 3 device pixels of 4 bytes, so a layer
costs 36 bytes per CSS pixel of its area. A screen-sized layer is about 14 MB.`,
  formula: `<math display="block"><mrow><mtext>bytes</mtext><mo>=</mo><mn>4</mn><mo>·</mo><mo>(</mo><mi>D</mi><mi>w</mi><mo>)</mo><mo>·</mo><mo>(</mo><mi>D</mi><mi>h</mi><mo>)</mo><mo>=</mo><mn>36</mn><mo>·</mo><mi>w</mi><mo>·</mo><mi>h</mi><mspace width="0.8em"/><mo>(</mo><mi>D</mi><mo>=</mo><mn>3</mn><mo>)</mo></mrow></math>
<p>w, h in CSS px; a layer with a side over 1280 CSS px is tiled instead (1024 when memory is low) and holds only visible tiles</p>`,
  worked: `<ul><li>Full screen 430×932 → 1290×2796 = ${n('3.61 dev Mpx → 14.4 MB')}; the phone's 430×775 viewport → ${n('3.0 Mpx → 12.0 MB')}.</li>
<li>Deck shell 402×857 → ${n('12,402,504 B')} = 12,112 KiB. The Simulator census read ${n('12,102 KB')} per shell, about 48 MB for 4: within 0.1 %.</li>
<li>Digit face 18×37 → ${n('23,976 B')}; 48 backed faces → ${n('1.15 MB')}, against a measured clock backing of ${n('1.18 MB')} (2.5 % off).</li>
<li>Nav pill at rest 398×52 → ${n('0.75 MB')}; at full morph 406×791 → 2.9 dev Mpx, ${n('11.6 MB')}.</li></ul>`,
  fig: figure(phonesFig(), 'Sizes to scale; positions are illustrative. The digit face is the speck in the last screen.') + bars({
    max: 15, ticks: [0, 5, 10, 15], unit: 'MB', refs: [{ v: 10, label: 'budget: about 10 MB of new backing per frame' }],
    aria: 'Backing memory: full screen 14.4 MB, deck shell 12.4, nav at m = 1 11.6, nav pill 0.75, digit face 0.024. A dashed line marks the 10 MB per-frame budget.',
    rows: layers.map(([name, w, h]) => ({ label: name, v: MB(w, h), arm: 'fix', show: `${MB(w, h).toFixed(w < 50 ? 3 : MB(w, h) < 1 ? 2 : 1)} MB` })),
    caption: 'Dashed line: the derived budget of about 10 MB of new backing per frame. Three of these layers break it alone if they are built or resized in one frame.',
  }),
  source: `${code('research/design-engineering/morph-endpage.md')} l.84-89; ${code('research/design-engineering/apple-math.md')} l.43, 201, 404; ${code('fixes/blur-cubic-v8/README.md')} l.110; ${code('fixes/cd-strip/README.md')} l.384; tiling: ${code('GraphicsLayerCA.cpp')} l.98-106`,
});

// ---------- 3. Resizing a layer ----------
function navFig() {
  const S = 0.17, PW = 430 * S, PH = 815 * S, GAP = 22;
  let s = '';
  [0, 0.5, 1].forEach((m, i) => {
    const x = 8 + i * (PW + GAP), y = 6, w = 398 + 8 * m, h = 52 + 739 * m, top = 16 - 4 * m;
    s += `<rect class="s-box" x="${x}" y="${y}" width="${PW}" height="${PH}" rx="7" style="stroke: var(--muted)"/>`;
    s += `<rect class="s-orig" x="${(x + (PW - w * S) / 2).toFixed(1)}" y="${(y + top * S).toFixed(1)}" width="${(w * S).toFixed(1)}" height="${(h * S).toFixed(1)}" rx="${((32 - 12 * m) * S).toFixed(1)}" opacity="0.85"><title>m = ${m}: ${w}×${h} CSS px</title></rect>`;
    s += `<text class="t-p" x="${x + PW / 2}" y="${y + PH + 16}" text-anchor="middle">m = ${m}</text>`;
    s += `<text class="t-m t-s" x="${x + PW / 2}" y="${y + PH + 30}" text-anchor="middle">${w}×${h}</text>`;
  });
  // k(m) line beside the phones
  const X0 = 8 + 3 * (PW + GAP) + 18, X1 = 392, Y0 = 120, Y1 = 30, sx = (m) => X0 + m * (X1 - X0), sy = (k) => Y0 - ((k - 0.5) / 0.5) * (Y0 - Y1);
  s += `<text class="t-s" x="${X0}" y="16">k = r / 32</text>`;
  for (const k of [0.5, 0.625, 1]) s += `<line class="s-rule" x1="${X0}" y1="${sy(k)}" x2="${X1}" y2="${sy(k)}"/><text class="t-m t-s" x="${X0 - 4}" y="${sy(k) + 4}" text-anchor="end">${k}</text>`;
  s += `<line class="s-fixs" x1="${sx(0)}" y1="${sy(1)}" x2="${sx(1)}" y2="${sy(0.625)}" stroke-width="2"/>`;
  s += `<circle class="s-fix" cx="${sx(0)}" cy="${sy(1)}" r="3.5"/><circle class="s-fix" cx="${sx(1)}" cy="${sy(0.625)}" r="3.5"/>`;
  for (const m of [0, 1]) s += `<text class="t-m t-s" x="${sx(m)}" y="${Y0 + 15}" text-anchor="${m ? 'end' : 'start'}">m ${m}</text>`;
  return svg(400, 6 + PH + 36, 'The nav box at morph values 0, 0.5 and 1, to scale in a 430 by 815 screen: 398 by 52, 402 by 421.5 and 406 by 791 CSS px. Beside it, the fix: corner clip scale k falls in a straight line from 1 to 0.625.', s);
}
const i3 = block({
  id: 'resize',
  title: 'Resizing a layer means reallocating it and repainting all of it',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `When a composited layer changes size, WebKit throws its pixels away and paints the whole layer again into a new
buffer. The original menu grew the nav box every frame, so every frame paid a full repaint and a fresh allocation.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>resize</mtext></msub><mo>≈</mo><munder><mo>∑</mo><mi>i</mi></munder><mrow><mo>(</mo><mfrac><mrow><mn>9</mn><msub><mi>A</mi><mi>i</mi></msub></mrow><msub><mi>R</mi><mtext>raster</mtext></msub></mfrac><mo>+</mo><mfrac><mrow><mn>36</mn><msub><mi>A</mi><mi>i</mi></msub></mrow><msub><mi>R</mi><mtext>alloc</mtext></msub></mfrac><mo>)</mo></mrow><mspace width="1em"/><msub><mi>R</mi><mtext>raster</mtext></msub><mo>≈</mo><mn>0.6-0.9 Gpx/s</mn><mo>,</mo><mspace width="0.4em"/><msub><mi>R</mi><mtext>alloc</mtext></msub><mo>≈</mo><mn>5 GB/s</mn></mrow></math>
<p>A in CSS px² for each untiled layer resized that frame; R_alloc is an assumption, R_raster recalibrated from our ablation</p>`,
  worked: `<ul><li>Nav box (398 + 8m) × (52 + 739m) CSS px: 398×52, 402×421.5, 406×791 at m = 0, 0.5, 1.</li>
<li>All resized layers together (nav, veil, centre, footer and bar, columns): repaint ${n('3.9 / 7.2 / 10.4 dev Mpx')} and fresh buffers ${n('11 / 22 / 29 MB')} at m = 0.1 / 0.5 / 0.9.</li>
<li>At m = 0.9: ${n('10.4 Mpx / 0.6-0.9 Gpx/s')} = ${n('11.6-17.3 ms')} of raster plus ${n('29 MB / 5 GB/s')} = ${n('5.8 ms')} of allocation, about ${n('17-23 ms')}: more than a whole frame (derived).</li>
<li>Measured: the model predicts 17-23 ms of resize cost per frame at m 0.9, but a size-fixed panel (gh) saved ${n('4-10 ms')} (against an earlier prediction of 30-45), so the resize was one term of 4-5. Tween p50 58-68 ms under the finger, 29-35 ms under the scripted driver.</li>
<li>The fix (compositor-morph): the box stays full size; four corner clippers of radius 32 are scaled by ${n('k = r / 32')} and the content counter-scaled by 1/k. With r = 32 − 12m, k = 1 − 0.375m: 1 at m 0, 0.625 at m 1. Phone, robot finger: Paint per morph frame ${n('11.45-12.01 → 3.19-3.28 ms')} (0.28-0.29x), Layout ${n('2.23-2.38 → 1.00-1.04')}.</li></ul>`,
  fig: figure(navFig(), 'Left: the original nav box, sizes to scale (resized and repainted every frame). Right: the fix keeps the box at full size and animates only a corner clip scale k, a transform.') + bars({
    max: 12, ticks: [0, 3, 6, 9, 12], unit: 'dev Mpx',
    aria: 'Repaint per frame of all resized layers: 3.9, 7.2 and 10.4 device megapixels at m 0.1, 0.5 and 0.9.',
    rows: [{ group: 'repaint per frame, all resized layers' }, { label: 'm = 0.1', v: 3.9, arm: 'orig', note: '11 MB new' }, { label: 'm = 0.5', v: 7.2, arm: 'orig', note: '22 MB new' }, { label: 'm = 0.9', v: 10.4, arm: 'orig', note: '29 MB new' }],
  }) + ranges({
    max: 13, ticks: [0, 4, 8, 12], unit: 'ms',
    aria: 'Paint per morph frame: original 11.45 to 12.01 ms, compositor-morph 3.19 to 3.28 ms.',
    rows: [{ group: 'phone Paint per morph frame (P-157, robot finger)' }, { label: 'Original', runs: [11.45, 12.01], arm: 'orig', show: '11.45-12.01' }, { label: 'compositor-morph', runs: [3.19, 3.28], arm: 'fix', show: '3.19-3.28' }],
  }),
  source: `${code('research/design-engineering/morph-endpage.md')} l.30-31, 74, 93-103, 392, 398-399; ${code('research/design-engineering/apple-math.md')} l.41-42, 186-187; ${code('research/architecture/gpu-compositor-playbook.md')} l.58-60; ${code('fixes/compositor-morph/README.md')} l.202-203; ${code('RemoteLayerBackingStore.mm')} l.139-152`,
});

// ---------- 4. Layer count beats area ----------
function treeFig() {
  let s = '';
  const W = 400;
  s += `<text class="t-p" x="6" y="16">2 clocks</text><text class="t-p" x="6" y="52">× 8 digits</text><text class="t-p" x="6" y="88">× 10 faces = 160</text>`;
  const X0 = 112, X1 = 394, gw = (X1 - X0) / 16;
  for (let c = 0; c < 2; c++) s += `<rect class="s-ink" x="${X0 + c * 8 * gw + 2}" y="6" width="${8 * gw - 4}" height="14" rx="2" opacity="0.8"/>`;
  for (let d = 0; d < 16; d++) s += `<rect class="s-fix" x="${(X0 + d * gw + 1.5).toFixed(1)}" y="40" width="${(gw - 3).toFixed(1)}" height="16" rx="2"/>`;
  for (let d = 0; d < 16; d++) for (let f = 0; f < 10; f++) s += `<rect class="s-orig" x="${(X0 + d * gw + 1.5 + f * ((gw - 3) / 10)).toFixed(2)}" y="76" width="${((gw - 3) / 10 - 0.4).toFixed(2)}" height="16"/>`;
  return svg(W, 98, 'Two clocks of eight digits, each digit ten face layers: 160 face layers in all.', s);
}
const i4 = block({
  id: 'count',
  title: 'Layer count beats area: about 0.14 ms per repainted layer',
  status: ['OBSERVED', 'MODEL'],
  plain: `On the phone, how many layers a frame repaints costs far more than how many pixels. Each repainted layer adds about
0.14 ms; a whole megapixel adds only 0.1-0.6 ms. Ten tiny face layers per countdown digit add up fast.`,
  formula: `<math display="block"><mrow><mtext>Composite</mtext><mo>−</mo><mtext>Paint</mtext><mo>≈</mo><mi>a</mi><mo>+</mo><mi>b</mi><mo>·</mo><mtext>dev Mpx</mtext><mo>+</mo><mi>c</mi><mo>·</mo><mtext>records</mtext></mrow></math>
<p>fit over 4 builds: a = 6.1-11.7 ms, b = 0.12-0.58 ms per Mpx, c = 0.13-0.16 ms per Paint record</p>`,
  worked: `<ul><li>Build g's natural experiment: light and heavy frames repaint about the same area (${n('7.8 vs 8.1 dev Mpx')}), but the heavy ones have about ${n('85')} more Paint records and take ${n('+11.6 ms')} (Composite − Paint ${n('10.2 vs 21.8')}): ≈ 0.14 ms per layer.</li>
<li>About 80 of the heavy frames' records are 18×37 px digit faces: ${n('80 × 0.14 ≈ 11 ms')} of a 16.7 ms budget (derived).</li>
<li>One strip per digit: clock backed layers ${n('48 → 16')}, re-entry Paint records ${n('53.5 → 21')}; by the model ${n('32.5 × 0.14 ≈ 4.6 ms')} per such frame (derived, not measured).</li>
<li>The opposite case: giving the menu clock its own layer took redraws per opening ${n('196 → 11')} and redrawn backing ${n('~1117 → ~287 MB')}, for +1 layer and +1.2 MB (Simulator).</li></ul>`,
  fig: bars({
    max: 25, ticks: [0, 10, 20], unit: 'ms',
    aria: 'Build g: light frames 10.2 ms of Composite minus Paint at 7.8 megapixels; heavy frames 21.8 ms at 8.1 megapixels with about 85 more paint records.',
    rows: [{ group: 'build g, Composite − Paint per frame (p50)' }, { label: 'Light frames, under 50 records', v: 10.2, arm: 'fix', note: '7.8 Mpx' }, { label: 'Heavy frames, 80+ records', v: 21.8, arm: 'orig', note: '8.1 Mpx' }],
    caption: 'Same area, about twice the time: the difference is the number of layers repainted.',
  }) + figure(treeFig(), 'Why the count was high: every face span had its own layer (will-change: transform).'),
  source: `${code('research/design-engineering/safari-render-signals.md')} l.343-345, 351-354, 364; ${code('fixes/cd-strip/README.md')} l.16; ${code('research/design-engineering/apple-math.md')} l.453; ${code('fixes/BEST_BUILDS.md')} l.14. Fit from Timeline attribution runs, one cycle each; the per-record term may include Inspector overhead, bounded at about 3 ms per frame.`,
});

// ---------- 5. Style fan-out ----------
function subtreeFig() {
  let s = '';
  const cols = 23, rows = 10, X0 = 12, Y0 = 26, dx = 16.6, dy = 11;
  const hot = new Set([12, 37, 81, 104, 150, 177, 211]);
  s += `<text class="t-s" x="${X0}" y="14">.hero's ~230 elements: one write restyles all</text>`;
  for (let i = 0; i < cols * rows; i++) {
    const cx = X0 + (i % cols) * dx + 4, cy = Y0 + Math.floor(i / cols) * dy + 4;
    s += hot.has(i) ? `<circle class="s-orig" cx="${cx}" cy="${cy}" r="4.2"/>` : `<circle class="s-b34" cx="${cx}" cy="${cy}" r="2.6"/>`;
  }
  s += `<text class="t-s" x="${X0}" y="${Y0 + rows * dy + 12}">orange: the 7 that use the value</text>`;
  return svg(400, Y0 + rows * dy + 18, 'A grid of 230 dots for the hero subtree; 7 dots are highlighted, the elements that actually use the custom property.', s);
}
const i5 = block({
  id: 'fanout',
  title: 'Style fan-out: time = elements restyled × cost per element',
  status: ['MODEL', 'OBSERVED'],
  plain: `Writing an inherited custom property on a section root makes the engine restyle every element under it, whether or
not it uses the value. Writing it on the few elements that use it costs a thirtieth as much.`,
  formula: `<math display="block"><mrow><msub><mi>T</mi><mtext>style</mtext></msub><mo>=</mo><mi>S</mi><mo>·</mo><msub><mi>c</mi><mtext>el</mtext></msub><mspace width="1em"/><msub><mi>c</mi><mtext>el</mtext></msub><mo>≈</mo><mn>10-25 µs</mn><mspace width="1em"/><mi>S</mi><mo>=</mo><mrow><mo>{</mo><mtable><mtr><mtd><mo>|</mo><mtext>subtree</mtext><mo>|</mo></mtd><mtd><mtext>written on the root</mtext></mtd></mtr><mtr><mtd><mtext>consumers</mtext></mtd><mtd><mtext>written where used</mtext></mtd></mtr></mtable></mrow></mrow></math>
<p>c_el calibrated from Chrome: 3,848 elements in 215 ms at 6x = 56 µs each, about 9 µs unthrottled; phone range assumed</p>`,
  worked: `<ul><li>${code('--exit-opacity')} on .hero: S ≈ 230 → ${n('2.3-5.8 ms')} per scroll frame, 14-35 % of the budget. The 7 real consumers would cost ${n('0.07-0.18 ms')}, about 33x less (derived).</li>
<li>Budget: ${n('3 ms / c_el = 120-300')} elements per frame. One 0.72 frame restyled ${n('429')} elements → 4.3-10.7 ms (derived).</li>
<li>Cross-check: compositor-morph's scroll-driven animations on ~40 elements cost ${n('0.72 vs 0.15 ms')} of style per frame, so ${n('(0.72 − 0.15) / 40 ≈ 14 µs')} per animated element, inside the band.</li>
<li>Reality check: at the hero flip the phone showed style of about ${n('5 ms')} (1.9 + 3.1), at the bottom of the predicted 5-29, not inside it. Layout, not style, was the term the model missed.</li></ul>`,
  fig: figure(subtreeFig()) + ranges({
    max: 6, ticks: [0, 2, 4, 6], unit: 'ms',
    aria: 'Style time per frame: written on the hero root 2.3 to 5.8 ms; written on the 7 consumers 0.07 to 0.18 ms.',
    rows: [{ group: 'style time per frame, c_el 10-25 µs' }, { label: 'On .hero (230)', runs: [2.3, 5.8], arm: 'orig', show: '2.3-5.8' }, { label: 'On the 7 users', runs: [0.07, 0.18], arm: 'fix', show: '0.07-0.18' }],
  }) + bars({
    max: 450, ticks: [0, 100, 200, 300, 400], unit: 'elements', refs: [{ v: 120, label: 'budget low end 120' }, { v: 300, label: 'budget high end 300' }],
    aria: 'Elements restyled per frame against a budget of 120 to 300: hero subtree 230, the 0.72 flip frame 429, the 7 consumers 7.',
    rows: [{ label: 'Hero subtree', v: 230, arm: 'orig' }, { label: '0.72 flip frame', v: 429, arm: 'orig' }, { label: 'The 7 users', v: 7, arm: 'fix' }],
    caption: 'Dashed lines: the budget of 120-300 restyled elements per frame.',
  }),
  source: `${code('research/design-engineering/hero.md')} l.57-92; ${code('research/design-engineering/apple-math.md')} l.172, 402; ${code('fixes/compositor-morph/README.md')} l.42, 405-406; ${code('research/design-engineering/postmortem-hero.md')} l.30, 137-141`,
});

// ---------- 6. Forced layout ----------
function orderFig() {
  const X0 = 112, X1 = 392, sx = (u) => X0 + u * ((X1 - X0) / 20);
  let s = '';
  const lane = (y, label, sub, seq) => {
    s += `<text class="t-p" x="${X0 - 8}" y="${y + 9}" text-anchor="end">${label}</text><text class="t-m t-s" x="${X0 - 8}" y="${y + 22}" text-anchor="end">${sub}</text>`;
    let u = 0;
    for (const [kind, len] of seq) {
      const cls = kind === 'W' ? 's-ink' : kind === 'R' ? 's-b20' : kind === 'F' ? 'g-layout' : 'g-other';
      s += `<rect class="${cls}" x="${(sx(u) + 0.5).toFixed(1)}" y="${y}" width="${(sx(u + len) - sx(u) - 1).toFixed(1)}" height="20" rx="2"/>`;
      const t = kind === 'F' ? 'layout' : kind === 'U' ? 'update' : kind;
      s += `<text class="t-s" x="${((sx(u) + sx(u + len)) / 2).toFixed(1)}" y="${y + 14}" text-anchor="middle" style="fill: var(${kind === 'W' ? '--sheet' : kind === 'R' ? '--ink' : '--on-light'})">${t}</text>`;
      u += len;
    }
  };
  lane(10, 'Interleaved', '3 flushes', [['W', 1], ['R', 1], ['F', 3], ['W', 1], ['R', 1], ['F', 3], ['W', 1], ['R', 1], ['F', 3], ['U', 4]]);
  lane(50, 'Reads first', '1 layout', [['R', 1], ['R', 1], ['R', 1], ['W', 1], ['W', 1], ['W', 1], ['U', 4], ['F', 3]]);
  return svg(400, 76, 'Top: write, read, write, read, write, read; each read after a write forces a layout, three in one frame. Bottom: three reads then three writes; the rendering update lays out once.', s);
}
const i6 = block({
  id: 'forced',
  title: 'Forced layout: order, not count',
  status: ['CONFIRMED', 'MODEL', 'OBSERVED'],
  plain: `A layout read is nearly free when nothing is pending. A read right after a style write must first run all the
pending style and layout work. So the cost is set by how many times the code switches from writing to reading, and the
first dirty reader pays for everyone: remove it and the next reader pays instead.`,
  formula: `<math display="block"><mrow><mi>T</mi><mo>=</mo><mi>G</mi><mo>·</mo><msub><mi>c</mi><mtext>arith</mtext></msub><mo>+</mo><mi>R</mi><mo>·</mo><msub><mi>c</mi><mtext>read</mtext></msub><mo>+</mo><msub><mi>n</mi><mtext>dirty</mtext></msub><mo>·</mo><msub><mi>T</mi><mtext>flush</mtext></msub><mspace width="1em"/><msub><mi>n</mi><mtext>dirty</mtext></msub><mo>=</mo><mo>#</mo><mtext> write → read switches</mtext></mrow></math>
<p>G arithmetic steps, R clean reads; reading a non-zero scrollY in WebKit also runs pending layout</p>`,
  worked: `<ul><li>Apple's page: ${n('440')} clean reads per frame with ${n('0 ms')} forced. The iPhone 18 Pro page does the same reads after a write: ${n('12-25 ms')} per event.</li>
<li>Ours, Chrome 6x: the nav scroll handler ran ${n('316-320')} calls and took ${n('526-617 ms')} per run, ${n('1.64-1.95 ms')} per call (derived, ranges unpaired), 2-4 ms per frame.</li>
<li>Moved, not removed: the pain section's reads went 333 → 0 per pass; iE's forced layout fell ${n('46-52 → 4-7 ms')}, but the next reader rose ${n('15-20 → 25-30 ms')}; net −24 ms, within noise.</li>
<li>Phone, robot finger: layouts per morph frame ${n('2.23-2.38 → 1.00-1.04')}. Of 291 layouts forced in script over 922 Simulator frames, ${n('158')} came from elementsFromPoint and ${n('44')} from window.scrollY.</li></ul>`,
  fig: figure(orderFig() + legendHtml([['ink', 'W style write'], ['b20', 'R layout read'], ['g-layout', 'forced or normal layout'], ['g-other', 'rest of the rendering update']]).replace(/a-g-/g, 'g-'), 'Schematic, not to a measured scale.') + ranges({
    max: 55, ticks: [0, 25, 50], unit: 'ms',
    aria: 'Chrome 6x: iE forced layout fell from 46 to 52 ms to 4 to 7 ms, while the next reader rose from 15 to 20 ms to 25 to 30 ms.',
    rows: [{ group: "iE's forced layout per run" }, { label: 'Before', runs: [46, 52], arm: 'orig', show: '46-52' }, { label: 'After', runs: [4, 7], arm: 'fix', show: '4-7' }, { group: 'the next reader' }, { label: 'Before', runs: [15, 20], arm: 'orig', show: '15-20' }, { label: 'After', runs: [25, 30], arm: 'fix', show: '25-30' }],
    caption: 'The cost moved to the next reader: net −24 ms, within noise (Chrome 6x).',
  }),
  source: `${code('research/design-engineering/apple-math.md')} l.75-94; ${code('fixes/TOPICS.md')} l.50; ${code('fixes/FINDINGS.md')} l.65; ${code('fixes/compositor-morph/README.md')} l.202; ${code('research/architecture/gpu-compositor-playbook.md')} l.152-155; ${code('LocalDOMWindow.cpp')} WK main l.1508-1512`,
});

export default [
  { key: 'before-a-script-on-every-frame', html: p0, order: 60 },
  { key: 'lesson-1', html: i6 },
  { key: 'lesson-2', html: i5 },
  { key: 'lesson-11', html: i3 + i1 },
  { key: 'lesson-12', html: i4 },
  { key: 'lesson-13', html: i2 },
];

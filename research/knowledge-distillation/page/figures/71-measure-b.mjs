// Measurement math M6-M14 (de-viz-math-measure, parts 2-3): verdicts, blocks, proxies, zones, LoAF, heat.
import { readFileSync } from 'node:fs';
import { block, bars, ranges, figure, svg, legendHtml } from './_lib.mjs';

const F = JSON.parse(readFileSync(new URL('./_frames.json', import.meta.url), 'utf8'));
const n = (x) => `<span class="num">${x}</span>`;
const code = (x) => `<code>${x}</code>`;
const C = (a, b) => { let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return r; };
const tbl = (head, rows) => `<div class="tbl"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// ---------- M6: verdict rule and A/A floor ----------
const pv = (k) => 2 / C(2 * k, k), p1 = (k) => 1 / C(2 * k, k), fw = (k) => 1 - (1 - pv(k)) ** 14;
const m6 = block({
  id: 'verdict',
  title: 'The verdict rule and the A/A noise floor',
  status: ['RULE', 'MODEL', 'OBSERVED'],
  plain: `An A/B says "better" only when every patched run beats every baseline run. If the patch did nothing, that still
happens by luck now and then, and more often when one A/B reads many metrics at once. An A/A (the same build against
itself) shows how big the luck is on the day.`,
  formula: `<math display="block"><mrow><mi>P</mi><mo>(</mo><mtext>separated by luck</mtext><mo>)</mo><mo>=</mo><mfrac><mn>2</mn><mrow><mo>(</mo><mfrac linethickness="0"><mrow><mn>2</mn><mi>n</mi></mrow><mi>n</mi></mfrac><mo>)</mo></mrow></mfrac><mspace width="1.2em"/><mi>P</mi><mo>(</mo><mtext>at least one of</mtext><mi>m</mi><mo>)</mo><mo>=</mo><mn>1</mn><mo>−</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>−</mo><mi>p</mi><mo>)</mo></mrow><mi>m</mi></msup></mrow></math>
<p>n runs per side, exchangeable if the patch does nothing. A named direction ("better") by luck is half that, 1 / C(2n, n). m ≈ 14 metrics per A/B, treated as independent (they are correlated, so these are rough upper values)</p>`,
  worked: `${tbl(['runs per side n', 'one metric, named direction', 'one metric, either direction', 'any of 14 metrics, either'], [3, 4, 5].map((k) => [k, n(`1 / ${C(2 * k, k)} = ${(100 * p1(k)).toFixed(k === 5 ? 2 : 1)} %`), n(`2 / ${C(2 * k, k)} = ${(100 * pv(k)).toFixed(k === 5 ? 2 : 1)} %`), n(`${(100 * fw(k)).toFixed(k === 5 ? 1 : 0)} %`)]))}
<p>With 3 runs a side, 5 % is lesson 26's "about p 0.05" for one metric in a named direction; 10 % is the A/A false-alarm rate, either way.</p>
<ul><li>Same-hold A/A before wave 1 (load1 1.9-3.6): every metric "within noise", e.g. fps ${n('93 [89.7-93.4]')} against ${n('92.3 [88.9-92.9]')}, frames over 34 ms ${n('5 [4-6]')} against ${n('5 [5-7]')}.</li>
<li>Under heavy load (load1 32.9-50.2, three Chromes at once) identical code got "verdicts" in ${n('5, 2 and 5 of 8')} metrics. On the unchanged baseline, frames over 20 ms were ${n('~66')} at load1 below 6 against ${n('96-103')} at load1 6-15.</li></ul>`,
  fig: ranges({
    max: 115, ticks: [85, 95, 105, 115], unit: 'fps',
    aria: 'A/A: base 89.7 to 93.4 fps against base 88.9 to 92.9, overlapping. A/B wave 1: 91.5 to 94.3 against 105.5 to 110.9, apart.',
    min: 85,
    rows: [
      { group: 'A/A: the same build twice, same hold' },
      { label: 'Base', runs: [89.7, 93, 93.4], arm: 'orig', show: '93', note: '89.7-93.4' },
      { label: 'Base again', runs: [88.9, 92.3, 92.9], arm: 'orig', show: '92.3', note: '88.9-92.9' },
      { group: 'A/B: wave 1' },
      { label: 'Base', runs: [91.5, 93.8, 94.3], arm: 'orig', show: '93.8', note: '91.5-94.3' },
      { label: 'Wave 1', runs: [105.5, 110.6, 110.9], arm: 'fix', show: '110.6', note: '105.5-110.9' },
    ],
    caption: 'Chrome 6x. Dots: lowest run, median, highest run; the line is the range. The A/A ranges overlap, the A/B ranges do not. Axis starts at 85 fps.',
  }),
  source: `${code('tools/lib/ab-stats.mjs')} l.34-38; ${code('research/measurement-parallelism/README.md')} l.112, 115-116; ${code('research/architecture/measurement-review.md')} l.48; ${code('fixes/all-wave1/README.md')} l.54-62; ${code('fixes/FINDINGS.md')} l.59`,
});

// ---------- M7: C V V C C V V C ----------
function blockFig() {
  const order = 'CVVCCVVC'.split('');
  const X0 = 30, W = 42, Y = 30;
  let s = `<text class="t-m t-s" x="${X0}" y="14">run order in one block, heat or time drift rising →</text>`;
  // drift ramp: a wedge under the slots, to scale with slot position
  s += `<polygon class="s-frame" points="${X0},${Y + 74} ${X0 + 8 * W},${Y + 74} ${X0 + 8 * W},${Y + 46}"/>`;
  order.forEach((a, i) => {
    const x = X0 + i * W;
    s += `<rect class="${a === 'C' ? 's-mid' : 's-fix'}" x="${x + 3}" y="${Y}" width="${W - 6}" height="30" rx="3"/>`;
    s += `<text class="t-d" x="${x + W / 2}" y="${Y + 20}" text-anchor="middle" style="fill: var(--sheet)">${a}</text>`;
    s += `<text class="t-m t-s" x="${x + W / 2}" y="${Y + 44}" text-anchor="middle">${i + 1}</text>`;
  });
  s += `<text class="t-s" x="${X0}" y="${Y + 92}">C at 1, 4, 5, 8: mean 4.5 · V at 2, 3, 6, 7: mean 4.5</text>`;
  // 70 ways to pick 4 of 8; one is as extreme as U = 0
  const gx = X0, gy = Y + 112;
  for (let k = 0; k < 70; k++) {
    const cx = gx + (k % 14) * 26 + 8, cy = gy + Math.floor(k / 14) * 16 + 6;
    s += `<circle class="${k === 0 ? 's-orig' : 's-frame'}" cx="${cx}" cy="${cy}" r="${k === 0 ? 5 : 4}"${k === 0 ? '' : ' style="stroke: var(--muted); stroke-width: .6"'}/>`;
  }
  s += `<text class="t-s" x="${X0}" y="${gy + 5 * 16 + 14}">70 ways to split 8 runs 4 + 4; orange: all V beat all C</text>`;
  return svg(400, gy + 5 * 16 + 20, 'Eight runs in the order C V V C C V V C under a rising drift: both arms have mean position 4.5. Below, 70 dots for the 70 ways to choose 4 of 8 runs; one is as extreme as all V runs beating all C runs.', s);
}
const m7 = block({
  id: 'blocks',
  title: 'Phone blocks: C V V C C V V C and p = 1/70',
  status: ['RULE'],
  plain: `The phone warms up during a block, so whichever build runs later looks worse. Running the control and the variant
as C V V C C V V C gives both the same average position in time, so a steady drift cancels. If all four V runs beat all
four C runs, the chance of that by luck is 1 in 70.`,
  formula: `<math display="block"><mrow><mi>p</mi><mo>=</mo><mfrac><mn>1</mn><mrow><mo>(</mo><mfrac linethickness="0"><mn>8</mn><mn>4</mn></mfrac><mo>)</mo></mrow></mfrac><mo>=</mo><mfrac><mn>1</mn><mn>70</mn></mfrac><mo>≈</mo><mn>0.014</mn><mspace width="1.2em"/><mtext>3 vs 3:</mtext><mspace width="0.4em"/><mfrac><mn>1</mn><mrow><mo>(</mo><mfrac linethickness="0"><mn>6</mn><mn>3</mn></mfrac><mo>)</mo></mrow></mfrac><mo>=</mo><mfrac><mn>1</mn><mn>20</mn></mfrac><mo>=</mo><mn>0.05</mn></mrow></math>
<p>win after block 1 only if U = 0 (exact one-sided Mann-Whitney) and the Hodges-Lehmann shift (median of the 16 pairwise
improvements) ≥ max(minimum shift, half the predicted delta). Minimum shift: phone 4 ms for p50/p95, 1 frame per run for
counts; Chrome 1 tick.</p>`,
  worked: `<p>The 3-arm hero block (11 Oct): v6 against v4 over 34 ms has U = 0 (${n('13, 6, 7')} all below ${n('17, 18, 18')}), so p = 1/20.
A 3-arm block compares 3 runs with 3, so its best possible p is 0.05, above 1/70: it can never be a protocol win in block 1.
That is why that README reports range comparisons instead.</p>`,
  fig: figure(blockFig(), 'Top: slot positions, to scale. Bottom: the 70 equally likely splits if the builds were the same.'),
  source: `${code('research/architecture/measurement-protocol-v2.md')} l.321-326, 333-339; ${code('tools/lib/stats.mjs')} l.11-23; ${code('fixes/hero-exit-threaded/README.md')} l.1074-1084`,
});

// ---------- M8: Chrome 6x as a stand-in ----------
function curveFig() {
  const th = [30, 34, 38, 46, 50, 54];
  const phone = [[20, 18, 14, 9, 7, 5], [20, 16, 12, 6, 6, 5], [20, 13, 12, 7, 4, 4]];
  const chrome = [[32, 14, 13, 7, 7, 4], [31, 13, 10, 6, 5, 2], [31, 10, 10, 5, 3, 3]];
  const X0 = 40, X1 = 380, Y0 = 170, Y1 = 20, MAXY = 35;
  const sx = (t) => X0 + ((t - 30) / 24) * (X1 - X0), sy = (v) => Y0 - (v / MAXY) * (Y0 - Y1);
  let s = '';
  for (const v of [0, 10, 20, 30]) s += `<line class="s-rule" x1="${X0}" y1="${sy(v)}" x2="${X1}" y2="${sy(v)}"/><text class="t-m t-s" x="${X0 - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  for (const t of th) s += `<text class="t-m t-s" x="${sx(t)}" y="${Y0 + 16}" text-anchor="middle">${t}</text>`;
  s += `<text class="t-m t-s" x="${X1}" y="${Y0 + 30}" text-anchor="end">threshold, ms</text>`;
  s += `<text class="t-m t-s" x="${X0 - 34}" y="${Y1 - 6}">frames per run over the line</text>`;
  const line = (runs, cls) => runs.map((r) => `<polyline class="${cls}" stroke-width="2" points="${r.map((v, i) => `${sx(th[i]).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}"${cls === 's-line' ? ' stroke-dasharray="5 3"' : ''}/>${r.map((v, i) => `<circle class="${cls === 's-line' ? 's-ink' : 's-b34'}" cx="${sx(th[i]).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="3" style="stroke: var(--sheet); stroke-width: 1.5"><title>${v} frames over ${th[i]} ms</title></circle>`).join('')}`).join('');
  s += line(phone, 's-b34s') + line(chrome, 's-line');
  return svg(400, Y0 + 34, 'Frames per run over each threshold from 30 to 54 ms: three phone runs and three Chrome 6x runs track each other closely.', s);
}
const m8 = block({
  id: 'proxy',
  title: 'Why Chrome 6x stands in for the phone, and why 1x saw nothing',
  status: ['CONFIRMED', 'OBSERVED', 'MODEL'],
  plain: `Chrome's CPU throttle slows only the page's main thread. Its rate can be tuned until Chrome's slow-frame counts
match the phone's, but that matches a count, not a cause: the phone pays stages and a 60 Hz grid the throttle cannot
reproduce.`,
  formula: `<math display="block"><mrow><msub><mi>dt</mi><mtext>Chrome</mtext></msub><mo>≈</mo><mo>max</mo><mo>(</mo><mi>r</mi><mo>·</mo><msub><mi>T</mi><mtext>main</mtext></msub><mo>,</mo><msub><mi>T</mi><mtext>other stages</mtext></msub><mo>)</mo><mspace width="1.2em"/><mtext>distance</mtext><mo>=</mo><mfrac><mn>1</mn><mn>4</mn></mfrac><munder><mo>∑</mo><mtext>&gt;34, &gt;50, &gt;100, worst</mtext></munder><mo>|</mo><mfrac><mrow><mtext>chrome</mtext><mo>+</mo><mn>1</mn></mrow><mrow><mtext>phone</mtext><mo>+</mo><mn>1</mn></mrow></mfrac><mo>−</mo><mn>1</mn><mo>|</mo></mrow></math>
<p>the throttle busy-waits run_duration × (r − 1) about every 200 µs on the renderer main thread; compositor, raster, GPU and workers run at full speed</p>`,
  worked: `${tbl(['config', '&gt;34 per run', '&gt;50', '&gt;100', 'worst ms', 'distance'], [
    ['phone', '15.7', '5.7', '0.7', '104', '0'], ['Chrome 1x', '0.0', '0.0', '0.0', '16', '0.76'], ['Chrome 4x', '3.3', '0.7', '0.0', '52', '0.60'],
    ['<strong>Chrome 6x</strong>', '<strong>12.3</strong>', '<strong>5.0</strong>', '<strong>0.3</strong>', '<strong>89</strong>', '<strong>0.17</strong>'], ['Chrome 20x', '108.3', '97.7', '52.3', '428', '13.18']])}
<ul><li>6x check: |13.3/16.7 − 1| = ${n('0.204')}, |6.0/6.67 − 1| = ${n('0.10')}, |1.3/1.7 − 1| = ${n('0.235')}, |89.9/105.3 − 1| = ${n('0.146')}; mean ${n('0.17')}.</li>
<li>The CPU is not the reason: a micro-benchmark took ${n('261 ms')} on the phone and ${n('255 ms')} in Chrome 1x. The throttle is super-linear for DOM work: nominal 6x costs ${n('7.8x')}.</li>
<li>Same count, different shape: Chrome 6x run 1 has ${n('128')} frames over 20 ms against the phone run 1's ${n('72')}, for similar counts over 34 (${n('14 against 18')}).</li></ul>`,
  fig: bars({
    max: 110, ticks: [0, 25, 50, 75, 100], unit: 'per run',
    aria: 'Frames over 34 ms per scripted run: phone 15.7; Chrome 1x 0, 4x 3.3, 6x 12.3, 20x 108.3.',
    rows: [{ label: 'Phone', v: 15.7, arm: 'b34', note: '18, 16, 13' }, { label: 'Chrome 1x', v: 0, arm: 'ink' }, { label: 'Chrome 4x', v: 3.3, arm: 'ink' }, { label: 'Chrome 6x', v: 12.3, arm: 'ink', note: 'closest' }, { label: 'Chrome 20x', v: 108.3, arm: 'ink' }],
    caption: 'Frames over 34 ms per scripted run, mean of 3 runs per config.',
  }) + figure(curveFig() + legendHtml([['b34', 'phone, 3 runs (grey, solid)'], ['ink', 'Chrome 6x, 3 runs (dark, dashed)']]), `Frames per run over each line from 30 to 54 ms (at 20 ms: phone 72/62/57,
Chrome 128/113/129; at 100 ms: 1/1/0 and 1/0/0). Chrome 1x is 0 at every line (its longest frames were 15.3-18 ms). 30 Sep
calibration runs, scripted scroll, display on, live site before the frozen snapshot.`),
  source: `${code('research/cpu-throttle-calibration/README.md')} l.29, 51-60, 68; ${code('research/cpu-throttle-calibration/tools/calibrate_jank.py')} l.42-44; ${code('research/architecture/claims-audit.md')} l.244-245 (Chromium ${code('thread_cpu_throttler.cc')} l.76-86, 117-175)`,
});

// ---------- M9: the zone metric ----------
function agreeFig() {
  const rows = [
    ['Very slow per 100 moving frames, finger zone, swiped run', 7, 0, [0, 0, 0, 0, 1, 1, 1]],
    ['Robot zone frame bands (f34/f50)', 1, 0],
    ['Behaviour: reach, turn-back, settle, glide', 5, 1],
    ['Scripted whole-page counts', 0, 2],
    ['Isolated morph counts', 0, 1],
    ['touchToScrollMs', 0, 2],
  ];
  const cell = (cls, t, title) => `<i class="ag ${cls}" title="${title}">${t}</i>`;
  return `<div class="agree" role="img" aria-label="Agreement with the user's blind swipe picks: the zone metric agreed 7 of 7 (3 of them 'same' verdicts); robot zone bands 1 and 0; behaviour checks 5 and 1; scripted whole-page counts 0 and 2; isolated morph counts 0 and 1; touchToScrollMs 0 and 2.">${rows.map(([lab, a, d, same]) =>
    `<div class="ag-row"><span class="hb-l">${lab}</span><span class="ag-cells">${Array.from({ length: a }, (_, i) => cell(same && same[i] ? 'ag-same' : 'ag-yes', '✓', same && same[i] ? 'agreed, a "same" verdict' : 'agreed')).join('')}${Array.from({ length: d }, () => cell('ag-no', '✗', 'disagreed')).join('')}</span><span class="hb-v">${a} agree · ${d} not</span></div>`).join('')}</div>`;
}
const m9 = block({
  id: 'zone',
  title: 'The zone metric that agreed with the blind swipes',
  status: ['OBSERVED', 'MODEL'],
  plain: `Of all the numbers we kept, one matched the user's blind finger picks every time: very slow frames per 100 moving
frames, counted only where the finger was scrolling, in the very run the user swiped.`,
  formula: `<math display="block"><mrow><mtext>rate</mtext><mo>=</mo><mn>100</mn><mo>·</mo><mfrac><mrow><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>50</mn></mrow></msub><mtext> in the finger's zone</mtext></mrow><mrow><msub><mi>N</mi><mtext>moving</mtext></msub><mtext> in that zone</mtext></mrow></mfrac></mrow></math>
<p>3 of the 7 were "same" verdicts, which have no 50 % chance level, and one pair was confounded. On the 4 pairs that picked a side (one of them confounded), a coin flip would match all 4 in 0.5⁴ = 6.25 % of cases (rough, our model). One user, one phone.</p>`,
  worked: `<ul><li>C-019: the whole-page scripted count showed no win (p 0.162, threshold-sensitive). The zone metric from the swiped runs read V ${n('7 / 760 = 0.92')} against C ${n('19 / 828 = 2.29')} per 100 moving frames, and the user picked V.</li>
<li>C-041/042: C ${n('6.7')} against V ${n('3.9')} per 100; the user picked V.</li></ul>`,
  fig: figure(agreeFig(), 'One cell per blind pair the metric was checked on. Hatched cells are agreements on a "same" verdict. Not shown: the cost card, right for its own claim (less work) but wrong once as a feel predictor.') + bars({
    max: 2.5, ticks: [0, 1, 2], unit: 'per 100',
    aria: 'C-019: very slow frames per 100 moving frames in the finger zone, control 2.29, variant 0.92.',
    rows: [{ group: 'C-019, very slow per 100 moving frames in the finger zone' }, { label: 'C (control)', v: 2.29, arm: 'mid' }, { label: 'V (picked)', v: 0.92, arm: 'fix' }],
  }),
  source: `${code('research/architecture/stats-vs-finger.md')} l.8-10, 30, 50, 55, 74-80`,
});

// ---------- M10: a script is not a finger ----------
const m10 = block({
  id: 'finger',
  title: 'A script is not a finger: about twice the dropped frames',
  status: ['OBSERVED'],
  plain: `The same phone, the same page, the same day: a finger scroll dropped about twice the share of pictures that a
scripted scroll did, and its worst frame was more than twice as long.`,
  formula: `<math display="block"><mrow><mtext>dropped</mtext><mo>=</mo><mfrac><mrow><mo>∑</mo><mtext>missed</mtext></mrow><mrow><mo>∑</mo><mtext>missed</mtext><mo>+</mo><mtext>frames</mtext></mrow></mfrac><mspace width="1.2em"/><mtext>slow per s</mtext><mo>=</mo><mfrac><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>34</mn></mrow></msub><mi>W</mi></mfrac></mrow></math>
<p>finger runs show stretches of 12-13 ms gaps (about 80 Hz), so compare them by ms thresholds and per-second rates, not raw frame counts</p>`,
  worked: `<ul><li>Finger, scroll down, 23.5 s: dropped ${n('24.4 %')}, ${n('107')} frames over 34 ms (${n('4.6 per s')}), worst ${n('232 ms')}.</li>
<li>Scripted, mean of 3 runs, 6.7 s: dropped ${n('13.6 %')}, ${n('15.7')} over 34 ms (${n('2.3 per s')}, derived), worst ${n('104 ms')}.</li></ul>`,
  fig: [
    bars({ max: 30, ticks: [0, 10, 20, 30], unit: '%', aria: 'Dropped pictures: scripted 13.6 percent, finger 24.4 percent.', rows: [{ group: 'dropped pictures' }, { label: 'Scripted', v: 13.6, arm: 'ink', show: '13.6 %' }, { label: 'Finger', v: 24.4, arm: 'orig', show: '24.4 %' }] }),
    bars({ max: 5, ticks: [0, 2, 4], unit: 'per s', aria: 'Frames over 34 ms per second: scripted 2.3, finger 4.6.', rows: [{ group: 'frames over 34 ms per second' }, { label: 'Scripted', v: 2.3, arm: 'ink' }, { label: 'Finger', v: 4.6, arm: 'orig' }] }),
    bars({ max: 250, ticks: [0, 100, 200], unit: 'ms', aria: 'Worst frame: scripted 104 ms, finger 232 ms.', rows: [{ group: 'worst frame' }, { label: 'Scripted', v: 104, arm: 'ink' }, { label: 'Finger', v: 232, arm: 'orig' }], caption: 'Phone, original page, 30 Sep, display on. Grey: scripted scroll; orange: finger.' }),
  ].join(''),
  source: `${code('research/cpu-throttle-calibration/iphone.md')} l.146, 150; ${code('research/architecture/claims-audit.md')} C3`,
});

// ---------- M11: where the slow frames sit ----------
function zoneFig() {
  const fr = F.iphone1.frames;
  const X0 = 34, X1 = 392, Y0 = 170, Y1 = 26, MAXY = 120, MAXX = 5260;
  const sx = (y) => X0 + (y / MAXX) * (X1 - X0), sy = (v) => Y0 - (Math.min(v, MAXY) / MAXY) * (Y0 - Y1);
  const bands = [['A', 600, 760], ['B', 1230, 1260], ['C', 1360, 1430], ['D', 1580, 1880], ['E', 1940, 2000], ['F', 2400, 2900], ['G', 4560, 4600]];
  let s = '';
  for (const [l, a, b] of bands) {
    s += `<rect class="s-frame" x="${sx(a).toFixed(1)}" y="${Y1}" width="${Math.max(2, sx(b) - sx(a)).toFixed(1)}" height="${Y0 - Y1}" opacity="0.55"/>`;
    s += `<text class="t-s" x="${((sx(a) + sx(b)) / 2).toFixed(1)}" y="${Y1 - 5}" text-anchor="middle">${l}</text>`;
  }
  for (const v of [0, 34, 50, 100]) s += `<line class="${v === 34 || v === 50 ? 's-mrule' : 's-rule'}" x1="${X0}" y1="${sy(v)}" x2="${X1}" y2="${sy(v)}"${v === 34 || v === 50 ? ' stroke-dasharray="3 3"' : ''}/><text class="t-m t-s" x="${X0 - 5}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  for (const y of [0, 1000, 2000, 3000, 4000, 5000]) s += `<text class="t-m t-s" x="${sx(y)}" y="${Y0 + 15}" text-anchor="middle">${y.toLocaleString('en-US')}</text>`;
  s += `<text class="t-m t-s" x="${X1}" y="${Y0 + 29}" text-anchor="end">scrollY, CSS px</text><text class="t-m t-s" x="2" y="${Y1 - 5}">dt ms</text>`;
  for (const [, dt, y] of fr) s += `<circle class="${dt > 50 ? 's-vslow' : dt > 34 ? 's-slow' : 's-b34'}" cx="${sx(y).toFixed(1)}" cy="${sy(dt).toFixed(1)}" r="${dt > 34 ? 2.8 : 1.6}"><title>${dt} ms at y ${Math.round(y)}</title></circle>`;
  return svg(400, Y0 + 33, 'Every frame of a scripted phone scroll, frame time against scroll position. The slow frames bunch in seven narrow position bands, A to G, where page state flips.', s);
}
function timeFig() {
  const bins = [[0, 8.5, 17.2, '130 / 757'], [8.5, 20, 7.0, '139 / 1,992'], [20, 40, 1.0, '106 / 10,284']];
  const X0 = 34, X1 = 380, Y0 = 110, Y1 = 20, sx = (t) => X0 + (t / 40) * (X1 - X0), sy = (v) => Y0 - (v / 20) * (Y0 - Y1);
  let s = '';
  for (const v of [0, 10, 20]) s += `<line class="s-rule" x1="${X0}" y1="${sy(v)}" x2="${X1}" y2="${sy(v)}"/><text class="t-m t-s" x="${X0 - 5}" y="${sy(v) + 4}" text-anchor="end">${v} %</text>`;
  for (const [a, b, v, lab] of bins) {
    s += `<rect class="s-slow" x="${sx(a) + 1}" y="${sy(v)}" width="${sx(b) - sx(a) - 2}" height="${Y0 - sy(v)}"><title>${a}-${b === 40 ? 'later' : b} s: ${v} %</title></rect>`;
    s += `<text class="t-s" x="${a === 0 ? sx(a) + 3 : (sx(a) + sx(b)) / 2}" y="${sy(v) - 5}" text-anchor="${a === 0 ? 'start' : 'middle'}">${v} % · ${lab}</text>`;
  }
  for (const t of [0, 8.5, 20, 40]) s += `<text class="t-m t-s" x="${sx(t)}" y="${Y0 + 15}" text-anchor="${t === 40 ? 'end' : 'middle'}">${t === 40 ? 'later →' : t}</text>`;
  s += `<text class="t-m t-s" x="${X1}" y="${Y0 + 29}" text-anchor="end">seconds after the page is ready</text>`;
  return svg(400, Y0 + 33, 'Share of moving frames over 34 ms by time since load: 17.2 percent in the first 8.5 s, 7.0 percent from 8.5 to 20 s, 1.0 percent after 20 s.', s);
}
const m11 = block({
  id: 'where',
  title: 'Where the slow frames sit: by scroll position and by time since load',
  status: ['OBSERVED'],
  plain: `Slow frames are not spread evenly. They land at the same few scroll positions in every run, where some state flips,
and they crowd the first seconds after load. A per-run average blurs both.`,
  formula: `<math display="block"><mrow><msub><mi>N</mi><mtext>zone</mtext></msub><mo>=</mo><mo>#</mo><mo>{</mo><mi>f</mi><mo>:</mo><msub><mi>dt</mi><mi>f</mi></msub><mo>&gt;</mo><mn>34</mn><mo>,</mo><msub><mi>y</mi><mi>f</mi></msub><mo>∈</mo><mtext>zone</mtext><mo>}</mo><mspace width="1.2em"/><msub><mtext>share</mtext><mtext>bin</mtext></msub><mo>=</mo><mfrac><mrow><mo>#</mo><mtext> slow in bin</mtext></mrow><mrow><mo>#</mo><mtext> moving in bin</mtext></mrow></mfrac></mrow></math>`,
  worked: `<ul><li>18 scripted phone runs: the long frames land at the same scrollY every run. Frames over 34 ms per run: A y 600-760 ${n('2')}; B 1230-1260 ${n('1')}; C 1360-1430 ${n('1')}; D 1580-1880 ${n('5-7')}; E 1940-2000 ${n('2')} (the worst frame of every run, 89-119 ms); F 2400-2900 ${n('2-3')}; G 4560-4600 ${n('1')}. About 10 of the 14-17 slow frames per run sit on about 8 state flips.</li>
<li>Run 1, dt at y: 40@42, 36@143, 44@678, 64@738, 71@1250, 37@1355, 47@1620, 50@1681, 36@1734, 111@1958, 75@1984, 41@1994, 51@2062, 38@2481, 40@2664, 51@2885, 59@2972, 42@4566.</li>
<li>By time (robot flicks, Xcode-induced Serious, 8 runs pooled): 0-8.5 s ${n('130 / 757 = 17.2 %')}; 8.5-20 s ${n('139 / 1,992 = 7.0 %')}; 20 s and later ${n('106 / 10,284 = 1.0 %')}. Every hero frame falls 3-8 s after load, so "the hero is slow" and "the first strokes are slow" cannot be told apart.</li>
<li>The same idea at run level is the C V V C order (lesson 26); at the end of the page, binning by morph value instead of time hid a start transient of 115-127 ms in the first 300-400 ms of every build (lesson 28).</li></ul>`,
  fig: figure(zoneFig(), `Scripted phone run 1 (30 Sep calibration, before the fixes): all ${F.iphone1.frames.length} frames; dashed lines at 34 and 50 ms;
shaded bands are the clusters A-G found over 18 runs.`) + figure(timeFig(), 'Bin widths to scale on the time axis; the last bin runs on past the edge.'),
  source: `${code('research/architecture/measurement-review.md')} l.20-38; ${code('research/cpu-throttle-calibration/data/iphone/scroll_run1.json')}; ${code('research/serious-heat/README.md')} l.82-83, 101-107`,
});

// ---------- M12: LoAF ----------
const c1 = F.chrome6x1.frames.map((f) => f[1]);
const cnt = (lo, hi) => c1.filter((d) => d > lo && d <= hi).length;
const h = [cnt(-1, 20), cnt(20, 34), cnt(34, 50), cnt(50, 1e9)];
if (c1.filter((d) => d > 20).length !== 128 || c1.filter((d) => d > 50).length !== 7) throw new Error('M12 counts');
const m12 = block({
  id: 'loaf',
  title: "LoAF's 50 ms cut misses most slow frames",
  status: ['CONFIRMED', 'OBSERVED'],
  plain: `Long Animation Frames, the browser API made to catch janky frames, reports only frames of 50 ms or more. Most frames
a thumb feels are shorter than that, so the API stays quiet while the scroll stutters.`,
  formula: `<math display="block"><mrow><mtext>unseen</mtext><mo>=</mo><mfrac><mrow><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>20</mn></mrow></msub><mo>−</mo><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>50</mn></mrow></msub></mrow><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>20</mn></mrow></msub></mfrac><mo>=</mo><mfrac><mrow><mn>128</mn><mo>−</mo><mn>7</mn></mrow><mn>128</mn></mfrac><mo>=</mo><mn>95 %</mn></mrow></math>`,
  worked: `<p>Chrome 6x run 1, scroll phase: ${n(c1.length)} frames; rAF gaps over 20 ms ${n('128')}, over 34 ${n('14')}, over 50 ${n('7')}; LoAF entries ${n('3')} (${n('206 ms')} in all).
So 121 of the 128 frames over 20 ms sit under the LoAF line. Lesson 25 quotes the same effect as about 100 frames over 20 ms per run invisible to it.</p>`,
  fig: bars({
    max: 260, ticks: [0, 100, 200], unit: 'frames',
    aria: `Chrome 6x run 1 frame times: ${h[0]} up to 20 ms, ${h[1]} from 20 to 34, ${h[2]} from 34 to 50, ${h[3]} over 50. LoAF reports only the last group, as 3 entries.`,
    rows: [{ label: 'up to 20 ms', v: h[0], arm: 'b20' }, { label: '20-34 ms', v: h[1], arm: 'b34' }, { label: '34-50 ms', v: h[2], arm: 'slow' }, { label: 'over 50 ms, all LoAF sees (3 entries)', v: h[3], arm: 'vslow' }],
    caption: 'Only the last row is above the LoAF line. 30 Sep calibration run, scripted scroll, live site.',
  }),
  source: `w3c.github.io/long-animation-frames; ${code('research/cpu-throttle-calibration/data/chrome/scroll-mobile-6x.run1.json')} (phases.scroll); ${code('research/architecture/measurement-protocol-v2.md')} l.149`,
});

// ---------- M13: heat rate ----------
const m13 = block({
  id: 'heat',
  title: 'Heat rate in °C per minute, over a blank floor page',
  status: ['RULE', 'OBSERVED'],
  plain: `How fast a page warms the phone is a slope: battery temperature against time. A hotter start warms more slowly, so
each slope is corrected to a 37 °C start, and a blank page's slope is subtracted to leave what the page itself adds.`,
  formula: `<math display="block"><mrow><msub><mi>s</mi><mtext>corr</mtext></msub><mo>=</mo><mi>s</mi><mo>+</mo><mi>k</mi><mo>·</mo><mo>(</mo><mover><mi>T</mi><mo>‾</mo></mover><mo>−</mo><mn>37.0</mn><mo>)</mo><mo>,</mo><mspace width="0.5em"/><mi>k</mi><mo>=</mo><mn>0.045</mn><mo>/</mo><mtext>min</mtext><mspace width="1.2em"/><mtext>excess</mtext><mo>=</mo><msub><mi>s</mi><mtext>corr</mtext></msub><mo>(</mo><mtext>page</mtext><mo>)</mo><mo>−</mo><msub><mi>s</mi><mtext>corr</mtext></msub><mo>(</mo><mtext>floor</mtext><mo>)</mo><mspace width="1.2em"/><mtext>removed</mtext><mo>=</mo><mfrac><mrow><mi>B</mi><mo>−</mo><mi>M</mi></mrow><mrow><mi>B</mi><mo>−</mo><mi>F</mi></mrow></mfrac></mrow></math>
<p>s = least-squares slope of battery temperature over 60-360 s (11 reads); k = 0.045 /min, between the load fit's 0.040 (slope = 1.84 − 0.040 × start) and the cooling fit's 0.052</p>`,
  worked: `<ul><li>Corrected slopes, two sessions (real heat, 11 Oct): floor F ${n('−0.198 / −0.221')}; original B ${n('+0.269 / +0.270')}; g0.0m M ${n('+0.057 / +0.115')} °C/min.</li>
<li>Excess: B ${n('0.269 + 0.198 = 0.467')} and ${n('0.270 + 0.221 = 0.491')}; M ${n('0.255 / 0.336')}. Removed: ${n('0.212 / 0.467 = 45 %')} and ${n('0.155 / 0.491 = 32 %')}.</li>
<li>In plain units, over the fitted 5-minute window: the original warms the phone ${n('2.3-2.5 °C')} more than the blank page, g0.0m ${n('1.3-1.7 °C')}.</li>
<li>Decision rule, set before the data: "cooler" when B − X ≥ +0.05 °C/min in both sessions; one session's noise is up to about 0.085 (√2 × 0.061). B − M = ${n('+0.212 / +0.155')}: cooler in both. v6 − M = ${n('0.000 / −0.017')}: no detectable change.</li></ul>`,
  fig: bars({
    max: 0.6, ticks: [0, 0.2, 0.4, 0.6], unit: '°C/min',
    aria: 'Excess heat rate over the blank page: original 0.467 and 0.491, g0.0m 0.255 and 0.336 °C per minute.',
    rows: [{ group: 'excess over the blank page, per session' }, { label: 'Original, H1', v: 0.467, arm: 'orig' }, { label: 'Original, H2', v: 0.491, arm: 'orig' }, { label: 'g0.0m, H1', v: 0.255, arm: 'fix' }, { label: 'g0.0m, H2', v: 0.336, arm: 'fix' }],
    caption: 'One phone, W scripted routine, two sessions. A slope, not a cause: nothing here says which effect heats.',
  }),
  source: `${code('research/phone-heat/README.md')} l.219-220, 266-271, 282, 293, 574-589`,
});

// ---------- M14: heat slows the GPU ----------
function gpuFig() {
  const X0 = 10, X1 = 390, sx = (ms) => X0 + (ms / 20) * (X1 - X0), Y = 26;
  let s = '';
  s += `<rect class="s-fix" x="${sx(0)}" y="${Y}" width="${sx(12.8) - sx(0) - 1}" height="18" rx="2"><title>up to 12.8 ms: still fits after +30 %</title></rect>`;
  s += `<rect class="s-orig" x="${sx(12.8) + 1}" y="${Y}" width="${sx(16.67) - sx(12.8) - 1}" height="18"><title>12.8-16.67 ms: fit before, miss after</title></rect>`;
  s += `<line class="s-line" x1="${sx(16.67)}" y1="${Y - 8}" x2="${sx(16.67)}" y2="${Y + 26}" stroke-width="1.5"/>`;
  s += `<text class="t-s" x="${sx(16.67) + 4}" y="${Y - 10}">one frame</text>`;
  s += `<text class="t-s" x="${(sx(0) + sx(12.8)) / 2}" y="${Y + 13}" text-anchor="middle" style="fill: var(--on-fix)">fits after +30 % (midpoint)</text>`;
  for (const t of [0, 5, 10, 12.8, 16.67, 20]) s += `<text class="t-m t-s" x="${sx(t)}" y="${Y + 40}" text-anchor="${t === 0 ? 'start' : t === 20 ? 'end' : 'middle'}">${t}${t === 20 ? ' ms' : ''}</text>`;
  return svg(400, Y + 46, 'Before heat, GPU work up to 16.67 ms meets 60 Hz. At 30 percent slower, only work up to 12.8 ms still fits; work between 12.8 and 16.67 ms now misses a refresh.', s);
}
const m14 = block({
  id: 'gpuheat',
  title: 'Heat slows the GPU, not the CPU loop',
  status: ['OBSERVED', 'MODEL', 'UNRESOLVED'],
  plain: `At the Serious thermal state a CPU loop ran at the same speed, while a sustained GPU animation ran 25-35 % slower.
So moving work from the main thread to the GPU frees the CPU but loads the part that heat throttles.`,
  formula: `<math display="block"><mrow><msup><mi>G</mi><mo>′</mo></msup><mo>=</mo><mi>s</mi><mi>G</mi><mo>≤</mo><mn>16.67</mn><mspace width="0.5em"/><mo>⇔</mo><mspace width="0.5em"/><mi>G</mi><mo>≤</mo><mfrac><mn>16.67</mn><mi>s</mi></mfrac><mo>=</mo><mfrac><mn>16.67</mn><mn>1.35</mn></mfrac><mtext> to </mtext><mfrac><mn>16.67</mn><mn>1.25</mn></mfrac><mo>=</mo><mn>12.4-13.4 ms</mn></mrow></math>
<p>G = GPU work per compositor frame, s = 1.25-1.35 the observed slowdown; the chart uses the midpoint, 12.8 ms. Illustrative.</p>`,
  worked: `<p>Phone, Xcode-induced Serious, 3 runs per arm: CPU loop ${n('789, 784, 782 ms')} off and ${n('792, 783, 782 ms')} on; a sustained GPU animation about ${n('25-35 %')} slower.
The cause (GPU clock, render-server priority or a rate cap) is unresolved. That heat and Low Power Mode turn off high frame rates is CONFIRMED by Apple's ProMotion docs.</p>`,
  fig: ranges({
    max: 800, min: 770, ticks: [770, 780, 790, 800], unit: 'ms',
    aria: 'CPU loop time: 782 to 789 ms with heat off, 782 to 792 ms with heat on: no change.',
    rows: [{ group: 'CPU loop, 3 runs each' }, { label: 'Heat off', runs: [789, 784, 782], arm: 'ink' }, { label: 'Serious', runs: [792, 783, 782], arm: 'orig' }],
    caption: 'Axis starts at 770 ms to show the runs; the two ranges overlap.',
  }) + figure(gpuFig(), 'Model, not a measurement: blue still fits a 60 Hz frame after a 30 % slowdown, orange no longer does.'),
  source: `${code('research/serious-heat/README.md')} l.53-55; ${code('research/phone-thermal-gate/README.md')} l.60-98`,
});

export default [
  { key: 'after:| Moment (driver)', html: m13 },
  { key: 'lesson-23', html: m8 },
  { key: 'lesson-24', html: m10 + m9 },
  { key: 'lesson-25', html: m11 + m12, order: 10 },
  { key: 'lesson-26', html: m6 + m7 + m14 },
];

// Measurement math M1-M5 (de-viz-math-measure, part 1): frame grid, averages, shares, Chrome ticks, twins.
import { readFileSync } from 'node:fs';
import { block, bars, ranges, stack, figure, svg, legendHtml, fmt } from './_lib.mjs';

const F = JSON.parse(readFileSync(new URL('./_frames.json', import.meta.url), 'utf8'));
const P = 1000 / 60;
const n = (x) => `<span class="num">${x}</span>`;
const code = (x) => `<code>${x}</code>`;

// ---------- M2: the 60 Hz picture grid ----------
function gridFig() {
  const X0 = 128, X1 = 392, MAX = 120, sx = (ms) => X0 + (ms / MAX) * (X1 - X0);
  let s = '';
  const rows = [16.7, 34, 50, 70];
  const top = 26, RH = 26, dotsY = top + rows.length * RH + 30;
  const bottom = dotsY + 40;
  // vsync ticks over every row
  for (let k = 0; k * P <= MAX + 0.01; k++) {
    s += `<line class="s-rule" x1="${sx(k * P).toFixed(1)}" y1="${top - 8}" x2="${sx(k * P).toFixed(1)}" y2="${bottom - 14}"/>`;
    s += `<text class="t-m t-s" x="${sx(k * P).toFixed(1)}" y="${bottom}" text-anchor="${(k + 1) * P > MAX ? 'end' : 'middle'}">${(k * P).toFixed(k ? 1 : 0)}</text>`;
  }
  s += `<text class="t-m t-s" x="${X0 - 8}" y="${bottom}" text-anchor="end">ms</text>`;
  s += `<text class="t-m t-s" x="8" y="${top - 13}">model: a new picture only on a tick, every 16.67 ms</text>`;
  rows.forEach((dt, i) => {
    const y = top + i * RH, shown = Math.round(dt / P), missed = Math.max(0, shown - 1);
    s += `<rect class="s-frame" x="${sx(0)}" y="${y}" width="${(sx(dt) - sx(0)).toFixed(1)}" height="14" rx="2"/>`;
    for (let m = 1; m <= missed; m++) s += `<rect class="${dt > 50 ? 's-vslow' : 's-slow'}" x="${(sx(m * P) - 3).toFixed(1)}" y="${y - 2}" width="6" height="18" rx="1.5"><title>tick ${m}: the old picture shows again</title></rect>`;
    s += `<text class="t-s" x="${X0 - 6}" y="${y + 11}" text-anchor="end">${dt} ms · ${missed} missed</text>`;
  });
  // the real slow frames of iPhone run 1, stacked where they coincide to the ms
  const slow = F.iphone1.frames.map((f) => f[1]).filter((d) => d > 34).sort((a, b) => a - b);
  const seen = {};
  for (const d of slow) {
    const k = Math.round(d), h = (seen[k] = (seen[k] || 0) + 1) - 1;
    s += `<circle class="${d > 50 ? 's-vslow' : 's-slow'}" cx="${sx(d).toFixed(1)}" cy="${dotsY - h * 9}" r="3.6"><title>${d} ms</title></circle>`;
  }
  s += `<text class="t-s" x="${X0 - 6}" y="${dotsY + 4}" text-anchor="end">phone run 1</text>`;
  return { html: svg(400, bottom + 4, `Ticks every 16.67 ms. A 16.7 ms frame misses no picture, 34 ms misses 1, 50 ms 2, 70 ms 3. Below, the ${slow.length} frames over 34 ms of a real phone run spread across the gaps between ticks.`, s), slow };
}
const g = gridFig();
const m2 = block({
  id: 'grid',
  title: 'The 60 Hz picture grid: what "over 34" and "over 50" mean',
  status: ['CONFIRMED', 'MODEL'],
  plain: `The phone's screen can show a new picture only every 16.67 ms. A frame that takes longer leaves the old picture up
for one or more ticks. That is a missed picture, and it is what a thumb feels as a stutter.`,
  formula: `<math display="block"><mrow><mi>P</mi><mo>=</mo><mfrac><mn>1000 ms</mn><mn>60</mn></mfrac><mo>=</mo><mn>16.67 ms</mn></mrow></math>
<math display="block"><mrow><mtext>missed</mtext><mo>=</mo><mo>max</mo><mo>(</mo><mn>0</mn><mo>,</mo><mtext>round</mtext><mo>(</mo><mi>dt</mi><mo>/</mo><mi>P</mi><mo>)</mo><mo>−</mo><mn>1</mn><mo>)</mo><mspace width="1em"/><mtext>dropped</mtext><mo>=</mo><mfrac><mrow><mo>∑</mo><mtext>missed</mtext></mrow><mrow><mo>∑</mo><mtext>missed</mtext><mo>+</mo><mtext>frames</mtext></mrow></mfrac></mrow></math>
<p>dt &gt; 34 sits 0.7 ms above 2P = 33.3: at least one picture missed. dt &gt; 50 sits on 3P = 50.0: about two missed.</p>`,
  worked: `<ul><li>Three scripted phone runs miss ${n('69, 49, 51')} refreshes in ${n('351, 358, 358')} frames: dropped ${n('16.4 %, 12.0 %, 12.5 %')}, mean ${n('13.6 %')}.</li>
<li>The ${n(g.slow.length)} frames over 34 ms of run 1: ${g.slow.join(', ')} ms. They spread across the gaps between ticks (one lands on 50 = 3P); whether phone gaps cluster on the grid is settled by the 198,349-gap analysis in the caption, not by 18 frames.</li></ul>`,
  fig: figure(g.html, `Top (model): four frame lengths on the tick grid, missed ticks marked. Bottom: run 1's real slow frames on the same
axis. Safari's rAF stamp marks the start of a rendering update at 1 ms resolution, not a vsync, and in 198,349 phone gaps
the histogram from 25 to 75 ms falls smoothly with no clusters on the grid (564 frames, 17 % of those over 50, sit between
50 and 54.17 ms). So "missed pictures" is a model of the display, not something the log sees. Data: 30 Sep calibration runs,
scripted scroll, before the frozen snapshot and before most fixes.`),
  source: `${code('research/cpu-throttle-calibration/data/iphone/scroll_run1.json')} (scroll phase); ${code('research/cpu-throttle-calibration/tools/calibrate_jank.py')} l.8; ${code('research/architecture/claims-audit.md')} l.59, 119-120, 133-136, 172-188 (60 Hz hint: WebKit bug 173434)`,
});

// ---------- M3: share, rate and time share ----------
const orig = { n: 2588, s: 65.2, longest: 154, bins: [1664, 405, 258, 230, 31, 0] };
const fin = { n: 3589, s: 61.1, longest: 89, bins: [3234, 294, 53, 8, 0, 0] };
const binCls = ['a-b20', 'a-b34', 'a-slow', 'a-vslow', 'a-b100', 'a-b100'];
const binName = ['up to 20 ms', '20-34 ms', '34-50 ms', '50-100 ms', '100-200 ms', 'over 200 ms'];
const parts = (b) => b.map((v, i) => ({ v, cls: binCls[i], name: binName[i] }));
const slowOf = (b) => b[2] + b[3] + b[4] + b[5], vslowOf = (b) => b[3] + b[4] + b[5];
// time on slow frames, bounded by the bin edges; the top occupied bin is capped at the run's longest frame
const tLo = ({ bins: b }) => (b[2] * 34 + b[3] * 50 + b[4] * 100) / 1000;
const tHi = ({ bins: b, longest: L }) => (b[2] * Math.min(50, L) + b[3] * Math.min(100, L) + b[4] * Math.min(200, L)) / 1000;
const pc = (a, b, d = 1) => ((100 * a) / b).toFixed(d);
const run1slow = F.iphone1.frames.filter((f) => f[1] > 34);
const run1ms = run1slow.reduce((s, f) => s + f[1], 0), run1win = F.iphone1.scroll[1] - F.iphone1.scroll[0];
if (slowOf(orig.bins) !== 519 || slowOf(fin.bins) !== 61 || vslowOf(orig.bins) !== 261 || vslowOf(fin.bins) !== 8) throw new Error('M3 bins');
const m3 = block({
  id: 'share',
  title: 'Slow-frame share, rate per second and share of time',
  status: ['OBSERVED', 'MODEL'],
  plain: `"20.1 % slow" counts frames. A smoother page draws more frames in the same replay, so the share falls faster than
the slow frames themselves. Counting per second and by time keeps that honest: the original spent about a third to three
fifths of the replay on a slow frame.`,
  formula: `<math display="block"><mrow><mtext>share</mtext><mo>=</mo><mfrac><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>34</mn></mrow></msub><mi>N</mi></mfrac><mspace width="1.2em"/><mtext>rate</mtext><mo>=</mo><mfrac><msub><mi>N</mi><mrow><mi>dt</mi><mo>&gt;</mo><mn>34</mn></mrow></msub><mi>W</mi></mfrac><mspace width="1.2em"/><mtext>time share</mtext><mo>=</mo><mfrac><mrow><msub><mo>∑</mo><mrow><mi>dt</mi><mo>&gt;</mo><mn>34</mn></mrow></msub><mi>dt</mi></mrow><mi>W</mi></mfrac></mrow></math>
<p>from histogram bins, time share is bounded by each bin's lower and upper edge</p>`,
  worked: `<ul><li>Share: ${n('519 / 2,588 = 20.1 %')} → ${n('61 / 3,589 = 1.7 %')}; very slow ${n('261 = 10.1 %')} → ${n('8 = 0.22 %')}: 11.8x and 45.2x fewer by share.</li>
<li>Rate: ${n('519 / 65.2 s = 7.96')} → ${n('61 / 61.1 s = 1.00')} slow frames per second (8.0x); very slow ${n('4.00')} → ${n('0.13')} per second (30.6x). The share ratio is larger because the page drew ${n('39.7')} → ${n('58.7')} frames per second.</li>
<li>Time share: original ${n(`${tLo(orig).toFixed(1)}-${tHi(orig).toFixed(1)} s`)} of 65.2 s = ${n(`${pc(tLo(orig), orig.s, 0)}-${pc(tHi(orig), orig.s, 0)} %`)}; g0.0m ${n(`${tLo(fin).toFixed(1)}-${tHi(fin).toFixed(1)} s`)} of 61.1 s = ${n(`${pc(tLo(fin), fin.s)}-${pc(tHi(fin), fin.s)} %`)}. Lower bound: every frame at its bin's lower edge; upper: at its upper edge, the top bin capped at the longest frame (154 and 89 ms).</li>
<li>For scale, from a real log: scripted phone run 1 has ${n(`${run1slow.length} of ${F.iphone1.frames.length}`)} frames slow (${pc(run1slow.length, F.iphone1.frames.length)} %), but they take ${n(`${Math.round(run1ms)} of ${Math.round(run1win).toLocaleString('en-US')} ms`)} (${pc(run1ms, run1win)} % of the time).</li></ul>`,
  fig: [
    stack({
      aria: 'Share of frames by frame time. Original: 64 % up to 20 ms, 16 % 20-34, 10 % 34-50, 9 % 50-100, 1 % 100-200. g0.0m: 90 %, 8 %, 1.5 %, 0.2 %, none.',
      rows: [
        { label: 'Original<br>2,588 frames', parts: parts(orig.bins), show: '20.1 % slow' },
        { label: 'g0.0m<br>3,589 frames', parts: parts(fin.bins), show: '1.7 % slow' },
      ],
      legend: [['b20', 'up to 20 ms'], ['b34', '20-34'], ['slow', '34-50'], ['vslow', '50-100'], ['b100', '100-200 ms']],
    }),
    ranges({
      max: 70, ticks: [0, 20, 40, 60], unit: '%',
      aria: 'Slow frames as share of frames: 20.1 against 1.7 percent. As share of time, bounds: 36 to 62 percent against 3.6 to 5.5 percent.',
      rows: [
        { group: 'share of frames over 34 ms' },
        { label: 'Original', runs: [20.1], arm: 'orig', show: '20.1 %' },
        { label: 'g0.0m', runs: [1.7], arm: 'fix', show: '1.7 %' },
        { group: 'share of time on a frame over 34 ms (bounds from the bins)' },
        { label: 'Original', runs: [+pc(tLo(orig), orig.s), +pc(tHi(orig), orig.s)], arm: 'orig', show: `${pc(tLo(orig), orig.s, 0)}-${pc(tHi(orig), orig.s, 0)} %` },
        { label: 'g0.0m', runs: [+pc(tLo(fin), fin.s), +pc(tHi(fin), fin.s)], arm: 'fix', show: `${pc(tLo(fin), fin.s)}-${pc(tHi(fin), fin.s)} %` },
      ],
      caption: `Phone, robot replay of the user's swipe, Serious set by a tool, 2 runs per build pooled (10 Oct). Bar segments are
frames per bin; the lower chart's dots are the two bounds, the line between them the range.`,
    }),
  ].join(''),
  source: `${code('research/team-article/artifacts/sixteen-milliseconds/index.html')} l.1365 (bins), l.1369 (totals), l.1479 (windows); ${code('research/cpu-throttle-calibration/data/iphone/scroll_run1.json')}`,
});

// ---------- M1: averages hide the frames you feel ----------
function secondStrip() {
  const t0 = 17905, t1 = 18905, X0 = 8, X1 = 392, sx = (t) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const fr = F.iphone1.frames.filter((f) => f[0] > t0 && f[0] <= t1);
  let s = '', long = null;
  for (const [t, dt, y] of fr) {
    const a = Math.max(t0, t - dt), w = sx(t) - sx(a);
    const cls = dt > 50 ? 's-vslow' : dt > 34 ? 's-slow' : 's-frame';
    s += `<rect class="${cls}" x="${(sx(a) + 0.5).toFixed(1)}" y="20" width="${Math.max(1, w - 1).toFixed(1)}" height="26"><title>${dt} ms at y ${Math.round(y)}</title></rect>`;
    if (dt > 50) long = { t, dt, y };
  }
  for (const ms of [0, 250, 500, 750, 1000]) s += `<text class="t-m t-s" x="${sx(t0 + ms)}" y="62" text-anchor="${ms === 0 ? 'start' : ms === 1000 ? 'end' : 'middle'}">${ms}${ms === 1000 ? ' ms' : ''}</text>`;
  s += `<text x="${X0}" y="12">${fr.length} frames in this second = ${fr.length} fps</text>`;
  s += `<text x="${X1}" y="12" text-anchor="end">one held ${long.dt} ms (${(long.dt / P).toFixed(1)} periods)</text>`;
  return { html: svg(400, 66, `One second of a scripted phone scroll: ${fr.length} frames, so ${fr.length} fps, yet it holds one ${long.dt} ms frame.`, s), n: fr.length, long };
}
const ss = secondStrip();
const m1 = block({
  id: 'averages',
  title: 'Averages hide the frames you feel',
  status: ['MODEL', 'OBSERVED'],
  plain: `Frames per second averages a whole window. One long frame removes only a few frames from the count, so fps barely
moves while the picture freezes for several refreshes. Counting frames over a line keeps that frame visible.`,
  formula: `<math display="block"><mrow><mtext>fps</mtext><mo>=</mo><mfrac><mtext>frames</mtext><mi>W</mi></mfrac><mspace width="1.2em"/><mtext>frames in</mtext><mi>W</mi><mo>≈</mo><mn>1</mn><mo>+</mo><mfrac><mrow><mi>W</mi><mo>−</mo><mi>L</mi></mrow><mi>P</mi></mfrac><mspace width="1.2em"/><mtext>missed</mtext><mo>≈</mo><mfrac><mi>L</mi><mi>P</mi></mfrac><mo>−</mo><mn>1</mn></mrow></math>
<p>W window, L one long frame, the rest at P = 16.7 ms</p>`,
  worked: `<ul><li>Made-up case: ${n('58 × 16.7 ms + one 70 ms')} = ${n('1,038.6 ms')}, 59 frames, ${n('56.8 fps')} (about 95 % of 60). The 70 ms frame is 4.2 periods: the picture froze for about 3 refreshes, and fps lost 5 %.</li>
<li>Real phone second (scripted run 1, scroll time 3.60-4.60 s): ${n(`${ss.n} frames = ${ss.n} fps`)}, and it holds a ${n(`${ss.long.dt} ms`)} frame at y ${Math.round(ss.long.y)} (${(ss.long.dt / P).toFixed(1)} periods).</li>
<li>Chrome 6x, wave 1: fps ${n('93.8 → 110.6')}, "better, ranges do not overlap"; frames over 34 ms ${n('5 [4-6] → 5 [4-6]')}, "within noise". The phone verdict was "Laggy the same".</li></ul>`,
  fig: figure(ss.html, `Every frame of that second, width to scale with its duration; the long one in very-slow red.`) + bars({
    max: 120, ticks: [0, 30, 60, 90, 120], unit: 'fps',
    aria: 'Chrome 6x wave 1: fps rose from 93.8 to 110.6.',
    rows: [{ group: 'Chrome 6x, wave 1: frames per second' }, { label: 'Original', v: 93.8, arm: 'orig' }, { label: 'Wave 1', v: 110.6, arm: 'fix' }],
  }) + bars({
    max: 6, ticks: [0, 2, 4, 6], unit: 'per run',
    aria: 'Chrome 6x wave 1: frames over 34 ms stayed at a median of 5 per run, range 4 to 6.',
    rows: [{ group: 'Chrome 6x, wave 1: frames over 34 ms, median per run' }, { label: 'Original', v: 5, arm: 'orig', note: 'range 4-6' }, { label: 'Wave 1', v: 5, arm: 'fix', note: 'range 4-6' }],
    caption: 'fps up 18 %, slow frames flat. On the phone the user felt no difference.',
  }),
  source: `${code('research/cpu-throttle-calibration/data/iphone/scroll_run1.json')}; ${code('fixes/all-wave1/README.md')} l.71, l.73`,
});

// ---------- M4: Chrome's tick form ----------
function tickFig() {
  const fr = F.chrome6x2.frames.map((f) => f[1]);
  const T = 1000 / 120, X0 = 30, X1 = 392, MIN = 20, MAX = 90, sx = (ms) => X0 + ((ms - MIN) / (MAX - MIN)) * (X1 - X0);
  const base = 150, top = 30;
  let s = '';
  for (let k = 3; k * T <= MAX; k++) {
    s += `<line class="s-rule" x1="${sx(k * T).toFixed(1)}" y1="${top}" x2="${sx(k * T).toFixed(1)}" y2="${base + 4}"/>`;
    s += `<text class="t-m t-s" x="${sx(k * T).toFixed(1)}" y="${base + 16}" text-anchor="middle">${(k * T).toFixed(1)}</text>`;
    s += `<text class="t-m t-s" x="${sx(k * T).toFixed(1)}" y="${top - 4}" text-anchor="middle">k ${k}</text>`;
  }
  s += `<text class="t-m t-s" x="${X1}" y="${base + 30}" text-anchor="end">dt, ms (ticks every 8.33 ms = 120 Hz)</text>`;
  for (const [ms, cls, lab, dy] of [[34, 's-mrule', '34', 0], [50, 's-mrule', '50', 0], [37.5, 's-line', '37.5', 0], [54.17, 's-line', '54.17', 0]]) {
    s += `<line class="${cls}" x1="${sx(ms).toFixed(1)}" y1="${top + 8}" x2="${sx(ms).toFixed(1)}" y2="${base}" stroke-width="1.5"${cls === 's-mrule' ? ' stroke-dasharray="3 3"' : ''}/>`;
    s += `<text class="t-s" x="${(sx(ms) + 3).toFixed(1)}" y="${top + 16 + dy}">${lab}</text>`;
  }
  // dots stacked per 0.5 ms column, capped at 9 with a count label
  const col = {};
  const counts = {};
  for (const d of fr.filter((d) => d >= MIN).sort((a, b) => a - b)) {
    const c = Math.round(d * 2) / 2; col[c] = (col[c] || 0) + 1;
    counts[Math.round(d / T)] = (counts[Math.round(d / T)] || 0) + 1;
    const h = col[c] - 1;
    if (h < 9) {
      const between = (d > 34 && d < 37.5) || (d > 50 && d < 54.17);
      s += `<circle class="${between ? 's-orig' : 's-frame'}" cx="${sx(d).toFixed(1)}" cy="${base - 6 - h * 9}" r="3.4"${between ? '' : ' style="stroke: var(--muted); stroke-width: .6"'}><title>${d.toFixed(1)} ms, k ${Math.round(d / T)}</title></circle>`;
    } else if (h === 9) s += `<text class="t-m t-s" x="${sx(c).toFixed(1)}" y="${base - 6 - 9 * 9}" text-anchor="middle">+</text>`;
  }
  const all = {};
  for (const d of fr) all[Math.round(d / T)] = (all[Math.round(d / T)] || 0) + 1;
  const kh = Object.entries(all).map(([k, v]) => `k ${k}: ${v}`).join(', ');
  return { html: svg(400, base + 34, 'Chrome 6x frame times sit on a lattice every 8.33 ms. The legacy cuts at 34 and 50 ms run through lattice points and pick up jitter; the tick cuts at 37.5 and 54.17 ms sit between them.', s), kh, fr };
}
const tk = tickFig();
const legacy34 = tk.fr.filter((d) => d > 34).length, k5 = tk.fr.filter((d) => Math.round(d / (1000 / 120)) >= 5).length;
const legacy50 = tk.fr.filter((d) => d > 50).length, k7 = tk.fr.filter((d) => Math.round(d / (1000 / 120)) >= 7).length;
const m4 = block({
  id: 'ticks',
  title: "Chrome's tick form: k = round(dt / 8.333 ms)",
  status: ['RULE', 'OBSERVED'],
  plain: `Chrome stamps frames on a 120 Hz grid, so its frame times bunch on multiples of 8.33 ms. A cut at exactly 34 or 50 ms
runs through one of those bunches and counts jitter. Counting in ticks puts the cut halfway between two bunches.`,
  formula: `<math display="block"><mrow><mi>k</mi><mo>=</mo><mtext>round</mtext><mo>(</mo><mfrac><mi>dt</mi><mn>8.333 ms</mn></mfrac><mo>)</mo><mspace width="1.2em"/><mtext>"&gt;34"</mtext><mo>⇔</mo><mi>k</mi><mo>≥</mo><mn>5</mn><mo>⇔</mo><mi>dt</mi><mo>≥</mo><mn>37.5</mn><mspace width="1.2em"/><mtext>"&gt;50"</mtext><mo>⇔</mo><mi>k</mi><mo>≥</mo><mn>7</mn><mo>⇔</mo><mi>dt</mi><mo>≥</mo><mn>54.17</mn></mrow></math>
<p>on time: k ≤ 2. The phone has no such grid (see the 60 Hz box above), so it keeps the ms lines and gets twins instead.</p>`,
  worked: `<ul><li>Chrome 6x run 2, scroll phase, ${n(tk.fr.length)} frames. frames per tick count: ${tk.kh}.</li>
<li>dt &gt; 34 counts ${n(legacy34)}, k ≥ 5 counts ${n(k5)}: the 3 extra are 34.1, 34.3, 34.1 ms, 4-tick frames plus jitter.</li>
<li>dt &gt; 50 counts ${n(legacy50)}, k ≥ 7 counts ${n(k7)}: the 3 extra are 50.1, 50.4, 50.1 ms, 6-tick frames. All 31 frames with k ≥ 4 sit within 1 ms of a lattice point.</li></ul>`,
  fig: figure(tk.html, `Each dot is one frame of 20 ms or more; columns over 9 dots end in "+". Dashed: the legacy 34 and 50 ms
cuts; solid: the tick cuts. Orange dots fall between the two and are counted only by the legacy cut. 30 Sep calibration run,
scripted scroll.`),
  source: `${code('research/cpu-throttle-calibration/data/chrome/scroll-mobile-6x.run2.json')}; ${code('research/architecture/measurement-protocol-v2.md')} l.155-160; ${code('tools/lib/stats.mjs')} l.5-7, 42-46`,
});

// ---------- M5: phone twins ----------
const m5 = block({
  id: 'twins',
  title: 'Phone thresholds, ±4 ms twins and "threshold-sensitive"',
  status: ['RULE', 'OBSERVED'],
  plain: `A count over a fixed line can change its verdict when the line moves a little. So every phone verdict is also
decided 4 ms below and above. If either twin disagrees, the verdict is "threshold-sensitive": the builds differ only in
frames close to the line.`,
  formula: `<math display="block"><mrow><mtext>verdict</mtext><mo>(</mo><mi>c</mi><mo>)</mo><mspace width="0.6em"/><mtext>for</mtext><mspace width="0.6em"/><mi>c</mi><mo>∈</mo><mo>{</mo><mn>30</mn><mo>,</mo><mn>34</mn><mo>,</mo><mn>38</mn><mo>}</mo><mspace width="0.6em"/><mtext>and</mtext><mspace width="0.6em"/><mo>{</mo><mn>46</mn><mo>,</mo><mn>50</mn><mo>,</mo><mn>54</mn><mo>}</mo></mrow></math>
<p>threshold-sensitive ⇔ verdict(c − 4) ≠ verdict(c) or verdict(c + 4) ≠ verdict(c); goal dt &gt; 50, target 0</p>`,
  worked: `<ul><li>Phone, robot hero script, Serious held by a tool, 3-arm block (11 Oct), band y 1-780, per run: v4 at &gt;30 / &gt;34 / &gt;38 = ${n('31, 34, 38')} / ${n('17, 18, 18')} / ${n('6, 5, 6')}; v6 = ${n('29, 18, 17')} / ${n('13, 6, 7')} / ${n('7, 6, 6')}.</li>
<li>At 30 and 34 every v6 run is below every v4 run (better); at 38 they overlap (7, 6, 6 against 6, 5, 6). So v6's gain is frames between 34 and 38 ms: v4 has ${n('11, 13, 12')} there, v6 ${n('6, 0, 1')}. Verdict: threshold-sensitive.</li>
<li>g0.0l against g0.0m, slow drags to y 3,400: &gt;34 ${n('5, 6 against 3, 5')}; &gt;30 ${n('9, 9 against 6, 12')}. Every difference flips like this, so the two builds count as level.</li></ul>`,
  fig: ranges({
    max: 40, ticks: [0, 10, 20, 30, 40], unit: 'frames',
    aria: 'Frames per run over 30, 34 and 38 ms for v4 and v6. v6 is lower at 30 and 34; at 38 the runs overlap.',
    rows: [
      { group: 'over 30 ms' }, { label: 'v4 (control)', runs: [31, 34, 38], arm: 'mid' }, { label: 'v6', runs: [29, 18, 17], arm: 'fix' },
      { group: 'over 34 ms' }, { label: 'v4 (control)', runs: [17, 18, 18], arm: 'mid' }, { label: 'v6', runs: [13, 6, 7], arm: 'fix' },
      { group: 'over 38 ms' }, { label: 'v4 (control)', runs: [6, 5, 6], arm: 'mid' }, { label: 'v6', runs: [7, 6, 6], arm: 'fix' },
    ],
    legend: [['mid', 'v4, the control'], ['fix', 'v6']],
    caption: 'One dot per run; the line spans the three runs. The bundles separate at 30 and 34 ms and meet at 38 ms.',
  }),
  source: `${code('fixes/hero-exit-threaded/README.md')} l.1059-1067, l.1076-1084; ${code('fixes/worst-cases-capture/README.md')} l.431; ${code('research/architecture/measurement-protocol-v2.md')} l.171-180`,
});

export default [
  { key: 'after:| Moment (driver)', html: m2 + m3 },
  { key: 'after:**What Chrome said.**', html: m1 },
  { key: 'lesson-25', html: m5 + m4, order: 20 },
];

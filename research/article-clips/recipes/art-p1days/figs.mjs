// Draws the no-recording figures into the day-by-day draft (lead's job from T-170 #129).
import fs from 'node:fs';
const S = '$SCRATCH';
const F = S + '/articles/p1-ten-days-draft.html';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('class="cap"')) throw new Error('figures already present');

function replaceFigureLine(marker, html) {
  const lines = s.split('\n');
  const idx = lines.findIndex(l => l.includes('<figure class="slot') && l.includes(marker));
  if (idx < 0) throw new Error('no slot with ' + marker);
  if (lines.filter(l => l.includes('<figure class="slot') && l.includes(marker)).length !== 1) throw new Error('ambiguous ' + marker);
  const indent = lines[idx].match(/^\s*/)[0];
  lines[idx] = html.split('\n').map(x => indent + x).join('\n');
  s = lines.join('\n');
}
function rep(a, b) {
  if (s.split(a).length !== 2) throw new Error('expected one match: ' + a.slice(0, 70));
  s = s.replace(a, b);
}
const frame = (n, title, body, cap, extraBar = '') =>
  `<figure class="cap" data-capture="ready" id="fig-${n}">
  <div class="cap-bar"><span class="ready">capture-ready · 1200 px · Fig. ${n}</span>${extraBar}</div>
  <div class="cap-area">
${body}
  </div>
  <figcaption class="note">${cap} <a href="#src-${n}">Source</a>.</figcaption>
</figure>`;

// ---------- CSS ----------
rep('/* Animated slot:', `/* Capture frames: figures drawn for screenshots. 1200 px wide on a desktop (Medium shows full width only for images
   >= 1192 px), scaled down below that. The inside stays light in both themes, so every capture looks the same. */
.cap { margin: 0; display: grid; gap: 0.45rem; min-width: 0; }
.cap-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.4rem 1rem; font: 600 0.68rem/1.3 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }
.cap-bar .ready { color: var(--signal); }
.cap-bar button { font: 600 0.72rem/1 var(--mono); letter-spacing: 0.04em; padding: 0.4rem 0.7rem; border-radius: 4px; border: 1px solid var(--ink-soft); background: var(--paper); color: var(--ink); cursor: pointer; }
.cap-area {
  color-scheme: light;
  --paper: #f1f4f2; --paper-2: #e4eae6; --ink: #17221e; --ink-soft: #4a5a54; --grid: #d3ddd8;
  --signal: #2743c9; --late: #c9472a; --warn: #b98a12;
  --you: #b5651d; --lead: #0f7c80; --agents: #6a4fb3; --good: #2f7d32; --bad: #b3261e;
  --rule: #d3ddd8; --muted: #4a5a54; --sheet: #ffffff;
  background: #ffffff; color: var(--ink); border: 1px solid #c9d3ce; border-radius: 6px; padding: 2.5%;
  display: grid; gap: 0.6rem;
}
.cap-area svg, .cap-area canvas { display: block; width: 100%; height: auto; }
.cap-area svg text { font-family: var(--mono); fill: var(--ink-soft); font-variant-numeric: tabular-nums; }
.cap-area svg .ttl { font-family: var(--display); font-weight: 700; fill: var(--ink); }
.cap-area svg .sub { font-family: var(--body); fill: var(--ink-soft); }
.cap-area svg .ink, .cap-area svg .lbl { fill: var(--ink); }
.cap-area svg .bold { font-weight: 600; }
.cap-area svg .late { fill: var(--late); }
.cap-area svg .sig { fill: var(--signal); }
.cap-title { margin: 0; font: 700 clamp(1rem, 2.1vw, 1.65rem)/1.2 var(--display); color: var(--ink); }
.cap-sub { margin: 0; font: 400 clamp(0.72rem, 1.2vw, 0.95rem)/1.45 var(--body); color: var(--ink-soft); }
@media (min-width: 1320px) {
  .day .cap { width: 1200px; margin-left: -312px; }      /* 52rem article: rail 6.5rem + gap 1.5rem = 128 px; (1200 - 832) / 2 + 128 */
  .closing .cap { width: 1200px; margin-left: -280px; }  /* 40rem column: (1200 - 640) / 2 */
}
.figsrc { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.35rem; }
/* Animated slot:`);

// ---------- Fig 1: Part 1's frame ruler (copied; legend moved into the SVG) ----------
const ruler = `<svg viewBox="0 0 920 200" role="img" aria-label="A scale from 0 to 60 milliseconds. Chrome ticks every 8.33 ms; the phone draws about every 16.7 ms; frames over 34 ms count as slow and frames over 50 ms as very slow.">
  <rect x="40" y="58" width="840" height="34" style="fill:var(--paper-2);stroke:var(--grid)"></rect>
  <rect x="40" y="58" width="233.8" height="34" style="fill:var(--signal)" opacity="0.85"></rect>
  <rect x="516" y="58" width="56" height="34" style="fill:var(--warn)" opacity="0.55"></rect>
  <rect x="740" y="58" width="140" height="34" style="fill:var(--late)" opacity="0.8"></rect>
  <g font-size="12" text-anchor="middle" style="stroke:var(--ink-soft)">
    <line x1="40" y1="92" x2="40" y2="104"></line><line x1="156.7" y1="92" x2="156.7" y2="100"></line><line x1="273.8" y1="92" x2="273.8" y2="104"></line><line x1="390.5" y1="92" x2="390.5" y2="100"></line><line x1="516" y1="92" x2="516" y2="104"></line><line x1="740" y1="92" x2="740" y2="104"></line><line x1="880" y1="92" x2="880" y2="104"></line>
  </g>
  <g font-size="12" text-anchor="middle">
    <text x="40" y="120">0</text><text x="156.7" y="120">8.3</text><text x="273.8" y="120">16.7</text><text x="390.5" y="120">25</text><text x="516" y="120">34</text><text x="740" y="120">50</text><text x="880" y="120">60 ms</text>
  </g>
  <g font-size="15">
    <text class="ttl" x="40" y="44">One phone frame at 60 Hz</text>
    <text class="ttl" x="516" y="44">Slow (&gt; 34 ms)</text>
    <text class="ttl late" x="740" y="44">Goal: zero over 50</text>
  </g>
  <text class="sub" x="40" y="150" font-size="13">The phone draws a new picture about every 16.7 ms. A frame that takes longer is late, and your thumb feels the page stick.</text>
  <g font-size="11.5">
    <rect x="40" y="172" width="11" height="11" rx="2" style="fill:var(--signal)"></rect><text x="57" y="182">Inside one phone frame</text>
    <rect x="250" y="172" width="11" height="11" rx="2" style="fill:var(--warn)"></rect><text x="267" y="182">Near the line, flagged</text>
    <rect x="460" y="172" width="11" height="11" rx="2" style="fill:var(--late)"></rect><text x="477" y="182">Very slow: the frames you feel</text>
  </g>
</svg>`;

// ---------- Fig 2: loop diagram ----------
function loopSvg() {
  const W = 1200, bw = 240, bh = 92, xs = [40, 330, 620, 910], yTop = 96, yBot = 300;
  const boxes = [
    ['1', 'Frozen copy', 'one build of the page, on the Mac'],
    ['2', 'Slowed Chrome', 'CPU 6x: stutters like the phone'],
    ['3', 'Agents in worktrees', 'one problem each, own copy'],
    ['4', 'Measure lock', 'one timing job at a time'],
    ['5', 'iPhone check', 'the real phone, warm'],
    ['6', 'My swipe or proposal', 'blind A/B, or two live pages'],
    ['7', 'Land', 'rebase, fast-forward'],
    ['8', 'Best build', 'the base for the next fix'],
  ];
  const pos = [[xs[0], yTop], [xs[1], yTop], [xs[2], yTop], [xs[3], yTop], [xs[3], yBot], [xs[2], yBot], [xs[1], yBot], [xs[0], yBot]];
  let g = '';
  boxes.forEach(([n, t, d], i) => {
    const [x, y] = pos[i];
    const hi = i === 5 ? 'var(--you)' : i === 7 ? 'var(--signal)' : 'var(--ink-soft)';
    g += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" style="fill:var(--paper);stroke:${hi};stroke-width:${i === 5 || i === 7 ? 2.5 : 1.5}"></rect>`;
    g += `<text x="${x + 16}" y="${y + 30}" font-size="15" class="bold" style="fill:${hi}">${n}</text>`;
    g += `<text x="${x + 40}" y="${y + 31}" font-size="20" class="ttl">${t}</text>`;
    g += `<text x="${x + 40}" y="${y + 62}" font-size="14" class="sub">${d}</text>`;
  });
  const arr = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--ink);stroke-width:2" marker-end="url(#loop-arrow)"></line>`;
  let a = '';
  for (let i = 0; i < 3; i++) a += arr(xs[i] + bw + 4, yTop + bh / 2, xs[i + 1] - 6, yTop + bh / 2);
  a += arr(xs[3] + bw / 2, yTop + bh + 4, xs[3] + bw / 2, yBot - 6);
  for (let i = 3; i > 0; i--) a += arr(xs[i] - 4, yBot + bh / 2, xs[i - 1] + bw + 6, yBot + bh / 2);
  a += `<path d="M ${xs[0] + bw / 2} ${yBot - 4} L ${xs[0] + bw / 2} ${yTop + bh + 6}" style="stroke:var(--signal);stroke-width:2.5;fill:none" stroke-dasharray="7 5" marker-end="url(#loop-arrow-sig)"></path>`;
  a += `<text x="${xs[0] + bw / 2 + 12}" y="${(yTop + bh + yBot) / 2 + 5}" font-size="14" class="sig bold">next round</text>`;
  return `<svg viewBox="0 0 ${W} 430" role="img" aria-label="The loop, one round: frozen copy, slowed Chrome at 6x, agents in worktrees, measure lock, iPhone check, my swipe or proposal, land, best build, then the next round.">
  <defs>
    <marker id="loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--ink)"></path></marker>
    <marker id="loop-arrow-sig" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--signal)"></path></marker>
  </defs>
  <text class="ttl" x="40" y="46" font-size="28">The loop, one round</text>
  <text class="sub" x="40" y="74" font-size="15">Every fix went around it. The page only changed when a round ended in a new best build.</text>
  ${a}
  ${g}
  <text x="40" y="420" font-size="13">Steps 4 and 5 are shared: one Mac timing job and one phone hold at a time. Step 6 is mine.</text>
</svg>`;
}

// ---------- Fig 3: frame-rhythm canvas (from Part 1's pace script) ----------
const paceCanvas = `<canvas id="cap-pace" width="1200" height="320" role="img" aria-label="Illustration, not a recording. Two dots follow the same thumb motion. The top dot is drawn with late frames and jumps; the bottom dot is drawn every 16.7 ms and glides."></canvas>`;
const paceScript = `<script>
(() => {
  // Frame-rhythm illustration for capture, from Part 1's pace script (same frame gaps). Not a recording.
  const cv = document.getElementById('cap-pace');
  const btn = document.getElementById('cap-pace-toggle');
  if (!cv || !cv.getContext) return;
  const area = cv.closest('.cap-area') || document.documentElement;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const css = (n) => getComputedStyle(area).getPropertyValue(n).trim();
  const gaps = [];
  for (let i = 0; i < 216; i++) gaps.push(16.7);
  [[30, 41], [61, 58], [95, 37], [128, 25], [150, 58], [182, 41]].forEach(([i, g]) => { gaps[i] = g; });
  const LOOP = 3600;
  const thumb = (t) => { const p = (t % LOOP) / LOOP; return 0.5 - 0.5 * Math.cos(p * 2 * Math.PI); };
  let start = performance.now(), paused = false, beforeT = 0, nextAt = 0, gi = 0, lastNow = start;
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function lane(y, x, color, label) {
    ctx.strokeStyle = css('--grid'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(W - 80, y); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(80 + x * (W - 160), y, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css('--ink-soft'); ctx.font = '600 17px ' + css('--mono');
    ctx.fillText(label, 80, y - 38);
  }
  function draw(now) {
    const t = now - start;
    if (t >= nextAt) { beforeT = t; nextAt = t + gaps[gi % gaps.length]; gi++; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = css('--ink'); ctx.font = '700 28px ' + css('--display');
    ctx.fillText('Same thumb, two frame rhythms', 80, 46);
    ctx.textAlign = 'right'; ctx.fillStyle = css('--ink-soft'); ctx.font = '600 15px ' + css('--mono');
    ctx.fillText('ILLUSTRATION · NOT A RECORDING', W - 80, 46); ctx.textAlign = 'left';
    lane(140, thumb(beforeT), css('--late'), 'BEFORE · late frames hold the picture (two at 58 ms per loop)');
    lane(262, thumb(t), css('--signal'), 'AFTER · a new picture every 16.7 ms');
  }
  function tick(now) { lastNow = now; if (!paused) { draw(now); requestAnimationFrame(tick); } }
  function setBtn() { if (btn) { btn.textContent = paused ? 'Play' : 'Pause'; btn.setAttribute('aria-pressed', String(paused)); } }
  if (reduce) { paused = true; draw(start + 900); setBtn(); } else requestAnimationFrame(tick);
  if (btn) btn.addEventListener('click', () => {
    paused = !paused; setBtn();
    if (!paused) { const now = performance.now(); start += now - lastNow; nextAt = 0; requestAnimationFrame(tick); }
  });
})();
</script>`;

// ---------- Fig 4: Chrome said better, the thumb said no ----------
function chromeSvg() {
  const x0 = 250, fpsW = 520 / 120, frW = 520 / 8;
  const bar = (y, w, col) => `<rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="28" rx="3" style="fill:${col}"></rect>`;
  const whisk = (y, a, b) => `<line x1="${(x0 + a).toFixed(1)}" y1="${y + 14}" x2="${(x0 + b).toFixed(1)}" y2="${y + 14}" style="stroke:var(--ink);stroke-width:2"></line><line x1="${(x0 + a).toFixed(1)}" y1="${y + 7}" x2="${(x0 + a).toFixed(1)}" y2="${y + 21}" style="stroke:var(--ink);stroke-width:2"></line><line x1="${(x0 + b).toFixed(1)}" y1="${y + 7}" x2="${(x0 + b).toFixed(1)}" y2="${y + 21}" style="stroke:var(--ink);stroke-width:2"></line>`;
  const ticks = (y, vals, k, unit) => vals.map(v => `<line x1="${x0 + v * k}" y1="${y}" x2="${x0 + v * k}" y2="${y + 6}" style="stroke:var(--ink-soft)"></line><text x="${x0 + v * k}" y="${y + 22}" font-size="13" text-anchor="middle">${v}${v === vals[vals.length - 1] ? ' ' + unit : ''}</text>`).join('');
  return `<svg viewBox="0 0 1200 470" role="img" aria-label="Chrome, slowed 6x: scroll fps rose from 93.8 to 110.6 with wave 1, but frames over 34 ms stayed at 5 per run. On the phone the verdict was laggy the same.">
  <text class="ttl" x="40" y="46" font-size="28">Chrome said better. My thumb said no.</text>
  <text class="sub" x="40" y="74" font-size="15">Wave 1, eight fixes combined, against the original page. Chrome on the Mac, phone-sized, CPU slowed 6x; median of 5 runs, bar = median, whisker = min–max.</text>
  <text x="40" y="120" font-size="15" class="ink bold">Scroll frames per second (higher is better)</text>
  <text x="40" y="153" font-size="15" class="ink">Original</text>${bar(134, 93.8 * fpsW, 'var(--ink-soft)')}${whisk(134, 91.5 * fpsW, 94.3 * fpsW)}<text x="${x0 + 94.3 * fpsW + 14}" y="153" font-size="15" class="ink">93.8</text>
  <text x="40" y="191" font-size="15" class="ink">Wave 1</text>${bar(172, 110.6 * fpsW, 'var(--signal)')}${whisk(172, 105.5 * fpsW, 110.9 * fpsW)}<text x="${x0 + 110.9 * fpsW + 14}" y="191" font-size="15" class="ink bold">110.6</text>
  <line x1="${x0}" y1="208" x2="${x0 + 520}" y2="208" style="stroke:var(--grid)"></line>${ticks(208, [0, 30, 60, 90, 120], fpsW, 'fps')}
  <text x="${x0 + 540}" y="191" font-size="14" class="sig bold">better (ranges don't overlap)</text>
  <text x="40" y="282" font-size="15" class="ink bold">Frames over 34 ms per run (lower is better; the goal metric)</text>
  <text x="40" y="315" font-size="15" class="ink">Original</text>${bar(296, 5 * frW, 'var(--ink-soft)')}${whisk(296, 4 * frW, 6 * frW)}<text x="${x0 + 6 * frW + 14}" y="315" font-size="15" class="ink">5</text>
  <text x="40" y="353" font-size="15" class="ink">Wave 1</text>${bar(334, 5 * frW, 'var(--signal)')}${whisk(334, 4 * frW, 6 * frW)}<text x="${x0 + 6 * frW + 14}" y="353" font-size="15" class="ink bold">5</text>
  <line x1="${x0}" y1="370" x2="${x0 + 520}" y2="370" style="stroke:var(--grid)"></line>${ticks(370, [0, 2, 4, 6, 8], frW, 'frames')}
  <text x="${x0 + 540}" y="353" font-size="14">within noise</text>
  <rect x="930" y="110" width="230" height="262" rx="8" style="fill:var(--paper);stroke:var(--late);stroke-width:2"></rect>
  <text x="950" y="146" font-size="13" class="late bold">ON THE PHONE</text>
  <text x="950" y="170" font-size="13">1 Oct, 07:57 and 08:00 UTC</text>
  <text x="950" y="226" font-size="30" class="ttl late">"Laggy</text>
  <text x="950" y="264" font-size="30" class="ttl late">the same."</text>
  <text x="950" y="312" font-size="13">my verdict on the first</text>
  <text x="950" y="332" font-size="13">finger tests</text>
  <text x="40" y="440" font-size="13">Frames over 50 ms: 3 → 2 per run, also within noise. Chrome's big gains were in frame rate and script time, not in the late frames a thumb feels.</text>
</svg>`;
}

// ---------- Fig 5: countdown digit, 10 faces vs 3 ----------
function countdownSvg() {
  const fh = 30, fw = 90, y0 = 120;
  let left = '', right = '';
  // Before: 10 faces 0..9 stacked; the window shows one digit
  for (let d = 0; d < 10; d++) {
    const y = y0 + d * fh;
    left += `<rect x="150" y="${y}" width="${fw}" height="${fh - 4}" rx="3" style="fill:var(--paper-2);stroke:var(--ink-soft)"></rect><text x="${150 + fw / 2}" y="${y + 19}" font-size="16" text-anchor="middle" class="ink">${d}</text><text x="${150 + fw + 12}" y="${y + 18}" font-size="11">layer</text>`;
  }
  left += `<rect x="142" y="${y0 + 5 * fh - 6}" width="${fw + 16}" height="${fh + 8}" rx="5" style="fill:none;stroke:var(--late);stroke-width:3"></rect>`;
  left += `<text x="40" y="${y0 + 5 * fh + 18}" font-size="13" class="late bold">in view</text>`;
  // After: 3 slots
  const slots = [['5', 'leaving view'], ['4', 'coming into view'], ['·', 'spare']];
  slots.forEach(([d, lab], i) => {
    const y = y0 + 90 + i * (fh + 18);
    right += `<rect x="760" y="${y}" width="${fw}" height="${fh + 10}" rx="3" style="fill:var(--paper-2);stroke:var(--signal);stroke-width:1.5"></rect><text x="${760 + fw / 2}" y="${y + 26}" font-size="18" text-anchor="middle" class="ink">${d}</text><text x="${760 + fw + 14}" y="${y + 25}" font-size="14">${lab}</text>`;
  });
  right += `<rect x="752" y="${y0 + 90 + 20}" width="${fw + 16}" height="${fh + 18 + 10}" rx="5" style="fill:none;stroke:var(--signal);stroke-width:3"></rect>`;
  return `<svg viewBox="0 0 1200 500" role="img" aria-label="One countdown digit. Before: ten stacked faces, 0 to 9, each on its own layer. After PR-007: three face slots, the two that can be in view during a roll and one spare. Hero clock face layers 80 to 24.">
  <text class="ttl" x="40" y="46" font-size="28">One countdown digit: 10 faces before, 3 after</text>
  <text class="sub" x="40" y="74" font-size="15">My hint 3 (2 Oct, 15:24) became proposal PR-007, option "full", accepted at 22:08.</text>
  <text x="40" y="104" font-size="15" class="ink bold">Before: the original page</text>
  ${left}
  <text x="300" y="150" font-size="14" class="ink">10 stacked faces, 0 to 9,</text>
  <text x="300" y="172" font-size="14" class="ink">each on its own layer.</text>
  <text x="300" y="206" font-size="14">Rolled on every animation frame,</text>
  <text x="300" y="228" font-size="14">also while the clock was hidden:</text>
  <text x="300" y="250" font-size="14">faded out, scrolled away, or in the</text>
  <text x="300" y="272" font-size="14">menu panel at opacity 0.</text>
  <text x="660" y="104" font-size="15" class="ink bold">After: PR-007 "full"</text>
  ${right}
  <text x="660" y="380" font-size="14" class="ink">3 face slots: the two that can be in view</text>
  <text x="660" y="402" font-size="14" class="ink">during a roll, plus one spare.</text>
  <text x="660" y="430" font-size="14">While hidden, the clock keeps counting but</text>
  <text x="660" y="452" font-size="14">re-renders nothing; it shows the right digit on return.</text>
  <line x1="600" y1="96" x2="600" y2="470" style="stroke:var(--grid);stroke-width:2"></line>
  <text x="40" y="486" font-size="14" class="ink bold">Hero clock face layers: 80 → 24 (Chrome, OBSERVED). Pixel-identical in 295 frozen frames.</text>
</svg>`;
}

// ---------- Fig 6: heat ----------
function heatSvg() {
  const top = 110, h = 300, vmin = -0.2, vmax = 0.7, k = h / (vmax - vmin);
  const Y = v => top + (vmax - v) * k;
  const arms = [
    ['Blank floor page', '(control)', -0.085, -0.105],
    ['apple.com', 'MacBook Pro page, live', 0.055, -0.013],
    ['Fastwork, original', 'frozen copy', 0.620, 0.400],
    ['Fastwork, fixes so far', '2 Oct build v3', 0.192, 0.238],
  ];
  let g = '';
  [-0.2, 0, 0.2, 0.4, 0.6].forEach(v => {
    g += `<line x1="150" y1="${Y(v).toFixed(1)}" x2="1160" y2="${Y(v).toFixed(1)}" style="stroke:${v === 0 ? 'var(--ink)' : 'var(--grid)'};stroke-width:${v === 0 ? 1.5 : 1}"></line><text x="140" y="${(Y(v) + 5).toFixed(1)}" font-size="13" text-anchor="end">${v > 0 ? '+' : ''}${v.toFixed(1)}</text>`;
  });
  arms.forEach(([name, sub2, h1, h2], i) => {
    const cx = 280 + i * 250;
    [[h1, -42, 'var(--signal)', 1, 'H1'], [h2, 6, 'var(--signal)', 0.45, 'H2']].forEach(([v, dx, col, op]) => {
      const y1 = Math.min(Y(v), Y(0)), hh = Math.abs(Y(v) - Y(0));
      g += `<rect x="${cx + dx}" y="${y1.toFixed(1)}" width="36" height="${Math.max(hh, 1.5).toFixed(1)}" style="fill:${i === 2 ? 'var(--late)' : col}" opacity="${op}"></rect>`;
      const ty = v >= 0 ? Y(v) - 8 : Y(v) + 18;
      g += `<text x="${cx + dx + 18}" y="${ty.toFixed(1)}" font-size="13" text-anchor="middle" class="ink">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)}</text>`;
    });
    g += `<text x="${cx}" y="${top + h + 30}" font-size="15" text-anchor="middle" class="ink bold">${name}</text><text x="${cx}" y="${top + h + 50}" font-size="13" text-anchor="middle">${sub2}</text>`;
  });
  return `<svg viewBox="0 0 1200 530" role="img" aria-label="How fast each page warmed the iPhone, degrees Celsius per minute, two sessions. Blank floor page minus 0.085 and minus 0.105; apple.com plus 0.055 and minus 0.013; Fastwork original plus 0.620 and plus 0.400; Fastwork with fixes so far plus 0.192 and plus 0.238.">
  <text class="ttl" x="40" y="46" font-size="28">This page warmed the phone; apple.com barely did</text>
  <text class="sub" x="40" y="74" font-size="15">iPhone battery temperature, °C per minute, corrected to a 37.0 °C start. Two sessions on 3 Oct, 01:33–03:34 UTC: H1 solid, H2 light.</text>
  <text x="40" y="100" font-size="13" class="ink">°C / min</text>
  ${g}
  <text x="40" y="508" font-size="13">H1's "Fastwork, original" bar is likely inflated by a warm-up inside its hold; the verdict holds on H2 alone. Each arm: rest, then repeated scrolling, 6-minute segments.</text>
</svg>`;
}

// ---------- Fig 7 / 8: per-run dot plots ----------
function dotSvg({ title, sub, rows, max, note, aria }) {
  const x0 = 380, w = 760, k = w / max;
  let g = '';
  for (let v = 0; v <= max; v += 10) g += `<line x1="${x0 + v * k}" y1="120" x2="${x0 + v * k}" y2="300" style="stroke:var(--grid)"></line><text x="${x0 + v * k}" y="322" font-size="13" text-anchor="middle">${v}</text>`;
  g += `<text x="${x0 + w}" y="344" font-size="13" text-anchor="end">slow frames per run (over 34 ms)</text>`;
  rows.forEach(([name, sub2, vals, med, col], r) => {
    const y = 165 + r * 90;
    g += `<text x="40" y="${y - 4}" font-size="16" class="ink bold">${name}</text><text x="40" y="${y + 18}" font-size="13">${sub2}</text>`;
    g += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" style="stroke:var(--grid);stroke-width:2"></line>`;
    const seen = {};
    vals.forEach(v => { const n = seen[v] = (seen[v] || 0) + 1; const dy = (n - 1) * 16 - (vals.filter(x => x === v).length - 1) * 8; g += `<circle cx="${x0 + v * k}" cy="${y + dy}" r="8" style="fill:${col}" opacity="0.55"></circle>`; });
    g += `<line x1="${x0 + med * k}" y1="${y - 22}" x2="${x0 + med * k}" y2="${y + 22}" style="stroke:${col};stroke-width:4"></line>`;
    g += `<text x="${x0 + med * k}" y="${y - 30}" font-size="15" text-anchor="middle" class="bold" style="fill:${col}">median ${med}</text>`;
  });
  return `<svg viewBox="0 0 1200 400" role="img" aria-label="${aria}">
  <text class="ttl" x="40" y="46" font-size="28">${title}</text>
  <text class="sub" x="40" y="74" font-size="15">${sub}</text>
  ${g}
  <text x="40" y="384" font-size="13">${note}</text>
</svg>`;
}
const fig7 = dotSvg({
  title: 'Slow frames through the top card: 27 → 12 per run',
  sub: 'Hero band, frames over 34 ms. iPhone 15 Pro Max at real Serious heat (battery 41.4–42.5 °C), robot finger, 4 Oct 05:25–05:34 UTC.',
  rows: [['Best build before', 'C: v4 with script-driven fade', [27, 37, 22], 27, 'var(--late)'], ['Hero cards on the GPU', 'V: B-R2, became v6', [26, 8, 12], 12, 'var(--signal)']],
  max: 40,
  note: 'Dot = one run (3 per side); bar = median. Over 50 ms: median 4 → 3. OBSERVED, phone check P-095. I picked V in both blind swipes.',
  aria: 'Slow frames over 34 ms through the top card, per run. Before: 27, 37, 22, median 27. Hero cards on the GPU: 26, 8, 12, median 12.',
});
const fig8 = dotSvg({
  title: 'Background pictures off: slow frames 16 → 3 per run',
  sub: 'End of the page, frames over 34 ms. iPhone at Xcode-set Serious, robot finger, runs in C V V C order, 5 Oct 11:51–12:47 UTC.',
  rows: [['Pictures on', 'C: the best build', [30, 17, 14, 15], 16, 'var(--late)'], ['Background pictures off', 'V: the same build, no pictures', [2, 3, 3, 5], 3, 'var(--signal)']],
  max: 40,
  note: 'Dot = one run (4 per side); bar = median. Every V run is below every C run. OBSERVED, phone check P-137. Proof only: the pictures were later made lighter, not removed.',
  aria: 'Slow frames over 34 ms at the end of the page, per run. Pictures on: 30, 17, 14, 15, median 16. Pictures off: 2, 3, 3, 5, median 3.',
});

// ---------- Fig 9-11: the log page's charts (copied from summary/ten-days.html) ----------
const log = fs.readFileSync(S + '/summary/ten-days.html', 'utf8');
const scriptStart = log.indexOf('(function(){', log.lastIndexOf('<script'));
const scriptEnd = log.lastIndexOf('</script>');
let logJs = log.slice(scriptStart, scriptEnd).trim();
// keep the three requested charts; drop "agents by role"
const cut = logJs.indexOf('// agents by role');
if (cut < 0) throw new Error('log script changed');
logJs = logJs.slice(0, cut) + '})();';
logJs = logJs.replace('getElementById("activity")', 'getElementById("cap-activity")')
  .replace('getElementById("proposals")', 'getElementById("cap-proposals")')
  .replace('getElementById("builds")', 'getElementById("cap-builds")');
for (const id of ['cap-activity', 'cap-proposals', 'cap-builds']) if (!logJs.includes(id)) throw new Error('id ' + id);
const logScript = `<script>
/* The log page's charts (summary/ten-days.html, "Ten Days to Smooth"), copied unchanged except the container ids. */
${logJs}
</script>`;

// ---------- place them ----------
replaceFigureLine('Animation planned (GIF, before | after)</span><figcaption>Frame rhythm',
  frame(3, '', `    ${paceCanvas}`, 'Illustration, not a recording: same thumb motion, two frame rhythms, drawn from Part 1\'s pace script. Screen-record it for the GIF.', '<button type="button" id="cap-pace-toggle" aria-pressed="false">Pause</button>'));
replaceFigureLine('Still: Part 1\'s frame ruler',
  frame(1, '', `    <p class="cap-title">What "smooth" means, in numbers</p>\n    ${ruler.split('\n').join('\n    ')}`, 'Part 1\'s frame ruler: one phone frame is 16.7 ms; over 34 ms is slow; the goal is no frame over 50 ms.') + '\n' +
  frame(2, '', `    ${loopSvg()}`, 'The loop I built on day 1, one round from the frozen copy to a new best build.'));
replaceFigureLine('A chart of Chrome\'s "better"',
  frame(4, '', `    ${chromeSvg()}`, 'Chrome\'s numbers against my thumb on 1 October.') + '\n' +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still: the first console page (a screenshot). <span class="why">Why: where my steps and answers moved after 14:19.</span></figcaption></figure>`);
replaceFigureLine('A drawing of the countdown with 3 faces',
  frame(5, '', `    ${countdownSvg()}`, 'What PR-007 "full" changed in each countdown digit.'));
replaceFigureLine('A heat chart: this page against apple.com',
  frame(6, '', `    ${heatSvg()}`, 'The heat test behind my hint 4 and the Serious milestone (phone check P-068).'));
replaceFigureLine('Still strip of the same flick, original against final, and a bar',
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still strip of the same flick, original against final. <span class="why">Why: the breakthrough I felt in the blind swipe.</span></figcaption></figure>\n` +
  frame(7, '', `    ${fig7}`, 'The phone check behind v6, the build I picked blind.'));
replaceFigureLine('The end of the page with and without its background pictures',
  frame(8, '', `    ${fig8}`, 'My background-picture hunch, tested on the phone.') + '\n' +
  `<figure class="slot"><span class="label">Picture planned</span><figcaption>Still: the end of the page with and without its background pictures (screenshots). <span class="why">Why: what the test switched off.</span></figcaption></figure>`);
replaceFigureLine('The log page\'s charts',
  frame(9, '', `    <p class="cap-title">Activity per day</p>\n    <p class="cap-sub">Each row has its own scale; its peak is labelled. 9 Oct stops at 12:57 UTC.</p>\n    <div id="cap-activity"></div>`, 'From the log page: my messages, the lead\'s thread replies, agents started and commits, per day.') + '\n' +
  frame(10, '', `    <p class="cap-title">My proposal decisions</p>\n    <p class="cap-sub">Each dot is one decision at its time (UTC). A ring means my note said it felt ultra smooth.</p>\n    <div id="cap-proposals"></div>`, 'From the log page: every proposal I decided, 2 to 9 October.') + '\n' +
  frame(11, '', `    <p class="cap-title">The best-build path</p>\n    <p class="cap-sub">Each best build replaced the one before it only after a phone check.</p>\n    <div id="cap-builds"></div>`, 'From the log page: the best builds, v0 to g0.0l.'));

// ---------- footer sources ----------
const src = [
  [1, 'Part 1\'s frame ruler, copied from research/team-article/post-1-loop/index.html (figure "What smooth means, in numbers"); the legend moved into the drawing. Thresholds: CLAUDE.md "Frame thresholds".'],
  [2, 'Drawn from the setup in CLAUDE.md (frozen snapshot, CPU 6x calibration, worktrees, chrome-measure lock, iPhone hold, blind swipe and proposals, rebase and fast-forward landing) and fixes/BEST_BUILDS.md. No numbers besides 6x (research/cpu-throttle-calibration/).'],
  [3, 'Part 1\'s pace script (research/team-article/post-1-loop/index.html): the same frame gaps, 16.7 ms with six late frames per 3.6 s loop (41, 58, 37, 25, 58, 41 ms). An illustration, not a recording.'],
  [4, 'fixes/all-wave1/README.md, "A/B: baseline vs all-wave1" (mobile 6x, n=5, median [min–max]): fps 93.8 [91.5–94.3] → 110.6 [105.5–110.9]; frames over 34 ms 5 [4–6] → 5 [4–6]; over 50 ms 3 [2–4] → 2 [1–3]. Verdict quote: day file 1 Oct, 08:00:14 (07:57:24 for version A).'],
  [5, 'Proposal PR-007 (console store), option "full", accepted 2026-10-02 22:08:59Z: 3 face slots, no re-rendering while unseen; hero clock face layers 80 → 24 (LayerTree, Chrome, OBSERVED); 0 of 295 frozen frames differ. Faces 0-9 on own layers: fixes/countdown-faces/README.md "What the countdown costs today". Hint time: thread T-024 #1.'],
  [6, 'research/phone-heat/README.md, "Result (H1 + H2, 10-03 01:33-03:34Z)", corrected slopes at 37.0 °C: F −0.085 / −0.105, A +0.055 / −0.013, B +0.620 / +0.400, X +0.192 / +0.238 °C/min; deviation D2 (H1 B pre-warmed). Arms: same file, table of arms (A = apple.com MacBook Pro page, X = st6-rb2, the v3 build). OBSERVED.'],
  [7, 'fixes/hero-exit-threaded/README.md, "P-095 result": f34 band per run C 27, 37, 22 (median 27), V 26, 8, 12 (median 12); f50 median 4 → 3; battery 41.4–42.5 °C, hold 05:24:59–05:34:07Z. C = best-build (v4), V = B-R2 (v6, fixes/BEST_BUILDS.md). Blind swipes: steps C-038, C-039.'],
  [8, 'fixes/end-bg/README.md §5, "P-137 result": over 34 ms per run C 30, 17, 14, 15 (median 16), V 2, 3, 3, 5 (median 3); block 11:51–12:47Z, Xcode-induced Serious. OBSERVED.'],
  [9, 'summary/ten-days.html (the log page "Ten Days to Smooth"), activity chart and its data, copied.'],
  [10, 'summary/ten-days.html, proposals timeline and its data, copied; decisions match the console proposal store (PR-001 to PR-041).'],
  [11, 'summary/ten-days.html, best-build path, copied; versions per fixes/BEST_BUILDS.md.'],
];
rep('<footer class="note">', `<footer class="note">
  <p><b>Figure sources.</b> Every number in a figure comes from the line below. Phone numbers are OBSERVED: our own checks, in our setup, small samples.</p>
  <ol class="figsrc src">
${src.map(([n, t]) => `    <li id="src-${n}" value="${n}">Fig. ${n}: ${t}</li>`).join('\n')}
  </ol>`);
// scripts at the end
rep('</main>', `</main>\n${paceScript}\n${logScript}`);
fs.writeFileSync(F, s);
console.log('ok', (s.match(/class="cap"/g) || []).length, 'capture frames');

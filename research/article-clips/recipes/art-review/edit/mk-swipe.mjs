// edit-article-p1: swipe-hist.json -> fig9.svg (the new closing histogram), same SVG conventions as
// art-histogram/mk-charts.mjs Fig. a (bars, panels, tokens), vocabulary: slow > 34 ms, very slow > 50 ms.
import fs from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const J = JSON.parse(fs.readFileSync(D + 'swipe-hist.json', 'utf8'));
const O = J.orig, G = J.g0m;
const fmt = (n) => n.toLocaleString('en-US');
const pct = (a, n) => (100 * a / n).toFixed(a / n < 0.01 ? 2 : 1) + ' %';
const r1 = (x) => Math.round(x * 10) / 10;
const bar = (x, w, yTop, yBase, color, title) => {
  const h = yBase - yTop; if (h <= 0) return '';
  const r = Math.min(4, h / 2, w / 2);
  return `<path d="M${r1(x)} ${yBase}V${r1(yTop + r)}Q${r1(x)} ${r1(yTop)} ${r1(x + r)} ${r1(yTop)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(yTop)} ${r1(x + w)} ${r1(yTop + r)}V${yBase}Z" style="fill:var(${color})"><title>${title}</title></path>`;
};
const base = 390, top = 170, H = base - top;
const left = { x0: 110, x1: 410, max: 3600, ticks: [0, 1000, 2000, 3000], bins: [0, 1] };
const right = { x0: 540, x1: 1160, max: 300, ticks: [0, 100, 200, 300], bins: [2, 3, 4, 5] };
const binLbl = ['≤ 20 ms', '20–34 ms', '34–50 ms', '50–100 ms', '100–200 ms', '> 200 ms'];
const NAME = { o: 'Original site', g: 'Final build g0.0m' };
let a = '';
for (const p of [left, right]) {
  const y = (v) => base - H * v / p.max;
  for (const t of p.ticks) a += `<line x1="${p.x0}" y1="${r1(y(t))}" x2="${p.x1}" y2="${r1(y(t))}" style="stroke:var(--grid)"></line><text x="${p.x0 - 8}" y="${r1(y(t) + 4)}" font-size="13" text-anchor="end">${fmt(t)}</text>`;
  const bw = (p.x1 - p.x0) / p.bins.length;
  p.bins.forEach((b, i) => {
    const cx = p.x0 + bw * (i + 0.5), w = 46;
    for (const [k, arm, color, name] of [[-1, O, '--late', NAME.o], [1, G, '--signal', NAME.g]]) {
      const bx = k < 0 ? cx - w - 2 : cx + 2; const c = arm.bins[b];
      a += bar(bx, w, y(c), base, color, `${name}, ${binLbl[b]}: ${fmt(c)} frames (${pct(c, arm.n)})`);
      a += `<text x="${r1(bx + w / 2)}" y="${r1(y(c) - 7)}" font-size="14" text-anchor="middle" class="bold" style="fill:var(${color})">${fmt(c)}</text>`;
    }
    a += `<text x="${r1(cx)}" y="${base + 22}" font-size="13" text-anchor="middle" class="ink">${binLbl[b]}</text>`;
  });
}
a += `<line x1="${left.x0}" y1="${base}" x2="${left.x1}" y2="${base}" style="stroke:var(--ink-soft)"></line><line x1="${right.x0}" y1="${base}" x2="${right.x1}" y2="${base}" style="stroke:var(--ink-soft)"></line>`;
const bwR = (right.x1 - right.x0) / 4;
for (const [x, lbl] of [[right.x0, '34 ms: slow'], [right.x0 + bwR, '50 ms: very slow']])
  a += `<line x1="${x}" y1="${top - 20}" x2="${x}" y2="${base + 6}" style="stroke:var(--ink);stroke-dasharray:5 4;stroke-width:1.5"></line><text x="${x + 6}" y="${top - 8}" font-size="13" class="ink bold">${lbl}</text>`;
const ratio = (left.max / left.ticks.length) / (right.max / right.ticks.length);
a += `<text x="${left.x0}" y="${top - 34}" font-size="14" class="ink bold">Not slow (34 ms or less)</text>`;
a += `<text x="${right.x0}" y="${top - 34}" font-size="14" class="ink bold">Slow (over 34 ms): the scale is ${left.max / right.max}x taller</text>`;
a += `<rect x="40" y="94" width="14" height="14" rx="3" style="fill:var(--late)"></rect><text x="62" y="106" font-size="14" class="ink">${NAME.o} · ${fmt(O.n)} frames</text>`;
a += `<rect x="380" y="94" width="14" height="14" rx="3" style="fill:var(--signal)"></rect><text x="402" y="106" font-size="14" class="ink">${NAME.g} · ${fmt(G.n)} frames</text>`;
const binsAria = (arm) => arm.bins.map((c, i) => binLbl[i].replace('≤ ', 'up to ').replace('> ', 'over ').replace('–', ' to ') + ' ' + c).join(', ');
const oneIn = (arm) => Math.round(arm.n / arm.gt34);
const svg = `<svg viewBox="0 0 1200 486" role="img" aria-label="Frame-time histogram of my swipe replayed by the robot, the whole replay, two runs per build pooled. Original site, ${fmt(O.n)} frames: ${binsAria(O)}. Final build g0.0m, ${fmt(G.n)} frames: ${binsAria(G)}.">
  <text class="ttl" x="40" y="46" font-size="28">My swipe, every frame: 1 in ${oneIn(O)} is slow on the original, 1 in ${oneIn(G)} on g0.0m</text>
  <text class="sub" x="40" y="74" font-size="15">The robot replaying my swipe from clip 1: 2 runs per build pooled, the whole replay, about 31 s each. Each bar counts frames in one time range.</text>
  ${a}
  <text x="40" y="452" font-size="13">Slow (over 34 ms): ${O.gt34} of ${fmt(O.n)} (${pct(O.gt34, O.n)}) against ${G.gt34} of ${fmt(G.n)} (${pct(G.gt34, G.n)}). Very slow (over 50 ms): ${O.gt50} (${pct(O.gt50, O.n)}) against ${G.gt50} (${pct(G.gt50, G.n)}).</text>
  <text x="40" y="472" font-size="13">Longest frame ${O.worst} ms against ${G.worst} ms. The original drew fewer frames in the same replay: about ${Math.round(O.fps)} per second against ${Math.round(G.fps)}.</text>
</svg>`;
fs.writeFileSync(D + 'fig9.svg', svg);
console.log('ratio', ratio, 'oneIn', oneIn(O), oneIn(G), 'fps', O.fps, G.fps);

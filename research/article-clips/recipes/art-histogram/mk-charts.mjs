// art-histogram: hist.json -> charts.html (two capture-ready figures in the draft's .cap style) + preview.html.
import fs from 'node:fs';
import path from 'node:path';
const D = path.dirname(new URL(import.meta.url).pathname);
const J = JSON.parse(fs.readFileSync(path.join(D, 'hist.json'), 'utf8'));
const fmt = (n) => n.toLocaleString('en-US');
const pct = (a, n) => (100 * a / n).toFixed(a / n < 0.01 ? 2 : 1) + ' %';
const r1 = (x) => Math.round(x * 10) / 10;
// bar with a rounded data end (top), flat on the baseline
const bar = (x, w, yTop, yBase, color, title) => {
  const h = yBase - yTop; if (h <= 0) return '';
  const r = Math.min(4, h / 2, w / 2);
  return `<path d="M${r1(x)} ${yBase}V${r1(yTop + r)}Q${r1(x)} ${r1(yTop)} ${r1(x + r)} ${r1(yTop)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(yTop)} ${r1(x + w)} ${r1(yTop + r)}V${yBase}Z" style="fill:var(${color})"><title>${title}</title></path>`;
};

// ---------- Fig. a: how much (pooled clean slow approach) ----------
const P = J.pooledSlowApproachClean; const O = P.orig, G = P.g0l;
const runsTxt = (rs) => rs.map((r) => r.slice(9, 16)).join(', ');
let a = '';
const base = 390, top = 170, H = base - top;
const left = { x0: 110, x1: 410, max: 2400, ticks: [0, 500, 1000, 1500, 2000], bins: [0, 1] };
const right = { x0: 540, x1: 1160, max: 120, ticks: [0, 25, 50, 75, 100], bins: [2, 3, 4, 5] };
const binLbl = ['≤ 20 ms', '20–34 ms', '34–50 ms', '50–100 ms', '100–200 ms', '> 200 ms'];
for (const p of [left, right]) {
  const y = (v) => base - H * v / p.max;
  for (const t of p.ticks) a += `<line x1="${p.x0}" y1="${r1(y(t))}" x2="${p.x1}" y2="${r1(y(t))}" style="stroke:var(--grid)"></line><text x="${p.x0 - 8}" y="${r1(y(t) + 4)}" font-size="13" text-anchor="end">${fmt(t)}</text>`;
  const bw = (p.x1 - p.x0) / p.bins.length;
  p.bins.forEach((b, i) => {
    const cx = p.x0 + bw * (i + 0.5), w = 46;
    for (const [k, arm, color] of [[-1, O, '--late'], [1, G, '--signal']]) {
      const bx = k < 0 ? cx - w - 2 : cx + 2; const c = arm.bins[b].count;
      const name = arm === O ? 'Original site' : 'Final build g0.0l';
      a += bar(bx, w, y(c), base, color, `${name}, ${binLbl[b]}: ${fmt(c)} frames (${pct(c, arm.n)})`);
      a += `<text x="${r1(bx + w / 2)}" y="${r1(y(c) - 7)}" font-size="14" text-anchor="middle" class="bold" style="fill:var(${color})">${fmt(c)}</text>`;
    }
    a += `<text x="${r1(cx)}" y="${base + 22}" font-size="13" text-anchor="middle" class="ink">${binLbl[b]}</text>`;
  });
}
a += `<line x1="${left.x0}" y1="${base}" x2="${left.x1}" y2="${base}" style="stroke:var(--ink-soft)"></line><line x1="${right.x0}" y1="${base}" x2="${right.x1}" y2="${base}" style="stroke:var(--ink-soft)"></line>`;
// threshold lines: 34 ms = left edge of the right panel, 50 ms = between bins 34-50 and 50-100
const bwR = (right.x1 - right.x0) / 4;
for (const [x, lbl, cls] of [[right.x0, '34 ms: slow', ''], [right.x0 + bwR, '50 ms: the goal limit', '']]) {
  a += `<line x1="${x}" y1="${top - 20}" x2="${x}" y2="${base + 6}" style="stroke:var(--ink);stroke-dasharray:5 4;stroke-width:1.5"></line><text x="${x + 6}" y="${top - 8}" font-size="13" class="ink bold">${lbl}</text>`;
}
a += `<text x="${left.x0}" y="${top - 34}" font-size="14" class="ink bold">On time (34 ms or less)</text>`;
a += `<text x="${right.x0}" y="${top - 34}" font-size="14" class="ink bold">Late (over 34 ms): the scale is 20x taller</text>`;
// legend
a += `<rect x="40" y="94" width="14" height="14" rx="3" style="fill:var(--late)"></rect><text x="62" y="106" font-size="14" class="ink">Original site · ${fmt(O.n)} frames</text>`;
a += `<rect x="380" y="94" width="14" height="14" rx="3" style="fill:var(--signal)"></rect><text x="402" y="106" font-size="14" class="ink">Final build g0.0l · ${fmt(G.n)} frames</text>`;
const lateO = O.gt34, lateG = G.gt34;
const svgA = `<svg viewBox="0 0 1200 486" role="img" aria-label="Frame-time histogram of the slow scroll from the top to about 3,500 px, two runs per build pooled. Original site, ${fmt(O.n)} frames: ${O.bins.map((b) => b.bin.replace('>', 'over ') + ' ms ' + b.count).join(', ')}. Final build g0.0l, ${fmt(G.n)} frames: ${G.bins.map((b) => b.bin.replace('>', 'over ') + ' ms ' + b.count).join(', ')}.">
  <text class="ttl" x="40" y="46" font-size="28">How much: about 1 frame in 9 is late on the original, 1 in 240 on the final build</text>
  <text class="sub" x="40" y="74" font-size="15">Slow scroll from the top to y ~3,500 px, 2 runs per build pooled (about 19 s each). Each bar counts frames in one time range.</text>
  ${a}
  <text x="40" y="452" font-size="13">Over 34 ms: ${lateO} of ${fmt(O.n)} (${pct(lateO, O.n)}) against ${lateG} of ${fmt(G.n)} (${pct(lateG, G.n)}). Over 50 ms: ${O.gt50} (${pct(O.gt50, O.n)}) against ${G.gt50} (${pct(G.gt50, G.n)}).</text>
  <text x="40" y="472" font-size="13">Longest frame ${O.worst} ms against ${G.worst} ms. The original also drew fewer frames in the same scroll: about 47 per second against 60.</text>
</svg>`;

// ---------- Fig. b: when (one run per arm, dt against scrollY) ----------
const W = J.when; const XMAX = 3600, YMAX = 150;
const X0 = 110, X1 = 1160; const sx = (v) => X0 + (X1 - X0) * v / XMAX;
const panels = [{ arm: 'orig', top: 176, color: '--late', name: 'Original site' }, { arm: 'g0l', top: 396, color: '--signal', name: 'Final build g0.0l' }];
const PH = 170;
const bands = [[0, 620, 'hero cards'], [620, 1700, 'People title + deck'], [1850, 2100, 'dark section'], [2500, 2760, '#platform']];
let b = '';
bands.forEach(([lo, hi, lbl], i) => {
  b += `<rect x="${r1(sx(lo))}" y="${panels[0].top}" width="${r1(sx(hi) - sx(lo))}" height="${panels[1].top + PH - panels[0].top}" style="fill:var(--paper-2)" opacity="${i % 2 ? 1 : 0.6}"></rect>`;
  b += `<line x1="${r1(sx(lo))}" y1="120" x2="${r1(sx(hi))}" y2="120" style="stroke:var(--ink-soft);stroke-width:2"></line>`;
  b += `<text x="${r1((sx(lo) + sx(hi)) / 2)}" y="112" font-size="13" text-anchor="middle" class="ink">${lbl}</text>`;
});
// carousel: a point, second row
b += `<line x1="${r1(sx(1710))}" y1="146" x2="${r1(sx(1710))}" y2="${panels[1].top + PH}" style="stroke:var(--ink-soft);stroke-dasharray:2 3"></line><text x="${r1(sx(1710))}" y="140" font-size="13" text-anchor="middle" class="ink">user carousel</text>`;
for (const p of panels) {
  const base = p.top + PH; const sy = (v) => base - PH * Math.min(v, YMAX) / YMAX;
  for (const t of [0, 50, 100, 150]) b += `<line x1="${X0}" y1="${r1(sy(t))}" x2="${X1}" y2="${r1(sy(t))}" style="stroke:var(--grid)"></line><text x="${X0 - 8}" y="${r1(sy(t) + 4)}" font-size="13" text-anchor="end">${t}</text>`;
  b += `<line x1="${X0}" y1="${base}" x2="${X1}" y2="${base}" style="stroke:var(--ink-soft)"></line>`;
  for (const [v, l] of [[34, '34'], [50, '50']]) b += `<line x1="${X0}" y1="${r1(sy(v))}" x2="${X1}" y2="${r1(sy(v))}" style="stroke:var(--ink);stroke-dasharray:5 4;stroke-width:1.2" opacity="0.7"></line>`;
  const fr = W[p.arm].frames; const late = fr.filter((f) => f[1] > 34), on = fr.filter((f) => f[1] <= 34);
  b += `<g style="fill:var(${p.color})" opacity="0.3">${on.map((f) => `<circle cx="${r1(sx(f[2]))}" cy="${r1(sy(f[1]))}" r="2"></circle>`).join('')}</g>`;
  b += `<g style="fill:var(${p.color})">${late.map((f) => f[1] > YMAX
    ? `<path d="M${r1(sx(f[2]) - 6)} ${r1(sy(YMAX) + 4)}L${r1(sx(f[2]))} ${r1(sy(YMAX) - 6)}L${r1(sx(f[2]) + 6)} ${r1(sy(YMAX) + 4)}Z"><title>${f[1]} ms at y ${f[2]}</title></path>`
    : `<circle cx="${r1(sx(f[2]))}" cy="${r1(sy(f[1]))}" r="3.5"><title>${f[1]} ms at y ${f[2]}</title></circle>`).join('')}</g>`;
  for (const f of late.filter((f) => f[1] > YMAX)) b += `<text x="${r1(sx(f[2]) - 12)}" y="${r1(sy(YMAX) + 8)}" font-size="13" text-anchor="end" class="bold" style="fill:var(${p.color})">${f[1]} ms, off the scale</text>`;
  const n34 = late.length, n50 = fr.filter((f) => f[1] > 50).length, worst = Math.max(...fr.map((f) => f[1]));
  b += `<text x="${X0}" y="${p.top - 6 - (p.arm === 'orig' ? 0 : 0)}" font-size="14" class="ink bold">${p.name}</text>`;
  b += `<text x="${X1}" y="${p.top - 6}" font-size="13" text-anchor="end">run ${W[p.arm].run.slice(9, 16)} UTC · ${fmt(fr.length)} frames · ${n34} over 34 ms, ${n50} over 50 ms · longest ${worst} ms</text>`;
  b += `<text x="${X1 + 6}" y="${r1(sy(34) + 4)}" font-size="12">34</text><text x="${X1 + 6}" y="${r1(sy(50) + 4)}" font-size="12">50</text>`;
}
const xb = panels[1].top + PH;
for (let v = 0; v <= 3500; v += 500) b += `<text x="${r1(sx(v))}" y="${xb + 20}" font-size="13" text-anchor="middle">${fmt(v)}</text>`;
b += `<text x="${X1}" y="${xb + 40}" font-size="13" text-anchor="end">scroll position, px down the page</text><text x="40" y="${panels[0].top + 4}" font-size="13" transform="rotate(-90 40 ${panels[0].top + 4})" text-anchor="end">ms per frame</text><text x="40" y="${panels[1].top + 4}" font-size="13" transform="rotate(-90 40 ${panels[1].top + 4})" text-anchor="end">ms per frame</text>`;
const svgB = `<svg viewBox="0 0 1200 664" role="img" aria-label="Each frame's time against scroll position, one run per build. On the original, frames over 34 ms gather in the hero, the People deck around 1,400 to 1,700 px and the dark section around 2,000 px, with one 361 ms frame at 1,953 px; past 2,800 px there are almost none. On the final build, 5 frames go over 34 ms, the longest 64 ms at 618 px.">
  <text class="ttl" x="40" y="46" font-size="28">When: on the original, late frames pile up from the hero to the dark section</text>
  <text class="sub" x="40" y="74" font-size="15">Every frame of one slow scroll per build (the robot drags ~500 px, then rests; resting frames stack at one spot). Big dots: over 34 ms.</text>
  ${b}
  <text x="40" y="654" font-size="13">Section ranges are approximate scroll positions on this phone. Dashed lines: 34 ms (slow) and 50 ms (the goal limit).</text>
</svg>`;

const figA = `<figure class="cap" data-capture="ready" id="fig-hist-much">
  <div class="cap-bar"><span class="ready">capture-ready · 1200 px · Fig. 13</span></div>
  <div class="cap-area">
    ${svgA}
  </div>
  <figcaption class="note">How long each frame took on the real phone during one slow scroll down the top half of the page, original site against the final build g0.0l (Fig. 13). Robot finger, same moves on both; iPhone 15 Pro Max, Safari, Serious heat, 9 Oct; 2 runs per build pooled (original ${runsTxt(O.runs)}, final ${runsTxt(G.runs)} UTC), ${fmt(O.n)} and ${fmt(G.n)} frames from the phone's own frame log. One afternoon, OBSERVED (source: fixes/worst-cases-capture).</figcaption>
</figure>`;
const figB = `<figure class="cap" data-capture="ready" id="fig-hist-when">
  <div class="cap-bar"><span class="ready">capture-ready · 1200 px · Fig. 14</span></div>
  <div class="cap-area">
    ${svgB}
  </div>
  <figcaption class="note">Where on the page the late frames happen: each frame's time against how far down the page it was drawn, one run per build from Fig. 13 (original ${W.orig.run.slice(9, 16)}, final g0.0l ${W.g0l.run.slice(9, 16)} UTC, 9 Oct). The section names mark approximate scroll ranges; the end of the page (from about 5,200 px) is not in this scroll. One run each, OBSERVED (source: fixes/worst-cases-capture).</figcaption>
</figure>`;
const snippet = `<!-- art-histogram (T-170 #186): two frame-time figures for the "What the phone recorded" section; data hist.json, made by mk-charts.mjs -->\n${figA}\n${figB}\n`;
fs.writeFileSync(path.join(D, 'charts.html'), snippet);
// preview: the draft's <style> + the snippet
const draft = fs.readFileSync(path.join(D, '../articles/p1-ten-days-draft.html'), 'utf8');
const style = draft.slice(draft.indexOf('<style>'), draft.indexOf('</style>') + 8);
fs.writeFileSync(path.join(D, 'preview.html'), `<title>histogram preview</title>${style}<main>${snippet}</main>`);
// standalone SVGs with the light tokens resolved (for rsvg checks)
const tok = { '--ink': '#17221e', '--ink-soft': '#4a5a54', '--grid': '#d3ddd8', '--late': '#c9472a', '--signal': '#2743c9', '--paper-2': '#e4eae6' };
const css = `<style>text{font-family:Menlo,monospace;fill:#4a5a54}.ttl{font-family:Helvetica;font-weight:700;fill:#17221e}.sub{font-family:Georgia;fill:#4a5a54}.ink{fill:#17221e}.bold{font-weight:600}</style>`;
const res = (s) => s.replace(/var\((--[a-z0-9-]+)\)/g, (m, k) => tok[k] || m).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="#fff"/>${css}`);
fs.writeFileSync(path.join(D, 'figA.svg'), res(svgA)); fs.writeFileSync(path.join(D, 'figB.svg'), res(svgB));
console.log('ok', snippet.length);

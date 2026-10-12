// Shared helpers for the math blocks. Every chart takes its numbers as data and places marks with one linear
// scale (0..max), so a bar's length and a tick's label always come from the same function.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fmt = (n, d) => (d === undefined ? n : n.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: 3 });
const pct = (v, max, min = 0) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)).toFixed(2);

const STATUS = ['CONFIRMED', 'OBSERVED', 'REFUTED', 'UNRESOLVED', 'WEAKENED', 'UNPROVEN', 'DERIVED', 'MODEL', 'RULE', 'INFERENCE'];
export const chip = (w) => {
  if (!STATUS.includes(w)) throw new Error(`unknown status ${w}`);
  return `<span class="st st-${w.toLowerCase()}">${w}</span>`;
};

// One math block. `status` is one word or a list; `formula` is HTML/MathML; `fig` is HTML from the chart helpers.
export function block({ id, title, status, plain, formula, worked, fig, source, open = true }) {
  const chips = [].concat(status || []).map(chip).join(' ');
  return `<details class="mx" id="math-${id}"${open ? ' open' : ''}>
<summary><span class="mx-tag">The math</span><span class="mx-t">${title}</span><span class="mx-chips">${chips}</span></summary>
<div class="mx-b">
${plain ? `<p class="mx-plain">${plain}</p>` : ''}
${formula ? `<div class="mx-eq">${formula}</div>` : ''}
${worked ? `<div class="mx-ex"><p class="mx-h">Worked example, our numbers</p>${worked}</div>` : ''}
${fig || ''}
${source ? `<p class="mx-src"><span>Source</span> ${source}</p>` : ''}
</div></details>`;
}

// Horizontal bars. rows: {label, v, arm: 'orig'|'mid'|'fix'|'ink', show?, note?} or {group: 'heading'}.
// ticks must lie inside [0, max]; every tick label is a value on the same scale as the bars.
export function bars({ max, min = 0, ticks, unit = '', rows, caption, aria, legend, refs = [] }) {
  for (const t of ticks) if (t < min || t > max) throw new Error(`tick ${t} outside ${min}..${max}`);
  for (const r of rows) if (r.v !== undefined && r.v > max) throw new Error(`bar ${r.label} ${r.v} > max ${max}`);
  const body = rows.map((r) => r.group
    ? `<div class="hb-g">${r.group}</div>`
    : `<div class="hb-row"><span class="hb-l">${r.label}</span><span class="hb-track">${refs.map((f) => `<i class="hb-ref" style="left:${pct(f.v, max, min)}%" title="${esc(f.label)}"></i>`).join('')}<i class="hb-bar a-${r.arm || 'ink'}" style="width:${pct(r.v, max, min)}%" title="${esc(r.label.replace(/<[^>]+>/g, ''))}: ${esc(r.show ?? fmt(r.v))}${unit ? ' ' + unit : ''}"></i></span><span class="hb-v">${r.show ?? fmt(r.v)}${r.note ? `<small>${r.note}</small>` : ''}</span></div>`).join('');
  const axis = `<div class="hb-axis" aria-hidden="true"><span></span><span class="hb-ticks">${ticks.map((t) => `<b style="left:${pct(t, max, min)}%">${fmt(t)}</b>`).join('')}</span><span class="hb-unit">${unit}</span></div>`;
  return figure(`<div class="hb" role="img" aria-label="${esc(aria)}">${body}${axis}</div>${legend ? legendHtml(legend) : ''}`, caption);
}

// Runs as dots on one scale, with the min..max range drawn as a line, so overlap is visible.
// rows: {label, runs: [..], arm, show?} or {group}.
export function ranges({ max, min = 0, ticks, unit = '', rows, caption, aria, legend }) {
  for (const t of ticks) if (t < min || t > max) throw new Error(`tick ${t} outside ${min}..${max}`);
  const body = rows.map((r) => {
    if (r.group) return `<div class="hb-g">${r.group}</div>`;
    for (const v of r.runs) if (v > max || v < min) throw new Error(`run ${v} outside ${min}..${max} (${r.label})`);
    const lo = Math.min(...r.runs), hi = Math.max(...r.runs);
    const dots = r.runs.map((v) => `<i class="rg-dot a-${r.arm}" style="left:${pct(v, max, min)}%" title="${esc(r.label.replace(/<[^>]+>/g, ''))}: ${fmt(v)}${unit ? ' ' + unit : ''}"></i>`).join('');
    return `<div class="hb-row"><span class="hb-l">${r.label}</span><span class="hb-track rg"><i class="rg-span a-${r.arm}" style="left:${pct(lo, max, min)}%;width:${(pct(hi, max, min) - pct(lo, max, min)).toFixed(2)}%"></i>${dots}</span><span class="hb-v">${r.show ?? r.runs.map((v) => fmt(v)).join(', ')}${r.note ? `<small>${r.note}</small>` : ''}</span></div>`;
  }).join('');
  const axis = `<div class="hb-axis" aria-hidden="true"><span></span><span class="hb-ticks">${ticks.map((t) => `<b style="left:${pct(t, max, min)}%">${fmt(t)}</b>`).join('')}</span><span class="hb-unit">${unit}</span></div>`;
  return figure(`<div class="hb" role="img" aria-label="${esc(aria)}">${body}${axis}</div>${legend ? legendHtml(legend) : ''}`, caption);
}

export function legendHtml(items) {
  return `<div class="mx-legend">${items.map(([arm, text]) => `<span class="k a-${arm}">${text}</span>`).join('')}</div>`;
}

export const figure = (inner, caption) => `<figure class="mx-fig">${inner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;

// MathML shorthands, so formulas stay readable in the fragment files.
export const M = {
  block: (x) => `<math display="block">${x}</math>`,
  inl: (x) => `<math>${x}</math>`,
  row: (...x) => `<mrow>${x.join('')}</mrow>`,
  i: (x) => `<mi>${x}</mi>`,
  t: (x) => `<mtext>${x}</mtext>`,
  n: (x) => `<mn>${x}</mn>`,
  o: (x) => `<mo>${x}</mo>`,
  f: (a, b) => `<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`,
  sub: (a, b) => `<msub><mrow>${a}</mrow><mrow>${b}</mrow></msub>`,
  sup: (a, b) => `<msup><mrow>${a}</mrow><mrow>${b}</mrow></msup>`,
  sum: (lo, hi, x) => `<munderover><mo>∑</mo><mrow>${lo}</mrow><mrow>${hi}</mrow></munderover>${x}`,
  paren: (x) => `<mo>(</mo>${x}<mo>)</mo>`,
  ceil: (x) => `<mo>⌈</mo>${x}<mo>⌉</mo>`,
  floor: (x) => `<mo>⌊</mo>${x}<mo>⌋</mo>`,
  txt: (x) => `<mtext>${x}</mtext>`,
};

// 100 % stacked bars. rows: {label, parts: [{v, cls, name}], total?}; segment width = v / total.
export function stack({ rows, caption, aria, legend }) {
  const body = rows.map((r) => {
    const total = r.total ?? r.parts.reduce((s, p) => s + p.v, 0);
    const segs = r.parts.filter((p) => p.v > 0).map((p) => `<i class="sk-seg ${p.cls}" style="width:${((p.v / total) * 100).toFixed(3)}%" title="${esc(p.name)}: ${fmt(p.v)} of ${fmt(total)} (${((p.v / total) * 100).toFixed(1)} %)"></i>`).join('');
    return `<div class="hb-row"><span class="hb-l">${r.label}</span><span class="sk">${segs}</span><span class="hb-v">${r.show ?? ''}</span></div>`;
  }).join('');
  return figure(`<div class="hb" role="img" aria-label="${esc(aria)}">${body}</div>${legend ? legendHtml(legend) : ''}`, caption);
}

export const svg = (w, h, aria, inner) => `<div class="mx-scroll"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">${inner}</svg></div>`;

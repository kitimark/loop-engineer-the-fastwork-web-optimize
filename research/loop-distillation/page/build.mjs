// Markdown (the subset research/knowledge-distillation/README.md uses) -> one artifact page.
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const md = readFileSync(src, 'utf8').replace(/\r/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function inline(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s)<]+[^\s)<.,;:])/g, '$1<a href="$2">$2</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/\b(STATUS_)?(CONFIRMED|OBSERVED|REFUTED|UNRESOLVED|WEAKENED|UNPROVEN|FACT|ESTIMATE|INFERENCE)\b/g, (_, __, w) => `<span class="st st-${w.toLowerCase()}">${w}</span>`);
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}
const lines = md.split('\n');
let html = '', i = 0, title = '', intro = [];
const toc = [];
const lessons = [];
function list(start) {
  // returns [html, nextIndex]; nesting by indent (2 spaces per level)
  const stack = [];
  let h = '';
  let j = start;
  const open = (lvl) => { while (stack.length <= lvl) { h += '<ul>'; stack.push(true); } };
  const close = (lvl) => { while (stack.length > lvl + 1) { h += '</li></ul>'; stack.pop(); } };
  let first = true;
  while (j < lines.length) {
    const m = /^(\s*)- (.*)$/.exec(lines[j]);
    if (!m) break;
    const lvl = Math.floor(m[1].length / 2);
    let text = m[2];
    j++;
    while (j < lines.length && lines[j].trim() && !/^\s*- /.test(lines[j]) && /^\s+/.test(lines[j])) { text += ' ' + lines[j].trim(); j++; }
    if (first) { open(lvl); first = false; }
    else if (lvl + 1 > stack.length) { open(lvl); }
    else { close(lvl); h += '</li>'; }
    h += `<li>${inline(text)}`;
  }
  while (stack.length) { h += '</li></ul>'; stack.pop(); }
  return [h, j];
}
let sec = null;
while (i < lines.length) {
  const l = lines[i];
  if (!l.trim() || /^-{3,}$/.test(l.trim())) { i++; continue; }
  let m;
  if ((m = /^# (.*)$/.exec(l))) { title = m[1]; i++; continue; }
  if ((m = /^(##|###) (.*)$/.exec(l))) {
    const lvl = m[1].length, text = m[2], id = slug(text);
    if (lvl === 2) { if (sec) html += '</section>'; html += `<section id="${id}">`; sec = id; toc.push({ text, id, sub: [] }); }
    else toc[toc.length - 1]?.sub.push({ text, id });
    html += lvl === 2 ? `<h2>${inline(text)}</h2>` : `<h3 id="${id}">${inline(text)}</h3>`;
    i++; continue;
  }
  if (/^\|/.test(l)) {
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    html += `<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    continue;
  }
  if (/^\s*- /.test(l)) { const [h, j] = list(i); if (sec) html += h; else intro.push({ raw: h }); i = j; continue; }
  // paragraph
  let p = l.trim(); i++;
  while (i < lines.length && lines[i].trim() && !/^(#|\||\s*- |-{3,}$)/.test(lines[i])) { p += ' ' + lines[i].trim(); i++; }
  const lm = /^\*\*Lesson (\d+)\. (.*?)\*\*\s*(.*)$/.exec(p);
  if (lm) {
    lessons.push({ n: lm[1], t: lm[2], sec: toc[toc.length - 1]?.sub.at(-1)?.text || '' });
    html += `<h4 class="lesson" id="lesson-${lm[1]}"><span class="ln">${lm[1].padStart(2, '0')}</span><span>${inline(lm[2])}</span></h4>`;
    if (lm[3]) html += `<p>${inline(lm[3])}</p>`;
    continue;
  }
  if (!sec) { intro.push(inline(p)); continue; }
  html += `<p>${inline(p)}</p>`;
}
if (sec) html += '</section>';
const tocHtml = toc.map((s) => `<li><a href="#${s.id}">${esc(s.text)}</a>${s.sub.length ? `<ul>${s.sub.map((x) => `<li><a href="#${x.id}">${esc(x.text)}</a></li>`).join('')}</ul>` : ''}</li>`).join('');
const lessonIdx = lessons.map((x) => `<li><a href="#lesson-${x.n}"><span class="ln">${x.n.padStart(2, '0')}</span>${inline(x.t)}</a></li>`).join('');
// frame strip: 100 cells each, slow share from section 1 (20.1 % vs 1.7 %), very slow (10.1 % vs 0.22 %)
const strip = (slow, vslow) => Array.from({ length: 100 }, (_, k) => `<i class="${k < Math.round(vslow) ? 'v' : k < Math.round(slow) ? 's' : ''}"></i>`).join('');

// hero charts, drawn to scale from the document's own tables (section 2 timeline, section 6.2 rulebook table)
const COMMITS = [['1', 565], ['2', 281], ['3', 259], ['4', 385], ['5', 455], ['6', 240], ['7', 79], ['8', 79], ['9', 75], ['10', 13], ['11', 47], ['12', 5]];
function barsSvg(data, max, ticks, cls, labelFn) {
  const W = 300, H = 150, L = 30, B = 22, T = 14, cw = (W - L - 4) / data.length, sy = (v) => H - B - (v / max) * (H - B - T);
  let g = ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - 2}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}"/><text x="${L - 4}" y="${(sy(t) + 3).toFixed(1)}" text-anchor="end">${t.toLocaleString('en-US')}</text>`).join('');
  data.forEach(([lab, v], k) => {
    const x = L + k * cw + cw * 0.15, w = cw * 0.7, y = sy(v);
    g += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y).toFixed(1)}" rx="1"/>`;
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - B + 12}" text-anchor="middle">${lab}</text>`;
    if (labelFn(k, v)) g += `<text class="v" x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle">${v.toLocaleString('en-US')}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${data.map(([l, v]) => `${l}: ${v}`).join(', ')}">${g}<text x="${W - 2}" y="${H - 1}" text-anchor="end">Oct</text></svg>`;
}
const chartCommits = barsSvg(COMMITS, 600, [0, 200, 400, 600], 'b1', (k, v) => [0, 4, 9, 11].includes(k));
const WORDS = [['first', 1289], ['1 Oct', 6310], ['2 Oct', 7348], ['4 Oct', 8328], ['5 Oct+', 9450]];
const chartWords = barsSvg(WORDS, 10000, [0, 5000, 10000], 'b2', () => true).replace('>Oct</text>', '></text>');

const tpl = readFileSync(new URL('./page.html', import.meta.url), 'utf8');
writeFileSync(out, tpl
  .replace('{{TITLE}}', inline(title))
  .replace('{{INTRO}}', intro.map((p) => (p.raw ? p.raw : `<p>${p}</p>`)).join(''))
  .replace('{{CHART_COMMITS}}', chartCommits).replace('{{CHART_WORDS}}', chartWords).replace('{{TOC}}', tocHtml).replace('{{BODY}}', html));
console.log(`ok ${out}: ${0} lessons, ${toc.length} sections, ${html.length} chars`);

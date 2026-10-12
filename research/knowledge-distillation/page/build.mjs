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
  t = t.replace(/\b(lesson) (\d{1,2})\b(?![\d-])/gi, (m, w, n) => (+n >= 1 && +n <= 30 ? `<a class="lref" href="#lesson-${n}">${w} ${n}</a>` : m));
  t = t.replace(/\b(STATUS_)?(CONFIRMED|OBSERVED|REFUTED|UNRESOLVED|WEAKENED|UNPROVEN)\b/g, (_, __, w) => `<span class="st st-${w.toLowerCase()}">${w}</span>`);
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
  if (!l.trim()) { i++; continue; }
  let m;
  if ((m = /^# (.*)$/.exec(l))) { title = m[1]; i++; continue; }
  if ((m = /^(##|###) (.*)$/.exec(l))) {
    const lvl = m[1].length, text = m[2], id = slug(text);
    if (lvl === 2) { if (sec) html += '</section>'; html += `<section id="${id}">`; sec = id; toc.push({ text, id, sub: [] }); }
    else toc[toc.length - 1]?.sub.push({ text, id });
    html += `<h${lvl} id="${id}">${inline(text)}</h${lvl}>`;
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
  if (/^\s*- /.test(l)) { const [h, j] = list(i); html += h; i = j; continue; }
  // paragraph
  let p = l.trim(); i++;
  while (i < lines.length && lines[i].trim() && !/^(#|\||\s*- )/.test(lines[i])) { p += ' ' + lines[i].trim(); i++; }
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
const tocHtml = toc.map((s) => `<li><a href="#${s.id}">${esc(s.text)}</a>${s.sub.length && s.id.startsWith('3') ? `<ul>${s.sub.map((x) => `<li><a href="#${x.id}">${esc(x.text)}</a></li>`).join('')}</ul>` : ''}</li>`).join('');
const lessonIdx = lessons.map((x) => `<li><a href="#lesson-${x.n}"><span class="ln">${x.n.padStart(2, '0')}</span>${inline(x.t)}</a></li>`).join('');
// frame strip: 100 cells each, slow share from section 1 (20.1 % vs 1.7 %), very slow (10.1 % vs 0.22 %)
const strip = (slow, vslow) => Array.from({ length: 100 }, (_, k) => `<i class="${k < Math.round(vslow) ? 'v' : k < Math.round(slow) ? 's' : ''}"></i>`).join('');
const tpl = readFileSync(new URL('./page.html', import.meta.url), 'utf8');
writeFileSync(out, tpl
  .replace('{{TITLE}}', inline(title))
  .replace('{{INTRO}}', intro.map((p) => `<p>${p}</p>`).join(''))
  .replace('{{STRIP_A}}', strip(20.1, 10.1)).replace('{{STRIP_B}}', strip(1.7, 0.22))
  .replace('{{TOC}}', tocHtml).replace('{{LESSONS}}', lessonIdx).replace('{{BODY}}', html));
console.log(`ok ${out}: ${lessons.length} lessons, ${toc.length} sections, ${html.length} chars`);

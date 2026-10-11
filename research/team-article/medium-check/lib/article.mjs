// article.mjs: the article page (the "Medium layout preview", research/team-article/artifacts/sixteen-milliseconds/)
// -> the canonical article model: the blocks a reader sees on Medium, in order, with normalized text.
//
// The walk follows the kit builder's in-page walker (kit/build.mjs), block for block, so the model, story.md and
// the Medium post all count the same things:
//   h1 -> title, p.subtitle -> subtitle, p.preview -> skipped (editor-only), p -> p, h3 -> big heading (level 1),
//   h4 -> small heading (level 2), ul/ol -> one li block per item, blockquote -> one quote block per paragraph
//   (pull: true for blockquote.pull), hr -> separator, aside.teambox -> quote blocks (paragraphs, then items
//   prefixed with a bullet, as the kit pastes them), footer -> walked like main, figure.cap -> picture (the
//   .cap-area is the picture, figcaption or the p.note right after it is the caption), figure.cap + the following
//   p.mlink -> clip (a drawn figure, e.g. the Fig. 2 canvas, that Medium shows as a recording: caption from its
//   figcaption, description from the drawing's aria-label, clip name from the clip table by Stream uid),
//   figure.gif with <img> -> picture, figure.gif with <video> + the following p.mlink -> clip (Cloudflare Stream link).
// Pictures are numbered 01.. and clips 01.. in page order, like the kit; picture files are NN-<figure id>.png
// (captured) or NN-<img file name> (copied).
//
// Alt text: the kit builder decides it in Chrome (a rule that needs layout, see kit/build.mjs altOf). This file
// applies the same rule without layout ("static"); the one branch that needs layout (only small inline labels ->
// visible text) falls back to the area's text. Pass the kit (kit.json or alt.txt) to use the kit's alt text, which
// is what the owner pastes into Medium. A picture listed in kit/alt-medium.json (lib/alt.mjs) takes that short alt,
// with or without a kit, like the kit itself; a kit whose alt for it differs is stale.
//
// Sources mode (lib/sources.mjs, opts.sources): the Medium version may leave out the Sources section and its
// references ("none") or link them to GitHub ("github"). The same transform runs here on the parsed page and in the
// kit builder on Chrome's DOM, before each walk, so the model and the kit agree. Without opts.sources (or with
// "artifact") nothing changes: the model of the page as it is.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseHTML, find, findAll, hasClass, closest, isTag } from './html.mjs';
import { norm } from './text.mjs';
import { applyAltMedium, ALT_FILE } from './alt.mjs';
import { applySourcesDom, sourcesConfig, sourceResidue, kitMode, modeLabel } from './sources.mjs';

export const SCHEMA = 'fw-article-model/1';
const ws = (s) => String(s ?? '').replace(/\s+/g, ' ');
const pad = (n) => String(n).padStart(2, '0');
const BULLET = String.fromCharCode(0x2022);

// ---- inline content: text, links, whole-block italics ----------------------------------------------------------------
// text: textContent minus nested lists (an li's sub-list is its own blocks); links: external hrefs in order
export function inline(el) {
  let text = '';
  const links = [];
  let italic = 0, plain = 0;
  (function rec(n, em) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { text += c.data; if (c.data.trim()) (em ? italic++ : plain++); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.localName;
      if (tag === 'ul' || tag === 'ol' || tag === 'script' || tag === 'style') continue;
      if (tag === 'br') { text += ' '; continue; }
      if (tag === 'a') { const h = c.getAttribute('href') || ''; if (/^https?:/i.test(h)) links.push(h); }
      rec(c, em || tag === 'em' || tag === 'i');
    }
  })(el, false);
  return { text: norm(text), links, em: italic > 0 && plain === 0 };
}

export function parseStreamUrl(u) {
  if (!u) return null;
  let url;
  try { url = new URL(u); } catch { return null; }
  const m = /(?:^|\/)([0-9a-f]{32})(?:\/|$)/i.exec(url.pathname);
  if (!m) return null;
  const params = {};
  for (const k of ['loop', 'autoplay', 'muted', 'controls', 'preload', 'poster']) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
  return { uid: m[1].toLowerCase(), host: url.host, params };
}

// ---- Medium embed lines (p.mlink: "Medium embed <code>stream link</code>") ------------------------------------------
const isMlink = (e) => !!e && e.localName === 'p' && hasClass(e, 'mlink');
const mlinkUrl = (p) => ws((find(p, isTag('code')) || p).textContent).trim();

// a figure.cap shown as a clip: its description is the drawing's own label (the canvas or svg aria-label), else the
// static alt rule
function capDescription(fig) {
  const area = find(fig, (e) => hasClass(e, 'cap-area'));
  const d = area && find(area, (x) => x.hasAttribute('aria-label') && !closest(x, (y) => y.getAttribute('aria-hidden') === 'true'));
  return d ? norm(d.getAttribute('aria-label')) : altStatic(fig).alt;
}

// ---- alt text, static form of the kit's rule -----------------------------------------------------------------------
function altStatic(fig) {
  const area = find(fig, (e) => hasClass(e, 'cap-area'));
  const labels = [];
  if (area && area.getAttribute('aria-label')) labels.push(area.getAttribute('aria-label'));
  if (area) for (const e of findAll(area, (x) => x.hasAttribute('aria-label'))) {
    if (closest(e, (x) => x.getAttribute('aria-hidden') === 'true')) continue;
    labels.push(e.getAttribute('aria-label'));
  }
  // the kit uses the visible text when every label belongs to a small inline element (needs layout): labels on
  // svg/canvas/img are whole drawings, labels on anything else are taken as small inline labels here
  const drawing = (e) => ['svg', 'canvas', 'img', 'figure', 'div'].includes(e.localName);
  const labelled = area ? findAll(area, (x) => x.hasAttribute('aria-label') && !closest(x, (y) => y.getAttribute('aria-hidden') === 'true')) : [];
  const small = labelled.length > 0 && labelled.some((e) => !drawing(e));
  // several labels: the kit may have judged some of them small (layout) and used the visible text instead
  if (labels.length && !small) return { alt: norm(labels.map(ws).join(' / ')), altFrom: 'aria-label' + (labels.length > 1 ? ' x' + labels.length + ' (static approximation; the kit decides in Chrome)' : '') };
  if (small) return { alt: norm(area.textContent), altFrom: 'visible text (static approximation; the kit decides in Chrome)' };
  const nx = fig.nextElementSibling;
  if (nx && nx.localName === 'p' && hasClass(nx, 'note')) return { alt: norm(nx.textContent), altFrom: 'p.note after figure' };
  const t = area && find(area, (e) => hasClass(e, 'cap-title')), s = area && find(area, (e) => hasClass(e, 'cap-sub'));
  if (t) return { alt: norm(t.textContent + (s ? '. ' + s.textContent : '')), altFrom: 'cap-title + cap-sub' };
  const fc = find(fig, isTag('figcaption'));
  return { alt: fc ? norm(fc.textContent) : '', altFrom: 'figcaption' };
}

// ---- the walk ------------------------------------------------------------------------------------------------------
export function extractArticle(html, opts = {}) {
  const doc = parseHTML(html);
  const main = find(doc, isTag('main')) || doc.body || doc;
  const model = { schema: SCHEMA, source: opts.source || null, title: null, subtitle: null, byline: null, disclaimer: [], blocks: [], warnings: [] };
  const B = model.blocks;
  // the sources mode: a config from sourcesConfig(), or a mode name; none given = artifact (the page as it is)
  const scfg = typeof opts.sources === 'string' ? sourcesConfig({ mode: opts.sources }) : (opts.sources || null);
  if (scfg && (scfg.mode === 'none' || scfg.mode === 'github')) {
    const r = applySourcesDom(main, scfg);
    model.sources = { mode: scfg.mode, label: modeLabel(scfg), footer: r.footer, removed: r.removed, linked: r.linked, changed: r.blocks, inPicture: r.inPicture, unhandled: r.unhandled, unmapped: [...new Set(r.unmapped)] };
    if (scfg.mode === 'none' && r.footer !== 'removed') model.warnings.push(`sources: the Sources section was ${r.footer}`);
    for (const u of r.unhandled) model.warnings.push(`sources: a reference to ${u.src || 'a source'} not removed (no known pattern): "${u.context.slice(0, 120)}"`);
    for (const id of model.sources.unmapped) model.warnings.push(`sources: no repo path for ${id} in the mapping file: that reference is removed`);
    for (const p of r.inPicture) model.warnings.push(`sources: "${p.text}" (${p.src}) is drawn inside picture #${p.figure}; pictures do not change with the mode, so it stays in the picture`);
  }
  const consumed = new Set();
  let pn = 0, cn = 0;
  const push = (b) => { B.push(b); return b; };

  const walk = (container) => {
    for (const el of container.children) {
      if (consumed.has(el)) continue;
      const tag = el.localName;
      if (tag === 'script' || tag === 'style') continue;
      if (tag === 'p' && hasClass(el, 'preview')) continue;
      if (tag === 'p' && hasClass(el, 'mlink')) { model.warnings.push('a Medium embed line (p.mlink) without a clip figure before it'); continue; }
      if (tag === 'h1') { model.title = inline(el).text; continue; }
      if (tag === 'p' && hasClass(el, 'subtitle')) { model.subtitle = inline(el).text; continue; }
      if (tag === 'p') {
        const r = inline(el);
        const b = push({ kind: 'p', text: r.text, em: r.em, links: r.links });
        if (hasClass(el, 'byline')) b.role = 'byline';
        if (hasClass(el, 'note')) b.role = 'note';
        continue;
      }
      if (tag === 'h3' || tag === 'h4') { const r = inline(el); push({ kind: 'heading', level: tag === 'h3' ? 1 : 2, text: r.text, links: r.links, anchor: el.getAttribute('id') || null }); continue; }
      if (tag === 'ul' || tag === 'ol') { list(el); continue; }
      if (tag === 'blockquote') {
        const pull = hasClass(el, 'pull');
        const ps = el.children.filter((c) => c.localName === 'p');
        for (const p of ps.length ? ps : [el]) { const r = inline(p); push({ kind: 'quote', pull, text: r.text, links: r.links }); }
        continue;
      }
      if (tag === 'hr') { push({ kind: 'hr', text: '' }); continue; }
      if (tag === 'aside' && hasClass(el, 'teambox')) {
        for (const c of el.children) {
          if (c.localName === 'p') { const r = inline(c); push({ kind: 'quote', pull: false, text: r.text, links: r.links, role: 'teambox' }); }
          else if (c.localName === 'ul' || c.localName === 'ol') for (const li of c.children.filter((x) => x.localName === 'li')) { const r = inline(li); push({ kind: 'quote', pull: false, text: norm(BULLET + ' ' + r.text), links: r.links, role: 'teambox' }); }
          else model.warnings.push('teambox child ' + c.localName + ' not read');
        }
        continue;
      }
      if (tag === 'footer' || tag === 'section' || tag === 'div' && !el.getAttribute('class')) { walk(el); continue; }
      if (tag === 'figure' && hasClass(el, 'cap') && isMlink(el.nextElementSibling)) {
        // a drawn figure with a Medium embed line after it: on Medium it is that clip (a recording of the drawing),
        // not a picture; the clip's name comes from the clip table by its Stream uid (applyClipTable)
        const nx = el.nextElementSibling;
        consumed.add(nx);
        const fc = find(el, isTag('figcaption'));
        const cap = fc ? inline(fc) : { text: '', links: [] };
        if (!fc) model.warnings.push('no caption for clip figure ' + el.getAttribute('id'));
        const n = pad(++cn), url = mlinkUrl(nx), s = parseStreamUrl(url);
        push({ kind: 'clip', n, from: 'figure.cap', id: el.getAttribute('id') || null, clip: null, video: null, url, uid: s ? s.uid : null,
          params: s ? s.params : {}, caption: cap.text, links: cap.links, aria: capDescription(el) });
        continue;
      }
      if (tag === 'figure' && hasClass(el, 'cap')) {
        const fc = find(el, isTag('figcaption'));
        let cap = fc ? inline(fc) : null, capFrom = 'figcaption';
        const nx = el.nextElementSibling;
        if (!cap && nx && nx.localName === 'p' && hasClass(nx, 'note')) { cap = inline(nx); consumed.add(nx); capFrom = 'p.note after figure'; }
        if (!cap) model.warnings.push('no caption for figure ' + el.getAttribute('id'));
        const n = pad(++pn), id = el.getAttribute('id') || `figure-${n}`;
        const area = find(el, (e) => hasClass(e, 'cap-area'));
        push({ kind: 'picture', n, id, file: `${n}-${id}.png`, source: 'capture', caption: cap ? cap.text : '', captionFrom: capFrom,
          links: cap ? cap.links : [], ...altStatic(el), areaHtml: area ? area.innerHTML : '' });
        continue;
      }
      if (tag === 'figure' && hasClass(el, 'gif')) {
        const fc = find(el, isTag('figcaption'));
        const cap = fc ? inline(fc) : { text: '', links: [] };
        const img = find(el, isTag('img')), vid = find(el, isTag('video'));
        if (img) {
          const n = pad(++pn), src = img.getAttribute('src') || '';
          push({ kind: 'picture', n, id: basename(src), file: `${n}-${basename(src)}`, source: 'copy', src, caption: cap.text, captionFrom: 'figcaption',
            links: cap.links, alt: norm(img.getAttribute('alt') || ''), altFrom: 'img alt', width: img.getAttribute('width'), height: img.getAttribute('height') });
        } else if (vid) {
          const n = pad(++cn), nx = el.nextElementSibling;
          let url = null;
          if (isMlink(nx)) { url = mlinkUrl(nx); consumed.add(nx); }
          else model.warnings.push(`clip ${n} has no Medium embed line (p.mlink) after it`);
          const s = parseStreamUrl(url);
          const src = vid.getAttribute('src') || '';
          push({ kind: 'clip', n, from: 'figure.gif', clip: basename(src).replace(/\.[a-z0-9]+$/i, ''), video: basename(src), url, uid: s ? s.uid : null, params: s ? s.params : {}, caption: cap.text, links: cap.links,
            aria: norm(vid.getAttribute('aria-label') || '') });
        } else model.warnings.push('figure.gif without img or video');
        continue;
      }
      if (tag === 'figure') { model.warnings.push('figure without class cap/gif not read'); continue; }
      model.warnings.push(`unhandled <${tag}${el.getAttribute('class') ? '.' + el.getAttribute('class') : ''}> read as a paragraph`);
      const r = inline(el);
      push({ kind: 'p', text: r.text, em: r.em, links: r.links, role: 'unhandled' });
    }
  };
  const list = (el) => {
    for (const li of el.children.filter((c) => c.localName === 'li')) {
      const r = inline(li);
      push({ kind: 'li', list: el.localName, text: r.text, links: r.links });
      for (const sub of li.children.filter((c) => c.localName === 'ul' || c.localName === 'ol')) list(sub);
    }
  };
  walk(main);

  // byline and disclaimer: the byline paragraph, then the whole-italic paragraphs right after it
  const bi = B.findIndex((b) => b.role === 'byline');
  if (bi >= 0) {
    model.byline = B[bi].text;
    for (let i = bi + 1; i < B.length && B[i].kind === 'p' && B[i].em; i++) { B[i].role = 'disclaimer'; model.disclaimer.push(B[i].text); }
  }
  B.forEach((b, i) => { b.i = i; });
  addSections(model);
  // Medium's short alt (kit/alt-medium.json) replaces a too-long page alt, as in the kit; altMedium: false turns it off
  applyAltMedium(B.filter((b) => b.kind === 'picture'), opts.altMedium === undefined ? ALT_FILE : opts.altMedium);
  for (const p of B.filter((b) => b.kind === 'picture' && b.altFrom === 'kit/alt-medium.json')) p.alt = norm(p.alt);
  // mode none: nothing that reads as a reference to the Sources section may be left in the text Medium gets
  if (model.sources && model.sources.mode === 'none') {
    for (const b of B) for (const [what, t] of [['text', b.text], ['caption', b.caption], ['alt', b.alt]]) {
      for (const hit of sourceResidue(t)) model.warnings.push(`sources: ${label(b)} ${what} still reads as a source reference: "${norm(hit)}"`);
    }
  }
  if (opts.kit) applyKit(model, opts.kit);
  if (opts.clips) applyClipTable(model, opts.clips);
  return model;
}

// section label for each block: the last big heading before it, and the block's number among its kind in that section
export function addSections(model) {
  let sec = '(top)', counts = {};
  for (const b of model.blocks) {
    if (b.kind === 'heading' && b.level === 1) { sec = b.text; counts = {}; b.section = sec; continue; }
    const k = b.kind === 'li' ? 'list item' : b.kind === 'p' ? 'paragraph' : b.kind;
    counts[k] = (counts[k] || 0) + 1;
    b.section = sec;
    b.nth = counts[k];
  }
  return model;
}

// ---- the kit: alt text and file names the owner pastes ---------------------------------------------------------------
// kit dir with kit.json (written by kit/build.mjs) or alt.txt (NN <tab> file <tab> alt). Marks the model with
// kit: {dir, from, stale: [...]}; a picture whose number and file match takes the kit's alt.
export function loadKit(dir) {
  if (!dir || !existsSync(dir)) return null;
  const kj = join(dir, 'kit.json');
  if (existsSync(kj)) {
    const k = JSON.parse(readFileSync(kj, 'utf8'));
    const pics = (k.blocks || []).filter((b) => b.t === 'picture').map((b) => ({ n: b.n, file: b.file, alt: b.alt, caption: b.cap ? b.cap.text : '' }));
    const clips = (k.blocks || []).filter((b) => b.t === 'clip').map((b) => ({ n: b.n, url: b.url, caption: b.cap ? b.cap.text : '' }));
    return { dir, from: 'kit.json', pics, clips, builtFrom: k.page || null, builtAt: k.builtAt || null, sources: kitMode(k), sourcesBase: (k.sources && k.sources.base) || null };
  }
  const at = join(dir, 'alt.txt');
  if (existsSync(at)) {
    const pics = readFileSync(at, 'utf8').split('\n').filter(Boolean).map((l) => { const [n, file, ...rest] = l.split('\t'); return { n, file, alt: rest.join('\t') }; });
    return { dir, from: 'alt.txt', pics, clips: null };
  }
  return null;
}

export function applyKit(model, kit) {
  const k = typeof kit === 'string' ? loadKit(kit) : kit;
  if (!k) { model.kit = null; return model; }
  const pics = model.blocks.filter((b) => b.kind === 'picture');
  const byN = new Map(k.pics.map((p) => [p.n, p]));
  const stale = [];
  for (const p of pics) {
    const kp = byN.get(p.n);
    if (!kp) { stale.push(`picture ${p.n} (${p.file}) is not in the kit`); continue; }
    if (kp.file !== p.file) { stale.push(`picture ${p.n}: the kit has ${kp.file}, the article ${p.file}`); continue; }
    if (kp.caption !== undefined && kp.caption !== '' && norm(kp.caption) !== p.caption) stale.push(`picture ${p.n} (${p.file}): the kit's caption differs from the article's`);
    if (p.altFrom === 'kit/alt-medium.json') {
      // the short Medium alt is the reference; a kit that still has another alt was built before it changed
      if (norm(kp.alt) !== p.alt) stale.push(`picture ${p.n} (${p.file}): the kit's alt text is not the one in kit/alt-medium.json`);
      continue;
    }
    p.altStatic = p.alt;
    p.alt = norm(kp.alt);
    p.altFrom = 'kit ' + k.from;
  }
  if (k.pics.length > pics.length) stale.push(`the kit has ${k.pics.length} pictures, the article ${pics.length}`);
  if (k.clips) {
    const clips = model.blocks.filter((b) => b.kind === 'clip');
    if (k.clips.length !== clips.length) stale.push(`the kit has ${k.clips.length} clips, the article ${clips.length}`);
    clips.forEach((c, i) => { if (k.clips[i] && k.clips[i].url !== c.url) stale.push(`clip ${c.n}: the kit's Stream link differs from the article's`); });
  }
  model.kit = { dir: k.dir, from: k.from, stale };
  // the kit's sources mode (kit.json "sources"; none recorded = artifact) against the model's: a warning, the
  // captions and texts that differ because of it show up as stale or as differences anyway
  if (k.sources) {
    const want = model.sources ? model.sources.mode : 'artifact';
    model.kit.sources = k.sources;
    if (k.sources !== want) model.warnings.push(`sources: the kit was built in sources mode ${k.sources}, this run uses ${want} (rebuild the kit with --sources ${want}, or pass --sources ${k.sources})`);
    else if (want === 'github' && model.sources.label !== `github (${k.sourcesBase})`) model.warnings.push(`sources: the kit links sources to ${k.sourcesBase}, this run to ${model.sources.label}`);
  }
  return model;
}

// ---- the clip table (research/article-clips/cf-stream-links.tsv): video file -> Stream uid ------------------------------
export function loadClipTable(file) {
  if (!file || !existsSync(file)) return null;
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  const head = rows.shift() || [];
  const ix = (n) => head.indexOf(n);
  return rows.map((r) => ({ clip: r[ix('clip')], uid: r[ix('uid')], medium: r[ix('medium')], ready: r[ix('ready')] }));
}

export function applyClipTable(model, table) {
  const t = typeof table === 'string' ? loadClipTable(table) : table;
  if (!t) return model;
  const byClip = new Map(t.map((r) => [r.clip, r]));
  for (const c of model.blocks.filter((b) => b.kind === 'clip')) {
    if (c.from === 'figure.cap') {
      // no video file on the page: the clip is the table row with the embed line's Stream uid
      const row = clipRowByUid(t, c.uid);
      if (!row) { model.warnings.push(`clip ${c.n} (#${c.id}): Stream uid ${c.uid} is not in the clip table`); continue; }
      c.clip = row.clip;
      if (row.ready && row.ready !== 'true') model.warnings.push(`clip ${c.n} (${c.clip}): the clip table says ready=${row.ready}`);
      continue;
    }
    const row = byClip.get(String(c.video).replace(/\.[a-z0-9]+$/i, ''));
    if (!row) { model.warnings.push(`clip ${c.n} (${c.video}) is not in the clip table`); continue; }
    if (row.uid !== c.uid) model.warnings.push(`clip ${c.n} (${c.video}): the article links uid ${c.uid}, the clip table has ${row.uid}`);
    if (row.ready && row.ready !== 'true') model.warnings.push(`clip ${c.n} (${c.video}): the clip table says ready=${row.ready}`);
  }
  return model;
}

// the clip table row for a Stream uid (or a Stream link); null when none or more than one row has it
export function clipRowByUid(table, uidOrUrl) {
  const t = typeof table === 'string' ? loadClipTable(table) : table;
  if (!t || !uidOrUrl) return null;
  const uid = /^[0-9a-f]{32}$/i.test(uidOrUrl) ? uidOrUrl.toLowerCase() : parseStreamUrl(uidOrUrl)?.uid;
  const rows = t.filter((r) => String(r.uid || '').toLowerCase() === uid);
  return rows.length === 1 ? rows[0] : null;
}

export function extractArticleFile(file, opts = {}) {
  return extractArticle(readFileSync(file, 'utf8'), { ...opts, source: opts.source || file });
}

// a short one-line label for a block, for reports
export function label(b) {
  if (!b) return '(none)';
  if (b.kind === 'picture') return `Picture ${b.n} (${b.file})`;
  if (b.kind === 'clip') { const name = b.video || b.clip || (b.id ? '#' + b.id : ''); return `Clip ${b.n}${name ? ' (' + name + ')' : ''}`; }
  if (b.kind === 'heading') return `${b.level === 1 ? 'Heading' : 'Subheading'} "${b.text.slice(0, 50)}"`;
  const k = b.kind === 'li' ? 'list item' : b.kind === 'p' ? 'paragraph' : b.kind === 'quote' ? (b.pull ? 'pull quote' : 'quote') : b.kind === 'hr' ? 'separator' : b.kind;
  return `${b.section && b.section !== '(top)' ? b.section.replace(/:.*$/, '') + ', ' : ''}${k}${b.nth ? ' ' + b.nth : ''}`;
}

#!/usr/bin/env node
// kit/build.mjs: build the Medium kit from the article page (headless Chrome, read-only on the page).
//
// Writes into the kit folder: story.md and story.html (the text to paste, with [PICTURE NN · file] and
// [CLIP NN · ...] marker lines and "Caption: ..." lines), NN-<id>.png pictures (each figure's .cap-area at a
// 1400 px wide viewport, DPR 2, so 2,400 px wide for the 1,200 px figures), the copied pictures (figure.gif <img>),
// alt.txt (NN <tab> file <tab> alt), kit.json (every block, as the in-page walker read it), CHECKLIST.md and
// contact-sheet.html. A figure.cap followed by a p.mlink (Medium embed line) is a clip, not a picture: on Medium the
// drawing is shown as its Stream recording (named from research/article-clips/cf-stream-links.tsv by its uid).
// The walker runs in the page because the alt rule needs layout (see altOf below). The alt text
// for Medium is the page's, except where kit/alt-medium.json has a short one (lib/alt.mjs; the page's stays in
// altPage); the build never cuts an alt and refuses (exit 1, nothing written) when one is over 500 characters.
//
// Run it only inside a chrome-measure hold that times nothing (CLAUDE.md, Hard rule 7), in the background:
//   node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- \
//     node research/team-article/medium-check/kit/build.mjs [options]
// Options:
//   --page <html>     the article page (default research/team-article/artifacts/sixteen-milliseconds/index.html)
//   --out <dir>       the kit folder (default out/article/medium-kit in this checkout)
//   --gifs <dir>      where the figure.gif pictures are (default: next to the page, else out/article-gifs of this
//                     checkout, else of the main checkout)
//   --only <list>     capture only these pictures (numbers like 05,13 or figure ids like fig-4); the text files and
//                     kit.json are always rewritten whole
//   --text-only       capture no pictures (text files and kit.json only)
//   --sources <mode>  the Medium sources mode (lib/sources.mjs), written into kit.json: none (default: the kit leaves
//                     out the Sources section and every source reference), github (--github-base <url>, optional
//                     --sources-map <json>: references link to GitHub), github-inline (the same links, the Sources
//                     list left out), artifact (the page as it is). The transform is
//                     the one lib/article.mjs uses, run on the page's DOM before the walker; it never touches a
//                     .cap-area, so the pictures are the same in every mode.
// Needs a checkout of the study repo: Chrome comes from tools/lib/cdp.mjs (launchChrome). Fonts load from Google
// Fonts like the page itself does; nothing else goes over the network.
import { writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, helpIfAsked, UsageError, REPO, DEFAULT_ARTICLE, DEFAULT_CLIPS, mainCheckout, SOURCES_SPEC, sourcesFromArgs } from '../lib/cli.mjs';
import { applySourcesDom, kitRecord } from '../lib/sources.mjs';
import { render } from './render.mjs';
import { applyAltMedium, altProblems } from '../lib/alt.mjs';
import { loadClipTable, clipRowByUid } from '../lib/article.mjs';

const argv = process.argv.slice(2);
helpIfAsked(import.meta.url, argv);
let o, SOURCES;
try {
  o = parseArgs(argv, { page: 'v', out: 'v', gifs: 'v', only: 'v', 'text-only': 'bool', ...SOURCES_SPEC });
  SOURCES = sourcesFromArgs(o);
} catch (e) { console.error(`usage: ${e.message} (see --help)`); process.exit(2); }
const PAGE = resolve(o.page || DEFAULT_ARTICLE);
const KIT = resolve(o.out || join(REPO, 'out', 'article', 'medium-kit'));
const WORK = join(KIT, 'work');
const GIF_DIRS = (o.gifs ? [resolve(o.gifs)] : [join(REPO, 'out', 'article-gifs'), join(mainCheckout(), 'out', 'article-gifs')]);
const ONLY = o.only ? new Set(o.only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
if (!existsSync(PAGE)) { console.error(`usage: page not found: ${PAGE}`); process.exit(2); }
if (!/^chrome-measure:/.test(process.env.FW_LOCK_HELD || '')) {
  console.error('refused: run me inside `node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- ...` (headless Chrome is CPU work, Hard rule 7)');
  process.exit(2);
}
const { launchChrome, CDP, sleep } = await import(pathToFileURL(join(REPO, 'tools', 'lib', 'cdp.mjs')).href);
mkdirSync(WORK, { recursive: true });

// --- in-page walker: returns blocks in page order (lib/article.mjs follows the same rules without layout) ---------
const WALKER = String.raw`(() => {
  const main = document.querySelector('main');
  const ws = (s) => s.replace(/\s+/g, ' ');
  const esc = (s) => s.replace(/([*_\x60\\])/g, '\\$1');
  function inl(node, mode) { // mode 'md' or 'html'
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { const t = ws(n.nodeValue); out += mode === 'md' ? esc(t) : t.replace(/&/g,'&amp;').replace(/</g,'&lt;'); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') continue;
      const inner = inl(n, mode);
      const wrap = (a, b) => { const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + a + m[2] + b + m[3] : inner; };
      if (tag === 'strong' || tag === 'b') out += mode === 'md' ? wrap('**', '**') : wrap('<strong>', '</strong>');
      else if (tag === 'em' || tag === 'i') out += mode === 'md' ? wrap('*', '*') : wrap('<em>', '</em>');
      else if (tag === 'code') out += mode === 'md' ? wrap('\x60', '\x60').replace(/\\([*_\\])/g, '$1') : wrap('<code>', '</code>');
      else if (tag === 'a') {
        const href = n.getAttribute('href') || '';
        if (!href || href.startsWith('#')) out += inner;
        else out += mode === 'md' ? wrap('[', '](' + href + ')') : wrap('<a href="' + href.replace(/"/g,'&quot;') + '">', '</a>');
      } else if (tag === 'br') out += mode === 'md' ? '  \n' : '<br>';
      else out += inner;
    }
    return out;
  }
  const both = (el) => ({ md: inl(el, 'md').trim(), html: inl(el, 'html').trim(), text: ws(el.textContent).trim() });
  function list(el) { return [...el.children].filter((c) => c.tagName === 'LI').map((li) => ({ ...both(li), value: li.getAttribute('value') })); }
  function altOf(fig) {
    const area = fig.querySelector('.cap-area');
    const labels = [];
    if (area && area.getAttribute('aria-label')) labels.push(area.getAttribute('aria-label'));
    if (area) for (const e of area.querySelectorAll('[aria-label]')) {
      if (e.closest('[aria-hidden="true"]')) continue;
      labels.push(e.getAttribute('aria-label'));
    }
    const aw = area ? area.getBoundingClientRect().width : 0;
    const small = area ? [...area.querySelectorAll('[aria-label]')].some((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width < 0.5 * aw) : false;
    if (labels.length && !small) return { alt: labels.map(ws).join(' / '), altFrom: 'aria-label' + (labels.length > 1 ? ' x' + labels.length : '') };
    if (small) return { alt: ws(area.innerText).trim(), altFrom: 'visible text (only small inline labels)' };
    const nx = fig.nextElementSibling;
    if (nx && nx.matches('p.note')) return { alt: ws(nx.textContent).trim(), altFrom: 'p.note after figure' };
    const t = area && area.querySelector('.cap-title'), s = area && area.querySelector('.cap-sub');
    if (t) return { alt: ws((t.textContent || '') + (s ? '. ' + s.textContent : '')).trim(), altFrom: 'cap-title + cap-sub' };
    const fc = fig.querySelector('figcaption');
    return { alt: fc ? ws(fc.textContent).trim() : '', altFrom: 'figcaption' };
  }
  const blocks = [], warn = [];
  const consumed = new Set();
  function walk(container) {
    for (const el of container.children) {
      if (consumed.has(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') continue;
      if (el.matches('p.preview')) continue;
      if (el.matches('p.mlink')) { warn.push('orphan mlink'); continue; }
      if (tag === 'h1') blocks.push({ t: 'h1', ...both(el) });
      else if (el.matches('p.subtitle')) blocks.push({ t: 'subtitle', ...both(el) });
      else if (tag === 'p') blocks.push({ t: 'p', cls: el.className || '', ...both(el) });
      else if (tag === 'h3') blocks.push({ t: 'h3', ...both(el) });
      else if (tag === 'h4') blocks.push({ t: 'h4', ...both(el) });
      else if (tag === 'ul') blocks.push({ t: 'ul', items: list(el) });
      else if (tag === 'ol') blocks.push({ t: 'ol', items: list(el), start: el.getAttribute('start') });
      else if (tag === 'blockquote') {
        const ps = [...el.children].filter((c) => c.tagName === 'P');
        blocks.push({ t: 'quote', pull: el.classList.contains('pull'), paras: ps.length ? ps.map(both) : [both(el)] });
      } else if (el.matches('hr')) blocks.push({ t: 'hr' });
      else if (el.matches('aside.teambox')) {
        const paras = [], items = [];
        for (const c of el.children) { if (c.tagName === 'P') paras.push(both(c)); else if (c.tagName === 'UL' || c.tagName === 'OL') items.push(...list(c)); else warn.push('teambox child ' + c.tagName); }
        blocks.push({ t: 'teambox', paras, items });
      } else if (tag === 'footer') walk(el);
      else if (el.matches('figure.cap') && el.nextElementSibling && el.nextElementSibling.matches('p.mlink')) {
        // a drawn figure with a Medium embed line after it is a clip on Medium (a recording of the drawing), not a
        // picture; the clip's name comes from the clip table by its Stream uid (in Node, below)
        const nx = el.nextElementSibling, fc = el.querySelector('figcaption'), area = el.querySelector('.cap-area');
        consumed.add(nx);
        if (!fc) warn.push('no caption for clip figure ' + el.id);
        const d = area ? [...area.querySelectorAll('[aria-label]')].find((e) => !e.closest('[aria-hidden="true"]')) : null;
        blocks.push({ t: 'clip', kind: 'cap', id: el.id, url: (nx.querySelector('code') || nx).textContent.trim(), cap: fc ? both(fc) : null,
          aria: d ? ws(d.getAttribute('aria-label')) : altOf(el).alt });
      } else if (el.matches('figure.cap')) {
        const fc = el.querySelector('figcaption');
        let cap = fc ? both(fc) : null, capFrom = 'figcaption';
        const nx = el.nextElementSibling;
        if (!cap && nx && nx.matches('p.note')) { cap = both(nx); consumed.add(nx); capFrom = 'p.note after figure (no figcaption)'; }
        if (!cap) warn.push('no caption for ' + el.id);
        blocks.push({ t: 'picture', kind: 'cap', id: el.id, cap, capFrom, ...altOf(el) });
      } else if (el.matches('figure.gif')) {
        const fc = el.querySelector('figcaption');
        const cap = fc ? both(fc) : null;
        const img = el.querySelector('img'), vid = el.querySelector('video');
        if (img) blocks.push({ t: 'picture', kind: 'img', src: img.getAttribute('src'), cap, capFrom: 'figcaption', alt: ws(img.getAttribute('alt') || ''), altFrom: 'img alt', w: img.getAttribute('width'), h: img.getAttribute('height') });
        else if (vid) {
          const nx = el.nextElementSibling;
          let url = null;
          if (nx && nx.matches('p.mlink')) { url = (nx.querySelector('code') || nx).textContent.trim(); consumed.add(nx); }
          else warn.push('clip without mlink: ' + vid.getAttribute('src'));
          blocks.push({ t: 'clip', src: vid.getAttribute('src'), url, cap, aria: ws(vid.getAttribute('aria-label') || '') });
        } else warn.push('gif figure without img/video');
      } else { warn.push('unhandled ' + tag + '.' + el.className); blocks.push({ t: 'p', cls: 'UNHANDLED', ...both(el) }); }
    }
  }
  walk(main);
  return { blocks, warn };
})()`;

// SVG text that runs past its SVG's viewBox (cut off in the picture), per figure.cap
const OVERFLOW = String.raw`(() => { const r = [];
  for (const fig of document.querySelectorAll('figure.cap')) for (const svg of fig.querySelectorAll('.cap-area svg')) {
    const vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.width) continue;
    for (const t of svg.querySelectorAll('text')) { let b; try { b = t.getBBox(); } catch { continue; }
      if (!b.width) continue;
      const over = Math.max(b.x + b.width - (vb.x + vb.width), vb.x - b.x, b.y + b.height - (vb.y + vb.height), vb.y - b.y);
      if (over > 1) r.push({ fig: fig.id, over: Math.round(over), text: t.textContent.slice(-60) }); } }
  return r; })()`;

const chrome = await launchChrome({ headless: true, port: 0, profileDir: join(WORK, 'profile'), windowSize: '1400,1000' });
let cdp, page, kit, refused = null;
try {
  cdp = await CDP.connect(chrome.wsUrl);
  page = await cdp.newIsolatedPage();
  const VW = 1400, VH = 1000;
  await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false });
  await page.send('Emulation.setScrollbarsHidden', { hidden: true });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 60000).catch(() => null);
  await page.send('Page.navigate', { url: pathToFileURL(PAGE).href });
  await loaded;
  await page.eval('document.fonts.ready.then(() => true)');
  await sleep(1500);
  const env = await page.eval(`({ fonts: ['700 20px "Bricolage Grotesque"', '400 20px Literata', '400 20px "JetBrains Mono"'].map((f) => [f, document.fonts.check(f)]),
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    capW: (document.querySelector('.cap') || document.body).getBoundingClientRect().width })`);
  console.log('ENV', JSON.stringify(env));
  // the sources mode: the same transform as lib/article.mjs, on the page's DOM, before the walker reads it
  const srcReport = SOURCES ? await page.eval(`(${applySourcesDom.toString()})(document.querySelector('main'), ${JSON.stringify(SOURCES)})`) : null;
  if (srcReport) {
    console.log('SOURCES', JSON.stringify({ mode: srcReport.mode, footer: srcReport.footer, removed: srcReport.removed, linked: srcReport.linked, blocks: srcReport.blocks.length, inPicture: srcReport.inPicture.length, unhandled: srcReport.unhandled.length }));
    for (const u of srcReport.unhandled) console.log('WARN sources: not removed (no known pattern):', u.context.slice(0, 120));
    for (const p of srcReport.inPicture) console.log(`NOTE sources: "${p.text}" is drawn inside picture #${p.figure}; it stays (pictures do not change)`);
  }
  const { blocks, warn } = await page.eval(WALKER);
  if (warn.length) console.log('WARN', JSON.stringify(warn));
  const overflow = await page.eval(OVERFLOW);
  if (overflow.length) console.log('OVERFLOW', JSON.stringify(overflow));
  let pn = 0, cn = 0;
  const clipTable = loadClipTable(DEFAULT_CLIPS);
  for (const b of blocks) {
    if (b.t === 'picture') {
      b.n = String(++pn).padStart(2, '0');
      b.file = b.kind === 'cap' ? `${b.n}-${b.id}.png` : `${b.n}-${basename(b.src)}`;
    } else if (b.t === 'clip') {
      b.n = String(++cn).padStart(2, '0');
      // the clip's name: a <video> clip is its file name, a drawn figure's clip is the clip-table row with its uid
      if (b.kind === 'cap') {
        const row = clipRowByUid(clipTable, b.url);
        b.clip = row ? row.clip : null;
        if (!row) { const w = `clip ${b.n} (#${b.id}): its Stream link is not in ${relative(REPO, DEFAULT_CLIPS)}`; warn.push(w); console.log('WARN', w); }
      } else if (b.src) b.clip = basename(b.src).replace(/\.[a-z0-9]+$/i, '');
    }
  }
  kit = { schema: 'fw-medium-kit/1', page: relative(REPO, PAGE), builtAt: new Date().toISOString(), sources: kitRecord(SOURCES, srcReport, REPO), env, warn, overflow, blocks };
  const want = (b) => !ONLY || ONLY.has(b.n) || ONLY.has(b.id) || ONLY.has(b.file);
  // pictures not captured this time keep the sizes the last build recorded
  const prev = existsSync(join(KIT, 'kit.json')) ? JSON.parse(readFileSync(join(KIT, 'kit.json'), 'utf8')) : null;
  const prevBy = new Map((prev?.blocks || []).filter((x) => x.t === 'picture').map((x) => [x.file, x]));
  for (const b of blocks) if (b.t === 'picture' && !want(b) && prevBy.has(b.file)) { b.px = prevBy.get(b.file).px; b.css = prevBy.get(b.file).css; }
  // no earlier kit.json: read the size from the PNG already in the kit folder (the header's width and height)
  for (const b of blocks) if (b.t === 'picture' && b.kind === 'cap' && !b.px && (o['text-only'] || !want(b)) && existsSync(join(KIT, b.file))) {
    const head = readFileSync(join(KIT, b.file)).subarray(0, 24);
    if (head.length === 24 && head.readUInt32BE(12) === 0x49484452) b.px = { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
  }
  // Medium's alt text: the short one from kit/alt-medium.json where the page's is too long; never cut (lib/alt.mjs)
  const pics = blocks.filter((x) => x.t === 'picture');
  const altm = applyAltMedium(pics);
  const altBad = altProblems(pics);
  if (altm.unused.length) console.log('WARN alt-medium.json keys that match no picture:', altm.unused.join(', '));
  if (altBad.length) refused = altBad;

  if (!o['text-only'] && !refused) {
    for (const b of blocks.filter((x) => x.t === 'picture' && want(x))) {
      if (b.kind === 'img') {
        const cands = [resolve(dirname(PAGE), b.src), ...GIF_DIRS.map((d) => join(d, basename(b.src)))];
        const src = cands.find((p) => existsSync(p));
        if (!src) { console.log('MISSING', b.src, 'looked in', cands.map((p) => relative(REPO, p)).join(', ')); b.missing = true; continue; }
        copyFileSync(src, join(KIT, b.file));
        console.log('COPY', b.file);
        continue;
      }
      const sel = JSON.stringify('#' + b.id + ' .cap-area');
      await page.eval(`(() => { const a = document.querySelector(${sel}); a.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`);
      const box = `(() => { const a = document.querySelector(${sel}).getBoundingClientRect(); return { x: a.left + scrollX, y: a.top + scrollY, w: a.width, h: a.height }; })()`;
      const r = await page.eval(box);
      const tall = r.h + 40 > VH;
      if (tall) await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: Math.ceil(r.h) + 60, deviceScaleFactor: 2, mobile: false });
      const r2 = await page.eval(box);
      // snap outward to device pixels so the 1 px border is never cut
      const x0 = Math.floor(r2.x * 2) / 2, y0 = Math.floor(r2.y * 2) / 2, x1 = Math.ceil((r2.x + r2.w) * 2) / 2, y1 = Math.ceil((r2.y + r2.h) * 2) / 2;
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0, scale: 1 }, captureBeyondViewport: false, fromSurface: true });
      if (tall) await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false });
      const buf = Buffer.from(data, 'base64');
      b.css = { w: r2.w, h: r2.h };
      b.px = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      writeFileSync(join(KIT, b.file), buf);
      console.log('SHOT', b.file, JSON.stringify(b.px));
    }
  }
} finally {
  try { await page?.close(); } catch { /* closed */ }
  cdp?.close();
  await chrome.close();
}
if (refused) {
  console.error('refused: alt text Medium cannot take (nothing written):\n  ' + refused.join('\n  '));
  process.exit(1);
}
writeFileSync(join(KIT, 'kit.json'), JSON.stringify(kit, null, 1));
const summary = render(KIT);
console.log('KIT', KIT.startsWith(REPO) ? relative(REPO, KIT) : KIT, JSON.stringify(summary));
console.log('EXIT 0');

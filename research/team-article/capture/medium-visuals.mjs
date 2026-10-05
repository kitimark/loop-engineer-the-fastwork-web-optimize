#!/usr/bin/env node
// medium-visuals.mjs: turn the team article's HTML-only visuals into images for the Medium draft (user T-170 #68).
//
// Medium keeps headings, paragraphs, lists, quotes and images, so the article's SVG ruler, pace canvas, stat tiles,
// timeline, team grid, stage cards and result bars lose their shape when pasted. This script opens the article in
// headless Chrome (light theme, DPR 2, each visual laid out 700 CSS px wide = 1400 px images, Medium's widest),
// screenshots one element per PNG (clipped to its box via CDP Page.captureScreenshot), records the animated pace
// canvas as a GIF encoded IN THE PAGE by the vendored pure-JS encoder (vendor/gifenc, MIT; no ffmpeg or other
// encoder process), and rebuilds the lead's Medium paste copy with each image at its place.
//
// Usage (Chrome only inside a chrome-measure hold, CLAUDE.md Hard rule 7; run it in the background):
//   node tools/lock.mjs run chrome-measure --owner art-medium-visuals --no-timing --max-seconds 300 \
//     --doing "Medium images of the article's visuals" -- node research/team-article/capture/medium-visuals.mjs
// Options:
//   --article <file>   the article (default: the main checkout's research/team-article/index.html)
//   --copy <file>      the Medium paste copy to rebuild (default: the main checkout's out/lead/medium-copy.html)
//   --out <dir>        output dir (default: <this checkout>/out/medium-visuals)
// Output: vNN-<name>.png|gif in article order, manifest.json (file, section, the text it sits after, caption, alt,
// size, where it goes in the copy) and medium-copy.html (the copy with every visual inlined as a data: URI).
// The pace GIF steps the page's own drawing code on a virtual clock (rAF and performance.now replaced before the
// page runs) at 20 ms per frame, the shortest delay every browser honours in a GIF (50 fps), so the late frames
// (held 40-60 ms) still read against the smooth lane; 12-15 fps would hide the very difference it shows.
// One 3.6 s thumb loop = 180 frames; it shows 5 of the page's 6 late frames per loop (two 58 ms ones held 60 ms).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchChrome, CDP, tempProfileDir, screenInfoArg, gotoAndSettle, sleep } from '../../../tools/lib/cdp.mjs';
import { exitOnHelp } from '../../../tools/lib/help.mjs';

exitOnHelp(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
// the main checkout (the article and the copy live there, uncommitted): the parent of the shared git dir
const MAIN = (() => {
  try { return dirname(resolve(ROOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim())); } catch { return ROOT; }
})();
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : def; };
const ARTICLE = arg('--article', join(MAIN, 'research/team-article/index.html'));
const COPY = arg('--copy', join(MAIN, 'out/lead/medium-copy.html'));
const OUT = arg('--out', join(ROOT, 'out/medium-visuals'));

if (!/(^|,)chrome-measure:/.test(process.env.FW_LOCK_HELD || '')) {
  console.error('medium-visuals: run me inside a chrome-measure hold (Hard rule 7):\n  node tools/lock.mjs run chrome-measure --owner art-medium-visuals --no-timing --max-seconds 300 -- node research/team-article/capture/medium-visuals.mjs');
  process.exit(2);
}
for (const f of [ARTICLE, COPY]) if (!existsSync(f)) { console.error(`medium-visuals: missing ${f}`); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// ---- layout of the capture ---------------------------------------------------------------------------------
const IMG_CSS = 700;   // CSS px per image: 1400 px at DPR 2, Medium's widest image
const PAD = 8;         // white margin around each element inside the clip
const DPR = 2;
const VIEW_W = 800;
const COL = IMG_CSS - 2 * PAD;
const CAPTURE_CSS = `
:root { --measure: ${COL}px !important; --wide: ${COL}px !important; }
body { background: #fff !important; background-image: none !important; padding-inline: ${(VIEW_W - COL) / 2}px !important; }
.bar.after { animation: none !important; }             /* entrance animation: capture the end state */
.wide > .stats { grid-template-columns: repeat(3, 1fr) !important; }        /* 6 tiles: 3 x 2 */
section:not(.wide) > .stats { grid-template-columns: repeat(4, 1fr) !important; } /* 4 cost tiles in one row */
.stages { grid-template-columns: repeat(3, 1fr) !important; }               /* 6 stages: 3 x 2 */
`;

// ---- the items, in article order ---------------------------------------------------------------------------
// find: a JS expression for the element. copy: how the Medium copy changes (see rebuildCopy).
const ITEMS = [
  { name: 'frame-ruler', kind: 'png', find: `document.querySelector('figure.ruler')`,
    caption: null, // keeps the copy's existing caption
    alt: `A scale from 0 to 60 milliseconds. One phone frame at 60 Hz is 16.7 ms (blue); frames over 34 ms are slow (amber band near the line); frames over 50 ms are very slow (red), and the goal is zero of them.`,
    copy: { mode: 'figure', index: 0, expectAlt: /^What smooth means/ } },
  { name: 'steering-timeline', kind: 'png', find: `document.querySelector('ol.timeline').closest('section')`,
    caption: 'How the loop was steered, in UTC: every hint the owner gave, in order, with the finger tests and the breakthrough.',
    alt: 'timeline', // filled from the page text
    copy: { mode: 'replace', start: /<p>How the loop was steered, in UTC<\/p>\s*<ol>/, end: '</ol>' } },
  { name: 'pace', kind: 'gif', find: `document.getElementById('pace')`,
    caption: null,
    alt: 'Animated: two dots follow the same thumb motion. The top dot, drawn with the old frame pacing, stops and jumps when a frame is late; the bottom dot gets a new picture every frame and glides.',
    copy: { mode: 'figure', index: 1, expectAlt: /^Same thumb motion/ } },
  { name: 'team-numbers', kind: 'png', find: `document.querySelectorAll('.stats')[0]`,
    caption: 'How the team worked, in numbers (30 September to 5 October 2026).',
    alt: 'stats',
    copy: { mode: 'before', start: /<ul><li><strong>5<\/strong> days/ } },
  { name: 'team-roles', kind: 'png', find: `document.querySelector('.team')`,
    caption: 'Who is on the team: one job per agent, and the name is the address.',
    alt: 'roles',
    copy: { mode: 'replace', start: /<p><strong>Lead 1:<\/strong>/, end: /Mappers and reviewers:<\/strong>[^<]*<\/p>/ } },
  { name: 'fix-stages', kind: 'png', find: `document.querySelector('ol.stages')`,
    caption: 'How one fix travels: six stages, R I D F V L, each closed by a written card.',
    alt: 'stages',
    copy: { mode: 'replace', start: /<ol><li><strong>R<\/strong>/, end: '</ol>' } },
  { name: 'build-results', kind: 'png', find: `document.querySelector('section.results')`,
    caption: 'What the builds changed, before → after. Each pair is drawn to its own scale, with the before value as the full bar; lower is better in every row. All OBSERVED in our setup.',
    alt: 'results',
    copy: { mode: 'replace-keep-list', start: /<p>What the builds changed, before → after<\/p>\s*<p>Each pair is drawn[^<]*<\/p>/ } },
  { name: 'cost', kind: 'png', find: `document.querySelectorAll('.stats')[1]`,
    caption: "What it cost: Claude Code's running estimate at API prices, at the time of writing.",
    alt: 'stats',
    copy: { mode: 'before', start: /<ul><li><strong>\$8,576<\/strong>/ } },
];

// ---- page-side helpers -------------------------------------------------------------------------------------
// Before any page script: a virtual clock for rAF / performance.now (the pace canvas is stepped frame by frame),
// and a 1400 px backing store for the pace canvas (its code draws in 900 x 220 units; we scale the context).
const PRELUDE = `(() => {
  const SX = 1400 / 900, SY = 342 / 220;
  let vt = 0; const q = [];
  window.__fwCap = { step(t) { vt = t; const cbs = q.splice(0); for (const cb of cbs) cb(t); return cbs.length; } };
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  const P = HTMLCanvasElement.prototype, get = P.getContext;
  const wd = Object.getOwnPropertyDescriptor(P, 'width'), hd = Object.getOwnPropertyDescriptor(P, 'height');
  P.getContext = function (type, ...a) {
    if (this.id === 'pace' && type === '2d' && !this.__fwHi) {
      this.__fwHi = true;
      const w = wd.get.call(this), h = hd.get.call(this);
      wd.set.call(this, Math.round(w * SX)); hd.set.call(this, Math.round(h * SY));
      Object.defineProperty(this, 'width', { get: () => w, configurable: true });
      Object.defineProperty(this, 'height', { get: () => h, configurable: true });
      this.__fwPx = { w: wd.get.call(this), h: hd.get.call(this) };
      const c = get.call(this, type, ...a); c.scale(SX, SY); return c;
    }
    return get.call(this, type, ...a);
  };
})();`;

// where an element sits: its h2 and the text block just before it
const PLACE_FN = `(el) => {
  const pre = (x) => (el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING) && !x.contains(el);
  const blocks = [...document.querySelectorAll('h2, p, blockquote, li')].filter((x) => pre(x) && !el.contains(x));
  const h2 = [...document.querySelectorAll('h2')].filter(pre).pop();
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const after = clean(blocks.pop()?.textContent);
  return { section: clean(h2?.textContent), after: after.length > 160 ? after.slice(0, 157) + '…' : after };
}`;

// alt text from the page, per item type (the image's full text, so the copy loses nothing for screen readers)
const ALT_FN = `(el, kind) => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  if (kind === 'timeline') return 'Timeline, UTC. ' + [...el.querySelectorAll('ol.timeline li')].map((li) =>
    clean(li.querySelector('time').textContent) + ', ' + clean(li.querySelector('.tag').textContent) + ': ' + clean(li.querySelector('p').textContent)).join(' ');
  if (kind === 'stats') return 'Number tiles: ' + [...el.querySelectorAll('.stat')].map((s) => clean(s.querySelector('b').textContent) + ' ' + clean(s.querySelector('span').textContent)).join('; ') + '.';
  if (kind === 'roles') return 'Team roles: ' + [...el.querySelectorAll('.role')].map((r) => clean(r.querySelector('h3').textContent) + ': ' + clean(r.querySelector('p').textContent)).join(' ');
  if (kind === 'stages') return 'Six stages: ' + [...el.querySelectorAll('li')].map((li) => clean(li.querySelector('span').textContent)).join(' ');
  if (kind === 'results') return 'Bar pairs, before (grey, full) and after (blue): ' + [...el.querySelectorAll('.res')].map((r) =>
    clean(r.querySelector('.res-head span').textContent) + ' (' + clean(r.querySelector('.res-head .v').textContent) + '): ' + clean(r.querySelector('.res-nums').textContent)).join('; ') + '.';
  return '';
}`;

// in-page GIF of the pace canvas: N frames of `stepMs` on the virtual clock, one global palette, unchanged pixels
// transparent (dispose 1 = keep), so each frame stores only what moved
const GIF_FN = `async ({ frames, stepMs, colors, bg }) => {
  const { GIFEncoder, quantize, applyPalette } = window.__gifenc;
  const cv = document.getElementById('pace');
  const { w, h } = cv.__fwPx;
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const ox = off.getContext('2d', { willReadFrequently: true });
  const grab = () => { ox.fillStyle = bg; ox.fillRect(0, 0, w, h); ox.drawImage(cv, 0, 0); return ox.getImageData(0, 0, w, h).data; };
  const rgba = [];
  for (let i = 0; i < frames; i++) { window.__fwCap.step(i * stepMs); rgba.push(grab()); }
  // palette from a spread of frames (both dots across the lane), one colour kept free for "unchanged"
  const pick = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => rgba[Math.floor(f * frames)]);
  const sample = new Uint8Array(pick.reduce((n, a) => n + a.length, 0));
  pick.reduce((o, a) => (sample.set(a, o), o + a.length), 0);
  const palette = quantize(sample, colors - 1);
  while (palette.length < colors - 1) palette.push([0, 0, 0]);
  const T = palette.length; palette.push([255, 0, 255]);
  const gif = GIFEncoder();
  let prev = null, maxChanged = 0;
  for (let i = 0; i < frames; i++) {
    const idx = applyPalette(rgba[i], palette.slice(0, T));
    let out = idx;
    if (prev) {
      out = new Uint8Array(idx.length); let changed = 0;
      for (let p = 0; p < idx.length; p++) { if (idx[p] === prev[p]) out[p] = T; else { out[p] = idx[p]; changed++; } }
      maxChanged = Math.max(maxChanged, changed);
    }
    gif.writeFrame(out, w, h, i === 0 ? { palette, delay: stepMs, repeat: 0 } : { delay: stepMs, transparent: true, transparentIndex: T, dispose: 1 });
    prev = idx;
  }
  gif.finish();
  const bytes = gif.bytes();
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), w, h, bytes: bytes.length, maxChanged };
}`;

// ---- run -----------------------------------------------------------------------------------------------------
const gifencSrc = readFileSync(join(HERE, 'vendor/gifenc/gifenc.esm.js'), 'utf8')
  .replace(/export\s*\{([^}]*)\};?/, (_, list) => `window.__gifenc={${list.split(',').map((p) => { const [a, b] = p.trim().split(/\s+as\s+/); return `${b || a}:${a}`; }).join(',')}};`)
  .replace(/\/\/# sourceMappingURL=.*$/m, '');
if (!/window\.__gifenc=/.test(gifencSrc)) throw new Error('gifenc: export list not found');

const chrome = await launchChrome({ port: 0, headless: true, profileDir: tempProfileDir(join(ROOT, 'out'), 'medium-visuals'), args: [screenInfoArg()] });
const cdp = await CDP.connect(chrome.wsUrl);
const manifest = { schema: 'fw-medium-visuals/1', article: ARTICLE.replace(MAIN + '/', ''), copy: COPY.replace(MAIN + '/', ''), createdAt: new Date().toISOString(), browser: chrome.browser, items: [] };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 1000, deviceScaleFactor: DPR, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  try { await page.send('Emulation.setScrollbarsHidden', { hidden: true }); } catch {}
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELUDE });
  await gotoAndSettle(page, pathToFileURL(ARTICLE).href, { quietMs: 800, maxMs: 30000 });
  manifest.fonts = await page.eval(`(async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const st = document.createElement('style'); st.textContent = ${JSON.stringify(CAPTURE_CSS)}; document.head.appendChild(st);
    const want = ['800 30px "Bricolage Grotesque"', '700 15px "Bricolage Grotesque"', '400 17px Literata', '600 13px "JetBrains Mono"', '400 12px "JetBrains Mono"'];
    await Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 8000))]);
    await document.fonts.ready;
    return Object.fromEntries(want.map((f) => [f, document.fonts.check(f)]));
  })()`);
  await page.eval(gifencSrc + ';true');
  await sleep(300);

  let n = 0;
  for (const it of ITEMS) {
    n++;
    const file = `v${String(n).padStart(2, '0')}-${it.name}.${it.kind}`;
    const info = await page.eval(`(() => {
      const el = ${it.find}; if (!el) return null;
      el.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0);
      const r = el.getBoundingClientRect();
      return { rect: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }, place: (${PLACE_FN})(el.closest('figure') || el), alt: (${ALT_FN})(el, ${JSON.stringify(it.alt)}) };
    })()`);
    if (!info) throw new Error(`${it.name}: element not found (${it.find})`);
    let bytes, w, h, extra = {};
    if (it.kind === 'png') {
      const x = Math.floor(info.rect.x) - PAD, y = Math.floor(info.rect.y) - PAD;
      const cw = IMG_CSS, ch = Math.ceil(info.rect.y + info.rect.h) + PAD - y;
      if (Math.abs(info.rect.w - COL) > 1) console.error(`NOTE ${it.name}: element is ${info.rect.w.toFixed(1)} css px wide, not ${COL}`);
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: cw, height: ch, scale: 1 }, captureBeyondViewport: true, fromSurface: true });
      bytes = Buffer.from(shot.data, 'base64');
      w = bytes.readUInt32BE(16); h = bytes.readUInt32BE(20);
    } else {
      const g = await page.eval(`(${GIF_FN})(${JSON.stringify({ frames: 180, stepMs: 20, colors: 64, bg: '#ffffff' })})`, { timeout: 240000 });
      bytes = Buffer.from(g.b64, 'base64'); w = g.w; h = g.h;
      extra = { frames: 180, frameDelayMs: 20, fps: 50, loopSeconds: 3.6, colors: 64, maxChangedPixelsPerFrame: g.maxChanged };
    }
    writeFileSync(join(OUT, file), bytes);
    const alt = it.alt.length > 12 ? it.alt : info.alt;
    manifest.items.push({ n, file, kind: it.kind === 'gif' ? 'animated gif' : 'png', section: info.place.section, after: info.place.after, caption: it.caption, alt, width: w, height: h, bytes: bytes.length, ...extra, copy: it.copy.mode });
    console.log(`${file}  ${w}x${h}  ${(bytes.length / 1024).toFixed(0)} KB  [${info.place.section}]`);
    if (it.kind === 'gif' && bytes.length > 5 * 1024 * 1024) console.error(`WARN ${file} is over 5 MB`);
  }
  await page.close();
} finally {
  cdp.close();
  await chrome.close();
}

// ---- rebuild the Medium copy -----------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataUri = (it) => `data:image/${it.file.endsWith('.gif') ? 'gif' : 'png'};base64,${readFileSync(join(OUT, it.file)).toString('base64')}`;
const figure = (it, caption) => `<figure><img src="${dataUri(it)}" alt="${esc(it.alt)}"><figcaption>${esc(caption)}</figcaption></figure>`;
let html = readFileSync(COPY, 'utf8');
const figs = [...html.matchAll(/<figure>[\s\S]*?<\/figure>/g)].map((m) => ({ at: m.index, text: m[0] }));
const edits = [];
for (const it of manifest.items) {
  const c = ITEMS[it.n - 1].copy;
  if (c.mode === 'figure') {
    const f = figs[c.index];
    const oldAlt = f && (f.text.match(/alt="([^"]*)"/) || [])[1];
    if (!f || !c.expectAlt.test(oldAlt || '')) throw new Error(`copy: figure ${c.index} is not the expected one (alt ${oldAlt})`);
    const cap = (f.text.match(/<figcaption>([\s\S]*?)<\/figcaption>/) || [])[1] || '';
    it.caption = cap.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    it.copyNote = 'replaces the existing still figure; caption kept';
    edits.push({ at: f.at, len: f.text.length, text: `<figure><img src="${dataUri(it)}" alt="${esc(it.alt)}"><figcaption>${cap}</figcaption></figure>` });
    continue;
  }
  const m = html.match(c.start);
  if (!m) throw new Error(`copy: start of ${it.file} not found (${c.start})`);
  if (c.mode === 'before') { it.copyNote = 'inserted before the number list (list kept for copyable numbers)'; edits.push({ at: m.index, len: 0, text: figure(it, it.caption) }); continue; }
  if (c.mode === 'replace-keep-list') { it.copyNote = 'replaces the label and note paragraphs (now in the image and caption); the number list after it is kept'; edits.push({ at: m.index, len: m[0].length, text: figure(it, it.caption) }); continue; }
  // replace: from start to the end marker (inclusive)
  const rest = html.slice(m.index);
  let endAt;
  if (typeof c.end === 'string') { const k = rest.indexOf(c.end); endAt = k < 0 ? -1 : k + c.end.length; } else { const e = rest.match(c.end); endAt = e ? e.index + e[0].length : -1; }
  if (endAt < 0) throw new Error(`copy: end of ${it.file} not found`);
  it.copyNote = 'replaces the flattened list (its full text is in the alt text)';
  edits.push({ at: m.index, len: endAt, text: figure(it, it.caption) });
}
edits.sort((a, b) => b.at - a.at);
for (let i = 1; i < edits.length; i++) if (edits[i].at + edits[i].len > edits[i - 1].at) throw new Error('copy: overlapping edits');
for (const e of edits) html = html.slice(0, e.at) + e.text + html.slice(e.at + e.len);
writeFileSync(join(OUT, 'medium-copy.html'), html);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`medium-copy.html  ${(statSync(join(OUT, 'medium-copy.html')).size / 1024).toFixed(0)} KB; manifest.json: ${manifest.items.length} items; fonts ${JSON.stringify(manifest.fonts)}`);
console.log(`OUT=${OUT}`);

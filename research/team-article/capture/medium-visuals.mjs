#!/usr/bin/env node
// medium-visuals.mjs: turn the team article's HTML-only visuals into images for the Medium draft (user T-170 #68).
//
// Medium keeps headings, paragraphs, lists, quotes and images, so the article's SVG ruler, pace canvas, stat tiles,
// timeline, team grid, stage cards, result bars and before/after videos lose their shape when pasted. This script
// opens the article in headless Chrome (light theme, DPR 2, each visual laid out 700 CSS px wide = 1400 px images,
// Medium's widest), screenshots one element per PNG (clipped to its box via CDP Page.captureScreenshot), records the
// animated pace canvas and the before/after MP4s as GIFs encoded IN THE PAGE by the vendored pure-JS encoder
// (vendor/gifenc, MIT; no ffmpeg or other encoder process), and builds a Medium paste copy from the article itself
// with each image at its place.
//
// Usage (Chrome only inside a chrome-measure hold, CLAUDE.md Hard rule 7; run it in the background):
//   node tools/lock.mjs run chrome-measure --owner art-medium-visuals --no-timing --max-seconds 300 \
//     --doing "Medium images of the article's visuals" -- node research/team-article/capture/medium-visuals.mjs
// Options:
//   --article <file>   the article (default: the main checkout's research/team-article/index.html)
//   --media <dir>      the before/after MP4s (default: research/team-article/capture/v8/media of this checkout,
//                      else of the main checkout)
//   --out <dir>        output dir (default: <this checkout>/out/medium-visuals)
// Output: vNN-<name>.png|gif (v01-v08 in article order, then the before/after GIFs v09-v11), manifest.json (file, section, the text it sits after, caption, alt,
// size, what it replaces in the copy) and medium-copy.html: the article flattened for Medium (H1-H3, P, lists,
// blockquote, inline marks, figures; stat tiles and result bars as lists; the owner-only publishing plan, footer,
// scripts and styles left out) with every visual inlined as a data: URI.
// The pace GIF steps the page's own drawing code on a virtual clock (rAF and performance.now replaced before the
// page runs) at 20 ms per frame, the shortest delay every browser honours in a GIF (50 fps), so the late frames
// (held 40-60 ms) still read against the smooth lane; 12-15 fps would hide the very difference it shows.
// One 3.6 s thumb loop = 180 frames; it shows 5 of the page's 6 late frames per loop (two 58 ms ones held 60 ms).
// The before/after GIFs seek each MP4 frame by frame (blob URL, so the canvas stays readable), at the clip's own
// 30 fps and native 448 px width; delays alternate 30/30/40 ms so the clock keeps time, and a frame identical to the
// one before extends that frame's delay. Over 5 MB, a clip falls back to 64 colours, then 15 fps at 128, 64, 32 colours (the manifest says).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, tempProfileDir, screenInfoArg, gotoAndSettle, sleep } from '../../../tools/lib/cdp.mjs';
import { exitOnHelp } from '../../../tools/lib/help.mjs';

exitOnHelp(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
// the main checkout (the article lives there, uncommitted): the parent of the shared git dir
const MAIN = (() => {
  try { return dirname(resolve(ROOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim())); } catch { return ROOT; }
})();
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : def; };
const ARTICLE = arg('--article', join(MAIN, 'research/team-article/index.html'));
const MEDIA = arg('--media', [ROOT, MAIN].map((r) => join(r, 'research/team-article/capture/v8/media')).find((d) => existsSync(join(d, 'hero.mp4'))) || join(ROOT, 'research/team-article/capture/v8/media'));
const OUT = arg('--out', join(ROOT, 'out/medium-visuals'));
const MAX_GIF = 5 * 1024 * 1024;

if (!/(^|,)chrome-measure:/.test(process.env.FW_LOCK_HELD || '')) {
  console.error('medium-visuals: run me inside a chrome-measure hold (Hard rule 7):\n  node tools/lock.mjs run chrome-measure --owner art-medium-visuals --no-timing --max-seconds 300 -- node research/team-article/capture/medium-visuals.mjs');
  process.exit(2);
}
for (const f of [ARTICLE, ...['hero', 'switch', 'end'].map((n) => join(MEDIA, `${n}.mp4`))]) if (!existsSync(f)) { console.error(`medium-visuals: missing ${f}`); process.exit(2); }
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
// tag: the article element the image stands for (replaced by the figure in the copy; `list` keeps a number list
// after it). find: the element to capture, when it differs. caption: text, or a page expression (captionJs).
const ITEMS = [
  { name: 'frame-ruler', kind: 'png', tag: `document.querySelector('figure.ruler')`,
    caption: 'What "smooth" means, in numbers: one phone frame is 16.7 ms; over 34 ms is slow; the goal is zero frames over 50 ms.',
    alt: `A scale from 0 to 60 milliseconds. One phone frame at 60 Hz is 16.7 ms (blue); frames over 34 ms are slow (amber band near the line); frames over 50 ms are very slow (red), and the goal is zero of them.` },
  { name: 'steering-timeline', kind: 'png', tag: `document.querySelector('ol.timeline').closest('section')`,
    caption: 'How the loop was steered, in UTC: every hint the owner gave, in order, with the finger tests and the breakthrough.',
    alt: 'timeline' },
  { name: 'pace', kind: 'gif', tag: `document.querySelector('figure.pace')`, find: `document.getElementById('pace')`,
    captionJs: `document.getElementById('pace-cap').textContent`,
    alt: 'Animated: two dots follow the same thumb motion. The top dot, drawn with the old frame pacing, stops and jumps when a frame is late; the bottom dot gets a new picture every frame and glides.' },
  { name: 'team-numbers', kind: 'png', tag: `document.querySelectorAll('.stats')[0]`, list: true,
    caption: 'How the team worked, in numbers (30 September to 5 October 2026).', alt: 'stats' },
  { name: 'team-roles', kind: 'png', tag: `document.querySelector('.team')`,
    caption: 'Who is on the team: one job per agent, and the name is the address.', alt: 'roles' },
  { name: 'fix-stages', kind: 'png', tag: `document.querySelector('ol.stages')`,
    caption: 'How one fix travels: six stages, R I D F V L, each closed by a written card.', alt: 'stages' },
  { name: 'build-results', kind: 'png', tag: `document.querySelector('section.results')`, list: true,
    caption: 'What the builds changed, before → after. Each pair is drawn to its own scale, with the before value as the full bar; lower is better in every row. All OBSERVED in our setup.',
    alt: 'results' },
  ...['hero', 'switch', 'end'].map((clip, i) => ({
    name: `ba-${clip}`, kind: 'video', clip, tag: `document.querySelectorAll('.ba-scene')[${i}]`,
    captionJs: `(() => { const s = document.querySelectorAll('.ba-scene')[${i}], t = (q) => s.querySelector(q).textContent.replace(/\\s+/g, ' ').trim();
      return t('.res-head span') + ' (' + t('.res-head .v') + '). ' + t('.res-nums'); })()`,
    altJs: `'Animated, side by side: ' + document.querySelectorAll('.ba-scene')[${i}].querySelector('video').getAttribute('aria-label').replace(/^Side by side: /, '').replace(/^./, (c) => c.toUpperCase())`,
  })),
  { name: 'cost', kind: 'png', tag: `document.querySelectorAll('.stats')[1]`, list: true,
    caption: "What it cost: Claude Code's running estimate at API prices, at the time of writing.", alt: 'stats' },
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
  const blocks = [...document.querySelectorAll('h2, p, blockquote, li, .res-nums')].filter((x) => pre(x) && !el.contains(x));
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

// shared GIF writer (page side): global palette from sample frames, unchanged pixels transparent (dispose 1 = keep),
// a frame identical to the last written one only lengthens that frame's delay
const GIF_LIB = `window.__fwGif = (w, h, colors) => {
  const { GIFEncoder, quantize, applyPalette } = window.__gifenc;
  const gif = GIFEncoder(); let palette = null, T = 0, prev = null, pending = null, written = 0, merged = 0;
  const flush = () => { if (!pending) return; gif.writeFrame(pending.out, w, h, written === 0 ? { palette, delay: pending.cs * 10, repeat: 0 } : { delay: pending.cs * 10, transparent: true, transparentIndex: T, dispose: 1 }); written++; pending = null; };
  return {
    palette(samples) {
      const sample = new Uint8Array(samples.reduce((n, a) => n + a.length, 0));
      samples.reduce((o, a) => (sample.set(a, o), o + a.length), 0);
      palette = quantize(sample, colors - 1); while (palette.length < colors - 1) palette.push([0, 0, 0]);
      T = palette.length; palette.push([255, 0, 255]);
    },
    add(rgba, cs) {
      const idx = applyPalette(rgba, palette.slice(0, T));
      if (!prev) { pending = { out: idx, cs }; prev = idx; return; }
      const out = new Uint8Array(idx.length); let changed = 0;
      for (let p = 0; p < idx.length; p++) { if (idx[p] === prev[p]) out[p] = T; else { out[p] = idx[p]; changed++; } }
      if (!changed) { pending.cs += cs; merged++; return; }
      flush(); pending = { out, cs }; prev = idx;
    },
    finish() {
      flush(); gif.finish(); const bytes = gif.bytes();
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), bytes: bytes.length, written, merged };
    },
  };
};`;

// the pace canvas: N frames of stepMs on the virtual clock
const PACE_GIF_FN = `async ({ frames, stepMs, colors, bg }) => {
  const cv = document.getElementById('pace');
  const { w, h } = cv.__fwPx;
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const ox = off.getContext('2d', { willReadFrequently: true });
  const grab = () => { ox.fillStyle = bg; ox.fillRect(0, 0, w, h); ox.drawImage(cv, 0, 0); return ox.getImageData(0, 0, w, h).data; };
  const rgba = [];
  for (let i = 0; i < frames; i++) { window.__fwCap.step(i * stepMs); rgba.push(grab()); }
  const g = window.__fwGif(w, h, colors);
  g.palette([0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => rgba[Math.floor(f * frames)]));
  for (const f of rgba) g.add(f, stepMs / 10);
  return { ...g.finish(), w, h, frames };
}`;

// an MP4 (base64) stepped frame by frame: seek to the middle of each output frame, draw, encode
const VIDEO_GIF_FN = `async ({ b64, fps, colors }) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
  v.style.cssText = 'position:fixed;left:0;top:0;opacity:0.01;pointer-events:none';
  document.body.appendChild(v);
  v.src = URL.createObjectURL(new Blob([u8], { type: 'video/mp4' }));
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video: ' + (v.error && v.error.message))); });
  const w = v.videoWidth, h = v.videoHeight, dur = v.duration;
  if (!(dur > 0 && isFinite(dur))) throw new Error('video: no duration');
  const n = Math.max(1, Math.floor(dur * fps + 1e-6));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  const frameAt = async (t) => {
    await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('video: seek to ' + t + ' timed out')), 5000);
      v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = Math.min(t, dur - 0.001); });
    await new Promise((res) => { if (v.requestVideoFrameCallback) { const to = setTimeout(res, 150); v.requestVideoFrameCallback(() => { clearTimeout(to); res(); }); } else res(); });
    x.drawImage(v, 0, 0, w, h); return x.getImageData(0, 0, w, h).data;
  };
  const g = window.__fwGif(w, h, colors);
  const samples = []; for (const f of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) samples.push(await frameAt(f * dur));
  g.palette(samples);
  for (let i = 0; i < n; i++) {
    const cs = Math.round((i + 1) * 100 / fps) - Math.round(i * 100 / fps);   // 3,3,4 at 30 fps: keeps the clock
    g.add(await frameAt((i + 0.5) / fps), cs);
  }
  const mid = (await frameAt(dur / 2), c.toDataURL('image/png'));
  v.remove(); URL.revokeObjectURL(v.src);
  return { ...g.finish(), w, h, frames: n, duration: dur, mid };
}`;

// the article flattened for Medium; tagged elements become {visual} markers (with a number list after them when kept)
const FLATTEN_FN = `(keepList) => {
  const out = []; const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (n) => {
    if (n.nodeType === 3) return esc(n.nodeValue.replace(/\\s+/g, ' '));
    if (n.nodeType !== 1) return '';
    const t = n.tagName.toLowerCase(), kids = () => [...n.childNodes].map(inline).join('');
    if (t === 'em' || t === 'i') return n.classList.contains('swatch') ? '' : '<em>' + kids() + '</em>';
    if (t === 'strong' || t === 'b') return '<strong>' + kids() + '</strong>';
    if (t === 'code') return '<code>' + kids() + '</code>';
    if (t === 'a') return '<a href="' + esc(n.getAttribute('href') || '') + '">' + kids() + '</a>';
    if (t === 'br') return '<br>';
    return kids();
  };
  const para = (tag, n) => { const h = inline(n).replace(/\\s+/g, ' ').trim(); if (h) out.push('<' + tag + '>' + h + '</' + tag + '>'); };
  const swatch = { '#6b7d75': 'grey', '#e2b84a': 'yellow', '#ff6b4a': 'red' };
  const list = (el) => {
    if (el.matches('.stats')) return '<ul>' + [...el.querySelectorAll('.stat')].map((s) => '<li><strong>' + esc(clean(s.querySelector('b').textContent)) + '</strong> ' + esc(clean(s.querySelector('span').textContent)) + '</li>').join('') + '</ul>';
    if (el.matches('.results')) return '<ul>' + [...el.querySelectorAll('.res')].map((r) => '<li>' + esc(clean(r.querySelector('.res-head span').textContent)) + ' (' + esc(clean(r.querySelector('.res-head .v').textContent)) + '): <strong>' + esc(clean(r.querySelector('.res-nums').textContent)) + '</strong></li>').join('') + '</ul>';
    return '';
  };
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    const t = n.tagName.toLowerCase();
    if (n.dataset.fwVisual) { out.push({ visual: n.dataset.fwVisual }); if (keepList[n.dataset.fwVisual]) out.push(list(n)); return; }
    if (['script', 'style', 'hr', 'footer', 'button', 'canvas', 'video', 'svg'].includes(t) || n.matches('.plan')) return;
    if (/^h[1-3]$/.test(t)) return para(t, n);
    if (t === 'p') return para('p', n);
    if (t === 'blockquote') return para('blockquote', n);
    if (t === 'figcaption') return para('p', n);
    if (n.matches('header.masthead')) { const h1 = n.querySelector('h1'); walk(h1); for (const c of n.children) if (c !== h1) walk(c); return; }
    if (n.matches('aside.banner')) { const [l, ...r] = n.children; return out.push('<p><em>' + esc(clean(l.textContent)) + ':</em> ' + r.map((x) => esc(clean(x.textContent))).join(' ') + '</p>'); }
    if (n.matches('.byline')) return out.push('<p>' + [...n.children].map((x) => esc(clean(x.textContent))).join(' · ') + '</p>');
    if (n.matches('.ba-legend')) return out.push('<p>Strip under each clip: ' + [...n.children].map((s) => { const i = s.querySelector('.swatch'); const c = i && swatch[(i.getAttribute('style') || '').replace(/^.*background:\\s*/, '').trim().toLowerCase()]; return (c ? c + ', ' : '') + esc(clean(s.textContent)); }).join('; ') + '.</p>');
    if (t === 'ul' || t === 'ol') return out.push('<' + t + '>' + [...n.children].map((li) => { const p = li.querySelector(':scope > p'); return '<li>' + inline(p || li).replace(/\\s+/g, ' ').trim() + '</li>'; }).join('') + '</' + t + '>');
    if (t === 'figure' && n.querySelector(':scope > img')) { const img = n.querySelector(':scope > img'), cap = n.querySelector('figcaption');
      return out.push('<figure><img src="' + img.getAttribute('src') + '" alt="' + esc(img.getAttribute('alt') || '').replace(/"/g, '&quot;') + '">' + (cap ? '<figcaption>' + inline(cap).replace(/\\s+/g, ' ').trim() + '</figcaption>' : '') + '</figure>'); }
    for (const c of n.children) walk(c);
  };
  walk(document.querySelector('main'));
  return { title: document.title, blocks: out };
}`;

// ---- run -----------------------------------------------------------------------------------------------------
const gifencSrc = readFileSync(join(HERE, 'vendor/gifenc/gifenc.esm.js'), 'utf8')
  .replace(/export\s*\{([^}]*)\};?/, (_, list) => `window.__gifenc={${list.split(',').map((p) => { const [a, b] = p.trim().split(/\s+as\s+/); return `${b || a}:${a}`; }).join(',')}};`)
  .replace(/\/\/# sourceMappingURL=.*$/m, '');
if (!/window\.__gifenc=/.test(gifencSrc)) throw new Error('gifenc: export list not found');

const chrome = await launchChrome({ port: 0, headless: true, profileDir: tempProfileDir(join(ROOT, 'out'), 'medium-visuals'), args: [screenInfoArg()] });
const cdp = await CDP.connect(chrome.wsUrl);
const manifest = { schema: 'fw-medium-visuals/2', article: ARTICLE.replace(MAIN + '/', ''), createdAt: new Date().toISOString(), browser: chrome.browser, items: [] };
const CHECK = join(OUT, '..', 'medium-visuals-check');
let flat;
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
  await page.eval(gifencSrc + ';' + GIF_LIB + ';true');
  await sleep(300);

  // file numbers: v01-v08 as first published (article order), the before/after GIFs added later as v09-v11
  const order = [...ITEMS.filter((it) => it.kind !== 'video'), ...ITEMS.filter((it) => it.kind === 'video')];
  for (const it of ITEMS) {
    const n = order.indexOf(it) + 1;
    const ext = it.kind === 'png' ? 'png' : 'gif';
    const file = `v${String(n).padStart(2, '0')}-${it.name}.${ext}`;
    const info = await page.eval(`(() => {
      const tag = ${it.tag}, el = ${it.find || it.tag}; if (!tag || !el) return null;
      tag.dataset.fwVisual = ${JSON.stringify(file)};
      window.scrollTo(0, 0);
      const r = el.getBoundingClientRect();
      return { rect: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }, place: (${PLACE_FN})(tag),
        alt: ${it.altJs || `(${ALT_FN})(el, ${JSON.stringify(it.alt)})`}, caption: ${it.captionJs || 'null'} };
    })()`);
    if (!info) throw new Error(`${it.name}: element not found (${it.tag})`);
    let bytes, w, h, extra = {};
    if (it.kind === 'png') {
      const x = Math.floor(info.rect.x) - PAD, y = Math.floor(info.rect.y) - PAD;
      const cw = IMG_CSS, ch = Math.ceil(info.rect.y + info.rect.h) + PAD - y;
      if (Math.abs(info.rect.w - COL) > 1) console.error(`NOTE ${it.name}: element is ${info.rect.w.toFixed(1)} css px wide, not ${COL}`);
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: cw, height: ch, scale: 1 }, captureBeyondViewport: true, fromSurface: true });
      bytes = Buffer.from(shot.data, 'base64');
      w = bytes.readUInt32BE(16); h = bytes.readUInt32BE(20);
    } else if (it.kind === 'gif') {
      const g = await page.eval(`(${PACE_GIF_FN})(${JSON.stringify({ frames: 180, stepMs: 20, colors: 64, bg: '#ffffff' })})`, { timeout: 240000 });
      bytes = Buffer.from(g.b64, 'base64'); w = g.w; h = g.h;
      extra = { frames: g.frames, gifFrames: g.written, frameDelayMs: 20, fps: 50, loopSeconds: 3.6, colors: 64 };
    } else {
      const src = readFileSync(join(MEDIA, `${it.clip}.mp4`));
      const tries = [{ fps: 30, colors: 128 }, { fps: 30, colors: 64 }, { fps: 15, colors: 128 }, { fps: 15, colors: 64 }, { fps: 15, colors: 32 }];
      let g, used, sizes = [];
      for (const t of tries) {
        g = await page.eval(`(${VIDEO_GIF_FN})(${JSON.stringify({ b64: src.toString('base64'), ...t })})`, { timeout: 240000 });
        sizes.push({ ...t, bytes: g.bytes }); used = t;
        if (g.bytes <= MAX_GIF) break;
      }
      bytes = Buffer.from(g.b64, 'base64'); w = g.w; h = g.h;
      mkdirSync(CHECK, { recursive: true });
      writeFileSync(join(CHECK, file.replace(/\.gif$/, '-mid.png')), Buffer.from(g.mid.split(',')[1], 'base64'));
      extra = { source: `research/team-article/capture/v8/media/${it.clip}.mp4`, sourceSha256: createHash('sha256').update(src).digest('hex'),
        durationSeconds: +g.duration.toFixed(3), fps: used.fps, colors: used.colors, frames: g.frames, gifFrames: g.written, mergedIdenticalFrames: g.merged,
        fallback: sizes.length > 1 ? `over 5 MB at ${sizes.slice(0, -1).map((s) => `${s.fps} fps/${s.colors} colours (${(s.bytes / 1048576).toFixed(1)} MB)`).join(', ')}` : null };
    }
    writeFileSync(join(OUT, file), bytes);
    const caption = it.caption || (info.caption || '').replace(/\s+/g, ' ').trim();
    const alt = it.altJs ? info.alt : (it.alt.length > 12 ? it.alt : info.alt);
    manifest.items.push({ n, file, kind: { png: 'png', gif: 'animated gif', video: 'animated gif (from mp4)' }[it.kind], section: info.place.section, after: info.place.after, caption, alt, width: w, height: h, bytes: bytes.length, ...extra,
      copy: it.list ? 'stands for the element; its numbers stay as a list after the image' : 'stands for the element; its text is in the alt text' });
    console.log(`${file}  ${w}x${h}  ${(bytes.length / 1024).toFixed(0)} KB  [${info.place.section}]${extra.fallback ? '  FALLBACK ' + extra.fallback : ''}`);
    if (ext === 'gif' && bytes.length > MAX_GIF) console.error(`WARN ${file} is over 5 MB`);
  }
  const keep = Object.fromEntries(manifest.items.map((m) => [m.file, !!order[m.n - 1].list]));
  flat = await page.eval(`(${FLATTEN_FN})(${JSON.stringify(keep)})`);
  await page.close();
} finally {
  cdp.close();
  await chrome.close();
}

// ---- the Medium copy -------------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const byFile = Object.fromEntries(manifest.items.map((m) => [m.file, m]));
const seen = new Set();
const body = flat.blocks.map((b) => {
  if (typeof b === 'string') return b;
  const it = byFile[b.visual]; seen.add(b.visual);
  const uri = `data:image/${it.file.endsWith('.gif') ? 'gif' : 'png'};base64,${readFileSync(join(OUT, it.file)).toString('base64')}`;
  return `<figure><img src="${uri}" alt="${esc(it.alt)}"><figcaption>${esc(it.caption)}</figcaption></figure>`;
}).join('\n');
const missing = manifest.items.filter((m) => !seen.has(m.file)).map((m) => m.file);
if (missing.length) throw new Error(`copy: no place found for ${missing.join(', ')}`);
const html = `<!doctype html><meta charset="utf-8"><title>${esc(flat.title)}</title>
<style>body{max-width:680px;margin:40px auto;padding:0 16px;font:19px/1.6 Georgia,serif}figure{margin:2em 0}img{max-width:100%}figcaption{font-size:15px;color:#555}</style>
${body}
`;
writeFileSync(join(OUT, 'medium-copy.html'), html);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`medium-copy.html  ${(statSync(join(OUT, 'medium-copy.html')).size / 1024).toFixed(0)} KB (${flat.blocks.length} blocks); manifest.json: ${manifest.items.length} items; fonts ${JSON.stringify(manifest.fonts)}`);
console.log(`OUT=${OUT}`);

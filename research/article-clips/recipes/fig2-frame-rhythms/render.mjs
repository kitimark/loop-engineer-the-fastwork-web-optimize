#!/usr/bin/env node
// fig2-frame-rhythms/render.mjs: the article's Fig. 2 ("Same thumb, three frame rhythms", <canvas id="cap-pace">) as
// 60 fps PNG frames of exactly one thumb loop, for a looping MP4 (owner T-170 #339; README.md beside this file).
//
// Headless Chrome (tools/lib/cdp.mjs) opens the article itself, viewport 1400 x 1000 CSS px at DPR 2, so the figure is
// 1200 CSS px wide (.cap at min-width 1320) and every PNG is its .cap-area at 2x. Before any page script runs, the
// clock is replaced (performance.now, requestAnimationFrame, Date.now: virtual, never advanced by itself) and the
// canvas gets a backing store of exactly its displayed device pixels (2276 x 816 for 1138 x 408 CSS px), so the
// drawing is vector-sharp, not a 1200 px bitmap scaled up.
// Drawing: the page's own figure script, run once more from its own <script> text with three exact text edits:
//   1. the typical lane's pacing line  `if (t >= nextAt) {...}`  -> its time comes from the 60 Hz schedule below;
//   2. the worst lane's pacing line    `if (t >= wNext) {...}`   -> the same;
//   3. `function tick(` gets `window.__fwFig = { draw, gaps, worst, LOOP, thumb };` in front (the page's own data).
// Everything drawn (title, labels, lanes, colours, fonts, the thumb curve, the AFTER lane = thumb(t)) is the page's code.
// Why the pacing lines are replaced: (a) on a 60 Hz clock the page's rule (next update at t + gap, at the first rAF
// with t >= it) turns every 16.7 ms gap into two frames (16.7 > 16.667), so the "typical" lane would run at 30 fps;
// (b) the page's three periods differ (thumb 3600 ms, typical lane 3767 ms, worst log 3601 ms), so its animation
// never repeats and no whole-loop video exists. The schedule here keeps the page's frame times and loops on the thumb:
//   frame k (k = 0..N-1, N = LOOP / (1000/60) = 216) is drawn at t_k = k * 1000/60 ms;
//   per lane, event j's time E_j = sum of the lane's first j gaps (E_0 = 0, the loop start), in the page's own order;
//   event j is shown from video frame f_j = round(E_j * 60 / 1000) (the nearest 60 Hz frame), events with f_j >= N
//   fall off the loop's end (the typical lane's 216 gaps sum to 3767 ms: its last ~10 x 16.7 ms are cut; the worst
//   log's last event lands at 3601 ms = the loop seam); several events on one frame give one picture (the worst log
//   has 2-9 ms gaps: a 60 Hz screen can't show them either);
//   the lane's dot at frame k = thumb(f * 1000/60) for the latest f_j <= k: the page's own rule that a picture shows
//   the thumb at the moment it was drawn (beforeT = t).
// So a 153 ms frame holds the dot for 9 or 10 video frames, depending on where it starts on the 60 Hz grid.
//
// Usage (Chrome only inside a chrome-measure hold, CLAUDE.md Hard rule 7; in the background):
//   node tools/lock.mjs run chrome-measure --owner art-fig2-video --no-timing --max-seconds 600 -- \
//     sh -c 'node research/article-clips/recipes/fig2-frame-rhythms/render.mjs && ffmpeg ...'   (README.md)
// Options:
//   --article <file>  the article (default: research/team-article/artifacts/sixteen-milliseconds/index.html, this checkout)
//   --out <dir>       output dir (default: <this checkout>/out/fig2-frame-rhythms)
// Output: <out>/frames/f0000.png .. f0215.png (one loop), <out>/seam.png (frame N = the next loop's frame 0, drawn at
// t = 3600 ms, for the seam check), <out>/schedule.json (frame times, per-lane update frames and holds, the page's
// gaps, the expected dot x per lane per frame, the canvas box inside each PNG in device px).
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, CDP, tempProfileDir, screenInfoArg, gotoAndSettle } from '../../../../tools/lib/cdp.mjs';
import { exitOnHelp } from '../../../../tools/lib/help.mjs';

exitOnHelp(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : def; };
const ARTICLE = arg('--article', join(ROOT, 'research/team-article/artifacts/sixteen-milliseconds/index.html'));
const OUT = arg('--out', join(ROOT, 'out/fig2-frame-rhythms'));
const VIEW = { width: 1400, height: 1000, dpr: 2 };
const FRAME_MS = 1000 / 60;


// ---- the 60 Hz schedule (pure; documented in the header) ----------------------------------------------------------
export function laneSchedule(gaps, n) {
  const ev = []; let E = 0;
  ev.push({ j: 0, E: 0, gapBefore: null, f: 0 });
  for (let j = 0; j < gaps.length; j++) {
    E += gaps[j];
    const f = Math.round(E / FRAME_MS);
    if (f >= n) break;
    ev.push({ j: j + 1, E, gapBefore: gaps[j], f });
  }
  const updates = [...new Set(ev.map((e) => e.f))].sort((a, b) => a - b);
  const laneFrame = new Array(n);
  for (let k = 0, u = 0; k < n; k++) { while (u + 1 < updates.length && updates[u + 1] <= k) u++; laneFrame[k] = updates[u]; }
  // hold of each picture: from its update frame to the next one (the last one to the seam at n)
  const holds = updates.map((f, i) => ({ f, frames: (updates[i + 1] ?? n) - f }));
  // the gap that starts at each event (the frame the page holds), with the frames it is shown
  const gapHolds = ev.map((e, i) => ({ j: e.j, gap: gaps[e.j] ?? null, from: e.f, frames: ((ev[i + 1]?.f) ?? n) - e.f }));
  return { events: ev.length, eventsCut: gaps.length + 1 - ev.length, updates, laneFrame, holds, gapHolds };
}

// ---- page-side code -----------------------------------------------------------------------------------------------
const PRELUDE = `(() => {
  let vt = 0; const q = [];
  window.__fwClock = { set(t) { vt = t; } };
  performance.now = () => vt;
  const D0 = Date.parse('2026-10-11T00:00:00Z'); Date.now = () => D0 + Math.round(vt);
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };   // never stepped: the renderer calls draw()
  window.cancelAnimationFrame = () => {};
  const P = HTMLCanvasElement.prototype, get = P.getContext;
  const wd = Object.getOwnPropertyDescriptor(P, 'width'), hd = Object.getOwnPropertyDescriptor(P, 'height');
  P.getContext = function (type, ...a) {
    if (this.id === 'cap-pace' && type === '2d' && !this.__fwHi) {
      this.__fwHi = true;
      const w = wd.get.call(this), h = hd.get.call(this);
      const cssW = this.getBoundingClientRect().width;
      const bw = Math.round(cssW * ${VIEW.dpr}), bh = Math.round(h * bw / w);
      wd.set.call(this, bw); hd.set.call(this, bh);
      Object.defineProperty(this, 'width', { get: () => w, configurable: true });
      Object.defineProperty(this, 'height', { get: () => h, configurable: true });
      this.__fwPx = { w: bw, h: bh, logicalW: w, logicalH: h, sx: bw / w, sy: bh / h };
      const c = get.call(this, type, ...a); c.scale(bw / w, bh / h); return c;
    }
    return get.call(this, type, ...a);
  };
})();`;

const EDITS = [
  ['if (t >= nextAt) { beforeT = t; nextAt = t + gaps[gi % gaps.length]; gi++; }', 'beforeT = window.__fwLane.typical;'],
  ['if (t >= wNext) { worstT = t; wNext = t + worst[wi % worst.length]; wi++; }', 'worstT = window.__fwLane.worst;'],
  ['function tick(now) {', 'window.__fwFig = { draw, gaps, worst, LOOP, thumb };\n  function tick(now) {'],
];

async function main() {
  if (!/(^|,)chrome-measure:/.test(process.env.FW_LOCK_HELD || '')) {
    console.error('render: run me inside a chrome-measure hold (Hard rule 7); see README.md');
    process.exit(2);
  }
  if (!existsSync(ARTICLE)) { console.error(`render: missing ${ARTICLE}`); process.exit(2); }
  const html = readFileSync(ARTICLE, 'utf8');
  const m = html.match(/<script>\s*\(\(\) => \{\s*\/\/ Frame-rhythm illustration[\s\S]*?<\/script>/);
  if (!m) throw new Error('figure script not found in the article');
  let src = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  for (const [a, b] of EDITS) {
    if (src.split(a).length !== 2) throw new Error(`edit target not found exactly once: ${a}`);
    src = src.replace(a, b);
  }
  rmSync(join(OUT, 'frames'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'frames'), { recursive: true });

  const chrome = await launchChrome({ port: 0, headless: true, profileDir: tempProfileDir(join(ROOT, 'out'), 'fig2-render'),
    windowSize: `${VIEW.width},${VIEW.height}`, args: [screenInfoArg({ width: VIEW.width, height: VIEW.height, dpr: VIEW.dpr })] });
  const cdp = await CDP.connect(chrome.wsUrl);
  try {
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELUDE });
    await gotoAndSettle(page, pathToFileURL(ARTICLE).href, { quietMs: 1500 });
    // the fonts the canvas draws with (Google Fonts, loaded by the article's own <link>)
    const fonts = await page.eval(`(async () => {
      const area = document.querySelector('#fig-2 .cap-area'), css = (n) => getComputedStyle(area).getPropertyValue(n).trim();
      const want = ['700 28px ' + css('--display'), '600 17px ' + css('--mono'), '600 15px ' + css('--mono')];
      for (const f of want) await document.fonts.load(f);
      await document.fonts.ready;
      return { want, ok: want.map((f) => document.fonts.check(f)), faces: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight) };
    })()`);
    if (!fonts.ok.every(Boolean) || !fonts.faces.some((f) => /Bricolage/.test(f)) || !fonts.faces.some((f) => /JetBrains/.test(f))) {
      throw new Error('web fonts not loaded: ' + JSON.stringify(fonts));
    }
    await page.eval(`(() => { const s = document.createElement('style'); s.textContent = 'html, body { background: #fff !important; background-image: none !important; }'; document.head.appendChild(s); })()`);
    // run the figure script again with the three edits (the page's own copy stays paused: rAF never steps)
    await page.eval(src);
    const geo = await page.eval(`(() => {
      const fig = document.getElementById('fig-2'), area = fig.querySelector('.cap-area'), cv = document.getElementById('cap-pace');
      window.scrollTo(0, Math.max(0, fig.getBoundingClientRect().top + scrollY - 40));
      const a = area.getBoundingClientRect(), c = cv.getBoundingClientRect();
      return { sx: scrollX, sy: scrollY, area: { x: a.left, y: a.top, w: a.width, h: a.height }, canvas: { x: c.left, y: c.top, w: c.width, h: c.height }, px: cv.__fwPx,
        hasFig: !!window.__fwFig, LOOP: window.__fwFig && window.__fwFig.LOOP, gaps: window.__fwFig && window.__fwFig.gaps, worst: window.__fwFig && window.__fwFig.worst };
    })()`);
    if (!geo.hasFig) throw new Error('figure script did not expose __fwFig');
    if (Math.abs(geo.canvas.w * VIEW.dpr - geo.px.w) > 0.01 || Math.abs(geo.canvas.h * VIEW.dpr - geo.px.h) > 0.01) {
      throw new Error(`canvas backing ${geo.px.w}x${geo.px.h} != displayed ${geo.canvas.w}x${geo.canvas.h} CSS px at DPR ${VIEW.dpr}`);
    }
    const N = geo.LOOP / FRAME_MS;
    if (Math.abs(N - Math.round(N)) > 1e-9) throw new Error(`LOOP ${geo.LOOP} ms is not a whole number of 60 Hz frames`);
    const n = Math.round(N);
    const typ = laneSchedule(geo.gaps, n), wst = laneSchedule(geo.worst, n);
    // clip: the .cap-area box snapped out to whole CSS px (white around it), in document coordinates
    const x0 = Math.floor(geo.area.x), y0 = Math.floor(geo.area.y), x1 = Math.ceil(geo.area.x + geo.area.w), y1 = Math.ceil(geo.area.y + geo.area.h);
    const clip = { x: x0 + geo.sx, y: y0 + geo.sy, width: x1 - x0, height: y1 - y0, scale: 1 };
    const canvasPx = { x: (geo.canvas.x - x0) * VIEW.dpr, y: (geo.canvas.y - y0) * VIEW.dpr, sx: geo.px.sx, sy: geo.px.sy };
    const thumb = (t) => { const p = (t % geo.LOOP) / geo.LOOP; return 0.5 - 0.5 * Math.cos(p * 2 * Math.PI); };
    const laneX = (t) => 80 + thumb(t) * (1200 - 160);   // the page's lane(): 80 + x * (W - 160), W = 1200
    const frames = [];
    const shoot = async (file, t, tTyp, tWst) => {
      await page.eval(`window.__fwClock.set(${t}); window.__fwLane = { typical: ${tTyp}, worst: ${tWst} }; window.__fwFig.draw(${t}); 1`);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true, captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(data, 'base64'));
    };
    for (let k = 0; k < n; k++) {
      const t = k * FRAME_MS, tT = typ.laneFrame[k] * FRAME_MS, tW = wst.laneFrame[k] * FRAME_MS;
      await shoot(join(OUT, 'frames', `f${String(k).padStart(4, '0')}.png`), t, tT, tW);
      frames.push({ k, t, worst: { t: tW, x: laneX(tW) }, typical: { t: tT, x: laneX(tT) }, after: { t, x: laneX(t) } });
    }
    // frame n = the first frame of the next loop: t = LOOP, every lane updates there (the loop restart)
    await shoot(join(OUT, 'seam.png'), n * FRAME_MS, n * FRAME_MS, n * FRAME_MS);
    const sched = {
      article: ARTICLE.replace(ROOT + '/', ''), view: VIEW, frameMs: FRAME_MS, n, loopMs: geo.LOOP,
      clipCss: clip, sizePx: { w: clip.width * VIEW.dpr, h: clip.height * VIEW.dpr }, canvasPx,
      lanesY: { worst: 130, typical: 245, after: 360 }, dotR: 22, browser: chrome.browser, fonts: fonts.faces,
      gaps: { typical: geo.gaps, worst: geo.worst },
      lanes: {
        worst: { updates: wst.updates, holds: wst.holds, gapHolds: wst.gapHolds, events: wst.events, eventsCut: wst.eventsCut },
        typical: { updates: typ.updates, holds: typ.holds, gapHolds: typ.gapHolds, events: typ.events, eventsCut: typ.eventsCut },
      },
      frames,
    };
    writeFileSync(join(OUT, 'schedule.json'), JSON.stringify(sched, null, 1));
    console.log(`RENDERED ${n} frames + seam, ${sched.sizePx.w}x${sched.sizePx.h} px, canvas ${geo.px.w}x${geo.px.h} at (${canvasPx.x}, ${canvasPx.y}), ${chrome.browser}`);
    console.log(`worst lane: ${wst.events} events, ${wst.updates.length} pictures, ${wst.eventsCut} cut; typical lane: ${typ.events} events, ${typ.updates.length} pictures, ${typ.eventsCut} cut`);
    await page.close();
  } finally {
    cdp.close();
    await chrome.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('render:', e.message); process.exit(1); });
}

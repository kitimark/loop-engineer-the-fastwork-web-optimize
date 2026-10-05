// Before/after animation for the study article (user T-170 #49): the ORIGINAL page (the frozen baseline) and a fix
// build, captured in Chrome under the calibrated setting with the same scripted input, shown side by side per scene.
//
//   node research/team-article/capture/before-after.mjs --take-lock                       # baseline vs v8-best, all scenes
//   node research/team-article/capture/before-after.mjs --take-lock --build v9-best       # re-run for v9
//   node tools/lock.mjs run chrome-measure --owner art-beforeafter --max-seconds 480 \
//     --doing "before/after capture" -- node research/team-article/capture/before-after.mjs   # the same, hold by hand
//
// Options:
//   --build <name|patch|overlay dir>   the AFTER side (default v8-best): a fix name (fixes/<name>/patch.diff), a
//                                      baseline-relative patch file, or an overlay directory served on the baseline
//   --baseline <tree>                  the BEFORE side's tree (default site-pretty, the A side of every fix.mjs ab)
//   --label <text>                     the after side's name in the video and snippet (default: the build's name
//                                      without "-best", e.g. v8)
//   --out <dir>                        output dir (default out/before-after/<build>; inside this checkout's gitignored out/)
//   --scenes hero,switch,end           which scenes (default all three; `full` = one top-to-menu run). Worst-case scenes
//                                      (T-170 #75/#76), Chrome ports of the phone's G-driver flick scripts, only when named:
//                                      `fling` (fixes/v8-best/phone/g/flick-hero-v1.json: 3 s at rest, fast flicks down
//                                      past 1,800 px and back to the top, twice) and `load` (flick-fresh-v1.json: a
//                                      throttled reload, 3 fast flicks 0.3 s after DOMContentLoaded, no rest). A flick is
//                                      a 560 px touch swipe in 140 ms (Input.synthesizeScrollGesture, touch, 4,000 px/s,
//                                      preventFling false, so the page flings on), down flicks 350 ms apart, up 1,200 ms
//   --crop <selector>                  cut every clip of the run to that element (T-170 #87; otherwise only the scenes with
//                                      their own crop selector are cut): the union of the matching elements' viewport
//                                      boxes, read at the start (before the screencast) and the end (after it) of both
//                                      shown runs (a scene's cropAt can keep only the start or the end reads), plus
//                                      --crop-margin, clamped to the viewport; both sides get the same
//                                      rectangle (capture.json scenes.<s>.crop). Done in the encode step (ffmpeg crop +
//                                      scale, MP4 only, no image output). A cropped scene's screencast is taken at
//                                      --crop-dpr px per CSS px (default 2, 860 px wide instead of 432; it costs more on
//                                      both sides), and its panel is --crop-zoom x the CSS size (default 2, at most
//                                      420 x 640, widened to 240 when the height allows)
//   --crop-margin 16                   CSS px around the element's box
//   --keep-frames                      keep the screencast JPEGs in --out/frames after encoding (gitignored out/, never
//                                      viewed or committed) so a later --phase encode (another --fps) needs no recapture;
//                                      without it encode deletes them and a later --phase encode refuses
//   --self-test                        check the crop geometry and exit (no Chrome, no lock)
//   --phase all|capture|encode         capture = Chrome only (frames + capture.json); encode = ffmpeg from capture.json
//   --runs 3                           runs per side and scene; the clip shows each side's median run, the snippet
//                                      lists every run's counts
//   --fps 30 --panel-width 216         video grid and the width of each phone panel in px (the clip is 2 panels + 16)
//   --max-mb 1                         per-scene MP4 cap: the encoder raises CRF (27, 30, 33, 36) until the clip fits
//   --pages-url <url>                  where the Pages copy lives, for the artifact's fallback line (default: a
//                                      PAGES_URL placeholder for the lead to fill in)
//   --cpu 6 --latency 150              calibrated defaults (CLAUDE.md "Calibrated measurement setting")
//   --take-lock                        take the chrome-measure hold itself (lock.mjs run, a normal timing hold for
//                                      capture/all, a --no-timing hold for encode). Without it the script refuses to
//                                      run outside a chrome-measure hold (FW_LOCK_HELD naming the current holder).
//   --owner <name>                     lock and server owner (default art-beforeafter)
//   --hold-seconds 480                 --take-lock's capture hold cap (60-600; encode holds stay 300)
//
// Method: one headed Chrome (tools/lib/cdp.mjs launchChrome), viewport 430x932 DPR 3 with touch emulation, CPU throttle
// 6x, served by tools/serve.mjs --vendors=local --https --latency 150 on --port auto. Per scene and side: a fresh
// isolated context, load + settle, move to the scene's start (unthrottled, in 300 px steps), throttle, then
// Page.startScreencast (JPEG, frames stamped by the browser) and an in-page rAF logger while the scene's script runs
// (verify.mjs's input: scrollBy 250 px smooth every 300 ms; the end scene adds verify's 4 touch drags past the end).
// Sides alternate per run (A B, B A, ...); each clip shows that side's median run of --runs. Encoding: each side's frames are placed on a constant fps grid by their
// timestamps (a stall plays as a freeze), a frame-time strip from the rAF log goes under each panel (grey, amber
// k>=5 = dt>=37.5 ms, red k>=7 = dt>=54.17 ms; bar width = the frame's duration, height = its dt up to 100 ms), a
// white playhead runs over both strips. Outputs in --out: <scene>.mp4 (H.264, the only encoder output; no image
// output, git-guard I-064 and the lead's ruling), snippet-pages.html (media/<scene>.mp4 by path),
// snippet-artifact.html (the MP4s inline as data: URIs, plus a fallback line to the Pages copy), capture.json (every frame's time and the per-side counts).
//
// It is an illustration, not a measurement: one run per side, with the screencast's own cost on both sides. It can't
// show finger input, the phone's real feel or Safari-only costs. The iPhone, its screen recorder and the Simulator
// are not used (user T-018).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitOnHelp } from '../../../tools/lib/help.mjs';
import { CDP, gotoAndSettle, launchChrome, sleep } from '../../../tools/lib/cdp.mjs';
import { parseHeld, status as lockStatus, timedInSlotRefusal } from '../../../tools/lib/lock.mjs';
import { REPO, resolveTree } from '../../../tools/lib/paths.mjs';

exitOnHelp(import.meta.url);

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const die = (msg, code = 2) => { console.error(`before-after: ${msg}`); process.exit(code); };

const OWNER = opt('owner', 'art-beforeafter');
const BUILD = opt('build', 'v8-best');
const BASE_TREE = opt('baseline', 'site-pretty');
const PHASE = opt('phase', 'all');
const FPS = Number(opt('fps', 30));
const PANEL_W = Math.round(Number(opt('panel-width', 216)) / 2) * 2;
const MAX_BYTES = Number(opt('max-mb', 1)) * 1024 * 1024;
const PAGES_URL = opt('pages-url', 'PAGES_URL');
const CPU = Number(opt('cpu', 6));
const LATENCY = Number(opt('latency', 150));
const RUNS = Math.max(1, Number(opt('runs', 3)));
const HOLD_S = Math.min(600, Math.max(60, Number(opt('hold-seconds', 480))));
const CROP_SEL = opt('crop', null);                                   // overrides the scenes' own crop selector
const CROP_MARGIN = Math.max(0, Number(opt('crop-margin', 16)));      // CSS px around the element's box
const CROP_ZOOM = Math.max(1, Number(opt('crop-zoom', 2)));           // panel px per CSS px of the crop
const CROP_DPR = Math.min(3, Math.max(1, Number(opt('crop-dpr', 2))));// screencast px per CSS px when cropping
const KEEP_FRAMES = flag('keep-frames');
const buildName = existsSync(resolve(BUILD)) ? basename(resolve(BUILD)).replace(/\.diff$/, '') : BUILD;
const LABEL = opt('label', buildName.replace(/-best$/, ''));
const OUT = resolve(REPO, opt('out', join('out', 'before-after', buildName.replace(/[^\w.-]+/g, '_'))));
if (!['all', 'capture', 'encode'].includes(PHASE)) die(`--phase must be all, capture or encode (got ${PHASE})`);

// Scenes: start = where the page is moved before recording (null = top); rest = ms at rest before the input;
// stopY = scroll until scrollY >= stopY (null = to the bottom); morph = verify's 4 touch drags past the end.
const VP = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 };
const SCENES = {
  hero: { title: 'Top of the page: 2 s at rest, then a scroll through the hero to 1,500 px', start: null, rest: 2000, stopY: 1500, morph: false },
  switch: { title: 'The section switch about 2,600 px down: a scroll from 1,900 to 3,400 px', start: 1900, rest: 500, stopY: 3400, morph: false },
  end: { title: 'The end of the page: the last 1,100 px, then four touch drags past the end (the menu morph)', start: 'end-1100', rest: 500, stopY: null, morph: true },
  full: { title: 'The whole page: 2 s at rest, a scroll to the bottom, then four touch drags past the end', start: null, rest: 2000, stopY: null, morph: true },
  // worst cases (T-170 #75/#76): Chrome ports of the phone's own G-driver flick scripts, chosen before any capture
  // (fixes/v8-best/phone/g/flick-hero-v1.json and flick-fresh-v1.json), not tuned on the result
  fling: { title: 'Fast flicks at the top: 3 s at rest, then fast flicks down past 1,800 px and back to the top, twice', start: null, rest: 3000, kind: 'flicks', cycles: 2, flickToY: 1800 },
  load: { title: 'Right after load: a reload, then three fast flicks 0.3 s after the page is ready, with no rest', start: null, kind: 'fresh', flicks: 3, afterReadyMs: 300 },
  // the four trouble spots (T-170 #87): each clip cut to one element; inputs chosen before any capture, not tuned.
  // cropAt: which box reads make the rectangle (start = before the input, end = after it, default both). The cards
  // start low on the screen and leave it (start box only); the menu's middle exists only once the menu is open (end)
  cards: { title: 'The hero cards as the hero scrolls out: 2 s at rest, then a scroll to 1,500 px (the hero scene\'s input)', start: null, rest: 2000, stopY: 1500, morph: false, crop: '.mobile-deck .orbit-card', cropAt: 'start' },
  nav: { title: 'The top bar as the sections pass under it: 1 s at rest, then a scroll from the top to the bottom', start: null, rest: 1000, stopY: null, morph: false, crop: '.start-selling-top-nav' },
  countdown: { title: 'The countdown at the top, at rest: 6 s, no input', start: null, rest: 6000, kind: 'rest', crop: '.hero-copy .countdown' },
  menu: { title: 'The end-of-page menu: the last 1,100 px, then four touch drags past the end (the end scene\'s input)', start: 'end-1100', rest: 500, stopY: null, morph: true, crop: '.start-selling-morph-center', cropAt: 'end' },
};
// One flick = the phone scripts' stroke: a 560 px touch swipe in 140 ms (4,000 px/s; CDP's synthetic swipe moves at a
// constant speed, the phone's fling profile speeds up to its lift-off), and the page keeps going on its own (fling
// allowed). Down flicks 350 ms apart, up flicks 1,200 ms apart, as in the phone scripts. Finger up = page down.
const FLICK = { x: 215, px: 560, speed: 4000, gapMs: 350, upGapMs: 1200, fingerUpFrom: 760, fingerDownFrom: 200, maxPerLeg: 6 };
const SCENE_LIST = opt('scenes', 'hero,switch,end').split(',').map((s) => s.trim()).filter(Boolean);
for (const s of SCENE_LIST) if (!SCENES[s]) die(`unknown scene "${s}" (known: ${Object.keys(SCENES).join(', ')})`);

// union of boxes, plus the margin, clamped to the viewport, to whole CSS px
function cropRect(boxes, margin, vw = VP.width, vh = VP.height) {
  const b = boxes.filter(Boolean);
  if (!b.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...b.map((r) => r.x)) - margin)), y0 = Math.max(0, Math.floor(Math.min(...b.map((r) => r.y)) - margin));
  const x1 = Math.min(vw, Math.ceil(Math.max(...b.map((r) => r.x + r.w)) + margin)), y1 = Math.min(vh, Math.ceil(Math.max(...b.map((r) => r.y + r.h)) + margin));
  return x1 - x0 >= 8 && y1 - y0 >= 8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
// the panel size for a crop: zoom x the CSS size, widened to 240 when the height allows (the header label needs it);
// even numbers for H.264. A wide, flat crop (w >= 2.5 h: the top bar, the countdown) is stacked (original above, the
// build below) at up to 840 x 320 per panel; any other is side by side at up to 420 x 640
function cropPanel(c, zoom) {
  const stack = c.w >= 2.5 * c.h, maxW = stack ? 840 : 420, maxH = stack ? 320 : 640;
  const z = Math.min(zoom, maxW / c.w, maxH / c.h), even = (v) => Math.max(2, Math.round(v / 2) * 2);
  let w = even(c.w * z), h = even(c.h * z);
  if (w < 240) { const k = Math.min(240 / w, maxH / h); w = even(w * k); h = even(h * k); }
  return { w, h, stack };
}
// ffmpeg crop in the frame's own pixels: iw / viewport width = screencast px per CSS px
const cropFilter = (c, vw = VP.width) => `crop=w=iw*${c.w}/${vw}:h=iw*${c.h}/${vw}:x=iw*${c.x}/${vw}:y=iw*${c.y}/${vw}`;


// --self-test: the crop geometry (no Chrome, no lock, no files): exit 0 when every check holds
if (flag('self-test')) {
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`self-test FAIL ${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  eq(cropRect([{ x: 100, y: 50, w: 100, h: 40 }], 16), { x: 84, y: 34, w: 132, h: 72 }, 'one box + margin');
  eq(cropRect([{ x: 100, y: 50, w: 100, h: 40 }, { x: 150, y: 500, w: 10, h: 10 }], 0), { x: 100, y: 50, w: 100, h: 460 }, 'union');
  eq(cropRect([{ x: -20, y: -30, w: 500, h: 2000 }], 16), { x: 0, y: 0, w: 430, h: 932 }, 'clamped to the viewport');
  eq(cropRect([null, { x: 10.4, y: 20.6, w: 50.2, h: 30.1 }], 0), { x: 10, y: 20, w: 51, h: 31 }, 'null skipped, outward rounding');
  eq(cropRect([null, null], 16), null, 'nothing matched');
  eq(cropRect([{ x: 429, y: 10, w: 40, h: 40 }], 0), null, 'too thin after clamping');
  eq(cropPanel({ w: 150, h: 70 }, 2), { w: 300, h: 140, stack: false }, 'zoom 2');
  eq(cropPanel({ w: 430, h: 300 }, 2), { w: 420, h: 294, stack: false }, 'capped at 420 wide');
  eq(cropPanel({ w: 200, h: 900 }, 2), { w: 142, h: 640, stack: false }, 'the height cap wins over the min width');
  eq(cropPanel({ w: 60, h: 40 }, 2), { w: 240, h: 160, stack: false }, 'small crop widened to 240');
  eq(cropPanel({ w: 430, h: 84 }, 2), { w: 840, h: 164, stack: true }, 'a flat bar is stacked, up to 840 wide');
  eq(cropPanel({ w: 408, h: 126 }, 2), { w: 816, h: 252, stack: true }, 'stacked at zoom 2');
  eq(cropFilter({ x: 84, y: 34, w: 132, h: 72 }), 'crop=w=iw*132/430:h=iw*72/430:x=iw*84/430:y=iw*34/430', 'ffmpeg crop');
  console.log('before-after self-test: 13 checks ok');
  process.exit(0);
}

// ---- the lock: run only inside a chrome-measure hold (or take one) ---------------------------------------------------
function holdState() {
  const tok = parseHeld(process.env.FW_LOCK_HELD)['chrome-measure'];
  const h = lockStatus('chrome-measure').holder;
  if (!tok || !h || h.token !== tok) return null;
  return { owner: h.owner, noTiming: !!h.noTiming, gate: h.gate ?? null, gateTimeout: !!h.gateTimeout };
}
const slot = timedInSlotRefusal('before-after.mjs');
if (slot && PHASE !== 'encode') die(slot);
const held = holdState();
if (!held || (held.noTiming && PHASE !== 'encode')) {
  if (!flag('take-lock')) {
    die(`refusing: ${held ? 'this is a --no-timing hold; a capture needs a normal (timing) chrome-measure hold' : 'not inside a chrome-measure hold'} (Hard rule 7). Add --take-lock, or run:\n  node tools/lock.mjs run chrome-measure --owner ${OWNER} --max-seconds 480 --doing "before/after capture for the article" -- node ${relative(REPO, SELF)} ${argv.join(' ')}`);
  }
  const rest = argv.filter((a) => a !== '--take-lock');
  const lockArgs = ['tools/lock.mjs', 'run', 'chrome-measure', '--owner', OWNER, '--max-seconds', PHASE === 'encode' ? '300' : String(HOLD_S),
    ...(PHASE === 'encode' ? ['--no-timing'] : []), '--doing', `before/after ${PHASE === 'encode' ? 'encode' : 'capture'} for the article (baseline vs ${buildName})`,
    '--', process.execPath, SELF, ...rest];
  console.log(`before-after: taking the chrome-measure hold: node ${lockArgs.join(' ')}`);
  const r = spawnSync(process.execPath, lockArgs, { cwd: REPO, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
console.log(`before-after: inside the chrome-measure hold of "${held.owner}"${held.noTiming ? ' (no-timing)' : ''}; phase ${PHASE}; out ${relative(REPO, OUT)}`);
// a timing hold granted after a host-gate TIMEOUT ran on a busy Mac: its runs would be contaminated, so capture refuses
// (exit 3) and the caller requeues; the gate record goes into capture.json either way
if (PHASE !== 'encode' && held.gateTimeout) die(`the chrome-measure hold was granted after a host-gate TIMEOUT (${JSON.stringify(held.gate)}): the Mac was not quiet, so no capture; requeue`, 3);
mkdirSync(OUT, { recursive: true });

// ---- the after side: an overlay dir from a fix name, a patch or a dir ------------------------------------------------
const sha12 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
function patchFiles(p) { return [...readFileSync(p, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim()); }
function buildOverlay() {
  const asPath = resolve(BUILD);
  if (existsSync(asPath) && statSync(asPath).isDirectory()) return { dir: asPath, source: relative(REPO, asPath), files: [] };
  const patch = existsSync(asPath) && statSync(asPath).isFile() ? asPath : join(REPO, 'fixes', BUILD, 'patch.diff');
  if (!existsSync(patch)) die(`--build ${BUILD}: no overlay dir, patch file or fixes/${BUILD}/patch.diff`);
  const dir = join(OUT, 'overlay');
  rmSync(dir, { recursive: true, force: true });
  const base = resolveTree(BASE_TREE), files = patchFiles(patch);
  for (const rel of files) { const dst = join(dir, rel); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(base, rel), dst); }
  const r = spawnSync('git', ['apply', '--whitespace=nowarn', `--directory=${relative(REPO, dir)}`, patch], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) die(`git apply ${relative(REPO, patch)} failed:\n${r.stdout}${r.stderr}`);
  return { dir, source: relative(REPO, patch), patchSha12: sha12(patch), files: files.map((f) => ({ path: `/${f}`, sha12: sha12(join(dir, f)) })) };
}

// ---- servers ---------------------------------------------------------------------------------------------------------
const children = [];
process.on('exit', () => { for (const c of children) { try { process.kill(c.pid, 'SIGTERM'); } catch {} } });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));
async function startServer(name, overlay) {
  const state = join(OUT, `serve-${name}.json`);
  rmSync(state, { force: true });
  const args = ['tools/serve.mjs', '--root', BASE_TREE, ...(overlay ? ['--overlay', overlay] : []), '--vendors=local', '--https',
    '--latency', String(LATENCY), '--port', 'auto', '--no-http-twin', '--state', state, '--owner', OWNER, '--doing', `before/after capture: ${name}`];
  const log = join(OUT, `serve-${name}.log`);
  const c = spawn(process.execPath, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  c.stdout.on('data', (d) => chunks.push(d)); c.stderr.on('data', (d) => chunks.push(d));
  c.on('exit', () => writeFileSync(log, Buffer.concat(chunks)));
  children.push(c);
  for (let i = 0; i < 300; i++) {
    if (c.exitCode !== null) die(`serve.mjs (${name}) exited ${c.exitCode}: ${Buffer.concat(chunks).toString().slice(-800)}`, 3);
    if (existsSync(state)) { try { const st = JSON.parse(readFileSync(state, 'utf8')); if (st.url) return st; } catch {} }
    await sleep(100);
  }
  die(`serve.mjs (${name}) did not write ${state} in 30 s`, 3);
}

// ---- capture ---------------------------------------------------------------------------------------------------------
const LOGGER = `(() => { const L = window.__ba = { log: [], on: true }; let last = null;
  const f = (t) => { if (!L.on) return; const now = performance.timeOrigin + t; if (last !== null) L.log.push([Math.round(now * 100) / 100, Math.round((now - last) * 100) / 100]); last = now; requestAnimationFrame(f); };
  requestAnimationFrame(f); return true; })()`;
const nowExpr = 'performance.timeOrigin + performance.now()';
const action = (sc) => `new Promise((res) => {
  const t0 = ${nowExpr};
  setTimeout(() => {
    let still = 0, ticks = 0;
    const id = setInterval(() => {
      const y = scrollY; ticks++;
      if (${sc.stopY ?? 'Infinity'} <= y) { clearInterval(id); return res({ t0, tScrollEnd: ${nowExpr}, ticks, y }); }
      window.scrollBy({ top: 250, behavior: 'smooth' });
      setTimeout(() => {
        if (scrollY === y) still++; else still = 0;
        if (still >= 2 || ticks > 400) { clearInterval(id); res({ t0, tScrollEnd: ${nowExpr}, ticks, y: scrollY }); }
      }, 280);
    }, 300);
  }, ${sc.rest});
})`;
const moveTo = (y) => `new Promise(async (res) => { const target = ${y}; while (Math.abs(scrollY - target) > 1) { const d = target - scrollY;
  window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60));
  if (scrollY + innerHeight >= document.documentElement.scrollHeight - 1 && d > 0) break; } res(scrollY); })`;

// ---- crop: the union of the matching elements' boxes (viewport CSS px), read only outside the recorded window -------
const boxExpr = (sel) => `(() => { const r = [...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.getBoundingClientRect())
  .filter((b) => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth);
  if (!r.length) return null; const x0 = Math.min(...r.map((b) => b.left)), y0 = Math.min(...r.map((b) => b.top));
  return { x: x0, y: y0, w: Math.max(...r.map((b) => b.right)) - x0, h: Math.max(...r.map((b) => b.bottom)) - y0, n: r.length }; })()`;
// ---- flick scenes: driven from here over CDP (touch swipes with fling), the page's scrollY polled between swipes ----
async function flick(page, dir, strokes) {
  const y0 = await page.eval('scrollY'), t = Date.now();
  await page.send('Input.synthesizeScrollGesture', { x: FLICK.x, y: dir === 'down' ? FLICK.fingerUpFrom : FLICK.fingerDownFrom,
    yDistance: dir === 'down' ? -FLICK.px : FLICK.px, speed: FLICK.speed, gestureSourceType: 'touch', preventFling: false, repeatCount: 1 });
  strokes.push({ dir, y0, callMs: Date.now() - t });
}
async function settled(page, timeoutMs = 5000) { // scrollY unchanged over 3 polls 100 ms apart, or the timeout
  const end = Date.now() + timeoutMs;
  let last = await page.eval('scrollY'), still = 0;
  while (Date.now() < end && still < 3) { await sleep(100); const y = await page.eval('scrollY'); still = y === last ? still + 1 : 0; last = y; }
  return last;
}
async function flickCycles(page, sc, t0) { // flick-hero-v1: down until y >= flickToY, settle, up until the top, settle, rest 1 s
  const strokes = [];
  for (let c = 0; c < sc.cycles; c++) {
    for (let i = 0; i < FLICK.maxPerLeg && (await page.eval('scrollY')) < sc.flickToY; i++) { await flick(page, 'down', strokes); await sleep(FLICK.gapMs); }
    await settled(page);
    for (let i = 0; i < FLICK.maxPerLeg && (await page.eval('scrollY')) > 0; i++) { await flick(page, 'up', strokes); await sleep(FLICK.upGapMs); }
    await settled(page);
    await sleep(1000);
  }
  return { t0, tScrollEnd: await page.eval(nowExpr), ticks: strokes.length, y: await page.eval('scrollY'), strokes };
}

async function captureOne(cdp, url, sc) {
  const page = await cdp.newIsolatedPage();
  try {
    await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', VP);
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.bringToFront');
    await gotoAndSettle(page, url, { quietMs: 2000 });
    await sleep(1500);
    if (sc.kind === 'fresh') return await captureFresh(page, sc);
    let startY = 0;
    if (sc.start !== null) {
      const y = sc.start === 'end-1100' ? await page.eval('document.documentElement.scrollHeight - innerHeight - 1100') : sc.start;
      startY = await page.eval(moveTo(Math.max(0, y)), { timeout: 60000 });
      await sleep(1500);
    }
    await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await sleep(1000);
    const frames = [];
    const off = page.on((m) => {
      if (m.method !== 'Page.screencastFrame') return;
      const { data, metadata, sessionId } = m.params;
      frames.push({ ts: metadata.timestamp * 1000, data });
      page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    const cropSel = CROP_SEL ?? sc.crop ?? null;
    const boxStart = cropSel ? await page.eval(boxExpr(cropSel)) : null;
    await page.eval(LOGGER);
    const scW = cropSel ? VP.width * CROP_DPR : PANEL_W * 2;
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: scW, maxHeight: Math.round(scW * VP.height / VP.width), everyNthFrame: 1 });
    await sleep(600);
    let act;
    if (sc.kind === 'flicks') { const t0 = await page.eval(nowExpr); await sleep(sc.rest); act = await flickCycles(page, sc, t0); }
    else if (sc.kind === 'rest') { const t0 = await page.eval(nowExpr); await sleep(sc.rest); act = { t0, tScrollEnd: await page.eval(nowExpr), ticks: 0, y: await page.eval('scrollY') }; }
    else act = await page.eval(action(sc), { timeout: 300000 });
    if (sc.morph) {
      await sleep(400);
      for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
      await sleep(2000);
    } else {
      await sleep(800);
    }
    const tEnd = await page.eval(nowExpr);
    await page.send('Page.stopScreencast');
    await page.eval('window.__ba.on = false');
    const log = await page.eval('window.__ba.log');
    off();
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const morphState = await page.eval(`document.querySelector('.start-selling-top-nav')?.className ?? null`);
    const crop = cropSel ? { selector: cropSel, boxStart, boxEnd: await page.eval(boxExpr(cropSel)), screencastWidth: scW } : null;
    return { startY, t0: act.t0, tScrollEnd: act.tScrollEnd, tEnd, ticks: act.ticks, endY: act.y, frames, log, morphState, ...(act.strokes ? { strokes: act.strokes } : {}), ...(crop ? { crop } : {}) };
  } finally {
    await page.close();
  }
}

// flick-fresh-v1: the page is loaded once (warm cache, as the phone's reload), then throttled and reloaded; 300 ms after
// the new document is ready (DOMContentLoaded; the phone waits for readyState != loading) come 3 down flicks 350 ms
// apart, a settle (up to 5 s) and 1.5 s at rest. The rAF logger is in the page from its first script on; the
// screencast starts at DOMContentLoaded; the clip and the counts start at the first flick.
async function captureFresh(page, sc) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LOGGER });
  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await sleep(1000);
  const frames = [];
  const off = page.on((m) => {
    if (m.method !== 'Page.screencastFrame') return;
    const { data, metadata, sessionId } = m.params;
    frames.push({ ts: metadata.timestamp * 1000, data });
    page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const ready = page.waitFor((m) => m.method === 'Page.domContentEventFired', 60000);
  await page.send('Page.reload', { ignoreCache: false });
  await ready;
  const readyMac = Date.now(), tReady = await page.eval(nowExpr);
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: PANEL_W * 2, maxHeight: Math.round(PANEL_W * 2 * VP.height / VP.width), everyNthFrame: 1 });
  await sleep(Math.max(0, sc.afterReadyMs - (Date.now() - readyMac)));
  const strokes = [], t0 = await page.eval(nowExpr);
  for (let i = 0; i < sc.flicks; i++) { if (i) await sleep(FLICK.gapMs); await flick(page, 'down', strokes); }
  await settled(page);
  const tScrollEnd = await page.eval(nowExpr);
  await sleep(1500);
  const tEnd = await page.eval(nowExpr);
  await page.send('Page.stopScreencast');
  await page.eval('window.__ba.on = false');
  const log = await page.eval('window.__ba.log');
  off();
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const loadMs = await page.eval(`Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? 0)`);
  return { startY: 0, tReady, t0, tScrollEnd, tEnd, ticks: strokes.length, endY: await page.eval('scrollY'), frames, log, morphState: null, strokes, loadEventEndMs: loadMs };
}

const kOf = (dt) => Math.round(dt / (1000 / 120));
function counts(log, from, to) {
  const inWin = log.filter(([t]) => t > from && t <= to);
  return { frames: inWin.length, k5: inWin.filter(([, dt]) => kOf(dt) >= 5).length, k7: inWin.filter(([, dt]) => kOf(dt) >= 7).length,
    maxMs: Math.round(Math.max(0, ...inWin.map(([, dt]) => dt))) };
}

async function capture() {
  const overlay = buildOverlay();
  console.log(`after side: ${overlay.source}${overlay.files.length ? ` -> ${overlay.files.map((f) => `${f.path} ${f.sha12}`).join(', ')}` : ''}`);
  const servers = { before: await startServer('before', null), after: await startServer('after', overlay.dir) };
  for (const [k, s] of Object.entries(servers)) console.log(`  ${k}: ${s.url}${s.baseline ? ` (baseline ${s.baseline.snapshot ?? JSON.stringify(s.baseline)})` : ''}`);
  const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
  if (ch.headless) die('Chrome runs headless: refused (a headless compositor is not what the page shows)', 2);
  const cdp = await CDP.connect(ch.wsUrl);
  const meta = { at: new Date().toISOString(), owner: OWNER, chrome: ch.browser, viewport: VP, cpu: CPU, latency: LATENCY, fps: FPS, panelWidth: PANEL_W,
    build: { name: buildName, label: LABEL, ...overlay, dir: undefined }, baselineTree: BASE_TREE, baseline: servers.before.baseline ?? null, hostGate: held.gate, load1Start: Math.round(loadavg()[0] * 10) / 10, scenes: {} };
  try {
    await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
    console.log('Chrome warm-up 8 s'); await sleep(8000);
    let flip = false;
    for (const name of SCENE_LIST) {
      const sc = SCENES[name], runs = { before: [], after: [] }, orders = [];
      for (let run = 0; run < RUNS; run++) {
        const order = flip ? ['after', 'before'] : ['before', 'after'];
        flip = !flip; orders.push(order);
        for (const side of order) {
          process.stdout.write(`scene ${name}, run ${run + 1}/${RUNS}, ${side} ... `);
          const r = await captureOne(cdp, servers[side].url, sc);
          const dir = join(OUT, 'frames', `${name}-${side}-run${run + 1}`);
          rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
          r.frames.forEach((f, i) => { f.file = `f${String(i).padStart(5, '0')}.jpg`; writeFileSync(join(dir, f.file), Buffer.from(f.data, 'base64')); delete f.data; });
          const c = counts(r.log, r.t0, r.tEnd);
          runs[side].push({ ...r, run: run + 1, frameDir: relative(OUT, dir), counts: c });
          console.log(`${r.frames.length} captured frames, ${r.log.length} rAF frames, ${((r.tEnd - r.t0) / 1000).toFixed(1)} s; >=37.5 ms ${c.k5}, >=54 ms ${c.k7}, max ${c.maxMs} ms${sc.morph ? `; nav "${r.morphState}"` : ''}`);
        }
      }
      // the clip shows each side's MEDIAN run (by >=54 ms, then >=37.5 ms, then the longest frame), not a lucky or an
      // unlucky one; the other runs keep only their counts (their frames are deleted here)
      const sides = {};
      for (const side of ['before', 'after']) {
        const sorted = [...runs[side]].sort((a, b) => a.counts.k7 - b.counts.k7 || a.counts.k5 - b.counts.k5 || a.counts.maxMs - b.counts.maxMs);
        const pick = sorted[Math.floor((sorted.length - 1) / 2)];
        for (const r of runs[side]) if (r !== pick) rmSync(join(OUT, r.frameDir), { recursive: true, force: true });
        sides[side] = { ...pick, allRuns: runs[side].map((r) => ({ run: r.run, ...r.counts })) };
        console.log(`  ${name} ${side}: shows run ${pick.run} (median of ${RUNS} by >=54 ms, >=37.5 ms, max)`);
      }
      const crop = sides.before.crop ? { selector: sides.before.crop.selector, margin: CROP_MARGIN, zoom: CROP_ZOOM,
        at: CROP_SEL ? 'both' : (sc.cropAt ?? 'both'),
        rect: cropRect(['before', 'after'].flatMap((k) => { const c = sides[k].crop, at = CROP_SEL ? 'both' : (sc.cropAt ?? 'both');
          return [at !== 'end' ? c?.boxStart : null, at !== 'start' ? c?.boxEnd : null]; }), CROP_MARGIN) } : null;
      if (crop && !crop.rect) die(`scene ${name}: crop selector ${crop.selector} matched no visible element at the start or end of the shown runs`, 1);
      if (crop) console.log(`  ${name} crop ${crop.selector}: ${JSON.stringify(crop.rect)} CSS px (union of both shown runs' ${crop.at === 'both' ? 'start and end' : crop.at} boxes, +${CROP_MARGIN} px, clamped)`);
      meta.scenes[name] = { title: sc.title, orders, runs: RUNS, sides, ...(crop ? { crop } : {}) };
    }
  } finally {
    cdp.close();
    await ch.close();
    meta.load1End = Math.round(loadavg()[0] * 10) / 10;
  }
  writeFileSync(join(OUT, 'capture.json'), JSON.stringify(meta, null, 1));
  return meta;
}

// ---- encode ----------------------------------------------------------------------------------------------------------
const STRIP_H = 40, HDR_H = 30, GAP = 16, BG = [0x1a, 0x21, 0x1e];
const COL = { ok: [0x6b, 0x7d, 0x75], k5: [0xe2, 0xb8, 0x4a], k7: [0xff, 0x6b, 0x4a], line: [0x33, 0x40, 0x3b] };
function stripPPM(file, log, t0, D, W) {
  const px = Buffer.alloc(W * STRIP_H * 3);
  const set = (x, y, c) => { if (x < 0 || x >= W || y < 0 || y >= STRIP_H) return; const o = (y * W + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; };
  for (let i = 0; i < W * STRIP_H; i++) px.set(BG, i * 3);
  const yOf = (ms) => STRIP_H - 2 - Math.round((Math.min(ms, 100) / 100) * (STRIP_H - 4));
  for (const ms of [37.5, 54.17]) for (let x = 0; x < W; x += 3) set(x, yOf(ms), COL.line);
  for (const [t, dt] of log) {
    const start = t - dt - t0;
    if (t - t0 <= 0 || start >= D) continue;
    const k = kOf(dt), c = k >= 7 ? COL.k7 : k >= 5 ? COL.k5 : COL.ok;
    const x0 = Math.floor((start / D) * W), x1 = Math.max(x0 + 1, Math.floor(((t - t0) / D) * W));
    for (let x = x0; x < x1; x++) for (let y = yOf(dt); y < STRIP_H - 1; y++) set(x, y, c);
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${W} ${STRIP_H}\n255\n`), px]));
}
function concatList(file, side, dir, t0, D) {
  const n = Math.ceil((D / 1000) * FPS), fr = side.frames, lines = ['ffconcat version 1.0'];
  if (!fr.length) die(`no screencast frames in ${dir}`, 1);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / FPS;
    while (j + 1 < fr.length && fr[j + 1].ts <= t) j++;
    lines.push(`file '${join(dir, fr[j].file)}'`, `duration ${(1 / FPS).toFixed(6)}`);
  }
  lines.push(`file '${join(dir, fr[j].file)}'`);
  writeFileSync(file, lines.join('\n') + '\n');
}
const FONT = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'].find((f) => existsSync(f));
function ff(args, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: OUT, encoding: 'utf8' });
  if (r.status !== 0) die(`ffmpeg (${what}) failed: ${r.stderr.slice(-1500)}`, 1);
}
const size = (f) => statSync(f).size;
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

function encode(meta) {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) die('ffmpeg not found (brew install ffmpeg)', 1);
  const W0 = PANEL_W, H0 = Math.round((W0 * VP.height) / VP.width / 2) * 2, work = join(OUT, 'work');
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'label-before.txt'), 'BEFORE  original page');
  writeFileSync(join(work, 'label-after.txt'), `AFTER  ${meta.build.label}`);
  const out = {};
  for (const name of Object.keys(meta.scenes)) {
    const s = meta.scenes[name], A = s.sides.before, B = s.sides.after;
    // a cropped scene: both sides cut to the same viewport rectangle (CSS px), scaled to its own panel size
    const cp = s.crop?.rect ? cropPanel(s.crop.rect, s.crop.zoom ?? CROP_ZOOM) : null;
    const W = cp ? cp.w : W0, H = cp ? cp.h : H0, pre = cp ? `${cropFilter(s.crop.rect)},` : '', stack = !!cp?.stack;
    const D = Math.max(A.tEnd - A.t0, B.tEnd - B.t0) + 300;
    const inputs = [];
    for (const [k, side] of [['before', A], ['after', B]]) {
      concatList(join(work, `${name}-${k}.ffconcat`), side, join(OUT, side.frameDir), side.t0, D);
      stripPPM(join(work, `${name}-${k}-strip.ppm`), side.log, side.t0, D, W);
      inputs.push(k);
    }
    const Dsec = (D / 1000).toFixed(3), text = (k, x) => FONT ? `,drawtext=fontfile='${FONT}':textfile='${join(work, `label-${k}.txt`)}':x=${x}:y=9:fontsize=14:fontcolor=0xe2e9e5` : '';
    const fc = [
      `[0:v]fps=${FPS},${pre}scale=${W}:${H}:flags=lanczos,setsar=1[a]`, `[1:v]fps=${FPS},${pre}scale=${W}:${H}:flags=lanczos,setsar=1[b]`,
      `[2:v]fps=${FPS},setsar=1[sa]`, `[3:v]fps=${FPS},setsar=1[sb]`,
      `[a][sa]vstack[ac]`, `[b][sb]vstack[bc]`,
      ...(stack ? [ // original above, the build below, each with its own label row
        `[ac]pad=${W}:${HDR_H + H + STRIP_H + GAP}:0:${HDR_H}:color=0x1a211e${text('before', 8)}[acp]`,
        `[bc]pad=${W}:${HDR_H + H + STRIP_H}:0:${HDR_H}:color=0x1a211e${text('after', 8)}[bcp]`, `[acp][bcp]vstack[h]`,
      ] : [
        `[ac]pad=${W + GAP}:${H + STRIP_H}:0:0:color=0x1a211e[acp]`, `[acp][bc]hstack[s]`,
        `[s]pad=iw:ih+${HDR_H}:0:${HDR_H}:color=0x1a211e${text('before', 8)}${text('after', W + GAP + 8)}[h]`,
      ]),
      `color=c=white:s=2x${STRIP_H}:r=${FPS}[ph]`, `[ph]split[p1][p2]`,
      `[h][p1]overlay=x='min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0[h1]`,
      stack ? `[h1][p2]overlay=x='min(t/${Dsec},1)*${W - 2}':y=${2 * HDR_H + 2 * H + STRIP_H + GAP}:eval=frame:shortest=0,format=yuv420p[v]`
        : `[h1][p2]overlay=x='${W + GAP}+min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0,format=yuv420p[v]`,
    ].join(';');
    const mp4 = join(OUT, `${name}.mp4`);
    for (const crf of [27, 30, 33, 36]) {
    ff(['-f', 'concat', '-safe', '0', '-i', join(work, `${name}-before.ffconcat`), '-f', 'concat', '-safe', '0', '-i', join(work, `${name}-after.ffconcat`),
      '-loop', '1', '-i', join(work, `${name}-before-strip.ppm`), '-loop', '1', '-i', join(work, `${name}-after-strip.ppm`),
      '-filter_complex', fc, '-map', '[v]', '-t', Dsec, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], `${name} mp4`);
      out[name] = { mp4, D, crf, ...(stack ? { w: W, h: 2 * (HDR_H + H + STRIP_H) + GAP } : { w: 2 * W + GAP, h: HDR_H + H + STRIP_H }), ...(cp ? { crop: s.crop.rect, stacked: stack } : {}) };
      if (size(mp4) <= MAX_BYTES) break;
    }
    console.log(`  ${name}.mp4 ${mb(size(mp4))} (${(D / 1000).toFixed(1)} s, ${out[name].w}x${out[name].h}, crf ${out[name].crf})${size(mp4) > MAX_BYTES ? ` OVER the ${mb(MAX_BYTES)} cap` : ''}`);
  }
  writeSnippets(meta, out);
  meta.encoded = Object.fromEntries(Object.entries(out).map(([k, o]) => [k, { mp4: basename(o.mp4), mp4Bytes: size(o.mp4), crf: o.crf, fps: FPS, seconds: Math.round(o.D / 100) / 10, width: o.w, height: o.h, ...(o.crop ? { crop: o.crop } : {}) }]));
  rmSync(work, { recursive: true, force: true });
  // the screencast frames are intermediate files nobody views (lead's ruling): delete them, keep the MP4s and the
  // per-frame times (capture.json: screencast stamps and the rAF log behind the strips). --keep-frames leaves them in
  // the gitignored out/ dir so a later --phase encode (another --fps or crop) needs no recapture
  if (KEEP_FRAMES) { writeFileSync(join(OUT, 'capture.json'), JSON.stringify(meta, null, 1)); return; }
  rmSync(join(OUT, 'frames'), { recursive: true, force: true });
  for (const s of Object.values(meta.scenes)) for (const side of Object.values(s.sides)) { side.frames = side.frames.map((f) => f.ts); side.framesDeleted = true; }
  writeFileSync(join(OUT, 'capture.json'), JSON.stringify(meta, null, 1));
}

// ---- the article snippet ---------------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function writeSnippets(meta, out) {
  const date = meta.at.slice(0, 10), js = meta.build.files?.find((f) => f.path.endsWith('.js'));
  const runsLine = (s) => (s.sides.before.allRuns?.length > 1 ? `. All ${s.sides.before.allRuns.length} runs, 54 ms or more: ${s.sides.before.allRuns.map((r) => r.k7).join(', ')} → ${s.sides.after.allRuns.map((r) => r.k7).join(', ')}` : '');
  const sceneBlock = (name, media) => {
    const s = meta.scenes[name], a = s.sides.before.counts, b = s.sides.after.counts;
    return `  <div class="ba-scene">
    <div class="res-head"><span>${esc(s.title)}</span><span class="v">original · ${esc(meta.build.label)}</span></div>
    ${media(name, out[name])}
    <div class="res-nums">Shown runs, original → ${esc(meta.build.label)}: frames of 54 ms or more ${a.k7} → ${b.k7}, of 37.5 ms or more ${a.k5} → ${b.k5}, longest ${a.maxMs} → ${b.maxMs} ms${runsLine(s)}</div>
  </div>`;
  };
  const fig = (media) => `<!-- before-after: generated by research/team-article/capture/before-after.mjs on ${meta.at} (baseline ${esc(meta.baseline?.snapshot ?? meta.baselineTree)} vs ${esc(meta.build.source)}${js ? `, JS ${js.sha12}` : ''}) -->
<style>
.ba { display: grid; gap: 1.25rem; }
.ba-scene { display: grid; gap: 0.45rem; }
.ba-scene video { width: 100%; max-width: ${Math.round(((2 * PANEL_W + GAP) * 1.25) / 16)}rem; height: auto; display: block; margin-inline: auto; border: 1px solid var(--grid); border-radius: 6px; background: #1a211e; }
.ba-legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.25rem; font-size: 0.88rem; color: var(--ink-soft); }
</style>
<figure class="wide surface shot ba" aria-labelledby="ba-cap">
  <p class="label">Before and after: the same scripted ${Object.keys(out).some((n) => SCENES[n]?.kind) ? 'input' : 'scroll'}, original page vs ${esc(meta.build.label)}</p>
${Object.keys(out).map((n) => sceneBlock(n, media)).join('\n')}
  <div class="ba-legend" aria-hidden="true"><span><i class="swatch" style="background:#6b7d75"></i>frame on time</span><span><i class="swatch" style="background:#e2b84a"></i>37.5 ms or more (k ≥ 5)</span><span><i class="swatch" style="background:#ff6b4a"></i>54 ms or more (k ≥ 7)</span><span>white line: playhead</span></div>
  <figcaption id="ba-cap">Left, the original page (the frozen copy we measure against); right, ${esc(meta.build.label)}. Both ran in Chrome on the Mac, emulating the iPhone's screen (430×932, touch) with the page's main thread slowed ${meta.cpu}×. That is the setting that reproduces the phone's scripted-scroll stutter counts. Both sides got the same script${(meta.scenes[Object.keys(out)[0]].runs ?? 1) > 1 ? `, ${meta.scenes[Object.keys(out)[0]].runs} runs each, and each clip shows that side's middle run (by its slow-frame count)` : ', one run each'}; both clocks start at the first input, so where one side freezes, that page drew no new frame. The strip under each clip is that run's frame times: a bar's width is how long the frame took. This is an illustration, not a measurement. The screen capture costs work on both sides, and the numbers in this article come from repeated A/B runs. It can't show a finger on the glass, how the phone really feels, or costs that only Safari has. Several ${esc(meta.build.label)} changes only act in Safari (the hero's CSS mode, the animations Safari runs on its scroll thread), so Chrome understates them. Captured ${date}${meta.baseline?.snapshot ? `, baseline snapshot ${esc(meta.baseline.snapshot)}` : ''}.</figcaption>
</figure>
`;
  const dims = (o) => `width="${o.w}" height="${o.h}"${o.crop ? ` style="max-width: ${Math.round((o.w * (o.stacked ? 1 : 1.25)) / 16 * 10) / 10}rem"` : ''}`;
  const alt = (name, o) => `${o?.stacked ? 'One above the other' : 'Side by side'}: ${meta.scenes[name].title.toLowerCase()}, original page ${o?.stacked ? 'above' : 'on the left'}, ${meta.build.label} ${o?.stacked ? 'below' : 'on the right'}, with each run's frame times underneath`;
  writeFileSync(join(OUT, 'snippet-pages.html'), fig((name, o) => `<video src="media/${basename(o.mp4)}" ${dims(o)} autoplay muted loop playsinline controls preload="metadata" aria-label="${esc(alt(name, o))}"></video>`));
  // the single-file artifact: the MP4s inline as data: URIs, with a visible fallback line to the Pages copy
  writeFileSync(join(OUT, 'snippet-artifact.html'), fig((name, o) => `<video src="data:video/mp4;base64,${readFileSync(o.mp4).toString('base64')}" ${dims(o)} autoplay muted loop playsinline controls aria-label="${esc(alt(name, o))}"></video>
    <p class="note">If the clip doesn't play here, watch it on the <a href="${esc(PAGES_URL.replace(/\/?$/, '/'))}media/${basename(o.mp4)}">published copy</a>.</p>`));
  for (const f of ['snippet-pages.html', 'snippet-artifact.html']) console.log(`  ${f} ${mb(size(join(OUT, f)))}`);
}

// ---- main ------------------------------------------------------------------------------------------------------------
const t = Date.now();
let meta;
if (PHASE === 'encode') {
  const f = join(OUT, 'capture.json');
  if (!existsSync(f)) die(`--phase encode: no ${relative(REPO, f)} (run --phase capture first)`);
  meta = JSON.parse(readFileSync(f, 'utf8'));
  const gone = Object.entries(meta.scenes).filter(([, s]) => Object.values(s.sides).some((d) => d.framesDeleted));
  if (gone.length) die(`--phase encode: the screencast frames of ${gone.map(([n]) => n).join(', ')} were deleted by an earlier encode (capture.json framesDeleted); recapture (with --keep-frames to allow later re-encodes)`, 1);
} else {
  meta = await capture();
}
if (PHASE !== 'capture') encode(meta);
console.log(`before-after: done in ${Math.round((Date.now() - t) / 1000)} s -> ${relative(REPO, OUT)}`);
process.exit(0);

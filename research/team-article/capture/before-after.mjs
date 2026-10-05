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
//   --scenes hero,switch,end           which scenes (default all three; `full` = one top-to-menu run)
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
};
const SCENE_LIST = opt('scenes', 'hero,switch,end').split(',').map((s) => s.trim()).filter(Boolean);
for (const s of SCENE_LIST) if (!SCENES[s]) die(`unknown scene "${s}" (known: ${Object.keys(SCENES).join(', ')})`);

// ---- the lock: run only inside a chrome-measure hold (or take one) ---------------------------------------------------
function holdState() {
  const tok = parseHeld(process.env.FW_LOCK_HELD)['chrome-measure'];
  const h = lockStatus('chrome-measure').holder;
  if (!tok || !h || h.token !== tok) return null;
  return { owner: h.owner, noTiming: !!h.noTiming };
}
const slot = timedInSlotRefusal('before-after.mjs');
if (slot && PHASE !== 'encode') die(slot);
const held = holdState();
if (!held || (held.noTiming && PHASE !== 'encode')) {
  if (!flag('take-lock')) {
    die(`refusing: ${held ? 'this is a --no-timing hold; a capture needs a normal (timing) chrome-measure hold' : 'not inside a chrome-measure hold'} (Hard rule 7). Add --take-lock, or run:\n  node tools/lock.mjs run chrome-measure --owner ${OWNER} --max-seconds 480 --doing "before/after capture for the article" -- node ${relative(REPO, SELF)} ${argv.join(' ')}`);
  }
  const rest = argv.filter((a) => a !== '--take-lock');
  const lockArgs = ['tools/lock.mjs', 'run', 'chrome-measure', '--owner', OWNER, '--max-seconds', PHASE === 'encode' ? '300' : '480',
    ...(PHASE === 'encode' ? ['--no-timing'] : []), '--doing', `before/after ${PHASE === 'encode' ? 'encode' : 'capture'} for the article (baseline vs ${buildName})`,
    '--', process.execPath, SELF, ...rest];
  console.log(`before-after: taking the chrome-measure hold: node ${lockArgs.join(' ')}`);
  const r = spawnSync(process.execPath, lockArgs, { cwd: REPO, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
console.log(`before-after: inside the chrome-measure hold of "${held.owner}"${held.noTiming ? ' (no-timing)' : ''}; phase ${PHASE}; out ${relative(REPO, OUT)}`);
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
    await page.eval(LOGGER);
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: PANEL_W * 2, maxHeight: Math.round(PANEL_W * 2 * VP.height / VP.width), everyNthFrame: 1 });
    await sleep(600);
    const act = await page.eval(action(sc), { timeout: 300000 });
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
    return { startY, t0: act.t0, tScrollEnd: act.tScrollEnd, tEnd, ticks: act.ticks, endY: act.y, frames, log, morphState };
  } finally {
    await page.close();
  }
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
    build: { name: buildName, label: LABEL, ...overlay, dir: undefined }, baselineTree: BASE_TREE, baseline: servers.before.baseline ?? null, load1Start: Math.round(loadavg()[0] * 10) / 10, scenes: {} };
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
      meta.scenes[name] = { title: sc.title, orders, runs: RUNS, sides };
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
  const W = PANEL_W, H = Math.round((W * VP.height) / VP.width / 2) * 2, work = join(OUT, 'work');
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'label-before.txt'), 'BEFORE  original page');
  writeFileSync(join(work, 'label-after.txt'), `AFTER  ${meta.build.label}`);
  const out = {};
  for (const name of Object.keys(meta.scenes)) {
    const s = meta.scenes[name], A = s.sides.before, B = s.sides.after;
    const D = Math.max(A.tEnd - A.t0, B.tEnd - B.t0) + 300;
    const inputs = [];
    for (const [k, side] of [['before', A], ['after', B]]) {
      concatList(join(work, `${name}-${k}.ffconcat`), side, join(OUT, side.frameDir), side.t0, D);
      stripPPM(join(work, `${name}-${k}-strip.ppm`), side.log, side.t0, D, W);
      inputs.push(k);
    }
    const Dsec = (D / 1000).toFixed(3), text = (k, x) => FONT ? `,drawtext=fontfile='${FONT}':textfile='${join(work, `label-${k}.txt`)}':x=${x}:y=9:fontsize=14:fontcolor=0xe2e9e5` : '';
    const fc = [
      `[0:v]fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1[a]`, `[1:v]fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1[b]`,
      `[2:v]fps=${FPS},setsar=1[sa]`, `[3:v]fps=${FPS},setsar=1[sb]`,
      `[a][sa]vstack[ac]`, `[b][sb]vstack[bc]`,
      `[ac]pad=${W + GAP}:${H + STRIP_H}:0:0:color=0x1a211e[acp]`, `[acp][bc]hstack[s]`,
      `[s]pad=iw:ih+${HDR_H}:0:${HDR_H}:color=0x1a211e${text('before', 8)}${text('after', W + GAP + 8)}[h]`,
      `color=c=white:s=2x${STRIP_H}:r=${FPS}[ph]`, `[ph]split[p1][p2]`,
      `[h][p1]overlay=x='min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0[h1]`,
      `[h1][p2]overlay=x='${W + GAP}+min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0,format=yuv420p[v]`,
    ].join(';');
    const mp4 = join(OUT, `${name}.mp4`);
    for (const crf of [27, 30, 33, 36]) {
    ff(['-f', 'concat', '-safe', '0', '-i', join(work, `${name}-before.ffconcat`), '-f', 'concat', '-safe', '0', '-i', join(work, `${name}-after.ffconcat`),
      '-loop', '1', '-i', join(work, `${name}-before-strip.ppm`), '-loop', '1', '-i', join(work, `${name}-after-strip.ppm`),
      '-filter_complex', fc, '-map', '[v]', '-t', Dsec, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], `${name} mp4`);
      out[name] = { mp4, D, crf, w: 2 * W + GAP, h: HDR_H + H + STRIP_H };
      if (size(mp4) <= MAX_BYTES) break;
    }
    console.log(`  ${name}.mp4 ${mb(size(mp4))} (${(D / 1000).toFixed(1)} s, ${out[name].w}x${out[name].h}, crf ${out[name].crf})${size(mp4) > MAX_BYTES ? ` OVER the ${mb(MAX_BYTES)} cap` : ''}`);
  }
  writeSnippets(meta, out);
  meta.encoded = Object.fromEntries(Object.entries(out).map(([k, o]) => [k, { mp4: basename(o.mp4), mp4Bytes: size(o.mp4), crf: o.crf, seconds: Math.round(o.D / 100) / 10, width: o.w, height: o.h }]));
  // the screencast frames are intermediate files nobody views (lead's ruling): delete them, keep the MP4s and the
  // per-frame times (capture.json: screencast stamps and the rAF log behind the strips)
  rmSync(join(OUT, 'frames'), { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
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
  <p class="label">Before and after: the same scripted scroll, original page vs ${esc(meta.build.label)}</p>
${Object.keys(out).map((n) => sceneBlock(n, media)).join('\n')}
  <div class="ba-legend" aria-hidden="true"><span><i class="swatch" style="background:#6b7d75"></i>frame on time</span><span><i class="swatch" style="background:#e2b84a"></i>37.5 ms or more (k ≥ 5)</span><span><i class="swatch" style="background:#ff6b4a"></i>54 ms or more (k ≥ 7)</span><span>white line: playhead</span></div>
  <figcaption id="ba-cap">Left, the original page (the frozen copy we measure against); right, ${esc(meta.build.label)}. Both ran in Chrome on the Mac, emulating the iPhone's screen (430×932, touch) with the page's main thread slowed ${meta.cpu}×. That is the setting that reproduces the phone's scripted-scroll stutter counts. Both sides got the same script${(meta.scenes[Object.keys(out)[0]].runs ?? 1) > 1 ? `, ${meta.scenes[Object.keys(out)[0]].runs} runs each, and each clip shows that side's middle run (by its slow-frame count)` : ', one run each'}; both clocks start at the first input, so where one side freezes, that page drew no new frame. The strip under each clip is that run's frame times: a bar's width is how long the frame took. This is an illustration, not a measurement. The screen capture costs work on both sides, and the numbers in this article come from repeated A/B runs. It can't show a finger on the glass, how the phone really feels, or costs that only Safari has. Several ${esc(meta.build.label)} changes only act in Safari (the hero's CSS mode, the animations Safari runs on its scroll thread), so Chrome understates them. Captured ${date}${meta.baseline?.snapshot ? `, baseline snapshot ${esc(meta.baseline.snapshot)}` : ''}.</figcaption>
</figure>
`;
  const dims = (o) => `width="${o.w}" height="${o.h}"`;
  const alt = (name) => `Side by side: ${meta.scenes[name].title.toLowerCase()}, original page on the left, ${meta.build.label} on the right, with each run's frame times underneath`;
  writeFileSync(join(OUT, 'snippet-pages.html'), fig((name, o) => `<video src="media/${basename(o.mp4)}" ${dims(o)} autoplay muted loop playsinline controls preload="metadata" aria-label="${esc(alt(name))}"></video>`));
  // the single-file artifact: the MP4s inline as data: URIs, with a visible fallback line to the Pages copy
  writeFileSync(join(OUT, 'snippet-artifact.html'), fig((name, o) => `<video src="data:video/mp4;base64,${readFileSync(o.mp4).toString('base64')}" ${dims(o)} autoplay muted loop playsinline controls aria-label="${esc(alt(name))}"></video>
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
} else {
  meta = await capture();
}
if (PHASE !== 'capture') encode(meta);
console.log(`before-after: done in ${Math.round((Date.now() - t) / 1000)} s -> ${relative(REPO, OUT)}`);
process.exit(0);

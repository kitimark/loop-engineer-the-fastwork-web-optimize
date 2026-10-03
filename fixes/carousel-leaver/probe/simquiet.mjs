// carousel-leaver P-090 (G attempt 1, describes only): quiet-rest crops of the avatar carousel in the Simulator, both
// as WebKit's software snapshot (Page.snapshotRect) and as the composited frame on screen (`xcrun simctl io <udid>
// screenshot`, the Simulator's own screenshot; lead route 2026-10-04). No timing.
// Per arm (as simcrop.mjs): serve the snapshot with --no-cache, check the served hashes (VOID on mismatch), `sim.mjs
// open`, settle 4 s, centre the carousel at 0.5 vh, settle 2.5 s. Then:
//   1. the rotator's setTimeout is wrapped (held callbacks wait); a slide whose leaver has the target pathname is caught
//      at its first rAF and its animations are paused; they are set to 220 ms (their end), the held timer is released
//      (the swap) and held again at once, so the carousel then stays at rest.
//   2. QUIET ms (default 1500) with no snapshot and no screenshot (WebKit's ImageQualityController returns to Default
//      quality 500 ms after the last resized paint, F-200);
//   3. scr-quiet-<arm>.png: the on-screen frame (simctl screenshot, full device), FIRST, before any snapshot;
//   4. nat-quiet-<arm>.png: Page.snapshotRect of the carousel +- 4 CSS px; a second one 250 ms later must be identical
//      (settle check: one pair, no loop; not identical -> the arm is VOID);
//   5. the on-screen crop: the snapshot is located in the screenshot by the least sum of absolute differences over
//      integer offsets (x within +-12 device px of 3 * rect.x, y from 3 * rect.y - 60 to 3 * rect.y + 600; VOID when the
//      mean absolute difference per channel is > 20 levels; the snapshot's device-px
//      size must equal 3 x its CSS rect), saved as scrc-quiet-<arm>.png with the same size as nat-quiet;
//   6. burst arms only (CL_BURST=a,b): an in-page rAF logger records each slide's start and end in Date.now() (the
//      Simulator and the Mac share one clock), the held timer is released (the next slide starts at once), and for
//      BURST_MS (default 2600) a simctl screenshot is started every 100 ms with at most 4 in flight; each records its
//      start and exit time. Each is cropped at the arm's located offset -> burst/<arm>-<nn>.png.
// CL_NOSLIDE=1 (the reduced-motion leg, `sim.mjs session --reduce-motion on`): no slide is caught (the rotator never
// slides under reduced motion, JS L11346); a rAF logger checks that none starts in 2 s (else VOID), then 2-5 as above.
// Every arm records matchMedia('(prefers-reduced-motion: reduce)') and the slots' computed transform / opacity /
// will-change at quiet rest (the overlays applied).
// At the end every arm pair is compared at quiet, on screen (scrc) and in the snapshot (nat), with png.mjs cmp.
// node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-carousel-leaver -- \
//   node tools/sim.mjs session --functional --owner fix-carousel-leaver -- node fixes/carousel-leaver/probe/simquiet.mjs <out> base,S=<dir>,...
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
import { pngPixels, pngEncode, cmp } from './png.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = process.argv[2]; mkdirSync(join(OUT, 'burst'), { recursive: true });
const ARMS = process.argv[3].split(',').map((s) => { const [k, d] = s.split('='); return { k, dir: d || null }; });
const BURST = new Set((process.env.CL_BURST || '').split(',').filter(Boolean));
const QUIET = Number(process.env.CL_QUIET || 1500), BURST_MS = Number(process.env.BURST_MS || 2600);
const NOSLIDE = process.env.CL_NOSLIDE === '1'; // reduced-motion leg (sim.mjs session --reduce-motion on): no slide to catch
const UDID = process.env.FW_SIM_UDID;
if (!UDID) throw new Error('FW_SIM_UDID not set: run inside sim.mjs session');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileOf = (arm, f) => (arm.dir && existsSync(join(arm.dir, f)) ? join(arm.dir, f) : join(BASE, f));
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch (e) { return ''; } }`;
const HOLD = `(() => { if (window.__holdInstalled) return 1; window.__holdInstalled = 1; const st = window.setTimeout.bind(window); window.__hold = false; window.__held = [];
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st(fn, ms, ...a);
    return st(() => { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); }; return 1; })()`;
const SLIDING = `((c) => !!(c && (c.querySelector('img.is-exit') || c.classList.contains('is-sliding'))))(${CAR})`;
const LEAD = `((c) => c && c.querySelector('img.is-exit, img.st5-lead'))(${CAR})`;
const CATCH = (target, timeout) => `(window.__cc = null, new Promise((res) => { const P = ${PATH}; const t0 = performance.now(); let was = ${SLIDING};
  const tick = () => { const on = ${SLIDING}; const lead = ${LEAD};
    if (on && !was && lead && (${JSON.stringify(target)} === null || P(lead) === ${JSON.stringify(target)})) {
      const c = ${CAR}; window.__hold = true; window.__lead = lead;
      window.__anims = [...c.querySelectorAll('img')].flatMap((i) => i.getAnimations()); window.__anims.forEach((a) => a.pause());
      return res({ ok: true, lead: P(lead), srcs: [...c.querySelectorAll('img')].map(P), cls: [...c.querySelectorAll('img')].map((i) => i.className), n: window.__anims.length, waited: Math.round(performance.now() - t0) }); }
    was = on; if (performance.now() - t0 > ${timeout}) return res({ ok: false }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }).then((r) => { window.__cc = JSON.stringify(r); }), 1)`;
const RAF2 = `(window.__r2 = 0, requestAnimationFrame(() => requestAnimationFrame(() => { window.__r2 = 1; })), 1)`;
const SLOTS = `JSON.stringify([...${CAR}.querySelectorAll('img')].map((i) => { const cs = getComputedStyle(i), r = i.getBoundingClientRect();
  return { cls: i.className, src: (${PATH})(i), x: +r.left.toFixed(4), w: +r.width.toFixed(4), tr: cs.transform, tl: cs.translate, op: cs.opacity, wc: cs.willChange, ir: cs.imageRendering }; }))`;
// slide logger for the burst: start / end of every slide in Date.now() (shared clock with the Mac)
const LOGGER = `(() => { window.__sl = []; window.__slStop = 0; let was = ${SLIDING}; const P = ${PATH};
  const tick = () => { const on = ${SLIDING}; if (on !== was) { const lead = ${LEAD}; window.__sl.push({ on, t: Date.now(), lead: lead ? P(lead) : null }); was = on; }
    if (!window.__slStop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`;
// PNG decode with 16-bit support (simctl screenshots); 8-bit goes through png.mjs
function pngAny(buf) {
  const depth = buf[24], ctype = buf[25];
  if (depth === 8) return pngPixels(buf);
  let o = 8, w, h; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[12]) throw new Error('png: interlaced'); } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  if (depth !== 16 || (ctype !== 2 && ctype !== 6)) throw new Error(`png: unsupported depth ${depth} type ${ctype}`);
  const ch = ctype === 6 ? 4 : 3, Bpp = ch * 2, stride = w * Bpp, raw = inflateSync(Buffer.concat(idat)), cur = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) { const a = x >= Bpp ? cur[y * stride + x - Bpp] : 0, b = y ? cur[(y - 1) * stride + x] : 0, c = x >= Bpp && y ? cur[(y - 1) * stride + x - Bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[y * stride + x] = v & 255; } }
  const px = Buffer.alloc(w * h * ch); for (let i = 0; i < w * h * ch; i++) px[i] = cur[i * 2]; // high byte
  return { w, h, bpp: ch, px, depth16: true };
}
const cropOf = (P, x0, y0, w, h) => { const out = Buffer.alloc(w * h * P.bpp);
  for (let y = 0; y < h; y++) P.px.copy(out, y * w * P.bpp, ((y0 + y) * P.w + x0) * P.bpp, ((y0 + y) * P.w + x0 + w) * P.bpp);
  return { w, h, bpp: P.bpp, px: out }; };
// locate template T (snapshot crop) in screenshot S: least SAD of RGB over integer offsets; coarse (every 3rd px), then full
function locate(S, T, x0, y0, y1) {
  const sad = (dx, dy, step) => { let s = 0; for (let y = 0; y < T.h; y += step) for (let x = 0; x < T.w; x += step) {
    const i = (y * T.w + x) * T.bpp, j = ((dy + y) * S.w + dx + x) * S.bpp; s += Math.abs(T.px[i] - S.px[j]) + Math.abs(T.px[i + 1] - S.px[j + 1]) + Math.abs(T.px[i + 2] - S.px[j + 2]); } return s; };
  let best = null;
  for (let dy = Math.max(0, y0); dy <= Math.min(y1, S.h - T.h); dy++) for (let dx = Math.max(0, x0 - 12); dx <= Math.min(x0 + 12, S.w - T.w); dx++) {
    const s = sad(dx, dy, 3); if (!best || s < best.s) best = { dx, dy, s }; }
  const cands = [];
  for (let dy = best.dy - 2; dy <= best.dy + 2; dy++) for (let dx = best.dx - 2; dx <= best.dx + 2; dx++) if (dy >= 0 && dx >= 0 && dy + T.h <= S.h && dx + T.w <= S.w) cands.push({ dx, dy, s: sad(dx, dy, 1) });
  cands.sort((a, b) => a.s - b.s);
  return { dx: cands[0].dx, dy: cands[0].dy, sadPerPx: +(cands[0].s / (T.w * T.h * 3)).toFixed(3), second: cands[1] ? +(cands[1].s / (T.w * T.h * 3)).toFixed(3) : null };
}
const shot = (file) => new Promise((res) => { const t0 = Date.now(); const p = spawn('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; }); p.on('close', (code) => res({ t0, t1: Date.now(), code, err: code ? err.slice(0, 200) : undefined })); });
const res = { tool: 'carousel-leaver simquiet (P-090)', note: 'Simulator: quiet-rest crops, snapshotRect and simctl screenshot; burst of screenshots; no timing', startedAt: new Date().toISOString(), quietMs: QUIET, burstMs: BURST_MS, arms: {} };
const save = () => writeFileSync(join(OUT, 'simquiet.json'), JSON.stringify(res, null, 1));
let TARGET = process.env.CL_TARGET || null;
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm.k}.json`); rmSync(st, { force: true });
  const ov = arm.dir ? ['--overlay', arm.dir] : [];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null;
  const R = (res.arms[arm.k] = {});
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm.k} server did not start`);
    const url = `http://localhost:${s.port}/`;
    R.served = {};
    for (const f of [NODE, CSS]) {
      const got = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())), want = sha(readFileSync(fileOf(arm, f)));
      if (got !== want) throw new Error(`VOID: ${arm.k} serves ${f} ${got.slice(0, 12)}, expected ${want.slice(0, 12)}`);
      R.served[f.split('/').pop()] = got.slice(0, 12);
    }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    const poll = async (expr, ms) => { let v = null; for (let i = 0; i < ms / 50 && !v; i++) { v = await ev(expr); if (!v) await sleep(50); } return v; };
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    const geoJs = `JSON.stringify((() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - 0.5 * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { vh: innerHeight, vw: innerWidth, dpr: devicePixelRatio, y: scrollY, carTop: q.top, carLeft: q.left, carW: q.width, carH: q.height, inView: q.top >= 0 && q.bottom <= innerHeight }; })())`;
    R.geo = JSON.parse(await ev(geoJs)); await sleep(2500); R.geo2 = JSON.parse(await ev(geoJs));
    if (!R.geo2.inView) throw new Error(`VOID: carousel not in view ${JSON.stringify(R.geo2)}`);
    const g = R.geo2; const rect = { x: Math.floor(g.carLeft - 4), y: Math.floor(g.carTop - 4) }; rect.width = Math.ceil(g.carLeft + g.carW + 4) - rect.x; rect.height = Math.ceil(g.carTop + g.carH + 4) - rect.y; R.rect = rect;
    R.reducedMotion = await ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
    if (NOSLIDE) {
      // reduced-motion leg: the rotator never slides (JS L11346 `if (!e.matches)`); check that none starts in 2 s
      await ev(LOGGER); await sleep(2000); await ev('(window.__slStop = 1, 1)');
      R.slidesBefore = JSON.parse(await ev('JSON.stringify(window.__sl)'));
      if (R.slidesBefore.length) throw new Error(`VOID: a slide ran in the no-slide leg ${JSON.stringify(R.slidesBefore)}`);
      R.catch = { ok: true, noSlide: true };
    } else {
      await ev(HOLD);
      await ev(CATCH(TARGET, 30000));
      const cc = await poll('window.__cc', 35000);
      R.catch = cc ? JSON.parse(cc) : { ok: false, timeout: true };
      if (!R.catch.ok) throw new Error('VOID: no slide caught');
      if (TARGET === null) TARGET = R.catch.lead;
      // to the slide's end, then the swap; the hold is set again at once so the next 800 ms wait is held too
      await ev(`(() => { window.__anims.forEach((a) => { a.currentTime = 220; }); window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); window.__hold = true; return h.length; })()`);
    }
    await ev(RAF2); await poll('window.__r2', 3000);
    R.slots = JSON.parse(await ev(SLOTS));
    await sleep(QUIET);
    const scrFile = join(OUT, `scr-quiet-${arm.k}.png`);
    R.scr = await shot(scrFile);
    if (R.scr.code) throw new Error(`VOID: simctl screenshot failed ${R.scr.err}`);
    const snap1 = async () => { const r = await c.send('Page.snapshotRect', { ...rect, coordinateSystem: 'Viewport' }, 'page', 20000);
      return Buffer.from(String(r.dataURL).replace(/^data:image\/png;base64,/, ''), 'base64'); };
    const b1 = await snap1(); await sleep(250); const b2 = await snap1();
    const P1 = pngPixels(b1), P2 = pngPixels(b2);
    R.natSettled = P1.w === P2.w && P1.h === P2.h && P1.px.equals(P2.px);
    writeFileSync(join(OUT, `nat-quiet-${arm.k}.png`), b1);
    if (!R.natSettled) throw new Error('VOID: snapshot pair not identical at quiet rest');
    if (P1.w !== rect.width * 3 || P1.h !== rect.height * 3) throw new Error(`VOID: snapshot ${P1.w}x${P1.h} is not 3 x rect ${rect.width}x${rect.height}`);
    const S = pngAny(readFileSync(scrFile)); R.scrSize = [S.w, S.h, S.depth16 ? 16 : 8];
    const T = { ...P1, px: P1.bpp === S.bpp ? P1.px : null };
    if (!T.px) { const px = Buffer.alloc(P1.w * P1.h * S.bpp); for (let i = 0; i < P1.w * P1.h; i++) for (let k = 0; k < 3; k++) px[i * S.bpp + k] = P1.px[i * P1.bpp + k]; T.px = px; T.bpp = S.bpp; }
    R.loc = locate(S, T, rect.x * 3, rect.y * 3 - 60, rect.y * 3 + 600);
    if (R.loc.sadPerPx > 20) throw new Error(`VOID: carousel not found on screen ${JSON.stringify(R.loc)}`);
    const scrc = cropOf(S, R.loc.dx, R.loc.dy, P1.w, P1.h);
    writeFileSync(join(OUT, `scrc-quiet-${arm.k}.png`), pngEncode(scrc.w, scrc.h, scrc.bpp, scrc.px));
    console.log(`${arm.k} served ${JSON.stringify(R.served)} catch ${R.catch.lead} wait ${R.catch.waited} | screen ${R.scrSize} loc ${JSON.stringify(R.loc)} | slots ${R.slots.map((x) => `${x.tr}/${x.op}`).join(' ')}`);
    if (BURST.has(arm.k) && !NOSLIDE) {
      await ev(LOGGER);
      await ev(`(() => { window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); return h.length; })()`);
      const tStart = Date.now(), jobs = []; let inflight = 0, n = 0;
      while (Date.now() - tStart < BURST_MS) {
        if (inflight < 4) { const i = n++; const f = join(OUT, 'burst', `${arm.k}-raw-${String(i).padStart(2, '0')}.png`); inflight++;
          jobs.push(shot(f).then((r) => { inflight--; return { i, f, ...r }; })); }
        await sleep(100);
      }
      const shots = await Promise.all(jobs);
      await ev('(window.__slStop = 1, 1)');
      R.slides = JSON.parse(await ev('JSON.stringify(window.__sl)'));
      R.burst = [];
      for (const b of shots) {
        const o = { i: b.i, t0: b.t0, t1: b.t1, code: b.code };
        if (!b.code) { const B = pngAny(readFileSync(b.f)); const cr = cropOf(B, R.loc.dx, R.loc.dy, P1.w, P1.h);
          writeFileSync(join(OUT, 'burst', `${arm.k}-${String(b.i).padStart(2, '0')}.png`), pngEncode(cr.w, cr.h, cr.bpp, cr.px)); rmSync(b.f, { force: true }); }
        R.burst.push(o);
      }
      console.log(`${arm.k} burst ${shots.length} shots (${shots.filter((x) => x.code).length} failed), exit-start ${shots.map((x) => x.t1 - x.t0).join(',')} ms; slides ${R.slides.map((x) => `${x.on ? 'on' : 'off'}@${x.t - tStart}`).join(' ')}`);
      R.burstStart = tStart;
    }
  } catch (e) {
    R.void = String(e.message || e).startsWith('VOID') ? String(e.message || e) : `VOID: ${String(e.message || e).slice(0, 200)}`; console.log(`${arm.k} ${R.void}`);
  } finally { try { c && c.close(); } catch {} p.kill(); save(); }
}
const keys = ARMS.map((a) => a.k).filter((k) => !res.arms[k].void); res.cmp = {};
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const P = `${keys[i]}~${keys[j]}`; const o = (res.cmp[P] = {});
  for (const kind of ['scrc', 'nat']) try { o[kind] = cmp(join(OUT, `${kind}-quiet-${keys[i]}.png`), join(OUT, `${kind}-quiet-${keys[j]}.png`)); } catch (e) { o[kind] = { error: String(e.message || e) }; }
  console.log(`${P} screen n8 ${o.scrc.n8} max ${o.scrc.max} | snapshot n8 ${o.nat.n8} max ${o.nat.max}`);
}
save(); console.log('EXIT-OK');

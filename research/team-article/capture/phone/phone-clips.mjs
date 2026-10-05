// Phone clips of the trouble spots (T-170 #101): turn the hold.sh recordings into side-by-side MP4s (original | v8)
// with a slow-frame strip under each panel, and print the per-run numbers. Numbers and MP4 only: it never writes an
// image file from a frame and nobody looks at a frame (I-062); the movies are only cropped, scaled and re-encoded.
//
//   node research/team-article/capture/phone/phone-clips.mjs [--runs out/phone-clips/runs] [--out out/phone-clips/clips]
//        [--clips a,c,p,d,t,e,s] [--show 1] [--fps 60] [--no-encode] [--json <file>]   (--scenes: old name of --clips)
//   node research/team-article/capture/phone/phone-clips.mjs --self-test
//
// Inputs per run L = pc-<H>-<scene><arm><n> (hold.sh): runs/L.json (the driver's record), out/iphone-screen/L.mov and
// L.frames.json (ioscap: [pts s, hash, written] per captured frame), runs/stamps.jsonl (Mac wall ns + CLOCK_UPTIME_RAW
// ns at L-pre / L-rec / L-post), runs/vv.jsonl (visualViewport at L-start / L-end).
//
// Strip and counts (lead, change 1): from the page's own frame log (the driver's rAF stamps, [t, dt, y, ...]), phone
// thresholds: dt > 34 and > 50 ms, with the ±4 ms twins (>30/>38, >46/>54) and the near bands (30, 38] / (46, 54].
// The capture's distinct-frame gaps (hash changes) in the same window are a cross-check only (a capture gap may be the
// recorder): printed beside them, and any disagreement in the >34 / >50 counts is flagged CAPTURE-DIFFERS.
//
// Clock link: page performance.now() -> Mac wall ms (G: the segment's sync pairs; S: the probe's clock pair), wall ->
// CLOCK_UPTIME_RAW (the stamps), and UPTIME_RAW == the capture's PTS host clock (OBSERVED: H1 eV1 lag -4 ms, r 0.81).
// Checked per run from numbers: --motion writes each recording's motion trace (ffmpeg metadata text: the mean frame
// difference of the page-area box, 108 px grey; no image), and the lag that best correlates it with the page's scroll
// speed (searched over ±600 ms) must be within 50 ms with r >= 0.5, else CLOCK-CHECK FAIL and the clip is not made.
// (A first draft used the frames' hash changes; the hero's animations change almost every frame, so that can't work.)
//
// Window per scene (fixed before data): e (flick-end-v1) into1 → end; h (flick-hero-v1) down1 → end; f
// (flick-fresh-v1) fresh-flick → end; s (scripted scroll) scroll start → scroll end + 1 s; each ± 300 ms. The new scenes
// (a, p, n) and the clips cut from them (a, c, p, t, d, with crops): CLIPS below. Every clip's label strip says it is the
// real iPhone 15 Pro Max screen (lead, change 5).
// Shown run: the first clean run of each arm (no error, Mac load1 <= 16, no profile drift; was run 1 before hold 2's
// MAC-LOADED runs); all runs' numbers are printed. --motion makes traces for clean runs only (--all-runs: every run;
// --labels L1,L2: just those).
// Crop (privacy, lead's change 2): the page-area box y 119-826 pt of 932, full width, by geometry (no status bar, no
// Safari bar in either position). The close-up (scene e only: the middle of that box, where the end menu opens) is made
// only when every run's viewport read (start and end) has offsetTop 0, scale 1 and height 770-820 (page area covering
// the box); otherwise it is dropped, never widened.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

export const SCREEN = { w: 430, h: 932 };
export const BOX = { y0: 119, y1: 826 };                       // pt, full width
export const CLOSE_E = { x0: 0.08, x1: 0.92, y0: 0.22, y1: 0.78 }; // fractions of BOX
// Close-ups: none. The e close-up (CLOSE_E, the end menu's middle) was dropped by the lead (2026-10-05): the menu never
// opened in flick-end-v1 (morph empty), so a close-up of where it would open misleads. --close-e makes it again.
export const CLOSE = flag('close-e') ? { e: CLOSE_E } : {};
// One script-driven region per scene (lead, T-170 #101 change 2b), screen pt, fixed before any region result was read:
// the top bar (logo and language switch flip colour by script over dark sections; glass, so the content under it also
// shows through blurred) for e and s; the hero card band (the original fades/moves the cards by script every frame,
// v8 by scroll-driven animations) for h and f. Numbers only (a motion trace), never shown, so it need not sit inside
// BOX; it stays inside the page area (below the 59 pt status bar, above the bottom bar).
export const REGIONS = { e: { name: 'top bar', y0: 64, y1: 112 }, s: { name: 'top bar', y0: 64, y1: 112 },
  h: { name: 'hero card band', y0: 560, y1: 800 }, f: { name: 'hero card band', y0: 560, y1: 800 },
  a: { name: 'hero card band', y0: 560, y1: 800 }, p: { name: 'top bar', y0: 64, y1: 112 } };
export const MAC_LOADED = 16; // load1 above it: the capture may drop or delay frames (lead 2026-10-05 04:5xZ)
export const WINDOWS = { e: ['into1', 'end'], h: ['down1', 'end'], f: ['fresh-flick', 'end'], s: ['scroll', 'scroll-end'],
  a: ['fade', 'end'], p: ['page', 'end'], n: ['title', 'end'] };
// New scenes (C-058 notes, T-183; lead's plan 2026-10-05 05:3xZ). Their clock check runs over the scene's window only
// (CLOCK_IN_WINDOW): at rest the hero's own animations swamp the scroll signal (H2 hA1: r .47 over the whole recording).
export const CLOCK_IN_WINDOW = new Set(['a', 'p', 'n']);
// Clips: which run scene each clip is cut from, its window and its crop, all fixed before any phone data.
//   a  the hero cards' fade-out, full page box       (scene a, fade -> end)
//   c  the countdown at rest, crop                  (scene a, 6 s from the same whole second of the page clock on both arms)
//   p  the whole page, slow drags, full page box    (scene p, page -> end)
//   t  the 'People still need people' title, crop   (scene n, title mark - 0.3 s -> carousel mark: the quick stroke that
//      brings it in, its 'o' animation 1.3 s after it is 35 % visible, and the rest)
//   d  the user avatar carousel, crop               (scene n, the last 6 s: at rest after the drags)
// A crop is a full-width screen band around the element where the run's page actually rests (its document y from the
// geometry read minus the run's resting scroll y, plus the viewport's screen offset VIEW_Y), so each arm is cut where its
// own page stopped; the band is padded by CROP_PAD and kept inside the page area.
export const CLIPS = {
  a: { scene: 'a', W: 300 }, p: { scene: 'p', W: 260 }, e: { scene: 'e', W: 300 }, s: { scene: 's', W: 300 }, h: { scene: 'h', W: 300 }, f: { scene: 'f', W: 300 },
  c: { scene: 'a', W: 400, crop: 'countdown', window: 'countdown' },
  t: { scene: 'n', W: 400, crop: 'title', window: ['title', -300, 'carousel', 0] },
  d: { scene: 'n', W: 400, crop: 'communityPill', window: ['end', -6000, 'end', 0] },
};
export const VIEW_Y = 59;   // viewport y 0 on the screen, pt (status bar; OBSERVED assumption, checked per clip: c's 1 Hz)
export const CROP_PAD = 28; // pt above and below the element
export const COUNTDOWN = { seconds: 6, restPadMs: 500, fadePadMs: 300, targetIso: '2026-11-02T05:00:00Z' };
export const PAD_MS = 300, S_TAIL_MS = 1000;
export const VV_OK = { hMin: 770, hMax: 820 };
const TITLES = { e: 'End of the page: flicks into the end and out (robot finger)', s: 'Scripted scroll, top to bottom (dark section, section switches)',
  h: 'Fast flicks through the top card (robot finger)', f: 'Flicks right after load (robot finger)',
  a: 'Hero cards fading out: slow drags from the top (robot finger)', p: 'The whole page, top to end: slow even drags (robot finger)',
  c: 'Countdown clock at rest (crop)', t: "'People still need people' title (crop)", d: 'User avatar carousel at rest (crop)' };
/** The label strip's first line on every clip (lead, change 5): what the viewer is looking at. */
export const banner = (profileName) => `Real iPhone 15 Pro Max screen recording (Safari)${profileName === 'serious' ? ' - heat: Serious (Xcode)' : profileName ? ` - heat: ${profileName}` : ''}`;

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** Page-log counts over frames [t, dt] with t in [a, b]: phone thresholds, twins, near bands, worst. */
export function counts(frames, a = -Infinity, b = Infinity) {
  const c = { frames: 0, gt34: 0, gt50: 0, gt30: 0, gt38: 0, gt46: 0, gt54: 0, near34: 0, near50: 0, maxMs: 0 };
  for (const [t, dt] of frames) {
    if (t < a || t > b || dt == null) continue;
    c.frames++;
    if (dt > 34) c.gt34++; if (dt > 50) c.gt50++; if (dt > 30) c.gt30++; if (dt > 38) c.gt38++; if (dt > 46) c.gt46++; if (dt > 54) c.gt54++;
    if (dt > 30 && dt <= 38) c.near34++; if (dt > 46 && dt <= 54) c.near50++;
    if (dt > c.maxMs) c.maxMs = Math.round(dt * 10) / 10;
  }
  return c;
}

/** Capture distinct-frame gaps (ms) between hash changes whose end falls in [a, b] (seconds of PTS). */
export function captureGaps(capFrames, a, b) {
  const gaps = []; let lastT = null, lastH = null;
  for (const [pts, h] of capFrames) {
    if (h !== lastH) { if (lastT !== null && pts >= a && pts <= b) gaps.push([pts * 1000, (pts - lastT) * 1000]); lastT = pts; lastH = h; }
  }
  return gaps;
}

/** Offsets: page ms -> wall ms (median over sync pairs [macBefore, pageT, macAfter], or one clock pair). */
// S runs: the probe's clock pair is the PHONE's Date.now(), and the phone's wall clock is not the Mac's (H1: the
// phone ~225 ms behind; the motion check failed at lag 224-236 ms until this). The run's own viewport reads give the
// phone-to-Mac offset (Mac Date.now() on return minus the page's Date.now(); median). G runs need none: their sync
// pairs are Mac stamps. Found by the clock check (H1 S runs), and checked against eV2: sync median and its end read
// agree within 4 ms.
export function pageToWall(rec, vvReads = []) {
  const seg = rec?.run?.segments?.[0];
  if (seg?.sync?.length) return median(seg.sync.map(([b, p, a]) => (a + b) / 2 - p));
  const clk = rec?.pre?.clock || rec?.page?.clock || rec?.clock || rec?.result?.clock;
  const off = median(vvReads.filter((r) => Number.isFinite(r.macMs) && Number.isFinite(r.wallMs)).map((r) => r.macMs - r.wallMs));
  if (clk && Number.isFinite(clk.wallMs) && Number.isFinite(clk.perfMs) && off !== null) return clk.wallMs - clk.perfMs + off;
  return null;
}

/** The page log of a driver record: frames [t, dt, y], marks {name: t}. */
export function pageLog(rec) {
  const seg = rec?.run?.segments?.[0];
  if (seg?.frames) {
    const marks = {}; for (const [t, n] of seg.marks || []) marks[n] ??= t;
    return { kind: 'G', frames: seg.frames.map(([t, dt, y]) => [t, dt, y]), marks };
  }
  const fr = rec?.frames || rec?.result?.frames || rec?.probe?.frames;
  if (!fr) return null;
  const mk = rec?.marks || rec?.result?.marks || rec?.probe?.marks || {};
  const marks = {}; for (const [k, v] of Object.entries(mk)) { if (Array.isArray(v)) { marks[k] = v[0]; marks[`${k}-end`] = v[v.length - 1]; } else marks[k] = v; }
  // probe std rows: [t, dt, yStart, yEnd, ...]; legacy scroll rows: [t, dt, y]
  return { kind: 'S', frames: fr.map((r) => [r[0], r[1], r.length >= 4 ? r[3] : r[2]]), marks };
}

/** Lag (ms) that best lines up the capture's motion trace [[movieS, frameDiff]] with the page's scroll speed |dy|/dt
 *  (Pearson r over the trace, searched over ±span ms). The hash test of the first draft could not work here: the hero's
 *  compositor animations change almost every captured frame even at rest (H1 eV1: 3173 of 3178 frames distinct). */
export function clockLag(pageFrames, motion, toMovie, { span = 600, step = 4, from = -Infinity, to = Infinity } = {}) {
  motion = motion?.filter(([tm]) => tm >= from && tm <= to);
  if (!motion?.length || pageFrames.length < 3) return null;
  const pv = []; for (let i = 1; i < pageFrames.length; i++) { const [t, dt, y] = pageFrames[i]; pv.push([toMovie(t), Math.abs(y - pageFrames[i - 1][2]) / Math.max(dt || 0, 1)]); }
  const at = (x) => { let a = 0, b = pv.length - 1; if (x < pv[0][0] || x > pv[b][0]) return null; while (a < b) { const m = (a + b + 1) >> 1; if (pv[m][0] <= x) a = m; else b = m - 1; } return pv[a][1]; };
  const corr = (lag) => {
    const xs = [], ys = []; for (const [tm, v] of motion) { const p = at(tm - lag / 1000); if (p === null) continue; xs.push(v); ys.push(p); }
    const n = xs.length; if (n < 30) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  };
  let best = null;
  for (let lag = -span; lag <= span; lag += step) { const r = corr(lag); if (r !== null && (!best || r > best.r + 1e-9)) best = { lag, r }; }
  return best && { lag: best.lag, r: Math.round(best.r * 1000) / 1000, r0: Math.round((corr(0) ?? NaN) * 1000) / 1000 };
}
export const CLOCK_OK = { maxLagMs: 50, minR: 0.5 };

/** ffmpeg metadata text (pts_time + YAVG per frame) -> [[movieS, value]]. Numbers only. */
export function parseMotion(txt) {
  const mo = []; let t = null;
  for (const l of String(txt).split('\n')) { const a = /pts_time:([\d.]+)/.exec(l); if (a) t = Number(a[1]); const b = /YAVG=([\d.]+)/.exec(l); if (b && t !== null) { mo.push([t, Number(b[1])]); t = null; } }
  return mo;
}
/** The numbers-only motion trace of a recording: the page-area box only (privacy), 108 px wide, grey, the mean absolute
 *  difference to the previous frame. Writes text (metadata=print), never an image. Run it inside a lock hold. */
/** Region trace: same as motionArgs over a full-width band [y0, y1] pt of the screen. */
export const regionArgs = (mov, txt, r) => ['-hide_banner', '-loglevel', 'error', '-i', mov, '-vf',
  `crop=w=iw:h=ih*${r.y1 - r.y0}/${SCREEN.h}:x=0:y=ih*${r.y0}/${SCREEN.h},scale=108:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${txt}`, '-f', 'null', '-'];
/** How a region follows the scroll: lag/r of its trace vs page speed, and stale frames (region still while the page
 *  moves: its change < 25 % of its own 90th-percentile change during motion), with the longest stale run in ms. */
export function regionFollow(pageFrames, region, toMovie, a, b) {
  const lag = clockLag(pageFrames, region, toMovie);
  const pv = []; for (let i = 1; i < pageFrames.length; i++) { const [t, dt, y] = pageFrames[i]; pv.push([toMovie(t), Math.abs(y - pageFrames[i - 1][2]) / Math.max(dt || 0, 1)]); }
  const at = (x) => { let lo = 0, hi = pv.length - 1; if (!pv.length || x < pv[0][0] || x > pv[hi][0]) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pv[m][0] <= x) lo = m; else hi = m - 1; } return pv[lo][1]; };
  const mov = region.filter(([tm]) => tm >= toMovie(a) && tm <= toMovie(b)).map(([tm, v]) => [tm, v, at(tm)]).filter(([, , sp]) => sp !== null && sp > 0.1);
  if (mov.length < 10) return { lagMs: lag?.lag ?? null, r: lag?.r ?? null, movingFrames: mov.length, stalePct: null, longestStaleMs: null };
  const vs = mov.map(([, v]) => v).sort((x, y) => x - y), p90 = vs[Math.floor(0.9 * (vs.length - 1))], th = 0.25 * p90;
  let stale = 0, run = 0, runStart = null, longest = 0;
  for (const [tm, v] of mov) { if (v < th) { stale++; if (runStart === null) runStart = tm; longest = Math.max(longest, (tm - runStart) * 1000 + 16.7); } else runStart = null; }
  return { lagMs: lag?.lag ?? null, r: lag?.r ?? null, movingFrames: mov.length, stalePct: Math.round((stale / mov.length) * 1000) / 10, longestStaleMs: Math.round(longest) };
}
export const motionArgs = (mov, txt) => ['-hide_banner', '-loglevel', 'error', '-i', mov, '-vf',
  `${boxFilter()},scale=108:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${txt}`, '-f', 'null', '-'];

export function vvOk(reads) {
  if (!reads.length) return { ok: false, why: 'no viewport read' };
  for (const r of reads) {
    if (r.vvTop !== 0 || r.vvScale !== 1) return { ok: false, why: `${r.label}: offsetTop ${r.vvTop}, scale ${r.vvScale}` };
    if (!(r.vvH >= VV_OK.hMin && r.vvH <= VV_OK.hMax)) return { ok: false, why: `${r.label}: height ${r.vvH}` };
  }
  return { ok: true };
}

export const boxFilter = (b = BOX) => `crop=w=iw:h=ih*${b.y1 - b.y0}/${SCREEN.h}:x=0:y=ih*${b.y0}/${SCREEN.h}`;
export function closeFilter(c, b = BOX) {
  const H = b.y1 - b.y0, x = c.x0 * SCREEN.w, w = (c.x1 - c.x0) * SCREEN.w, y = b.y0 + c.y0 * H, h = (c.y1 - c.y0) * H;
  return `crop=w=iw*${w.toFixed(1)}/${SCREEN.w}:h=ih*${h.toFixed(1)}/${SCREEN.h}:x=iw*${x.toFixed(1)}/${SCREEN.w}:y=ih*${y.toFixed(1)}/${SCREEN.h}`;
}

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

/** Everything about one run: page log, window, clock chain, counts, capture cross-check. */
export function analyse(L, { runs, screen, stamps, vv }) {
  const rec = readJson(join(runs, `${L}.json`)), cap = readJson(join(screen, `${L}.frames.json`));
  const m = /^pc-(H\d+)-([eshfapn])([AV])(\d+)$/.exec(L); if (!m) return { L, error: 'bad label' };
  const [, hold, scene, arm, n] = m;
  const out = { L, hold, scene, arm, run: Number(n), driver: scene === 's' ? 'S' : 'G' };
  if (!rec) return { ...out, error: 'no driver record' };
  if (!cap) return { ...out, error: 'no capture frames' };
  const log = pageLog(rec); if (!log) return { ...out, error: 'no page frames in the driver record' };
  const [ma, mb] = WINDOWS[scene], a0 = log.marks[ma], b0 = log.marks[mb];
  if (!Number.isFinite(a0) || !Number.isFinite(b0)) return { ...out, error: `marks ${ma}/${mb} missing (have ${Object.keys(log.marks).join(',')})` };
  const a = a0 - PAD_MS, b = b0 + PAD_MS + (scene === 's' ? S_TAIL_MS : 0);
  const p2w = pageToWall(rec, vv.filter((r) => r.label.startsWith(`${L}-`)));
  const st = stamps.filter((s) => s.label.startsWith(`${L}-`));
  const w2u = median(st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6));
  const w2uSpread = st.length ? Math.max(...st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6)) - Math.min(...st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6)) : null;
  if (p2w === null || w2u === null) return { ...out, error: 'no clock link (sync pairs or stamps missing)' };
  const toPts = (t) => (t + p2w - w2u) / 1000;
  const frames = cap.frames.filter((f) => f[2] !== false);
  if (!frames.length) return { ...out, error: 'the capture has no frames (ioscap: no frame arrived from the iPhone screen)' };
  const pts0 = frames[0][0];
  const mtxt = join(runs, `${L}.motion.txt`);
  const lag = existsSync(mtxt) ? clockLag(log.frames, parseMotion(readFileSync(mtxt, 'utf8')), (t) => toPts(t) - pts0,
    CLOCK_IN_WINDOW.has(scene) ? { from: toPts(a) - pts0, to: toPts(b) - pts0 } : {}) : null;
  const page = counts(log.frames, a, b);
  const cg = captureGaps(cap.frames, toPts(a), toPts(b));
  const capture = counts(cg, -Infinity, Infinity);
  const differs = Math.abs(capture.gt34 - page.gt34) > Math.max(1, 0.2 * page.gt34) || Math.abs(capture.gt50 - page.gt50) > Math.max(1, 0.2 * page.gt50);
  const rtxt = join(runs, `${L}.region.txt`);
  const region = existsSync(rtxt) && REGIONS[scene] ? { name: REGIONS[scene].name, ...regionFollow(log.frames, parseMotion(readFileSync(rtxt, 'utf8')), (t) => toPts(t) - pts0, a, b) } : null;
  const mac = rec?.meta?.mac, load1 = [mac?.start?.load1, mac?.end?.load1].filter(Number.isFinite);
  const macLoaded = load1.some((x) => x > MAC_LOADED);
  const prof = rec?.meta?.profile;
  const reads = vv.filter((r) => [`${L}-start`, `${L}-ready`, `${L}-end`].includes(r.label));
  const phoneOff = median(vv.filter((r) => r.label.startsWith(`${L}-`) && Number.isFinite(r.macMs) && Number.isFinite(r.wallMs)).map((r) => r.macMs - r.wallMs));
  return { ...out, window: { from: ma, to: mb, ms: Math.round(b - a) }, page, capture: { ...capture, frames: cg.length, rateHz: cap.frames.length / Math.max(1e-6, cap.frames.at(-1)[0] - cap.frames[0][0]) },
    captureDiffers: differs, clock: { lagMs: lag?.lag ?? null, r: lag?.r ?? null, r0: lag?.r0 ?? null, w2uSpreadMs: w2uSpread === null ? null : Math.round(w2uSpread * 1000) / 1000,
      ok: !!lag && Math.abs(lag.lag) <= CLOCK_OK.maxLagMs && lag.r >= CLOCK_OK.minR, why: existsSync(mtxt) ? null : 'no motion trace (--motion)' },
    movie: { from: toPts(a) - pts0, to: toPts(b) - pts0, written: frames.length, all: cap.frames.length, w: cap.width, h: cap.height },
    profile: prof ? { name: prof.name, start: prof.start?.state ?? prof.start, battC: prof.start?.battC, drift: !!rec.meta.profileDrift } : null,
    viewport: reads.map((r) => ({ label: r.label.slice(L.length + 1), vvH: r.vvH, vvTop: r.vvTop, scale: r.vvScale, innerH: r.innerH })),
    region, mac: { load1, shared: (mac?.start?.shared || []).map((x) => x.owner) }, macLoaded,
    morph: rec?.summary?.morph ?? null, log: log.frames.filter(([t]) => t >= a && t <= b), t0: a, D: b - a,
    // for clips cut from other windows of the same run (c, t, d): the whole page log, its marks and the clock chain
    frames: log.frames, marks: log.marks, toMovie: (t) => toPts(t) - pts0, phoneWall: phoneOff === null ? null : (t) => t + p2w - phoneOff };
}

/** A run seen over another window [a, b] of its page clock (clips c, t, d): what encodePair and the counts need. */
export function view(r, a, b) {
  return { ...r, t0: a, D: b - a, log: r.frames.filter(([t]) => t >= a && t <= b), page: counts(r.frames, a, b),
    movie: { ...r.movie, from: r.toMovie(a), to: r.toMovie(b) }, window: { from: `${Math.round(a)}`, to: `${Math.round(b)}`, ms: Math.round(b - a) } };
}
/** The page-clock window [a, b] of clip `def` in run r (a mark plus an offset at each end), or null. */
export function clipWindow(r, def) {
  if (!Array.isArray(def.window)) return null;
  const [m0, o0, m1, o1] = def.window, a = r.marks[m0], b = r.marks[m1];
  return Number.isFinite(a) && Number.isFinite(b) ? [a + o0, b + o1] : null;
}
/** Countdown window (lead, change 4): the first whole second of the page's own clock (Date.now) that starts COUNTDOWN.seconds
 *  inside every run's rest phase [rest + restPadMs, fade - fadePadMs], at the same second of the minute on every run, so
 *  both sides show the same seconds. Returns {sec, starts: [page ms per run]} or null. r.phoneWall maps page ms -> the
 *  page's Date.now (the Mac clock minus the phone's offset read by vv.mjs). */
export function countdownWindow(runs, { seconds, restPadMs, fadePadMs } = COUNTDOWN) {
  const iv = runs.map((r) => {
    if (!r.phoneWall || !Number.isFinite(r.marks?.rest) || !Number.isFinite(r.marks?.fade)) return null;
    const k = r.phoneWall(0); return { k, lo: r.marks.rest + restPadMs + k, hi: r.marks.fade - fadePadMs + k };
  });
  if (!iv.length || iv.some((x) => !x)) return null;
  const startAt = ({ lo, hi }, sec) => { const w0 = Math.ceil(lo / 1000) * 1000, w = w0 + ((((sec - (w0 / 1000)) % 60) + 60) % 60) * 1000; return w + seconds * 1000 <= hi ? w : null; };
  for (let w = Math.ceil(iv[0].lo / 1000) * 1000; w + seconds * 1000 <= iv[0].hi; w += 1000) {
    const sec = (w / 1000) % 60, ws = iv.map((x) => startAt(x, sec));
    if (ws.every((x) => x !== null)) return { sec, starts: ws.map((x, i) => x - iv[i].k) };
  }
  return null;
}
/** Resting scroll y over the second half of [a, b] (median of the page log's y). */
export function restY(frames, a, b) { const ys = frames.filter(([t]) => t >= (a + b) / 2 && t <= b).map(([, , y]) => y); return median(ys); }
/** Screen band (pt) around element el ({docY, h}, document coordinates) when the page rests at scroll y. */
export function cropBand(el, y, { pad = CROP_PAD, viewY = VIEW_Y, top = VIEW_Y, bottom = BOX.y1 } = {}) {
  if (!el || !Number.isFinite(el.docY) || !Number.isFinite(y)) return null;
  const y0 = Math.max(top, Math.round(el.docY - y + viewY - pad)), y1 = Math.min(bottom, Math.round(el.docY + el.h - y + viewY + pad));
  return y1 - y0 >= 20 ? { y0, y1 } : null;
}
/** Two arms' bands -> one crop height (the larger, centred on each band, kept inside the page area). */
export function pairCrop(bA, bV, { top = VIEW_Y, bottom = BOX.y1 } = {}) {
  if (!bA || !bV) return null;
  const h = Math.max(bA.y1 - bA.y0, bV.y1 - bV.y0);
  const place = (b) => Math.min(bottom - h, Math.max(top, Math.round((b.y0 + b.y1) / 2 - h / 2)));
  const f = (y0) => `crop=w=iw:h=ih*${h}/${SCREEN.h}:x=0:y=ih*${y0}/${SCREEN.h}`;
  const yA = place(bA), yV = place(bV);
  return { w: SCREEN.w, h, yA, yV, filterA: f(yA), filterV: f(yV) };
}
/** Element geometry for the crops: document y as read with the page scrolled to it (the parked read: the content below
 *  the hero sits 48 px higher once the page is scrolled, Simulator 2026-10-05) when there is one, else the read at the top. */
export function elementAt(rects, name) {
  const pk = rects?.parked?.[name], b = pk?.rects?.[name];
  if (b && !b.empty && Number.isFinite(b.y)) return { docY: b.y + pk.y, h: b.h, from: 'parked' };
  const t = rects?.top?.rects?.[name];
  return t && !t.empty ? { docY: t.docY, h: t.h, from: 'top' } : null;
}
/** Countdown visibility check from numbers (the crop band's motion trace over the clip window): the digit changes are
 *  isolated spikes about 1 s apart. Returns the spike times (s) merged within 200 ms; ~COUNTDOWN.seconds expected. */
export function ticks(trace, from, to) {
  const xs = trace.filter(([t]) => t >= from && t <= to); if (xs.length < 10) return [];
  const med = median(xs.map(([, v]) => v)), th = Math.max(5 * med, 0.05), out = [];
  for (const [t, v] of xs) if (v > th && (!out.length || t - out.at(-1) > 0.2)) out.push(t);
  return out;
}

// ---- encode (MP4 only) ------------------------------------------------------------------------------------------
const STRIP_H = 40, HDR_H = 48, GAP = 16, BG = [0x1a, 0x21, 0x1e];
const COL = { ok: [0x6b, 0x7d, 0x75], a34: [0xe2, 0xb8, 0x4a], a50: [0xff, 0x6b, 0x4a], line: [0x33, 0x40, 0x3b] };
/** The strip is drawn from numbers (the page log), never from a frame: a PPM made here is an ffmpeg input only. */
function stripPPM(file, log, t0, D, W) {
  const px = Buffer.alloc(W * STRIP_H * 3);
  const set = (x, y, c) => { if (x < 0 || x >= W || y < 0 || y >= STRIP_H) return; const o = (y * W + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; };
  for (let i = 0; i < W * STRIP_H; i++) px.set(BG, i * 3);
  const yOf = (ms) => STRIP_H - 2 - Math.round((Math.min(ms, 100) / 100) * (STRIP_H - 4));
  for (const ms of [34, 50]) for (let x = 0; x < W; x += 3) set(x, yOf(ms), COL.line);
  for (const [t, dt] of log) {
    if (dt == null) continue;
    const s = t - dt - t0; if (t - t0 <= 0 || s >= D) continue;
    const c = dt > 50 ? COL.a50 : dt > 34 ? COL.a34 : COL.ok;
    const x0 = Math.floor((s / D) * W), x1 = Math.max(x0 + 1, Math.floor(((t - t0) / D) * W));
    for (let x = x0; x < x1; x++) for (let y = yOf(dt); y < STRIP_H - 1; y++) set(x, y, c);
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${W} ${STRIP_H}\n255\n`), px]));
}
const FONT = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'].find((f) => existsSync(f));
function ff(args, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg (${what}) failed: ${r.stderr.slice(-1500)}`);
}
const MAX_BYTES = 1000 * 1000;
function encodePair(name, A, V, { screen, out, fps, crop, W, note, shrunk = false }) {
  const work = join(out, 'work'); mkdirSync(work, { recursive: true });
  const ratio = (A.movie.h / A.movie.w) || SCREEN.h / SCREEN.w;
  const cw = crop.w, ch = crop.h; // pt
  const H = Math.round((W * ch * ratio * SCREEN.w / SCREEN.h) / cw / 2) * 2;
  const D = Math.max(A.D, V.D), Dsec = (D / 1000).toFixed(3);
  writeFileSync(join(work, `${name}-label-A.txt`), `ORIGINAL  run ${A.run}`);
  writeFileSync(join(work, `${name}-label-V.txt`), `v8  run ${V.run}`);
  writeFileSync(join(work, `${name}-label-B.txt`), note || banner(A.profile?.name));
  stripPPM(join(work, `${name}-A-strip.ppm`), A.log, A.t0, D, W);
  stripPPM(join(work, `${name}-V-strip.ppm`), V.log, V.t0, D, W);
  const text = (k, x, y = 27, size = 14, col = '0xe2e9e5') => FONT ? `,drawtext=fontfile='${FONT}':textfile='${join(work, `${name}-label-${k}.txt`)}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${col}` : '';
  const pre = (i) => `[${i}:v]setpts=PTS-STARTPTS,fps=${fps},${i ? crop.filterV || crop.filter : crop.filterA || crop.filter},scale=${W}:${H}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2`;
  const fc = [`${pre(0)}[a]`, `${pre(1)}[b]`, `[2:v]fps=${fps},setsar=1[sa]`, `[3:v]fps=${fps},setsar=1[sb]`,
    `[a][sa]vstack[ac]`, `[b][sb]vstack[bc]`, `[ac]pad=${W + GAP}:${H + STRIP_H}:0:0:color=0x1a211e[acp]`, `[acp][bc]hstack[s]`,
    `[s]pad=iw:ih+${HDR_H}:0:${HDR_H}:color=0x1a211e${text('B', '(w-text_w)/2', 7, 13, '0xf2c14e')}${text('A', 8)}${text('V', W + GAP + 8)}[h]`,
    `color=c=white:s=2x${STRIP_H}:r=${fps}[ph]`, `[ph]split[p1][p2]`,
    `[h][p1]overlay=x='min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0[h1]`,
    `[h1][p2]overlay=x='${W + GAP}+min(t/${Dsec},1)*${W - 2}':y=${HDR_H + H}:eval=frame:shortest=0,format=yuv420p[v]`].join(';');
  const mp4 = join(out, `${name}.mp4`);
  let crf;
  for (crf of [26, 29, 32, 35, 38]) {
    ff(['-ss', A.movie.from.toFixed(3), '-t', Dsec, '-i', join(screen, `${A.L}.mov`), '-ss', V.movie.from.toFixed(3), '-t', Dsec, '-i', join(screen, `${V.L}.mov`),
      '-loop', '1', '-i', join(work, `${name}-A-strip.ppm`), '-loop', '1', '-i', join(work, `${name}-V-strip.ppm`),
      '-filter_complex', fc, '-map', '[v]', '-t', Dsec, '-r', String(fps), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], `${name}`);
    if (statSync(mp4).size <= MAX_BYTES) break;
  }
  // still over 1 MB at the last crf (the long full-page clip): once more at 85 % of the width, same fps
  if (statSync(mp4).size > MAX_BYTES && !shrunk) return encodePair(name, A, V, { screen, out, fps, crop, W: Math.round((W * 0.85) / 2) * 2, note, shrunk: true });
  return { mp4, bytes: statSync(mp4).size, crf, seconds: Math.round(D / 100) / 10, width: 2 * W + GAP, height: HDR_H + H + STRIP_H };
}

/** A run is clean when its driver record exists and shows Mac load1 <= MAC_LOADED at start and end and no profile drift. */
export function cleanRecord(rec) {
  const m = rec?.meta?.mac; if (!m) return false;
  return [m.start?.load1, m.end?.load1].every((x) => Number.isFinite(x) && x <= MAC_LOADED) && !rec.meta.profileDrift;
}
const isClean = (file) => { try { return cleanRecord(JSON.parse(readFileSync(file, 'utf8'))); } catch { return false; } };
/** Write a trace via <txt>.part and rename on success, so a killed hold never leaves a half trace that looks done. */
function trace(what, txt, args) {
  if (existsSync(txt)) return;
  const part = `${txt}.part`; rmSync(part, { force: true });
  const r = spawnSync('ffmpeg', args(part), { encoding: 'utf8' });
  if (r.status === 0 && existsSync(part)) renameSync(part, txt);
  console.log(`${what}: ${r.status === 0 ? 'ok' : `ffmpeg exit ${r.status}`}`);
}

// Nav colour overshoot (lead, 2026-10-05, OBSERVED): for each nav colour flip in an S run (the page log's crossings,
// header `is-on-dark` on/off), how far the scroll is past the section edge when the class flips, and how late that is.
// The edge isn't in the records, so it is estimated per crossing as the lowest scroll y at which any S run (both arms)
// flipped it: an upper bound on the true edge, so every overshoot here is a LOWER bound. Late ms: the flip's t minus
// the moment the scroll reached that edge (interpolated between frame stamps; about ±1 frame).
export function overshoot(runsByLabel, cls = 'is-on-dark') {
  const flips = {};
  for (const [L, rec] of Object.entries(runsByLabel)) {
    const xs = (rec?.crossings || []).filter((c) => c.kind === 'class' && /top-nav/.test(c.id) && c.value.slice(1) === cls);
    xs.forEach((c, k) => { (flips[k] ??= []).push({ L, c, frames: rec.frames || [] }); });
  }
  return Object.entries(flips).map(([k, list]) => {
    const edge = Math.min(...list.map((x) => x.c.y));
    return { k: Number(k), value: list[0].c.value, edge, runs: list.map(({ L, c, frames }) => {
      // the scroll reaches the edge at t_E, interpolated between consecutive frame stamps (t, yStart)
      const i = frames.findIndex((f, j) => j > 0 && frames[j - 1][2] < edge && f[2] >= edge);
      const tE = i > 0 ? frames[i - 1][0] + ((edge - frames[i - 1][2]) / (frames[i][2] - frames[i - 1][2])) * (frames[i][0] - frames[i - 1][0]) : null;
      return { L, y: c.y, overshootPx: c.y - edge, lateMs: tE === null ? null : Math.round(c.t - tE) };
    }) };
  });
}

function main() {
  const runs = resolve(ROOT, opt('runs', 'out/phone-clips/runs')), out = resolve(ROOT, opt('out', 'out/phone-clips/clips'));
  const screen = resolve(ROOT, 'out/iphone-screen'), fps = Number(opt('fps', 60)), show = Number(opt('show', 1));
  const scenes = String(opt('clips', opt('scenes', 'a,c,p,d,t,e,s'))).split(',');
  // element geometry for the crops: the phone's own read when hold.sh made one (rects-phone-<arm>.json), else the Simulator's
  const geo = (arm) => readJson(join(runs, `rects-phone-${arm}.json`)) || readJson(resolve(ROOT, `out/phone-clips/sim/rects-${arm}.json`));
  const stamps = readJsonl(join(runs, 'stamps.jsonl')), vv = readJsonl(join(runs, 'vv.jsonl'));
  const labels = [...new Set(stamps.map((s) => s.label.replace(/-(pre|rec|post)$/, '')))];
  if (flag('motion')) { // numbers-only motion traces for the clock check; run inside a lock hold (CPU work)
    for (const L of labels) {
      const mov = join(screen, `${L}.mov`), txt = join(runs, `${L}.motion.txt`);
      if (!existsSync(mov)) continue;
      const only = opt('labels')?.split(',');
      if (only ? !only.includes(L) : !flag('all-runs') && !isClean(join(runs, `${L}.json`))) { console.log(`traces ${L}: skipped (MAC-LOADED, profile drift or no record; --all-runs makes them)`); continue; }
      const sc = /^pc-H\d+-([eshfapn])/.exec(L)?.[1], rtxt = join(runs, `${L}.region.txt`);
      trace(`motion ${L}`, txt, (t) => motionArgs(mov, t));
      if (sc && REGIONS[sc]) trace(`region ${L}`, rtxt, (t) => regionArgs(mov, t, REGIONS[sc]));
    }
  }
  if (flag('overshoot')) {
    const recs = {};
    for (const L of labels.filter((l) => /^pc-H\d+-s/.test(l))) { const f = join(runs, `${L}.json`); if (existsSync(f)) recs[L] = JSON.parse(readFileSync(f, 'utf8')); }
    const res = overshoot(recs);
    for (const x of res) for (const r of x.runs) console.log(`flip ${x.k + 1} ${x.value} edge<=${x.edge} | ${r.L}${isClean(join(runs, `${r.L}.json`)) ? '' : ' (MAC-LOADED/drift)'} y ${r.y} overshoot >= ${r.overshootPx} px, late ${r.lateMs} ms`);
    writeFileSync(join(runs, 'overshoot.json'), JSON.stringify(res, null, 1)); return;
  }
  const all = labels.map((L) => analyse(L, { runs, screen, stamps, vv }));
  const report = { at: new Date().toISOString(), fps, show, box: BOX, runs: [], clips: [] };
  for (const r of all) {
    const { log, ...rest } = r; report.runs.push(rest);
    if (r.error) { console.log(`${r.L}: ERROR ${r.error}`); continue; }
    const p = r.page, c = r.capture;
    console.log(`${r.L} ${r.driver} ${r.window.from}->${r.window.to} ${(r.window.ms / 1000).toFixed(1)}s | page >34 ${p.gt34} (twins ${p.gt30}/${p.gt38}) >50 ${p.gt50} (twins ${p.gt46}/${p.gt54}) near ${p.near34}/${p.near50} max ${p.maxMs} frames ${p.frames}`
      + ` | capture >34 ${c.gt34} >50 ${c.gt50} max ${c.maxMs}${r.captureDiffers ? ' CAPTURE-DIFFERS' : ''} | clock lag ${r.clock.lagMs} ms r ${r.clock.r}${r.clock.ok ? '' : ` CLOCK-CHECK FAIL${r.clock.why ? ` (${r.clock.why})` : ''}`}`
      + (r.region ? ` | ${r.region.name}: lag ${r.region.lagMs} ms r ${r.region.r} stale ${r.region.stalePct}% longest ${r.region.longestStaleMs} ms` : '')
      + ` | mac load1 ${r.mac.load1.join('/')}${r.macLoaded ? ' MAC-LOADED' : ''}`
      + ` | profile ${r.profile?.start ?? '?'} ${r.profile?.battC ?? '?'} C${r.profile?.drift ? ' DRIFT' : ''} | vv ${r.viewport.map((v) => `${v.label} ${v.vvH}/${v.vvTop}`).join(' ')}${r.morph ? ` | morph ${JSON.stringify(r.morph).slice(0, 80)}` : ''}`);
  }
  if (flag('no-encode')) { if (opt('json')) writeFileSync(resolve(ROOT, opt('json')), JSON.stringify(report, null, 1)); return; }
  mkdirSync(out, { recursive: true });
  for (const cl of scenes) {
    const def = CLIPS[cl]; if (!def) { console.log(`clip ${cl}: unknown`); continue; }
    const sc = def.scene;
    // Shown run (rule fixed before the hold-2 numbers were read, after the lead's MAC-LOADED rule): the first clean run
    // of each arm by run number (no error, Mac load1 <= 16 at start and end, no profile drift, clock check passed; the
    // clock condition was added after H1 sA1's check failed at 512 ms, and says nothing about its frames); --show N forces run N.
    const pick = (arm) => all.filter((r) => !r.error && r.scene === sc && r.arm === arm && (opt('show') ? r.run === show : !r.macLoaded && !r.profile?.drift && r.clock.ok))
      .sort((x, y) => x.run - y.run)[0];
    let A = pick('A'), V = pick('V');
    if (!A || !V) { console.log(`clip ${cl}: no clean run on both arms (A ${A?.L ?? 'none'}, V ${V?.L ?? 'none'}), not made`); continue; }
    if (!A.clock.ok || !V.clock.ok) { console.log(`clip ${cl}: clock check failed (lag ${A.clock.lagMs} / ${V.clock.lagMs} ms), not made`); continue; }
    let note = null;
    if (def.window === 'countdown') {
      const cw = countdownWindow([A, V]);
      if (!cw) { console.log(`clip ${cl}: no common whole-second window in both rest phases, not made`); continue; }
      const ms = COUNTDOWN.seconds * 1000;
      A = view(A, cw.starts[0], cw.starts[0] + ms); V = view(V, cw.starts[1], cw.starts[1] + ms);
      note = `Real iPhone 15 Pro Max screen (Safari) - both start at second :${String(cw.sec).padStart(2, '0')} of the page clock - frozen page counts down to 2 Nov 2026`;
    } else if (def.window) {
      const wa = clipWindow(A, def), wv = clipWindow(V, def);
      if (!wa || !wv) { console.log(`clip ${cl}: marks ${def.window[0]}/${def.window[2]} missing, not made`); continue; }
      A = view(A, ...wa); V = view(V, ...wv);
    }
    let crop = { w: SCREEN.w, h: BOX.y1 - BOX.y0, filter: boxFilter() };
    if (def.crop) {
      const band = (r) => cropBand(elementAt(geo(r.arm), def.crop), def.window === 'countdown' ? 0 : restY(r.frames, r.t0, r.t0 + r.D));
      const pc = pairCrop(band(A), band(V));
      if (!pc) { console.log(`clip ${cl}: no geometry for ${def.crop} (rects-phone-<arm>.json or the Simulator's), not made`); continue; }
      crop = pc;
      console.log(`clip ${cl}: crop ${def.crop} band y ${pc.yA}..${pc.yA + pc.h} (A) / ${pc.yV}..${pc.yV + pc.h} (V) pt, rest y ${Math.round(restY(A.frames, A.t0, A.t0 + A.D))} / ${Math.round(restY(V.frames, V.t0, V.t0 + V.D))}`);
    }
    const made = [{ name: `phone-${cl}`, ...encodePair(`phone-${cl}`, A, V, { screen, out, fps, crop, W: def.W, note }) }];
    if (CLOSE[cl]) {
      const reads = all.filter((r) => !r.error && r.scene === sc).flatMap((r) => vv.filter((x) => [`${r.L}-start`, `${r.L}-ready`, `${r.L}-end`].includes(x.label)));
      const ok = vvOk(reads);
      if (!ok.ok) console.log(`close-up ${cl}: dropped (${ok.why})`);
      else {
        const c = CLOSE[cl], H = BOX.y1 - BOX.y0;
        made.push({ name: `phone-${cl}-close`, ...encodePair(`phone-${cl}-close`, A, V, { screen, out, fps, crop: { w: (c.x1 - c.x0) * SCREEN.w, h: (c.y1 - c.y0) * H, filter: closeFilter(c) }, W: 360 }) });
      }
    }
    for (const m of made) {
      report.clips.push({ ...m, mp4: m.mp4.replace(ROOT + '/', ''), clip: cl, scene: sc, title: TITLES[cl], shown: { A: A.L, V: V.L },
        window: { A: [Math.round(A.t0), Math.round(A.t0 + A.D)], V: [Math.round(V.t0), Math.round(V.t0 + V.D)] }, page: { A: A.page, V: V.page },
        crop: def.crop ? { el: def.crop, yA: crop.yA, yV: crop.yV, h: crop.h } : 'page box' });
      console.log(`CLIP ${m.name}.mp4 ${m.bytes} B ${m.width}x${m.height} ${m.seconds}s crf ${m.crf} (${A.L} | ${V.L}) page >34 ${A.page.gt34}/${V.page.gt34} >50 ${A.page.gt50}/${V.page.gt50}`);
    }
  }
  writeFileSync(join(out, 'clips.json'), JSON.stringify(report, null, 1));
  console.log(`REPORT ${join(out, 'clips.json').replace(ROOT + '/', '')}`);
}

function selfTest() {
  let n = 0; const ok = (c, m) => { if (!c) { console.error(`SELF-TEST FAIL: ${m}`); process.exit(1); } n++; };
  const c = counts([[0, 16.7], [20, 31], [60, 40], [120, 55], [170, 47], [200, 50], [230, 34]]);
  ok(c.gt34 === 4 && c.gt50 === 1 && c.gt30 === 6 && c.gt38 === 4 && c.gt46 === 3 && c.gt54 === 1, `counts ${JSON.stringify(c)}`);
  ok(c.near34 === 2 && c.near50 === 2 && c.maxMs === 55, `near bands ${JSON.stringify(c)}`);
  ok(counts([[0, 60], [100, 60]], 50, 150).gt50 === 1, 'window bounds');
  const g = captureGaps([[0, 'a'], [0.016, 'a'], [0.033, 'b'], [0.1, 'c'], [0.117, 'c']], 0, 1);
  ok(g.length === 2 && Math.round(g[0][1]) === 33 && Math.round(g[1][1]) === 67, `capture gaps ${JSON.stringify(g)}`);
  ok(pageToWall({ run: { segments: [{ sync: [[1000, 10, 1002], [2000, 1010, 2004], [3000, 2010, 3000]] }] } }) === 991, 'sync median');
  ok(pageToWall({ pre: { clock: { wallMs: 5000, perfMs: 1200 } } }, [{ macMs: 9225, wallMs: 9000 }, { macMs: 9330, wallMs: 9100 }, { macMs: 9440, wallMs: 9200 }]) === 4030, 'probe clock pair + phone-to-Mac offset');
  ok(pageToWall({ pre: { clock: { wallMs: 5000, perfMs: 1200 } } }) === null, 'probe clock pair without an offset read: no link');
  const lg = pageLog({ run: { segments: [{ frames: [[1, 16, 0, 775], [17, 16, 5, 775]], marks: [[1, 'into1'], [17, 'end']] }] } });
  ok(lg.kind === 'G' && lg.marks.into1 === 1 && lg.frames[1][2] === 5, 'G page log');
  const ls = pageLog({ frames: [[1, null, 0, 0, 775], [17, 16, 0, 9, 775]], marks: { scroll: [1, 17] } });
  ok(ls.kind === 'S' && ls.marks.scroll === 1 && ls.marks['scroll-end'] === 17 && ls.frames[1][2] === 9, 'S page log');
  // synthetic clock check: page speed bursts; the capture's motion trace follows them 40 ms late
  const speed = (t) => (t > 1000 && t < 1400 ? 3 : t > 2500 && t < 2700 ? 6 : t > 3600 && t < 4300 ? 2 : 0);
  const pf = []; let y = 0; for (let t = 0; t <= 5000; t += 16) { y += speed(t) * 16; pf.push([t, 16, Math.round(y)]); }
  const mo = []; for (let t = 0; t <= 5000; t += 16.7) mo.push([t / 1000, speed(t - 40) * 0.5 + 0.05]);
  const lag = clockLag(pf, mo, (t) => t / 1000);
  ok(lag && Math.abs(lag.lag - 40) <= 16 && lag.r > 0.8, `clock lag ${JSON.stringify(lag)}`);
  ok(JSON.stringify(parseMotion('frame:0    pts:20      pts_time:0.0333333\nlavfi.signalstats.YAVG=0.144039\nframe:1 pts:30 pts_time:0.05\nlavfi.signalstats.YAVG=0.03\n')) === '[[0.0333333,0.144039],[0.05,0.03]]', 'parse motion');
  ok(motionArgs('a.mov', 'a.txt').join(' ').includes('crop=w=iw:h=ih*707/932:x=0:y=ih*119/932,scale=108') && motionArgs('a.mov', 'a.txt').at(-2) === 'null', 'motion args: box first, null output');
  ok(vvOk([{ label: 'x-start', vvH: 775, vvTop: 0, vvScale: 1 }, { label: 'x-end', vvH: 815, vvTop: 0, vvScale: 1 }]).ok, 'vv ok');
  ok(!vvOk([{ label: 'x-start', vvH: 700, vvTop: 0, vvScale: 1 }]).ok && !vvOk([{ label: 'x', vvH: 775, vvTop: 12, vvScale: 1 }]).ok && !vvOk([]).ok, 'vv drop');
  ok(boxFilter() === 'crop=w=iw:h=ih*707/932:x=0:y=ih*119/932', `box filter ${boxFilter()}`);
  const cfil = closeFilter(CLOSE_E); ok(/^crop=w=iw\*361\.2\/430:h=ih\*395\.9\/932:x=iw\*34\.4\/430:y=ih\*274\.5\/932$/.test(cfil), `close filter ${cfil}`);
  ok(BOX.y0 + CLOSE_E.y1 * (BOX.y1 - BOX.y0) <= BOX.y1 && CLOSE_E.x1 <= 1 && !CLOSE.e, 'close-up inside the box, off by default');
  // region follow: a region that changes only every 4th frame while the page moves is ~75 % stale
  const pf2 = []; let y2 = 0; for (let t = 0; t <= 3000; t += 16) { y2 += t > 500 && t < 2500 ? 16 : 0; pf2.push([t, 16, y2]); }
  const steppy = []; for (let i = 0, t = 0; t <= 3000; t += 16.7, i++) steppy.push([t / 1000, t > 500 && t < 2500 ? (i % 4 === 0 ? 2 : 0.01) : 0.01]);
  const smooth = steppy.map(([t]) => [t, t > 0.5 && t < 2.5 ? 1 : 0.01]);
  const rs = regionFollow(pf2, steppy, (t) => t / 1000, 0, 3000), rm = regionFollow(pf2, smooth, (t) => t / 1000, 0, 3000);
  ok(rs.stalePct > 60 && rs.longestStaleMs >= 45 && rm.stalePct < 5, `region follow ${JSON.stringify(rs)} ${JSON.stringify(rm)}`);
  ok(regionArgs('a.mov', 'r.txt', REGIONS.s).join(' ').includes('crop=w=iw:h=ih*48/932:x=0:y=ih*64/932') && regionArgs('a.mov', 'r.txt', REGIONS.s).at(-2) === 'null', 'region args');
  ok(Object.values(REGIONS).every((r) => r.y0 >= 59 && r.y1 <= 826), 'regions inside the page area');
  const rec = (l0, l1, drift) => ({ meta: { mac: { start: { load1: l0 }, end: { load1: l1 } }, profileDrift: drift } });
  ok(cleanRecord(rec(10, 16, false)) && !cleanRecord(rec(10, 16.1, false)) && !cleanRecord(rec(163, 10, false)) && !cleanRecord(rec(10, 10, true)) && !cleanRecord({}), 'clean record rule');
  const mk = (ys, t) => ({ crossings: ys.map((y, i) => ({ kind: 'class', id: 'header.start-selling-top-nav', value: i % 2 ? '-is-on-dark' : '+is-on-dark', y, t: t[i] })),
    frames: [[100, 16, 0], [200, 16, 1000], [300, 16, 2000], [400, 16, 3000], [500, 16, 4000]] });
  const os = overshoot({ a: mk([2194, 3102], [330, 420]), v: mk([2144, 3050], [316, 406]) });
  ok(os.length === 2 && os[0].edge === 2144 && os[0].runs[0].overshootPx === 50 && os[0].runs[0].lateMs === 16 && os[0].runs[1].overshootPx === 0
    && os[0].runs[1].lateMs === 2 && os[1].edge === 3050 && os[1].runs[0].lateMs === 15 && os[1].runs[1].lateMs === 1, `overshoot ${JSON.stringify(os)}`);
  // new scenes (C-058 / T-183)
  const run = (k, rest, fade) => ({ marks: { rest, fade }, phoneWall: (t) => t + k });
  // A: page t 0 = wall 1_000_000_000_000 (second :40 of its minute); rest 3200 -> fade 15200 (wall :43.2 .. :55.2)
  // V: 7 min 2.5 s later, rest at wall :44.0 (page 1500 + k2)
  const kA = 1_000_000_000_000 - (1_000_000_000_000 % 60000) + 40000, kV = kA + 422500;
  const cw = countdownWindow([run(kA, 3200, 15200), run(kV, 1500, 13500)]);
  // A's window must start >= :43.7 (rest + 500) -> :44; V's rest + 500 = wall :45.0 + ... -> both start at second :45
  ok(cw && cw.sec === 45 && kA + cw.starts[0] === kA + 5000 && (kV + cw.starts[1]) % 60000 === 45000, `countdown window ${JSON.stringify(cw)}`);
  ok(countdownWindow([run(kA, 3200, 8000), run(kV, 1500, 13500)]) === null, 'countdown window: too short a rest -> none');
  ok(countdownWindow([{ marks: { rest: 1, fade: 2 }, phoneWall: null }]) === null, 'countdown window: no phone clock -> none');
  const b1 = cropBand({ docY: 364, h: 88 }, 0);
  ok(b1 && b1.y0 === 364 + VIEW_Y - CROP_PAD && b1.y1 === 364 + 88 + VIEW_Y + CROP_PAD, `crop band ${JSON.stringify(b1)}`);
  ok(cropBand({ docY: 2050, h: 85 }, 1700).y0 === 2050 - 1700 + VIEW_Y - CROP_PAD && cropBand({ docY: 5000, h: 80 }, 0) === null && cropBand(null, 0) === null, 'crop band: off screen / no geometry');
  const pc = pairCrop({ y0: 400, y1: 500 }, { y0: 420, y1: 540 });
  ok(pc.h === 120 && pc.yA === 390 && pc.yV === 420 && pc.filterA === 'crop=w=iw:h=ih*120/932:x=0:y=ih*390/932', `pair crop ${JSON.stringify(pc)}`);
  ok(pairCrop({ y0: 790, y1: 826 }, { y0: 700, y1: 826 }).yA === BOX.y1 - 126, 'pair crop stays inside the page area');
  const geo = { top: { rects: { title: { docY: 936, h: 82 }, countdown: { docY: 364.3, h: 88 } } }, parked: { title: { y: 665, rects: { title: { y: 223, h: 82 } } } } };
  ok(elementAt(geo, 'title').docY === 888 && elementAt(geo, 'title').from === 'parked' && elementAt(geo, 'countdown').docY === 364.3 && elementAt(geo, 'nope') === null, 'element geometry: parked read first');
  const rn = { marks: { title: 1000, carousel: 7000, end: 20000 } };
  ok(JSON.stringify(clipWindow(rn, CLIPS.t)) === '[700,7000]' && JSON.stringify(clipWindow(rn, CLIPS.d)) === '[14000,20000]' && clipWindow(rn, CLIPS.a) === null, 'clip windows');
  ok(restY([[0, 16, 0], [100, 16, 300], [200, 16, 500], [300, 16, 510], [400, 16, 510]], 0, 400) === 510, 'rest y: median of the second half');
  const tk = []; for (let t = 0; t < 6; t += 1 / 60) tk.push([t, Math.abs(t % 1 - 0.5) < 0.01 ? 2 : 0.02]);
  ok(ticks(tk, 0, 6).length === 6, `ticks ${ticks(tk, 0, 6).length}`);
  const vw = view({ frames: [[0, 16, 0], [50, 16, 1], [100, 60, 2]], toMovie: (t) => t / 1000 + 1, movie: { w: 1290, h: 2796 } }, 40, 120);
  ok(vw.D === 80 && vw.log.length === 2 && vw.movie.from === 1.04 && vw.page.gt50 === 1, `view ${JSON.stringify(vw.page)}`);
  ok(/^Real iPhone 15 Pro Max screen/.test(banner('serious')) && banner('serious').includes('Serious (Xcode)') && !banner(undefined).includes('heat'), 'banner');
  ok(Object.values(CLIPS).every((c) => WINDOWS[c.scene]) && CLIPS.c.scene === 'a' && CLIPS.t.scene === 'n' && CLIPS.d.scene === 'n', 'clips cut from known scenes');
  console.log(`phone-clips self-test: ${n} checks ok`);
}

if (flag('self-test')) selfTest(); else main();

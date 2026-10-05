// Phone clips of the trouble spots (T-170 #101): turn the hold.sh recordings into side-by-side MP4s (original | v8)
// with a slow-frame strip under each panel, and print the per-run numbers. Numbers and MP4 only: it never writes an
// image file from a frame and nobody looks at a frame (I-062); the movies are only cropped, scaled and re-encoded.
//
//   node research/team-article/capture/phone/phone-clips.mjs [--runs out/phone-clips/runs] [--out out/phone-clips/clips]
//        [--scenes e,s,h,f] [--show 1] [--fps 60] [--no-encode] [--json <file>]
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
// CLOCK_UPTIME_RAW (the stamps), and UPTIME_RAW == the capture's PTS host clock (assumed; OBSERVED-to-verify). The
// assumption is checked from numbers: the lag that best lines up the capture's distinct frames with the page's moving
// frames (searched over ±600 ms) should be near 0; |lag| > 50 ms prints CLOCK-CHECK FAIL and the clip is not made.
//
// Window per scene (fixed before data): e (flick-end-v1) into1 → end; h (flick-hero-v1) down1 → end; f
// (flick-fresh-v1) fresh-flick → end; s (scripted scroll) scroll start → scroll end + 1 s; each ± 300 ms.
// Shown run: run 1 of each arm (fixed before data); all runs' numbers are printed.
// Crop (privacy, lead's change 2): the page-area box y 119-826 pt of 932, full width, by geometry (no status bar, no
// Safari bar in either position). The close-up (scene e only: the middle of that box, where the end menu opens) is made
// only when every run's viewport read (start and end) has offsetTop 0, scale 1 and height 770-820 (page area covering
// the box); otherwise it is dropped, never widened.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

export const SCREEN = { w: 430, h: 932 };
export const BOX = { y0: 119, y1: 826 };                       // pt, full width
export const CLOSE = { e: { x0: 0.08, x1: 0.92, y0: 0.22, y1: 0.78 } }; // fractions of BOX
export const WINDOWS = { e: ['into1', 'end'], h: ['down1', 'end'], f: ['fresh-flick', 'end'], s: ['scroll', 'scroll-end'] };
export const PAD_MS = 300, S_TAIL_MS = 1000;
export const VV_OK = { hMin: 770, hMax: 820 };
const TITLES = { e: 'End of the page: flicks into the end and out (robot finger)', s: 'Scripted scroll, top to bottom (dark section, section switches)',
  h: 'Fast flicks through the top card (robot finger)', f: 'Flicks right after load (robot finger)' };

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
export function pageToWall(rec) {
  const seg = rec?.run?.segments?.[0];
  if (seg?.sync?.length) return median(seg.sync.map(([b, p, a]) => (a + b) / 2 - p));
  const clk = rec?.pre?.clock || rec?.page?.clock || rec?.clock || rec?.result?.clock;
  if (clk && Number.isFinite(clk.wallMs) && Number.isFinite(clk.perfMs)) return clk.wallMs - clk.perfMs;
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

/** Lag (ms) that best lines up capture hash changes with page motion; score = P(change | moving) - P(change | still). */
export function clockLag(pageFrames, capFrames, toPts, { span = 600, step = 8 } = {}) {
  const mv = []; for (let i = 1; i < pageFrames.length; i++) mv.push([pageFrames[i - 1][0], pageFrames[i][0], pageFrames[i][2] !== pageFrames[i - 1][2]]);
  if (!mv.length || capFrames.length < 3) return null;
  const lo = toPts(mv[0][0]), hi = toPts(mv.at(-1)[1]);
  const chg = []; for (let i = 1; i < capFrames.length; i++) { const p = capFrames[i][0]; if (p >= lo - span / 1000 && p <= hi + span / 1000) chg.push([p, capFrames[i][1] !== capFrames[i - 1][1]]); }
  const starts = mv.map((m) => toPts(m[0]));
  const at = (p) => { let a = 0, b = starts.length - 1; if (p < starts[0] || p > toPts(mv.at(-1)[1])) return null; while (a < b) { const m = (a + b + 1) >> 1; if (starts[m] <= p) a = m; else b = m - 1; } return mv[a][2]; };
  let best = null;
  for (let lag = -span; lag <= span; lag += step) {
    let nm = 0, cm = 0, ns = 0, cs = 0;
    for (const [p, c] of chg) { const m = at(p - lag / 1000); if (m === null) continue; if (m) { nm++; cm += c; } else { ns++; cs += c; } }
    if (nm < 10 || ns < 10) continue;
    const score = cm / nm - cs / ns;
    if (!best || score > best.score + 1e-9) best = { lag, score: Math.round(score * 1000) / 1000, moving: nm, still: ns };
  }
  return best;
}

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
  const m = /^pc-(H\d+)-([eshf])([AV])(\d+)$/.exec(L); if (!m) return { L, error: 'bad label' };
  const [, hold, scene, arm, n] = m;
  const out = { L, hold, scene, arm, run: Number(n), driver: scene === 's' ? 'S' : 'G' };
  if (!rec) return { ...out, error: 'no driver record' };
  if (!cap) return { ...out, error: 'no capture frames' };
  const log = pageLog(rec); if (!log) return { ...out, error: 'no page frames in the driver record' };
  const [ma, mb] = WINDOWS[scene], a0 = log.marks[ma], b0 = log.marks[mb];
  if (!Number.isFinite(a0) || !Number.isFinite(b0)) return { ...out, error: `marks ${ma}/${mb} missing (have ${Object.keys(log.marks).join(',')})` };
  const a = a0 - PAD_MS, b = b0 + PAD_MS + (scene === 's' ? S_TAIL_MS : 0);
  const p2w = pageToWall(rec);
  const st = stamps.filter((s) => s.label.startsWith(`${L}-`));
  const w2u = median(st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6));
  const w2uSpread = st.length ? Math.max(...st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6)) - Math.min(...st.map((s) => s.wallNs / 1e6 - s.upRawNs / 1e6)) : null;
  if (p2w === null || w2u === null) return { ...out, error: 'no clock link (sync pairs or stamps missing)' };
  const toPts = (t) => (t + p2w - w2u) / 1000;
  const frames = cap.frames.filter((f) => f[2] !== false);
  const pts0 = frames[0][0];
  const lag = clockLag(log.frames.filter(([t]) => t >= a && t <= b), cap.frames, toPts);
  const page = counts(log.frames, a, b);
  const cg = captureGaps(cap.frames, toPts(a), toPts(b));
  const capture = counts(cg, -Infinity, Infinity);
  const differs = Math.abs(capture.gt34 - page.gt34) > Math.max(1, 0.2 * page.gt34) || Math.abs(capture.gt50 - page.gt50) > Math.max(1, 0.2 * page.gt50);
  const prof = rec?.meta?.profile;
  const reads = vv.filter((r) => r.label === `${L}-start` || r.label === `${L}-end`);
  return { ...out, window: { from: ma, to: mb, ms: Math.round(b - a) }, page, capture: { ...capture, frames: cg.length, rateHz: cap.frames.length / Math.max(1e-6, cap.frames.at(-1)[0] - cap.frames[0][0]) },
    captureDiffers: differs, clock: { lagMs: lag?.lag ?? null, score: lag?.score ?? null, w2uSpreadMs: w2uSpread === null ? null : Math.round(w2uSpread * 1000) / 1000, ok: !!lag && Math.abs(lag.lag) <= 50 },
    movie: { from: toPts(a) - pts0, to: toPts(b) - pts0, written: frames.length, all: cap.frames.length, w: cap.width, h: cap.height },
    profile: prof ? { name: prof.name, start: prof.start?.state ?? prof.start, battC: prof.start?.battC, drift: !!rec.meta.profileDrift } : null,
    viewport: reads.map((r) => ({ label: r.label.slice(L.length + 1), vvH: r.vvH, vvTop: r.vvTop, scale: r.vvScale, innerH: r.innerH })),
    morph: rec?.summary?.morph ?? null, log: log.frames.filter(([t]) => t >= a && t <= b), t0: a, D: b - a };
}

// ---- encode (MP4 only) ------------------------------------------------------------------------------------------
const STRIP_H = 40, HDR_H = 30, GAP = 16, BG = [0x1a, 0x21, 0x1e];
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
function encodePair(name, A, V, { screen, out, fps, crop, W }) {
  const work = join(out, 'work'); mkdirSync(work, { recursive: true });
  const ratio = (A.movie.h / A.movie.w) || SCREEN.h / SCREEN.w;
  const cw = crop.w, ch = crop.h; // pt
  const H = Math.round((W * ch * ratio * SCREEN.w / SCREEN.h) / cw / 2) * 2;
  const D = Math.max(A.D, V.D), Dsec = (D / 1000).toFixed(3);
  writeFileSync(join(work, `${name}-label-A.txt`), `ORIGINAL  run ${A.run}`);
  writeFileSync(join(work, `${name}-label-V.txt`), `v8  run ${V.run}`);
  stripPPM(join(work, `${name}-A-strip.ppm`), A.log, A.t0, D, W);
  stripPPM(join(work, `${name}-V-strip.ppm`), V.log, V.t0, D, W);
  const text = (k, x) => FONT ? `,drawtext=fontfile='${FONT}':textfile='${join(work, `${name}-label-${k}.txt`)}':x=${x}:y=9:fontsize=14:fontcolor=0xe2e9e5` : '';
  const pre = (i) => `[${i}:v]setpts=PTS-STARTPTS,fps=${fps},${crop.filter},scale=${W}:${H}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2`;
  const fc = [`${pre(0)}[a]`, `${pre(1)}[b]`, `[2:v]fps=${fps},setsar=1[sa]`, `[3:v]fps=${fps},setsar=1[sb]`,
    `[a][sa]vstack[ac]`, `[b][sb]vstack[bc]`, `[ac]pad=${W + GAP}:${H + STRIP_H}:0:0:color=0x1a211e[acp]`, `[acp][bc]hstack[s]`,
    `[s]pad=iw:ih+${HDR_H}:0:${HDR_H}:color=0x1a211e${text('A', 8)}${text('V', W + GAP + 8)}[h]`,
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
  return { mp4, bytes: statSync(mp4).size, crf, seconds: Math.round(D / 100) / 10, width: 2 * W + GAP, height: HDR_H + H + STRIP_H };
}

function main() {
  const runs = resolve(ROOT, opt('runs', 'out/phone-clips/runs')), out = resolve(ROOT, opt('out', 'out/phone-clips/clips'));
  const screen = resolve(ROOT, 'out/iphone-screen'), fps = Number(opt('fps', 60)), show = Number(opt('show', 1));
  const scenes = String(opt('scenes', 'e,s,h,f')).split(',');
  const stamps = readJsonl(join(runs, 'stamps.jsonl')), vv = readJsonl(join(runs, 'vv.jsonl'));
  const labels = [...new Set(stamps.map((s) => s.label.replace(/-(pre|rec|post)$/, '')))];
  const all = labels.map((L) => analyse(L, { runs, screen, stamps, vv }));
  const report = { at: new Date().toISOString(), fps, show, box: BOX, runs: [], clips: [] };
  for (const r of all) {
    const { log, ...rest } = r; report.runs.push(rest);
    if (r.error) { console.log(`${r.L}: ERROR ${r.error}`); continue; }
    const p = r.page, c = r.capture;
    console.log(`${r.L} ${r.driver} ${r.window.from}->${r.window.to} ${(r.window.ms / 1000).toFixed(1)}s | page >34 ${p.gt34} (twins ${p.gt30}/${p.gt38}) >50 ${p.gt50} (twins ${p.gt46}/${p.gt54}) near ${p.near34}/${p.near50} max ${p.maxMs} frames ${p.frames}`
      + ` | capture >34 ${c.gt34} >50 ${c.gt50} max ${c.maxMs}${r.captureDiffers ? ' CAPTURE-DIFFERS' : ''} | clock lag ${r.clock.lagMs} ms score ${r.clock.score}${r.clock.ok ? '' : ' CLOCK-CHECK FAIL'}`
      + ` | profile ${r.profile?.start ?? '?'} ${r.profile?.battC ?? '?'} C${r.profile?.drift ? ' DRIFT' : ''} | vv ${r.viewport.map((v) => `${v.label} ${v.vvH}/${v.vvTop}`).join(' ')}${r.morph ? ` | morph ${JSON.stringify(r.morph).slice(0, 80)}` : ''}`);
  }
  if (flag('no-encode')) { if (opt('json')) writeFileSync(resolve(ROOT, opt('json')), JSON.stringify(report, null, 1)); return; }
  mkdirSync(out, { recursive: true });
  for (const sc of scenes) {
    const pick = (arm) => all.find((r) => !r.error && r.scene === sc && r.arm === arm && r.run === show);
    const A = pick('A'), V = pick('V');
    if (!A || !V) { console.log(`clip ${sc}: no run ${show} on both arms, not made`); continue; }
    if (!A.clock.ok || !V.clock.ok) { console.log(`clip ${sc}: clock check failed (lag ${A.clock.lagMs} / ${V.clock.lagMs} ms), not made`); continue; }
    const full = { w: SCREEN.w, h: BOX.y1 - BOX.y0, filter: boxFilter() };
    const made = [{ name: `phone-${sc}`, ...encodePair(`phone-${sc}`, A, V, { screen, out, fps, crop: full, W: 300 }) }];
    if (CLOSE[sc]) {
      const reads = all.filter((r) => !r.error && r.scene === sc).flatMap((r) => vv.filter((x) => x.label === `${r.L}-start` || x.label === `${r.L}-end`));
      const ok = vvOk(reads);
      if (!ok.ok) console.log(`close-up ${sc}: dropped (${ok.why})`);
      else {
        const c = CLOSE[sc], H = BOX.y1 - BOX.y0;
        made.push({ name: `phone-${sc}-close`, ...encodePair(`phone-${sc}-close`, A, V, { screen, out, fps, crop: { w: (c.x1 - c.x0) * SCREEN.w, h: (c.y1 - c.y0) * H, filter: closeFilter(c) }, W: 360 }) });
      }
    }
    for (const m of made) {
      report.clips.push({ ...m, mp4: m.mp4.replace(ROOT + '/', ''), scene: sc, title: TITLES[sc], shown: { A: A.L, V: V.L } });
      console.log(`CLIP ${m.name}.mp4 ${m.bytes} B ${m.width}x${m.height} ${m.seconds}s crf ${m.crf} (${A.L} | ${V.L})`);
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
  ok(pageToWall({ pre: { clock: { wallMs: 5000, perfMs: 1200 } } }) === 3800, 'probe clock pair');
  const lg = pageLog({ run: { segments: [{ frames: [[1, 16, 0, 775], [17, 16, 5, 775]], marks: [[1, 'into1'], [17, 'end']] }] } });
  ok(lg.kind === 'G' && lg.marks.into1 === 1 && lg.frames[1][2] === 5, 'G page log');
  const ls = pageLog({ frames: [[1, null, 0, 0, 775], [17, 16, 0, 9, 775]], marks: { scroll: [1, 17] } });
  ok(ls.kind === 'S' && ls.marks.scroll === 1 && ls.marks['scroll-end'] === 17 && ls.frames[1][2] === 9, 'S page log');
  // synthetic clock check: page moves 1-2 s and 3-4 s; capture changes only while moving, shifted by +40 ms
  const pf = []; for (let t = 0; t <= 5000; t += 16) pf.push([t, 16, (t > 1000 && t < 2000) || (t > 3000 && t < 4000) ? t : 0]);
  const cf = []; let h = 0; for (let t = 0; t <= 5000; t += 16.7) { const p = t - 40; if ((p > 1000 && p < 2000) || (p > 3000 && p < 4000)) h++; cf.push([t / 1000, `h${h}`, true]); }
  const lag = clockLag(pf, cf, (t) => t / 1000);
  ok(lag && Math.abs(lag.lag - 40) <= 16, `clock lag ${JSON.stringify(lag)}`);
  ok(vvOk([{ label: 'x-start', vvH: 775, vvTop: 0, vvScale: 1 }, { label: 'x-end', vvH: 815, vvTop: 0, vvScale: 1 }]).ok, 'vv ok');
  ok(!vvOk([{ label: 'x-start', vvH: 700, vvTop: 0, vvScale: 1 }]).ok && !vvOk([{ label: 'x', vvH: 775, vvTop: 12, vvScale: 1 }]).ok && !vvOk([]).ok, 'vv drop');
  ok(boxFilter() === 'crop=w=iw:h=ih*707/932:x=0:y=ih*119/932', `box filter ${boxFilter()}`);
  const cfil = closeFilter(CLOSE.e); ok(/^crop=w=iw\*361\.2\/430:h=ih\*395\.9\/932:x=iw\*34\.4\/430:y=ih\*274\.5\/932$/.test(cfil), `close filter ${cfil}`);
  ok(BOX.y0 + CLOSE.e.y1 * (BOX.y1 - BOX.y0) <= BOX.y1 && CLOSE.e.x1 <= 1, 'close-up inside the box');
  console.log(`phone-clips self-test: ${n} checks ok`);
}

if (flag('self-test')) selfTest(); else main();

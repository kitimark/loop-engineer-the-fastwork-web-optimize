// The iPhone screen recorder (incident I-062, user T-019 #21): helpers of tools/ioscap.mjs. Pure functions
// (paths, argument rules, signing-identity choice, the frame summary) so the unit tests cover them without
// building or starting the app. The Swift side is tools/ioscap/ (Selection.swift: which device may be
// opened; main.swift: the recorder). Nothing here touches a capture device.
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { REPO } from './paths.mjs';
import { status as lockStatus, parseHeld, staleReason, sharedSlot } from './lock.mjs';

export const SCHEMA = 'fw-ioscap/1';
export const MAX_SECONDS = 600;
export const DEFAULT_SECONDS = 20;
export const DEVICE_WAIT_SEC = 15; // main.swift deviceWaitSec
export const ACCESS_WAIT_SEC = 150; // main.swift accessWaitSec (first run: the user answers the prompt)
export const SRC = join(REPO, 'tools', 'ioscap');
export const APP_SOURCES = ['main.swift', 'Selection.swift'];
export const SELFTEST_SOURCES = ['Selection.swift', join('selftest', 'main.swift')];
export const FRAMEWORKS = ['AVFoundation', 'CoreMediaIO', 'CoreMedia', 'CoreVideo'];
export const MIN_MACOS = '14.0'; // AVCaptureDevice.DeviceType.external

/** The checkout whose out/ holds the app and the recordings: this one ($FW_IOSCAP_ROOT: tests only). */
export const root = () => resolve(process.env.FW_IOSCAP_ROOT || REPO);
export const outDir = () => join(root(), 'out', 'iphone-screen');
export const buildDir = () => join(root(), 'out', 'ioscap');
export const appPath = () => join(buildDir(), 'ioscap.app');
export const appExe = () => join(appPath(), 'Contents', 'MacOS', 'ioscap');
export const selftestExe = () => join(buildDir(), 'selftest', 'ioscap-selftest');

const SAFE = /^[A-Za-z0-9._-]+$/;
/** A file-name-safe piece (owner, label). */
export const slug = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';

/** Seconds for `record`: a number in (0, 600]; default 20. Returns {seconds} or {error}. */
export function parseSeconds(v) {
  if (v === undefined || v === true) return v === true ? { error: '--seconds needs a value' } : { seconds: DEFAULT_SECONDS };
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return { error: `--seconds must be a number above 0 (got "${v}")` };
  if (n > MAX_SECONDS) return { error: `--seconds must be at most ${MAX_SECONDS} (got ${n})` };
  return { seconds: n };
}

/**
 * The output .mov: --out if given (must resolve to a file directly inside <root>/out/iphone-screen/, .mov,
 * a plain name), else <root>/out/iphone-screen/<owner>-<label>-<ms>.mov. Returns {mov} or {error}.
 */
export function outPath({ out, owner, label, now = Date.now() } = {}) {
  const dir = outDir();
  if (out === undefined) return { mov: join(dir, `${slug(owner)}-${slug(label || 'screen')}-${now}.mov`) };
  const p = resolve(root(), String(out));
  const rel = relative(dir, p);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)) return { error: `--out must be a file directly inside ${dir}/ (got ${p})` };
  if (!rel.endsWith('.mov')) return { error: `--out must end in .mov (got ${rel})` };
  if (!SAFE.test(rel)) return { error: `--out file name may use letters, digits, . _ - only (got ${rel})` };
  return { mov: p };
}

/** The files a recording writes beside its .mov (main.swift: base + .result.json / .frames.json / .pid). */
export function sidecars(mov) {
  const b = mov.replace(/\.mov$/, '');
  return { result: `${b}.result.json`, frames: `${b}.frames.json`, pid: `${b}.pid`, log: `${b}.log`, summary: `${b}.json` };
}

/** How long the wrapper waits for the app before stopping it (its own watchdog ends it a little earlier). */
export const recordTimeoutSec = (seconds, firstRun) => seconds + DEVICE_WAIT_SEC + (firstRun ? ACCESS_WAIT_SEC : 0) + 75;

/** `open` arguments that start the app through LaunchServices (so the Camera permission is the app's own,
 *  not the terminal's), a new instance, waiting for it to exit, its output into `log`. */
export function openArgs({ app = appPath(), mov, seconds, firstRun = false, codec = 'h264', log }) {
  return ['-n', '-W', '-g', '--stdout', log, '--stderr', log, app, '--args', 'record', '--out', mov, '--seconds', String(seconds), '--codec', codec, ...(firstRun ? ['--first-run'] : [])];
}

/** swiftc arguments: the app, or the Foundation-only self-test (no capture framework linked). */
export function swiftcArgs({ out, selftest = false, src = SRC }) {
  const files = (selftest ? SELFTEST_SOURCES : APP_SOURCES).map((f) => join(src, f));
  return ['-swift-version', '5', '-O', '-target', `${process.arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macos${MIN_MACOS}`, ...files, '-o', out,
    ...(selftest ? [] : FRAMEWORKS.flatMap((f) => ['-framework', f]))];
}

/**
 * The signing identity from `security find-identity -v -p codesigning` output: an "Apple Development"
 * identity gives the app a stable designated requirement (the Camera permission survives rebuilds); with
 * several, the lowest SHA-1 (stable). Returns {hash, type, count} or null (then: ad hoc, re-asked per build).
 * The person's name in the identity is never returned or printed (Hard rule 12).
 */
export function pickIdentity(text) {
  const ids = [];
  for (const m of String(text || '').matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(Apple Development):[^"\n]*"/gm)) ids.push({ hash: m[1], type: m[2] });
  if (!ids.length) return null;
  const uniq = [...new Map(ids.map((i) => [i.hash, i])).values()].sort((a, b) => a.hash.localeCompare(b.hash));
  return { ...uniq[0], count: uniq.length };
}

/** The signature's type from `codesign -dvv` output (stderr): "Apple Development", "ad hoc", or "unsigned". */
export function signatureType(text) {
  const t = String(text || '');
  if (/Signature=adhoc/.test(t)) return 'ad hoc';
  const m = t.match(/^Authority=(Apple Development|Apple Distribution|Developer ID Application|Mac Developer)\b/m);
  if (m) return m[1];
  if (/code object is not signed/.test(t)) return 'unsigned';
  return 'unknown';
}

const q = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1))] : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
function gapStats(ms) {
  const s = [...ms].sort((a, b) => a - b);
  return { n: s.length, median: r1(q(s, 50)), p95: r1(q(s, 95)), max: r1(s.length ? s[s.length - 1] : null),
    gt20: ms.filter((x) => x > 20).length, gt34: ms.filter((x) => x > 34).length, gt50: ms.filter((x) => x > 50).length, gt100: ms.filter((x) => x > 100).length };
}

/**
 * Numbers from a frames sidecar (fw-ioscap-frames/1: frames = [[pts s, hash, written], ...]): frame count,
 * span, delivered fps, distinct frames (hash differs from the previous frame) and their rate, PTS gaps
 * between delivered frames and between distinct frames (ms), drops. No pixels, only numbers.
 */
export function summarizeFrames(side) {
  const frames = (side?.frames || []).filter((f) => Array.isArray(f) && Number.isFinite(f[0]));
  const pts = frames.map((f) => f[0]);
  const span = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0;
  const gaps = pts.slice(1).map((t, i) => (t - pts[i]) * 1000);
  const distinctPts = [];
  let prev = null;
  for (const [t, h] of frames) { if (h !== prev) distinctPts.push(t); prev = h; }
  const dgaps = distinctPts.slice(1).map((t, i) => (t - distinctPts[i]) * 1000);
  return {
    frames: frames.length, written: frames.filter((f) => f[2] === true).length, spanSec: r1(span),
    fps: span > 0 ? r1((frames.length - 1) / span) : null,
    distinct: distinctPts.length, distinctFps: span > 0 ? r1(Math.max(0, distinctPts.length - 1) / span) : null,
    nonMonotonic: gaps.filter((g) => g <= 0).length,
    gapsMs: gapStats(gaps), distinctGapsMs: gapStats(dgaps),
    outputDrops: side?.outputDrops ?? null, writerDrops: side?.writerDrops ?? null,
    width: side?.width ?? null, height: side?.height ?? null, pixelFormat: side?.pixelFormat ?? null,
    activeFormat: side?.format?.active ?? null,
  };
}

/** One plain line of numbers for the terminal. */
export function summaryLine(s) {
  return `frames ${s.frames} over ${s.spanSec} s (${s.fps} fps delivered), distinct ${s.distinct} (${s.distinctFps}/s), ` +
    `gaps ms median ${s.gapsMs.median} p95 ${s.gapsMs.p95} max ${s.gapsMs.max} (>34: ${s.gapsMs.gt34}, >50: ${s.gapsMs.gt50}), ` +
    `distinct gaps ms median ${s.distinctGapsMs.median} max ${s.distinctGapsMs.max} (>50: ${s.distinctGapsMs.gt50}), ` +
    `drops ${s.outputDrops}/${s.writerDrops} (output/writer), ${s.width}x${s.height} ${s.pixelFormat}`;
}

/** This process runs inside its own live chrome-measure hold: 'exclusive' (normal or --no-timing), 'short',
 *  'shared' (a functional slot), or null. Swift compiles are CPU work (Hard rule 7). */
export function holdKind(st = lockStatus('chrome-measure'), env = process.env) {
  const h = st.holder;
  const live = h && !st.stale && !staleReason(h);
  const mine = parseHeld(env.FW_LOCK_HELD)['chrome-measure'];
  if (live && mine && h.token === mine) return h.short ? 'short' : 'exclusive';
  if (sharedSlot('chrome-measure', env.FW_LOCK_SHARED || '')) return 'shared'; // '' not undefined: no fallback to process.env
  return null;
}


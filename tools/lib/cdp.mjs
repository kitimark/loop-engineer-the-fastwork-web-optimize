// Minimal Chrome DevTools Protocol client (Node >= 22: built-in fetch + WebSocket).
// No dependencies. Used by tools/mirror.mjs --crawl and tools/verify.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * SIGKILL pid and all its descendants, synchronously (usable in an 'exit' handler). The tree is read
 * with one `ps` before anything is killed: once the root dies its children are reparented and lost.
 */
export function killTree(pid) {
  const pids = [pid];
  try {
    const kids = {};
    for (const l of (spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 3000 }).stdout || '').split('\n')) {
      const m = l.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) (kids[m[2]] ||= []).push(Number(m[1]));
    }
    for (let i = 0; i < pids.length; i++) for (const k of kids[pids[i]] || []) if (!pids.includes(k)) pids.push(k);
  } catch {}
  for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch {} }
  return pids;
}

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  if (process.platform === 'darwin') return CHROME_MAC;
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return 'google-chrome';
}

// ---- headless functional checks (ts-headless, research/architecture/headless-functional.md) -------------
// New headless (--headless=new) is the real Chrome (CONFIRMED, developer.chrome.com/docs/chromium/headless), but its
// UA says "HeadlessChrome/" (Hotjar's bootstrap skips such a page, CONFIRMED in the vendor source) and its virtual
// screen defaults to 800x600 at devicePixelRatio 1 (CONFIRMED, components/headless/screen_info/headless_screen_info.h),
// which moved layout by 1 px and screenshots by ~3 % against headed (OBSERVED). Functional checks therefore pin the
// screen to this Mac's (1512x982 at DSF 2, lead decision Q3) and override the UA per page. Never used by timing tools.
// HEADLESS_SCREEN is in CSS px (DIP), what the page's screen.width/height say in headed Chrome here.
export const HEADLESS_SCREEN = Object.freeze({ width: 1512, height: 982, dpr: 2 });
/**
 * --screen-info for a headless launch (headless_screen_info.h format). Its WxH is in physical PIXELS (I-046, CONFIRMED:
 * ui/display/headless/headless_screen_util.cc SetDisplayGeometry(display, bounds_in_pixels, …, device_pixel_ratio) sets
 * the DIP bounds to ToCeiledSize(pixels / DSF); before this fix 1512x982 at DPR 2 gave the page a 756x491 screen). So the
 * CSS size is multiplied by the DPR, rounded down (Chrome rounds pixels / DPR up): {0,0 3024x1964 devicePixelRatio=2}.
 */
export function screenInfoArg({ width = HEADLESS_SCREEN.width, height = HEADLESS_SCREEN.height, dpr = HEADLESS_SCREEN.dpr } = {}) {
  if (![width, height].every((x) => Number.isInteger(x) && x > 0) || !(dpr > 0 && dpr <= 4)) throw new Error(`bad screen ${width}x${height} dpr ${dpr}`);
  const px = (css) => Math.floor(css * dpr + 1e-9);
  return `--screen-info={0,0 ${px(width)}x${px(height)} devicePixelRatio=${dpr}}`;
}
/** Does this User-Agent come from a headless Chrome? */
export const isHeadlessUA = (ua) => /\bHeadlessChrome\//.test(String(ua || ''));
/** The UA a headed Chrome of the same build sends (what the page should see in a functional check). */
export const headedUA = (ua) => String(ua || '').replace(/\bHeadlessChrome\//g, 'Chrome/');
/**
 * A fresh, unique profile dir under `base` for one job (several functional jobs run at once in the shared lane).
 * The path is reserved for this process: launchChrome() creates it, records it as this process's own throwaway profile
 * (a marker file inside, TEMP_PROFILE_MARKER) and removes it when the run ends (I-095, see "Throwaway profiles" below).
 */
export function tempProfileDir(base, owner = 'job') {
  const dir = join(base, `${String(owner).replace(/[^\w.-]+/g, '_').slice(0, 40)}-${process.pid}-${randomBytes(4).toString('hex')}`);
  RESERVED.add(dir);
  return dir;
}

// ---- Throwaway profiles (I-095: 157 leftover profiles, ~13 GB, filled the disk) ------------------------------------
// A tempProfileDir() profile is ~75-155 MB (mostly components Chrome downloads into every fresh profile). Tools and
// probes removed it only after a clean finish, so a run stopped by the lock's max-seconds SIGTERM, Ctrl-C or an error
// left it behind. Now launchChrome() owns it: the dir must not exist (or be empty) when launchChrome creates it; it is
// recorded here and in a marker file, and removed (Chrome's process tree killed first) at close(), at process exit
// (an uncaught error included) and on SIGINT / SIGTERM / SIGHUP (when nothing else handles the signal, this process
// then exits 128+n; when something does, e.g. the lock library or check.mjs, that handler exits and the exit hook
// removes it). Only a path recorded at its creation by this process is ever removed, never by name pattern.
// A SIGKILL can't be caught: such a leftover keeps its marker (a dead pid), and `node tools/space.mjs report` lists it.
// That path is still common (review-i095 A): a stopped shared or short `lock.mjs run` (Ctrl-C or a signal to the run
// itself) sends its command SIGKILL right after the signal (tools/lock.mjs, the run's signal handler), so the profile
// still leaks there; only its --max-seconds stop (SIGTERM, SIGKILL 3 s later) and a normal hold's stop leave time for
// this cleanup. A kill -9 of the tool or of Chrome's parent leaks it too.
// Persistent profiles (verify.mjs's out/chrome-verify-profile, bench's out/chrome-bench-profile) are never touched.
// FW_KEEP_PROFILE=1 (or launchChrome({keepProfile: true})) keeps the profile for debugging.
// I-106: the hard-kill gap. A bounded `lock.mjs run` (--short, --shared) names a per-run list in $FW_RUN_PROFILES; every
// throwaway profile created inside its command's tree appends its path there (bookkeeping only: nothing about the
// launch changes). After the run SIGKILLs the tree (max-seconds, or a signal past its grace), removeRunProfiles()
// deletes each listed folder whose marker names a process of that killed tree, created during the run, no longer
// running. Never by name pattern, never a folder without our marker, never one another process made.
export const TEMP_PROFILE_MARKER = '.fw-temp-profile.json';
export const RUN_PROFILES_ENV = 'FW_RUN_PROFILES';
const RESERVED = new Set(); // paths handed out by tempProfileDir() in this process
const OWNED = new Map(); // dir -> {}: created by this process (recorded at creation), removed when its run ends
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
const keepWanted = () => process.env.FW_KEEP_PROFILE === '1';
/** Throwaway profile dirs this process created and has not removed yet. */
export const ownedTempProfiles = () => [...OWNED.keys()];

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
/** Wait (synchronously, for 'exit' hooks) until none of `pids` runs any more; zombies count as gone (they write nothing). */
function waitGoneSync(pids, ms = 2000) {
  for (let t = 0; t < ms; t += 50) {
    const out = spawnSync('ps', ['-o', 'pid=,stat=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 2000 }).stdout || '';
    if (!out.split('\n').some((l) => /^\s*\d+\s+[^Z\s]/.test(l))) return true;
    sleepSync(50);
  }
  return false;
}
/** Remove one owned profile (sync). Returns true when it is gone. */
function removeOwned(dir) {
  if (!OWNED.has(dir)) return false;
  OWNED.delete(dir);
  if (!OWNED.size) for (const s of Object.keys(SIGNALS)) process.off(s, onSignal);
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
  if (existsSync(dir)) { sleepSync(200); try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
  return !existsSync(dir);
}
function onSignal(sig) {
  // another listener (the lock library, check.mjs) owns the exit; our 'exit' hook still removes the profile
  if (process.listenerCount(sig) > 1) return;
  process.exit(128 + SIGNALS[sig]);
}
/** Claim `dir` as this process's throwaway profile when it was reserved by tempProfileDir() and is new (or empty). */
function claimTempProfile(dir, keep) {
  if (!RESERVED.has(dir) || keep) return false;
  RESERVED.delete(dir);
  let fresh = !existsSync(dir);
  if (!fresh) { try { fresh = readdirSync(dir).length === 0; } catch { fresh = false; } }
  if (!fresh) return false;
  mkdirSync(dir, { recursive: true });
  const tool = process.argv[1] ? process.argv[1].split('/').slice(-3).join('/') : null;
  writeFileSync(join(dir, TEMP_PROFILE_MARKER), JSON.stringify({ schema: 'fw-temp-profile/1', dir, pid: process.pid, ppid: process.ppid, createdAt: new Date().toISOString(), tool }) + '\n');
  // I-106: tell the enclosing bounded `lock.mjs run` (its list exists only while it runs; never created here)
  const list = process.env[RUN_PROFILES_ENV];
  if (list && isAbsolute(list) && existsSync(list)) { try { appendFileSync(list, dir + '\n'); } catch {} }
  if (!OWNED.size) for (const s of Object.keys(SIGNALS)) process.on(s, onSignal);
  OWNED.set(dir, {});
  return true;
}

/**
 * I-106: after a bounded `lock.mjs run` hard-killed its command's tree, remove the throwaway profiles listed in its
 * $FW_RUN_PROFILES file (`listFile`) that the tree left: a folder goes only when its marker (TEMP_PROFILE_MARKER) is ours
 * (schema, the same dir), names a creator in `pids` (the killed tree), was created at or after `since` (ms; the run's
 * start, so a reused pid's older profile stays) and that creator no longer runs (`isAlive`). A folder without a marker
 * was already removed (or never ours) and is skipped silently. Returns {removed: [dir], kept: [{dir, why}]}.
 */
export function removeRunProfiles(listFile, { pids, since = 0, isAlive = pidAlive } = {}) {
  const removed = [], kept = [];
  let lines = [];
  try { lines = readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { return { removed, kept }; }
  for (const dir of [...new Set(lines)]) {
    if (!isAbsolute(dir)) { kept.push({ dir, why: 'not an absolute path' }); continue; }
    let m;
    try { m = JSON.parse(readFileSync(join(dir, TEMP_PROFILE_MARKER), 'utf8')); } catch { if (existsSync(dir)) kept.push({ dir, why: 'no profile marker' }); continue; }
    const why = m?.schema !== 'fw-temp-profile/1' || m.dir !== dir ? 'marker does not match the folder'
      : !pids?.has?.(m.pid) ? `made by pid ${m.pid}, not a process of the killed tree`
        : !(Date.parse(m.createdAt) >= since) ? 'made before this run started'
          : isAlive(m.pid) ? `its creator (pid ${m.pid}) still runs` : null;
    if (why) { kept.push({ dir, why }); continue; }
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
    if (existsSync(dir)) kept.push({ dir, why: 'could not be removed' });
    else removed.push(dir);
  }
  return { removed, kept };
}
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * Launch a dedicated Chrome (own profile dir + port) and return {proc, port, wsUrl, browser, userAgent, headless, close}.
 * port 0 = let Chrome pick a free DevTools port (read back from <profileDir>/DevToolsActivePort), so
 * parallel worktrees never collide. A profile dir can only be used by one Chrome at a time.
 * `args`: extra command-line switches (before the start URL); none by default, so a default launch is unchanged.
 */
export async function launchChrome({ port = 9333, profileDir, headless = false, windowSize = '1440,900', args: extraArgs = [], keepProfile = keepWanted() } = {}) {
  const temp = claimTempProfile(profileDir, keepProfile);
  if (!temp && keepProfile && RESERVED.has(profileDir)) { RESERVED.delete(profileDir); console.error(`launchChrome: keeping the temp profile ${profileDir} (FW_KEEP_PROFILE=1 / keepProfile)`); }
  mkdirSync(profileDir, { recursive: true });
  const activePortFile = join(profileDir, 'DevToolsActivePort');
  rmSync(activePortFile, { force: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${windowSize}`,
    // Keep rAF / timers running even if the window is occluded by other windows
    // while the measurement runs (otherwise macOS occlusion detection pauses frames).
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    ...(headless ? ['--headless=new'] : []),
    ...extraArgs,
    'about:blank',
  ];
  const proc = spawn(chromePath(), args, { stdio: 'ignore', detached: false });
  // Never leave the browser behind when this process exits early (crash, or SIGTERM/SIGINT handled by the
  // chrome-measure lock, which calls process.exit): it would keep the profile dir locked for the next run.
  // Registered at once, not after the DevTools port is up: a signal during the launch (verify now launches
  // after its host recheck, I-023) must not orphan the browser either. The whole process tree: a browser
  // SIGKILLed while it is still starting leaves its helpers (GPU, network, renderers) running.
  // I-095: a throwaway profile goes with it, once the tree is gone (an 'exit' hook runs synchronously)
  const killOnExit = () => { const pids = killTree(proc.pid); if (temp && OWNED.has(profileDir)) { waitGoneSync(pids.slice(1)); removeOwned(profileDir); } };
  process.on('exit', killOnExit);
  let version;
  let exited = false;
  proc.on('exit', () => { exited = true; });
  for (let i = 0; i < 150 && !exited; i++) {
    try {
      if (!port) port = Number(readFileSync(activePortFile, 'utf8').split('\n')[0]) || 0;
      if (port) { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }
    } catch {}
    await sleep(100);
  }
  if (!version) { process.off('exit', killOnExit); if (temp) killOnExit(); else proc.kill(); throw new Error(`Chrome did not open a DevTools port (${port || 'auto'})${exited ? ': it exited at once — is another Chrome already using profile ' + profileDir + '?' : ''}`); }
  return {
    proc,
    port,
    wsUrl: version.webSocketDebuggerUrl,
    /** The browser's product string from /json/version, e.g. "Chrome/154.0.8037.58" (T8+, I-033: no extra CDP command). */
    browser: version.Browser || null,
    /** The browser's User-Agent from the same /json/version (no CDP command); "HeadlessChrome/" in headless mode. */
    userAgent: version['User-Agent'] || null,
    /** True when the browser runs headless (its UA says so), however it was launched (e.g. a $CHROME wrapper). */
    headless: isHeadlessUA(version['User-Agent']),
    /**
     * SIGTERM, wait for the exit (up to graceMs), then SIGKILL the whole tree and wait again: resolves
     * once the browser is gone, so a relaunch on the same profile dir cannot find it still locked (I-023).
     */
    async close({ graceMs = 5000 } = {}) {
      try {
        if (exited) return;
        try { proc.kill('SIGTERM'); } catch {}
        for (let t = 0; t < graceMs && !exited; t += 50) await sleep(50);
        if (!exited) { killTree(proc.pid); for (let t = 0; t < 3000 && !exited; t += 50) await sleep(50); }
      } finally {
        process.off('exit', killOnExit);
        // I-095: the browser is gone; its helpers may take a moment longer (removeOwned retries)
        if (temp && OWNED.has(profileDir)) { if (!exited) killOnExit(); else removeOwned(profileDir); }
      }
    },
  };
}

export class CDP {
  static async connect(wsUrl) {
    const c = new CDP();
    await c._open(wsUrl);
    return c;
  }
  _open(wsUrl) {
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
      } else {
        for (const l of this.listeners) l(msg);
      }
    };
    // If the browser dies (crash, killed, profile taken over), fail every pending and later call instead
    // of awaiting a reply forever: a hung verify.mjs would hold the chrome-measure lock indefinitely.
    this.ws.onclose = () => {
      this.closedError = new Error('CDP connection closed (did Chrome exit or crash?)');
      for (const p of this.pending.values()) p.reject(this.closedError);
      this.pending.clear();
    };
    return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
  }
  send(method, params = {}, sessionId) {
    if (this.closedError) return Promise.reject(new Error(`${method}: ${this.closedError.message}`));
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  waitFor(pred, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('waitFor timeout')); }, timeoutMs);
      const off = this.on((m) => { if (pred(m)) { clearTimeout(t); off(); resolve(m); } });
    });
  }
  close() { try { this.ws.close(); } catch {} }

  /** Open a page in a fresh, isolated browser context; returns a session helper. */
  async newIsolatedPage() {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const cdp = this;
    const page = {
      targetId, sessionId, browserContextId,
      send: (m, p) => cdp.send(m, p, sessionId),
      on: (fn) => cdp.on((msg) => { if (msg.sessionId === sessionId) fn(msg); }),
      waitFor: (pred, t) => cdp.waitFor((msg) => msg.sessionId === sessionId && pred(msg), t),
      async eval(expr, { awaitPromise = true, timeout } = {}) {
        const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true, timeout }, sessionId);
        if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      },
      async close() {
        try { await cdp.send('Target.closeTarget', { targetId }); } catch {}
        try { await cdp.send('Target.disposeBrowserContext', { browserContextId }); } catch {}
      },
    };
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }
}

const REAL_CLOCK = { now: () => Date.now(), sleep };
/**
 * Navigate and wait for load + a quiet period with no new network requests. `clock` ({now(), sleep(ms)})
 * runs the quiet wait; default Date.now + setTimeout. verify.mjs passes a stubbed host's fake clock in
 * tests only (I-027). The load event wait (maxMs) stays on real time.
 */
export async function gotoAndSettle(page, url, { quietMs = 1500, maxMs = 45000, clock = REAL_CLOCK } = {}) {
  let last = clock.now();
  const off = page.on((m) => { if (m.method === 'Network.requestWillBeSent' || m.method === 'Network.loadingFinished') last = clock.now(); });
  const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', maxMs).catch(() => null);
  await page.send('Page.navigate', { url });
  await loaded;
  const start = clock.now();
  while (clock.now() - last < quietMs && clock.now() - start < maxMs) await clock.sleep(200);
  off();
}

export { sleep };

// ---- additive helpers for tools/bench.mjs (never called on the verify.mjs path) ------------------------
/** Performance.enable with a time domain: 'timeTicks' (wall) or 'threadTicks' (main-thread running time). */
export async function enablePerformance(page, timeDomain = 'timeTicks') {
  if (!['timeTicks', 'threadTicks'].includes(timeDomain)) throw new Error(`bad timeDomain ${timeDomain}`);
  await page.send('Performance.enable', { timeDomain });
}
/** Performance.getMetrics as {name: value} (LayoutCount, RecalcStyleCount, LayoutDuration s, ...). */
export async function getMetrics(page) {
  const { metrics } = await page.send('Performance.getMetrics');
  return Object.fromEntries((metrics || []).map((m) => [m.name, m.value]));
}
/** Event listeners on the object `expr` evaluates to (e.g. 'window'): [{type, passive, useCapture, once}]. */
export async function eventListeners(page, expr) {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression: expr, returnByValue: false });
  if (exceptionDetails || !result?.objectId) throw new Error(`eventListeners: ${expr} is not an object`);
  try {
    const { listeners } = await page.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    return (listeners || []).map((l) => ({ type: l.type, passive: !!l.passive, useCapture: !!l.useCapture, once: !!l.once }));
  } finally {
    await page.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});
  }
}
/** Browser product string, e.g. "Chrome/140.0.7339.80" (a browser-level command). */
export async function browserVersion(cdp) {
  const v = await cdp.send('Browser.getVersion');
  return v.product || null;
}

// Minimal Chrome DevTools Protocol client (Node >= 22: built-in fetch + WebSocket).
// No dependencies. Used by tools/mirror.mjs --crawl and tools/verify.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Launch a dedicated Chrome (own profile dir + port) and return {proc, port, wsUrl, close}.
 * port 0 = let Chrome pick a free DevTools port (read back from <profileDir>/DevToolsActivePort), so
 * parallel worktrees never collide. A profile dir can only be used by one Chrome at a time.
 */
export async function launchChrome({ port = 9333, profileDir, headless = false, windowSize = '1440,900' } = {}) {
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
    'about:blank',
  ];
  const proc = spawn(chromePath(), args, { stdio: 'ignore', detached: false });
  // Never leave the browser behind when this process exits early (crash, or SIGTERM/SIGINT handled by the
  // chrome-measure lock, which calls process.exit): it would keep the profile dir locked for the next run.
  // Registered at once, not after the DevTools port is up: a signal during the launch (verify now launches
  // after its host recheck, I-023) must not orphan the browser either. The whole process tree: a browser
  // SIGKILLed while it is still starting leaves its helpers (GPU, network, renderers) running.
  const killOnExit = () => killTree(proc.pid);
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
  if (!version) { process.off('exit', killOnExit); proc.kill(); throw new Error(`Chrome did not open a DevTools port (${port || 'auto'})${exited ? ': it exited at once — is another Chrome already using profile ' + profileDir + '?' : ''}`); }
  return {
    proc,
    port,
    wsUrl: version.webSocketDebuggerUrl,
    /** The browser's product string from /json/version, e.g. "Chrome/154.0.8037.58" (T8+, I-033: no extra CDP command). */
    browser: version.Browser || null,
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
      } finally { process.off('exit', killOnExit); }
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

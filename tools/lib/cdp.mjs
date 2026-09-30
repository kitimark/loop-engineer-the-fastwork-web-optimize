// Minimal Chrome DevTools Protocol client (Node >= 22: built-in fetch + WebSocket).
// No dependencies. Used by tools/mirror.mjs --crawl and tools/verify.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  if (!version) { proc.kill(); throw new Error(`Chrome did not open a DevTools port (${port || 'auto'})${exited ? ': it exited at once — is another Chrome already using profile ' + profileDir + '?' : ''}`); }
  // Never leave the browser behind when this process exits early (crash, or SIGTERM/SIGINT handled by the
  // chrome-measure lock, which calls process.exit): it would keep the profile dir locked for the next run.
  const killOnExit = () => { try { proc.kill('SIGKILL'); } catch {} };
  process.on('exit', killOnExit);
  return {
    proc,
    port,
    wsUrl: version.webSocketDebuggerUrl,
    async close() {
      process.off('exit', killOnExit);
      try { proc.kill('SIGTERM'); } catch {}
      await sleep(300);
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

/** Navigate and wait for load + a quiet period with no new network requests. */
export async function gotoAndSettle(page, url, { quietMs = 1500, maxMs = 45000 } = {}) {
  let last = Date.now();
  const off = page.on((m) => { if (m.method === 'Network.requestWillBeSent' || m.method === 'Network.loadingFinished') last = Date.now(); });
  const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', maxMs).catch(() => null);
  await page.send('Page.navigate', { url });
  await loaded;
  const start = Date.now();
  while (Date.now() - last < quietMs && Date.now() - start < maxMs) await sleep(200);
  off();
}

export { sleep };

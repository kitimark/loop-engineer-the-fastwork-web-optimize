// Minimal WebKit Inspector Protocol client for iOS Safari via ios_webkit_debug_proxy
// (`ios_webkit_debug_proxy -c null:9221,:9222-9322`). Copied from
// research/cpu-throttle-calibration/tools/iphone_wip.mjs so tools/ doesn't import from research/.
// iOS 26 exposes a "page" target and "frame" target(s); commands are routed via Target.sendMessageToTarget.
// Target ids change on every navigation, so reconnect (openTab) after navigating.
// WebKit quirks seen on iOS 26.6.1: Runtime.evaluate ignores awaitPromise (returns the Promise object),
// Page.navigate is not available (navigate with location.href), Timeline timestamps are all 0 over the proxy.
import { lanSafeUrl, lanSafeText } from './iphone-url.mjs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// One remote inspector per page (incident I-038). WebKit's RemoteInspector keeps one connection per target and
// silently ignores a second client's setup while one exists (RemoteInspectorCocoa.mm receivedSetupMessage:
// `if (m_targetConnectionMap.contains(targetIdentifier)) return;`), and forwards any client's data to the holder's
// connection (receivedDataMessage), whose replies go to the holder: CONFIRMED, github.com/WebKit/WebKit main, read
// 2026-10-01. So while Safari's Web Inspector on the Mac (Develop menu) is attached to the tab, our connection gets no
// page target or no answers, and it can take the tab whenever ours lets go (a reload, a reconnect). Named in every
// such failure, since we cannot see that client.
export const INSPECTOR_HINT = 'is another inspector client attached to this tab, e.g. Safari\'s Web Inspector (Develop menu) on the Mac? Close it: one remote inspector per page (I-038)';

// Every failure closes the socket before it throws (incident I-043: a "no page target" left it open, so one
// `iphone.mjs open` held up to 6 sockets to the proxy, one per openTab try, until the process exited).
export async function connect(wsUrl, {timeoutMs = 15000} = {}) {
  const ws = new WebSocket(wsUrl);
  const fail = (e) => { try { ws.close(); } catch {} throw e; };
  let openTimer;
  try {
    await Promise.race([
      new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }),
      new Promise((res, rej) => { openTimer = setTimeout(() => rej(new Error('websocket open timeout')), timeoutMs); }),
    ]);
  } catch (e) { fail(e); } finally { clearTimeout(openTimer); }
  let id = 0, innerId = 0;
  const targets = {}, pending = new Map(), listeners = [];
  // A closed connection fails fast (incident I-038). ios_webkit_debug_proxy keeps ONE inspector client per page: a newer
  // connection to the tab takes the page from this one (iwdp_start_devtools, "Taking page ... from local"), and this
  // one's next command is answered with a close, code 1001 "Page <port>/<n> claimed by ...", never forwarded
  // (iwdp_on_frame, "someone stole our page?"): CONFIRMED, github.com/google/ios-webkit-debug-proxy
  // src/ios_webkit_debug_proxy.c (master, read 2026-10-01); seen on the Simulator with morph-log's connection. Every
  // later command used to wait out its timeout on the dead socket.
  let closed = null, selfClosed = false;
  const closedError = () => Object.assign(new Error(selfClosed ? 'inspector connection closed (by this tool)'
    : `inspector connection closed by the proxy (code ${closed.code}${closed.reason ? ` "${closed.reason}"` : ''}): another inspector connection took this tab (one per page, I-038)`), { closed: true });
  ws.addEventListener('close', (ev) => {
    closed = { code: ev.code, reason: ev.reason || '', self: selfClosed, at: Date.now() };
    const e = closedError();
    for (const p of pending.values()) p.rej(e);
    pending.clear();
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Target.targetCreated') { targets[m.params.targetInfo.type] = m.params.targetInfo.targetId; return; }
    if (m.method === 'Target.targetDestroyed') { for (const k in targets) if (targets[k] === m.params.targetId) delete targets[k]; return; }
    if (m.method === 'Target.dispatchMessageFromTarget') {
      const inner = JSON.parse(m.params.message);
      if (inner.id && pending.has(inner.id)) { const p = pending.get(inner.id); pending.delete(inner.id); inner.error ? p.rej(inner.error) : p.res(inner.result); }
      else listeners.forEach(l => l(inner, m.params.targetId));
    }
  };
  await sleep(800);
  if (!targets.page) fail(new Error(`no page target (phone locked / Safari backgrounded? or ${INSPECTOR_HINT})`));
  const send = (method, params = {}, type = 'page', tmo = timeoutMs) => new Promise((res, rej) => {
    if (closed) { rej(closedError()); return; }
    const targetId = targets[type] ?? targets.page;
    const iid = ++innerId;
    const timer = setTimeout(() => { pending.delete(iid); rej(new Error(`${method} timed out after ${tmo}ms (${INSPECTOR_HINT})`)); }, tmo);
    pending.set(iid, {res: v => { clearTimeout(timer); res(v); }, rej: e => { clearTimeout(timer); rej(e); }});
    ws.send(JSON.stringify({id: ++id, method: 'Target.sendMessageToTarget',
      params: {targetId, message: JSON.stringify({id: iid, method, params})}}));
  });
  const evaluate = async (expr, type = 'page', tmo) => {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true}, type, tmo);
    if (r.wasThrown) throw new Error(JSON.stringify(r.result));
    return r.result.value;
  };
  return {ws, targets, send, evaluate, on: (fn) => listeners.push(fn), close: () => { selfClosed = true; ws.close(); },
    /** null while open; {code, reason, self, at} once closed (self: by close()) */
    get closed() { return closed; }};
}

// Which listed target is Safari's tab (incident I-037). The proxy's /json lists every inspectable web view on the
// phone, one entry per page with its app as `appId` ("PID:<pid>"), so another app's background WKWebView shows up
// next to Safari's tab (seen: an about:blank view of PID:1304 listed before Safari's PID:613), and Runtime.evaluate
// on it times out. pickTab therefore:
//   - never picks a blank web view (url about:blank or empty): a run never targets one;
//   - keeps the tabs whose url matches `match` (a function of the url, or a substring such as the expected host);
//   - with FW_IPHONE_APPID=<appId> (or opts.appId) keeps only that app's tabs; otherwise, when `preferAppId` (the
//     app openTab connected to last in this process, i.e. Safari's after the first connect) is among them, only
//     that app's: a reconnect after a reload or navigation stays in Safari;
//   - returns the one tab left, and throws when none is left or when several are (AMBIGUOUS: it never picks the
//     first of several), naming every listed target (url, appId) so the user can close one or set the env.
// The messages are printed and can end up in a saved gesture record (res.aborted), so every url and host in them
// goes through lanSafeUrl / lanSafeText, and titles are named only for the candidates of a url / host match (the
// mirror's pages), never for the user's other tabs and apps: not in the target list, and not when any page matches
// (safariTab, openTab(() => true)), where every Safari tab is a candidate (Hard rule 12; review-t1a N1; terminal output
// ends up in agent transcripts).
export const isBlankUrl = (u) => !u || /^about:blank([?#]|$)/.test(String(u));
const describeTab = (p, { title = false } = {}) => `${lanSafeUrl(p.url) || '(no url)'}${title && p.title ? ` "${p.title}"` : ''}${p.appId ? ` [${p.appId}]` : ''}`;
const describeMatch = (m) => (typeof m === 'function' ? (m.length || String(m).replace(/\s/g, '') !== '()=>true' ? 'the matcher' : 'any page') : JSON.stringify(lanSafeText(String(m))));
export function pickTab(pages, match = () => true, { appId = process.env.FW_IPHONE_APPID || null, preferAppId = null } = {}) {
  const all = (Array.isArray(pages) ? pages : []).filter((p) => p && p.webSocketDebuggerUrl);
  const listed = all.map((p) => describeTab(p)).join(', ') || '(none)';
  const ok = (p) => (typeof match === 'function' ? match(p.url) : String(p.url || '').includes(match));
  let c = all.filter((p) => !isBlankUrl(p.url) && ok(p));
  if (appId) c = c.filter((p) => p.appId === appId);
  else if (preferAppId && c.some((p) => p.appId === preferAppId)) c = c.filter((p) => p.appId === preferAppId);
  if (c.length === 1) return c[0];
  const which = `${describeMatch(match)}${appId ? ` in app ${appId} (FW_IPHONE_APPID)` : ''}`;
  if (!c.length) {
    const blankOnly = all.length > 0 && all.every((p) => isBlankUrl(p.url));
    throw new Error(`no tab matching ${which} (blank web views are never picked, I-037); targets: ${listed}${blankOnly ? '. Safari shows no page: open any http page in Safari first' : ''}`);
  }
  const e = new Error(`AMBIGUOUS: ${c.length} tabs match ${which}: ${c.map((p) => describeTab(p, { title: typeof match === 'string' })).join(', ')} (all targets: ${listed}). Not picking one (I-037): close the other Safari tabs or the other app, or set FW_IPHONE_APPID=<appId> to Safari's`);
  e.ambiguous = true;
  throw e;
}

/** The one Safari tab for a tab-list check (certificate warning, lease URL): pickTab with any url. */
export function safariTab(pages, opts) {
  try { return pickTab(pages, () => true, opts); } catch (e) {
    if (!e.ambiguous) e.message = `no Safari tab (unlock the iPhone, bring Safari to the front): ${e.message}`;
    throw e;
  }
}

let lastAppId = null; // the app of the last tab openTab connected to (Safari's), preferred on reconnects (I-037)

// Find the Safari tab whose URL matches `match` (pickTab) and connect, retrying with backoff. Several matching tabs
// fail after two listings (AMBIGUOUS), not after the whole backoff, and not as "unlock the iPhone". `appId`: Safari's
// app ("PID:<pid>", e.g. from WDA's activeAppInfo), else FW_IPHONE_APPID.
export async function openTab(match, {tries = 6, port = Number(process.env.FW_IPHONE_PORT || 9222), appId = process.env.FW_IPHONE_APPID || null} = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const pages = await (await fetch(`http://localhost:${port}/json`)).json();
      const p = pickTab(pages, match, { appId, preferAppId: lastAppId });
      const c = await connect(p.webSocketDebuggerUrl);
      try { await c.evaluate('1', 'page', 8000); } catch (e) { c.close(); throw e; } // no socket left open per try (I-043)
      lastAppId = p.appId ?? lastAppId;
      return c;
    } catch (e) {
      lastErr = e;
      console.error(`openTab try ${i + 1}: ${e.message || JSON.stringify(e)}`);
      if (e.ambiguous && i >= 1) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`BLOCKED: cannot reach Safari tab (${lastErr?.message}). Unlock the iPhone, bring Safari to the foreground, and close any Web Inspector attached to the tab on the Mac (Safari's Develop menu; one remote inspector per page, I-038).`);
}

// Navigate the tab (Page.navigate is unavailable on iOS 26) and reconnect once the new URL is listed.
export async function navigate(c, url, match = url) {
  await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 50); 'ok'`);
  c.close();
  await sleep(2500);
  const c2 = await openTab(match);
  for (let i = 0; i < 60; i++) { if (await c2.evaluate('document.readyState') === 'complete') break; await sleep(500); }
  return c2;
}

// Park Safari between phone runs and blocks (incident I-047): a test page left open keeps its animations running and
// the phone warm (41.0 °C 20 min after a block that ended at 39.7 °C). Navigates Safari's tab (pickTab over the
// http(s) pages, I-037 rules: never a blank web view, never the first of several) to about:blank, then checks the
// tab list until that page is gone (`timeoutMs`). Safari already showing no web page (only blank views listed):
// {already: true}, nothing touched. Returns {from: <the parked page, LAN-safe>}. The caller holds the iphone lease.
export const PARK_URL = 'about:blank';
export const PARK_JS = `setTimeout(() => { location.href = ${JSON.stringify(PARK_URL)}; }, 100); 'parking'`;
const isWebUrl = (u) => /^https?:\/\//i.test(String(u || ''));
export async function parkSafari({ port = Number(process.env.FW_IPHONE_PORT || 9222), appId = process.env.FW_IPHONE_APPID || null, timeoutMs = 8000, pollMs = 500 } = {}) {
  const list = async () => (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  const pages = await list();
  let tab;
  try { tab = pickTab(pages, isWebUrl, { appId, preferAppId: lastAppId }); } catch (e) {
    const listed = (Array.isArray(pages) ? pages : []).filter((p) => p && p.webSocketDebuggerUrl);
    if (!e.ambiguous && listed.length && !listed.some((p) => isWebUrl(p.url))) return { already: true };
    if (!e.ambiguous) e.message = `no Safari page to park (unlock the iPhone, bring Safari to the front): ${e.message}`;
    throw e;
  }
  const c = await openTab(isWebUrl, { port, appId, tries: 3 });
  try { await c.evaluate(PARK_JS); } finally { c.close(); }
  const t0 = Date.now();
  for (;;) {
    await sleep(pollMs);
    const now = await list().catch(() => null);
    if (Array.isArray(now) && !now.some((p) => p && p.url === tab.url && (!tab.appId || p.appId === tab.appId))) return { from: lanSafeUrl(tab.url) };
    if (Date.now() - t0 >= timeoutMs) throw new Error(`Safari still lists ${lanSafeUrl(tab.url)} ${Math.round(timeoutMs / 1000)} s after location.href = ${PARK_URL}: not parked`);
  }
}

// Run an async in-page expression that returns a Promise: stash the result on window, then poll.
export async function runAsync(c, expr, {pollMs = 2000, timeoutMs = 180000, key = '__iphRes'} = {}) {
  await c.evaluate(`window.${key} = undefined; Promise.resolve(${expr}).then(v => { window.${key} = JSON.stringify({ok: v}); }, e => { window.${key} = JSON.stringify({err: String(e && e.stack || e)}); }); 'started'`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(pollMs);
    const v = await c.evaluate(`window.${key} || null`);
    if (v) { const o = JSON.parse(v); if (o.err) throw new Error(o.err); return o.ok; }
  }
  throw new Error('runAsync timed out');
}

// `node tools/iphone.mjs safari-restart --owner <o> [--url U] [--via auto|wda|devicectl] [--timeout S]`
// (and `node tools/sim.mjs safari-restart [--url U] [--via auto|wda|simctl]` inside a Simulator session):
// quit Mobile Safari, start it again, optionally load a URL, and wait until the WebKit proxy lists that page and its
// Runtime.evaluate answers. Prints `SAFARI_RESTARTED via <how> in <ms> ms: <href>` or throws a clear error.
//
// Sequence: (1) the driver quits and relaunches Safari; (2) wait for the ONE page Safari restores (any non-blank
// page; several tabs are an error, as for every phone tool, I-037); (3) with --url: load it IN THAT TAB
// (location.href over the inspector, like `iphone.mjs open`), so tabs do not pile up. Only when Safari restores no
// page at all does the driver open the URL (a new tab: WDA /url, devicectl --payload-url, simctl openurl; on the
// Simulator each of those opened a new tab next to the restored one, OBSERVED 2026-10-01); (4) wait for a page whose
// URL is the target, check it landed (certificate warning, I-003; landedProblem) and print it.
// I-069: a navigation in the restored tab that shows nothing within the restore window is checked from the Mac: a
// server that does not answer fails at once, naming it (Safari's load-error page was listed as a data:text/html tab);
// a server that answers gets the URL in a fresh tab via the driver (that tab may not navigate). A target that never
// shows also names an unreachable server.
//
// Drivers (`auto` takes the first available):
//   wda        WebDriverAgent (wda.mjs): POST /wda/apps/terminate, /wda/apps/launch; open: /url with Safari's bundle
//              id (XCUIDevice openUrl:withApplication:). The same calls reach WDA-sim on the Simulator.
//   devicectl  the phone without WDA: `xcrun devicectl device process launch --terminate-existing --device <udid>
//              com.apple.mobilesafari` (open: `launch --payload-url U`); the UDID from wda-runner's config.json.
//   simctl     the Simulator without WDA-sim: `xcrun simctl terminate|launch <udid> com.apple.mobilesafari`
//              (a Safari that is not running is fine); open: `simctl openurl <udid> U`.
// The URL is never typed through pointer actions; a self-signed https mirror URL becomes its plain-http twin
// (iphoneTarget, incident I-003).
//
// Privacy (Hard rule 12): every message goes through redact() (UDID, device name, team, runner bundle id) and
// lanSafeText() (LAN hosts); tabs are picked by function matchers, so no tab's title is ever named (pickTab,
// review-t1a N1). Test doubles: $FW_DEVICECTL / $FW_SIMCTL name an executable that takes the arguments after
// `xcrun devicectl` / `xcrun simctl`.
import { execFile } from 'node:child_process';
import { SAFARI, status as wdaStatus, createSession } from './wda.mjs';
import { redact } from './redact.mjs';
import { pickTab, connect, sleep } from './wip.mjs';
import { mirrorInfo, iphoneTarget, LANDED_JS, landedProblem, lanSafeText } from './iphone-url.mjs';

export const VIAS = ['auto', 'wda', 'devicectl', 'simctl'];

/** Text safe to print or save: known ids and id shapes redacted, LAN hosts replaced. */
export const safe = (s, known = {}) => lanSafeText(redact(String(s ?? ''), known));

/** Run an executable; resolves {code, out} (stdout + stderr), never rejects. */
export function runExe(file, args, { timeoutMs = 60000, env = process.env } = {}) {
  return new Promise((res) => {
    execFile(file, args, { timeout: timeoutMs, env, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr || ''}`.trim();
      if (!err) return res({ code: 0, out });
      res({ code: typeof err.code === 'number' ? err.code : null, out, error: err.killed ? `timed out after ${Math.round(timeoutMs / 1000)} s` : (typeof err.code === 'string' ? err.code : null) });
    });
  });
}

/** `xcrun <tool> ...`, or the test double named by $<envName> (same arguments, without the tool name). */
const xcrunTool = (tool, envName, env = process.env) => (env[envName] ? { file: env[envName], pre: [] } : { file: 'xcrun', pre: [tool] });
const tail = (out) => out.split('\n').slice(-6).join(' | ');

export const devicectlArgs = ({ udid, url = null }) => (url
  ? ['device', 'process', 'launch', '--payload-url', url, '--device', udid, SAFARI]
  : ['device', 'process', 'launch', '--terminate-existing', '--device', udid, SAFARI]);

/** The WDA driver (phone or WDA-sim). */
export function wdaDriver({ base }) {
  const withSession = async (fn) => { const s = await createSession({ base }); try { return await fn(s); } finally { await s.close(); } };
  return {
    name: 'wda',
    async available() { try { return !!(await wdaStatus({ base, timeoutMs: 3000 }))?.ready; } catch { return false; } },
    restart: () => withSession(async (s) => { await s.terminate(SAFARI); await s.launch(SAFARI); }),
    open: (url) => withSession((s) => s.openUrl(url, SAFARI)),
  };
}

/** The devicectl driver (the phone): launch with --terminate-existing; open: launch with the URL as payload. */
export function devicectlDriver({ udid, env = process.env, timeoutMs = 60000 }) {
  const { file, pre } = xcrunTool('devicectl', 'FW_DEVICECTL', env);
  const launch = async (url) => {
    if (!udid) throw new Error('no device UDID configured (node tools/iphone.mjs wda build --owner <you> --udid <UDID> stores it)');
    const r = await runExe(file, [...pre, ...devicectlArgs({ udid, url })], { timeoutMs, env });
    if (r.code !== 0) throw new Error(`devicectl launch${url ? ' --payload-url' : ' --terminate-existing'} failed (${r.error || `exit ${r.code}`}): ${tail(r.out)}`);
  };
  return { name: 'devicectl', async available() { return !!udid; }, restart: () => launch(null), open: (url) => launch(url) };
}

/** The simctl driver (the Simulator): terminate (a Safari that is not running is fine), launch; open: openurl. */
export function simctlDriver({ udid, env = process.env, timeoutMs = 60000 }) {
  const { file, pre } = xcrunTool('simctl', 'FW_SIMCTL', env);
  const sc = async (args, okFail = false) => {
    if (!udid) throw new Error('no Simulator configured (node tools/sim.mjs setup)');
    const r = await runExe(file, [...pre, ...args], { timeoutMs, env });
    if (r.code !== 0 && !okFail) throw new Error(`simctl ${args[0]} failed (${r.error || `exit ${r.code}`}): ${tail(r.out)}`);
  };
  return {
    name: 'simctl',
    async available() { return !!udid; },
    restart: async () => { await sc(['terminate', udid, SAFARI], true); await sc(['launch', udid, SAFARI]); },
    open: (url) => sc(['openurl', udid, url]),
  };
}

/** Is `u` the page `target` (Safari may add a trailing slash to a bare origin)? */
export function isTarget(u, target) {
  try { return new URL(u).href === new URL(target).href || String(u).startsWith(target); } catch { return false; }
}

/**
 * Why a listed page may not answer: another inspector holds it. WebKit's RemoteInspector ignores a second setup for
 * a target that already has a connection (RemoteInspectorCocoa.mm receivedSetupMessage: `if
 * (m_targetConnectionMap.contains(targetIdentifier)) return;`), so Safari Web Inspector on the Mac attached to the
 * page leaves our Runtime.evaluate unanswered; its listing carries no flag for that (only WIRHasLocalDebuggerKey).
 * ios_webkit_debug_proxy blanks devtoolsFrontendUrl (`href && !ipage->iws ? href : ""`, iwdp_ipages_to_text) for a
 * page one of ITS OWN clients holds, and for every page when it serves no frontend (-F: sim.mjs's proxy lists ""
 * everywhere, OBSERVED 2026-10-01), so "" means "held" only when another listed page has a frontend URL.
 * Sources: WebKit main and google/ios-webkit-debug-proxy master, read 2026-10-01 (CONFIRMED that a second inspector
 * is ignored; that the Mac's Web Inspector caused our evaluate timeouts stays OBSERVED).
 */
export const INSPECTOR_HINT = 'close Safari Web Inspector on the Mac if it is attached to this page: WebKit lets one inspector connect per page';
/** Pages the proxy marks as held by one of its own clients (none when it serves no frontend at all). */
export const heldTabs = (tabs) => (Array.isArray(tabs) && tabs.some((t) => t?.devtoolsFrontendUrl)
  ? tabs.filter((t) => t?.devtoolsFrontendUrl === '' && !/^about:/.test(t.url || '')) : []);
export const heldBy = (tab, tabs = [tab]) => (heldTabs(tabs).includes(tab)
  ? '; another client of the WebKit proxy holds this page (it lists no devtoolsFrontendUrl): stop that tool'
  : `; ${INSPECTOR_HINT}`);

/**
 * Poll the proxy on `port` until ONE page matching `target` (a URL: that page; null: any non-blank page) answers
 * Runtime.evaluate. Returns {tab, landed} (landed = LANDED_JS: href, title, mirror). Several matching tabs throw at
 * once (AMBIGUOUS, I-037); after `timeoutMs` it throws naming the last reason (err.noPage when nothing matched).
 */
export async function waitForPage({ port, target = null, timeoutMs = 30000, pollMs = 500, fetchImpl = fetch } = {}) {
  const match = target ? (u) => isTarget(u, target) : () => true; // pickTab never picks a blank view
  const t0 = Date.now();
  let why = 'nothing listed yet', noPage = true;
  while (Date.now() - t0 < timeoutMs) {
    let pages = null;
    try { pages = await (await fetchImpl(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(3000) })).json(); } catch (e) { why = `the WebKit proxy on :${port} did not answer (${e.cause?.code || e.name})`; }
    if (pages) {
      let tab = null;
      try { tab = pickTab(pages, match, { appId: null }); } catch (e) { why = e.message; if (e.ambiguous) throw e; }
      if (tab) {
        noPage = false;
        let c = null;
        try {
          c = await connect(tab.webSocketDebuggerUrl, { timeoutMs: 5000 });
          // the restored page (no target) only needs its URL: LANDED_JS's synchronous XHR to an origin that
          // does not answer (a mirror that is gone) would outlast the evaluate timeout
          const landed = target ? await c.evaluate(LANDED_JS, 'page', 5000) : { href: await c.evaluate('location.href', 'page', 5000), title: null, mirror: 0 };
          if (landed?.href && (!target || isTarget(landed.href, target))) return { tab, landed };
          why = 'the page answered from another URL';
        } catch (e) { why = `Runtime.evaluate did not answer (${e.message})${heldBy(tab, pages)}`; } finally { try { c?.close(); } catch {} }
      }
    }
    await sleep(pollMs);
  }
  const e = new Error(`Safari did not ${target ? `show ${target}` : 'come back with a page'} within ${Math.round(timeoutMs / 1000)} s: ${why}`);
  e.noPage = noPage;
  throw e;
}

/**
 * Does `url` answer from this Mac? Any HTTP response counts (self-signed certificates accepted); resolves
 * {ok: true, status} or {ok: false, why} (ECONNREFUSED, timeout, ...), never rejects. Incident I-069: a server that is
 * gone leaves Safari on its load-error page, which the WebKit proxy listed as a data:text/html tab (OBSERVED
 * 2026-10-02, fix-image-size), so a navigation to it never "lands".
 */
export function probeUrl(url, { timeoutMs = 3000 } = {}) {
  return new Promise((res) => {
    let u;
    try { u = new URL(url); } catch { return res({ ok: false, why: 'not a URL' }); }
    if (!/^https?:$/.test(u.protocol)) return res({ ok: false, why: `not http(s) (${u.protocol})` });
    let done = false;
    const end = (v) => { if (!done) { done = true; res(v); } };
    import(u.protocol === 'https:' ? 'node:https' : 'node:http').then((m) => {
      const req = m.request(u, { method: 'HEAD', rejectUnauthorized: false, agent: false, timeout: timeoutMs }, (r) => { r.resume(); end({ ok: true, status: r.statusCode }); });
      req.on('timeout', () => { req.destroy(); end({ ok: false, why: `no answer within ${Math.round(timeoutMs / 1000)} s` }); });
      req.on('error', (e) => end({ ok: false, why: e.code || e.message }));
      req.end();
    }, (e) => end({ ok: false, why: e.message }));
  });
}

/** The error for a target whose server does not answer from the Mac (I-069). */
export const unreachableText = (target, why, restoredUrl = null) => `the server at ${target} does not answer from this Mac (${why}), so Safari can only show its load-error page${restoredUrl && /^data:/.test(restoredUrl) ? ' (the data: tab it lists)' : ''}: start the server again (detached, e.g. nohup, so it survives a Mac sleep), check it with curl, then retry (I-069)`;

/** The proxy's page list (throws when it does not answer). */
export const proxyTabs = async (port) => (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(3000) })).json();

/** Load `url` in the listed tab (location.href over the inspector, like iphone.mjs open). */
export async function navigateTab(tab, url) {
  const c = await connect(tab.webSocketDebuggerUrl, { timeoutMs: 5000 });
  try { await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 50); 'ok'`, 'page', 5000); } finally { c.close(); }
}

/**
 * Restart Safari with the first available driver of `drivers` (or the one named `via`), then wait for it and load
 * `url` (see the header). `known`: ids to redact (wda-runner's config). Returns {via, ms, href, opened: 'tab'|'driver'|null};
 * throws an Error with a safe message. `wait` / `navigate` are injectable for the tests.
 */
export async function safariRestart({ drivers, via = 'auto', url = null, port, timeoutMs = 30000, restoreMs = Math.min(10000, timeoutMs / 3), known = {}, keepHttps = false, log = console.log, wait = waitForPage, navigate = navigateTab, listTabs = proxyTabs, reach = probeUrl } = {}) {
  if (!VIAS.includes(via)) throw new Error(`--via must be one of ${VIAS.join(', ')} (got ${safe(via, known)})`);
  if (url && !/^https?:\/\//.test(url)) throw new Error('--url must be an http(s) URL');
  try {
    let target = null, info = null;
    if (url) {
      info = await mirrorInfo(url);
      const t = iphoneTarget(url, info, { keepHttps });
      if (t.note) log(safe(t.note, known));
      target = t.url;
    }
    let d = null;
    if (via === 'auto') { for (const x of drivers) if (await x.available()) { d = x; break; } }
    else d = drivers.find((x) => x.name === via) || null;
    if (!d) throw new Error(via === 'auto' ? `no way to restart Safari is available (tried ${drivers.map((x) => x.name).join(', ')}): start WDA, or configure the device` : `--via ${via} is not available here (use ${drivers.map((x) => x.name).join(' or ')})`);
    try { // before: name an inspector hold we can see (one of the proxy's own clients); the restart drops it anyway
      const held = heldTabs(await listTabs(port)).length;
      if (held) log(`note: ${held} page(s) held by another client of the WebKit proxy (no devtoolsFrontendUrl); the restart drops that connection`);
    } catch {}
    const t0 = Date.now();
    log(`restarting Safari via ${d.name}${target ? `, then loading ${safe(target, known)}` : ''}`);
    await d.restart();
    let restored = null, opened = null;
    try { restored = await wait({ port, target: null, timeoutMs: target ? Math.min(restoreMs, timeoutMs) : timeoutMs }); } catch (e) { if (!target || !e.noPage) throw e; }
    let landed = restored?.landed;
    if (target) {
      const restoredUrl = restored?.landed?.href || restored?.tab?.url || null;
      let reached = null;
      const reachable = async () => (reached ??= await reach(target));
      const openNew = async (why) => { log(`${why}: opening ${safe(target, known)} via ${d.name} (a new tab)`); await d.open(target); opened = 'driver'; };
      try {
        if (restored) {
          await navigate(restored.tab, target); opened = 'tab';
          // I-069: the navigation in the restored tab must land within the restore window; if it does not, either the
          // server is gone (fail now, saying so) or that tab does not navigate (a restored error page): a fresh tab
          try { ({ landed } = await wait({ port, target, timeoutMs: Math.min(restoreMs, timeoutMs) })); } catch (e) {
            if (!e.noPage) throw e;
            const r = await reachable();
            if (!r.ok) throw new Error(unreachableText(target, r.why, restoredUrl));
            await openNew(`the restored tab${/^data:/.test(restoredUrl || '') ? ' (a data: page)' : ''} did not load it within ${Math.round(Math.min(restoreMs, timeoutMs) / 1000)} s`);
          }
        } else await openNew('Safari restored no page');
        if (opened === 'driver') ({ landed } = await wait({ port, target, timeoutMs }));
      } catch (e) {
        if (!e.noPage) throw e;
        const r = await reachable();
        throw new Error(r.ok ? e.message : `${e.message}; ${unreachableText(target, r.why, restoredUrl)}`);
      }
      const p = landedProblem(landed, target, info);
      if (p) throw new Error(p);
    }
    const res = { via: d.name, ms: Date.now() - t0, href: landed.href, opened };
    log(`SAFARI_RESTARTED via ${res.via} in ${res.ms} ms: ${safe(res.href, known)}`);
    return res;
  } catch (e) {
    throw new Error(`safari-restart: ${safe(e.message, known)}`);
  }
}

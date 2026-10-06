// `node tools/iphone.mjs preflight --owner <o> [--settle 60] [--usb-wait 20] [ensure's --timeout/--forward-wait/--retry-wait]`
// (incident I-227): one check in the runner's phone hold, before a block's first start gate, that names the traps a
// re-plugged iPhone sets, up front and in plain words, instead of a late failure in the middle of a block
// (2026-10-06 16:42-16:56Z, three traps in one block start):
//   1. USB: usbmuxd must list the phone (lib/usbmux.mjs); else PREFLIGHT REPLUG, exit 4.
//   2. A re-plug since the WDA runner started (its pidfile's USB attach differs from usbmuxd's now, it recorded none,
//      or this iproxy saw usbmux without the phone): the runner is stale (I-212: gestures then abort with HTTP 500
//      "point.x != INFINITY"), so a clean stop and a fresh runner (lib/wda-runner.mjs ensureRunner, fresh); a runner
//      that is down: `wda ensure`'s steps. After a restart, --settle s (default 60, I-225: a false Critical right after a
//      WDA/Safari restart). XCTest timing out "enabling automation mode" twice: PREFLIGHT AUTH (exit 10; the phone locked
//      or UI Automation off, the re-plug as the fallback); the phone off USB: PREFLIGHT REPLUG (exit 4); else PREFLIGHT
//      WDA (exit 3).
//   3. Automation authorized: one WDA session, Safari brought to the front (POST wda/apps/activate: a no-op on screen
//      when Safari already is; it is what `wda start` does) and its state read (POST wda/apps/state, a read), then the
//      app in front (GET wda/activeAppInfo). XCTDaemonErrorDomain Code=41 "Not authorized for performing UI testing
//      actions" from either call, or Safari not in front afterwards (the lock screen is SpringBoard's), is PREFLIGHT AUTH,
//      exit 10. Source (WDA v16.13.6, read via gh): FBSession.m activateApplicationWithBundleId -> [XCUIApplication
//      activate], applicationStateWithBundleId -> XCUIApplication.state; launchApplicationWithBundleId -> [app launch] for
//      an app that is not running, which is the call that answered Code 41 on 2026-10-06 (FBXCTestDaemonsProxy.m: the
//      launch error becomes FBApplicationMissingException, HTTP 400). Which of activate / state answers Code 41 on a
//      locked or unauthorized phone is UNRESOLVED (XCTest is closed source); the decisive check is one preflight with
//      the phone locked. Safari not in front after activate catches the locked phone either way.
//   4. Safari's tabs: the web pages ios_webkit_debug_proxy lists (blank views never count, I-037; FW_IPHONE_APPID
//      narrows to one app like open does). More than one: open would refuse with AMBIGUOUS (I-037), so PREFLIGHT TABS,
//      exit 11 (Safari restored an old tab on a relaunch, 16:44Z). The proxy not answering: PREFLIGHT PROXY, exit 12.
// The last line is the verdict, `PREFLIGHT OK: ...` (exit 0) or `PREFLIGHT <KIND>: <what the user must do>`; earlier
// lines are ensure's own and notes. Nothing it prints names the LAN address, the UDID or the device (Hard rule 12).
// It never touches the page: no navigation, no Runtime.evaluate, no touch.
import { readConfig, findXctestrun, ensureRunner, runnerRecord, iproxyLostUsb } from './wda-runner.mjs';
import { createSession, status as wdaStatus, SAFARI, APP_STATE, isNotAuthorized } from './wda.mjs';
import { usbAttach, attachVerdict } from './usbmux.mjs';
import { isBlankUrl } from './wip.mjs';
import { lanSafeUrl } from './iphone-url.mjs';
import { redact } from './redact.mjs';

export const EXIT_PREFLIGHT = Object.freeze({ ok: 0, wda: 3, replug: 4, auth: 10, tabs: 11, proxy: 12 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The user's fix for each kind, one plain line (the console step text a kit posts). */
export const USER_FIX = Object.freeze({
  auth: 'unlock the iPhone and keep it unlocked, check Settings > Developer > Enable UI Automation is on (accept any prompt on the phone), then re-run',
  authTimeout: 'unlock the iPhone, check Settings > Developer > Enable UI Automation is on, then re-run; if the phone was unlocked and it is on, unplug the iPhone cable, plug it back in and re-run',
  replug: 'plug the iPhone cable in (or unplug it and plug it back in), keep the phone unlocked, then re-run',
  tabs: 'on the iPhone, close every Safari tab but one (Safari\'s tabs button, then close the others), then re-run',
});

/**
 * The web pages a proxy listing shows (never blank views, I-037), with FW_IPHONE_APPID's filter like open's pickTab.
 * Returns {pages, safari: how many are in Safari's app (appId `PID:<safariPid>`; null when unknown), hosts}.
 */
export function webPages(list, { appId = process.env.FW_IPHONE_APPID || null, safariPid = null } = {}) {
  const all = (Array.isArray(list) ? list : []).filter((p) => p && p.webSocketDebuggerUrl && !isBlankUrl(p.url));
  const pages = appId ? all.filter((p) => p.appId === appId) : all;
  const host = (u) => { try { return new URL(lanSafeUrl(u)).host || String(u).split(':')[0]; } catch { return String(u || '?').slice(0, 40); } };
  return { pages: pages.length, safari: safariPid != null ? pages.filter((p) => p.appId === `PID:${safariPid}`).length : null, hosts: pages.map((p) => host(p.url)) };
}

/** Classify a WDA error from the authorization probe: 'auth' (Code 41) or 'wda'. */
export const probeKind = (e) => (isNotAuthorized(e) ? 'auth' : 'wda');

export async function preflightCmd({ opt, flag = () => false, requireLease, log = console.log, port = Number(process.env.FW_IPHONE_PORT || 9222) }) {
  const owner = requireLease(); // a phone access (Hard rule 9): only in the runner's hold
  const scrub = (s) => redact(String(s), readConfig());
  const say = (s) => log(scrub(s));
  const verdict = (kind, text) => { say(`PREFLIGHT ${kind.toUpperCase()}: ${text}`); return EXIT_PREFLIGHT[kind]; };
  const cfg = readConfig();
  if (!findXctestrun() || !cfg.udid) throw new Error('no WDA build yet: node tools/iphone.mjs wda build');
  const usbWait = Number(opt('usb-wait', 20)), settle = Number(opt('settle', 60));
  if (!(settle >= 0 && settle <= 300)) throw new Error('usage: --settle <0..300 s>');

  // 1. the phone on USB, and which attach
  let now = await usbAttach(cfg.udid);
  for (const end = Date.now() + usbWait * 1000; now && !now.listed && Date.now() < end;) { await sleep(1000); now = await usbAttach(cfg.udid); }
  if (now && !now.listed) return verdict('replug', `the iPhone is not on USB (usbmuxd lists ${now.usb} USB device${now.usb === 1 ? '' : 's'}, not this phone, for ${usbWait} s): ${USER_FIX.replug}`);
  say(now ? `usb: the iPhone is on USB attach #${now.id}` : 'NOTE usb: usbmuxd gave no device list; no re-plug verdict (the runner is kept if READY)');

  // 2. a runner started before the current attach is stale (I-212): a fresh one; a runner that is down: ensure's steps
  const run = runnerRecord();
  const st = await wdaStatus().catch(() => null);
  let fresh = null;
  if (st?.ready && run?.ours) {
    const v = attachVerdict(run.usbAttach, now);
    if (v.stale) fresh = v.why;
    else if (iproxyLostUsb()) fresh = 'the USB forward lost the phone since it started (iproxy: No connected/matching device found)';
    say(`wda: runner pid ${run.pid} READY; ${fresh ? `stale: ${fresh}` : v.why}`);
  } else if (st?.ready) say('NOTE wda: WDA answers READY but no runner of this tool is recorded (not started by iphone.mjs wda); kept');
  let ens;
  try { ens = await ensureRunner({ opt, flag, requireLease, log: say, fresh }); } catch (e) {
    if (isNotAuthorized(e)) return verdict('auth', `XCTest refused to bring Safari to the front (Code 41, not authorized for UI testing): ${USER_FIX.auth}`);
    return verdict('wda', `WDA could not be made ready (${scrub(e.message).split('\n')[0]}): run node tools/iphone.mjs wda stop, then re-run`);
  }
  if (ens.code === 4) return ens.why === 'automation-timeout'
    ? verdict('auth', `XCTest could not enable automation mode on the iPhone: ${USER_FIX.authTimeout}`)
    : verdict('replug', `the iPhone left USB while WDA started: ${USER_FIX.replug}`);
  if (ens.code !== 0) return verdict('wda', `WDA is not ready (${ens.why}): check the runner is trusted on the iPhone (Settings > General > VPN & Device Management), then re-run`);
  const restarted = ens.how !== 'kept';
  if (restarted && settle > 0) { say(`SETTLE ${settle} s after the WDA restart (I-225)`); await sleep(settle * 1000); }

  // 3. automation authorized: Safari to the front (a no-op when it is), its state, the app in front
  let front, state;
  const s = await createSession().catch((e) => e);
  if (s instanceof Error) return probeKind(s) === 'auth' ? verdict('auth', `XCTest refused a WDA session (Code 41): ${USER_FIX.auth}`) : verdict('wda', `WDA refused a session (${scrub(s.message)}): run node tools/iphone.mjs wda stop, then re-run`);
  try {
    await s.activate(SAFARI);
    state = await s.appState(SAFARI);
    front = await s.activeApp();
  } catch (e) {
    return probeKind(e) === 'auth'
      ? verdict('auth', `XCTest refused a UI action (Code 41, not authorized for UI testing: the phone is locked or UI Automation is off): ${USER_FIX.auth}`)
      : verdict('wda', `WDA failed a UI action (${scrub(e.message)}): run node tools/iphone.mjs wda stop, then re-run`);
  } finally { await s.close(); }
  if (front?.bundleId !== SAFARI || Number(state) !== APP_STATE.foreground) {
    const what = front?.bundleId === 'com.apple.springboard' ? 'SpringBoard (the lock or home screen)' : front?.bundleId ? 'another app' : 'no app';
    return verdict('auth', `Safari did not come to the front (in front: ${what}; Safari state ${state ?? '?'}): the iPhone is probably locked: ${USER_FIX.auth}`);
  }
  say(`automation: authorized (Safari in front, state ${state})`);

  // 4. Safari's tabs (open's I-037 rule: more than one web page is AMBIGUOUS)
  let list;
  try { list = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json(); } catch (e) {
    return verdict('proxy', `ios_webkit_debug_proxy does not answer on :${port} (${e.cause?.code || e.message}): start it (ios_webkit_debug_proxy -c null:9221,:9222-9322), then re-run`);
  }
  const t = webPages(list, { safariPid: front.pid });
  if (t.pages > 1) return verdict('tabs', `Safari has ${t.pages} pages open (${t.hosts.join(', ')}); a block needs at most one (open refuses several, I-037): ${USER_FIX.tabs}`);
  return verdict('ok', `WDA ${restarted ? ens.how : 'kept'}${now ? `, USB attach #${now.id}` : ''}, automation authorized (Safari in front), ${t.pages} Safari page${t.pages === 1 ? '' : 's'}`);
}

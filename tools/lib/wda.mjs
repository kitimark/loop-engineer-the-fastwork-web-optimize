// Minimal, dependency-free HTTP client for WebDriverAgent (the XCUITest runner) on the iPhone, reached over
// USB through `iproxy 8100 8100` (research/architecture/finger-simulation.md). It plays compiled gesture
// strokes (tools/lib/gesture.mjs) as real OS-level touches with W3C actions, one POST per stroke.
//
// Only these endpoints, on purpose:
//   GET  /status                                   is the runner up?
//   POST /session                                  no bundleId: WDA would otherwise (re)launch the app
//                                                  (forceAppLaunch defaults to true), killing Safari's tab state
//   POST /session/:id/appium/settings              waitForIdleTimeout 0, animationCoolOffTimeout 0: this page
//                                                  never idles (infinite animations), XCTest would wait ~10 s
//   POST /session/:id/wda/apps/activate            bring Safari to the front (activate, not launch)
//   GET  /session/:id/wda/activeAppInfo            which app is in front
//   POST /session/:id/actions                      one stroke (W3C pointer actions, pointerType touch)
//   POST /session/:id/wda/apps/terminate|launch    quit / start Safari (safari-restart, tools/lib/safari-restart.mjs)
//   POST /session/:id/url                          open a URL in Safari (XCUIDevice openUrl:withApplication:)
//   DELETE /session/:id                            end the session
//   GET|POST /session/:id/orientation              SIMULATOR ONLY (incident I-087): read / set PORTRAIT or LANDSCAPE
//                                                  (FBOrientationCommands.m, XCUIDevice orientation); refused unless
//                                                  the caller passes {simulator: true} AND the base is not the phone's
//                                                  WDA port 8100 (iproxy), so the physical iPhone is never rotated;
//                                                  any call marked {simulator: true} (POST /session too) goes only
//                                                  to such a non-8100 base (I-094)
// Never /source, element lookups or screenshots: an accessibility snapshot of Safari costs phone CPU while
// we measure it. request() allows exactly the calls above (ALLOWED, method + path) and refuses anything else
// before any HTTP traffic, so a new WDA call is a deliberate edit here, not an accident.
import { redact } from './redact.mjs';

export const WDA_URL = () => process.env.FW_WDA_URL || 'http://127.0.0.1:8100';
export const SAFARI = 'com.apple.mobilesafari';
export const SESSION_SETTINGS = Object.freeze({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: SAFARI });
const SID = '[A-Za-z0-9-]{1,64}';
/** The only WDA calls this module makes (review-gesture: an allowlist, not a denylist). */
export const ALLOWED = Object.freeze([
  ['GET', '/status'],
  ['POST', '/session'],
  ['POST', `/session/${SID}/appium/settings`],
  ['POST', `/session/${SID}/wda/apps/activate`],
  ['GET', `/session/${SID}/wda/activeAppInfo`],
  ['POST', `/session/${SID}/actions`],
  ['POST', `/session/${SID}/wda/apps/terminate`],
  ['POST', `/session/${SID}/wda/apps/launch`],
  ['POST', `/session/${SID}/url`],
  ['DELETE', `/session/${SID}`],
].map(([m, p]) => [m, new RegExp(`^${p}$`)]));
/** Simulator-only calls (I-087): the device rotation. Never on the phone (request() checks the target). */
export const SIM_ONLY = Object.freeze([
  ['GET', `/session/${SID}/orientation`],
  ['POST', `/session/${SID}/orientation`],
].map(([m, p]) => [m, new RegExp(`^${p}$`)]));
/** WDA's orientation names (FBOrientationCommands.m FBWDOrientationValues; GET answers PORTRAIT or LANDSCAPE). */
export const ORIENTATIONS = Object.freeze({ portrait: 'PORTRAIT', landscape: 'LANDSCAPE' });
/** The phone's WDA port (iproxy 8100:8100, tools/lib/wda-runner.mjs); WDA-sim runs on 8101 (tools/lib/sim.mjs ports()). */
export const PHONE_WDA_PORT = 8100;
const simOnly = (method, path) => SIM_ONLY.some(([m, re]) => m === method && re.test(path));
export const allowed = (method, path, { simulator = false } = {}) => ALLOWED.some(([m, re]) => m === method && re.test(path)) || (simulator === true && simOnly(method, path));
/** Is `base` a WDA the Simulator may own: a URL whose port is not the phone's 8100 (no port: 80/443, not WDA-sim either). */
export function simulatorBase(base) {
  let u;
  try { u = new URL(base); } catch { return false; }
  return !!u.port && Number(u.port) !== PHONE_WDA_PORT;
}

export class WdaError extends Error {
  constructor(message, { status, error, path } = {}) { super(message); this.status = status; this.error = error; this.path = path; }
}

/**
 * One HTTP call. Returns the response's `value` (WDA wraps every answer as {value, sessionId}).
 * Throws WdaError on a non-2xx status, a W3C error body, a refused connection or a timeout.
 */
export async function request(method, path, body, { base = WDA_URL(), timeoutMs = 15000, simulator = false } = {}) {
  // I-094: a call marked simulator (POST /session included) never goes to a base that is not WDA-sim's, so the
  // phone's WDA on :8100 never even sees a Simulator session; refused before any HTTP, like the rotation itself.
  if (simulator === true && !simulatorBase(base)) throw new WdaError(`wda.mjs sends a Simulator call (${method} ${redact(String(path))}) only to a Simulator's WDA (I-087/I-094: the physical iPhone is never rotated or touched through the Simulator path; ${redact(String(base))} is not a WDA-sim address (port ${PHONE_WDA_PORT} is the phone's))`, { path });
  if (simOnly(method, path) && !(simulator === true && simulatorBase(base))) throw new WdaError(`wda.mjs calls ${method} ${redact(String(path))} only on a Simulator's WDA (I-087: the physical iPhone is never rotated; ${simulator === true ? `${redact(String(base))} is not a WDA-sim address (port ${PHONE_WDA_PORT} is the phone's)` : 'this target is not marked simulator'})`, { path });
  if (!allowed(method, path, { simulator })) throw new WdaError(`wda.mjs never calls ${method} ${redact(String(path))}: not in its allowlist (no accessibility snapshots, element lookups or screenshots while measuring)`, { path });
  let res, text;
  try {
    res = await fetch(base.replace(/\/$/, '') + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (e) {
    const why = e.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : (e.cause?.code || e.message);
    throw new WdaError(`WDA ${method} ${path}: ${why} (is the runner up? node tools/iphone.mjs wda status)`, { path });
  }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  const v = json && typeof json === 'object' ? json.value : undefined;
  if (!res.ok || (v && typeof v === 'object' && typeof v.error === 'string')) {
    const err = v && typeof v === 'object' ? v.error : undefined;
    const msg = (v && typeof v === 'object' && v.message) || text.slice(0, 200) || res.statusText;
    throw new WdaError(`WDA ${method} ${path}: HTTP ${res.status}${err ? ` ${err}` : ''}: ${redact(String(msg))}`, { status: res.status, error: err, path }); // WDA's message can name the runner's bundle id, the device
  }
  return v;
}

/** GET /status: {ready, build, os, ...}, or throws. */
export const status = (opts) => request('GET', '/status', undefined, { timeoutMs: 5000, ...opts });

/**
 * Open a session on whatever app is in front (no bundleId: nothing is launched), apply the idle settings.
 * Returns {id, close(), activate(bundleId), activeApp(), actions(payload, {timeoutMs}), settings}.
 */
export async function createSession(opts = {}) {
  const r = await request('POST', '/session', { capabilities: { alwaysMatch: { shouldWaitForQuiescence: false }, firstMatch: [{}] } }, opts);
  const id = r?.sessionId;
  if (!id || !/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new WdaError(`WDA POST /session: no usable sessionId in ${redact(JSON.stringify(r) ?? String(r)).slice(0, 200)}`);
  const s = {
    id,
    settings: await request('POST', `/session/${id}/appium/settings`, { settings: SESSION_SETTINGS }, opts),
    activate: (bundleId = SAFARI) => request('POST', `/session/${id}/wda/apps/activate`, { bundleId }, opts),
    activeApp: () => request('GET', `/session/${id}/wda/activeAppInfo`, undefined, opts),
    /** safari-restart only: quit the app (true if it was running), start it (no quiescence wait), open a URL in it. */
    terminate: (bundleId = SAFARI) => request('POST', `/session/${id}/wda/apps/terminate`, { bundleId }, { ...opts, timeoutMs: 30000 }),
    launch: (bundleId = SAFARI) => request('POST', `/session/${id}/wda/apps/launch`, { bundleId, shouldWaitForQuiescence: false }, { ...opts, timeoutMs: 60000 }),
    openUrl: (url, bundleId = SAFARI) => request('POST', `/session/${id}/url`, { url, bundleId }, { ...opts, timeoutMs: 30000 }),
    /** Simulator only (I-087; request() refuses it on the phone): 'PORTRAIT' or 'LANDSCAPE'. */
    orientation: () => request('GET', `/session/${id}/orientation`, undefined, opts),
    /** Simulator only (I-087): rotate to 'portrait' | 'landscape' (or WDA's PORTRAIT / LANDSCAPE). */
    setOrientation: (o) => {
      const v = ORIENTATIONS[String(o).toLowerCase()];
      if (!v) return Promise.reject(new WdaError(`orientation must be ${Object.keys(ORIENTATIONS).join(' or ')} (got ${redact(String(o))})`));
      return request('POST', `/session/${id}/orientation`, { orientation: v }, { ...opts, timeoutMs: 30000 });
    },
    /** Play one stroke; resolves when WDA has played it back. Returns {sentAt, returnedAt, ms} (Mac epoch ms). */
    async actions(payload, { timeoutMs } = {}) {
      checkActions(payload);
      const sentAt = Date.now();
      const t0 = performance.now();
      await request('POST', `/session/${id}/actions`, payload, { ...opts, timeoutMs: timeoutMs ?? actionsMs(payload) + 15000 });
      return { sentAt, returnedAt: Date.now(), ms: Math.round((performance.now() - t0) * 10) / 10 };
    },
    close: () => request('DELETE', `/session/${id}`, undefined, opts).catch(() => null),
  };
  return s;
}

/** Total playback time of a W3C actions payload (sum of durations), in ms. */
export function actionsMs(payload) {
  let t = 0;
  for (const src of payload.actions) for (const a of src.actions) t += a.duration || 0;
  return t;
}

/** Refuse anything but one touch pointer that ends lifted (a stuck finger would long-press Safari). */
export function checkActions(payload) {
  const src = payload?.actions;
  if (!Array.isArray(src) || src.length !== 1) throw new WdaError('actions: exactly one input source expected');
  const p = src[0];
  if (p.type !== 'pointer' || p.parameters?.pointerType !== 'touch') throw new WdaError('actions: only a touch pointer is allowed');
  const a = p.actions;
  if (!Array.isArray(a) || a.length < 3) throw new WdaError('actions: empty stroke');
  let down = false;
  for (const x of a) {
    if (x.type === 'pointerDown') { if (down) throw new WdaError('actions: pointerDown while down'); down = true; }
    else if (x.type === 'pointerUp') { if (!down) throw new WdaError('actions: pointerUp while up'); down = false; }
    else if (x.type !== 'pointerMove' && x.type !== 'pause') throw new WdaError(`actions: unexpected action ${x.type}`);
  }
  if (down) throw new WdaError('actions: the stroke must end with pointerUp');
}

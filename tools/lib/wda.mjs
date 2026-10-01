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
//   DELETE /session/:id                            end the session
// Never /source, element lookups or screenshots: an accessibility snapshot of Safari costs phone CPU while
// we measure it. request() refuses those paths.
import { redact } from './redact.mjs';

export const WDA_URL = () => process.env.FW_WDA_URL || 'http://127.0.0.1:8100';
export const SAFARI = 'com.apple.mobilesafari';
export const SESSION_SETTINGS = Object.freeze({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: SAFARI });
const FORBIDDEN = /\/(source|element|elements|screenshot|accessibleSource)(\/|$)|\/wda\/(tap|touch|dragfromtoforduration|element)/i;

export class WdaError extends Error {
  constructor(message, { status, error, path } = {}) { super(message); this.status = status; this.error = error; this.path = path; }
}

/**
 * One HTTP call. Returns the response's `value` (WDA wraps every answer as {value, sessionId}).
 * Throws WdaError on a non-2xx status, a W3C error body, a refused connection or a timeout.
 */
export async function request(method, path, body, { base = WDA_URL(), timeoutMs = 15000 } = {}) {
  if (FORBIDDEN.test(path)) throw new WdaError(`wda.mjs never calls ${path} (no accessibility snapshots while measuring)`, { path });
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

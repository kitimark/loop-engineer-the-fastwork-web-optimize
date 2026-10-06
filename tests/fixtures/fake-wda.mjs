#!/usr/bin/env node
// A fake WebDriverAgent (XCUITest runner) for the default test suite: tools/lib/wda.mjs and
// tools/iphone.mjs `gesture` run against it without the phone. It speaks the few endpoints wda.mjs uses,
// answers like WDA ({value, sessionId}; W3C errors as {value: {error, message}} with HTTP 4xx/5xx), checks
// the payloads, records every call, and can inject latency, errors and a different foreground app.
// Any other path (/source, element lookups, screenshots) is recorded as `forbidden` and answered 404, so a
// test can assert that nothing ever asked for an accessibility snapshot.
//
//   import { startFakeWda } from './fake-wda.mjs';  const w = await startFakeWda({ latencyMs: 5 });  w.url, w.calls
// safari-restart's calls (POST /wda/apps/terminate, /wda/apps/launch, /url) switch the foreground app and call onApp(kind, body).
// I-087: GET / POST /session/:id/orientation like FBOrientationCommands.m (PORTRAIT, LANDSCAPE, the two UIA_ names;
// GET answers PORTRAIT or LANDSCAPE), state.orientation; `--orientation-fail` / {failOrientation: true} answers 500.
// I-227: POST /session/:id/wda/apps/state answers XCUIApplicationState (4 in front, 3 running, 1 not running);
// {unauthorized} / FAKE_WDA_UNAUTHORIZED=1: activate, launch and state answer XCTest's Code 41 (HTTP 400); {locked} /
// FAKE_WDA_LOCKED=1: SpringBoard in front and activate leaves it there (the lock screen).
//   node tests/fixtures/fake-wda.mjs --port=0 [--latency=MS] [--playback] [--fail-actions=N,M] [--foreground=<bundleId>]
//     prints FAKE_WDA_PORT=<port>; env FAKE_WDA_LOG=<file> appends one JSON line per call.
import './lifeline.mjs'; // I-072: registered for the test's teardown; ends with the test process
import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Validate a W3C actions payload like FBW3CActionsSynthesizer does (touch only, numeric fields). */
export function validateActions(body) {
  const src = body?.actions;
  if (!Array.isArray(src) || !src.length) return 'actions must be a non-empty array';
  for (const s of src) {
    if (s.type !== 'pointer') return `unsupported source type ${s.type}`;
    if (s.parameters?.pointerType !== 'touch') return "Only pointer type 'touch' is supported";
    for (const a of s.actions || []) {
      if (!['pointerMove', 'pointerDown', 'pointerUp', 'pause'].includes(a.type)) return `unknown action ${a.type}`;
      if ('duration' in a && (typeof a.duration !== 'number' || a.duration < 0)) return 'duration must be a non-negative number';
      if (a.type === 'pointerMove' && (typeof a.x !== 'number' || typeof a.y !== 'number')) return 'pointerMove needs numeric x and y';
    }
  }
  return null;
}

export function startFakeWda({ port = 0, latencyMs = 0, playback = false, failActions = [], foreground = 'com.apple.mobilesafari', onStroke, onApp, failApp = null, failOrientation = false, log,
  unauthorized = process.env.FAKE_WDA_UNAUTHORIZED === '1', locked = process.env.FAKE_WDA_LOCKED === '1' } = {}) {
  const calls = [];
  const sessions = new Set();
  let nActions = 0, nSession = 0;
  if (locked) foreground = 'com.apple.springboard';
  const state = { foreground, latencyMs, failActions: new Set(failActions), down: false, running: new Set([foreground]), orientation: 'PORTRAIT', unauthorized, locked };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = { unparsable: raw }; }
      const call = { t: Date.now(), method: req.method, path: req.url, body };
      calls.push(call);
      if (log) try { appendFileSync(log, JSON.stringify(call) + '\n'); } catch {}
      const send = (code, value, sessionId = null) => { if (!res.headersSent) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value, sessionId })); } };
      const err = (code, error, message) => send(code, { error, message, traceback: '' });
      if (state.latencyMs) await sleep(state.latencyMs);
      const m = req.url.match(/^\/session\/([^/]+)(\/.*)?$/);
      const sid = m?.[1], sub = m?.[2] || '';
      if (sid && !sessions.has(sid)) return err(404, 'invalid session id', `Session does not exist: ${sid}`);
      if (req.method === 'GET' && req.url === '/status') return send(200, { ready: true, message: 'WebDriverAgent is ready to accept commands', state: 'success', os: { name: 'iOS', version: '26.6.1' }, ios: {}, build: { version: 'fake', productBundleIdentifier: 'com.example.WebDriverAgentRunner' }, device: 'iphone' });
      if (req.method === 'POST' && req.url === '/session') {
        const caps = body?.capabilities?.alwaysMatch || {};
        if (caps.bundleId) state.foreground = caps.bundleId; // real WDA (re)launches it: tests assert this never happens
        const id = `FAKE-${++nSession}`;
        sessions.add(id);
        return send(200, { sessionId: id, capabilities: { device: 'iphone' } }, id);
      }
      if (req.method === 'POST' && sub === '/appium/settings') return send(200, { ...(body?.settings || {}) }, sid);
      // I-227: unauthorized = a locked phone or UI Automation off (XCTest's Code 41 on app calls, as WDA's launch answered
      // it: FBApplicationMissingException -> HTTP 400 invalid argument); locked = activate answers OK but SpringBoard (the
      // lock screen) stays in front
      if (state.unauthorized && req.method === 'POST' && ['/wda/apps/activate', '/wda/apps/launch', '/wda/apps/state'].includes(sub)) return err(400, 'invalid argument', 'Error Domain=XCTDaemonErrorDomain Code=41 "Not authorized for performing UI testing actions." UserInfo={NSLocalizedDescription=Not authorized for performing UI testing actions.}');
      if (req.method === 'POST' && sub === '/wda/apps/activate') { if (!state.locked) state.foreground = body?.bundleId; return send(200, null, sid); }
      if (req.method === 'POST' && sub === '/wda/apps/state') return send(200, state.foreground === body?.bundleId ? 4 : state.running.has(body?.bundleId) ? 3 : 1, sid);
      if (req.method === 'GET' && (sub === '/wda/activeAppInfo' || req.url === '/wda/activeAppInfo')) return send(200, { pid: 4242, bundleId: state.foreground, name: state.foreground === 'com.apple.mobilesafari' ? 'Safari' : state.foreground, processArguments: { args: [], env: {} } }, sid ?? null);
      // safari-restart: quit / start an app, open a URL in it (onApp lets the fake proxy follow; failApp: 'terminate'|'launch'|'url' fails that call)
      if (req.method === 'POST' && ['/wda/apps/terminate', '/wda/apps/launch', '/url'].includes(sub)) {
        const kind = sub.split('/').pop();
        if (failApp === kind) return err(500, 'unknown error', `injected failure on ${kind} for ${body?.bundleId}`);
        if (kind !== 'url' && typeof body?.bundleId !== 'string') return err(400, 'invalid argument', 'bundleId is required');
        if (kind === 'url' && typeof body?.url !== 'string') return err(400, 'invalid argument', 'URL is required');
        const app = body.bundleId || 'com.apple.mobilesafari';
        const was = state.running.has(app);
        if (kind === 'terminate') { state.running.delete(app); if (state.foreground === app) state.foreground = 'com.apple.springboard'; }
        else { state.running.add(app); state.foreground = app; }
        if (onApp) await onApp(kind, body);
        return send(200, kind === 'terminate' ? was : null, sid);
      }
      if (req.method === 'POST' && sub === '/actions') {
        nActions++;
        const bad = validateActions(body);
        if (bad) return err(400, 'invalid argument', bad);
        if (state.failActions.has(nActions)) return err(500, 'unknown error', `injected failure on actions call ${nActions}`);
        if (state.foreground !== 'com.apple.mobilesafari') call.wrongApp = state.foreground;
        const total = body.actions[0].actions.reduce((t, a) => t + (a.duration || 0), 0);
        call.playbackMs = total;
        if (onStroke) await onStroke(body, call);
        if (playback) await sleep(total);
        return send(200, null, sid);
      }
      if (sub === '/orientation' && (req.method === 'GET' || req.method === 'POST')) {
        if (req.method === 'GET') return send(200, state.orientation.startsWith('LANDSCAPE') || state.orientation.endsWith('LANDSCAPERIGHT') ? 'LANDSCAPE' : 'PORTRAIT', sid);
        const o = String(body?.orientation ?? '').toUpperCase();
        if (!['PORTRAIT', 'LANDSCAPE', 'UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT', 'UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN'].includes(o)) return err(400, 'invalid argument', `Unable to perform requested orientation ${body?.orientation}`);
        if (failOrientation) return err(500, 'unknown error', `Unable to change device orientation to ${o}`);
        state.orientation = o;
        return send(200, null, sid);
      }
      if (req.method === 'DELETE' && sid && !sub) { sessions.delete(sid); return send(200, null); }
      call.forbidden = true;
      return err(404, 'unknown command', `Unhandled endpoint: ${req.url}`);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const p = server.address().port;
    resolve({ port: p, url: `http://127.0.0.1:${p}`, calls, state, sessions, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  const w = await startFakeWda({
    port: Number(arg('port') || 0), latencyMs: Number(arg('latency') || 0), playback: process.argv.includes('--playback'),
    failActions: (arg('fail-actions') || '').split(',').filter(Boolean).map(Number), foreground: arg('foreground') || undefined, log: process.env.FAKE_WDA_LOG,
    failOrientation: process.argv.includes('--orientation-fail'),
  });
  console.log(`FAKE_WDA_PORT=${w.port}`);
}

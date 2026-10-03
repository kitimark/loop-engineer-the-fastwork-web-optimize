// Incident I-077: after a park (I-047) the phone's WebKit proxy lists only about:blank views, and pickTab (I-037) never
// picks one, so `iphone.mjs open` failed with "BLOCKED: cannot reach Safari tab". The lead's listing after a park
// (2026-10-02 23:26Z): TWO about:blank views, both of Safari's app (one appId), no other app; the appId changes on every
// Safari restart. ios_webkit_debug_proxy lists no bundle id or app name, only appId (iwdp_ipages_to_text, CONFIRMED:
// github.com/google/ios-webkit-debug-proxy src/ios_webkit_debug_proxy.c, master, read 2026-10-03). So park records
// Safari's appId (the app of the tab it parked) in the shared state dir, and open picks among that app's blank views
// the one that says it is visible; anything else (no record, a stale pid, a web page listed, none or several
// visible) is not a parked tab it may drive.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parkedCandidates, recordSafariApp, recordedSafariApp, safariAppFile, pickVisible } from '../../tools/lib/wip.mjs';
import { tempDir } from '../helpers.mjs';

const view = (n, appId, url = 'about:blank') => ({ url, title: '', webSocketDebuggerUrl: `ws://localhost:9222/devtools/page/${n}`, appId });
const PARKED = [view(1, 'PID:7653'), view(2, 'PID:7653')]; // the phone after a park (lead, 23:26Z)
const OTHER = view(3, 'PID:1304'); // another app's background web view (I-037)

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-parked-'); });

test('I-077: the parked listing gives Safari\'s blank views (both, in list order), never another app\'s', () => {
  assert.deepEqual(parkedCandidates(PARKED, 'PID:7653'), { candidates: PARKED });
  assert.deepEqual(parkedCandidates([OTHER, ...PARKED], 'PID:7653'), { candidates: PARKED });
  assert.deepEqual(parkedCandidates([...PARKED, { url: 'about:blank', appId: 'PID:7653' }], 'PID:7653'), { candidates: PARKED }, 'a view without a websocket (held) is not a candidate');
});

test('I-077: a listed web page means Safari is not parked (open keeps its usual path, I-037); no record or a stale pid gives a reason, not a guess', () => {
  assert.deepEqual(parkedCandidates([...PARKED, view(4, 'PID:7653', 'http://192.0.2.7:5492/')], 'PID:7653'), { notParked: true });
  assert.deepEqual(parkedCandidates([OTHER, view(4, 'PID:613', 'http://192.0.2.7:5492/')], null), { notParked: true });
  assert.match(parkedCandidates(PARKED, null).why, /^no record of Safari's app \(a park records it, I-077\)/);
  const stale = parkedCandidates(PARKED, 'PID:7626').why;
  assert.match(stale, /^Safari's app at the last park \(PID:7626\) is not listed: Safari restarted since \(a new pid on every start\)/);
  assert.match(parkedCandidates([OTHER], 'PID:7653').why, /is not listed/, 'only another app\'s blank view: no candidate');
  assert.match(parkedCandidates([], 'PID:7653').why, /is not listed/, 'nothing listed (Safari not running)');
});

test('I-077: pickVisible takes the one view that says "visible"; none, several or no answer is a reason', async () => {
  const states = (m) => async (p) => { const v = m[p.webSocketDebuggerUrl.slice(-1)]; if (v instanceof Error) throw v; return v; };
  assert.deepEqual(await pickVisible(PARKED, states({ 1: 'hidden', 2: 'visible' })), { tab: PARKED[1] });
  assert.deepEqual(await pickVisible(PARKED, states({ 1: 'visible', 2: new Error('Runtime.evaluate timed out') })), { tab: PARKED[0] });
  assert.match((await pickVisible(PARKED, states({ 1: 'hidden', 2: 'hidden' }))).why, /^none of Safari's 2 blank views is visible \(Safari not in front, or the phone locked\?\)/);
  assert.match((await pickVisible(PARKED, states({ 1: 'visible', 2: 'visible' }))).why, /^2 of Safari's blank views say they are visible: not picking one \(I-037\)/);
});

test('I-077: the record of Safari\'s app is per proxy port, in the shared state dir; a bad or missing record reads as none', () => {
  assert.equal(recordedSafariApp(9222), null);
  recordSafariApp('PID:7653', 9222);
  assert.ok(existsSync(safariAppFile()));
  assert.equal(safariAppFile(), join(process.env.FW_STATE_DIR, 'iphone', 'safari-app.json'));
  assert.equal(recordedSafariApp(9222), 'PID:7653');
  assert.equal(recordedSafariApp(9232), null, 'another proxy (the Simulator\'s) does not see the phone\'s record');
  recordSafariApp(null, 9222); // a tab without an appId records nothing
  assert.equal(recordedSafariApp(9222), 'PID:7653');
  recordSafariApp('PID:7679', 9222);
  assert.equal(recordedSafariApp(9222), 'PID:7679');
});

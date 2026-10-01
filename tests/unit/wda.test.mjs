// tools/lib/wda.mjs against an in-process fake WebDriverAgent (tests/fixtures/fake-wda.mjs): the session is
// opened without a bundleId (no app relaunch) and with the idle settings at 0, strokes go out as W3C touch
// actions, errors and latency surface as WdaError, and accessibility snapshots are never requested.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { request, status, createSession, checkActions, actionsMs, WdaError, SESSION_SETTINGS, ALLOWED, allowed } from '../../tools/lib/wda.mjs';
import { compileStroke } from '../../tools/lib/gesture.mjs';
import { startFakeWda } from '../fixtures/fake-wda.mjs';
import { freePort } from '../helpers.mjs';

const fakes = [];
after(() => Promise.all(fakes.map((f) => f.close())));
const fake = async (o) => { const f = await startFakeWda(o); fakes.push(f); return f; };
const fling = compileStroke({ dir: 'up', px: 520, ms: 160, profile: 'fling', pressMs: 40, holdMs: 0, x: 215 }).actions;

test('status, then a session: no bundleId, quiescence off, idle settings 0, activate Safari, one stroke, close', async () => {
  const w = await fake({ foreground: 'com.example.WebDriverAgentRunner.xctrunner' });
  const opts = { base: w.url };
  assert.equal((await status(opts)).ready, true);
  const s = await createSession(opts);
  assert.match(s.id, /^FAKE-\d+$/);
  const post = w.calls.find((c) => c.method === 'POST' && c.path === '/session');
  assert.deepEqual(post.body.capabilities.alwaysMatch, { shouldWaitForQuiescence: false });
  assert.ok(!JSON.stringify(post.body).includes('bundleId'), 'a bundleId would make WDA (re)launch Safari');
  assert.deepEqual(w.calls.find((c) => c.path.endsWith('/appium/settings')).body, { settings: { waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: 'com.apple.mobilesafari' } });
  assert.deepEqual(s.settings, SESSION_SETTINGS);
  assert.equal((await s.activeApp()).bundleId, 'com.example.WebDriverAgentRunner.xctrunner');
  await s.activate();
  assert.equal((await s.activeApp()).bundleId, 'com.apple.mobilesafari');
  const t = await s.actions(fling);
  assert.ok(t.returnedAt >= t.sentAt && t.ms >= 0);
  const act = w.calls.filter((c) => c.path === `/session/${s.id}/actions`);
  assert.equal(act.length, 1);
  assert.deepEqual(act[0].body, fling);
  assert.equal(act[0].playbackMs, 200);
  await s.close();
  assert.equal(w.calls.at(-1).method, 'DELETE');
  assert.equal(w.sessions.size, 0);
  assert.ok(!w.calls.some((c) => c.forbidden), 'no /source, element or screenshot calls');
});

test('never /source, element lookups or screenshots: refused before any HTTP call', async () => {
  const w = await fake();
  for (const p of ['/source', '/session/X/source', '/session/X/element', '/session/X/elements', '/screenshot', '/session/X/element/1/click', '/wda/tap/0', '/session/X/wda/touch/perform', '/session/X/wda/dragfromtoforduration']) {
    await assert.rejects(request('GET', p, undefined, { base: w.url }), (e) => e instanceof WdaError && /never calls/.test(e.message), p);
  }
  assert.equal(w.calls.length, 0);
});

test('an allowlist, not a denylist: exactly the calls wda.mjs makes; anything else (other paths, methods, tricks) refused before HTTP', async () => {
  const w = await fake();
  const sid = '8F3C2A10-1B2C-4D5E-9F00-0123456789AB';
  for (const [m, p] of [['GET', '/status'], ['POST', '/session'], ['POST', `/session/${sid}/appium/settings`], ['POST', `/session/${sid}/wda/apps/activate`],
    ['GET', `/session/${sid}/wda/activeAppInfo`], ['POST', `/session/${sid}/actions`], ['DELETE', `/session/${sid}`]]) assert.ok(allowed(m, p), `${m} ${p}`);
  const refused = [
    ['POST', '/status'], ['GET', '/session'], ['DELETE', '/session'], ['GET', `/session/${sid}/actions`], ['DELETE', `/session/${sid}/actions`],
    ['POST', `/session/${sid}/wda/apps/launch`], ['POST', `/session/${sid}/wda/apps/terminate`], ['POST', `/session/${sid}/url`], ['GET', `/session/${sid}/screenshot`],
    ['POST', `/session/${sid}/wda/keys`], ['POST', `/session/${sid}/wda/lock`], ['POST', '/wda/shutdown'], ['GET', '/wda/healthcheck'],
    ['GET', '/status?x=1'], ['GET', '/status/'], ['POST', `/session/${sid}/actions/../source`], ['POST', `/session/${sid}/../source/actions`],
    ['POST', '/session/a/b/actions'], ['POST', `/session//actions`], ['GET', '/STATUS'], ['get', '/status'],
  ];
  for (const [m, p] of refused) {
    assert.equal(allowed(m, p), false, `${m} ${p}`);
    await assert.rejects(request(m, p, undefined, { base: w.url }), (e) => e instanceof WdaError && /never calls .* not in its allowlist/.test(e.message), `${m} ${p}`);
  }
  // a refused path is named without ids (Hard rule 12): a session UUID is scrubbed
  await assert.rejects(request('GET', `/session/${sid}/source`, undefined, { base: w.url }), (e) => !e.message.includes(sid) && /<uuid>/.test(e.message));
  assert.equal(w.calls.length, 0, 'nothing reached WDA');
  assert.deepEqual(ALLOWED.map(([m]) => m), ['GET', 'POST', 'POST', 'POST', 'GET', 'POST', 'DELETE']);
});

test('errors: an injected 500, a 400 for a mouse pointer, an unknown session, latency past the timeout, nothing listening', async () => {
  const w = await fake({ failActions: [2] });
  const s = await createSession({ base: w.url });
  await s.actions(fling);
  await assert.rejects(s.actions(fling), (e) => e instanceof WdaError && e.status === 500 && /injected failure on actions call 2/.test(e.message));
  await s.actions(fling); // the session survives one failed stroke
  const mouse = { actions: [{ ...fling.actions[0], parameters: { pointerType: 'mouse' } }] };
  await assert.rejects(request('POST', `/session/${s.id}/actions`, mouse, { base: w.url }), (e) => e.status === 400 && e.error === 'invalid argument' && /Only pointer type 'touch'/.test(e.message));
  await assert.rejects(request('POST', '/session/NOPE/actions', fling, { base: w.url }), (e) => e.status === 404 && /invalid session id/.test(e.message));
  w.state.latencyMs = 400;
  await assert.rejects(request('GET', '/status', undefined, { base: w.url, timeoutMs: 100 }), /timed out after 100 ms/);
  w.state.latencyMs = 0;
  const port = await freePort();
  await assert.rejects(status({ base: `http://127.0.0.1:${port}` }), (e) => e instanceof WdaError && /ECONNREFUSED/.test(e.message) && /iphone\.mjs wda status/.test(e.message));
});

test('actions(): the timeout covers the playback time; FW_WDA_URL picks the server', async () => {
  const w = await fake({ playback: true });
  process.env.FW_WDA_URL = w.url;
  try {
    const s = await createSession();
    const long = compileStroke({ dir: 'up', px: 300, ms: 400, profile: 'still', pressMs: 40, holdMs: 300, x: 215 }).actions;
    assert.equal(actionsMs(long), 740);
    const t = await s.actions(long);
    assert.ok(t.ms >= 700, `waited for the playback (${t.ms} ms)`);
    await assert.rejects(s.actions(long, { timeoutMs: 200 }), /timed out after 200 ms/);
    await s.close();
  } finally { delete process.env.FW_WDA_URL; }
});

test('checkActions: one touch pointer, down before up, ends lifted', () => {
  checkActions(fling);
  const p = (acts, extra = {}) => ({ actions: [{ type: 'pointer', id: 'f', parameters: { pointerType: 'touch' }, actions: acts, ...extra }] });
  const mv = { type: 'pointerMove', duration: 8, x: 200, y: 300 };
  assert.throws(() => checkActions({ actions: [] }), /exactly one input source/);
  assert.throws(() => checkActions({ actions: [fling.actions[0], fling.actions[0]] }), /exactly one input source/, 'no multi-touch');
  assert.throws(() => checkActions(p([mv, { type: 'pointerDown' }, mv], { parameters: { pointerType: 'mouse' } })), /only a touch pointer/);
  assert.throws(() => checkActions(p([mv, { type: 'pointerDown' }, mv])), /must end with pointerUp/, 'a stuck finger would long-press Safari');
  assert.throws(() => checkActions(p([mv, { type: 'pointerUp' }, mv])), /pointerUp while up/);
  assert.throws(() => checkActions(p([{ type: 'pointerDown' }, { type: 'pointerDown' }, { type: 'pointerUp' }])), /pointerDown while down/);
  assert.throws(() => checkActions(p([mv, { type: 'keyDown' }, mv])), /unexpected action keyDown/);
});

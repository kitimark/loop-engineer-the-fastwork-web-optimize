// End to end without the phone: compile the committed protocol script (tools/gestures/finger-protocol-v1.json)
// and play every stroke through tools/lib/wda.mjs against the fake WebDriverAgent running as its own process
// (tests/fixtures/fake-wda.mjs, the way iproxy exposes the real runner on a local port). Checks what reaches
// the "runner": the session setup, every stroke byte for byte in order, and nothing else.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startProc, tempDir, TESTS, REPO } from '../helpers.mjs';
import { compileScript, strokeOps } from '../../tools/lib/gesture.mjs';
import { createSession, status } from '../../tools/lib/wda.mjs';

const procs = [];
after(() => Promise.all(procs.map((p) => p.stop())));
async function fakeWda(args = []) {
  const log = join(tempDir('fw-wda-'), 'wda.jsonl');
  const p = await startProc(process.execPath, [join(TESTS, 'fixtures', 'fake-wda.mjs'), '--port=0', ...args], { env: { FAKE_WDA_LOG: log }, ready: (s) => /^FAKE_WDA_PORT=\d+$/m.test(s) });
  procs.push(p);
  const port = p.stdout().match(/^FAKE_WDA_PORT=(\d+)$/m)[1];
  return { base: `http://127.0.0.1:${port}`, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []) };
}

test('the protocol script, stroke by stroke, reaches the runner exactly as compiled', async () => {
  const w = await fakeWda(['--latency=2']);
  const prog = compileScript(JSON.parse(readFileSync(join(REPO, 'tools', 'gestures', 'finger-protocol-v1.json'), 'utf8')));
  const strokes = strokeOps(prog.ops);
  assert.ok(strokes.length >= 20);
  assert.equal((await status({ base: w.base })).ready, true);
  const s = await createSession({ base: w.base });
  await s.activate();
  assert.equal((await s.activeApp()).bundleId, 'com.apple.mobilesafari');
  const times = [];
  for (const o of strokes) times.push(await s.actions(o.actions));
  await s.close();
  const calls = w.calls();
  const acts = calls.filter((c) => c.path === `/session/${s.id}/actions`);
  assert.equal(acts.length, strokes.length);
  acts.forEach((c, i) => assert.deepEqual(c.body, strokes[i].actions, strokes[i].id));
  assert.ok(times.every((t, i) => i === 0 || t.sentAt >= times[i - 1].returnedAt), 'one stroke at a time');
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path.replace(s.id, ':id')}`).filter((x) => !x.endsWith('/actions')),
    ['GET /status', 'POST /session', 'POST /session/:id/appium/settings', 'POST /session/:id/wda/apps/activate', 'GET /session/:id/wda/activeAppInfo', 'DELETE /session/:id']);
  assert.ok(!calls.some((c) => c.forbidden));
});

test('an injected runner failure on the third stroke surfaces as an error; another app in front is visible', async () => {
  const w = await fakeWda(['--fail-actions=3', '--foreground=com.apple.springboard']);
  const s = await createSession({ base: w.base });
  assert.equal((await s.activeApp()).bundleId, 'com.apple.springboard');
  const o = strokeOps(compileScript(JSON.parse(readFileSync(join(REPO, 'tools', 'gestures', 'finger-protocol-v1.json'), 'utf8'))).ops);
  await s.actions(o[0].actions);
  await s.actions(o[1].actions);
  await assert.rejects(s.actions(o[2].actions), /HTTP 500 unknown error: injected failure on actions call 3/);
  await s.close();
});

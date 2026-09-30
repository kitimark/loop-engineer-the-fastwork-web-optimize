// tools/lib/cdp.mjs without a real browser: chrome path selection, launch failure reporting, and the
// CDP client (request/response matching, events, per-session routing, errors) against the fake Chrome.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, TESTS } from '../helpers.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const cdp = await import('../../tools/lib/cdp.mjs');
const saved = process.env.CHROME;
after(() => { if (saved === undefined) delete process.env.CHROME; else process.env.CHROME = saved; });

test('chromePath honours $CHROME, else the macOS app bundle', () => {
  process.env.CHROME = '/x/chrome';
  assert.equal(cdp.chromePath(), '/x/chrome');
  delete process.env.CHROME;
  if (process.platform === 'darwin') assert.equal(cdp.chromePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});

test('launchChrome reports a browser that exits at once (e.g. profile in use) instead of hanging', async () => {
  const d = tempDir('fw-cdp-');
  const bin = join(d, 'dies.sh');
  writeFileSync(bin, '#!/bin/sh\nexit 1\n');
  chmodSync(bin, 0o755);
  process.env.CHROME = bin;
  const t0 = Date.now();
  await assert.rejects(cdp.launchChrome({ port: 0, profileDir: join(d, 'profile') }), /exited at once .*profile/);
  assert.ok(Date.now() - t0 < 5000);
});

test('launch (port 0 via DevToolsActivePort), sessions, eval, events and errors against the fake Chrome', async () => {
  const d = tempDir('fw-cdp-');
  process.env.CHROME = FAKE;
  process.env.FAKE_CHROME_LOG = join(d, 'log.jsonl');
  const ch = await cdp.launchChrome({ port: 0, profileDir: join(d, 'profile') });
  try {
    assert.ok(ch.port > 0);
    assert.ok(existsSync(join(d, 'profile', 'DevToolsActivePort')));
    const c = await cdp.CDP.connect(ch.wsUrl);
    const page = await c.newIsolatedPage();
    assert.match(page.sessionId, /^session/);
    assert.equal(await page.eval("document.querySelector('.start-selling-top-nav')?.className"), 'start-selling-top-nav is-morph');
    assert.equal(await page.eval('1 + 1'), undefined);
    const events = [];
    const off = page.on((m) => events.push(m.method));
    await cdp.gotoAndSettle(page, 'http://localhost:1/', { quietMs: 100 });
    off();
    assert.ok(events.includes('Page.loadEventFired'));
    assert.ok(events.includes('Network.requestWillBeSent'));
    await assert.rejects(c.waitFor(() => false, 50), /waitFor timeout/);
    await page.close();
    c.close();
    const log = readFileSync(process.env.FAKE_CHROME_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const methods = log.map((l) => l.method);
    for (const m of ['Target.createBrowserContext', 'Target.createTarget', 'Target.attachToTarget', 'Page.enable', 'Runtime.enable', 'Page.navigate', 'Target.disposeBrowserContext']) assert.ok(methods.includes(m), m);
    assert.ok(log.filter((l) => l.method === 'Runtime.evaluate').every((l) => l.sessionId === page.sessionId), 'page commands are routed to the page session');
  } finally {
    await ch.close();
    delete process.env.FAKE_CHROME_LOG;
  }
  assert.notEqual(ch.proc.exitCode ?? ch.proc.signalCode, null, 'close() stops the browser');
});

test('close(): resolves only once the browser is gone; one that ignores SIGTERM is SIGKILLed after the grace (I-023)', async () => {
  process.env.CHROME = FAKE;
  const d = tempDir('fw-cdp-close-');
  // a well-behaved browser exits on SIGTERM: close() returns as soon as it did
  const a = await cdp.launchChrome({ port: 0, profileDir: join(d, 'a') });
  await a.close();
  assert.notEqual(a.proc.exitCode ?? a.proc.signalCode, null, 'gone when close() resolves');
  // a stubborn one: SIGTERM ignored, SIGKILL after graceMs, still gone when close() resolves
  process.env.FAKE_CHROME_IGNORE_SIGTERM = '1';
  try {
    const b = await cdp.launchChrome({ port: 0, profileDir: join(d, 'b') });
    const t0 = Date.now();
    await b.close({ graceMs: 300 });
    assert.equal(b.proc.signalCode, 'SIGKILL');
    assert.ok(Date.now() - t0 >= 300, 'waited the grace first');
  } finally { delete process.env.FAKE_CHROME_IGNORE_SIGTERM; }
});

test('killTree(): SIGKILLs a process and all its descendants, read before the root dies (I-023)', async () => {
  const { spawn } = await import('node:child_process');
  // parent -> child -> grandchild, all sleeping; the parent prints the two descendant pids
  const grand = 'setTimeout(() => {}, 60000)';
  const child = `const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grand)}], { stdio: 'ignore' }); console.log(c.pid); setTimeout(() => {}, 60000)`;
  const parent = `const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.once('data', (d) => console.log(c.pid + ' ' + String(d).trim())); setTimeout(() => {}, 60000)`;
  const p = spawn(process.execPath, ['-e', parent], { stdio: ['ignore', 'pipe', 'ignore'] });
  const line = await new Promise((res) => p.stdout.once('data', (d) => res(String(d).trim())));
  const pids = [p.pid, ...line.split(' ').map(Number)];
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  assert.ok(pids.every(alive));
  const killed = cdp.killTree(p.pid);
  assert.deepEqual([...killed].sort(), [...pids].sort());
  let left = pids;
  for (let i = 0; i < 40 && (left = pids.filter(alive)).length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(left, [], 'descendants survived');
});

test('bench helpers: enablePerformance, getMetrics, eventListeners, browserVersion against the fake Chrome', async () => {
  const d = tempDir('fw-cdp-');
  process.env.CHROME = FAKE;
  process.env.FAKE_CHROME_LOG = join(d, 'log.jsonl');
  const ch = await cdp.launchChrome({ port: 0, profileDir: join(d, 'profile') });
  try {
    const c = await cdp.CDP.connect(ch.wsUrl);
    assert.equal(await cdp.browserVersion(c), 'FakeChrome/1.0');
    const page = await c.newIsolatedPage();
    await cdp.enablePerformance(page, 'threadTicks');
    await assert.rejects(cdp.enablePerformance(page, 'wallTicks'), /bad timeDomain/);
    const m = await cdp.getMetrics(page);
    assert.deepEqual(Object.keys(m), ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']);
    assert.deepEqual(await cdp.eventListeners(page, 'window'), []);
    await page.close();
    c.close();
    const log = readFileSync(process.env.FAKE_CHROME_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(log.find((l) => l.method === 'Performance.enable').params, { timeDomain: 'threadTicks' });
    assert.ok(log.some((l) => l.method === 'DOMDebugger.getEventListeners' && /^obj\d+$/.test(l.params.objectId)));
    assert.ok(log.some((l) => l.method === 'Runtime.releaseObject'), 'the remote object is released');
  } finally {
    await ch.close();
    delete process.env.FAKE_CHROME_LOG;
  }
});

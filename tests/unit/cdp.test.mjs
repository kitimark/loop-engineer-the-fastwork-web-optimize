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

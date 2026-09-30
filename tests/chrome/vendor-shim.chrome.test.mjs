// OPT-IN (npm run test:chrome): vendor-shim.js + CSP in a real (headless) Chrome, under the real
// chrome-measure lock. The fixture's egress.html tries fetch/XHR/sendBeacon/pixel/script/iframe/WebSocket
// to vendor origins. --vendors=local: the shim answers everything locally and not one request leaves
// localhost. --vendors=block: no shim, and the CSP blocks every third-party request. Also: with
// --root site-pretty the SRI-protected vendor script still runs (served from site/).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir, startServe, sleep, chromeLock } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const { launchChrome, CDP, gotoAndSettle } = await import('../../tools/lib/cdp.mjs');
// the chrome-measure queue wait gets its own budget, not the per-test timeout (incident I-022)
const lock = chromeLock(`test-chrome-shim-${process.pid}`, { cmd: 'vendor-shim test' });
before(() => lock.acquire(), { timeout: Infinity });
let fx, d, ch, cdp;
before(async () => {
  d = tempDir('fw-shim-');
  fx = makeFixtureHome(join(d, 'home'));
  ch = await launchChrome({ port: 0, profileDir: join(d, 'profile'), headless: true });
  cdp = await CDP.connect(ch.wsUrl);
});
after(async () => { try { cdp?.close(); await ch?.close(); } finally { lock.release(); } });

async function load(url, expr) {
  const page = await cdp.newIsolatedPage();
  const reqs = [], failed = {};
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') reqs.push({ id: m.params.requestId, url: m.params.request.url });
    if (m.method === 'Network.loadingFailed') failed[m.params.requestId] = m.params.blockedReason || m.params.errorText;
  });
  await page.send('Network.enable');
  await gotoAndSettle(page, url, { quietMs: 800 });
  const value = expr ? await page.eval(expr) : null;
  await sleep(500);
  await page.close();
  return { value, reqs: reqs.map((r) => ({ ...r, failed: failed[r.id] })) };
}
const foreign = (reqs, origin) => reqs.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('about:'));

test('--vendors=local: every egress path is answered locally; nothing leaves localhost', async (t) => {
  const s = await startServe(['--port', '0', '--quiet', '--vendors=local'], { env: { FW_MIRROR_HOME: fx.home } });
  t.after(() => s.stop());
  const origin = s.url.slice(0, -1);
  const { value: r, reqs } = await load(s.url + 'egress.html', 'window.__egress');
  assert.equal(r.fetch.status, 200);
  assert.match(r.fetch.body, /events_ingested/);
  assert.equal(r.xhr.status, 204);
  assert.equal(r.xhr.url, `${origin}/__mirror/null?h=www.google-analytics.com`);
  assert.equal(r.beacon, true);
  assert.equal(r.img, 'data:image/gif;base64,');
  assert.equal(r.script, '/__vendor/www.googletagmanager.com/gtm.js?id=GTM-TEST');
  assert.equal(r.iframe, 'about:blank');
  assert.equal(r.ws, 'open');
  assert.equal(r.sameOrigin, 200);
  assert.ok(r.stats.neutered['fetch api2.amplitude.com'] >= 1);
  assert.deepEqual(foreign(reqs, origin), [], 'no request to any other origin');
});

test('--vendors=block: no shim; the CSP blocks every third-party request', async (t) => {
  const s = await startServe(['--port', '0', '--quiet'], { env: { FW_MIRROR_HOME: fx.home } });
  t.after(() => s.stop());
  const origin = s.url.slice(0, -1);
  const { value: r, reqs } = await load(s.url + 'egress.html', 'window.__egress');
  assert.equal(r.stats, undefined, 'shim not injected');
  assert.match(r.fetch.error, /TypeError/, 'fetch to a vendor is refused by the CSP');
  const out = foreign(reqs, origin);
  for (const q of out) assert.ok(q.failed, `${q.url} was not blocked`);
});

test('--root site-pretty --vendors=local: SRI-protected vendor script runs (served from site/)', async (t) => {
  const s = await startServe(['--port', '0', '--quiet', '--vendors=local', '--root', 'site-pretty'], { env: { FW_MIRROR_HOME: fx.home } });
  t.after(() => s.stop());
  const { value } = await load(s.url, '({ beacon: window.__beacon, page: window.__fixturePage })');
  assert.deepEqual(value, { beacon: 1, page: true });
});

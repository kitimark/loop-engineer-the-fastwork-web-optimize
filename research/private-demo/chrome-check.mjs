#!/usr/bin/env node
// chrome-check.mjs: a functional (not timed) headless Chrome check of the private demo, localhost only.
// Run it only as a shared chrome-measure job (CLAUDE.md "Shared devices"), in the background:
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner <you> -- \
//     node research/private-demo/chrome-check.mjs --snapshot <v10 snapshot dir> [--dir out/private-demo]
//
// Pages, each in a fresh isolated context, at 430x932 DPR 3 with touch (the study's phone viewport):
//   ref1, ref2  V as the study served it: tools' mirror handler, site-pretty + the snapshot's V files, --vendors=local
//   demo        the private demo through local-server.mjs (middleware.ts + public/ + vercel.json headers), signing in
//               with a throwaway random password the way a browser does (Fetch.authRequired -> credentials)
//   nocreds     the demo when the visitor cancels the password prompt
// Every request to a host other than localhost/127.0.0.1 is failed by the check itself (Fetch.failRequest) and
// counted, so nothing leaves the machine even if a page tried. Collected per page: requests by host, HTTP statuses,
// console errors/warnings, uncaught exceptions, Log errors (CSP, network), the document height, a scripted scroll
// to the bottom, an element-layout signature of the app root and screenshots at 0/25/50/75/100 % of the height.
// Pixel differences demo vs ref1 are reported next to ref2 vs ref1 (the animation/countdown noise floor).
// Writes <dir>/chrome-check.json (no screenshots kept). Exit 0 when the demo has 0 console errors, 0 exceptions,
// 0 non-localhost requests, 0 failed requests and the nocreds page shows no site content.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, freePort } from './local-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log('see the header of research/private-demo/chrome-check.mjs'); process.exit(0); }
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const DIR = resolve(opt('dir', join(REPO, 'out', 'private-demo')));
const SNAP = opt('snapshot') && resolve(opt('snapshot'));
if (!SNAP) { console.error('--snapshot <v10 snapshot dir> is required (for the reference page)'); process.exit(2); }

const { launchChrome, CDP, tempProfileDir, sleep } = await import(join(REPO, 'tools', 'lib', 'cdp.mjs'));
const { createMirrorHandler } = await import(join(REPO, 'tools', 'lib', 'mirror-handler.mjs'));
const { resolveTree } = await import(join(REPO, 'tools', 'lib', 'paths.mjs'));
const hp = await import(pathToFileURL(join(DIR, 'hash-password.mjs')).href);

// --- servers ---
let PW = randomBytes(18).toString('base64url');
const salt = hp.newSalt();
const demo = await startServer({ dir: DIR, env: { DEMO_PASS_SALT: salt, DEMO_PASS_SHA256: await hp.sha256Hex(salt, PW) }, port: await freePort() });
const mirror = createMirrorHandler({ root: resolveTree('site-pretty'), manifestRoot: resolveTree('site'), overlays: [join(SNAP, 'V')], vendors: 'local', compress: 'none', quiet: true });
const refServer = createServer(mirror.handler);
const refPort = await freePort();
await new Promise((ok) => refServer.listen(refPort, '127.0.0.1', ok));
const REF = `http://localhost:${refPort}`;

// --- Chrome ---
mkdirSync(join(REPO, 'out', 'private-demo-profiles'), { recursive: true });
const chrome = await launchChrome({
  port: 0, headless: true, profileDir: tempProfileDir(join(REPO, 'out', 'private-demo-profiles'), 'private-demo'),
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings', '--disable-domain-reliability',
    '--disable-client-side-phishing-detection', '--disable-default-apps', '--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication'],
});
const cdp = await CDP.connect(chrome.wsUrl);
const isLocal = (u) => { try { const h = new URL(u).hostname; return h === 'localhost' || h === '127.0.0.1'; } catch { return true; } };

async function visit(label, url, { creds = null, cancelAuth = false, shots = true } = {}) {
  const page = await cdp.newIsolatedPage();
  const rec = { label, url: url.replace(/:\d+/, ':<port>'), requests: 0, hosts: {}, external: [], statuses: {}, failed: [], consoleErrors: [], consoleWarnings: [], exceptions: [], logErrors: [], authPrompts: 0 };
  page.on((m) => {
    const p = m.params || {};
    if (m.method === 'Fetch.requestPaused') {
      if (!isLocal(p.request.url)) { rec.external.push(p.request.url); page.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); }
      else page.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
    } else if (m.method === 'Fetch.authRequired') {
      rec.authPrompts++;
      const authChallengeResponse = cancelAuth || !creds ? { response: 'CancelAuth' } : { response: 'ProvideCredentials', username: creds.user, password: creds.pass };
      page.send('Fetch.continueWithAuth', { requestId: p.requestId, authChallengeResponse }).catch(() => {});
    } else if (m.method === 'Network.requestWillBeSent') {
      rec.requests++;
      let h = '?'; try { h = new URL(p.request.url).host.replace(/:\d+$/, ':<port>'); } catch {}
      if (!/^(data|blob):/.test(p.request.url)) rec.hosts[h] = (rec.hosts[h] || 0) + 1;
    } else if (m.method === 'Network.responseReceived') {
      const s = p.response.status; rec.statuses[s] = (rec.statuses[s] || 0) + 1;
      if (s >= 400) rec.failed.push(`${s} ${new URL(p.response.url).pathname}`);
    } else if (m.method === 'Network.loadingFailed') {
      if (!p.canceled) rec.failed.push(`${p.errorText} ${p.blockedReason || ''}`.trim());
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200);
      if (p.type === 'error' || p.type === 'assert') rec.consoleErrors.push(text);
      if (p.type === 'warning') rec.consoleWarnings.push(text);
    } else if (m.method === 'Runtime.exceptionThrown') {
      rec.exceptions.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 200));
    } else if (m.method === 'Log.entryAdded') {
      if (p.entry.level === 'error') rec.logErrors.push(`${p.entry.source}: ${p.entry.text}`.slice(0, 200));
    }
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Fetch.enable', { handleAuthRequests: true, patterns: [{ urlPattern: '*' }] });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 30000).catch(() => null);
  await page.send('Page.navigate', { url });
  await loaded;
  await sleep(2500);
  rec.title = await page.eval('document.title');
  rec.bodyText = (await page.eval('document.body ? document.body.innerText.slice(0, 80) : ""')).trim();
  if (!shots) { await page.close(); return rec; }
  const LAYOUT = `(() => { const root = document.body.querySelector(':scope > div'); if (!root) return null; const out = [];
    for (const el of root.querySelectorAll('*')) out.push([el.tagName, el.getAttribute('class') || '', el.offsetTop, el.offsetLeft, el.offsetWidth, el.offsetHeight].join('|'));
    return out; })()`;
  rec.layoutTop = await page.eval(LAYOUT);
  rec.elements = rec.layoutTop?.length ?? 0;
  rec.scrollHeight = await page.eval('document.documentElement.scrollHeight');
  // scripted scroll to the bottom (rAF steps of 40 px, at most 15 s), then back to the top
  rec.scroll = await page.eval(`new Promise((done) => { const t0 = performance.now(); let frames = 0;
    const step = () => { frames++; window.scrollBy(0, 40); const end = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1;
      if (end || performance.now() - t0 > 15000) done({ reachedBottom: end, maxY: Math.round(scrollY), frames, ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(step); };
    requestAnimationFrame(step); })`);
  await sleep(1000);
  rec.scrollHeightAfter = await page.eval('document.documentElement.scrollHeight');
  rec.shots = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.round(f * (rec.scrollHeightAfter - 932));
    await page.eval(`window.scrollTo(0, ${y})`);
    await sleep(1500);
    const at = await page.eval('Math.round(scrollY)');
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    rec.shots.push({ f, y, at, png: data, sha: createHash('sha256').update(data).digest('hex').slice(0, 12), layout: await page.eval(LAYOUT) });
  }
  await page.close();
  return rec;
}

// pixel difference of two PNGs (base64), decoded by Chrome in a blank page
async function pixelDiff(a, b) {
  const page = await cdp.newIsolatedPage();
  const r = await page.eval(`(async () => {
    const load = (b64) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + b64; });
    const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
    if (A.width !== B.width || A.height !== B.height) return { sizeDiffers: true };
    const px = (img) => { const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const p = px(A), q = px(B); let any = 0, over32 = 0; const n = p.length / 4;
    for (let i = 0; i < p.length; i += 4) { const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])); if (d) any++; if (d > 32) over32++; }
    return { anyPct: +(100 * any / n).toFixed(3), over32Pct: +(100 * over32 / n).toFixed(3) };
  })()`);
  await page.close();
  return r;
}
const layoutDiff = (a, b) => { if (!a || !b) return null; if (a.length !== b.length) return { countA: a.length, countB: b.length }; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

let out;
try {
  const ref1 = await visit('ref1', REF + '/');
  const ref2 = await visit('ref2', REF + '/');
  const dem = await visit('demo', demo.url + '/', { creds: { user: 'reviewer', pass: PW } });
  const noc = await visit('nocreds', demo.url + '/', { cancelAuth: true, shots: false });
  const cmp = [];
  for (let i = 0; i < dem.shots.length; i++) {
    cmp.push({
      at: dem.shots[i].f, y: dem.shots[i].y, scrollYRef: ref1.shots[i].at, scrollYDemo: dem.shots[i].at,
      refVsRef: await pixelDiff(ref1.shots[i].png, ref2.shots[i].png), demoVsRef: await pixelDiff(ref1.shots[i].png, dem.shots[i].png),
      layoutRefVsRef: layoutDiff(ref1.shots[i].layout, ref2.shots[i].layout), layoutDemoVsRef: layoutDiff(ref1.shots[i].layout, dem.shots[i].layout),
    });
  }
  const strip = (r) => { const { shots, layoutTop, ...rest } = r; return { ...rest, shots: shots?.map(({ png, layout, ...s }) => s) }; };
  out = {
    when: new Date().toISOString(), chrome: chrome.browser, viewport: '430x932 DPR 3, touch, headless',
    layoutTopDemoVsRef: layoutDiff(ref1.layoutTop, dem.layoutTop), layoutTopRefVsRef: layoutDiff(ref1.layoutTop, ref2.layoutTop),
    compare: cmp, pages: [ref1, ref2, dem, noc].map(strip), demoServer: demo.stats,
  };
  const d = out.pages[2], n = out.pages[3];
  out.verdict = {
    demoConsoleErrors: d.consoleErrors.length, demoExceptions: d.exceptions.length, demoLogErrors: d.logErrors.length,
    demoNonLocalhostRequests: d.external.length + Object.keys(d.hosts).filter((h) => !/^(localhost|127\.0\.0\.1)(:<port>)?$/.test(h)).length,
    demoFailedRequests: d.failed.length, demoReachedBottom: d.scroll.reachedBottom, demoAuthPrompts: d.authPrompts,
    nocredsShowsNoContent: !/Fastwork/i.test(n.title + n.bodyText) && n.requests <= 2,
  };
  out.ok = !out.verdict.demoConsoleErrors && !out.verdict.demoExceptions && !out.verdict.demoNonLocalhostRequests && !out.verdict.demoFailedRequests && !out.verdict.demoLogErrors && out.verdict.nocredsShowsNoContent;
} finally {
  PW = null;
  cdp.close();
  await chrome.close();
  await demo.close();
  refServer.close();
}
writeFileSync(join(DIR, 'chrome-check.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ verdict: out.verdict, ok: out.ok, layoutTopDemoVsRef: out.layoutTopDemoVsRef, layoutTopRefVsRef: out.layoutTopRefVsRef }, null, 1));
for (const c of out.compare) console.log(`at ${c.at}: y ref ${c.scrollYRef} demo ${c.scrollYDemo} | pixels ref2-vs-ref1 ${JSON.stringify(c.refVsRef)} demo-vs-ref1 ${JSON.stringify(c.demoVsRef)} | layout diffs ref2 ${JSON.stringify(c.layoutRefVsRef)} demo ${JSON.stringify(c.layoutDemoVsRef)}`);
for (const p of out.pages) console.log(`${p.label}: requests ${p.requests}, hosts ${JSON.stringify(p.hosts)}, external ${p.external.length}, statuses ${JSON.stringify(p.statuses)}, failed ${JSON.stringify(p.failed)}, console errors ${JSON.stringify(p.consoleErrors)}, warnings ${p.consoleWarnings.length}, exceptions ${JSON.stringify(p.exceptions)}, log errors ${JSON.stringify(p.logErrors)}, auth prompts ${p.authPrompts}, title ${JSON.stringify(p.title)}, height ${p.scrollHeight}->${p.scrollHeightAfter}, scroll ${JSON.stringify(p.scroll)}`);
process.exit(out.ok ? 0 : 1);

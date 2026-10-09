// deck-chrome (fix-deck-chrome, T-228 #126/#143): fast touch flings from y 0 that land on #people's profile deck, with every
// screencast frame and a page log of what changes on the deck. COUNTS AND PIXELS ONLY, no timing claim.
// Chrome headed, 430x932 DPR 3 mobile + touch, CPU 6x, served --https --latency 150 --vendors=local (each arm its own server).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-deck-chrome -- \
//     node fixes/deck-chrome/probe/fling.mjs --arms base,g0j --cases s6000d800 --runs 1 [--log full|light] [--css f.css] [--js f.js] [--label x]
// A case is s<speed px/s>d<distance px>[p<start y of the finger>] (one Input.synthesizeScrollGesture, touch, preventFling:false),
// or w<speed>d<dist>x<n> (n gestures back to back). Output: out/deck-chrome/<label>-<stamp>/<arm>-<case>-r<n>/ f<NNNN>.png + run.json.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HOME = '/Users/<user>/source/fastwork-com-web-optimize';
const ARMDIR = { base: null, g0j: join(HOME, 'out/tryit/g0-0j'), g0i: join(WT, 'fixes/g0-0i/overlay') };
for (const x of (arg('--arm-dirs', '') || '').split(',').filter(Boolean)) { const [k, v] = x.split('='); ARMDIR[k] = resolve(WT, v); }
const ARMS = arg('--arms', 'base,g0j').split(',');
const CASES = arg('--cases', 's6000d800').split(',');
const RUNS = Number(arg('--runs', '1'));
const LOG = arg('--log', 'full');
const CPU = Number(arg('--cpu', '6'));
const IDLE = Number(arg('--idle', '6'));
const AFTER = Number(arg('--after', '2500'));
const CSS = arg('--css') ? readFileSync(resolve(WT, arg('--css')), 'utf8') : '';
const JSX = arg('--js') ? readFileSync(resolve(WT, arg('--js')), 'utf8') : '';
const LABEL = arg('--label', 'fling');
const H = 932;
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(WT, 'out/deck-chrome', `${LABEL}-${tag}`); mkdirSync(OUT, { recursive: true });

// page logger: armed at document start, records only between __dk.start() and __dk.stop()
const LOGGER = `(() => {
  const FULL = ${JSON.stringify(LOG === 'full')};
  const L = window.__dk = { on: false, ev: [], fr: [] };
  const now = () => performance.now();
  const short = (e) => { if (!e || e.nodeType !== 1) return '?'; const c = (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '').replace(/svelte-\\w+/g, '').trim().split(/\\s+/).filter(Boolean);
    let s = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (c[0] ? '.' + c[0] : '');
    if (e.classList.contains('start-selling-profile-shell') && e.parentElement) s += '[' + [...e.parentElement.children].indexOf(e) + ']';
    else { const sh = e.closest && e.closest('.start-selling-profile-shell'); if (sh) s = short(sh) + '>' + s; }
    return s; };
  const deck = () => document.querySelector('.start-selling-profile-deck');
  const scope = (e) => { const d = deck(); return !!(d && e && e.nodeType === 1 && (d.contains(e) || e.contains(d))); };
  const mo = new MutationObserver((ms) => { if (!L.on) return; const t = now();
    for (const m of ms) { const e = m.target; if (!scope(e)) continue;
      if (m.type === 'attributes') { const v = e.getAttribute(m.attributeName); L.ev.push([t, 'attr', short(e), m.attributeName, String(m.oldValue ?? '').replace(/svelte-\\w+/g, '').slice(0, 160), String(v ?? '').replace(/svelte-\\w+/g, '').slice(0, 160)]); }
      else L.ev.push([t, 'child', short(e), m.addedNodes.length, m.removedNodes.length]); } });
  const arm = () => mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, childList: true });
  if (document.documentElement) arm(); else document.addEventListener('readystatechange', arm, { once: true });
  addEventListener('load', (e) => { if (L.on && e.target && e.target.tagName === 'IMG' && scope(e.target)) L.ev.push([now(), 'imgload', short(e.target), (e.target.currentSrc || '').split('/').pop().slice(0, 40)]); }, true);
  addEventListener('error', (e) => { if (L.on && e.target && e.target.tagName === 'IMG' && scope(e.target)) L.ev.push([now(), 'imgerr', short(e.target)]); }, true);
  addEventListener('contentvisibilityautostatechange', (e) => { if (L.on) L.ev.push([now(), 'cv', short(e.target), e.skipped ? 'skipped' : 'rendered', scope(e.target) ? 'scope' : '']); }, true);
  for (const k of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel'])
    addEventListener(k, (e) => { if (L.on && scope(e.target)) L.ev.push([now(), k, short(e.target), e.animationName || e.propertyName || '']); }, true);
  const frame = () => { if (!L.on) return; const t = now(); const y = scrollY;
    if (!FULL) { L.fr.push([t, y]); requestAnimationFrame(frame); return; }
    const d = deck(); let dr = null, sh = [];
    if (d) { const r = d.getBoundingClientRect(); dr = [+r.left.toFixed(1), +r.top.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)];
      for (const s of d.children) { const b = s.getBoundingClientRect(), cs = getComputedStyle(s); const im = s.querySelectorAll('img'); let ok = 0; for (const i of im) if (i.complete && i.naturalWidth) ok++;
        sh.push([+b.left.toFixed(1), +b.top.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1), cs.visibility[0], +cs.opacity, s.getAttribute('data-fw-wc'), s.classList.contains('is-active-shell') ? 1 : 0, ok + '/' + im.length, cs.willChange, s.getAnimations().map((a) => a.animationName || a.transitionProperty || 'waapi').join('|')]); } }
    L.fr.push([t, y, dr, sh]); requestAnimationFrame(frame); };
  L.start = () => { L.ev = []; L.fr = []; L.on = true; L.t0 = now(); requestAnimationFrame(frame); return performance.timeOrigin + L.t0; };
  L.stop = () => { L.on = false; return JSON.stringify({ timeOrigin: performance.timeOrigin, ev: L.ev, fr: L.fr }); };
  const css = ${JSON.stringify(CSS)};
  if (css) { const add = () => { const s = document.createElement('style'); s.id = 'dk-knock'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }; document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add, { once: true }) : add(); }
  ${JSX}
})();`;

const INFO = `JSON.stringify((() => { const d = document.querySelector('.start-selling-profile-deck'); if (!d) return null; const r = d.getBoundingClientRect();
  const anc = []; for (let e = d; e && e !== document.body; e = e.parentElement) { const a = {}; for (const n of e.getAttributeNames()) if (/^data-|^id$/.test(n)) a[n] = e.getAttribute(n); anc.push([e.tagName.toLowerCase() + '.' + String(e.className).replace(/svelte-\\w+/g, '').trim().replace(/\\s+/g, '.'), a, getComputedStyle(e).contentVisibility, getComputedStyle(e).willChange, getComputedStyle(e).transform.slice(0, 60)]); }
  const imgs = [...d.querySelectorAll('img')].map((i) => [i.closest('.start-selling-profile-shell') ? [...d.children].indexOf(i.closest('.start-selling-profile-shell')) : -1, i.getAttribute('loading'), i.getAttribute('decoding'), i.complete && i.naturalWidth > 0 ? 1 : 0, (i.currentSrc || i.src || '').split('/').pop().slice(0, 40), Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)]);
  return { y: scrollY, deckDocTop: r.top + scrollY, deckH: r.height, shells: d.children.length, anc, imgs, docH: document.documentElement.scrollHeight, future: document.querySelector('.start-selling-future')?.className.replace(/svelte-\\w+/g, '').trim() }; })())`;

function parseCase(c) {
  const m = /^([sw])(\d+)d(\d+)(?:p(\d+))?(?:x(\d+))?$/.exec(c); if (!m) throw new Error('bad case ' + c);
  return { kind: m[1], speed: +m[2], dist: +m[3], py: m[4] ? +m[4] : 880, n: m[5] ? +m[5] : 1 };
}

const servers = {}, res = { tool: 'fixes/deck-chrome/probe/fling.mjs', argv, startedAt: new Date().toISOString(), load1: loadavg()[0], cpu: CPU, log: LOG, css: CSS || null, js: JSX || null, runs: [] };
let chrome = null, cdp = null;
try {
  for (const arm of ARMS) {
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const a = ['--root', resolveTree('site-pretty'), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin', '--owner', 'fix-deck-chrome', '--doing', 'deck fling probe'];
    if (ARMDIR[arm]) a.push('--overlay', ARMDIR[arm]); else if (arm !== 'base') throw new Error('unknown arm ' + arm);
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), ...a], { stdio: ['ignore', 'ignore', 'inherit'] });
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start for ' + arm);
    servers[arm] = { p, url: s.url || `https://localhost:${s.port}/` };
  }
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/deck-chrome/chrome'), 'dk'), windowSize: '500,1000' });
  cdp = await C.CDP.connect(chrome.wsUrl);
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
  res.browser = chrome.browser;
  for (let r = 1; r <= RUNS; r++) for (const cs of CASES) for (const arm of ARMS) {
    const K = parseCase(cs); const dir = join(OUT, `${arm}-${cs}-r${r}`); mkdirSync(dir, { recursive: true });
    const run = { arm, case: cs, r, dir, frames: [] }; let page = null, offF = null;
    try {
      page = await cdp.newIsolatedPage();
      await page.send('Network.enable');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LOGGER });
      const url = servers[arm].url.replace(/\/?$/, '/') + `?dk=${arm}-${cs}-${r}`;
      await C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
      for (let i = 0; i < 40 && (await page.eval('document.readyState')) !== 'complete'; i++) await sleep(500);
      run.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
      await sleep(1500);
      run.info0 = JSON.parse(await page.eval(INFO));
      await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      await sleep(IDLE * 1000);
      let n = 0;
      offF = page.on((m) => { if (m.method !== 'Page.screencastFrame') return; page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
        const f = `f${String(n++).padStart(4, '0')}.png`; writeFileSync(join(dir, f), Buffer.from(m.params.data, 'base64')); run.frames.push({ f, ...m.params.metadata }); });
      await page.send('Page.startScreencast', { format: 'png', maxWidth: 430, maxHeight: H, everyNthFrame: 1 });
      await sleep(400);
      run.t0 = await page.eval('__dk.start()');
      run.gesture = { at: Date.now() };
      for (let i = 0; i < K.n; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: K.py, yDistance: -K.dist, speed: K.speed, gestureSourceType: 'touch', preventFling: K.kind === 's' || i === K.n - 1 ? false : true, repeatCount: 1 });
      run.gesture.done = Date.now();
      await sleep(AFTER);
      run.log = JSON.parse(await page.eval('__dk.stop()'));
      await page.send('Page.stopScreencast').catch(() => {});
      await sleep(200);
      run.info1 = JSON.parse(await page.eval(INFO));
      await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const ys = run.frames.map((f) => f.scrollOffsetY);
      console.log(`${arm} ${cs} r${r}: served ${JSON.stringify(run.served)} deck doc ${run.info0?.deckDocTop?.toFixed(0)}+${run.info0?.deckH?.toFixed(0)} frames ${run.frames.length} y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)} end ${run.info1?.y?.toFixed(0)} ev ${run.log.ev.length} rAF ${run.log.fr.length} imgs0 ${run.info0?.imgs.map((x) => x[3]).join('')}`);
    } catch (e) { run.error = String(e.stack || e); console.log(arm, cs, r, 'error', run.error); }
    finally { offF?.(); try { await page?.close(); } catch {} writeFileSync(join(dir, 'run.json'), JSON.stringify(run)); res.runs.push({ arm, case: cs, r, dir, frames: run.frames.length, error: run.error || null }); }
  }
} finally {
  res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  try { cdp?.close(); await chrome?.close(); } catch {}
  for (const s of Object.values(servers)) try { s.p.kill(); } catch {}
  console.log('OUT', OUT);
}

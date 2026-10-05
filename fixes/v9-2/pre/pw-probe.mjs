#!/usr/bin/env node
// people-word functional probe (fix-people-word, 2026-10-05). Not a tool; run only inside a chrome-measure SHARED hold.
// For each build x viewport x reduced-motion: scripted stepped scroll into the people section and out again, logging
// (1) class timestamps on .start-selling-future (is-visible) and .start-selling-future-people-o (is-stack, is-expanded),
// (2) the heading's own 0.35 IntersectionObserver crossings (a probe IO, same threshold as the page),
// (3) counts-only mechanism numbers: rAF calls, MutationObserver/IntersectionObserver constructions and callback runs,
//     scroll/wheel/touch/resize listeners added. Headless (new), unthrottled, no timing claim.
//   node probe.mjs <out.json> <label=url>...
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA } from '../../tools/lib/cdp.mjs';

const [out, ...targets] = process.argv.slice(2);
const VIEWPORTS = {
  mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
};

const INSTR = `(() => {
  const P = window.__pw = { raf: 0, mo: 0, moCb: 0, io: 0, ioCb: 0, listeners: [], ev: [] };
  P.OMO = window.MutationObserver; P.OIO = window.IntersectionObserver;
  const oRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (f) { P.raf++; return oRaf.call(window, f); };
  window.MutationObserver = class extends P.OMO { constructor(cb) { P.mo++; super((...a) => { P.moCb++; return cb(...a); }); } };
  window.IntersectionObserver = class extends P.OIO { constructor(cb, o) { P.io++; super((...a) => { P.ioCb++; return cb(...a); }, o); } };
  const oAdd = EventTarget.prototype.addEventListener; P.oAdd = oAdd;
  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (/^(scroll|scrollend|wheel|touchstart|touchmove|touchend|resize|transitionend)$/.test(type)) P.listeners.push(type + '@' + (this === window ? 'window' : this === document ? 'document' : (this.nodeName || 'obj')));
    return oAdd.call(this, type, fn, opt);
  };
})();`;

const ARM = `(() => {
  const P = window.__pw;
  const sec = document.getElementById('future-heading')?.closest('.start-selling-future');
  const words = document.querySelectorAll('.start-selling-future-people-o');
  const word = words[0];
  const head = document.getElementById('future-heading');
  const track = document.querySelector('.hero-track');
  const tr = track.getBoundingClientRect();
  const trackTop = tr.top + scrollY, trackH = tr.height;
  P.geo = { trackTop, trackH, inner: innerHeight, inner_w: innerWidth, y72: trackTop + 0.72 * Math.max(1, trackH - innerHeight),
    secTop: sec.getBoundingClientRect().top + scrollY, headTop: head.getBoundingClientRect().top + scrollY, headH: head.getBoundingClientRect().height,
    words: words.length, wordClass0: word.className, secClass0: sec.className };
  const log = (what) => P.ev.push({ t: Math.round(performance.now()), what, y: Math.round(scrollY) });
  let sv = sec.classList.contains('is-visible'), ws = word.classList.contains('is-stack'), we = word.classList.contains('is-expanded');
  new P.OMO(() => { const v = sec.classList.contains('is-visible'); if (v !== sv) { sv = v; log(v ? 'visible+' : 'visible-'); } }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  new P.OMO(() => { const s = word.classList.contains('is-stack'), e = word.classList.contains('is-expanded');
    if (s !== ws) { ws = s; log(s ? 'stack+' : 'stack-'); } if (e !== we) { we = e; log(e ? 'expanded+' : 'expanded-'); } }).observe(word, { attributes: true, attributeFilter: ['class'] });
  new P.OIO(([e]) => log(e.isIntersecting ? 'headIO+' : 'headIO-'), { threshold: 0.35 }).observe(head);
  const card = sec.querySelector(':scope > .start-selling-future-card');
  P.oAdd.call(card, 'transitionend', (ev) => { if (ev.target === card && ev.propertyName === 'filter') log(sec.classList.contains('is-visible') ? 'fadeInEnd' : 'fadeOutEnd'); });
  return P.geo;
})()`;

// stepped scroll to y at ~900 px/s (30 px per 33 ms), instant steps; resolves when there
const scrollTo = (y, step = 30, ms = 33) => `new Promise(async (res) => { const to = ${Math.round(y)}; while (Math.abs(scrollY - to) > 1) { const d = Math.sign(to - scrollY) * Math.min(${step}, Math.abs(to - scrollY)); window.scrollBy({ top: d, behavior: 'instant' }); await new Promise(r => setTimeout(r, ${ms})); if (Math.abs(scrollY - to) > 1 && Math.abs(d) < 1) break; } res(Math.round(scrollY)); })`;
const counts = `(() => { const P = window.__pw; return { raf: P.raf, mo: P.mo, moCb: P.moCb, io: P.io, ioCb: P.ioCb }; })()`;

async function run(cdp, label, url, vp, reduced, ua) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  });
  await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
  await page.send('Emulation.setDeviceMetricsOverride', VIEWPORTS[vp]);
  if (vp === 'mobile') await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
  await page.send('Network.enable');
  await gotoAndSettle(page, url, { quietMs: 1500 });
  await sleep(1000);
  const geo = await page.eval(ARM);
  const atTop = await page.eval(counts);
  const listenersAtLoad = await page.eval('window.__pw.listeners.slice()');
  const ph = [];
  const mark = async (name) => ph.push({ name, t: Math.round(await page.eval('performance.now()')), y: await page.eval('Math.round(scrollY)'), c: await page.eval(counts) });
  const target = geo.y72 + 150; // card shown, heading still in view (it leaves the top ~380 px past y72)
  await mark('start');
  // P1: down from the top to past the fade trigger, hold 4 s
  await page.eval(scrollTo(target), { timeout: 120000 });
  await mark('p1-arrived');
  const shots = [];
  if (!reduced) {
    // shots of the title at fixed times after the card's fade-in started (visible+), for the proposal
    const tv = await page.eval(`new Promise((res) => { const f = () => { const e = window.__pw.ev.find((x) => x.what === 'visible+'); e ? res(e.t) : setTimeout(f, 20); }; f(); })`, { timeout: 20000 }).catch(() => null);
    if (tv != null) for (const dt of [1000, 1500, 2000, 3000]) {
      await page.eval(`new Promise((r) => setTimeout(r, Math.max(0, ${tv + dt} - performance.now())))`);
      const r = await page.eval(`(() => { const h = document.getElementById('future-heading').getBoundingClientRect(); return { t: Math.round(performance.now()), top: h.top, left: h.left, w: h.width, h: h.height, cls: document.querySelector('.start-selling-future-people-o').className }; })()`);
      const y = Math.max(0, r.top - 24), clip = { x: 0, y, width: VIEWPORTS[vp].width, height: Math.min(VIEWPORTS[vp].height - y, r.h + 48), scale: 1 };
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip });
      const file = join(outDir, `shot-${label}-${vp}-v${dt}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      shots.push({ dt, tShot: r.t - tv, wordClass: r.cls, file });
    }
  }
  await sleep(reduced ? 2500 : Math.max(0, 4000 - 3200)); await mark('p1-held');
  if (reduced) {
    const ev = await page.eval('window.__pw.ev.slice()');
    await page.close();
    return { label, vp, reduced, geo, atTop, listenersAtLoad, phases: ph, ev, errors, shots };
  }
  // P2: back to the top (heading leaves -> reset), hold 1.5 s; down again (replay), hold 4 s
  await page.eval(scrollTo(0, 60), { timeout: 120000 }); await sleep(1500); await mark('p2-top');
  await page.eval(scrollTo(target), { timeout: 120000 }); await mark('p2-arrived'); await sleep(4000); await mark('p2-held');
  // P3: quick in/out: from 300 px above the fade trigger, to 40 px past it and straight back (card shown < ~0.3 s), hold 2.5 s, then in, hold 4 s
  await page.eval(scrollTo(0, 60), { timeout: 120000 }); await sleep(1500);
  await page.eval(scrollTo(geo.y72 - 300, 60), { timeout: 120000 }); await sleep(1500); await mark('p3-before');
  await page.eval(scrollTo(geo.y72 + 40, 40, 16), { timeout: 60000 }); await page.eval(scrollTo(geo.y72 - 300, 40, 16), { timeout: 60000 });
  await mark('p3-out'); await sleep(2500); await mark('p3-held-out');
  await page.eval(scrollTo(target), { timeout: 120000 }); await mark('p3-arrived'); await sleep(4000); await mark('p3-held');
  // P4: word open, scroll back up until the card fades out with the heading still in view (y72 - 100), hold 2.5 s,
  // then down again (the fade-out reset and the replay)
  await page.eval(scrollTo(geo.y72 - 100, 30), { timeout: 60000 }); await mark('p4-up'); await sleep(2500); await mark('p4-held-up');
  await page.eval(scrollTo(target), { timeout: 60000 }); await mark('p4-arrived'); await sleep(4000); await mark('p4-held');
  const ev = await page.eval('window.__pw.ev.slice()');
  const listeners = await page.eval('window.__pw.listeners.slice()');
  await page.close();
  return { label, vp, reduced, geo, atTop, listenersAtLoad, listenersEnd: listeners, phases: ph, ev, errors, shots };
}

const outDir = dirname(out); mkdirSync(outDir, { recursive: true });
const ch = await launchChrome({ port: 0, profileDir: join(outDir, 'profile-probe'), headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const ver = await cdp.send('Browser.getVersion');
const ua = headedUA(ver.userAgent);
const only = (process.env.PW_ONLY || '').split(',').filter(Boolean);
const results = [];
try {
  for (const t of targets) {
    const i = t.indexOf('='); const label = t.slice(0, i), url = t.slice(i + 1);
    for (const combo of (only.length ? only : ['mobile', 'mobile-rm', 'desktop'])) {
      const vp = combo.split('-')[0], reduced = combo.endsWith('-rm');
      const r = await run(cdp, label, url, vp, reduced, ua);
      results.push(r);
      const e = r.ev.map((x) => `${x.what}@${x.t}`).join(' ');
      console.log(`${label} ${vp}${reduced ? ' RM' : ''}: y72 ${Math.round(r.geo.y72)} headTop ${Math.round(r.geo.headTop)} errors ${r.errors.length} | ${e}`);
    }
  }
} finally { cdp.close(); await ch.close(); }
writeFileSync(out, JSON.stringify({ product: ver.product, results }, null, 1));

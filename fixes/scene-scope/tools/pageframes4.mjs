// Deterministic frozen frames on a virtual JS clock (headless, functional, no timing). Generalises carframes.mjs's
// timer hold to every JS clock on the page: an init script records every setTimeout/setInterval/rAF/rIC while the page
// loads on the real clock; after load, __vt.start() moves the pending ones onto a virtual clock (remaining delays rounded
// up to 100 ms) and from then on performance.now, Date, timers, intervals, rAF and rIC run only when the probe calls
// __vt.advance(ms) (rAF every 16 virtual ms, a real macrotask yield after every callback so promise chains settle).
// Date starts at a fixed epoch, so a countdown reads the same in every arm. CSS animations stay on the real document
// timeline and are pinned at capture (paused; infinite at 0, finite at their end), as in pageframes.mjs; SVG SMIL
// (<animate>, the secure-network dash) is paused at document time 0 on every outermost svg that has one.
// Per y: scrollTo (instant), real wait, advance, real wait, advance, freeze, 2 real rAFs, full-viewport PNG; plus the
// row-title sweep census (playState, data-sweep-paused, visibility).
// pageframes4 = pageframes3 + IntersectionObserver hold (HOLDIO=1, default): while the clock is virtual, IO callbacks
// are not run when Chrome delivers them (real time, possibly in the middle of an advance at a variable virtual time) but
// held; per observer and target only the latest entry is kept, and it is delivered only if its threshold bucket differs
// from the last one delivered to the page. Held entries are released at the start of every advance and right before the
// freeze, i.e. always at a fixed virtual time and from quiescent geometry. CAPY=7500,... captures only those y (other
// steps still freeze, without SETTLE, so the walk history matches a full walk). index.json is rewritten after every load.
// usage: node pageframes4.mjs <outdir> <label>=<url>...   env FY0=3200 FY1=5300 FSTEP=100 VW=430 VH=932 DPR=3 HOLDIO=1 CAPY=""

import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [outdir, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const E = (k, d) => Number(process.env[k] || d);
const FY0 = E('FY0', 3200), FY1 = E('FY1', 5300), FSTEP = E('FSTEP', 100), VW = E('VW', 430), VH = E('VH', 932), DPR = E('DPR', 3);
const VT = `(() => {
  const w = window, R = { st: w.setTimeout.bind(w), ct: w.clearTimeout.bind(w), si: w.setInterval.bind(w), ci: w.clearInterval.bind(w),
    raf: w.requestAnimationFrame.bind(w), caf: w.cancelAnimationFrame.bind(w), ric: w.requestIdleCallback ? w.requestIdleCallback.bind(w) : null,
    cic: w.cancelIdleCallback ? w.cancelIdleCallback.bind(w) : null, pnow: performance.now.bind(performance), Date: w.Date };
  const pend = new Map(); let seq = 1, virt = false, vnow = 0, pbase = 0; const EPOCH = Date.UTC(2026, 9, 2, 3, 0, 0);
  const q = new Map(); const raq = new Map();
  const vt = (w.__vt = { real: R, stats: { moved: 0, timers: 0, rafs: 0, max: 0 } });
  const add = (kind, cb, d, a) => { const id = seq++; const at = vnow + Math.max(0, Number(d) || 0); q.set(id, { kind, cb, d: Math.max(kind === 'iv' ? 1 : 0, Number(d) || 0), a, at, s: id }); return id; };
  w.setTimeout = function (cb, d, ...a) { if (typeof cb !== 'function') return R.st(cb, d, ...a);
    if (virt) return add('to', cb, d, a);
    const id = seq++; const rid = R.st(() => { pend.delete(id); cb(...a); }, d); pend.set(id, { kind: 'to', rid, cb, a, d: Number(d) || 0, due: R.pnow() + (Number(d) || 0) }); return id; };
  w.clearTimeout = function (id) { const p = pend.get(id); if (p) { pend.delete(id); return p.kind === 'iv' ? R.ci(p.rid) : R.ct(p.rid); } if (q.delete(id)) return; return R.ct(id); };
  w.setInterval = function (cb, d, ...a) { if (typeof cb !== 'function') return R.si(cb, d, ...a);
    if (virt) return add('iv', cb, d, a);
    const id = seq++; const e = { kind: 'iv', cb, a, d: Number(d) || 0, due: R.pnow() + (Number(d) || 0) }; e.rid = R.si(() => { e.due = R.pnow() + e.d; cb(...a); }, d); pend.set(id, e); return id; };
  w.clearInterval = w.clearTimeout;
  w.requestAnimationFrame = function (cb) { if (virt) { const id = seq++; raq.set(id, cb); return id; }
    const id = seq++; const rid = R.raf((t) => { pend.delete(id); cb(t); }); pend.set(id, { kind: 'raf', rid, cb }); return id; };
  w.cancelAnimationFrame = function (id) { const p = pend.get(id); if (p) { pend.delete(id); return R.caf(p.rid); } if (raq.delete(id)) return; return R.caf(id); };
  if (R.ric) { w.requestIdleCallback = function (cb, o) { if (virt) return add('ric', () => cb({ didTimeout: false, timeRemaining: () => 10 }), 50, []);
      const id = seq++; const rid = R.ric((dl) => { pend.delete(id); cb(dl); }, o); pend.set(id, { kind: 'ric', rid, cb, due: R.pnow() + 50 }); return id; };
    w.cancelIdleCallback = function (id) { const p = pend.get(id); if (p) { pend.delete(id); return R.cic(p.rid); } q.delete(id); }; }
  performance.now = function () { return virt ? pbase + vnow : R.pnow(); };
  class VD extends R.Date { constructor(...a) { if (a.length) super(...a); else super(virt ? EPOCH + vnow : R.Date.now()); } static now() { return virt ? EPOCH + vnow : R.Date.now(); } }
  w.Date = VD;
  const HOLD = ${E('HOLDIO', 1)}; const RIO = w.IntersectionObserver; const heldObs = new Set(); let ioSeq = 0; vt.io = { held: 0, delivered: 0, dropped: 0 };
  const bucket = (e, th) => (!e.isIntersecting ? -1 : th.filter((t) => e.intersectionRatio >= t).length);
  w.IntersectionObserver = class extends RIO { constructor(cb, o) { let self = null;
      super((es, ob) => { if (!self) self = ob;
        if (!virt || !HOLD) { for (const e of es) self.__seen.set(e.target, bucket(e, self.thresholds)); return cb(es, self); }
        for (const e of es) { self.__pend.set(e.target, e); vt.io.held++; } heldObs.add(self); }, o);
      self = this; this.__cb = cb; this.__pend = new Map(); this.__seen = new Map(); this.__seq = ioSeq++; } };
  const mc = new MessageChannel(); const waiters = []; mc.port1.onmessage = () => { const r = waiters.shift(); r && r(); };
  const yieldReal = () => new Promise((r) => { waiters.push(r); mc.port2.postMessage(0); });
  vt.flushIO = async () => { const obs = [...heldObs].sort((a, b) => a.__seq - b.__seq); heldObs.clear();
    for (const o of obs) { const out = []; for (const [t, e] of o.__pend) { const b = bucket(e, o.thresholds); if (o.__seen.get(t) !== b) { o.__seen.set(t, b); out.push(e); } else vt.io.dropped++; }
      o.__pend.clear(); if (out.length) { vt.io.delivered += out.length; try { o.__cb(out, o); } catch (e) {} await yieldReal(); } } };
  vt.start = () => { if (virt) return vt.stats; const now = R.pnow(); pbase = Math.ceil(now / 1000) * 1000; vnow = 0;
    for (const [id, p] of pend) {
      if (p.kind === 'raf') { R.caf(p.rid); raq.set(id, p.cb); }
      else { (p.kind === 'iv' ? R.ci : p.kind === 'ric' ? R.cic : R.ct)(p.rid); const rem = Math.ceil(Math.max(0, p.due - now) / 100) * 100;
        q.set(id, { kind: p.kind === 'ric' ? 'ric' : p.kind, cb: p.kind === 'ric' ? () => p.cb({ didTimeout: false, timeRemaining: () => 10 }) : p.cb, d: p.d || 0, a: p.a || [], at: rem, s: id }); }
      vt.stats.moved++; }
    pend.clear(); virt = true; return vt.stats; };
  vt.advance = async (ms) => { await vt.flushIO(); const end = vnow + ms; let n = 0;
    for (;;) { let nx = null; for (const e of q.values()) if (!nx || e.at < nx.at || (e.at === nx.at && e.s < nx.s)) nx = e;
      const frame = raq.size ? (Math.floor(vnow / 16) + 1) * 16 : Infinity;
      const tNext = Math.min(nx ? nx.at : Infinity, frame); if (tNext > end) break; vnow = Math.max(vnow, tNext);
      if (frame <= (nx ? nx.at : Infinity)) { const cbs = [...raq.values()]; raq.clear(); for (const cb of cbs) { try { cb(pbase + vnow); } catch (e) {} } vt.stats.rafs++; }
      else { if (nx.kind === 'iv') nx.at += nx.d; else q.delete(nx.s); try { nx.cb(...nx.a); } catch (e) {} vt.stats.timers++; }
      await yieldReal(); if (++n > 20000) { vt.stats.max++; break; } }
    vnow = end; return { vnow, q: q.size, raq: raq.size }; };
})();`;
const FREEZEF = (settle) => `(async () => { const R = window.__vt.real; await window.__vt.flushIO();
  for (const a of document.getAnimations()) { a.pause(); const ct = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming(); const delay = (a.effect && a.effect.getTiming && a.effect.getTiming().delay) || 0;
    a.currentTime = ct && isFinite(ct.activeDuration) ? delay + ct.activeDuration : 0; }
  let smil = 0; for (const sv of document.querySelectorAll('svg')) { if (sv.parentElement && sv.parentElement.closest('svg')) continue; if (sv.querySelector('animate, animateTransform, animateMotion, set')) { sv.pauseAnimations(); sv.setCurrentTime(0); smil++; } }
  window.__vt.smil = Math.max(window.__vt.smil || 0, smil);
  await Promise.all([...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((i) => Promise.race([i.decode().catch(() => {}), new Promise((r) => R.st(r, 1500))])));
  await new Promise((r) => R.raf(() => R.raf(r)));
  if (${settle}) { await new Promise((r) => R.st(r, ${settle}));
    for (const a of document.getAnimations()) { if (a.playState === 'paused') continue; a.pause(); const ct = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming(); const delay = (a.effect && a.effect.getTiming && a.effect.getTiming().delay) || 0;
      a.currentTime = ct && isFinite(ct.activeDuration) ? delay + ct.activeDuration : 0; window.__vt.late = (window.__vt.late || 0) + 1; }
    await new Promise((r) => R.raf(() => R.raf(r))); }
  return scrollY;
})()`;
const TITLES = `(() => [...document.querySelectorAll('.start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized')].map((t) => {
  const a = t.getAnimations().find((x) => x.animationName === 'start-selling-platform-i-doc-sweep'); const r = t.getBoundingClientRect();
  return [String(t.className).split(/\\s+/).find((c) => c.startsWith('start-selling-platform-row-title-')).slice(33), r.bottom > 0 && r.top < innerHeight && r.width > 0 ? 'vis' : 'off', t.hasAttribute('data-sweep-paused') ? 'sp' : '-', a ? a.playState : 'none']; }))()`;
const CAPY = process.env.CAPY ? process.env.CAPY.split(',').map(Number) : null;
const INJ = { PCp: '.start-selling-platform-profile-reviews-track { animation-play-state: paused !important; } #platform .start-selling-platform-rows { translate: 1px 0; }' };
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'scene-scope-vt4');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg(), ...(process.env.CHROMEARGS ? process.env.CHROMEARGS.split(' ') : [])] });
const cdp = await CDP.connect(ch.wsUrl);
const index = {};
process.on('SIGTERM', () => { try { writeFileSync(join(outdir, 'index.json'), JSON.stringify(index, null, 1)); } catch {} process.exit(143); });
try {
  for (const t of targets) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: VW < 800 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: VW < 800, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: VT });
    if (INJ[label]) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(INJ[label])}; document.head.appendChild(st); });` });
    await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
    if (/^W\d/.test(label)) { console.log(`${label}: warm-up load only`); await page.close(); continue; }
    const started = await page.eval(`window.__vt.start()`);
    await page.eval(`window.__vt.advance(2000)`);
    const frames = [];
    for (let y = FY0; y <= FY1; y += FSTEP) {
      await page.eval(`scrollTo({ top: ${y}, behavior: 'instant' })`); await sleep(200);
      await page.eval(`window.__vt.advance(300)`); await sleep(150);
      const adv = await page.eval(`window.__vt.advance(200)`); await sleep(100);
      const titles = await page.eval(TITLES);
      const spot = process.env.SPOT && y >= 4700 ? await page.eval(`(() => { const [x, py] = ${JSON.stringify(process.env.SPOT)}.split(',').map(Number); const out = [];
        for (const el of document.elementsFromPoint(x, py - scrollY).slice(0, 6)) { const cs = getComputedStyle(el); const c = (el.getAttribute('class') || '').trim().split(/\\s+/).filter((k) => !k.startsWith('svelte-')).slice(0, 2).join('.');
          out.push(el.tagName.toLowerCase() + (c ? '.' + c : '') + ' op=' + cs.opacity + ' f=' + cs.filter + ' tf=' + cs.transform + ' wc=' + cs.willChange + (el.getAttribute('data-fw-wc') !== null ? ' fwwc=' + el.getAttribute('data-fw-wc') : '') + (el.currentSrc ? ' src=' + el.currentSrc.split('/').pop() : '')
            + ' an=' + el.getAnimations().map((a) => (a.animationName || a.transitionProperty || 'waapi') + ':' + a.playState + '@' + Math.round(a.currentTime)).join(',')); }
        return out; })()`) : null;
      const cap = !CAPY || CAPY.includes(y);
      const sy = await page.eval(FREEZEF(cap ? E('SETTLE', 0) : 0));
      if (!cap) continue;
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = join(outdir, `${label}-y${y}.png`); writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ y, sy, file, adv, titles, spot });
    }
    const stats = await page.eval(`({ ...window.__vt.stats, smil: window.__vt.smil, late: window.__vt.late, io: window.__vt.io })`);
    index[label] = { url, vw: VW, started, stats, frames, walk: [] };
    console.log(`${label}: moved ${started.moved} timers ${stats.timers} rafs ${stats.rafs} capped ${stats.max} smil-svgs ${stats.smil} late-anims ${stats.late} io held ${stats.io.held} delivered ${stats.io.delivered} dropped ${stats.io.dropped} frames ${frames.length}`);
    writeFileSync(join(outdir, 'index.json'), JSON.stringify(index, null, 1));
    await page.close();
  }
} finally {
  writeFileSync(join(outdir, 'index.json'), JSON.stringify(index, null, 1));
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

// g0.0 Chrome pixel / DOM gates (no timing). Headless Chrome, one server per arm (own origin, https), served hashes
// checked per load (a mismatch is VOID). Run in the shared lane, one width per hold:
//   W=430x775 node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-revert -- \
//     node fixes/g0-revert/gates/g0px.mjs end out/g0/px v0 g0
//   W=430x775 ... g0px.mjs top out/g0/px v14 g0 v14
// Arms: v0 = baseline; v14 = out/g0/v14 (fixes/compositor-morph/v14/rebuild.sh); g0 = out/g0/<G0DIR, default g00-a>
// (fixes/g0-revert/rebuild.sh). The same arm named twice gets a second server (A/A).
// Phases:
//  end : the end-of-page seek harness. A preload script stubs performance.now and the rAF timestamp with a settable
//        clock (window.__g0clk.set(t)), so the original's tween (ZM over 680 ms from performance.now) sits at the value
//        of a chosen elapsed time while real time passes; each stop waits SETTLE ms of real time (the Join's 0.68 s / 0.44 s
//        transitions and the logo colour settle), then freezes (every document animation paused at currentTime 1000,
//        2 rAFs), screenshots and lets the running ones play on. Date.now is fixed on a whole second from load. The gesture is a synthetic wheel
//        event (deltaY +-120) at the page end: the original's jack path (A -> D -> E). Stops: closed rest, open t 0..680
//        step 40, open + held (a wheel and a scrollBy while open), close t 0..680, reversal (open to t 300, close from
//        there). Every stop records m (the nav's inline --morph), the nav's classes, scrollY, the panel's aria-hidden,
//        #platform's inline --morph-fade / pointer-events.
//  top : frozen frames at y stops from the top to #platform (POS, default 20 stops, walked down in one load), plus the
//        nav's classes and the Join button's computed box at each stop.
//  Both: console errors, exceptions, 'hydrat' messages per load; REDUCE=1 emulates prefers-reduced-motion: reduce.
// Diffs: every stop, every arm pair: pixels with any channel difference (T0 = 0), max channel diff, bbox (css px),
// inside the nav's rect, inside #platform's rect, elsewhere. Output <outdir>/<phase>-<W>[-reduce].json + PNGs of
// differing stops (A | B | diff x20).
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const WT = join(HERE, '..', '..', '..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { png, compare, sideBySide, serveArm } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));

const [phase, outdir, ...armNames] = process.argv.slice(2);
// arm names: v0, v14, g0, or dir:<out/g0 subdir> (a diagnostic build)
if (!['end', 'top'].includes(phase) || !outdir || armNames.length < 2) { console.error('usage: g0px.mjs end|top <outdir> <arm> <arm> [...]'); process.exit(1); }
const W = process.env.W || '430x775';
const [VW, VH] = W.split('x').map(Number);
const REDUCE = process.env.REDUCE === '1';
const SETTLE = Number(process.env.SETTLE || 900), STEP = Number(process.env.STEP || 40);
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const hashes = (f) => Object.fromEntries(readFileSync(f, 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const sha12 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
const G0DIR = join(WT, 'out/g0', process.env.G0DIR || 'g00-a');
const DEF = {
  v0: { dir: null, js: sha12(join(BASE, JS)), css: sha12(join(BASE, CSS)) },
  v14: { dir: join(WT, 'out/g0/v14'), ...(() => { const h = hashes(join(WT, 'fixes/compositor-morph/v14/HASHES')); return { js: h[JS], css: h[CSS] }; })() },
  g0: { dir: G0DIR, js: sha12(join(G0DIR, JS)), css: sha12(join(G0DIR, CSS)) },
};
// diagnostic arms (not deliverables): any out/g0/<dir> named on the command line as dir:<name>
for (const a of process.argv.slice(4)) if (a.startsWith('dir:')) { const d = join(WT, 'out/g0', a.slice(4)); DEF[a] = { dir: d, js: sha12(join(d, JS)), css: sha12(join(d, CSS)) }; }
const tag = `${phase}-${W}${REDUCE ? '-reduce' : ''}`;
mkdirSync(outdir, { recursive: true });
const T0 = Date.now();
// a whole second, later than any real time in this run: the countdowns' monotonic guards keep it, and both countdown
// codes (v0: Date.now; v14: T0 + whole seconds) show the same digits for it
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const PRELOAD = `(() => { const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); let fz = null, dz = null;
  performance.now = () => (fz === null ? rp() : fz);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(fz === null ? ts : fz));
  const rn = Date.now; Date.now = () => (dz === null ? rn() : dz);
  window.__g0clk = { set: (v) => { fz = v; }, get: () => fz, real: rp, date: (v) => { dz = v; } };
  window.__g0log = [];
  for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { try { window.__g0log.push(k + ': ' + a.map(String).join(' ').slice(0, 300)); } catch {} return o(...a); }; }
  window.addEventListener('error', (e) => window.__g0log.push('onerror: ' + (e.message || e.type)));
  window.addEventListener('unhandledrejection', (e) => window.__g0log.push('rejection: ' + String(e.reason).slice(0, 300)));
})();`;
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return [await h(${JSON.stringify(JS)}), await h(${JSON.stringify(CSS)})].join('/'); })()`;
const STATE = `(() => { const n = document.querySelector('header.start-selling-top-nav'), r = n ? n.getBoundingClientRect() : null,
  p = document.querySelector('.start-selling-platform'), pr = p ? p.getBoundingClientRect() : null,
  pn = document.querySelector('.start-selling-morph-panel'), b = document.querySelector('.start-selling-top-nav-btn.is-earn'),
  bs = b ? getComputedStyle(b) : null, a = document.querySelector('.start-selling-top-nav-actions'), br = b ? b.getBoundingClientRect() : null;
  return { y: Math.round(scrollY * 100) / 100, max: document.documentElement.scrollHeight - innerHeight, m: n ? n.style.getPropertyValue('--morph') : null,
    cls: n ? n.className.replace(/svelte-\\S+/g, '').replace(/\\s+/g, ' ').trim() : null,
    nav: r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null, plat: pr ? { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom } : null,
    fade: p ? p.style.getPropertyValue('--morph-fade') : null, pe: p ? p.style.pointerEvents : null, pfPaused: p ? p.hasAttribute('data-fw-pf-paused') : null,
    panel: pn ? { aria: pn.getAttribute('aria-hidden'), scene: pn.getAttribute('data-start-selling-scene'), inert: pn.inert } : null,
    join: bs ? { w: br.width, x: br.left, op: bs.opacity, f: bs.filter, tf: bs.transform, mw: bs.maxWidth } : null,
    gap: a ? getComputedStyle(a).columnGap : null, html: document.documentElement.className, dpr: devicePixelRatio,
    endEls: document.querySelectorAll('.fw-ms-end, [data-fw-cm], .fw-rv-glass, .fw-rv-dark').length,
    // kept-v14 areas outside g0.0's scope, for the masked counts: the countdowns (v14's countdown look) and #platform's
    // idle animations (PR-009 sweep bands and glints); 30 css px around each for blur spread
    mask: [...document.querySelectorAll('.waitlist-closing-countdown, .start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized, .start-selling-platform-secure-network-dash')]
      .map((e) => e.getBoundingClientRect()).filter((q) => q.width && q.bottom > 0 && q.top < innerHeight).map((q) => ({ l: q.left - 30, t: q.top - 30, r: q.right + 30, b: q.bottom + 30 })) }; })()`;
const FREEZE = `(async () => { window.__g0paused = [];
  for (const a of document.getAnimations()) { try { if (a.playState === 'running') { a.pause(); window.__g0paused.push(a); } if (a.playState === 'paused') a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()`;
const UNFREEZE = `(() => { for (const a of window.__g0paused || []) { try { a.play(); } catch (e) {} } window.__g0paused = []; return true; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 120 && Math.abs(scrollY - ${y}) > 1; i++) { const d = ${y} - scrollY; window.scrollBy(0, Math.sign(d) * Math.min(300, Math.abs(d)));
  await new Promise((r) => setTimeout(r, 90)); if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1 && d > 0) break; } return Math.round(scrollY); })()`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true, clientX: ${VW / 2}, clientY: ${VH / 2} }); (document.elementFromPoint(${VW / 2}, ${VH / 2}) || document.body).dispatchEvent(e); return e.defaultPrevented; })()`;

const res = { tool: 'fixes/g0-revert/gates/g0px.mjs', phase, viewport: W, reduce: REDUCE, settleMs: SETTLE, dateFrozen: DZ, arms: {}, loads: [], stops: {}, diffs: [] };
const save = () => writeFileSync(join(outdir, `${tag}.json`), JSON.stringify(res, null, 1));
const SRV = {};
const prof = tempProfileDir(join(WT, 'out', 'g0', 'chrome'), 'g0px');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, args: ['--ignore-certificate-errors', '--hide-scrollbars'] });
const cdp = await CDP.connect(ch.wsUrl);
const names = armNames.map((a, i) => (armNames.indexOf(a) < i ? a + '#2' : a));
try {
  for (const [i, a] of armNames.entries()) { SRV[names[i]] = await serveArm(names[i], DEF[a], BASE, join(outdir, 'serve')); res.arms[names[i]] = DEF[a]; }
  const shots = {}; // name -> [{stop, buf, st}]
  for (const [i, arm] of armNames.entries()) {
    const name = names[i], url = SRV[name].url;
    const page = await cdp.newIsolatedPage();
    const logs = [];
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 300));
      if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) logs.push('log ' + m.params.entry.level + ': ' + (m.params.entry.text || '').slice(0, 200) + ' ' + (m.params.entry.url || ''));
    });
    await page.send('Log.enable');
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    const mobile = VW <= 640;
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: mobile ? 3 : VW <= 860 ? 2 : 1, mobile });
    if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (REDUCE) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD });
    await gotoAndSettle(page, url);
    await page.eval(`window.__g0clk.date(${DZ})`);
    await sleep(2500);
    const served = await page.eval(HASH);
    if (served !== DEF[arm].js + '/' + DEF[arm].css) throw new Error(`VOID ${name}: served ${served}, pinned ${DEF[arm].js}/${DEF[arm].css}`);
    const list = (shots[name] = []);
    const shoot = async (stop) => {
      await page.eval(FREEZE);
      const st = await page.eval(STATE);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      await page.eval(UNFREEZE);
      list.push({ stop, buf: Buffer.from(data, 'base64'), st });
      (res.stops[name] ||= []).push({ stop, ...st });
      console.log(`${name} ${stop}: y ${st.y}/${st.max} m ${st.m} cls [${st.cls}] fade ${st.fade} join ${st.join ? `${st.join.w.toFixed(2)} op ${st.join.op} ${st.join.tf}` : '-'} gap ${st.gap} end-els ${st.endEls}`);
    };
    if (phase === 'top') {
      const H = await page.eval(`(() => { const p = document.querySelector('.start-selling-platform'); return { max: document.documentElement.scrollHeight - innerHeight, plat: p ? Math.round(p.getBoundingClientRect().top + scrollY) : null }; })()`);
      const POS = process.env.POS ? process.env.POS.split(',').map(Number) : Array.from({ length: 20 }, (_, k) => Math.round((k * (H.plat ?? H.max)) / 19));
      res.posList = POS;
      for (const y of POS) {
        await page.eval(walk(y)); await sleep(1500);
        await shoot(`y${y}`);
      }
    } else {
      await page.eval(walk(1e6)); await sleep(1500);
      await page.eval(walk(1e6)); await sleep(1200);
      const mounted = await page.eval(`!!document.querySelector('.start-selling-morph-panel')`);
      res.loads.push({ name, mountedBeforeOpen: mounted });
      // v14 on a touch viewport (morph-scroll, PR-018): the morph follows the scroll through the extra screen. Only its
      // two rests are shot (closed: the extra screen's top; open: the page end), for the masked (kept-v14) regions.
      const spacer = await page.eval(`(document.querySelector('.fw-ms-end') || {}).offsetHeight || 0`);
      if (spacer) {
        const max = await page.eval(`document.documentElement.scrollHeight - innerHeight`);
        await page.eval(`window.scrollTo({ top: ${max - spacer}, behavior: 'instant' })`); await sleep(1800);
        await shoot('closed-rest');
        await page.eval(`window.scrollTo({ top: ${max}, behavior: 'instant' })`); await sleep(1800);
        await shoot('open-done');
      } else {
      await shoot('closed-rest');
      const F = 1e7, step = async (stop, t) => { await page.eval(`window.__g0clk.set(${t})`); await sleep(SETTLE); await shoot(stop); };
      // open
      await page.eval(`window.__g0clk.set(${F})`);
      const pre = await page.eval(wheel(120));
      res.loads.push({ name, openPrevented: pre });
      for (let t = 0; t <= 680; t += STEP) await step(`open-${t}`, F + t);
      await step('open-done', F + 1000);
      // held: another push down, and a scroll attempt (the pin returns it)
      await page.eval(wheel(120));
      await page.eval(`window.scrollBy(0, 200)`); await sleep(300);
      await step('held', F + 1000);
      // close
      const G = 2e7;
      await page.eval(`window.__g0clk.set(${G})`);
      await page.eval(wheel(-120));
      for (let t = 0; t <= 680; t += STEP) await step(`close-${t}`, G + t);
      await step('closed', G + 1000);
      // reversal: open to 300 ms, close from there
      const H2 = 3e7;
      await page.eval(`window.__g0clk.set(${H2})`);
      await page.eval(wheel(120));
      await step('rev-open-300', H2 + 300);
      await page.eval(wheel(-120));
      for (let t = 40; t <= 680; t += 80) await step(`rev-close-${t}`, H2 + 300 + t);
      await step('rev-closed', H2 + 300 + 1000);
      }
    }
    const plog = await page.eval('window.__g0log || []');
    res.loads.push({ name, served, logs, pageLog: plog, hydrateMsgs: [...logs, ...plog].filter((l) => /hydrat/i.test(l)) });
    console.log(`${name}: ${logs.length} cdp log lines, ${plog.length} page log lines${logs.length + plog.length ? ': ' + [...logs, ...plog].slice(0, 6).join(' | ') : ''}`);
    await page.close();
  }
  // diffs: every pair of arms at every stop
  const inRect = (x, y, q, dpr) => q && x >= q.l * dpr && x < q.r * dpr && y >= q.t * dpr && y < q.b * dpr;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const A = shots[names[i]], B = shots[names[j]];
    for (const a of A) {
      const b = B.find((x) => x.stop === a.stop); if (!b) continue;
      const pa = png(a.buf), pb = png(b.buf), c = compare(pa, pb), dpr = a.st.dpr;
      let nav = 0, plat = 0, other = 0, masked = 0, outMax = 0, over8 = 0; const MK = [...(a.st.mask || []), ...(b.st.mask || [])];
      if (c.diff) for (let y = 0; y < pa.h; y++) for (let x = 0; x < pa.w; x++) {
        const p = (y * pa.w + x) * pa.bpp, q = (y * pb.w + x) * pb.bpp;
        if (pa.px[p] !== pb.px[q] || pa.px[p + 1] !== pb.px[q + 1] || pa.px[p + 2] !== pb.px[q + 2]) {
          if (MK.some((q) => inRect(x, y, q, dpr))) { masked++; continue; }
          const dd = Math.max(Math.abs(pa.px[p] - pb.px[q]), Math.abs(pa.px[p + 1] - pb.px[q + 1]), Math.abs(pa.px[p + 2] - pb.px[q + 2]));
          outMax = Math.max(outMax, dd); if (dd > 8) over8++;
          if (inRect(x, y, a.st.nav, dpr) || inRect(x, y, b.st.nav, dpr)) nav++; else if (inRect(x, y, a.st.plat, dpr) || inRect(x, y, b.st.plat, dpr)) plat++; else other++;
        }
      }
      const same = { m: a.st.m === b.st.m, cls: a.st.cls === b.st.cls, y: a.st.y === b.st.y, fade: a.st.fade === b.st.fade, aria: JSON.stringify(a.st.panel) === JSON.stringify(b.st.panel), join: JSON.stringify(a.st.join) === JSON.stringify(b.st.join), gap: a.st.gap === b.st.gap };
      const d = { pair: `${names[i]}~${names[j]}`, stop: a.stop, diff: c.diff, max: c.max, box: c.where ? [c.where.x0, c.where.y0, c.where.x1, c.where.y1].map((v) => Math.round(v / dpr)) : null, unmasked: nav + plat + other, unmaskedMax: outMax, unmaskedOver8: over8, over8Pct: Number(((100 * over8) / (pa.w * pa.h)).toFixed(4)), nav, plat, other, masked, same };
      res.diffs.push(d);
      const bad = Object.entries(same).filter(([, v]) => !v).map(([k]) => k);
      console.log(`DIFF ${d.pair} ${a.stop}: ${c.diff} px (max ${c.max}); outside the kept-v14 masks ${d.unmasked} px (max ${outMax}, >8: ${over8} = ${d.over8Pct} %; nav ${nav}, platform ${plat}, other ${other}), masked ${masked}; box ${JSON.stringify(d.box)}${bad.length ? ' STATE-DIFFERS ' + bad.join(',') : ''}`);
      if (c.diff) { mkdirSync(join(outdir, tag), { recursive: true }); writeFileSync(join(outdir, tag, `${d.pair.replace('~', '_vs_')}-${a.stop}.png`), sideBySide(pa, pb, 1, 20)); }
    }
  }
  save();
} finally { save(); cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} for (const s of Object.values(SRV)) s.proc.kill(); }
console.log(`G0PX DONE ${tag} ${Math.round((Date.now() - T0) / 1000)}s`);

// end-morph (fix-end-morph): why does the ported reveal (end-morph-p1) leave the "Join waitlist" label 1 css px off at
// m = 0 after a close (em-px2 dn0 stop)? Chrome headless, DOM state only, no timing, no screenshots. Per build (v9.2,
// P1): the em-px2 path (walk, synthetic held touch, stops up to m = 1 and back to 0), then at each of pre / dn0 the
// nav's actions, Join button, earn box and label: rects, computed translate / transform / clip-path / filter, inline
// styles, and every animation in the header with its state.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/gates/em-p1-dn0-probe.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUILDS = { v92: join(WT, 'fixes/end-morph/overlay'), p1: join(WT, 'fixes/end-morph-p1/overlay') };
const OUT = join(WT, 'out/end-morph'); mkdirSync(OUT, { recursive: true });
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const DUMP = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const q = (s) => h.querySelector(s);
  const ie = q('.start-selling-top-nav-actions'), oe = q('.start-selling-top-nav-btn.is-earn'), box = q('.start-selling-top-nav-earn-box'), wr = q('.start-selling-language-switch-wrap');
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 1000) / 1000); };
  const cs = (e) => { if (!e) return null; const s = getComputedStyle(e); return { translate: s.translate, transform: s.transform, clip: s.clipPath, filter: s.filter, opacity: s.opacity, inline: e.getAttribute('style') }; };
  let label = null; const tn = [...(box ? box.childNodes : [])].find((n) => n.nodeType === 3 && n.textContent.trim()) || (box && box.firstElementChild);
  if (tn) { const rg = document.createRange(); rg.selectNodeContents(tn); const b = rg.getBoundingClientRect(); label = [b.left, b.width].map((v) => Math.round(v * 1000) / 1000); }
  const anims = h.getAnimations({ subtree: true }).map((a) => ({ t: a.effect && a.effect.target ? (a.effect.target.className + '').replace(/svelte-\\w+/g, '').trim().slice(0, 40) : null, kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '', state: a.playState, ct: a.currentTime, dur: a.effect && a.effect.getTiming().duration }));
  return { y: Math.round(scrollY), cls: h.className.replace(/svelte-\\w+/g, '').trim(), hdrInline: h.getAttribute('style'), hdr: r(h), ie: r(ie), oe: r(oe), box: r(box), wr: r(wr), label, ieCs: cs(ie), oeCs: cs(oe), boxCs: cs(box), wrCs: cs(wr), earnW: ie && ie.style.getPropertyValue('--earn-w'), anims }; })())`;
const res = {};
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/end-morph/chrome'), 'emdn0'), headless: true, windowSize: '430,775' });
const cdp = await C.CDP.connect(chrome.wsUrl);
try {
  for (const [name, dir] of Object.entries(BUILDS)) {
    const st = join(OUT, `serve-dn0-${name}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await sleep(2500);
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`, { timeout: 90000 });
      const g = JSON.parse(await page.eval(`JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`));
      await page.eval(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      await page.eval(TOUCH);
      const out = (res[name] = {});
      const go = async (k, y, ms = 1300) => { await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(ms); out[k] = JSON.parse(await page.eval(DUMP)); };
      await go('pre', g.endStart - Math.round(g.ih / 2));
      for (const m of [0.02, 0.1, 0.19, 0.25, 0.5, 0.6, 0.95, 1]) await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + m * g.t)}, behavior: 'instant' }), 1)`), await sleep(400);
      await go('up1', g.max);
      await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + 0.5 * g.t)}, behavior: 'instant' }), 1)`); await sleep(400);
      await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + 0.1 * g.t)}, behavior: 'instant' }), 1)`); await sleep(400);
      await go('dn0', g.endStart);
      await go('dn0+3s', g.endStart, 3000);
      await page.close();
      for (const k of Object.keys(out)) console.log(name, k, JSON.stringify(out[k]).slice(0, 1400));
    } finally { p.kill(); rmSync(st, { force: true }); }
  }
} finally {
  const f = join(OUT, `p1-dn0-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1)); cdp.close(); await chrome.close(); console.log('WROTE', f);
}

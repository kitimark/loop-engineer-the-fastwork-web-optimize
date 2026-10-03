// B2 touch-coverage probe (review-f3-arm-scope; Chrome, shared lane, behaviour only, no timing verdicts).
// Once m > 0.5225 #platform is pointer-events:none, and the nav covers neither the lower part of the viewport
// mid-tween nor its 12 px side margins at m = 1. F3 (mw10e-arm-scope-c) has its touch listeners only on #platform
// and the nav, so a touch that starts there reaches no morph listener. Two cases per build (the reviewer's):
//   tween: at the end of the page, an up-swipe on #platform starts the morph; right after it (~200-250 ms into the
//          tween) a down-swipe from (215, 700);
//   edge:  the morph fully open (m = 1, 1.2 s after the up-swipe); a down-swipe from x = 6.
// Per case: what is under the finger, m at the down-swipe start and 1.5 s later (reversal = m back to 0),
// scrollY range from the down-swipe start (excursion against the pin), and per down-swipe touchmove
// [cancelable, defaultPrevented] from a passive window bubble listener (runs last).
// Desktop wheel (the lead's non-blocking item): desktop metrics, no touch, top of the page; the main thread is made
// busy for 400 ms and a mouseWheel is sent 50 ms into it; the CDP round trip of Input.dispatchMouseEvent is logged
// (OBSERVED proxy for "the wheel waits for the main thread": a blocking wheel listener holds the input ack).
// Builds: C aw1-10e, V F3 (-c), D (-d, window listeners while the morph is active). Mobile 430x932 DPR 1, touch.
// Run: node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//        node fixes/morph-webkit/touch-gap-check.mjs [C,V,D]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUT = join(WT, 'out/touch-gap-check'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const DSNAP = process.env.DSNAP || join(WT, 'fixes/mw10e-arm-scope-d/overlay');
const BUILDS = {
  C: [join(SNAP, 'aw1-10e-3e2f599a1632')],
  V: [join(SNAP, 'mw10e-arm-scope-c-c6d3590576a7'), join(SNAP, 'aw1-10e-3e2f599a1632')],
  D: [DSNAP, join(SNAP, 'aw1-10e-3e2f599a1632')],
};
const ORDER = (process.argv[2] || 'C,V,D').split(',');
const CASES = (process.argv[3] || 'tween,edge,pin').split(',');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const LOGGER = `(() => { const nav = document.querySelector('header.start-selling-top-nav');
  const L = window.__tg = { f: [], tm: [], on: true };
  const mv = () => +(nav.style.getPropertyValue('--morph') || 0);
  const tick = () => { L.f.push([Math.round(performance.now()), Math.round(mv() * 1000) / 1000, Math.round(scrollY)]); if (L.on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  addEventListener('touchmove', (e) => L.tm.push([Math.round(performance.now()), e.cancelable, e.defaultPrevented]), { passive: true });
  return 'ok'; })()`;
const MORPH = `+(document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') || 0)`;
const under = (x, y) => `(() => { const el = document.elementFromPoint(${x}, ${y}); return el ? (el.closest('.start-selling-platform') ? 'platform' : el.closest('header.start-selling-top-nav') ? 'nav' : (el.tagName + '.' + String(el.className).split(' ')[0])) : null; })()`;

async function swipe(page, x, y0, dy, moves = 12) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= moves; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + i * dy }] }); await sleep(16); }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { tool: 'fix-nav-morph touch-gap-check', startedAt: new Date().toISOString(), builds: {} };
try {
  for (const b of ORDER) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[b].join(','), '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
      const js = sha(readFileSync(join(BUILDS[b].find((d) => existsSync(join(d, NODE))), NODE))); // the overlay that serves the node file
      const out = { js, cases: {} };
      for (const kase of CASES) {
        const page = await cdp.newIsolatedPage();
        const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
        await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Page.bringToFront');
        await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
        await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 1200); }; requestAnimationFrame(step); })`, { timeout: 60000 });
        await page.eval(LOGGER);
        const y0 = Math.round(await page.eval('scrollY'));
        // up-swipe on #platform: starts the morph ('early': 3 moves, so the down-swipe lands early in the tween)
        await swipe(page, 215, 600, -20, /^early/.test(kase) ? 3 : 12);
        if (kase === 'pin') {
          // B1 (b): P-036's capped end in Chrome counts: 10 more up-pushes into the pin, then 3 s idle
          for (let i = 0; i < 10; i++) { await swipe(page, 215, 600, -20); await sleep(300); }
          await sleep(1000);
          await page.send('Performance.enable');
          const get = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
          const a = await get(); const n0 = await page.eval('__tg.f.length'); await sleep(3000); const b2 = await get(); const n1 = await page.eval('__tg.f.length');
          const L = JSON.parse(await page.eval('JSON.stringify(__tg)')); const fr = L.f.slice(n0, n1);
          const d = (k) => Math.round((b2[k] - a[k]) * 1000) / 1000;
          out.cases.pin = { y: Math.round(await page.eval('scrollY')), m: await page.eval(MORPH), idle3s: { rafFrames: fr.length, yRange: [Math.min(...fr.map((f) => f[2])), Math.max(...fr.map((f) => f[2]))],
            LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), ScriptDuration: d('ScriptDuration'), TaskDuration: d('TaskDuration'), LayoutDuration: d('LayoutDuration'), RecalcStyleDuration: d('RecalcStyleDuration') },
            pushes: L.tm.length, pushesPrevented: L.tm.filter((e) => e[2]).length, errors: errors.slice(0, 3) };
          await page.close(); continue;
        }
        if (kase === 'edge') await sleep(1200);
        const at = { x: kase === 'edge' ? 6 : 215, y: kase === 'edge' ? 400 : kase === 'earlylow' ? 880 : 700 };
        const t0 = await page.eval('Math.round(performance.now())');
        const m0 = await page.eval(MORPH);
        const target = await page.eval(under(at.x, at.y));
        const navBottom = await page.eval(`Math.round(document.querySelector('header.start-selling-top-nav').getBoundingClientRect().bottom)`);
        await swipe(page, at.x, at.y, 20); // down-swipe: asks the morph to close
        await sleep(1500);
        const L = JSON.parse(await page.eval('JSON.stringify(__tg)'));
        const after = L.f.filter((f) => f[0] >= t0);
        const tm = L.tm.filter((e) => e[0] >= t0);
        const ys = after.map((f) => f[2]); const ms = after.map((f) => f[1]);
        out.cases[kase] = { y0, under: target, navBottom, at, m0: Math.round(m0 * 1000) / 1000, mPeakAfter: Math.max(...ms), mEnd: ms[ms.length - 1],
          reversed: ms[ms.length - 1] < 0.01, yMin: Math.min(...ys), yMax: Math.max(...ys), yEnd: ys[ys.length - 1],
          touchmoves: tm.length, cancelable: tm.filter((e) => e[1]).length, prevented: tm.filter((e) => e[2]).length, errors: errors.slice(0, 3) };
        await page.close();
      }
      // desktop wheel: does a wheel at the top of the page wait for a busy main thread?
      {
        const page = await cdp.newIsolatedPage();
        await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await page.send('Page.bringToFront');
        await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
        const rt = [];
        for (let i = 0; i < 3; i++) {
          await page.eval(`(setTimeout(() => { const t = performance.now(); while (performance.now() - t < 400); }, 0), 0)`);
          await sleep(50);
          const t = performance.now();
          await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 100 });
          rt.push(Math.round(performance.now() - t));
          await sleep(800);
        }
        out.wheel = { atTop: true, scrollY: Math.round(await page.eval('scrollY')), ackMs: rt };
        await page.close();
      }
      res.builds[b] = out; console.log(b, JSON.stringify(out));
    } finally { proc.kill(); }
  }
  const f = join(OUT, `touch-gap-${res.startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
} finally { cdp.close(); await ch.close(); }

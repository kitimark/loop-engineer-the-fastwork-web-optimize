// logo-close (T-245): the Fastwork logo's on-screen x through the end-of-page open and close, per 120 Hz frame and at
// fine stops around the moment .is-morphing comes and goes. No timing: headless Chrome with g0px.mjs's settable clock
// (performance.now and the rAF timestamp), the original's tween (ZM, 680 ms, from the clock) seeked frame by frame.
// The gesture is g0px.mjs's synthetic wheel (+-120) at the page end. v14 on a touch viewport (morph-scroll) has no
// tween: its morph follows the scroll through the .fw-ms-end spacer, so it is stepped through the spacer instead.
// Arms: v0 (baseline), v14 (out/g0/v14), dir:<name> (out/g0/<name>, e.g. dir:g00c, dir:lcfix). Served hashes checked.
//   W=430x775 node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-logo-close -- \
//     node fixes/logo-close/probe/logo-path.mjs out/logo-close/path v0 dir:g00c dir:lcfix
// Output <outdir>/path-<W>[-reduce].json: per arm, per phase, frames [{t, m, mor, x, y, w, ox}] (x, y: the logo's
// border box left/top on screen in CSS px, after scale/translate), and per arm the flips (the frame pair where
// .is-morphing changes): dx at the 120 Hz frame, the largest |dx| of the 3 frames before/after, and the fine-stop jump.
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { serveArm } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));

const [outdir, ...armNames] = process.argv.slice(2);
if (!outdir || !armNames.length) { console.error('usage: logo-path.mjs <outdir> <arm> [...]'); process.exit(1); }
const W = process.env.W || '430x775';
const [VW, VH] = W.split('x').map(Number);
const REDUCE = process.env.REDUCE === '1';
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
const DEF = {};
for (const a of armNames) {
  const d = a === 'v0' ? null : join(WT, 'out/g0', a === 'v14' ? 'v14' : a.replace(/^dir:/, ''));
  DEF[a] = { dir: d, js: sha12(join(d || BASE, JS)), css: sha12(join(d || BASE, CSS)) };
}
const tag = `path-${W}${REDUCE ? '-reduce' : ''}`;
mkdirSync(outdir, { recursive: true });
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const PRELOAD = `(() => { const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); let fz = null, dz = null;
  performance.now = () => (fz === null ? rp() : fz);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(fz === null ? ts : fz));
  const rn = Date.now; Date.now = () => (dz === null ? rn() : dz);
  window.__g0clk = { set: (v) => { fz = v; }, date: (v) => { dz = v; } };
})();`;
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return [await h(${JSON.stringify(JS)}), await h(${JSON.stringify(CSS)})].join('/'); })()`;
const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;
const READ = `(() => { const n = document.querySelector('header.start-selling-top-nav'), l = document.querySelector('.start-selling-top-nav-logo'), r = l.getBoundingClientRect(), cs = getComputedStyle(l);
  return { m: Number(n.style.getPropertyValue('--morph') || 0), mor: n.classList.contains('is-morphing'), x: r.left, y: r.top, w: r.width, ox: cs.transformOrigin, nl: n.getBoundingClientRect().left, y0: Math.round(scrollY) }; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 120 && Math.abs(scrollY - ${y}) > 1; i++) { const d = ${y} - scrollY; window.scrollBy(0, Math.sign(d) * Math.min(300, Math.abs(d)));
  await new Promise((r) => setTimeout(r, 90)); if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1 && d > 0) break; } return Math.round(scrollY); })()`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true, clientX: ${VW / 2}, clientY: ${VH / 2} }); (document.elementFromPoint(${VW / 2}, ${VH / 2}) || document.body).dispatchEvent(e); return e.defaultPrevented; })()`;
const FR = 1000 / 120;
const frames120 = Array.from({ length: 85 }, (_, k) => k * FR); // 0 .. 700 ms
const OPEN_T = [...new Set([...frames120, 0.1, 0.2, 0.22, 0.25, 0.3, 0.5, 1, 2, 4].map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
const CLOSE_T = [...new Set([...frames120, ...Array.from({ length: 21 }, (_, k) => 602 + k), 611.5, 611.9, 612.1].map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
const isFrame = (t) => frames120.some((f) => Math.abs(f - t) < 1e-3);

function flips(fr) {
  const out = [];
  for (let i = 1; i < fr.length; i++) if (fr[i].mor !== fr[i - 1].mor) out.push(i);
  return out.map((i) => {
    const a = fr[i - 1], b = fr[i];
    // the 120 Hz frames around this flip
    const F = fr.filter((f) => f.frame), j = F.findIndex((f) => f.t >= b.t);
    const dx = (k) => (F[k] && F[k - 1] ? F[k].x - F[k - 1].x : null);
    const near = [j - 3, j - 2, j - 1, j + 1, j + 2, j + 3].map(dx).filter((v) => v !== null).map(Math.abs);
    return { fine: { tA: a.t, mA: a.m, morA: a.mor, xA: a.x, tB: b.t, mB: b.m, morB: b.mor, xB: b.x, jump: b.x - a.x },
      frame: j > 0 ? { t: F[j].t, m: F[j].m, x: F[j].x, prevT: F[j - 1].t, prevM: F[j - 1].m, prevX: F[j - 1].x, dx: dx(j) } : null, neighbourMaxAbsDx: near.length ? Math.max(...near) : null };
  });
}

const res = { tool: 'fixes/logo-close/probe/logo-path.mjs', viewport: W, reduce: REDUCE, arms: {}, runs: {} };
const save = () => writeFileSync(join(outdir, `${tag}.json`), JSON.stringify(res, null, 1));
const SRV = {};
const prof = tempProfileDir(join(WT, 'out', 'logo-close', 'chrome'), 'path');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, args: ['--ignore-certificate-errors', '--hide-scrollbars'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const a of armNames) { SRV[a] = await serveArm(a.replace(/[^\w]/g, '_'), DEF[a], BASE, join(outdir, 'serve')); res.arms[a] = DEF[a]; }
  for (const arm of armNames) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    const mobile = VW <= 640;
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: mobile ? 3 : VW <= 860 ? 2 : 1, mobile });
    if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (REDUCE) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD });
    await gotoAndSettle(page, SRV[arm].url);
    await page.eval(`window.__g0clk.date(${DZ})`);
    await sleep(2500);
    const served = await page.eval(HASH);
    if (served !== DEF[arm].js + '/' + DEF[arm].css) throw new Error(`VOID ${arm}: served ${served}, pinned ${DEF[arm].js}/${DEF[arm].css}`);
    await page.eval(walk(1e6)); await sleep(1500); await page.eval(walk(1e6)); await sleep(1200);
    const run = (res.runs[arm] = { served });
    const spacer = await page.eval(`(document.querySelector('.fw-ms-end') || {}).offsetHeight || 0`);
    if (spacer) {
      // v14 morph-scroll: the morph follows the scroll; step the spacer in 2 px steps down (open) and up (close)
      const max = await page.eval(`document.documentElement.scrollHeight - innerHeight`);
      for (const [ph, dir] of [['open', 1], ['close', -1]]) {
        const fr = (run[ph] = []);
        for (let k = 0; k <= spacer; k += 2) {
          const y = dir > 0 ? max - spacer + k : max - k;
          await page.eval(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await page.eval(RAF2); await page.eval(RAF2);
          fr.push({ t: k, frame: true, ...(await page.eval(READ)) });
        }
        await sleep(1500); fr.push({ t: 'rest', frame: false, ...(await page.eval(READ)) });
      }
      run.mode = 'scroll';
    } else {
      run.mode = 'tween';
      run.rest = await page.eval(READ);
      for (const [ph, T0, dy, TS] of [['open', 1e7, 120, OPEN_T], ['close', 2e7, -120, CLOSE_T]]) {
        await page.eval(`window.__g0clk.set(${T0})`); await page.eval(RAF2);
        run[ph + 'Prevented'] = await page.eval(wheel(dy));
        const fr = (run[ph] = []);
        for (const t of TS) { await page.eval(`window.__g0clk.set(${T0 + t})`); await page.eval(RAF2); fr.push({ t, frame: isFrame(t), ...(await page.eval(READ)) }); }
        await page.eval(`window.__g0clk.set(${T0 + 1000})`); await page.eval(RAF2); await sleep(900);
        fr.push({ t: 1000, frame: false, ...(await page.eval(READ)) });
      }
    }
    for (const ph of ['open', 'close']) {
      run[ph + 'Flips'] = flips(run[ph]);
      const F = run[ph].filter((f) => f.frame);
      run[ph + 'MaxAbsDx'] = Math.max(...F.slice(1).map((f, i) => Math.abs(f.x - F[i].x)));
      for (const fl of run[ph + 'Flips']) console.log(`${W}${REDUCE ? ' reduce' : ''} ${arm} ${ph} flip: fine m ${fl.fine.mA.toFixed(5)} -> ${fl.fine.mB.toFixed(5)}: x ${fl.fine.xA.toFixed(2)} -> ${fl.fine.xB.toFixed(2)} (jump ${fl.fine.jump.toFixed(2)} px); 120 Hz frame dx ${fl.frame ? fl.frame.dx.toFixed(2) : '-'} px, neighbours max |dx| ${fl.neighbourMaxAbsDx?.toFixed(2)}`);
      if (!run[ph + 'Flips'].length) console.log(`${W} ${arm} ${ph}: no is-morphing flip (mode ${run.mode})`);
    }
    await page.close();
    save();
  }
} finally { save(); cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} for (const s of Object.values(SRV)) s.proc.kill(); }
console.log(`LOGO-PATH DONE ${tag}`);

// best-build copy of wi-stack's local checka2.mjs (out/scene-scope/restack/ in its worktree): full-screen frozen frames
// of whole arms at a few scroll positions, every pair diffed (A/A within an arm, A/B across). Changes: the arms come from
// ./arms.mjs (each its own server, own origin; served JS/CSS hashes checked against the pin per load, a mismatch is
// VOID), output in <outdir>/page-frames.json, LOADS defaults to 1 (the A/A pair is N vs N2, two servers). Run:
//   POS=0,2620,4000,5346 node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 \
//     --owner wi-best-build -- node fixes/best-build/gates/page-frames.mjs out/best-build/page N V M N2
// Original header:
// wi-stack: st6-rb vs NB frozen-clock pixel rerun at the top and at y4000 (lead: n >= 3 loads per arm, NB vs NB A/A on
// the same clock; pass = st6-rb vs NB within NB vs NB's spread, and no differing pixels on the avatars).
// Headless Chrome, functional. Loads interleave the arms (NB S6 NB S6 NB S6). Per load and position: walk there, settle
// 1.5 s, then freeze: clear every timer and interval (stops the avatar rotator and the countdown ticking), pause every
// document animation at currentTime 1000 ms, two rAFs, screenshot; record the avatar imgs' rects, src and classes and the
// scene state. Diffs: every pair of loads (A/A within an arm, A/B across), % of pixels with any channel > 8, the share of
// differing pixels inside the avatar rects (union of both loads), the bounding box, and the 4 densest 100 css-px cells.
// usage: WIDTHS=430,1440 POS=0,4000 LOADS=3 node checka2.mjs <outdir> NB=<url> S6=<url>
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ARMDEF, BASE, NODE, CSS, makeSnapshots } from './arms.mjs';
import { serveArm, WT } from './lib.mjs';

makeSnapshots({ quiet: true });
const [outdir, ...armNames] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const SRV = {}; for (const a of armNames) SRV[a] = await serveArm(a, ARMDEF[a], BASE, join(outdir, 'serve'));
const arms = armNames.map((a) => [a, SRV[a].url]);
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return [await h(${JSON.stringify(NODE)}), await h(${JSON.stringify(CSS)})].join('/'); })()`;
const WIDTHS = (process.env.WIDTHS || '430').split(',').map(Number);
const POS = (process.env.POS || '0,4000').split(',').map(Number);
const LOADS = Number(process.env.LOADS || 1);
const T0 = Date.now();
const res = { tool: 'best-build copy of wi-stack checka2.mjs', arms: Object.fromEntries(armNames.map((a) => [a, [ARMDEF[a].js, ARMDEF[a].css]])), loads: [], diffs: [] };
const save = () => writeFileSync(join(outdir, 'page-frames.json'), JSON.stringify(res, null, 1));
const prof = tempProfileDir(join(WT, 'out', 'best-build', 'chrome'), 'bb-page');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const FREEZE = `(async () => { const hi = setTimeout(() => {}, 0); for (let i = 0; i <= hi + 1000; i++) { clearTimeout(i); clearInterval(i); }
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const p = document.querySelector('#people'), sc = p && p.closest('[data-start-selling-scene]');
  const av = [...document.querySelectorAll('.start-selling-avatars img')].map((e) => { const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, src: (e.currentSrc || e.src || '').split('/').pop().slice(0, 40), cls: e.className, wc: getComputedStyle(e).willChange }; });
  return { y: Math.round(scrollY), scene: sc ? sc.getAttribute('data-start-selling-scene') : null, dpr: devicePixelRatio, av }; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 80 && Math.abs(scrollY - ${y}) > 1; i++) { const d = ${y} - scrollY; window.scrollBy(0, Math.sign(d) * Math.min(250, Math.abs(d)));
  await new Promise((r) => setTimeout(r, 120)); if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1 && d > 0) break; } return Math.round(scrollY); })()`;
let dp;
async function diff(a, b, rects, dpr) {
  return dp.eval(`(async () => { const load = async (s) => { const r = await fetch('data:image/png;base64,' + s); return createImageBitmap(await r.blob()); };
    const a = await load(${JSON.stringify(a)}), b = await load(${JSON.stringify(b)});
    const W = Math.min(a.width, b.width), H = Math.min(a.height, b.height); const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, W, H).data; x.clearRect(0, 0, W, H); x.drawImage(b, 0, 0); const db = x.getImageData(0, 0, W, H).data;
    const R = ${JSON.stringify(rects)}.map((q) => [q.l * ${dpr} - 2, q.t * ${dpr} - 2, q.r * ${dpr} + 2, q.b * ${dpr} + 2]);
    const cell = 100 * ${dpr}, cells = new Map();
    let n = 0, nav = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0, p = 0; i < da.length; i += 4, p++) if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i+1] - db[i+1]) > 8 || Math.abs(da[i+2] - db[i+2]) > 8) {
      n++; const px = p % W, py = (p / W) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (R.some((q) => px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3])) nav++;
      const k = ((px / cell) | 0) + ',' + ((py / cell) | 0); cells.set(k, (cells.get(k) || 0) + 1); }
    const top = [...cells.entries()].sort((u, v) => v[1] - u[1]).slice(0, 4).map(([k, v]) => k + ':' + v);
    return { pct: Number((100 * n / (W * H)).toFixed(3)), n, nav, box: n ? [x0, y0, x1, y1].map((v) => Math.round(v / ${dpr})) : null, cells: top }; })()`);
}
try {
  dp = await cdp.newIsolatedPage();
  for (const width of WIDTHS) {
    const metrics = width === 430 ? { width: 430, height: 932, deviceScaleFactor: 3, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
    const shots = []; // {arm, load, pos, data, st}
    for (let L = 1; L <= LOADS; L++) for (const [arm, url] of arms) {
      const page = await cdp.newIsolatedPage();
      if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', metrics);
      if (metrics.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await gotoAndSettle(page, url);
      await sleep(2500);
      const served = await page.eval(HASH);
      if (served !== ARMDEF[arm].js + '/' + ARMDEF[arm].css) throw new Error(`VOID ${arm}${L}: served ${served}, pinned ${ARMDEF[arm].js}/${ARMDEF[arm].css}`);
      for (const pos of POS) {
        // a frozen page cannot be walked (timers cleared): reload for every position after the first
        if (pos !== POS[0]) { await gotoAndSettle(page, url); await sleep(2500); }
        await page.eval(walk(pos)); await sleep(1500);
        const st = await page.eval(FREEZE);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        shots.push({ arm, L, pos, data, st });
        res.loads.push({ width, arm, L, pos, y: st.y, scene: st.scene, av: st.av.map((a) => `${a.src}|${a.cls}|${a.wc}`).join(' ; ') });
        console.log(`${width} ${arm}${L} pos${pos}: y${st.y} scene ${st.scene} avatars ${st.av.length} wc ${[...new Set(st.av.map((a) => a.wc))].join('/')} @${Math.round((Date.now() - T0) / 1000)}s`);
      }
      await page.close();
    }
    for (const pos of POS) {
      const S = shots.filter((s) => s.pos === pos);
      for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
        const a = S[i], b = S[j];
        const kind = a.arm === b.arm ? `AA-${a.arm}` : 'AB';
        const d = await diff(a.data, b.data, [...a.st.av, ...b.st.av], a.st.dpr);
        const sameAv = res.loads.find((x) => x.width === width && x.arm === a.arm && x.L === a.L && x.pos === pos)?.av === res.loads.find((x) => x.width === width && x.arm === b.arm && x.L === b.L && x.pos === pos)?.av;
        res.diffs.push({ width, pos, kind, a: `${a.arm}${a.L}`, b: `${b.arm}${b.L}`, sameAvatarState: sameAv, ...d });
        console.log(`DIFF ${width} pos${pos} ${kind} ${a.arm}${a.L}~${b.arm}${b.L}: ${d.pct} % (n ${d.n}, on avatars ${d.nav}) box ${JSON.stringify(d.box)} cells ${d.cells.join(' ')} sameAvatarState ${sameAv}`);
      }
    }
    save();
  }
  await dp.close();
} finally { save(); cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} for (const s of Object.values(SRV)) s.proc.kill(); }
console.log(`PAGE-FRAMES DONE ${Math.round((Date.now() - T0) / 1000)}s`);

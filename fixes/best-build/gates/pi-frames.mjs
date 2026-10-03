// best-build copy of platform-idle's local probe9.mjs (out/platform-idle/probe9.mjs in its worktree, review round 1):
// the same sweep / glint / reduced-motion frozen frames per viewport, with the arms of ./arms.mjs and its own servers:
//   N = the best build, V = platform-idle's own build, P = V from a second server (own origin; the load-to-load A/A
//   floor), C = st6-rb2. N must sit at the V~P floor (N~V vs P~V) and N~C must repeat platform-idle's N~C (PR-009).
// Every arm's served JS and CSS hashes are checked against the pin before any frame. Run (shared lane, about 70-90 s
// per viewport):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner wi-best-build -- \
//     node fixes/best-build/gates/pi-frames.mjs out/best-build/pi m430 d1440
// Original header (O there = V-old, here V):
// platform-idle probe 9 (review item 3): three served arms, N = V-new (@supports wrap), O = V-old (no wrap), C = st6-rb2.
// Frozen frames of the 4 sweep titles (7 phases) and both glints (11 phases each), reduced motion; N is compared
// against O (must stay within P~O, P = a second load of O, the load-to-load floor) and against C (the PR-009 tolerances). Records CSS.supports('-webkit-mask-clip','text'),
// title line counts, served CSS hash per arm. Writes <out>/probe9-<vp>.json after each viewport. No timing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, openPage, png, compare, shot, serveArm } from './lib.mjs';
import { ARMDEF, BASE, makeSnapshots } from './arms.mjs';
makeSnapshots({ quiet: true });
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const DEF = { N: ARMDEF.N, V: ARMDEF.V, P: ARMDEF.V2, C: ARMDEF.C };
const SRV = {}; for (const a of Object.keys(DEF)) SRV[a] = await serveArm(a, DEF[a], BASE, join(OUT, 'serve'));
const U = Object.fromEntries(Object.entries(SRV).map(([a, s]) => [a, s.url]));
const ALL = { m430: { width: 430, height: 932, dpr: 3, mobile: true }, m390: { width: 390, height: 844, dpr: 3, mobile: true }, d1440: { width: 1440, height: 900, dpr: 2, mobile: false }, d1000: { width: 1000, height: 800, dpr: 2, mobile: false },
  m375: { width: 375, height: 812, dpr: 3, mobile: true }, t1024: { width: 1024, height: 1366, dpr: 2, mobile: true }, d861: { width: 861, height: 800, dpr: 2, mobile: false }, d1440x1: { width: 1440, height: 900, dpr: 1, mobile: false }, m430x2: { width: 430, height: 932, dpr: 2, mobile: true },
  m320: { width: 320, height: 640, dpr: 2, mobile: true } };
const VPN = process.argv.slice(3);
const SEL = '.start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized';
const DASH = '.start-selling-platform-secure-network-dash';
const SWT = [250, 1000, 1500, 2000, 2500, 3000, 3750];
const GLT = { 0: [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 2, 3.25, 3.5, 3.75], 1: [1.1, 1.25, 1.4, 1.5, 1.6, 1.75, 2.25, 2.5, 2.75, 3, 4.5] };
const ARMS = ['N', 'V', 'P', 'C'];
const raf2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`;
const FREEZE = `(() => { for (const a of document.getAnimations()) a.pause(); for (const s of document.querySelectorAll('svg')) { try { s.pauseAnimations(); } catch {} } return document.getAnimations().length; })()`;
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return [await h('_app/immutable/nodes/2.DyWL8TcE.js'), await h('_app/immutable/assets/2.gBuqKVzi.css')].join('/'); })()`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/best-build/chrome'), 'bb-pi'), headless: true, windowSize: '1440,900', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const load = async (vp, url, reduce = false) => {
  const page = await openPage(cdp, { ...vp, reduce }); const log = [];
  page.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) log.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    if (m.method === 'Runtime.exceptionThrown') log.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  });
  await page.send('Runtime.enable');
  await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(1500);
  return { page, log };
};
const cmp = (set, x, y) => { let max = 0, px = 0; const per = []; for (const k of Object.keys(set[x])) { const c = compare(png(set[x][k]), png(set[y][k])); if (c.sizeMismatch) { per.push(`${k}:size${c.sizeMismatch}`); max = 999; continue; } max = Math.max(max, c.max); px += c.diff; if (c.diff) per.push(`${k}:${c.diff}/${c.max}`); } return { max, diffPx: px, n: Object.keys(set[x]).length, per }; };
try {
  for (const vn of VPN) {
    const vp = ALL[vn]; const R = { vp: vn, ...vp, urls: U, sweep: {}, glint: {}, arms: {} };
    const P = {}; for (const arm of ARMS) P[arm] = await load(vp, U[arm]);
    for (const arm of ARMS) R.arms[arm] = { served: await P[arm].page.eval(HASH), supportsMaskClipText: await P[arm].page.eval(`CSS.supports('-webkit-mask-clip', 'text')`),
      titleAfter: await P[arm].page.eval(`[...document.querySelectorAll(${JSON.stringify(SEL)})].map((e) => getComputedStyle(e, '::after').content + '|' + getComputedStyle(e).webkitMaskClip)`) };
    for (const arm of ARMS) if (R.arms[arm].served !== DEF[arm].js + '/' + DEF[arm].css) throw new Error(`VOID ${arm}: served ${R.arms[arm].served}, pinned ${DEF[arm].js}/${DEF[arm].css}`);
    // ---- sweep ----
    const sw = { N: {}, V: {}, P: {}, C: {} };
    for (const arm of ARMS) {
      const { page } = P[arm];
      for (let i = 0; i < 4; i++) {
        await page.eval(`document.querySelectorAll(${JSON.stringify(SEL)})[${i}].scrollIntoView({ block: 'center', behavior: 'instant' })`);
        await sleep(500); await page.eval(FREEZE);
        for (const t of SWT) {
          const r = await page.eval(`(() => { const e = document.querySelectorAll(${JSON.stringify(SEL)})[${i}];
            const an = document.getAnimations().filter((x) => x.effect && x.effect.target === e && /sweep/.test(x.animationName || ''));
            for (const x of an) { x.pause(); x.currentTime = ${t}; }
            const b = e.getBoundingClientRect(); return { n: an.map((x) => x.animationName + (x.effect.pseudoElement || '')), b: [b.left + scrollX, b.top + scrollY, b.width, b.height], lines: e.getClientRects().length }; })()`);
          await page.eval(raf2); await sleep(50);
          const [x, y, w, h] = r.b; const clip = { x: Math.floor(x) - 4, y: Math.floor(y) - 4, width: Math.ceil(w) + 8, height: Math.ceil(h) + 8 };
          const buf = await shot(page, clip); sw[arm][`${i}@${t}`] = buf; if (t === 2000) writeFileSync(join(OUT, `${vn}-sweep-${arm}-${i}.png`), buf);
          if (t === SWT[0]) (R.sweep['anims' + arm] ||= []).push({ i, n: r.n, lines: r.lines, box: r.b.map(Math.round) });
        }
      }
    }
    R.sweep.NvsV = cmp(sw, 'N', 'V'); R.sweep.PvsV = cmp(sw, 'P', 'V'); R.sweep.NvsP = cmp(sw, 'N', 'P'); R.sweep.NvsC = cmp(sw, 'N', 'C');
    console.log(vn, 'sweep N~V', R.sweep.NvsV.max, R.sweep.NvsV.diffPx, 'P~V', R.sweep.PvsV.max, R.sweep.PvsV.diffPx, 'N~P', R.sweep.NvsP.max, R.sweep.NvsP.diffPx, 'N~C', R.sweep.NvsC.max, R.sweep.NvsC.diffPx, 'lines', JSON.stringify(R.sweep.animsN.map((q) => q.lines)), JSON.stringify(R.arms));
    // ---- glint ----
    const gl = { N: {}, V: {}, P: {}, C: {} };
    for (const arm of ARMS) {
      const { page } = P[arm];
      await page.eval(`(() => { for (const a of document.getAnimations()) a.play(); for (const s of document.querySelectorAll('svg')) { try { s.unpauseAnimations(); } catch {} } document.querySelector('${DASH}').scrollIntoView({ block: 'center', behavior: 'instant' }); return 0; })()`);
      await sleep(2800);
      const st = await page.eval(`[...document.querySelectorAll('${DASH}')].map((d) => { const a = d.querySelector('animate'); let s = null; try { s = a && a.getStartTime(); } catch {} return { s, animate: d.querySelectorAll('animate').length, glint: d.querySelectorAll('.start-selling-platform-secure-network-dash-glint.is-active').length }; })`);
      R.glint['state' + arm] = st;
      await page.eval(FREEZE);
      for (const j of [0, 1]) for (const tau of GLT[j]) {
        const r = await page.eval(`(() => { const d = document.querySelectorAll('${DASH}')[${j}]; const svg = d.querySelector('svg'); const st = ${JSON.stringify(st.map((q) => q.s))};
          if (st[${j}] != null) { svg.pauseAnimations(); svg.setCurrentTime(st[${j}] + ${tau}); }
          for (const x of document.getAnimations().filter((x) => x.effect && x.effect.target && d.contains(x.effect.target) && /glint/.test(x.animationName || ''))) { x.pause(); x.currentTime = ${tau * 1000}; }
          const b = d.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; })()`);
        await page.eval(raf2); await sleep(50);
        const [x, y, w, h] = r; const clip = { x: Math.floor(x) - 3, y: Math.floor(y) - 3, width: Math.ceil(w) + 6, height: Math.ceil(h) + 6 };
        gl[arm][`${j}@${tau}`] = await shot(page, clip);
      }
    }
    R.glint.NvsV = cmp(gl, 'N', 'V'); R.glint.PvsV = cmp(gl, 'P', 'V'); R.glint.NvsP = cmp(gl, 'N', 'P'); R.glint.NvsC = cmp(gl, 'N', 'C');
    console.log(vn, 'glint N~V', R.glint.NvsV.max, R.glint.NvsV.diffPx, 'P~V', R.glint.PvsV.max, R.glint.PvsV.diffPx, 'N~P', R.glint.NvsP.max, R.glint.NvsP.diffPx, 'N~C', R.glint.NvsC.max, R.glint.NvsC.diffPx);
    R.console = Object.fromEntries(ARMS.map((a) => [a, P[a].log]));
    for (const arm of ARMS) await P[arm].page.close();
    // ---- reduced motion: titles + dashes ----
    const red = { N: {}, V: {}, P: {}, C: {} }; const RL = {};
    for (const arm of ARMS) {
      const { page, log } = await load(vp, U[arm], true); RL[arm] = log;
      for (let i = 0; i < 4; i++) {
        const r = await page.eval(`(async () => { const e = document.querySelectorAll(${JSON.stringify(SEL)})[${i}]; e.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise((r) => setTimeout(r, 300)); const b = e.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; })()`);
        await page.eval(raf2);
        const [x, y, w, h] = r; red[arm]['t' + i] = await shot(page, { x: Math.floor(x) - 4, y: Math.floor(y) - 4, width: Math.ceil(w) + 8, height: Math.ceil(h) + 8 });
      }
      const r = await page.eval(`(async () => { const d = document.querySelector('${DASH}'); d.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise((r) => setTimeout(r, 2800)); const b = d.parentElement.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; })()`);
      await page.eval(raf2);
      red[arm].dash = await shot(page, { x: Math.floor(r[0]), y: Math.floor(r[1]), width: Math.ceil(r[2]), height: Math.ceil(r[3]) });
      await page.close();
    }
    R.reduce = { NvsV: cmp(red, 'N', 'V'), PvsV: cmp(red, 'P', 'V'), NvsP: cmp(red, 'N', 'P'), NvsC: cmp(red, 'N', 'C') }; R.reduceConsole = RL;
    console.log(vn, 'reduce N~V', R.reduce.NvsV.max, R.reduce.NvsV.per.join(' '), 'P~V', R.reduce.PvsV.max, R.reduce.PvsV.per.join(' '), 'N~P', R.reduce.NvsP.max, 'N~C', R.reduce.NvsC.max, 'console', JSON.stringify(R.console), JSON.stringify(RL));
    writeFileSync(join(OUT, `pi-frames-${vn}.json`), JSON.stringify(R, null, 1));
  }
} finally { cdp.close(); await chrome.close(); for (const s of Object.values(SRV)) s.proc.kill(); }

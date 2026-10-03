// Hero accent word cycle across widths (de-breakpoints, T-034). Functional, headless, shared lane; no timing verdict.
// usage: node research/breakpoints/probe-accent.mjs <config[,config...]> <seconds> B=<url> S=<url> [B2=<url>]
// At the top of the page, samples every rAF for <seconds>: the accent's word, its laid-out width, and the x of each
// title word beside it. Per word change it reports the accent width before/after and, per side, the largest
// distance any neighbour was from the straight line between its rest positions (the "wiggle"): a width transition
// (baseline) and st6-rb2's HEflip (width at once + a transform slide of the neighbours) should both keep that near
// 0 at every width; a slide whose distance does not match the real width change shows up as a large wiggle.
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cnames, secArg, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const SEC = Number(secArg || 10);
const SAMPLE = `(async (ms) => { const acc = document.querySelector('.hero-title .script-accent') || document.querySelector('.script-accent');
  if (!acc) return { err: 'no accent' }; const row = acc.parentElement, kids = [...row.children];
  const ai = kids.indexOf(acc), out = []; const t0 = performance.now();
  const word = () => (acc.getAttribute('aria-label') || acc.textContent || '').trim().slice(0, 24);
  await new Promise((res) => { const f = () => { const r = acc.getBoundingClientRect();
    out.push([Math.round(performance.now() - t0), Math.round(r.width * 100) / 100, word(), kids.map((k) => Math.round(k.getBoundingClientRect().left * 100) / 100),
      kids.map((k) => k.getAnimations().filter((a) => a.playState === 'running').length).reduce((a, b) => a + b, 0), acc.className.replace(/svelte-[a-z0-9]+/g, '').trim()]);
    if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const cs = getComputedStyle(acc);
  return { ai, n: kids.length, fs: getComputedStyle(row).fontSize, flex: cs.flex, cssW: cs.width, out }; })`;

function analyse(s) {
  const o = s.out, ev = [];
  // segments: a change starts where the accent width (or word) changes after >= 300 ms of rest
  let i = 0;
  while (i < o.length) {
    const j = o.findIndex((r, k) => k > i && (r[1] !== o[i][1] || r[2] !== o[i][2] || r[4] > 0));
    if (j < 0) break;
    let k = j; while (k + 1 < o.length && (o[k + 1][0] - o[k][0] < 300 && (o[k + 1][1] !== o[k][1] || o[k + 1][4] > 0 || o[k][4] > 0) || o[k + 1][0] - o[j][0] < 1000)) k++;
    const a = o[j - 1], b = o[k];
    let wig = 0;
    for (let q = j; q <= k; q++) for (let m = 0; m < s.n; m++) {
      if (m === s.ai) continue;
      // a neighbour should sit between its rest positions (monotone move); excess outside [min,max] = wiggle
      const lo = Math.min(a[3][m], b[3][m]), hi = Math.max(a[3][m], b[3][m]), x = o[q][3][m];
      wig = Math.max(wig, x < lo ? lo - x : x > hi ? x - hi : 0);
    }
    const moved = Math.max(...a[3].map((x, m) => (m === s.ai ? 0 : Math.abs(b[3][m] - x))));
    ev.push({ t: a[0], w: `${a[1]}->${b[1]}`, word: `${a[2]}->${b[2]}`, moved: Math.round(moved * 100) / 100, wiggle: Math.round(wig * 100) / 100, anims: Math.max(...o.slice(j, k + 1).map((r) => r[4])) });
    i = k + 1;
  }
  return ev;
}

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-accent');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const cname of cnames.split(',')) {
    const CFG = CONFIGS[cname];
    for (const arm of Object.keys(URLS)) {
      const page = await cdp.newIsolatedPage();
      const errs = [];
      page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0].slice(0, 160)); });
      if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch, ...(CFG.screenWidth ? { screenWidth: CFG.screenWidth, screenHeight: CFG.screenHeight } : {}) });
      if (CFG.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await gotoAndSettle(page, URLS[arm]); await sleep(2500);
      const s = await page.eval(`${SAMPLE}(${SEC * 1000})`, { awaitPromise: true });
      if (s.err) { console.log(`ACCENT ${cname}/${arm} ${s.err}`); await page.close(); continue; }
      const ev = analyse(s);
      const widths = [...new Set(s.out.map((r) => r[1]))];
      console.log(`ACCENT ${cname}/${arm} fs ${s.fs} flex '${s.flex}' accent ${s.ai}/${s.n} frames ${s.out.length} widths ${widths.length} [${widths.slice(0, 6).join(',')}] changes ${ev.length} errs ${errs.length}`);
      for (const e of ev) console.log(`   t${e.t} w ${e.w} moved ${e.moved}px wiggle ${e.wiggle}px anims ${e.anims} ${e.word}`);
      await page.close();
    }
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

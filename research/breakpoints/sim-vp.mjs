#!/usr/bin/env node
// WebKit's wide (> 600 CSS px) layout on the shared fw-sim without rotating it (de-breakpoints, T-034; lead's option b).
// Every arm is served with the same TEST-ONLY overlay on top (fixes/bp-vp980: index.html's viewport meta
// "width=980"; scaffolding, never a shipped change), so Safari lays the page out 980 CSS px wide on the portrait
// device: (width > 600px) matches, device-width stays 430 (the 860-combo still matches, as in phone landscape) and
// GestureEvent exists. Counts and frozen frames only, no timing. Freeze method after fix-hero-exit-threaded's
// frzshot.mjs: clear every timer, finish finite / pause infinite document-timeline animations; scroll-driven ones
// are static at a fixed scroll position. Shots: simctl io <udid> screenshot (the Simulator's framebuffer).
//   node tools/sim.mjs session --functional --owner <o> -- node research/breakpoints/sim-vp.mjs --arms C=url,V=url,C2=url --out dir
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { openTab, sleep } from '../../tools/lib/wip.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const arms = arg('--arms', '').split(',').filter(Boolean).map((s) => { const [k, ...u] = s.split('='); return { k, url: u.join('=') }; });
const OUT = resolve(arg('--out', 'out/breakpoints/simvp')); mkdirSync(OUT, { recursive: true });
const YS = arg('--ys', '0,150,300,500,800,1400').split(',').map(Number);
const UDID = process.env.FW_SIM_UDID || 'booted';
const FREEZE = `(() => { const top = setTimeout(() => {}, 0); for (let i = 1; i <= top + 50; i++) { clearTimeout(i); clearInterval(i); }
  let n = 0; for (const a of document.getAnimations()) { if (a.timeline !== document.timeline) continue;
    const it = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().iterations : 1;
    try { if (it === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); n++; } catch (e) { try { a.pause(); a.currentTime = 0; n++; } catch {} } } return n; })()`;
const STATE = `JSON.stringify((() => { const tr = document.querySelector('.hero-track'), cp = document.querySelector('.hero-copy'), cs = cp && getComputedStyle(cp);
  return { y: Math.round(scrollY), iw: innerWidth, vv: visualViewport ? Math.round(visualViewport.width) : null, dpr: devicePixelRatio,
    w600: matchMedia('(width > 600px)').matches, combo860: matchMedia('(max-width: 860px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)').matches,
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, ge: 'GestureEvent' in window,
    hero: tr ? [...tr.classList].filter((c) => !c.startsWith('svelte-')).join(' ') : null, bob: !!document.querySelector('.he-bob'),
    copy: cs ? { o: cs.opacity, t: cs.transform.slice(0, 50) } : null,
    anims: document.getAnimations().filter((a) => a.playState === 'running').length,
    sda: document.getAnimations().filter((a) => a.timeline && a.timeline !== document.timeline).length }; })())`;
function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function cmp(fa, fb, n = 16) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb)); if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: true };
  const bands = Array(n).fill(0); let tot = 0, big = 0, max = 0, box = [1e9, 1e9, -1, -1];
  for (let i = 0, p = 0; i < A.px.length; i += A.bpp, p++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (d > 8) { tot++; if (d > 48) big++; if (d > max) max = d; const y = Math.floor(p / A.w), x = p % A.w; bands[Math.floor((y / A.h) * n)]++; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; } }
  return { pct: +((100 * tot) / (A.w * A.h)).toFixed(3), n: tot, big, max, box: tot ? box : null, bands };
}
const shot = (f) => { const s = spawnSync('xcrun', ['simctl', 'io', UDID, 'screenshot', f], { encoding: 'utf8' }); return s.status === 0 ? f : null; };
const res = { tool: 'research/breakpoints/sim-vp.mjs', at: new Date().toISOString(), ys: YS, arms: {}, diffs: {} };
for (const arm of arms) {
  const R = { shots: {}, state: {} };
  res.arms[arm.k] = R;
  const o = spawnSync('node', ['tools/sim.mjs', 'open', arm.url], { encoding: 'utf8' });
  if (o.status !== 0) { R.error = 'open failed: ' + (o.stderr || o.stdout).split('\n').slice(-3).join(' '); console.log(arm.k, R.error); continue; }
  let c;
  try {
    c = await openTab((u) => String(u || '').includes(new URL(arm.url).host));
    for (let i = 0; i < 40; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    await sleep(8000);
    R.state.load = JSON.parse(await c.evaluate(STATE));
    R.frozen = await c.evaluate(FREEZE); await sleep(800);
    for (const y of YS) {
      await c.evaluate(`window.scrollTo({ top: ${y}, behavior: 'instant' }); 'ok'`); await sleep(1600);
      R.state[y] = JSON.parse(await c.evaluate(STATE));
      R.shots[y] = shot(join(OUT, `${arm.k}-y${y}.png`));
      console.log(`SIMVP ${arm.k} y${y} ${JSON.stringify(R.state[y])}`);
    }
    await c.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }); 'ok'`);
  } catch (e) { R.error = String((e && e.message) || e); console.log(arm.k, 'ERROR', R.error); }
  try { c && c.close(); } catch {}
}
for (const y of YS) for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
  const a = arms[i].k, b = arms[j].k, fa = res.arms[a]?.shots?.[y], fb = res.arms[b]?.shots?.[y];
  if (!fa || !fb) continue;
  const d = cmp(fa, fb); (res.diffs[`${b}~${a}`] ||= {})[y] = d;
  console.log(`SIMDIFF y${y} ${b}~${a}: ${d.pct}% n ${d.n} big ${d.big} max ${d.max} box ${JSON.stringify(d.box)} bands ${JSON.stringify(d.bands)}`);
}
writeFileSync(join(OUT, 'sim-vp.json'), JSON.stringify(res, null, 1));
console.log('->', join(OUT, 'sim-vp.json'));

#!/usr/bin/env node
// morph-scroll, WebKit (fw-sim): why B's #platform draws 1 device px higher than A's at m = 0 (simcheck k0), while
// m = 0.25 is exact. B at y0 + d for small d, with the sticky top as built and nudged by +-1/64 px; A at the page end.
// Records #platform's rect (full precision) and diffs every B shot against A's. Functional session, no timing.
//   node tools/sim.mjs session --functional --owner <o> -- node fixes/morph-scroll/simk0.mjs --arms B=url,A=url --out dir
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { openTab, sleep } from '../../tools/lib/wip.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const arms = arg('--arms', '').split(',').filter(Boolean).map((s) => { const [k, ...u] = s.split('='); return { k, url: u.join('=') }; });
const OUT = resolve(arg('--out', 'out/morph-scroll/simk0')); mkdirSync(OUT, { recursive: true });
const UDID = process.env.FW_SIM_UDID || 'booted';
const FREEZE = `(() => { const top = setTimeout(() => {}, 0); for (let i = 1; i <= top + 50; i++) { clearTimeout(i); clearInterval(i); }
  let n = 0; for (const a of document.getAnimations()) { if (a.timeline !== document.timeline) continue;
    try { if (a instanceof CSSTransition) a.finish(); else { a.pause(); a.currentTime = 4000; } n++; } catch (e) {} } return n; })()`;
const RECT = `JSON.stringify((() => { const P = document.querySelector('.start-selling-platform'), E = document.querySelector('.fw-ms-end'), de = document.documentElement, r = P.getBoundingClientRect();
  const L = E ? E.offsetHeight : 0; return { y: scrollY, top: r.top, bottom: r.bottom, h: r.height, docTop: r.top + scrollY, cssTop: getComputedStyle(P).top, inl: P.style.top,
    msh: P.style.getPropertyValue('--fw-ms-h'), y0: de.scrollHeight - innerHeight - L, morph: document.querySelector('.start-selling-top-nav').style.getPropertyValue('--morph'),
    hc: [...document.querySelector('.start-selling-top-nav').classList].filter((c) => !c.startsWith('svelte-')).join(' ') }; })())`;
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
function cmp(fa, fb, top = 200) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb)); if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: true };
  let n8 = 0, n64 = 0, max = 0;
  for (let y = top; y < A.h; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * A.bpp; let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c])); if (d > 8) { n8++; if (d > 64) n64++; } if (d > max) max = d; }
  return { pxOver8: n8, pxOver64: n64, max };
}
const shot = (f) => (spawnSync('xcrun', ['simctl', 'io', UDID, 'screenshot', f], { encoding: 'utf8' }).status === 0 ? f : null);
// B cases: [label, d (px past y0), inline top]
const NUDGE = (s) => `calc(100dvh - var(--fw-ms-h, 100dvh) ${s})`;
const CASES = [['d0', 0, ''], ['d1', 1, ''], ['d2', 2, ''], ['d204', 204, ''], ['d0up', 0, NUDGE('- 0.015625px')], ['d0dn', 0, NUDGE('+ 0.015625px')],
  ['d0dn3', 0, NUDGE('+ 0.333px')], ['d0b', 0, '']];
const res = { tool: 'fixes/morph-scroll/simk0.mjs', at: new Date().toISOString(), arms: {}, diffs: {} };
for (const arm of arms) {
  const R = (res.arms[arm.k] = { cases: [] });
  const o = spawnSync('node', ['tools/sim.mjs', 'open', arm.url], { encoding: 'utf8' });
  if (o.status !== 0) { R.error = 'open failed'; console.log(arm.k, R.error); continue; }
  let c;
  try {
    c = await openTab((u) => String(u || '').includes(new URL(arm.url).host));
    for (let i = 0; i < 40; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    await sleep(6000);
    await c.evaluate(`document.documentElement.style.scrollSnapType = 'none'; 'ok'`);
    const sh = await c.evaluate('document.documentElement.scrollHeight');
    for (let y = 0; y <= sh; y += 300) { await c.evaluate(`window.scrollTo({ top: ${y}, behavior: 'instant' }); 'ok'`); await sleep(120); }
    await sleep(2500); await c.evaluate(FREEZE); await sleep(400);
    const isB = await c.evaluate(`document.documentElement.classList.contains('fw-ms')`);
    const cases = isB ? CASES : [['end', null, '']];
    for (const [label, d, inl] of cases) {
      if (isB) {
        await c.evaluate(`(() => { const P = document.querySelector('.start-selling-platform'); P.style.top = ${JSON.stringify(inl)}; return 'ok'; })()`);
        await c.evaluate(`(() => { const s = JSON.parse(${RECT}); window.scrollTo({ top: s.y0 + ${d}, behavior: 'instant' }); return 'ok'; })()`);
      } else await c.evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); 'ok'`);
      await sleep(1200); await c.evaluate(FREEZE); await sleep(300);
      const st = JSON.parse(await c.evaluate(RECT));
      const f = shot(join(OUT, `${arm.k}-${label}.png`));
      R.cases.push({ label, d, inl, st, file: f });
      console.log(`SIMK0 ${arm.k} ${label} ${JSON.stringify(st)}`);
    }
  } catch (e) { R.error = String((e && e.message) || e); console.log(arm.k, 'ERROR', R.error); }
  try { c && c.close(); } catch {}
}
const fa = res.arms.A?.cases?.[0]?.file;
for (const cs of res.arms.B?.cases || []) if (fa && cs.file) { const d = cmp(fa, cs.file); res.diffs[cs.label] = d; console.log(`SIMK0DIFF A vs B-${cs.label} ${JSON.stringify(d)}`); }
writeFileSync(join(OUT, 'simk0.json'), JSON.stringify(res, null, 1));
console.log('->', join(OUT, 'simk0.json'));

// Blink check, WebKit side (arch-compositor-morph): does the nav change look when the CM morph switches on at m ~ 0
// (is-morphing on: the corner clippers draw the nav) and off again? Chrome showed square glass corners there, a known
// Chrome-only artefact (F-309); this asks Safari (Simulator). scrollTo steps m 0, 0.004, 0.008, 0.016, 0.03, back 0.004,
// 0 with touch held; simctl screenshots right away, +150 ms, +700 ms; per shot the nav's 4 corner boxes (28x28 css px)
// compared with the settled m 0 shot (mean abs channel delta, px > 24 counts). Pixels only, functional session.
//   node out/cm/simswitch.mjs --arms C=<dir>,V12=<dir>
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const sim = await import(join(WT, 'tools/lib/sim.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const OUT = join(WT, 'out/cm/simswitch-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const cfg = sim.readConfig();
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const NAV = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const r = h.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, ih: innerHeight, cls: h.className.replace(/svelte-\\w+/g, '').trim(), html: document.documentElement.className }; })())`;
const MS = [['m0', 0], ['m.004', 0.004], ['m.008', 0.008], ['m.016', 0.016], ['m.03', 0.03], ['m.004r', 0.004], ['m0r', 0]];
// corner boxes of the closed pill (css px rect r, shot scale s, page top offset off in shot px)
function corners(ref, cur, r, s, off) {
  const A = pngPixels(readFileSync(ref)), B = pngPixels(readFileSync(cur)); const B0 = 28, out = [];
  for (const [cx, cy] of [[r.l, r.t], [r.l + r.w - B0, r.t], [r.l, r.t + r.h - B0], [r.l + r.w - B0, r.t + r.h - B0]]) {
    let n = 0, sum = 0, big = 0;
    for (let y = Math.round(cy * s) + off; y < Math.round((cy + B0) * s) + off; y++) for (let x = Math.round(cx * s); x < Math.round((cx + B0) * s); x++) {
      const i = (y * A.w + x) * A.bpp; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
      sum += d; n++; if (d > 24) big++;
    }
    out.push(`${(sum / n).toFixed(1)}/${big}`);
  }
  return out.join(' ');
}
const res = { arms: {} };
for (const A of ARMS) {
  const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
  const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(1500);
    await c.evaluate(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
    let g = JSON.parse(await c.evaluate(GEO));
    await c.evaluate(`(scrollTo({ top: ${g.endStart - 300}, behavior: 'instant' }), 1)`); await sleep(1500);
    g = JSON.parse(await c.evaluate(GEO));
    await c.evaluate(TOUCH);
    const rows = []; let ref = null, nav0 = null, sc = 3, off = 0;
    for (const [nm, m] of MS) {
      const y = Math.round(g.endStart + m * g.t);
      await c.evaluate(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`);
      const shots = [];
      for (const [j, w] of [[0, 0], [1, 150], [2, 550]]) { if (w) await sleep(w); const f = join(OUT, `${A.k}-${nm}-${j}.png`); sim.simctl(['io', cfg.udid, 'screenshot', f]); shots.push(f); }
      const nav = JSON.parse(await c.evaluate(NAV));
      if (!ref) { ref = shots[2]; nav0 = nav; const p0 = pngPixels(readFileSync(ref)); sc = p0.w / 430; off = Math.max(0, Math.round(p0.h - nav.ih * sc)); off = Math.round(off * 0.4); }
      const cs = shots.map((f) => corners(ref, f, nav0, sc, off));
      rows.push({ nm, y, nav, cs });
      console.log(`${A.k} ${nm.padEnd(7)} y ${y} ${nav.cls} | corners vs m0 (mean/px>24, TL TR BL BR): ${cs.join(' | ')}`);
    }
    res.arms[A.k] = { geo: g, off, sc, rows };
  } catch (e) { console.log(A.k, 'error', String(e.stack || e)); }
  finally { try { c && c.close(); } catch {} sp.kill(); rmSync(st, { force: true }); }
}
writeFileSync(join(OUT, 'simswitch.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'simswitch.json'));

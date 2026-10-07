// PR-032 rev 3 frame check, WebKit side (arch-compositor-morph): the same plan as out/cm/fadeframes.mjs (hide across m 0.2,
// back to 0.15, show at m 0, wiggle 0.18 <-> 0.22) in the Simulator, with the in-page rAF sampler only (computed opacity,
// filter, translate of the Join button and the language switch; the nav's classes). Values only, no timing claims.
// Run in a functional Simulator session (shared slot, <= 180 s: one arm per session).
//   node out/cm/simfade.mjs --arms B=<dir>
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const OUT = join(WT, 'out/cm/simfade-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const SAMPLER = `(() => { window.__ff = []; window.__ffRun = true;
  const btn = document.querySelector('.start-selling-top-nav-btn.is-earn'), wr = document.querySelector('.start-selling-top-nav-actions > .start-selling-language-switch-wrap'), nav = document.querySelector('header.start-selling-top-nav');
  const f = (t) => { const a = getComputedStyle(btn), b = getComputedStyle(wr);
    __ff.push({ t: +t.toFixed(1), op: +a.opacity, filt: a.filter, bt: a.translate, wt: b.translate, wx: b.transform, hid: nav.classList.contains('is-earn-hidden') ? 1 : 0, mor: nav.classList.contains('is-morphing') ? 1 : 0, y: Math.round(scrollY) });
    if (__ffRun) requestAnimationFrame(f); };
  requestAnimationFrame(f); return 1; })()`;
function reversals(xs, tol) {
  if (xs.length < 3) return { dir: 0, n: 0, max: 0 };
  const dir = Math.sign(xs.at(-1) - xs[0]); let n = 0, max = 0;
  for (let i = 1; i < xs.length; i++) { const d = (xs[i] - xs[i - 1]) * dir; if (d < -tol) { n++; max = Math.max(max, -d); } }
  return { dir, n, max: +max.toFixed(3) };
}
const blurPx = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? +m[1] : 0; };
const txPx = (t) => (t && t !== 'none' ? parseFloat(t) : 0);
const res = { arms: {} };
for (const A of ARMS) {
  const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
  const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    const url = `http://localhost:${s.port}/`;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(1500);
    for (const f of [0.25, 0.5, 0.75]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(600); }
    let g = JSON.parse(await c.evaluate(GEO));
    await c.evaluate(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
    g = JSON.parse(await c.evaluate(GEO));
    await c.evaluate(TOUCH);
    const yAt = (m) => Math.round(g.endStart + m * g.t);
    await c.evaluate(`(scrollTo({ top: ${yAt(0.15)}, behavior: 'instant' }), 1)`); await sleep(1500);
    const plan = [['hide', 0.24, 1300], ['back', 0.15, 900], ['show', -0.05, 1300], ['up2', 0.22, 120], ['dn2', 0.18, 120], ['up3', 0.22, 120], ['dn3', 0.18, 120], ['up4', 0.22, 1300]];
    const rows = [];
    for (const [name, m, wait] of plan) {
      await c.evaluate(SAMPLER);
      await c.evaluate(`(scrollTo({ top: ${yAt(m)}, behavior: 'instant' }), 1)`);
      await sleep(wait);
      const ff = JSON.parse(await c.evaluate(`(window.__ffRun = false, JSON.stringify(window.__ff))`));
      const op = ff.map((r) => r.op), bl = ff.map((r) => blurPx(r.filt)), wt = ff.map((r) => txPx(r.wt));
      rows.push({ name, m, nRaf: ff.length, ff, opFirst: op[0], opLast: op.at(-1), opRev: reversals(op, 0.001), blurFirst: bl[0], blurLast: bl.at(-1), blurRev: reversals(bl, 0.01), wtFirst: wt[0], wtLast: wt.at(-1), wtRev: reversals(wt, 0.01), hid: [...new Set(ff.map((r) => r.hid))], mor: [...new Set(ff.map((r) => r.mor))] });
    }
    res.arms[A.k] = { geo: g, rows };
    console.log(`== ${A.k}`);
    for (const r of rows) console.log(`  ${r.name.padEnd(5)} m ${r.m} raf ${r.nRaf} hid ${r.hid} mor ${r.mor} | op ${r.opFirst}->${r.opLast} rev ${r.opRev.n} | blur ${r.blurFirst}->${r.blurLast} rev ${r.blurRev.n} | EN ${r.wtFirst}->${r.wtLast} rev ${r.wtRev.n}`);
  } finally { try { c && c.close && c.close(); } catch {} sp.kill(); rmSync(st, { force: true }); }
}
writeFileSync(join(OUT, 'simfade.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'simfade.json'));

// end-morph (fix-end-morph, user T-204 #10): the nav's "Join waitlist" button per frame through the end-of-page morph in
// WebKit (Simulator), GEOMETRY ONLY (no timing judged). Same reads as joinwl-chrome.mjs: per arm (overlay dir, or "base"
// for the plain baseline, [@css]) load, walk the page, park 2 viewports above the bottom, then one scrollTo per rAF down
// to the bottom (N steps) + R rest frames, then back up + R rest frames; every frame reads the button's rect, computed
// opacity / transform / translate / filter, the nav's rect and --morph.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-morph -- \
//     node tools/sim.mjs session --functional --owner fix-end-morph -- node fixes/end-morph/joinwl-sim.mjs \
//     --arms base,<abs overlay dir>[@<css file>][,...] [--steps 60] [--rest 120]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
if (!ARMS.length) throw new Error('--arms base|<abs overlay dir>[@css][,...]');
const N = Number(arg('--steps', '60')), REST = Number(arg('--rest', '120'));
const OUT = join(WT, 'out/joinwl'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const READ = `(() => { const b = document.querySelector('.start-selling-top-nav-btn.is-earn');
  const hd = document.querySelector('header.start-selling-top-nav'); const r = b ? b.getBoundingClientRect() : null;
  const hr = hd ? hd.getBoundingClientRect() : null; const cs = b ? getComputedStyle(b) : null;
  return { y: Math.round(scrollY), morph: hd ? hd.style.getPropertyValue('--morph') || getComputedStyle(hd).getPropertyValue('--morph') : null,
    top: r && +r.top.toFixed(2), left: r && +r.left.toFixed(2), w: r && +r.width.toFixed(2),
    navTop: hr && +hr.top.toFixed(2), op: cs && +cs.opacity, tf: cs && cs.transform, tr: cs && cs.translate, fl: cs && cs.filter }; })()`;
const RUN = (ys, rest) => `(() => { const ys = ${JSON.stringify(ys)}; window.__jw = []; window.__jwDone = 0; let k = 0;
  const f = () => { const s = ${READ}; s.k = k; window.__jw.push(s); if (k < ys.length) window.scrollTo({ top: ys[k], behavior: 'instant' });
    k++; if (k < ys.length + ${rest}) requestAnimationFrame(f); else window.__jwDone = 1; }; requestAnimationFrame(f); return 1; })()`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * (i + 1)) / n));
const sum = (fr) => { const t0 = fr[0].top; const vis = fr.filter((s) => s.op > 0.01);
  const lifts = vis.map((s) => +(s.top - t0).toFixed(2)); const navs = vis.map((s) => +(s.navTop - fr[0].navTop).toFixed(2));
  const tys = vis.map((s) => { const m = /matrix\(([^)]+)\)/.exec(s.tf || ''); return m ? +m[1].split(',')[5] : 0; });
  return { frames: fr.length, visible: vis.length, liftMin: Math.min(...lifts), liftMax: Math.max(...lifts), navMoveMin: Math.min(...navs), navMoveMax: Math.max(...navs), ownTranslateYmin: Math.min(...tys) }; };

const res = { tool: 'fixes/end-morph/joinwl-sim.mjs (fix-end-morph)', startedAt: new Date().toISOString(), steps: N, rest: REST, arms: [] };
for (const [i, arm] of ARMS.entries()) {
  const armCss = arm.css ? readFileSync(arm.css, 'utf8') : null;
  const st = join(OUT, `serve-jws-${i}-${process.pid}.json`); rmSync(st, { force: true });
  const a = [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'];
  if (arm.dir !== 'base') a.push('--overlay', arm.dir);
  const p = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm: (arm.dir === 'base' ? 'base' : basename(arm.dir)) + (arm.css ? '@' + basename(arm.css) : ''), dir: arm.dir, cssSha: armCss ? sha(Buffer.from(armCss)) : null };
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2000);
    if (armCss) await c.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
    for (const f of [0.2, 0.4, 0.6, 0.8, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
    const g = await c.evaluate(`({ max: document.documentElement.scrollHeight - innerHeight, ih: innerHeight, safari: navigator.userAgent.replace(/.*Version\\/([\\d.]+).*/, '$1') })`);
    run.geo = g; const from = g.max - 2 * g.ih;
    await c.evaluate(`(window.scrollTo({ top: ${from}, behavior: 'instant' }), 0)`); await sleep(2000);
    for (const [name, ys] of [['down', lin(from, g.max, N)], ['up', lin(g.max, from, N)]]) {
      await c.evaluate(RUN(ys, REST));
      for (let k = 0; k < 60 && !(await c.evaluate('window.__jwDone')); k++) await sleep(250);
      run[name] = await c.evaluate('window.__jw');
      await sleep(1000);
    }
    // the baseline's own trigger (JS 13049-13058): at the bottom a wheel deltaY > 0 starts the tween to morph 1, < 0 back
    await c.evaluate(`(window.scrollTo({ top: ${g.max}, behavior: 'instant' }), 0)`); await sleep(1500);
    for (const [name, d] of [['wheelDown', 120], ['wheelUp', -120]]) {
      await c.evaluate(RUN([], REST).replace('requestAnimationFrame(f); return 1; })', `window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${d}, cancelable: true, bubbles: true })); requestAnimationFrame(f); return 1; })`));
      for (let k = 0; k < 60 && !(await c.evaluate('window.__jwDone')); k++) await sleep(250);
      run[name] = await c.evaluate('window.__jw');
      await sleep(1000);
    }
    run.summary = { down: sum(run.down), up: sum(run.up), wheelDown: sum(run.wheelDown), wheelUp: sum(run.wheelUp) };
    console.log(run.arm, 'served', JSON.stringify(run.served), 'SUMMARY', JSON.stringify(run.summary));
  } catch (e) { run.error = String(e?.message || e); console.log(run.arm, 'ERROR', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms.push(run);
}
const f = join(OUT, `joinwl-sim-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

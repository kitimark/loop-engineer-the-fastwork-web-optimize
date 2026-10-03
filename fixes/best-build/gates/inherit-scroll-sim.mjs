// best-build copy of fixes/morph-inherit/gates/inherit-scroll-sim.mjs: the same steps and state read; only the arm table
// (./arms.mjs: C st6-rb2, M morph-inherit, N best build, ...) and the output dir (out/best-build/) differ. Run:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wi-best-build -- \
//     node tools/sim.mjs session --functional --owner wi-best-build -- node fixes/best-build/gates/inherit-scroll-sim.mjs C,M,N
// Original header:
// WebKit control for F-183 (fix-nav-morph): open the nav morph the way a user does, not with the debug driver.
// Step down to the end of the page (scrollTo, like a reader), then push past the end: wheel events with deltaY > 0
// dispatched on window. Both builds attach the morph's wheel listener on window (capture), and in both it runs
// k() -> D(delta) -> E(1), the same path a real push takes (synthetic events are not trusted, the handler does not
// check). Close with deltaY < 0. Per state: the header's inline --morph and classes, each child's computed --morph,
// x and opacity, the earn button's box width, and a Simulator screenshot. Arms: B = plain baseline (no overlay),
// C = st6-rb2, M = C + the morph-inherit fix (out/snapshots/, node fixes/morph-inherit/build.mjs). Counts and positions only. Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/morph-inherit/gates/inherit-scroll-sim.mjs B,C,M
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
import { ARMDEF, NODE, CSS, BASE, makeSnapshots } from './arms.mjs';
makeSnapshots({ quiet: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMS = (process.argv[2] || 'C,M,N').split(',');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/best-build', `inherit-scroll-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav');
  const q = (s) => h.querySelector(s), r1 = (v) => Math.round(v * 10) / 10;
  const earn = q('.start-selling-top-nav-btn.is-earn'), eb = earn?.getBoundingClientRect();
  return { y: Math.round(scrollY), morph: h.style.getPropertyValue('--morph'), cls: h.className.replace(/svelte-\\w+/g, '').replace(/\\s+/g, ' ').trim(),
    earn: earn ? { w: r1(eb.width), x: r1(eb.x), op: getComputedStyle(earn).opacity } : null,
    kids: ['.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions', '.start-selling-top-nav-btn.is-earn', '.start-selling-morph-panel'].map((s) => { const e = q(s); if (!e) return null; const c = getComputedStyle(e); return [s.split('.').pop(), c.getPropertyValue('--morph').trim(), r1(e.getBoundingClientRect().x), c.opacity]; }) }; })())`;
const WHEEL = (dy) => `(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })); return 1; })()`;
const res = { tool: 'best-build copy of fixes/morph-inherit/gates/inherit-scroll-sim.mjs (arms from ./arms.mjs)', runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(def.dir ? ['--overlay', def.dir] : []), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, samples: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (run.served.js !== def.js || run.served.css !== def.css) { run.void = JSON.stringify(run.served); console.log('VOID', arm, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    for (let i = 0; i < 40; i++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); return scrollY >= H - 1; })()`); await sleep(120); if (done) break; }
    await sleep(2500);
    const sample = async (label, shot) => { const v = JSON.parse(await c.evaluate(STATE)); run.samples.push({ label, ...v }); console.log(arm, label, JSON.stringify(v));
      if (shot) S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-${label}.png`)]); };
    await sample('rest', true);
    await c.evaluate(WHEEL(120)); await sleep(250); await sample('open+0.25s');
    await sleep(1750); await sample('open+2s', true);
    await c.evaluate(WHEEL(-120)); await sleep(2000); await sample('closed+2s', true);
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(join(OUT, 'inherit-scroll.json'), JSON.stringify(res, null, 1)); }
}
console.log('wrote', join(OUT, 'inherit-scroll.json'));

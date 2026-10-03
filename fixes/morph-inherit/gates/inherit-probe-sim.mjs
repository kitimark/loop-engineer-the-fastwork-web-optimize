// WebKit check (fix-nav-morph): do the nav's children that take the registered, non-inheriting --morph with an explicit
// `--morph: inherit` (scene-scope R4b, landed in st6-rb2 = C) follow the header's inline --morph during a REAL morph
// tween (the M driver, __fwMorphDrive: E(1) -> spring -> E(0))? Samples, during the m = 1 hold and after the close,
// the header's --morph and each child's computed --morph, x position and opacity, plus a Simulator screenshot at the
// hold. Arms: C (st6-rb2) and M (C + the morph-inherit fix). Counts and positions only. Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/morph-inherit/gates/inherit-probe-sim.mjs C,M
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const ARMDEF = {
  C: { dir: join(SNAP, 'c-7bf7c4657d21'), js: '7bf7c4657d21', css: 'f523598b2a24' },
  M: { dir: join(SNAP, 'mi-7c61fe7d0662'), js: '7c61fe7d0662', css: 'f523598b2a24' },
};
// snapshots: node fixes/morph-inherit/build.mjs
const ARMS = (process.argv[2] || 'C,M').split(',');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-inherit', `inherit-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav');
  return { morph: h.style.getPropertyValue('--morph'), cls: h.className.replace(/svelte-\\w+/g, '').trim(),
    kids: ['.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions', '.start-selling-top-nav-btn.is-earn', '.start-selling-morph-panel'].map((q) => { const e = h.querySelector(q); if (!e) return null; const s = getComputedStyle(e); return [q.split('.').pop(), s.getPropertyValue('--morph').trim(), Math.round(e.getBoundingClientRect().x * 10) / 10, s.opacity]; }) }; })())`;
const res = { tool: 'fix-nav-morph inherit-probe-sim', runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, samples: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (run.served.js !== def.js || run.served.css !== def.css) { run.void = JSON.stringify(run.served); console.log('VOID', arm, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    for (let i = 0; i < 40; i++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); return scrollY >= H - 1; })()`); await sleep(120); if (done) break; }
    await sleep(2500);
    const sample = async (label) => { const v = JSON.parse(await c.evaluate(STATE)); run.samples.push({ label, ...v }); console.log(arm, label, JSON.stringify(v)); };
    await sample('rest');
    await c.evaluate(`(window.__fwMorphDrive({ hold: 5000, cycles: 1 }), 1)`);
    await sleep(1100 + 900); await sample('open+0.9s');
    await sleep(1500); await sample('hold+2.4s');
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-hold.png`)]);
    await sleep(3500); await sample('closed+~0.9s');
    await sleep(1500); await sample('closed+2.4s');
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-closed.png`)]);
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(join(OUT, 'inherit.json'), JSON.stringify(res, null, 1)); }
}
console.log('wrote', join(OUT, 'inherit.json'));

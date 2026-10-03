// best-build copy of fixes/morph-inherit/gates/reveal-sim-frames.mjs: same steps; the arm table comes from ./arms.mjs
// (NH best build + hook, VH platform-idle + hook, MH morph-inherit + hook, NH2 A/A) and output goes to out/best-build/.
// Diff with the unmodified fixes/morph-inherit/gates/reveal-diff.py <out dir> --ref NH. Run:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wi-best-build -- \
//     node tools/sim.mjs session --functional --owner wi-best-build -- node fixes/best-build/gates/reveal-sim-frames.mjs NH,VH,MH,NH2
// Original header:
// morph-inherit gate (a), frozen frames in WebKit (fix-nav-morph; copied from fixes/nav-morph/ for F3 #4): Simulator
// screenshots of the baseline + hook (B, B2 = A/A), the corrected C + hook (M) and, for reference, C + hook (C, C2),
// held at the same morph values m (window.__fwMorphSet). Snapshots: node fixes/morph-inherit/build.mjs. After load: Date.now frozen (the
// countdown keeps the same digits), CSS animations paused at the same time; transitions are left to run out (1.6 s; pausing them in WebKit froze the
// earn button mid-way in one arm and not the other). Screenshots come from
// `simctl io screenshot` (the composited result, Safari's own UI included: crop it before diffing). Counts only.
// Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/morph-inherit/gates/reveal-sim-frames.mjs B,M,B2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));

import { ARMDEF, NODE, CSS, BASE, makeSnapshots } from './arms.mjs';
makeSnapshots({ quiet: true });
const ARMS = (process.argv[2] || 'NH,VH,MH,NH2').split(',');
const MS = (process.argv[3] || '0,0.1,0.25,0.5,0.75,0.9,1,0').split(',').map(Number);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/best-build', `simframes-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav'); const b = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  return { rv: h.hasAttribute('data-fw-rv'), morph: h.style.getPropertyValue('--morph'), rect: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100), clip: cs.clipPath, y: Math.round(scrollY), vv: [innerWidth, innerHeight],
    kids: ['.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions', '.start-selling-top-nav-btn.is-earn', '.start-selling-morph-panel'].map((q) => { const e = h.querySelector(q); if (!e) return null; const s = getComputedStyle(e); return [q.split('.').pop(), s.getPropertyValue('--morph').trim(), Math.round(e.getBoundingClientRect().x * 10) / 10, s.opacity]; }) }; })())`;

const res = { tool: 'best-build copy of fixes/morph-inherit/gates/reveal-sim-frames.mjs (arms from ./arms.mjs)', ms: MS, out: OUT, runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, frames: [] }; let c = null;
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
    // step down the page like a reader (deferred sections render), then the end
    for (let i = 0; i < 40; i++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); return scrollY >= H - 1; })()`); await sleep(120); if (done) break; }
    await sleep(2500);
    await c.evaluate(`(() => { const F = 1790985600500; Date.now = () => F; return 1; })()`);
    await sleep(1500);
    for (let k = 0; k < MS.length; k++) {
      const m = MS[k];
      await c.evaluate(`(window.__fwMorphSet(${m}), 1)`); await sleep(250);
      await c.evaluate(`(window.__fwMorphSet(${m}), 1)`); await sleep(1600); // transitions (earn button: 0.68 s) run out on their own
      const n = await c.evaluate(FREEZE); await sleep(600);
      const stt = JSON.parse(await c.evaluate(STATE));
      const f = join(OUT, `${arm}-${k}-m${m}.png`);
      const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      run.frames.push({ k, m, anims: n, state: stt, file: f, ok: r.status === 0 });
      console.log(arm, k, m, n, JSON.stringify(stt), r.status === 0 ? 'shot' : 'SHOT FAILED');
    }
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(join(OUT, 'simframes.json'), JSON.stringify(res, null, 1)); }
}
console.log('wrote', join(OUT, 'simframes.json'));

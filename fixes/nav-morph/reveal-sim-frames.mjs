// F3 #4 frozen frames in WebKit (fix-nav-morph): Simulator screenshots of C (+ hook) and the composited-reveal
// prototype held at the same morph values m (window.__fwMorphSet), C twice (A/A). After load: Date.now frozen (the
// countdown keeps the same digits), CSS animations paused at the same time; transitions are left to run out (1.6 s; pausing them in WebKit froze the
// earn button mid-way in one arm and not the other). Screenshots come from
// `simctl io screenshot` (the composited result, Safari's own UI included: crop it before diffing). Counts only.
// Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-morph/reveal-sim-frames.mjs C,P,C2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const ARMDEF = {
  C: { dir: join(SNAP, 'f3r-chook-f6f254402209'), js: 'f6f254402209', css: 'f523598b2a24' },
  P: { dir: join(SNAP, 'f3r-proto-1a3c97afd47b'), js: '1a3c97afd47b', css: '383fe4166c68' },
};
// morph-inherit gate (a): plain baseline + hook (B, B2 = A/A) vs the corrected C + hook (M); fixes/morph-inherit/build.mjs
ARMDEF.B = { dir: join(SNAP, 'bhook-a0945967a4fb'), js: 'a0945967a4fb', css: '27776f3d4138' };
ARMDEF.M = { dir: join(SNAP, 'mhook-d9898e0a2e15'), js: 'd9898e0a2e15', css: 'f523598b2a24' };
ARMDEF.C2 = { ...ARMDEF.C };
ARMDEF.B2 = { ...ARMDEF.B };
const ARMS = (process.argv[2] || 'C,P,C2').split(',');
const MS = (process.argv[3] || '0,0.1,0.25,0.5,0.75,0.9,1,0').split(',').map(Number);
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/f3r', `simframes-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav'); const b = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  return { rv: h.hasAttribute('data-fw-rv'), morph: h.style.getPropertyValue('--morph'), rect: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100), clip: cs.clipPath, y: Math.round(scrollY), vv: [innerWidth, innerHeight],
    kids: ['.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions', '.start-selling-top-nav-btn.is-earn', '.start-selling-morph-panel'].map((q) => { const e = h.querySelector(q); if (!e) return null; const s = getComputedStyle(e); return [q.split('.').pop(), s.getPropertyValue('--morph').trim(), Math.round(e.getBoundingClientRect().x * 10) / 10, s.opacity]; }) }; })())`;

const res = { tool: 'fix-nav-morph reveal-sim-frames (F3 #4 WebKit frozen frames)', ms: MS, out: OUT, runs: [] };
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

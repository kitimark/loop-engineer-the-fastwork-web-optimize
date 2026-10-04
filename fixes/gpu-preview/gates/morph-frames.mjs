// gpu-preview copy of fix-morph-gpu's fixes/morph-gpu/gates/sim-frames.mjs (branch commit 9693eb5e): same steps, freeze
// and shots; only the arms (below) and the output dir (out/gpu-preview/morphframes-<ts>/) differ. Run:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wi-gpu-bundle -- \
//     node tools/sim.mjs session --functional --owner wi-gpu-bundle -- node fixes/gpu-preview/gates/morph-frames.mjs M,G,M2
//   python3 fixes/gpu-preview/gates/reveal-diff.py out/gpu-preview/morphframes-<ts> --ref M
// Original header:
// morph-gpu frozen frames in WebKit (fix-morph-gpu; adapted from fixes/morph-inherit/gates/reveal-sim-frames.mjs):
// Simulator screenshots of M = best-build + hook (besthook), R = this fix + the same hook (newest rvhook in
// out/snapshots, or RV=<dir>) and M2 = a second M load (true A/A), held at the same morph values m (window.__fwMorphSet).
// Snapshots: node fixes/morph-gpu/build.mjs. Date.now frozen, CSS animations paused at the same time, transitions run
// out (1.6 s). Screenshots via `simctl io screenshot` (Safari UI included: crop before diffing). Counts only.
// Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-morph-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-morph-gpu -- node fixes/morph-gpu/gates/sim-frames.mjs M,R,M2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const { readdirSync, statSync } = await import('node:fs');
// gpu-preview: arms from out/gpu-preview/snap (fixes/gpu-preview/snap.mjs), hash-checked against its HASHES.txt.
//   M = MH, morph-gpu alone + hook (fix-morph-gpu's rvhook-81a43009c62d); G = GH, the bundle + the same hook (the exact
//   rv -> rvhook diff); M2 = MH again (A/A).
const GS = join(WT, 'out/gpu-preview/snap');
const HX = Object.fromEntries(readFileSync(join(GS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const armOf = (d) => ({ dir: join(GS, d), js: HX[`${d}/${NODE}`], css: HX[`${d}/${CSS}`] });
const rvDir = join(GS, 'GH');
const ARMDEF = { M: armOf('MH'), G: armOf('GH') };
ARMDEF.M2 = { ...ARMDEF.M };
const ARMS = (process.argv[2] || 'M,G,M2').split(',');
// STEPS (env, JSON array; or STEPS_FILE, a JSON file) overrides the m list: a number holds m, a string is a page expression run before the shot
const MS = process.env.STEPS_FILE ? JSON.parse(readFileSync(process.env.STEPS_FILE, 'utf8')) : process.env.STEPS ? JSON.parse(process.env.STEPS) : (process.argv[3] || '0,0.002,0.05,0.2,0.4,0.6,0.7,0.8,0.9,0.99,1,0').split(',').map(Number);
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/gpu-preview', `morphframes-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav'); const b = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  return { rv: h.hasAttribute('data-fw-rv'), morph: h.style.getPropertyValue('--morph'), rect: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100), clip: cs.clipPath, y: Math.round(scrollY), vv: [innerWidth, innerHeight],
    kids: ['.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions', '.start-selling-top-nav-btn.is-earn', '.start-selling-morph-panel'].map((q) => { const e = h.querySelector(q); if (!e) return null; const s = getComputedStyle(e); return [q.split('.').pop(), s.getPropertyValue('--morph').trim(), Math.round(e.getBoundingClientRect().x * 10) / 10, s.opacity]; }) }; })())`;

const res = { tool: 'fix-morph-gpu sim-frames (WebKit frozen frames, M vs R, M2 = A/A)', rvDir, ms: MS, out: OUT, runs: [] };
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
      if (typeof m === 'string') { await c.evaluate(`(${m}, 1)`); await sleep(1600); }
      else {
        await c.evaluate(`(window.__fwMorphSet(${m}), 1)`); await sleep(250);
        await c.evaluate(`(window.__fwMorphSet(${m}), 1)`); await sleep(1600); // transitions (earn button: 0.68 s) run out on their own
      }
      const n = await c.evaluate(FREEZE); await sleep(600);
      const stt = JSON.parse(await c.evaluate(STATE));
      const f = join(OUT, `${arm}-${k}-m${typeof m === 'string' ? 'js' : m}.png`);
      const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      run.frames.push({ k, m, anims: n, state: stt, file: f, ok: r.status === 0 });
      console.log(arm, k, m, n, JSON.stringify(stt), r.status === 0 ? 'shot' : 'SHOT FAILED');
    }
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(join(OUT, 'simframes.json'), JSON.stringify(res, null, 1)); }
}
console.log('wrote', join(OUT, 'simframes.json'));

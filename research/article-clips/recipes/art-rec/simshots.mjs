// art-rec: Simulator stills for the Part 1 draft (no timing). Adapted from fixes/g0-revert/gates/g0sim.mjs (fix-g0-revert):
// same serve / sim.mjs open / openTab / settable clock / synthetic wheel / simctl screenshot path. Runs inside
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner art-rec -- \
//     node tools/sim.mjs session --functional --owner art-rec -- node <this> <arm> [<arm> ...]
// Arms: v0 (baseline, top), C / V (end-bg control and pictures off, end of page), d / e (g0.0d / g0.0e, logo at the close).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const WT = '.claude/worktrees/agent-a34f4f98a6e023093';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMS = {
  v0: { dir: null, kind: 'top', pin: '4606120cf392/27776f3d4138' },
  C: { dir: join(WT, 'fixes/morph-scroll-v9try/overlay'), kind: 'end', pin: '1b2eecc66011/e1359ab9994a' },
  V: { dir: join(WT, 'out/art-rec/arms/V'), kind: 'end', pin: '1b2eecc66011/38679ce9de15' },
  d: { dir: join(WT, 'fixes/join-fade-g00c/overlay'), kind: 'logo', pin: '5c39f7a96e41/32a2bf7c17b0' },
  e: { dir: join(WT, 'fixes/g0-0e/overlay'), kind: 'logo', pin: '5c39f7a96e41/d4e684032482' },
};
const OUT = join(WT, 'out/art-rec/sim'); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const STUB = `(() => { if (window.__g0clk) return 1; const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); let fz = null;
  performance.now = () => (fz === null ? rp() : fz); window.requestAnimationFrame = (cb) => raf((ts) => cb(fz === null ? ts : fz));
  window.__g0clk = { set: (v) => { fz = v; } }; Date.now = () => ${DZ}; return 1; })()`;
const STATE = `JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'), l = document.querySelector('.start-selling-top-nav-logo');
  const r = l ? l.getBoundingClientRect() : null;
  return { y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, vh: innerHeight, iw: innerWidth, m: n ? n.style.getPropertyValue('--morph') : null,
    morphing: n ? n.classList.contains('is-morphing') : null, logoLeft: r ? Math.round(r.left * 100) / 100 : null, logoW: r ? Math.round(r.width * 100) / 100 : null }; })())`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`;
const res = { tool: 'art-rec simshots.mjs', at: new Date().toISOString(), runs: [] };
const save = () => writeFileSync(join(OUT, 'simshots.json'), JSON.stringify(res, null, 1));
for (const arm of process.argv.slice(2)) {
  const A = ARMS[arm]; if (!A) { console.log('unknown arm', arm); continue; }
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  if (A.dir) args.push('--overlay', A.dir);
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, frames: [] }; let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = [sha12(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), sha12(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))].join('/');
    if (run.served !== A.pin) { run.void = run.served; console.log('VOID', arm, run.served, 'want', A.pin); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40; k++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await sleep(1500);
    const shoot = async (stop) => {
      const stt = JSON.parse(await c.evaluate(STATE));
      const f = join(OUT, `${arm}-${stop}.png`);
      const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      run.frames.push({ stop, state: stt, file: f, ok: r.status === 0 });
      console.log(arm, stop, JSON.stringify(stt), r.status === 0 ? 'shot' : 'SHOT FAILED');
    };
    const walkTo = async (y) => { for (let k = 0; k < 60; k++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight, T = Math.min(H, ${y}); window.scrollTo({ top: scrollY < T ? Math.min(T, scrollY + 400) : Math.max(T, scrollY - 400), behavior: 'instant' }); return Math.abs(scrollY - T) <= 1; })()`); await sleep(120); if (done) break; } };
    if (A.kind === 'top') {
      await sleep(4000); await shoot('top');
    } else if (A.kind === 'end') {
      await walkTo(1e6); await sleep(2000); await walkTo(1e6); await sleep(3000); await shoot('end');
      const max = await c.evaluate(`document.documentElement.scrollHeight - innerHeight`);
      await c.evaluate(`(window.scrollTo({ top: ${max - 775}, behavior: 'instant' }), 1)`); await sleep(3000); await shoot('end-1screen');
    } else {
      await walkTo(1e6); await sleep(2000); await walkTo(1e6); await sleep(1500);
      await c.evaluate(STUB);
      await shoot('closed-rest');
      const F = 1e7; await c.evaluate(`(window.__g0clk.set(${F}), 1)`); run.openPrevented = await c.evaluate(wheel(120));
      await c.evaluate(`(window.__g0clk.set(${F + 1000}), 1)`); await sleep(1100); await shoot('open-done');
      const G = 2e7; await c.evaluate(`(window.__g0clk.set(${G}), 1)`); await c.evaluate(wheel(-120));
      for (const t of [520, 560, 600, 620, 680]) { await c.evaluate(`(window.__g0clk.set(${G + t}), 1)`); await sleep(1100); await shoot(`close-${t}`); }
    }
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); save(); }
}
console.log('SIMSHOTS DONE');

// logo-close (T-245): logo-path.mjs's trace on the iOS Simulator (Safari, WebKit), no timing. g0sim.mjs's method: the
// page gets a settable clock after load (performance.now and the rAF timestamp), the original's jack is driven by a
// synthetic wheel event, and the tween is seeked stop by stop; WebKit's Runtime.evaluate does not await promises, so
// each stop waits real time (STOPWAIT ms, a few display frames) before reading. v14 (morph-scroll on the touch
// Simulator) is stepped through its .fw-ms-end spacer. Arms as in logo-path.mjs. Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-logo-close -- \
//     node tools/sim.mjs session --functional --owner fix-logo-close -- node fixes/logo-close/probe/logo-path-sim.mjs out/logo-close/sim v0 dir:g00c dir:lcfix
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));

const [outdir, ...armNames] = process.argv.slice(2);
if (!outdir || !armNames.length) { console.error('usage: logo-path-sim.mjs <outdir> <arm> [...]'); process.exit(1); }
const STOPWAIT = Number(process.env.STOPWAIT || 70);
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const dirOf = (a) => (a === 'v0' ? null : join(WT, 'out/g0', a === 'v14' ? 'v14' : a.replace(/^dir:/, '')));
const pin = (a) => [sha12(readFileSync(join(dirOf(a) || BASE, JS))), sha12(readFileSync(join(dirOf(a) || BASE, CSS)))];
mkdirSync(outdir, { recursive: true });
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const STUB = `(() => { if (window.__g0clk) return 1; const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); let fz = null;
  performance.now = () => (fz === null ? rp() : fz); window.requestAnimationFrame = (cb) => raf((ts) => cb(fz === null ? ts : fz));
  window.__g0clk = { set: (v) => { fz = v; } }; Date.now = () => ${DZ}; return 1; })()`;
const READ = `JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'), l = document.querySelector('.start-selling-top-nav-logo'), r = l.getBoundingClientRect(), cs = getComputedStyle(l);
  return { m: Number(n.style.getPropertyValue('--morph') || 0), mor: n.classList.contains('is-morphing'), x: r.left, y: r.top, w: r.width, ox: cs.transformOrigin, iw: innerWidth, vh: innerHeight }; })())`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`;
const FR = 1000 / 120;
const r3 = (t) => Math.round(t * 1000) / 1000;
const frames = (a, b) => Array.from({ length: 85 }, (_, k) => k * FR).filter((t) => t >= a - 1e-6 && t <= b + 1e-6);
const OPEN_T = [...new Set([0, 0.1, 0.2, 0.25, 0.3, 0.5, 1, 2, 4, ...frames(0, 120), 200, 300, 400, 500, 600, 680].map(r3))].sort((a, b) => a - b);
const CLOSE_T = [...new Set([0, 100, 200, 300, 400, 500, ...frames(540, 700), 611.5, 611.9, 612.1, 612.5].map(r3))].sort((a, b) => a - b);
const isFrame = (t) => Array.from({ length: 85 }, (_, k) => k * FR).some((f) => Math.abs(f - t) < 1e-3);
const res = { tool: 'fixes/logo-close/probe/logo-path-sim.mjs', stopWaitMs: STOPWAIT, runs: {} };
const save = () => writeFileSync(join(outdir, 'path-sim.json'), JSON.stringify(res, null, 1));
for (const arm of armNames) {
  const st = join(outdir, `serve-${arm.replace(/[^\w]/g, '_')}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  if (dirOf(arm)) args.push('--overlay', dirOf(arm));
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = (res.runs[arm] = {}); let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = [sha12(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), sha12(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))];
    if (run.served.join('/') !== pin(arm).join('/')) { run.void = run.served.join('/'); console.log('VOID', arm, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40; k++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await sleep(1500);
    await c.evaluate(STUB);
    const walkTo = async (y) => { for (let k = 0; k < 60; k++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight, T = Math.min(H, ${y}); window.scrollTo({ top: scrollY < T ? Math.min(T, scrollY + 400) : Math.max(T, scrollY - 400), behavior: 'instant' }); return Math.abs(scrollY - T) <= 1; })()`); await sleep(120); if (done) break; } };
    await walkTo(1e6); await sleep(2000); await walkTo(1e6); await sleep(1500);
    const read = async () => JSON.parse(await c.evaluate(READ));
    const sp = await c.evaluate(`(document.querySelector('.fw-ms-end') || {}).offsetHeight || 0`);
    if (sp) {
      run.mode = 'scroll';
      const max = await c.evaluate(`document.documentElement.scrollHeight - innerHeight`);
      for (const [ph, dir] of [['open', 1], ['close', -1]]) {
        const fr = (run[ph] = []);
        for (let k = 0; k <= sp; k += 4) { const y = dir > 0 ? max - sp + k : max - k; await c.evaluate(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(STOPWAIT); fr.push({ t: k, frame: true, ...(await read()) }); }
        await sleep(1500); fr.push({ t: 'rest', frame: false, ...(await read()) });
      }
    } else {
      run.mode = 'tween';
      run.rest = await read();
      for (const [ph, T0, dy, TS] of [['open', 1e7, 120, OPEN_T], ['close', 2e7, -120, CLOSE_T]]) {
        await c.evaluate(`(window.__g0clk.set(${T0}), 1)`); await sleep(100);
        run[ph + 'Prevented'] = await c.evaluate(wheel(dy));
        const fr = (run[ph] = []);
        for (const t of TS) { await c.evaluate(`(window.__g0clk.set(${T0 + t}), 1)`); await sleep(STOPWAIT); fr.push({ t, frame: isFrame(t), ...(await read()) }); }
        await c.evaluate(`(window.__g0clk.set(${T0 + 1000}), 1)`); await sleep(1100); fr.push({ t: 1000, frame: false, ...(await read()) });
      }
    }
    for (const ph of ['open', 'close']) {
      const fr = run[ph]; run[ph + 'Flips'] = [];
      for (let i = 1; i < fr.length; i++) if (fr[i].mor !== fr[i - 1].mor) {
        const a = fr[i - 1], b = fr[i];
        run[ph + 'Flips'].push({ tA: a.t, mA: a.m, xA: a.x, tB: b.t, mB: b.m, xB: b.x, jump: b.x - a.x });
        console.log(`sim ${arm} ${ph} flip t ${a.t} -> ${b.t}: m ${a.m.toFixed(5)} -> ${b.m.toFixed(5)}: x ${a.x.toFixed(2)} -> ${b.x.toFixed(2)} (jump ${(b.x - a.x).toFixed(2)} px)`);
      }
      if (!run[ph + 'Flips'].length) console.log(`sim ${arm} ${ph}: no is-morphing flip (mode ${run.mode})`);
    }
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); save(); }
}
console.log('LOGO-PATH-SIM DONE');

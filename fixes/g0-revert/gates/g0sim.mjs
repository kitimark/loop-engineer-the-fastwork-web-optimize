// g0.0 Simulator (WebKit) pixel stops, no timing. The Chrome harness's method (g0px.mjs) on fw-sim: after load the page
// gets a settable clock (performance.now and the rAF timestamp; installed by evaluate, before the gesture), Date.now
// fixed on a whole second; the original's jack is driven by a synthetic wheel event (A -> D -> E, the same path a
// touchmove takes). Each stop: clock set, SETTLE ms of real time for the Join's transitions, running CSS animations
// (not transitions) paused at currentTime 4000, simctl screenshot (Safari's own UI included; the status bar rows are
// left out of the diff). Arms: v0 (baseline), v14 (out/g0/v14), g0 (out/g0/<G0DIR, default g00-a>); a repeated arm is
// a second server (A/A). Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-revert -- \
//     node tools/sim.mjs session --functional --owner fix-g0-revert -- node fixes/g0-revert/gates/g0sim.mjs end out/g0/sim v0 g0
// phases: end (stops through open / held / close / reversal at the page end), top (y stops from the top to #platform)
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const { png, sideBySide } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));

const [phase, outdir, ...armNames] = process.argv.slice(2);
if (!['end', 'top'].includes(phase) || !outdir || armNames.length < 2) { console.error('usage: g0sim.mjs end|top <outdir> <arm> <arm> [...]'); process.exit(1); }
const SETTLE = Number(process.env.SETTLE || 1100);
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const G0DIR = join(WT, 'out/g0', process.env.G0DIR || 'g00-a');
const DIRS = { v0: null, v14: join(WT, 'out/g0/v14'), g0: G0DIR };
const pin = (a) => [sha12(readFileSync(join(DIRS[a] || BASE, JS))), sha12(readFileSync(join(DIRS[a] || BASE, CSS)))];
const tag = `sim-${phase}`;
const OUT = join(outdir, tag); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const T0 = Date.now();
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const STUB = `(() => { if (window.__g0clk) return 1; const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); let fz = null;
  performance.now = () => (fz === null ? rp() : fz); window.requestAnimationFrame = (cb) => raf((ts) => cb(fz === null ? ts : fz));
  window.__g0clk = { set: (v) => { fz = v; } }; Date.now = () => ${DZ}; return 1; })()`;
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const STATE = `JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'), p = document.querySelector('.start-selling-platform'), b = document.querySelector('.start-selling-top-nav-btn.is-earn');
  return { y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, vh: innerHeight, m: n.style.getPropertyValue('--morph'), cls: n.className.replace(/svelte-\\S+/g, '').replace(/\\s+/g, ' ').trim(),
    fade: p ? p.style.getPropertyValue('--morph-fade') : null, join: b ? Math.round(b.getBoundingClientRect().width * 100) / 100 + ' ' + getComputedStyle(b).opacity : null,
    endEls: document.querySelectorAll('.fw-ms-end, [data-fw-cm], .fw-rv-glass').length, iw: innerWidth,
    plat: p ? Math.round(p.getBoundingClientRect().top * 100) / 100 + ' ' + getComputedStyle(p).position : null,
    mask: [...document.querySelectorAll('.waitlist-closing-countdown, .start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized, .start-selling-platform-secure-network-dash')]
      .map((e) => e.getBoundingClientRect()).filter((q) => q.width && q.bottom > 0 && q.top < innerHeight).map((q) => [q.left, q.top, q.right, q.bottom].map((v) => Math.round(v))) }; })())`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`;
const res = { tool: 'fixes/g0-revert/gates/g0sim.mjs', phase, settleMs: SETTLE, runs: [], diffs: [] };
const save = () => writeFileSync(join(OUT, 'g0sim.json'), JSON.stringify(res, null, 1));
const names = armNames.map((a, i) => (armNames.indexOf(a) < i ? a + '#2' : a));
const shots = {};
for (const [i, arm] of armNames.entries()) {
  const name = names[i], st = join(OUT, `serve-${name}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  if (DIRS[arm]) args.push('--overlay', DIRS[arm]);
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { name, frames: [] }; let c = null; shots[name] = [];
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = [sha12(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), sha12(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))];
    if (run.served.join('/') !== pin(arm).join('/')) { run.void = run.served.join('/'); console.log('VOID', name, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40; k++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await sleep(1500);
    await c.evaluate(STUB);
    run.errors = await c.evaluate(`JSON.stringify((window.__g0e || []))`);
    const shoot = async (stop) => {
      await c.evaluate(FREEZE); await sleep(400);
      const stt = JSON.parse(await c.evaluate(STATE));
      const f = join(OUT, `${name}-${stop}.png`);
      const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      await c.evaluate(`(() => { for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition) && a.playState === 'paused') a.play(); } catch {} } return 1; })()`);
      run.frames.push({ stop, state: stt, file: f, ok: r.status === 0 });
      if (r.status === 0) shots[name].push({ stop, f, stt });
      console.log(name, stop, JSON.stringify(stt), r.status === 0 ? 'shot' : 'SHOT FAILED');
    };
    const walkTo = async (y) => { for (let k = 0; k < 60; k++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight, T = Math.min(H, ${y}); window.scrollTo({ top: scrollY < T ? Math.min(T, scrollY + 400) : Math.max(T, scrollY - 400), behavior: 'instant' }); return Math.abs(scrollY - T) <= 1; })()`); await sleep(120); if (done) break; } };
    if (phase === 'top') {
      const plat = await c.evaluate(`(() => { const p = document.querySelector('.start-selling-platform'); return Math.round(p.getBoundingClientRect().top + scrollY); })()`);
      const POS = process.env.POS ? process.env.POS.split(',').map(Number) : Array.from({ length: 8 }, (_, k) => Math.round((k * plat) / 7));
      // PRE (diagnostic): a JS expression evaluated after the walk, 600 ms before the shot (e.g. drop v14's html.fw-ms)
      for (const y of POS) { await walkTo(y); await sleep(1500); if (process.env.PRE) { run.pre = await c.evaluate(process.env.PRE); await sleep(600); } await shoot(`y${y}`); }
    } else {
      await walkTo(1e6); await sleep(2000); await walkTo(1e6); await sleep(1500);
      // v14 on the touch Simulator (morph-scroll): only its two rests, for the kept-v14 (masked) regions
      const sp = await c.evaluate(`(document.querySelector('.fw-ms-end') || {}).offsetHeight || 0`);
      if (sp) {
        const max = await c.evaluate(`document.documentElement.scrollHeight - innerHeight`);
        await c.evaluate(`(window.scrollTo({ top: ${max - sp}, behavior: 'instant' }), 1)`); await sleep(2500); await shoot('closed-rest');
        await c.evaluate(`(window.scrollTo({ top: ${max}, behavior: 'instant' }), 1)`); await sleep(2500); await shoot('held');
        continue;
      }
      await shoot('closed-rest');
      const step = async (stop, t) => { await c.evaluate(`(window.__g0clk.set(${t}), 1)`); await sleep(SETTLE); await shoot(stop); };
      const F = 1e7; await c.evaluate(`(window.__g0clk.set(${F}), 1)`); run.openPrevented = await c.evaluate(wheel(120));
      for (const t of [40, 80, 120, 200, 300, 440, 680]) await step(`open-${t}`, F + t);
      await c.evaluate(wheel(120)); await c.evaluate(`(window.scrollBy(0, 200), 1)`); await sleep(300);
      await step('held', F + 1000);
      const G = 2e7; await c.evaluate(`(window.__g0clk.set(${G}), 1)`); await c.evaluate(wheel(-120));
      for (const t of [80, 160, 300, 500]) await step(`close-${t}`, G + t);
      await step('closed', G + 1000);
    }
  } catch (e) { run.error = String(e.stack || e); console.log(name, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); save(); }
}
// diffs (status bar rows 0..180 left out)
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) for (const a of shots[names[i]]) {
  const b = shots[names[j]].find((x) => x.stop === a.stop); if (!b) continue;
  const A = png(readFileSync(a.f)), B = png(readFileSync(b.f));
  if (A.w !== B.w || A.h !== B.h) { res.diffs.push({ pair: `${names[i]}~${names[j]}`, stop: a.stop, sizeMismatch: true }); continue; }
  // page -> screenshot: scale = shot width / innerWidth; the page's top in the shot is SIM_TOP points (status bar,
  // default 59); the kept-v14 masks get 40 points of margin for blur spread and that guess
  const k = A.w / (a.stt.iw || 430), top = Number(process.env.SIM_TOP || 59) * k, MK = [...(a.stt.mask || []), ...(b.stt.mask || [])].map(([l, t, r, bo]) => [(l - 40) * k, (t - 40) * k + top, (r + 40) * k, (bo + 40) * k + top]);
  let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, um = 0, umMax = 0, um8 = 0;
  for (let y = 180; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const p = (y * A.w + x) * A.bpp, q = (y * B.w + x) * B.bpp;
    const d = Math.max(Math.abs(A.px[p] - B.px[q]), Math.abs(A.px[p + 1] - B.px[q + 1]), Math.abs(A.px[p + 2] - B.px[q + 2]));
    if (d) { n++; if (d > max) max = d; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (!MK.some((m) => x >= m[0] && x < m[2] && y >= m[1] && y < m[3])) { um++; if (d > umMax) umMax = d; if (d > 8) um8++; } }
  }
  const same = { m: a.stt.m === b.stt.m, cls: a.stt.cls === b.stt.cls, y: a.stt.y === b.stt.y, fade: a.stt.fade === b.stt.fade, join: a.stt.join === b.stt.join };
  const d = { pair: `${names[i]}~${names[j]}`, stop: a.stop, diff: n, max, box: n ? [x0, y0, x1, y1] : null, unmasked: um, unmaskedMax: umMax, unmaskedOver8: um8, over8Pct: Number(((100 * um8) / (A.w * A.h)).toFixed(4)), same };
  res.diffs.push(d);
  const bad = Object.entries(same).filter(([, v]) => !v).map(([k]) => k);
  console.log(`DIFF ${d.pair} ${a.stop}: ${n} px (max ${max}); outside the kept-v14 masks ${um} px (max ${umMax}, >8 ${um8} = ${d.over8Pct} %) box ${JSON.stringify(d.box)}${bad.length ? ' STATE-DIFFERS ' + bad.join(',') : ''}`);
  if (n) writeFileSync(join(OUT, `${d.pair.replace('~', '_vs_')}-${a.stop}-diff.png`), sideBySide(A, B, 1, 20));
}
save();
console.log(`G0SIM DONE ${tag} ${Math.round((Date.now() - T0) / 1000)}s`);

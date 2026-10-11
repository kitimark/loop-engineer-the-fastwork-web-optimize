// art-join-closeup: Simulator videos for two article close-ups (no timing). Method = fix-join-fade's slowed run
// (out/jf/jfsim.mjs SLOW), widened to the whole page: after load, page time (performance.now, rAF timestamps) runs at
// RATE of real time from the wheel on, and every CSS animation / transition at playbackRate RATE (a transition first
// seen one frame after it was created gets currentTime x RATE, so it is where it would be). Running, not paused.
// The Simulator display is recorded with `xcrun simctl io <udid> recordVideo` into the main checkout's
// out/people-blink/art-closeup/<arm>-<mode>.mov.
// Run inside: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner art-join-closeup -- \
//   node tools/sim.mjs session --functional --owner art-join-closeup -- node <this> c:join d:join d:logo e:logo
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const WT = '.claude/worktrees/agent-ae93aece29993f5ae';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMS = {
  v: { dir: null, pin: '4606120cf392/27776f3d4138' },
  c: { dir: join(WT, 'fixes/platform-corners-g00b/overlay'), pin: '5c39f7a96e41/c65da97ba01f' },
  d: { dir: join(WT, 'fixes/join-fade-g00c/overlay'), pin: '5c39f7a96e41/32a2bf7c17b0' },
  e: { dir: join(WT, 'fixes/g0-0e/overlay'), pin: '5c39f7a96e41/d4e684032482' },
};
const RATE = Number(process.env.RATE || 1 / 3);
const VID = 'out/people-blink/art-closeup';
const OUT = '$SCRATCH/art-join-closeup';
mkdirSync(VID, { recursive: true }); mkdirSync(OUT, { recursive: true });
const UDID = process.env.FW_SIM_UDID; if (!UDID) throw new Error('not inside a sim session');
const DZ = Math.ceil((Date.now() + 3600e3) / 1000) * 1000;
const SLOW = `(() => { if (window.__fwSlow) return 1;
  const rp = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window);
  let s = 1, r0 = 0, b0 = 0, n = 0; const seen = new WeakSet();
  const map = (t) => (s === 1 ? t : b0 + (t - r0) * s);
  performance.now = () => map(rp()); window.requestAnimationFrame = (cb) => raf((ts) => cb(map(ts))); Date.now = () => ${DZ};
  const slowNew = () => { if (s !== 1) for (const a of document.getAnimations()) { if (seen.has(a)) continue; seen.add(a);
      try { const ct = a.currentTime; a.playbackRate = s; if (ct != null && ct > 0) a.currentTime = ct * s; n++; } catch (e) {} } };
  const tick = () => { slowNew(); raf(tick); }; raf(tick);
  window.__fwSlow = { start: (S) => { r0 = rp(); b0 = r0; s = S; for (const a of document.getAnimations()) { seen.add(a); try { a.playbackRate = S; } catch (e) {} } }, count: () => n };
  return 1; })()`;
const R = `(e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }`;
const GEOM = `JSON.stringify((() => { const R = ${R}; const n = document.querySelector('header.start-selling-top-nav');
  return { y: Math.round(scrollY), iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, sw: screen.width, sh: screen.height,
    m: n ? n.style.getPropertyValue('--morph') : null, cls: n ? n.className.replace(/svelte-\\S+/g, '').replace(/\\s+/g, ' ').trim() : null,
    nav: R(n), join: R(document.querySelector('.start-selling-top-nav-btn.is-earn')),
    lang: R(document.querySelector('.start-selling-top-nav-actions > .start-selling-language-switch-wrap')),
    logo: R(document.querySelector('.start-selling-top-nav-logo')) }; })())`;
const wheel = (dy) => `(() => { const e = new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`;
const res = { tool: 'art-join-closeup rec.mjs', at: new Date().toISOString(), rate: RATE, runs: [] };
const save = () => writeFileSync(join(OUT, `rec${process.env.TAG || ""}.json`), JSON.stringify(res, null, 1));
for (const spec of process.argv.slice(2)) {
  const [arm, mode] = spec.split(':'); const A = ARMS[arm]; if (!A || !['join', 'logo'].includes(mode)) { console.log('bad arm', spec); continue; }
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', ...(A.dir ? ['--overlay', A.dir] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, mode }; let c = null, vid = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = [sha12(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), sha12(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))].join('/');
    if (run.served !== A.pin) { run.void = run.served; console.log('VOID', spec, run.served, 'want', A.pin); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40; k++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await sleep(1500);
    const walkTo = async (y) => { for (let k = 0; k < 60; k++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight, T = Math.min(H, ${y}); window.scrollTo({ top: scrollY < T ? Math.min(T, scrollY + 400) : Math.max(T, scrollY - 400), behavior: 'instant' }); return Math.abs(scrollY - T) <= 1; })()`); await sleep(120); if (done) break; } };
    await walkTo(1e6); await sleep(2000); await walkTo(1e6); await sleep(1500);
    await c.evaluate(SLOW);
    run.rest = JSON.parse(await c.evaluate(GEOM));
    if (mode === 'logo') { run.openPrevented = await c.evaluate(wheel(120)); await sleep(1500); run.open = JSON.parse(await c.evaluate(GEOM)); }
    const mov = join(VID, `${arm}-${mode}${process.env.TAG || ""}.mov`); rmSync(mov, { force: true }); run.mov = mov;
    vid = spawn('xcrun', ['simctl', 'io', UDID, 'recordVideo', '--codec=h264', '--force', mov], { stdio: ['ignore', 'pipe', 'pipe'] });
    let vlog = ''; const started = new Promise((r) => { const on = (b) => { vlog += b; if (/Recording started/i.test(vlog)) r(Date.now()); }; vid.stdout.on('data', on); vid.stderr.on('data', on); setTimeout(() => r(null), 8000); });
    run.vidStartWall = await started; if (!run.vidStartWall) throw new Error('recordVideo did not start');
    await sleep(1500);
    run.wheelWall = Date.now();
    run.prevented = await c.evaluate(`(() => { window.__fwSlow.start(${RATE}); const e = new WheelEvent('wheel', { deltaY: ${mode === 'join' ? 120 : -120}, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`);
    await sleep(Math.round(900 / RATE) + 800);
    run.slowed = await c.evaluate('window.__fwSlow.count()');
    run.end = JSON.parse(await c.evaluate(GEOM));
    vid.kill('SIGINT'); await new Promise((r) => { vid.on('exit', r); setTimeout(r, 15000); }); vid = null;
    run.movBytes = existsSync(mov) ? readFileSync(mov).length : 0;
    console.log('REC', spec, run.served, 'mov', run.movBytes, 'slowed', run.slowed, 'wheel after start ms', run.wheelWall - run.vidStartWall, 'end m', run.end.m, run.end.cls);
  } catch (e) { run.error = String(e.stack || e); console.log(spec, 'error', run.error); }
  finally { if (vid) { vid.kill('SIGINT'); await sleep(2000); } try { c?.close(); } catch {} p.kill(); res.runs.push(run); save(); }
}
console.log('REC DONE');
process.exit(0);

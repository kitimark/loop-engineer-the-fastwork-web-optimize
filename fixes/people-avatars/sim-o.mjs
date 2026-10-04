// people-avatars: WebKit (iOS Simulator, Mobile Safari) render COUNTS for the People title's O (T-107 #1). No timing:
// Simulator times never count (F-084). Counts Timeline records (RenderingFrame, RecalculateStyles, Layout, Paint +
// painted area, Composite) in three windows, for two arms on the same build:
//   V  the build as served (--snap overlay on the baseline)
//   N  the same page with the O's transitions switched off (a style tag injected after load), the control
//   windows: open  = title scrolled to mid-screen, 3.5 s (the O opens 1.3 s after it enters and grows 0.92 s)
//            still = the next 2 s with the O open (nothing of the O moves)
//            close = title scrolled away (one jump down), 1.5 s (the O collapses 0.92 s)
// A warm pass (in, wait, out) runs first so lazy avatar images are loaded and decoded before the counted pass.
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/people-avatars/sim-o.mjs --snap <abs dir>
// Output: out/people-avatars/sim-o-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = arg('--snap');
if (!SNAP) throw new Error('--snap <abs snapshot dir> (e.g. out/snapshots/msbase-8c90da217745)');
const ARMS = (arg('--arms', 'V,N')).split(',');
const OUT = join(WT, 'out/people-avatars');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OFF = `.start-selling-future-people-o, .start-selling-future-people-o * { transition: none !important; }`;

async function server() {
  const st = join(OUT, 'serve-sim-o.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error('server did not start');
}
function count(records) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, paintMpx: 0, Composite: 0, layoutRoots: {}, paintClips: {} };
  const wh = (q) => (q ? `${Math.round(Math.abs(q[2] - q[0]))}x${Math.round(Math.abs(q[5] - q[1]))}` : '?');
  const walk = (r) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'Layout') { const k = wh(r.data?.root); c.layoutRoots[k] = (c.layoutRoots[k] || 0) + 1; }
    if (r.type === 'Paint') { const q = r.data?.clip; if (q) c.paintMpx += Math.abs((q[2] - q[0]) * (q[5] - q[1])) / 1e6; const k = wh(q); c.paintClips[k] = (c.paintClips[k] || 0) + 1; }
    for (const ch of r.children || []) walk(ch);
  };
  records.forEach(walk);
  c.paintMpx = +c.paintMpx.toFixed(2);
  return c;
}
const STATE = `(() => { const o = document.querySelector('.start-selling-future-people-o'); const r = o?.getBoundingClientRect();
  return { cls: o ? o.className.replace(/svelte-\\S+/g, '').trim() : null, w: r && Math.round(r.width), y: Math.round(scrollY),
    imgs: [...(o?.querySelectorAll('img') || [])].map((i) => i.complete && i.naturalWidth > 0).filter(Boolean).length }; })()`;

const s = await server();
const url = `http://localhost:${s.port}/`;
const res = { tool: 'people-avatars sim-o (fix-hero-exit-threaded)', snap: SNAP.replace(WT + '/', ''), startedAt: new Date().toISOString(), arms: {} };
try {
  for (const arm of ARMS) {
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url + '?arm=' + arm], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    if (arm === 'N') await c.evaluate(`(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(OFF)}; document.head.append(st); return 1; })()`);
    const geo = await c.evaluate(`(() => { const h = document.getElementById('future-heading'); const vh = innerHeight;
      const t = h.getBoundingClientRect().top + scrollY; return { vh, title: Math.round(t), above: Math.round(t - 2 * vh), mid: Math.round(t - vh / 2), below: Math.round(t + 1.5 * vh) }; })()`);
    const go = (y) => c.evaluate(`(window.scrollTo(0, ${y}), 0)`);
    // warm pass: images load and decode, the O opens once and closes
    await go(geo.above); await sleep(1500); await go(geo.mid); await sleep(4000); await go(geo.above); await sleep(2500);
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    const win = async (name, act, ms) => {
      recs = [];
      await c.send('Timeline.start', { maxCallStackDepth: 1 });
      if (act) await act();
      await sleep(ms);
      await c.send('Timeline.stop');
      await sleep(1200);
      const st = await c.evaluate(STATE);
      const n = count(recs);
      console.log(arm, name, JSON.stringify(n), JSON.stringify(st));
      return { ms, counts: n, records: recs.length, after: st };
    };
    const a = { geo, before: await c.evaluate(STATE), windows: {} };
    a.windows.open = await win('open', () => go(geo.mid), 3500);
    a.windows.still = await win('still', null, 2000);
    a.windows.close = await win('close', () => go(geo.below), 1500);
    res.arms[arm] = a;
    await c.send('Timeline.disable').catch(() => {});
    c.close();
  }
} finally { s.p.kill(); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-o-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

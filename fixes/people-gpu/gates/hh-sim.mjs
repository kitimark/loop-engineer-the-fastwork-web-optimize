// hero-covered-pause (fix-people-gpu): WebKit rest counts, COUNTS ONLY (Simulator ms never judged, F-084). Per arm
// (overlay dir, A = base, H = the hero pause), 2 s Timeline windows at rest: top (hero shown), covered (#people card
// over the hero, 120 px past its top edge, fade-in ended), page end (hero off screen). Per window: RenderingFrames,
// Layout (+ roots), Paint (+ rects), RecalculateStyles, and the hero's time-based animations running / paused.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 180 --owner fix-people-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-people-gpu -- node fixes/people-gpu/gates/hh-sim.mjs --arms <dirA>,<dirH>
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, runAsync } = await import(join(WT, 'tools/lib/wip.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || '').split(',').filter(Boolean);
if (!ARMS.length) throw new Error('--arms <dirA>,<dirH>');
const LABEL = arg('--label', 'hh');
const OUT = join(WT, 'out/people-gpu'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const wh = (q) => (q ? `${Math.round(Math.abs(q[2] - q[0]))}x${Math.round(Math.abs(q[5] - q[1]))}` : '?');
function count(recs) {
  const c = { frames: 0, layouts: 0, paints: 0, styles: 0, roots: {}, rects: {} };
  const walk = (r) => { if (r.type === 'RenderingFrame') c.frames++; else if (r.type === 'Layout') { c.layouts++; const k = wh(r.data?.root); c.roots[k] = (c.roots[k] || 0) + 1; } else if (r.type === 'Paint') { c.paints++; const k = wh(r.data?.clip); c.rects[k] = (c.rects[k] || 0) + 1; } else if (r.type === 'RecalculateStyles') c.styles++; for (const ch of r.children || []) walk(ch); };
  recs.forEach(walk);
  const top = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5));
  return { ...c, roots: top(c.roots), rects: top(c.rects) };
}
const HERO = `(() => { const t = document.querySelector('.hero-track'); const L = t.getAnimations({ subtree: true }).filter((a) => a.timeline === document.timeline); return { running: L.filter((a) => a.playState === 'running').length, paused: L.filter((a) => a.playState === 'paused').length }; })()`;
const res = { tool: 'fixes/people-gpu/gates/hh-sim.mjs', startedAt: new Date().toISOString(), arms: [] };
for (const [i, dir] of ARMS.entries()) {
  const st = join(OUT, `serve-hhs-${i}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm: basename(dir), windows: {} }; let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    const url = `http://localhost:${s.port}/?hh=${i}-${Date.now()}`;
    run.served = `js ${sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer()))} css ${sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))}`;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2000);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2500);
    const yV = await runAsync(c, `new Promise((res) => { let y = 0; const s = document.querySelector('section.start-selling-future'); const f = () => { if (s.classList.contains('is-visible') || y > 4000) return res(y); y += 12; window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(f)); }; f(); })`, { pollMs: 200, timeoutMs: 60000 });
    await sleep(1500);
    const cardTop = await c.evaluate(`Math.round(document.querySelector('.start-selling-future-card').getBoundingClientRect().top + scrollY)`);
    const max = await c.evaluate('document.documentElement.scrollHeight - innerHeight');
    run.geo = { yV, cardTop, max };
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START.slice(0, 4)) await c.send(m, prm);
    for (const [name, y, wait] of [['top', 0, 2500], ['covered', cardTop + 120, 2500], ['pageEnd', max, 3000], ['top again', 0, 2500]]) {
      await c.evaluate(`(window.scrollTo(0, ${y}), 0)`); await sleep(wait);
      recs.length = 0; await c.send('Timeline.start', { maxCallStackDepth: 1 }); await sleep(2000); await c.send('Timeline.stop'); await sleep(900);
      const n = count(recs); const h = await c.evaluate(HERO); run.windows[name] = { y, ...n, hero: h };
      console.log(run.arm, run.served, name.padEnd(10), `hero running ${h.running} paused ${h.paused} | frames ${n.frames} layouts ${n.layouts} paints ${n.paints} styles ${n.styles} roots ${JSON.stringify(n.roots)} rects ${JSON.stringify(n.rects)}`);
    }
  } catch (e) { run.error = String(e.stack || e); console.log(run.arm, 'ERROR', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); }
  res.arms.push(run);
}
const f = join(OUT, `hh-sim-${LABEL}-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);
process.exit(0);

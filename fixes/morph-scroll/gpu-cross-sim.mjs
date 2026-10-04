// PR-018 + morph-gpu rev 3 (user T-131): does capping #platform's opacity at 0.9999 remove the repaint where the morph
// leaves or returns to 0 in the scroll-driven build? Simulator only, counts only (no ms judged). Per arm, after one warm-up
// open and close: 3x "nudge" (jump to p 0.1; the settle scrolls back to 0, so it crosses 0 both ways), then 2x full open
// (jump to p 1) and close (jump to p 0). Per step: WebKit Timeline paints in [change - 17 ms, change + 1200 ms] (sum and
// the frame with the most paints). Method of fixes/morph-gpu/rev2/open-cause-sim.mjs (fix-morph-gpu), driven by scrollTo.
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/morph-scroll/gpu-cross-sim.mjs --snap <abs dir>,<abs dir>
// Output: out/morph-scroll/gpu-cross-sim-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAPS = (arg('--snap') || '').split(',').filter(Boolean);
if (!SNAPS.length) throw new Error('--snap <abs snapshot dir>[,<abs dir>]');
const OUT = join(WT, 'out/morph-scroll'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));
const STEPS = [['nudge', 0.1], ['nudge', 0.1], ['nudge', 0.1], ['open', 1], ['close', 0], ['open', 1], ['close', 0]];
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null, op: getComputedStyle(document.querySelector('.start-selling-platform')).opacity }; })()`;

function frameStats(recs, a, b) {
  const frames = [];
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const t = r.startTime * 1000; if (t < a || t >= b) continue;
    const o = { at: +(t - a).toFixed(1), paints: 0, kpx: 0, layouts: 0 };
    const walk = (x) => { if (x.type === 'Paint') { o.paints++; if (x.data?.clip) o.kpx += area(x.data.clip) / 1e3; } if (x.type === 'Layout') o.layouts++; for (const ch of x.children || []) walk(ch); };
    walk(r); o.kpx = Math.round(o.kpx); frames.push(o);
  }
  return { max: frames.reduce((m, f) => (!m || f.paints > m.paints ? f : m), null), nFrames: frames.length, paints: frames.reduce((s, f) => s + f.paints, 0), kpx: frames.reduce((s, f) => s + f.kpx, 0), layouts: frames.reduce((s, f) => s + f.layouts, 0) };
}

const res = { tool: 'morph-scroll gpu-cross-sim (fix-hero-exit-threaded)', startedAt: new Date().toISOString(), arms: [] };
for (const [i, snap] of SNAPS.entries()) {
  const st = join(OUT, `serve-gx-${i}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', snap, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { snap: basename(snap), steps: [] };
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    run.files = { js: sha(readFileSync(join(snap, NODE))), css: sha(readFileSync(join(snap, CSS))) };
    if (run.served.js !== run.files.js || run.served.css !== run.files.css) throw new Error('VOID: served files differ from the snapshot');
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2000);
    for (const f of [0.25, 0.5, 0.75, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
    const g = await c.evaluate(GEO);
    const yAt = (q) => Math.round(g.max - g.t + q * g.t);
    const jump = async (q) => c.evaluate(`(() => { window.scrollTo({ top: ${yAt(q)}, behavior: 'instant' }); return performance.now(); })()`);
    await jump(0); await sleep(1500);
    // warm-up: one open and close before counting (the first open after load is separate first-time work, morph-gpu)
    await jump(1); await sleep(1500); await jump(0); await sleep(1500);
    run.rest0 = await c.evaluate(GEO);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    const syncT = await c.evaluate(timelineSyncJs('gx-sync'));
    for (const [kind, q] of STEPS) {
      const tg = await jump(q);
      await sleep(1500);
      run.steps.push({ kind, q, tg, after: await c.evaluate(GEO) });
      await sleep(300);
    }
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    const syncTL = findTimeStamp(recs, 'gx-sync');
    if (syncTL == null) throw new Error('no sync');
    const off = syncTL * 1000 - syncT;
    for (const sp of run.steps) sp.tl = frameStats(recs, sp.tg + off - 17, sp.tg + off + 1200);
    for (const sp of run.steps) console.log(run.snap, sp.kind.padEnd(5), 'end p', sp.after.p, 'opacity', sp.after.op, '| paints', sp.tl.paints, 'kpx', sp.tl.kpx, 'layouts', sp.tl.layouts, '| max frame', JSON.stringify(sp.tl.max));
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.snap, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms.push(run);
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `gpu-cross-sim-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

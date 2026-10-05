// T-194 follow-up (fix-hero-exit-threaded, lead 2026-10-05): where along a swipe does WebKit lay out, and which part of the
// page makes it? Simulator, counts only (Simulator ms are descriptive, never a verdict; F-084). Per arm (snapshot dir, with
// an optional CSS file injected after load, as in split-sim.mjs): open, settle, then a scripted swipe 0 -> --to px at
// --px px per rAF (scrollTo, scroll events fire as with a finger, no toolbar change), WebKit Timeline on. Per 100 px bin of
// the y the frame drew: frames, outermost Layout records per frame and their summed duration, view-rooted (root wider
// than 400 px) Layouts, RecalculateStyles per frame, engine-scheduled vs script-scheduled style invalidations, Paint count.
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/morph-scroll/t194/swipe-sim.mjs \
//     --snap <abs dir>[@<css>][,...] [--to 6000] [--px 10] [--labels a,b]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--snap') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
if (!ARMS.length) throw new Error('--snap <abs dir>[@css][,...]');
const LABELS = (arg('--labels') || '').split(',');
const TO = +arg('--to', '6000'), FROM = +arg('--from', '0'), PX = +arg('--px', '10'), BIN = 100;
const OUT = join(WT, 'out/morph-scroll/t194'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const res = { tool: 't194 swipe-sim', startedAt: new Date().toISOString(), to: TO, px: PX, arms: [] };
for (const [i, arm] of ARMS.entries()) {
  const label = LABELS[i] || `arm${i}`;
  const armCss = arm.css ? readFileSync(arm.css, 'utf8') : null;
  const st = join(OUT, `serve-sw-${i}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', arm.dir, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { label, snap: basename(arm.dir) + (arm.css ? '@' + basename(arm.css) : '') };
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(4000);
    // an arm file ending in .js is evaluated in the page (it must leave an element with id sw-arm), else injected as CSS
    if (armCss && arm.css.endsWith('.js')) run.armResult = await c.evaluate(armCss);
    else if (armCss) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'sw-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
    if (FROM) { await c.evaluate(`window.scrollTo({ top: ${FROM}, behavior: 'instant' })`); await sleep(1500); }
    run.page = await c.evaluate(`({ ih: innerHeight, docH: document.documentElement.scrollHeight, heOn: !!document.querySelector('.hero-track.he-on'), gesture: 'GestureEvent' in window, arm: !!document.getElementById('sw-arm') })`);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(m, prm);
    await sleep(500);
    const syncT = await c.evaluate(timelineSyncJs('sw-sync'));
    await c.evaluate(`(() => { window.__sw = []; window.__swDone = false; let y = ${FROM}; const max = Math.min(${TO}, document.documentElement.scrollHeight - innerHeight); const up = max < y;
      const st = () => { y = up ? Math.max(max, y - ${PX}) : Math.min(max, y + ${PX}); window.scrollTo({ top: y, behavior: 'instant' }); __sw.push([performance.now(), y]); if (up ? y > max : y < max) requestAnimationFrame(st); else __swDone = true; };
      requestAnimationFrame(st); return 1; })()`);
    for (let k = 0; k < 200 && !(await c.evaluate('window.__swDone')); k++) await sleep(250);
    await sleep(1000);
    const sw = await c.evaluate('window.__sw');
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    const syncTL = findTimeStamp(recs, 'sw-sync');
    if (syncTL == null) throw new Error('no sync');
    const off = syncTL * 1000 - syncT;
    // y drawn by a RenderingFrame: the last scrollTo before the frame starts
    const yAt = (tl) => { const t = tl - off; let f = null; for (const e of sw) { if (e[0] <= t) f = e; else break; } return f ? f[1] : null; };
    const B = {};
    for (const r of recs) {
      if (r.type !== 'RenderingFrame') continue;
      // frames of the swipe only: from the first scrollTo to one frame after the last
      const y = yAt(r.startTime * 1000); if (y == null || r.startTime * 1000 - off > sw.at(-1)[0] + 20) continue;
      const k = Math.floor(y / BIN) * BIN;
      const o = (B[k] ||= { frames: 0, lay: 0, layMs: 0, layView: 0, rs: 0, rsMs: 0, schedEngine: 0, schedScript: 0, invLayEngine: 0, invLayScript: 0, paints: 0, longest: 0 });
      o.frames++;
      let fMs = 0;
      const walk = (x, inLR, inJS) => {
        const d = ((x.endTime ?? x.startTime) - x.startTime) * 1000;
        const js = inJS || x.type === 'FunctionCall' || x.type === 'EventDispatch' || x.type === 'TimerFire' || x.type === 'FireAnimationFrame' || x.type === 'ObserverCallback';
        if (x.type === 'Layout' && !inLR) { o.lay++; o.layMs += d; fMs += d; const q = x.data?.root || []; if (q.length && Math.abs(q[2] - q[0]) > 400) o.layView++; }
        if (x.type === 'RecalculateStyles' && !inLR) { o.rs++; o.rsMs += d; fMs += d; }
        if (x.type === 'ScheduleStyleRecalculation') js ? o.schedScript++ : o.schedEngine++;
        if (x.type === 'InvalidateLayout') js ? o.invLayScript++ : o.invLayEngine++;
        if (x.type === 'Paint') o.paints++;
        for (const ch of x.children || []) walk(ch, inLR || x.type === 'Layout' || x.type === 'RecalculateStyles', js);
      };
      walk(r, false, false);
      o.longest = Math.max(o.longest, fMs);
    }
    run.bins = B;
    writeFileSync(join(OUT, `tl-sw-${label}-${STAMP}.json`), JSON.stringify({ offsetMs: off, sw, recs }));
    console.log(`ARM ${label} ${run.snap} served ${run.served.js}/${run.served.css} page ${JSON.stringify(run.page)}${run.armResult ? " arm " + JSON.stringify(run.armResult) : ""} frames ${sw.length}`);
    for (const [k, o] of Object.entries(B).sort((a, b) => +a[0] - +b[0])) {
      const f = o.frames || 1;
      console.log(`  ${label} y ${String(k).padStart(5)} f ${String(o.frames).padStart(3)} | lay/f ${(o.lay / f).toFixed(2)} view/f ${(o.layView / f).toFixed(2)} layMs/f ${(o.layMs / f).toFixed(2)} | rs/f ${(o.rs / f).toFixed(2)} rsMs/f ${(o.rsMs / f).toFixed(2)} | sched eng/js ${(o.schedEngine / f).toFixed(2)}/${(o.schedScript / f).toFixed(2)} invLay eng/js ${(o.invLayEngine / f).toFixed(2)}/${(o.invLayScript / f).toFixed(2)} | paint/f ${(o.paints / f).toFixed(1)} | maxLR ${o.longest.toFixed(1)}`);
    }
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(label, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms.push(run);
}
const f = join(OUT, `swipe-sim-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

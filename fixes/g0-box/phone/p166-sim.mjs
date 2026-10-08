#!/usr/bin/env node
// P-166 stage 1 (card: fixes/g0-box/README.md "P-166"): Simulator COUNTS ONLY, no timing. For each arm (v0, e, f and the
// knock-outs enohe, fnowc, fnogl; servers from p166-serve.sh) and spot (A: the first scroll steps from the top; B: steps
// from 4000 to 5000 across the +is-play at about 4525), a fresh load, the W step pattern (scrollBy 250 px smooth every
// 300 ms, as iphone-run's S/W stimulus) under a WebKit Timeline on this script's own inspector connection (tools/ not
// changed: wip.mjs TIMELINE_START). A MutationObserver marks every class / data-fw-wc change with console.timeStamp
// ("p166:" + what), so the frame that holds a flip can be found in the records. Read by p166-read.mjs (counts per
// RenderingFrame: RecalculateStyles, Layout, Paint, Composite, records; never durations).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p166-sim.mjs [--reps 1] [arm:spot ...]
// Output: out/p166/sim/tl-<arm>-<spot>-<rep>.json ({arm, spot, rep, url, page, timelineStart, errors, recs}); runs.jsonl.
// Existing files are skipped (resume in the next session). Budget: $SB_BUDGET_S (default 270 s) per session.
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync, TIMELINE_START } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, 'out/p166/sim'); mkdirSync(D, { recursive: true });
export const ARMS = ['v0', 'e', 'f', 'enohe', 'fnowc', 'fnogl'];
export const SPOTS = { A: { from: 0, to: 750 }, B: { from: 4000, to: 5000 } };
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const errText = (e) => e?.message || JSON.stringify(e);

// the in-page driver: settle at `from`, idle, then the steps until scrollY >= to, hold 1 s; returns the flips and frames
export const DRIVER = (from, to) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const flips = [];
  const mo = new MutationObserver((ms) => { for (const m of ms) {
    const el = m.target; const id = (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
    const now = m.attributeName === 'class' ? el.className : el.getAttribute(m.attributeName);
    const was = m.oldValue || '';
    let what = m.attributeName;
    if (m.attributeName === 'class') { const a = new Set(String(was).split(/\\s+/)), b = new Set(String(now).split(/\\s+/));
      what = [...b].filter((x) => x && !a.has(x)).map((x) => '+' + x).concat([...a].filter((x) => x && !b.has(x)).map((x) => '-' + x)).join(' '); }
    else what = m.attributeName + '=' + now;
    if (!what) continue;
    const s = 'p166:' + id + ' ' + what; flips.push({ t: performance.now(), y: scrollY, s }); try { console.timeStamp(s); } catch (e) {}
  } });
  if (${from} > 0) { scrollTo(0, ${from}); await sleep(1000); }
  await sleep(3000);
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-fw-wc'] });
  const frames = []; let on = true; const raf = (t) => { frames.push([Math.round(t * 10) / 10, scrollY]); if (on) requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  const tStart = performance.now(); try { console.timeStamp('p166:start'); } catch (e) {}
  let n = 0; while (scrollY < ${to} && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(1000); on = false; mo.disconnect();
  try { console.timeStamp('p166:end'); } catch (e) {}
  return { tStart, steps: n, yEnd: scrollY, flips, frames, he: !!document.querySelector('.hero-track.he-css'), ua: navigator.userAgent.slice(0, 60) };
})()`;

async function capture(c, arm, spot, rep, url) {
  const ep = { recs: [], stopped: false, live: true, errors: [] };
  c.on((m) => { if (!ep.live) return; if (m.method === 'Timeline.eventRecorded' && m.params?.record) ep.recs.push(m.params.record); else if (m.method === 'Timeline.recordingStopped') ep.stopped = true; });
  for (const [method, params] of TIMELINE_START) { try { await c.send(method, params); } catch (e) { ep.errors.push(`${method}: ${errText(e)}`); } }
  let page = null; const sp = SPOTS[spot];
  try { page = await runAsync(c, DRIVER(sp.from, sp.to), { pollMs: 1000, timeoutMs: 40000, key: '__p166res' }); } catch (e) { ep.errors.push(`run: ${errText(e)}`); }
  try { await c.send('Timeline.stop'); } catch (e) { ep.errors.push(`Timeline.stop: ${errText(e)}`); }
  const t0 = Date.now(); while (!ep.stopped && !c.closed && Date.now() - t0 < 3000) await sleep(50);
  await sleep(500); ep.live = false;
  const out = { arm, spot, rep, url, page, timelineStart: TIMELINE_START, errors: ep.errors, recs: ep.recs };
  writeFileSync(join(D, `tl-${arm}-${spot}-${rep}.json`), JSON.stringify(out));
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2); const ri = args.indexOf('--reps'); const reps = ri >= 0 ? Number(args[ri + 1]) : 1;
  const only = args.filter((a, i) => a.includes(':') && (ri < 0 || i !== ri + 1));
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 270) * 1000;
  const plan = [];
  for (let rep = 1; rep <= reps; rep++) for (const spot of Object.keys(SPOTS)) for (const arm of ARMS) if (!only.length || only.includes(`${arm}:${spot}`)) plan.push({ arm, spot, rep });
  for (const { arm, spot, rep } of plan) {
    if (existsSync(join(D, `tl-${arm}-${spot}-${rep}.json`))) { console.log(`exists ${arm} ${spot} ${rep}`); continue; }
    if (budget - (Date.now() - t0) < 25000) { console.log(`STOP budget before ${arm} ${spot} ${rep}`); log({ step: `${arm}-${spot}-${rep}`, stop: 'budget' }); break; }
    const port = JSON.parse(readFileSync(join(WT, `out/p166/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p166=${arm}-${spot}-${rep}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    let c; try { c = await openTab((u) => u.includes(`p166=${arm}-${spot}-${rep}`)); } catch (e) { console.log(`STOP no tab for ${arm} ${spot}: ${errText(e)}`); log({ step: `${arm}-${spot}-${rep}`, stop: 'tab', open: o.status }); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    await sleep(2000);
    const r = await capture(c, arm, spot, rep, url);
    c.close();
    const flips = (r.page?.flips || []).map((f) => `${Math.round(f.y)}:${f.s.slice(5, 70)}`);
    log({ step: `${arm}-${spot}-${rep}`, ready, recs: r.recs.length, steps: r.page?.steps, yEnd: r.page?.yEnd, he: r.page?.he, flips: flips.length, errors: r.errors });
    console.log(`RUN ${arm} ${spot} ${rep}: ready ${ready} recs ${r.recs.length} steps ${r.page?.steps} yEnd ${r.page?.yEnd} he ${r.page?.he} flips ${flips.length}${r.errors.length ? ` errors ${r.errors.join('; ')}` : ''} t+${Math.round((Date.now() - t0) / 1000)} s`);
  }
}

#!/usr/bin/env node
// v8-double-drive (T-154): the WebKit leg of dd-probe.mjs, in the iOS Simulator (Safari), no timing claims.
// Same instrumentation (instr.mjs, injected after load, so load-time transitions are not seen), same sequence:
// one-viewport scripted scroll segments (scrollTo per rAF, then a hold), morph open/close by synthetic wheel at the
// end (positive control), one fast scroll back up. WebKit's Runtime.evaluate ignores awaitPromise, so each scroll
// segment sets a done flag that is polled. Writes raw-sim.json in dd-probe's format (analyze.mjs <dir> sim).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-v8-double-drive -- \
//     node tools/sim.mjs session --functional --owner de-v8-double-drive -- node research/v8-double-drive/probe/dd-sim.mjs [overlayDir] [speed]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTR } from './instr.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OVL = resolve(process.argv[2] || join(WT, 'fixes/v8-double-drive/overlay'));
const SPEED = +(process.argv[3] || 1200), HOLD = +(process.env.DD_HOLD || 1400);
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/v8-double-drive', `sim-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const START = (from, to, speed) => `(() => { window.__ddDone = 0; const raf = requestAnimationFrame.bind(window); const t0 = performance.now(), dist = ${to} - ${from}, dur = Math.abs(dist) / ${speed} * 1000;
  const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); scrollTo(0, ${from} + dist * k); if (k < 1) raf(step); else window.__ddDone = performance.now(); };
  raf(step); return t0; })()`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), performance.now())`;
const J = async (c, expr) => JSON.parse(await c.evaluate(`JSON.stringify(${expr})`));

const st = join(OUT, 'serve.json'); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', OVL, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
const run = { vp: 'sim', engine: 'webkit-simulator', segs: [], errors: [], http4xx: [] }; let c = null;
try {
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  const url = `http://localhost:${s.port}/`;
  run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  c = await openTab(`localhost:${s.port}`);
  for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
  await sleep(3000);
  await c.evaluate(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); return 1; })()`);
  await c.evaluate(INSTR + '; 1');
  run.viewport = await J(c, '({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, H: document.documentElement.scrollHeight })');
  const end = await J(c, 'document.documentElement.scrollHeight - innerHeight'); run.end = end;
  await c.evaluate('(window.__dd.sampleOn = true, window.__dd.phase = "idle", 1)'); await sleep(800);
  const segLen = run.viewport.h;
  const scroll = async (from, to, speed) => { const t0 = await J(c, START(from, to, speed)); for (let i = 0; i < 400; i++) { const d = await J(c, 'window.__ddDone'); if (d) return { t0, tStop: d }; await sleep(50); } throw new Error('scroll timeout'); };
  for (let y = 0, k = 0; y < end; y += segLen, k++) {
    const to = Math.min(end, y + segLen);
    await c.evaluate(`(window.__dd.phase = 'move', window.__dd.seg = ${k}, 1)`);
    const r = await scroll(y, to, SPEED);
    await c.evaluate(`(window.__dd.phase = 'hold', 1)`);
    run.segs.push({ k, from: y, to, ...r }); await sleep(HOLD);
  }
  const tOpen = await J(c, `(window.__dd.phase = 'morph-open', window.__dd.seg = 1000, ${WHEEL(120)})`); await sleep(1600);
  const tClose = await J(c, `(window.__dd.phase = 'morph-close', window.__dd.seg = 1001, ${WHEEL(-120)})`); await sleep(1600);
  run.morph = { tOpen, tClose };
  await c.evaluate(`(window.__dd.phase = 'up', window.__dd.seg = 2000, 1)`);
  const up = await scroll(end, 0, SPEED * 3); await c.evaluate(`(window.__dd.phase = 'hold-up', 1)`); await sleep(HOLD);
  run.up = up;
  await c.evaluate('(window.__dd.sampleOn = false, 1)');
  run.pairs = await J(c, 'window.__dd.durOf()');
  run.ev = await J(c, 'window.__dd.ev');
  run.samples = await J(c, 'window.__dd.samples');
  run.geo = await J(c, 'window.__dd.geo');
  run.errors = await J(c, 'window.__pxErr || []');
} catch (e) { run.void = String(e.stack || e); console.log('error', run.void); }
finally { try { c && c.close(); } catch {} p.kill(); }
writeFileSync(join(OUT, 'raw-sim.json'), JSON.stringify(run));
console.log(`sim served ${run.served?.js}/${run.served?.css} viewport ${JSON.stringify(run.viewport)} end ${run.end} segs ${run.segs.length} ev ${run.ev?.length} samples ${run.samples?.length} errors ${run.errors.length}`);
console.log('OUT', OUT);

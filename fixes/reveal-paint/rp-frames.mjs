#!/usr/bin/env node
// reveal-paint copy of fixes/people-blink/pb-frames.mjs (fix-scrollcb-g0; credit it): the lead's decisive check (2), blank
// photo boxes in the first frames after the reveal, g0.0l (L = out/g0-0m/snap/C) vs g0.0m (M = out/g0-0m/snap/V), served
// hashes pinned below (rp-v1 ran on g0.0m rev 1, CSS e439b72d4482; the pin is rev 2 now). Changes: the arms; RP_VLAND=1 records the LAND phases (PB_LAND=n land1 = P-174's flick shape,
// 300 px / 220 ms) in video mode instead of fling1-3 + slow; output under out/people-blink/<PB_TAG> (the only place a
// deck recording may be decoded, memory deck-recording-pictures); analysis: fixes/people-blink/pb-analyze.py.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-reveal-paint -- \
//     node tools/sim.mjs session --functional --owner fix-reveal-paint -- sh -c 'node tools/sim.mjs wda start && \
//     RP_VLAND=1 PB_LAND=2 PB_REFS=none node fixes/reveal-paint/rp-frames.mjs L:1 M:1 L:2 M:2'
// --- original header ---
// people-blink frame capture (fix-scrollcb-g0, 2026-10-09; user T-228 #124 "people section blink on g0.0j too, but less
// than g0.0i"). Simulator only, COUNTS AND PIXELS ONLY (no Simulator ms is a verdict, F-084).
// Per load: arm C = g0.0i (out/sticky-walk/snap-i/C) or V = g0.0j (snap-i/V), served plain http (--vendors=local,
// --latency 150, --no-cache, served hashes checked = VOID on mismatch); `sim.mjs open`; 4 s idle at the top; then
//  - a page logger: per rAF [performance.now, Date.now, scrollY] (rAF-only scrollY read, neutral per P-023), and a
//    MutationObserver over the whole document: class diffs everywhere, every other attribute (data-*, src, style...)
//    for elements inside #people or the hero, and the section-level data-start-selling-render flips; transition /
//    animation start/end events and img load events inside #people;
//  - the Simulator display recorded with `xcrun simctl io <udid> recordVideo` (the Simulator's own frames; not the
//    phone, no camera), h264, into out/people-blink/<tag>/<arm><rep>.mov, wall clock of "Recording started" kept;
//  - the drive, WDA-sim strokes (x 215): the phases below (PHASES); phase marks go to the logger (Date.now).
// Geometry at rest (top of the page): document boxes of #people, .start-selling-future-card, the avatar row, the
// profile deck, .hero-track, the people title. Analysis: fixes/people-blink/pb-analyze.py.
// Run (one functional Simulator session, shared lane, <= 300 s):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/people-blink/pb-frames.mjs C:1 V:1'
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMS = {};
for (const [arm, d, pj, pc] of [['L', 'C', '4106679e0a8a', '440582cec781'], ['M', 'V', '37af49aef32b', '7a8ecdd8f8e4']]) {
  const dir = join(WT, 'out/g0-0m/snap', d), js = sha(readFileSync(join(dir, JS))), css = sha(readFileSync(join(dir, CSS)));
  if (js !== pj || css !== pc) throw new Error('snapshot ' + arm + ' ' + js + ' / ' + css);
  ARMS[arm] = { dir, js, css };
}
// <arm>K: the same build with the #people card's reveal knocked out (attribution only, changes the look): a style sheet
// added after load holds the card at its shown state with no transition, so .is-visible changes nothing on screen
const KO_CSS = `.start-selling-future > .start-selling-future-card { visibility: visible !important; opacity: 0.999 !important; filter: blur(0px) !important; transition: none !important; }
.start-selling-future:not(.is-visible) > .start-selling-future-card { transform: translateY(0) !important; }`;
// <arm>D: the deck's own events knocked out (attribution only): the shells keep will-change: transform whatever their
// data-fw-wc window or the scene gate says (no layer is created or dropped as the deck nears), and the shell-hold
// visibility animation never runs
const KO_DECK = `.start-selling .start-selling-profile-shell, .start-selling [data-start-selling-scene] .start-selling-profile-shell, .start-selling .start-selling-profile-shell[data-fw-wc] { will-change: transform !important; animation: none !important; }`;
for (const a of Object.keys(ARMS)) { ARMS[a + 'K'] = { ...ARMS[a], ko: KO_CSS }; ARMS[a + 'D'] = { ...ARMS[a], ko: KO_DECK }; }
// PB_MODE=shots (lead 2026-10-09: the .mov files are not decoded until the user rules): no video; during fling1 and
// fling2 a burst of `simctl io screenshot` (sequential, each shot's wall-clock start/end kept), then rest references
// at scrollY 0, 300, ... 2400 (1.8 s settle each). PNGs in out/people-blink/<tag>/shots/.
const MODE = process.env.PB_MODE || 'video';

const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const ORDER = process.argv.slice(2).filter((a) => /^[A-Z]+:\d+$/.test(a));
if (!ORDER.length) { console.error('usage: pb-frames.mjs C:1 V:1 ...'); process.exit(1); }
const BASE = resolveTree('site-pretty');
const TAG = process.env.PB_TAG || new Date().toISOString().replace(/[:.]/g, '-');
const D = join(WT, 'out/people-blink', TAG); mkdirSync(D, { recursive: true });
const UDID = process.env.FW_SIM_UDID; if (!UDID) { console.error('no FW_SIM_UDID: run inside sim.mjs session'); process.exit(1); }
const BUDGET = Number(process.env.PB_BUDGET_S || 270) * 1000, T0 = Date.now(), PER_LOAD = 60000;

const S = (dir, px, ms, profile) => ({ type: 'stroke', dir, px, ms, profile });
const P = (ms) => ({ type: 'pause', ms });
// user T-228 #126: the blink is in .start-selling-profile-deck on a FAST scroll down from the hero to the people
// section. fling1 is the first entry after load (#people still deferred, the deck never laid out); before fling2 /
// fling3 / slow a script jump back to the top (scrollTo 0, 2.5 s rest) resets the position only (sections ahead of the
// user are never re-skipped, so those flings meet a rendered deck); slow = drags, the contrast case.
// PB_FLING="px,ms,n,gapMs" overrides the fling (default 480 px / 200 ms, 3 flicks, 250 ms apart).
const [FPX, FMS, FN, FGAP] = (process.env.PB_FLING || '480,200,3,250').split(',').map(Number);
const FLING = [...Array(FN)].flatMap(() => [S('up', FPX, FMS, 'fling'), P(FGAP)]);
// lead 2026-10-09 (user T-228 #143): the blink is ON the deck when a fast fling lands with the deck in view. LAND
// phases (shots mode): from the top, one or two flicks whose momentum should stop with the deck (doc y 1230-2074) on
// screen; the burst runs 3.5 s so it covers the landing and the second after it.
// PB_LAND=n (s5): n repeats of the land1 shape only (the only one that stopped with the deck in view in s4).
const LAND_ALL = [
  ['land1', [S('up', 300, 220, 'fling'), P(300)], 800],
  ['land2', [S('up', 400, 200, 'fling'), P(300)], 800],
  ['land3', [S('up', 300, 200, 'fling'), P(250), S('up', 300, 200, 'fling'), P(300)], 800],
  ['land4', [S('up', 500, 180, 'fling'), P(300)], 800],
];
// PB_SLOW=1 adds a slow phase after the landings: 3 slow drags of 520 px / 1200 ms from the top (the fade must stay).
const SLOW = [['slow', [...Array(3)].flatMap(() => [S('up', 520, 1200, 'drag'), P(300)]), 800]];
export const LAND0 = process.env.PB_LAND ? [...Array(Number(process.env.PB_LAND))].map((_, i) => ['land' + (i + 1), LAND_ALL[0][1], 800]) : LAND_ALL;
export const LAND = process.env.PB_SLOW ? [...LAND0, ...SLOW] : LAND0;
// PB_REFS="0,1300" overrides the reference shots ("none" skips them).
const REFS = process.env.PB_REFS === 'none' ? [] : (process.env.PB_REFS || '0,1000,1300,1600').split(',').map(Number);
export const PHASES = [
  ['fling1', FLING, 3000],
  ['fling2', FLING, 3000],
  ['fling3', FLING, 3000],
  ['slow', [...Array(5)].flatMap(() => [S('up', 520, 1200, 'drag'), P(300)]), 1500],
];

const INSTALL = `(() => {
  if (window.__pb) return 0;
  const L = window.__pb = { on: false, f: [], m: [], ev: [], mk: [] };
  const sy = Object.getOwnPropertyDescriptor(window, 'scrollY') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'scrollY');
  const Y = () => sy.get.call(window);
  const tick = () => { if (L.on) L.f.push([performance.now(), Date.now(), Y()]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const people = document.getElementById('people'), hero = document.querySelector('.hero-track') || document.querySelector('.hero');
  const inP = (el) => (people && people.contains(el)) || (hero && hero.contains(el));
  const nm = (el) => { if (!el || el.nodeType !== 1) return '?'; const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : (el.getAttribute('class') || '').split(/\\s+/).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
  new MutationObserver((ms) => { if (!L.on) return; const t = performance.now();
    for (const m of ms) { if (L.m.length >= 80000) return; const el = m.target, a = m.attributeName;
      if (a === 'class') {
        const o = new Set(String(m.oldValue || '').split(/\\s+/).filter(Boolean)), n = new Set(String(el.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
        const d = [...n].filter((c) => !o.has(c)).map((c) => '+' + c).concat([...o].filter((c) => !n.has(c)).map((c) => '-' + c)).join(' ');
        if (d) L.m.push([t, nm(el), 'class', d]);
      } else if (a === 'data-start-selling-render' || inP(el)) {
        const v = el.getAttribute(a); if (v === m.oldValue) continue;
        L.m.push([t, nm(el), a, String(v == null ? '(removed)' : v).slice(0, a === 'src' ? 200 : 90)]);
      } } })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true });
  for (const k of ['transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'])
    document.addEventListener(k, (e) => { if (L.on && L.ev.length < 40000 && people && people.contains(e.target)) L.ev.push([performance.now(), k, nm(e.target), e.propertyName || e.animationName || '']); }, { capture: true, passive: true });
  document.addEventListener('load', (e) => { if (L.on && e.target && e.target.tagName === 'IMG' && people && people.contains(e.target)) L.ev.push([performance.now(), 'imgload', nm(e.target), String(e.target.currentSrc || '').slice(-60)]); }, { capture: true });
  L.mark = (n) => L.mk.push([performance.now(), Date.now(), Y(), n]);
  return 1;
})()`;

const GEOM = `JSON.stringify((() => { const y = scrollY, box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top + y), Math.round(r.height), Math.round(r.left), Math.round(r.width)]; };
  return { y, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, perf0: performance.timeOrigin,
    people: box('#people'), card: box('.start-selling-future-card'), title: box('.start-selling-future-title'), avatars: box('#people .start-selling-avatars'),
    showcase: box('.start-selling-future-showcase'), deck: box('.start-selling-profile-deck'), hero: box('.hero-track'), pill: box('.start-selling-future-community-pill'), deckInCard: !!document.querySelector('.start-selling-future-card')?.contains(document.querySelector('.start-selling-profile-deck')), decks: document.querySelectorAll('.start-selling-profile-deck').length,
    render: [...document.querySelectorAll('[data-start-selling-render]')].map((e) => [e.id || e.className.split(' ')[0], e.getAttribute('data-start-selling-render')]) }; })())`;

const SH = join(D, 'shots'); mkdirSync(SH, { recursive: true });
const { execFile } = await import('node:child_process');
const shot = (f) => new Promise((res) => execFile('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { timeout: 10000 }, (e) => res(!e)));
async function shotsLoad(c, load, tag) {
  load.shots = []; load.refs = [];
  // deck photos already decoded-ready before the first fling (the B2/B3 preload): loaded / all, per shell
  load.pre = JSON.parse(await c.evaluate(`JSON.stringify([...document.querySelectorAll('#people .start-selling-profile-shell')].slice(0, 3).map((sh) => { const im = [...sh.querySelectorAll('img')].filter((i) => /post-|service-/.test(i.currentSrc || i.src || '')); return [im.filter((i) => i.complete && i.naturalWidth > 0).length, im.length]; }))`));
  await c.evaluate('(window.__pb.on = true, window.__pb.mark("start"), 1)');
  await sleep(400);
  for (const [name, prog, rest] of progsLand) {
    if (name !== 'land1') { await c.evaluate(`(window.__pb.mark(${JSON.stringify(name + ':reset')}), window.scrollTo(0, 0), 1)`); await sleep(2500); }
    await c.evaluate(`(window.__pb.mark(${JSON.stringify(name)}), 1)`);
    const end = Date.now() + 3500; let i = 0;
    const burst = (async () => { while (Date.now() < end) { const f = join(SH, `${tag}-${name}-${String(i++).padStart(2, '0')}.png`); const t0 = Date.now(); const ok = await shot(f); load.shots.push([name, f, t0, Date.now(), ok]); } })();
    for (const op of prog.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); }
    await burst;
    await c.evaluate(`(window.__pb.mark(${JSON.stringify(name + ':end')}), 1)`);
    await sleep(rest);
  }
  await c.evaluate('(window.__pb.mark("refs"), 1)');
  await c.evaluate('window.scrollTo(0, 0)'); await sleep(1500);
  for (const y of REFS) {
    await c.evaluate(`window.scrollTo(0, ${y})`); await sleep(1800);
    const f = join(SH, `${tag}-ref-${y}.png`); const t0 = Date.now(); const ok = await shot(f);
    load.refs.push([y, f, t0, Date.now(), ok, await c.evaluate('scrollY')]);
  }
  await c.evaluate('(window.__pb.mark("stop"), window.__pb.on = false, 1)');
  const Lg = JSON.parse(await c.evaluate('JSON.stringify({ f: window.__pb.f, m: window.__pb.m, ev: window.__pb.ev, mk: window.__pb.mk })'));
  Object.assign(load, Lg);
}
const { createSession } = await import(join(WT, 'tools/lib/wda.mjs'));
const { compileScript } = await import(join(WT, 'tools/lib/gesture.mjs'));
const progsLand = LAND.map(([name, steps, rest]) => [name, compileScript({ name: 'pb-' + name, version: 1, screen: [430, 932], params: { x: 215 }, steps }), rest]);
const progs = (process.env.RP_VLAND === '1' ? LAND : PHASES).map(([name, steps, rest]) => [name, compileScript({ name: 'pb-' + name, version: 1, screen: [430, 932], params: { x: 215 }, steps }), rest]);
const wda = await createSession({ base: process.env.PB_WDA || 'http://127.0.0.1:8101', simulator: true });
const OUT = join(D, 'pb.json');
const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { tool: 'fixes/reveal-paint/rp-frames.mjs', phases: (process.env.RP_VLAND === '1' ? LAND : PHASES).map(([n, s, r]) => [n, s, r]), loads: [] };
try {
  for (const Lk of ORDER) {
    const [arm, rep] = Lk.split(':');
    if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
    if (BUDGET - (Date.now() - T0) < PER_LOAD) { console.log(`STOP budget before ${Lk}`); break; }
    const st = join(D, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(ARMS[arm].dir ? ['--overlay', ARMS[arm].dir] : []), '--port', '0', '--quiet', '--no-cache',
      '--state', st, '--vendors=local', '--latency', '150', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, rep: Number(rep), startedAt: new Date().toISOString() };
    let c = null, vid = null;
    try {
      let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
      if (!s) throw new Error('server did not start');
      const base = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, base))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, base))).arrayBuffer())) };
      if (load.served.js !== ARMS[arm].js || load.served.css !== ARMS[arm].css) throw new Error('served ' + JSON.stringify(load.served));
      const key = `pb=${arm}${rep}-${Date.now()}`;
      process.env.FW_TAB_HOST = `localhost:${s.port}`;
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `${base}?${key}`], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env } });
      for (let i = 0; i < 8 && !c; i++) {
        let t; try { t = await openTab((u) => u.startsWith(base)); } catch (e) { if (i === 7) throw e; await sleep(1000); continue; }
        const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
        if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
      }
      if (!c) throw new Error('no fresh tab');
      for (let j = 0; j < 60 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(250);
      await c.evaluate(INSTALL);
      await sleep(4000);
      load.geom = JSON.parse(await c.evaluate(GEOM));
      if (!(load.geom.docH > 3 * load.geom.vh)) throw new Error('page did not render the app');
      if (ARMS[arm].ko) { load.ko = true; await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'pb-ko'; s.textContent = ${JSON.stringify(ARMS[arm].ko)}; document.head.appendChild(s); return 1; })()`); await sleep(300); }
      if (MODE === 'shots') { await shotsLoad(c, load, arm + rep); } else {
      const mov = join(D, `${arm}${rep}.mov`); rmSync(mov, { force: true }); load.mov = mov;
      vid = spawn('xcrun', ['simctl', 'io', UDID, 'recordVideo', '--codec=h264', '--force', mov], { stdio: ['ignore', 'pipe', 'pipe'] });
      let vlog = ''; const started = new Promise((res) => { const on = (b) => { vlog += b; if (/Recording started/i.test(vlog)) res(Date.now()); }; vid.stdout.on('data', on); vid.stderr.on('data', on); setTimeout(() => res(null), 8000); });
      load.vidStartWall = await started; load.vidLog0 = vlog.slice(0, 200);
      if (!load.vidStartWall) throw new Error('recordVideo did not start: ' + vlog.slice(0, 200));
      await c.evaluate('(window.__pb.on = true, window.__pb.mark("start"), 1)');
      await sleep(600);
      for (const [name, prog, rest] of progs) {
        if (name !== 'fling1') { await c.evaluate(`(window.__pb.mark(${JSON.stringify(name + ':reset')}), window.scrollTo(0, 0), 1)`); await sleep(2500); }
        await c.evaluate(`(window.__pb.mark(${JSON.stringify(name)}), 1)`);
        for (const op of prog.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); }
        await c.evaluate(`(window.__pb.mark(${JSON.stringify(name + ':end')}), 1)`);
        await sleep(rest);
      }
      await c.evaluate('(window.__pb.mark("stop"), window.__pb.on = false, 1)');
      await sleep(300);
      vid.kill('SIGINT'); await new Promise((res) => { vid.on('exit', res); setTimeout(res, 15000); }); load.vidLog = vlog.slice(-300); vid = null;
      const Lg = JSON.parse(await c.evaluate('JSON.stringify({ f: window.__pb.f, m: window.__pb.m, ev: window.__pb.ev, mk: window.__pb.mk })'));
      Object.assign(load, Lg, { endY: Lg.f.length ? Lg.f[Lg.f.length - 1][2] : null });
      }
    } catch (e) { load.void = 'error: ' + String(e.message || e); }
    finally { if (vid) { vid.kill('SIGINT'); await sleep(2000); } try { c && c.close(); } catch {} p.kill(); }
    rec.loads.push(load); writeFileSync(OUT, JSON.stringify(rec));
    console.log(`PB ${Lk} ${load.void || 'ok'} served ${load.served?.js}/${load.served?.css} frames ${load.f?.length} flips ${load.m?.length} ev ${load.ev?.length} people ${JSON.stringify(load.geom?.people)} vh ${load.geom?.vh} out ${OUT}`);
  }
} finally { await wda.close().catch(() => {}); }

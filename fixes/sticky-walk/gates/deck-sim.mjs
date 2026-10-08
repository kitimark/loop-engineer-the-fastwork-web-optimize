#!/usr/bin/env node
// sticky-walk gate 4 in the Simulator (fix-scrollcb-g0, 2026-10-09; lead's cqi gates "... and the Simulator"), WebKit,
// functional, no timing. Arms from out/sticky-walk/snap (HASHES.txt checked per load, a mismatch is VOID), load order
// A, V, A2, V2 with A = C (g0.0h) and V = V (g0.0h + fixcq); each load on its own server and origin (port 0, plain http,
// --no-cache, --vendors=local), Safari on the warm fw-sim 15 Pro Max (430 pt wide, DPR 3).
// Per load:
//   1. geometry at the top (geom0) and with the deck in view (geom): the deck's rect, clientWidth, scrollWidth, padding,
//      container-type; the six shells' rects, computed height, aspect-ratio and width; the document height.
//   2. snap: Date.now frozen, running non-transition animations paused (as px-sim.mjs); then real touch swipes through
//      WDA-sim (:8101; one finger, 300 ms move of 0.6 x the deck's clientWidth at the deck's centre) to each shell and back.
//      After each swipe and 1200 ms: scrollLeft, the index of the shell nearest the deck's centre, a `simctl io
//      screenshot` (whole screen).
//   3. avatar slider (PR-013 keep-st6): with the row in view, img names and classes every 250 ms for 6 s, and the rects.
// Scores: geometry and the scrollLeft sequence equal A vs V (and A vs A2); per swipe step pxlib scoreStop (A~V beyond the
// A~A2 mask, consistent over all four cross pairs); clusters with bbox top < 60 css px are the status bar (clock).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- sh -c 'node tools/sim.mjs wda start >/dev/null && \
//     node fixes/sticky-walk/gates/deck-sim.mjs'
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStop } from '../../v9-best/gates/pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const { createSession } = await import(join(WT, 'tools/lib/wda.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, process.env.PX_SNAP || 'out/sticky-walk/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const ARMS = [['A', 'C'], ['V', 'V'], ['A2', 'C'], ['V2', 'V']];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/sticky-walk/deck-sim', tag); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const SEL = '#profile-showcase .start-selling-profile-deck';
const GEOM = `(() => { const d = document.querySelector('${SEL}'); if (!d) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left * 64) / 64, Math.round((r.top + scrollY) * 64) / 64, Math.round(r.width * 64) / 64, Math.round(r.height * 64) / 64]; };
  const s = getComputedStyle(d);
  return JSON.stringify({ docH: document.documentElement.scrollHeight, deck: R(d), cw: d.clientWidth, sw: d.scrollWidth, pad: [s.paddingLeft, s.paddingRight], display: s.display, ct: s.containerType,
    shells: [...d.children].map((c) => { const cs = getComputedStyle(c); return [c.className.replace(/svelte-\\S+/g, '').trim(), R(c), cs.height, cs.aspectRatio, cs.width]; }) }); })()`;
const STATE = `JSON.stringify((() => { const d = document.querySelector('${SEL}'); const c = d.getBoundingClientRect().left + d.clientWidth / 2; let best = -1, bd = 1e9;
  [...d.children].forEach((e, i) => { const r = e.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - c); if (dd < bd) { bd = dd; best = i; } }); return [Math.round(d.scrollLeft), best, Math.round(scrollY)]; })())`;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const STALL = `(() => { if (window.__fwCarStall != null) return 'again'; const st = window.setTimeout; window.__fwCarStall = 0;
  window.setTimeout = function (fn, ms, ...a) { if ((ms === 800 || ms === 220) && typeof fn === 'function' && /indexOf\\(r\\)[\\s\\S]*splice\\(e, 1\\), t\\(\\)/.test(Function.prototype.toString.call(fn))) { window.__fwCarStall++; return 0; } return st.call(this, fn, ms, ...a); };
  return 'ok'; })()`;
const AV = `JSON.stringify([...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => (i.currentSrc || i.src).split('/').pop() + ':' + i.className.replace(/svelte-\\S+/g, '').trim()))`;
const stroke = (x0, x1, y) => ({ actions: [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: Math.round(x0), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 60 },
  { type: 'pointerMove', duration: 300, x: Math.round(x1), y: Math.round(y) }, { type: 'pointerUp', button: 0 }] }] });

const res = { tool: 'fixes/sticky-walk/gates/deck-sim.mjs', engine: 'webkit-simulator', startedAt: new Date().toISOString(), load1: loadavg()[0], loads: [], steps: [] };
const shots = {};
const wda = await createSession({ base: process.env.SCB_WDA || 'http://127.0.0.1:8101', simulator: true });
try {
  for (const [arm, d] of ARMS) {
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, build: d, swipes: [], errors: [] }; let c = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (load.served.js !== HX[`${d}/${NODE}`] || load.served.css !== HX[`${d}/${CSS}`]) { load.void = 'served ' + JSON.stringify(load.served); console.log('VOID', arm, load.void); continue; }
      process.env.FW_TAB_HOST = `localhost:${s.port}`;
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env } });
      c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      // DECK_STALL=1: stall the avatar slider (its 800/220 ms helper timers dropped, as px-sim.mjs PX_CAROUSEL=freeze), so no
      // image on the page changes its drawn size while the deck is shot (WebKit's page-wide ImageQualityController state)
      if (process.env.DECK_STALL === '1') load.stall = await c.evaluate(STALL);
      await sleep(2500);
      load.viewport = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, H: document.documentElement.scrollHeight })'));
      load.geom0 = JSON.parse(await c.evaluate(GEOM) || 'null');
      if (!load.geom0) throw new Error('no deck');
      await c.evaluate(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`);
      await c.evaluate(`(scrollTo({ top: ${load.geom0.deck[1] - 60}, behavior: 'instant' }), 1)`); await sleep(2600);
      load.geom = JSON.parse(await c.evaluate(GEOM) || 'null');
      load.frozen = JSON.parse(await c.evaluate(FREEZE)); await sleep(600);
      const dk = JSON.parse(await c.evaluate(`JSON.stringify((() => { const d = document.querySelector('${SEL}'); const r = d.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, d.clientWidth]; })())`));
      const cx = dk[0] + dk[2] / 2, cy = Math.max(dk[1], 0) + Math.min(dk[3], load.viewport.h - Math.max(dk[1], 0)) / 2, dx = dk[4] * 0.3;
      const snap1 = async (step) => { const f = join(OUT, `${arm}-${step}.png`); S.simctl(['io', cfg.udid, 'screenshot', f]); (shots[step] ||= {})[arm] = f; load.swipes.push({ step, st: JSON.parse(await c.evaluate(STATE)) }); };
      // DECK_LATE=<ms>: a second shot of each position <ms> later (step name + 'L'), to tell a settled frame from a transient one
      const snap = async (step) => { await snap1(step); if (+process.env.DECK_LATE > 0) { await sleep(+process.env.DECK_LATE); await snap1(step + 'L'); } };
      await snap('s0');
      const n = load.geom.shells.length;
      for (let i = 1; i < n; i++) { await wda.actions(stroke(cx + dx, cx - dx, cy)).catch((e) => load.errors.push('wda ' + e.message)); await sleep(1200); await snap('f' + i); }
      for (let i = n - 2; i >= 0; i--) { await wda.actions(stroke(cx - dx, cx + dx, cy)).catch((e) => load.errors.push('wda ' + e.message)); await sleep(1200); await snap('b' + i); }
      const avY = await c.evaluate(`(() => { const e = document.querySelector('.start-selling-avatars.is-carousel'); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.top + scrollY - innerHeight / 3); })()`);
      if (avY != null) { await c.evaluate(`(scrollTo({ top: ${avY}, behavior: 'instant' }), 1)`); await sleep(1500); load.avatars = []; for (let k = 0; k < 24; k++) { load.avatars.push(JSON.parse(await c.evaluate(AV))); await sleep(250); }
        load.avRect = await c.evaluate(`JSON.stringify([...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.left * 64) / 64, Math.round(r.width * 64) / 64, Math.round(r.height * 64) / 64]; }))`); }
    } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
    finally { try { c && c.close(); } catch {} p.kill(); res.loads.push(load); writeFileSync(join(OUT, 'deck.json'), JSON.stringify(res, null, 1)); }
    const g = load.geom;
    console.log(`load ${arm}: deck ${JSON.stringify(g?.deck)} cw ${g?.cw} sw ${g?.sw} ct ${g?.ct} shell h ${g?.shells?.[0]?.[2]} ar ${g?.shells?.[0]?.[3]} snaps ${load.swipes.map((w) => w.st[0] + '/' + w.st[1]).join(' ')} errors ${load.errors.length}${load.void ? ' VOID' : ''}`);
  }
} finally { await wda.close().catch(() => {}); }
const L = Object.fromEntries(res.loads.filter((l) => !l.void).map((l) => [l.arm, l]));
const geomKey = (g) => g && JSON.stringify({ docH: g.docH, deck: g.deck, cw: g.cw, sw: g.sw, shells: g.shells.map((s) => [s[1], s[2], s[4]]) });
const avSeq = (a) => (a || []).map((x) => JSON.stringify(x)).filter((x, i, arr) => i === 0 || x !== arr[i - 1]);
for (const [x, y] of [['A', 'V'], ['A', 'A2'], ['V', 'V2'], ['A2', 'V2']]) {
  const a = L[x], b = L[y]; if (!a || !b) { console.log(`${x}~${y} missing`); continue; }
  console.log(`${x}~${y}`.padEnd(6), 'geom', geomKey(a.geom) === geomKey(b.geom), 'geom0', geomKey(a.geom0) === geomKey(b.geom0),
    'snaps', JSON.stringify(a.swipes.map((w) => w.st.slice(0, 2))) === JSON.stringify(b.swipes.map((w) => w.st.slice(0, 2))),
    'avRects', a.avRect === b.avRect, 'avStates', avSeq(a.avatars).length + '/' + avSeq(b.avatars).length);
}
for (const [step, Sx] of Object.entries(shots)) {
  if (['A', 'V', 'A2', 'V2'].some((a) => !Sx[a])) { res.steps.push({ step, void: 'missing arm' }); continue; }
  const row = scoreStop(Sx, { V: [], V2: [] }, 3, 0);
  const pageCl = row.consistent.clusters.filter((k) => k.bboxCss[1] >= 60);
  res.steps.push({ step, AV: row.AV.beyondCssPx2, A2V2: row.A2V2.beyondCssPx2, consistent: row.consistent.beyondCssPx2, pageClusters: pageCl });
  console.log(`step ${step.padEnd(3)} A~V beyond A/A ${row.AV.beyondCssPx2} css px2  A2~V2 ${row.A2V2.beyondCssPx2}  consistent ${row.consistent.beyondCssPx2}  below status bar ${pageCl.reduce((t, k) => t + k.cssPx2, 0)}${pageCl[0] ? ' top ' + JSON.stringify(pageCl[0]) : ''}`);
}
res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
writeFileSync(join(OUT, 'deck.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'deck.json'));

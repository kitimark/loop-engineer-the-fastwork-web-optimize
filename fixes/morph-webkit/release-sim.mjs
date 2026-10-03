// Pin-release probe on the iOS Simulator (fix-nav-morph, C-026 follow-up; counts only, Simulator ms never count, F-084).
// Question: what does the frame cost in which the page starts to scroll back up from the end pin after the morph has
// closed (C-026: st6-rb2 84 ms at y 5141 with innerHeight still 815, Original 33 ms)? Is the morph at 0 then, and do the
// records in that frame come from the release (morph-end DOM writes) or from a toolbar (dvh) change?
// Per page load, three sequences, each under its own Timeline window:
//   A noMorph:  at the end pin, no morph; scroll up 40 frames x 8 px (programmatic: no toolbar change).
//   B release:  wheel +120 opens the morph (synthetic WheelEvent on window: the page's own wheel handler, A()), hold,
//               wheel -120 closes it; in the first rAF where the page has written --morph 0, start the same scroll
//               (stands in for the finger's next, no longer prevented touchmove).
//   C late:     as B, but the scroll starts 1000 ms after --morph reached 0 (separates morph-end work from the scroll).
// Logger (page side, rAF only; no style or layout reads): per frame [t, dt, scrollY, innerHeight, morph], morph from a
// MutationObserver on the nav's style attribute (--morph, written by the page). The same MutationObserver logs
// attribute writes on <html> (style), the nav (class), #platform (style) and [data-start-selling-scene] (scene, inert,
// aria-hidden), with times. Timeline records are mapped onto page time by a console.timeStamp calibration.
// Usage (a normal or functional Simulator session; it sends no gestures):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/morph-webkit/release-sim.mjs orig,st6rb2,st6rb2,orig
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/release-sim'); mkdirSync(OUT, { recursive: true });
const ARMDEF = {
  orig: { overlay: null, js: '22b5', css: null }, // baseline; hashes checked against site-pretty below
  st6rb2: { overlay: join(WT, 'out/snapshots/st6-rb2-7bf7c4657d21'), js: '7bf7c4657d21f1e94c666d582efccda65f20a5498626d22964bfbc5e35124f7a', css: 'f523598b2a24ede87f745d8b6d3b7c61e113559cc6dfdb35744b20bdbcffda97' },
};
const ARMS = (process.argv[2] || 'orig,st6rb2,st6rb2,orig').split(',');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const BASE = resolveTree('site-pretty');
ARMDEF.orig.js = sha(readFileSync(join(BASE, NODE))); ARMDEF.orig.css = sha(readFileSync(join(BASE, CSS)));

const INSTALL = `(() => {
  const L = window.__rl = { f: [], ev: [], m: null, armed: 0, wasOpen: false, scroll: null, scrollAt: null, zeroAt: null };
  const nav = document.querySelector('header.start-selling-top-nav');
  const mv = () => { const m = /--morph:\\s*([0-9.e+-]+)/.exec(nav?.getAttribute('style') || ''); return m ? +m[1] : null; };
  L.m = mv();
  const name = (el) => el === document.documentElement ? 'html' : el === nav ? 'nav' : el.matches('.start-selling-platform') ? 'platform' : 'scene';
  const mo = new MutationObserver((ms) => { const t = performance.now(); L.m = mv(); if (L.m > 0.001) L.wasOpen = true;
    if (L.wasOpen && L.m === 0 && L.zeroAt === null) L.zeroAt = t;
    for (const r of ms) { const el = r.target, a = r.attributeName; let v = el.getAttribute(a);
      if (el === nav && a === 'style') v = 'm=' + L.m; if (el === nav && a === 'class') v = String(v).split(' ').filter((c) => c.startsWith('is-')).join(' ');
      L.ev.push([Math.round(t * 10) / 10, name(el), a, String(v).slice(0, 100)]); } });
  const opt = { attributes: true, attributeFilter: ['style', 'class', 'inert', 'data-start-selling-scene', 'aria-hidden'] };
  mo.observe(document.documentElement, opt); nav && mo.observe(nav, opt);
  const pf = document.querySelector('.start-selling-platform'); pf && mo.observe(pf, opt);
  for (const s of document.querySelectorAll('[data-start-selling-scene]')) if (s.closest('header')) mo.observe(s, opt);
  let last = 0;
  const tick = (t) => { const now = performance.now();
    if (L.armed === 1 && L.zeroAt !== null) { L.armed = 0; L.scroll = 40; L.scrollAt = now; }
    if (L.armed === 2 && L.zeroAt !== null && now - L.zeroAt >= 1000) { L.armed = 0; L.scroll = 40; L.scrollAt = now; }
    if (L.scroll > 0) { window.scrollBy({ top: -8, behavior: 'instant' }); L.scroll--; }
    L.f.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), innerHeight, L.m]); last = t;
    if (L.on) requestAnimationFrame(tick); };
  L.start = () => { L.on = true; L.f = []; L.ev = []; L.zeroAt = null; L.wasOpen = false; L.scroll = null; L.scrollAt = null; requestAnimationFrame(tick); };
  L.stop = () => { L.on = false; };
  L.wheel = (d) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, cancelable: true, bubbles: true }));
  return nav ? 'ok' : 'no nav'; })()`;

const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
function flatten(records) {
  const out = []; const frames = []; let fi = -1;
  const walk = (r, f) => { out.push({ type: r.type, start: r.startTime * 1000, dur: ms(r), data: r.data, frame: f }); for (const c of r.children || []) walk(c, f); };
  for (const r of records.slice().sort((a, b) => a.startTime - b.startTime)) { if (r.type === 'RenderingFrame') { fi = frames.length; frames.push({ start: r.startTime * 1000, dur: ms(r) }); walk(r, fi); } else walk(r, -1); }
  return { recs: out, frames };
}
const TYPES = ['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FireAnimationFrame', 'EventDispatch', 'TimerFire'];

async function seq(c, kind) {
  const ev = (e) => c.evaluate(e);
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await ev("(scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 0)"); await sleep(2500);
  const y0 = await ev('scrollY');
  recs = [];
  await c.send('Timeline.start', { maxCallStackDepth: 2 });
  await ev(`(__rl.start(), console.timeStamp('rlcal ' + performance.now()), 0)`);
  await sleep(300);
  if (kind === 'noMorph') { await ev('(__rl.scroll = 40, __rl.scrollAt = performance.now(), 0)'); await sleep(1500); }
  else {
    await ev('(__rl.wheel(120), 0)'); await sleep(1800);
    const open = await ev('__rl.m');
    await ev(`(__rl.armed = ${kind === 'release' ? 1 : 2}, __rl.wheel(-120), 0)`);
    await sleep(kind === 'release' ? 2000 : 3000);
    if ((await ev('__rl.m')) !== 0) console.error(kind, 'morph not back at 0; open was', open);
  }
  await ev('(__rl.stop(), 0)');
  await c.send('Timeline.stop'); await sleep(400);
  const L = JSON.parse(await ev('JSON.stringify({ f: __rl.f, ev: __rl.ev, zeroAt: __rl.zeroAt, scrollAt: __rl.scrollAt })'));
  const fl = flatten(recs);
  const cal = fl.recs.find((r) => r.type === 'TimeStamp' && /^rlcal /.test(r.data?.message || ''));
  if (!cal) return { kind, error: 'no calibration TimeStamp', frames: fl.frames.length };
  const off = cal.start - Number(cal.data.message.split(' ')[1]);
  // per logger frame: the RenderingFrame that contains its rAF time
  const rf = (t) => { const T = t + off; let k = fl.frames.findIndex((f) => f.start <= T && T <= f.start + f.dur + 0.5); return k; };
  const at = L.scrollAt ?? 0;
  const i0 = L.f.findIndex((f) => f[0] >= at);
  const win = L.f.slice(Math.max(1, i0 - 6), i0 + 14);
  const rows = win.map((f, j) => {
    const k = rf(f[0]); const rs = k >= 0 ? fl.recs.filter((r) => r.frame === k) : [];
    const cnt = Object.fromEntries(TYPES.map((t) => [t, rs.filter((r) => r.type === t).length]));
    const durs = Object.fromEntries(['RecalculateStyles', 'Layout', 'Paint', 'Composite'].map((t) => [t, Math.round(rs.filter((r) => r.type === t).reduce((s, r) => s + r.dur, 0) * 10) / 10]));
    const prev = win[j - 1]?.[0] ?? f[0] - f[1];
    const evs = L.ev.filter((e) => e[0] > prev && e[0] <= f[0]).map((e) => `${e[1]}.${e[2]}=${e[3]}`);
    return { rel: Math.round(f[0] - at), dt: f[1], y: f[2], h: f[3], m: f[4], frameMs: k >= 0 ? Math.round(fl.frames[k].dur * 10) / 10 : null, cnt, simMs: durs, writes: evs };
  });
  return { kind, y0, zeroToScrollMs: L.zeroAt != null && L.scrollAt != null ? Math.round(L.scrollAt - L.zeroAt) : null, frames: fl.frames.length, rows,
    morphEndWrites: L.zeroAt != null ? L.ev.filter((e) => Math.abs(e[0] - L.zeroAt) < 60).map((e) => `${Math.round(e[0] - L.zeroAt)}ms ${e[1]}.${e[2]}=${e[3]}`) : [] };
}

const res = { tool: 'fix-nav-morph release-sim', note: 'Simulator: counts only (F-084)', startedAt: new Date().toISOString(), order: ARMS, runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(def.overlay ? ['--overlay', def.overlay] : []), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== def.js || css !== def.css) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    const inst = await c.evaluate(INSTALL);
    await c.send('Page.disable'); await c.send('Page.enable');
    await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    const run = { arm, served: { js: js.slice(0, 12), css: css.slice(0, 12) }, install: inst, ua: await c.evaluate('navigator.userAgent'), vp: await c.evaluate('[innerWidth, innerHeight, devicePixelRatio]'), seqs: [] };
    for (const k of ['noMorph', 'release', 'late']) {
      try { const r = await seq(c, k); run.seqs.push(r);
        const R = r.rows || []; const s0 = R.findIndex((x) => x.rel >= 0);
        console.log(`${arm} ${k}: zero->scroll ${r.zeroToScrollMs} ms; frames around scroll start:`, R.slice(Math.max(0, s0 - 2), s0 + 4).map((x) => `[${x.rel} dt${x.dt} y${x.y} h${x.h} m${x.m} S${x.cnt?.RecalculateStyles} L${x.cnt?.Layout} P${x.cnt?.Paint} ${x.writes.join(',')}]`).join(' '));
      } catch (e) { run.seqs.push({ kind: k, error: String(e.message || e) }); console.error(arm, k, e.message); }
    }
    await c.send('Timeline.disable').catch(() => {});
    res.runs.push(run); c.close();
  } finally { p.kill(); }
}
const f = join(OUT, `release-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);

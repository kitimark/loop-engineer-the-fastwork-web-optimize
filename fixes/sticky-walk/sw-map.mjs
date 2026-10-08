#!/usr/bin/env node
// sticky-walk static cost map (fix-scrollcb-g0, 2026-10-09). Simulator, COUNTS and record durations for attribution only
// (no Simulator ms is a verdict, F-084). Question (D card): the big finger-down layouts on the approach need a sticky
// box (Sim G knock-outs: .hero + .pain-sticky relative 135-150 -> 19-20 per run) but sit only at y 0-2000 and 3200-3600.
// What does the layout that the sticky mark triggers walk, per y?
// Method: g0.0h (immutable snapshot out/sticky-walk/snap/C, hashes checked per load). At each y of --ys (default 0..4600 step
// 200): scrollTo(y) (instant), 700 ms settle, then --nudges times: scrollTo(y + 1), 300 ms window, scrollTo(y), 300 ms
// window. A programmatic scroll moves the layout viewport (LocalFrameView::updateLayoutViewport ->
// setLayoutViewportOverrideRect / setBaseLayoutViewportOrigin -> setViewportConstrainedObjectsNeedLayout), so every
// nudge window holds the sticky-triggered layout plus whatever the page's scroll handlers do; the knock-out arms
// (--ko, CSS added after settle; attribution only, they change the look) split the two.
// Per window: Layout records (any nesting) count, max and sum ms, count >= 5 ms; RecalculateStyles sum.
// Mechanism check per y and arm (after the windows, outside them): computed position of .hero / .pain-sticky, their
// rect tops, scrollY; and once per load the census of rendered sticky/fixed boxes (computed position, rendered or not).
// usage (one functional Simulator session, shared lane, <= 300 s):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- \
//     node fixes/sticky-walk/sw-map.mjs --out out/sticky-walk/map.json base:1 nosticky:1
// --out accumulates loads; a load already in the file (same ko:rep) is skipped. --selftest checks the window analysis.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js';
const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const PIN = ['9162843e750f', '26d28a0a263b']; // g0.0h
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const argv = process.argv.slice(2);
const VALUED = ['--out', '--ys', '--nudges'];
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

export const KO = {
  base: '',
  nosticky: '.hero, .pain-sticky { position: relative !important; }',
  heroonly: '.pain-sticky { position: relative !important; }',
  painonly: '.hero { position: relative !important; }',
  heroempty: '.hero > * { display: none !important; }',
  painempty: '.pain-sticky > * { display: none !important; }',
  // hero is the only sticky box; is its cost inside its subtree (heroempty1) or in the walk above it (herocontain1)?
  heroempty1: '.pain-sticky { position: relative !important; } .hero > * { display: none !important; }',
  herocontain1: '.pain-sticky { position: relative !important; } .hero { contain: size layout !important; }',
  herocontain: '.hero, .pain-sticky { contain: size layout !important; }',
  // hero sticky alone, one section removed: which subtree outside the hero holds the walk's cost?
  hnopain: 'section.pain { display: none !important; }',
  hnocomm: '.pain-sticky { position: relative !important; } section[aria-labelledby="commission-heading"] { display: none !important; }',
  hnoprofile: '.pain-sticky { position: relative !important; } #profile-showcase { display: none !important; }',
  hnopeople: '.pain-sticky { position: relative !important; } #people { display: none !important; }',
  hnoplatform: '.pain-sticky { position: relative !important; } #platform { display: none !important; }',
  // inside #profile-showcase (hero sticky alone): the deck, its shells' aspect ratio, their percent heights, the shell count
  pnodeck: '.pain-sticky { position: relative !important; } #profile-showcase .start-selling-profile-deck { display: none !important; }',
  pnoar: '.pain-sticky { position: relative !important; } #profile-showcase .start-selling-profile-shell { aspect-ratio: auto !important; height: 900px !important; }',
  pnopct: '.pain-sticky { position: relative !important; } #profile-showcase .start-selling-profile-panel, #profile-showcase .start-selling-profile-body { height: auto !important; }',
  ponlyactive: '.pain-sticky { position: relative !important; } #profile-showcase .start-selling-profile-shell:not(.is-active-shell) { display: none !important; }',
  // both sticky boxes kept; the deck shells' height given without aspect-ratio (fixpx: the 430 px value; fixcq: the
  // general form through a container unit on the deck)
  fixpx: '#profile-showcase .start-selling-profile-shell { aspect-ratio: auto !important; height: 844.078125px !important; }',
  fixcq: '#profile-showcase .start-selling-profile-deck { container-type: inline-size; } #profile-showcase .start-selling-profile-shell { aspect-ratio: auto !important; height: calc(100cqi * 764 / 353) !important; }',
};

/** windows: [[t0, t1, label]] in page ms; recs: Timeline records; off: Timeline ms - page ms. Exported for the selftest. */
export function windowStats(recs, off, windows) {
  const flat = []; const walk = (r) => { if (r.type === 'Layout' || r.type === 'RecalculateStyles') flat.push(r); for (const c of r.children || []) walk(c); };
  for (const r of recs) walk(r);
  return windows.map(([a, b, label]) => {
    const s = { label, n: 0, max: 0, sum: 0, n5: 0, style: 0 };
    for (const r of flat) {
      const t = r.startTime * 1000 - off; if (t < a || t >= b) continue;
      const d = ((r.endTime ?? r.startTime) - r.startTime) * 1000;
      if (r.type === 'Layout') { s.n++; s.sum += d; if (d > s.max) s.max = d; if (d >= 5) s.n5++; } else s.style += d;
    }
    s.max = Math.round(s.max * 10) / 10; s.sum = Math.round(s.sum * 10) / 10; s.style = Math.round(s.style * 10) / 10;
    return s;
  });
}

function selftest() {
  const recs = [{ type: 'RenderingFrame', startTime: 1.0, endTime: 1.02, children: [{ type: 'Layout', startTime: 1.001, endTime: 1.008 }, { type: 'RecalculateStyles', startTime: 1.01, endTime: 1.012 }] },
    { type: 'RenderingFrame', startTime: 1.5, endTime: 1.51, children: [{ type: 'Layout', startTime: 1.5, endTime: 1.501 }] }];
  const w = windowStats(recs, 0, [[990, 1300, 'a'], [1300, 1600, 'b']]);
  const ok = w[0].n === 1 && w[0].n5 === 1 && w[0].max === 7 && w[0].style === 2 && w[1].n === 1 && w[1].n5 === 0;
  console.log(ok ? 'SELFTEST ok (windows, n5, max, style)' : 'SELFTEST FAIL ' + JSON.stringify(w));
  return ok ? 0 : 1;
}
if (argv.includes('--selftest')) process.exit(selftest());

const OUT = arg('--out');
const ORDER = argv.filter((a, i) => /^[a-z0-9]+:\d+$/.test(a) && !VALUED.includes(argv[i - 1]));
const YS = (arg('--ys') || Array.from({ length: 24 }, (_, i) => i * 200).join(',')).split(',').map(Number);
const NUDGES = Number(arg('--nudges', 2));
if (!OUT || !ORDER.length || ORDER.some((k) => !(k.split(':')[0] in KO))) { console.error('usage: sw-map.mjs --out <file> [--ys a,b,..] [--nudges N] <ko>:<rep> ...  (ko: ' + Object.keys(KO).join(' ') + ')'); process.exit(1); }

const { openTab, sleep, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const SNAP = join(WT, 'out/sticky-walk/snap/C');
const got = [JS, CSS].map((f) => sha(readFileSync(join(SNAP, f))));
if (got.join() !== PIN.join()) { console.error(`snapshot ${got.join(' / ')}, pinned ${PIN.join(' / ')}`); process.exit(3); }
const BASE = resolveTree('site-pretty');
const D = join(WT, 'out/sticky-walk/sim'); mkdirSync(D, { recursive: true });
const BUDGET = Number(process.env.SW_BUDGET_S || 280) * 1000, T0 = Date.now();
const PER_LOAD = (YS.length * (0.75 + NUDGES * 0.62) + 22) * 1000;

const CENSUS = `(() => { const out = []; const nm = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 2).join('.') : '');
  for (const e of document.querySelectorAll('body *')) { const p = getComputedStyle(e).position; if (p !== 'sticky' && p !== 'fixed') continue;
    out.push([nm(e), p, e.getClientRects().length > 0 ? 1 : 0]); } return JSON.stringify(out); })()`;
const DRIVE = (ys, nudges) => `(() => { window.__sw = null; const W = [], S = []; const ys = ${JSON.stringify(ys)};
  const st = (sel) => { const e = document.querySelector(sel); if (!e) return null; return [getComputedStyle(e).position, Math.round(e.getBoundingClientRect().top)]; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => { for (const y of ys) { scrollTo({ top: y, behavior: 'instant' }); await wait(700);
      for (let k = 0; k < ${nudges}; k++) { let t = performance.now(); scrollTo({ top: y + 1, behavior: 'instant' }); await wait(300); W.push([t, performance.now(), y + ':up' + k]);
        t = performance.now(); scrollTo({ top: y, behavior: 'instant' }); await wait(300); W.push([t, performance.now(), y + ':back' + k]); }
      S.push([y, Math.round(scrollY), st('.hero'), st('.pain-sticky')]); await wait(80); }
    window.__sw = { W, S }; })(); return 1; })()`;

for (const Lk of ORDER) {
  const [ko, rep] = Lk.split(':');
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { tool: 'fixes/sticky-walk/sw-map.mjs', build: 'g0.0h', pin: PIN, loads: [] };
  if (prev.loads.some((l) => l.ko === ko && l.rep === Number(rep) && !l.void)) { console.log(`exists ${Lk}`); continue; }
  if (BUDGET - (Date.now() - T0) < PER_LOAD) { console.log(`STOP budget before ${Lk}`); break; }
  const stf = join(D, 'serve-map.json'); rmSync(stf, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', SNAP, '--port', '0', '--quiet', '--no-cache',
    '--state', stf, '--vendors=local', '--latency', '150', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { ko, rep: Number(rep), css: KO[ko], ys: YS, nudges: NUDGES, startedAt: new Date().toISOString() };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(stf)) try { s = JSON.parse(readFileSync(stf, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const base = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, base))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, base))).arrayBuffer())) };
    if (load.served.js !== PIN[0] || load.served.css !== PIN[1]) throw new Error('served ' + JSON.stringify(load.served));
    const key = `swm=${ko}${rep}-${Date.now()}`;
    process.env.FW_TAB_HOST = `localhost:${s.port}`;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `${base}?${key}`], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env } });
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(base)); } catch (e) { if (i === 7) throw e; await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) throw new Error('no fresh tab');
    for (let j = 0; j < 60 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(250);
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    if (!(load.viewport.docH > 3 * load.viewport.height)) throw new Error('page did not render the app (doc ' + load.viewport.docH + ')');
    if (KO[ko]) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'sw-ko'; s.textContent = ${JSON.stringify(KO[ko])}; document.head.appendChild(s); return 1; })()`);
    await sleep(4000);
    load.census = JSON.parse(await c.evaluate(CENSUS));
    // SW_DUMP=<selector>: a compact tree of that subtree (depth 7): tag.class, display, position, overflow, w x h, children
    if (process.env.SW_DUMP) load.dump = JSON.parse(await c.evaluate(`(() => { const out = []; const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 3).join('.') : '');
      const go = (e, d) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push('  '.repeat(d) + nm(e) + ' ' + s.display + ' ' + s.position + ' ' + s.overflowX + '/' + s.overflowY + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ar=' + s.aspectRatio + ' h=' + s.height + ' n=' + e.children.length);
        if (d < 7 && out.length < 400) for (const c of e.children) go(c, d + 1); };
      const root = document.querySelector(${JSON.stringify(process.env.SW_DUMP)}); if (root) { let p = root.parentElement, chain = []; while (p) { const s = getComputedStyle(p); chain.push(nm(p) + ' ' + s.display + ' h=' + s.height); p = p.parentElement; } out.push('ancestors: ' + chain.join(' < ')); go(root, 0); } return JSON.stringify(out); })()`));
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, pr] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 1 }]]) await c.send(m, pr).catch(() => {});
    const syncT = await c.evaluate(timelineSyncJs('swmsync'));
    await c.evaluate(DRIVE(YS, NUDGES));
    let r = null; const lim = Date.now() + YS.length * (1 + NUDGES * 0.7) * 1000 + 15000;
    while (!r && Date.now() < lim) { await sleep(1000); r = JSON.parse(await c.evaluate('JSON.stringify(window.__sw)')); }
    await c.send('Timeline.stop').catch(() => {}); await sleep(800);
    if (!r) throw new Error('drive did not finish');
    const syncTL = findTimeStamp(recs, 'swmsync'); if (syncTL == null) throw new Error('no Timeline sync mark');
    const w = windowStats(recs, syncTL * 1000 - syncT, r.W);
    const perY = {};
    for (const x of w) { const y = x.label.split(':')[0]; (perY[y] ||= []).push([x.n, x.n5, x.max, x.sum, x.style]); }
    load.perY = perY; load.state = r.S;
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : prev;
  rec.loads.push(load); writeFileSync(OUT, JSON.stringify(rec, null, 1));
  const line = load.perY ? Object.entries(load.perY).map(([y, a]) => `${y}:${Math.max(...a.map((q) => q[2]))}`).join(' ') : '';
  console.log(`SWMAP ${Lk} ${load.void || ''} served ${load.served?.js} census ${JSON.stringify(load.census || [])}\n  max layout ms per y: ${line}`);
}

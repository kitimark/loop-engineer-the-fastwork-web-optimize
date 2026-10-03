#!/usr/bin/env node
// P-085 phone read (fix-nav-morph): the block's first step, before any counted run. Uncounted, no frame verdict.
// Per load (one arm, one page load): the page goes to its bottom (in-page steps), then `--reads` times an open and a
// close tween through the user path (3 wheel events deltaY +-120 on window, as gates/tween-series-sim.mjs), recorded on
// rAF from the dispatch for 1600 ms: the header's inline --morph and per child (bar, logo, actions, earn, panel) its
// computed --morph, x, width, opacity (earn also max-width). Each getComputedStyle read flushes style, the same in
// every arm. 2000 ms after each dispatch one more read: the held state (open: m = 1, close: m = 0).
// Two checks (registered in README.md "P-085"):
//   DOM  M's held children equal B's: computed --morph at the target (|d| <= 0.001; B too, else the read is void),
//        logo / actions x and earn width within 0.5 px, opacities within 0.01.
//   EARN the earn fade start relative to the m >= 0.2 frame (the fade is a CSS opacity transition, 0.32 s after a
//        0.12 s delay, retargeted every tween frame until m >= 0.2: README "Mid-tween time series"). tA = the sample
//        time of the first rAF sample with m >= 0.2. Two forms, per arm the median over reads, d = med(M) - med(B),
//        tolerance 2 frames at 60 Hz = 33.3 ms:
//        start   = the running opacity CSSTransition's startTime + delay - tA (getAnimations() on the earn button, the
//                  last retarget; not bound to the sampling). 'within' when |d| <= 33.3, else 'beyond'.
//        visible = tF - tA, tF = the first sample with earn opacity < 0.99; interval (tFprev - tA, tF - tA] from the
//                  sample before tF. 'within' when the whole interval of d lies in [-33.3, +33.3], 'beyond' when
//                  wholly outside, else 'undecided' (a sampling gap, e.g. a long frame after tA).
//        EARN verdict: 'beyond' when start or visible is 'beyond' (to the user as a pixel/timing proposal, never a
//        silent pass); 'within' otherwise; 'NO DATA' without start data. Width (first earn width < 78 px, and the
//        max-width transition's start) is descriptive.
// Void read (self-check, P-084 lesson: a harness that lost its data voids the read, it does not pass): served js/css
// hashes not the arm's build; no nav header or earn button; fewer than 20 open samples; the open tween never reaches
// m >= 0.999 or does not start at m <= 0.001; the close tween never returns to m <= 0.001; median sample gap > 25 ms
// (rAF <= 40 Hz: Low Power Mode or not rendering); B's children not at the target.
// The page is polled at <= 1 Hz (every 1.5 s), as iphone.mjs run. Output: out/morph-inherit/p085/read-<ts>.json
// (URLs through lanSafeUrl; never commit it).
// Usage (phone; inside your own chrome-measure hold, with the iphone lease):
//   node fixes/morph-inherit/p085/phone-read.mjs --owner <o> --arm B=http://lan:<twinB>/ --arm M=http://lan:<twinM>/ \
//     --arm M=http://lan:<twinM>/ --arm B=http://lan:<twinB>/ [--reads 1]
// Simulator dry run (functional session; the script serves the snapshots itself on localhost, --latency 150):
//   node fixes/morph-inherit/p085/phone-read.mjs --sim --owner <o> --arm B=@bdrive-afd388b8945a --arm M=@mi-7c61fe7d0662 [--drive-check]
//   --drive-check (dry run only): after the reads, window.__fwMorphDrive({hold: 1000, cycles: 1}) runs once and its
//   summaries are kept (does the build's driver run).
// Re-score a read file: node fixes/morph-inherit/p085/phone-read.mjs --analyse out/morph-inherit/p085/read-<ts>.json
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const BUILD = { B: { snap: 'bdrive-afd388b8945a', js: 'afd388b8945a', css: '27776f3d4138' }, M: { snap: 'mi-7c61fe7d0662', js: '7c61fe7d0662', css: 'f523598b2a24' } };
const TOL = 33.3, REC_MS = 1600, HOLD_MS = 2000;
const r3 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const med = (a) => { const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mOf = (s) => (s.m === '' || s.m === null || s.m === undefined ? 0 : Number(s.m));

// ---- in-page code -------------------------------------------------------------------------------------------------
const PAGE_JS = (reads, drive) => `(() => {
  if (window.__p085 && !window.__p085.done) return 'busy';
  const h = document.querySelector('.start-selling-top-nav');
  if (!h) return 'no nav header';
  const r1 = (v) => Math.round(v * 10) / 10;
  const SEL = { bar: '.start-selling-top-nav-bar', logo: '.start-selling-top-nav-logo', actions: '.start-selling-top-nav-actions', earn: '.start-selling-top-nav-btn.is-earn', panel: '.start-selling-morph-panel' };
  const read = (t0) => { const o = { t: r1(performance.now() - t0), m: h.style.getPropertyValue('--morph'), morphing: h.classList.contains('is-morphing'), expanded: h.classList.contains('is-expanded') };
    for (const [k, s] of Object.entries(SEL)) { const e = h.querySelector(s); if (!e) { o[k] = null; continue; } const c = getComputedStyle(e), b = e.getBoundingClientRect();
      o[k] = { km: c.getPropertyValue('--morph').trim(), x: r1(b.x), w: r1(b.width), op: c.opacity, ...(k === 'earn' ? { mw: c.maxWidth, ...tr(e, t0) } : {}) }; }
    return o; };
  // the earn button's running CSS transitions: start time (document timeline = performance.now() origin) - t0, delay
  const tr = (e, t0) => { const o = { ot: null, od: null, wt: null };
    for (const a of e.getAnimations ? e.getAnimations() : []) { if (typeof a.transitionProperty !== 'string' || a.startTime === null) continue;
      if (a.transitionProperty === 'opacity') { o.ot = r1(a.startTime - t0); o.od = a.effect && a.effect.getTiming ? a.effect.getTiming().delay : null; }
      if (a.transitionProperty === 'max-width') o.wt = r1(a.startTime - t0); }
    return o; };
  const d = (ms) => new Promise((r) => setTimeout(r, ms));
  const rec = (dy) => new Promise((res) => { const t0 = performance.now(), out = [read(t0)];
    for (let i = 0; i < 3; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
    out.push(read(t0)); const f = () => { out.push(read(t0)); if (performance.now() - t0 < ${REC_MS}) requestAnimationFrame(f); else res({ t0, out }); }; requestAnimationFrame(f); });
  const st = (window.__p085 = { done: false, out: null });
  (async () => {
    const res = { href: location.href, ua: navigator.userAgent, vw: innerWidth, vh: innerHeight, reads: [] };
    try {
      for (let i = 0; i < 80; i++) { const H = document.documentElement.scrollHeight - innerHeight; if (scrollY >= H - 1) break; scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); await d(120); }
      await d(2500);
      res.bottom = { y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight) };
      for (let k = 0; k < ${reads}; k++) {
        const o = await rec(120); await d(Math.max(0, ${HOLD_MS} - (performance.now() - o.t0))); const ho = read(o.t0);
        const c = await rec(-120); await d(Math.max(0, ${HOLD_MS} - (performance.now() - c.t0))); const hc = read(c.t0);
        res.reads.push({ open: o.out, heldOpen: ho, close: c.out, heldClose: hc });
        await d(1000);
      }
      ${drive ? `if (typeof window.__fwMorphDrive !== 'function') res.drive = { error: 'no __fwMorphDrive' };
      else { const r = await window.__fwMorphDrive({ hold: 1000, cycles: 1 }); res.drive = { moving: r.moving, atOne: r.atOne, atZero: r.atZero, frames: r.frames.length }; }` : ''}
    } catch (e) { res.error = String(e && e.stack || e); }
    st.out = JSON.stringify(res); st.done = true;
  })();
  return 'started';
})()`;

// ---- analysis (pure) ----------------------------------------------------------------------------------------------
const KIDS = ['bar', 'logo', 'actions', 'earn', 'panel'];
function readFacts(r) {
  const o = r.open, c = r.close, gaps = o.slice(2).map((s, i) => s.t - o[i + 1].t);
  const iA = o.findIndex((s) => mOf(s) >= 0.2), iF = o.findIndex((s) => s.earn && Number(s.earn.op) < 0.99), iW = o.findIndex((s) => s.earn && s.earn.w < 78);
  const void_ = [];
  if (o.length < 20) void_.push(`open: ${o.length} samples (< 20)`);
  if (!o.every((s) => s.earn)) void_.push('no earn button in a sample');
  if (mOf(o[0]) > 0.001) void_.push(`open starts at m ${o[0].m}`);
  if (!o.some((s) => mOf(s) >= 0.999)) void_.push('open never reaches m >= 0.999');
  if (!c.some((s) => mOf(s) <= 0.001)) void_.push('close never returns to m <= 0.001');
  const gapMed = med(gaps);
  if (gapMed === null || gapMed > 25) void_.push(`median sample gap ${gapMed} ms (> 25: rAF <= 40 Hz)`);
  const f = { samples: o.length, gapMed, gapMax: gaps.length ? Math.max(...gaps) : null, void: void_ };
  if (iA > 0) Object.assign(f, { tA: o[iA].t, mBeforeA: o[iA - 1].m, mAtA: o[iA].m });
  if (iA > 0 && iF > 0) Object.assign(f, { fade: { point: r3(o[iF].t - o[iA].t), lo: r3(o[iF - 1].t - o[iA].t), hi: r3(o[iF].t - o[iA].t), opAt: o[iF].earn.op, beforeAnchor: iF <= iA } });
  else if (!void_.length) void_.push(iA <= 0 ? 'no m >= 0.2 sample after the dispatch' : 'earn opacity never < 0.99 in the open recording');
  if (iA > 0 && iW > 0) f.width78 = r3(o[iW].t - o[iA].t);
  // the opacity transition that runs at the end of the recording (the last retarget): its start + delay - tA
  const withT = o.filter((s) => s.earn && s.earn.ot !== null && s.earn.ot !== undefined);
  if (iA > 0 && withT.length) { const L = withT[withT.length - 1].earn;
    f.trans = { start: L.ot, delay: L.od, fadeStart: r3(L.ot + (L.od || 0) - o[iA].t), retargets: new Set(withT.map((s) => s.earn.ot)).size,
      widthStart: (() => { const w = o.filter((s) => s.earn && s.earn.wt !== null && s.earn.wt !== undefined); return w.length ? r3(w[w.length - 1].earn.wt - o[iA].t) : null; })() }; }
  return f;
}
function heldOk(held, target) { // children's computed --morph at the target
  const bad = [];
  for (const k of KIDS) { const e = held[k]; if (!e) { if (k !== 'panel') bad.push(`${k} missing`); continue; } if (Math.abs(Number(e.km) - target) > 0.001) bad.push(`${k} --morph ${e.km}`); }
  return bad;
}
function heldDiff(a, b) { // M held vs B held
  const out = [];
  const cmp = (k, p, lim) => { const x = a[k]?.[p], y = b[k]?.[p]; if (x === undefined && y === undefined) return; if (x === undefined || y === undefined) { out.push(`${k}.${p} present in one arm only`); return; } const dd = Math.abs(Number(x) - Number(y)); if (!(dd <= lim)) out.push(`${k}.${p} ${x} vs ${y}`); };
  for (const k of ['logo', 'actions']) cmp(k, 'x', 0.5);
  cmp('earn', 'w', 0.5);
  for (const k of ['logo', 'earn', 'panel']) cmp(k, 'op', 0.01);
  for (const k of KIDS) cmp(k, 'km', 0.001);
  return out;
}
export function analyse(doc) {
  const loads = doc.loads.map((L) => {
    const v = [...(L.void || [])];
    const reads = (L.result?.reads || []).map((r) => {
      const f = readFacts(r);
      f.heldOpenBad = heldOk(r.heldOpen, 1); f.heldCloseBad = heldOk(r.heldClose, 0);
      if (L.arm === 'B' && (f.heldOpenBad.length || f.heldCloseBad.length)) f.void.push(`B children not at the target: ${[...f.heldOpenBad, ...f.heldCloseBad].join('; ')}`);
      return f;
    });
    if (L.result?.error) v.push(`page error: ${L.result.error.split('\n')[0]}`);
    if (!reads.length && !v.length) v.push('no reads');
    return { arm: L.arm, url: L.url, served: L.served, void: v, reads };
  });
  const ok = (L) => !L.void.length;
  const goodReads = (arm) => loads.filter((L) => L.arm === arm && ok(L)).flatMap((L) => L.reads.map((f, i) => ({ f, r: doc.loads[loads.indexOf(L)].result.reads[i] }))).filter(({ f }) => !f.void.length);
  const B = goodReads('B'), M = goodReads('M');
  const out = { scorer: 'phone-read.mjs', sha256: self, tolerance: TOL, loads, n: { B: B.length, M: M.length } };
  if (!B.length || !M.length) { out.dom = { verdict: 'NO DATA' }; out.earn = { verdict: 'NO DATA' }; return out; }
  // DOM: every M read against every B read, open and close held states; and M's children at the target
  const dom = [];
  for (const m of M) { dom.push(...m.f.heldOpenBad.map((x) => `M open+2s: ${x}`), ...m.f.heldCloseBad.map((x) => `M close+2s: ${x}`));
    for (const b of B) { dom.push(...heldDiff(m.r.heldOpen, b.r.heldOpen).map((x) => `open+2s ${x}`), ...heldDiff(m.r.heldClose, b.r.heldClose).map((x) => `close+2s ${x}`)); } }
  out.dom = { verdict: dom.length ? 'FAIL' : 'PASS', failures: [...new Set(dom)] };
  // EARN: medians per arm; d = M - B.
  //   start (decides): the opacity transition's start + delay - tA, from the transition objects (not sample-bound);
  //   visible (decides only when 'beyond'): the first sampled opacity < 0.99 - tA, interval from the sample before it.
  const arm = (R) => { const fs = R.map(({ f }) => f.fade).filter(Boolean), ts = R.map(({ f }) => f.trans).filter(Boolean);
    return { reads: fs.length, point: med(fs.map((x) => x.point)), lo: med(fs.map((x) => x.lo)), hi: med(fs.map((x) => x.hi)), width78: med(R.map(({ f }) => f.width78)), tA: med(R.map(({ f }) => f.tA)), gapMed: med(R.map(({ f }) => f.gapMed)),
      transReads: ts.length, fadeStart: med(ts.map((x) => x.fadeStart)), delay: med(ts.map((x) => x.delay)), widthStart: med(ts.map((x) => x.widthStart)) }; };
  const eb = arm(B), em = arm(M);
  const visible = !eb.reads || !em.reads ? { verdict: 'NO DATA' } : (() => { const d = { point: r3(em.point - eb.point), lo: r3(em.lo - eb.hi), hi: r3(em.hi - eb.lo) };
    return { verdict: d.lo >= -TOL && d.hi <= TOL ? 'within' : d.hi < -TOL || d.lo > TOL ? 'beyond' : 'undecided', d }; })();
  const start = !eb.transReads || !em.transReads ? { verdict: 'NO DATA' } : (() => { const d = r3(em.fadeStart - eb.fadeStart); return { verdict: Math.abs(d) <= TOL ? 'within' : 'beyond', d }; })();
  const verdict = start.verdict === 'NO DATA' ? 'NO DATA' : start.verdict === 'beyond' || visible.verdict === 'beyond' ? 'beyond' : 'within';
  out.earn = { verdict, start, visible, B: eb, M: em, width78d: r3(em.width78 - eb.width78), widthStartD: r3(em.widthStart - eb.widthStart) };
  return out;
}

// ---- main ---------------------------------------------------------------------------------------------------------
async function main() {
  if (opt('--analyse')) { const doc = JSON.parse(readFileSync(opt('--analyse'), 'utf8')); report(analyse(doc)); return; }
  const owner = opt('--owner'); if (!owner) throw new Error('--owner required');
  const sim = flag('--sim'), reads = Number(opt('--reads', sim ? 2 : 1));
  const arms = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const k = s.indexOf('='); return { arm: s.slice(0, k), target: s.slice(k + 1) }; });
  if (!arms.length || arms.some((a) => !BUILD[a.arm])) throw new Error('--arm B=<url>|@<snapshot> and --arm M=..., arms B and M');
  const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
  const { lanSafeUrl } = await import(join(WT, 'tools/lib/iphone-url.mjs'));
  const { tryResolveLanUrl } = await import(join(WT, 'tools/lib/lan.mjs'));
  const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
  const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
  const OUT = join(WT, 'out/morph-inherit/p085'); mkdirSync(OUT, { recursive: true });
  const tag = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(OUT, `read-${tag}.json`);
  const doc = { tool: 'fixes/morph-inherit/p085/phone-read.mjs', sha256: self, target: sim ? 'simulator' : 'iphone', owner, reads, recMs: REC_MS, holdMs: HOLD_MS, date: new Date().toISOString(), loads: [] };
  for (const a of arms) {
    const L = { arm: a.arm, build: BUILD[a.arm], void: [] }; let srv = null, c = null;
    try {
      let url = a.target;
      if (url.startsWith('@')) { // the dry run's own server (Simulator only)
        if (!sim) throw new Error('@<snapshot> only with --sim');
        const st = join(OUT, `serve-${a.arm}-${tag}.json`); rmSync(st, { force: true });
        srv = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(WT, 'out/snapshots', url.slice(1)), '--port', '0', '--quiet', '--no-cache', '--latency', '150', '--vendors=local', '--state', st], { stdio: ['ignore', 'ignore', 'inherit'] });
        let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
        if (!s) throw new Error('server did not start');
        url = `http://localhost:${s.port}/`;
      }
      L.url = lanSafeUrl(url);
      const macUrl = tryResolveLanUrl(url) || url;
      L.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, macUrl))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, macUrl))).arrayBuffer())) };
      if (L.served.js !== L.build.js || L.served.css !== L.build.css) { L.void.push(`served ${JSON.stringify(L.served)} is not ${L.build.snap}`); continue; }
      const nav = sim ? spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'inherit', 'inherit'] })
        : spawnSync(process.execPath, [join(WT, 'tools/iphone.mjs'), 'open', url, '--owner', owner], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (nav.status !== 0) throw new Error(`open failed (exit ${nav.status})`);
      await sleep(3000);
      const port = new URL(macUrl).port;
      c = await openTab(`:${port}/`); // pickTab: a string matches as a substring of the tab URL
      for (let i = 0; i < 40; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(1500); }
      await sleep(3000);
      const started = await c.evaluate(PAGE_JS(reads, flag('--drive-check')));
      if (started !== 'started') throw new Error(`page: ${started}`);
      const limit = Date.now() + 30000 + reads * 2 * (HOLD_MS + 1500) + (flag('--drive-check') ? 15000 : 0);
      while (Date.now() < limit) { await sleep(1500); if (await c.evaluate('!!(window.__p085 && window.__p085.done)')) break; } // <= 1 Hz
      const len = await c.evaluate('window.__p085 && window.__p085.done ? window.__p085.out.length : -1');
      if (len < 0) throw new Error('the page did not finish');
      let s = ''; for (let i = 0; i < len; i += 50000) s += await c.evaluate(`window.__p085.out.slice(${i}, ${i + 50000})`);
      L.result = JSON.parse(s); L.result.href = lanSafeUrl(L.result.href);
      console.log(`${a.arm} ${L.url}: ${L.result.reads.length} reads${L.result.error ? ' ERROR ' + L.result.error.split('\n')[0] : ''}${L.result.drive ? ' drive ' + JSON.stringify(L.result.drive) : ''}`);
    } catch (e) { L.void.push(String(e.message || e)); console.log(`${a.arm}: VOID ${e.message || e}`); }
    finally { try { c?.close(); } catch {} srv?.kill(); doc.loads.push(L); writeFileSync(file, JSON.stringify(doc)); }
  }
  if (!sim) spawnSync(process.execPath, [join(WT, 'tools/iphone.mjs'), 'park', '--owner', owner], { stdio: 'inherit' });
  const res = analyse(doc); doc.analysis = res; writeFileSync(file, JSON.stringify(doc));
  report(res); console.log(`wrote ${file}`);
}
function report(a) {
  for (const L of a.loads) console.log(`${L.arm} ${L.url}${L.void.length ? ' VOID ' + L.void.join('; ') : ''}${L.reads.map((f, i) => `\n  read ${i}: ${f.void.length ? 'VOID ' + f.void.join('; ') : ''} tA ${f.tA} (m before ${f.mBeforeA}) fade ${JSON.stringify(f.fade)} trans ${JSON.stringify(f.trans)} width78 ${f.width78} gap med ${f.gapMed} max ${f.gapMax}`).join('')}`);
  console.log(`DOM ${a.dom.verdict}${a.dom.failures?.length ? ': ' + a.dom.failures.join('; ') : ''}`);
  console.log(`EARN ${a.earn.verdict} (tolerance +-${TOL} ms = 2 frames at 60 Hz) ${JSON.stringify(a.earn)}`);
  console.log(`phone-read.mjs sha256 ${self}; reads used B ${a.n.B} M ${a.n.M}`);
}
await main();

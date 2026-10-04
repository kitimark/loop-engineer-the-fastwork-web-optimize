// scroll-cb-phone Simulator counter (WebKit, iOS Simulator Safari), COUNTS AND STATE PARITY ONLY, no timing claim.
// Pattern: fixes/nav-hit-cache/simcount.mjs (fix-nav-morph). Run from the worktree root inside a functional sim session:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scroll-cb -- \
//     node tools/sim.mjs session --functional --owner fix-scroll-cb -- node fixes/scroll-cb-phone/simcount.mjs <records.json> C:1 V:1 V:2 C:2
// Arms from ./build.mjs (C best build, V = C + scroll-cb-phone). Each load: its own server on a new port (own origin), plain
// http, `sim.mjs open`, settle, served JS/CSS hashes checked (mismatch = VOID). After settle, counters are installed
// (late wrap: the page looks these up at call time): requestAnimationFrame, getBoundingClientRect, scrollY reads, keyed by
// the 2.DyWL8TcE.js line on the caller's stack and attributed to the top-level function containing it (side jobs AE, uM,
// mM, GM, scbGate). Window: Timeline (Page.disable -> Page.enable -> Timeline.start, F-047) over a scripted scroll
// top -> bottom -> top, 10 px per rAF. Each step first logs the classes/style of the side jobs' and the nav's elements
// (state after the previous frame), as changes [step, key, value]; parity = each load vs the first C load (a V difference
// also present between C2 and C1 is an A/A flake). Timeline counts: RenderingFrame, RecalculateStyles, Layout, Paint,
// FireAnimationFrame, and RecalculateStyles / Layout nested in a script record (FunctionCall, FireAnimationFrame,
// EventDispatch, TimerFire) = forced.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const [outPath, ...order] = process.argv.slice(2);
if (!outPath || !order.length) { console.error('usage: simcount.mjs <records.json> C:1 V:1 ...'); process.exit(1); }
const ARMS = build({ quiet: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/scroll-cb-phone/sim'); mkdirSync(D, { recursive: true });
const SCRIPT = new Set(['FunctionCall', 'FireAnimationFrame', 'EventDispatch', 'TimerFire']);
const SIDE = ['AE', 'uM', 'mM', 'GM', 'scbGate'];
const INSTALL = `(() => {
  if (window.__scb) return 0;
  const P = window.__scb = { on: false, counts: {}, log: [], last: {} };
  const where = () => { const m = (new Error().stack || '').match(/2\\.DyWL8TcE\\.js:(\\d+):/); return m ? m[1] : 'other'; };
  const bump = (k) => { if (!P.on) return; const w = k + '@' + where(); P.counts[w] = (P.counts[w] || 0) + 1; };
  const og = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { bump('rect'); return og.call(this); };
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { bump('raf'); return oraf(cb); };
  P.raf = oraf;
  for (const k of ['scrollY', 'pageYOffset']) { try { const d = Object.getOwnPropertyDescriptor(window, k) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), k);
    if (d && d.get) Object.defineProperty(window, k, { configurable: true, enumerable: true, get() { bump('scrollY'); return d.get.call(window); } }); } catch {} }
  const SEL = { nav: '.start-selling-top-nav', commission: 'section.commission', ccard: '.commission-card', runway: '.commission-runway',
    pain: '.pain', future: '#people', fcard: '.start-selling-future-card', platform: '#platform', pcard: '.start-selling-platform-card',
    profile: '.start-selling-profile', psticky: '.start-selling-profile-sticky', pshell: '.start-selling-profile-shell.is-active-shell' };
  P.snap = () => { const o = {}; for (const k in SEL) { const e = document.querySelector(SEL[k]); o[k] = e ? (e.getAttribute('class') || '') + ' | ' + (e.getAttribute('style') || '') : '-'; } return o; };
  // P-108 harness: top-level sections (children of the commission section's parent), their page bounds at install, and a
  // geometry log fed by a ResizeObserver (after layout, so it forces none): scrollHeight + offsetTop/offsetHeight of each.
  const host = (document.querySelector('section.commission') || document.body.firstElementChild).parentElement;
  const nm = (e) => e.id || ((e.getAttribute('class') || '').split(/\\s+/).find((c) => c && !/^svelte-/.test(c))) || e.tagName.toLowerCase();
  P.secEls = [...host.children];
  P.secs = P.secEls.map((e) => { const b = e.getBoundingClientRect(); return [nm(e), Math.round(b.top + scrollY), Math.round(b.bottom + scrollY)]; });
  P.geom = () => 'sh=' + document.documentElement.scrollHeight + ';' + P.secEls.map((e) => nm(e) + '=' + e.offsetTop + '+' + e.offsetHeight).join(';');
  P.n = 0;
  P.ro = new ResizeObserver(() => { if (!P.on) return; const g = P.geom(); if (g !== P.lastGeom) { P.log.push([P.n, 'geom', g]); P.lastGeom = g; } });
  P.ro.observe(document.documentElement); for (const e of P.secEls) P.ro.observe(e);
  return 1;
})()`;
const SCROLL = `new Promise((res) => { const P = window.__scb; const max = document.documentElement.scrollHeight - innerHeight; let y = 0, n = 0, dir = 1;
  P.last = P.snap(); P.lastGeom = P.geom(); P.log = []; P.counts = {}; P.ys = [0]; P.n = 0; P.on = true;
  const step = () => { const s = P.snap(); for (const k in s) if (s[k] !== P.last[k]) { P.log.push([n, k, s[k]]); P.last[k] = s[k]; }
    if (dir > 0 && y >= max) dir = -1;
    if (dir < 0 && y <= 0) { P.on = false; res({ n, y: scrollY, max }); return; }
    y = Math.max(0, Math.min(max, y + 10 * dir)); scrollTo({ top: y, behavior: 'instant' }); n++; P.n = n; P.ys.push(y); console.timeStamp('scb' + n);
    if (n < 10000) P.raf(step); else { P.on = false; res({ n, y: scrollY, max, cut: true }); } };
  P.raf(step); })`;

function fnIndex(src) {
  const starts = [];
  src.split('\n').forEach((l, i) => { const m = /^(?:async )?function (\w+)\(/.exec(l); if (m) starts.push([i + 1, m[1]]); });
  return (line) => { let lo = 0, hi = starts.length - 1, f = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m][0] <= line) { f = starts[m][1]; lo = m + 1; } else hi = m - 1; } return f || 'top'; };
}

for (const L of order) {
  const [arm, rep] = L.split(':');
  if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
  const st = join(D, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--port', '0', '--quiet', '--no-cache',
    '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), engine: 'sim', tool: 'fixes/scroll-cb-phone/simcount.mjs', startedAt: new Date().toISOString() };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    const jsSrc = Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer());
    load.served = { js: sha(jsSrc), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== ARMS[arm].js || load.served.css !== ARMS[arm].css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMS[arm].js + ' / ' + ARMS[arm].css);
    const fnOf = fnIndex(jsSrc.toString('utf8'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(3000);
    load.ua = await c.evaluate('navigator.userAgent');
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    if (!(load.viewport.docH > 3 * load.viewport.height)) throw new Error('page did not render the app (doc ' + load.viewport.docH + ')');
    await c.evaluate(`(scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(2000);
    await c.evaluate(INSTALL);
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    recs.length = 0;
    await c.send('Timeline.start', { maxCallStackDepth: 0 });
    await sleep(300);
    // WebKit's Runtime.evaluate ignores awaitPromise (tools/lib/wip.mjs): start the scroll, then poll its result at ~1 Hz
    await c.evaluate(`(window.__scbScroll = null, ${SCROLL}.then((r) => { window.__scbScroll = r; }), 0)`);
    let sc = null;
    for (let j = 0; j < 200 && !sc; j++) { await sleep(1000); sc = await c.evaluate('window.__scbScroll'); }
    if (!sc) throw new Error('scroll did not finish in 200 s');
    await sleep(300);
    await c.send('Timeline.stop'); await sleep(1000);
    const res = await c.evaluate('JSON.stringify({ counts: window.__scb.counts, log: window.__scb.log, secs: window.__scb.secs, ys: window.__scb.ys })');
    const { counts, log, secs, ys } = JSON.parse(res);
    // reported, not judged: Paint records by top-level section. Step from the last console.timeStamp ('scbN') before
    // the paint; page y = clip quad's centre y (root-view coordinates) + the driver's y at that step.
    const flat = []; const types = {};
    const fl = (r) => { if (!r) return; types[r.type] = (types[r.type] || 0) + 1; flat.push(r); for (const ch of r.children || []) fl(ch); };
    for (const r of recs) fl(r);
    flat.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
    let curStep = 0; const paintBySec = {}; const paintSample = [];
    const secOf = (py) => { for (const [k, a, b] of secs) if (py >= a && py < b) return k; return 'outside'; };
    for (const r of flat) {
      if (r.type === 'TimeStamp') { const m = /^scb(\d+)$/.exec(r.data?.message || ''); if (m) curStep = +m[1]; }
      if (r.type === 'Paint') {
        const d = r.data || {}; if (paintSample.length < 3) paintSample.push(d);
        const q = d.clip || d.quad || (d.y !== undefined ? [d.x, d.y, d.x + d.width, d.y, d.x + d.width, d.y + d.height, d.x, d.y + d.height] : null);
        let k = 'noquad';
        if (Array.isArray(q) && q.length >= 8) { const cy = (q[1] + q[3] + q[5] + q[7]) / 4; k = secOf(cy + (ys[curStep] ?? 0)); }
        paintBySec[k] = (paintBySec[k] || 0) + 1;
      }
    }
    load.paintBySec = paintBySec; load.paintSample = paintSample; load.recordTypes = types; load.secs = secs;
    const byFn = {};
    for (const [k, v] of Object.entries(counts)) { const [kind, line] = k.split('@'); const fn = line === 'other' ? 'other' : fnOf(+line); byFn[fn] ||= {}; byFn[fn][kind] = (byFn[fn][kind] || 0) + v; }
    const steps = sc.n || 1;
    const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / steps) * 1000) / 1000]));
    const side = {}; for (const fn of SIDE) for (const [kind, v] of Object.entries(byFn[fn] || {})) side[kind] = (side[kind] || 0) + v;
    const all = {}; for (const o of Object.values(byFn)) for (const [kind, v] of Object.entries(o)) all[kind] = (all[kind] || 0) + v;
    const n = { renderingFrames: 0, styleRecalcs: 0, layouts: 0, paints: 0, forcedStyleRecalcs: 0, forcedLayouts: 0, functionCalls: 0, rafs: 0 };
    const walk = (r, inS) => {
      if (!r) return;
      const t = r.type;
      if (t === 'RenderingFrame') n.renderingFrames++;
      if (t === 'RecalculateStyles') (n.styleRecalcs++, inS && n.forcedStyleRecalcs++);
      if (t === 'Layout') (n.layouts++, inS && n.forcedLayouts++);
      if (t === 'Paint') n.paints++;
      if (t === 'FunctionCall') n.functionCalls++;
      if (t === 'FireAnimationFrame') n.rafs++;
      for (const ch of r.children || []) walk(ch, inS || SCRIPT.has(t));
    };
    for (const r of recs) walk(r, false);
    load.calls = byFn; load.perStep = { side: per(side), all: per(all) };
    load.sideByFn = Object.fromEntries(SIDE.map((fn) => [fn, per(byFn[fn] || {})]));
    load.log = log;
    load.window = { scroll: sc, records: recs.length, ...n, perStep: per(n) };
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load);
  const key = (l) => l.map(([k, e, v]) => `${k}|${e}|${v}`);
  const valid = rec.loads.filter((l) => !l.void && l.log);
  const c1 = valid.find((l) => l.arm === 'C');
  if (c1) {
    const A = new Set(key(c1.log));
    const diff = (l) => { const B = new Set(key(l.log)); return [...[...A].filter((x) => !B.has(x)).map((x) => '-' + x), ...[...B].filter((x) => !A.has(x)).map((x) => '+' + x)]; };
    const flakes = new Set(valid.filter((l) => l.arm === 'C' && l !== c1).flatMap(diff));
    rec.parity = valid.filter((l) => l !== c1).map((l) => { const d = diff(l); const real = l.arm === 'C' ? d : d.filter((x) => !flakes.has(x));
      return { load: `${l.arm}${l.rep}`, vs: `C${c1.rep}`, diffs: d.length, beyondAA: l.arm === 'C' ? null : real.length, sample: (l.arm === 'C' ? d : real).slice(0, 16) }; });
  }
  writeFileSync(outPath, JSON.stringify(rec, null, 1));
  const w = load.window || {};
  console.log(arm, rep, JSON.stringify(load.served || {}), load.void || '', `steps ${w.scroll?.n} RF ${w.renderingFrames} rAF ${w.rafs} RS ${w.styleRecalcs} (forced ${w.forcedStyleRecalcs}) L ${w.layouts} (forced ${w.forcedLayouts}) P ${w.paints}`,
    'side/step', JSON.stringify(load.perStep?.side || {}));
  for (const q of rec.parity || []) if (q.load === `${arm}${rep}`) console.log(`  parity ${q.load} vs ${q.vs}: diffs ${q.diffs}${q.beyondAA === null ? ' (A/A)' : `, beyond A/A ${q.beyondAA}`}`);
}

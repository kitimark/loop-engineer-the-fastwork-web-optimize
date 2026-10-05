// nav-hit-cache Simulator counter (WebKit), COUNTS ONLY, no timing claim. Pattern: fixes/best-build/gates/simcount.mjs.
// Run from the worktree root inside a functional sim session:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-hit-cache/simcount.mjs <records.json> C:1 V:1 V:2 C:2
//     [--base <b>] [--ctl <b>]
// Arms from ./build.mjs (C best build, V = C + nav-hit-cache; --base picks the build.mjs base, default v8; --ctl <b> adds
// arm K = that base's V, e.g. --base v9f7du2 --ctl v9f7d: K = v9-final + 7d with nav-hit-cache, V = K + U2, P-136).
// API counter (P-136): document.elementsFromPoint / getBoundingClientRect calls in the scroll window, all and from the nav
// code region (stack line inside it, as probe.mjs count), wrapped after the load settles. Each load: its own server on a new port (own origin, F-115),
// plain http, `sim.mjs open`, settle. Window: Timeline (Page.disable -> Page.enable -> Timeline.start, F-047) over a
// scripted scroll top -> bottom, 10 px per rAF. Counted in the record tree: RenderingFrame, RecalculateStyles, Layout,
// Paint, and RecalculateStyles / Layout nested inside a script record (FunctionCall, FireAnimationFrame, EventDispatch,
// TimerFire) = "forced" (script asked for layout mid-frame, e.g. the nav hit test).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2), flag = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const BASE_NAME = flag('--base') || 'v8', CTL = flag('--ctl');
const [outPath, ...order] = argv;
if (!outPath || !order.length) { console.error('usage: simcount.mjs <records.json> C:1 V:1 ... [--base <b>] [--ctl <b>]'); process.exit(1); }
const ARMS = build({ quiet: true, base: BASE_NAME });
if (CTL) ARMS.K = build({ quiet: true, base: CTL }).V;
const navRegion = (dir) => { const l = readFileSync(join(dir, JS), 'utf8').split('\n');
  const a = l.findIndex((x) => x.includes('perf(nav-hit-test): same answer')), b = l.findIndex((x) => x.includes('let ne = dE(L, { manageAnimations: !1 });'));
  if (a < 0 || b < 0) throw new Error('nav region markers not found in ' + dir); return [a + 1, b + 1]; };
const COUNTER = ([lo, hi]) => `(() => { if (window.__nc) return 0; const C = window.__nc = { on: false, all: {}, nav: {} }; const re = /2\\.DyWL8TcE\\.js:(\\d+):/g;
  const wrap = (o, name, key) => { const f = o[name]; o[name] = function (...a) { if (C.on) { C.all[key] = (C.all[key] || 0) + 1; const s = new Error().stack || ''; let m; re.lastIndex = 0;
    while ((m = re.exec(s))) { const ln = +m[1]; if (ln >= ${lo} && ln <= ${hi}) { C.nav[key] = (C.nav[key] || 0) + 1; break; } } } return f.apply(this, a); }; };
  wrap(Element.prototype, 'getBoundingClientRect', 'rect'); wrap(Document.prototype, 'elementsFromPoint', 'efp'); return 1; })()`;
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/nav-hit-cache/sim'); mkdirSync(D, { recursive: true });
const SCRIPT = new Set(['FunctionCall', 'FireAnimationFrame', 'EventDispatch', 'TimerFire']);
const SCROLL = `new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; let y = 0, n = 0;
  const step = () => { y = Math.min(max, y + 10); scrollTo({ top: y, behavior: 'instant' }); n++;
    if (y < max && n < 5000) requestAnimationFrame(step); else res({ n, y: scrollY, max }); };
  requestAnimationFrame(step); })`;

for (const L of order) {
  const [arm, rep] = L.split(':');
  if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
  const st = join(D, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--port', '0', '--quiet', '--no-cache',
    '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), base: BASE_NAME, ctl: CTL, engine: 'sim', tool: 'fixes/nav-hit-cache/simcount.mjs', startedAt: new Date().toISOString() };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== ARMS[arm].js || load.served.css !== ARMS[arm].css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMS[arm].js + ' / ' + ARMS[arm].css);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(3000);
    load.ua = await c.evaluate('navigator.userAgent');
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    await c.evaluate(`(scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(2000);
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    recs.length = 0;
    await c.send('Timeline.start', { maxCallStackDepth: 0 });
    await sleep(300);
    // WebKit's Runtime.evaluate ignores awaitPromise (tools/lib/wip.mjs): start the scroll, then poll its result at ~1 Hz
    await c.evaluate(COUNTER(navRegion(ARMS[arm].dir)));
    await c.evaluate(`(window.__nhcScroll = null, (window.__nc.on = true), ${SCROLL}.then((r) => { window.__nc.on = false; window.__nhcScroll = r; }), 0)`);
    let sc = null;
    for (let j = 0; j < 120 && !sc; j++) { await sleep(1000); sc = await c.evaluate('window.__nhcScroll'); }
    if (!sc) throw new Error('scroll did not finish in 120 s');
    await sleep(300);
    await c.send('Timeline.stop'); await sleep(1000);
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
    const steps = sc && sc.n ? sc.n : null;
    load.api = await c.evaluate('JSON.stringify(window.__nc)').then((x) => JSON.parse(x));
    load.window = { scroll: sc, records: recs.length, ...n,
      perStep: steps ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round((v / steps) * 1000) / 1000])) : null };
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  const w = load.window || {};
  console.log(arm, rep, JSON.stringify(load.served || {}), load.void || '', `steps ${w.scroll?.n} RF ${w.renderingFrames} RS ${w.styleRecalcs} (forced ${w.forcedStyleRecalcs}) L ${w.layouts} (forced ${w.forcedLayouts}) P ${w.paints}`, JSON.stringify(w.perStep || {}), 'api', JSON.stringify(load.api || {}));
}

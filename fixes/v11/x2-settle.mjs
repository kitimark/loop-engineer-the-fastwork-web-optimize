// v11 X2 settle gate (int-v11, lead 2026-10-07 03:1xZ "X2 Chrome part: unfrozen settle, full stop list"): a credited
// copy of fix-people-gpu's fixes/people-gpu/gates/pg-px.mjs. Change: NO freeze. The O opens and closes in real play
// (scrollTo the title / the out position) and is read at real times after the scroll (--u, ms), so the slide's onfinish
// fires as on a phone (pg-px's frozen close holds the O 167 px wider at 0.92/1.1 s because onfinish never fires there).
// Per stop also: the O's inline style, the O subtree's animations by playState, the hero track's paused animations
// (H1c's pause) and whether the O sits inside .hero-track (H1c pauses only that subtree). Pixels are scored like pg-px
// (PR-010 multi-pair A, V, A2, V2); the unfrozen stops before the settle carry timing jitter (the A/A pairs show it), the
// settle stops (rest-closed, open-u2500, close-u2500, rest-end) are the ones that must match.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v11 -- \
//     node fixes/v11/x2-settle.mjs --engine chrome --a <V11 dir> --v <V11X dir> [--capture screencast] [--h 775]
// Original header:
// people-gpu (fix-people-gpu): frozen-frame pixel and position gate of the title's "o" (open and close), candidate V
// against base A, PR-010 multi-pair (loads A, V, A2, V2, each on its own server; scorer fixes/v9-best/gates/pxlib.mjs
// scoreStop: "consistent" = over 8 levels in all four cross pairs while neither A/A pair is). COUNTS/PIXELS ONLY.
// Per load: walk the page, freeze Date.now, close the O (heading scrolled 75 % out), open it at the title (yTitle).
// When the O's class flips (is-expanded on, or off for the close), the page's animations are paused in the next task:
// animations born at the flip (the O's CSS transitions in A, the FLIP slides in V) are seeked to t, the faces' (born
// at is-stack, 120 ms before) to 120 + t, everything else stays frozen where it was. Per stop t: shot + positions of
// the "pe" text, the O box, the "ple" text and the vector o (rects include transforms).
//   Chrome:    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-people-gpu -- \
//                node fixes/people-gpu/gates/pg-px.mjs --engine chrome --a <dir> --v <dir> [--capture screencast] [--h 775]
//   Simulator: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-people-gpu -- \
//                node tools/sim.mjs session --functional --owner fix-people-gpu -- node fixes/people-gpu/gates/pg-px.mjs --engine sim --a <dir> --v <dir>
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { scoreStop, line } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chrome');
const CAPTURE = arg('--capture', 'screenshot');
const DIR = { A: resolve(WT, arg('--a', '')), V: resolve(WT, arg('--v', '')) };
if (!arg('--a') || !arg('--v')) throw new Error('--a <dir> --v <dir>');
const H = Number(arg('--h', '775'));
const LABEL = arg('--label', 'po');
const TS = arg('--t', '0,16,33,50,83,120,170,240,330,450,600,780,920,1100').split(',').map(Number);
const DIRS = arg('--dirs', 'open,close').split(',');
const US = arg('--u', '300,600,920,1100,1500,2500').split(',').map(Number);
const STOPS = [{ k: 'rest-closed' }, ...['open', 'close'].flatMap((d) => US.map((t) => ({ k: `${d}-u${t}`, d, t }))), { k: 'rest-end' }];
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = arg('--outdir') ? resolve(WT, arg('--outdir')) : join(WT, 'out/v11', `x2settle-${ENGINE}-${LABEL}-${tag}`); mkdirSync(OUT, { recursive: true });
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const GEO = `JSON.stringify((() => { const h = document.getElementById('future-heading'); const r = h.getBoundingClientRect(); return { ih: innerHeight, titleTop: Math.round(r.top + scrollY), titleH: Math.round(r.height) }; })())`;
// arm the freeze for the next flip of is-expanded to `want` (true = open, false = close)
const ARM = (want) => `(() => { const o = document.querySelector('.start-selling-future-people-o'); window.__pgF = null;
  const mo = new MutationObserver(() => { if (o.classList.contains('is-expanded') !== ${want}) return; mo.disconnect();
    setTimeout(() => { getComputedStyle(o).height; const m = []; for (const a of document.getAnimations()) { try { if (a.timeline && a.timeline !== document.timeline) continue; const c0 = a.currentTime; a.pause(); m.push([a, c0]); } catch {} }
      window.__pgF = m; window.__pgFi = m.map(([a, c0]) => { const t = a.effect && a.effect.target; return [a.constructor.name, a.transitionProperty || a.animationName || 'waapi', t ? (t.className && t.className.baseVal !== undefined ? t.className.baseVal : String(t.className)).replace(/svelte-\\w+/g, '').trim().split(/\\s+/)[0] : '?', Math.round(c0)].join(' '); }); }, 0); });
  mo.observe(o, { attributes: true, attributeFilter: ['class'] }); return 1; })()`;
const SEEK = (t) => `new Promise((res) => { for (const [a, c0] of window.__pgF) { try { a.currentTime = c0 < 60 ? ${t} : (c0 < 260 ? 120 + ${t} : c0); } catch {} } requestAnimationFrame(() => requestAnimationFrame(() => res(1))); })`;
const RESUME = `(() => { for (const [a] of window.__pgF || []) { try { a.play(); } catch {} } window.__pgF = null; return 1; })()`;
const POS = `JSON.stringify((() => { const sec = document.querySelector('section.start-selling-future'); const w = document.querySelector('.start-selling-future-title-words'), o = document.querySelector('.start-selling-future-people-o'), v = document.querySelector('.start-selling-future-people-o-vector');
  const tx = []; const it = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); for (let n; (n = it.nextNode());) { if (!n.nodeValue.trim() || o.contains(n)) continue; const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); tx.push([n.nodeValue, +b.left.toFixed(2), +b.top.toFixed(2)]); }
  const q = (e) => { const b = e.getBoundingClientRect(); return [+b.left.toFixed(2), +b.top.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)]; };
  const ht = document.querySelector('.hero-track'); const ps = {}; for (const a of o.getAnimations({ subtree: true })) ps[a.playState] = (ps[a.playState] || 0) + 1;
  return { vis: sec.classList.contains('is-visible'), y: Math.round(scrollY), text: tx, o: q(o), vector: q(v), cls: o.className.replace(/svelte-\\w+/g, '').trim(), po: o.getAttribute('data-fw-po'), oStyle: o.getAttribute('style'), oAnims: ps, oInHero: !!(ht && ht.contains(o)), heroPaused: ht ? ht.getAnimations({ subtree: true }).filter((a) => a.playState === 'paused').length : null }; })())`;

let sim = null, chrome = null, cdp = null, cfg = null;
if (ENGINE === 'sim') { sim = await import(join(WT, 'tools/lib/sim.mjs')); cfg = sim.readConfig(); }
else {
  const C = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/people-gpu/chrome'), 'pgpx'), headless: true, windowSize: `430,${H}` });
  cdp = await C.CDP.connect(chrome.wsUrl); chrome.C = C;
}
async function open(url, port) {
  if (sim) {
    const { execFileSync } = await import('node:child_process');
    const { openTab, runAsync } = await import(join(WT, 'tools/lib/wip.mjs'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${port}`);
    return { ev: (js) => c.evaluate(js), evp: (js) => runAsync(c, js, { pollMs: 200, timeoutMs: 60000 }), shot: (f) => sim.simctl(['io', cfg.udid, 'screenshot', f]).status === 0, close: () => { try { c.close(); } catch {} } };
  }
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await chrome.C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  return { ev: (js) => page.eval(js, { timeout: 90000 }), evp: (js) => page.eval(js, { timeout: 90000 }), shot: async (f) => { if (CAPTURE === 'screencast') { const w = page.waitFor((m) => m.method === 'Page.screencastFrame', 8000); await page.send('Page.startScreencast', { format: 'png', maxWidth: 430 * 3, maxHeight: H * 3, everyNthFrame: 1 }); const m = await w; await page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); await page.send('Page.stopScreencast').catch(() => {}); writeFileSync(f, Buffer.from(m.params.data, 'base64')); return true; } const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(data, 'base64')); return true; }, close: () => page.close() };
}

const ARMS = ['A', 'V', 'A2', 'V2'];
const RUN = arg('--arms', ARMS.join(',')).split(',');
const res = { tool: 'fixes/v11/x2-settle.mjs (copy of fixes/people-gpu/gates/pg-px.mjs, unfrozen)', us: US, engine: ENGINE, capture: CAPTURE, h: ENGINE === 'sim' ? null : H, dirs: DIR, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [] };
const shots = {};
try {
  for (const arm of RUN) {
    const d = DIR[arm.replace(/\d+$/, '')];
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, dir: d, stops: [] }; let c = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/?pgpx=${arm}`;
      const get = async (u) => { for (let i = 0; ; i++) { try { return Buffer.from(await (await fetch(u)).arrayBuffer()); } catch (e) { if (i >= 20) throw e; await sleep(250); } } };
      load.served = { js: sha(await get(new URL(NODE, url))), css: sha(await get(new URL(CSS, url))) };
      c = await open(url, s.port);
      for (let i = 0; i < 40 && (await c.ev('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.ev(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__pxErr.push('rej ' + String(e.reason))); return 1; })()`);
      await c.evp(`new Promise((res) => { let y = 0; const end = document.getElementById('future-heading').getBoundingClientRect().top + scrollY + 2 * innerHeight; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < end ? setTimeout(step, 60) : setTimeout(() => res(1), 1500); }; step(); })`);
      await c.ev(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`);
      await c.ev(`(scrollTo({ top: 0, behavior: 'instant' }), 1)`); await sleep(1500);
      const g = JSON.parse(await c.ev(GEO)); load.geo = g;
      // the card shows from the is-visible threshold on: find it by stepping 10 px per frame
      const yV = await c.evp(`new Promise((res) => { let y = 0; const s = document.querySelector('section.start-selling-future'); const f = () => { if (s.classList.contains('is-visible') || y > 4000) return res(y); y += 10; window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(f)); }; f(); })`);
      const yTitle = Math.max(yV + 40, Math.round(g.titleTop + g.titleH / 2 - g.ih / 2));
      await c.ev(`(scrollTo({ top: ${yTitle}, behavior: 'instant' }), 1)`); await sleep(1200);
      const hr = JSON.parse(await c.ev(`JSON.stringify((() => { const r = document.getElementById('future-heading').getBoundingClientRect(); return [r.top, r.height]; })())`));
      const yOut = Math.round(yTitle + hr[0] + 0.75 * hr[1]);
      load.yV = yV; load.hr = hr;
      load.y = { yTitle, yOut };
      const shoot = async (S, extra = {}) => {
        const f = join(OUT, `${arm}-${S.k}.png`); const ok = await c.shot(f);
        const pos = JSON.parse(await c.ev(POS));
        (shots[S.k] ||= {})[arm] = { file: f, hits: [] }; load.stops.push({ k: S.k, ok, pos, ...extra });
      };
      // no freeze: closed at the out position, then real play to the title and back, read at real times after each scroll
      await c.ev(`(scrollTo({ top: ${yOut}, behavior: 'instant' }), 1)`); await sleep(2500);
      await shoot(STOPS[0]);
      for (const dir of ['open', 'close']) {
        const t0 = Date.now();
        await c.ev(`(scrollTo({ top: ${dir === 'open' ? yTitle : yOut}, behavior: 'instant' }), 1)`);
        for (const S of STOPS.filter((x) => x.d === dir)) { const w = S.t - (Date.now() - t0); if (w > 0) await sleep(w); await shoot(S, { at: Date.now() - t0 }); }
      }
      await c.ev(`(scrollTo({ top: ${yTitle}, behavior: 'instant' }), 1)`); await sleep(2500);
      await shoot(STOPS[STOPS.length - 1]);
      load.errors = JSON.parse(await c.ev('JSON.stringify(window.__pxErr || [])'));
    } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
    finally { try { c && (await c.close()); } catch {} p.kill(); rmSync(st, { force: true }); res.loads.push(load); writeFileSync(join(OUT, `${arm}-load.json`), JSON.stringify(load)); }
    console.log(`load ${arm}: served ${JSON.stringify(load.served)} y ${JSON.stringify(load.y)} ${load.stops.length} stops, errors ${JSON.stringify(load.errors || [])}`);
    console.log(`  frozen open: ${JSON.stringify((load.frozen_open || []).filter((x) => /people-o|fw-po|waapi/.test(x)).slice(0, 12))}`);
  }
  // positions: V - A per stop (CSS px), and A2 - A, V2 - V as the floor
  const P = (arm, k) => { const l = res.loads.find((x) => x.arm === arm); const s = l && l.stops.find((x) => x.k === k); return s && s.pos; };
  for (const S of STOPS) {
    const Sx = (shots[S.k] ||= {});
    for (const a of ARMS) if (!Sx[a] && existsSync(join(OUT, `${a}-${S.k}.png`))) Sx[a] = { file: join(OUT, `${a}-${S.k}.png`), hits: [] };
    const pa = P('A', S.k), pv = P('V', S.k);
    const dpos = pa && pv ? { text: pa.text.map((x, i) => pv.text[i] ? [x[0], +(pv.text[i][1] - x[1]).toFixed(2), +(pv.text[i][2] - x[2]).toFixed(2)] : null), o: pa.o.map((x, i) => +(pv.o[i] - x).toFixed(2)), vector: pa.vector.map((x, i) => +(pv.vector[i] - x).toFixed(2)) } : null;
    if (ARMS.some((a) => !Sx[a])) { res.stops.push({ k: S.k, void: 'missing arm', dpos }); console.log(S.k, 'dpos', JSON.stringify(dpos)); continue; }
    const row = { k: S.k, dpos, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, Sx[a].file])), { V: Sx.V.hits, V2: Sx.V2.hits }, 3, 0) };
    res.stops.push(row); console.log(line(S.k, row)); console.log('   dpos V-A', JSON.stringify(dpos)); for (const a of ['A', 'V']) { const q = P(a, S.k); q && console.log(`   ${a} o ${JSON.stringify(q.o)} style ${JSON.stringify(q.oStyle)} anims ${JSON.stringify(q.oAnims)} inHero ${q.oInHero} heroPaused ${q.heroPaused} cls ${q.cls}`); }
  }
} finally {
  res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
  writeFileSync(join(OUT, `px-${RUN.join('')}.json`), JSON.stringify(res, null, 1));
  try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {}
  console.log('wrote', OUT);
  const bad = res.loads.filter((l) => l.void).map((l) => l.arm);
  if (bad.length) { console.log(`GATE VOID: load(s) ${bad.join(', ')} failed`); process.exitCode = 3; }
}
process.exit(process.exitCode || 0);

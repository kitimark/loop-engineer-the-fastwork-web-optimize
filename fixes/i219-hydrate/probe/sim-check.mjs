#!/usr/bin/env node
// i219-hydrate: Simulator (Mobile Safari, fw-sim) FUNCTIONAL check of C vs F, no timing. Per build (order C, F): own
// server (plain http, --vendors=local, --no-cache, own port), `sim.mjs open`, then over the inspector:
//   - hydration: Console.enable (WebKit replays the page's earlier console messages to a new client), every message
//     matching hydrat / HierarchyRequestError; plus two DOM markers of a successful hydrate that do not need the
//     console: SvelteKit's inline start <script> still in <body> (the re-mount's textContent = "" removes it) and the
//     language switch's aria-controls id (server "s…" kept vs client "c…");
//   - the earn button's outerHTML (inline style masked);
//   - rev 7d's WebKit paths on the live DOM: a morph open and close through the page's own scroll (instant scrollTo
//     into the end zone to m 1, then back above it), reading the header's --morph and the inline --morph that
//     F-183's writer (__mkW) puts on the bar, logo, actions, earn button and language wrap, the header classes, the
//     panel's computed opacity and the earn box's computed background, at pre / open / closed.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-i219-hydrate -- \
//     node tools/sim.mjs session --functional --owner fix-i219-hydrate -- node fixes/i219-hydrate/probe/sim-check.mjs
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const DIRS = { C: join(WT, 'out/i219/C'), F: join(WT, 'fixes/i219-hydrate/overlay') };
const OUT = join(WT, 'out/i219', `sim-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
const STATE = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const b = document.querySelector('.start-selling-top-nav-btn.is-earn');
  const box = b && b.querySelector('.start-selling-top-nav-earn-box'); const p = document.querySelector('.start-selling-morph-panel');
  const inl = (sel) => { const e = document.querySelector(sel); return e ? e.style.getPropertyValue('--morph') : null; };
  return { y: Math.round(scrollY), m: h && h.style.getPropertyValue('--morph'), cls: h && h.className.replace(/svelte-\\w+/g, '').trim(),
    inline: { bar: inl('.start-selling-top-nav-bar'), logo: inl('.start-selling-top-nav-logo'), actions: inl('.start-selling-top-nav-actions'), earn: inl('.start-selling-top-nav-btn.is-earn'), wrap: inl('.start-selling-language-switch-wrap') },
    panelOpacity: p ? getComputedStyle(p).opacity : null, earnBoxBg: box ? getComputedStyle(box).backgroundColor : null, earnOpacity: b ? getComputedStyle(b).opacity : null,
    earnRect: b ? (() => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() : null }; })())`;
const MARKERS = `JSON.stringify({ startScript: [...document.body.querySelectorAll('script')].some((s) => /kit\\.start|__sveltekit_/.test(s.textContent)), ariaControls: document.querySelector('.start-selling-language-switch')?.getAttribute('aria-controls') || null,
  earn: document.querySelector('.start-selling-top-nav-btn.is-earn')?.outerHTML.replace(/style="[^"]*"/g, 'style=…') || null, ua: navigator.userAgent.replace(/\\(.*?\\)/, '(…)') })`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const max = document.documentElement.scrollHeight - innerHeight; return { t: e ? e.offsetHeight : 0, max, ih: innerHeight }; })())`;
const res = { tool: 'fixes/i219-hydrate/probe/sim-check.mjs', at: new Date().toISOString(), loads: [] };
try {
  for (const k of ['C', 'F']) {
    const st = join(OUT, `serve-${k}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', DIRS[k], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { k }; let c = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      const url = `http://localhost:${s.port}/`;
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 60 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(3000);
      const msgs = []; c.on((m) => { if (m.method === 'Console.messageAdded') { const x = m.params.message; msgs.push({ level: x.level, text: String(x.text || '').slice(0, 200) }); } });
      await c.send('Console.enable').catch((e) => { load.consoleErr = String(e.message || e); });
      await sleep(1500);
      load.console = { n: msgs.length, hydrate: msgs.filter((m) => /hydrat|HierarchyRequestError/i.test(m.text)), warnErr: msgs.filter((m) => /warn|error/.test(m.level)).slice(0, 8) };
      load.markers = JSON.parse(await c.evaluate(MARKERS));
      // walk down to above the end zone (lazy sections mount), then pre / open / closed
      const g0 = JSON.parse(await c.evaluate(GEO)); load.geo = g0;
      if (!g0.t) throw new Error('no .fw-ms-end (7c off?)');
      const endStart = g0.max - g0.t;
      await c.evaluate(`new Promise((r) => { let y = 0; const L = ${endStart - g0.ih}; const step = () => { y = Math.min(L, y + 500); scrollTo({ top: y, behavior: 'instant' }); y < L ? setTimeout(step, 80) : setTimeout(() => r(1), 1500); }; step(); })`);
      const g = JSON.parse(await c.evaluate(GEO)); const es = g.max - g.t; load.geoAtStops = { ...g, endStart: es };
      load.pre = JSON.parse(await c.evaluate(STATE));
      // a held synthetic touch (as em-px): only the 7d settle's passive window listener sees it, so the page does not
      // settle the morph back while the probe stands in the zone
      await c.evaluate(`(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`);
      for (const m of [0.5, 1]) { await c.evaluate(`(scrollTo({ top: ${Math.round(es + m * g.t)}, behavior: 'instant' }), 1)`); await sleep(2500); load['open' + m] = JSON.parse(await c.evaluate(STATE)); }
      load.open = load.open1;
      await c.evaluate(`(scrollTo({ top: ${es - g.ih}, behavior: 'instant' }), 1)`); await sleep(2500);
      load.closed = JSON.parse(await c.evaluate(STATE));
      load.errors = await c.evaluate('JSON.stringify(window.__i219e || null)');
    } catch (e) { load.void = String(e.stack || e); }
    finally { try { c && c.close(); } catch {} p.kill(); rmSync(st, { force: true }); res.loads.push(load); }
    console.log(`${k}: console ${load.console?.n} msgs, hydrate msgs ${load.console?.hydrate.length}${load.console?.hydrate[0] ? ' (' + load.console.hydrate[0].text.slice(0, 100) + ')' : ''}; start script ${load.markers?.startScript}, aria-controls ${load.markers?.ariaControls}${load.void ? '; VOID ' + load.void.slice(0, 200) : ''}`);
    console.log(`   earn ${load.markers?.earn}`);
    console.log(`   geo ${JSON.stringify(load.geoAtStops)}`);
    for (const ph of ['pre', 'open0.5', 'open1', 'closed']) if (load[ph]) console.log(`   ${ph.padEnd(6)} ${JSON.stringify(load[ph])}`);
  }
  const [C, F] = res.loads; const strip = (x) => x && JSON.stringify({ ...x, y: undefined });
  res.same = { earn: C.markers?.earn === F.markers?.earn, pre: strip(C.pre) === strip(F.pre), open: strip(C.open) === strip(F.open), closed: strip(C.closed) === strip(F.closed) };
  console.log('same C vs F:', JSON.stringify(res.same));
} finally {
  writeFileSync(join(OUT, 'sim.json'), JSON.stringify(res, null, 1));
  console.log('wrote', join(OUT, 'sim.json').replace(WT + '/', ''));
}

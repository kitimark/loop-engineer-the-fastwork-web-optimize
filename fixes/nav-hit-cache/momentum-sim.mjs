// nav-hit-cache momentum case on the Simulator (WebKit), P-117 N1 (lead ruling). COUNTS ONLY, no timing claim (F-084).
// Decides locally whether WebKit fires a scroll event in every frame where the page moves during momentum, and audits
// the nav cache through it: arm VA of the given base (build.mjs; default v8sc = the P-117 combined V + the DEBUG audit
// hook). Per load: its own server on a new port (own origin, F-115), plain http, `sim.mjs open`, then
// gestures/momentum-flick-v1.json through `sim.mjs gesture --inject momentum-inject.mjs` (WDA fling strokes down the page
// to the end and back to the top, each glide left to settle). The record keeps each load's served hashes.
// Run (WDA gestures are timing for the lock: a normal exclusive hold; sim.mjs gesture refuses a --no-timing hold or a
// --functional session):
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --owner fix-nav-morph -- sh -c 'node tools/sim.mjs wda start && node fixes/nav-hit-cache/momentum-sim.mjs <records.json> 2'
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
// probe.mjs's continuous scroll (10 px per step); task: the next step in a timer after the rAF, raf: in the rAF
const SCROLL = (to, mode) => { const next = mode === 'task' ? '() => setTimeout(step, 0)' : 'step';
  return `new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; const goal = Math.max(0, Math.min(max, ${to}));
  let y = scrollY, n = 0; const dir = goal >= y ? 1 : -1;
  const step = () => { y = dir > 0 ? Math.min(goal, y + 10) : Math.max(goal, y - 10); scrollTo({ top: y, behavior: 'instant' }); n++;
    if (y !== goal && n < 5000) requestAnimationFrame(${next}); else requestAnimationFrame(() => requestAnimationFrame(() => res({ n, y: scrollY, max }))); };
  requestAnimationFrame(${next}); })`; };
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const outPath = argv[0], LOADS = Number(argv[1] || 2);
const bi = argv.indexOf('--base'), BASE_NAME = bi > 0 ? argv[bi + 1] : 'v8sc';
if (!outPath) { console.error('usage: momentum-sim.mjs <records.json> [loads=2] [--base v8sc]'); process.exit(1); }
const ARMS = build({ quiet: true, base: BASE_NAME });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const SCRIPT = join(WT, 'fixes/nav-hit-cache/gestures/momentum-flick-v1.json');
const INJECT = join(WT, 'fixes/nav-hit-cache/momentum-inject.mjs');
const D = join(WT, 'out/nav-hit-cache/sim'); mkdirSync(D, { recursive: true });

const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { tool: 'fixes/nav-hit-cache/momentum-sim.mjs', base: BASE_NAME,
  arm: { VA: { js: ARMS.VA.js, css: ARMS.VA.css }, V: { js: ARMS.V.js, css: ARMS.V.css } }, script: 'fixes/nav-hit-cache/gestures/momentum-flick-v1.json',
  scriptSha: sha(readFileSync(SCRIPT)), injectSha: sha(readFileSync(INJECT)), note: 'Simulator: counts only, ms never judged (F-084)', loads: [] };
for (let k = 1; k <= LOADS; k++) {
  const st = join(D, `serve-momentum-${process.pid}-${k}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS.VA.dir, '--port', '0', '--quiet', '--no-cache',
    '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm: 'VA', rep: k, startedAt: new Date().toISOString() };
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== ARMS.VA.js || load.served.css !== ARMS.VA.css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMS.VA.js + ' / ' + ARMS.VA.css);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(4000);
    const g = spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'gesture', SCRIPT, '--label', `nhc-momentum-${k}`, '--inject', INJECT], { cwd: WT, encoding: 'utf8', timeout: 240000 });
    const gOut = (g.stdout || '') + (g.stderr || '');
    const saved = /saved (\S+)/.exec(gOut)?.[1] ?? null;
    load.gesture = { status: g.status, saved: saved && saved.replace(WT + '/', '') };
    if (g.status || !saved) throw new Error('gesture: ' + gOut.trim().split('\n').slice(-4).join(' | ').slice(0, 600));
    const G = JSON.parse(readFileSync(saved, 'utf8'));
    load.gestureSummary = G.summary ?? null;
    const injs = (G.inject || G.run?.inject || []).filter((x) => x.value).map((x) => ({ seg: x.seg, v: typeof x.value === 'string' ? JSON.parse(x.value) : x.value }));
    const pick = injs.find((x) => x.v?.marks?.some(([n]) => n === 'fwg:up')) || injs[injs.length - 1];
    if (!pick || !pick.v) throw new Error('no inject read');
    load.seg = pick.seg; load.y = pick.v.y; load.summary = pick.v.s; load.audit = pick.v.audit; load.marks = pick.v.marks;
    writeFileSync(join(D, `momentum-frames-${k}-${load.startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(pick.v.frames));
    load.framesFile = `out/nav-hit-cache/sim/momentum-frames-${k}-${load.startedAt.replace(/[:.]/g, '-')}.json`;
    // part 2, the same page in WebKit: the Chrome parity audit's scripted scroll (probe.mjs SCROLL), 10 px per step,
    // top -> bottom -> top, in task mode (scrollTo in a timer, ordered like input: the gate) and raf mode (scrollTo in a
    // rAF callback: the harness lag, F-239, report only). fix-scroll-cb's Simulator log used raf mode.
    const c = k === 1 ? await openTab(`localhost:${s.port}`) : null; // load 1 only: the hold fits two gesture loads + one scripted pair
    try {
      load.scripted = {};
      for (const mode of c ? ['task', 'raf'] : []) {
        await c.evaluate(`(scrollTo({ top: 0, behavior: 'instant' }), window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] }, window.__nhcS = null, 0)`);
        await sleep(1500);
        // fix-scroll-cb's task-mode report: a one-step .pain is-pain-dark flicker near the bottom on the way up, only in
        // builds with this patch. Log every is-pain-dark and nav is-on-dark change with the live scrollY (MutationObserver,
        // no layout read) to see whether it shows here; no control arm in this hold, so it only says "seen / not seen"
        await c.evaluate(`(window.__nhcMo && window.__nhcMo.disconnect(), window.__nhcFl = [], ((p, nv) => {
          let lp = p && p.classList.contains('is-pain-dark'), ln = nv && nv.classList.contains('is-on-dark');
          window.__nhcMo = new MutationObserver(() => { const a = p && p.classList.contains('is-pain-dark'), b = nv && nv.classList.contains('is-on-dark');
            if (a !== lp) { const pr = p.getBoundingClientRect(), f = document.querySelector('.start-selling-future'), fr = f && f.getBoundingClientRect(); window.__nhcFl.push(['pain', Math.round(scrollY), a ? 1 : 0, Math.round((pr.top + scrollY) * 10) / 10, document.documentElement.scrollHeight, fr ? Math.round((fr.top + scrollY) * 10) / 10 : null, Math.round(pr.top * 10) / 10]); } if (b !== ln) window.__nhcFl.push(['nav', Math.round(scrollY), b ? 1 : 0]); lp = a; ln = b; });
          for (const e of [p, nv]) e && window.__nhcMo.observe(e, { attributes: true, attributeFilter: ['class'] }); })(document.querySelector('.pain'), document.querySelector('.start-selling-top-nav')), 0)`);
        await c.evaluate(`(window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] }, ${SCROLL('1e9', mode)}.then((d) => ${SCROLL('0', mode)}.then((u) => { window.__nhcS = { n: d.n + u.n, y: u.y }; })), 0)`);
        let r = null;
        for (let j = 0; j < 150 && !r; j++) { await sleep(1000); r = await c.evaluate('window.__nhcS'); }
        const A = JSON.parse(await c.evaluate('JSON.stringify(window.__nhcAudit)'));
        const sync = (l) => l.filter((x) => x[0] === x[3]).length;
        load.scripted[mode] = { steps: r && r.n, endY: r && r.y, tested: A.t, cached: A.n, lag: A.lag, theme: [A.m.length, sync(A.m)],
          sticky: [A.v.length, sync(A.v)], pill: [A.p.length, sync(A.p)], first: [...A.m, ...A.v, ...A.p].slice(0, 10),
          flips: JSON.parse(await c.evaluate('JSON.stringify(window.__nhcFl || [])')) };
        console.log('scripted', k, mode, JSON.stringify(load.scripted[mode]));
      }
    } finally { c && c.close(); }
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { p.kill(); }
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  console.log('load', k, JSON.stringify(load.served || {}), load.void || '', JSON.stringify(load.summary || {}), JSON.stringify(load.audit ? { ...load.audit, first: load.audit.first.slice(0, 3) } : {}));
}

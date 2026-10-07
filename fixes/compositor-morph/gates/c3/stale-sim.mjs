// c3 coverage proof, stale-geometry frames (lead 06:0xZ): c3 keeps the nav cache's geometry and __msTick's end geometry
// across a Safari toolbar move near the end zone (re-measure deferred past the frame). In every frame in which that
// stale geometry can be used (a resize in this frame or the one before), does the shown state equal the state computed
// from fresh reads? iOS Simulator Safari, WDA finger strokes through m = 0 in both directions (toolbar 775 <-> 815).
// Per scroll event the probe's rAF runs after the page's (its scroll listener is added after the page's): it logs
// y, innerHeight, the nav's is-on-dark and is-morphing, the m the page wrote (glass blur on u3, c3: 20px x (1 - m)),
// a fresh F() replica (JS 13929-13967's probe point, skip rule and dark lists) and m from fresh reads
// ((y - (scrollHeight - innerHeight - endH)) / endH). Functional (its reads force layout; no timing).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//     node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c 'node tools/sim.mjs wda start && node out/cm/stale-sim.mjs C3=out/cm/c3'
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const WT = join(HERE, '../../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs')); const simlib = await import(join(WT, 'tools/lib/sim.mjs'));
const arms = process.argv.slice(2).filter((a) => a.includes('='));
const S = await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true });
const stroke = (y0, y1, ms, hold = 0) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 30 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, ...(hold ? [{ type: 'pause', duration: hold }] : []), { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, 'out/cm/stale'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const ARM = `(() => { if (window.__st) return 0; const L = (window.__st = []); let lastIh = innerHeight, rz = -1e9, fr = 0;
  const T = document.querySelector('header.start-selling-top-nav'), end = document.querySelector('.fw-ms-end');
  const u = ['.commission-card', '.start-selling-future-card', '.hero'], d = ['.pain', '.start-selling-platform-card', '.start-selling-platform'];
  const j = (e) => !e || u.some((t) => e.closest(t)) ? false : !!(d.some((t) => e.closest(t)) || e.closest('.commission.shrinking'));
  const F = () => { const r = T.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height, 64) / 2;
    for (const e of document.elementsFromPoint(x, y)) if (!T.contains(e) || e.closest('.start-selling-top-nav-actions, .start-selling-morph-panel')) return j(e) ? 1 : 0;
    return j(null) ? 1 : 0; };
  window.addEventListener('resize', () => { if (innerHeight !== lastIh) { rz = performance.now(); lastIh = innerHeight; } });
  let pend = 0;
  window.addEventListener('scroll', () => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; fr++;
    const y = scrollY, ih = innerHeight, c = T.classList, u3 = T.querySelector('[data-fw-cm="u3"]');
    const bf = u3 ? u3.style.getPropertyValue('backdrop-filter') : '', mb = /blur\\(([-0-9.e]+)px\\)/.exec(bf);
    const mJs = c.contains('is-morphing') ? (mb ? +(1 - +mb[1] / 20).toFixed(5) : null) : 0;
    const eh = end.offsetHeight, mF = Math.min(1, Math.max(0, (y - (document.documentElement.scrollHeight - ih - eh)) / eh));
    L.push([Math.round(performance.now()), y, ih, c.contains('is-on-dark') ? 1 : 0, c.contains('is-morphing') ? 1 : 0, mJs, +mF.toFixed(5), F(), performance.now() - rz <= 400 ? 1 : 0]); }); }, { passive: true });
  return 1; })()`;
const res = { tool: 'out/cm/stale-sim.mjs', arms: {} };
try {
  for (const a of arms) {
    const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
    const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = null; const row = {};
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
      await sleep(1500); c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.evaluate(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      const g = await c.evaluate(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, endStart: max - t, cm: document.documentElement.classList.contains('fw-cm') }; })()`);
      await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 250}, behavior: 'instant' }), 1)`); await sleep(1500);
      row.armed = await c.evaluate(ARM);
      // through m = 0 both ways, short and long, with holds (the toolbar slides on each direction change)
      for (let k = 0; k < 5; k++) { await S.actions(stroke(650, 300, 450)); await sleep(500); await S.actions(stroke(300, 650, 450)); await sleep(500); }
      for (let k = 0; k < 3; k++) { await S.actions(stroke(700, 250, 600, 300)); await sleep(400); await S.actions(stroke(250, 700, 600, 300)); await sleep(400); }
      await sleep(1000);
      const L = await c.evaluate('JSON.stringify(window.__st)').then(JSON.parse);
      row.g = g; row.n = L.length; row.log = L;
      const ihs = {}; for (const r of L) ihs[r[2]] = (ihs[r[2]] || 0) + 1;
      const stale = L.filter((r) => r[8]);
      const chk = (rows) => ({ n: rows.length, darkMismatch: rows.filter((r) => r[4] === 0 || true).filter((r) => (r[6] <= 0.2 ? r[3] !== r[7] : r[3] !== 1)).length,
        mMismatch: rows.filter((r) => r[5] !== null && Math.abs(r[5] - r[6]) > 0.002).length, morphMismatch: rows.filter((r) => (r[6] > 0) !== (r[4] === 1)).length,
        mNull: rows.filter((r) => r[5] === null).length, maxDm: Math.max(0, ...rows.filter((r) => r[5] !== null).map((r) => Math.abs(r[5] - r[6]))) });
      row.all = chk(L); row.stale = chk(stale);
      row.staleByIh = {}; for (const r of stale) (row.staleByIh[r[2]] ||= []).push(r);
      for (const k of Object.keys(row.staleByIh)) row.staleByIh[k] = chk(row.staleByIh[k]);
      row.staleInM = stale.filter((r) => r[6] > 0).length;
      console.log(`${label}: cm ${g.cm}, frames ${L.length}, innerHeights ${JSON.stringify(ihs)}`);
      console.log(`  all frames: ${JSON.stringify(row.all)}`);
      console.log(`  late-window frames (a toolbar step in the last 400 ms; c3 re-measures 300 ms after the last): ${JSON.stringify(row.stale)}, of them with m > 0: ${row.staleInM}`);
      for (const [k, v] of Object.entries(row.staleByIh)) console.log(`    at innerHeight ${k}: ${JSON.stringify(v)}`);
      const bad = L.filter((r) => (r[6] <= 0.2 ? r[3] !== r[7] : r[3] !== 1) || (r[5] !== null && Math.abs(r[5] - r[6]) > 0.002) || ((r[6] > 0) !== (r[4] === 1)));
      for (const r of bad.slice(0, 12)) console.log(`  MISMATCH t ${r[0]} y ${r[1]} ih ${r[2]} dark ${r[3]} morph ${r[4]} mJs ${r[5]} mFresh ${r[6]} F ${r[7]} stale ${r[8]}`);
    } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
    finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms[label] = row;
  }
} finally { try { await S.close(); } catch {} }
const f = join(OUT, `stale-${STAMP}.json`); writeFileSync(f, JSON.stringify(res)); console.log('WROTE', f);

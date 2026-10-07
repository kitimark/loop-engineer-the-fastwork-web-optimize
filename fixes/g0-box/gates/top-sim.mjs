// g0-box (fix-g0-box): the M3-B structure is permanent from load, so check it far from the end (lead, 2026-10-07):
// per arm, one load in the iOS Simulator, COUNTS ONLY (Simulator ms are a rank, never judged, F-084):
//   1. census (LayerTree.layersForNode on the document: layers, MB, the nav's layers named) at the top (y 0, after
//      the card's idle mount), then
//   2. a Timeline pass over a scripted top-of-page scroll (rAF steps of 24 px from y 0 for 110 frames, then 1.5 s rest):
//      frames, style recalcs, layouts, paints (n, Mpx, top rects) per segment,
//   3. census mid-page (y = scrollHeight / 2, 2.5 s still) and at the end (bottom, 2.5 s still).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/gates/top-sim.mjs A=out/g0box/g00 V=fixes/g0-box/overlay
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n');
  process.exit(0);
}
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const arms = process.argv.slice(2).filter((a) => a.includes('='));
const OUT = join(WT, 'out/g0box/counts'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const zero = () => ({ frames: 0, nLayout: 0, nStyle: 0, nPaint: 0, paintPx: 0, rects: {} });
const rectOf = (x) => { const c = x.data?.clip; if (Array.isArray(c) && c.length >= 8) { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))]; } if (x.data && 'width' in x.data) return [Math.round(x.data.width), Math.round(x.data.height)]; return null; };
const cost = (r, o) => { o.frames++; const walk = (x) => { if (x.type === 'Paint') { o.nPaint++; const rc = rectOf(x); if (rc) { o.paintPx += rc[0] * rc[1]; const k = rc.join('x'); o.rects[k] = (o.rects[k] || 0) + 1; } } if (x.type === 'Layout') o.nLayout++; if (x.type === 'RecalculateStyles') o.nStyle++; for (const ch of x.children || []) walk(ch); }; walk(r); return o; };
const top = (rects) => Object.entries(rects).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}x${n}`).join(' ');
const fmt = (o) => `frames ${o.frames} | style ${o.nStyle} | layout ${o.nLayout} | paint ${o.nPaint} ${(o.paintPx / 1e6).toFixed(2)} Mpx [${top(o.rects)}]`;
const marks = (r) => { const out = []; const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message) out.push(x.data.message); st.push(...(x.children || [])); } return out; };
const res = { tool: 'fixes/g0-box/gates/top-sim.mjs', stamp: STAMP, arms: {} };
for (const a of arms) {
  const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
  const st = join(OUT, `serve-top-${label}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null; const row = { dir, census: {} };
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    await sleep(500);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?t=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(1500);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(6000);   // the card's idle mount (requestIdleCallback, or a 2 s timer after load in Safari)
    row.mounted = await c.evaluate(`!!document.querySelector('.start-selling-morph-panel')`);
    await c.send('LayerTree.enable').catch(() => {});
    const docId = (await c.send('DOM.getDocument', {})).root.nodeId;
    const name = async (l) => { let cls = '?'; try { if (l.nodeId) { const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId }); const v = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; const own = this.nodeType === 1 ? (this.tagName.toLowerCase() + "." + String(this.className && this.className.baseVal !== undefined ? this.className.baseVal : this.className).trim().split(/\\s+/).slice(0, 2).join(".")) : this.nodeName; return (e && e.closest("header.start-selling-top-nav") ? "NAV " : "") + own; }', returnByValue: true }); cls = v.result?.value ?? '?'; } } catch {} return `${cls}${l.pseudoElement ? '::' + l.pseudoElement : ''} ${Math.round(l.bounds?.width ?? 0)}x${Math.round(l.bounds?.height ?? 0)} ${((l.memory || 0) / 1e6).toFixed(2)}MB`; };
    const census = async (k) => {
      const ls = (await c.send('LayerTree.layersForNode', { nodeId: docId })).layers || []; const nav = [];
      let navMB = 0; for (const l of ls) { const nm = await name(l); if (nm.startsWith('NAV ')) { nav.push(nm.slice(4)); navMB += (l.memory || 0) / 1e6; } }
      const o = { n: ls.length, mb: +(ls.reduce((x, l) => x + (l.memory || 0), 0) / 1e6).toFixed(1), navN: nav.length, navMB: +navMB.toFixed(2), nav, y: await c.evaluate('Math.round(scrollY)') };
      row.census[k] = o; console.log(`${label} census ${k} y ${o.y}: ${o.n} layers ${o.mb} MB | nav ${nav.length} ${o.navMB} MB: ${nav.join(' ; ')}`);
    };
    await census('top');
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [k2, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(k2, prm);
    await c.evaluate(`(window.__sd = 0, (async () => { const raf = () => new Promise((r) => requestAnimationFrame(r)); const wait = (t) => new Promise((r) => setTimeout(r, t));
      await raf(); performance.mark('seg:rest0'); await wait(1000);
      await raf(); performance.mark('seg:scroll'); for (let i = 1; i <= 110; i++) { window.scrollTo({ top: i * 24, behavior: 'instant' }); await raf(); }
      performance.mark('seg:rest1'); await wait(1500); performance.mark('seg:x'); window.__sd = 1; })(), 1)`);
    for (let i = 0; i < 80 && !(await c.evaluate('window.__sd')); i++) await sleep(250);
    await sleep(800); await c.send('Timeline.stop').catch(() => {}); await sleep(800);
    recs.sort((x, y) => x.startTime - y.startTime);
    const seg = {}; let cur = 'x';
    for (const r of recs) { const mk = marks(r).filter((x) => x.startsWith('seg:')); if (mk.length) cur = mk[mk.length - 1].slice(4); if (r.type === 'RenderingFrame' && cur !== 'x') cost(r, (seg[cur] ||= zero())); }
    row.seg = seg; for (const [k2, o] of Object.entries(seg)) console.log(`${label} ${k2.padEnd(6)} ${fmt(o)}`);
    await c.evaluate(`(window.scrollTo({ top: Math.round(document.documentElement.scrollHeight / 2), behavior: 'instant' }), 1)`); await sleep(2500); await census('mid');
    await c.evaluate(`(window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 1)`); await sleep(2500); await census('end');
    await c.send('LayerTree.disable').catch(() => {});
  } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms[label] = row;
}
const f = join(OUT, `top-sim-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);

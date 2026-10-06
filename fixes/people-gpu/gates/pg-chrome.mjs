// people-gpu (fix-people-gpu, user T-224): Chrome COUNTS for the #people title's "o" widening and the card reveal.
// No timing judged (memory defer-timing). Headless Chrome 430 x H DPR 3, mobile + touch, hover:none / pointer:coarse,
// no CPU throttle. One console.timeStamp per rAF splits the trace into one window per frame; a MutationObserver stamps
// the O's class (is-stack / is-expanded) and the section's is-visible, so every frame is labelled by phase.
// Arms (CSS injected after load, same build):
//   V   the build as served          N   the O's transitions off           B   the card's blur off (filter: none)
//   P   every CSS animation outside #people paused (F-227's background)    PN  P + N
//   X   a second overlay (--snap2), as served (the candidate)
// Per arm, phases (trace on throughout):
//   reveal  park 80 px above the is-visible threshold (O already open), rAF-step 8 px/frame across it, then 150 frames
//   grow    jump the heading off screen (O resets), 2 s, jump back to the title, 260 frames (wait 1.3 s, stack, grow)
//   close   rAF-step 12 px/frame down until the O resets, then 90 frames
// Output per arm and phase label: frames, per-frame medians and totals of style / layout / paint / paint area / raster,
// O and card Animation compositeFailed reasons, and (arm V) the running animations at the title.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 240 --owner fix-people-gpu -- \
//     node fixes/people-gpu/gates/pg-chrome.mjs --snap <abs overlay dir> [--snap2 <abs dir>] [--arms V,N,B,P,PN] [--h 775]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SNAP = arg('--snap'), SNAP2 = arg('--snap2', null);
if (!SNAP) throw new Error('--snap <abs overlay dir>');
const H = Number(arg('--h', '775'));
const ARMS = arg('--arms', 'V,N,B,P,PN').split(',');
const PHASES = arg('--phases', 'reveal,grow,close').split(',');
const LABEL = arg('--label', 'v10cm');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/people-gpu'); mkdirSync(OUT, { recursive: true });
const CSS = {
  N: `.start-selling-future-people-o, .start-selling-future-people-o * { transition: none !important; }`,
  B: `.start-selling-future > .start-selling-future-card { filter: none !important; }`,
  P: `html *:not(#people, #people *), html *:not(#people, #people *)::before, html *:not(#people, #people *)::after { animation-play-state: paused !important; }`,
};
CSS.PN = CSS.P + '\n' + CSS.N;
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'blink.animations', 'blink.user_timing'].join(',');
const INIT = `(() => {
  window.__pg = [];
  const st = () => { const o = document.querySelector('.start-selling-future-people-o'), s = document.querySelector('section.start-selling-future');
    return (s && s.classList.contains('is-visible') ? 'V' : 'h') + (o && o.classList.contains('is-stack') ? 'S' : '') + (o && o.classList.contains('is-expanded') ? 'E' : ''); };
  const note = () => { const s = st(); const l = window.__pg[window.__pg.length - 1]; if (l && l.s === s) return; window.__pg.push({ s, t: performance.now(), y: Math.round(scrollY) }); console.timeStamp('pgs:' + s); };
  const hook = () => { const o = document.querySelector('.start-selling-future-people-o'), s = document.querySelector('section.start-selling-future'), h = document.getElementById('future-heading');
    if (!o || !s || !h) return false; const mo = new MutationObserver(note); mo.observe(o, { attributes: true, attributeFilter: ['class'] }); mo.observe(s, { attributes: true, attributeFilter: ['class'] });
    new IntersectionObserver(([e]) => { window.__pgIO = window.__pgIO || []; window.__pgIO.push({ in: e.isIntersecting, y: Math.round(scrollY), t: performance.now() }); }, { threshold: 0.35 }).observe(h);
    note(); return true; };
  document.addEventListener('DOMContentLoaded', () => { if (!hook()) { const m = new MutationObserver(() => { if (hook()) m.disconnect(); }); m.observe(document.documentElement, { childList: true, subtree: true }); } });
})();`;
const GEO = `(() => { const h = document.getElementById('future-heading'); const r = h.getBoundingClientRect(); const ht = document.querySelector('.hero-track');
  return { y: Math.round(scrollY), ih: innerHeight, titleTop: Math.round(r.top + scrollY), titleH: Math.round(r.height), max: document.documentElement.scrollHeight - innerHeight }; })()`;
// one timeStamp per rAF; ys[k] scrolled in frame k (null = no scroll); stop early when stopJs is true (then extra frames)
const RUN = (phase, ys, rest, stopJs = 'false', extra = 0) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; let k = 0, stopAt = -1;
  const f = () => { console.timeStamp('pgf:${phase}:' + k);
    if (stopAt < 0 && k < ys.length) { if (ys[k] != null) window.scrollTo({ top: ys[k], behavior: 'instant' }); if (${stopJs}) stopAt = k; }
    k++; const end = stopAt >= 0 ? stopAt + 1 + ${extra} : ys.length + ${rest}; if (k < end) requestAnimationFrame(f); else { console.timeStamp('pgf:${phase}:end'); res(k); } };
  requestAnimationFrame(f); })`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));
const ANIMS = `document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target; const k = t ? (t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).replace(/svelte-\\w+/g, '').trim().split(/\\s+/).slice(0, 2).join('.')) : '?';
  const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null; const onScreen = r ? (r.bottom > 0 && r.top < innerHeight && r.width > 0) : null;
  return [a.constructor.name, a.transitionProperty || a.animationName || '?', k, a.effect.getComputedTiming().iterations === Infinity ? 'inf' : Math.round(a.effect.getComputedTiming().duration), onScreen ? 'on' : 'off', t && t.closest && t.closest('#people') ? 'people' : (t && t.closest && t.closest('section[id]') ? t.closest('section[id]').id : '-')].join(' '); })`;

const isDur = (e) => e.ph === 'X' || e.ph === 'B';
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const stackPath = (st) => Array.isArray(st) ? st.slice(0, 3).map((f) => `${f.functionName || '(anon)'}:${(f.lineNumber ?? -1) + 1}`).join(' < ') : null;
function frameStats(evs) {
  const w = { style: 0, styleEls: 0, layout: 0, dirty: 0, paint: 0, paintArea: 0, raster: 0, forcedLayout: 0, forced: {}, paintBy: {} };
  for (const e of evs) {
    const n = e.name, a = e.args || {};
    if (!isDur(e)) continue;
    if (n === 'UpdateLayoutTree') { w.style++; w.styleEls += a.elementCount ?? a.endData?.elementCount ?? 0; }
    else if (n === 'Layout') { w.layout++; w.dirty += a.beginData?.dirtyObjects ?? 0; const st = a.beginData?.stackTrace; if (st && st.length) { w.forcedLayout++; const k = stackPath(st); w.forced[k] = (w.forced[k] || 0) + 1; } }
    else if (n === 'Paint') { w.paint++; const d = a.data || {}; const b = d.clip ? box(d.clip) : null; const ar = b && b.w * b.h < 1e8 ? b.w * b.h : 0; w.paintArea += ar; const pk = d.nodeId || 0; const pb = (w.paintBy[pk] ||= { n: 0, area: 0 }); pb.n++; pb.area += ar; }
    else if (n === 'RasterTask') w.raster++;
  }
  return w;
}
function analyse(ev, pgStamps) {
  const stamps = ev.filter((e) => e.name === 'TimeStamp').map((e) => ({ ts: e.ts, msg: String(e.args?.data?.message || '') })).sort((a, b) => a.ts - b.ts);
  const cls = stamps.filter((s) => s.msg.startsWith('pgs:'));
  const stateAt = (ts) => { let s = 'pre'; for (const c of cls) { if (c.ts <= ts) s = c.msg.slice(4); else break; } return s; };
  const out = {};
  for (const ph of PHASES) {
    const marks = stamps.filter((s) => s.msg.startsWith(`pgf:${ph}:`));
    const groups = {};
    for (let i = 0; i + 1 < marks.length; i++) {
      const a = marks[i].ts, b = marks[i + 1].ts;
      // label: the class state at the frame's end; the O's grow window is the first 1.5 s after +E
      let lab = stateAt(b);
      if (ph === 'grow' || ph === 'close') { const tE = cls.filter((c) => c.ts <= b && /E$/.test(c.msg) && !/E$/.test(stateAt(c.ts - 1))).pop(); if (/E$/.test(lab) && tE && b - tE.ts > 1.5e6) lab += '-rest'; }
      if (ph === 'reveal') { const tV = cls.filter((c) => c.ts <= b && c.msg.startsWith('pgs:V') && !stateAt(c.ts - 1).startsWith('V')).pop(); if (lab.startsWith('V') && tV) lab = b - tV.ts <= 1e6 ? 'V+0-1s' : 'V+1s-'; }
      const w = frameStats(ev.filter((e) => e.ts >= a && e.ts < b && e.name !== 'TimeStamp'));
      (groups[lab] ||= []).push(w);
    }
    out[ph] = Object.fromEntries(Object.entries(groups).map(([lab, ws]) => {
      const med = (k) => { const s = ws.map((w) => w[k]).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const sum = (k) => ws.reduce((s, w) => s + w[k], 0);
      const forced = {}; for (const w of ws) for (const [k, v] of Object.entries(w.forced)) forced[k] = (forced[k] || 0) + v;
      const paintBy = {}; for (const w of ws) for (const [k, v] of Object.entries(w.paintBy)) { const p = (paintBy[k] ||= { n: 0, area: 0 }); p.n += v.n; p.area += v.area; }
      return [lab, { frames: ws.length, framesWithLayout: ws.filter((w) => w.layout > 0).length, framesWithPaint: ws.filter((w) => w.paint > 0).length,
        median: Object.fromEntries(['style', 'styleEls', 'layout', 'paint', 'paintArea', 'raster'].map((k) => [k, Math.round(med(k))])),
        total: Object.fromEntries(['style', 'styleEls', 'layout', 'dirty', 'forcedLayout', 'paint', 'paintArea', 'raster'].map((k) => [k, Math.round(sum(k))])),
        forced: Object.fromEntries(Object.entries(forced).sort((x, y) => y[1] - x[1]).slice(0, 5)),
        paintBy: Object.fromEntries(Object.entries(paintBy).sort((x, y) => y[1].n - x[1].n).slice(0, 8)) }];
    }));
  }
  // compositor reasons of the O's and the card's animations
  const anim = new Map();
  for (const e of ev.filter((x) => x.name === 'Animation')) {
    const id = e.id2?.local || e.id; const d = e.args?.data || {};
    const r = anim.get(id) || { node: null, name: null, cf: new Set() }; anim.set(id, r);
    if (d.nodeName) r.node = d.nodeName; if (d.name) r.name = d.name; if (d.compositeFailed !== undefined) r.cf.add(d.compositeFailed);
  }
  const cf = {};
  for (const r of anim.values()) { if (!/people-o|future-card/.test(r.node || '')) continue; const k = `${(r.node || '').replace(/^.*class='?([^' ]+).*$/, '$1').slice(0, 60)}|${r.name}`; (cf[k] ||= new Set()); r.cf.forEach((x) => cf[k].add(x)); }
  return { phases: out, compositeFailed: Object.fromEntries(Object.entries(cf).map(([k, v]) => [k, [...v]])), classLog: pgStamps };
}

async function serve(dir, name) {
  const st = join(OUT, `serve-pgc-${name}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}

const srvs = { V: await serve(SNAP, 'V') };
if (SNAP2) srvs.X = await serve(SNAP2, 'X');
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'pg'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/people-gpu/gates/pg-chrome.mjs', label: LABEL, browser: chrome.browser, h: H, snap: SNAP, snap2: SNAP2, arms: {} };
try {
  for (const arm of ARMS) {
    const srv = arm.startsWith('X') ? srvs.X : srvs.V; const armCss = CSS[arm.startsWith('X') ? arm.slice(1) : arm];
    const page = await cdp.newIsolatedPage();
    const r = res.arms[arm] = { css: armCss || null };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      r.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
      if (armCss) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'pg-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
      // walk once to 2 screens past the title (lazy content, images), back to the top; log the thresholds
      let g = await page.eval(GEO);
      await page.eval(`new Promise((res) => { let y = 0; const end = ${g.titleTop + 2 * H}; const f = () => { y = Math.min(end, y + 10); window.scrollTo({ top: y, behavior: 'instant' }); y < end ? requestAnimationFrame(f) : setTimeout(res, 800); }; requestAnimationFrame(f); })`, { timeout: 60000 });
      await page.eval(`(window.scrollTo({ top: 0, behavior: 'instant' }), 1)`); await sleep(1500);
      const walk = await page.eval(`({ cls: window.__pg.slice(), io: (window.__pgIO || []).slice() })`);
      const firstV = walk.cls.find((c) => c.s.startsWith('V')); const ioIn = walk.io.find((x) => x.in);
      r.thresholds = { visibleY: firstV ? firstV.y : null, headingInY: ioIn ? ioIn.y : null, walk };
      g = await page.eval(GEO); r.geo = g;
      const yV = r.thresholds.visibleY ?? g.titleTop - H / 2;
      const yTitle = Math.max(yV + 40, Math.round(g.titleTop + g.titleH / 2 - H / 2));
      r.yTitle = yTitle;
      console.log(arm, 'served', JSON.stringify(r.served), 'visibleY', yV, 'headingInY', r.thresholds.headingInY, 'titleTop', g.titleTop, 'yTitle', yTitle);
      // park above the reveal threshold with the title in view so the O opens before the trace
      await page.eval(`(window.scrollTo({ top: ${Math.max(0, yV - 80)}, behavior: 'instant' }), 1)`); await sleep(3500);
      const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      await sleep(300);
      if (PHASES.includes('reveal')) await page.eval(RUN('reveal', lin(Math.max(0, yV - 80), yV + 80, 20), 150), { timeout: 60000 });
      if (arm === 'V') { await page.eval(`(window.scrollTo({ top: ${yTitle}, behavior: 'instant' }), 1)`); await sleep(2500); r.animsAtTitle = await page.eval(ANIMS); }
      if (PHASES.includes('grow')) {
        await page.eval(`(window.scrollTo({ top: ${g.titleTop + g.titleH + 40}, behavior: 'instant' }), 1)`); await sleep(2000);
        await page.eval(RUN('grow', [yTitle], 260), { timeout: 60000 });
      }
      if (PHASES.includes('close')) await page.eval(RUN('close', lin(yTitle, yTitle + H, Math.round(H / 12)), 0, `!document.querySelector('.start-selling-future-people-o').classList.contains('is-stack')`, 90), { timeout: 60000 });
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000);
      await page.send('Tracing.end'); await done; offT();
      const a = analyse(ev, await page.eval(`window.__pg`));
      Object.assign(r, a);
      r.nodeNames = {}; await page.send('DOM.getDocument', { depth: 0 });
      for (const labs of Object.values(a.phases)) for (const s of Object.values(labs)) for (const k of Object.keys(s.paintBy)) {
        if (k in r.nodeNames) continue; if (!Number(k)) { r.nodeNames[k] = '(none)'; continue; }
        try { const { node } = await page.send('DOM.describeNode', { backendNodeId: Number(k) }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
          r.nodeNames[k] = `${node.localName || node.nodeName}${o.id ? '#' + o.id : ''}${o.class ? '.' + o.class.split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : ''}`; } catch { r.nodeNames[k] = '?'; } }
      for (const [ph, labs] of Object.entries(a.phases)) for (const [lab, s] of Object.entries(labs))
        console.log(arm, ph.padEnd(6), lab.padEnd(8), 'frames', String(s.frames).padStart(3), 'w/layout', String(s.framesWithLayout).padStart(3), 'w/paint', String(s.framesWithPaint).padStart(3), 'med', JSON.stringify(s.median), 'tot', JSON.stringify(s.total), 'paintBy', Object.entries(s.paintBy).slice(0, 4).map(([k, v]) => `${r.nodeNames[k]}:${v.n}/${Math.round(v.area / 1e6)}M`).join(' '));
      console.log(arm, 'compositeFailed', JSON.stringify(a.compositeFailed));
      if (r.animsAtTitle) { console.log(arm, 'running animations at the title:', r.animsAtTitle.length); for (const x of r.animsAtTitle) console.log('   ', x); }
    } catch (e) { r.error = String(e.stack || e); console.log(arm, 'ERROR', r.error); }
    finally { await page.close().catch(() => {}); }
  }
} finally {
  const f = join(OUT, `pgc-${LABEL}-${H}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); for (const s of Object.values(srvs)) s.proc.kill();
  console.log('WROTE', f);
}
process.exit(0);

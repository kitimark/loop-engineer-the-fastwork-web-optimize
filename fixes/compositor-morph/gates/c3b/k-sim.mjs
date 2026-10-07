// c3b-K Simulator gates (arch-compositor-morph): what pre-building the CM layers near the end costs and saves, on
// WebKit (iOS Simulator Safari). Counts and Simulator ms (rank only), no timing verdicts. Per arm (one page load per pass):
//   pass O (opens): the page brought to endStart - 250 (m ~ -0.3) without passing the end zone, at rest 1.5 s (K: pre
//     turns on), then 3 open/close WDA finger strokes; per open the frame that opens (a MutationObserver marks fw-open0
//     when the nav has .is-morphing without .fw-cm-pre, i.e. x > 0, in v13 and K2) and the 2 frames after it:
//     Composite, style and layout in the rendering step and forced in script, Paint.
//   pass A (approach + rest): from m -1.5 at rest, scripted per-frame scrolls (rAF scrollTo): U1 -1.5 -> -0.05 (60 frames,
//     no rest so K's pre is off), rest R1 1.2 s (K: pre on), D1 -0.05 -> -0.9 (50), R2 1.2 s, U2 -0.9 -> -0.05 (50),
//     R3 1.2 s, D2 -0.05 -> -1.5 (60; K: pre off at -1.25), R4 1.2 s. Per segment: frames, Composite / style / layout /
//     paint (n, ms), forced style/layout in script, max frame span. Then rests of 3 s at m -0.5, 0 and 1 (F-321: layouts
//     per second at rest; m 1 is the open end screen).
//   pass P (opens after long rests, K8): as O, but at rest 4.5 s before the first open and after each close (K8 ends
//     pre after 3 s of rest and turns it on again in the first scroll frame toward the end); per open as O, plus the
//     frame in which pre came on (fw-pre1) when that was during the strokes.
//   --rest0 (pass A): then m 1 for 3 s, back to m 0 (a close) and rests there: S0b (0-3 s), S0c (4.5-7.5 s).
//   --pausecm (with --rest0; c3b-e's decisive check): then the CM wrapper animations ([data-fw-cm]) paused, S0p (3 s),
//     played again, S0r (3 s): if S0p's styles drop to 0 and S0r's come back, CM's running animations are the restyle.
//   --probes (with --rest0): then, adding up: no transitions in the nav, nav animations paused, all animations paused (3 s each).
//   pass A also ends with J-0.5b (m 1 -> -0.5) and two rests at m -0.5: S-0.5a (0-3 s) and S-0.5z (3.5-6.5 s; K8: pre ended).
//   pass L (layers, Timeline off): LayerTree.layersForNode(document) at m -1.5 (L0), at rest at m -0.5 after 1.5 s (L1;
//     K: pre on), held open at m 1 with a synthetic touch (L2), back at m -0.5 (L3); count and memory, and the layers new
//     at L1 against L0 (class, size, MB).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//     node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c 'node tools/sim.mjs wda start && node fixes/compositor-morph/gates/c3b/k-sim.mjs V13=out/cm/snap160/V [--pass OAL]'
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const WT = join(HERE, '../../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs')); const simlib = await import(join(WT, 'tools/lib/sim.mjs'));
const argv = process.argv.slice(2);
const arms = argv.filter((a) => a.includes('='));
const PASS = (argv.includes('--pass') ? argv[argv.indexOf('--pass') + 1] : 'OAL').split('');
const S = PASS.includes('O') || PASS.includes('P') ? await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true }) : null;
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 30 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, 'out/cm/ksim'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const MARK = `(() => { const h = document.querySelector('header.start-selling-top-nav'); if (!h || window.__o0) return 0; let open = false;
  let pre = h.classList.contains('fw-cm-pre');
  window.__o0 = new MutationObserver(() => { const now = h.classList.contains('is-morphing') && !h.classList.contains('fw-cm-pre'); if (now && !open) performance.mark('fw-open0'); if (!now && open) performance.mark('fw-close0'); open = now; const p2 = h.classList.contains('fw-cm-pre'); if (p2 && !pre) performance.mark('fw-pre1'); pre = p2; });
  window.__o0.observe(h, { attributes: true, attributeFilter: ['class'] }); return 1; })()`;
const isJs = (t) => /^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|ObserverCallback|EvaluateScript)$/.test(t);
const ms = (x) => (((x.endTime ?? x.startTime) - x.startTime) * 1000);
const marks = (r) => { const out = []; const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message) out.push(x.data.message); st.push(...(x.children || [])); } return out; };
function cost(r, o) {
  o.frames++; o.span = Math.max(o.span, ms(r)); o.spanSum += ms(r);
  const walk = (x, js) => {
    const d = ms(x);
    if (x.type === 'Composite') { o.Composite += d; o.nComposite++; }
    if (x.type === 'Paint') { o.Paint += d; o.nPaint++; }
    if (x.type === 'Layout') { if (js) { o.LayoutJ += d; o.nLayoutJ++; } else { o.Layout += d; o.nLayout++; } }
    if (x.type === 'RecalculateStyles') { if (js) { o.StyleJ += d; o.nStyleJ++; } else { o.StyleR += d; o.nStyleR++; } }
    if (isJs(x.type) && !js) o.Script += d;
    for (const ch of x.children || []) walk(ch, js || isJs(x.type));
  };
  walk(r, false);
}
const zero = () => ({ frames: 0, span: 0, spanSum: 0, Composite: 0, nComposite: 0, Layout: 0, nLayout: 0, StyleR: 0, nStyleR: 0, StyleJ: 0, nStyleJ: 0, LayoutJ: 0, nLayoutJ: 0, Paint: 0, nPaint: 0, Script: 0 });
const fmt = (o) => `frames ${o.frames} max ${o.span.toFixed(1)} | Composite ${o.nComposite} ${o.Composite.toFixed(1)} | Style ${o.nStyleR} ${o.StyleR.toFixed(1)} forced ${o.nStyleJ} ${o.StyleJ.toFixed(1)} | Layout ${o.nLayout} ${o.Layout.toFixed(1)} forced ${o.nLayoutJ} ${o.LayoutJ.toFixed(1)} | Paint ${o.nPaint} ${o.Paint.toFixed(1)} | script ${o.Script.toFixed(1)}`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : innerHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t, cm: document.documentElement.classList.contains('fw-cm') }; })()`;
const NAV = `(() => { const h = document.querySelector('header.start-selling-top-nav'); return h.className.replace(/svelte-\\w+/g, '').trim().split(/\\s+/).filter((k) => /morphing|pre|expanded/.test(k)).join(' ') || '-'; })()`;
async function approach(c, stop) { // bring the page to y = stop in 400 px steps from the top
  await c.evaluate(`(window.__ap = 0, (() => { let y = 0; const stop = ${stop}; const step = () => { y = Math.min(y + 400, stop); window.scrollTo({ top: y, behavior: 'instant' }); y < stop ? setTimeout(step, 60) : setTimeout(() => (window.__ap = 1), 2000); }; step(); })(), 1)`);
  for (let i = 0; i < 100 && !(await c.evaluate('window.__ap')); i++) await sleep(200);
}
async function tl(c, fn) {
  const recs = []; const h = (m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); }; c.on(h);
  for (const [k, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 12 }]]) await c.send(k, prm);
  await fn();
  await sleep(600); await c.send('Timeline.stop').catch(() => {}); await sleep(1000);
  return recs.sort((x, y) => x.startTime - y.startTime);
}
// --probes (with --rest0; inlined into the page script as ACT: the page's CSP refuses eval): which part of the pre state restyles at rest (v14 S0c: 181 per 3 s, c3b-a 0). Each probe is a
// change made at rest, then 3 s measured; the changes add up (each keeps the ones before)
const PROBES = argv.includes('--probes2') ? [
  // second round: nothing in getAnimations() or SMIL (all paused) stops v14's per-frame restyle at S0c (probes3)
  ['XC', 'js', `(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.dataset && t.dataset.fwCm) a.cancel(); } })()`], ['S-cmcancel', 3000],
  ['XR', 'js', `(() => { const h = document.querySelector('header.start-selling-top-nav'); h.classList.remove('fw-cm-pre', 'is-morphing'); })()`], ['S-noclass', 3000],
] : [
  ['XT', 'js', `(() => { const st = document.createElement('style'); st.textContent = 'header.start-selling-top-nav, header.start-selling-top-nav * { transition: none !important; }'; document.head.append(st); })()`], ['S-notrans', 3000],
  ['XN', 'js', `(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.closest && t.closest('header.start-selling-top-nav')) a.pause(); } })()`], ['S-navanim', 3000],
  ['XA', 'js', `(() => { for (const a of document.getAnimations()) a.pause(); })()`], ['S-allanim', 3000],
  // SMIL is not in getAnimations(): #platform's secure-network dash (<animate> x1/x2, JS 13232) keeps ticking
  ['XS', 'js', `(() => { for (const s of document.querySelectorAll('svg')) { try { s.pauseAnimations(); } catch {} } })()`], ['S-smil', 3000],
];
const res = { tool: 'fixes/compositor-morph/gates/c3b/k-sim.mjs', arms: {} };
try {
  for (const a of arms) {
    const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
    const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = null; const row = { dir };
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await sleep(500);
      const load = async () => {
        execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
        await sleep(1500);
        if (c) { try { c.close(); } catch {} }
        c = await openTab(`localhost:${s.port}`);
        for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
        await sleep(2500);
        const g0 = await c.evaluate(GEO);
        await approach(c, g0.endStart - 2 * g0.t);
        return c.evaluate(GEO);
      };
      for (const P of ['O', 'P'].filter((x) => PASS.includes(x))) {
        const r0 = P === 'O' ? 1500 : 4500, r1 = P === 'O' ? 1100 : 4500;
        const g = await load();
        await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 250}, behavior: 'instant' }), 1)`); await sleep(r0);
        const navR = await c.evaluate(NAV); await c.evaluate(MARK);
        // --trace: an rAF logger (scrollY, end-screen geometry, the nav's pre / morphing classes) to see where each
        // stroke starts and where the page rests after each close (m = (y - endStart) / t with the live geometry)
        if (argv.includes('--trace')) await c.evaluate(`(window.__tr = [], (() => { const h = document.querySelector('header.start-selling-top-nav'); const e = document.querySelector('.fw-ms-end'); const f = () => { const t = e.offsetHeight, max = document.documentElement.scrollHeight - innerHeight; window.__tr.push([Math.round(performance.now()), Math.round(scrollY), +((scrollY - (max - t)) / t).toFixed(3), +h.classList.contains('fw-cm-pre'), +h.classList.contains('is-morphing'), innerHeight]); requestAnimationFrame(f); }; requestAnimationFrame(f); })(), 1)`);
        const stk = [];
        const recs = await tl(c, async () => { for (let k = 0; k < 3; k++) { stk.push(['open', await c.evaluate('Math.round(performance.now())')]); await S.actions(stroke(650, 300, 500)); await sleep(900); stk.push(['close', await c.evaluate('Math.round(performance.now())')]); await S.actions(stroke(300, 650, 500)); await sleep(r1); } });
        if (argv.includes('--trace')) {
          const tr = await c.evaluate('JSON.stringify(window.__tr)').then(JSON.parse);
          const at = (t) => tr.filter((x) => x[0] <= t).pop() || tr[0];
          for (let i = 0; i < stk.length; i++) {
            const [kind, t] = stk[i], tEnd = stk[i + 1]?.[1] ?? tr[tr.length - 1][0];
            const seg = tr.filter((x) => x[0] >= t && x[0] < tEnd); const mins = seg.reduce((a, x) => Math.min(a, x[2]), 9), maxs = seg.reduce((a, x) => Math.max(a, x[2]), -9);
            const s0 = at(t), s1 = seg[seg.length - 1] || s0;
            const flips = []; for (let j = 1; j < seg.length; j++) if (seg[j][3] !== seg[j - 1][3]) flips.push(`${seg[j][3] ? 'on' : 'off'}@+${seg[j][0] - t}ms m ${seg[j][2]}`);
            console.log(`  trace ${kind} ${Math.floor(i / 2) + 1}: start m ${s0[2]} pre ${s0[3]} ih ${s0[5]} | m range ${mins}..${maxs} | end m ${s1[2]} pre ${s1[3]} | pre flips ${flips.join(', ') || '-'}`);
          }
        }
        const frames = recs.filter((r) => r.type === 'RenderingFrame');
        const opens = [], pre1 = []; frames.forEach((r, i) => { const m = marks(r); if (m.includes('fw-open0')) opens.push([0, 1, 2].map((d) => { const o = zero(); frames[i + d] && cost(frames[i + d], o); return o; })); if (m.includes('fw-pre1')) { const o = zero(); cost(r, o); pre1.push(o); } });
        const all = zero(); frames.forEach((r) => cost(r, all));
        row[`nav${P}`] = navR; row[P === 'O' ? 'opens' : 'opensP'] = opens; row[`pre1${P}`] = pre1; row[P === 'O' ? 'oAll' : 'pAll'] = all;
        console.log(`${label} ${P}: cm ${g.cm}, rest ${r0} / ${r1} ms, nav at rest before the strokes: ${navR}, ${frames.length} frames, ${opens.length} opens, ${pre1.length} pre-on frames during the strokes`);
        opens.forEach((o, i) => o.forEach((f, d) => console.log(`  open ${i + 1} f${d + 1}: ${fmt(f)}`)));
        pre1.forEach((f, i) => console.log(`  pre-on ${i + 1}: ${fmt(f)}`));
        console.log(`  all frames: ${fmt(all)}`);
        writeFileSync(join(OUT, `tl${P}-${label}-${STAMP}.json`), JSON.stringify(recs));
      }
      if (PASS.includes('A')) {
        const g = await load();
        const Y = (m) => Math.round(g.endStart + m * g.t);
        await c.evaluate(`(window.scrollTo({ top: ${Y(-1.5)}, behavior: 'instant' }), 1)`); await sleep(1500);
        const plan = [['U1', -1.5, -0.05, 60], ['R1', 1200], ['D1', -0.05, -0.9, 50], ['R2', 1200], ['U2', -0.9, -0.05, 50], ['R3', 1200], ['D2', -0.05, -1.5, 60], ['R4', 1200], ['J-0.5', -1.5, -0.5, 1], ['S-0.5', 3000], ['J0', -0.5, 0, 1], ['S0', 3000], ['J1', 0, 1, 1], ['S1', 3000], ['J-0.5b', 1, -0.5, 1], ['S-0.5a', 3000], ['W', 500], ['S-0.5z', 3000]].concat(argv.includes('--rest0') ? [['J1b', -0.5, 1, 1], ['S1b', 3000], ['J0b', 1, 0, 1], ['S0b', 3000], ['W2', 1500], ['S0c', 3000]].concat(argv.includes('--pausecm') ? [['PZ', 'pause'], ['S0p', 3000], ['PR', 'play'], ['S0r', 3000]] : []).concat(argv.includes('--probes') || argv.includes('--probes2') ? PROBES : []) : []);
        const js = JSON.stringify(plan.map((x) => (x.length === 4 ? [x[0], Y(x[1]), Y(x[2]), x[3]] : x[1] === 'js' ? [x[0], 'js'] : x)));
        row.navA = [];
        const recs = await tl(c, async () => {
          await c.evaluate(`(window.__aDone = 0, window.__aNav = [], (async () => { const nav = () => document.querySelector('header.start-selling-top-nav').className.replace(/svelte-\\w+/g, '').trim().split(/\\s+/).filter((k) => /morphing|pre|expanded/.test(k)).join(' ') || '-';
            const raf = () => new Promise((r) => requestAnimationFrame(r)); const wait = (t) => new Promise((r) => setTimeout(r, t));
            const ACT = { ${PROBES.filter((x) => x[1] === 'js').map((x) => `${x[0]}: () => ${x[2]}`).join(', ')} };
            for (const s of ${js}) { await raf(); performance.mark('seg:' + s[0]); if (s.length === 4) { for (let i = 1; i <= s[3]; i++) { window.scrollTo({ top: Math.round(s[1] + (s[2] - s[1]) * i / s[3]), behavior: 'instant' }); await raf(); } } else if (s[1] === 'js') { ACT[s[0]](); } else if (typeof s[1] === 'string') { for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.dataset && t.dataset.fwCm) a[s[1]](); } } else await wait(s[1]); window.__aNav.push(s[0] + ' ' + nav()); }
            await raf(); performance.mark('seg:end'); window.__aDone = 1; })(), 1)`);
          for (let i = 0; i < 200 && !(await c.evaluate('window.__aDone')); i++) await sleep(250);
          row.navA = await c.evaluate('window.__aNav');
          // --rest0: what is still running at the end (rest at m 0 after a close): every animation that is not idle or
          // finished, with its target, name, play state, timeline kind and current time
          if (argv.includes('--rest0')) row.anims = await c.evaluate(`JSON.stringify(document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'paused').map((a) => { const t = a.effect && a.effect.target; const lab = t ? (t.tagName || '').toLowerCase() + '.' + String(typeof t.className === 'string' ? t.className : '').replace(/svelte-\\w+/g, '').trim().split(/\\s+/).slice(0, 3).join('.') + (t.dataset && t.dataset.fwCm ? '[' + t.dataset.fwCm + ']' : '') : '-'; return [lab, a.animationName || a.transitionProperty || a.constructor.name, a.playState, a.timeline && a.timeline !== document.timeline ? 'scroll' : 'doc', Math.round(Number(a.currentTime && a.currentTime.value !== undefined ? a.currentTime.value : a.currentTime) || 0)]; }))`).then(JSON.parse);
        });
        const seg = {}; let cur = 'pre';
        for (const r of recs) { const mk = marks(r).filter((x) => x.startsWith('seg:')); if (mk.length) cur = mk[mk.length - 1].slice(4); if (r.type === 'RenderingFrame') cost(r, (seg[cur] ||= zero())); }
        row.seg = seg;
        console.log(`${label} A: nav after each segment: ${row.navA.join(' | ')}`);
        if (row.anims) { console.log(`  running at the end (${row.anims.length}):`); for (const x of row.anims) console.log(`    ${x.join(' | ')}`); }
        for (const [k, o] of Object.entries(seg)) if (k !== 'pre' && k !== 'end' && !k.startsWith('J')) console.log(`  ${k.padEnd(5)} ${fmt(o)}${k.startsWith('S') ? `  | layouts/s ${(o.nLayout / 3).toFixed(1)} styles/s ${(o.nStyleR / 3).toFixed(1)}` : ''}`);
        writeFileSync(join(OUT, `tlA-${label}-${STAMP}.json`), JSON.stringify(recs));
      }
      if (PASS.includes('L')) {
        const g = await load();
        const Y = (m) => Math.round(g.endStart + m * g.t);
        await c.send('LayerTree.enable').catch(() => {});
        const doc = await c.send('DOM.getDocument', {}); const docId = doc.root.nodeId;
        const layers = async () => (await c.send('LayerTree.layersForNode', { nodeId: docId })).layers || [];
        const at = async (y, ms2) => { await c.evaluate(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(ms2); return { nav: await c.evaluate(NAV), ls: await layers() }; };
        const L0 = await at(Y(-1.5), 1500), L1 = await at(Y(-0.5), 1500);
        await c.evaluate(`(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`);
        const L2 = await at(Y(1), 1500);
        await c.evaluate(`(() => { const ev = new Event('touchend'); Object.defineProperty(ev, 'touches', { value: [] }); Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: 215, clientY: 400, identifier: 1 }] }); window.dispatchEvent(ev); return 1; })()`);
        const L3 = await at(Y(-0.5), 1500);
        const sum = (x) => ({ nav: x.nav, n: x.ls.length, mb: +(x.ls.reduce((a2, l) => a2 + (l.memory || 0), 0) / 1e6).toFixed(2) });
        row.layers = [L0, L1, L2, L3].map(sum);
        const k0 = new Set(L0.ls.map((l) => l.layerId));
        row.newAtL1 = [];
        for (const l of L1.ls.filter((l) => !k0.has(l.layerId))) {
          let cls = '';
          try { if (l.nodeId) { const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId }); const v = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { return this.nodeType === 1 ? (this.tagName.toLowerCase() + "." + String(this.className && this.className.baseVal !== undefined ? this.className.baseVal : this.className).trim().split(/\\s+/).slice(0, 2).join(".") + (this.dataset && this.dataset.fwCm ? "[" + this.dataset.fwCm + "]" : "")) : this.nodeName; }', returnByValue: true }); cls = v.result?.value ?? ''; } } catch {}
          row.newAtL1.push(`${cls}${l.pseudoElement ? '::' + l.pseudoElement : ''} ${Math.round(l.bounds?.width ?? 0)}x${Math.round(l.bounds?.height ?? 0)} ${((l.memory || 0) / 1e6).toFixed(2)} MB`);
        }
        console.log(`${label} L: ${row.layers.map((x, i) => `L${i} ${x.nav} ${x.n} layers ${x.mb} MB`).join(' | ')}`);
        for (const d of row.newAtL1) console.log(`  new at L1 (rest at m -0.5): ${d}`);
      }
    } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
    finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms[label] = row;
  }
} finally { try { S && (await S.close()); } catch {} }
const f = join(OUT, `ksim-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);

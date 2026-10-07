// c3b-a gate (timer-open): the deferred re-measure (TimerFire -> __nsMeasure) never in an open frame or a moving frame.
// Derived from out/cm/open0-sim.mjs (c3 probe): which read forces the ~13-15 ms Layout inside iE on the open-from-closed
// frame (P-159 open-0) on WebKit? iOS Simulator Safari, WDA finger strokes (touch, so Safari's toolbar behaves as under
// a finger), Timeline with call stacks (maxCallStackDepth 12). Open-0 frames are marked in the page with no layout read:
// a MutationObserver on the nav's class attribute calls performance.mark('fw-open0') when is-morphing turns on (x > 0,
// the open from closed in both C and CM builds), which lands as a TimeStamp record inside that rendering frame.
// Per arm: for every open-0 frame, each script record and every Layout / RecalculateStyles inside script with its JS
// stack and its own ms (Simulator ms rank only); then the forced stacks over all frames, open-0 vs the rest.
// Counts only, no timing verdicts.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//     node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c 'node tools/sim.mjs wda start && node fixes/compositor-morph/gates/c3b/timer-open.mjs V13=out/cm/snap160/V C3B=out/cm/c3b'
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
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 30 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, 'out/cm/timeropen'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const MARK = `(() => { const h = document.querySelector('header.start-selling-top-nav'); if (!h || window.__o0) return 0; let on = h.classList.contains('is-morphing');
  window.__o0 = new MutationObserver(() => { const now = h.classList.contains('is-morphing'); if (now && !on) performance.mark('fw-open0'); if (!now && on) performance.mark('fw-close0'); on = now; });
  window.__o0.observe(h, { attributes: true, attributeFilter: ['class'] }); return 1; })()`;
const isJs = (t) => /^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|ObserverCallback|EvaluateScript)$/.test(t);
const stk = (r) => { const s = Array.isArray(r.stackTrace) ? r.stackTrace : r.stackTrace?.callFrames || r.data?.stackTrace?.callFrames || []; return s.filter((q) => q.url && q.url !== '[native code]').slice(0, 6).map((f) => `${f.functionName || '(anon)'}@${f.lineNumber}`).join(' < ') || '(no js frame)'; };
const ms = (x) => +((((x.endTime ?? x.startTime) - x.startTime) * 1000).toFixed(2));
const hasMark = (r, name) => { const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message === name) return true; st.push(...(x.children || [])); } return false; };
const res = { tool: 'out/cm/open0-sim.mjs', arms: {} };
try {
  for (const a of arms) {
    const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
    const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = null; const row = {};
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await sleep(500);
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
      await sleep(1500);
      c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.evaluate(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      const g = await c.evaluate(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : innerHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t, cm: document.documentElement.classList.contains('fw-cm') }; })()`);
      await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 250}, behavior: 'instant' }), 1)`); await sleep(1500);
      row.marker = await c.evaluate(MARK);
      const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      for (const [k, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 12 }]]) await c.send(k, prm);
      // 6 cycles: a stroke that opens from closed (page moves 300 px up through endStart - 250 .. endStart + 50), then
      // one that closes back (finger down), each 500 ms, as the fast-short swipes
      for (let k = 0; k < 8; k++) { await S.actions(stroke(650, 300, 500)); await sleep(700); await S.actions(stroke(300, 650, 500)); await sleep(700); }
      await sleep(800);
      await c.send('Timeline.stop').catch(() => {}); await sleep(1000);
      const frames = recs.filter((r) => r.type === 'RenderingFrame');
      const has = (r, f) => { const st = [r]; while (st.length) { const x = st.pop(); if (f(x)) return true; st.push(...(x.children || [])); } return false; };
      const isMeasure = (x) => x.type === 'TimerFire' && has(x, (y) => /__nsMeasure/.test(stk(y)));
      let nT = 0, nOpen = 0, nMoving = 0, nOpenNext = 0;
      frames.forEach((r, i) => {
        if (!has(r, isMeasure)) return;
        nT++;
        const open = hasMark(r, 'fw-open0'), next = frames[i + 1] && hasMark(frames[i + 1], 'fw-open0');
        const moving = has(r, (x) => x.type === 'EventDispatch' && /^(touchmove|scroll)$/.test(x.data?.type || ''));
        open && nOpen++; next && nOpenNext++; moving && nMoving++;
      });
      const nO = frames.filter((r) => hasMark(r, 'fw-open0')).length;
      row.g = g; row.frames = frames.length; row.timer = { fires: nT, inOpenFrame: nOpen, beforeOpenFrame: nOpenNext, inMovingFrame: nMoving, opens: nO };
      console.log(`${label}: cm ${g.cm}, ${frames.length} frames, ${nO} opens; re-measure timer fires ${nT}: in an open frame ${nOpen}, in the frame before an open ${nOpenNext}, in a frame with touchmove/scroll ${nMoving}`);
      writeFileSync(join(OUT, `tl-${label}-${STAMP}.json`), JSON.stringify(recs));
    } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
    finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms[label] = row;
  }
} finally { try { await S.close(); } catch {} }
const f = join(OUT, `timeropen-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);

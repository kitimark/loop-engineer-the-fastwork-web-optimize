// morph-gpu, PR-018's closing frame, Chrome part (fix-morph-gpu, lead ruling 2026-10-05). Counts only (no timing judged;
// unthrottled). Headless Chrome 430x932 DPR 3 mobile + touch (PR-018's touch-phone mode turns on). Same steps as
// close-cause-sim.mjs: close / open (instant scrollTo to p 0 / p 1), setopen / setclose (window.__navMorphSet at p 0, no
// scroll), toggles at m = 0 (cls, dark, exp, scene, fade, mvar). One trace for all steps; each change sets a user-timing mark.
// Per step, in [mark, mark + 1200 ms]: Paint count and area (device px), Layout, UpdateLayoutTree (+ elements), and the
// paints grouped by the painted node (Paint args.data.nodeId -> element tag.class via DOM.resolveNode).
// Run (shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu -- \
//     node fixes/morph-gpu/close/close-cause-chrome.mjs --snap <abs dir>[@<css file>][,...] [--steps ...]
// Arms "dir@file.css", glide and fade0: as in close-cause-sim.mjs.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--snap') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
const SNAPS = ARMS.map((a) => a.dir);
if (!SNAPS.length) throw new Error('--snap <abs snapshot dir>[,<abs dir>]');
const STEPS = arg('--steps', 'close,open,close,setopen,setclose,setopen,setclose,cls,dark,scene,fade').split(',');
const OUT = join(WT, 'out/morph-gpu/close'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'].join(',');
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null }; })()`;
const HDR = `document.querySelector('header.start-selling-top-nav')`;
const PLAT = `document.querySelector('.start-selling-platform')`;
const SCENE = `document.querySelector('[data-start-selling-scene]')`;
const TOG = {
  cls: [`${HDR}.classList.add('is-morphing')`, `${HDR}.classList.remove('is-morphing')`],
  dark: [`${HDR}.classList.toggle('is-on-dark')`, `${HDR}.classList.toggle('is-on-dark')`],
  exp: [`${HDR}.classList.add('is-expanded')`, `${HDR}.classList.remove('is-expanded')`],
  scene: [`${SCENE}.setAttribute('data-start-selling-scene', 'active')`, `${SCENE}.setAttribute('data-start-selling-scene', 'paused')`],
  fade0: [`${PLAT}.style.setProperty('--morph-fade', '0')`, `${PLAT}.style.setProperty('--morph-fade', '1')`],
  fade: [`${PLAT}.style.setProperty('--morph-fade', '0.99')`, `${PLAT}.style.setProperty('--morph-fade', '1')`],
  mvar: [`(window.__ccV = [${HDR}, ...${HDR}.querySelectorAll('[style*="--morph"]')].map((e) => [e, e.style.getPropertyValue('--morph')]), window.__ccV.forEach(([e]) => e.style.setProperty('--morph', '0.001')))`,
         `window.__ccV.forEach(([e, v]) => (v === '' ? e.style.removeProperty('--morph') : e.style.setProperty('--morph', v)))`],
};
function spans(ev) {
  const out = [], open = new Map();
  for (const e of ev) {
    if (e.ph === 'X') out.push({ name: e.name, ts: e.ts, dur: e.dur ?? 0, args: e.args });
    else if (e.ph === 'B') { const k = e.tid + '|' + e.name; (open.get(k) || open.set(k, []).get(k)).push(e); }
    else if (e.ph === 'E') { const k = e.tid + '|' + e.name, st = open.get(k)?.pop(); if (st) out.push({ name: e.name, ts: st.ts, dur: e.ts - st.ts, args: { ...st.args, endData: e.args?.endData } }); }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'close'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'morph-gpu close-cause-chrome (fix-morph-gpu)', browser: chrome.browser, startedAt: new Date().toISOString(), steps: STEPS, arms: [] };
try {
  for (const [i, snap] of SNAPS.entries()) {
    const st = join(OUT, `serve-ccc-${i}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', snap, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const armCss = ARMS[i].css ? readFileSync(ARMS[i].css, 'utf8') : null;
    const run = { snap: basename(snap) + (ARMS[i].css ? '@' + basename(ARMS[i].css) : ''), css: armCss, steps: [] };
    const page = await cdp.newIsolatedPage();
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      run.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      run.files = { js: sha(readFileSync(join(snap, NODE))), css: sha(readFileSync(join(snap, CSS))) };
      if (run.served.js !== run.files.js || run.served.css !== run.files.css) throw new Error('VOID: served files differ from the snapshot');
      if (armCss) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'cc-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
      run.armCssOn = await page.eval(`!!document.getElementById('cc-arm')`);
      await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 2500); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      const g = await page.eval(GEO);
      if (!g.t) throw new Error('no .fw-ms-end: PR-018 mode is off');
      const yAt = (q) => Math.round(g.max - g.t + q * g.t);
      const jump = (q) => page.eval(`(window.scrollTo({ top: ${yAt(q)}, behavior: 'instant' }), 1)`);
      await jump(0); await sleep(1500); await jump(1); await sleep(1500); await jump(0); await sleep(1500);
      await page.send('DOM.getDocument', { depth: 0 });
      const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      let n = 0;
      const measure = async (k, dir, expr) => {
        const id = `cc-${n++}`;
        await page.eval(`(performance.mark('${id}'), ${expr}, 1)`);
        await sleep(1200);
        run.steps.push({ k, dir, id, after: await page.eval(GEO) });
        await sleep(300);
      };
      for (const k of STEPS) {
        if (k === 'close') { await jump(1); await sleep(1500); await measure(k, 'close', `window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' })`); }
        else if (k === 'open') { await measure(k, 'open', `window.scrollTo({ top: ${yAt(1)}, behavior: 'instant' })`); await jump(0); await sleep(1500); }
        else if (k === 'shot') { const fp = join(OUT, `shots-${STAMP}`, `${i}-${String(run.steps.length).padStart(2, '0')}-${run.steps.at(-1)?.k || 'start'}.png`); mkdirSync(join(OUT, `shots-${STAMP}`), { recursive: true }); const b64 = (await page.send('Page.captureScreenshot', { format: 'png' })).data; writeFileSync(fp, Buffer.from(b64, 'base64')); run.shots = [...(run.shots || []), { at: run.steps.length, file: fp, geo: await page.eval(GEO) }]; }
        else if (k === 'glide') { await jump(1); await sleep(1500); await measure(k, 'close', `(() => { const a = ${yAt(1)}, b = ${yAt(0)}; let n = 0; const st = () => { n++; window.scrollTo({ top: Math.round(a + (b - a) * Math.min(1, n / 20)), behavior: 'instant' }); if (n < 20) requestAnimationFrame(st); }; requestAnimationFrame(st); })()`); }
        else if (k === 'setopen') await measure(k, 'open', `window.__navMorphSet(1)`);
        else if (k === 'setclose') await measure(k, 'close', `window.__navMorphSet(0)`);
        else if (TOG[k]) { await measure(k, 'on', TOG[k][0]); await measure(k, 'off', TOG[k][1]); }
        else throw new Error('unknown step ' + k);
      }
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      await page.send('Tracing.end'); await done; off();
      const sp = spans(ev);
      const names = new Map();
      const nameOf = async (bid) => {
        if (bid == null) return '(none)';
        if (names.has(bid)) return names.get(bid);
        let nm = '#' + bid;
        try {
          const o = (await page.send('DOM.resolveNode', { backendNodeId: bid })).object;
          nm = (await page.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: `function () { const k = typeof this.className === 'string' ? this.className : (this.className && this.className.baseVal) || ''; return (this.nodeName || '').toLowerCase() + (k ? '.' + k.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : ''); }`, returnByValue: true })).result.value;
        } catch {}
        names.set(bid, nm); return nm;
      };
      for (const stp of run.steps) {
        const mk = ev.find((e) => e.name === stp.id && e.cat?.includes('user_timing'));
        if (!mk) { stp.error = 'no mark'; continue; }
        const a = mk.ts, b = mk.ts + 1200e3;
        const o = { paints: 0, kpx: 0, layouts: 0, styles: 0, elems: 0, by: {} };
        for (const e of sp) {
          if (e.ts < a || e.ts >= b) continue;
          if (e.name === 'Paint') {
            o.paints++; const c = e.args?.data?.clip; const ar = c ? area(c) / 1e3 : 0; o.kpx += ar;
            const nm = await nameOf(e.args?.data?.nodeId); const q = (o.by[nm] ||= { n: 0, kpx: 0 }); q.n++; q.kpx += ar;
          }
          if (e.name === 'Layout') o.layouts++;
          if (e.name === 'UpdateLayoutTree') { o.styles++; o.elems += e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0; }
        }
        o.kpx = Math.round(o.kpx);
        for (const q of Object.values(o.by)) q.kpx = Math.round(q.kpx);
        stp.tr = o;
        const top = Object.entries(o.by).sort((x, y) => y[1].kpx - x[1].kpx).slice(0, 6).map(([k2, v]) => `${k2}:${v.n}/${v.kpx}`);
        console.log(run.snap, stp.k.padEnd(8), stp.dir.padEnd(5), 'p', stp.after.p, '| paints', o.paints, 'kpx', o.kpx, 'layouts', o.layouts, 'styles', o.styles, 'elems', o.elems, '|', JSON.stringify(top));
      }
    } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.snap, 'error', run.error); }
    finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); res.arms.push(run); }
  }
} finally {
  res.endedAt = new Date().toISOString();
  const f = join(OUT, `close-cause-chrome-${STAMP}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('WROTE', f);
}

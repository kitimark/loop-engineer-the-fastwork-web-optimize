// morph-close-peak v9.1 (g11), lead 2026-10-05 condition 2: pixels DURING the close, not only at rest. Counts and pixels
// only, no timing. Headless Chrome 430x932 DPR 3 mobile + touch. Loads A, V, A2, V2 (A = K, V = K + candidate CSS; A2/V2
// second loads for the A/A floor). Per load and close mode (setclose: at p 0 __navMorphSet(1), 1.5 s, __navMorphSet(0);
// close: jump to p 1, 1.5 s, jump to p 0):
//   live pass: per rAF for 1.5 s after the trigger: header .is-morphing, the panel's computed opacity, visibility of the
//     panel's children (the max panel opacity seen while .is-morphing is off is the decisive number: 0 means none of the
//     panel's children can show in A, so hiding them changes no pixel);
//   frozen pass (fresh trigger): at the first frame without .is-morphing every animation is paused; animations created by
//     the close (header transitions, the candidate's hide) are seeked to T ms, infinite page animations to 1000 ms; shot.
// Each T is scored with fixes/v9-best/gates/pxlib.mjs scoreStop (PR-010 T2 report: A~V beyond A/A, consistent clusters).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu -- \
//     node fixes/morph-gpu/close/close-frames-chrome.mjs --a <abs dir> --v <abs dir>@<css> [--modes setclose,close] [--ts 0,100,...]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { scoreStop } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const parse = (x) => { const [dir, css] = x.split('@'); return { dir, css }; };
const A = parse(arg('--a', '')), V = parse(arg('--v', ''));
if (!A.dir || !V.dir) throw new Error('--a <dir>[@css] --v <dir>[@css]');
const MODES = arg('--modes', 'setclose,close').split(',');
const TS = arg('--ts', '0,50,100,200,300,400,500,600,680,720,740,760,800,1000,1200').split(',').map(Number);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-gpu/close', `frames-${STAMP}`); mkdirSync(OUT, { recursive: true });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; return { t, max: document.documentElement.scrollHeight - innerHeight }; })()`;
const HDR = `document.querySelector('header.start-selling-top-nav')`, PANEL = `document.querySelector('header.start-selling-top-nav .start-selling-morph-panel')`;
// live sampler: resolves with the per-frame samples for ms after the call
const LIVE = (ms) => `new Promise((res) => { const h = ${HDR}, p = ${PANEL}, t0 = performance.now(), s = [];
  const f = () => { const cs = getComputedStyle(p); s.push({ t: Math.round(performance.now() - t0), mor: h.classList.contains('is-morphing'), op: +cs.opacity, hv: getComputedStyle(h).visibility,
    kids: [...p.children].map((k) => getComputedStyle(k).visibility[0]).join('') }); if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res(s); }; requestAnimationFrame(f); })`;
// freezer: waits for the first frame without .is-morphing, pauses everything, returns counts
const FREEZE = `new Promise((res) => { const h = ${HDR}, t0 = performance.now();
  const f = () => { if (h.classList.contains('is-morphing') && performance.now() - t0 < 3000) return requestAnimationFrame(f);
    const all = document.getAnimations(); const fresh = all.filter((a) => !window.__cfS0.has(a)); for (const a of all) a.pause();
    window.__cfNew = fresh; res({ at: Math.round(performance.now() - t0), all: all.length, fresh: fresh.map((a) => (a.animationName || a.transitionProperty || '?') + '@' + (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? '').toString().split(' ')[0]) }); };
  requestAnimationFrame(f); })`;
const SEEK = (T) => `(() => { for (const a of document.getAnimations()) { a.pause(); if (window.__cfNew.includes(a)) a.currentTime = ${T}; else if (a.effect && a.effect.getComputedTiming().iterations === Infinity) a.currentTime = 1000; } return 1; })()`;
const raf2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'cframes'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'morph-gpu close-frames-chrome (fix-morph-gpu)', browser: chrome.browser, startedAt: new Date().toISOString(), a: A, v: V, modes: MODES, ts: TS, loads: {}, scores: {} };
const LOADS = [['A', A], ['V', V], ['A2', A], ['V2', V]];
try {
  for (const mode of MODES) {
    for (const [name, arm] of LOADS) {
      const st = join(OUT, `serve-${name}-${process.pid}.json`); rmSync(st, { force: true });
      const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', arm.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
      const page = await cdp.newIsolatedPage(); const L = { mode, arm: name };
      try {
        let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
        if (!s) throw new Error('server did not start');
        await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
        L.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
        L.files = { js: sha(readFileSync(join(arm.dir, NODE))), css: sha(readFileSync(join(arm.dir, CSS))) };
        if (L.served.js !== L.files.js || L.served.css !== L.files.css) throw new Error('VOID: served files differ from the snapshot');
        if (arm.css) { const x = readFileSync(arm.css, 'utf8'); L.extra = sha(Buffer.from(x)); await page.eval(`(() => { const s = document.createElement('style'); s.id = 'cf-arm'; s.textContent = ${JSON.stringify(x)}; document.head.appendChild(s); return 1; })()`); }
        const g = await page.eval(GEO); const yAt = (q) => Math.round(g.max - g.t + q * g.t);
        const open = async () => { if (mode === 'setclose') { await page.eval(`(window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' }), 1)`); await sleep(800); await page.eval('(window.__navMorphSet(1), 1)'); } else await page.eval(`(window.scrollTo({ top: ${yAt(1)}, behavior: 'instant' }), 1)`); await sleep(1500); };
        const close = mode === 'setclose' ? `window.__navMorphSet(0)` : `window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' })`;
        // live pass
        await open(); const live = page.eval(`(${close}, ${LIVE(1500)})`); L.live = await live;
        const off = L.live.filter((x) => !x.mor); L.liveSummary = { frames: L.live.length, offFrames: off.length, maxOpacityWhileOff: off.length ? Math.max(...off.map((x) => x.op)) : null,
          firstOff: off[0]?.t ?? null, kidsWhileOff: [...new Set(off.map((x) => x.kids))], headerVis: [...new Set(L.live.map((x) => x.hv))] };
        // frozen pass
        await open(); await page.eval(`(window.__cfS0 = new Set(document.getAnimations()), 1)`);
        L.freeze = await page.eval(`(${close}, ${FREEZE})`);
        L.shots = {};
        for (const T of TS) { await page.eval(SEEK(T)); await page.eval(raf2); await sleep(120); await page.eval(raf2);
          const f = join(OUT, `${mode}-${name}-t${T}.png`); writeFileSync(f, Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); L.shots[T] = f;
          L.kidsAt = { ...(L.kidsAt || {}), [T]: await page.eval(`[...${PANEL}.children].map((k) => getComputedStyle(k).visibility[0]).join('') + ' op ' + getComputedStyle(${PANEL}).opacity`) }; }
      } catch (e) { L.error = String(e.stack || e.message || e); console.log(mode, name, 'error', L.error); }
      finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); res.loads[`${mode}-${name}`] = L; }
      console.log(`${mode} ${name}: live ${JSON.stringify(L.liveSummary)} | freeze ${JSON.stringify(L.freeze)}`);
      if (L.kidsAt) console.log(`   kids/opacity per T: ${JSON.stringify(L.kidsAt)}`);
    }
    for (const T of TS) {
      const files = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((n) => [n, res.loads[`${mode}-${n}`]?.shots?.[T]]));
      if (Object.values(files).some((f) => !f)) continue;
      const row = scoreStop(files, [], 3); res.scores[`${mode}-${T}`] = row;
      console.log(`${mode} T ${String(T).padStart(4)}  ` + JSON.stringify({ AV: { beyond: row.AV?.beyondCssPx2, pct: row.AV?.beyondPct, max: row.AV?.maxLevel }, consistent: { beyond: row.consistent?.beyondCssPx2, pct: row.consistent?.beyondPct, max: row.consistent?.maxLevel, flat: row.consistent?.flatShare, top: row.consistent?.clusters?.[0] }, AA: row.AA?.over8Pct, VV: row.VV?.over8Pct }));
    }
  }
} finally {
  res.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('WROTE', join(OUT, 'frames.json'));
}

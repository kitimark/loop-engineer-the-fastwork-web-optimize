// morph-close-peak: why the close rule adds steady style recalcs at rest in Chrome (int-v8's report, 2026-10-05).
// Counts only, no timing judged; unthrottled headless Chrome 430x932 DPR 3 mobile + touch (PR-018's touch mode on).
// Per arm and rest stop (y): load, settle, instant scroll to y, wait 2.5 s, then a 3 s trace window with invalidation
// tracking and blink.animations. Reports per second: UpdateLayoutTree count and elements, Layout, Paint, main frames
// (BeginMainThreadFrame / BeginFrame on the main thread); the invalidation-tracking events grouped by node and reason;
// compositor-failure reasons of the animations ("Animation" events' args); and, page-side, every running animation
// with its name, target, whether the target is inside the header's morph panel, and the target's computed visibility.
// Arms: "dir" (an immutable snapshot dir served as overlay) or "dir@extra.css" (the extra CSS is appended in a <style>).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu -- \
//     node fixes/morph-gpu/close/rest-recalc-chrome.mjs --arms <dir>[@css],... [--ys 0,2796] [--win 3000]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
if (!ARMS.length) throw new Error('--arms <abs snapshot dir>[@<css>],...');
const YS = arg('--ys', '0,2796').split(','); // a number, or p0 / p1 (start / end of the end morph, as in close-cause-chrome.mjs)
const WIN = +arg('--win', '3000');
const OUT = join(WT, 'out/morph-gpu/rest'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking',
  'blink.animations', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'].join(',');
const ANIMS = `(() => { const P = document.querySelector('.start-selling-morph-panel'); const nm = (e) => { if (!e) return '(none)'; const k = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || ''; return (e.nodeName || '').toLowerCase() + (k ? '.' + k.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''); };
  return document.getAnimations().map((a) => { const t = a.effect && a.effect.target; return { name: a.animationName || a.transitionProperty || a.constructor.name, state: a.playState, pending: a.pending, target: nm(t), inPanel: !!(P && t && P.contains(t)), ct: a.currentTime == null ? null : Math.round(a.currentTime), vis: t ? getComputedStyle(t).visibility : null, cv: t ? getComputedStyle(t).contentVisibility : null }; }).filter((a) => a.state === 'running' || a.pending || a.inPanel); })()`;
const EVN = new Set(['UpdateLayoutTree', 'Layout', 'Paint', 'BeginMainThreadFrame', 'Animation', 'StyleRecalcInvalidationTracking', 'ScheduleStyleInvalidationTracking', 'StyleInvalidatorInvalidationTracking',
  'FireAnimationFrame', 'FunctionCall', 'TimerFire', 'EventDispatch', 'FireIdleCallback']);

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'rest'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'morph-gpu rest-recalc-chrome (fix-morph-gpu)', browser: chrome.browser, startedAt: new Date().toISOString(), ys: YS, win: WIN, arms: [] };
try {
  for (const [i, A] of ARMS.entries()) {
    const st = join(OUT, `serve-rr-${i}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const extra = A.css ? readFileSync(A.css, 'utf8') : null;
    const run = { arm: basename(dirname(A.dir)) + '/' + basename(A.dir) + (A.css ? '@' + basename(A.css) : ''), extra, stops: [] };
    const page = await cdp.newIsolatedPage();
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      run.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      run.files = { js: sha(readFileSync(join(A.dir, NODE))), css: sha(readFileSync(join(A.dir, CSS))) };
      if (run.served.js !== run.files.js || run.served.css !== run.files.css) throw new Error('VOID: served files differ from the snapshot');
      if (extra) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'rr-arm'; s.textContent = ${JSON.stringify(extra)}; document.head.appendChild(s); return 1; })()`);
      await page.send('DOM.getDocument', { depth: 0 });
      const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; return { t, max: document.documentElement.scrollHeight - innerHeight }; })()`;
      for (const yk of YS) {
        const g = /^p[01]$/.test(yk) ? await page.eval(GEO) : null; const y = g ? Math.round(g.max - g.t + (+yk[1]) * g.t) : +yk;
        await page.eval(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(2500);
        const anims = await page.eval(ANIMS);
        const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) if (EVN.has(e.name)) ev.push(e); });
        await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
        await page.eval(`(performance.mark('rr-a'), 1)`); await sleep(WIN); await page.eval(`(performance.mark('rr-b'), 1)`);
        const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
        await page.send('Tracing.end'); await done; off();
        const sec = WIN / 1000; const o = { y, yk, scrollY: await page.eval('scrollY'), styles: 0, elems: 0, layouts: 0, paints: 0, mainFrames: 0, inv: {}, anim: {} };
        for (const e of ev) {
          if (e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'B')) { o.styles++; o.elems += e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0; }
          else if (e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B')) o.layouts++;
          else if (e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B')) o.paints++;
          else if (e.name === 'BeginMainThreadFrame') o.mainFrames++;
          else if (e.name.endsWith('InvalidationTracking')) {
            const d = e.args?.data || {}; const k = `${e.name.replace('InvalidationTracking', '')} | ${d.nodeName || '?'} | ${d.reason || d.invalidationList?.map((x) => x.classes || x.id || x.attribute || x.pseudo).join(';') || d.changedClass || d.changedAttribute || d.changedPseudo || ''}`;
            o.inv[k] = (o.inv[k] || 0) + 1;
          } else if (['FireAnimationFrame', 'FunctionCall', 'TimerFire', 'EventDispatch', 'FireIdleCallback'].includes(e.name) && (e.ph === 'X' || e.ph === 'B')) {
            const d = e.args?.data || {}; const k = `${e.name} ${d.type || ''} ${d.functionName || ''} ${(d.url || '').split('/').pop()}:${d.lineNumber ?? ''}`;
            (o.js ||= {})[k] = (o.js[k] || 0) + 1;
          } else if (e.name === 'Animation') {
            const d = e.args?.data || e.args || {}; const k = `${e.ph} ${d.name || d.id || ''} ${JSON.stringify(d.compositeFailed ?? d.unsupportedProperties ?? '').slice(0, 80)}`;
            o.anim[k] = (o.anim[k] || 0) + 1;
          }
        }
        const per = (x) => +(x / sec).toFixed(1);
        o.perSec = { styles: per(o.styles), elems: per(o.elems), layouts: per(o.layouts), paints: per(o.paints), mainFrames: per(o.mainFrames) };
        o.running = anims;
        run.stops.push(o);
        const topInv = Object.entries(o.inv).sort((a, b) => b[1] - a[1]).slice(0, 8);
        console.log(`${run.arm} y ${yk}=${y} | per s: styles ${o.perSec.styles} elems ${o.perSec.elems} layouts ${o.perSec.layouts} paints ${o.perSec.paints} mainFrames ${o.perSec.mainFrames}`);
        console.log(`   running ${anims.length}: ${JSON.stringify(anims.map((a) => `${a.name}@${a.target}:${a.state}${a.pending ? ' PENDING' : ''}${a.inPanel ? ' [PANEL t=' + a.ct + ' vis=' + a.vis + ' cv=' + a.cv + ']' : ''}`))}`);
        console.log(`   invalidations: ${JSON.stringify(topInv)}`);
        console.log(`   animation events: ${JSON.stringify(Object.entries(o.anim).slice(0, 10))}`);
        console.log(`   js: ${JSON.stringify(Object.entries(o.js || {}).sort((a, b) => b[1] - a[1]).slice(0, 12))}`);
      }
    } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.arm, 'error', run.error); }
    finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); res.arms.push(run); }
  }
} finally {
  res.endedAt = new Date().toISOString();
  const f = join(OUT, `rest-recalc-chrome-${STAMP}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('WROTE', f);
}

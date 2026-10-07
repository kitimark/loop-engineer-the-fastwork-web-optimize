// g0-gpu (fix-g0-gpu), gates 2 and 3 in Chrome: work of the end-of-page 680 ms tween per segment, base A (v0) against
// candidate V (g0.1), COUNTS ONLY, no throttle, no timing judged. Scaffold from fixes/best-build/gates/restyle-chrome.mjs.
// Headless Chrome 430x<h> DPR 3 mobile. Per load: walk to the end, Tracing on (devtools.timeline + blink.animations),
// segments marked with console.timeStamp: rest0 1.5 s, open (synthetic wheel +100 on window) 900 ms, rest1 1.5 s,
// close (wheel -100) 900 ms, rest2 1.5 s. Per segment: frames (BeginMainThreadFrame), UpdateLayoutTree and its
// elementCount (elements restyled), Layout, Paint (n, painted px, the biggest clips), and per tween the first three frames
// one by one (K8). Compositor animations: blink.animations 'Animation' events with compositeFailed reasons.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-gpu -- \
//     node fixes/g0-gpu/gates/counts-chrome.mjs A=out/g0-gpu/empty V=fixes/g0-gpu/overlay A2=... V2=... [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n');
  process.exit(0);
}
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const H = Number(arg('--h', '775'));
const arms = argv.filter((a) => /^[A-Za-z0-9]+=/.test(a));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/g0-gpu/counts'); mkdirSync(OUT, { recursive: true });
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline.frame'].join(',');
const zero = () => ({ frames: 0, ult: 0, elems: 0, layout: 0, paint: 0, paintPx: 0, clips: {}, prepaint: 0 });
const clipWH = (c) => { if (!Array.isArray(c) || c.length < 8) return null; const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))]; };
const fmt = (o) => `frames ${o.frames} | restyles ${o.ult} elems ${o.elems} | layout ${o.layout} | prepaint ${o.prepaint} | paint ${o.paint} ${(o.paintPx / 1e6).toFixed(2)} Mpx [${Object.entries(o.clips).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}x${n}`).join(' ')}]`;
const res = { tool: 'fixes/g0-gpu/gates/counts-chrome.mjs', h: H, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/g0-gpu/chrome'), 'g0cnt'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const a of arms) {
    const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
    const st = join(OUT, `serve-c-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const R = { label, dir }; const page = await cdp.newIsolatedPage();
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(res, 2500); }; step(); })`, { timeout: 60000 });
      await page.eval(`(window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), new Promise((r) => setTimeout(r, 1500)))`);
      const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      await sleep(300);
      R.prevented = await page.eval(`(async () => { const wait = (t) => new Promise((r) => setTimeout(r, t)); const raf = () => new Promise((r) => requestAnimationFrame(r)); let pv = '';
        for (const [k, dy, t] of [['rest0', 0, 1500], ['open', 100, 900], ['rest1', 0, 1500], ['close', -100, 900], ['rest2', 0, 1500]]) { await raf(); console.timeStamp('seg:' + k);
          if (dy) { const e = new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }); window.dispatchEvent(e); pv += e.defaultPrevented ? 'P' : 'n'; } await wait(t);
          if (!dy) { const run = {}; for (const a of document.getAnimations()) { if (a.playState !== 'running') continue; const el = a.effect && a.effect.target; const k = (a.animationName || a.transitionProperty || a.id || 'anim') + '@' + (el ? (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || el.tagName)).split(' ')[0] : '-'); run[k] = (run[k] || 0) + 1; }
            const pf = document.querySelector('.start-selling-platform'); (window.__g0rest ||= []).push({ seg: k, paused: pf ? pf.hasAttribute('data-fw-pf-paused') : null, fade: pf ? pf.style.getPropertyValue('--morph-fade') : null, pe: pf ? pf.style.pointerEvents : null, n: Object.values(run).reduce((s, v) => s + v, 0), run }); } }
        console.timeStamp('seg:x'); return pv; })()`, { timeout: 30000 });
      R.rest = await page.eval(`JSON.stringify(window.__g0rest || [])`).then(JSON.parse);
      for (const r of R.rest) console.log(`${label} running@${r.seg}: n ${r.n} paused ${r.paused} fade ${r.fade} pe ${r.pe} ${JSON.stringify(Object.entries(r.run).sort((a, b) => b[1] - a[1]).slice(0, 8))}`);
      R.after = await page.eval(`(() => ({ g0: document.getAnimations().filter((a) => a.id === 'g0').length, morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') }))()`);
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      await page.send('Tracing.end'); await done; off();
      ev.sort((x, y) => x.ts - y.ts);
      const seg = {}, firsts = {}; let cur = 'x', fr = null;
      const anim = [];
      for (const e of ev) {
        if (e.name === 'TimeStamp' && String(e.args?.data?.message || '').startsWith('seg:')) { cur = e.args.data.message.slice(4); continue; }
        if (e.cat?.includes('blink.animations') && e.name === 'Animation' && e.args?.data) anim.push({ seg: cur, ph: e.ph, d: e.args.data });
        if (cur === 'x') continue;
        const o = (seg[cur] ||= zero());
        if (e.name === 'BeginMainThreadFrame') { o.frames++; if ((cur === 'open' || cur === 'close')) { const L = (firsts[cur] ||= []); fr = L.length < 4 ? zero() : null; if (fr) L.push(fr); } else fr = null; }
        const add = (k, v = 1) => { o[k] += v; if (fr) fr[k] += v; };
        if (e.name === 'UpdateLayoutTree' && e.ph !== 'E') add('ult');
        if (e.name === 'UpdateLayoutTree') add('elems', e.args?.elementCount ?? e.args?.endData?.elementCount ?? 0);
        if (e.name === 'Layout' && e.ph !== 'E') add('layout');
        if (e.name === 'PrePaint' && e.ph !== 'E') add('prepaint');
        if (e.name === 'Paint' && e.ph !== 'E') { add('paint'); const wh = clipWH(e.args?.data?.clip); if (wh) { add('paintPx', wh[0] * wh[1]); const k = wh.join('x'); o.clips[k] = (o.clips[k] || 0) + 1; if (fr) fr.clips[k] = (fr.clips[k] || 0) + 1; } }
      }
      R.seg = seg; R.firsts = Object.fromEntries(Object.entries(firsts).map(([k, L]) => [k, L.map(fmt)]));
      R.compositor = anim.filter((x) => x.d.compositeFailed !== undefined || x.d.unsupportedProperties).slice(0, 12);
      for (const [k, o] of Object.entries(seg)) console.log(`${label} ${k.padEnd(6)} ${fmt(o)}`);
      for (const [k, L] of Object.entries(R.firsts)) L.forEach((x, i) => console.log(`${label} ${k} frame ${i + 1}: ${x}`));
      console.log(`${label} prevented ${R.prevented} after ${JSON.stringify(R.after)} compositor ${JSON.stringify(R.compositor.map((x) => [x.seg, x.d.compositeFailed, x.d.unsupportedProperties]))}`);
    } catch (e) { R.error = String(e.stack || e); console.log(label, 'error', R.error); }
    finally { await page.close(); p.kill(); rmSync(st, { force: true }); res.runs.push(R); }
  }
} finally {
  const f = join(OUT, `counts-chrome-${H}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); console.log('WROTE', f);
}

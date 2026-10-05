// end-morph (fix-end-morph): frozen-frame pixel check of a CSS candidate against the build, Chrome headless, COUNTS ONLY.
// 430 x H DPR 3 mobile + touch (hover none / pointer coarse). One load; at each morph position m (touch held, so the
// 7d settle does not move the page) every Web Animation is paused, then shots in the order A, V, A2, V2, where V = the
// candidate CSS injected as <style id="em-px">, A = removed. Score per position: pixels > 8 levels in A~V and in V2~A2
// that are <= 8 in the A/A pair (A~A2) and the V/V pair (V~V2); "consistent" = in both pairs. Max level everywhere.
// Shots stay in out/end-morph/px-<stamp>/ (gitignored).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/em-px-chrome.mjs --css fixes/end-morph/arms/padPF.css [--ms 0.05,0.1,0.25,0.4,0.5,0.54] [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const H = Number(arg('--h', '775'));
const MS = arg('--ms', '0.05,0.1,0.25,0.4,0.5,0.54').split(',').map(Number);
const CSSF = arg('--css', null); if (!CSSF) throw new Error('--css <file>');
const CSSTXT = readFileSync(resolve(WT, CSSF), 'utf8');
const OVERLAY = resolve(WT, arg('--overlay', 'fixes/end-morph/overlay'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph', `px-${stamp}`); mkdirSync(OUT, { recursive: true });
const st = join(OUT, 'serve.json');
const srvP = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', join(mirrorHome(), 'site-pretty'), '--overlay', OVERLAY, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/end-morph/chrome'), 'empx'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-morph/em-px-chrome.mjs', css: CSSF, h: H, positions: [] };
const over = (d, mask) => { let n = 0, m = 0; for (let i = 0; i < d.length; i++) { if (d[i] > m) m = d[i]; if (d[i] > 8 && !(mask && mask[i])) n++; } return { n, max: m }; };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
  const g = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, endStart: max - t }; })()`);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 215, y: 400, id: 1 }] });
  const shot = async (name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); const b = Buffer.from(data, 'base64'); writeFileSync(join(OUT, name + '.png'), b); return pngPixels(b); };
  const setArm = (on) => page.eval(`(() => { const o = document.getElementById('em-px'); if (${on} && !o) { const s = document.createElement('style'); s.id = 'em-px'; s.textContent = ${JSON.stringify(CSSTXT)}; document.head.appendChild(s); } if (!${on} && o) o.remove(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(getComputedStyle(document.querySelector('.start-selling-platform')).filter)))); })()`);
  for (const m of MS) {
    await page.eval(`(document.getAnimations().forEach((a) => a.play()), window.scrollTo({ top: ${Math.round(g.endStart + m * g.t)}, behavior: 'instant' }), 1)`);
    await sleep(700);
    const st0 = await page.eval(`(() => { const p = document.querySelector('.start-selling-platform'); document.getAnimations().forEach((a) => a.pause()); return { fade: p.style.getPropertyValue('--morph-fade'), m: getComputedStyle(document.querySelector('header.start-selling-top-nav')).getPropertyValue('--morph') }; })()`);
    const fA = await setArm(false); const A = await shot(`m${m}-A`);
    const fV = await setArm(true); const V = await shot(`m${m}-V`);
    await setArm(false); const A2 = await shot(`m${m}-A2`);
    await setArm(true); const V2 = await shot(`m${m}-V2`);
    await setArm(false);
    const dAA = delta(A, A2), dVV = delta(V, V2), dAV = delta(A, V), dA2V2 = delta(A2, V2);
    const mask = new Uint8Array(dAA.length); for (let i = 0; i < mask.length; i++) mask[i] = dAA[i] > 8 || dVV[i] > 8 ? 1 : 0;
    const cons = new Uint8Array(dAV.length); for (let i = 0; i < cons.length; i++) cons[i] = dAV[i] > 8 && dA2V2[i] > 8 && !mask[i] ? 255 : 0;
    const row = { m, state: st0, filterA: fA, filterV: fV, AA: over(dAA), VV: over(dVV), AV: over(dAV, mask), A2V2: over(dA2V2, mask), consistent: over(cons), maxAV: dAV.reduce((a, b) => (b > a ? b : a), 0) };
    res.positions.push(row); console.log(JSON.stringify(row));
  }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.close();
} finally { writeFileSync(join(OUT, 'px.json'), JSON.stringify(res, null, 1)); cdp.close(); await chrome.close(); srvP.kill(); console.log('wrote', join(OUT, 'px.json')); }

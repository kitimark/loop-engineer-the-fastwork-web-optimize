// hero-covered-pause (fix-people-gpu): where do A (base) and H (hero pause) differ at the covered position, and is it
// transient? Chrome 430 x 775 DPR 3. Shots of both pages at covered +1.5 s, +4 s, +8 s; per pair the diff boxes (device
// px, 30 px bands), the element under each box and every animation (document-wide) on it or its ancestors. At the page
// end: every running animation in each page, with its target.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 150 --owner fix-people-gpu -- node fixes/people-gpu/gates/hh-diff.mjs --a <dir> --h <dir>
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIRS = { A: arg('--a'), H: arg('--h') };
const OUT = join(WT, 'out/people-gpu', `hh-diff-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
async function serve(dir, name) {
  const st = join(OUT, `serve-${name}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  return { proc: p, url: s.url };
}
const srv = { A: await serve(DIRS.A, 'A'), H: await serve(DIRS.H, 'H') };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'hhd'), headless: true, windowSize: '430,775' });
const cdp = await CDP.connect(chrome.wsUrl);
const P = {};
const ANIMS = (x, y) => `(() => { const el = document.elementFromPoint(${x}, ${y}); const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e);
  const nm = (e) => e ? e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).replace(/svelte-\\w+/g, '').trim().split(/\\s+/).slice(0, 2).join('.') : '?';
  const an = document.getAnimations().filter((a) => chain.includes(a.effect && a.effect.target)).map((a) => [a.animationName || a.transitionProperty || 'waapi', nm(a.effect.target), a.playState, Math.round(a.currentTime), a.timeline === document.timeline ? 'doc' : 'scroll']);
  return { el: nm(el), path: chain.slice(0, 6).map(nm), anims: an }; })()`;
const ALL = `document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const e = a.effect && a.effect.target; return [a.animationName || a.transitionProperty || 'waapi', e ? e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).replace(/svelte-\\w+/g, '').trim().split(/\\s+/)[0] : '?', a.timeline === document.timeline ? 'doc' : 'scroll']; })`;
try {
  for (const a of ['A', 'H']) {
    const p = P[a] = await cdp.newIsolatedPage();
    await p.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await gotoAndSettle(p, srv[a].url, { quietMs: 1500, maxMs: 45000 });
  }
  await sleep(2000);
  const walk = `new Promise((res) => { let y = 0; const s = document.querySelector('section.start-selling-future'); const f = () => { if (s.classList.contains('is-visible') || y > 4000) return res(y); y += 10; window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(f)); }; f(); })`;
  for (const a of ['A', 'H']) await P[a].eval(walk);
  await sleep(1600);
  const top = await P.A.eval(`Math.round(document.querySelector('.start-selling-future-card').getBoundingClientRect().top + scrollY)`);
  for (const a of ['A', 'H']) await P[a].eval(`(window.scrollTo({ top: ${top + 120}, behavior: 'instant' }), 1)`);
  let t0 = 0;
  for (const t of [1500, 4000, 8000]) {
    await sleep(t - t0); t0 = t;
    const sh = {};
    for (const a of ['A', 'H']) { const { data } = await P[a].send('Page.captureScreenshot', { format: 'png' }); const f = join(OUT, `${a}-${t}.png`); writeFileSync(f, Buffer.from(data, 'base64')); sh[a] = pngPixels(readFileSync(f)); }
    const x = sh.A, y = sh.H; const bands = {}; let max = 0;
    for (let yy = 0; yy < x.h; yy++) for (let xx = 0; xx < x.w; xx++) { const i = (yy * x.w + xx) * 4; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(x.px[i + c] - y.px[i + c])); if (d > max) max = d; if (d > 1) { const k = Math.floor(yy / 30) * 30; const r = bands[k] ||= [1e9, -1, 0, 0]; r[0] = Math.min(r[0], xx); r[1] = Math.max(r[1], xx); r[2]++; r[3] = Math.max(r[3], d); } }
    const boxes = Object.entries(bands).map(([k, r]) => ({ y: +k, x0: r[0], x1: r[1], n: r[2], max: r[3] }));
    const where = [];
    for (const b of boxes.slice(0, 6)) { const cx = Math.round((b.x0 + b.x1) / 6), cy = Math.round((b.y + 15) / 3); where.push({ css: [cx, cy], A: await P.A.eval(ANIMS(cx, cy)), H: await P.H.eval(ANIMS(cx, cy)) }); }
    console.log(JSON.stringify({ t, max, boxes, where }));
  }
  for (const a of ['A', 'H']) await P[a].eval(`new Promise((r) => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); setTimeout(() => r(1), 2500); })`);
  console.log(JSON.stringify({ pageEndRunning: { A: await P.A.eval(ALL), H: await P.H.eval(ALL) } }));
} finally { cdp.close(); await chrome.close(); for (const s of Object.values(srv)) s.proc.kill(); console.log('WROTE', OUT); }
process.exit(0);

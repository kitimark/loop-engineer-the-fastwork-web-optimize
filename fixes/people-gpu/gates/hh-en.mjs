// hero-covered-pause (fix-people-gpu): does pausing the hero's animations by itself move the nav's "EN" label by a
// device pixel? Base build only, Chrome 430 x 775 DPR 3. At the covered position: shot S0, again S1 (A/A), then pause
// the hero's time-based animations (the H code path, by hand) and shoot S2, S3 a second later, play them and shoot S4.
// Also lists the composited layers (LayerTree) before and after the pause.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 120 --owner fix-people-gpu -- node fixes/people-gpu/gates/hh-en.mjs --a <dir>
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
const DIR = arg('--a');
const OUT = join(WT, 'out/people-gpu', `hh-en-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
const st = join(OUT, 'serve.json');
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', DIR, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'hhen'), headless: true, windowSize: '430,775' });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  const pg = await cdp.newIsolatedPage();
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await pg.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await pg.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await gotoAndSettle(pg, s.url, { quietMs: 1500, maxMs: 45000 });
  await pg.eval(`new Promise((res) => { let y = 0; const s = document.querySelector('section.start-selling-future'); const f = () => { if (s.classList.contains('is-visible') || y > 4000) return res(y); y += 10; window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(f)); }; f(); })`);
  await sleep(1600);
  const top = await pg.eval(`Math.round(document.querySelector('.start-selling-future-card').getBoundingClientRect().top + scrollY)`);
  await pg.eval(`(window.scrollTo({ top: ${top + 120}, behavior: 'instant' }), 1)`); await sleep(1500);
  const layers = async () => { let last = null; const off = pg.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) last = m.params.layers; }); await pg.send('LayerTree.enable'); await pg.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))'); await sleep(400); await pg.send('LayerTree.disable'); off(); return (last || []).filter((l) => l.drawsContent).length; };
  const shot = async (k) => { const { data } = await pg.send('Page.captureScreenshot', { format: 'png' }); const f = join(OUT, `${k}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return pngPixels(readFileSync(f)); };
  const cmp = (x, y) => { let max = 0, n = 0; for (let i = 0; i < x.px.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(x.px[i] - y.px[i]); if (d > max) max = d; if (d > 1) n++; } return { max, over1: n }; };
  const S0 = await shot('S0'); await sleep(500); const S1 = await shot('S1'); const L0 = await layers();
  await pg.eval(`(() => { window.__hp = []; for (const a of document.querySelector('.hero-track').getAnimations({ subtree: true })) if (a.timeline === document.timeline && a.playState === 'running') { a.pause(); window.__hp.push(a); } return window.__hp.length; })()`);
  await pg.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))'); await sleep(300);
  const S2 = await shot('S2'); await sleep(1000); const S3 = await shot('S3'); const L1 = await layers();
  await pg.eval(`(() => { for (const a of window.__hp) a.play(); return 1; })()`); await sleep(800); const S4 = await shot('S4'); const L2 = await layers();
  console.log(JSON.stringify({ top, 'S0~S1 (A/A)': cmp(S0, S1), 'S1~S2 (paused)': cmp(S1, S2), 'S2~S3 (paused, +1 s)': cmp(S2, S3), 'S1~S4 (played again)': cmp(S1, S4), layersDrawing: { before: L0, paused: L1, played: L2 } }));
} finally { cdp.close(); await chrome.close(); p.kill(); console.log('WROTE', OUT); }
process.exit(0);

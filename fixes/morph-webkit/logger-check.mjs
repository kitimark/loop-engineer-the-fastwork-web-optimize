// Chrome smoke test of fixes/morph-webkit/morph-log.mjs's injected logger (counts only, short lane).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a277ea00c8773c1ea';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = '/private/tmp/claude-501/-Users-<user>-source-fastwork-com-web-optimize/391f6dee-c7ee-40f4-93c3-f4c2dce764ec/scratchpad/morph-webkit/out';
mkdirSync(OUT, { recursive: true });
const src = readFileSync(join(WT, 'fixes/morph-webkit/morph-log.mjs'), 'utf8');
const INSTALL = src.match(/const INSTALL = `([\s\S]*?)`;\n/)[1];
const state = join(OUT, 'serve.json'); rmSync(state, { force: true });
const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', process.env.OVERLAYS || join(WT, 'fixes/aw1-10c/overlay'), '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page');
  console.log('install:', await page.eval(INSTALL));
  await page.eval(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`);
  await sleep(800);
  for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(40); }
  await sleep(1500);
  const mid = await page.eval(`({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph'), osb: document.documentElement.style.overscrollBehaviorY })`);
  for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: -120 }); await sleep(40); }
  await sleep(1500);
  const end = await page.eval(`({ y: scrollY, morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph'), osb: document.documentElement.style.overscrollBehaviorY })`);
  console.log('atMorph', JSON.stringify(mid), 'afterUp', JSON.stringify(end));
  const L =await page.eval('(() => { window.__ml.stop = true; const L = window.__ml; return { n: L.frames.length, listeners: L.listeners, sample: L.frames.filter((f) => f[3] > 0.001 || f[8] || f[13]).slice(0, 6), maxMorph: Math.max(0, ...L.frames.map((f) => f[3] || 0)), pins: L.frames.reduce((a, f) => a + f[8], 0), wheel: L.frames.reduce((a, f) => a + f[13], 0), wheelPrev: L.frames.reduce((a, f) => a + f[14], 0), muts: L.frames.reduce((a, f) => a + f[16], 0), rafMs: L.frames.reduce((a, f) => a + f[5], 0) }; })()');
  console.log(JSON.stringify(L));
} finally { proc.kill(); cdp.close(); await ch.close(); }

// end-bg option C (fix-end-bg, user T-193 #28 / T-197): bake the end screen's static background stacks into one still
// image each, at the phone's layout size and DPR 3, from Chrome's own rendering. COUNTS/PIXELS ONLY, no timing.
//   stage-<row>.png   : a #platform row stage's background: its own gradients + the grain div (mix-blend overlay) or the
//                       blurred backdrop photo (filter: blur(16px), opacity), foreground hidden
//   invoice-sheet.png : the invoice sheet: white + ::before mesh photo (opacity .5) + ::after grain (mix-blend overlay)
// Method: each target is cloned (deep) into a fixed host at the top-left of the viewport, inside wrappers carrying the
// row classes its rules need, at the in-place layout width (offsetWidth, untransformed), border-radius 0 (the live box's
// own radius clips the baked image), foreground made invisible; screenshot of the clone's rect. Output: out/end-bg/bake/.
// Run (shared lane, probe weight):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-bg -- \
//     node fixes/end-bg/bake-chrome.mjs [--overlay fixes/end-bg/overlay] [--width 430]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OVERLAY = resolve(WT, arg('--overlay', 'fixes/end-bg/overlay'));
const WIDTH = Number(arg('--width', '430'));
const OUT = join(WT, 'out/end-bg/bake'); mkdirSync(OUT, { recursive: true });
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');

const st = join(OUT, `serve-${tag}.json`); rmSync(st, { force: true });
const srvP = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', OVERLAY, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
let srv = null; for (let k = 0; k < 300 && !srv; k++) { if (existsSync(st)) try { srv = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!srv) await sleep(100); }
if (!srv) { srvP.kill(); throw new Error('server did not start'); }

const PAGE = `(() => {
  const host = document.createElement('div'); host.id = 'eb-bake-host';
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;background:#000;contain:layout paint;';
  document.body.appendChild(host);
  const st = document.createElement('style'); st.textContent =
    '#eb-bake-host .eb-fg{visibility:hidden!important}#eb-bake-host .eb-tgt{border-radius:0!important;transform:none!important;filter:none!important;}' +
    '#eb-bake-host *{animation:none!important;transition:none!important}';
  document.head.appendChild(st);
  window.__ebTargets = () => { const out = [];
    for (const row of document.querySelectorAll('.start-selling-platform-row')) {
      const id = [...row.classList].find((c) => /^is-(document|discovered|payment|relationship)$/.test(c));
      const stage = row.querySelector('.start-selling-platform-stage'); if (!stage || !id) continue;
      const backdrop = (() => { for (let e = stage; e; e = e.parentElement) { const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none' && e !== stage) return { color: null, image: cs.backgroundImage.slice(0, 120), at: e.className };
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !/, 0\\)$/.test(cs.backgroundColor)) return { color: cs.backgroundColor, at: e === stage ? 'stage' : String(e.className).slice(0, 80) }; } return { color: 'rgb(255, 255, 255)', at: 'none' }; })();
      const bgEls = [...stage.querySelectorAll('.start-selling-platform-stage-grain, .start-selling-platform-stage-bg')];
      const fg = [...stage.children].filter((c) => !c.matches('.start-selling-platform-stage-grain, .start-selling-platform-stage-picture')).map((c) => { const cs = getComputedStyle(c); return { cls: String(c.className).slice(0, 80), bg: cs.backgroundColor, bgi: cs.backgroundImage.slice(0, 60) }; });
      out.push({ kind: 'stage', id: id.slice(3), rowCls: row.className, stageCls: stage.className, w: stage.offsetWidth, h: stage.offsetHeight, backdrop, fg,
        bg: bgEls.map((c) => { const cs = getComputedStyle(c); return { cls: String(c.className), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, filter: cs.filter, blend: cs.mixBlendMode }; }) });
      const sheet = row.querySelector('.start-selling-platform-invoice-sheet');
      if (sheet) out.push({ kind: 'sheet', id: 'invoice-sheet', rowCls: row.className, w: sheet.offsetWidth, h: sheet.offsetHeight, kids: sheet.children.length });
    }
    return out; };
  window.__ebClone = (i) => { host.innerHTML = ''; const t = __ebTargets()[i];
    host.style.background = (t.backdrop && t.backdrop.color) || '#fff';
    const row = [...document.querySelectorAll('.start-selling-platform-row')].filter((r) => r.querySelector('.start-selling-platform-stage') && [...r.classList].some((c) => /^is-(document|discovered|payment|relationship)$/.test(c)));
    const wrapP = document.createElement('div'); wrapP.className = 'start-selling-platform'; wrapP.style.cssText = 'position:static!important;top:auto;height:auto;filter:none;transform:none;';
    const wrapR = document.createElement('div'); wrapR.className = t.rowCls; wrapR.style.cssText = 'position:static;transform:none;filter:none;opacity:1;';
    wrapP.appendChild(wrapR); host.appendChild(wrapP);
    let el;
    if (t.kind === 'stage') {
      const src = document.querySelectorAll('.start-selling-platform-row')[0] && [...document.querySelectorAll('.start-selling-platform-row')].find((r) => r.className === t.rowCls).querySelector('.start-selling-platform-stage');
      el = src.cloneNode(true); el.classList.add('eb-tgt');
      for (const c of el.children) if (!c.matches('.start-selling-platform-stage-grain, .start-selling-platform-stage-picture')) c.classList.add('eb-fg');
      el.style.cssText += ';width:' + t.w + 'px;height:' + t.h + 'px;opacity:1;';
      wrapR.appendChild(el);
    } else {
      const src = [...document.querySelectorAll('.start-selling-platform-row')].find((r) => r.className === t.rowCls).querySelector('.start-selling-platform-invoice-sheet');
      el = src.cloneNode(false); el.classList.add('eb-tgt');
      el.style.cssText += ';position:relative;inset:auto;width:' + t.w + 'px;height:' + t.h + 'px;opacity:1;';
      wrapR.appendChild(el);
    }
    const imgs = [...el.querySelectorAll('img')]; for (const im of imgs) { im.loading = 'eager'; }
    return Promise.all(imgs.map((im) => im.decode().catch(() => null))).then(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(); res({ ...t, x: r.left, y: r.top, rw: r.width, rh: r.height, imgs: imgs.map((im) => ({ src: im.currentSrc, nw: im.naturalWidth })) }); })))); };
  return 1; })()`;

const profileDir = tempProfileDir(join(OUT, 'chrome'), 'bake');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-bg/bake-chrome.mjs', browser: chrome.browser, width: WIDTH, overlay: OVERLAY, items: [] };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: WIDTH, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2000); }; step(); })`, { timeout: 90000 });
  await page.eval('window.scrollTo({ top: 0, behavior: "instant" }), 1');
  await sleep(800);
  await page.eval(PAGE);
  const targets = await page.eval('__ebTargets()');
  console.log('targets', JSON.stringify(targets));
  for (let i = 0; i < targets.length; i++) {
    const t = await page.eval(`__ebClone(${i})`, { timeout: 30000 });
    await sleep(400);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: t.x, y: t.y, width: t.rw, height: t.rh, scale: 1 }, captureBeyondViewport: false });
    const name = t.kind === 'stage' ? `stage-${t.id}` : t.id;
    const f = join(OUT, `${name}.png`); writeFileSync(f, Buffer.from(shot.data, 'base64'));
    res.items.push({ name, file: f, ...t });
    console.log(name, `${t.rw}x${t.rh} css at x${t.x} y${t.y}`, 'imgs', JSON.stringify(t.imgs), '->', f);
  }
  await page.close();
} finally {
  writeFileSync(join(OUT, `bake-${tag}.json`), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); srvP.kill();
}

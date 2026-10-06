// Which elements take the idle style writes (fix-end-morph-p1; follow-up of the idle triple, where A wrote +2.2 style
// attributes/s more than C at y 0 and had +4-5 events/s mid-page). COUNTS ONLY, headless, CPU 1x, no timing.
// Per arm: 430x932 DPR 3 touch, load, settle 2 s (as idletriple.mjs), then 5 s windows at y 0 and at y 2620 (walked in
// 250 px steps): style/class attribute mutations grouped by the target (first class or tag, and the property names
// that changed), events by type (scroll, animation*, transition*, resize) with their target.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 60 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/idle-who.mjs C=out/p1b/snapi/C1 A=out/p1b/snapi/A1
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const ARMS = process.argv.slice(2).map((s) => { const i = s.indexOf('='); return { name: s.slice(0, i), dir: resolve(WT, s.slice(i + 1)) }; });
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
async function serve(overlay) {
  const st = join(OUT, `serve-who-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const SHIM = `(() => { const W = window.__who = { on: false, attr: {}, ev: {}, raf: 0 };
  const key = (n) => (n.nodeType === 1 ? (n.id ? '#' + n.id : (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : n.tagName.toLowerCase())) : String(n.nodeName));
  const R = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = function (cb) { const st = W.on ? (new Error().stack || '').split('\\n').slice(2, 3).join('').trim().slice(0, 140) : null; return R(function (t) { if (W.on) { W.raf++; (W.rafFrom ||= {}); W.rafFrom[st] = (W.rafFrom[st] || 0) + 1; } return cb(t); }); };
  new MutationObserver((rs) => { if (!W.on) return; for (const r of rs) if (r.type === 'attributes') { const k = key(r.target) + ' @' + r.attributeName + (r.attributeName === 'style' ? ' [' + [...r.target.style].join(',').slice(0, 80) + ']' : ''); W.attr[k] = (W.attr[k] || 0) + 1; } })
    .observe(document, { attributes: true, subtree: true, attributeOldValue: false });
  for (const t of ['scroll', 'animationstart', 'animationend', 'animationiteration', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'resize'])
    window.addEventListener(t, (e) => { if (!W.on) return; const k = t + ' ' + (e.target && e.target.nodeType === 1 ? key(e.target) : 'window') + (e.propertyName ? ' ' + e.propertyName : ''); W.ev[k] = (W.ev[k] || 0) + 1; }, { capture: true, passive: true }); })()`;
const walkTo = (page, y) => page.eval(`new Promise(async (res) => { const ty = Math.min(${y}, document.documentElement.scrollHeight - innerHeight); for (let i = 0; i < 400 && Math.abs(scrollY - ty) > 1; i++) { const d = ty - scrollY; scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 250), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); } res(Math.round(scrollY)); })`, { timeout: 30000 });
const res = { tool: 'fixes/end-morph-p1/p1b/idle-who.mjs', startedAt: new Date().toISOString(), arms: {} };
const ch = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'who'), headless: true });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const arm of ARMS) {
    const srv = await serve(arm.dir); res.arms[arm.name] = {};
    try {
      const page = await cdp.newIsolatedPage();
      if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
      await gotoAndSettle(page, srv.url, { quietMs: 2000 }); await sleep(1500);
      for (const [spot, y] of [['top', 0], ['mid', 2620]]) {
        await walkTo(page, y); await sleep(2000);
        await page.eval(`(Object.assign(window.__who, { on: true, attr: {}, ev: {}, raf: 0, rafFrom: {} }), 0)`); await sleep(5000);
        const w = await page.eval(`(async () => { await Promise.resolve(); const w = window.__who; w.on = false; return JSON.parse(JSON.stringify(w)); })()`);
        res.arms[arm.name][spot] = w; console.log(arm.name, spot, JSON.stringify(w));
      }
      await page.close();
    } finally { srv.proc.kill(); }
  }
} finally { cdp.close(); await ch.close(); }
const f = join(OUT, `idle-who-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);

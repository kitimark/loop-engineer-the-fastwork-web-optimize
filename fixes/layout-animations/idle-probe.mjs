// layout-animations idle + visual probe (read-only; launches Chrome, so run it under the chrome-measure lock).
// Usage (from the worktree root, both servers already running):
//   node fixes/layout-animations/idle-probe.mjs "$PWD" base=https://localhost:<b>/ fix=https://localhost:<f>/ \
//     [--runs 2] [--secs 5] [--cpu 6] [--spots 'top,.sel,...'] [--shots dir] [--json file] [--visual-only]
// Per spot: scroll there, wait 3 s, CPU throttle on, 'secs' s with no input: Performance.getMetrics deltas,
// a rAF frame count and the document.getAnimations() running list. Then visual-checks.mjs (frozen frames).
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const argv = process.argv.slice(2);
const REPO = argv[0];
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(REPO, 'tools/lib/cdp.mjs'));
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
let targets = argv.filter((a) => /^[\w-]+=https?:\/\//.test(a)).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
const RUNS = argv.includes("--visual-only") ? 0 : Math.max(2, Number(opt("runs", 2))), SECS = Number(opt('secs', 6)), SHOTS = opt('shots', null), CPU = Number(opt('cpu', 6));
const SPOTS = (opt('spots', 'top,.start-selling-avatars,.fee-progress,.start-selling-platform-service-card,.start-selling-platform-row-title-doc,.start-selling-platform-row-title-secure')).split(',');
const ch = await launchChrome({ port: 0, profileDir: resolve(REPO, 'out/layout-animations-idle-probe-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const out = [];
try {
  for (let run = 0; run < RUNS; run++) for (const t of (run % 2 ? [...targets].reverse() : targets)) {
    const page = await cdp.newIsolatedPage();
    await page.send('Performance.enable', { timeDomain: 'threadTicks' });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.bringToFront');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const S=window.__fr={n:0,on:false};const f=()=>{if(S.on)S.n++;requestAnimationFrame(f)};requestAnimationFrame(f)})()` });
    await gotoAndSettle(page, t.url, { quietMs: 2000 });
    await sleep(1500);
    for (const spot of SPOTS) {
      // walk there in steps so scroll-linked code sees a normal scroll
      const y = spot === 'top' ? 0 : await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(spot)}); if (!e) return -1; const r = e.getBoundingClientRect(); return Math.max(0, Math.round(scrollY + r.top + r.height / 2 - innerHeight / 2)); })()`);
      if (y < 0) { out.push({ label: t.label, run, spot, missing: true }); continue; }
      await page.eval(`new Promise(async (res) => { for (let i = 0; i < 200 && Math.abs(scrollY - ${y}) > 1; i++) { const d = ${y} - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); } res(); })`, { timeout: 60000 });
      await sleep(2500);
      await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      await sleep(500);
      const anims = await page.eval(`document.getAnimations().filter(a => a.playState === 'running').map(a => { const e = a.effect && a.effect.target; const cls = e ? (e.tagName + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ').slice(0,2).join('.')) : '?'; return (a.animationName || a.transitionProperty || a.constructor.name) + ' @' + cls; })`);
      const m0 = Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      await page.eval('window.__fr.n = 0; window.__fr.on = true');
      await sleep(SECS * 1000);
      const frames = await page.eval('(() => { window.__fr.on = false; return window.__fr.n; })()');
      const m1 = Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const d = (k) => m1[k] - m0[k];
      const row = { label: t.label, run, spot, y, frames, layouts: d('LayoutCount'), styles: d('RecalcStyleCount'), layoutMs: Math.round(d('LayoutDuration') * 1000), styleMs: Math.round(d('RecalcStyleDuration') * 1000), scriptMs: Math.round(d('ScriptDuration') * 1000), taskMs: Math.round(d('TaskDuration') * 1000), anims: [...new Set(anims)].slice(0, 20) };
      out.push(row);
      console.log(JSON.stringify({ ...row, anims: row.anims.length + ' running: ' + row.anims.join(' | ') }));
      if (SHOTS && run === 0) { mkdirSync(SHOTS, { recursive: true }); const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, `${t.label}-${spot.replace(/[^\w-]/g, '_')}.png`), Buffer.from(data, 'base64')); }
    }
    await page.close();
  }
  try { const { visualChecks } = await import(new URL('./visual-checks.mjs', import.meta.url)); await visualChecks(cdp, targets, join(SHOTS || resolve(REPO, 'out/layout-animations-shots'), 'visual'), { gotoAndSettle, sleep }); } catch (e) { console.log('visual checks failed', e.message); }
} finally { cdp.close(); await ch.close(); }
if (opt('json', null)) writeFileSync(opt('json'), JSON.stringify(out, null, 1));

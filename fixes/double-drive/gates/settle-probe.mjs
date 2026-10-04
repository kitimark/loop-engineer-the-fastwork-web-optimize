#!/usr/bin/env node
// double-drive: why does the commission card sit at different places at rest in V (hold 6: pill 5 css px lower, V vs V2 differ)?
// DOM only, no timing, no screenshots. Per arm (A = v8, V = v8 + fix) and load: instant scroll to the stops in PX_YS order
// (default 5932,6000), then at 0.3 / 1 / 2.6 / 4 s after the last one read the commission card's rect, computed
// transform and origin, the section's class list, the custom properties and the pill's rect. Repeats LOADS loads per arm.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-double-drive -- \
//     node fixes/double-drive/gates/settle-probe.mjs desktop
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const VP = process.argv[2] || 'desktop';
const VPS = { mobile: { width: 430, height: 932, dpr: 3, mobile: true }, desktop: { width: 1440, height: 900, dpr: 1, mobile: false } };
const vp = VPS[VP];
const SNAP = join(WT, 'out/double-drive/snap');
const BASE = resolveTree('site-pretty');
const OUT = join(WT, 'out/double-drive', `settle-${VP}-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const YS = (process.env.PX_YS || '5932,6000').split(',').map(Number);
const LOADS = +(process.env.LOADS || 2);
const READ = `(() => { const c = document.querySelector('.commission-card'), s = document.querySelector('section.commission'); if (!c || !s) return null;
  const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
  const pill = [...c.querySelectorAll('*')].find((e) => /gradient/.test(getComputedStyle(e).backgroundImage) && e.getBoundingClientRect().height < 40 && e.getBoundingClientRect().height > 8);
  const pr = pill && pill.getBoundingClientRect();
  return { scrollY: Math.round(scrollY), cls: s.className, top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2), tf: cs.transform, org: cs.transformOrigin,
    w: c.style.getPropertyValue('--fw-co-w') || s.style.getPropertyValue('--fw-co-w') || null, shrink: s.style.getPropertyValue('--commission-shrink') || c.style.getPropertyValue('--commission-shrink') || null,
    enter: s.style.getPropertyValue('--commission-enter-shrink') || c.style.getPropertyValue('--commission-enter-shrink') || null, pillTop: pr ? +pr.top.toFixed(2) : null }; })()`;
async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const res = { vp: VP, ys: YS, loads: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/double-drive/chrome'), 'settle-' + VP), headless: true, windowSize: `${vp.width},${vp.height}` });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ['A', 'V', 'A', 'V']) {
    if (res.loads.length >= LOADS * 2) break;
    const s = await server(arm); const load = { arm, reads: [] }; res.loads.push(load);
    try {
      const page = await cdp.newIsolatedPage();
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 }); await sleep(2000);
      await page.eval(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`); await sleep(2500);
      for (let i = 0; i < YS.length; i++) {
        await page.eval(`(scrollTo({ top: ${YS[i]}, behavior: 'instant' }), 1)`);
        if (i < YS.length - 1) { await sleep(2600); continue; }
        let t0 = Date.now();
        for (const at of [100, 300, 1000, 2600, 4000]) { await sleep(Math.max(0, at - (Date.now() - t0))); load.reads.push({ at, ...(await page.eval(READ)) }); }
      }
      await page.close();
    } finally { s.p.kill(); }
    console.log(`load ${arm}`); for (const r of load.reads) console.log(' ', JSON.stringify(r));
  }
} finally { cdp.close(); await chrome.close(); }
writeFileSync(join(OUT, 'settle.json'), JSON.stringify(res, null, 1)); console.log('wrote', join(OUT, 'settle.json'));

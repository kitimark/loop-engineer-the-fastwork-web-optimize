// Debug (headless Chrome, functional): who writes data-start-selling-render / -scene during the J2 jump
// (3100 -> #platform). setAttribute wrapper logs writer stack tops after a mark. usage: node cdbg.mjs <label>=<url>...
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
const targets = process.argv.slice(2);
const INJ = `(() => { const o = Element.prototype.setAttribute; window.__fwW = []; window.__fwMark = false;
  Element.prototype.setAttribute = function (k, v) { if (window.__fwMark && (k === 'data-start-selling-render' || k === 'data-start-selling-scene')) {
    const st = (new Error().stack || '').split('\\n').slice(2, 7).map((s) => s.trim().replace(/^at /, '').replace(/\\(?https?:\\/\\/[^/]+\\/_app\\/immutable\\/nodes\\//, '').replace(/\\)$/, '')).join(' < ');
    window.__fwW.push([Math.round(performance.now()), (this.id ? '#' + this.id : '.' + String(this.className).split(' ')[0]), k.slice(20), v, this.getAttribute(k), st]); }
    return o.call(this, k, v); }; })();`;
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'fwreskip-cdbg');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const t of targets) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    for (const j of (process.env.JUMPS || 'J2').split(',')) {
      const page = await cdp.newIsolatedPage();
      if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJ });
      await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
      const r = await page.eval(`(async () => { const R = 'data-start-selling-render'; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const secs = () => [...document.querySelectorAll('[' + R + ']')].map((e) => { const r = e.getBoundingClientRect(); return (e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) + ' ' + Math.round(r.top + scrollY) + '+' + Math.round(r.height) + ' ' + e.getAttribute(R) + '/' + e.getAttribute('data-start-selling-scene'); });
        const s0 = secs();
        const y0 = ${j === 'J2' || j === 'J1' ? 3100 : 'document.documentElement.scrollHeight'};
        for (let i = 0; i < 80 && Math.abs(scrollY - y0) > 2 && scrollY < document.documentElement.scrollHeight - innerHeight - 2; i++) { const d = y0 - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(250, Math.abs(d)), behavior: 'smooth' }); await wait(300); }
        await wait(1000); const s1 = secs(); window.__fwMark = true;
        const ty = ${j === 'J2' ? `Math.round(document.querySelector('#platform').getBoundingClientRect().top + scrollY)` : j === 'J3' ? '0' : `Math.round(document.querySelector('#people').getBoundingClientRect().top + scrollY)`};
        window.scrollTo({ top: ty, behavior: 'instant' }); await wait(1500); window.__fwMark = false;
        return { s0, y1: Math.round(scrollY), s1, w: window.__fwW, s2: secs() }; })()`);
      console.log(`== ${label} ${j}\n  load: ${r.s0.join(' | ')}\n  before jump: ${r.s1.join(' | ')}`);
      for (const w of r.w) console.log(`  ${w[0]} ${w[1]} ${w[2]} ${w[4]}->${w[3]} ${w[5]}`);
      console.log(`  after: ${r.s2.join(' | ')}`);
      await page.close();
    }
  }
} finally { cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {} }

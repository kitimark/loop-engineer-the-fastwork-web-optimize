// int-v8, P-134 identity check (lead, from fix-hero-exit-threaded's end-of-page review): g11 (the 0.75 s visibility
// hide of the header panel's 4 children, CSS `.start-selling-top-nav:not(.is-morphing) .start-selling-morph-panel > *`)
// must never hide a child while the panel is visible (panel opacity clamp(0, (--morph - 0.08) / 0.72, 1), CSS 10961).
// Counts only, no timing. Headless Chrome 430x932 DPR 3 mobile + touch, one load per arm (V = v9.1d, C = v9-final + 7d
// as the no-g11 control). Per scenario, per rAF from the close trigger: header .is-morphing, panel computed opacity,
// each child's computed visibility. A VIOLATION is a frame with panel opacity > 0 and any child hidden.
// Positive control: frames with .is-morphing off and children hidden must exist in V (else the probe saw no hide).
// Scenarios: close (no re-open); re-open d ms after .is-morphing goes off (d 0..700, inside the 0.75 s hide), by
// __navMorphSet (set) and by scroll (jump to the morph end and back).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 -- node g11exact.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05';
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const SNAP = join(WT, process.env.G_SNAP || 'out/v91d/att');   // v9.2 copy: G_SNAP / G_OUT pick the snapshot and output
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const OUT = join(WT, process.env.G_OUT || 'out/v91d/g11exact'); mkdirSync(OUT, { recursive: true });
const ARMS = (process.argv[2] || 'V,C').split(',');
const DS = [0, 50, 150, 300, 500, 700];
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; return { t, max: document.documentElement.scrollHeight - innerHeight }; })()`;
// sampler: from now, per rAF; `reopen` runs d ms after the first frame without .is-morphing; stops 1200 ms after the
// re-open (or 1500 ms after the first off frame when there is none)
const RUN = (closeJs, reopenJs, d) => `new Promise((res) => { const h = document.querySelector('header.start-selling-top-nav');
  const p = h.querySelector('.start-selling-morph-panel'); const t0 = performance.now(), s = []; let off = null, ro = null;
  ${closeJs};
  const f = () => { const now = performance.now(); const mor = h.classList.contains('is-morphing');
    if (!mor && off === null) off = now;
    if (${reopenJs ? 'true' : 'false'} && off !== null && ro === null && now - off >= ${d}) { ro = now; ${reopenJs || ''}; }
    const cs = getComputedStyle(p);
    s.push({ t: Math.round(now - t0), mor, op: +cs.opacity, m: cs.getPropertyValue('--morph').trim(), kids: [...p.children].map((k) => getComputedStyle(k).visibility[0]).join('') });
    const end = ro !== null ? now - ro > 1200 : off !== null && now - off > 1500;
    if (end || now - t0 > 6000) res({ s, off: off === null ? null : Math.round(off - t0), ro: ro === null ? null : Math.round(ro - t0) }); else requestAnimationFrame(f); };
  requestAnimationFrame(f); })`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v91d/chrome'), 'g11exact'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'g11exact (int-v8, P-134)', browser: chrome.browser, startedAt: new Date().toISOString(), arms: {}, summary: {} };
let viol = 0;
try {
  for (const arm of ARMS) {
    const st = join(OUT, `serve-${arm}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const page = await cdp.newIsolatedPage(); const L = (res.arms[arm] = { scen: {} });
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      L.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (L.served.js !== HX[`${arm}/${NODE}`] || L.served.css !== HX[`${arm}/${CSS}`]) throw new Error(`VOID: ${arm} serves ${L.served.js} / ${L.served.css}`);
      const g = await page.eval(GEO); const yAt = (q) => Math.round(g.max - g.t + q * g.t);
      const scen = [['set-close', 'set', null], ['scroll-close', 'scroll', null], ...DS.map((d) => [`set-reopen-${d}`, 'set', d]), ...[0, 300].map((d) => [`scroll-reopen-${d}`, 'scroll', d])];
      for (const [name, how, d] of scen) {
        if (how === 'set') { await page.eval(`(window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' }), 1)`); await sleep(800); await page.eval('(window.__navMorphSet(1), 1)'); }
        else await page.eval(`(window.scrollTo({ top: ${yAt(1)}, behavior: 'instant' }), 1)`);
        await sleep(1500);
        const close = how === 'set' ? 'window.__navMorphSet(0)' : `window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' })`;
        const reopen = d === null ? null : how === 'set' ? 'window.__navMorphSet(1)' : `window.scrollTo({ top: ${yAt(1)}, behavior: 'instant' })`;
        const r = await page.eval(RUN(close, reopen, d ?? 0));
        const v = r.s.filter((x) => x.op > 0 && x.kids.includes('h'));
        const sum = { frames: r.s.length, offAt: r.off, reopenAt: r.ro, violations: v.length, firstViolation: v[0] || null,
          hiddenWhileOff: r.s.filter((x) => !x.mor && x.kids.includes('h')).length, maxOpWhileOff: Math.max(0, ...r.s.filter((x) => !x.mor).map((x) => x.op)),
          maxOpWhileHidden: Math.max(0, ...r.s.filter((x) => x.kids.includes('h')).map((x) => x.op)), maxOp: Math.max(0, ...r.s.map((x) => x.op)),
          firstVisibleAfterReopen: r.ro === null ? null : r.s.find((x) => x.t >= r.ro && x.op > 0) || null };
        viol += v.length; L.scen[name] = { ...sum, samples: r.s };
        console.log(`${arm} ${name.padEnd(16)} ${JSON.stringify(sum)}`);
        // back to rest at p 0 before the next scenario
        await page.eval('(window.__navMorphSet(0), 1)'); await page.eval(`(window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' }), 1)`); await sleep(1500);
      }
    } catch (e) { L.error = String(e.stack || e.message || e); console.log(arm, 'error', L.error); process.exitCode = 3; }
    finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); }
  }
} finally {
  res.endedAt = new Date().toISOString(); res.violations = viol;
  const f = join(OUT, `g11exact-${res.startedAt.replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log(`G11EXACT violations ${viol}  WROTE ${f}`);
  if (viol) process.exitCode = 1;
}

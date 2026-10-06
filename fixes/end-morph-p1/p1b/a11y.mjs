// A (P1 + P1b (a)) gate, protocol v2 §2.4 "a11y diff" (lead ruling 09:35Z; fix-end-morph-p1). COUNTS ONLY, headless.
// P1 adds .fw-rv-dark (in the nav) and .fw-rv-glass (in the nav's parent); (a) adds .fw-rv-size (aria-hidden, visibility
// hidden) in the nav. Per arm, phone 430 x 932 DPR 3, touch: the full accessibility tree (CDP Accessibility.getFullAXTree)
// at 4 states: top (y 0), the end track at m ~ 0.5 (the reveal on, a held synthetic touch), m = 1 (bottom), back at
// m = 0 above the end track. Each state is reduced to the non-ignored nodes as "role|name" lines in tree order, plus
// the focusable ones (CDP property focusable); every arm is diffed against the first arm (the control).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 120 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/a11y.mjs --arm C=out/p1b/snapi/C1 --arm A=out/p1b/snapi/A1
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
async function serve(overlay) {
  const st = join(OUT, `serve-ax-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
const STAT = `(() => { const h = document.querySelector('header.start-selling-top-nav'); return { y: Math.round(scrollY), m: parseFloat(h.style.getPropertyValue('--morph')) || 0, rv: h.hasAttribute('data-fw-rv') }; })()`;
// the countdown's digits change every second: names that are only digits and separators are masked
const mask = (s) => String(s ?? '').replace(/\d/g, '#');
async function ax(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const lines = [], focusable = [];
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role?.value ?? '?', name = mask(n.name?.value).slice(0, 80);
    if (role === 'InlineTextBox') continue;
    lines.push(`${role}|${name}`);
    if ((n.properties || []).some((p) => p.name === 'focusable' && p.value?.value)) focusable.push(`${role}|${name}`);
  }
  return { total: nodes.length, ignored: nodes.filter((n) => n.ignored).length, lines, focusable };
}
function diff(a, b) {
  // multiset difference both ways (order-insensitive), plus whether the order is the same
  const cnt = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const A = cnt(a), B = cnt(b), onlyA = [], onlyB = [];
  for (const [k, v] of A) for (let i = 0; i < v - (B.get(k) || 0); i++) onlyA.push(k);
  for (const [k, v] of B) for (let i = 0; i < v - (A.get(k) || 0); i++) onlyB.push(k);
  return { onlyControl: onlyA, onlyArm: onlyB, sameOrder: a.length === b.length && a.every((x, i) => x === b[i]) };
}
const res = { tool: 'fixes/end-morph-p1/p1b/a11y.mjs', startedAt: new Date().toISOString(), arms: {}, diff: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'ax'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ARMS) {
    const srv = await serve(arm.dir); const r = (res.arms[arm.name] = { overlay: arm.dir, states: {} });
    try {
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Accessibility.enable');
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      await sleep(800);
      const snap = async (name) => { const s = await page.eval(STAT); const t = await ax(page); r.states[name] = { ...s, ...t }; console.log(arm.name, name, JSON.stringify({ ...s, total: t.total, ignored: t.ignored, shown: t.lines.length, focusable: t.focusable.length })); };
      await snap('top');
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y = Math.min(y + 400, document.documentElement.scrollHeight); scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight - innerHeight ? setTimeout(step, 40) : setTimeout(res, 2000); }; step(); })`, { timeout: 90000 });
      await page.eval(TOUCH);
      const toM = async (e) => { const g = await page.eval(GEO); await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + e * g.t)}, behavior: 'instant' }), 1)`); await sleep(900); };
      await toM(-1); await toM(0.5); await snap('m~0.5');
      await toM(1.2); await sleep(600); await snap('m=1');
      await toM(-0.6); await sleep(600); await snap('m=0 above end');
      await page.close();
    } finally { srv.proc.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
const [ctl, ...rest] = ARMS.map((a) => a.name);
for (const n of rest) { res.diff[n] = {}; for (const st of Object.keys(res.arms[ctl].states)) { const a = res.arms[ctl].states[st], b = res.arms[n].states[st]; if (!b) continue;
  res.diff[n][st] = { tree: diff(a.lines, b.lines), focusable: diff(a.focusable, b.focusable), mCtl: a.m, mArm: b.m, rvArm: b.rv }; console.log('diff', ctl, '->', n, st, JSON.stringify(res.diff[n][st])); } }
res.endedAt = new Date().toISOString();
const f = join(OUT, `a11y-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);

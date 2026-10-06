// PR-029 rev 3: option (a) on CM v1.2, phone mechanism check (counts only, no timing). For the page already open in
// Safari (iphone.mjs open <url> first): walk down to the page end, then for each m in MS hold a synthetic touch (the
// page's settle listens to window touchstart, so it does not snap) and scroll to endStart + m * innerHeight; read m,
// --morph-fade, the pause attribute and the running animations (all, and under #platform). Writes <out>.
// usage: node fixes/end-morph-f12/phone/pfa-probe.mjs --match <host:port> --label <arm> --out <file.json> [--ms 0,0.1,0.3,0.5,1]
import { writeFileSync } from 'node:fs';
import { openTab, sleep } from '../../../tools/lib/wip.mjs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MATCH = arg('--match'), LABEL = arg('--label', 'x'), OUT = arg('--out');
const MS = arg('--ms', '0,0.1,0.3,0.5,1').split(',').map(Number);
if (!MATCH || !OUT) { console.error('usage: --match <host:port> --label <arm> --out <file.json> [--ms ...]'); process.exit(2); }
const c = await openTab((u) => String(u).includes(MATCH));
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const STATE = `JSON.stringify((() => { const p = document.getElementById('platform'); const ih = innerHeight, docH = document.documentElement.scrollHeight;
  const run = document.getAnimations().filter((a) => a.playState === 'running'); const inP = run.filter((a) => a.effect && a.effect.target && p && p.contains(a.effect.target));
  return { scrollY: Math.round(scrollY), m: Math.round(((scrollY - (docH - 2 * ih)) / ih) * 1000) / 1000, fwMs: document.documentElement.classList.contains('fw-ms'),
    fade: p && p.style.getPropertyValue('--morph-fade'), paused: !!(p && p.hasAttribute('data-fw-pf-paused')), opacity: p && getComputedStyle(p).opacity,
    filter: p && getComputedStyle(p).filter, running: run.length, runningInPlatform: inP.length }; })())`;
const res = { label: LABEL, at: new Date().toISOString(), rows: [] };
try {
  await c.evaluate(`(async () => { const H = () => document.documentElement.scrollHeight - innerHeight; for (let y = 0; y < H(); y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } return 1; })(); 'walking'`);
  await sleep(9000);
  for (const m of MS) {
    await c.evaluate(TOUCH);
    await c.evaluate(`scrollTo(0, document.documentElement.scrollHeight - 2 * innerHeight + ${m} * innerHeight); 'ok'`);
    await sleep(700);
    await c.evaluate(TOUCH);
    await sleep(300);
    const r = JSON.parse(await c.evaluate(STATE));
    res.rows.push({ mTarget: m, ...r });
    console.log(`PFA ${LABEL} m ${m} -> ${r.m} fade ${r.fade} paused ${r.paused} running ${r.running} (platform ${r.runningInPlatform}) opacity ${r.opacity} filter ${r.filter}`);
  }
} finally { writeFileSync(OUT, JSON.stringify(res, null, 1)); c.close(); }

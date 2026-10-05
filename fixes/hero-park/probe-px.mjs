// hero-park pixel-diff probe (Simulator, no timing): why did the P-140 dry run's V shots at E+300 / E+700 differ from C?
// Per arm (C = v9.1d, V = v9.1d + hero-park): a finger marked down with a touch-shaped synthetic event (touches /
// changedTouches = one touch, so the page's touch handlers do not throw), scrollTo E+300, then every 100 ms for 1.5 s:
// scrollY, .he-css, --exit-opacity (inline and computed opacity of the hero's exit layer), the element at the screen
// centre (its nearest section class) and the hero track's rect. Then the same at E+700. Then touchend and 800 ms (C parks
// by heRest), sampled again: the baseline's own park at that scrollY.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/hero-park/probe-px.mjs
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const DIRS = { C: join(WT, 'fixes/hp-base/overlay'), V: join(WT, 'fixes/hero-park/overlay') };
const OUT = join(WT, 'out/hero-park/probe-px', new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const TOUCH = (type) => `(() => { const t = { clientX: 215, clientY: 500, pageX: 215, pageY: 500, identifier: 7, target: document.body };
  const e = new Event('${type}', { bubbles: true, cancelable: true }); const l = ${type === 'touchend' ? '[]' : '[t]'};
  Object.defineProperty(e, 'touches', { value: l }); Object.defineProperty(e, 'targetTouches', { value: l }); Object.defineProperty(e, 'changedTouches', { value: [t] });
  document.body.dispatchEvent(e); return 1; })()`;
const SAMPLE = `(() => { const t = document.querySelector('.hero-track'), r = t.getBoundingClientRect(); const x = document.querySelector('.hero-track .hero-exit, .hero-track [style*="--exit-opacity"]') || t.querySelector('[style*="exit-opacity"]');
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); let s = el; while (s && !(s.tagName === 'SECTION' || (s.className && /section|deck|pain|hero|track/.test(String(s.className))))) s = s.parentElement;
  return { y: scrollY, live: t.classList.contains('he-css'), on: t.classList.contains('he-on'), exitInline: x ? x.style.getPropertyValue('--exit-opacity') : null, exitOpacity: x ? getComputedStyle(x).opacity : null,
    trackTop: Math.round(r.top), trackBottom: Math.round(r.bottom), centre: s ? (s.tagName + '.' + String(s.className).split(' ').slice(0, 3).join('.')) : el && el.tagName }; })()`;
const res = { tool: 'hero-park probe-px', arms: {} };
for (const arm of ['C', 'V']) {
  const st = join(OUT, `serve-${arm}.json`);
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', DIRS[arm], '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const R = (res.arms[arm] = {});
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    const url = `http://localhost:${s.port}/`;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    const errs = []; c.on((m) => { if (m.method === 'Console.messageAdded' && m.params.message.level === 'error') errs.push(String(m.params.message.text).slice(0, 160)); });
    await c.send('Console.enable').catch(() => {});
    await sleep(4000);
    const ev = (x) => c.evaluate(x);
    R.page = await ev(`(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return { ih: innerHeight, top: r.top + scrollY, h: r.height, E: r.top + scrollY + Math.max(1, r.height - innerHeight), exitEl: (document.querySelector('[style*="exit-opacity"]') || {}).className || null }; })()`);
    const E = Math.round(R.page.E);
    const series = async (tag, n = 15) => { const a = []; for (let k = 0; k < n; k++) { a.push(await ev(SAMPLE)); await sleep(100); } R[tag] = a; };
    await ev(TOUCH('touchstart'));
    await ev(`window.scrollTo({ top: ${E - 300}, behavior: 'instant' })`); await sleep(300);
    await ev(`window.scrollTo({ top: ${E + 300}, behavior: 'instant' })`); await series('E+300 finger down');
    execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', join(OUT, `${arm}-E+300-down.png`)], { stdio: 'ignore' });
    await ev(`window.scrollTo({ top: ${E + 700}, behavior: 'instant' })`); await series('E+700 finger down');
    await ev(TOUCH('touchend')); await sleep(800); await series('E+700 lifted +800ms', 5);
    execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', join(OUT, `${arm}-E+700-lifted.png`)], { stdio: 'ignore' });
    await ev(TOUCH('touchstart'));
    await ev(`window.scrollTo({ top: ${E + 300}, behavior: 'instant' })`); await sleep(300);
    await ev(TOUCH('touchend')); await sleep(800); await series('E+300 lifted +800ms', 5);
    execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', join(OUT, `${arm}-E+300-lifted.png`)], { stdio: 'ignore' });
    R.consoleErrors = errs;
  } catch (e) { R.error = String(e && e.stack || e).slice(0, 400); }
  finally { try { c && c.close(); } catch {} p.kill(); }
}
writeFileSync(join(OUT, 'probe-px.json'), JSON.stringify(res, null, 1));
for (const [arm, R] of Object.entries(res.arms)) {
  console.log(`ARM ${arm} E ${R.page && Math.round(R.page.E)} exitEl ${R.page && R.page.exitEl} errors ${(R.consoleErrors || []).length} ${R.error || ''}`);
  for (const k of Object.keys(R).filter((k) => /E\+/.test(k))) { const a = R[k]; const f = a[0], l = a.at(-1);
    console.log(`  ${k}: first ${JSON.stringify(f)}\n  ${' '.repeat(k.length)}  last ${JSON.stringify(l)}`); }
}
console.log('OUT', OUT);

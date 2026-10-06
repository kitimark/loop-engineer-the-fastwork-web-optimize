// hero-covered-pause (fix-people-gpu): functional check in Chrome, no timing. Two pages side by side, A (base) and H
// (the hero pause), 430 x H DPR 3 mobile + touch. Steps: top (hero shown) -> the reveal (card shown, top edge below the
// viewport top) -> 1 px steps across the card's top edge (where does H pause?) -> covered 5 s (pixels A vs H; H's hero
// animations paused) -> back to the top (resumed with no jump: the paused animations' currentTime continues from the
// held value; countdown digits equal to A's) -> the page end (hero off screen: paused in H).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 240 --owner fix-people-gpu -- \
//     node fixes/people-gpu/gates/hh-chrome.mjs --a <abs dir> --h <abs dir> [--vh 775]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIRS = { A: arg('--a'), A2: arg('--a'), H: arg('--h') };
if (!DIRS.A || !DIRS.H) throw new Error('--a <dir> --h <dir>');
const VH = Number(arg('--vh', '775'));
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/people-gpu', `hh-chrome-${tag}`); mkdirSync(OUT, { recursive: true });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const HERO = `(() => { const t = document.querySelector('.hero-track'); const L = t.getAnimations({ subtree: true }).filter((a) => a.timeline === document.timeline);
  const k = (a) => { const e = a.effect && a.effect.target; return (a.animationName || a.transitionProperty || 'waapi') + '@' + (e ? (e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className)).replace(/svelte-\\w+/g, '').trim().split(/\\s+/)[0] : '?') + (a.effect && a.effect.pseudoElement ? a.effect.pseudoElement : ''); };
  return { running: L.filter((a) => a.playState === 'running').length, paused: L.filter((a) => a.playState === 'paused').length, list: L.map((a) => [k(a), a.playState[0], Math.round(a.currentTime)]) }; })()`;
const CARD = `(() => { const c = document.querySelector('.start-selling-future-card'); const r = c.getBoundingClientRect(); return { top: +r.top.toFixed(2), docTop: Math.round(r.top + scrollY), y: Math.round(scrollY), vis: c.parentNode.classList.contains('is-visible') }; })()`;
const DIGITS = `(document.querySelector('.hero-track [role="timer"]') || {}).ariaLabel || document.querySelector('.hero-track [role="timer"]')?.getAttribute('aria-label')`;
const go = (p, y) => p.eval(`new Promise((r) => { window.scrollTo({ top: ${y}, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })`);
async function serve(dir, name) {
  const st = join(OUT, `serve-${name}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const srv = { A: await serve(DIRS.A, 'A'), A2: await serve(DIRS.A, 'A2'), H: await serve(DIRS.H, 'H') };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'hh'), headless: true, windowSize: `430,${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/people-gpu/gates/hh-chrome.mjs', vh: VH, browser: chrome.browser, dirs: DIRS, steps: [] };
const P = {};
const log = (k, v) => { res.steps.push({ k, ...v }); console.log(k.padEnd(22), JSON.stringify(v).slice(0, 400)); };
try {
  for (const a of ['A', 'A2', 'H']) {
    const p = P[a] = await cdp.newIsolatedPage();
    await p.send('Emulation.setDeviceMetricsOverride', { width: 430, height: VH, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await gotoAndSettle(p, srv[a].url, { quietMs: 1500, maxMs: 45000 });
    await p.eval(`(() => { window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); return 1; })()`);
    res[`served${a}`] = { js: sha(Buffer.from(await p.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await p.eval(`fetch('/${CSS}').then((r) => r.text())`))) }; console.log(`served ${a}`, JSON.stringify(res[`served${a}`]));
  }
  const both = async (fn) => ({ A: await fn(P.A, 'A'), A2: await fn(P.A2, 'A2'), H: await fn(P.H, 'H') });
  await sleep(2500);
  log('top', await both((p) => p.eval(HERO).then((h) => ({ running: h.running, paused: h.paused }))));
  // the reveal threshold and the card's top edge
  const yV = await P.A.eval(`new Promise((res) => { let y = 0; const s = document.querySelector('section.start-selling-future'); const f = () => { if (s.classList.contains('is-visible') || y > 4000) return res(y); y += 10; window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(f)); }; f(); })`);
  await go(P.H, yV); await sleep(1600);
  const c0 = await P.A.eval(CARD); res.yV = yV; res.card = c0;
  log('revealed, below top', await both((p) => p.eval(HERO).then((h) => ({ running: h.running, paused: h.paused }))));
  // 1 px steps across the card's top edge (card fully shown)
  for (let d = -3; d <= 3; d++) {
    const y = c0.docTop + d; await both((p) => go(p, y)); await sleep(150);
    log(`edge ${d >= 0 ? '+' : ''}${d}`, await both(async (p) => { const h = await p.eval(HERO); const c = await p.eval(CARD); return { cardTop: c.top, running: h.running, paused: h.paused }; }));
  }
  // covered, 5 s; pixels
  const yC = c0.docTop + 120; await both((p) => go(p, yC)); await sleep(1500);
  const shots = {};
  for (const a of ['A', 'A2', 'H']) { const { data } = await P[a].send('Page.captureScreenshot', { format: 'png' }); const f = join(OUT, `${a}-covered.png`); writeFileSync(f, Buffer.from(data, 'base64')); shots[a] = pngPixels(readFileSync(f)); }
  for (const [ka, kb] of [['A', 'A2'], ['A', 'H'], ['A2', 'H']]) { const x = shots[ka], y = shots[kb]; let max = 0, n = 0, n1 = 0; for (let i = 0; i < x.px.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(x.px[i] - y.px[i]); if (d > max) max = d; if (d > 1) n++; if (d === 1) n1++; } log(`covered pixels ${ka}~${kb}`, { w: x.w, h: x.h, maxLevel: max, channelsOver1: n, channelsAt1: n1 }); }
  const held = await P.H.eval(HERO); log('covered', await both((p) => p.eval(HERO).then((h) => ({ running: h.running, paused: h.paused }))));
  await sleep(5000);
  const held2 = await P.H.eval(HERO);
  const sameHeld = held.list.filter((x) => x[1] === 'p').every((x) => held2.list.some((y) => y[0] === x[0] && y[2] === x[2]));
  log('covered +5 s (H held)', { paused: held2.paused, running: held2.running, heldValuesUnchanged: sameHeld });
  // back to the top: no jump (each held animation continues from its held value), countdown equal to A's
  await both((p) => go(p, 0));
  const back = await P.H.eval(HERO);
  const jumps = held2.list.filter((x) => x[1] === 'p').map((x) => { const y = back.list.find((z) => z[0] === x[0]); return y ? [x[0], x[2], y[2], y[1]] : [x[0], x[2], null, 'gone']; });
  log('back at top (H)', { running: back.running, paused: back.paused, heldThenNow: jumps.slice(0, 12) });
  await sleep(350);
  for (let i = 0; i < 3; i++) { const d = await both((p) => p.eval(DIGITS)); log(`countdown ${i}`, { ...d, equal: d.A === d.H && d.A2 === d.H }); await sleep(1000); }
  // page end: hero off screen
  await both((p) => p.eval(`new Promise((r) => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); setTimeout(() => r(1), 2500); })`));
  log('page end', await both((p) => p.eval(HERO).then((h) => ({ running: h.running, paused: h.paused, list: h.list.filter((x) => x[1] === 'r').map((x) => x[0]) }))));
  await both((p) => go(p, 0)); await sleep(1500);
  log('top again', await both((p) => p.eval(HERO).then((h) => ({ running: h.running, paused: h.paused }))));
  log('errors', await both((p) => p.eval('window.__err')));
} finally {
  writeFileSync(join(OUT, 'hh.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); for (const s of Object.values(srv)) s.proc.kill();
  console.log('WROTE', OUT);
}
process.exit(0);

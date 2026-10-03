// carousel-leaver P-087 WebKit frozen crops (Simulator, `sim.mjs session --functional`). No timing.
// Per arm (as simclp.mjs): serve the snapshot with --no-cache, check the served hashes (VOID on mismatch), `sim.mjs open`,
// settle, centre the carousel at 0.5 vh (VOID if not in view). Then, as clp.mjs pixels mode: the rotator's setTimeout is
// wrapped so a held callback waits (installed after load: the rotator calls window.setTimeout at run time, JS ~L11575),
// a slide whose leaver has the target pathname is caught at its first rAF (the first arm names it, F-176), every
// carousel animation is paused and the 220 ms timer is held; for t in TS: currentTime = t, two rAFs, then
//   nat-<t>-<arm>.png   Page.snapshotRect of the carousel border box +- 4 CSS px (viewport coordinates, rounded out to
//                       whole CSS px). WebKit paints this in software through its RenderLayer z-order lists
//                       (snapshotFrameRect; research/architecture/safari-inspector-probing.md §0.3: no backdrop-filter).
//                       Settled: repeated 250 ms apart until two in a row are identical (see snap);
//   lens-<t>-<arm>.png  the same with the leaver forced opaque (inline opacity 0.999 !important), then removed;
// then the held timer is released (swap): nat-post-<arm>.png after two rAFs, nat-post300-<arm>.png 300 ms later (both
// settled the same way, so later than their names say: they compare across arms only).
// Each shot also records the leaver's rect width and computed opacity (the freeze worked) and a blank flag.
// At the end every arm pair is compared per t with png.mjs cmp (n8 / any / max) -> simcrop.json.
// node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-carousel-leaver -- \
//   node tools/sim.mjs session --functional --owner fix-carousel-leaver -- node fixes/carousel-leaver/probe/simcrop.mjs <out> base,S=<dir>,F=<dir>,base2,F2=<dir>
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
import { pngPixels, cmp } from './png.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const ARMS = process.argv[3].split(',').map((s) => { const [k, d] = s.split('='); return { k, dir: d || null }; });
const TS = [0, 17, 33, 50, 67, 83, 100, 133, 167, 200, 220];
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileOf = (arm, f) => (arm.dir && existsSync(join(arm.dir, f)) ? join(arm.dir, f) : join(BASE, f));
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch (e) { return ''; } }`;
const HOLD = `(() => { if (window.__holdInstalled) return 1; window.__holdInstalled = 1; const st = window.setTimeout.bind(window); window.__hold = false; window.__held = [];
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st(fn, ms, ...a);
    return st(() => { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); }; return 1; })()`;
const SLIDING = `((c) => !!(c && (c.querySelector('img.is-exit') || c.classList.contains('is-sliding'))))(${CAR})`;
const LEAD = `((c) => c && c.querySelector('img.is-exit, img.st5-lead'))(${CAR})`;
const CATCH = (target, timeout) => `(window.__cc = null, new Promise((res) => { const P = ${PATH}; const t0 = performance.now(); let was = ${SLIDING};
  const tick = () => { const on = ${SLIDING}; const lead = ${LEAD};
    if (on && !was && lead && (${JSON.stringify(target)} === null || P(lead) === ${JSON.stringify(target)})) {
      const c = ${CAR}; window.__hold = true; window.__lead = lead;
      window.__anims = [...c.querySelectorAll('img')].flatMap((i) => i.getAnimations()); window.__anims.forEach((a) => a.pause());
      return res({ ok: true, lead: P(lead), srcs: [...c.querySelectorAll('img')].map(P), cls: [...c.querySelectorAll('img')].map((i) => i.className), n: window.__anims.length, waited: Math.round(performance.now() - t0) }); }
    was = on; if (performance.now() - t0 > ${timeout}) return res({ ok: false }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }).then((r) => { window.__cc = JSON.stringify(r); }), 1)`;
const RAF2 = `(window.__r2 = 0, requestAnimationFrame(() => requestAnimationFrame(() => { window.__r2 = 1; })), 1)`;
const LSTATE = `JSON.stringify((() => { const l = window.__lead; if (!l || !l.isConnected) return null; const r = l.getBoundingClientRect(), cs = getComputedStyle(l); return { w: +r.width.toFixed(3), x: +r.left.toFixed(3), o: +cs.opacity, tr: cs.transform }; })())`;
const res = { tool: 'carousel-leaver simcrop (P-087)', note: 'Simulator: Page.snapshotRect crops (software paint); no timing', startedAt: new Date().toISOString(), ts: TS, arms: {} };
const save = () => writeFileSync(join(OUT, 'simcrop.json'), JSON.stringify(res, null, 1));
let TARGET = process.env.CL_TARGET || null;
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm.k}.json`); rmSync(st, { force: true });
  const ov = arm.dir ? ['--overlay', arm.dir] : [];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null;
  const R = (res.arms[arm.k] = { shots: {} });
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm.k} server did not start`);
    const url = `http://localhost:${s.port}/`;
    R.served = {};
    for (const f of [NODE, CSS]) {
      const got = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())), want = sha(readFileSync(fileOf(arm, f)));
      if (got !== want) throw new Error(`VOID: ${arm.k} serves ${f} ${got.slice(0, 12)}, expected ${want.slice(0, 12)}`);
      R.served[f.split('/').pop()] = got.slice(0, 12);
    }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    const poll = async (expr, ms) => { let v = null; for (let i = 0; i < ms / 50 && !v; i++) { v = await ev(expr); if (!v) await sleep(50); } return v; };
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    const geoJs = `JSON.stringify((() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - 0.5 * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { vh: innerHeight, vw: innerWidth, dpr: devicePixelRatio, y: scrollY, carTop: q.top, carLeft: q.left, carW: q.width, carH: q.height, inView: q.top >= 0 && q.bottom <= innerHeight }; })())`;
    R.geo = JSON.parse(await ev(geoJs)); await sleep(2500); R.geo2 = JSON.parse(await ev(geoJs));
    if (!R.geo2.inView) { R.void = 'VOID: carousel not in view'; console.log(`${arm.k} ${R.void} ${JSON.stringify(R.geo2)}`); continue; }
    const g = R.geo2; const rect = { x: Math.floor(g.carLeft - 4), y: Math.floor(g.carTop - 4) }; rect.width = Math.ceil(g.carLeft + g.carW + 4) - rect.x; rect.height = Math.ceil(g.carTop + g.carH + 4) - rect.y; R.rect = rect;
    await ev(HOLD);
    await ev(CATCH(TARGET, 30000));
    const cc = await poll('window.__cc', 35000);
    R.catch = cc ? JSON.parse(cc) : { ok: false, timeout: true };
    console.log(`${arm.k} served ${JSON.stringify(R.served)} y ${g.y} catch ${JSON.stringify(R.catch)}`);
    if (!R.catch.ok) { R.void = 'VOID: no slide caught'; continue; }
    if (TARGET === null) TARGET = R.catch.lead;
    // settled snapshot (smoke run, baseline only: WebKit's software snapshot was not repeatable right after a change, A/A
    // n8 up to 3435 px with whole faces resampled differently, and a lens shot with every face missing, i.e. images
    // drawn at low quality or not yet decoded; cause OBSERVED, not traced): take snapshots 250 ms apart until two in a
    // row are pixel-identical (at most 8); the settled one is saved. Never settled -> the arm is VOID.
    const snap1 = async () => { const r = await c.send('Page.snapshotRect', { ...rect, coordinateSystem: 'Viewport' }, 'page', 20000);
      return Buffer.from(String(r.dataURL).replace(/^data:image\/png;base64,/, ''), 'base64'); };
    const unsettled = [];
    const snap = async (name) => {
      let buf = await snap1(), P = pngPixels(buf), tries = 1, settled = false;
      while (tries < 8 && !settled) { await sleep(250); const b2 = await snap1(), P2 = pngPixels(b2); tries++;
        settled = P2.w === P.w && P2.h === P.h && P2.px.equals(P.px); buf = b2; P = P2; }
      const file = join(OUT, `${name}-${arm.k}.png`); writeFileSync(file, buf);
      let lo = 255, hi = 0; for (let i = 0; i < P.px.length; i += P.bpp) { lo = Math.min(lo, P.px[i]); hi = Math.max(hi, P.px[i]); }
      if (!settled) unsettled.push(name);
      return { w: P.w, h: P.h, blank: hi - lo < 16, tries, settled };
    };
    const raf2 = async () => { await ev(RAF2); await poll('window.__r2', 3000); };
    for (const t of TS) {
      const anims = await ev(`(() => { window.__anims.forEach((a) => { a.currentTime = ${t}; }); return window.__anims.map((a) => a.animationName + ':' + Math.round(a.currentTime)).join(','); })()`);
      await raf2();
      const nat = await snap(`nat-${t}`), lead = JSON.parse(await ev(LSTATE));
      await ev(`(window.__lead.style.setProperty('opacity', '0.999', 'important'), 1)`); await raf2();
      const lens = await snap(`lens-${t}`);
      await ev(`(window.__lead.style.removeProperty('opacity'), 1)`);
      R.shots[t] = { anims, lead, nat, lens };
    }
    // the swap; the hold is set again at once, so the rotator's next 800 ms wait is held too and post / post300 stay at
    // rest (the loop resumes in a microtask after this script, JS ~L11590)
    await ev(`(() => { window.__anims.forEach((a) => { a.currentTime = 220; }); window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); window.__hold = true; return h.length; })()`);
    await raf2(); R.shots.post = { nat: await snap('nat-post') };
    await sleep(300); R.shots.post300 = { nat: await snap('nat-post300') };
    const blanks = Object.values(R.shots).filter((x) => x.nat.blank || (x.lens && x.lens.blank)).length;
    if (blanks) R.void = `VOID: ${blanks} blank shot(s)`;
    if (unsettled.length) R.void = (R.void ? R.void + '; ' : 'VOID: ') + `snapshot never settled: ${unsettled.join(',')}`;
    console.log(`${arm.k} shots ${Object.keys(R.shots).length} tries ${Object.values(R.shots).map((x) => x.nat.tries + (x.lens ? '+' + x.lens.tries : '')).join(' ')} rect ${JSON.stringify(rect)} size ${R.shots[0].nat.w}x${R.shots[0].nat.h} blank ${blanks} lead@0 ${JSON.stringify(R.shots[0].lead)} lead@220 ${JSON.stringify(R.shots[220].lead)}`);
  } catch (e) {
    R.void = R.void || `VOID: ${String(e.message || e).slice(0, 200)}`; console.log(`${arm.k} ${R.void}`);
  } finally { try { c && c.close(); } catch {} p.kill(); save(); }
}
const keys = ARMS.map((a) => a.k).filter((k) => !res.arms[k].void); res.cmp = {};
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const P = `${keys[i]}~${keys[j]}`; const o = (res.cmp[P] = { nat: {}, lens: {} });
  for (const t of [...TS, 'post', 'post300']) {
    try { o.nat[t] = cmp(join(OUT, `nat-${t}-${keys[i]}.png`), join(OUT, `nat-${t}-${keys[j]}.png`)); } catch (e) { o.nat[t] = { error: String(e.message || e) }; }
    if (TS.includes(t)) try { o.lens[t] = cmp(join(OUT, `lens-${t}-${keys[i]}.png`), join(OUT, `lens-${t}-${keys[j]}.png`)); } catch (e) { o.lens[t] = { error: String(e.message || e) }; }
  }
  console.log(`${P} nat n8 ${[...TS, 'post', 'post300'].map((t) => o.nat[t]?.n8 ?? 'x').join('/')} | lens n8 ${TS.map((t) => o.lens[t]?.n8 ?? 'x').join('/')}`);
}
save(); console.log('EXIT-OK');

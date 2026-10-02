// fwreskip (a1h) verification on the Simulator (functional; Timeline ms are attribution only, never a gain).
// Runs inside `tools/sim.mjs session --functional` (FW_IPHONE_PORT = tab port, FW_SIM_UDID set).
// usage: MODE=T|G|J node vfix.mjs <outdir> <label>=<url>...
//   T: Timeline structure. Reload, settle, W-style steps (scrollBy 250 smooth / 300 ms) down to 3700, hold, up to 2500.
//      rAF log [t, dt, y, hero attr, #people attr] (attribute reads only). Lists Layout records >= 3 ms with y and
//      direction, and every render-attribute transition with y.
//   G: geometry + held screenshots + deck swipe. Steps down to 2990 / 3047 / 3539 (settle 1.5 s each: #people height,
//      its document top, next sibling's document top, scrollY, attrs; freeze; screenshot), then steps up to the profile
//      deck (same), then a one-shell deck swipe (count check: active shell index, .is-active-shell count, scrollLeft).
//   J: jumps, each on a fresh load: J1 3100 -> #people top, J2 3100 -> #platform top, J3 page end -> 0, J4 page end ->
//      #people top. rAF log after the jump with #people's rect, attr and contentvisibilityautostatechange events;
//      settle, freeze, screenshot.
// Freeze (identical in every arm): countdown digits, the #people avatar carousel and carets hidden; finite animations
// finished, infinite ones paused at 0. Screenshots: simctl io screenshot, plus one magenta calibration per arm.
import { openTab, sleep } from './simtab.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
const INV = readFileSync(new URL('./inv.js', import.meta.url), 'utf8');
const BOOT = readFileSync(new URL('./boot.js', import.meta.url), 'utf8');
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { runAsync } from '../../../tools/lib/wip.mjs';

const [outdir, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const MODE = process.env.MODE || 'T';
const UDID = process.env.FW_SIM_UDID;
if (MODE !== 'T' && !UDID) { console.error('needs FW_SIM_UDID (run inside tools/sim.mjs session)'); process.exit(1); }
const arms = targets.map((t) => { const i = t.indexOf('='); return { label: t.slice(0, i), url: t.slice(i + 1) }; });
const shot = (name) => { const f = join(outdir, `${name}.png`); execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', f], { stdio: 'ignore' }); return f; };

let c = null;
async function go(url) {
  const host = new URL(url).host;
  if (!c) c = await openTab((u) => u.startsWith('http'));
  await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 50); 'ok'`).catch(() => {});
  try { c.close(); } catch {}
  await sleep(2500);
  c = await openTab(host);
  for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
  await sleep(6000);
}
const ev = (code, ms = 90000) => runAsync(c, `(async () => { if (!window.__invOn) { ${INV} } ${LIB} ${code} })()`, { timeoutMs: ms, pollMs: 250 });
const LIB = `
const R = 'data-start-selling-render';
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hero = document.querySelector('.hero-track'), people = document.querySelector('#people');
const stepTo = async (y) => { for (let i = 0; i < 80 && Math.abs(scrollY - y) > 2; i++) { const d = y - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(250, Math.abs(d)), behavior: 'smooth' }); await wait(300); } window.scrollTo({ top: y, behavior: 'instant' }); await raf(); await raf(); };
const geo = () => { const r = people.getBoundingClientRect(); const nx = people.nextElementSibling; const nr = nx && nx.getBoundingClientRect();
  return { y: Math.round(scrollY), hero: hero.getAttribute(R), people: people.getAttribute(R), pH: +r.height.toFixed(2), pTop: +(r.top + scrollY).toFixed(2), next: nx ? (nx.id || nx.className.split(' ')[0]) : null, nTop: nr ? +(nr.top + scrollY).toFixed(2) : null, docH: document.documentElement.scrollHeight }; };
const freeze = async () => { if (!document.getElementById('__fwfz')) { const s = document.createElement('style'); s.id = '__fwfz';
    s.textContent = '.digit, #people .start-selling-avatars { visibility: hidden !important } * { caret-color: transparent !important }'; document.head.append(s); }
  for (const a of document.getAnimations()) { try { const it = a.effect && a.effect.getComputedTiming().iterations; if (it === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch (e) {} }
  await raf(); await raf(); await wait(300); await raf(); };
const cal = async (on) => { let m = document.getElementById('__fwcal'); if (on) { if (!m) { m = document.createElement('div'); m.id = '__fwcal'; document.body.append(m); } m.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ff00ff'; } else if (m) m.remove(); await raf(); await raf(); return [innerWidth, innerHeight, devicePixelRatio]; };
`;
const res = { mode: MODE, arms: {} };
const VIDEO = process.env.VIDEO !== '0';
const log = (s) => console.log(s);

if (MODE === 'T') {
  // TORDER="B P A A P B": repeat arms in that order, labels B1 P1 A1 A2 P2 B2 (one tl.json per run)
  const cnt = {};
  const tarms = process.env.TORDER ? process.env.TORDER.split(/\s+/).filter(Boolean).map((l) => ({ label: `${l}${(cnt[l] = (cnt[l] || 0) + 1)}`, url: arms.find((a) => a.label === l).url })) : arms;
  for (const arm of tarms) {
    await go(arm.url);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 5 }]]) { try { await c.send(m, p); } catch (e) { console.error(m, String(e.message || e)); } }
    const r = await ev(`
      const fr = []; let last = performance.now(), stop = false; const syncT = performance.now(); performance.mark('tl-sync'); const mo = []; const MO = new MutationObserver((ms) => { const t = Math.round(performance.now() * 10) / 10; for (const m of ms) { const e = m.target; mo.push([t, Math.round(scrollY), (e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]), m.attributeName.replace('data-start-selling-', ''), e.getAttribute(m.attributeName)]); } }); MO.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-start-selling-render', 'data-start-selling-scene', 'data-fw-wc'] });
      const loop = (t) => { fr.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), hero.getAttribute(R), people.getAttribute(R)]); last = t; if (!stop) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      await wait(2000); const m = { down: [performance.now()] };
      for (let i = 0; i < 60 && scrollY < ${+(process.env.TDOWN || 3700)}; i++) { window.scrollBy({ top: 250, behavior: 'smooth' }); await wait(300); }
      m.down.push(performance.now()); await wait(${+(process.env.THOLD ?? 1500)}); m.up = [performance.now()];
      for (let i = 0; i < 60 && scrollY > ${+(process.env.TUP || 2500)}; i++) { window.scrollBy({ top: -250, behavior: 'smooth' }); await wait(300); }
      m.up.push(performance.now()); await wait(1500);
      if (${+(process.env.TDOWN2 || 0)}) { m.down2 = [performance.now()]; for (let i = 0; i < 60 && scrollY < ${+(process.env.TDOWN2 || 0)}; i++) { window.scrollBy({ top: 250, behavior: 'smooth' }); await wait(300); } m.down2.push(performance.now()); await wait(1500); }
      stop = true;
      MO.disconnect(); return { syncT, m, fr, mo, geo: geo() };`);
    try { await c.send('Timeline.stop'); } catch (e) {}
    await sleep(6000);
    try { await c.send('Page.disable'); } catch (e) {}
    const flat = []; const walk = (x, d) => { flat.push({ type: x.type, s: x.startTime, e: x.endTime ?? x.startTime, d, data: x.data || {} }); for (const k of x.children || []) walk(k, d + 1); };
    for (const x of recs) walk(x, 0);
    const sync = flat.find((x) => x.type === 'TimeStamp' && JSON.stringify(x.data).includes('tl-sync'));
    const off = sync ? sync.s * 1000 - r.syncT : null;
    const at = (t) => { let f = r.fr[0]; for (const x of r.fr) { if (x[0] > t) break; f = x; } return f; };
    const dir = (t) => (t >= r.m.down[0] && t <= r.m.down[1] ? 'down' : t >= r.m.up[0] && t <= r.m.up[1] ? 'up' : r.m.down2 && t >= r.m.down2[0] && t <= r.m.down2[1] ? 'down2' : 'hold');
    const layouts = off === null ? [] : flat.filter((x) => x.type === 'Layout' && (x.e - x.s) * 1000 >= 3).map((x) => { const t = x.s * 1000 - off; const f = at(t); return { ms: +((x.e - x.s) * 1000).toFixed(1), y: f[2], dir: dir(t), d: x.d }; }).filter((x) => x.y >= 2400);
    const trans = []; for (let i = 1; i < r.fr.length; i++) { const a = r.fr[i - 1], b = r.fr[i]; if (a[3] !== b[3]) trans.push(`hero ${a[3]}->${b[3]}@${b[2]}/${dir(b[0])}`); if (a[4] !== b[4]) trans.push(`people ${a[4]}->${b[4]}@${b[2]}/${dir(b[0])}`); }
    res.arms[arm.label] = { layouts, trans, geo: r.geo, sync: !!sync, recs: recs.length, frames: r.fr.length };
    writeFileSync(join(outdir, `T-${arm.label}.tl.json`), JSON.stringify({ off, m: r.m, fr: r.fr, mo: r.mo, recs }));
    log(`T ${arm.label}: sync ${!!sync} recs ${recs.length} | transitions: ${trans.join(', ')}`);
    log(`  Layout>=3ms (y>=2400): ${layouts.map((x) => `${x.ms}@${x.y}${x.dir === 'down2' ? 'D' : x.dir[0]}${x.d ? '/d' + x.d : ''}`).join(' ')}`);
    log(`  render flips (MO): ${r.mo.filter((x) => x[3] === 'render' && (x[2] === '#people' || x[2] === '.hero-track')).map((x) => `${x[2]}=${x[4]}@${x[1]}/${dir(x[0])}`).join(', ')}`);
    c.close(); c = null;
  }
}

if (MODE === 'G') {
  for (const arm of arms) {
    await go(arm.url);
    const a = (res.arms[arm.label] = { stops: [] });
    await ev(`await cal(true); return 1;`); shot(`G-${arm.label}-cal`); await ev(`await cal(false); return 1;`);
    for (const y of [2990, 3047, 3539]) {
      const g = await ev(`await stepTo(${y}); await wait(1500); return geo();`);
      a.stops.push(g); log(`G ${arm.label} ${JSON.stringify(g)}`);
    }
    // up to the profile deck: deck top 120 px below the viewport top
    const g = await ev(`const d = document.querySelector('.start-selling-profile-deck'); const ty = Math.round(d.getBoundingClientRect().top + scrollY - 120); await stepTo(ty); await wait(2000); return { ...geo(), deck: true };`);
    a.stops.push(g); log(`G ${arm.label} ${JSON.stringify(g)}`);
    // held screenshots: re-walk each stop on a frozen page (same in every arm)
    await go(arm.url);
    for (const y of [2990, 3047]) { await ev(`await stepTo(${y}); await wait(1500); await freeze(); return 1;`); shot(`G-${arm.label}-y${y}`); }
    const dk = await ev(`const d = document.querySelector('.start-selling-profile-deck'); const ty = Math.round(d.getBoundingClientRect().top + scrollY - 120); await stepTo(3700); await wait(800); await stepTo(ty); await wait(2000); await freeze(); return geo();`);
    shot(`G-${arm.label}-deck`);
    // deck swipe (count check)
    const sw = await ev(`const d = document.querySelector('.start-selling-profile-deck'); const sh = [...d.querySelectorAll('.start-selling-profile-shell')];
      const idx = () => sh.findIndex((s) => s.classList.contains('is-active-shell'));
      const b = { idx: idx(), n: d.querySelectorAll('.is-active-shell').length, sl: Math.round(d.scrollLeft), panels: d.querySelectorAll('.start-selling-profile-panel').length };
      d.scrollBy({ left: sh[0].getBoundingClientRect().width, behavior: 'smooth' }); await wait(2500);
      return { before: b, after: { idx: idx(), n: d.querySelectorAll('.is-active-shell').length, sl: Math.round(d.scrollLeft), panels: d.querySelectorAll('.start-selling-profile-panel').length }, people: people.getAttribute(R) };`);
    a.deckGeo = dk; a.swipe = sw;
    log(`G ${arm.label} deck-held ${JSON.stringify(dk)} | swipe ${JSON.stringify(sw)}`);
    c.close(); c = null;
  }
}

if (MODE === 'C') {
  // capture calibration: a one-rAF full-viewport magenta flash inside a Simulator screen recording (CAL times).
  const { spawn } = await import('node:child_process');
  await go(arms[0].url);
  res.cal = [];
  for (let k = 0; k < +(process.env.CAL || 3); k++) {
    const vid = join(outdir, `CAL-${k + 1}.mov`);
    const rec = spawn('xcrun', ['simctl', 'io', UDID, 'recordVideo', '--codec=h264', '--force', vid], { stdio: 'ignore' });
    await sleep(2000);
    const r = await ev(`const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ff00ff;display:none'; document.body.append(m);
      const ts = []; await raf(); await new Promise((ok) => requestAnimationFrame((t) => { ts.push(t); m.style.display = 'block'; requestAnimationFrame((t2) => { ts.push(t2); m.style.display = 'none'; requestAnimationFrame((t3) => { ts.push(t3); ok(); }); }); }));
      await wait(800); m.remove(); return ts.map((x) => Math.round(x * 10) / 10);`);
    await sleep(500);
    rec.kill('SIGINT');
    await new Promise((ok) => { rec.on('exit', ok); setTimeout(ok, 8000); });
    res.cal.push({ vid, rafs: r });
    log(`CAL ${k + 1}: rAF stamps ${JSON.stringify(r)} -> ${vid}`);
  }
  c.close(); c = null;
}

if (MODE === 'J') {
  // Jumps J1 from each start in JSTARTS to #people's top, REPS per load (back down by W steps between them), with a
  // Simulator screen recording around each jump (VIDEO=0: none) and the per-rAF invariant log (inv.js). Animations
  // frozen by a style in every arm, so after the jump the screen changes only by what renders.
  const { spawn } = await import('node:child_process');
  const FZALL = `*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important } .digit { visibility: hidden !important }`;
  const REPS = +(process.env.REPS || 1);
  for (const arm of arms) {
    const a = (res.arms[arm.label] = {});
    for (const js of (process.env.JSTARTS || '3100').split(',')) {
      await go(arm.url);
      if (!res.cvSelf) { res.cvSelf = await ev(`return await __cvSelfTest();`); log(`cvSelfTest ${JSON.stringify(res.cvSelf)}`); }
      await ev(`const s = document.createElement('style'); s.textContent = ${JSON.stringify(FZALL)}; document.head.append(s); return 1;`);
      for (let k = 0; k < REPS; k++) {
        const tag = `J1s${js}r${k + 1}`;
        const g0 = await ev(`await stepTo(${js}); await wait(1500); __invOn(); await wait(300); return { ...geo(), pcv: people.checkVisibility({ contentVisibilityAuto: true }) };`);
        const vid = join(outdir, `J-${arm.label}-${tag}.mov`);
        const rec = VIDEO ? spawn('xcrun', ['simctl', 'io', UDID, 'recordVideo', '--codec=h264', '--force', vid], { stdio: 'ignore' }) : null;
        if (rec) await sleep(2000);
        const r = await ev(`const ty = Math.round(people.getBoundingClientRect().top + scrollY); const tj = performance.now(); window.scrollTo({ top: ty, behavior: 'instant' }); await wait(1500); return { tj, ty, g1: geo(), inv: __invOff() };`);
        if (rec) { await sleep(500); rec.kill('SIGINT'); await new Promise((ok) => { rec.on('exit', ok); setTimeout(ok, 8000); }); }
        const after = r.inv.fr.filter((x) => x[0] >= r.tj - 20).slice(0, 4);
        const sc = r.inv.sc.filter((x) => x[0] >= r.tj).slice(0, 2);
        a[tag] = { g0, ty: r.ty, g1: r.g1, tj: r.tj, sc, firstRows: after, fails: r.inv.fails, hfails: r.inv.hfails.length, sync: r.inv.sync, wr: r.inv.wr, vid: rec ? vid : null };
        log(`J ${arm.label} ${tag}: y${g0.y} (${g0.hero[0]}/${g0.people[0]} pcv ${g0.pcv}) -> ${r.ty} | tj ${r.tj.toFixed(1)} scroll ${JSON.stringify(sc)} | sync ${JSON.stringify(r.inv.sync)} | rows ${JSON.stringify(after)} | FAIL ${r.inv.fails.length} heroPH ${r.inv.hfails.length} | end ${r.g1.hero[0]}/${r.g1.people[0]}`);
      }
    }
    c.close(); c = null;
  }
}

if (MODE === 'X') {
  // invariant scenarios on the Simulator (fresh load each): up = W steps 3100 -> 2500; smooth = one smooth scrollBy
  // -1600 from 3100 (programmatic stand-in for a fling: no touch); J3 = end -> 0; J4 = end -> #people top.
  for (const arm of arms) {
    const a = (res.arms[arm.label] = {});
    for (const sc of (process.env.SCEN || 'up,smooth,J3,J4').split(',')) {
      await go(arm.url);
      const start = sc === 'up' || sc === 'smooth' ? 3100 : null;
      const g0 = await ev(`${start === null ? `window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await wait(3000);` : `await stepTo(${start}); await wait(1500);`} __invOn(); await wait(300); return geo();`);
      const act = sc === 'up' ? `await stepTo(2500); await wait(1500);` : sc === 'smooth' ? `window.scrollBy({ top: -1600, behavior: 'smooth' }); await wait(2500);` : `window.scrollTo({ top: ${sc === 'J3' ? '0' : 'Math.round(people.getBoundingClientRect().top + scrollY)'}, behavior: 'instant' }); await wait(1500);`;
      const r = await ev(`${act} return { g1: geo(), inv: __invOff() };`);
      const ys = r.inv.fr.map((x) => x[2]);
      a[sc] = { g0, g1: r.g1, frames: r.inv.frames, fails: r.inv.fails, hfails: r.inv.hfails.length, sync: r.inv.sync, wr: r.inv.wr, yMin: Math.min(...ys), yMax: Math.max(...ys) };
      log(`X ${arm.label} ${sc}: y${g0.y} (${g0.hero[0]}/${g0.people[0]}) -> y${r.g1.y} (${r.g1.hero[0]}/${r.g1.people[0]}) | frames ${r.inv.frames} y[${Math.min(...ys)},${Math.max(...ys)}] | FAIL ${r.inv.fails.length} ${JSON.stringify(r.inv.fails.slice(0, 3))} | heroPH ${r.inv.hfails.length} | sync ${r.inv.sync.length} | writes ${JSON.stringify(r.inv.wr)}`);
      c.close(); c = null;
    }
  }
}

if (MODE === 'I') {
  // idle counts/s, IWIN windows of IDLE_MS each per spot: y0, parked 3100 (W steps from 0), parked 2850 after a reversal
  // from 3100, and the pin. Timeline record types per second between the window's fwI0/fwI1 marks + MutationObserver
  // counts. IORDER="B P A A P B" repeats arms (labels B1 P1 A1 A2 P2 B2). The WebKit bootstrap script does not survive
  // a reload (v12, boot false), so no bootstrap/reload here.
  const cnt = {};
  const iarms = process.env.IORDER ? process.env.IORDER.split(/\s+/).filter(Boolean).map((l) => ({ label: `${l}${(cnt[l] = (cnt[l] || 0) + 1)}`, url: arms.find((a) => a.label === l).url })) : arms;
  const IWIN = +(process.env.IWIN || 1), MS = +(process.env.IDLE_MS || 10000);
  for (const arm of iarms) {
    const a = (res.arms[arm.label] = { spots: [] });
    await go(arm.url);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 1 }]]) { try { await c.send(m, p); } catch (e) { console.error(m, String(e.message || e)); } }
    for (const [name, gocode] of [['y0', `await wait(500);`], ['band', `await stepTo(3100);`], ['reversal', `await stepTo(2850);`], ['pin', `await stepTo(document.documentElement.scrollHeight - innerHeight);`]]) {
      await ev(`${gocode} await wait(1500); return 1;`);
      for (let w = 0; w < IWIN; w++) {
        const n0 = recs.length;
        const s = await ev(`return { name: ${JSON.stringify(name)}, w: ${w}, ...(await __idle(${MS})) };`);
        await sleep(800);
        const flat = []; const walk = (x) => { flat.push(x); for (const k of x.children || []) walk(k); };
        for (const x of recs.slice(n0)) walk(x);
        const mk = (id) => flat.find((x) => x.type === 'TimeStamp' && JSON.stringify(x.data || {}).includes(id));
        const m0 = mk('fwI0'), m1 = mk('fwI1');
        if (m0 && m1) {
          const k2 = {}; for (const x of flat) if (x.startTime >= m0.startTime && x.startTime <= m1.startTime && x.type !== 'TimeStamp') { const k = x.type + (x.type === 'ObserverCallback' && x.data && x.data.type ? ':' + x.data.type : ''); k2[k] = (k2[k] || 0) + 1; }
          s.tl = Object.fromEntries(Object.entries(k2).sort((p, q) => q[1] - p[1]).map(([k, v]) => [k, +(v / s.s).toFixed(1)]));
        } else s.tl = 'marks not found';
        a.spots.push(s);
        log(`I ${arm.label} ${name} w${w} y${s.y} ${s.attrs} | mut ${JSON.stringify(s.mut)} | tl ${JSON.stringify(s.tl)}`);
      }
    }
    try { await c.send('Timeline.stop'); } catch (e) {}
    try { await c.send('Page.disable'); } catch (e) {}
    c.close(); c = null;
  }
}

if (MODE === 'N') {
  // state census at the idle spots (P2 idle check follow-up): running animations per section, data-fw-wc=1 count,
  // #people's inline style and computed content-visibility, at band 3100 and reversal 2850 (as MODE I reaches them).
  const cnt = {};
  const narms = process.env.NORDER ? process.env.NORDER.split(/\s+/).filter(Boolean).map((l) => ({ label: `${l}${(cnt[l] = (cnt[l] || 0) + 1)}`, url: arms.find((a) => a.label === l).url })) : arms;
  const CENSUS = `const sec = (el) => { const s = el && el.closest && el.closest('section, [id], .hero-track'); return s ? (s.id ? '#' + s.id : '.' + String(s.className).split(' ')[0]) : '?'; };
    const run = {}; for (const an of document.getAnimations()) { if (an.playState !== 'running') continue; const t = an.effect && an.effect.target; const k = sec(t) + ' ' + (an.animationName || an.transitionProperty || an.constructor.name); run[k] = (run[k] || 0) + 1; }
    const wc = {}; for (const el of document.querySelectorAll('[data-fw-wc="1"]')) { const k = sec(el.parentElement); wc[k] = (wc[k] || 0) + 1; }
    return { y: Math.round(scrollY), people: people.getAttribute(R), scene: people.getAttribute('data-start-selling-scene'), pStyle: people.getAttribute('style'), pCV: getComputedStyle(people).contentVisibility, running: run, nRunning: Object.values(run).reduce((a, b) => a + b, 0), wc };`;
  for (const arm of narms) {
    await go(arm.url);
    const a = (res.arms[arm.label] = {});
    for (const [name, gocode] of [['band', `await stepTo(3100);`], ['reversal', `await stepTo(2850);`]]) {
      a[name] = await ev(`${gocode} await wait(1500); ${CENSUS}`);
      log(`N ${arm.label} ${name} ${JSON.stringify(a[name])}`);
    }
    c.close(); c = null;
  }
}

writeFileSync(join(outdir, `${MODE}.json`), JSON.stringify(res, null, 1));
// park on about:blank (I-050)
try { c = await openTab((u) => u.startsWith('http'), 2); await c.evaluate(`setTimeout(() => { location.href = 'about:blank'; }, 50); 'ok'`); await sleep(800); c.close(); } catch {}
process.exit(0);

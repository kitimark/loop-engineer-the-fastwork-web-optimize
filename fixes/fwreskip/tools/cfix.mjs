// fwreskip (a1h) verification in headless Chrome (functional, shared lane, no timing): 430x932 DPR 3, touch.
// MODE=G per arm: walk down stepwise (scrollBy 250 smooth / 300 ms) to 3800 with a per-rAF log of hero / #people
// render attributes (transitions with y), geometry at 2990 / 3047 / 3539 / 3800; walk up to the profile deck (same),
// deck swipe (count check). Reload, held screenshots (freeze, capture, resume) at 2990 3047 3300 3539 3800 and at the
// deck after walking back up. MODE=J per arm: jumps J1 3100 -> #people, J2 3100 -> #platform, J3 end -> 0,
// J4 end -> #people, each on a fresh load: per-rAF log, cv events, settle, freeze, screenshot.
// usage: MODE=G|J node cfix.mjs <outdir> <label>=<url>...
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [outdir, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const MODE = process.env.MODE || 'G';
const INV = readFileSync(new URL('./inv.js', import.meta.url), 'utf8');
const BOOT = readFileSync(new URL('./boot.js', import.meta.url), 'utf8');
const LIB = `
const R = 'data-start-selling-render';
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hero = document.querySelector('.hero-track'), people = document.querySelector('#people');
const stepTo = async (y) => { for (let i = 0; i < 80 && Math.abs(scrollY - y) > 2; i++) { const d = y - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(250, Math.abs(d)), behavior: 'smooth' }); await wait(300); } window.scrollTo({ top: y, behavior: 'instant' }); await raf(); await raf(); };
const geo = () => { const r = people.getBoundingClientRect(); const nx = people.nextElementSibling; const nr = nx && nx.getBoundingClientRect();
  return { y: Math.round(scrollY), hero: hero.getAttribute(R), people: people.getAttribute(R), pH: +r.height.toFixed(2), pTop: +(r.top + scrollY).toFixed(2), next: nx ? (nx.id || nx.className.split(' ')[0]) : null, nTop: nr ? +(nr.top + scrollY).toFixed(2) : null, docH: document.documentElement.scrollHeight }; };
const deckY = () => { const d = document.querySelector('.start-selling-profile-deck'); return Math.round(d.getBoundingClientRect().top + scrollY - 120); };
window.__fwT = window.__fwT || []; window.__fwLog = window.__fwLog || null;
const logOn = () => { if (window.__fwLog) return; let ph = hero.getAttribute(R), pp = people.getAttribute(R); window.__fwLog = true;
  const loop = () => { const h = hero.getAttribute(R), p = people.getAttribute(R); if (h !== ph) window.__fwT.push('hero ' + ph + '>' + h + '@' + Math.round(scrollY)); if (p !== pp) window.__fwT.push('people ' + pp + '>' + p + '@' + Math.round(scrollY)); ph = h; pp = p; if (window.__fwLog) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
const FZ = '.digit, #people .start-selling-avatars { visibility: hidden !important } * { caret-color: transparent !important }';
const freeze = async () => { let s = document.getElementById('__fwfz'); if (!s) { s = document.createElement('style'); s.id = '__fwfz'; s.textContent = FZ; document.head.append(s); }
  window.__fwRun = []; for (const a of document.getAnimations()) { try { if (a.playState === 'running') window.__fwRun.push(a); a.pause(); const ct = a.effect.getComputedTiming(); const delay = a.effect.getTiming().delay || 0; a.currentTime = isFinite(ct.activeDuration) ? delay + ct.activeDuration : 0; } catch (e) {} }
  await Promise.all([...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((i) => Promise.race([i.decode().catch(() => {}), wait(1500)])));
  await raf(); await raf(); return scrollY; };
const resume = async () => { for (const a of window.__fwRun || []) try { a.play(); } catch (e) {} window.__fwRun = []; await raf(); return 1; };
`;
const ev = (page, code) => page.eval(`(async () => { if (!window.__invOn) { ${INV} } ${LIB} ${code} })()`);
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'fwreskip-cfix');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { mode: MODE, arms: {} };
async function open(url, boot = false) {
  const page = await cdp.newIsolatedPage();
  if (boot) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  return page;
}
const shot = async (page, name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); const f = join(outdir, `${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f; };
try {
  for (const t of targets) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const a = (res.arms[label] = {});
    if (MODE === 'G') {
      let page = await open(url);
      a.stops = [];
      await ev(page, `logOn(); return 1;`);
      for (const y of [2990, 3047, 3539, 3800]) a.stops.push(await ev(page, `await stepTo(${y}); await wait(1000); return geo();`));
      a.downT = await ev(page, `const t = window.__fwT.slice(); window.__fwT.length = 0; return t;`);
      a.stops.push({ ...(await ev(page, `await stepTo(deckY()); await wait(1500); return geo();`)), deck: true });
      a.upT = await ev(page, `window.__fwLog = false; return window.__fwT.slice();`);
      a.swipe = await ev(page, `const d = document.querySelector('.start-selling-profile-deck'); const sh = [...d.querySelectorAll('.start-selling-profile-shell')];
        const idx = () => sh.findIndex((s) => s.classList.contains('is-active-shell'));
        const b = { idx: idx(), n: d.querySelectorAll('.is-active-shell').length, sl: Math.round(d.scrollLeft), shells: sh.length };
        d.scrollBy({ left: sh[0].getBoundingClientRect().width, behavior: 'smooth' }); await wait(2000);
        return { before: b, after: { idx: idx(), n: d.querySelectorAll('.is-active-shell').length, sl: Math.round(d.scrollLeft) }, people: people.getAttribute(R) };`);
      console.log(`G ${label} down ${a.downT.join(', ')} | up ${a.upT.join(', ')}`);
      for (const s of a.stops) console.log(`  ${JSON.stringify(s)}`);
      console.log(`  swipe ${JSON.stringify(a.swipe)}`);
      await page.close();
      page = await open(url);
      a.shots = [];
      for (const y of [2990, 3047, 3300, 3539, 3800]) { const g = await ev(page, `await stepTo(${y}); await wait(800); await freeze(); return geo();`); a.shots.push({ y, g, f: await shot(page, `G-${label}-y${y}`) }); await ev(page, `return await resume();`); }
      const g = await ev(page, `await stepTo(deckY()); await wait(1500); await freeze(); return geo();`);
      a.shots.push({ y: 'deck', g, f: await shot(page, `G-${label}-deck`) });
      console.log(`G ${label} shots ${a.shots.map((s) => s.y + ':' + s.g.y + '/' + s.g.hero[0] + s.g.people[0]).join(' ')}`);
      await page.close();
    }
    if (MODE === 'V') {
      // first painted frames after a jump (screencast, every frame acked), animations frozen by a style in every arm.
      // One load per start; REPS jumps per load (back down to the start by W steps between them). Invariant log on.
      const FZALL = `*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important } .digit { visibility: hidden !important }`;
      const REPS = +(process.env.REPS || 1);
      for (const js of (process.env.JSTARTS || process.env.JSTART || '3100').split(',')) {
        const page = await open(url);
        await ev(page, `const s = document.createElement('style'); s.textContent = ${JSON.stringify(FZALL)}; document.head.append(s); return 1;`);
        for (let k = 0; k < REPS; k++) {
          const tag = `J1s${js}r${k + 1}`;
          const g0 = await ev(page, `await stepTo(${js}); await wait(1500); __invOn(); await wait(300); return { ...geo(), pcv: people.checkVisibility({ contentVisibilityAuto: true }) };`);
          const frames = []; let on = true;
          const off = cdp.on((m) => { if (m.method === 'Page.screencastFrame') { page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); if (on) frames.push(m.params); } });
          await page.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
          await sleep(1200); const pre = frames.length;
          const r = await ev(page, `const ty = Math.round(people.getBoundingClientRect().top + scrollY); const tj = performance.now(); window.scrollTo({ top: ty, behavior: 'instant' }); await wait(1500); const inv = __invOff(); return { tj, ty, g1: geo(), inv };`);
          await sleep(300); on = false;
          await page.send('Page.stopScreencast'); off();
          const post = frames.slice(pre);
          const o = r.inv.origin;
          const fst = post.slice(0, 4).map((f) => Math.round((f.metadata.timestamp * 1000 - o) * 10) / 10);
          post.slice(0, 4).forEach((f, i) => writeFileSync(join(outdir, `V-${label}-${tag}-f${i + 1}.png`), Buffer.from(f.data, 'base64')));
          await shot(page, `V-${label}-${tag}-final`);
          const after = r.inv.fr.filter((x) => x[0] >= r.tj - 20).slice(0, 4);
          const sc = r.inv.sc.filter((x) => x[0] >= r.tj).slice(0, 2);
          a[tag] = { g0, ty: r.ty, g1: r.g1, tj: r.tj, preFrames: pre, postFrames: post.length, frameStamps: fst, sc, firstRows: after, fails: r.inv.fails, hfails: r.inv.hfails.length, sync: r.inv.sync, wr: r.inv.wr };
          console.log(`V ${label} ${tag}: y${g0.y} (${g0.hero[0]}/${g0.people[0]} pcv ${g0.pcv}) -> ${r.ty} | tj ${r.tj.toFixed(1)} scroll ${JSON.stringify(sc)} | sync ${JSON.stringify(r.inv.sync)} | rows ${JSON.stringify(after)} | paint ${JSON.stringify(fst)} | FAIL ${r.inv.fails.length} heroPH ${r.inv.hfails.length} | end ${r.g1.hero[0]}/${r.g1.people[0]}`);
        }
        await page.close();
      }
    }
    if (MODE === 'X') {
      // invariant scenarios (fresh load each): up = W steps from XB (band) up to XU; fling = touch scroll gesture up from XB
      // (synthesizeScrollGesture, fling allowed); J3 = end -> 0; J4 = end -> #people top; J1n = 3100 -> #people top.
      const XB = +(process.env.XB || 3771), XU = +(process.env.XU || 3200);
      for (const sc of (process.env.SCEN || 'up,fling,J3,J4,J1n').split(',')) {
        const page = await open(url);
        // J4w = J4 with the end reached by W steps (so /10c's far re-skips fire; an instant jump can lose them, F-119);
        // reload = W steps to XB, reload while scrolled (scroll restored), then W steps up to XU.
        const start = sc === 'up' || sc === 'fling' || sc === 'reload' ? XB : sc === 'J1n' ? 3100 : sc === 'J4w' ? 'end' : null;
        let pre = '';
        if (sc === 'reload') {
          await ev(page, `await stepTo(${XB}); await wait(1500); return 1;`);
          await page.send('Page.reload', {}); await sleep(6000);
          pre = `await wait(1500);`;
        }
        const g0 = await ev(page, `${sc === 'reload' ? pre : start === null ? `window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await wait(3000);` : start === 'end' ? `await stepTo(document.documentElement.scrollHeight - innerHeight); await wait(1500);` : `await stepTo(${start}); await wait(1500);`} __invOn(); await wait(300); return geo();`);
        let r;
        if (sc === 'up' || sc === 'reload') r = await ev(page, `await stepTo(${XU}); await wait(1500); return { g1: geo(), inv: __invOff() };`);
        else if (sc === 'fling') {
          try { await page.send('Input.synthesizeScrollGesture', { x: 215, y: 300, yDistance: 1600, speed: 4000, gestureSourceType: 'touch', preventFling: false }); } catch (e) { console.log(`fling error ${e.message}`); }
          r = await ev(page, `await wait(2500); return { g1: geo(), inv: __invOff() };`);
        } else {
          const target = sc === 'J3' ? `0` : `Math.round(people.getBoundingClientRect().top + scrollY)`;
          r = await ev(page, `window.scrollTo({ top: ${target}, behavior: 'instant' }); await wait(1500); return { g1: geo(), inv: __invOff() };`);
        }
        const ys = r.inv.fr.map((x) => x[2]);
        a[sc] = { g0, g1: r.g1, frames: r.inv.frames, fails: r.inv.fails, hfails: r.inv.hfails.length, sync: r.inv.sync, wr: r.inv.wr, yMin: Math.min(...ys), yMax: Math.max(...ys), pcvSelf: r.inv.fr.filter((x) => x[4] && x[9] === 0).length };
        console.log(`X ${label} ${sc}: y${g0.y} (${g0.hero[0]}/${g0.people[0]}) -> y${r.g1.y} (${r.g1.hero[0]}/${r.g1.people[0]}) | frames ${r.inv.frames} y[${Math.min(...ys)},${Math.max(...ys)}] | FAIL ${r.inv.fails.length} ${JSON.stringify(r.inv.fails.slice(0, 3))} | heroPH ${r.inv.hfails.length} | sync ${r.inv.sync.length} | writes ${JSON.stringify(r.inv.wr)}`);
        await page.close();
      }
    }
    if (MODE === 'I') {
      // idle triple+: counts/s over IDLE_MS at y0, parked in the band (IB, from below by W steps), parked at IR after a
      // reversal from IB, and at the pin (page end). Bootstrap counters installed before page scripts.
      const IB = +(process.env.IB || 3771), IR = +(process.env.IR || 3500), MS = +(process.env.IDLE_MS || 10000);
      const page = await open(url, true);
      a.boot = await ev(page, `return !!window.__fwCB;`);
      a.spots = [];
      for (const [name, go] of [['y0', `await wait(500);`], ['band', `await stepTo(${IB});`], ['reversal', `await stepTo(${IR});`], ['pin', `await stepTo(document.documentElement.scrollHeight - innerHeight);`]]) {
        const s = await ev(page, `${go} await wait(2000); return { name: ${JSON.stringify(name)}, ...(await __idle(${MS})) };`);
        a.spots.push(s);
        console.log(`I ${label} ${name} y${s.y} ${s.attrs} | ${JSON.stringify(s.per)} | mut ${JSON.stringify(s.mut)}`);
      }
      await page.close();
    }
    if (MODE === 'J') {
      for (const j of ['J1', 'J2', 'J3', 'J4']) {
        const page = await open(url);
        const start = j === 'J1' || j === 'J2' ? `await stepTo(3100); await wait(1000);` : `window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await wait(3000);`;
        const target = j === 'J1' || j === 'J4' ? `Math.round(people.getBoundingClientRect().top + scrollY)` : j === 'J2' ? `Math.round(document.querySelector('#platform').getBoundingClientRect().top + scrollY)` : `0`;
        const r = await ev(page, `${start}
          let n = 0; const evs = []; for (const el of [hero, people]) el.addEventListener('contentvisibilityautostatechange', (e) => { const r = el.getBoundingClientRect(); evs.push([el === hero ? 'hero' : 'people', e.skipped, n, r.bottom > 0 && r.top < innerHeight ? 1 : 0]); });
          const g0 = geo(); const ty = ${target}; const fr = []; let stop = false;
          const loop = (t) => { const r = people.getBoundingClientRect(), hr = hero.getBoundingClientRect(); fr.push([n++, Math.round(scrollY), people.getAttribute(R), r.bottom > 0 && r.top < innerHeight ? 1 : 0, hero.getAttribute(R), hr.bottom > 0 && hr.top < innerHeight ? 1 : 0]); if (!stop) requestAnimationFrame(loop); };
          window.scrollTo({ top: ty, behavior: 'instant' }); requestAnimationFrame(loop);
          await wait(1500); stop = true;
          const bad = fr.filter((f) => f[3] && f[2] === 'deferred'), hbad = fr.filter((f) => f[5] && f[4] === 'deferred');
          return { g0, ty, g1: geo(), first: fr.slice(0, 4), visDeferred: bad.length, heroVisDeferred: hbad.length, evs };`);
        await ev(page, `await freeze(); return 1;`);
        r.f = await shot(page, `J-${label}-${j}`);
        a[j] = r;
        console.log(`J ${label} ${j}: y${r.g0.y} (${r.g0.hero}/${r.g0.people}) -> ${r.ty}: people vis+deferred ${r.visDeferred}, hero ${r.heroVisDeferred} | first ${JSON.stringify(r.first.slice(0, 3))} | cv ${JSON.stringify(r.evs)} | end ${r.g1.hero}/${r.g1.people} y${r.g1.y}`);
        await page.close();
      }
    }
  }
} finally {
  writeFileSync(join(outdir, `${MODE}.json`), JSON.stringify(res, null, 1));
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

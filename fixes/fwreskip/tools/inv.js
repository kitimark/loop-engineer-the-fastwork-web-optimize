// fwreskip probe library (engine-neutral page JS; evaluated inside the page after load).
// __invOn(): per-rAF invariant log for #people and the hero:
//   row [ts, kind, y, peopleAttr, peopleInView, peopleKidVisible(cvAuto), heroAttr, heroInView, heroKidVisible(cvAuto), peopleSelfVisible]
//   FAIL = in view and its child's checkVisibility({contentVisibilityAuto:true}) false (rendered as a placeholder).
//   Reads happen after the page's iE in every frame that has a scroll event (a rAF registered from a scroll listener
//   added after the page's), else at the start of the frame (a chained rAF). Probe-forced layout is accepted (no timing).
// Render-attribute writes on #people / the hero are tagged by stack: iE (the /10f sync path), far (fwReskip), sE, ?.
// __invOff() returns the log. __cvSelfTest() checks that checkVisibility honours contentVisibilityAuto in this engine.
// boot.js: bootstrap installed before page scripts (counts IO/RO callbacks, rAF requests, writes); __idle(ms) reads it.
window.__invOn = () => {
  const R = 'data-start-selling-render';
  const hero = document.querySelector('.hero-track'), people = document.querySelector('#people');
  const kid = people.querySelector('.start-selling-profile-deck') || people.firstElementChild;
  const hkid = hero.querySelector('.hero-copy') || hero.firstElementChild;
  const raf0 = window.__fwRAF0 || window.requestAnimationFrame.bind(window);
  const S = (window.__inv = { fr: [], wr: [], sc: [], fails: [], hfails: [], on: true, t0: performance.now(), origin: performance.timeOrigin });
  let scrollFrame = false, curTs = 0;
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? 1 : 0; };
  const cv = (el) => (el.checkVisibility ? (el.checkVisibility({ contentVisibilityAuto: true }) ? 1 : 0) : -1);
  const read = (ts, kind) => {
    const pv = inView(people), hv = inView(hero), pc = cv(kid), hc = cv(hkid);
    const row = [Math.round(ts * 10) / 10, kind, Math.round(scrollY), people.getAttribute(R)[0], pv, pc, hero.getAttribute(R)[0], hv, hc, cv(people)];
    S.fr.push(row);
    if (pv && pc === 0) S.fails.push(row);
    if (hv && hc === 0) S.hfails.push(row);
  };
  const A = (ts) => { curTs = ts; if (!scrollFrame) read(ts, 'a'); if (S.on) raf0(A); };
  raf0(A);
  window.addEventListener('scroll', () => {
    if (!S.on) return;
    S.sc.push([Math.round(performance.now() * 10) / 10, Math.round(curTs * 10) / 10, Math.round(scrollY)]);
    if (scrollFrame) return;
    scrollFrame = true;
    raf0((ts) => { curTs = ts; read(ts, 'b'); scrollFrame = false; });
  }, { passive: true });
  const set0 = Element.prototype.setAttribute;
  for (const [el, name] of [[people, 'people'], [hero, 'hero']]) {
    el.setAttribute = function (n, v) {
      if (n === R && this.getAttribute(R) !== v) {
        const st = String(new Error().stack || '');
        const path = /\biE\b/.test(st) ? 'iE' : /fwReskip/.test(st) ? 'far' : /\bsE\b/.test(st) ? 'sE' : '?';
        S.wr.push([Math.round(performance.now() * 10) / 10, Math.round(curTs * 10) / 10, Math.round(scrollY), name, v, path]);
      }
      return set0.call(this, n, v);
    };
  }
  return 1;
};
window.__invOff = () => {
  const S = window.__inv; S.on = false;
  for (const el of [document.querySelector('#people'), document.querySelector('.hero-track')]) delete el.setAttribute;
  const sync = S.wr.filter((w) => w[5] === 'iE');
  return { frames: S.fr.length, fails: S.fails, hfails: S.hfails, sync, wr: S.wr, sc: S.sc.slice(0, 40), fr: S.fr, origin: S.origin };
};
window.__cvSelfTest = async () => {
  const raf = () => new Promise((r) => (window.__fwRAF0 || requestAnimationFrame)(() => r()));
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;left:0;top:-20000px;width:10px;content-visibility:auto;contain-intrinsic-size:10px 10px';
  const s = document.createElement('span'); s.textContent = 'x'; d.append(s); document.body.append(d);
  await raf(); await raf(); await raf();
  const off = s.checkVisibility({ contentVisibilityAuto: true }), plain = s.checkVisibility();
  d.remove();
  return { skippedChildCvAuto: off, skippedChildPlain: plain };
};
// idle window: counts over ms at the current position (after a settle); mutations by type from a MutationObserver.
window.__idle = async (ms) => {
  const C = window.__fwCB || {};
  const mu = {}; const mo = new MutationObserver((ms) => { for (const m of ms) { const k = m.type === 'attributes' ? 'attr:' + m.attributeName : m.type; mu[k] = (mu[k] || 0) + 1; } });
  mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
  performance.mark('fwI0'); const c0 = { ...C }; const t0 = performance.now();
  await new Promise((r) => setTimeout(r, ms));
  const c1 = { ...C }; const dt = (performance.now() - t0) / 1000; performance.mark('fwI1'); mo.disconnect();
  const per = {}; for (const k of Object.keys(c1)) per[k] = +((c1[k] - c0[k]) / dt).toFixed(1);
  const mut = Object.fromEntries(Object.entries(mu).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / dt).toFixed(1)]));
  const R = 'data-start-selling-render';
  return { y: Math.round(scrollY), s: +dt.toFixed(2), per, mut, attrs: [...document.querySelectorAll('[' + R + ']')].map((e) => (e.id || String(e.className).split(' ')[0]) + ':' + e.getAttribute(R)[0]).join(' ') };
};

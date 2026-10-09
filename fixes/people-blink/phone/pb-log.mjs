// people-blink phone logger (lead 2026-10-09, user T-228 #149): `iphone.mjs gesture --inject` module, attribution only.
// Per page load: rAF [perf, scrollY]; class flips everywhere (countdown cells dropped) and other attribute flips inside
// #people / the hero; transition/animation events and img loads inside #people; the geometry of the card and deck.
// A label ending in "-K" also injects the reveal knock-out (the card shown at once, no fade, no blur, no 48 px lift),
// the same CSS as pb-frames.mjs KO_CSS. Values come back through `read` as one JSON string.
export const name = 'pb-log';
const KO_CSS = `.start-selling-future > .start-selling-future-card { visibility: visible !important; opacity: 0.999 !important; filter: blur(0px) !important; transition: none !important; }
.start-selling-future:not(.is-visible) > .start-selling-future-card { transform: translateY(0) !important; }`;
export const install = ({ label }) => `(() => {
  if (window.__pb) return 0;
  const ko = ${JSON.stringify(/-K$/.test(label || '') ? KO_CSS : '')};
  if (ko) { const s = document.createElement('style'); s.id = 'pb-ko'; s.textContent = ko; document.head.appendChild(s); }
  const L = window.__pb = { f: [], m: [], ev: [], ko: !!ko };
  const sy = Object.getOwnPropertyDescriptor(window, 'scrollY') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'scrollY');
  const Y = () => sy.get.call(window);
  const tick = () => { if (L.f.length < 20000) L.f.push([performance.now(), Y()]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const people = document.getElementById('people'), hero = document.querySelector('.hero-track') || document.querySelector('.hero');
  const inP = (el) => (people && people.contains(el)) || (hero && hero.contains(el));
  const nm = (el) => { if (!el || el.nodeType !== 1) return '?'; const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : (el.getAttribute('class') || '').split(/\\s+/).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
  new MutationObserver((ms) => { const t = performance.now();
    for (const m of ms) { if (L.m.length >= 20000) return; const el = m.target, a = m.attributeName, n0 = nm(el);
      if (/^span\\.(cell|number)/.test(n0)) continue;
      if (a === 'class') {
        const o = new Set(String(m.oldValue || '').split(/\\s+/).filter(Boolean)), n = new Set(String(el.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
        const d = [...n].filter((c) => !o.has(c)).map((c) => '+' + c).concat([...o].filter((c) => !n.has(c)).map((c) => '-' + c)).join(' ');
        if (d) L.m.push([t, n0, 'class', d]);
      } else if (a === 'data-start-selling-render' || inP(el)) {
        const v = el.getAttribute(a); if (v === m.oldValue) continue;
        L.m.push([t, n0, a, String(v == null ? '(removed)' : v).slice(0, a === 'src' ? 80 : 60)]);
      } } })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true });
  for (const k of ['transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'])
    document.addEventListener(k, (e) => { if (L.ev.length < 20000 && people && people.contains(e.target)) L.ev.push([performance.now(), k, nm(e.target), e.propertyName || e.animationName || '']); }, { capture: true, passive: true });
  document.addEventListener('load', (e) => { if (L.ev.length < 20000 && e.target && e.target.tagName === 'IMG' && people && people.contains(e.target)) L.ev.push([performance.now(), 'imgload', nm(e.target), String(e.target.currentSrc || '').split('/').slice(-2).join('/')]); }, { capture: true });
  return 1;
})()`;
export const read = () => `JSON.stringify((() => { const L = window.__pb || {}; const y = scrollY, box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top + y), Math.round(r.height)]; };
  return { ko: L.ko, f: L.f || [], m: L.m || [], ev: L.ev || [], geom: { y, vh: innerHeight, vw: innerWidth, people: box('#people'), card: box('.start-selling-future-card'), deck: box('.start-selling-profile-deck') } }; })())`;

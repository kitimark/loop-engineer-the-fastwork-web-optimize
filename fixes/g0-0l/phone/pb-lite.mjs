// g0.0l phone card logger (fix-scrollcb-g0, 2026-10-09): `iphone.mjs gesture --inject` module for the counted FLICK runs,
// both arms. A lighter copy of fixes/people-blink/phone/pb-log.mjs: no knock-out, no document-wide observer. It records
//   f   rAF [perf, scrollY]                     (rAF-only scrollY read: neutral, P0 A/A P-023)
//   m   attribute flips on #people and inside it: class (diff), data-fw-reveal
//   ev  transitionstart/end/cancel inside #people (target, property) and <img> loads inside #people
//   geom at read time: the card's and the deck's page top and height
// Values come back through `read` as one JSON string.
export const name = 'pb-lite';
export const install = () => `(() => {
  if (window.__pbl) return 0;
  const L = window.__pbl = { f: [], m: [], ev: [] };
  const sy = Object.getOwnPropertyDescriptor(window, 'scrollY') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'scrollY');
  const Y = () => sy.get.call(window);
  const tick = () => { if (L.f.length < 20000) L.f.push([performance.now(), Y()]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const people = document.getElementById('people');
  const nm = (el) => { if (!el || el.nodeType !== 1) return '?'; const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : (el.getAttribute('class') || '').split(/\\s+/).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
  if (people) {
    new MutationObserver((ms) => { const t = performance.now();
      for (const m of ms) { if (L.m.length >= 5000) return; const el = m.target, a = m.attributeName;
        if (a === 'class') {
          const o = new Set(String(m.oldValue || '').split(/\\s+/).filter(Boolean)), n = new Set(String(el.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
          const d = [...n].filter((c) => !o.has(c)).map((c) => '+' + c).concat([...o].filter((c) => !n.has(c)).map((c) => '-' + c)).join(' ');
          if (d) L.m.push([t, nm(el), 'class', d]);
        } else { const v = el.getAttribute(a); if (v !== m.oldValue) L.m.push([t, nm(el), a, String(v == null ? '(removed)' : v).slice(0, 40)]); } } })
      .observe(people, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-fw-reveal'] });
    for (const k of ['transitionstart', 'transitionend', 'transitioncancel'])
      people.addEventListener(k, (e) => { if (L.ev.length < 5000) L.ev.push([performance.now(), k, nm(e.target), e.propertyName || '']); }, { capture: true, passive: true });
    people.addEventListener('load', (e) => { if (L.ev.length < 5000 && e.target && e.target.tagName === 'IMG') L.ev.push([performance.now(), 'imgload', nm(e.target), '']); }, { capture: true });
  }
  return people ? 1 : 2;
})()`;
export const read = () => `JSON.stringify((() => { const L = window.__pbl || {}; const y = scrollY, box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top + y), Math.round(r.height)]; };
  return { f: L.f || [], m: L.m || [], ev: L.ev || [], geom: { y, vh: innerHeight, vw: innerWidth, people: box('#people'), card: box('.start-selling-future-card'), deck: box('.start-selling-profile-deck') } }; })())`;

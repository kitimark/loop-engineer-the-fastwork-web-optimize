// fwreskip idle-count bootstrap: runs before page scripts (Chrome addScriptToEvaluateOnNewDocument, WebKit Page.setBootstrapScript).
(() => { if (window.__fwCB) return; const C = (window.__fwCB = { io: 0, ro: 0, raf: 0, wAttr: 0, wCls: 0, wProp: 0 });
  for (const [k, n] of [['IntersectionObserver', 'io'], ['ResizeObserver', 'ro']]) { const O = window[k]; if (!O) continue;
    const W = class extends O { constructor(cb, o) { super(function (...a) { C[n]++; return cb.apply(this, a); }, o); } }; window[k] = W; }
  const r0 = window.requestAnimationFrame.bind(window); window.__fwRAF0 = r0; window.requestAnimationFrame = (cb) => { C.raf++; return r0(cb); };
  const wrap = (P, names, key) => { for (const m of names) { const f = P[m]; if (typeof f !== 'function') continue; P[m] = function (...a) { C[key]++; return f.apply(this, a); }; } };
  wrap(Element.prototype, ['setAttribute', 'removeAttribute', 'toggleAttribute'], 'wAttr');
  wrap(DOMTokenList.prototype, ['add', 'remove', 'toggle', 'replace'], 'wCls');
  wrap(CSSStyleDeclaration.prototype, ['setProperty', 'removeProperty'], 'wProp');
})();

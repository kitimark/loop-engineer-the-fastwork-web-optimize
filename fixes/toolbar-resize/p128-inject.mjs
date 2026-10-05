// toolbar-resize P-128 in-page census (COUNT-ONLY; `sim.mjs gesture --count-only --inject`, Simulator functional
// session in a shared slot). Names the JS callers of the DOM calls in P-126's dom-call bucket during the in-view
// toolbar-step frames. No Timeline, no timestamps: calls are binned to frames by rAF tick ORDER.
// Installed by the gesture tool after every page load (before the strokes), read after each segment.
//   - WRAPPERS (pass-through; each call records its JS stack and whether it changed anything):
//       decide:      Element.setAttribute (changed = getAttribute(n) !== String(v)), DOMTokenList.toggle (changed =
//                    contains() before !== after), CSSStyleDeclaration.setProperty (changed = value + priority before
//                    !== after), Element.getBoundingClientRect (a read: changed = null)
//       descriptive: Element.removeAttribute, Element.toggleAttribute, DOMTokenList.add / remove / replace,
//                    CSSStyleDeclaration.removeProperty (the cousins; same record, never deciding)
//     Wrapping changes what it wraps: every call now runs the wrapper and new Error().stack (a counted check, never a
//     timing number). Calls through a reference the page took before install bypass the wrapper (undercount).
//   - STACK: new Error().stack inside the wrapper; the install expression carries //# sourceURL=p128-inject.js, so the
//     leading lines of this file's own frames (stack, note, the wrapper) are dropped (and empty or bare "Error" lines,
//     V8's message line, for the node self-test); at most 16 lines kept, each
//     line's url cut to the part from "/_app/" (or to its last path segment): no host in the record.
//   - FRAMES: a rAF loop; each callback pushes [innerHeight, round(scrollY), view] where view = the showcase IO's
//     latest isIntersecting (1/0, null before its first entry; IO root = viewport, rootMargin 0, threshold 0, as
//     P-125). A call made while fr.length === k belongs to frame k (the frame whose rAF ends its interval, as P-125's
//     frame (t - dt, t]); a call after the last rAF gets index fr.length (dropped by the reader).
//   - CALLS are aggregated in the page: sig = api | name | changed | stack -> {api, name, changed, stack, f: [frame
//     indices]}; name = the attribute, property or token(s).
// read() returns {installs, wrapped, ioInstalled, fr, calls: [...]} as JSON (gesture file run.inject[].value).
export const name = 'p128';
export const install = () => `(() => {
  if (window.__p128) { window.__p128.installs++; return 'again'; }
  const SEL = '#people .start-selling-future-card > .start-selling-future-showcase';
  const st = { installs: 1, wrapped: [], ioInstalled: false, view: null, fr: [], calls: new Map() };
  window.__p128 = st;
  const cut = (u) => { const i = u.indexOf('/_app/'); return i >= 0 ? u.slice(i) : u.split('/').pop(); };
  const stack = () => {
    const all = String(new Error().stack || '').split('\\n').filter((l) => l && l !== 'Error');
    let i = 0; while (i < all.length && all[i].includes('p128-inject.js')) i++;
    return all.slice(i, i + 16).map((l) => { const a = l.lastIndexOf('@'); if (a < 0) return cut(l); return l.slice(0, a) + '@' + cut(l.slice(a + 1)); });
  };
  const note = (api, name, changed) => {
    const s = stack(), sig = api + '|' + name + '|' + changed + '|' + s.join(';');
    let c = st.calls.get(sig);
    if (!c) { c = { api, name, changed, stack: s, f: [] }; st.calls.set(sig, c); }
    c.f.push(st.fr.length);
  };
  const wrap = (proto, key, api, fn) => {
    const orig = proto && proto[key];
    if (typeof orig !== 'function') return;
    proto[key] = function () { return fn.call(this, orig, arguments); };
    st.wrapped.push(api);
  };
  const E = Element.prototype, T = DOMTokenList.prototype, S = CSSStyleDeclaration.prototype;
  wrap(E, 'setAttribute', 'setAttribute', function (o, a) { const n = String(a[0]), ch = this.getAttribute(n) !== String(a[1]); const r = o.apply(this, a); note('setAttribute', n, ch ? 1 : 0); return r; });
  wrap(T, 'toggle', 'toggle', function (o, a) { const t = String(a[0]), b = this.contains(t); const r = o.apply(this, a); note('toggle', t, this.contains(t) !== b ? 1 : 0); return r; });
  wrap(S, 'setProperty', 'setProperty', function (o, a) { const p = String(a[0]), b = this.getPropertyValue(p) + '!' + this.getPropertyPriority(p); const r = o.apply(this, a); note('setProperty', p, this.getPropertyValue(p) + '!' + this.getPropertyPriority(p) !== b ? 1 : 0); return r; });
  wrap(E, 'getBoundingClientRect', 'gBCR', function (o, a) { const r = o.apply(this, a); note('gBCR', '', null); return r; });
  wrap(E, 'removeAttribute', 'removeAttribute', function (o, a) { const n = String(a[0]), ch = this.hasAttribute(n); const r = o.apply(this, a); note('removeAttribute', n, ch ? 1 : 0); return r; });
  wrap(E, 'toggleAttribute', 'toggleAttribute', function (o, a) { const n = String(a[0]), b = this.hasAttribute(n); const r = o.apply(this, a); note('toggleAttribute', n, this.hasAttribute(n) !== b ? 1 : 0); return r; });
  const tokens = (o, a, api, self) => { const ts = [...a].map(String), b = ts.map((t) => self.contains(t)); const r = o.apply(self, a); note(api, ts.join(' '), ts.some((t, i) => self.contains(t) !== b[i]) ? 1 : 0); return r; };
  wrap(T, 'add', 'add', function (o, a) { return tokens(o, a, 'add', this); });
  wrap(T, 'remove', 'remove', function (o, a) { return tokens(o, a, 'remove', this); });
  wrap(T, 'replace', 'replace', function (o, a) { return tokens(o, a, 'replace', this); });
  wrap(S, 'removeProperty', 'removeProperty', function (o, a) { const p = String(a[0]), b = this.getPropertyValue(p); const r = o.apply(this, a); note('removeProperty', p, b !== '' ? 1 : 0); return r; });
  const sc = document.querySelector(SEL);
  if (sc && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => { for (const e of es) st.view = e.isIntersecting ? 1 : 0; }, { threshold: 0 }).observe(sc);
    st.ioInstalled = true;
  }
  const tick = () => { st.fr.push([innerHeight, Math.round(scrollY), st.view]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 'ok';
})()
//# sourceURL=p128-inject.js`;
export const read = () => `(() => { const s = window.__p128; if (!s) return null; return JSON.stringify({ installs: s.installs, wrapped: s.wrapped, ioInstalled: s.ioInstalled, fr: s.fr, calls: [...s.calls.values()] }); })()`;

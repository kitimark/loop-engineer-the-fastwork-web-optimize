// In-page logger for the F3 cost card's Simulator part (gesture --inject; fix-nav-morph). Installed after each page
// load (so listeners added at mount are missed: the card's Sim coverage cell reads "n/a (logger installs after mount)").
// Logs, on the page clock (performance.now(), the gesture recorder's and the Timeline sync mark's clock):
//   ops: touch/wheel listener adds and removes after install [t, 'add|remove <type> <target> passive|active capture|bubble']
//   tm:  every touchmove at the window, bubble, passive (runs after the page's capture handlers) [t, cancelable, prevented]
//   ts:  every touchstart [t, scrollY, --morph]
//   marks: the gesture's performance marks [name, t]
export const name = 'costcard-inject';
export const install = `(() => {
  if (window.__ccs) return 'again';
  const T = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel']);
  const DP = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);
  const L = window.__ccs = { ops: [], tm: [], ts: [] };
  const nav = document.querySelector('header.start-selling-top-nav');
  const mv = () => { const m = /--morph:\\s*([0-9.e+-]+)/.exec(nav?.getAttribute('style') || ''); return m ? +m[1] : 0; };
  const desc = (t) => t === window ? 'window' : t === document ? 'document' : t && t.nodeType === 1 ? (t.id ? '#' + t.id : t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\\s+/)[0] : '')) : '?';
  const oA = EventTarget.prototype.addEventListener, oR = EventTarget.prototype.removeEventListener;
  const pas = (t, type, o) => o && typeof o === 'object' && 'passive' in o ? !!o.passive : DP.has(type) && (t === window || t === document || t === document.documentElement || t === document.body);
  const cap = (o) => typeof o === 'boolean' ? o : !!(o && o.capture);
  EventTarget.prototype.addEventListener = function (type, cb, o) {
    if (T.has(type) && cb) L.ops.push([Math.round(performance.now()), 'add ' + type + ' ' + desc(this) + ' ' + (pas(this, type, o) ? 'passive' : 'active') + ' ' + (cap(o) ? 'capture' : 'bubble')]);
    return oA.call(this, type, cb, o); };
  EventTarget.prototype.removeEventListener = function (type, cb, o) {
    if (T.has(type) && cb) L.ops.push([Math.round(performance.now()), 'remove ' + type + ' ' + desc(this) + ' ' + (cap(o) ? 'capture' : 'bubble')]);
    return oR.call(this, type, cb, o); };
  oA.call(window, 'touchmove', (e) => L.tm.push([Math.round(performance.now()), e.cancelable, e.defaultPrevented]), { passive: true });
  oA.call(window, 'touchstart', () => L.ts.push([Math.round(performance.now()), Math.round(scrollY), mv()]), { passive: true, capture: true });
  return 'ok'; })()`;
export const read = `JSON.stringify(window.__ccs ? { ops: __ccs.ops, tm: __ccs.tm, ts: __ccs.ts, y: Math.round(scrollY), m: (() => { const n = document.querySelector('header.start-selling-top-nav'); const m = /--morph:\\s*([0-9.e+-]+)/.exec(n?.getAttribute('style') || ''); return m ? +m[1] : 0; })(), marks: performance.getEntriesByType('mark').map((e) => [e.name, Math.round(e.startTime)]) } : null)`;

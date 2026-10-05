// T-194 writer ablation (probe only): image src swaps after load become no-ops (layout unchanged; carousels freeze)
(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  let blocked = 0;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { blocked++; } });
  const sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { if (this instanceof HTMLImageElement && (n === 'src' || n === 'srcset')) { blocked++; return; } return sa.call(this, n, v); };
  window.__armAfter = () => ({ blockedSrcWrites: blocked });
  const m = document.createElement('i'); m.id = 'sw-arm'; m.hidden = true; document.body.appendChild(m);
  return { installed: true };
})()

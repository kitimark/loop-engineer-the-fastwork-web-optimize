// end-bg PR-025 B cost card: in-page counter for `sim.mjs gesture --inject` (Simulator, functional session, counts
// only, no time). Installed after every page load. Records, per load:
// - every image resource the page fetched (Resource Timing, buffer raised to 1000; a buffer-full event is recorded):
//   path, transferSize, encodedBodySize, decodedBodySize. Picture = a path ending in png/jpg/jpeg/webp/avif/gif;
// - for every .avif resource: a decode test, new Image(): src, then img.decode() (resolves when WebKit decoded it, rejects
//   when it cannot), so "every AVIF decodes in WebKit" is a counted fact, not an assumption;
// - at read: every <img> in the document with a src: complete, naturalWidth > 0 (a broken picture is complete with
//   naturalWidth 0).
// read() returns a JSON string (gesture file run.inject[0].value). Nothing personal; paths only (same-origin mirror).
export const name = 'imgb';
export const install = () => `(() => {
  if (window.__imgb) return 'again';
  const IMG = /\\.(png|jpe?g|webp|avif|gif)(\\?|$)/i, path = (u) => { try { return new URL(u, location.href).pathname; } catch (e) { return String(u); } };
  const st = { full: 0, avif: {}, entries: {} };
  try { performance.setResourceTimingBufferSize(1000); } catch (e) {}
  addEventListener('resourcetimingbufferfull', () => { st.full++; });
  const take = (e) => {
    if (!IMG.test(e.name)) return; const p = path(e.name);
    st.entries[p] = [Math.round(e.transferSize || 0), Math.round(e.encodedBodySize || 0), Math.round(e.decodedBodySize || 0)];
    if (/\\.avif$/i.test(p) && !(p in st.avif)) { st.avif[p] = 'pending'; const im = new Image(); im.src = e.name; im.decode().then(() => { st.avif[p] = im.naturalWidth > 0 ? 'ok' : 'zero'; }, () => { st.avif[p] = 'fail'; }); }
  };
  performance.getEntriesByType('resource').forEach(take);
  try { new PerformanceObserver((l) => l.getEntries().forEach(take)).observe({ type: 'resource', buffered: true }); } catch (e) { st.noObserver = 1; }
  window.__imgb = st;
  return 'ok';
})()`;
export const read = () => `(() => {
  const st = window.__imgb; if (!st) return 'null';
  performance.getEntriesByType('resource').forEach((e) => { const IMG = /\\.(png|jpe?g|webp|avif|gif)(\\?|$)/i; if (IMG.test(e.name)) { const p = new URL(e.name, location.href).pathname; if (!(p in st.entries)) st.entries[p] = [Math.round(e.transferSize || 0), Math.round(e.encodedBodySize || 0), Math.round(e.decodedBodySize || 0)]; } });
  const imgs = [...document.images].filter((i) => i.getAttribute('src')).map((i) => { let p = i.currentSrc || i.src; try { p = new URL(p, location.href).pathname; } catch (e) {} return [p, i.complete ? 1 : 0, i.naturalWidth > 0 ? 1 : 0]; });
  return JSON.stringify({ full: st.full, noObserver: st.noObserver || 0, entries: st.entries, avif: st.avif, imgs, docH: document.documentElement.scrollHeight, y: Math.round(scrollY) });
})()`;
/** Per-run counts from a read() value (pure; used by cost-b.mjs and its self-test). */
export function counts(v) {
  if (!v || typeof v !== 'object') return null;
  const e = Object.entries(v.entries || {});
  const av = Object.values(v.avif || {});
  return {
    files: e.length, encodedBytes: e.reduce((s, [, x]) => s + x[1], 0), transferBytes: e.reduce((s, [, x]) => s + x[0], 0),
    avifFiles: e.filter(([p]) => /\.avif$/i.test(p)).length, avifOk: av.filter((x) => x === 'ok').length,
    avifBad: av.filter((x) => x !== 'ok').length, imgBroken: (v.imgs || []).filter((i) => i[1] === 1 && i[2] === 0).length,
    imgPending: (v.imgs || []).filter((i) => i[1] === 0).length, bufferFull: v.full || 0,
  };
}

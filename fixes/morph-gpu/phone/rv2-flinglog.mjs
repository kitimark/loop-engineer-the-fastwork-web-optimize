// In-page logger for the morph-gpu rev 2 G check (fling into the end; `iphone.mjs gesture --inject`; fix-morph-gpu).
// install (after every page load, on the gesture tool's own connection): jumps to 4.5 viewports above the page end
// (outside rev 2's 3-viewport setup range, so __rvPrep does not run there; the jump is the run's setup, not the
// user's path), then logs one row per rAF in morph-log's format [t, dt, scrollY, m, flags]:
//   m     = the nav header's inline --morph (0 before the first tween),
//   flags = 'd' when the nav holds rev 2's .fw-rv-dark layer (created by __rvPrep or by the switch-on frame),
//           'r' when the nav has data-fw-rv (the reveal is on). Best-build (C) never shows either.
// read: stops the loop, returns {frames, summary} (morph: true feeds run.morph).
// The rAF loop uses the rAF captured at install time.
export const name = 'rv2-flinglog';
export const morph = true;
export const install = `(() => {
  if (window.__rvfl && !window.__rvfl.stop) return 'again';
  const rAF = window.requestAnimationFrame.bind(window);
  const nav = document.querySelector('header.start-selling-top-nav');
  const R = (v) => Math.round(v * 10) / 10;
  const mv = () => { const m = /--morph:\\s*([0-9.e+-]+)/.exec(nav?.getAttribute('style') || ''); return m ? +m[1] : 0; };
  const fl = () => (nav && nav.querySelector(':scope > .fw-rv-dark') ? 'd' : '') + (nav && nav.hasAttribute('data-fw-rv') ? 'r' : '');
  let css = 'none'; // which build's CSS is served: 'rv2' (has the data-fw-rvp rules), 'rv1' (fw-rv only), 'none' (C)
  try { for (const s of document.styleSheets) { let t = ''; try { t = [...s.cssRules].map((x) => x.cssText).join(' '); } catch (e) {}
    if (t.includes('data-fw-rvp')) { css = 'rv2'; break; } if (t.includes('fw-rv-dark')) css = 'rv1'; } } catch (e) {}
  const jumpY = Math.max(0, document.documentElement.scrollHeight - 5.5 * innerHeight);
  window.scrollTo({ top: jumpY, behavior: 'instant' });
  const r = window.__rvfl = { frames: [], stop: false, css, jumpY: Math.round(jumpY), docH: document.documentElement.scrollHeight, vh: innerHeight };
  let last = performance.now();
  const loop = (t) => { if (r.stop) return; r.frames.push([R(t), R(t - last), Math.round(scrollY), mv(), fl()]); last = t; rAF(loop); };
  rAF(loop);
  return 'ok ' + r.jumpY; })()`;
export const read = `(() => { const r = window.__rvfl; if (!r) return null; r.stop = true;
  return JSON.stringify({ frames: r.frames, summary: { frames: r.frames.length, css: r.css, jumpY: r.jumpY, docH: r.docH, vh: r.vh } }); })()`;

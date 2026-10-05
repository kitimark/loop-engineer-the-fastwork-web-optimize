// deck-contain: the profile deck's geometry, read in the page (Chrome and WebKit). Descriptive design input, no timing.
// GEO returns the deck box, its parent's width, the section and the next section's top, every shell's box, the
// page size and which media branches match. ARM(css) puts one arm's CSS in a <style id="dc-arm"> at the end of
// <head> (replacing any earlier one); ARM(null) removes it. Both force one layout read and return the arm state.
export const GEO = `(() => {
  const d = document.querySelector('.start-selling-profile-deck'); if (!d) return { error: 'no deck' };
  const f = (v) => +(+v).toFixed(3);
  const r = d.getBoundingClientRect(), cs = getComputedStyle(d), p = d.parentElement.getBoundingClientRect();
  const sec = document.getElementById('profile-showcase'), sr = sec.getBoundingClientRect();
  let nx = sec.nextElementSibling; while (nx && !nx.getBoundingClientRect().height) nx = nx.nextElementSibling;
  const shells = [...d.children].map((s) => { const b = s.getBoundingClientRect(), c = getComputedStyle(s);
    return { w: f(b.width), h: f(b.height), ow: s.offsetWidth, oh: s.offsetHeight, ol: s.offsetLeft, act: s.classList.contains('is-active-shell'), disp: c.display, tr: c.transform === 'none' ? 0 : 1 }; });
  const vis = shells.filter((s) => s.disp !== 'none');
  const mq = (q) => matchMedia(q).matches;
  return { iw: innerWidth, ih: innerHeight, vvh: window.visualViewport ? f(visualViewport.height) : null, sy: f(scrollY),
    docH: document.documentElement.scrollHeight, arm: document.getElementById('dc-arm')?.dataset.arm || null,
    deck: { x: f(r.left), y: f(r.top + scrollY), w: f(r.width), h: f(r.height), ow: d.offsetWidth, oh: d.offsetHeight, cw: d.clientWidth,
      ch: d.clientHeight, sw: d.scrollWidth, sl: f(d.scrollLeft), contain: cs.contain, ar: cs.aspectRatio, bs: cs.boxSizing, width: cs.width,
      height: cs.height, pl: cs.paddingLeft, ml: cs.marginLeft, ov: cs.overflowX + '/' + cs.overflowY },
    parentW: f(p.width), predH: f(p.width * 764 / 353),
    shellMaxH: vis.length ? Math.max(...vis.map((s) => s.h)) : null, shellW: vis.length ? vis[0].w : null,
    sec: { y: f(sr.top + scrollY), h: f(sr.height) }, nextY: nx ? f(nx.getBoundingClientRect().top + scrollY) : null,
    shells,
    mq: { mob: mq('(max-width: 860px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)'),
      w640: mq('(max-width: 640px)'), touch: mq('(hover: none) and (pointer: coarse)'), rm: mq('(prefers-reduced-motion: reduce)'), desk: mq('(min-width: 861px)') } };
})()`;
export const ARM = (css, name = 'arm') => `(() => {
  document.getElementById('dc-arm')?.remove();
  const css = ${JSON.stringify(css)};
  if (css != null) { const s = document.createElement('style'); s.id = 'dc-arm'; s.dataset.arm = ${JSON.stringify(name)}; s.textContent = css; document.head.appendChild(s); }
  void document.documentElement.offsetHeight;
  return document.getElementById('dc-arm')?.dataset.arm || null;
})()`;
// the deck's top at a given offset from the viewport top (the deck in view), for the reads
export const TO_DECK = (offset = 60) => `(() => { const d = document.querySelector('.start-selling-profile-deck');
  window.scrollTo({ top: Math.max(0, d.getBoundingClientRect().top + scrollY - ${offset}), behavior: 'instant' }); return scrollY; })()`;
// compare a reading with the base reading of the same state: every number that moved by more than tol px
export function geoDiff(base, arm, tol = 0.02) {
  const out = [];
  const num = (k, a, b) => { if (a == null || b == null) { if (a !== b) out.push(`${k} ${a} -> ${b}`); return; } if (Math.abs(a - b) > tol) out.push(`${k} ${a} -> ${b}`); };
  num('docH', base.docH, arm.docH);
  for (const k of ['x', 'y', 'w', 'h', 'ow', 'oh', 'cw', 'ch', 'sw']) num('deck.' + k, base.deck[k], arm.deck[k]);
  num('sec.y', base.sec.y, arm.sec.y); num('sec.h', base.sec.h, arm.sec.h); num('nextY', base.nextY, arm.nextY);
  if (base.shells.length !== arm.shells.length) out.push(`shells ${base.shells.length} -> ${arm.shells.length}`);
  base.shells.forEach((s, i) => { const t = arm.shells[i]; if (!t) return; for (const k of ['w', 'h', 'ol']) num(`shell${i}.${k}`, s[k], t[k]); });
  return out;
}
// WebKit's Runtime.evaluate over tools/lib/wip.mjs does not await promises: run an async expression, park its value on
// window, poll it (50 ms)
export async function evalAsync(c, expr, sleep, tmo = 60000) {
  await c.evaluate(`(() => { window.__dcR = undefined; window.__dcD = false; Promise.resolve(${expr}).then((v) => { window.__dcR = v; window.__dcD = true; }, (e) => { window.__dcR = { error: String(e) }; window.__dcD = true; }); return 1; })()`);
  for (let t = 0; t < tmo; t += 50) { if (await c.evaluate('window.__dcD')) return c.evaluate('window.__dcR'); await sleep(50); }
  throw new Error('evalAsync timeout');
}

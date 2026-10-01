// N10 / R3 transition logger (fix-scroll-engine). Paste or inject into the page (Safari or Chrome) before scrolling;
// read window.__r3 afterwards, e.g. JSON.stringify(window.__r3.summary()).
// Records, per animation frame (rAF delta), every state change that landed since the previous frame:
//  - contentvisibilityautostatechange (capture phase on document: it fires after the frame and does not bubble),
//  - attribute flips: data-start-selling-render / data-start-selling-scene / data-fw-wc (oldValue -> value, same-value
//    re-sets ignored), and class changes on .pain (is-pain-dark) and #people (is-visible),
// so a long frame (> 34 ms) can be named by the transitions that preceded it. No forced layout: scrollY only.
(() => {
  if (window.__r3) return;
  const R = (window.__r3 = { frames: [], pending: [], long: [], t0: performance.now() });
  const desc = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + [...e.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.')).slice(0, 48);
  document.addEventListener('contentvisibilityautostatechange', (e) => R.pending.push(['cv', desc(e.target), e.skipped ? 'skipped' : 'rendered']), true);
  new MutationObserver((ms) => {
    for (const m of ms) {
      const v = m.target.getAttribute(m.attributeName);
      if (m.oldValue === v) continue;
      if (m.attributeName === 'class') {
        const was = new Set((m.oldValue || '').split(/\s+/)), now = new Set((v || '').split(/\s+/));
        const add = [...now].filter((c) => c && !was.has(c)), del = [...was].filter((c) => c && !now.has(c));
        R.pending.push(['class', desc(m.target), (add.length ? '+' + add.join('+') : '') + (del.length ? '-' + del.join('-') : '')]);
      } else R.pending.push([m.attributeName.replace('data-start-selling-', '').replace('data-', ''), desc(m.target), (m.oldValue ?? '') + '->' + v]);
    }
  }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-start-selling-render', 'data-start-selling-scene', 'data-fw-wc', 'class'] });
  // only .pain / #people class changes are interesting; drop other class churn at frame time
  const keepClass = (p) => p[0] !== 'class' || /^(section\.pain|#people)/.test(p[1]);
  let last = performance.now();
  const tick = (now) => {
    const d = now - last; last = now;
    const ev = R.pending.filter(keepClass); R.pending.length = 0;
    const f = [Math.round(now - R.t0), Math.round(d * 10) / 10, Math.round(scrollY)];
    if (ev.length) f.push(ev.map((p) => p.join(' ')).slice(0, 12));
    if (d > 34) R.long.push(f);
    if (ev.length || d > 34) R.frames.push(f);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  R.summary = (y0 = 0, y1 = 1e9) => {
    const inY = (f) => f[2] >= y0 && f[2] <= y1;
    const long = R.long.filter(inY);
    // a long frame is "named" when transitions landed in it or in the frame before it
    const named = long.map((f) => { const i = R.frames.indexOf(f); const prev = i > 0 ? R.frames[i - 1] : null; return { t: f[0], ms: f[1], y: f[2], ev: f[3] || [], prevEv: prev && f[0] - prev[0] < 40 ? prev[3] || [] : [] }; });
    return { longFrames: long.length, named: named.filter((n) => n.ev.length || n.prevEv.length).length, frames: named, transitions: R.frames.filter((f) => f[3] && inY(f)).length };
  };
})();

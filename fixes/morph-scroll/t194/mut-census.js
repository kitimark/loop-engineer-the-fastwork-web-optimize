// T-194 arm file for swipe-sim.mjs (evaluated in the page before the swipe; changes nothing on the page): a
// MutationObserver on the whole document tallies DOM writes during the swipe: attribute (style, class, other) and child
// list changes, keyed by the target's tag.class (first two classes) and whether it sits inside
// .start-selling-profile-deck. window.__armAfter returns the tallies (top 25 by count) and the swipe frame count.
(() => {
  const T = new Map(); let deck = 0, other = 0, n = 0;
  const key = (el) => { if (!el || el.nodeType !== 1) el = el && el.parentElement; if (!el) return '?'; const c = typeof el.className === 'string' ? el.className.split(/\s+/).filter((x) => x && !x.startsWith('svelte-')).slice(0, 2).join('.') : ''; return el.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      n++;
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const inDeck = !!(el && el.closest && el.closest('.start-selling-profile-deck'));
      inDeck ? deck++ : other++;
      let v = '';
      if (m.type === 'attributes') { const now = el.getAttribute(m.attributeName); v = m.oldValue === now ? ' (same value)' : ''; }
      const k = `${inDeck ? 'DECK ' : ''}${key(el)} ${m.type === 'attributes' ? '@' + m.attributeName : m.type}${v}`;
      T.set(k, (T.get(k) || 0) + 1);
    }
  });
  mo.observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true, characterData: true, subtree: true });
  window.__armAfter = () => { mo.disconnect(); return { mutations: n, inDeck: deck, outside: other, swipeSteps: (window.__sw || []).length, top: [...T.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25) }; };
  const m = document.createElement('i'); m.id = 'sw-arm'; m.hidden = true; document.body.appendChild(m);
  return { installed: true };
})()

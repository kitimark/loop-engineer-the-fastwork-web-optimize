// deck-contain: behaviour check for the deck's scroll code, which reads the shells' offsetLeft (JS v9.1d l.11700-11708
// he(): tab click scrolls the deck to `shell.offsetLeft - (deck.clientWidth - shell.offsetWidth) / 2`; l.11750-11761
// be(): the shell nearest the deck's centre becomes active). Layout containment makes the deck a containing block for
// positioned descendants, which can change the shells' offsetParent. In the page: the shells' offsetParent and
// offsetLeft; then, per case, the deck is scrolled so shell k is centred, and a tab is clicked; the deck's resting
// scrollLeft, the active shell and the active tab are read after each move. Functional, no timing.
export const TABS = `(async () => {
  const d = document.querySelector('.start-selling-profile-deck');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shells = [...d.children];
  const desc = (e) => e ? e.tagName.toLowerCase() + [...e.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).map((c) => '.' + c).join('') : null;
  const state = () => ({ sl: Math.round(d.scrollLeft), act: d.querySelector('.is-active-shell')?.dataset.profession || null,
    tab: document.querySelector('[data-profession-tab][aria-selected="true"], [data-profession-tab].is-active')?.dataset.professionTab || null });
  const out = { offsetParent: desc(shells[0].offsetParent), ol: shells.map((s) => s.offsetLeft), ids: shells.map((s) => s.dataset.profession), cases: [] };
  const centre = (k) => { const s = shells[k]; const t = s.getBoundingClientRect().left - d.getBoundingClientRect().left + d.scrollLeft - (d.clientWidth - s.offsetWidth) / 2; d.scrollTo({ left: t, behavior: 'instant' }); };
  for (const [k, j] of [[0, 0], [2, 2], [2, 4], [5, 5], [5, 1], [3, 0]]) {
    centre(k); await wait(900); const before = state(); const olAtK = shells.map((s) => s.offsetLeft);
    const tab = document.querySelector('[data-profession-tab="' + shells[j].dataset.profession + '"]'); tab?.click(); await wait(1200);
    out.cases.push({ k, j, before, olAtK, after: state(), tabFound: !!tab });
  }
  return out;
})()`;

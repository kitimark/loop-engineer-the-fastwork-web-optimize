# Fix: hero-covered-pause

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured in Chrome (functional + pixels: identical); Simulator rest counts pending
**Stage:** F; lands as a less-work fix (memory "less-work landing rule"): counts + a short device no-worse check
**Device class / gate:** render-bound / WebKit layout and paint at rest (Simulator counts), pixels identical
**Driver(s) behind the claims:** Chrome functional probe (430x775 DPR 3), iOS Simulator Timeline rest counts
**Topic:** user T-215 ("stop invisible animations") + T-224; lead's delta for fix-people-gpu (scene-scope area)
**Base:** v10 + compositor morph (CM) from int-v8, pins **js a33a6c7c1f2b / css 62743920fe1a @e029592c**.
`patch.diff` is STACKED on that base (`fix.mjs diff hero-covered-pause --on people-gpu-base`), JS only.
**This build (H1c):** **js 784175f26a60 / css 62743920fe1a** (the base CSS, unchanged).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: `__hhSub` / `__hhInit` before `function HE(t, n)`
(H overlay 3882-3947); HE's timers and IO callback (3973-4019); the hero component's countdown state (4691-4692),
init and cleanup (5056-5075) and the `cD` call's `shown` / `active` props (5174-5177).

## Why it lags

- At the #people title the people card (opacity 0.999 once shown) is pulled up over the hero's last screen. The hero
  keeps animating under it: the accent word's stroke-out (3 paths), scroll-float, the countdown cells and the orbit.
- Simulator, v10+CM, at the title at rest (pg-why bisect, layouts per 2 s): nothing paused 56; hero accent paused 13;
  the whole hero track paused 12; everything outside #people paused 2. The accent's layouts are small roots
  (84x37 / 94x39) with matching repaints, every frame.
- At the page end the hero is off screen, but in v10+CM one hero animation still runs (scroll-float). The Simulator
  shows 53 layouts per 2 s there rooted at a 1250x1250 box; that is the size of the compositor morph's panel wrapper
  (`.fw-cm-c` at the page end, Chrome geometry probe), so those layouts are not necessarily the hero's: the H1c rest
  counts will tell.

## What changed

One signal, hidden = (the card's top edge at or above the viewport top AND the card shown AND its fade-in ended) OR
(no part of `.hero-track` in the viewport):
- two IntersectionObservers, no reads: the card against a zero-height root at the viewport top
  (`rootMargin: 0px 0px -100% 0px`, edge-inclusive), and the hero track against the viewport;
- the section's `is-visible` class (MutationObserver) and the card's own `filter` `transitionend` (fallback 1200 ms)
  say when the fade-in ended.

While hidden:
- every time-based animation in the hero (`track.getAnimations({subtree: true})` with `timeline ===
  document.timeline`, CSS animations, transitions and WAAPI) is paused where it is, and played on from there when
  the hero shows again (no jump); scroll-driven ones (the exit) are left alone;
- the accent word cycle holds its timer and resumes with the time it had left;
- the hero countdown stops ticking through `cD`'s own `active` / `shown` props (countdown-faces): when it comes back
  it shows the current time in that frame, without rolling through the skipped seconds.

## Checks (Chrome, 430x775 DPR 3, pages A = v10+CM, A2 = A again, H = H1c; `gates/hh-chrome.mjs`)

| check | result |
|---|---|
| where it pauses (1 px steps across the card's top edge) | cardTop 3, 2, 1 px: running; cardTop 0, -1, -2, -3: paused (exactly at the edge) |
| covered screenshot A~A2 / A~H / A2~H | max level 0 / 0 / 0 |
| held values over 5 s covered | unchanged |
| resume at the top: no jump | stroke-out 600 -> 600 ms, scroll-float 8966 -> 8966 ms (continues from the held time) |
| countdown label (role=timer) after resume, 3 s | equal to A and A2 every second |
| page end (hero off screen) | A: 1 running (scroll-float); H: 0 running, 5 paused |
| console errors | none |

An earlier run (H1) was served with the baseline CSS instead of v10+CM's (only the JS was in that build); its
pixel and Simulator results are void. Every gate log now prints both fingerprints.

## Simulator rest counts (layouts / paints per 2 s)

Pending (queued, one Simulator job at a time during int-v8's phone block): top, covered (card 120 px past the top
edge), page end, top again, A vs H1c (`gates/hh-sim.mjs`).

**Scenarios not run:** reload while covered · early input · finger · toolbar resize · real iPhone (the device
no-worse check comes with the build after v10).

## Risks, conflicts, follow-ups

- Resume uses `play()` on the paused Animation objects, so they continue from the held time (checked above). A CSS
  animation or transition that starts in the hero while it is hidden is not paused until the next hide (none was seen
  in the covered or page-end checks).
- Overlaps scene-scope / main-thread-infinite-animations (they pause hero animations off screen too): pausing is
  idempotent, and resume only plays what this code paused.
- The countdown getters reuse the countdown-faces `active` / `shown` contract; a change there touches this.

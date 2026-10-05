# Fix: hero-park

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (built; Simulator dry run queued; card ticket `TICKET.md`, P-140)
**Stage:** F (less-work landing rule: cost card + one short phone no-worse check; the lead, T-198 #3)
**Device class / gate:** WebKit only (the hero's CSS mode runs only on touch phones with `GestureEvent`)
**Driver(s) behind the claims:** Simulator scripted swipe (counts); phone G for the no-worse check
**Owner:** fix-hero-exit-threaded
**Base:** v9.1d (int-v8, P-134 base): JS 941aa13e5bdf, CSS f1997edf5309 (`fixes/v9-1d/patch.diff` ce2d32a1bbbb, int-v8's)
**V:** v9.1d + hero-park: JS be22bf861949, CSS f1997edf5309 (unchanged)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, one hunk: JS 4895-4909 in v9.1d (4813-4827 in v9-final + 7d),
the hero's `heSc` scroll listener and its comment.

## Why it costs work

The hero's exit runs on WebKit as CSS scroll-driven animations while "live" (`.he-css`, PR hero-exit-threaded). While
live, WebKit recalculates the style of every element with a relevant scroll-driven animation on every rendering update
(WebKit main 13a1f2916933, CONFIRMED; cited in the code comment). Live mode ends only at the top or 300 ms after the last
scroll event with no finger down (`heRest`). On back-to-back strokes the page keeps scrolling events coming, so the hero
stays live far below itself: Chrome census with the Safari path faked, 10 touch strokes, live from y 100 to ~2800
(`out/t194-census/an-wk.json`, OBSERVED). Simulator scripted swipe on v9-final + 7d: style ms per frame at y 1000-1500
3.6 as is vs 0.7 with the hero parked past its end (`fixes/morph-scroll/t194/swipe-sim.mjs`, OBSERVED, descriptive ms).

## What changed

`heSc` (live branch) also parks when `scrollY >= heEnd + 40`, finger down or not: `s()` writes the inline value for this
scrollY (r = 0 past the end), then `.he-css` goes; the same transition `heRest` makes past the end. Going live is
unchanged (first scroll event at `heTop + 30 < y < heEnd`), so the 40 px band is a hysteresis: a scroll hovering at the end
does not flip the class. Expected visual: identical (T0) past the end; checked by the card's pixel step.

## Couplings

- `heSc` is a plain `scroll` listener on window (capture, passive), not the scroll engine's (`dE`/`iE`) callback, so
  scroll-cb's rAF cuts (int-v8, v9.1d) do not change when it parks. Its hunk is outside int-v8's reserved ranges (scroll-cb
  JS 3219-3446, 11636-11854, 12249-12383, 13459-13504; g11; people-word a).
- `delta.diff` applies with `patch -p1` (no fuzz) on v9.1d and on v9-final + 7d (checked: V be22bf861949 on v9.1d,
  c036d875f16c on v9-final + 7d, `node --check` ok).

## Files

`delta.diff` (V vs v9.1d), `patch.diff` (V vs the baseline, includes v9.1d), `TICKET.md` (card + phone check plan),
`sim-park.mjs` (Simulator runner: functional steps, frozen-frame pixels, counts per band).

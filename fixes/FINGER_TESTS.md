# iPhone tests to catch up (for the user and the lead)

Some effects only show under a real finger on the iPhone 15 Pro Max: touch scroll-jack at the page
bottom (`#platform` morph), the Safari toolbar collapsing and expanding, momentum and rubber-band
scrolling. Scripted scrolls (`iphone.mjs scroll`) can't reproduce them, so these tests need you.
Agents never wait for you: they finish their scripted checks, add their finger test to the queue below and
release the phone. The lead starts each test when you say you're ready.

## What you do (about 2 minutes per test)

Before you start: the iPhone must not be in Low Power Mode (it caps animations at 30 fps).


1. Tell the lead "ready for finger tests". The lead gets the iPhone lease, starts the servers and
   opens the first URL in Safari on the phone for you (plain `http://`, incident I-003).
2. When the lead says "recording", scroll with your finger:
   - slowly from the top to the bottom (about 10 s);
   - at the bottom, keep pushing up past the end 2-3 times (this is the morph / scroll-jack);
   - flick back to the top fast, then flick down once more so the toolbar collapses and comes back.
3. Tell the lead what you felt: "smooth", or "hitch at <section>", "stuck at the bottom", "jump".
4. The lead opens the other version (baseline or patched; you aren't told which one) and you repeat
   step 2. Two runs of each, alternating.

The lead records timing on the phone during each run (`iphone.mjs record`) and writes both your
impression and the numbers into the fix's README.

## Scripted iPhone checks pending (the lead runs these; you only reconnect the phone)

Scripted `iphone.mjs scroll` runs, baseline vs patched, 3 each, alternating, plain http. They need no finger,
only the phone connected, unlocked, with Safari in front. Run them before the finger tests.

| # | topic | status | what to measure |
|---|---|---|---|
| 1 | large-area-blur | pending | the main one: blur raster cost is on the iPhone GPU and invisible in Chrome throttling; scroll fps, frames >34 ms, bottom-of-page (`#platform`) section |
| 2 | layout-animations | pending | idle (avatar carousel, accent, doc-sweep repaint at the page bottom) and scroll |
| 3 | hero-exit-scroll-timeline | pending (an earlier parity check matched the baseline) | scroll out of the hero; Safari 26 scroll-timeline behaviour |
| 4 | scroll-engine (topics 2+10+12) | pending, on its combined overlay | full scroll; toolbar resize needs the finger test below |
| 5 | countdown-idle-raf | not run yet | idle repaint of the hero countdown (the research saw ~51 repaints/s) |
| 6 | wave-2 base `aw1-10c` (all-wave1 + scroll-engine /10c) | **running: `iphone-runner`** (from 2026-10-01 ~06:55Z) | goal check baseline vs aw1-10c, scripted n=3, order B P P B B P: full scroll + idle, frames > 34 / > 50 ms, the number that counts for the goal |
| 7 | N12 nav-scroll-handler v5 (DIRECTION iPhone item 9) | pending, `iphone-runner` | aw1-10c vs + `fixes/nav-scroll-handler/patch-on-aw1-10c.diff`: nav `L` self time per scroll frame; > 34 ms frames at y≈1800-1900, 2230-2260, 3190, 4360 (expect no change); parity after settle (is-on-dark y 2231/2251, commission `.shrinking` 3190-4360, toolbar collapse). Decides whether N12 enters the base |

Already done before the disconnect: phone-invisible-shrink (better, all ranges disjoint), nav-morph
(6 runs), commission-forced-layout (within noise), pain-offscreen-notes. I-003 (https on the phone) still
needs one real-device check by its toolsmith's steps.

## Finger-test queue

The iPhone is **back** (2026-10-01 ~06:50Z, iOS 26.6.1): the lead released `lead-iphone-offline` and spawned
`iphone-runner`, which owns the phone. It builds `aw1-10c`, runs the goal check (scripted row 6), then these finger
tests with the user via the lead, then DIRECTION iPhone queue items 1, 2, 9, 4-8. Owners don't take the `iphone` lease
themselves; iPhone requests go to `iphone-runner` via the lead.

| # | topic | branch / worktree | what to look for | added |
|---|---|---|---|---|
| 1 | nav-morph (topics 3+6, 13) | worktree of `fix-nav-morph` | the bottom of the page: push past the end, the morph panel opening; no stall when the platform section comes in; pushing past the end still starts the morph, dragging back up collapses it, and the page doesn't stick or rubber-band at the end; also **one drag that starts above the end and continues into it without lifting the finger** (no source says Safari keeps later touchmoves cancelable once a scroll starts, `research/architecture/webkit.md`). review-navmorph pass criteria for #6: (a) one continuous drag from ~1 screen above the end into it starts the morph with no jitter between the finger scroll and the `scrollTo` pin; (b) a push past the end starts the morph with no rubber-band; (c) dragging back up collapses it; (d) no stick at the end. For #13: **start scrolling within 1 s of load** (the lazy mount fires ~2 s after load on Safari) and note any hitch in the first scroll or the hero intro | 2026-10-01 |
| 2 | hero-exit-scroll-timeline (topic 7, wave 2) | worktree of `fix-hero-exit` | scroll slowly out of the hero, then fling: copy, orbit cards and scroll cue fade and scatter smoothly (no stepping, the cue never stays invisible); after scrolling back up, the hero is tappable again; same look as the baseline | 2026-10-01 |
| 3 | scroll-engine: toolbar-resize (topics 2+10+12, wave 2) | worktree of `fix-scroll-engine` (URLs once its combined overlay exists) | from the very top, slowly through the hero until the URL bar collapses, then flick up so it expands again: no jump or stutter at the collapse; the hero, commission and future shrink effects still track after the bar settles (height-only resizes are debounced 120 ms) | 2026-10-01 |
| 4 | wave-2 base `aw1-10c` | `iphone-runner` | the whole page, top to bottom and past the end | after wave 1 lands |
| 5 | scroll-engine /10c (in `aw1-10c`; review-10c, DIRECTION iPhone item 7) | `iphone-runner` | (a) finger scroll within 1 s of load (Safari un-skips fire at ~load + 0.65-0.8 s whatever you do); (b) fast fling bottom → top: hero-track / #people blank or jump at y≈4.0-4.5k; (c) toolbar collapse stutter; (d) reload while scrolled mid-page; (e) scroll-up re-render at 1.5 vh | 2026-10-01 |

Agents: send the lead one line to add a row (topic, what to look for). Only the lead edits this file.

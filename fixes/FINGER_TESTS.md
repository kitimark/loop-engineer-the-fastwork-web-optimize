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
| 6 | wave-1 combined | after wave 1 lands | full scroll + idle, the number that counts for the goal (60 fps, no frame >50 ms) |

Already done before the disconnect: phone-invisible-shrink (better, all ranges disjoint), nav-morph
(6 runs), commission-forced-layout (within noise), pain-offscreen-notes. I-003 (https on the phone) still
needs one real-device check by its toolsmith's steps.

## Finger-test queue

The iPhone is disconnected (since 2026-10-01): the lead holds the `iphone` lease as
`lead-iphone-offline` so no agent uses it. When you reconnect it, the lead releases the lease and runs
the pending scripted checks (each fix README marks them "iPhone pending") before these tests.

| # | topic | branch / worktree | what to look for | added |
|---|---|---|---|---|
| 1 | nav-morph (topics 3+6, 13) | worktree of `fix-nav-morph` | the bottom of the page: push past the end, the morph panel opening; no stall when the platform section comes in; pushing past the end still starts the morph, dragging back up collapses it, and the page doesn't stick or rubber-band at the end; also **one drag that starts above the end and continues into it without lifting the finger** (no source says Safari keeps later touchmoves cancelable once a scroll starts, `research/architecture/webkit.md`). review-navmorph pass criteria for #6: (a) one continuous drag from ~1 screen above the end into it starts the morph with no jitter between the finger scroll and the `scrollTo` pin; (b) a push past the end starts the morph with no rubber-band; (c) dragging back up collapses it; (d) no stick at the end. For #13: **start scrolling within 1 s of load** (the lazy mount fires ~2 s after load on Safari) and note any hitch in the first scroll or the hero intro | 2026-10-01 |
| 2 | hero-exit-scroll-timeline (topic 7, wave 2) | worktree of `fix-hero-exit` | scroll slowly out of the hero, then fling: copy, orbit cards and scroll cue fade and scatter smoothly (no stepping, the cue never stays invisible); after scrolling back up, the hero is tappable again; same look as the baseline | 2026-10-01 |
| 3 | scroll-engine: toolbar-resize (topics 2+10+12, wave 2) | worktree of `fix-scroll-engine` (URLs once its combined overlay exists) | from the very top, slowly through the hero until the URL bar collapses, then flick up so it expands again: no jump or stutter at the collapse; the hero, commission and future shrink effects still track after the bar settles (height-only resizes are debounced 120 ms) | 2026-10-01 |
| 4 | wave-1 combined | wave-integrator (not yet) | the whole page, top to bottom and past the end | after wave 1 lands |

Agents: send the lead one line to add a row (topic, what to look for). Only the lead edits this file.

# iPhone finger tests (for the user)

Some effects only show under a real finger on the iPhone 15 Pro Max: touch scroll-jack at the page
bottom (`#platform` morph), the Safari toolbar collapsing and expanding, momentum and rubber-band
scrolling. Scripted scrolls (`iphone.mjs scroll`) can't reproduce them, so these tests need you.
Agents never wait for you: they finish their scripted checks, add their finger test to the queue below and
release the phone. The lead starts each test when you say you're ready.

## What you do (about 2 minutes per test)

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

## Queue

| # | topic | branch / worktree | what to look for | added |
|---|---|---|---|---|
| 1 | nav-morph (topics 3+6, 13) | worktree of `fix-nav-morph` | the bottom of the page: push past the end, the morph panel opening; no stall when the platform section comes in | 2026-10-01 |
| 2 | hero-exit-scroll-timeline (topic 7, wave 2) | worktree of `fix-hero-exit` | scroll slowly out of the hero, then fling: copy, orbit cards and scroll cue fade and scatter smoothly (no stepping, the cue never stays invisible); after scrolling back up, the hero is tappable again; same look as the baseline | 2026-10-01 |
| 3 | scroll-engine: toolbar-resize (topics 2+10+12, wave 2) | worktree of `fix-scroll-engine` (URLs once its combined overlay exists) | from the very top, slowly through the hero until the URL bar collapses, then flick up so it expands again: no jump or stutter at the collapse; the hero, commission and future shrink effects still track after the bar settles (height-only resizes are debounced 120 ms) | 2026-10-01 |
| 4 | wave-1 combined | wave-integrator (not yet) | the whole page, top to bottom and past the end | after wave 1 lands |

Agents: send the lead one line to add a row (topic, what to look for). Only the lead edits this file.

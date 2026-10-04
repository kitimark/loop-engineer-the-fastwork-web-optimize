# Other scroll-linked writers: candidates for the hero technique (T-082, code reads only)

Baseline JS `2.DyWL8TcE.js` (pretty lines), CSS `2.gBuqKVzi.css`. "Per frame" means every scroll frame while the
section is in the engine's range (`dE`). Gains are work counts read from the code, not measured. The technique
is the hero's: a CSS scroll timeline (`view-timeline` / `animation-timeline: view()`) drives the value, and the JS
callback goes away.

| # | writer | JS lines | what it writes per frame | fit | expected gain (work counts) | overlap / owner |
|---|---|---|---|---|---|---|
| 1 | hero exit | 4155-4240 | card transforms from the `.hero-track` position | done (R2, `he-on`, touch phones only) | P-095 (phone, G driver, Serious): the JS hero writer ran on ~77 % of hero frames before, ~1.5 % after; frames >34 ms in the band 86 → 46 (sums of 3 runs) | this topic |
| 2 | countdown | 3800-3990 | digit roll from a 1 s `setInterval` + spring | doesn't fit: time-driven, not scroll-driven | none from a scroll timeline; the GPU roll is the analogue | fix-cd-roll-ca (PR-017) |
| 3 | end-of-page morph | 13000-13100 (`dE` 13090) | `--morph` spring from wheel/touch deltas; non-passive `wheel`/`touchmove` (`preventDefault`), `scrollTo` pin (13078) | doesn't fit as is: it eats input, not scroll position. Would need a sticky track whose scroll length drives `--morph` = motion change → proposal | removes the non-passive `touchmove` (every touch move waits for the main thread while within 200% of the section), the per-frame `scrollTo` and the spring loop | fix-morph-gpu (morph), fix-nav-morph (jack) |
| 4 | top bar (nav theme) | 12940-13000 | discrete theme class from a hit test | doesn't fit: an on/off switch, not a continuous value. IntersectionObserver fits better; `view-timeline` + `timeline-scope` is possible but complex | nav-hit-test (in best-build) already cut the per-frame hit test | fix-nav-morph |
| 5 | future section `l` | 11303-11326 (`dE` 11359) | `--future-shrink` with a 0.22-per-frame lerp (11315-11317); 3 rect reads (hero track, card, pain); 3 class/state toggles (hero ≥0.72, `t>0.04`, `.pain is-pain-dark`) | phones: nothing visible left (phone-invisible-shrink in best-build skips the write). Desktop: needs a fallback; the lerp lag is lost → motion change → proposal. The toggles are thresholds → IntersectionObserver, not a timeline | desktop: 1 inherited custom-property write + subtree restyle per frame and ~20 tail frames after each stop → 0 JS. Phone: 3 rect reads/frame → 0 only if the toggles move to observers | fix owner of phone-invisible-shrink (landed) |
| 6 | platform `n` | 12436-12443 (`dE` 12448) | `--platform-shrink` = smoothstep of the card bottom between 85% and 35% of the viewport, no lerp; `is-platform-shrinking` at >0.04 | **easy on desktop, exact**: smoothstep 3t²−2t³ is exactly `cubic-bezier(1/3, 0, 2/3, 1)` (algebra); reduced motion = a step at 0.5. Phone: invisible already (CSS 10990-11016 in best-build) | desktop: 1 rect read + Svelte state write + style-attribute re-parse + `#platform` subtree restyle per frame → 0 JS (the class toggle stays, or moves to an observer) | landed (phone-invisible-shrink, platform-idle) |
| 7 | profile `f` | 10928-10970 (`dE` 10977) | `--profile-scale` + inline transform with a lerp; active profile pick from the position | phones: gated off already (`ce()` false). Desktop: the scale part needs a fallback (lerp lost → proposal); the profile pick is discrete → doesn't fit | desktop only | landed (phone-invisible-shrink) |
| 8 | commission `a` | 3085-3150 (`dE` 3143) | `--commission-enter-shrink`/`--commission-shrink` with a 0.22 lerp, `style.height`, then `Range.getClientRects` | phones: invisible (CSS 918) and cut by commission-forced-layout. Desktop: needs a fallback (lerp + height write → layout) → proposal | desktop only | landed (commission-forced-layout) |
| 9 | pain notes `d` | 4728-4731 (`dE` 4736) | clears the notes once the commission card top < 99.5% of the viewport | doesn't fit: a one-shot trigger. IntersectionObserver fits | 1 rect read per frame within 150% of the section → 0 | pain-offscreen-notes (landed) |
| 10 | future hover popover `A` | 6204-6215 (`dE` 6269) | popover x/y from the hovered card's rect | doesn't fit (position, not progress); desktop hover only (>860 px). CSS anchor positioning would fit | desktop only, only while a popover is open | none |

Platform claims:
- Scroll timelines in Safari: CONFIRMED (MDN browser-compat-data `css/properties/animation-timeline.json`,
  Safari 26); run off the main thread from Safari 26.4 (WebKit blog post 17862): CONFIRMED for the cases that post
  names; WebKit still does a style recalc per frame while scroll-driven animations exist (WebKit main 13a1f2916933):
  CONFIRMED.
- Which properties stay off the main thread: for this page we only checked transform and opacity (the hero).
  `border-radius` and custom properties animated by a scroll timeline (rows 5-8) are **UNRESOLVED**: we have not
  checked a reference for either engine. Decisive local check: a Chrome call tree with the timeline on vs off.
- Smoothstep = `cubic-bezier(1/3, 0, 2/3, 1)`: exact by algebra (Bezier with x(t)=t and y(t)=3t²−2t³).

Proposed order (phone first, since that is where the user felt it):
1. End-of-page morph (row 3): the only remaining writer that still blocks the finger on phones (non-passive
   `touchmove`). A proposal to fix-morph-gpu/fix-nav-morph; motion change, so the user decides.
2. Future section toggles (row 5): phone, 3 rect reads per frame → observers. Not a timeline job; small.
3. Platform (row 6): desktop, exact, easy. No phone gain.
4. Future/profile/commission lerps (rows 5, 7, 8): desktop, each a motion change → one proposal for all three
   ("drop the easing lag"), with a Try-it panel.
Not doing: countdown (row 2), top bar (row 4), pain notes (row 9), popover (row 10).

Lead ruling (T-082 #5, 2026-10-04): 1 end-of-page morph as a scroll-driven proposal, built by fix-hero-exit-threaded on
top of morph-gpu rev 1's code, touch points decided by fix-morph-gpu (coupling with its rev 2 and nav-morph's top bar);
Try-it A = best build, B = the proposal, pixel tiers stated. 2 people-section on-screen checks (phone, small), after 1.
3-4 desktop parts parked until the phone work is done.

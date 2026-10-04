# v8 double drive: where else does the PR-021 pattern apply?

de-v8-double-drive, 2026-10-05. Request: user thread T-154 #2 ("which elements we can adopt this more"), via the lead.
Build: v8 best build (overlay applied from `fixes/v8-best` into topic `v8-double-drive`, JS `2.DyWL8TcE.js`
3e3e94cb6e9f…, CSS `2.gBuqKVzi.css` f836404b3728…). DOM probes only: no timing A/B, no real iPhone.
Every claim below is **OBSERVED** (our probes, Chrome, in our setup) unless marked otherwise.

## The pattern

A **double drive** is an element whose style follows a scroll- or gesture-driven value every frame AND has its own
time-based CSS transition on the same (or a linked) property. Each frame the transition restarts toward the new value,
so the element trails the gesture by up to the transition's duration. PR-021 (fix-nav-earn) fixed the top bar's Join
button this way: `.is-morphing .is-earn { transition: none }`, plus a `calc()` in place of a one-frame
`transform-origin` switch under a driven value.

Retargeting is spec behaviour, not a browser quirk: a change of the computed value while a transition runs cancels
it and starts a new one from the current value (CSS Transitions Level 1, "Starting of transitions", rules for a
running transition, https://www.w3.org/TR/css-transitions-1/#starting). **CONFIRMED** (spec). So WebKit behaves
the same in principle; the Simulator leg (below) was meant to check it on the page.

## Answer in short

- **On phones: nothing new to adopt.** Outside the nav (fix-nav-earn / fix-nav-morph) and the end-menu morph
  (PR-018), no element on the v8 page has a per-frame double drive at 430x775. The future card's 0.9 s transform
  transition does run on phones, but from identity to identity (no visible trail; a cost, already owned).
- **On desktop (1440x900): one real double drive and two one-frame origin jumps**, all in the "shrink" effects that
  the phone CSS switches off. Ranked by visible trail below.

## Ranked table

| # | element | where | driven value | conflicting transition | measured trail | how visible | proposed change | risk (pixel-identical at rest?) | likely owner |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `#people.start-selling-future.is-visible.is-future-shrinking > .start-selling-future-card`, the big white "future" card | desktop, #people section as it scrolls away (y ~4250-5200 at 1440x900) | `--future-shrink` (JS, already eased 22 %/frame, JS ~12149-12168) -> `--future-shrink-scale` -> `transform: scale()` (CSS 2663) | `transform 0.9s cubic-bezier(0.16,1,0.3,1)` from the reveal rule (CSS 2644-2661) | 74 transition runs in the probe, up to 36 in one scroll segment; scroll stop -> transitionend median 732 ms, max 1284 ms. At the stop the scale was 0.982 vs 0.944 where it came to rest: the card kept shrinking for ~0.83 s after the scroll stopped, ~21-27 px drift at its visible edges | **High on desktop**: the card visibly "keeps going" after the wheel stops, and its border-radius (driven by `--future-shrink` with no transition, CSS 2612) leads its scale | Under `.is-future-shrinking` set `transition-property` to keep only opacity/filter (drop transform), so the JS lerp alone drives the scale, exactly the PR-021 move | Pixel-identical at rest: the end values do not change, only the path. Check the reveal (translateY 48 -> 0) still animates: it happens before `.is-future-shrinking` is set. Phones: transform is forced to scale(1) there, no visual change | No owner today. Desktop only; nearest areas: `phone-invisible-shrink` (same writer), `shell-hold-c` (same transition, phone cost) |
| 2 | same card, `transform-origin` flip | desktop, scrolling **up** past the top of the shrink zone (y ~4120-4240) | `.is-future-shrinking` toggles `transform-origin` 50% 50% <-> 50% 100% (CSS 2623/2663) while the trailing scale is still ~0.935 | the 0.9 s transition of #1 keeps the scale away from 1 at the toggle | One-frame jumps of the whole card of -105 px, +175 px, -77 px in three consecutive frames (the class toggled off, on, off at a monotonic scroll-up of ~60 px/frame) | **High on desktop**: a visible shake of the full-width card on a fast scroll up | Put `transform-origin: 50% 100%` on the card's base rule (at scale 1 and at translateY the origin has no effect), so the class no longer flips it; #1 also brings the scale to ~1 before the toggle | Pixel-identical at rest (origin only matters while scaled). The reveal's translateY ignores origin | Same as #1 (one change set) |
| 3 | `.commission.shrinking:not(.entering) .commission-card`, the commission ("fee") card | desktop, commission section, scrolling **up** out of its exit shrink (y ~6100) | `--commission-shrink-scale` (JS lerp, commission `a`, JS ~3290-3326) under a class-switched `transform-origin` 50% 0 <-> 50% 100% (CSS 40-51) | none (no CSS transition); the jump is the origin switch alone, a PR-021 "one-frame origin switch" | Scrolling up: at the class switch the scale was 0.963 and the card moved 24-32 px against a scroll step of 52 px the frame before (~20-27 px one-frame jump). Scrolling down the switch happened at scale 0.9997: no jump | **Medium, desktop only**: a small hitch when you scroll back up into the commission card | Replace the switch with a continuous form, e.g. switch the origin only when the scale is 1, or keep one origin and add the compensating `translateY((1 - s) * Δorigin)` in a `calc()`, as PR-021 did for the logo | Pixel-identical at rest (scale 1). Needs a step-scroll check at both class edges | No owner today (`commission-forced-layout` was a different problem) |
| 4 | nav bar: `header.start-selling-top-nav` width (.68 s) and background-color (.7 s), `.start-selling-top-nav-actions` gap (.68 s) | phone and desktop, the last ~68 ms of the end-menu close | `--morph` < 0.001 drops `.is-morphing`, so the `:not(.is-morphing)` transitions (CSS ~11806, 11889) return while the close is still moving | width .68 s, background .7 s, gap .68 s | Phone: ~5 runs each in the close, trail 1.36-1.39 s, gaps small (width 0.002 px, gap 4 px, color 0.008); desktop: gap 8 px, width 0.5 px | Low: the values are almost at rest when the transitions come back | Name only (excluded): the tail of PR-021's own pattern at the morph end; a `.is-morph-tail` grace class or holding `transition: none` for one frame after `.is-morphing` drops would close it | n/a | **fix-nav-earn** (sent as a coupling), fix-nav-morph |
| 5 | `.is-earn` Join button (max-width .68 s, padding .68 s, opacity .32 s) | phone and desktop, top bar during the morph | `--morph` | as named | Positive control, v8 without PR-021: 31 runs, 25 in one close, trail ~1.37 s, max-width gap 152 px (phone) / 176 px (desktop) | High; this is what PR-021 fixed | PR-021 (rev 2 adds the top-of-page appearance) | n/a | **fix-nav-earn** (excluded) |

### Looked at and not a double drive

- **Nav colour flips** (logo `color` .24 s, language switch colours): `is-on-dark` threshold toggles, 3 per crossing
  segment (on, off, on near the threshold), not per frame. Nav, excluded (fix-nav-morph). Desktop hero-pill nav
  `background-color` (.7 s) the same, 4 runs per segment.
- **Profile tabs** `color` / `font-size` .28 s (desktop): stepped by the active tab, trails 49-299 ms; a designed
  transition, not a per-frame driver.
- **Profile shell** (`.start-selling-profile-shell.is-active-shell`): inline transform and origin follow a JS lerp
  every frame with no CSS transition: smooth, no jump in the geometry watch.
- **Platform card**: `transition: none` already (CSS ~5844); no origin jump seen.
- **Future card on phones**: `.is-future-shrinking` still toggles, the 0.9 s transform transition runs
  `translateY(0)` -> `scale(1)` (2 runs per crossing, trail 749 ms, gap 0). Invisible; its cost (4 profile shells
  get 12 MB backing stores each, a long Composite frame) is `shell-hold-c`'s topic. Change #1 removes this
  transition on phones too, a possible bonus for shell-hold-c to check, not claimed here.
- One-shot reveals (people-o faces, fee visual, platform glints, tab rail): 1-2 runs, not driven.
- No geometry jump on phones outside the nav logo (PR-021's 0 -> 61 px origin).

## Method

1. Static sweep of the v8 CSS for every `transition`/`animation` rule (gitignored helper output), crossed with every
   per-frame writer in the JS (`setProperty`, inline styles, classes computed from continuous values).
2. DOM probe, Chrome via CDP (`probe/dd-probe.mjs` + `probe/instr.mjs`), served by `tools/serve.mjs --overlay`
   (`--vendors=local`), no throttling, no timing. Phone 430x775 DPR 3 mobile; desktop 1440x900. Sequence: load,
   3 s settle; one-viewport scroll segments at 1200 px/s (scrollTo per rAF), each followed by a 1.4 s hold; morph
   open and close with synthetic wheel events (1.6 s each); one fast scroll up at 3x speed.
3. Instrumentation: `transitionrun/cancel/end` on the document (capture), per element+property: runs, runs per
   segment (>= 3 in one segment = retargeted), trail = segment end (scroll stop or morph start) -> `transitionend`,
   gap = computed value vs the running transition's last keyframe (numbers only; it reads 0 for transform lists, so
   the future card's lag is read from the geometry watch instead). Geometry watch: per-frame rect, transform,
   transform-origin and section classes of the commission, future, platform and profile cards and the nav logo;
   a switch of origin or class between frames is reported with the card's movement against the scroll step.
4. `probe/analyze.mjs` turns the raw logs into the per-pair table and the geometry switch list.

Runs: phone `probe-2026-10-04T20-00-44-602Z` (page end y 5189, 0 console errors, 0 HTTP 4xx); desktop
`probe-2026-10-04T20-15-46-006Z` (end y 8448, 0 errors). Output in the worktree's gitignored `out/v8-double-drive/`.

**Simulator (WebKit) leg:** `probe/dd-sim.mjs` (same sequence via WIP; instrumentation is injected after load, so
load-time transitions are not seen) was queued in the shared lane but had not run by the time of writing (queue #8).
The phone result rests on Chrome plus the spec (retargeting is spec-defined, above). The desktop items are
desktop-only by CSS, so WebKit phones are not affected either way.

## Reproduce

```sh
node tools/fix.mjs new v8-double-drive && node tools/fix.mjs apply v8-double-drive --from v8-best
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- \
  node research/v8-double-drive/probe/dd-probe.mjs phone,desktop fixes/v8-double-drive/overlay
node research/v8-double-drive/probe/analyze.mjs out/v8-double-drive/probe-<stamp> phone,desktop
# WebKit: --weight simulator, then: node tools/sim.mjs session --functional --owner <you> -- \
#   node research/v8-double-drive/probe/dd-sim.mjs ; analyze.mjs out/v8-double-drive/sim-<stamp> sim
```

## Caveats

- Chrome at 60 Hz rAF in a headless-style window; trails are wall-clock ms in that setup, not phone numbers.
- Synthetic scroll (scrollTo per rAF) and synthetic wheel for the morph; the finger case is not covered.
- Item 1's drift mixes the JS lerp (by design, ~20 frames) and the CSS transition; with the transition removed the
  JS lerp alone remains (~0.3 s settle), estimated, not measured.

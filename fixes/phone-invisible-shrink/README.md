# Fix: phone-invisible-shrink

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured
**Topic:** see `fixes/TOPICS.md` (phone-invisible-shrink, row 4, **without** commission `a`, which
`commission-forced-layout` owns)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only:
- future callback `l` and its `ne(() => …)` block (baseline 11294-11373, component `mM`)
- platform callback `n` and its `ne(() => …)` block (baseline 12433-12452, component `GM`)
- profile helpers `oe()` / `ce()` (baseline 10779-10784, component `uM`)

No CSS changes.

## Why it lags

research: `research/01-initial-investigation/motion-inventory.md` "section#people.start-selling-future"
and "section#platform", "Ranked suspects" item 3; `research/cpu-throttle-calibration/README.md`
("`l` @302796" and "`f` @296345" are among the top LoAF scripts at every throttle rate).

On every breakpoint where
`(width<=860px), (device-width<=500px), (hover: none) and (pointer: coarse) and (width<=1200px)` matches
(all phones and touch tablets), the CSS switches the shrink effects off:

- CSS 3384-3388 and 3650-3654: `.start-selling-future { --future-shrink-scale: 1; --future-shrink-radius: 0px }`.
  `--future-shrink` is only used in those two variables (CSS 2360, 2378), so on phones its value
  has no visible effect.
- CSS 10990-11016: `--platform-shrink-scale: 1`, `--platform-shrink-radius: 0px`, and
  `border-radius: 0; transform: none` on every `.start-selling-platform-card` selector that uses
  `--platform-shrink` (CSS 5530, 5542, 5579). The inline `--platform-shrink` overrides the
  `--platform-shrink: 0` in that rule, but none of its consumers can show it.
- CSS 3389-3390: `.start-selling-profile-sticky { --profile-scale: 1 }`.

The JS keeps computing and writing these values anyway:

1. **Future `l` (baseline 11303-11326).** Every scroll frame while `#people` is active, and then in its
   own rAF loop until the 22 %-per-frame easing converges (`Math.abs(n - o) >= 8e-4 → rAF(l)`, 11319;
   about 20 frames after scrolling stops), it runs:
   - read `.hero-track` rect (11307);
   - read the card rect `g` (11313);
   - **write** `h.style.setProperty('--future-shrink', o)` (11317). This is an inherited custom property
     on the section root, so the whole `#people` subtree needs a style recalc;
   - on phones only (`t = max-width: 860px`), **read** `v.getBoundingClientRect()` (11323) for the `.pain`
     `is-pain-dark` toggle. That read comes right after the write, so it forces style recalc and layout
     of the dirty subtree inside the callback.

   In the A/A baseline data (fix-countdown-idle-raf's `_aa` run, 10 mobile 6x runs), `l`
   (`2.DyWL8TcE.js:413982`, pretty line 11303, FrameRequestCallback) is the #3 LoAF script: 177 ms in
   20 long frames, **161 ms of it forced style+layout**.
2. **Platform `n` (baseline 12436-12443).** Every scroll frame while `#platform` is active it reads the card
   rect and sets the Svelte state `u`. The template then rewrites the section's inline style
   (`S(h, '--platform-shrink: …')`, 12677): the style attribute is re-parsed and the `#platform` subtree
   restyled. This happens whenever the value changes, i.e. while the card bottom crosses 85 % to 35 % of
   the viewport.
3. **Profile `f` (baseline 10928-10970)** is **already gated on phones**. `ce()` (10782) returns false when
   the phone query `T` matches, so `f` calls `d()` (it re-writes the same reset values every frame: `height: ''`,
   `--profile-scale: 1`, empty transform) and returns without reading rects or scheduling a loop. The TOPICS
   row overstates this part. What is left is that `oe()` and `ce()` call `window.matchMedia(...)`,
   which builds a new `MediaQueryList` (query parse, evaluation, registration with the matcher, later
   GC). That happens up to 4 times per `f` call (`W()` → `ce()` → `oe()`, then `ce()` → `oe()` again),
   on every scroll frame on phones and on desktop.

## What changed

See `patch.diff` (+28 / -5 lines, one file).

- **Future block.** Adds `shrinkOffMq = matchMedia(<the same query as CSS 3384>)`. In `l`, when it
  matches, the easing step, the `--future-shrink` write and the rAF re-schedule are skipped; `o` is set
  to the target (so a later switch to desktop starts from the right value). `z(b, t > 0.04)`
  (`is-future-shrinking`) is still set, so the class list is identical to the baseline. The two side
  jobs (cluster E) are **unchanged**: the `.hero-track` read feeding `is-visible` (11305-11311) and the
  `.pain` `is-pain-dark` toggle (11321-11325). A `change` listener on `shrinkOffMq` re-runs `l` (and is
  removed on teardown), so resizing or rotating into the desktop layout writes the property right away.
- **Platform block.** Same `shrinkOffMq`. When it matches, `z(u, …)` (the inline `--platform-shrink`) is
  skipped; `z(d, a > 0.04)` (`is-platform-shrinking`, which changes the section background, CSS 5536/5574)
  is kept. A `change` listener re-runs the callback so desktop gets the current value right away.
- **Profile.** `oe()` and `ce()` cache their `MediaQueryList`s lazily (`||=`). `.matches` is live, so the
  behaviour is the same on every breakpoint; only the per-call allocation goes away.

Desktop (no query match) runs exactly the baseline code path for future and platform. The only desktop
change is the profile MQL cache.

## Why that is faster

On phones:
- The future section no longer invalidates its whole subtree with a new `--future-shrink` each frame.
  The phone-only `v` rect read in the `.pain` toggle therefore no longer forces style+layout (only the
  first read of the frame, the `.hero-track` rect, may still pay for other callbacks' writes).
- The future easing loop no longer runs ~20 extra rAF frames after every scroll stop. Each of those
  frames read the `.hero-track` rect, read the card rect, wrote the property and did the forced read.
- `#platform`'s inline style is no longer rewritten (Svelte effect + style-attribute parse + subtree
  restyle) while its card crosses the shrink zone.
- `f` no longer builds up to 4 `MediaQueryList`s per scroll frame.

Expected movement: forced style+layout ms and LoAF script ms (the `l` entry), maybe frames > 20 ms.
The cost is concentrated in the stretch of scroll where the future card crosses the shrink zone, plus
the easing tail, so the whole-page scroll fps is not expected to move much.

## Before / after

`node tools/fix.mjs ab phone-invisible-shrink --runs 5`: Chrome, mobile 430x932 DPR3, CPU 6x, ABBA order,
cold cache, served with `--vendors=local --https --latency 150`, at 413a293. Host load 8-20.2 (high: the
wave-1 queue was busy).

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 66.5 [62.7-69.9] | 71.6 [70.7-74.1] | +5.1 (+7.7%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 104 [94-133] | 82 [68-94] | -22 (-21.2%) | within noise |
| scroll: frames >34 ms | 15 [11-17] | 10 [8-13] | -5 (-33.3%) | within noise |
| scroll: frames >50 ms | 6 [5-7] | 5 [4-5] | -1 (-16.7%) | within noise |
| scroll: frames >100 ms | 1 [0-2] | 1 [0-1] | 0 (0%) | within noise |
| scroll: worst frame ms | 108.4 [99.2-117] | 100.4 [90.9-117.6] | -8 (-7.4%) | within noise |
| scroll: p95 frame ms | 25.9 [25.6-33.3] | 25.5 [25.3-25.7] | -0.4 (-1.5%) | within noise |
| scroll: LoAF ms | 361 [284-454] | 299 [257-342] | -62 (-17.2%) | within noise |
| scroll: LoAF script ms | 202 [151-245] | 135 [117-199] | -67 (-33.2%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 94 [46-116] | 31 [27-83] | -63 (-67%) | within noise |
| morph: fps | 105.9 [104.5-107.8] | 108.9 [108.6-109.2] | +3 (+2.8%) | better (ranges do not overlap) |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

A/A noise floor (fix-countdown-idle-raf, mobile 6x, n=5, at 413a293, host load 2.8-5.8): scroll fps
71.4-77, A/A delta 0. Frames >20 ms 54-78 (+6). LoAF 195-283 ms. Forced 34-83 ms. Rule of thumb from
that run: >20 ms deltas under ~15, LoAF deltas under ~80 ms and forced deltas under ~40 ms are noise.
Read against it:
- **Scroll fps +5.1 is the one robust mobile result**: the ranges are disjoint, and every patched run
  (70.7-74.1) beats every baseline run (62.7-69.9).
- Frames >20 ms (-22) and forced style+layout (-63 ms, 4 of 5 patched runs at 27-33 ms vs baseline
  46-116) point the same way. Their ranges overlap because of one outlier each, so they stay "within
  noise".
- Both sides ran at higher host load than the A/A (8-20 vs 2.8-5.8), which is why the baseline fps
  sits below the A/A range.
- The morph-phase fps (+3, disjoint) is plausibly the skipped `#platform` inline-style rewrite: the
  platform callback runs near the page end. It is a small effect and I would not claim it on its own.

**Where the time went** (LoAF top-script attribution in the raw `verify.json`, all 5 runs per side summed,
char offsets mapped to pretty lines):

| script (FrameRequestCallback) | baseline dur / forced (n LoAFs) | patched dur / forced (n LoAFs) |
|---|---|---|
| future `l` (L11303) | 122 / 114 ms (11) | **not present** |
| engine `iE` (L2670) | 224 / 161 ms (14) | 112 / 70 ms (9) |
| commission `a` (L3106, not touched) | 23 / 19 ms (3) | 31 / 27 ms (4) |
| nav IO callback (L13083 → L13106 in overlay, not touched) | 289 / 114 ms (5) | 250 / 92 ms (5) |

The future callback, the #3 LoAF script in the A/A baseline, drops out of the long frames entirely.

**Desktop** (`--viewport desktop --runs 5`, same patch sha256, host load 7.5-17.6, embedded verbatim as
`desktopRun` in `results.json`): every metric is "within noise". Scroll fps is 70.7 [66.3-73.4] →
68.5 [68.4-72], frames >20 ms 125 [111-156] → 148 [127-150], LoAF 426 → 400 ms, forced 67 → 64 ms.
Screenshot diff is 0.1/0/0 %, with no errors or 404s and the morph reached 5/5 on both sides.
On desktop the future and platform code paths are byte-for-byte the baseline branch (the gate query
doesn't match a 1440-wide mouse viewport). The only desktop change is the profile MQL cache, which does
strictly less work, so the desktop medians moving slightly the wrong way are host noise, not a
regression.

**iPhone** (iPhone 15 Pro Max, iOS 26.6.1 Safari, `iphone.mjs scroll` = calibrated scripted scroll).
Plain http from the Mac (`serve.mjs --vendors=local --latency 150`, no `--https`, see I-003). Runs
alternated base/patched, 3 each, while Chrome A/B ran on the Mac:

| iPhone scripted scroll | base1 | base2 | base3 | fix1 | fix2 | fix3 |
|---|---|---|---|---|---|---|
| scroll fps | 52.4 | 52.5 | 53.2 | 56.1 | 55.1 | 55.0 |
| frames >20 ms | 60 | 64 | 60 | 43 | 43 | 40 |
| frames >34 ms | 22 | 18 | 14 | 13 | 10 | 12 |
| frames >50 ms | 5 | 6 | 6 | 4 | 5 | 6 |
| worst frame ms | 97 | 89 | 98 | 83 | 88 | 85 |

On the real phone, fps (52.4-53.2 → 55.0-56.1), frames >20 ms (60-64 → 40-43) and frames >34 ms
(14-22 → 10-13) all have disjoint ranges. Frames >50 ms is unchanged. Idle-phase fps is the same on
both sides (59.1-59.5).

**Regressions:** none. No new console errors and no new 404s. `morphReached` is true 5/5 on both sides
(mobile and desktop). Screenshot diff is mobile 0.12/0/0 % and desktop 0.1/0/0 % (countdown/orbit phase
noise).

## Risks, conflicts, follow-ups

- **Visual parity on phones depends on the CSS override.** The gate uses the exact query of CSS
  3384/3650/10990. If Fastwork changes one without the other, the shrink would stop animating on the
  affected breakpoint. Both queries sit next to each other in the patch comments.
- **Stale inline values on phones.** `--future-shrink` and `--platform-shrink` keep their last
  (invisible) value while the gate matches. A `change` listener on the gate re-runs each callback, so
  resizing or rotating into the desktop layout writes the correct value at once. The future value is
  written directly (`o` already tracks the target), not eased in from a stale value.
- **Future easing tail on phones.** In the baseline, the ~20-frame easing loop also re-ran the two side jobs
  (`is-visible` from `.hero-track`, `is-pain-dark`) after scrolling stopped. On phones they now run on
  every scroll/resize callback but not in a tail. Nothing moves during that tail except the eased value
  itself, so the results are the same. Desktop keeps the loop.
- **Reduced motion:** unchanged. On phones the gate skips the write whatever `e.matches` says, and
  desktop keeps the baseline reduced-motion snap.
- **Cluster C (commission `a`, JS 3101-3128)** is untouched; `commission-forced-layout` owns it and
  applies the same kind of compact-breakpoint gate there.
- **Cluster E:** the `.hero-track` read (11305-11311) and the `.pain` `is-pain-dark` toggle (11321-11325)
  are untouched. fix-hero-exit confirmed its patch doesn't change `.hero-track` geometry.
- **Cluster A (scroll engine):** no `dE(...)` call, gate element or rootMargin changed, and no new rAF loop
  (one fewer on phones). fix-scroll-engine plans to convert `f`/`l`/`n` to its measure/mutate API on top
  of the combined wave-1 overlay.
- **Follow-ups (not done, out of scope):**
  - `l`'s `.hero-track` rect read is only a `progress >= 0.72` test. It could be an IntersectionObserver
    on `.hero-track` with rootMargin `-128% 0px 200% 0px` (suggested by fix-hero-exit). The nav `_`
    (JS 13002-13010) does the same read. This would remove the one remaining forced read in `l`.
  - The profile `d()` reset still re-writes identical values on every phone scroll frame. It is cheap
    (unchanged values), but it could be skipped once reset.

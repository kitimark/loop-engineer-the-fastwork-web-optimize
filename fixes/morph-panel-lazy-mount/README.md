# Fix: morph-panel-lazy-mount

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured in combination (E1: #3+#6+#13+countdown vs pure baseline): mechanism confirmed (the morph IO mount LoAF is gone in 5/5 runs); no solo A/B. Current patch = variant 03 (scroll-aware mount timer); its mechanism check passed: the mount callback is absent from scroll-phase LoAF in 3/3 patched runs with `--idle 0` (`fixes/nav-morph-all-v2`).
**Landing:** with or after countdown-idle-raf 160d69a0 (b6fdbff), never alone.
**Topic:** `fixes/TOPICS.md` #13 `morph-panel-lazy-mount` (found while measuring #3/#6; same owner, cluster B)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, component `dN` (fixed top nav): a new idle-mount
state + effect after the scroll-jack effect (inserted before `var I = uN()`, pretty ~13102), the panel image
`src` template effect (13143), the panel's `cD` countdown call (13160), the panel template effect (13195), the
panel `if` block (13212-13214). No CSS.

## Why it lags

The morph panel (`lN` template, JS 12878: two image columns with 21 `<img>`, a second countdown `cD`, CTAs) is
mounted by `m(W, e => (s(b) || s(E)) && e(ue))` (13212). `b` becomes true in the scroll-jack's
IntersectionObserver callback when `#platform` enters its `200% 0px` rootMargin (13082-13087), i.e. about three
screens before the end, **during a scroll**. The mount (template clone, 21 image elements, countdown mount with
its `bind:offsetHeight` read, `$E` spring setup) runs in that frame.

Evidence (`fixes/nav-hit-test/results.json` raw, 6x mobile, n=5 per side): the top LoAF script in 9 of 10 runs
is this IO callback (char 473884 in the baseline file), 42-75 ms per run with 15-24 ms of forced style/layout
inside it. It is the largest single task of the scroll phase.

## What changed

- **Idle pre-mount:** a new state `__mnt` becomes true in `requestIdleCallback` (timeout 4 s) after `load`
  (`setTimeout` 2 s where rIC is missing, i.e. Safari); the `if` block mounts when `b || E || __mnt`. The panel is
  invisible until the morph starts (opacity from `--morph`, clipped by the 64 px nav, `aria-hidden` while
  `morph < 0.35`), exactly as it is between `b` and the morph start in the original.
- **Scroll-aware timer (variant 03):** a passive `scroll` listener records the last scroll time. When the idle
  callback or the timer fires within 300 ms of a scroll, it re-arms a 300 ms timer instead of mounting, and it
  keeps doing so until the page has been still for 300 ms. A user who scrolls within ~2 s of load (Safari's
  `setTimeout` path, or rIC's 4 s timeout) doesn't get the 40-75 ms mount in the middle of that scroll. The
  listener is removed once the panel is mounted.
- **Synchronous fallback:** `b` and `E` still mount it as before, so if the idle callback hasn't fired when the
  zone is reached or the morph starts, it mounts exactly as today (visuals identical at the morph start either
  way).
- **Images stay lazy:** the panel `<img>` get `src` only when `b || E` (when the original would have created
  them), so the network timing of the 21 images is unchanged and they are fetched/decoded ~3 screens before
  they can be seen, as today.
- **`inert` until `b || E`:** the pre-mounted panel can't take focus or be found by assistive tech earlier than
  in the original (it didn't exist then).
- **Countdown part 1 (for `countdown-idle-raf`):** the panel's `cD` gets `get active() { return s(E); }`, so
  once `countdown-idle-raf` part 2 lands (`animate = visible && r.active !== !1`) the hidden panel countdown
  stops its rAF spring until the morph is active.
- The IO callback and `E` are unchanged (no hunk overlap with #6).

## Why that is faster

The mount work moves out of a scroll frame into an idle period after load; the scroll frame where `#platform`
enters the zone only flips `b` (image `src`, `inert`), which is cheap. Total work is not reduced (the panel
is still built once).

## Before / after

E1 measured variant 01 (39072167); v03 was checked for mechanism only (nav-morph-all-v2, n=3, --idle 0).

No solo A/B. Measured in **E1**: #3+#6+#13+countdown vs pure baseline, the combined `nav-morph-all` (details, table
and load in `fixes/nav-morph-all/README.md`). This is not the cluster's gain on main. Validity: mechanism/attribution,
load 2.9-4.3, timing not claimed; clean host (load1 <= 4.3), combined run.

- **This patch's mechanism:** the morph IO callback (`2.DyWL8TcE.js:473884`) was a top LoAF script in 5/5
  baseline runs (41-50 ms, 15-20 ms forced) and is absent in 5/5 patched runs.
- **Combined deltas** (not attributable to #13 alone): frames >50 ms 4 [4-5] -> 3 [2-4] (within noise; the E1
  criterion "median -1" is met by the median only); frames >20 ms
  70 [57-89] -> 36 [29-40]; LoAF script 150 [125-178] -> 77 [65-80] ms; forced 41 [33-85] -> 13 [6-14] ms.
  morphReached 5/5 both sides; screenshots 0.15 / 0 / 0.13 %.
- **Idle phase:** 0 LoAF on both sides. The mount ran during load, before the 6 s idle window, so this tool
  doesn't see its cost.


## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| morph-panel-lazy-mount/01 | panel pre-mounted in `requestIdleCallback` after load (sync fallback on `b`/`E`), images `src` and `inert` gated on `b \|\| E`, `active` getter for the panel countdown | moves the 42-75 ms mount LoAF (15-24 ms forced) out of the scroll frame | better (mechanism, in combination) | mechanism/attribution, load 2.9-4.3, timing not claimed (E1 combined) | morph IO LoAF present 5/5 -> absent 5/5; E1 combined frames >50 ms 4 -> 3, n=5 | `variants/01.diff`; `fixes/nav-morph-all/README.md` + results.json | T8: moving a hidden mount out of the scroll frame removes that LoAF; the cost moves to load | on branch; solo A/B not run | pending runner: variants/01.diff; mech: panel in DOM before the first scroll with inert and no img src; IO callback absent from scroll LoAF |
| morph-panel-lazy-mount/02 | pause the pre-mounted panel's CSS animations until the morph (architecture review item 4) | no hidden animation work after the early mount | abandoned (already in the baseline) | - | - | CSS 11754; no patch kept (nothing to change) | the panel already has `data-start-selling-scene="paused"` while `!E`, and `.start-selling [data-start-selling-scene="paused"] :where(*)` pauses its column animations; only the countdown remains (needs countdown-idle-raf part 2) | dropped | no patch kept |
| morph-panel-lazy-mount/03 | #01 + the mount callback re-arms a 300 ms timer while a scroll happened in the last 300 ms (rIC and setTimeout paths) | a scroll right after load (Safari fallback 2 s, rIC timeout 4 s) never contains the mount task | pass (mechanism) | mechanism/attribution, load 2.9-4.6, timing not claimed (combined `nav-morph-all-v2`: #3 + #6 v05 + #13 v03 + countdown vs pure baseline, `--idle 0`, n=3) | mount callback (char ~478086) in scroll LoAF 0/3 patched runs; no Idle/Timer callback in any scroll LoAF; morph IO LoAF 3/3 base -> 0/3 | `variants/03.diff` (= current patch.diff); `fixes/nav-morph-all-v2/results.json`, out/ab/nav-morph-all-v2/2026-09-30T23-50-22-142Z | passes, but the run does not show when the mount happened: it may have run during load, before the scroll, so the re-arm path itself was not exercised in Chrome. The Safari case is FINGER_TESTS row 1 (#13: scroll within 1 s of load) | on branch; lands with countdown-idle-raf | pending runner: variants/03.diff; mech: the `__mnt` callback is absent from scroll-phase LoAF with `--idle 0` |

## Risks, conflicts, follow-ups

- The panel's countdown now exists from load instead of from ~3 screens before the end. Until
  `countdown-idle-raf` part 2 honours `active`, its rAF runs for the whole visit (the second countdown); see
  the numbers above for its per-frame cost.
- Load: the mount runs in idle time after `load`. It runs before the 6 s idle window. v03: mounts at rIC/4 s or later, after the first 300 ms without
  scrolling; the --idle 0 check (nav-morph-all-v2) passed but didn't observe when the mount ran.
- Overlaps: the same component as #3/#6 (disjoint hunks; `fix.mjs combine nav-morph-all nav-hit-test
  morph-scrolljack-passive morph-panel-lazy-mount` applies) and the `cD` call site with `countdown-idle-raf`
  (part 1 is here, part 2 is theirs). With #3 applied the per-frame nav hit test no longer invalidates the nav
  subtree, so the mounted panel costs nothing per scroll frame there; without #3, the baseline `pointerEvents`
  toggle would restyle the (now always mounted) panel every frame.

## Pairing (land together)

- **countdown-idle-raf part 2** (their patch.diff sha256 160d69a0…, `__cdActive`): the `active` getter passed here only pauses the hidden panel countdown once
  its `cD` honours `r.active`. Without part 2, the second countdown animates for the whole visit.
- Ablations of this patch without countdown-idle-raf part 2 **and** without #3 measure "minus both": an
  invisible countdown that keeps running, plus a per-frame restyle of the mounted panel. Don't read them as
  the cost of the lazy mount alone.
- **#3 nav-hit-test:** the baseline hit test toggles `pointer-events` on the nav root every scroll frame, which
  restyles the whole nav subtree. With the panel always mounted, that subtree now includes the panel. #3
  removes the toggle.

## Next iteration (architecture review, not in this patch)

- Pause the pre-mounted panel's CSS animations and its countdown until the morph starts (`E`).
  - **CSS animations: already paused in the baseline.** The panel carries
    `data-start-selling-scene="paused"` while `!E` (JS 13195). The rule
    `.start-selling [data-start-selling-scene="paused"] :where(*) { animation-play-state: paused !important }`
    (CSS 11754) pauses the column animations. The nav sits inside `.start-selling`.
  - **Countdown:** still needs countdown-idle-raf part 2 (`active`), see "Pairing".
- Safari has no `requestIdleCallback`: the mount falls back to `setTimeout(2 s)` after `load`, deferred further
  while the user scrolls (variant 03).

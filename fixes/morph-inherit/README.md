# Fix: morph-inherit (correction of st6-rb2's nav morph in WebKit)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta-vs-st6rb2.diff` contain excerpts of Fastwork's code: keep them on local
> branches, never push.

**Status:** measured (counts and pixels; no timing, per "Defer timing")
**Kind:** correctness fix of a landed change. On WebKit, st6-rb2 (C) does not run the baseline's motion.
**Owner:** fix-nav-morph, at the lead's request (2026-10-03). Findings: F-183, F-184.
**Base:** C = st6-rb2, JS 7bf7c4657d21 / CSS f523598b2a24. Fixed C: JS 7c61fe7d0662, CSS unchanged.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, in the nav header component (`uN()` root `I`):
- a writer `__mkW` next to the element bindings;
- one call to it in the header's template effect, after the header's own `--morph` style write;
- one line in the panel block `ue`.

Diff against C: `delta-vs-st6rb2.diff` (35 lines). `patch.diff` is against the baseline and so carries all of
st6-rb2.

## What was wrong

scene-scope R4b, landed in st6-rb2, registers `--morph` as non-inheriting:
`@property --morph { syntax: "<number>"; inherits: false }`. The children that read it take it with an explicit
`--morph: inherit`: the nav bar, logo, actions, earn button and morph panel. The header's template effect writes
`--morph` inline on the header every tween frame.

In WebKit those children do not re-resolve when only the header's value changes. They keep the value from the last
time a header class flipped. Status: OBSERVED, in our setup, cause unknown.
- Simulator, iOS 26.5 (Safari 26.5).
- iPhone 15 Pro Max, read by iphone-runner, 2026-10-03, on 55922 (st6-rb2) and 55926 (strip-tc).

| user path (push past the end), m = 1 | baseline | C | fixed C |
|---|---|---|---|
| children's computed `--morph` | 1 | 0 (panel 0.924-0.941) | 1 |
| logo x (CSS px) | 169.3 | 43.3 | 169.3 |
| earn button width / opacity | 0 / 0 | 110.4 / 1 | 0 / 0 |

- The phone read matches C's column: children 0, logo x 43, earn width 110, panel 0.924.
- Visibly on C: the logo stays at the left and "Join waitlist" stays shown. The panel's fade stays at ~0 until the
  `is-expanded` flip (m > 0.92), then pops in.
- Chrome was right all along. Its frozen frames of C match the corrected build (gate b).

Minimal page (`gates/inherit-mini.html`, no Fastwork code; Simulator, `gates/inherit-mini-sim.mjs`). A child with
`--r: inherit` of a registered `inherits: false` property never follows its parent in any of these cases:
- an inline write;
- an inline write plus an ordinary non-inherited inline change;
- a class rule.

Two controls follow the parent:
- the same property registered `inherits: true`, with explicit inherit;
- an unregistered property.

Reference: UNRESOLVED.
- WebKit main says these children should re-resolve. `StyleBuilder.cpp` `applyCustomProperty()` calls
  `setHasExplicitlyInheritedProperties()` for `inherit` of a non-inherited registered property.
  `StyleTreeResolver.cpp` `computeDescendantsToResolve()` returns `ChildrenWithExplicitInherit` on
  `Change::NonInherited`, and `determineResolutionType()` fully resolves such a child.
- So either Safari 26.5 predates that code, or the parent's change is not detected. No bug report was found.
- Decisive check: the minimal page on a WebKit build from main (Safari Technology Preview / MiniBrowser).

## What changed

The header's writer now also writes the same value inline on the five children:
- `B` bar, `re` logo, `ie` actions and `oe` earn button: bound at component setup;
- `__mkP`, the panel root, set when the panel block mounts.

The write is skipped when the value hasn't changed. A newly mounted panel gets the current value at mount. Inline
`--morph` overrides the `--morph: inherit` rule, which stays in place. In Chrome both give the same value.

Why inline writes rather than dropping `inherits: false` (the lead's preference):
- R4b's point was that a `--morph` write restyles only the header and the elements that use it, not the whole nav
  subtree with the 3 image columns. Inline writes keep exactly that set.
- Making `--morph` inherit again would bring the subtree restyle back. The minimal page shows `inherits: true` plus
  explicit inherit would also fix WebKit, but I did not measure its restyle cost.

## Gates (2026-10-03; Simulator and Chrome shared slots; counts and pixels only)

(a) WebKit (Simulator).
- User path (`gates/inherit-scroll-sim.mjs B,C,M`, `out/f3r/inherit-scroll-2026-10-03T13-55-05-096Z`):
  - fixed C = baseline at rest, open + 2 s (m = 1) and closed + 2 s, for every child's `--morph`, x and opacity, and
    the earn box. Table above.
  - At open + 0.25 s every child equals the header's live value (0.742). The baseline does the same. The m values
    differ because that sample is not frozen.
- Frozen frames: `gates/reveal-sim-frames.mjs B,M,B2`, `out/f3r/simframes-2026-10-03T13-56-07-077Z`. The builds are the
  baseline + hook (bhook a0945967a4fb), and fixed C + hook (mhook d9898e0a2e15), at m 0 / 0.1 / 0.25 / 0.5 / 0.75 / 0.9
  / 1 / 0.
  - The children's state (`--morph`, x, opacity) is identical to the baseline at every m.
  - Pixels are within max channel delta 2 of the baseline, except:
    - m 0.1: max 52, the same as the baseline A/A;
    - m 0.9 and m 1: max 11 / 6, 52 / 0 px over 8, inside the panel's countdown cells (y 425-484). Likely
      anti-aliasing of the panel clock under the panel's scale, and likely a C-vs-baseline difference rather than
      part of this fix. That attribution rests on Chrome only (fixed C vs C is 0 px there); there is no WebKit C-vs-M
      frame at these m with live children to compare, so on WebKit it is OBSERVED, cause unknown.
- Mid-tween time series (after landing, review point: at open + 0.25 s earn opacity 1 in B vs 0.786 in M):
  `gates/tween-series-sim.mjs B,M,C,B2,M2`, `out/morph-inherit/series-2026-10-03T14-20-45-448Z` (fix-nav-morph-main
  checkout), read with `gates/tween-series-read.mjs`. Per rAF frame from the wheel dispatch: header m, each child's
  computed `--morph`, x, width, opacity.
  - Everything `--morph` maps directly matches B at the same m: the children's `--morph` (0 difference), logo x
    (≤ 0.25 px on open), panel opacity (≤ 0.07, at the first tween frame).
  - The earn button differs in time. Its opacity and max-width / padding are CSS transitions (opacity 0.32 s after a
    0.12 s delay, max-width 0.68 s) toward targets that reach 0 once m ≥ 0.2 (`--earn-out` = m / 0.2), so the fade is
    anchored to the frame where m first reaches 0.2, not to m.

    | open tween | B | B2 | M | M2 | C (stale kids) |
    |---|---|---|---|---|---|
    | first frame with m ≥ 0.2, ms after dispatch | 117 | 123 | 70 | 67 | 68 |
    | m on the frame before it | 0.018 | 0.048 | 0.073 | 0.077 | 0.077 |
    | first earn opacity < 0.99, ms after that frame | ≤ 249 (no sample 231-366) | 151 | 144 | 140 | never |
    | earn width < 78 px, ms after that frame | 249 | 277 | 216 | 222 | never |

    In the Simulator the baseline's second tween frame comes ~110 ms after the first, C's and M's ~50 ms after
    (st6-rb2, not this fix; Simulator ms are not judged, F-084). So M's earn fade starts ~50 ms earlier and is
    further along at a given time or m (opacity 0.79-0.81 at m 0.75 vs B2 0.97 at m 0.78; at most 0.25 apart at the
    same time). Measured from the anchoring frame, the opacity fade starts after the same 140-151 ms in B2, M and M2;
    width is 40-60 ms earlier in M (the first frame's smaller m in B retargets the max-width transition from a
    different point). OBSERVED, Simulator, in our setup; the phone check (P-085) decides whether it shows on the device.

(b) Chrome (headless 430x932 DPR 3), `gates/reveal-frames.mjs --builds C,M,C2`,
`out/f3r/frames-2026-10-03T14-00-03-524Z`:
- fixed C vs C is 0 px at m 0.1, 0.75, 0.9 and 1, and max 1 at 0.25 and 0.5. The A/A is max 1 there too.
- At m 0, 0.002 and the final 0, the only changes are in one band, y 225.7-228 (x 103-161 and 293-326): page
  content, the hero's connector lines between the avatars and the shield, not the nav. Per frame (px over 8 / max
  channel delta, `gates/reveal-diff.py <dir> --ref C`):

  | frame | M vs C | A/A (C2 vs C) |
  |---|---|---|
  | k0, m 0 | 549 / 36 | 0 / 1 |
  | k1, m 0.002 | 994 / 47 | 1021 / 141 |
  | k8, final m 0 | 1021 / 94 | 0 / 2 |

  So on k0 and k8 M differs from C there while the A/A does not; only k1 shows an A/A of the same size. The crops show
  the lines' gradient at a different phase, so this is likely animation-phase noise in that band (OBSERVED, cause
  unknown; the fix writes only the nav children's inline `--morph`, and nothing in the nav differs).
- Counts: same as C, see (c).

(c) Restyle and layout counts during the tween, C vs fixed C.

| Chrome, `restyle-chrome.mjs`, M driver 2 cycles, per run | C (2 runs) | fixed C (2 runs) |
|---|---|---|
| style recalcs (UpdateLayoutTree) | 648, 652 | 648, 645 |
| elements restyled (sum of elementCount) | 6348, 6329 | 5929, 6056 |
| layouts | 384, 380 | 383, 381 |

| WebKit (Simulator), `gates/tween-paint-sim.mjs C,M`, per tween frame, 2 cycles | C | fixed C |
|---|---|---|
| style recalcs, open / close | 3.0-3.1 / 3.0 | 3.0-3.1 / 3.0-3.1 |
| layouts, open / close | 2.0 / 2.0 | 3.0-3.1 / 2.6-2.7 |
| paints, open / close | 15.5-15.8 / 13.4-13.5 | 16.5-16.6 / 13.7-13.9 |
| holds m0 / m1 (paints) | 4.3 / 4.5 | 4.7 / 4.5 |

Data: `out/morph-inherit/restyle-chrome-2026-10-03T13-58-59-959Z.json`, `out/f3a/tween-paint-2026-10-03T14-01-10-919Z.json`.

What the fix costs:
- No extra style recalc passes on either engine. Chrome restyles the same number of elements or slightly fewer.
- In WebKit the corrected morph does about +1 layout and +1 paint per open-tween frame (+0.6 / +0.3 on close). Likely
  the motion C had skipped: the logo's `left` moves and the earn button's max-width / padding transition runs. That
  the baseline does the same work is unmeasured: tween-paint-sim had no baseline arm.
- Simulator frames over 34 ms rose from 5/5 to 9/8 per open tween. Simulator ms are not judged (F-084), but on the
  phone this suggests C's morph timing was measured on a lighter morph than the baseline's (see "Consequences").

## Consequences

- Every WebKit number for C's morph counted a morph with stale children (lead's marking, mgmt-ops-10 told
  2026-10-03): P-079's morph attribution, F3 step 1's Simulator tween counts, and the morph parts of any C-stack phone
  run.
- The countdown and hero regions are not affected.
- Builds that stack on st6-rb2 (cd-strip, cd-roll-ca, countdown-faces, platform-idle, hero-exit-threaded) carry the
  same defect in the morph region until this lands under them.

## Tools (this directory; self-contained)

Run `node fixes/morph-inherit/build.mjs` first. It makes every snapshot the gates read (out/snapshots/: mi, c, mhook,
chook, bhook) from the baseline plus `patch.diff` (or the overlay when present) and `delta-vs-st6rb2.diff`, and
refuses any build whose hashes differ from the ones measured. Each gate script's header has its run command.

- `build.mjs`: the snapshot copies.
- `restyle-chrome.mjs`: gate (c), Chrome counts.
- `gates/inherit-probe-sim.mjs`: driver reads, C / M.
- `gates/inherit-scroll-sim.mjs`: gate (a), user path, B / C / M.
- `gates/inherit-mini.html` / `.js`, `gates/inherit-mini-sim.mjs`: minimal page.
- `gates/reveal-sim-frames.mjs` (gate a) / `gates/reveal-frames.mjs` (gate b) / `gates/reveal-diff.py --ref`: frozen
  frames.
- `gates/tween-paint-sim.mjs` C / M, `gates/tween-paint-read.mjs`: gate (c), WebKit counts.
- `gates/tween-series-sim.mjs` B / M / C, `gates/tween-series-read.mjs`: per-frame child state through an open and
  close tween (user path).

Provenance: the data above were taken with the same scripts in `fixes/nav-morph/` (fix-nav-morph's F3 branch, commit
28c36e2), which also carried F3 #4 prototype arms; the copies here drop those arms and write to `out/morph-inherit/`.
The out/f3r and out/f3a data dirs, and the C snapshot dirs those runs read (f3a-st6rb2 / st6-rb2-7bf7c4657d21,
f3r-chook-f6f254402209), are byte-identical to `build.mjs`'s c-7bf7c4657d21 and chook-f6f254402209 (checked with
cmp, 2026-10-03).

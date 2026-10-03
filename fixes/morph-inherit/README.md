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

Minimal page (`fixes/nav-morph/inherit-mini.html`, no Fastwork code; Simulator, `inherit-mini-sim.mjs`). A child with
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
- User path (`fixes/nav-morph/inherit-scroll-sim.mjs B,C,M`, `out/f3r/inherit-scroll-2026-10-03T13-55-05-096Z`):
  - fixed C = baseline at rest, open + 2 s (m = 1) and closed + 2 s, for every child's `--morph`, x and opacity, and
    the earn box. Table above.
  - At open + 0.25 s every child equals the header's live value (0.742). The baseline does the same. The m values
    differ because that sample is not frozen.
- Frozen frames: `reveal-sim-frames.mjs B,M,B2`, `out/f3r/simframes-2026-10-03T13-56-07-077Z`. The builds are the
  baseline + hook (bhook a0945967a4fb), and fixed C + hook (mhook d9898e0a2e15), at m 0 / 0.1 / 0.25 / 0.5 / 0.75 / 0.9
  / 1 / 0.
  - The children's state (`--morph`, x, opacity) is identical to the baseline at every m.
  - Pixels are within max channel delta 2 of the baseline, except:
    - m 0.1: max 52, the same as the baseline A/A;
    - m 0.9 and m 1: max 11 / 6, 52 / 0 px over 8, inside the panel's countdown cells (y 425-484). That is
      anti-aliasing of the panel clock under the panel's scale. It is a C-vs-baseline difference, not part of this
      fix: in Chrome, fixed C vs C is 0 px there.

(b) Chrome (headless 430x932 DPR 3), `reveal-frames.mjs --builds C,M,C2`,
`out/f3r/frames-2026-10-03T14-00-03-524Z`:
- fixed C vs C is 0 px at m 0.1, 0.75, 0.9 and 1, and max 1 at 0.25 and 0.5. The A/A is max 1 there too.
- At m 0, 0.002 and the final 0, the only changes are in the platform noise band y 225.7-228. The A/A shows up to 141
  in that band.
- Counts: same as C, see (c).

(c) Restyle and layout counts during the tween, C vs fixed C.

| Chrome, `restyle-chrome.mjs`, M driver 2 cycles, per run | C (2 runs) | fixed C (2 runs) |
|---|---|---|
| style recalcs (UpdateLayoutTree) | 648, 652 | 648, 645 |
| elements restyled (sum of elementCount) | 6348, 6329 | 5929, 6056 |
| layouts | 384, 380 | 383, 381 |

| WebKit (Simulator), `tween-paint-sim.mjs C,M`, per tween frame, 2 cycles | C | fixed C |
|---|---|---|
| style recalcs, open / close | 3.0-3.1 / 3.0 | 3.0-3.1 / 3.0-3.1 |
| layouts, open / close | 2.0 / 2.0 | 3.0-3.1 / 2.6-2.7 |
| paints, open / close | 15.5-15.8 / 13.4-13.5 | 16.5-16.6 / 13.7-13.9 |
| holds m0 / m1 (paints) | 4.3 / 4.5 | 4.7 / 4.5 |

Data: `out/morph-inherit/restyle-chrome-2026-10-03T13-58-59-959Z.json`, `out/f3a/tween-paint-2026-10-03T14-01-10-919Z.json`.

What the fix costs:
- No extra style recalc passes on either engine. Chrome restyles the same number of elements or slightly fewer.
- In WebKit the corrected morph does about +1 layout and +1 paint per open-tween frame (+0.6 / +0.3 on close). That is
  the motion C had skipped and the baseline does: the logo's `left` moves and the earn button's max-width / padding
  transition runs.
- Simulator frames over 34 ms rose from 5/5 to 9/8 per open tween. Simulator ms are not judged (F-084), but on the
  phone this suggests C's morph timing was measured on a lighter morph than the baseline's (see "Consequences").

## Consequences

- Every WebKit number for C's morph counted a morph with stale children (lead's marking, mgmt-ops-10 told
  2026-10-03): P-079's morph attribution, F3 step 1's Simulator tween counts, and the morph parts of any C-stack phone
  run.
- The countdown and hero regions are not affected.
- Builds that stack on st6-rb2 (cd-strip, cd-roll-ca, countdown-faces, platform-idle, hero-exit-threaded) carry the
  same defect in the morph region until this lands under them.

## Tools (in this directory and `fixes/nav-morph/`)

- `build.mjs`: the snapshot copies (mi, mhook, bhook).
- `restyle-chrome.mjs`: Chrome counts.
- `fixes/nav-morph/inherit-probe-sim.mjs`: driver reads.
- `inherit-scroll-sim.mjs`: user path, B / C / M.
- `inherit-mini.html` / `.js`, `inherit-mini-sim.mjs`: minimal page.
- `reveal-sim-frames.mjs` / `reveal-frames.mjs` / `reveal-diff.py --ref`: frozen frames.

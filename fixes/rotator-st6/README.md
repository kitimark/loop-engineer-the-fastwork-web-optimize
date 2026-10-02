# Fix: rotator-st6 (hero "start selling" avatar rotator, landing candidate)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** landing candidate (lead request 2026-10-01 20:5xZ, after the user's blind finger check). Attribution and
counts only. Timing is deferred per the user's direction, so this fix has no gain block and makes no fps claim.

**Stack:** `patch.diff` is on `fixes/aw1-10e/overlay` (`node tools/fix.mjs apply rotator-st6 --on aw1-10e`). The base
hashes are JS `3e2f599a1632…` and CSS `c6aad94b455f…`. The result is JS `268a68962d18…` and CSS `7e40587580d3…`, the same
bytes as the read-only `snap2/st6` copy that the phone blocks and the finger check served.

**Owner and landing (2026-10-02):** st6's owner is now `fix-scroll-engine` (lead). The layout-containment agent that
wrote it has ended, and `fixes/layout-containment/README.md` stays the evidence record only. st6 lands on RB, not
aw1-10e. That build, with the scene-arm selector it needs (scene-scope R4 coupling), is `fixes/st6-rb/`: PR-003 option A.

## What it changes

The rotator is the 104x32 avatar carousel. Its timer is `window.setTimeout` at JS L11571.

**st5 part (JS + CSS).** The 5 `<img>` slots stay mounted for the page's life. Each tick does two things:
- it updates `src` in place;
- it toggles `.is-sliding` on the carousel.

The old way, a keyed `{#if}` branch that swapped the 4-img and 5-img blocks, is gone. The slide runs the same
keyframes, easings and 220 ms as before, on permanently layered imgs.

**st6 part (CSS only).** Every slot rests at `transform: scale(1); opacity: 0.999`. `avatars-exit` starts and
`avatars-pop` ends at opacity 0.999, not 1. So no style change ever flips:
- `hasTransform()` (transform none ↔ some), or
- `opacity.isOpaque()`.

Either flip makes WebKit's `StyleDifference` `miscDataChangeRequiresLayout` ask for layout.

## Evidence (details: `fixes/layout-containment/README.md`, "st5 split" and "Split result")

**Phone, Safari Timeline** (iphone-runner, 20:20-20:30Z, idle 30 s at y 1500 with the carousel on screen, driver W).
Slide-start ticks with a view-rooted Layout ≥10 ms in tick..+260 ms:

| arm | slide start |
|---|---|
| C (aw1-10e) | 71/71 |
| st5 | 24/35 |
| st5-waapi | 23/35 |
| st5-noanim | 2/35 |
| **st6** | **1/36** |
| V1 (rotator off) | 1/35 |

- Swaps: st6 has 1/35.
- Carousel-rooted Layouts in frame 0 at the start: st6 has 0/36, st5 has 33/35.
- Prediction P-044 ("st6 gone") was a HIT.
- Status:
  - That the flip rule asks for layout is CONFIRMED in WebKit source (`Source/WebCore/style/StyleDifference.cpp`).
  - That the flips are this page's trigger is OBSERVED, and decisive within this block.

**Phone frame columns, info only** (one run per arm, not a gain verdict). Counts of dt>34 / dt>50 / view Layouts
≥10 ms:
- C: 47-52 / 5-11 / 76-81
- st6: 5 / 1 / 9
- V1: 5 / 2 / 5

**Chrome mechanism check** (counts only):
- st6 shows 0 flips per slide cycle; st5 and waapi show 2 or more.
- Screenshots of st6 vs st5 at t = 0, 110 and 215 ms and after the swap differ by 0.00 %.

**User blind finger check** (iphone-runner, console pair, about 20:50Z). The pair was st6 against C aw1-10e, served on
plain http from immutable copies with the hashes checked. The user picked st6 as better.

**Functional check** (`fix.mjs check rotator-st6 --on aw1-10e --viewport mobile --save`, 20:54Z, headless, no
timing): `CHECK OK`, saved as `check.json`.
- Morph reached on both sides.
- 0 console errors and 0 4xx.
- Elements 1509 → 1510: the 5th slot stays mounted.
- Screenshot diff: top 0.15 %, middle 0.01 %, bottom 0.53 %. Bottom is slightly above the 0.4 % phase-noise band; the
  countdown and orbit sit there, and the rotator does not.

There is no `results.json`: by the user's direction there is no A/B timing run, so `check.json` is the results file.

## Caveats

- Opacity 0.999 instead of 1 is invisible (0.00 % screenshot diff), but the imgs blend with their backdrop at
  99.9 %.
- No gain block. Any timing claim waits for the user's go.
- **On the landed stack.** `patch -p1 --dry-run` of this `patch.diff` applies cleanly, with no offset and no fuzz,
  to `bplus` JS (dbd5fdb4f1fb) + RB CSS (scene-scope--r4b overlay, 0d7dfc79e703; RB landed as 8207797).
  - Not measured on that stack.
  - The finger check was on aw1-10e.
- This fixes the rotator's own trigger only. The page-wide background state (F-108, ~65-73 % of idle frames
  view-rooted) is separate.
  - Its 2026-10-01 Sim ablation, on C at y 0, paused all 16 `document.getAnimations()`, or only the CSS ones, or only
    the others. All arms stayed at 71-73 % view-rooted frames, so the cause is not a running animation (OBSERVED).
  - The leading suspect is the countdown's per-frame `span.face` style writes (532 in 8 s).

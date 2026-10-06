# Fix: people-gpu

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts and pixels); look difference, so proposal **PR-031** (Try-it A = v10+CM, B = X2), waiting for the user's decision
**Stage:** F (counts, pixels) done; V (phone) after the decision
**Device class / gate:** render-bound / WebKit layout (Chrome counts + iOS Simulator counts, no timing A/B: memory "defer timing")
**Driver(s) behind the claims:** Chrome trace counts (430x775 DPR 3), iOS Simulator Timeline counts, frozen-frame pixel gate (PR-010 multi-pair)
**Topic:** user T-224 ("People still need people" title lags), owner fix-people-gpu
**Base:** v10 + compositor morph (CM) from int-v8, pins **js a33a6c7c1f2b / css 62743920fe1a @e029592c**. `patch.diff` is
STACKED on that base (`fix.mjs diff people-gpu --on people-gpu-base`); rebase if int-v8's pins change.
**This build (X2):** **js 9e66ff0696b4 / css 592d1f2a8af4**
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`: new `__poFlip(O)` before `function WD(r, i)` (X2 overlay
6941-7014), one call in WD's effect (7125) and its cleanup; `/_app/immutable/assets/2.gBuqKVzi.css`: `[data-fw-po]`
rules before `.start-selling-future-people-o.is-standalone` (X2 overlay 2752-2771).

## Why it lags

- The title's "o" (`.start-selling-future-people-o`, CSS base overlay 2734-2748, baseline JS `WD` at
  site-pretty 6160) opens into a face row by a CSS transition of `grid-template-columns` 0.6042em -> 5.25em and
  `height` 1.0417em -> 1.0833em, 0.92 s `cubic-bezier(0.22, 1, 0.36, 1)`. Both are layout properties: every frame
  re-lays out the title line (the following "ple" moves) and repaints it.
- Measured on v10+CM (430x775, the phone's scripted geometry):

| window | Chrome layouts | Chrome, O transitions off | Simulator layouts | Simulator paints |
|---|---|---|---|---|
| O opens | 56-58 | 2 | 56 (29 whole-view); 29-30 with the rest of the page paused (P) | P: 147-153, ~4.4-4.6 Mpx |
| O closes | 59 | - | P: 25-29 | P: 9.5 Mpx |

- Separately (not this patch): at rest at the title the Simulator shows 104 layouts per 2 s, 56 of them from the
  hero's accent word under the 0.999 card (pg-why bisect) and ~10 whole-view layouts per 2 s from outside the hero
  and #people. The hero part is `fixes/hero-covered-pause` (H1c); the rest is a bisect in progress.

## What changed

Phones only (`(max-width: 860px)`), not under `prefers-reduced-motion`, left-to-right only:

- At runtime the text nodes beside the O are wrapped in `span.fw-po-t` (SSR markup can't change, I-219) and the O
  gets `data-fw-po`, which sets `transition: none` on its size.
- Opening: the O takes 5.25em at once; the parts before it, the O and the parts after it start at
  `translate(±Δ/2, δh/2)` and slide to 0 by WAAPI, Δ = (5.25 − 0.6042) em, δh = (1.0833 − 1.0417) em, 920 ms, same
  easing. No reads: the distances come from the CSS em values.
- Closing: `data-fw-po="hold"` keeps the open size while the parts slide back; `onfinish` takes the closed size (the
  original never clips the vector's right edge, so this keeps the clip exact).
- Interrupts: the new slide starts from the running one's progress (`getComputedTiming().progress`, no layout).
- X2 adds: in FLIP mode the O's opacity fades rest at 0.9999 instead of 1 (vector closed, stack and faces open), so no
  fade crosses opacity 1 (in WebKit a change to or from opaque costs a layout, F-225/F-102). 0.9999 is below one
  8-bit step.

## Why that is faster

The layout properties change once per open/close instead of every frame; the per-frame motion is `translate`, which
both engines run on the compositor. CONFIRMED in WebKit source (safari-7624.5.1.11-branch): `translate` is
accelerated on a RenderBox (RenderLayerBacking.cpp 4411-4421; flex-item spans are blockified, so they qualify); a fully
accelerated time-based animation does not tick the main thread per frame (KeyframeEffect.cpp 2667-2688,
AnimationEffect.cpp 393-395, DocumentTimeline.cpp 349-408).

## Before / after (counts; no timing A/B)

| window | measure | v10+CM | X1 | X2 |
|---|---|---|---|---|
| O opens | Chrome layouts | 56 | 4 | (as X1) |
| O closes | Chrome layouts | 59 | 6 | (as X1) |
| O opens, rest of page paused | Simulator layouts | 30 | 15 | pending |
| O opens, rest of page paused | Simulator paints / px | 153 / 4.6 M | 42 / 0.3 M | pending |
| O closes, rest of page paused | Simulator layouts / px | 25 / 9.5 M | 11 / 2.7 M | pending |

X1's remaining 15 Simulator layouts sit at the face fade ends (opacity reaching 1); X2 targets them. X2's Simulator
counts are queued (one Simulator job at a time during int-v8's phone block).

## Pixels (gate: PR-010 multi-pair A, V, A2, V2; frozen frames, animations seeked)

Chrome X2 vs v10+CM (`out/people-gpu/px-chrome-x2-…`), pixels off by > 8 levels in all four cross pairs and not in A/A:

| stop | share | max level |
|---|---|---|
| rest closed, open at rest (0.92, 1.1 s), rest end | 0 % | ≤ 3 |
| opening 0-0.24 s | 0.08-0.18 % | 91-154 |
| opening 0.33-0.45 s | 0.33-0.35 % | 207-217 |
| opening 0.6-0.78 s | 0.07-0.21 % | 36-103 |
| closing 16-780 ms | ≤ 0.04 % | 31-212 |

Positions ("pe", "ple", the O box, the vector) agree within 0.03 CSS px at every stop. Simulator (X1, same motion):
up to 0.33 %, max level 233 while opening, rest frames equal; A/A over-8 ≤ 0.07 %. The largest differences sit on the
face photo edges (compositor resampling of the moved images) and letter edges: above T2's 128 edge limit, so a look
difference: proposal PR-031. Tried: X3 (face images `backface-visibility: hidden`, css f8948f04b345): unchanged
(max 220), dropped.

Probe caveat: the close stops at 0.92 and 1.1 s still show the hold size because the gate pauses all animations, so
the slide's `onfinish` never fires there; in real play it fires at 920 ms (the O box is 167 px wider only in the
frozen frame).

## Gate scripts

`fixes/people-gpu/gates/`: `pg-chrome.mjs` (Chrome trace counts per arm), `pg-sim.mjs` (Simulator Timeline counts),
`pg-why.mjs` (what drives layouts at the title, pause bisect), `pg-px.mjs` (frozen-frame pixel and position gate,
Chrome and Simulator). All print the served js and css fingerprints per arm.

**Scenarios not run:** reload while scrolled · early input · finger · toolbar resize · real iPhone.

## Risks, conflicts, follow-ups

- Look difference while the faces open (under 1 s): the user decides (PR-031).
- Text wrapping in spans happens at runtime on phones only; the accessible text is unchanged.
- Couples to the O component `WD` (people-avatars / people-word topics touch the same section): stack, don't merge.
- Finding F-320 posted (the technique).

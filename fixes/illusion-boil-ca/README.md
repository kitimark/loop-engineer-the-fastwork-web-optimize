# Fix: illusion-boil-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC, proposed to the user; not accepted yet)
**Stage:** R/I (illusion proposal, de-illusion-style 2026-10-02); no D card yet
**Device class / gate:** phone-only (WebKit acceleration); Chrome counts are unchanged by design
**Driver(s) behind the claims:** Chrome counts probe (no timing), frozen-frame pixel check; phone not run (no phone time before acceptance)
**Prediction:** none filed yet
**Topic:** illusion-boil-ca (research/design-engineering/illusion-style.md, candidate S1)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`, 11 `animation` rules + 2 keyframes. **Stacked on `fixes/user-bplus`** (build B).

## Why it lags

Five always-on effects switch between drawings with a stepped timing function (`step-end`):

- the three idle "boil" frames of the hero accent word (`.is-idle .is-idle-frame-0/1/2`, B CSS l.1298/1301/1305);
- the commission underline boil (`.commission-underline.idle .frame-0/1/2`, l.166/169/172);
- the zero-mark boil (`.zero-frame.frame-0/1/2`, l.681/684/688);
- the referral typing caret (`typing-caret`, l.461) and the agents-ask caret (`start-selling-agents-ask-caret`, l.9145).

On iOS 26.x WebKit does not accelerate an animation whose timing uses `steps()` (F-048/F-065, CONFIRMED:
WebKit `KeyframeEffect.cpp` canBeAccelerated, safari-7624-branch l.1959/1962), so each one ticks main-thread style.
Each step flips opacity 0 <-> 1, which WebKit treats as a Layout difference up to the first layout boundary
(F-075, CONFIRMED, `StyleDifference.cpp` l.191-209). The phone Timeline (F-081, OBSERVED) shows about one small Layout per
boil step at rest outside the accent draw windows.

## What changed

`step-end` -> `linear` on the 11 rules. The three-frame keyframes already jump within 0.01 % of the cycle
(33.32 % -> 33.33 %, 66.65 % -> 66.66 %), so with `linear` each jump is a 0.06 ms ramp on a 0.6 s cycle. The caret
keyframes get the same narrow edge (`typing-caret` 49 % -> 49.95 %; the agents-ask caret is rewritten as
`0%,49.95% {1} 50%,99.95% {0} to {1}`).

Visual: 9 of 9 frozen frames (hero accent, underline, zero mark at t = 100/300/500 ms, all animations of the mark
paused and seeked) are byte-identical PNGs, B vs B+PoC (sha256 equal). The only theoretical difference is a display
frame landing inside a ramp (1 in ~140 boil switches, 1 in ~18 caret blinks at 120 Hz), which shows one blended frame.

## Why that is faster

With a cubic-bezier or keyword `linear` timing, WebKit hands the opacity animation to Core Animation: no
main-thread style per step, and only the start/stop touch style (F-075). Expected effect on the phone: the
~1 small Layout per boil step outside accent draws goes away. **estimate**: needs a phone Timeline count.

## Before / after

Counts only (user direction 2026-10-02 19:27Z: timing deferred). Chrome, 430x932 DPR 3 mobile + touch, CPU 1x,
`--vendors=local --latency 150`, n=1, 9.3 s parked windows, baseline snapshot `b1789284481295-4ad4a84a`, served
hashes B JS `dbd5fdb4f1fb` / CSS `cc8d1340b449`, PoC CSS `d66b95096c16`:

| window | build | RecalcStyle n | ULT elements | Layout n | dirty objects | Animation invalidations | Paint |
|---|---|---|---|---|---|---|---|
| hero (y 0) | B | 903 | 7501 | 29 | 475 | 6335 | 2688 |
| hero (y 0) | B + boil-ca | 891 | 7432 | 30 | 486 | 6287 | 2683 |
| commission | B | 634 | 2739 | 226 | 5201 | 2094 | 707 |
| commission | B + boil-ca | 629 | 2669 | 226 | 5201 | 2076 | 702 |
| agents | B | 1116 | 9606 | 100 | 876 | 7224 | 2352 |
| agents | B + boil-ca | 1116 | 9613 | 100 | 876 | 7224 | 2359 |

No change in Chrome: OBSERVED in our setup, the reason was not checked against Chromium source. The gain claim is WebKit-only. No new console errors or
404s (the 6 avif 404s are B's own).

## Cards (protocol v2)

None yet. On acceptance: a phone Timeline count at rest at the hero and at the commission underline (B vs
B+PoC), plus a CA check that the boils run accelerated (layer count while animating).

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize · rubber band.

## Risks, conflicts, follow-ups

- Each accelerated mark becomes a composited layer while it animates (up to 11 small boxes).
- iOS 26.x only: WebKit main ships threaded time-based animations (F-065), which may accept steps().
- Shares the accent `.is-idle-frame-*` rules with `illusion-accent-wipe` (different properties; they combine
  cleanly: `fix.mjs combine illusion-style-all user-bplus illusion-boil-ca illusion-accent-wipe illusion-typing-chunks`).
- Re-apply: `node tools/fix.mjs apply illusion-boil-ca --on user-bplus`.

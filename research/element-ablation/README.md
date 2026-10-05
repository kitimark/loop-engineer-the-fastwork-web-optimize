# Element ablation: does a group of elements cause a lag? (method)

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). No Fastwork
> code or image bytes are committed here; the ablation CSS and probes live in `fixes/end-bg/`.

**Origin:** user T-193 #10/#12/#17 ("remove all background then try to swipe"), owner fix-end-bg, first use P-137
(`fixes/end-bg/README.md` §2-§4). This note is the reusable method; the end-bg numbers are its first worked example.

**Question it answers:** "is this group of elements (backgrounds, photos, blur layers, ...) where the slow frames come
from?" It answers by removing the group's *paint content* and nothing else, then asking the phone whether the slow frames
go away. It does not answer "which fix", only "is the cause here, partly here, or not here".

## 1. Build the ablation arm

- **Same base, one change.** C = the build the user sees today (a named, pinned build). V = C plus one appended CSS file
  whose rules are all `!important` (end-bg: `nobg.css`, sha d566af712894).
- **Remove paint, keep layout and motion.** Allowed: `background-image: none`, `mix-blend-mode: normal`, `visibility:
  hidden` on replaced elements (`img`, `video`). Not allowed: `display`, size, position, `transform`, `filter`,
  `opacity`, animation or transition properties, anything that changes a box or a script's input.
- **Freeze both arms** as immutable snapshot copies (served JS and CSS hashed before every run; a mismatch voids the
  hold). V is a test build, never a fix: it changes what the user sees.

## 2. Fairness check before any count (Chrome, counts only, shared lane)

The arm is fair only when it removes paint work and leaves the rest alone. Probe: C, V, C, V in one shared slot
(`fixes/end-bg/endbg-chrome.mjs --mode fair`), at phone geometry (430x775 and 430x815, DPR 3, touch).

| check | pass rule |
|---|---|
| element boxes at each position | every box that differs C vs V also differs C vs C (animation phase), or is explained |
| rAF callbacks, Layout, UpdateLayoutTree, timers, observers | equal C vs V within C vs C spread |
| elements restyled | within ~1 % |
| Paint events | equal (the same nodes still paint) |
| RasterTask | lower in V (the point of the arm) |
| listeners, console errors, 404s | unchanged |

If a check fails, fix the arm (or name the side effect in the card) before registering anything. end-bg: boxes equal
except one animation-phase box, script/layout equal, restyles +5 of 1905, paints 564 = 564, raster -33 %: PASS.

## 3. Mechanism census (Chrome, counts only, optional but cheap)

Hold the page still at the positions that matter (finger down, no settle), alternate a control window with the event the
user blames (end-bg: a toolbar step, innerHeight 775 ↔ 815), and count per window: paints by node, raster tasks, layouts,
decodes. Read it per arm, position and direction (`out/end-bg/census-read.mjs` pattern).

- If the same nodes repaint the same number of times in both arms, the *event* triggers the work and the group only
  changes its price (raster). That predicts CONTRIBUTES or NOT SHOWN, not CAUSE.
- Chrome's emulated resize changes every viewport unit, so it over-invalidates against WebKit (OBSERVED in our setup);
  treat the census as a list of candidates, not as phone cost.

## 4. Register before data

Write the card (protocol v2, D-stage) with: arms and pins, driver and procedure, profile, block order, run gates, sentinel,
the metric, the decision table, twins, denominator guard, predictions with probabilities, and what each verdict would
mean next. ops reads it before data; the lead signs it. Nothing is counted until it is signed.

Decision table used by P-137 (per-run counts at the main threshold, ≥ 3 valid runs per arm, both sentinels PASS, else
THIN or VOID):

| verdict | rule | means |
|---|---|---|
| CAUSE | max(V) < min(C) and median(V) ≤ 0.5 × median(C) | the group is the main source: fix card for it |
| CONTRIBUTES | max(V) < min(C) and median(V) > 0.5 × median(C) | it adds cost on top of another cause: fix the other first |
| WORSE | min(V) > max(C) | removing it made things worse: the arm is not fair, re-check §2 |
| NOT SHOWN | ranges touch or overlap | not shown to be here on this device and procedure |

- Denominator guard: if median frame count n differs by more than 15 % of C's, the rule runs on rates s/n.
- Twins (±4 ms) run the same rule; any twin that disagrees marks the result "threshold-sensitive".
- The upper bound: V removes all of the group's paint, so no optimization of those elements (resizing, re-encoding,
  layering) can gain more than C − V. NOT SHOWN therefore also rules out image optimization as a lag fix, while it may
  still save memory and bytes.

## 5. Phone block (the decisive part)

Protocol v2 block: one uncounted warm-up per arm port, a Timeline-off sentinel on C, counted runs in C V V C C V V C
order, at most 2 re-runs of runs that fail a gate (they fall outside the order: say so), an end sentinel on C. Only the
block's own C runs decide (no pooling with earlier C data). Driver G (WDA gesture) with the same script as the run that
showed the lag; profile named in the ticket. end-bg kit: `fixes/end-bg/phone/` (serve, hold, block, read with a
`--selftest`).

## 6. Then the user's eyes

A numbers verdict is followed by the user's blind swipe pair (C vs V, coin-flipped order, `console.mjs post --kind
swipe-pair`), run in the owner's own phone hold after the block. V visibly lacks pictures, so the pair is blind to the
order only; the question is "which one follows your finger better", not "which looks better".

## 7. Pitfalls met

- Synthetic twins in a reader self-test must scale with the count (×1.2 / ×0.8), or the self-test flags its own
  CAUSE case as threshold-sensitive.
- A census in Chrome sees no decode once images are decoded; WebKit's first-paint decode (research/image-cost §2) is a
  separate, first-appearance cost and needs a Simulator or phone read.
- Keep the arm's snapshots and the owner's worktree until the block ends: the runner reads them.

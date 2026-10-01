# Fix: scene-scope

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured: Chrome counts and functional parity; phone attribution blocks 1-3 done. Root hunt for the
remaining layouts is under way (user priority since 20:24Z: layout).
**Stage:** F. Builds V1 and R4b are ready. The D card is below; the lead signs after the root hunt.
**Device class / gate:** phone-only (WebKit's nested style/layout rounds, F-099). Gate: phone Timeline attribution (counts).
**Driver(s) behind the claims:**
- Chrome counts and state probes (`out/scene-scope/*.mjs`, not committed).
- Phone: S (blocks 1-2) and M (block 3), with Timeline, run by iphone-runner.
**Predictions (strict scoring, fixes/PREDICTIONS.md):** P-040 MISS, P-041 HIT, P-045 HIT, P-046 HIT, P-047 FAIL,
P-048 FAIL, P-049 MISS, P-050 MISS, P-051 MISS, P-052 HIT.
**Topic:** see `fixes/TOPICS.md` (scene-scope); user priority 1 ("style recalc")
**Base:** STACKED on B = `fixes/user-bplus/patch.diff` (rebuilt as overlay `bplus`: JS dbd5fdb4f1fb, CSS cc8d1340b449)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only: the paused-scene rule (B 11804-11815, baseline
11754-11758). No JS.

Timing is deferred by the user (2026-10-01 19:27Z): this README makes **no timing claim**. Chrome numbers below are
counts (elements restyled, invalidations, dirty layout objects, layers); durations are info only.

## Why it lags

- Phone (iphone-runner, inspector-clean, B, OBSERVED): the largest style record on the page is the `#platform`
  paused→active switch at y≈2615: RecalculateStyles 29.2-32.2 ms = self 3.7-4.7 + **2 nested Layouts** 25.5-27.5 ms
  (A: 16.7-19.1 = 2.4-2.9 + 14.3-16.2). `research/design-engineering/style-recalc-images.md` §2.1.
- Trigger: `cE` (B JS 2759-2771) writes `data-start-selling-scene` on the scene element (JS 2762).
- The CSS that makes it expensive (B CSS 11804-11815):
  `.start-selling [data-start-selling-scene="paused"] :where(*) { animation-play-state: paused !important }` plus the
  will-change arm. Its subject is universal, so the attribute change invalidates **every descendant** of the scene.
  - WebKit: `AttributeChangeInvalidation` invalidates before and after the change, and only descendants that match
    the full rule (`Invalidator::invalidateIfNeeded` → `ElementRuleCollector::matchesAnyAuthorRules`); with `:where(*)`
    all match. CONFIRMED (WebKit main, `Source/WebCore/style/StyleInvalidator.cpp`, last changed 29dd51e).
  - Blink: universal subject → "invalidates subtree" (Chrome trace, OBSERVED: 2 per flip in C).
- Why the restyle turns into nested Layouts on WebKit (F-099, CONFIRMED by source): a size container on the dirty
  path makes the style resolver skip its descendants (`updateStateForQueryContainer` → `SkipDescendants`, WebKit
  `StyleTreeResolver.cpp`, c0726d0), and `Document::resolveStyle` loops `while (resolver.needsInterleavedLayout())`
  with an interleaved whole-view layout when the render tree needs layout (`Document.cpp`, 079c1e3). One round per
  container nesting level. In B, 279 of #platform's 341 descendants sit under 6 containers, nesting depth 2
  (`.start-selling-platform-stage-visual` `container: built-stage/inline-size` > `.start-selling-platform-secure-
  network-kr-arm` `container-type: size`).
- Why B is larger than A at that flip (lead's question): in A, #platform is still `content-visibility`-skipped at the
  switch (the flip un-skips it: Chrome Layout 17-28 ms, dirty 17-23/1653, layers 64→78); B's one-way un-skip has
  already rendered it, so the switch restyles a live subtree under the containers (Chrome Layout 1.3-3.4 ms, dirty
  15/1653, layers 57→57). The will-change arm does not change the layer count at B's flip (57→57 in C, V1, V1i).

## What changed

**Landing candidate (`patch.diff`, regenerated 20:5xZ) = V1 + R4a + R4b (CSS 0d7dfc79e703), stacked on bplus.**
- `results.json` is hold 3's run of V1 alone (`fix.mjs ab --on bplus --runs 3`). Its timing columns are host-
  contaminated and not used; only its regression checks count.
- RB has no Chrome A/B, because timing is deferred. Its evidence is the counts, the pixel diffs and phone block 3.
- The V1-only CSS is kept in the untracked `fixes/scene-scope--v1` (851c397012bc).

V1 (overlay `fixes/scene-scope`, CSS 851c397012bc): the two `:where(*)` arms become flat selector lists.

- Animation arm: the scene element itself plus the subject compound of all **110** non-`none` animation rules in
  `2.gBuqKVzi.css` and DialogHeader (`.frame-0`, `.typing-caret`, the 4 row titles, cred/secure/profile tracks, paid,
  agents, morph-col-track, `.ring.svelte-16rtsv6`, …), `{ animation-play-state: paused !important }`.
- Will-change arm: the scene plus the **16** classes with a non-`auto` will-change, then the /10b
  `[data-fw-wc="0"] { will-change: auto !important }` gate as before.
- Pseudo-elements were never matched by `:where(*)`, so nothing changes there.
- Written as **flat** selectors, not `:is(<list>)`: a multi-argument `:is()`/`:where()` subject is not bucketed and
  is matched against every element on every recalc (F-098 OBSERVED: flip ULT 17-23 ms vs 7-12 flat; F-100
  CONFIRMED: Blink `rule_set.cc` `ExtractBucketingValues` buckets only `IsSingleComplexSelector`; WebKit
  `RuleSet.cpp` `addRuleToBucket` unwraps only `selectorList->size() == 1`, else `m_universalRules`).

V1i (overlay `fixes/scene-scope--inf`, CSS 298587e0bb94, diagnostic arm): the animation list cut to the **18 infinite**
animations; one-shot entrance animations (≤1.7 s) finish even if their scene pauses mid-way. Not a landing candidate
unless the lead/user accepts that difference.

Visual: identical. `fix.mjs ab scene-scope --on bplus --runs 3` (hold 3) screenshot diff top 0.14 % / middle 0.01 % /
bottom 0 (phase noise band), no new console errors, no new 404s, morphReached 3/3 both sides. Its timing columns
are not used (5 of 6 runs host-contaminated, and timing is deferred).

## Mechanism check (Chrome, counts)

`out/scene-scope/flipprobe.mjs`, 430x775 DPR 3 mobile + touch; park 125 px before each gate, then at CPU 6x trace one
instant 250 px step across it (devtools.timeline + invalidationTracking); 3 reps per flip; hold 2 load1 4.1, hold 3
load1 4.2-9.2 (counts only). Served hashes checked per arm (C css cc8d1340b449 / V 851c397012bc / Vi 298587e0bb94 /
AV 427c6541ddce; JS dbd5fdb4f1fb, A/AV 4606120cf392).

| flip | arm | elements restyled (max ULT) | subtree invalidations | Layout dirty/total | layers before→after |
|---|---|---|---|---|---|
| #platform enter | C = B | 345 | 2 | 15/1653 | 57→57 |
| | V1 | **99** | **0** | 15/1653 | 57→57 |
| | V1i | **23** | 0 | 15/1653 | 57→57 |
| | A (baseline) | 344-354 | 2 | 17-23/1653 | 64-66→78 |
| | A+V1 | 101-109 | 0 | 17-23/1654 | 69-71→83 |
| hero-track leave | C | 239-242 | 2-3 | 15-36/1652 | 135-137→54-59 |
| | V1 | 135-138 | 0-1 | 15-36/1652 | same |
| | V1i | 103-106 | 0-1 | 15-36/1652 | same |
| people leave | C | 272-273 | 2 | 47-48/1233 | 49-54→51 |
| | V1 | 72-89 | 0 | 47-48/1233 | same |
| | V1i | 39-58 | 0 | 47-48/1233 | same |

- Functional, every arm and flip: 0 running CSS animations inside paused scenes; list completeness (in every active
  scene `getAnimations({subtree:true})` targets and every non-`auto` will-change element match the lists): 0 misses.
- Restyled under size containers at the #platform switch: C 279/341 under 6 containers, depth 2; V1 lists 36/41 under
  the 4 stage-visual containers, depth 1, none under `kr-arm`. V1i keeps the same will-change arm (stage-artboard,
  tracks under stage-visual) → also depth 1.
- Info (durations, not judged): #platform ULT C 9.7-12.2 ms, V1 7-12.1, V1i 2-4.6. V1 does not meet the "≤~50
  elements / ULT ≥3x" Chrome target; ~58 other elements restyle in the same recalc. V1i does (23 elements).
- V1-anim-only (the will-change arm left as `:where(*)`) changed nothing: the will-change arm alone still invalidates
  the subtree.

## Phone attribution blocks (iphone-runner, iPhone 15 Pro Max, Timeline, OBSERVED)

### Block 1 (S driver; C = B, V = B+V1, I = B+V1i; 3 counted runs per arm)

#platform switch RS (y≈2615):

| arm | nested Layouts in the switch RS | nested ms |
|---|---|---|
| C | 2/2/2 | 14.2-16.5 + 1.1-1.5 |
| V | raw 2 | 13.7-16.6 + one 0.1 ms non-view layout |
| I | 1/1/1 | 16.3-17.8 |

- RS self: I < V < C.
- P-040 (V: 2 → 1) is a strict MISS. The raw count is 2, and my ticket had no ≥2 ms or view-rooted filter.
  Lesson: define the filter in the ticket.
- P-041 (I: 2 → 1) is a HIT.
- The cost moved: the next big RS, at the y≈2990 crossing (fwReskip, see below), grew. Its RS was
  C 14.0-14.6 ms, V 17.9-21.5, I 21.4-22.6.

### Block 2 (S driver; C = B, I4 = V1i + V4, I40 = I4 minus 4 platform classes from both lists)

V4 is `@property --start-selling-intrinsic-block-size { syntax: "*"; inherits: false }`. I40 is diagnostic only.

| arm | switch nested Layouts | y≈2990 nested Layouts | switch window sum (ms) |
|---|---|---|---|
| C | 2 + a 13-17 ms outside Layout in the same frame | 1/1/1 | 60.9 / 61.1 / 50.2 |
| I4 | 1/1/1 (P-045 HIT) | 1/1/1, 14-19 ms (P-047 FAIL) | 40.7 / 44.3 / 51.9 |
| I40 | 0/0/0, RS 0.1-0.2 ms (P-046 HIT) | 1/1/1, 18-20.5 ms (P-048 FAIL) | 49.3 / 71.2 / 51.0 |

Readings:
- The narrowed lists remove the switch's nested layouts one container level at a time, as the depth model predicts.
- A **12-18 ms view-rooted Layout outside the RS stays in every arm**. Something other than the restyle dirties
  layout at the switch.
- Registering the intrinsic-size property did not remove the y≈2990 nested layout, so that layout is not the
  custom-property restyle.

### Root hunt

- **Correction to an earlier claim.** #platform is already `render=active` at y 2200 (hold 6 pre-state). The un-skip
  does not happen at the switch; the `render` write there writes the same value.
- **H1: the will-change arm restores `will-change` at the switch → Layout. REFUTED (F-106).**
  - WebKit main 7983f7f0e4be:
    - `StyleDifference.cpp` L269-272: `rareDataChangeRequiresLayout` only adds the WillChange context bit.
    - `RenderElement.cpp` L348-351: `adjustStyleDifference` raises the bit to RecompositeLayer, never to Layout.
    - The logic dates from 4046e637b7ca (2015).
  - Chrome state map (hold 7): `.start-selling-platform-card`'s will-change stays `auto` at the switch, because
    bplus's `data-fw-wc="0"` gate holds it until y 2920.
- **The y≈2990 crossing carries two writes in one scroll step (F-107; Chrome y 2920, C and I40):**
  - hero-track `data-start-selling-render=deferred`, which turns `content-visibility` from visible to auto;
  - platform-card `data-fw-wc` 0→1, which restores `will-change: transform, border-radius`.
  - #people pauses one step earlier.
  - Per H1's source, the fw-wc write is compositing only, which makes the c-v flip the lead (H3).
- Simulator check (de-counts-sim's `wkcounts.mjs`, Timeline with initiator stacks): arms C, I40,
  X1 = I40 + `#platform` `animation: none`, and X2 = I40 + deferred render never skips. X1 and X2 are diagnostic only.
- Parked 20:41Z (user T-002), resumed under T-005 (lead: the platform switch only; fwreskip at y≈2990 went to
  fix-scroll-engine with the F-107 notes). X1 and X2 were then dropped for the S0 vs ST check below.
- Method rules kept from the park:
  - Use the W driver (`srwin-sim.mjs`, Timeline depth 10), never a 250 px step walk (de-counts-sim's n2 misses the
    nested layouts).
  - de-counts-sim's w1 shows that the Sim matches the phone's structure at the switch and at y≈2990.
  - Record structure only (nested count, root class, initiator), never Sim ms.
  - F-108 reading rule: note each layout's root, and whether a view-rooted layout was already pending.

### Switch root: the outside layout is the hero avatar rotator (F-111), fixed by rotator-st6 (F-112)

**Phone, existing block 1-2 Timeline** (control B, 6 of 6 runs ss-C1/C6/C8/C11/C16/C18; OBSERVED).
- Scored with `out/scene-scope/rootscore.mjs`: outermost RS with nested Layouts, Layouts outside any RS, and the
  InvalidateLayout / ScheduleStyleRecalculation initiators since the previous Layout.
- Every "12-18 ms view-rooted Layout outside the RS" near the switch is initiated by `before<mi@BSBv9QXB:2188` (SS)
  and `remove<lr@BSBv9QXB:1662` (IL), inside the rotator's setTimeout task (B JS L11571). That task is the keyed
  `{#if}` swap of the 4-img and 5-img carousel blocks (F-088).
- Each 800 + 220 ms cycle gives:
  - S=true (slide start): the swap Layout (12-25 ms), then a second view Layout one frame later (12-17 ms), which is
    the slide-start flip that st6 removes. It shows as "IL loop" because the logger's rAF read forces it.
  - S=false: one swap Layout (12-18 ms).
- The tick is not tied to the switch write. It follows the rotator's own rhythm, and a scripted driver puts it in or
  next to the switch frame in every run:
  - same frame, after the switch RS: C1, C8, C16, C18;
  - C11: the slide-start follow-up lands 18 ms before the RS;
  - C6: ticks at y 2497 / 2528 / 2731.
- The last tick is at y 2731-2812, so the y≈2960 / 2990 layouts are not the rotator. Their initiators are the cE
  write, fwReskip and fwWC (JS 2709); all three were sent to fix-scroll-engine.
- Attribution rule from this: switch (or any crossing in y 1800-2820) attributions must split out layouts whose
  initiators trace to the rotator timer.

**Fix: no new code.** Stack the landed rotator-st6 (f7d3b1b; user blind finger pick on aw1-10e) on bplus + RB.
- ST = S0 + `fixes/rotator-st6/patch.diff`. It applies cleanly: JS 59b23b3f57fd, CSS e9603231b413. S0 = bplus + RB:
  JS dbd5fdb4f1fb, CSS 0d7dfc79e703.
- Immutable copies are in `out/scene-scope/snap2/{S0,ST}` (not committed).

**Sim, W driver** (hold w1, 22:18-22:22Z, shared functional lane, 430x775, 4 runs S01 ST2 ST3 S04; structure only).
Rotator ticks in y 1500-2800:

| arm | ticks | keyed DOM swap | view Layouts ≥1 ms within 60 ms of a tick |
|---|---|---|---|
| S0 | 8 | 8/8 | S=true: 2-3 (~20 ms each); S=false: 1 (~19-21 ms) |
| ST | 8 (same times) | 0/8 | 0 after every tick, S=true and S=false |

- So st5's persistent slots remove the S=false swap Layout, and st6's no-flip rest state removes the slide-start one.
- In ST2 and ST3 a tick lands in the switch frame itself (y 2610/2611, 23 ms after the cE write) and adds nothing.
- The switch RS is unchanged, as expected: S0 19.3-21.5 ms, ST 21.6-22.0 ms, nested 2 in both
  [VIEW 18-20 + 390x312 0.1].
- Left in ST, not the rotator:
  - one engine-initiated 20.7 ms view Layout inside Composite (ST3 y 2712, no JS initiator; F-108 background state);
  - fwWC layouts at y 3041-3073 (fix-scroll-engine).

**Chrome, headless functional check** (`check.mjs`, shared lane, 22:39Z; counts and parity, no timing).
- CHECK OK for both arms: morph reached, 0 console errors, 0 4xx. Element count 1507 → 1508 (the 5th slot stays
  mounted).
- Rotator probe (`out/scene-scope/rotprobe.js`, 5.2 s with the carousel centred, 313 rAFs):

| arm | DOM inserts / removes | imgs | src writes | carousel class toggles | flips (transform none / opacity 1 between rAFs) |
|---|---|---|---|---|---|
| S0 | 81 / 84 | 4-5 | 0 | 0 | 7 |
| ST | 0 / 0 | 5 | 30 | 11 | 0 |

- Screenshots, run 1, ST vs S0: top 0.23 %, middle 0.01 %, bottom 0.51 %. Run 2 (22:59Z) was one check with
  S0, S0b (the same S0 files on a second server: an A/A) and ST:

| shot | S0b vs S0 (A/A) | ST vs S0 | ST vs S0b |
|---|---|---|---|
| top | 0.08 % | 0.12 % | — |
| middle | 0.01 % | 0.01 % | — |
| bottom | 0.00 % | 0.02 % | 0.11 % |

- Run 1's bottom 0.51 % was S0's own variation. `out/scene-scope/pngbbox.mjs` applies the same rule (RGB sum > 48)
  and locates the differing pixels:
  - S0 run 1 vs S0 run 2: 0.44 %, in the same box (css x 22-374, y 0-868);
  - ST run 1 vs ST run 2: 0.00 %.
- Every bottom diff, A/A included, sits in the page-end band (countdown and morph area). The carousel (y≈2130) is not
  in that shot.
- The top diff sits in the A/A's box (x 248-375, y 254-440: orbit and countdown).
- These full-viewport shots do not cover the carousel (it is not in any of the three shots). They say nothing about
  ST's own pixels: see the carousel frame check below, which finds a real difference.
- Run 2's rotator probe repeats run 1: S0 75 inserts / 75 removes and 7 flips; ST 0 / 0 and 0 flips.
- Stacking note: RB's will-change arm does not list `.start-selling-avatars.is-carousel img`. On RB + st6 the 5 slots
  therefore keep their layers while #people is paused, which is st6's stated intent ("its own layer for the page's
  life"). RB's animation arm already covers the st6 imgs through `.start-selling-avatars img`.
- Phone attribution ticket: waits until the phone is reconnected (user T-011).

**Carousel frame check: ST is NOT pixel-identical in Chrome** (headless, shared lane, 23:2x-23:50Z; counts and
pixels, no timing; `out/scene-scope/carframes.mjs`, `carframes2.mjs`, `carcmp.mjs`).
- Method. 430x932 DPR 3, the carousel centred. A setTimeout wrapper keeps the rotator's timers; a MutationObserver
  holds the rotator at every state change: it clears the pending 220 / 800 ms timer (kept for later) and pauses every
  animation. Each slide is captured at carousel-animation phases 0, 20, ..., 220 ms (other animations: finite ones at
  their end, infinite ones at 0, the same in every arm), each rest state once; imgs decoded, 2 rAFs, full-viewport PNG.
  Then the kept callback runs the next tick. 6 holds = 3 rotator cycles = 39 frames per arm. Frames pair across arms by
  state, phase and the visible avatar set, and compare byte-exact over the community pill (390x85 CSS px + 4 px).
- Screen: these runs, the bottom-shot A/A and the visual-risk probe below ran on tools before d00ee9a (I-046), so the
  headless screen was the old `--screen-info` value (756x491 CSS px at DPR 2); the page viewport was the
  device-metrics override (430x932 DPR 3) in every run.
- A/A, S0 vs S0b: byte-identical in 39/39 frames (run 1), 13/13 (run 3, fewer pairs because the arms started at
  different rotator indexes). Positive control: the method sees ST's difference in every frame.

| arm (each vs S0) | what it changes | frames identical | max channel delta | differing device px (of 333,126 in the crop) |
|---|---|---|---|---|
| S0b (A/A) | nothing | 39/39 | 0 | 0 |
| ST | rotator-st6 | 0/39 | 72 | 16.7k-22.7k |
| S0wc | S0 + `will-change: transform, translate, opacity` on the carousel imgs | 0/26 | 71 | ~22k |
| STnw | ST + `will-change: auto` | 0/39 | 7 | ≤2.8k |
| STwo | ST with `will-change: opacity` only | 0/39 | 2 (slide frames 1) | 0.4k-9.1k |
| STwot | ST with `will-change: opacity, translate` | 0/39 | 2 | 0.4k-9.1k |
| STwo1 | STwo + rest opacity 1 instead of 0.999 | 0/39 | 2 | ≤2.8k |
| S0wo | S0 + `will-change: opacity` | 36/39 | 2 | ≤1.5k |

- What it looks like: in ST every avatar is softer (blurred) in every rest and slide frame; the diff is an edge map of
  the photos (`out/scene-scope/carf-rest.png`, `carf-slide100.png`). All differing pixels are inside the 104x32
  carousel; nothing else in the viewport differs beyond the A/A.
- Cause: `transform` in st5's `will-change` list. S0wc (the old keyed carousel with st5's will-change and nothing else)
  reproduces the full difference; any arm without `will-change: transform` drops it to delta ≤7. That Chrome stops
  re-rastering a `will-change: transform` layer when its scale changes ("rastered into a fixed bitmap, which
  subsequently never changes under transform updates") is CONFIRMED by the Chrome 53 note
  (developer.chrome.com/blog/re-rastering-composite). Which raster scale Chrome picks here is UNRESOLVED; the decisive
  check would be the layer's raster scale in a Chrome layer dump.
- Residual without will-change: transform: max delta 1-2 per channel, from st6's opacity 0.999 (ST vs STo1, which only
  sets rest opacity 1: max delta 1) plus delta 2 on some edge px that S0wo also shows. Not byte-identical, but the
  exact difference is: at most 2 of 255 per channel, inside the carousel only.
- Safari: not checked. rotator-st6's own pixel check compared st6 with st5, both with this will-change list, so it
  could not see this. Whether WebKit also keeps a low raster scale for these layers is UNRESOLVED; the decisive local
  check is the same held-frame comparison in the Simulator (the phone is disconnected, T-011).
- Consequence: ST as landed is a visible change in Chrome and cannot be signed under "byte-identical or the exact
  difference stated up front" without stating this blur. The candidate change (for rotator-st6's owner to decide, not
  made here): `will-change: opacity` (or `opacity, translate`) instead of `transform, translate, opacity`. Whether
  that keeps st6's Safari result (0 slide-start and 0 swap layouts, and no layer gain or loss) is untested: it needs a
  Sim structure rerun before it can replace st6's CSS.

### The switch's own RS: I4 vs I40 (recommendation for the lead)

With the rotator tick removed, what is left at the switch is the RS's own nested layouts. Phone block 2 (S driver,
on B, 3 runs per arm):

| arm | list change on top of V1 | switch nested Layouts |
|---|---|---|
| V1 / RB (landed) | — | 2 |
| I4 = V1i + V4 | animation arm cut to the 18 infinite animations; V4 = `@property --start-selling-intrinsic-block-size` | 1/1/1 (P-045 HIT) |
| I40 = I4 minus 4 | also drops `.start-selling-platform-cred-track`, `-secure-currencies-track` and `-profile-reviews-track` from the animation arm, plus those 3 and `-stage-artboard` from the will-change arm | 0/0/0, RS 0.1-0.2 ms (P-046 HIT) |

The model: each arm removes one container nesting level of restyled elements under #platform (F-099).

**Visual-risk probe** (headless, S0 = V1's full list; `out/scene-scope/heldprobe2.js`, walk top → bottom → top,
250 px every 100 ms, 44 steps; tools before d00ee9a (I-046): headless screen 756x491 CSS px at DPR 2, page viewport
430x932 DPR 3 by device-metrics override):
- Positive controls:
  - 372 infinite-animation samples held paused inside paused scenes (the probe sees pausing);
  - 667 finite-animation samples seen, 538 of them running, over 23 names (entry-blur-in, cred-card-in,
    secure-network-*, invoice-*, fee-avatar-pop, …).
- **One-shot animations held paused and unfinished inside a paused scene: 0.** So V1's extra one-shot entries never
  hold anything in this walk, and V1i's cut changes nothing visible here.
- **Paused scenes on screen:** only the morph panel, which is not touched by I4 or I40. #platform is never on screen
  while it is paused. It switches to active about 1 viewport before it enters (Chrome geometry: switch at y 2560,
  #platform top 4082, viewport 775).
- Not covered by the probe: interaction-started one-shots inside a paused scene (menus, tooltips, dialogs in the
  morph panel), and a finger fling that pauses a scene mid-entrance faster than one 100 ms step.

**Risks per arm:**
- I4 (V1i): a one-shot entrance that is running when its scene pauses would finish offscreen instead of resuming
  later. The probe saw none. V4 is inert for visuals: no initial value, so the 100vh fallback still applies.
- I40: the 3 marquee tracks keep animating, and the artboard and tracks keep their will-change layers, while #platform
  is paused. They are never on screen then, so pixels cannot change. The cost moves, though:
  - after the one-way un-skip at y≈2200, these animations run for the rest of the page life, including at the top
    and at the page end;
  - block 2 also saw the y≈2990 nested layout at 18-20.5 ms, against I4's 14-19 (ms are info only; host noise is
    possible).
  - Neither is a pixel risk. Both are a work risk that nothing here has counted yet.

**Recommendation.**
1. Land the I4 list cut on the current stack first: "RBi" = RB with V1i's animation list, with or without V4.
   - Expected: switch nested 2 → 1.
   - Visual risk: none observed (above).
   - Before landing: a pixel A/B of RBi vs RB with an A/A (full-viewport shots, plus held frames of any region whose
     animations RBi changes), on tools at or after d00ee9a, and the phone ticket when the phone is back.
   - Independent of ST: RBi touches only animation-skip lists, not the carousel.
2. Hold I40 until a Sim structure count shows that the unpaused tracks add no background work: idle at the page end
   and back at the top after passing #platform, RS / Layout records per second, RBi vs RBi40.
   - If that count is equal, I40 is the better arm (0 nested, RS ≈0) at the same pixel risk (none).
   - Otherwise stop at RBi.

## Morph start (R4 / V3)

- B's morph start at the page end: RS 16.9-18.8 ms, self 13.7-15.1 (phone, OBSERVED). Writes in one task:
  `--morph` on `.start-selling-top-nav` (JS 13614), `--morph-fade` + pointer-events on `.start-selling-platform`
  (JS 13279), class toggles, and the panel's `data-start-selling-scene` (JS 13567).
- V3 (panel scene) needs no separate change: the panel uses the same attribute, so V1's narrowed rules apply.
- R4a (overlay `fixes/scene-scope--r4` = V1 + `@property --morph-fade { syntax: "<number>"; inherits: false;
  initial-value: 1 }`): `--morph-fade` is read only by `.start-selling-platform`'s own filter/opacity (CSS 5425-5429;
  no other file), so registering it non-inheriting is safe without JS. Same hunk as fix-nav-morph's v04.
- R4b (overlay `fixes/scene-scope--r4b`, CSS 0d7dfc79e703) = R4a plus a CSS-only change, no JS:
  ```css
  @property --morph { syntax: "<number>"; inherits: false; initial-value: 0; }
  .start-selling-top-nav-bar, .start-selling-top-nav-logo, .start-selling-top-nav-actions,
  .start-selling-top-nav-btn.is-earn, .start-selling-morph, .start-selling-morph-pill,
  .start-selling-morph-panel { --morph: inherit; }
  ```
  - JS 13614 writes `--morph` on the nav header. Each of its 7 consumer classes, and the bar between the header and
    the logo/actions, pulls the value with an explicit `inherit`.
  - The rest of the nav subtree no longer restyles per tween frame.
  - `.start-selling-morph` and `-morph-pill` match no element today (dead CSS); they are listed so they stay correct.
  - Chrome (holds 4-5, counts):
    - consumers' computed `--morph` is equal to C's at forced 0, 0.5 and 1;
    - screenshots differ from C by 0-0.15 % at m=1 and m=0.5, against a C-vs-C floor of 0.11-0.14 %;
    - elements restyled at the morph start: C 397 → B+V1 377 → R4a 171 → R4b 124;
    - per tween frame: C 77-80 elements → R4b ≤~25.

Phone block 3 (iphone-runner, M driver `__fwMorphDrive`, 3 forward tweens per run, counted C1 A2 B3 A4 B5 C6 B7 C8 A9;
C = B+V1 851c397012bc, RA = R4a dfb29cc686ee, RB = R4b 0d7dfc79e703, JS dbd5fdb4f1fb in all arms; M sentinels
atOne p95 17/17 ms, pass; phone 35.7 → 38.6 °C, so arms compare at matched positions; OBSERVED):

| arm | start RS total/self ms (tween 1) | nested Layouts in the start RS | nested Layout sum per tween ms (tw1/tw2/tw3, 3 runs) | median tween RS self ms | per-frame RS self median / max ms | fade frames 2-5: self ms / nested |
|---|---|---|---|---|---|---|
| C | 15.3/9.4, 15.5/9.3, 15.0/9.2 | 2/2/2 | 33/44/42, 35/33/30, 38/33/32 | 0.5-0.7 | 1.6-2.7 / 4.1-7.4 | 3.2-7.4 / 1-3 |
| RA | 13.7/8.3, 14.7/9.1, 15.4/9.9 | 2/2/2 | 33/35/33, 33/34/29, 32/26/25 | 0.5-0.8 | 1.6-2.7 / 3.2-5.2 | 1.3-3.0 / 0-2 |
| RB | 15.4/10.0, 15.0/9.4, 16.3/10.4 | 2/2/2 | **3/1/1, 2/2/1, 2/2/1** | **0.1-0.2** | **0.6-0.8 / 2.1-3.5** | **0-1.8 / 0** |

- No arm has an outside Layout ≥2 ms in the tween or its 300 ms lead-in.
- Tweens 2 and 3 have no big start RS in any arm (0.2-0.5 ms), so the start metric is tween 1.
- Strict scoring:
  - P-049 MISS: the start keeps 2 nested Layouts in every arm.
  - P-050 MISS: RA equals C; RB leaves 1-3 ms, not 0.
  - P-051 MISS: start self is equal across arms.
  - P-052 HIT.
- What it means: **RB cuts the morph tween's nested Layouts from 30-44 ms to 1-3 ms per tween.** That is the layout
  that inherited `--morph` dragged through the nav subtree on every tween frame. RA only trims the fade frames.
  The morph start's own 2 nested Layouts come from something else; that is not attributed yet.
- RB still needs an F (finger) correctness and touch check before landing, through the lead's console. G is blocked
  by I-042.
- **Overlap with fix-nav-morph (parked):**
  - fix-nav-morph owns the nav CSS. RB adds the `@property --morph` rule and the `--morph: inherit` hunk on the 7
    consumer classes listed above.
  - RA's `@property --morph-fade` is the same hunk as nav-morph's v04.
  - The lead settles the stacking when nav-morph unparks. Until then, RB lives under r4-v3, which I own.

## Cards (protocol v2)

Attribution card (D), for the lead:
- Frame: phone y≈2615 RS (B: 29-32 ms; 2 nested Layouts). Axis: crossing of the #platform enter gate (top − 2 vh).
- Mechanism: universal-subject paused-scene rule → whole-subtree restyle on the attribute flip → restyled elements
  under size containers → one style round + interleaved layout per nesting level.
- Positive ablation: V1 (narrow lists) — Chrome: subtree invalidations 2 → 0, restyled 345 → 99. Negative sibling:
  V1-anim-only (no change). Decoupling: A vs B (same flip, #platform skipped vs live) moves the cost with liveness, not
  with y.
- Platform claims relied on: WebKit attribute invalidation (CONFIRMED, StyleInvalidator.cpp 29dd51e); WebKit CQ
  interleave per nesting level (CONFIRMED, StyleTreeResolver.cpp c0726d0, Document.cpp 079c1e3); non-bucketed
  `:is()` (CONFIRMED, F-100). WebKit `main` vs iOS 26.6.1: to be checked against the phone counts.

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize ·
rubber band.

## Risks, conflicts, follow-ups

- A future animated class not in the list keeps running while its scene is paused (cost, not visual). The list is
  complete for this snapshot (0 misses). If st5 (scroll-engine) lands, add its carousel selectors
  (`.start-selling-avatars.is-carousel img` will-change; `.is-carousel.is-sliding img.st5-lead`, `img.st5-lead ~ img`,
  `~ img.st5-next` animations); whoever lands second adds them.
- fix-nav-morph: the cdwc `.face` will-change must stay `auto` in the panel; V1 only ever sets `auto`, so it holds.
- V1b (pause via `getAnimations` in `cE`) needs fix-scroll-engine's approval; not built.
- V2 (flip at idle): only if V1 leaves cost.
- V4 (`@property --start-selling-intrinsic-block-size`): measured in block 2 (I4). It did not remove the y≈2990
  nested layout, so it is not a landing candidate on its own.
- Custom-property scope (F-103, CONFIRMED in source):
  - WebKit main c59d70e: an unregistered custom property is inherited rare data, so a change is Change::Inherited and
    all children restyle. A registered `inherits: false` property gives Change::NonInherited, so only children with an
    explicit `inherit` restyle. The exception is a name used in a style container query.
  - Blink b2fe636: `computed_style.cc` ComputeDifference, kInherited vs kNonInherited (source only).

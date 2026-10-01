# Illusions for style recalc and layout (de-illusion-style, 2026-10-02)

User request (2026-10-02, priority 2): find more topics that reduce the complexity of high style recalculation and
compositing, with a result that still looks like the fastwork design; an optical illusion is acceptable; build a
PoC and ask the user to accept. This note covers the **style and layout** side. The sibling `de-illusion-composite`
covers compositing, layers, blur and raster.

Rules followed:
- Counts only, no timing (user direction 2026-10-02 19:27Z).
- Chrome only in two short-lane holds (≤ 300 s).
- No phone time before acceptance.
- Every PoC is an overlay stacked on build B (`fixes/user-bplus`).

Labels: **CONFIRMED** (a reference agrees, cited), **OBSERVED** (our data only, in our setup), **estimate**.

## 1. Inventory: what restyles or lays out per frame or per state change (build B)

Source: de-style-recalc's B trace (Chrome 6x, n=1, `style-recalc-images.md`), my CSS/JS reading, and hold 1 below.

| # | source | kind | cost signal | owner / decision |
|---|---|---|---|---|
| a | doc-sweep row titles (`start-selling-platform-i-doc-sweep`, background-position) | per frame | #1 per-frame UpdateLayoutTree emitter in B (314 ULTs / 323 ms at 6x) | de-illusion-composite (`illusion-sweep`) |
| b | ~20 paid-border / rail `stroke-dashoffset` packets | per frame | Layout per frame on WebKit (F-097) | de-illusion-composite (told about F-097) |
| c | hero accent draw: `stroke-dashoffset` on 3 SVG copies, 1.8 s of every 3.05 s | per frame in windows | phone: 434-445 small Layouts per 20 s inside the windows (F-081); Chrome: hero Paint 2688 per 9.3 s | **S2 `illusion-accent-wipe`** |
| d | step-end boils (hero idle frames, commission underline, zero mark) + 2 typing carets, 11 rules | per step (0.2 s / 0.45 s) | main thread on iOS 26.x (F-048/F-065); opacity 0↔1 flip is a Layout diff (F-075); Chrome Animation invalidations zero-frame 331, underline 203, accent 318, caret 177 per window | **S1 `illusion-boil-ca`** |
| e | referral-fee typing (1 char / 28 ms), "$N" count-up (every frame), agents-ask typing (1 / 32 ms, delete 1 / 18 ms) | per write | Chrome Layout 226 (commission) and 101 (agents) per 9.3 s; agents is inside #platform's size containers (F-099/F-101) | **S3 `illusion-typing-chunks`** |
| f | `.hero` inline `--exit-*` writes while scrolling | per scroll frame | 867 ms / 19 ULTs (max 51 ms) at 6x | fix-hero-exit; not taken |
| g | scene `:where(*)` flips, inherited custom props | state change | the big RS spikes (de-style-recalc) | fix-scene-scope (ranks 1-2); not taken |
| h | nav `is-on-dark` flip (222 elements) + 0.24 s colour transitions on logo/lang switch | state change | small; nav-morph cluster | not built (rejected, §4) |
| i | `.start-selling-platform-service-card.is-animating` layout transitions | - | dead CSS (layout-animations/07) | rejected |

## 2. Split with de-illusion-composite (agreed 2026-10-02)

- **de-illusion-composite:** nav backdrop blur, doc-sweep and the dashoffset border/rail packets, countdown faces,
  morph panel layers, and the static blur/grain/mask/orbit layers.
- **de-illusion-style (this note):** step-end boils, the hero accent draw, typing and count-up writes, and
  scene/custom-prop/CQ/intrinsic-size/layout keyframes.
- **Grey zone:** the hero exit blur and the future-card blur stay with fix-hero-exit.

## 3. Platform facts used

- **F-097** (posted here, CONFIRMED).
  - WebKit `Source/WebCore/style/StyleDifference.cpp`: `svgDataChangeRequiresLayout` returns true when
    `strokeDashOffset` changes. Locations: tag WebKit-7624.4.5 (≈ Safari 26.6) l.104-141, the dashoffset line ~l.131;
    main ~l.160-175.
  - So every frame of a dashoffset animation is main-thread style + SVG layout on Safari.
  - How far up the dirty bit climbs is UNRESOLVED; the decisive check is a phone Timeline Layout root at the accent.
  - This also settles F-081's "why does a dashoffset animation invalidate layout" (it was UNRESOLVED there).
- **F-048 / F-065** (CONFIRMED). On iOS 26.x, `steps()`/`step-end` and `linear(<points>)` keep a time-based CSS
  animation on the main thread (`KeyframeEffect.cpp` canBeAccelerated). The keyword `linear` and `cubic-bezier` are
  accelerated.
- **F-075** (CONFIRMED). On WebKit 26.6, an opacity flip 1 ↔ <1 (and transform none ↔ some) is a Layout diff up to
  the first layout boundary. Accelerated effects tick no main-thread style between start and end.
- **F-099 / F-101** (fix-scene-scope, CONFIRMED by source). In WebKit, an element restyled under a size container
  costs one extra style round plus an interleaved whole-view layout per nesting level. #platform has 6 containers
  at depth 2.
- In Chrome, the boil step-end → linear change moves no count (OBSERVED in our setup; not checked against Chromium
  source). The S1 gain is a WebKit claim only.

## 4. Candidates and choice

Chosen by expected phone gain × visual safety:

| id | idea | look | gain evidence | built |
|---|---|---|---|---|
| S1 | boils + carets `step-end` → `linear` on the existing near-vertical keyframes | pixel-identical (9/9 frozen frames byte-equal) | WebKit acceleration (F-048/F-065, F-075); phone estimate | yes |
| S2 | accent draw → counter-translated clip wipe (transform only) | different transition (wipe vs stroke order), same at rest | Chrome Paint 2688 → 61; WebKit F-097 + F-081 | yes |
| S3 | typing 2 chars/step at half rate, delete 3/step, $ number ≤ 20/s | same speed and text; letters in pairs | Chrome Layout 226 → 97, 101 → 46 | yes |

Rejected or not built:
- **Nav theme** colour transitions and `is-on-dark`: small, and inside the nav-morph cluster.
- **Hero exit writes:** owned by fix-hero-exit, and the phone does not show them.
- **Service-card `is-animating`:** dead CSS.
- **`contain-intrinsic-size: auto` tweaks:** the scroll-engine and layout-containment work already owns the
  content-visibility flips.
- **Profile tab font-size keyframes:** a one-shot state change, not per frame.
- **S2 pixel-identical fallback** (animate only frame 0's paths, 1 of 3 SVGs): kept as the fallback if the user
  rejects the wipe look.

## 5. Results (counts, Chrome, no timing)

Setup:
- Probe `out/de-illusion-style/probe.mjs` (local).
- Chrome 154, 430x932 DPR 3 mobile + touch, CPU 1x, `--vendors=local --latency 150`, n=1.
- Three parked 9.3 s windows: hero at y 0 after a 3 s settle; commission with `.fee-visual` centred; agents with
  the agents-ask field fully visible.
- Snapshot `b1789284481295-4ad4a84a`.
- Served hashes: B JS `dbd5fdb4f1fb`, CSS `cc8d1340b449`; S1 CSS `d66b95096c16`; S2 CSS `58a4048e31f6`; S3 JS `a4424a6bf93c`.
- Hold 1 (19:40Z) ran B, S1 and S2. Hold 2 (~19:49Z) ran B and S3; S3's hold-1 navigation never committed.
- No new console errors or 404s in any build (B's own 6 avif 404s).

Hero window (hold 1):

| build | RS n | ULT elements | Layout n | dirty | Animation inv. | Paint |
|---|---|---|---|---|---|---|
| B | 903 | 7501 | 29 | 475 | 6335 | 2688 |
| S1 | 891 | 7432 | 30 | 486 | 6287 | 2683 |
| S2 | 906 | 6858 | 28 | 446 | 5695 | **61** |

Commission and agents windows:

| hold | window | build | RS n | ULT el | Layout n | dirty | Anim inv. | Paint | text writes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | commission | B | 634 | 2739 | 226 | 5201 | 2094 | 707 | 226 |
| 1 | commission | S1 | 629 | 2669 | 226 | 5201 | 2076 | 702 | 226 |
| 1 | commission | S2 | 629 | 2669 | 225 | 5185 | 2076 | 695 | 226 |
| 2 | commission | B | 627 | 2686 | 226 | 5201 | 2063 | 699 | 226 |
| 2 | commission | S3 | 612 | 2616 | **97** | **2181** | 1993 | 662 | 97 |
| 1 | agents | B | 1116 | 9606 | 100 | 876 | 7224 | 2352 | 107 |
| 1 | agents | S1 | 1116 | 9613 | 100 | 876 | 7224 | 2359 | 107 |
| 2 | agents | B | 1116 | 9603 | 101 | 880 | 7221 | 2353 | 107 |
| 2 | agents | S3 | 1117 | 9599 | **46** | **498** | 7207 | 2306 | 53 |

Hold 2 also logged PrePaint frames (commission 627 vs 612; agents 1117 vs 1117), layout invalidations (289 → 160,
398 → 344) and max elements per ULT (26 / 53, unchanged). Counts are per fixed window, not per frame; the frames
column shows the windows are comparable. Count names follow de-counts-chrome's proposal
(`research/design-engineering/work-counts/probe.mjs` on branch `worktree-agent-abe0b21aa162a7ca2`, not landed yet). Caveat: my probe does not filter to the main frame and thread; the
page has no iframes in these windows.

Visual capture (hold 2, local in `out/proposals/<slug>/`, not committed):
- S1: frozen frames, byte-identical.
- S2: a screencast of one erase + draw cycle and a 12-frame filmstrip.
- S3: screencasts of the agents field and the fee bubble, with strips. Same text, same timing, letters in pairs.

## 6. Proposals and next steps

Each PoC is written as an fw-proposal/1 file in `out/proposals/<slug>/proposal.json`, validated with ts-proposals'
`normalize()`. They are posted to the console once `console.mjs proposal` lands. If the user accepts one, it
becomes a fix topic with a phone ticket via mgmt-ops-6. The phone checks are:
- **S1:** a CA check that the boils animate as layers, plus a Timeline count of small Layouts at rest at the hero
  and at the underline.
- **S2:** a Timeline count of small Layouts inside the draw windows (expected 434-445 → a few per cycle), plus a
  check of every language's accent word for clipping.
- **S3:** a Timeline count of layouts per typed step in the agents card.

The three PoCs combine without conflicts:
`fix.mjs combine illusion-style-all user-bplus illusion-boil-ca illusion-accent-wipe illusion-typing-chunks`.

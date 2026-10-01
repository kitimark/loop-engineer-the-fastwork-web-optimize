# Style recalc and images: the user's two hypotheses checked (de-style-recalc)

Trigger: the user's iPhone sitting on 2026-10-02, A (baseline) vs B (user-bplus: aw1-10e + mw10e-g + cdwc + re-keep-op +
arm-scope-c). The user wrote, verbatim:

> "i was test on the hero section and the end of page, the B quite smoother. i was see the style recalculation was
> took around ~19-20ms sometime. so there cause the lag. ... perfectly we have a budget each frame is 1s/60 = 16ms.
> more than that it will be lag. i suspect 2 things - nested css, they will be cause from query the complex from dom.
> nested css will raise more complexity to find the element. - image size. render trigger. for example image have to
> rotate, i'm not sure resize or not. the engine have to calculate every frame that change. * can we reduce the image
> size ? * can we reduce trigger of render cap in 60 frame. maybe use native css for direct engine use optimized
> logic for handle them"

- **H1**: nested or complex CSS makes style recalcs cost more than 16 ms.
- **H2**: image size and "render triggers" (images that rotate or resize) make the engine recompute every frame.

This note builds on these and cites them rather than re-deriving:
- [`unknowns-render.md`](unknowns-render.md): the y≈1960 listener rebuild §1, U3 container-query layout nested in
  style, U6 image memory;
- [`hero.md`](hero.md), [`postmortem-hero.md`](postmortem-hero.md), [`morph-endpage.md`](morph-endpage.md) (R4, R5);
- `research/architecture/webkit.md` §4 and §8; `research/architecture/claims-audit.md` W12 and Q2;
- `fixes/layout-containment/README.md` (P-028, P14); `fixes/iphone-wave2/README.md` §4a-§4o.

Labels:
- **data**: our own logs, with the file named. All data is OBSERVED, in our setup.
- **vendor source**: engine source, file and line, fetched 2026-10-02 from WebKit main / Chromium main.
- **derived**: our own arithmetic.

Status words follow CLAUDE.md: OBSERVED, CONFIRMED, REFUTED, UNRESOLVED.

Unlike the read-only design-engineering charter, this investigation ran **one Chrome hold** at the lead's request:
- chrome-measure, acquired 18:44Z;
- census and trace probe, n=1 per build, info only;
- baseline snapshot `b1789284481295-4ad4a84a`.

It ran **no phone runs**. The phone data are iphone-runner's captures.

## 0. Answer in plain words

1. **The 19-20 ms "style" costs are real, but nested CSS does not cause them.**
   - The shipped CSS has **no nesting at all**: the build flattens it before shipping.
   - Even if it did, WebKit resolves nesting when it parses the CSS, not on every frame (CONFIRMED, §2.6 W2).
   - Selector matching is about **3 % of style time** (Chrome SelectorStats, §2.4).
2. **The cost is the size of the change, not how complex the selectors are.**
   - A few single attribute writes restyle a whole section at once. One example is the "scene paused/active" switch:
     about 350 elements restyle because one rule ends in `:where(*)`.
   - Safari's "Recalculate Styles" record also **contains the layout it triggers** (U3). So a 32 ms "style" record is
     about 4 ms of style plus 27 ms of layout.
   - In B the largest one is the `#platform` scene switch at y≈2615: **29-32 ms in every B run of the inspector-clean final block** (A: 17-19 ms; B's extra ~11 ms is all nested layout).
     Fast-track topic `scene-scope` targets it (§5, rank 1).
3. **In the hero, style recalc is small on the phone** (the largest record is 4.6 ms in B).
   - The ~20 ms items there are **Layout** records (the hero rotator, ~1 per second) and **Composite** records.
   - Safari's Timeline lists Styles, Layout and Composite in one "Layout & Rendering" lane, so they are easy to read
     as style.
   - The rotator layout already has a phone-tested fix candidate (st4-noswap, P14).
4. **At the end of the page**, B's morph start costs 17-19 ms of style (self 14-15 ms, final block; A has no record ≥10 ms there). Most of it is again scope:
   unregistered custom properties inherited by the nav (~200 elements) and `#platform` (~345), plus the panel's scene
   switch. The candidate fix is R4 (`@property … inherits: false`), which is in nav-morph-all v04, **not in B**.
5. **Images are oversized, but they don't make every frame cost more.**
   - Every image on the page that moves or rotates does so through `transform`/`opacity` on a GPU layer. That
     needs no re-decode and no repaint (CONFIRMED, claims-audit W12/Q2).
   - Phone Paint is at most 2.6 ms per record.
   - Right-sizing the images saves memory: about 35 of ~153 MB decoded, derived. That is insurance against iOS memory
     pressure, which turns `will-change` layers off (webkit.md §4). It is not a per-frame gain.
6. **"Cap the triggers at 60 fps / use native CSS"** is the right instinct.
   - Safari already caps page rendering at 60 Hz (CONFIRMED, CLAUDE.md "Frame thresholds").
   - The page's remaining main-thread "every frame" items are:
     - a few non-GPU CSS animations (`background-position` sweeps, `stroke-dashoffset` packets);
     - the JS writers that B already cut (countdown faces: 5400 → 207 writes per scroll, Chrome MO).
   - Moving those to `transform`/`opacity` is the native-CSS route (§5, ranks 5-6). The gains are small next to ranks
     1-3.

## 1. Data used

| source | what | where |
|---|---|---|
| phone, style-recalc block 1 (iphone-runner, 2026-10-01 ~18:39Z) | A ×3, B ×3 + wB, W driver, Timeline on. A1, B2, B3 and A4 may have had a Mac Web Inspector attached; A5 and B6 are clean. The inspector-clean rerun is pending. | `out/iphone-runner/sr-*.tl.json` (worktree agent-a7696771bf38f1229, gitignored) |
| phone, older captures | 37 captures: p14-*, p11-*, p3-*, ys-*, e-*, mdtl-*, s0-*, f1tl-armload | same dir; runs described in iphone-wave2 §4a, 4g, 4k, 4n, 4o |
| Chrome census + trace, A and B | 430×932 DPR 3 touch, CPU 6x, verify's scrollBy 250 px / 300 ms; categories timeline, stack, invalidationTracking, `disabled-by-default-blink.debug` (SelectorStats); MutationObserver with `attributeOldValue` | `out/de-style-recalc/res/` (my worktree, gitignored); probe `out/de-style-recalc/probe.mjs`, analyzer `tran.mjs` |
| static CSS census | 4 shipped CSS files, 2017 selectors; keyframes census on B's CSS | scratch scripts `selstats.mjs`, `kf.mjs` |

Line numbers:
- "baseline JS/CSS" means `2.DyWL8TcE.js` / `2.gBuqKVzi.css` in `site-pretty/`.
- "B JS/CSS" means the same files in the user-bplus overlay.

WebKit Timeline stack line numbers are already 1-based.

## 2. H1: nested or complex CSS

### 2.1 Phone: every RecalculateStyles record ≥ 10 ms, block 1 (data, `sr-*.tl.json`)

"RS" is the outermost RecalculateStyles. "self" is RS minus the Layouts nested inside it (U3).

| build | y (phone) | RS ms | self | nested Layout | frame ms | trigger (stack) | in B? |
|---|---|---|---|---|---|---|---|
| A ×3 | 1836-1850 | 31.8-32.4 | 12.8-13.1 | 2 × ~19 | 107-109 | morph listener arming at the IO edge: N baseline JS 13063 `addEventListener('wheel', …)` → full style rebuild (unknowns-render §1) | **gone** (arm-scope-c) |
| A ×3 | 2453-2473 | 18.9-21.4 | 1.9-2.4 | 1 × 17-19 | 42-67 | `setProperty('--start-selling-intrinsic-block-size')` baseline JS 2701, forced by a scrollTo/gBCR in rAF | moved: B fwReskip, next row |
| B ×4 | 2987-2992 | 13.3-14.1 | 1.5-1.8 | 1 × 12 | 33-50 | fwReskip B JS 2821 (same property) | yes |
| A ×3 | 2611-2623 | 22.5-25.9 | 3.3-4.1 | 2 × 19-22 | 28-53 | **scene flip** cE baseline JS 2712 `setAttribute('data-start-selling-scene')` from the IO at 2726 | — |
| **B ×4** | **2607-2627** | **18.9 (wB), 31.3-32.0** | 3.4-4.7 | 2 × 15.5-27.5 | 37-56 | **the same scene flip**, cE B JS 2762 from the IO at 2859 | **yes: B's largest** |
| B ×4 | 5260 (end, push/post) | 14.3-17.6 | **11.2-14.2** | 2 × ~3 | 27-28 | morph start E(1); the first flush is `__osb` B JS 13287 (`documentElement.style.overscrollBehaviorY`), after the batch of morph-start writes | yes |

**Final block, inspector closed** (iphone-runner, 2026-10-01 18:55-19:01Z):
- Runs in order A7 B8 B9 A10 A11 B12, after one warm-up per port.
- A = baseline (JS 4606120cf392); B = user-bplus (JS dbd5fdb4f1fb, CSS cc8d1340b449).
- Driver W at 430×775: 6 s idle, scroll, wheel push, 3 s hold. Timeline depth 10.
- Timeline-OFF S sentinels pass: open 60.0 / 52.8, end 60.1 / 53.1. Phone at 42.0-42.6 °C.
- A7 never morphed. Every other run reached the morph.
- The block-1 runs A1-A4 may have had the Mac inspector attached; they are superseded. The rows below **replace the
  table above** for every verdict. Block 1 agrees with them within a few ms. Data:
  `out/iphone-runner/sr-{A7,B8,B9,A10,A11,B12}.tl.json`, `sr2-score.json`.

| y (phone) | A: RS = self + nested L (ms) | B: RS = self + nested L (ms) | trigger |
|---|---|---|---|
| ~1840 | 28.2-29.8 = 11.0-11.6 + 17.2-18.2 | absent | N baseline 13063, wheel listener arming (gone with arm-scope-c) |
| ~2455 | 14.3-15.8 = 1.5-1.6 + 12.8-14.3 | — | baseline 2701 intrinsic-size setProperty |
| ~2615 scene flip | **16.7-19.1** = 2.4-2.9 + 14.3-16.2 | **29.2-32.2** = 3.7-4.7 + **25.5-27.5** | cE baseline 2712 / B 2762 |
| ~2995 | — | 13.4-14.6 = 1.6 + 11.8-13.0 | fwReskip B 2821 |
| 5260 morph start | no record ≥10 ms | **16.9-18.8** = **13.7-15.1** + 3.2-4.2 | `__osb` B 13287 < E 13295 < D 13308 < A 13319 (wheel) |

Count of records ≥16 ms, every run: A has 1 at people and 1 mid; B has 1 mid and 1 at the end.

Per-phase sums of outermost RS (ms, include nested Layout):

| phase | A | B |
|---|---|---|
| hero | 228-252 | 322-330 |
| people | 118-123 | 59-65 |
| mid | 329-346 | 207-222 |
| end | 192-211 (morphing runs) | 236-243 |

In the hero, B has fewer records than A (436-445 vs 529-539) but a ~90 ms larger sum, with no record ≥10 ms.

Two things are new in the final data, both OBSERVED, cause unknown:
1. **B's scene flip is ~11 ms dearer than A's, and all of the extra is nested Layout** (25.5-27.5 vs 14.3-16.2 ms).
   - In A the `#platform` render un-skip happens in the same flip.
   - In B the section was un-skipped earlier (one-way N9/N10). Its full subtree, 6 containers included, is therefore
     live when the scene restyle lands. The /10b `will-change` gate also changes which elements get layers.
   - Candidates are UNRESOLVED; scene-scope's Chrome check (Layout dirty objects per arm) splits them.
2. **B's morph start is real style work** (self 13.7-15.1 ms), and A has no such record. This is the R4 / V3 target.

Per section, all RS records in A1/A4/A5 and B2/B3/B6 (data, `rsan.mjs` HIST=sec):

| phase/section | A p95 / max (ms) | B p95 / max (ms) | ≥16 ms |
|---|---|---|---|
| idle, hero | 1.6 / 3.0 | 2.0 / 3.5 | 0 / 0 |
| scroll, hero | 1.8 / 4.2 | 2.2 / 4.6 | 0 / 0 |
| scroll, people | 0.5 / 2.1 | 0.7 / 2.1 | 0 / 0 |
| scroll, showcase | 0.6 / 0.9 | 0.7 / 0.9 | 0 / 0 |
| scroll, pain band (y 1408-2957; holds the flips above) | 1.7 / 32.4 | 1.2 / 32.0 | 9 / 3 |
| scroll, commission | 0.9 / 2.6 | 1.5 / 14.1 | 0 / 0 |
| scroll, platform | 0.8 / 1.3 | 1.1 / 3.5 | 0 / 0 |
| push/post, platform (morph) | 1.3 / 6.3 | 1.3 / 17.6 | 0 / 2 |

**What the user saw in the hero (data, `lay.mjs`, records ≥12 ms directly under a frame).** In the hero, the ≥16 ms
items are not style:
- **idle-hero Layout** records: n=57 (A) / 35 (B) over three runs each, mean 21-24 ms, max 34-37 ms. This is the
  rotator's whole-view layout (F-058/F-088; P14: st4-noswap removes it, iphone-wave2 §4o).
- **Composite** records of 20-40 ms, explained in unknowns-render U2/U5/U7.

The user's "~19-20 ms" matches those Layout records. The match is OBSERVED; we cannot see which record the user had
selected.

iphone-runner's per-phase sums show B's hero total RS 307-333 ms against A's 236-261 ms (preliminary). Per record it
stays ≤4.6 ms: more small recalcs, cause unknown, not a jank source.

**Older captures (aw1-10e and others, 35 runs).**
- The y≈2610 scene flip was ≥16 ms in only 5 of ~35 runs: p11-L9 32.0, p14-A2 29.3, e-ta1 28.2, f1tl-armload 26.0,
  ys-ysW 24.5. Each time the nested part was 21-27 ms.
- In the other runs, the same cE flip cost 2.3-6.5 ms with no nested layout.
- In B the un-skip of `#platform` (`data-start-selling-render`) has already happened earlier (one-way N9/N10, Chrome
  MO: no render-attribute change on `#platform` during the scroll). The flip is ≥24 ms in 3 of 3 block-1 runs that
  include it (B2, B3, B6) and 18.9 ms in wB.
- Why it was sometimes cheap before is UNRESOLVED. One candidate: whether the containers inside were already
  layout-dirty. The decisive check is the Chrome mechanism check in §5 (dirty objects at the flip).

### 2.2 The shipped CSS (data, static census of 4 files, 2017 selectors)

| measure | value |
|---|---|
| native nesting (`&`, rules inside rules) | **0** (the build ships flat CSS) |
| maximum compound depth | 4 (2 selectors at depth 4) |
| universal descendant selectors | 2: `.start-selling-platform-stage-artboard > *` and the scene pause `[data-start-selling-scene="paused"] :where(*)` |
| `:has()` | 11 (3 page, 2 sb-layout, 6 DialogHeader buttons) |
| `:is` / `:where` / `:not` | 17 / 114 / 110 |
| heavy `:where` lists (≥5 arms) | 1: `html[dir="rtl"] .start-selling :where(h1, h2, h3, h4, p, li, button, a, span)` |
| `@container` rules | 0 (20 `container-type` boxes, used for `cqw` units only) |
| `@property` | 4 in baseline. B registers `--entered`, `--copy-in`, `--hero-orbit-angle`, `--start-selling-grad-angle`, **not** `--morph` / `--morph-fade` (R4 is only in the nav-morph-all / nav-morph-all-v2 patch.diff) |

### 2.3 DOM and the subtrees under each hot toggle (data, Chrome census)

DOM size:
- 1334 elements at the top in A;
- 1507 in B (the morph panel is mounted);
- ~1511 at the bottom.

Elements with `will-change` other than auto: 103 at the top (A) and 89 (B), 7 / 5 at the bottom.

| scene element (`data-start-selling-scene`) | descendants | animating when active | will-change at top (A / B) | containers |
|---|---|---|---|---|
| `section.hero-track` | 399 | 5 | 95 / 85 | 14 |
| `#people` | 352 | 5 | 7 / 3 | 0 |
| `#profile-showcase` | 315 | 5 | 6 / 2 | 0 |
| `section.pain` | 31 | 0 | 0 | 0 |
| `section.commission` | 86 | 3-8 | 0 | 0 |
| `#platform` | 341-345 | 4 paused → **22 active** | 0 → 4-6 active | 6 |
| morph panel (B) | 172 | 5 | 0 | 0 |

Real attribute changes during one scripted scroll, top to bottom (data, MO with `attributeOldValue`, F-020):

| writer | A | B |
|---|---|---|
| countdown `span.face` @style | 5400 | 207 |
| nav header @style (`--morph`) | 122 + 17 | 0 during scroll |
| `section.commission` @style | 87 | 0 |
| `#people` @style (intrinsic size, shrink) | 37 | 0 |
| `.hero` @style (398 descendants) | 20 | 20 |
| scene flips (hero-track, people, showcase, platform; commission ×2) | 1 each | 1 each |
| render deferral flips | 2-3 | 2 |
| artboard / cards `data-fw-wc` (/10b per-element will-change) | — | 5 + 2 + 2 |

### 2.4 Selector matching against invalidation scope (data, Chrome trace at 6x with tracing on, n=1, info only)

| | A | B |
|---|---|---|
| UpdateLayoutTree records / total ms / ≥16 ms | 957 / 5711 / 66 | 886 / 2643 / 29 |
| SelectorStats total matching time | 204.7 ms (**3.6 %**) | 76.1 ms (**2.9 %**) |
| top selector by time | rtl `:where` list 27.96 ms, 19,979 attempts, 0 matches | scene `:where(*)` 14.80 ms, 12,094 attempts, 2600 matches |
| second | scene `:where(*)` 23.13 ms, 2943 matches | rtl `:where` list 5.42 ms, 0 matches |

The largest UpdateLayoutTree events in both builds are the scene flips:
- A: hero-track 71.9-78.7 ms, `#platform` 70.7, profile-showcase 58.4, `#people` 50.9;
- B: hero-track 82.4, `#platform` 81.4, profile-showcase 49.2.

Chrome's InvalidationTracking names the cause at each one: "Invalidation set invalidates subtree" via the selector
`:where(*)`.

Chrome also shows per-frame hero `.hero` inline-style writes (s@4172, forced by l@11308, 108 elements, 40-55 ms at 6x)
that the phone does not show as long RS. Chrome and the phone disagree here (OBSERVED, cause unknown). Price on the
phone.

So **matching is cheap; scope is expensive.** Simplifying selectors could save at most the ~3 % matching share. The
≥16 ms records come from single writes that invalidate hundreds of elements, plus the layout nested in them.

### 2.5 Platform claims

| id | claim | status, reference |
|---|---|---|
| W1 | An attribute change on an ancestor, when a rule's subject is `:where(*)` under that attribute, invalidates **every** descendant: the invalidation ruleset has a universal subject, so the invalidator walks and invalidates the whole subtree. | CONFIRMED, vendor source: WebKit `Source/WebCore/style/StyleInvalidator.cpp` ~205 / ~298 (`invalidateStyleForDescendants`), `AttributeChangeInvalidation.cpp`. Chrome: OBSERVED, InvalidationTracking "invalidates subtree" (§2.4). |
| W2 | CSS nesting has no runtime matching cost: WebKit resolves `&` at parse time, inlined, or wrapped in `:is()` for list parents. | CONFIRMED, vendor source: `CSSSelectorParser.cpp` ~1417 `resolveNestingParent`. Moot here: 0 nesting shipped. |
| W3 | will-change auto ↔ transform is a **Layout** difference when it flips the used z-index or stacking context; otherwise it is only a recomposite. | CONFIRMED, vendor source: `StyleDifference.cpp` ~269 / ~428, `RenderElement.cpp` ~348, `StyleAdjuster.cpp` ~409. claims-audit W1 (F-049): the "whole-view" scope is REFUTED as a property of the change itself. |
| W4 | An `animation-play-state` change alone is StyleDifference Equal (handled in the animation, no layout). | CONFIRMED, vendor source: `CSSAnimation.cpp` ~168-177. So the scene pause costs through its scope (W1) and the will-change part (W3), not through the play-state itself. |
| W5 | A `:has()` in subject position invalidates only its anchor. | CONFIRMED, vendor source: `StyleInvalidator.cpp` ~510-523. The 11 `:has()` here are harmless. |
| W6 | Chrome's SelectorStats lives in category `disabled-by-default-blink.debug`, event `SelectorStats`, args `selector_stats.selector_timings`. | CONFIRMED, vendor source: Chromium `element_rule_collector.cc` ~1466. |
| U3 | WebKit's RecalculateStyles record contains the layout that container queries interleave. | CONFIRMED earlier (unknowns-render U3). P-028 (lc-cq3): removing the container moves that Layout out of RS but **not out of the frame** (−1.5 ms, NULL), so container variants were dropped (layout-containment README, "P11 Block A result"). |

**Verdict H1. REFUTED as "nested or complex CSS"; SUPPORTED as "style recalc spikes".**
- The spikes come from **invalidation scope**:
  - one listener-region full rebuild (A only);
  - whole-section `:where(*)` scene flips that also restore `will-change`;
  - inherited custom properties written on large ancestors (`--start-selling-intrinsic-block-size`, `--morph`,
    `--morph-fade`).
- On WebKit the layout nested in the RS record makes it look like style.

## 3. H2: image size and render triggers

### 3.1 Inventory (data, Chrome census at top and bottom in B; 100 unique images loaded, 148 `<img>`, 0 `srcset`)

Totals:
- decoded at natural size: **153 MB**;
- needed at DPR 3 for the largest rendered box, object-fit-aware: **39 MB**;
- transferred: 9.9 MB.

15 images are ≥2× oversized and hold about **35 MB** of decoded area beyond need (derived). 26 images were never
rendered in either census (hero rotator covers and avatars, off-state roles and portfolios; 60 MB if decoded). WebKit
decodes on first paint, so those cost bytes and memory only when shown.

unknowns-render U6 counted the whole asset set (190 rasters, 577 MB decoded); this table is what the page loads.

| image (group) | natural | rendered max (CSS px) | oversize at DPR 3 | bytes | loading | moves how |
|---|---|---|---|---|---|---|
| `selling/hero/*-cover.jpg` (12 covers; peter 1200×2133, nam 1200×1866) | 656²-1200×2133 | ~122-169 wide | 1.3-3.3× | 45-388 KB | auto (eager) | rotator swap, not animated per frame |
| `selling/roles/*.png` (5, morph panel) | 1282×1282 | 130×215-335 | 1.3-2.0× (cover) | 325-440 KB | eager | parent `.start-selling-morph-col-track` `transform` (compositor) |
| `selling/media/*` (17) | 368×447-819×1024 | 130×346 | ≤2.5× | 4.1 MB total | eager | same column tracks |
| `selling/profile/portfolio-*.jpg` (17) | 960×540 | 130×346 | 2.5× | 1.0 MB total | eager | same |
| `selling/sellers/photographer/service-strawberry.jpg` | 1320×1747 | 175×245 | 2.4× | 425 KB | lazy | none |
| `selling/sellers/sound-composer/post-orchestra.jpg` | 1600×1067 | 175×117 | 3.0× | 323 KB | lazy | none |
| `selling/sellers/*/avatar.jpg` (9) | 480²-730² | 23-59 | 3.6-6.9× | 29-83 KB | lazy/auto | none |
| `selling/sellers/sound-composer/cover.jpg` (vinyl) | 1280×800 | 388×182 | 1.1× | 97 KB | lazy | ancestor `span.record.spinning` `transform` rotate (compositor) |
| `selling/platform/features/secure/network/*` (18) | ≤557×615 | ≤330×366 | ≤1× | 73 KB total | lazy | own `opacity`/`transform` entry animations (compositor) |
| background images (grain.png 390×311, dash.svg) | — | ≤390×311 | — | small | — | dash: `opacity`/`transform` |

### 3.2 What animates, and how

- **Images.** Every `<img>` with an animated ancestor or own animation moves by `transform`/`opacity` only (census:
  `getAnimations()` targets up to 8 levels up): 13 under the morph column tracks, the vinyl record, the
  secure-network rings, faces and flags. 6 images carry a static own transform or filter.
- **Accelerated animations don't re-decode or repaint.** An accelerated `transform`/`opacity` animation runs in Core
  Animation and does not re-resolve style or repaint each frame. CONFIRMED: claims-audit W12 (accelerated property
  list, AcceleratedEffect.cpp) and Q2 (`ticksContinuouslyWhileActive`).
- **Easing caveat.** On iOS 26.x, `steps()` and `linear(<points>)` easings are not accelerated (claims-audit P5,
  CONFIRMED). The commission underline boils use `step-end` on `opacity` (B CSS 165-171). Whether WebKit wakes the
  main thread only at each step is UNRESOLVED; decisive check: Timeline at a static commission section, counting
  RS per second. They are small elements either way.
- **Non-compositor keyframes in use (B CSS, 30 of 97):**
  - `stroke-dashoffset`: the commission underline draw, the accent stroke in/out, and 20 paid-border/rail packets in
    `#platform`.
  - `background-position`: `start-selling-platform-i-doc-sweep` (B CSS 5834), **infinite linear ×6** in `#platform`.
  - `mask-position`: the nav "earn" unmask, once.
  - `clip-path`: avatars-exit (B: after layout-animations; baseline also animated flex-basis/width/margin).
  - Custom properties: `--entered`, `--copy-in`, and `--hero-orbit-angle` (dead, F-015).

  These repaint their element on the main thread while they run and the scene is active.
- **Phone cost of paint.** Paint records total 216 ms per B run (3365 records, max 2.6 ms, `sr-B6`). Image painting
  is not a per-frame term.
- **Composite is the large term** (4.5 s per run, max 87 ms). It is layer flush, paint area and layer creation
  (unknowns-render U2, U5, U7, U12), not image decode.

| id | claim | status, reference |
|---|---|---|
| W7 | WebKit subsamples on decode only above 5 MP. A sync decode is at native size and cached. Async decode goes through the thumbnail path sized to `sizeForDrawing`, only on first paint or off-screen. "Large" means >500 KB decoded. | CONFIRMED, vendor source: `BitmapImageDescriptor.cpp` ~244, `ImageDecoderCG.cpp` ~684-704 |
| W8 | `decoding="async"` adds nothing for large images: `LargeImageAsyncDecodingEnabled` is on by default. A visible image repaints synchronously. | CONFIRMED, vendor source: `RenderBoxModelObject.cpp` ~306-371, UnifiedWebPreferences |
| W9 | Under iOS memory pressure WebKit switches to the Conservative compositing policy and `will-change` stops creating layers. | CONFIRMED earlier, webkit.md §4 (`RenderLayerCompositor.cpp` `requiresCompositingForWillChange`, `updateCompositingPolicy`). Whether this page reaches pressure on the phone is UNRESOLVED (unknowns-render U6). |

**Verdict H2.**
- **Image size: SUPPORTED as memory waste, REFUTED as a per-frame cost** (OBSERVED: no image is re-decoded or
  repainted per frame; phone Paint ≤2.6 ms).
- **"Render trigger": SUPPORTED for a few non-GPU CSS animations and for scroll-linked JS writes, not for images.**
- "Cap at 60" is already Safari's behaviour for page rendering (CONFIRMED). What remains is to stop main-thread work
  per frame: pause or narrow off-screen work (scene-scope), and move animations to `transform`/`opacity`.

## 4. The lead's specific questions

1. **Known causes that still make ≥16 ms style records in B** (block 1, preliminary until the inspector-clean
   rerun):

   | cause | B cost |
   |---|---|
   | `#platform` scene flip | **31-32 ms** (×3), 18.9 (wB) |
   | morph start | **14-18 ms** (self 11-14) |
   | fwReskip | 13-14 ms, mostly nested Layout |

   The listener rebuild (A: 32 ms at y≈1840) is gone in B (arm-scope-c).
2. **Why lc-cq3 was dropped; would a narrower variant help?** P-028 showed that the CQ's nested Layout leaves the RS
   record but its cost stays in the frame (−1.5 ms). A narrower container variant only moves the same layout. The
   lever is to dirty fewer descendants inside the containers: scene-scope V1 narrows the restyle inside `#platform`'s
   6 containers.
3. **What `__osb`, `p()` and `__pinY` write; does batching help?**
   - `__osb` (B JS 13285-13288) writes `documentElement.style.overscrollBehaviorY`. It is only the **first flush
     point** of the morph-start batch. The batch is `--morph` on the nav (unregistered, inherited by ~200 nodes),
     `--morph-fade` and pointer-events on `.start-selling-platform` (`S()`, 13274-13280), class toggles, and the panel
     scene flip.
   - `__pinMax` / `__pinY` (13370-13371) **read** `scrollHeight` / `scrollY`; they are forced readers, not writers.
   - `p` (gh JS 13392) is the debug `__fwMorphDrive` rAF logger and is not shipped.
   - The writes already land in one task. Batching cannot shrink them; narrowing their scope can: R4 plus
     scene-scope V3.
4. **Is R4 in B?** No (§2.2).

## 5. Ranked fix proposals (fix owners implement; nothing here is implemented)

| rank | proposal | expected gain (derived; OBSERVED basis) | owner topic | risk | phone test |
|---|---|---|---|---|---|
| 1 | **scene-scope V1**: replace the `[scene=paused] :where(*)` pause (B CSS 11804-11815, baseline 11754-11758) with the animated selectors per scene, and leave `will-change` to /10b's per-element `data-fw-wc` gate. V1b: pause via `getAnimations({subtree:true})` in cE. V2 (later): flip at idle/scrollend inside a 2 vh pre-arm. V4: `@property --start-selling-intrinsic-block-size { inherits:false }` | y≈2615 frame: restyle scope ~345 → ~30 elements. If the nested Layout is the will-change restore (W3), it drops too: RS 31 → <8 ms. If it is CQ layout, only the self part drops (~4 ms). The Chrome check splits the two. | `fix-scene-scope` (spawned 2026-10-02, stacked on user-bplus); touches scroll-engine's cE/sE and the /10b rule | low-medium. A missed animation keeps running off screen (cost, not visual). V1b: API pause overrides CSS play-state, so new animations started while paused need re-pausing | Chrome: InvalidationTracking subtree count, ULT elementCount, Layout dirty objects, LayerTree count before/after the flip, functional pause check. Phone: W, Timeline block, C = B, V = B+V1, C V V C C V V C; read RS + nested Layout in the cE 2762 frame and the mid-phase dt>34/>50 with twins |
| 2 | **R4 on B** (`@property --morph`, `--morph-fade` with `inherits:false`, morph-endpage R4) + **scene-scope V3** (panel exempt or narrowed, B JS 13567, baseline 13196) | morph start RS self 11-14 ms → a few ms (derived: ~545 inherited nodes + 172 panel nodes leave the scope) | nav-morph-all (v04 has R4) / fix-scene-scope for V3 | low | M driver block (`__fwMorphDrive`); G/F for touch before landing |
| 3 | **st4-noswap** (hero rotator swap path) | the hero's ~20-24 ms idle Layouts at ~1 Hz: P14 2/67, idle 0/36 (iphone-wave2 §4o) | layout-containment (P-039 st5 ticket in flight) | as in its README (drops avatars-exit) | already phone-tested in P14 on aw1-10e; re-confirm on B with W |
| 4 | fwReskip intrinsic-size write (part of V4) | 13-14 ms at y≈2990, of which only ~1.6 ms is style; the 12 ms Layout stays unless the size is set before the section is near | scroll-engine | low | W, same block as rank 1 |
| 5 | `doc-sweep` `background-position` → `transform` on a pseudo-element strip (6 infinite in `#platform`) | per-frame repaint of 6 rows while `#platform` is active; small per frame (paint ≤2.6 ms), continuous | new or platform topic | medium (pixel equivalence of the sweep) | S/W, bottom phase, Paint per second |
| 6 | `stroke-dashoffset` packets (20 paid-border/rail) → `transform`/`offset-distance` or a pre-rendered mask | same class as 5 | new or platform topic | medium-high (visual) | as 5 |
| 7 | **Image right-sizing in an overlay** (never in `site/`): roles PNG 1282² → ~1000² cover or WebP/AVIF; 9 avatars → 192²; strawberry/orchestra/leobeer/weng → ~600 wide; hero covers → ~500 wide; `srcset` for the rest | ~35 MB less decoded memory (derived), a few MB less transfer. **No per-frame gain expected** (OBSERVED: Paint ≤2.6 ms); insurance against W9 | new topic `image-size` (or the U6 owner) | low per frame; pixel diff must stay ≤0.4 % at DPR 3 | not a timing block: Simulator/Instruments memory (WebContent footprint) plus a visual check; a phone S block only if memory-pressure evidence turns up |
| — | rejected: CSS nesting changes (none shipped); simplifying the rtl `:where` list (≤28 ms matching over a whole scroll at 6x, 0 matches, nothing per frame); lc-cq3 variants (P-028); batching the morph writes (already one task) | — | — | — | — |

## 6. Open items

- Done: iphone-runner's inspector-clean final is in §2.1 ("Final block").
- The y≈2610 flip:
  - It was cheap in ~30 of 35 older runs.
  - In the final block it costs 16.7-19.1 ms in A and 29.2-32.2 ms in B. The extra ~11 ms in B is nested Layout.
  - Candidates are the early one-way un-skip (N9/N10) and the /10b will-change gate. Both are UNRESOLVED.
  - The decisive local check is scene-scope's Chrome check: Layout dirty objects at the flip, per arm.
- Chrome's per-frame `.hero` inline-style ULTs (40-55 ms at 6x) have no phone counterpart (OBSERVED). Whether the phone
  skips those writes or prices them low is UNRESOLVED (check: phone Timeline FunctionCall at baseline JS 4172 in an
  idle-hero window).
- `step-end` opacity boils: main-thread ticks per step or per frame, UNRESOLVED (§3.2).

Board findings from this note: F-093 (scene `:where(*)` pause pitfall), F-094 (scope, not selector complexity),
F-095 (`@property inherits:false` on big-ancestor custom properties; R4 not in B), F-096 (images: memory, not per
frame).

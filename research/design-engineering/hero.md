# Hero window (scrollY 0-900): render cost model and equivalent-pixel refactors (de-hero)

2026-10-01, `de-hero` (design-engineering team). Read-only study: no Chrome, no iPhone, no locks. Evidence is
the team's existing data (cited by file); code lines are 1-based in the committed baseline `site-pretty/`
(`CSS` = `_app/immutable/assets/2.gBuqKVzi.css`, `JS` = `_app/immutable/nodes/2.DyWL8TcE.js`). Labels:
**measured** (a team log, named), **vendor source / vendor doc / spec** (URL), **derived** (my arithmetic
or reasoning from the code; verify before relying on it).

## Decision

1. **The steady per-frame cost in y 0-900 is ~5-12 ms (derived) and explains the 20-34 ms band, not the
   > 50 ms frames.** It is mostly style: `--exit-opacity` restyles the ~230-element hero subtree every
   frame, plus 3 forced style/layout flushes. The hero-exit v2 scroll-driven animation already removes the
   biggest term.
2. **The > 50 ms frames are one-shot events at three places, and none of them is the exit fade:**
   - **(B) y≈587-616: the "0.72 flip"** (the largest; 2 consecutive 43-59 ms frames in 6/6 scripted
     runs at y≈625→745). One scroll frame crosses hero progress 0.72 for two consumers at once. The
     future card goes `visibility: hidden` → `visible` with a 1.6 s `blur(14px)` transition on a
     430×775 layer and its first raster. The nav leaves `is-hero-pill`. The next forced reader pays the
     whole style bill: nav `ee()`'s `getComputedStyle` (F-029's 21.7 ms `recalcStyle` at y=727 in Chrome).
   - **(A) y≈50: the first scroll.** Baseline 32-38 ms; aw1-10c 51-55 ms in 3/3 runs. **Measured since**
     (iPhone hero block, 08:53-09:08Z):
     - hero v2 removes this frame: P2 43 [37-48] → P 35 [22-37];
     - /10e barely moves it (48 → 43).

     So it was the hero's JS exit path at scroll start, not F-030 as I first predicted (section 2A).
   - **(B') hero v2 makes the y≈700 frame ~10 ms larger** (52 → 63 ms, disjoint). Only WebKit shows this,
     and no Chrome count moves. Section 2D explains it, ranks the candidates and gives the fix sent to
     fix-hero-exit.
   - **(C) at idle and at slow speed:** 45-60 ms pairs every 3.15 s from the script-accent word cycle
     (both builds), 35-58 ms at ~1 Hz from the countdown tick, and people-o's 0.92 s per-frame layout
     **only when the finger is slow** (it never fires in the scripted runs).
3. **Top 3 refactors, ranked by expected gain against risk:**
   - **R1:** take the 0.72 flip apart. Pre-raster the future card while it is invisible, run its
     reveal blur with matching filter lists, and keep inherited-property toggles out of the reveal
     frame. Owner large-area-blur + phone-invisible-shrink. Expected: the y≈625-745 pair 50-59 → ≤ 34 ms.
   - **R2:** hero exit on a scroll timeline (fix-hero-exit v2, already built) plus /10e.
     - Measured: y≈50 43 → 35 ms.
     - Expected: ~2-6 ms less per hero frame.
     - It needs the 2D bisect because of the +11 ms at y≈700.
   - **R3:** countdown digits as one strip per digit, with no `will-change` on faces. Owner countdown.
     Expected: 160 → 16 (or 0) layers, 10 → 1 writes per spring frame, and the 1 Hz idle spikes gone.
   People-o (R4) and the accent (R5) come next. The equivalent-pixel FLIP for people-o needs wrapper spans.
4. **N12 (nav `ee()`) alone will not remove the y≈700 frame.** It removes a *forced* flush, but the
   21.7 ms (Chrome 6x) of style comes from the 0.72 flip's invalidation, so most of it moves into the
   rendering update of the same frame. Judge N12 by forced-flush ms, not by that frame.

## 1. Per-frame cost model (WebKit/iOS 26.6.1, 430×775 CSS px, DPR 3)

Notation: `c_el` = style cost per re-resolved element, `N_x` = elements in subtree x, `D` = DPR = 3,
`A` = area in CSS px², `B = 4·D²·A` = backing-store bytes (36 B per CSS px²). Frame budget 16.7 ms
(Safari's rAF runs at 60 Hz on the ProMotion phone; `fixes/iphone-wave2/README.md`).

    T_frame ≈ T_js + Σ_writes N_subtree·c_el + n_flush·c_flush + T_layout + T_paint + T_commit   (main thread)
    T_gpu   ≈ Σ_filtered layers A·D²·k_blur(r) + Σ layers A·D²·k_comp                        (render server)

**Calibrating `c_el` (derived).** The aw1-10c traced A/B
(`.claude/worktrees/agent-a13d7bfa5a75e0fed/fixes/aw1-10c/results-trace.json`, Chrome 6x, n=1) recalculated
3,848 elements in 215 ms of style. That is ~56 µs per element at 6x, about 9 µs unthrottled. The
hero-exit probe agrees: removing the hero write cut unthrottled style per step from 7.4-10.4 to
5.4-7.2 ms, i.e. ~2-3 ms for ~230 elements, ≈ 10 µs each (measured, n=1; fix-hero-exit README "Wave 2").
For the iPhone I use `c_el` = 10-25 µs, an A17 core ≈ an unthrottled Mac core up to the 6x-calibrated
upper half (derived; range, not a point).

### 1.1 Style: the inheritance fan-out of `--exit-opacity`

- **The write.** JS 4171: `x.style.setProperty('--exit-opacity', r)` on `.hero` (CSS 1528-1542) in
  every scroll frame. `.hero` declares `--exit-scatter: calc(1 - var(--exit-opacity))` (1530). Both are
  unregistered, so both inherit.
- **WebKit's response.** An inherited change makes the resolver re-resolve the children
  (`DescendantsToResolve::Children`). Their custom-property maps change too, so the walk repeats down the
  whole subtree, and the fast-path inheritance is refused when `Change::Inherited` is set (vendor source:
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/style/StyleTreeResolver.cpp, read 2026-10-01;
  high). Descendants of a `display: none` element are not resolved (same file), so on phones the desktop
  `.orbit` subtree (CSS 2035-2037) costs nothing.
- **Count on phones (derived from the templates JS 3819-3989, 4257-4333):**

  | part | elements |
  |---|---|
  | `.mobile-deck` cards | 4 × ~17 (article/card-hit/profile template, JS 3984-3986) ≈ 68 |
  | hero copy | header + h1 + accent (em, sizer, frame, paint, 3 svg + paths) ≈ 20 |
  | countdown (4 units) | 4 × (unit + face + number + 2 digits × (digit + spacer + 10 faces) + label) ≈ 113 |
  | CTA stack | ≈ 19 |
  | scroll cue | 6 |
  | **N_hero** | **≈ 230** |

- **Cost.** `T_style,hero = N_hero · c_el` ≈ 230 × 10-25 µs = **2.3-5.8 ms per scroll frame**, i.e. 14-35 %
  of the budget. Elements whose rules use `var()` in `calc()` cost more (`.orbit-card` 1567-1601:
  transform, translate and scale all from vars).
- **Who reads the value.** The only consumers are 7 elements: 4 deck cards (1577, 1586-1587), `.hero-copy`
  (2043, 2045 on phones) and `.scroll-cue` (1910-1913). Everything else is restyled for nothing:
  `N_hero / N_consumers` ≈ 33× waste.

### 1.2 Forced flushes (JS per scroll frame)

All three run from the scroll engine `iE` (JS ~2670) through `dE`:

| callback | reads | lines |
|---|---|---|
| hero `s` | 1 rect, in its own rAF after the engine's writes | JS 4163-4174 |
| nav `L → _` | `ee()`: `getComputedStyle` + 2 rects; `F()`: rect + `elementFromPoint` / `elementsFromPoint` after nav-hit-test; `.hero-track` rect | JS 12955-13011 |
| future `l` | `.hero-track` rect + a card rect, and a `.pain` class toggle | JS 11303-11325 |

- **Count.** `n_flush ≈ 3`, which matches the research README's "2 layouts and 3 style recalcs per
  frame" (cited in the fix-hero-exit README). Each flush costs its pending invalidation plus a fixed
  tree walk (`c_flush` ≈ 0.2-1 ms, derived).
- **In steady scroll the pending work is small.** Exception: the first reader after a state flip pays
  for the flip (section 2B).
- **Before/after.** nav-hit-test (wave 1) removed `F()`'s 2 inline `pointer-events` writes. Those caused
  2 × `N_nav` restyles, because `pointer-events` inherits.

### 1.3 Layout scope

- **Exit: zero layout.** The exit animates only opacity, transform, translate and filter (1734-1736,
  1910-1913, 2043-2045, 1586).
- **Accent: baseline only.** The `width` transition (1230-1232) re-laid out the hero title line for
  0.9 s per cycle; all-wave1 replaced it with a WAAPI translate (`fixes/layout-animations/README.md`).
- **People-o (F-032).** CSS 2465-2482 transitions `grid-template-columns` 0.6042em → 5.25em and
  `height` 1.0417em → 1.0833em (0.92 s). On phones (`@media (width<=860px)`, 3519-3555) the heading is a
  block lead line plus a centred, `nowrap` inline-flex line (`.start-selling-future-title-words`).
  - **Width.** At the 36 px font (2442 clamp), the O grows by Δ = 4.646 em ≈ 167 px. The line can't
    wrap, so the h2 keeps its line count.
  - **Height.** 39 px < the 41.4 px line height (1.15 × 36), so the h2 height should not change either
    (derived; the P3 probe measured O boxes 22×38 → 189×39).
  - **Scope per frame.** The O's grid, the words' flex line, the h2 line box (`text-wrap: balance`,
    2440), and a flex pass in each flex ancestor (`-header-copy`, `-header`, and the card's column of
    header + showcase + pill: 2374-2435). Siblings are only re-positioned.
  - **Cost.** `L_po ≈ L_line + Σ_flex ancestors n_children·c_flex` ≈ 0.5-3 ms per frame for 55 frames
    (derived). The probe saw it as layouts per step 1-4 → 25-31 (F-031).
  - **Paint.** The words slide, so the title line repaints each frame: 430×41 CSS ≈ 0.16 Mpx device.

### 1.4 Paint, raster and blur

- **Composited layers in the hero at load (phones), from `will-change` or `filter`:**
  - deck cards (1590);
  - `.hero-copy` (1737);
  - 80 countdown faces (`.face.svelte-1quva9c { will-change: transform }`, 1408-1415);
  - the scroll cue: any filter, `blur(0px)` included, composites (`research/architecture/webkit.md` §2,
    vendor source).
  - The sticky `.hero` is a viewport-constrained layer (derived).
- **Exit frames repaint almost nothing.** Opacity and transform on those layers are layer properties.
- **The cue blur.** Its radius `r = 18·(1 − e)` grows its layer by the blur outset (≈3r per side for a
  Gaussian). So its backing store is re-sized and repainted each frame:
  `A_cue(r) = (45 + 6r)²` → at most 153² CSS px = **0.21 Mpx device, 0.84 MB** (derived from the cue box ≈
  45×45 CSS, CSS 1949-1966).
  - On the GPU, `k_blur·0.21 Mpx` is well under 1 ms. **The cue blur is a small term**, smaller than the
    hero-exit README suggests.
- **The future card reveal.** This is the large blur in the window, and it is not the hero's.
  - `.start-selling-future:not(.is-visible) > .start-selling-future-card` (2393-2404) holds `opacity: 0`,
    `visibility: hidden` and `filter: blur(14px)`. `.is-visible` (2405-2414) transitions opacity 0.7 s,
    filter → `none` over 1.6 s and transform 0.9 s.
  - The card is `min-height: 100svh` on phones (large-area-blur README) and `will-change: transform`
    (2379), so it is one layer: 430×775 CSS = 3.0 Mpx device, **12 MB**. With the 14 px outset:
    514×859 → 4.0 Mpx, 15.9 MB.
  - Per large-area-blur, its content includes six 402×857 panels (y≈1177): 6 × 3.1 Mpx = 18.6 Mpx,
    74 MB if each has a backing (cf. scroll-engine /10b: profile-deck 70.2 MB).
  - **The first raster happens on the flip frame.** `visibility: hidden` content is not painted, so the
    first paint of everything inside the coverage rect lands on the frame that sets `is-visible`.
    At ~1 Gpx/s raster that is ~5-20 ms, plus image decode (derived; device rate unknown).
  - **Filter lists.** `blur(14px)` ↔ `none` is not a matching filter list. WebKit only threads
    filter animations whose lists match (webkit.md §1, vendor source), so this transition probably ticks
    on the main thread (style + layer commit per frame), with a 4 Mpx GPU blur per frame for 0.9 s
    (all-wave1's shortened tail) or 1.6 s (baseline).

### 1.5 Layer creation on the first scroll, and memory

- **Most hero layers are pre-promoted.** The deck cards, the copy and the 80 faces have permanent
  `will-change`, so they are allocated and rastered at load, not at the first scroll (derived from the
  CSS above). "Pre-promote the hero layers" is therefore already true, and **not a remaining lever**.
- **What does change at the first scroll:**
  1. **WebKit's tile coverage turns velocity-aware.** `TileController` projects a `futureRect` along the
     scroll velocity and adds directional margins (vendor source:
     https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/ca/TileController.cpp,
     `adjustTileCoverageWithScrollingVelocity`, read 2026-10-01; high). The first moving frame therefore
     rasters new tiles ahead of the viewport for every tiled layer there: document, sticky hero, future card.
  2. **The cue's filter outset appears** (1.4).
  3. **The engine's callbacks wake up after the idle phase**, with 3 forced flushes (1.2).
  4. **On aw1-10c only: F-030.** /10c's will-change IntersectionObserver flipped `data-fw-wc` on the
     clipped faces ~1,900 times/s, even at idle (scroll-engine README "/10e"). The 80-160 face layers were
     created and destroyed continuously, so every frame carries layer-tree churn into the
     scrolling-tree update that the first scroll triggers.
- **Memory**, `B = 36·A` bytes (derived): sticky hero 12.0 MB; hero-copy (393×~460) 6.5 MB; 4 deck
  cards (2×120×149.4 + 2×160.9×200 = 100k px²) 3.6 MB; 80 faces (≈17×36.4 each) 1.8 MB (3.6 MB with the
  second countdown); cue 0.07-0.84 MB; future card 12-16 MB. **Hero window ≈ 26 MB**, +12-90 MB once
  the future card is revealed.
  - On iOS under memory pressure WebKit switches to a conservative policy where `will-change` no longer
    composites (webkit.md §4), so these totals can change layer counts between runs.

### 1.6 rAF and timer work: idle vs scroll

| source | idle at y=0 | while scrolling y 0-900 |
|---|---|---|
| countdown `cD` (3931-3943): 1 Hz `setInterval` → digit springs `GE` (3791-3803; k=280, c=18, m=0.3, ζ≈0.98, ω₀≈30.6 rad/s) | a 1-step change springs ~26 frames, the 9→0 roll ~33 (countdown README). ≈1.12 changes/s per countdown → ~29 frames/s with 10 face transform writes each (baseline) or ~2 (all-wave1 parking). 160 layers stay composited | same, plus the off-screen pause in all-wave1 (IO, 64 px) |
| accent `HE` (3680-3723): timers 1250 + 900 + 900 ms, i.e. one 3.05-3.15 s cycle; SVG path DOM swap per word (3730-3765); `stroke-dashoffset` + fill-opacity keyframes 0.9 s (1274-1290); 3 `step-end` idle-frame opacity loops (1291-1301) | 1.8 s of every 3.1 s animating; paint area ≈ accent box (≈120×46 CSS ≈ 0.05 Mpx) per frame | the same while the hero is within 1 viewport (IO `rootMargin: 100% 0px`) |
| hero exit `s` | none | 1 rAF + 1 rect + 1 inherited write per frame (1.1, 1.2) |
| people-o (JS 6225-6269) | none | IO `threshold 0.35` on `#future-heading` → +1300 ms `is-stack` → +120 ms `is-expanded`; leaving the threshold clears the timers |

## 2. Which terms dominate each hitch (with a consistency check against the iPhone data)

Data: `fixes/iphone-wave2/raw/goal-{B,P}{1,2,3}.json` (scripted, 250 px every 300 ms ≈ 1000 px/s),
`finger-A2.json` (baseline) and `finger-B2.json` (aw1-10c). Frames were extracted with a scratch script:
dt > 34 ms with y ≤ 900, and the speed over the previous 10 frames.

**Geometry (derived from the phone's bands, measured):**
- The hero band ends at 855, so `.hero-track` = 200 lvh = 1630 (lvh = 815, svh = 775) and
  progress = y / (1630 − innerHeight).
- **0.72 is crossed at y ≈ 616** with the toolbar expanded (`ih` 775) and at y≈587 with it collapsed (815).
- `.hero` pointer-events turn off (r < 0.05) at y≈812.
- In Chrome (932 tall) 0.72 falls at y=671.

### (B) y≈587-745: the 0.72 flip (dominant)

**Observed (scripted, all 6 runs):** two consecutive long frames starting at y≈625-646:

| build | run | first frame | second frame |
|---|---|---|---|
| baseline | B1 | 45 @634→695 | 59 @695→741 |
| baseline | B2 | 55 @633→703 | 58 @703→744 |
| baseline | B3 | 55 @634→704 | 56 @704→745 |
| aw1-10c | P1 | 51 @646→704 | 36 @704→737 |
| aw1-10c | P2 | 50 @625→687 | 42 @687→727 |
| aw1-10c | P3 | 43 @625→687 | 39 @687→720 |

Finger runs show the same spot: A2 51/61 ms at y 617-713 and 69/71 ms at y 594-681.

**What fires on that frame** (JS 11310 and 13010, both `progress >= 0.72`):
1. Future `is-visible` → the card's `visibility` flips. `visibility` inherits, so the whole card subtree
   restyles: `N_card · c_el`. The opacity, filter and transform transitions start, and the card gets
   its first raster (1.4).
2. Nav `p` → `is-hero-pill` off → the nav restyles and its transitions start.
3. The next forced reader (`ee()`'s `getComputedStyle`, JS 12967) pays items 1 and 2 synchronously:
   F-029 measured `Document::recalcStyle` 21.7 ms + paint 6.8 + PAC 5.1 in a 50 ms frame at y=727 (Chrome
   6x), about 3 frames after Chrome's 671.

**Model:** `T_flip ≈ (N_card + N_nav)·c_el + raster(A_card + A_panels ∩ coverage) + T_transition-start`.
With N_card ≈ 300-1000 (unknown; count it), that gives 3-25 ms of style and 5-20 ms of raster:
**the 43-59 ms first frame fits** (derived).

**Consistency check:** wave 1 cut the second frame (56-59 → 36-42), which fits large-area-blur shortening
the blur tail and nav-hit-test dropping the nav's inherited writes. It left the first frame at 43-55,
which fits a one-shot reveal cost (first raster + subtree restyle) that no wave-1 patch touched. The
hero exit can't explain this frame: its cost is the same at every y.

### (A) y≈50: the first scroll

**Observed (scripted):**
- Baseline: 38 @9→39 (B1), none > 34 (B2: 32), 36+36 @0→50 (B3).
- aw1-10c: 52 @7→52, 55 @10→59, 51 @9→48, i.e. 3/3, about 60 ms after scroll start.
- Finger runs (baseline too): 51-70 ms on the first touch move. They include the toolbar and touch
  start, so they are not used for attribution.

**Model:** `T_first ≈ T_style,hero + 3·c_flush + raster(Δcoverage) + T_cue-outset (+ T_F030 on aw1-10c)`.

**Consistency check:**
- **Not periodic.** The idle spikes (C) are periodic (1 Hz and 3.15 s), but this frame occurs 3/3 at
  scroll start. That rules out a coincidence with a tick (P ≈ 2-5 % per run, derived).
- **The extra cost is specific to aw1-10c** (+15-19 ms against the baseline's 32-38). Its only
  first-screen difference with a per-frame layer effect is the F-030 churn, plus /10c's extra
  IntersectionObservers.
- **My prediction was half wrong.** I predicted:
  - P2 (/10e): y≈50 ≤ 38 ms;
  - P (hero v2): a further −2…6 ms.

  The hero block (fix-hero-exit README, iPhone, n=3-6) measured:
  - B 48 [42-64];
  - P2 43 [37-48];
  - **P 35 [22-37]**.

  /10e is a small term; the hero's JS exit path is the main term.
- **Why the JS path costs most on the first frames (derived, fits the data):**
  - It adds `T_style,hero` (2.3-5.8 ms), one forced flush in its own rAF, and the cue's
    blur(0) → blur(>0) step every frame. On the first frame, the cue layer's backing store also starts
    changing size: a full re-raster per frame (de-morph's `RemoteLayerBackingStore` pitfall, README).
  - v2 moves all of it to threaded scroll-driven animations, so the first scroll frame carries only the
    engine wake-up and the velocity-coverage raster: 22-37 ms.

### (C) Idle and slow-scroll terms

- **Accent cycle.**
  - **Observed** (finger idle at y=0, both builds): pairs of 45-60 ms frames, 171-239 ms apart, every
    3.149-3.157 s. For example A2: 113976/114215, 117125/117364, …; B2: 20369/20610, 23532/23761, ….
  - **Why it is the accent:** the period matches the cycle (1250 + 900 + 900 ms + timer→rAF latency).
  - **What it is not:** all-wave1 removed the accent's width layout (idle layouts 314 → 15 per window,
    layout-animations README), yet B2 still has the pairs at similar sizes. So **the pair is not
    layout.** Candidates: the per-word SVG DOM swap (new `<svg>`/`<path>` elements, keyed by path string,
    JS 3730-3765), and layer creation for the three `step-end` opacity loops when `is-idle` restarts
    them. The 0.2 s spacing matches one idle-frame step (0.6 s × ⅓). This is a hypothesis.
- **Countdown.** Idle spikes ~1.03-1.06 s apart (goal runs: B3 11914/12947, P3 12309/13347, …; 35-58 ms).
  The 1 Hz period matches the tick. scroll-engine/08's ablation (countdown frozen) cut the Chrome idle
  worst frame 16.3 → 10.3 ms.
- **People-o.**
  - **When it fires (derived):** the heading reaches 35 % visible at y≈242 (heading top ≈ 940 + the
    48 px pre-reveal translate). The 1.3 s timer then fires only if the heading is still ≥ 35 %
    visible, i.e. y stays ≲ 970 for 1.42 s. That requires speed ≲ 500 px/s. At the scripted 1000 px/s
    the timer is cleared at y≈970, so **people-o never expands in the scripted runs**.
  - **Finger B2 fits:** in its slow pass (v 466 → 49 px/s, y 561-758), 23 frames of 43-70 ms run for
    1.25 s. They start at the 0.72 flip (54 ms @603→622, t=44.35 s) and are joined by the expand at
    ~45.27 s (derived: 242 crossed at ~43.85 s + 1.42 s).
  - **Hidden expand.** When the expand starts before the flip, it runs inside a `visibility: hidden`
    card: layout every frame for an animation nobody sees.

### (D) Why hero v2 makes the y≈700 frame ~10 ms larger (P 63 [58-68] vs P2 52 [44-56])

**What the frame is.** The y≈700 frame is the 0.72 flip of section (B). fix-hero-exit's Chrome crossing
probe confirms it: at the 680 step, in P2, P and v3 alike:
- `is-hero-pill` drops, which starts the nav's `max-width` / `padding` / `gap` transitions: layout every
  frame;
- `#people` gets `is-visible`;
- there are ~30 layouts per step.

**What the difference is not:**
- **F-029 / nav `ee()`.** Neither side has N12, so it is equal in P2 and P. It explains part of the
  52 ms base, not the +11 ms.
- **F-032 / people-o.** It does not fire at scripted speed (2C: the 1.3 s timer is cleared at y≈970).
  P3 changes people-o and keeps 61 ms, and the Chrome counts are equal.
- **"Work deferred from y≈50".** v2 attaches its animations at mount on phones, and no v2 code runs at
  progress 0.72. The JS path's y≈50 cost was per-frame work, which v2 deletes rather than moves.
- **Chrome-visible work.** Style and layout counts are identical in Chrome. So the extra is WebKit-only:
  compositing, layer commit, the threaded-animation machinery, or the GPU.

**WebKit-only candidates, most likely first (all derived; none verified on the device):**
1. **Extra layers at the reveal ("assumed overlap").**
   - WebKit marks a layer's extent uncertain when it runs a transform animation and an ancestor also
     runs one. It then stops testing overlap, so later layers in that stacking context composite. The
     flag propagates up to the parent context unless a composited, clipping ancestor stops it (vendor
     source: `RenderLayerCompositor.cpp`, `animationCausesExtentUncertainty`,
     `ancestorHasTransformAnimation`, `canReenableOverlapTesting`, read 2026-10-01).
   - v2 gives `.hero-copy` a running transform animation for the page's whole life (fill both).
     Inside it, all-wave1's `HEflip` runs a WAAPI transform on the h1 words during every accent draw-in
     (0.9 s of each 3.1 s cycle). `.hero` doesn't clip.
   - **The predicted effect:** content revealed at the flip (the future card's descendants, the nav's
     transitioning parts) gets its own layers, so more backing stores are allocated and rastered in
     that frame. The JS path (P2) has no transform *animation* on `.hero-copy`, so it can't trigger this.
   - **Weak point:** HEflip runs only ~29 % of the time, but P was slower in 3/3. Either there is another
     descendant transform animation I haven't found, or this is only part of the 11 ms.
2. **Accelerated-effect resync on a big commit.** With threaded animations (26.4+), the layer tree
   carries 7 accelerated effect stacks (4 cards, the copy, 2 on `.scroll-float`). A frame that
   restructures the layer tree (the reveal creates or reparents layers) may resend or rebuild those
   stacks and recompute the view-timeline ranges after the big layout: `T ≈ n_effects × c_resync`.
   This is cheap per effect. It is plausible as a few ms, not 11.
3. **The block itself.** P was served from a worktree restacked during the block (fix-hero-exit README;
   F-034 is the same pitfall), and n=3. Interleave B/P2/P with a control before attributing 11 ms.

**The decisive measurement (owner, on the device).** Run the Web Inspector Timelines + Layers tab for
y≈580-780 on P2 and on P:
- the frame's style/layout/paint/composite split;
- the layer count and compositing reasons right after the reveal: candidate 1 predicts "overlap" /
  "assumed overlap" layers only on P;
- the backing-store memory.

**Proposed fix, sent to fix-hero-exit (lead copied), in order:**
1. **Bisect (fix-hero-exit's rows 12-13), with the variants that split the candidates.** Each is
   diagnostic only, not landable as is:
   - (a) v2 with `HEflip` disabled (accent snaps);
   - (b) v2 with `.hero-copy`'s exit keyframes reduced to opacity only (no transform);
   - (c) v2 with the exit animations on the 4 cards only.

   Candidate 1 predicts that (a) and (b) restore ~52 ms and (c) doesn't. Candidate 2 predicts that the
   cost scales with the number of animated elements: (c) partly.
2. **If candidate 1 holds, the landable fix** is to break the "transform animation under a
   transform-animated ancestor" pair. Two options:
   - **Pixel-identical (preferred):** wrap the copy's exit transform in an element that is composited
     **and clips** (`overflow: clip`), sized to the copy's ink overflow (padding for the CTA's 6 px
     `drop-shadow` glow and the accent SVG's overflow). Then `canReenableOverlapTesting` is true and
     the uncertainty stops at the copy.
     - Check: frozen-frame diff of the copy at rest and at progress 0.3, and on desktop.
     - Risk: clipping ink that overflows today.
   - **Cheaper, not identical:** `HEflip` snaps (the baseline's end state) while the hero exit
     progress is > 0, read from the existing IO.
     - Cost: the accent words jump instead of sliding while the copy is still ≥ 70 % opaque.
     - A frozen-frame diff at y 1-90 shows it, so it needs the user's OK.
3. **Whatever the bisect finds, the robust fix is R1** (take the 0.72 flip apart). v2's extra is a
   multiplier on what the flip creates; with R1 the flip creates no new paintable content in that
   frame (the card is pre-rastered, no `visibility` toggle), so candidates 1 and 2 have nothing to act on.
   Expected: y≈700 from 52-63 to ≤ 34 ms on both P2 and P (derived).
4. **Keep v2.** It removes y≈50 (−8…−21 ms) and the 2-6 ms per-frame hero style. The +11 ms at y≈700
   costs about the same once, so the net is positive, and R1 removes the +11 anyway.

## 3. Equivalent-pixel refactors, ranked (gain / risk)

Each row lists the location, the pixel-parity risk and how it would be caught, the cost after, and the owner.

**R1. Take the 0.72 flip apart** (expected: the y≈625-745 pair from 43-59 to ≤ 34 ms; risk medium).
Owner: large-area-blur for the CSS and phone-invisible-shrink for `l`; the hero-window owner fix-hero-exit
coordinates.
- **(a) Pre-raster while invisible.** In the `:not(.is-visible)` state (CSS 2393-2404), replace
  `visibility: hidden` with `visibility: visible` + `opacity: 0` (already there) + the `inert` attribute,
  set from `l` (JS 11310) together with the class.
  - Same pixels: opacity 0 shows nothing.
  - Same interaction and accessibility tree: `inert` blocks focus, hit-testing and the AX tree, as
    `visibility` + `pointer-events` did.
  - The card and its panels then raster during idle, not on the flip frame.
  - **Unverified:** whether WebKit paints the backing store of an opacity-0 composited layer. If it
    doesn't, use `opacity: 0.001` (invisible at 8-bit: 0.255 levels).
- **(b) Matching filter lists.** Run the reveal as `blur(14px) → blur(0px)` and leave `filter: none`
  only at rest, as hero v2 did. Then CA can run it as an accelerated animation (webkit.md §1-2), instead
  of a main-thread style update per frame on a 4 Mpx layer.
- **(c) No inherited toggle at reveal.** With (a), the flip changes only the card's own opacity, filter
  and transform, no longer `visibility`, so the `N_card` restyle disappears. `inert` and pointer-events
  still change; measure whether WebKit's fast-path inheritance covers them.
- **Parity check:**
  - screenshot diff at the reveal (fix.mjs ab regressions; 0-0.4 % is noise) plus frozen-frame shots at
    t = 0.1, 0.3, 0.7 s after the flip;
  - computed `filter` / `opacity` parity at those times;
  - on the iPhone, tab order and VoiceOver skip the hidden card (lead / user).
- **Cost after (derived):** `T_flip ≈ c_el·(1 + N_nav) + T_transition-start` ≈ 1-3 ms; raster moves to idle
  (+12-90 MB resident earlier: check the Layers tab).

**R2. Hero exit on the scroll timeline (v2, built) + F-030 /10e** (**measured** on the iPhone:
y≈50 43 → 35 ms; expected −2…6 ms of style on every hero frame; risk low, parity already shown on
Chrome and iPhone at 9 progress points; **but** y≈700 +11 ms, see 2D, so land it together with R1 or
after the 2D bisect).
Owners: fix-hero-exit and fix-scroll-engine.
- **Location:** JS 4155-4251 and the new `@supports` block (fix-hero-exit README).
- **Cost after:** `T_style,hero` = 0 on iOS ≥ 26.4, where scroll-driven animations of opacity, transform,
  translate and filter are threaded ("Safari 26.4 adds support for threaded Scroll-driven Animations",
  https://webkit.org/blog/17862/webkit-features-for-safari-26-4/; vendor doc, high). On 26.0-26.3 the cost
  is 7 animated elements × `c_el` ≈ 0.1 ms per frame. No `.hero` rect read; `n_flush` 3 → 2.
- **Fallback path (non-SDA browsers):** don't keep the inherited write. Write `opacity` / `transform` /
  `filter` directly on the 7 consumers, or register `@property --exit-opacity { inherits: false }`
  and set it on each consumer. Restyle scope `N_hero` (230) → 7, about 33× less (web.dev measured
  ~850× for non-inheriting on 1,000 elements: https://web.dev/blog/at-property-performance; vendor doc).
  Low priority: Safari 26 and Chrome take the SDA path.
- **Catch:** Tier A `no-exit-opacity-writes` = 0; iPhone P/P2 frames at y≈50; `getAnimations()` shows
  7 ViewTimeline animations.

**R3. Countdown: one strip per digit, no per-face `will-change`** (expected −144 to −160 layers, 10 → 1
writes per spring frame, the 1 Hz idle spikes gone; risk low). Owner: countdown (countdown 05/08).
- **Location:** `$E` (JS 3823-3876), CSS 1397-1415.
- **Today.** 10 faces per digit at `translateY(KE(r, a)·c)`. `KE` is the shortest signed wrap distance;
  `.digit` is `overflow: hidden`, so only faces within ±1 cell are visible.
- **Equivalent.** One strip `9 0 1 … 9 0` (12 glyphs) at `translateY(−(a + 1)·c)`. For any spring value
  `a` ∈ [−1, 10) the glyphs within ±1 cell sit exactly where `KE` puts them. The spring is critically
  damped (ζ ≈ 0.98), so overshoot is < 1e-6 cells (derived).
- **Layers.** Drop `will-change`: a per-frame transform write then repaints ≤ 2 cells
  (≈17×73 CSS = 11 kpx device), cheaper than keeping 160 layers. Or play the spring as WAAPI with a
  sampled `linear()` (Safari 17.2+), threaded, with main thread ≈ 0.
- **Parity check:**
  - per-frame screenshot diff of a forced 9→0 roll and a 1-step tick (frozen time via `Date.now` stub);
  - `KE` vs strip offsets across `a` ∈ [−1, 10] in a unit probe (≤ 0.5 device px);
  - iPhone: the Layers tab count and memory.
- **Cost after:** `T_cd` ≈ 1 write + ≤ 11 kpx repaint per spring frame; layers 160 → 0 (or 16 while
  animating).

**R4. People-o: an equivalent-pixel FLIP** (expected: per-frame layout 25-31 → ~1 per step during 0.92 s;
risk medium). Owner: fix-hero-exit (P3 variant).
- **Location:** CSS 2465-2482, JS 6225-6269, template JS 6157 / 11257.
- **Why P3 isn't enough.** P3 (`clip-path` reveal, snapped column) loses the words' slide.
- **The fix.** Wrap the word halves ("pe" / "ple", from JS 11262-11268) in spans. Text nodes can't take
  transforms, but spans are flex items with the same layout as the anonymous ones, so no pixel change.
  Snap `grid-template-columns` and `height`, then play WAAPI `translateX(∓Δ/2) → 0` on the spans with the
  original easing `cubic-bezier(0.22, 1, 0.36, 1)` over 0.92 s.
  - This is the `HEflip` pattern that layout-animations already landed for the accent.
  - Reveal the O's widening interior with `clip-path: inset(0 X 0 0)` on the stage, X from (5.25 − w(t))em.
  - Δ = 4.646 em, signs per side as in `HEflip`, including the RTL flip.
- **Cheap add-on:** add `transition: none` on the people-o rules while the card is `:not(.is-visible)`.
  - The expand then snaps when nobody can see it.
  - It differs only if the expand starts < 0.92 s before the reveal; the card's opacity is still < 0.5
    then.
- **Parity check:**
  - frozen frames at t = 0.1/0.3/0.6/0.92 s (fixed clip, not bbox: layout-animations lesson 06);
  - O box 22×38 → 189×39;
  - desktop untouched (0 % diff);
  - iPhone finger, slow scroll y 250-800.

**R5. Accent cycle spikes** (expected: the 45-60 ms idle pairs → < 34; risk low-medium). Owner:
layout-animations.
- **First attribute them on the device.** Web Inspector Timelines at y=0 for 10 s, by the lead or user;
  the pairs have a 3.15 s period, so they are easy to find.
- **If it's the SVG swap:** pre-create every word's SVG set once and toggle a class. Same markup, same
  pixels.
- **If it's the idle-frame layers:** run the 3 `step-end` loops on one element as `steps(3)` `transform`
  on a sprite, or as visibility swaps. Same pixels: same three frames at the same 0.2 s steps.

**Not recommended:**
- **A pre-blurred copy for the hero cue.** The cue is 0.21 Mpx at most (1.4); a copy would double DOM for
  < 1 ms.
- **Pre-promoting hero layers.** Already promoted (1.5).
- **Spreading the 0.72 consumers over two frames.** Not pixel-identical (a one-frame skew between nav and card).
- **A full-DOM pre-blurred copy of the future card.** Its content is live (carousel, avatars), so the
  copy would double the raster.

## 4. Verification plan (per refactor; owners measure, reviewers check)

- **R1:**
  - **Chrome mechanism probe (counts):** at the y=671 step, `UpdateLayoutTree.elementCount` and
    `Paint` area on the flip frame and the next 3, before vs after (expect elements ≈ N_nav + 1, paint
    ≈ 0 because the raster moved to idle).
  - **iPhone scripted (3+3, order B P P B B P):** the pair at y≈625-745 ≤ 34 ms in ≥ 2/3 runs.
  - **Layers tab:** card memory at load vs after reveal.
  - **Finger:** slow pass y 550-800.
- **R2:** it is already in the iPhone hero block (B aw1-10c / P / P2 /10e / P3).
  - Pass if y≈50 ≤ 38 ms in 3/3 and the hero window's > 34 ms count drops.
  - Web Inspector check: no per-frame style recalc attributed to the hero (webkit.md §1).
- **R3:**
  - **Unit probe:** the `KE` vs strip offset table.
  - **Chrome:** idle `RecalcStyleCount` per second at y=0 and the 9→0 frozen frames.
  - **iPhone:** idle 10 s at y=0. Expect the 1 Hz 35-58 ms spikes gone, layer count −144 or more.
- **R4:** the frozen-frame set above; the probe's layouts per step at y 450/600 (30/25 → ≤ 4); an iPhone
  finger slow pass. Scripted scroll can't trigger it (section 2C).
- **R5:** on-device attribution first, then the idle 10 s count of > 34 ms frames at y=0
  (baseline ≈ 2 per 3.15 s).

## 5. Open measurements for owners (cheap, counts only)

1. `document.querySelectorAll('.hero *').length` and the same for `.start-selling-future-card` on the phone,
   to replace the `N_hero` ≈ 230 / `N_card` ≈ 300-1000 estimates.
2. `innerHeight` at the 0.72 crossing in the scripted vs finger runs, to confirm the 587-616 range.
3. Whether WebKit rasters an opacity-0 composited layer (R1a): Layers tab paint count before the reveal.
4. One Web Inspector Timelines capture of the y≈50 first scroll on /10e, to split the remaining
   ~36 ms into coverage raster and engine wake-up.

## Sources

- WebKit style resolver, inherited changes and display:none skipping:
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/style/StyleTreeResolver.cpp (vendor source, high).
- WebKit velocity-based tile coverage:
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/ca/TileController.cpp
  (vendor source, high).
- Threaded scroll-driven animations in Safari 26.4: https://webkit.org/blog/17862/webkit-features-for-safari-26-4/
  (vendor doc, high). Fixes in 26.5: https://webkit.org/blog/17938/webkit-features-for-safari-26-5/
  (vendor doc).
- `@property` `inherits: false` restyle scope: https://web.dev/blog/at-property-performance (vendor doc, high).
- Filter compositing, matching filter lists, conservative compositing policy: `research/architecture/webkit.md`
  §1, §2, §4 (arch-webkit, vendor source).
- Team data: `fixes/iphone-wave2/` (raw logs), the fix-hero-exit README (worktree
  agent-a77e2ec753b6381fb), `fixes/scroll-engine/README.md` (/10e), `fixes/countdown-idle-raf/README.md`,
  `fixes/layout-animations/README.md`, `fixes/large-area-blur/README.md`, `fixes/nav-hit-test/README.md`,
  F-029..F-032, aw1-10c `results-trace.json` (I-018 branch).

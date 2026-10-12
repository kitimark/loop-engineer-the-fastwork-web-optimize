# Existing tools for rendering-cost analysis: what exists, what is missing

2026-10-12. Research for console thread T-275 #13 ("They may have related tools that solve this problem already").
The question: can existing tools tell us what each CSS or JS change costs in WebKit and Chromium, from source or at
build time, or optimise it automatically, so we don't need the real iPhone for every check? Inputs came from three
researchers (static/build, runtime/CI/device, engine rule tables). The writer checked every tool kept below. Lesson
numbers refer to `research/knowledge-distillation/README.md`.

## Answer first

- **Nothing existing does what we asked.** No linter, build plugin or data set knows WebKit's cost rules. The one
  well-known property table (CSS Triggers) is archived (last push 2018-01-08). Its WebKit file marks even
  `transform-change` and `opacity-change` as layout + paint + composite, so it cannot tell cheap from costly. (Checked.)
- **Existing tools cover the textbook, Chrome-side half.** Two stylelint plugins flag layout or paint properties in
  `transition`/`@keyframes` (lesson 5, part of 6). Lighthouse 13 names the animations Chrome could not composite and
  has a forced-reflow insight. Perfetto has Chrome's own per-frame scroll-jank SQL. All of them are free and maintained.
- **Even the textbook lists are incomplete for this page.** Neither stylelint plugin lists `grid-template-columns`,
  `flex-basis` or `stroke-dashoffset`, three properties the original page animates. Neither flags `steps()`/`linear()`
  points, which stay on the main thread on iOS 26.
- **The only per-frame WebKit instrument is Safari Web Inspector (Timelines, Frames, Layers), and it is manual.**
  sitespeed.io can drive Safari on a USB iPhone, but it records video and visual metrics, not frame or layout
  counts. No cloud device farm exposes frame timing for iOS Safari pages. Sauce Labs' jank check is Chrome only,
  and it reports average fps.
- **About 4 of our 30 lessons are mostly caught by existing tools, 12 partly (Chrome only, manual, or an incomplete
  list), 13 by nothing, and 1 is process.** The 13 gaps are the WebKit layout traps, layer and blur memory pricing, work at rest,
  ownership conflicts (two drivers, one threshold), heat, and finger behaviour.
- **The WebKit rules a checker would need are in a handful of source files.** We read them from sparse clones
  (§5, 16 rules with file:line):
  - `StyleDifference.cpp`: transform, filter and backdrop-filter none ↔ some, opacity crossing 1, dashoffset, and
    `pointer-events`;
  - `KeyframeEffect.cpp` `canBeAccelerated`: `steps()`/`linear()`, scroll timelines, composite modes;
  - `CSSProperties.json`: the accelerated set;
  - `RemoteLayerBackingStore.mm`: the backing store dropped on any size change;
  - `GraphicsLayerCA.cpp`: 1280 px tiling on iOS.

  Fourteen of the 16 have a form a linter can see, but 1-3 only approximately (they are value conditions). Two
  (12-13) are runtime only.
  The timing-function and scroll-timeline rules already differ between iOS 26 and WebKit main, so a rule pack needs
  a version tag.
- **Recommendation: reuse cheaply, extend two places, build only the WebKit gap.** Reuse: stylelint (two plugins, plus
  core restriction rules), ESLint `no-restricted-syntax`, bye-thrash in dev, Lighthouse user flows, and Perfetto in
  Chromium CI. Extend: a WebKit rule pack for stylelint, seeded from WebKit's own `CSSProperties.json` and our
  confirmed platform facts. Build: a rest-and-flip runtime probe, plus our existing `costcard.mjs` as the CI budget.
  The phone stays the final gate for anything WebKit, layer, heat or finger related.
- **Automatic optimisation does not exist for this problem.** Build tools stop at images and critical CSS. The paid
  Motion audit grades animations in tiers, but it names no engine. The one old automatic "performance" PostCSS
  plugin (`postcss-will-change`) adds layers, the opposite of lessons 12-13.

## 1. How we checked

- **Status words:**
  - **CONFIRMED:** I opened the repo, README, source or official doc on 2026-10-12 and saw the claimed feature.
  - **UNVERIFIED:** I did not see it; it rests on a researcher's background knowledge or a vendor claim.
- **Release dates:** from the npm registry (`npm view`) or GitHub releases (`gh api`).
- **What was not done:** nothing was installed into a project or run against our page. "Catches lesson N" means its
  rule list or docs cover the mechanism, not that it fired on our build.

## 2. What exists

### 2.1 Static: lint and build

| Tool | What it does | Engine model | Latest | Status |
|---|---|---|---|---|
| [stylelint-high-performance-animation](https://github.com/kristerkari/stylelint-high-performance-animation) | Warns on layout/paint properties in `transition` and `@keyframes` (blacklist; can ignore paint) | none (Blink-era "CSS Triggers" idea) | 2.0.0, 2026-01-25 | CONFIRMED (README, `index.js`). Its list has `width`, `max-width`, `border-width`, `background-position`; it has no `grid-template-columns`, `flex-basis` or `stroke-dashoffset` (grep of `index.js`) |
| [stylelint-plugin-css-performance-budget](https://github.com/Nick2bad4u/stylelint-plugin-css-performance-budget) | 13 rules: expensive animation properties, layout properties in transitions, filter stacking and blur radius, `will-change` abuse, fixed backgrounds, heavy selectors, reduced motion | none | 2.0.7, 2026-08-20 (1 star, one author) | CONFIRMED (rule files). It flags a `filter`/`backdrop-filter` transition only above a 30 px blur or 4 functions (defaults), so the page's `blur(14px)` reveal and 20 px glass pass; the timing parser skips `steps()`/`linear()` instead of flagging them (§2.1a) |
| stylelint core `declaration-property-value-disallowed-list`, `function-disallowed-list`, `property-disallowed-list` | Ban values, functions or properties by regex | n/a | stylelint 17.16.0, 2026-10-01 | CONFIRMED (rule dir). Enough to ban `steps(`/`linear(` in `animation*`/`transition*` today |
| [stylelint-config-html](https://github.com/ota-meshi/stylelint-config-html) (`/svelte`) + postcss-html | Lets stylelint read `<style>` in `.svelte` files | n/a | 2.0.0, 2026-08 | CONFIRMED (README) |
| ESLint core `no-restricted-syntax` / `no-restricted-properties` | Ban AST patterns (e.g. a rect read inside a `requestAnimationFrame` callback) | n/a | current | CONFIRMED (rule dir) |
| [eslint-plugin-svelte](https://github.com/sveltejs/eslint-plugin-svelte) | Svelte hygiene; no rule on layout reads, rAF or listeners | n/a | 3.23.1, 2026-10-09 | CONFIRMED (rule list, per static researcher) |
| ESLint "layout thrashing" rule | does not exist | - | - | Negative result: npm and GitHub searches by static researcher and writer (`layout thrashing`, `forced reflow`) found only runtime libraries |
| eslint-plugin-compat, stylelint-plugin-use-baseline, stylelint-no-unsupported-browser-features | Browser **support**, not cost | Safari-aware for support | 7.0.2 / 1.4.7 / 8.1.2, 2026 | CONFIRMED. Useful only for the `@supports` fallbacks around scroll timelines |
| [@sveltejs/enhanced-img](https://github.com/sveltejs/kit), vite-imagetools | Build: AVIF/WebP, `srcset`/`sizes`, intrinsic sizes | none | 1.0.0, 2026-10-01 / 12.0.1, 2026-08-28 | CONFIRMED (npm; docs per static researcher) |
| beasties, critical | Build: critical CSS | none | 2026-09 | CONFIRMED (npm). Load time only; no lesson |
| postcss-will-change | Adds a 3D hack before `will-change` | old | 4.0.1, 2022 | CONFIRMED stale. Adds layers; avoid |
| [Motion animation performance audit](https://motion.dev/docs/animation-performance-audit) (Motion+, paid) | AI-agent scan of CSS/Motion/GSAP/Anime.js plus optional local profiling; grades S-F by tier; flags blur > 10 px, infinite off-screen loops, excess `will-change` | page names no engine | current | CONFIRMED (docs). Quality UNVERIFIED (paid, not run) |

### 2.1a The two stylelint plugins' exact lists (read from cloned source)

**stylelint-high-performance-animation** (`index.js`, commit c890435, 2026-03-09):
- **What it checks:** `transition-property` (l.177), `transition` (l.201) and declarations inside `@keyframes`
  (l.274).
- **`all`:** `transition: all` is flagged (l.184, 224-244).
- **Option:** `ignore: "paint-properties"` drops the paint list.
- **`propsThatCauseLayout` (l.36-110):**
  - position and insets: `position`, `top`, `bottom`, `left`, `right`, `inset-block-start/-end`,
    `inset-inline-start/-end`;
  - sizes: `width`, `height`, `inline-size`, `block-size`, and every `min-`/`max-` size;
  - `padding` and `margin` with every side;
  - `display`, `border-width`, `border-spacing`, `border-collapse`, `border`;
  - fonts: `font`, `font-size`, `font-family`, `font-weight`, `font-style`;
  - `float`, `overflow`, `overflow-x/-y/-block/-inline`, `line-height`, `vertical-align`, `clear`, `white-space`,
    `list-style`, `list-style-type`, `zoom`, `content`, `box-sizing`;
  - text: `text-shadow`, `text-align`, `text-indent`, `text-transform`, `text-overflow`, `word-wrap`,
    `letter-spacing`;
  - `appearance`, `direction`.
- **`propsThatCausePaint` (l.112-130):** `color`, `border-color`, `border-style`, `border-radius`, `visibility`,
  `text-decoration`, `background`, `background-color`, `background-size`, `background-image`, `background-position`,
  `background-repeat`, `outline`, `outline-style`, `outline-width`, `outline-color`, `box-shadow`.
- **Not in either list:**
  - `grid-template-*` and `flex-basis`: the "o" and the avatar exit (lesson 5);
  - `stroke-dashoffset` and every SVG property: the accent word (lesson 6);
  - `filter`, `backdrop-filter`, `clip-path`, `mask`.
- **Never looked at:** timing functions. It parses them only to skip them (l.14-24).

**stylelint-plugin-css-performance-budget** (`src/rules/`, commit 0ef7be2, 2026-10-05):
- **`no-layout-thrashing-properties` (l.46-83, transitions and keyframes):**
  - `bottom`, `height`, `left`, `right`, `top`, `width`;
  - `inset`, `inset-block-*`, `inset-inline-*`;
  - `margin` and `padding` with every side and logical form;
  - `max-height`, `max-width`, `min-height`, `min-width`.
- **`no-expensive-animation-properties` (l.69-81):** `-webkit-backdrop-filter`, `backdrop-filter`,
  `background-position`, `background-size`, `box-shadow`, `clip-path`, `filter`, `mask`, `mask-image`,
  `mix-blend-mode`, `text-shadow`.
  - Thresholds: filters are reported only past `maxFilterBlurRadiusPx` 30, `maxFilterFunctions` 4,
    `maxShadowBlurRadiusPx` 48 or `maxShadowLayers` 3 (`_internal/paint-cost-analysis.ts` l.36-41).
  - `transition: all` is flagged unless `allowTransitionAll`.
  - Keyframes are checked by default (l.118).
- **`no-will-change-abuse`:** more than 5 properties (l.44); the keywords `all`, `contents`, `scroll-position`
  (l.45-49).
- **Not in any list:** `grid-template-*`, `flex-basis`, `border-width`, `stroke-dashoffset`, `steps()`/`linear()`.

### 2.2 Runtime: Chrome

| Tool | What it measures | Per frame? | Status |
|---|---|---|---|
| Lighthouse 13 `non-composited-animations` | Animated nodes Chrome could not composite, with 6 "actionable" reasons (unsupported property, transform depends on box size, filter may move pixels, non-replace composite, incompatible animations, unsupported timing) | no, per node | CONFIRMED (`core/audits/non-composited-animations.js` l.62-86; v13.5.0, 2026-09-18). It reads Chrome's `compositeFailed` and `unsupportedProperties` trace fields (`core/gather/gatherers/trace-elements.js` l.241-253), and that gatherer runs in timespan mode too (l.51), so a scroll user flow can feed it. It sees CSS/WAAPI animations only, not script-written styles |
| Lighthouse 13 insights: `forced-reflow`, `third-parties`, `image-delivery`, `cls-culprits`, `dom-size` | Trace-based checks | no | CONFIRMED (`core/audits/insights/`). Scroll needs **timespan** mode (user flows, CONFIRMED in `docs/user-flows.md`); whether every audit runs in timespan is UNVERIFIED |
| Lighthouse CI (`@lhci/cli`) | Lighthouse in CI with assertions and budgets | no | CONFIRMED, but 0.15.1 (2025-06-25) lags Lighthouse 13; navigation-oriented. Prefer a user-flow script |
| DevTools Rendering panel | Paint flashing, layer borders, frame rendering stats (fps, GPU memory), "Scrolling performance issues" (scroll-listener elements) | live, not logged | CONFIRMED ([docs](https://developer.chrome.com/docs/devtools/rendering/performance)) |
| DevTools Layers panel | Layer list, reasons, memory | no | UNVERIFIED this session (well known) |
| [Perfetto](https://perfetto.dev) `chrome/chrome_scrolls_v4.sql`, `scroll_jank_v4.sql`, `event_latency.sql` | Chrome's own per-frame scroll-jank metric, missed vsyncs, stage breakdown per scroll update | **yes** | CONFIRMED (files in the Perfetto stdlib; v58.2, 2026-08-24). Chrome on desktop or Android only |
| Long Animation Frames API (+ `forcedStyleAndLayoutDuration` per script) | Frames of 50 ms or more, with script attribution | ≥ 50 ms only | CONFIRMED; Safari and Firefox: not supported (MDN browser-compat-data) |
| [bye-thrash](https://www.npmjs.com/package/bye-thrash) | Dev-only patch of DOM APIs: logs a layout read after a style write in the same frame, with call site | yes (events) | CONFIRMED (README of 0.1.3, 2026-03-30; tiny, new). Engine-neutral, runs in any browser incl. Safari |
| fastdom | Read/write batching library (prevention, not detection) | - | CONFIRMED, last push 2024-02 |
| [Sauce Labs jankiness check](https://docs.saucelabs.com/performance/motion/) | 5 s slow scroll; `averageFPS`, forced reflow counts, memory diff | averages | CONFIRMED; Chrome only, paid |

### 2.3 Runtime: WebKit and devices

| Tool | What it measures | Status |
|---|---|---|
| Safari Web Inspector Timelines + Frames view | Every style recalc, layout, paint and composite with the triggering JS; frames split into JavaScript / Layout / Paint / Other | CONFIRMED ([webkit.org](https://webkit.org/web-inspector/timelines-tab/)). Real iPhone over USB; manual; attaching it disturbs timing (protocol §5.5) |
| Safari Web Inspector Layers tab | Layers with reasons, paint count, memory | CONFIRMED ([webkit.org](https://webkit.org/web-inspector/layers-tab/)); reasons can be empty (WebKit bug 242590) |
| [sitespeed.io / Browsertime](https://www.sitespeed.io/documentation/sitespeed.io/mobile-phones/) | Drives Safari on a USB iPhone (`--safari.ios`) or the Simulator; HAR, video, visual metrics | CONFIRMED (v42.7.0, 2026-09-11). No frame, layout or paint counts; needs an unlocked phone on a Mac, so not cloud CI |
| Playwright WebKit | Automation on Playwright's own WebKit build | CONFIRMED: not Safari, not iOS ([docs](https://playwright.dev/docs/browsers)); tracing and CDP are Chromium only. Screenshots can freeze animations (`animations: "disabled"`, CONFIRMED in `params.md`) |
| WebPageTest iOS, BrowserStack, AWS Device Farm | Video, filmstrips, native-app metrics | UNVERIFIED for iOS Safari frame timing; none found that exposes it |
| Xcode Instruments | Thermal state (we use xctrace); link to Safari page frames | Thermal CONFIRMED in our own tools; page-frame linkage UNRESOLVED |

### 2.4 Rule tables and research

| Item | What it encodes | Status |
|---|---|---|
| [CSS Triggers data](https://github.com/GoogleChromeLabs/css-triggers) (blink/webkit/gecko JSON) | layout/paint/composite flags per property change | CONFIRMED archived 2018. WebKit file: 18 of 220 entries are not all-true; `transform-change` is marked layout. Useless for WebKit |
| WebKit `Source/WebCore/css/CSSProperties.json` | `animation-wrapper-acceleration`: "always" = opacity, filter, backdrop-filter, transform, translate, scale, rotate; "threaded-only" = the five `offset-*` | CONFIRMED (writer's own extraction; file changed 2026-10-10). The only machine-readable WebKit acceleration list. No layout/paint rules: those are C++ (`StyleDifference.cpp`) |
| Blink `css_properties.json5` | `invalidate:` groups for 313 properties (96 layout+paint, 51 paint, 34 layout, ...) | CONFIRMED (writer's count). Categories, no ms; a build input, not an API |
| Blink `compositor_animations.h` | Failure-reason bitmask (4096 = `kFilterRelatedPropertyMayMovePixels`, 8192 = unsupported property) | CONFIRMED; matches platform facts 1-2 |
| Papers (WebChar 2012, Servo layout prediction 2020, mobile load-energy models) | Page-load or parallelism cost | Abstracts only (engine researcher). No paper predicts per-change style/layout/paint cost for WebKit; absence OBSERVED in two searches, ACM DL and Scholar not searched |

## 3. Map: our 30 lessons against existing tools

Coverage: **yes** = an existing tool flags the mechanism without us adding rules; **part** = only in Chrome, only
manually, or with an incomplete list; **gap** = nothing found. "Manual" means a person reading Web Inspector or
DevTools.

| # | Lesson (short) | Lint / build | Runtime, Chrome | WebKit / iPhone | Coverage |
|---|---|---|---|---|---|
| 1 | Read-write-read in scroll callbacks | none (a `no-restricted-syntax` pattern can approximate) | bye-thrash (any engine), Lighthouse forced-reflow insight, LoAF `forcedStyleAndLayoutDuration` | bye-thrash in Safari; Timelines manual; the WebKit-only `scrollY` read (fact 8): nothing | part |
| 2 | Inherited custom property as a per-frame bus | none | Lighthouse flags a CSS animation of a custom property; JS-written vars: nothing | Timelines manual | gap |
| 3 | JS drives effects CSS switched off | none | none | none | gap |
| 4 | Two drivers on one property | none | none | none | gap |
| 5 | Layout properties in decoration | both stylelint plugins (not `grid-template-columns`, `flex-basis`) | Lighthouse non-composited | none | yes |
| 6 | Paint-only: dashoffset, background-position, SMIL, `steps()` | `background-position` yes; `stroke-dashoffset`, SMIL, `steps()`/`linear()` no (core rule can ban) | Lighthouse (dashoffset in Chrome) | iOS 26 timing-function rule (fact 5): nothing | part |
| 7 | Per-frame text inside size containers | none | none | none (WebKit-only, fact 18) | gap |
| 8 | Presence flips (opacity 1, transform none) | none | none (Blink does not relayout) | Timelines manual | gap |
| 9 | iOS toolbar + sticky + aspect-ratio cards | none | none (no toolbar in emulation) | phone + finger only | gap |
| 10 | Broad pause rules, flapping lazy gates | none | trace counts manual | Timelines manual | gap |
| 11 | Resized composited, blurred layers | none for var-driven tweens | Lighthouse sees only CSS animations | Layers tab manual; backing-store discard (fact 16): nothing | part |
| 12 | Layer count multiplier | perf-budget `no-will-change-abuse` (heuristic) | Layers panel manual | Layers tab manual (count, MB) | part |
| 13 | Layers built in the interaction's first frame | none | none | Layers tab manual, no first-frame view | gap |
| 14 | One threshold, three owners; reveal memory | none | none | none | gap |
| 15 | Large-area blur | perf-budget blur radius, Motion audit > 10 px (radius, not area or Composite) | Lighthouse "filter may move pixels" | Composite/MB: nothing | part |
| 16 | Oversized decorative pictures | enhanced-img, vite-imagetools | Lighthouse `image-delivery`, `image-size-responsive` | WebKit paint cost (the part that bought frames): nothing | yes (size), gap (paint) |
| 17 | Effects that break per engine | none | screencast vs screenshot is a Chrome lesson | Playwright WebKit screenshots (not iOS Safari) | part |
| 18 | Loops that never stop | Motion audit (Motion `repeat: Infinity` only) | DevTools manual | none | part |
| 19 | 1 s timer drifts on a hot phone | none | none | none | gap |
| 20 | Third-party scroll listener | none | Lighthouse `third-parties` insight, Rendering "Scrolling performance issues" | none | part |
| 21 | Scroll-jacked ending | `no-restricted-syntax` can ban `passive: false` | Rendering panel highlights listeners | behaviour: finger only | part |
| 22 | Where in the motion a stall lands | none | none | perception | gap |
| 23 | Wrong engine and device | - | - | sitespeed.io drives a real iPhone (video only); Web Inspector | part |
| 24 | Scripted scroll is not a finger | - | - | none | gap |
| 25 | Averages hide felt frames | - | Perfetto per-frame jank (Chrome); LoAF ≥ 50 ms only | Frames view manual | part |
| 26 | Heat, host state, noise | - | - | Xcode thermal state | gap |
| 27 | Dirtier vs payer | - | DevTools "initiated by" | Timelines link to triggering JS | yes (manual) |
| 28 | Time-since-start logging, one change per block | - | - | - | process, no tool |
| 29 | Pixel tolerance for look-alikes | - | Playwright `toHaveScreenshot` with frozen animations and a ratio threshold | same in Playwright WebKit | yes (with our tiers) |
| 30 | No budget | stylelint/ESLint as budget gates | Lighthouse budgets (load metrics, wrong axis) | none | part |

**Tally.** yes 4 (5, 16 sizes, 27 manual, 29); part 12; gap 13 (2, 3, 4, 7, 8, 9, 10, 13, 14, 19, 22, 24, 26).
Lesson 28 is process. Read by group:

- **A (script) and B (properties)** are best served, almost all through Chrome.
- **C (WebKit layout traps)** has no automated coverage at all.
- **D (layers)** is manual only.
- **E-G** are mostly behaviour and measurement, which no tool owns.

## 4. Gaps, with evidence

1. **No WebKit cost rules anywhere outside WebKit's C++.**
   - Evidence: CSS Triggers is archived and wrong for WebKit (§2.4), and both stylelint plugins are engine-neutral
     lists.
   - The rules behind lessons 6-9 (dashoffset as SVG layout, presence flips, size-container restyle, `contain: layout`
     not a boundary, iOS 26 `steps()`) live in `StyleDifference.cpp`, `RenderObject.cpp` and `KeyframeEffect.cpp`.
     Section 6 of the distillation cites them.
   - The only machine-readable piece is the acceleration list in `CSSProperties.json`, and the accelerated set moves
     between versions (WebKit bugs 250970, 253315). So any table needs a version tag.
2. **Conditional costs are not property costs.** The engine researcher's point stands. Most of our WebKit costs
   depend on values and state, not on the property name:
   - opacity crossing 1;
   - none to some;
   - a layer's size change discarding its backing store;
   - sub-pixel offsets;
   - sync image decode on an already painted layer.

   A linter sees the stylesheet, not the value at frame N. These need a runtime probe or the device.
3. **Scroll context.** A "cheap" scroll timeline still restyles every target each update on WebKit (fact 23). A
   reveal's cost depends on what else flips at the same y (lesson 14). The toolbar resize exists only on iOS Safari
   with a finger (lesson 9). No tool models where on the page work lands. Perfetto does this per scroll update, but
   only for Chrome.
4. **Layer and blur memory pricing.** Web Inspector's Layers tab shows count and MB per layer, but only manually, and
   it has no "built in the first frame of this interaction" view (lessons 12-15). No tool prices a layer or blur
   before the build. Chrome's GPU memory overlay is Chrome's, not Core Animation's.
5. **Work at rest and ownership.**
   - No tool parks the page at each scroll position and asserts zero rAF, style, layout and paint (lesson 18).
   - No tool detects two drivers on one property (lesson 4), JS running effects CSS disabled (lesson 3), or one
     threshold with several owners (lesson 14).
   - All four are detectable in a dev-mode probe (`getAnimations()`, a rAF hook, MutationObserver, transition events).
6. **Per-frame WebKit counts in automation.**
   - What exists: LoAF is not in Safari, Playwright's WebKit is not Safari and has no tracing, sitespeed.io gives
     video and visual metrics only, and Sauce Labs is Chrome only.
   - Our own `iphone.mjs` and `frames.mjs` already produce frames over 34/50 ms by scroll position on a real
     iPhone. We found no public equivalent.
7. **Heat, finger and perception** (lessons 19, 22, 24, 26): no web tool. These stay human and device work.

## 5. What a WebKit-aware checker must encode

Read from sparse clones on 2026-10-12:
- WebKit main at `ea4cc38efe` (2026-10-12);
- Chromium main at `23fe46e556` (2026-10-12);
- files outside the sparse set read with `gh`: WebKit `RenderObject.cpp` at `1ded72f138`, `LocalDOMWindow.cpp` at
  `7fa92f6889`, Blink `css_properties.json5` at main.

The phone runs the iOS 26.6 branch, so line numbers there differ; what matters is the rule.

Columns:
- **Kind** says where a checker can see the condition: **S** = in the stylesheet (lint); **R** = only at run time
  (the value at frame N, or a size); **V** = it depends on the engine version or a preference, so a rule needs a
  target tag.

| # | Rule a WebKit checker flags | WebKit source (file:line) | Chromium counterpart | Kind | Lessons |
|---|---|---|---|---|---|
| 1 | `transform` going none ↔ some forces **layout** | `Source/WebCore/style/StyleDifference.cpp` 210-212 (`miscDataChangeRequiresLayout`, l.184): `hasTransform()` differs → `return true` | `core/style/computed_style.cc` 820-824: only `transform_changed` (property-specific, no layout) | S (keyframe or rest value `none` next to an animated transform), R | 8 |
| 2 | `opacity` crossing 1 (opaque ↔ not) forces a **full layout** | `StyleDifference.cpp` 219-226; the FIXME says simplified layout "can't quite do that yet" | `computed_style.cc` 797-798: `opacity_changed` only; json5 `opacity` invalidates `["opacity"]` | S (an animation or rest state ending on `opacity: 1`), R | 8, 14 |
| 3 | `filter` none ↔ some forces **layout** | `StyleDifference.cpp` 228-229 (`hasFilters()` differs) | `computed_style.cc` 786-787: `filter_changed`; json5 `filter-data` | S, R | 8, 15 |
| 4 | `backdrop-filter` none ↔ some forces **layout** | `StyleDifference.cpp` 287-288 (`rareDataChangeRequiresLayout`, l.237) | json5 `backdrop-filter` invalidates `["compositing"]` | S, R | 11 |
| 5 | `stroke-dashoffset` / `stroke-dasharray` change is an **SVG layout** (stroke bounds recomputed) | `StyleDifference.cpp` 168-175 (`svgDataChangeRequiresLayout`, l.147) | json5 `stroke-dashoffset` invalidates `["paint"]`; not compositable (falls to `DefaultToUnsupportedProperty`, `compositor_animations.cc` 173) | S | 6 |
| 6 | Grid track change is layout in both engines | `StyleDifference.cpp` 270 (`a.grid != b.grid`) | json5 `grid-template-columns` `["layout", "paint"]` | S | 5 |
| 7 | `pointer-events` change (inherited) forces **recomposite** of the layer, per element of the subtree | `StyleDifference.cpp` 977-978 (`changeRequiresRecompositeLayer`, l.975) | not read | S/R (a script write of `style.pointerEvents` in a frame loop) | 1 |
| 8 | Accelerated property set | `Source/WebCore/css/CSSProperties.json` `animation-wrapper-acceleration`: "always" for opacity 7596, filter 10847, backdrop-filter 11244, transform 12798, translate 12946, scale 12967, rotate 12992; "threaded-only" for offset-path/-distance/-position/-anchor/-rotate 7486-7559 | `compositor_animations.cc` 193-208 (`CompositedAnimationRequiresProperties`: rotate, scale, translate, transform, opacity, backdrop-filter, filter); background-color, box-shadow, clip-path only through native paint worklets (339-372) | S | 2, 5, 6 |
| 9 | Custom-property animations are never accelerated in WebKit; in Blink only with a registered CSS Paint worklet | not in the WebKit list (#8) | `compositor_animations.cc` 426-440 (`kVariable`: unsupported unless `HasCSSPaintImagesUsingCustomProperty`) | S (`var()` animated in `@keyframes`, `@property` animations) | 2 |
| 10 | `steps()` or `linear()` with points keeps the animation off Core Animation | `Source/WebCore/animation/KeyframeEffect.cpp` 2007-2013 inside `#if USE(CA)`, flags computed at 1780-1815 | no timing-function exclusion in `compositor_animations.cc`; the only timing check is `ConvertTimingForCompositor` (503-509) | S + **V**: on WebKit main the threaded path returns earlier (1997-1999) when `ThreadedTimeBasedAnimationsEnabled` (`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` 6330-6338, default true, `ENABLE(THREADED_ANIMATIONS)`). iOS 26.x: on the CA path (fact 5, CONFIRMED); which Safari ships the threaded default: UNRESOLVED | 6 |
| 11 | Other Core Animation exclusions: scroll/view timeline (`m_isAssociatedWithProgressBasedTimeline`, 2004-2005, unless `ThreadedScrollDrivenAnimationsEnabled`, yaml 6304-6312, via `canHaveAcceleratedRepresentation` 3268-3279); composite ≠ replace (2015); `url()` reference filter (1977, set at 2952); width/height animated together with a size-dependent transform such as `translate(50%)` (1983, set at 3048-3049); a discrete transform interval (1986); an accelerated property overridden by the cascade (1974, set at 2947) | `KeyframeEffect.cpp` lines as given | `kEffectHasNonReplaceCompositeMode` (1<<4), transform depends on box size (1<<11), incompatible animations (1<<6): Lighthouse's actionable list | S (most), V (timelines) | 2, 11 |
| 12 | A composited layer whose backing parameters change **discards its backing store** and repaints all of it. The parameters are size, scale, color space, contents format and the opaque flag | `Source/WebKit/Shared/RemoteLayerTree/RemoteLayerBackingStore.mm` 145-152 (`ensureBackingStore`: parameters differ → `clearBackingStore`, 139-143 → `setNeedsDisplay`); the fields are in `RemoteLayerBackingStore.h` 95-108 | not read (cc raster invalidation) | R (a promoted element whose box size changes in motion) | 11, 13 |
| 13 | Tiling starts above 1280 device px on iOS (1024 under memory pressure, level < 35), 2048 elsewhere; below it a layer is one backing store | `Source/WebCore/platform/graphics/ca/GraphicsLayerCA.cpp` 101-107, `requiresTiledLayer` 4933-4946 | n/a (Chrome tiles everything) | R (size × page scale) | 11, 12, 15 |
| 14 | Only layout **plus size** containment makes a layout boundary; `contain: layout` alone does not | `Source/WebCore/rendering/RenderObject.cpp` 536 (`isLayoutBoundary`, l.522) | not re-read (fact 20 cites claims-audit W2) | S | 9 |
| 15 | Size containers are collected while style resolves and their queries evaluated against them (the interleaved-layout path of fact 18) | `Source/WebCore/style/StyleTreeResolver.cpp` 1159-1160 (`hasSizeContainment()` → `sizeQueryContainers`), 1199; interleaved layout per claims-audit W4, not re-traced | json5 `container-type` invalidates `["layout"]` | S (a `container-type` ancestor of per-frame text or animated content) | 7 |
| 16 | Reading `window.scrollY` when it is not 0 runs any pending layout first | `Source/WebCore/page/LocalDOMWindow.cpp` 1508-1512 (`updateLayoutIgnorePendingStylesheets`) | not read | S for ESLint: a `scrollY` read after a style write in the same callback | 1 |

**What this means for a checker:**
- **Rules 1-11 and 14-16 have a form a linter can see** (CSS for most; ESLint for 7 and 16). A WebKit pack can
  encode them from these lines with a version tag.
- **Rules 1-3 are value conditions.** A linter can only flag likely cases: an end or rest value of
  `1`/`none` beside an animated side. The real test is runtime, which is why the rest-and-flip probe (§6, Build 1)
  exists.
- **Rules 12-13 are runtime only.** They need sizes and the composited state, which only the engine knows.
  WebKit's Layers tab shows both.
- **Rules 10-11 move between versions.** On WebKit main, threaded animations (default on) lift the
  `steps()`/`linear()` and scroll-timeline exclusions. A rule pack must key on the target iOS version and say
  UNRESOLVED for versions nobody has checked.
- **No WebKit rule here gives a cost in ms.** The source says which stage runs, not how long it takes. Size, layer
  count and frame sharing set the time (lessons 12, 30), and that number still comes from the phone.

## 6. Recommendation

### Reuse (now, cheap)

| Layer | What | How to wire it into SvelteKit/Vite |
|---|---|---|
| CSS lint | stylelint + `stylelint-config-html/svelte` + stylelint-high-performance-animation + selected stylelint-plugin-css-performance-budget rules (blur radius, `will-change`, fixed backgrounds) | `stylelint "src/**/*.{css,svelte}"` in `npm run lint` and CI. Lower perf-budget's `maxFilterBlurRadiusPx` (the default 30 px passes every blur on this page); it still cannot see blur area |
| CSS lint, core rules | `declaration-property-value-disallowed-list`: `/^(animation|transition)(-timing-function)?$/` → `/steps\(/`, `/linear\(/` (fact 5); `property-disallowed-list` scoped by review | same config; costs nothing to add |
| JS lint | eslint-plugin-svelte + `no-restricted-syntax` selectors | Selectors: a rect/offset/`scrollY` read inside a `requestAnimationFrame` or scroll-listener callback; `passive: false`; writing `style.pointerEvents` next to `elementFromPoint`. A cheap approximation of lesson 1, with false positives; it does not see read-after-write order |
| Build | `@sveltejs/enhanced-img` | Replaces `<img>` for local pictures; covers the size half of lesson 16 |
| Dev runtime | bye-thrash | `if (dev) thrash.init()` in `src/hooks.client.ts`. Works in Safari too, so it also runs on the phone and the Simulator |
| Chromium CI | Playwright (Chromium) scripted scroll with tracing → Perfetto `chrome_scrolls_v4` / `scroll_jank_v4`; Lighthouse timespan user flow for non-composited animations and forced reflow | A CI job against `vite preview`. Gate on janky-frame counts per scroll zone, not on a score. Remember the throttle limits (lesson 23) |
| Visual | Playwright `toHaveScreenshot` with `animations: "disabled"` in Chromium and WebKit | Use our PR-010 tiers as thresholds (lesson 29) |
| Device | Safari Web Inspector Timelines/Layers for attribution; sitespeed.io `--safari.ios` only if we want a public driver | Local Mac with a USB iPhone, not cloud |

### Extend (the one place an existing tool should grow)

**A WebKit rule pack as a stylelint plugin.** It is small, and our sources already exist.
- **Seed:** `CSSProperties.json` `animation-wrapper-acceleration` (version-tagged), plus our CONFIRMED facts 3-7, 16,
  18, 20, 23.
- **Rules:**
  - animated property not in WebKit's accelerated set;
  - `steps()`/`linear()` points in animations (iOS 26);
  - `stroke-dashoffset`, SMIL and `background-position` animation;
  - `var()` inside `@keyframes`;
  - keyframes or rest states ending on `opacity: 1`, `transform: none` or `filter: none` next to an animated side
    (lesson 8);
  - `container-type` on an ancestor of animated or typed text (lesson 7, within one file);
  - `contain: layout` without `size` used as a boundary (fact 20);
  - `aspect-ratio` + `height: auto` cards inside a sticky ancestor (lesson 9, heuristic);
  - animated `width`/`height`/`border-radius`/blur on an element that also has `will-change` or a filter (lesson 11).
- **Base:** contribute the property-list fixes (`grid-template-columns`, `flex-basis`, `stroke-dashoffset`) upstream
  to stylelint-high-performance-animation, and keep the WebKit rules in our own plugin. Upstream is engine-neutral by
  design.

### Build (only the gap)

1. **Dev-mode rest-and-flip probe** (lessons 3, 4, 8, 14, 18), a small client script loaded by a Vite plugin in dev
   and in the Playwright runs. It reports:
   - running animations and rAF fires while parked at each scroll position (goal 0);
   - two writers per property: an inline write while a transition on that property is active;
   - elements whose computed opacity reaches exactly 1, or transform or filter `none`, at an animation end;
   - several state changes inside one scroll-position bucket.

   It runs in any engine, so the same script works in Safari on the phone or the Simulator. It replaces nothing on
   the phone; it finds candidates.
2. **CI budget = our cost card.** `tools/costcard.mjs` already turns Chrome traces and Simulator Timelines into layouts,
   paints, layers, memory and rAF per element and event (lesson 30, memory `less-work-landing-rule`). Wiring it into a
   CI job with fixed budgets is the "budget in CI" checklist item (distillation §5, Guardrails). Nobody publishes this.
3. **Not worth building:** a static per-property ms table. The costs are conditional (gap 2), engine-version dependent
   (gap 1), and frame-shared (lesson 30). A table would give false confidence. Also skip automatic rewriting: the safe
   rewrites (FLIP for size, `opacity: 0.999` rests, linear ramps for `step-end`) each needed a pixel check and
   sometimes a user decision (lessons 5, 6, 29).

### Staged plan

| Stage | Work | Effort | Catches |
|---|---|---|---|
| 1 | stylelint + two plugins + core `steps()`/`linear()` ban; ESLint `no-restricted-syntax`; bye-thrash in dev; enhanced-img | ~1 day | 5, 6 (part), 1 (part), 15 (radius), 16 (size), 21 (listener) |
| 2 | Chromium CI: Playwright scroll + Perfetto scroll-jank SQL + Lighthouse timespan; screenshot diffs with frozen animations | 2-3 days | 1, 5, 6, 20, 25 (Chrome), 29 |
| 3 | WebKit stylelint rule pack (version-tagged, sources cited per rule); upstream the three missing properties | 2-4 days | 2, 6 (iOS), 7, 8, 9 (heuristic), 11 (static part) |
| 4 | Rest-and-flip probe in dev and CI (Chromium + Playwright WebKit), cost-card budgets in CI | 3-5 days | 3, 4, 8, 14, 18, 30 |
| 5 | Keep: phone frames by zone, finger A/B, heat, Web Inspector layer census as the landing gate | ongoing | 9, 13, 19, 22-26 |

Effort figures are the writer's estimate, not measured.

## 7. Dropped or unverified

- **csstriggers.com:** the live site's source and update date are UNVERIFIED. Its data repo is archived, so it was
  not kept as a rule source.
- **"fixing-motion-performance" agent skills (tessl and others):** not opened, UNVERIFIED, dropped.
- **webhint:** last release 2024-08-29, perf hints not read. Dropped.
- **WebPageTest iOS, BrowserStack, AWS Device Farm frame data:** UNVERIFIED. No source showed iOS Safari frame timing.
- **Xcode Instruments for Safari page frames:** UNRESOLVED. The decisive check is an `xctrace` Animation Hitches
  recording of Safari during one of our scripted scrolls, compared with `iphone.mjs` frame stamps.
- **DevTools Layers panel details, `eslint-plugin-svelte` rule semantics:** UNVERIFIED this session (well-known
  features, not re-read).
- **`react-scan`, `@e18e/eslint-plugin`:** React-only or unrelated. Dropped.

## Sources

Checked 2026-10-12 via `gh api` (read-only), `npm view` and WebFetch:
- **Lint plugins:**
  - github.com/kristerkari/stylelint-high-performance-animation (README, `index.js`);
  - github.com/Nick2bad4u/stylelint-plugin-css-performance-budget (`src/rules/*.ts`);
  - github.com/stylelint/stylelint (`lib/rules`);
  - github.com/ota-meshi/stylelint-config-html (README);
  - github.com/eslint/eslint (`lib/rules`).
- **Lighthouse:** github.com/GoogleChrome/lighthouse (`core/audits/non-composited-animations.js`,
  `core/audits/insights/`, `docs/user-flows.md`); developer.chrome.com/docs/lighthouse/performance/non-composited-animations.
- **Chrome DevTools:** developer.chrome.com/docs/devtools/rendering/performance; developer.chrome.com/docs/performance/insights/forced-reflow.
- **Perfetto:** github.com/google/perfetto (`src/trace_processor/perfetto_sql/stdlib/chrome/`).
- **LoAF support:** github.com/mdn/browser-compat-data (`api/PerformanceLongAnimationFrameTiming.json`,
  `api/PerformanceScriptTiming.json`).
- **Web Inspector:** webkit.org/web-inspector/timelines-tab/; webkit.org/web-inspector/layers-tab/; bugs.webkit.org 242590.
- **Device and automation:**
  - sitespeed.io/documentation/sitespeed.io/mobile-phones/;
  - docs.saucelabs.com/performance/motion/;
  - playwright.dev/docs/browsers, playwright.dev/docs/api/class-browser, github.com/microsoft/playwright
    (`docs/src/api/params.md`).
- **Rule tables:**
  - github.com/GoogleChromeLabs/css-triggers (`data/webkit.json`);
  - github.com/WebKit/WebKit (`Source/WebCore/css/CSSProperties.json`);
  - github.com/chromium/chromium (`third_party/blink/renderer/core/css/css_properties.json5`,
    `core/animation/compositor_animations.h`).
- **Other tools:**
  - npm: bye-thrash 0.1.3 README;
  - motion.dev/docs/animation-performance-audit.
- **Researcher inputs:** de-tools-static, de-tools-runtime, de-tools-engine (messages, 2026-10-12). Their papers and
  WebKit bug references (250970, 253315, 253022) were not re-opened by the writer.

### Files read from cloned source (user T-275 #15)

Clones are in `scratchpad/lead/t275-tools/src/`, outside the repo: shallow, sparse, blobless, 278 MB in total. No
Chrome, phone or lock was used.

| Clone (commit, date) | Sparse set | Files read |
|---|---|---|
| `shpa` = stylelint-high-performance-animation (c890435, 2026-03-09) | full | `index.js` (l.14-130 lists, 177-290 walkers) |
| `perfbudget` = stylelint-plugin-css-performance-budget (0ef7be2, 2026-10-05) | full | `src/rules/no-layout-thrashing-properties.ts`, `no-expensive-animation-properties.ts`, `no-excessive-filter-effects.ts`, `no-will-change-abuse.ts`, `src/_internal/paint-cost-analysis.ts` |
| `lighthouse` (2ac69ab, 2026-10-09) | `core/audits`, `core/gather/gatherers`, `core/lib/tracehouse` | `core/audits/non-composited-animations.js`, `core/gather/gatherers/trace-elements.js`, `trace.js`, `core/audits/insights/` (list) |
| `perfetto` (56a6c73, 2026-10-12) | `src/trace_processor/perfetto_sql/stdlib/chrome` | `scroll_jank_v4.sql` (tables at l.103, 393), `chrome_scrolls_v4.sql` (l.39), `scroll_jank/` (list) |
| `webkit` (ea4cc38efe, 2026-10-12) | `Source/WebCore/{style,rendering/style,css,animation,platform/animation,platform/graphics/ca}`, `Source/WebKit/Shared/RemoteLayerTree`, `Source/WTF/Scripts/Preferences` | `style/StyleDifference.cpp`, `animation/KeyframeEffect.cpp`, `css/CSSProperties.json`, `style/StyleTreeResolver.cpp`, `platform/graphics/ca/GraphicsLayerCA.cpp`, `RemoteLayerBackingStore.mm`/`.h`, `UnifiedWebPreferences.yaml` |
| `chromium` (23fe46e556, 2026-10-12) | `third_party/blink/renderer/core/{animation,css/properties,style}` | `core/animation/compositor_animations.cc`, `core/style/computed_style.cc` |
| via `gh` (single files) | - | WebKit `rendering/RenderObject.cpp` (1ded72f138), `page/LocalDOMWindow.cpp` (7fa92f6889); Blink `core/css/css_properties.json5` (main), `core/animation/compositor_animations.h` |

Not done: the bye-thrash source repo was not found on GitHub under the name tried (`JOYCO-Studio/bye-thrash`). Its
npm tarball README was read instead.

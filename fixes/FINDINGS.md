# Shared findings: what works, what bites

The team's playbook for fixing scroll and animation jank on this page: techniques that won A/Bs,
pitfalls that cost a review round, and measurement lessons. **Read it before you edit, re-read it when
you resume.** Each entry names its source (topic, incident or review) so you can open the details in
`fixes/<topic>/README.md`.

Live findings from agents who are still working go to the board first:
`node tools/finding.mjs post …` (incident I-013; until it lands, `SendMessage` the lead). The lead folds
them into this file. Only the lead edits this file.

## Techniques that worked

| # | technique | where it won | notes |
|---|---|---|---|
| T1 | **Gate on the same media query as the CSS.** Where CSS already neutralises an effect (phones: scale 1, radius 0), skip the rect reads, the custom-property writes and the easing rAF. | phone-invisible-shrink: mobile 6x fps 66.5 → 71.6; iPhone frames >20 ms 60-64 → 40-43. commission-forced-layout: frames >20 ms 96 → 71 | Copy the query **exactly** from the CSS rule (all comma parts, `hover`/`pointer`). Keep side jobs such as class toggles that other code reads. Re-run the callback on the MQL `change` event and remove the listener on teardown. |
| T2 | **Cache `MediaQueryList` objects.** `matchMedia()` per frame parses the query each time; `.matches` on a cached MQL is live. | phone-invisible-shrink (`oe`/`ce`), commission (`A()`) | Behaviour-neutral, so it's safe everywhere. |
| T3 | **Write only on change.** Keep the last written value of each custom property or style in the closure and skip identical writes. | commission-forced-layout | The cache lives in the effect closure, so a remount resets it. |
| T4 | **Move layout reads off the frame.** Run `Range.getClientRects()` line counting and similar only when an input flips, and let a `ResizeObserver` on the element that reflows cover the rest. | commission-forced-layout (`j`): its forced layout left the LoAF top list | Check that the observer watches the element whose size actually changes (font swap, width, text). |
| T5 | **Composite instead of layout.** Replace animated `width` / `flex-basis` / `margin` / `border-width` with `transform`, `clip-path`, `opacity`; FLIP neighbours with WAAPI transforms. | layout-animations: idle layouts per 5 s 231-330 → 13-16 (hero), 248-279 → 13-16 (carousel) | **FLIP without reads:** in a centred flex row, a word whose width changes by Δ keeps its centre: siblings before it move -Δ/2 and after +Δ/2. Apply the width at once and animate the siblings from `translateX(±Δ/2)` to `none` with WAAPI, using the old duration and easing. Take Δ from widths the code already has, never from `getBoundingClientRect`. Check the sign under `dir=rtl` / `row-reverse`. **Progress bars:** a `--progress` var with `clip-path: inset(0 calc(100% - w) 0 0 round 999px)` (clamps its ends the way `border-radius: 999px` does), `background-size: w 100%` (gradient not stretched), and `w = max(<old padding box>, p*100%)` so 0 % matches: 0 % pixel diff at 7 values. **Two animations on one element:** use the individual `translate` property; it composes with `transform`, so a slide and a scale don't overwrite each other. |
| T6 | **Pause off-screen infinite animations per element.** IntersectionObserver (rootMargin `0px`) on the animated element, not the section. | layout-animations (gradient sweep gate), scroll-engine (avatar carousel) | The section-level engine gate (`rootMargin: 100%`) keeps tall sections "active" a full viewport away. Use `0px` only when the paused frame looks acceptable when it scrolls in: the hero accent keeps `100% 0px`, or it could freeze mid draw-out and show blank. |
| T7 | **Replace per-frame threshold rect reads with an IntersectionObserver.** A callback that reads a rect only to test "progress >= x" becomes an IO with a matching rootMargin. | proposed: future `l` / nav `_` `.hero-track` test, rootMargin `-128% 0px 200% 0px` | Open for wave 2 (scroll-engine / hero-exit). |
| T8 | **Mount hidden heavy DOM lazily.** A panel that is invisible until an interaction shouldn't mount synchronously inside a scroll frame. | nav-morph, topic 13: 42-75 ms LoAF at mount | `requestIdleCallback` after load, sync fallback when it's needed; `loading=lazy` images; pass the shown state down so nested timers pause. |
| T10 | **Cut a blur transition's invisible tail, keeping its curve.** Resample the original cubic-bezier into a shorter `linear()` easing that ends once the blur is under 1 device px; keep the original declaration first as a fallback. | large-area-blur, future-card reveal 1.6 s → 0.9 s: iPhone paint area 53.6-54.7 → 48.1-49.2 Mpx, 402x857 panel repaints 4 → 2 per run | Chrome 6x can't see it (P5). |
| T11 | **Hit-test without writes.** A toggle hit-test (inline `pointer-events:none` on your own root, then `elementFromPoint`, then restore) restyles the whole subtree twice per frame, because the property inherits. Use `document.elementsFromPoint()` and skip your own subtree (except descendants with explicit `pointer-events:auto`): same answer, no writes. | nav-hit-test: mobile 6x frames >20 ms 98 → 62, fps 69.1 → 75.3 (one run overlaps, load 11-17) | |
| T9 | **Engine: coalesce, debounce height-only resizes, finish on deactivate.** One rAF per scroll burst; a height-only `resize` (iOS toolbar) runs one frame 120 ms after the last event; an effect that goes inactive runs once more, so its final state is right. | scroll-engine (wave 2) | Anything that removed its own rAF tail (T1) then relies on this. |

## Pitfalls (each cost a review round or a wrong number)

| # | pitfall | source | how to avoid |
|---|---|---|---|
| P1 | **Replace-all on a minified short name** also rewrites SVG attributes and unrelated scopes: `cy` → `_cy` broke 6 icons' `<circle cy>`, and 3 screenshots didn't show it. | review of commission-forced-layout | Pick a new name that doesn't exist in the file (`grep -c` it first) and rename only inside your function. Before measuring, run `node tools/fix.mjs diff <topic>` and check that **every hunk sits inside your function**. |
| P2 | **Removing a rAF easing tail changes when side jobs run.** `.pain is-pain-dark` and the hero-track check then update only on engine callbacks. | review of phone-invisible-shrink | Check that the engine fires at the final scroll position (T9), and list the side jobs in your README. |
| P3 | **Safari 26: keyframes that reference an animated custom property resolve against its base value.** | hero-exit-scroll-timeline | Animate the real property in the keyframes, or drive it from JS. |
| P4 | **What costs is a blur value that is *changing*, not `blur(0)` at rest.** `#platform` `filter:none` vs the permanent `blur(0px)` made no measurable paint difference at rest on the iPhone (6 s idle: paints 1676/1766 vs 1809/1762). But WebKit repaints a filtered element's contents on every frame the filter value changes. | large-area-blur (corrects an earlier guess); nav-morph dropped its 5392 change | Shorten or skip blur *transitions* (T10); don't spend a patch on a resting `blur(0)`. |
| P5 | **Chrome CPU throttling can't show GPU raster cost** (blur, backdrop-filter, big layers). | large-area-blur | Needs the scripted iPhone check; mark it "iPhone pending" when the phone is away. |
| P6 | **The screenshot diff covers 3 points only**; small icons and off-shot sections escape it. 0-0.4 % is countdown/orbit/sweep phase noise. | commission review, layout-animations | Frozen-frame checks of what you changed, plus the P1 hunk check. |
| P8 | **A nested `backdrop-filter` inside a parent that already has one is not a visual no-op.** Removing the lang switch's backdrop inside the nav made the EN pill visibly darker (screenshot diff 0.51 %, exactly the pill rect). | large-area-blur, reverted | Keep it, or compensate the colour and prove it with a frozen-frame diff. |
| P9 | **A no-op Svelte state write still costs.** `set` compares with `===`, so `z(T, [], true)` with a fresh `[]` always triggers: it opens a batch and re-runs derived each-blocks, every frame. | pain-offscreen-notes (`d`, JS 4730, via chunks/BSBv9QXB.js 1229-1236) | Guard the write (`s(T).length === 0`), or keep a constant empty array. Look for `z(x, [` / `z(x, {` inside per-frame callbacks. |
| P10 | **Check the topic premise with a counter probe before fixing.** TOPICS row 11 said the pain interval adds hidden notes on phones; a MutationObserver showed 0 mutations (`le` returns early on matchMedia). The real cost was the per-frame scroll callback. | pain-offscreen-notes | Probe first: MutationObserver plus wrapped `getBoundingClientRect` / `querySelector` / `setInterval` counters, under the lock. |
| P11 | **Pausing an infinite animation off-screen shifts its phase.** The patched page resumes at a different point in the loop than the always-running baseline, so the screenshot diff rises above the 0.4 % noise line with no visual change (layout-animations: 0.56 %, only the gradient inside the titles). | layout-animations | Crop and inspect the diff before calling it a regression; say so in the README. |
| P7 | **Shared scratch files collide** between agents. | I-006 | `<scratchpad>/<topic>/`. |

## Couplings (change one, check the others)

- **Morph IO `dN` (JS 13082, rootMargin 200 %)**, about 3 screens before the page end, arms the blocking wheel/touchmove listeners (topic 6) **and** mounts the morph panel (topic 13, 42-75 ms LoAF), whose second countdown `cD` (JS 13160) animates while invisible (topic 1 part 2 must honour the `active` getter nav-morph passes). Any change to that callback touches topics 1, 6 and 13.
- **Future `l` (JS 11303)** also toggles `.pain is-pain-dark` and reads `.hero-track`; with T1 its side jobs rely on the engine's final-position callback (T9, P2).
- **Nav hit-test** reads the commission `entering` / `shrinking` classes (JS 12953), so commission still reads its rects on phones.

## Measurement lessons

- **Scripted scrolls can't see input-handler fixes.** `iphone.mjs scroll` and Chrome's A/B scroll by script, not touch, so making touchmove/wheel passive shows as flat (nav-morph iPhone: fps 52.7 vs 52.5). Measure those with a CDP `Input.dispatchTouchEvent` ack-latency probe, or the finger test.

- **Host load decides what an A/B can show.** At load above about 6, ranges overlap. Quote verdicts against an A/A at similar load, and the integrator re-measures a whole wave on a quiet machine (`research/measurement-parallelism/`).
- **Frames >20 ms and forced layout move first.** fps and >50 ms frames need bigger changes or quieter hosts to leave the noise.
- **Forced layout moves to the next reader instead of disappearing.** Removing pain's rect reads (333 → 0 per pass) cut `iE`'s forced layout from 46-52 to 4-7 ms, but the next reader (future `l`) rose from 15-20 to 25-30 ms: net -24 ms, within noise. A win shows up once all readers in the frame are gone or batched (T1, T7, scroll-engine's measure/mutate split); expect the combined wave to beat the sum of single A/Bs.
- **Idle costs need an idle phase** (I-002). Until it lands, a short own CDP probe is fine; document it and re-run the official tool later.
- **The scripted iPhone check works:** 3 runs each, alternating (ABBA), plain http (I-003), frames >20 ms / >34 ms as the metrics. It runs in parallel with Chrome.
- **Hold `chrome-measure` only while a run executes.** Short test jobs use the short lane (I-007, I-011).

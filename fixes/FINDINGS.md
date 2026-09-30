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
| T5 | **Composite instead of layout.** Replace animated `width` / `flex-basis` / `margin` / `border-width` with `transform`, `clip-path`, `opacity`; FLIP neighbours with WAAPI transforms. | layout-animations: idle layouts 231-330 → 13-16 per 5 s | Progress bars: write a `--progress` var and reveal with `clip-path: inset()`, not `width: N%`. Check rounded ends and the 0 % / 100 % states. |
| T6 | **Pause off-screen infinite animations per element.** IntersectionObserver (rootMargin `0px`) on the animated element, not the section. | layout-animations (gradient sweep gate), scroll-engine (avatar carousel) | The section-level engine gate (`rootMargin: 100%`) keeps tall sections "active" a full viewport away. |
| T7 | **Replace per-frame threshold rect reads with an IntersectionObserver.** A callback that reads a rect only to test "progress >= x" becomes an IO with a matching rootMargin. | proposed: future `l` / nav `_` `.hero-track` test, rootMargin `-128% 0px 200% 0px` | Open for wave 2 (scroll-engine / hero-exit). |
| T8 | **Mount hidden heavy DOM lazily.** A panel that is invisible until an interaction shouldn't mount synchronously inside a scroll frame. | nav-morph, topic 13: 42-75 ms LoAF at mount | `requestIdleCallback` after load, sync fallback when it's needed; `loading=lazy` images; pass the shown state down so nested timers pause. |
| T9 | **Engine: coalesce, debounce height-only resizes, finish on deactivate.** One rAF per scroll burst; a height-only `resize` (iOS toolbar) runs one frame 120 ms after the last event; an effect that goes inactive runs once more, so its final state is right. | scroll-engine (wave 2) | Anything that removed its own rAF tail (T1) then relies on this. |

## Pitfalls (each cost a review round or a wrong number)

| # | pitfall | source | how to avoid |
|---|---|---|---|
| P1 | **Replace-all on a minified short name** also rewrites SVG attributes and unrelated scopes: `cy` → `_cy` broke 6 icons' `<circle cy>`, and 3 screenshots didn't show it. | review of commission-forced-layout | Pick a new name that doesn't exist in the file (`grep -c` it first) and rename only inside your function. Before measuring, run `node tools/fix.mjs diff <topic>` and check that **every hunk sits inside your function**. |
| P2 | **Removing a rAF easing tail changes when side jobs run.** `.pain is-pain-dark` and the hero-track check then update only on engine callbacks. | review of phone-invisible-shrink | Check that the engine fires at the final scroll position (T9), and list the side jobs in your README. |
| P3 | **Safari 26: keyframes that reference an animated custom property resolve against its base value.** | hero-exit-scroll-timeline | Animate the real property in the keyframes, or drive it from JS. |
| P4 | **`filter: blur(0)` still costs.** A permanent `blur(calc(var(--x) * N))` repaints at rest. | hero `.scroll-cue`, `#platform` (large-area-blur) | Drop the `filter` when the value is 0 (class toggle), or cross-fade a pre-blurred layer. |
| P5 | **Chrome CPU throttling can't show GPU raster cost** (blur, backdrop-filter, big layers). | large-area-blur | Needs the scripted iPhone check; mark it "iPhone pending" when the phone is away. |
| P6 | **The screenshot diff covers 3 points only**; small icons and off-shot sections escape it. 0-0.4 % is countdown/orbit/sweep phase noise. | commission review, layout-animations | Frozen-frame checks of what you changed, plus the P1 hunk check. |
| P7 | **Shared scratch files collide** between agents. | I-006 | `<scratchpad>/<topic>/`. |

## Measurement lessons

- **Host load decides what an A/B can show.** At load above about 6, ranges overlap. Quote verdicts against an A/A at similar load, and the integrator re-measures a whole wave on a quiet machine (`research/measurement-parallelism/`).
- **Frames >20 ms and forced layout move first.** fps and >50 ms frames need bigger changes or quieter hosts to leave the noise.
- **Idle costs need an idle phase** (I-002). Until it lands, a short own CDP probe is fine; document it and re-run the official tool later.
- **The scripted iPhone check works:** 3 runs each, alternating (ABBA), plain http (I-003), frames >20 ms / >34 ms as the metrics. It runs in parallel with Chrome.
- **Hold `chrome-measure` only while a run executes.** Short test jobs use the short lane (I-007, I-011).

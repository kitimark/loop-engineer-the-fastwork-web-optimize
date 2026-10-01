# Fix: main-thread-infinite-animations (N3)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). No `patch.diff`: this topic ships no overlay change (see "Verdict").

**Status:** rejected: the premise is false, and nothing unowned is left to fix in Chrome. iPhone pending.
**Topic:** `fixes/TOPICS.md` N3. Owner `fix-infinite-anims`, reporting to mgmt-ops.
**Files touched:** none in the overlay. Deliverables: this README, `probe.mjs` (runtime inventory + R2
first-reader probe) and `slot.sh` (starts the servers inside the lock hold, probes, stops them).
**Finding posted:** F-015 (the orbit is dead code).

## Verdict in one paragraph

The topic's headline target, the hero CTA orbit (`@property --hero-orbit-angle` driving a `conic-gradient`),
**never runs**. It sits on `.hero-cta::before`, which is `display: none` at all times (CSS
`2.gBuqKVzi.css:1821-1828`; no other rule, inline style or JS ever sets `display` on it). The runtime probe
confirms it: `document.getAnimations()` never lists `svelte-1p2vpne-hero-cta-orbit` at any of 7 scroll stops.
`research/01-initial-investigation/motion-inventory.md` had already said so, and TOPICS N3 and the
architecture README (row 4) missed it (pitfall P10).

The runtime inventory of every infinite animation that actually runs shows two kinds:
- **Compositable** (transform or opacity on HTML or outer-`<svg>` targets).
- **Main-thread, owned by other topics:** the doc-sweep and the accent belong to layout-animations, the
  countdown springs to countdown-idle-raf and nav-morph.

On top of that, the R2 first-reader probe puts the pending style that *all* CSS animations together leave
for the first reader of a frame at **0.12-0.20 ms/frame running vs 0.01-0.09 ms paused** at 1x (about
1 ms at 6x). scroll-engine's 6x scroll-time probe agrees: 0.7-1.1 ms median on wave1-partial.

So there is no Chrome-visible cost left for N3 to remove, and I spent no `fix.mjs ab` slot on it.
The open part is WebKit-only (do `steps()` loops and off-screen CA loops cost anything on the phone?):
**iPhone pending**.

## Evidence

### Runtime inventory (experiment 01/02, baseline)

`probe.mjs --ablate` on the plain baseline: mobile 430x932 DPR 3 with touch, CPU 1x, idle (no input),
stops every 932 px from y=0 to the bottom (maxY 5308; the mobile page is only ~6240 px tall), 1.5 s idle
window per stop. Served with `--vendors=local --https --latency 150`. Run 2026-10-01 00:16 UTC, short lane,
load1 4.2 -> 7.2. Raw output: `out/n3/probe-base-inventory.json` (worktree only).

Infinite animations that run (`getAnimations()`, `playState === 'running'`):

| animation | target | property | where it runs | Chrome thread (guess from property + target) | owner | decision |
|---|---|---|---|---|---|---|
| `svelte-1p2vpne-hero-cta-orbit` (CSS 1852-1866, 1938) | `.hero-cta::before` | `--hero-orbit-angle` in a conic gradient | **never** (`display:none`) | - | N3 | **(c) leave**: dead code; rewriting it (static conic + rotated child) changes nothing |
| `start-selling-platform-i-doc-sweep` (CSS 5707-5954, 11103) | 4 title spans | `background-position` | y >= 2796, **also off-screen** (on=0 at 2796/3728) | main (repaint) | layout-animations (topic 9; its patch gates it per T6, and it no longer appears off-screen on the combined base) | (b), done by its owner |
| accent `svelte-1fn2go6-stroke-in/out` + `transition: width` | `.accent-path`, `em.script-accent` | `stroke-dashoffset`, `width` | hero | main | layout-animations | owned |
| `svelte-1fn2go6-idle-0/1/2` (step-end) | `svg.accent-svg` | opacity | hero idle phase | compositable | layout-animations | owned |
| `three-frame-zero/one/two` (step-end 0.6 s, CSS 165-172, 673-682) | `svg.underline-frame`, `svg.zero-frame` (outer svg, commission) | opacity | y 1864-5308 | compositable | N3 | **(c) leave** in Chrome; iPhone pending (WebKit `steps()`) |
| `start-selling-agents-ask-caret` (step-end 1 s, CSS 9095) | `span.is-caret::after` | opacity | #platform | compositable | N3 | **(c) leave** |
| `svelte-1p2vpne-scroll-float` (CSS 1946) | `.scroll-float` | transform | everywhere (off-screen too) | compositor | N3 | **(c) leave**; iPhone pending (idle CA ticking) |
| `vinyl-spin` (CSS 3850) | `.record.spinning` | transform | y 0-2796 | compositor | N3 | (c) leave, as above |
| `start-selling-platform-cred-marquee-left` (CSS 7497) | reviews track | transform | y 3728-4660 | compositor | N3 | (c) leave |
| cred / secure-fx marquees, morph columns | - | transform | not seen at the probe stops (morph columns belong to nav-morph) | compositor | - | (c) |
| SMIL `<animate>` on the secure-network dash gradients (JS 12151-12276) | - | `x1`/`x2` | already IO-gated by the page (threshold 0.35, the `<animate>` nodes are removed off-screen) | main | N3 | (c) leave, already paused off-screen |
| paid border/rail packets (CSS 9482-9965) | SVG paths | `stroke-dashoffset` | finite, restarted by JS while the card is shown; never running at an idle stop | main | N3 | (c) leave: not infinite, not idle |

### R2 first-reader check (experiment 02)

"Update animations" runs before rAF callbacks, so the first `getBoundingClientRect()` in rAF pays every
ticking animation's pending style. Per stop, an early rAF loop timed one
`documentElement.getBoundingClientRect()` per frame for 0.8 s (n≈96 frames: the display runs at 120 Hz).
The two states are animations running, and `*,*::before,*::after{animation-play-state:paused!important}`.
Below, "idle" is a separate 1.5 s window with no loop.

| y | flush/frame running mean [p90] | flush/frame paused mean [p90] | idle RecalcStyleCount/s running -> paused | idle style ms/s running -> paused |
|---|---|---|---|---|
| 0 | 0.127 [0.2] | 0.085 [0.2] | 120 -> 34 | 12.3 -> 3.8 |
| 932 | 0.140 [0.3] | 0.049 [0.1] | 120 -> 67 | 15.0 -> 6.8 |
| 1864 | 0.186 [0.3] | 0.031 [0.1] | 113 -> 98 | 14.4 -> 10.4 |
| 2796 | 0.124 [0.2] | 0.061 [0.2] | 120 -> 100 | 13.4 -> 11.7 |
| 3728 | 0.196 [0.3] | 0.031 [0.1] | 121 -> 47 | 18.9 -> 5.4 |
| 4660 | 0.134 [0.2] | 0.009 [0.0] | 120 -> 70 | 18.2 -> 7.9 |
| 5308 | 0.129 [0.2] | 0.044 [0.1] | 120 -> 50 | 13.2 -> 4.4 |

How to read it:
- All CSS animations together leave at most ~0.17 ms of pending style per frame at 1x (~1 ms at 6x).
  Most of it comes from the two main-thread loops owned by layout-animations (accent at the top,
  doc-sweep at y >= 2796).
- The idle style recalc that remains with every animation paused (34-100/s) comes from JS rAF loops (next
  section), not from CSS animations.
- fix-scroll-engine measured the same first-reader probe during the 6x scroll on wave1-partial:
  0.7-1.1 ms median, p95 1.9-2.5 ms per frame. It is small during scrolling too.
- The E3 animation ablation (scroll-engine diag part 3/4) is still queued. mgmt-ops relays it when it lands.

### Idle JS loops (experiment 03)

Each rAF/timer callback is counted by its registration site. Two targets were probed: the plain baseline,
and `n3-base`, a local combine of main's wave-1 patches (phone-invisible-shrink, commission-forced-layout,
pain-offscreen-notes, nav-hit-test, large-area-blur) + countdown-idle-raf + layout-animations. 2.0 s
window per stop. Run 2026-10-01 ~00:53 UTC, load1 5.5. The 150 s cap stopped the run after 4 of 7 stops
on `n3-base`, so no JSON was written; the console log is `out/n3/probe-idle-sources.log` (worktree only).

| source (baseline line) | rate at idle | what it is | owner |
|---|---|---|---|
| rAF JS 3838 (`$E` digit spring) | 92-131/s at **every** stop y=0..5308 (baseline); 46-144/s on `n3-base` at y=932-2796, where the hero countdown is off-screen | countdown digit springs; on `n3-base` most likely the invisible, early-mounted morph-panel countdown (the 200 % morph IO fires early on a ~6240 px page) | countdown-idle-raf `/03` `active` prop + nav-morph's call site (E1); confirmed plausible by countdown-idle-raf |
| rAF JS 2458 | 80/s at y=3728 | `S()` tween in the commission/fee sequence (count-up) | layout-animations (fee bar) |
| interval 1000 JS 3936 | 1-2/s | countdown clock | countdown-idle-raf |
| timeouts 800/220 JS 11332 | 1/s each, y 0-2796 | future-section sequence sleeps | layout-animations / scroll-engine (carousel) |
| timeouts 900/1250 JS 3693-3704 | 0.5/s | accent cycle | layout-animations |
| interval 3000 JS 4696 | 0.5/s | pain notes | pain-offscreen-notes |
| interval 199 `modules.e762be2b6b709245aabb.js` | 5/s | vendor (Hotjar) | not fixable here |

No unowned infinite rAF or timer loop runs at idle.

## Experiments tried

Fields as in `fixes/EXPERIMENTS.md`. None produced a patch, so there are no `variants/*.diff`. The probe
that re-runs each row is `probe.mjs` (via `slot.sh`).

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| main-thread-infinite-animations/00 | first inventory probe, server started outside the lock | - | broke (tooling use): the background `fix.mjs serve` hit its 30-min background limit before the lock came through, so the probe loaded nothing (1 stop) | - | - | this README | start the servers **inside** the `lock.mjs run … sh -c` hold (`slot.sh`); the probe now aborts when maxY < 3000 | fixed | no patch kept (no variant) |
| main-thread-infinite-animations/01 | runtime check of the orbit premise: `getAnimations()` at 7 stops | the orbit ticks style + paint every frame, also off-screen (TOPICS N3) | abandoned: the orbit never runs (`.hero-cta::before` is `display:none`, CSS 1828), so the static-conic + rotated-child rewrite would change nothing | counts, load-independent (load1 4.2-7.2) | `hero-cta-orbit` running at 0 of 7 stops | "Runtime inventory"; F-015 | P10: probe the premise first; the motion inventory already said "dead code" | dropped | no patch kept (the rewrite was never made: a `display:none` target can't gain) |
| main-thread-infinite-animations/02 | R2 first-reader probe: early-rAF `gBCR` per frame, animations running vs `animation-play-state:paused!important` | pending animation style is what the first reader pays (E3/R2 hypothesis) | within noise for N3's purpose: ≤ 0.2 ms/frame at 1x, most of it from owned loops | counts + 1x timings, idle, load1 4.2-7.2 | flush mean 0.124-0.196 ms running vs 0.009-0.085 ms paused, n≈96 frames per state × 7 stops; idle recalc/s 113-121 -> 34-100 | "R2 first-reader check"; `out/n3/probe-base-inventory.json` | CSS animations aren't what the first reader pays for; scroll-engine's 6x scroll probe agrees (0.7-1.1 ms median) | done | `probe.mjs --ablate` |
| main-thread-infinite-animations/03 | idle rAF/timer attribution by registration site, baseline vs `n3-base` (wave-1 + countdown + layout-animations) | some unowned JS loop runs while idle | no unowned loop; the largest is the countdown spring (owned), still 46-144/s on `n3-base` (likely the hidden morph-panel countdown until E1's `active` call site) | counts, load1 5.5; partial (`n3-base` 4 of 7 stops, 150 s cap) | see "Idle JS loops" | `out/n3/probe-idle-sources.log` | attribute loops by call site before assigning them; told countdown-idle-raf | done | `probe.mjs` |
| main-thread-infinite-animations/04 | T6 IO pause for the compositable infinite loops (three-frame, caret, scroll-float, vinyl, marquee) | fewer main-thread ticks | abandoned before editing: in Chrome these are compositor animations (no main-thread tick to remove, and 02 bounds all animations at ≤ 0.2 ms/frame at 1x). Any gain is WebKit-only: `steps()` acceleration, CA ticking off-screen | - | - | this README | measure on the phone before writing a patch (P5) | retry when the iPhone is back and shows a cost | no patch kept (never edited) |

## iPhone pending

The phone is offline (lease `lead-iphone-offline`). This is the only open question, in the queue
order of `fixes/DIRECTION.md`:

| check | method | decides |
|---|---|---|
| Does WebKit tick the step-end opacity loops (three-frame at commission, agents caret) on the main thread every frame, or only at steps? | Safari Timeline, 6 s idle parked at y≈2796 (commission) on the plain baseline: style recalcs / paints in the underline and zero-mark rects | whether variant /04 (T6 pause) is worth building |
| Do off-screen composited loops (scroll-float, vinyl, marquees) keep the render server compositing at idle? | Timeline "Composite" count at an idle stop where all of them are off-screen, vs the same stop with `animation-play-state: paused` injected | same |

## Risks, conflicts, follow-ups

- **Correct TOPICS N3 and `research/architecture/README.md` row 4** (lead): the orbit is dead code. N3 should
  read "verified empty in Chrome; iPhone check pending".
- Owned loops found running: the doc-sweep runs off-screen on the baseline (layout-animations' patch
  already gates it), and the countdown spring runs in the hidden morph panel (countdown-idle-raf `/03`
  + nav-morph E1). Both owners have been told.
- `probe.mjs` is a reusable inventory: run it on `all-wave1` once that combine exists to confirm no
  main-thread infinite animation is left there (the `n3-base` run above already shows the doc-sweep gone).

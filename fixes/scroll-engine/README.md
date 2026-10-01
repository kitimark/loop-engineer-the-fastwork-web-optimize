# Fix: scroll-engine (cluster A: scroll-engine-batching + toolbar-resize + scene-gating-tighten)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured, wave 2 on all-wave1 (n=5): `patch.diff` is variant /10c (plain baseline, applies cleanly on all-wave1); `results.json` is `ab se10c-aw1 --on all-wave1 --runs 5`. Frames > 50 ms 2 → 1 (better), F-011's render frame gone from the measured scroll 5/5 (moved to load time, which the A/B doesn't measure), p95 +0.8 ms (flagged). The measure/mutate engine conversion (/01) is parked. iPhone and finger checks are pending.
**Topic:** `fixes/TOPICS.md` rows 2, 10, 12 (conflict cluster A)
**Files touched (/10c):** `/_app/immutable/nodes/2.DyWL8TcE.js`: the engine scene/render gating (`aE`, `sE`, `cE`, `dE`, plus new `fwRender`, `fwFar`, idle un-skip `fwUnskipNext`, will-change windows `fwWC`; pretty 2663-2880). `/_app/immutable/assets/2.gBuqKVzi.css`: the scene pause rule (11754-11766). No effect callbacks are touched, so there is no overlap with the wave-1 callback fixes.

## Hotfix /10e (F-030): `.face` out of the will-change windows

`patch.diff` is now **/10e** = /10c with `.face` removed from `fwWCSel` (1-line delta `variants/10e.diff`; full plain
patch sha256 60382e1e…, +154/-6, applies cleanly on all-wave1; stacked record `fixes/se10e-aw1/patch.diff`).

The 168 countdown faces (two `div.countdown`) slide in and out of their `overflow:hidden` digit window.
IntersectionObserver clips by ancestors, so the fwWC observer kept reporting them (found by fix-hero-exit).
Counts probe (`wcflip.mjs`, 08:31Z, mobile 6x, mechanism only, timing not claimed, load1 3.8-5.1):

| per second | all-wave1 | aw1-10c | aw1 + /10e |
|---|---|---|---|
| idle at y=0: fwWC IO callbacks / entries | 0 / 0 | 59.8 / 1,915 | 0 / 0 |
| idle at y=0: `setAttribute('data-fw-wc')` | 0 | 1,915 | 0 |
| scroll 0 → 2000: fwWC entries / `setAttribute` | 0 / 0 | 1,657 / 1,657 | 1.8 / 1.8 |

Parity aw1-10c vs /10e (classes and render/scene attributes of sections and key elements at y=0/900/1900/3200,
`data-fw-wc` excluded): 0 diffs. The faces' `will-change` follows the scene gate again, as in wave 1. Not
measured for timing: the /10c A/B numbers below were taken with the flip storm present.

## Wave 2 result (/10c on all-wave1)

What /10c does (stack 09 → 10 → 10b → 10c, see "Experiments tried"):
1. **One-way render deferral (N9/N10).** A section deferred at mount (`content-visibility`) is un-skipped by our own IO at the scene margin + 50 % (min 150 %). Deactivating no longer defers it again, so the scene gate can't flap (N9: 800 flips / 10 s → 0).
2. **Idle un-skip (W1, F-011).** After load + 500 ms, deferred sections are un-skipped one per `requestIdleCallback` slice (Safari: `setTimeout(150)`), so their first render (style + layout + layers) usually happens before the user scrolls, not mid-scroll.
3. **Per-element will-change windows (Apple pattern).** The 11 non-fixed `will-change` selectors keep their layer only within ±0.5 vh of the viewport AND while their scene is active (`[data-fw-wc="0"]` and the paused-scene rule both set `will-change: auto`). Out-of-window layers 92/506 → 0/506.
4. **Far re-skip behind the user.** A section more than its un-skip margin + 25 % above the viewport is deferred again. Its height comes from the IO entry, so there is no forced layout. It comes back through the un-skip IO, which gives 0.25 vh of hysteresis. Drawing layers are ≤ wave1 at all 8 settled positions.

`fix.mjs ab se10c-aw1 --on all-wave1 --runs 5` (mobile 430x932 DPR3, CPU 6x, `--idle 6`, 05:39-05:46Z, 0/10 runs contaminated, load1 1.5-2.9, no host sleep):

| mobile 6x, n=5 | all-wave1 median [min-max] | + /10c median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: frames >50 ms | 2 [2-7] | 1 [0-1] | -1 | **better** (ranges don't overlap) |
| scroll: frames >34 ms | 4 [3-8] | 3 [2-4] | -1 | within noise |
| scroll: frames >20 ms | 13 [10-16] | 11 [9-14] | -2 | within noise |
| scroll: frames >100 ms | 0 [0-3] | 0 [0-0] | 0 | within noise |
| scroll: LoAF ms | 115 [107-837] | 59 [55-75] | -56 | **better** |
| scroll: p95 frame ms | 15.8 [15.1-16.3] | 16.6 [16.6-16.7] | +0.8 | **WORSE** (ranges don't overlap) |
| scroll: fps | 110.6 [101.5-111.4] | 108.6 [108.2-109.7] | -2 | within noise |
| morph / idle | 0 frames >50 ms | 0 frames >50 ms | 0 | within noise |

- **F-011 is gone from the measured scroll, 5/5.** Every baseline run has 2 scroll LoAFs: gtag `onscrollend` (script 49-55 ms) plus a no-script ~53-62 ms render frame, the first render of a deferred section. Every /10c run has only the gtag one (49-70 ms, vendor, N11). That is the 0-1 remaining frame > 50 ms. Confirmed on 49 fresh loads in two N13 diagnostic holds (06:45Z and 07:10Z, verify-like scroll, mechanism/attribution, load 2.3-8.1): the no-script frame at y≈2227-2244 (54-70 ms, 0 ms of script) is in **25/25** all-wave1 loads and **0/24** aw1-10c loads (`fixes/platform-visual-anim-storm/README.md`).
- **Moved, not proven removed.** `verify.mjs` settles the page unthrottled (`gotoAndSettle` + `sleep(1500)` at CPU 1x, `tools/verify.mjs` 250-262) before any measured phase. /10c's idle un-skip (load + 500 ms + idle) therefore runs outside the measured window, and this A/B cannot tell "removed" from "moved to load time". The only data on its cost at 6x from navigation are my mech probes (`mech10.mjs` / `mech-c.sh`, 03:10-03:42Z, n ≤ 3 per variant). There, the two un-skips land at 6.22-6.36 s after navigation with no LoAF > 50 ms nearby; 35-49 ms frames there are not ruled out (the probe only records LoAF > 50 ms).
- **Safari path.** WebKit has no `requestIdleCallback`, so `fwIdle` falls back to `setTimeout(150)`. The un-skips then fire at about load + 0.65-0.8 s whether or not the user is touching the page. A user who starts scrolling within ~1 s of load can still meet the render frame mid-scroll (iPhone item below).
- Regressions: none (0 console errors, 0 404s). Screenshot diff top 0.25 / middle 0 / bottom 0.4 % (phase noise).
- Patch sha256: plain `patch.diff` 73a42b7f…; stacked `fixes/se10c-aw1/patch.diff` 3bfa0531…
- No measurement code was changed by this topic.

**The p95 flag (+0.8 ms, one 120 Hz vsync).** It is in the scroll phase only:
- idle p95 is 9.7-9.9 → 9.8-9.9 ms and morph p95 is 10.2-10.3 → 10.2-10.3 ms on both sides, per run;
- scroll p50 stays 8.3-8.4 ms; frames > 20 ms (13 → 11) and dropped frames (1.0-1.7 % → 0.9-1.5 %) don't rise;
- the scroll phase delivers 15-20 fewer frames per run (base 980-989 except one 931 run; /10c 960-973).

So about 2 % of scroll frames go from 1 vsync (8.3 ms) to 2 (16.6 ms), and the 95th percentile lands exactly on 2 vsyncs. It is not the deferred render moving earlier, which is a single frame (and now happens outside the measured window, see above). It is a new, small per-frame cost spread over the scroll. Three candidates, not yet separated:
- (a) more rendered content during scroll: sections ahead are pre-rendered from load, and sections behind stay rendered until 1.75 vh instead of wave 1's 1 vh re-skip, so there is more paint and composite work per frame;
- (b) layers created or dropped at the ±0.5 vh will-change window edges;
- (c) the per-frame cost at 6x of the three new IntersectionObservers (`fwRender`, `fwFar`, and `fwWC` with ~60 targets).

A diagnostic A/B of /09 alone vs /10c on all-wave1 would separate (a) from (b)+(c). The cost is far below the > 34 ms / > 50 ms goal frames it removes; the iPhone check will show whether it matters there.

## Why it lags

- The engine (`iE`, JS 2670) runs every active callback in one rAF. But 5 of the 8 `dE` callbacks are rAF
  **trampolines**: commission `o = () => t ||= requestAnimationFrame(a)` (3127), hero `c` → `s` (4173),
  profile `m` → `f` (10971), future `u` → `l` (11327), platform `r` → `n` (12444). Their real work
  runs one frame late, as 5 separate rAF callbacks. Each reads rects right after the previous one wrote
  styles, with a Svelte microtask flush in between, so each one forces its own style+layout.
  This is why `a`, `s`, `f`, `l` and `n` each show forced ≈ total in the calibration LoAF table
  (`research/cpu-throttle-calibration/chrome-sweep.md`, "Top LoAF script attributions").
- `iE`'s own time is mostly nav `L` (13077, hit test + rects + scrollTo pin), pain `d` (4728) and tooltip `A` (6204).
- Toolbar: `resize` re-runs every callback (`aE`, 2678). iOS fires ~36 resizes during the URL-bar
  collapse (research README "Top of the page").
- Gating: a section counts as active whenever it is within `rootMargin: 100% 0px` (2768). The future
  section's avatar carousel (`_` loop, 11345) swaps DOM about 1×/s while it is off-screen (finding from layout-animations).

## What changed in /01 (parked: plain-baseline prototype, not in `patch.diff`; kept as `variants/01.diff`)

1. **Two-phase engine, backward-compatible.** `dE(fn, opts)` works as before. An opt-in form,
   `dE({ measure(f), mutate(m, f) }, opts)`, works like this: in one rAF, legacy callbacks run first, then every
   `measure` (reads only), then every `mutate` (writes only). `f` is a lazy per-frame cache
   `{vh, vw, y}`. When `mutate` returns `true`, the engine runs that effect again next frame (this replaces
   the trampolines' own easing rAF). Frames that are only easing ticks run only the effects that asked.
2. **Toolbar resize:** a width change re-runs everything at once. A height-only resize re-runs once,
   120 ms after the last event (scroll frames already read a fresh `vh` meanwhile).
3. **Gating:** when an effect deactivates, the engine runs it once more, so clamped end states get written.
   `data-start-selling-scene` is written only when it changes. The avatar carousel runs only while the section is
   engine-active and `.start-selling-avatars` is on screen (IntersectionObserver, rootMargin 0px).
4. The 5 trampoline callbacks are converted to measure/mutate with the same math. `matchMedia` flags
   are read in measure, and `j()`'s line count becomes a pure read (`fwJ`). Direct calls (mount, MQ
   change) use `fwRun` with uncached metrics. Nav `L`, pain `d` and tooltip `A` stay legacy: they are owned by
   nav-morph / pain-offscreen-notes, and their wave-1 versions are already read-then-write.

## Before / after /01 (plain baseline, interim, old tools; results in `variants/01-results.json`)

Parity smoke (own CDP script, instant-scroll steps, settled state dump of `--exit-*`, `--commission-*`,
`--future-shrink`, `--profile-scale`, `.pain`/nav/section classes, scene/render attrs): mobile 15 steps and
desktop 24 steps, **0 state diffs, 0 console errors** on either side.

`fix.mjs ab scroll-engine --runs 3` (mobile 430x932 DPR3, CPU 6x), host load 6.7-11.7:

| mobile 6x, n=3 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 69.2 [65.8-69.6] | 66.6 [64.8-69.9] | -2.6 | within noise |
| scroll: frames >20 ms | 102 [101-109] | 98 [93-111] | -4 | within noise |
| scroll: frames >34 ms | 13 [12-14] | 12 [11-12] | -1 | within noise |
| scroll: frames >50 ms | 5 [4-6] | 5 [5-6] | 0 | within noise |
| scroll: LoAF ms | 345 [228-355] | 370 [357-450] | +25 | "WORSE" (ranges don't overlap; below A/A LoAF noise 60-90 ms) |
| scroll: forced style+layout ms | 92 [44-102] | 69 [62-82] | -23 | within noise |
| morph | | | | within noise, morph reached both sides |

Screenshot diff max 0.16 %. No new errors or 404s. A/A floor (lead, mobile 6x, 5 runs): frames >20 ms ±15, LoAF ±60-90 ms.

In the LoAF attribution, `l` and `a` leave the top list (merged into `iE`), and `iE`'s forced total stays about the same.
The remaining >50 ms frames per run are gtag `onscrollend` (~65 ms, vendor), the nav platform IO callback
(13083, ~55 ms, nav-morph topic 13) and `iE` (~55 ms over 3 frames, one large pending layout each).
Frames >20 ms (p95 25.7 ms) are not LoAF-visible, so they are per-frame style and paint cost, which batching doesn't remove.

**iPhone pending**: the phone was disconnected. **Finger test pending (user)** for toolbar-resize (queued in `fixes/FINGER_TESTS.md`).
**iPhone / finger test pending for /10c (scroll-UP re-render)**: /10c re-skips hero-track and #people once they are > 1.75 vh behind the user. Scrolling back up re-renders each of them synchronously when it re-enters 1.5 vh (w1: at the 1 vh gate, plus WebKit's own content-visibility at 0 margin). Chrome's top-to-bottom A/B never exercises this path. Check: scroll to the bottom, then flick back to the top on the iPhone, and look for > 34 ms frames at y≈2.0-2.5 k (#people) and y≈1.5-2.0 k (hero-track). Also **start scrolling within 1 s of load**: on Safari the un-skips fire on a 150 ms timer at about load + 0.65-0.8 s, regardless of input. On the mgmt-ops iPhone list.

## Risks, conflicts, follow-ups

Open items for /10c (not slots):
- **p95 +1 vsync in scroll** (see "The p95 flag"). To separate (a) more rendered content from (b) will-change window edges: a diagnostic A/B of /09 alone vs /10c on all-wave1. If it is (b), try **/10d: a wider window** (IO rootMargin `100% 0px 100% 0px` instead of 50 %), trading a few more layers for fewer promotions at the edge.
- **Scroll-up re-render**: re-skipped sections re-render synchronously at 1.5 vh on the way back up. On the iPhone list.
- **Layer memory** was measured as Chrome LayerTree area on wave1-partial, not on the iPhone. WebKit's own budget is unknown.
- **Known issue: scroll restore.** When the page loads already scrolled down, the sections above are deferred at mount, which also queues them in `fwDef` for the idle un-skip. `fwReskip` returns early for a section that is already `deferred` without calling `fwDef.delete`. So `fwUnskipNext` later renders a section that is more than 1.75 vh above the viewport, and it stays rendered until it re-enters and leaves the far margin again. Harmless for the top-to-bottom path; fix in /10d.
- **Next variant /10d** (not measured until I-018's A/A hold and the E3/part-4 diagnostics are done):
  - (a) on the no-`requestIdleCallback` path (Safari), gate the idle un-skip on quiet input (as vendor-scrollend/02: 1.5 s without input);
  - (b) the `fwReskip`/`fwDef` fix above;
  - (c) a wider will-change window for the p95 flag.

- Converted effects now update in the same frame as the scroll, one frame earlier than before. The settled state is identical (parity).
- The callbacks of phone-invisible-shrink (landed), commission-forced-layout, pain, nav-morph and hero-exit change
  the same functions. This patch is against the plain baseline and must be redone with `--on <combined wave 1>`.
  hero-exit's callback becomes a no-op in CSS mode, so it doesn't need converting there.
- A tighter engine rootMargin was not applied: content-visibility/scene flips would only move closer to the viewport.
  Per-effect gating (the carousel) is the part that pays off.
- Follow-up (T7): the `.hero-track` threshold test in future `l` / nav `_` could use an IO (rootMargin `-128% 0px 200% 0px`).

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| scroll-engine/01 | Two-phase engine (`dE({measure, mutate})`, lazy per-frame `{vh,vw,y}`, `mutate`→`true` keeps easing, final run on deactivate) + the 5 rAF trampolines (commission `a`, hero `s`, profile `f`, future `l`, platform `n`) converted, + height-only resize debounce, + scene-attr write-on-change, + avatar-carousel visibility gate; plain baseline | The 5 trampolines run one frame late as separate rAFs, each forcing style+layout after the previous writes; one read phase then one write phase leaves at most one forced layout per frame → forced ms and frames >20 ms drop | within noise | old-tools (before I-002 4bbd249), host load 6.7-11.7 | mobile 6x n=3: frames >20 ms 102 [101-109] → 98 [93-111]; >34 ms 13 [12-14] → 12 [11-12]; >50 ms 5 → 5; forced 92 [44-102] → 69 [62-82] ms; LoAF 345 [228-355] → 370 [357-450] ms (flagged WORSE by non-overlap, below A/A LoAF floor 60-90 ms) | patch `fixes/scroll-engine/variants/01.diff` (= c72b759 patch.diff); `fixes/scroll-engine/results.json` (this branch), raw `out/ab/scroll-engine/2026-09-30T22-22-05-405Z/` | On phones those callbacks already do little (T1), so batching moves forced ms only ~25 %; `l`/`a` leave the LoAF top list but fold into `iE`, whose forced time is one big pending layout, not interleaving. Batching can't remove a frame's own style recalc (architecture review) | on branch; retry `--on <combined wave 1>` (final --runs 5) |
| scroll-engine/02 | Parity smoke for /01: own CDP script, instant-scroll steps, settled-state dump (`--exit-*`, `--commission-*`, `--future-shrink`, `--profile-scale`, `--platform-shrink`, `--morph`, `.pain`/nav/section classes, scene/render attrs) base vs fix | Converted callbacks must settle to the same state at every scroll position (incl. `.pain is-pain-dark` and hero-track side jobs, P2) | no diff (pass) | clean (functional probe, no timing) | mobile 15 steps, desktop 24 steps: 0 state diffs, 0 console errors either side | patch = `variants/01.diff`; parity script and dumps in the session scratchpad `scroll-engine/` (not committed) | Instant-scroll + settle is a cheap, exact functional gate for engine changes; reuse for N4 | done |
| scroll-engine/03 | Engine-only variant: /01's engine (resize debounce, final run, scene-attr guard) with all callbacks left legacy | Isolate engine overhead/benefit from the callback conversions | abandoned (built, never measured) | n/a | — | patch `fixes/scroll-engine/variants/03.diff` | Dropped for the one-queue-slot budget; expected neutral in Chrome (legacy callbacks unchanged, toolbar resize not reproducible) | retry only if /01 on the combined base shows an unexplained regression |
| scroll-engine/04 | Tighter default engine gate (`rootMargin` 100% → ~25%) relying on the final run on deactivate | Fewer active sections → fewer per-frame reads/writes | abandoned (not built) | n/a | — | no patch kept (never built) | Content-visibility / scene flips would only move closer to the viewport; per-effect gating (the carousel) is the part that pays | dropped; see N5 layer-diet for the `will-change` flip |
| scroll-engine/05 | Height-only `resize` debounce (120 ms) instead of re-running every callback per iOS toolbar resize (part of /01) | ~36 toolbar-collapse resizes no longer re-run all callbacks; fewer stutters at the top of the page on iPhone | abandoned for now (not measurable in Chrome) | n/a | — | part of `variants/01.diff` (engine `fwResize`); `fixes/FINGER_TESTS.md` entry | Chrome can't collapse a toolbar; scroll frames already coalesce with resize via `tE`, so the gain is only resize-without-scroll | retry when the iPhone finger test is possible |
| scroll-engine/06 | /01 + render-deferral hysteresis (N9 `scene-gate-flap`): `cE` no longer defers on deactivation; a second IO at the scene margin +50 % (`100%`→`150%`, `150%`→`200%`) applies `data-start-selling-render=deferred` only when the section is inactive and outside that wider band | Deferring (content-visibility + intrinsic size) changes the section's own geometry; at the scene gate's edge (desktop, `.pain` top, `.commission-card` top = 2.0 vh) that re-activates the gate → render → deactivate → defer every frame, so `iE` runs ~33 Hz idle (pain probe: 314 callbacks / 632 card rects in 10 s). With hysteresis the geometry change happens outside the activation edge → no flapping | pending (not measured yet) | n/a | — | patch `fixes/scroll-engine/variants/06.diff`; probe script `scratchpad/scroll-engine/probe.mjs` (idle counts at `.pain` top ±0.5 vh on desktop 6x; scene/render flips vs frames >34 ms on mobile 6x) | — | measure in the `--on <combined>` slot (probe first, A/B last) |
| scroll-engine/07 | Hysteresis only (the N9 part of /06) on the plain baseline, engine otherwise unchanged: `cE` doesn't defer on deactivate; a second IO at the scene margin +50 % applies the render deferral | Same as /06, isolated from the measure/mutate conversion (parked per arch-lead) | superseded (by /09 before it ran) | n/a | — | patch `fixes/scroll-engine/variants/07.diff` (topic dir `scroll-engine--hyst`) | Re-skipping at a wider band still tears down and rebuilds the section's layers on every pass (arch W1, N10); one-way un-skip is simpler and fixes N9 too | dropped (replaced by /09) |
| scroll-engine/08 | `anim-ablation` (E3, diagnostic, not landable): `*, ::before, ::after { animation: none !important }` + countdown 1 s tick removed (both countdowns frozen, so no digit spring) | If main-thread infinite animations (N3) feed the per-frame style recalc, iE + `l` forced style/layout drops >= 40 % | pending (not measured yet) | n/a | — | patch `fixes/scroll-engine/variants/08.diff` (topic dir `anim-ablation`) | — | done on all-wave1 (`abl-aw1i` on `se-aw1i`; the countdown hunk was re-applied by hand, diagnostic only, not landable). **E3 probe** (06:03Z, n=1 each, load 1.7-3.2, mechanism/attribution, timing not claimed): frames > 34 ms 4 → 1; the ablation removes a rare 362 ms no-script render storm at y=4727 (platform agents-ask `is-caret` / state classes, JS 11886, F-026) and a 67 ms unnamed frame, while the F-011 render frame (y=2154) stays (/10c removes that one); first-rAF-reader time 230 → 84 ms; nav `L` 496 → 360 ms. **Part 4 A/B** (`ab abl-aw1i --on se-aw1i --runs 3`, 06:06-06:11Z, 0/6 contaminated): frames > 50 ms 3 → 3 and > 34 ms 3 → 5 (noise), > 20 ms 11 → 17 (WORSE), LoAF 112 → 118 (noise), idle worst frame 16.3 → 10.3 (better); the 362 ms storm did not occur in any of the 6 runs. So CSS animations are not the source of the steady > 34 / > 50 ms frames. `animation: none` is not a clean ablation either: it also changes what is painted (fill-mode end states; screenshot top 0.46 %), which likely explains the > 20 ms rise. They are linked to the rare render storm only (F-026, now topic N13). Correction 06:19Z (F-027): a forced-toggle probe shows the agents-ask visual is not the trigger (0 storms in 2 × 24 s parked + 10 re-entries), so the E3 link was coincidence and the storm's cause is open (`fixes/platform-visual-anim-storm/README.md`) |
| scroll-engine/09 | One-way render un-skip + no `will-change` override (N9 + N10, per arch W1/W3 and the lead's directive): sections deferred at mount are un-skipped once by our own IO at the scene margin +50 % (min 150 %) and never re-skipped (`cE` no longer defers on deactivate); CSS pause rule keeps only `animation-play-state: paused` (drops `will-change: auto !important`) | No gate flap at the scene edge (N9: `iE` idle runs, card rect reads → ~0 at `.pain` top); no content-visibility / layer rebuild inside the viewport on scroll passes (N10: fewer frames >34 ms named by cv / scene flips) | better (mechanism: N9 gone, cv churn 0) | mechanism/attribution, load 5.0-7.8, timing not claimed (pre-gate tools) | on wave1-partial (`unskip-w1` on `se-w1i`), n=1: desktop 6x idle 10 s at `.pain` top: scene/render flips 800 → 0, iE runs 200 → 0, rect reads 2194 → 12; mobile 6x scroll: cv state-change events 6 → 0; the ~60 ms first-render frame of a deferred section (y≈2100-2150) moves ~50 px earlier but stays | patch `fixes/scroll-engine/variants/09.diff` (topic dir `scroll-engine--unskip`); probe `scratchpad/scroll-engine/probe.mjs` (E2 + N9 idle + first-reader) | One-way un-skip fixes the gate flap (N9) and the cv churn, but the section's first render is still paid during scroll → /10 (idle un-skip) | superseded by /10 (kept as its base) |
| scroll-engine/11 | Diagnostic engine instrumentation `se-instr` (per-callback timing inside `iE`, recorded only while a probe sets `window.__fwEng.on`) on wave1-partial (`se-w1i`), 3 runs | Name what remains of `iE` on top of wave1-partial | iE LoAF > 50 ms: 0 of 3 runs. Inside iE, nav `L` (global dE, JS 13077) is 316-320 calls / 526-617 ms per run (max 7.6-10.1 ms per call); every other dE callback 0-7 ms per run in total | mechanism/attribution, load 3.6-6.6, timing not claimed (pre-gate tools) | see result column; remaining > 50 ms frames per run: a ~60 ms no-script style/layout frame at y≈2154 (3/3, first render of a deferred section), gtag `onscrollend` 45-67 ms (3/3), nav platform IO `z(b, !0)` mount 46 ms (1/3); E2: 0 of 7 frames > 34 ms coincide with a scene/render flip | patch `fixes/scroll-engine/variants/11-se-instr.diff`; raw `scratchpad/scroll-engine/part1-0658/probe.json`, `part2-*/probe.json` | The engine itself is cheap; iE's time is nav L (N12 / nav-hit-test). N9 reproduces 3/3 on desktop at `.pain` top | done (diagnostic) |
| scroll-engine/10 | /09 + idle un-skip (after load + 500 ms, one deferred section per `requestIdleCallback` slice; `setTimeout` fallback) + per-element `will-change` windows (IO `50% 0px 50% 0px` on the 11 non-fixed `will-change` selectors; CSS `[data-fw-wc="0"] { will-change: auto !important }`) + no scene-wide `will-change` override (arch apple-smooth-scroll §2.3, §5 row 1; W1) | The first render of deferred sections moves from the scroll phase to idle (Chrome > 50 ms frame at y≈2100-2150; iPhone transition clusters); layers exist only near the viewport | mechanism: entry ticket 4/4 pass; layer count WORSE | mechanism/attribution, load 2.0-3.1, timing not claimed (post-gate tools, 3 short holds 02:33Z, 03:10Z, 03:16Z) | on wave1-partial, mobile 6x, idle 8 s then smooth scroll, n=4 (/10) vs n=2 (w1): (1) the 2 deferred sections (commission.compact, #platform) un-skip at ~6.3 s in post-load idle, with no LoAF > 50 ms there; 0 real un-skips / 0 re-skips in scroll and settle (w1: 4 un-skips + 6 cv events in scroll, 14 re-skips in scroll/settle); run 1's 4 "scroll un-skips" were same-value `setAttribute` re-sets (F-020); (2) cv events in scroll 6 → 0; (3) out-of-window `will-change` layers 92/506 → 0/506; (4) idle LoAF > 50 ms: none; one 339 ms scroll LoAF (future `l` 6 ms script, rest rendering) in 1/4 runs, not reproduced; drawing layers at 8 settled positions 54-129 → 126-171 (2x at commission/platform: in-window paused scenes keep their layers) | patch `fixes/scroll-engine/variants/10.diff`; probe `scratchpad/scroll-engine/mech10.mjs` (attributeOldValue transitions, LoAF sourceURL/scrollY, timer jumps, LayerTree area per position) | Idle un-skip works (first render leaves the scroll phase); dropping the scene-wide `will-change: auto` doubles the layer count → /10b | superseded by /10b (layer budget) |
| scroll-engine/10b | /10 + restore `will-change: auto !important` on paused scenes, so an element gets a layer only if its scene is active (gate ±1 vh) AND it is in its ±0.5 vh window (both edges off screen, no flap thanks to /09) + re-scan the windows in idle when a scene activates (elements mounted later) | Same as /10, with the layer count ≤ w1 | mechanism: ticket 4/4 pass; layers below w1 at 5 of 8 positions, above at 3 | mechanism/attribution, load 2.2-2.8, timing not claimed (1 short hold 03:16Z) | on wave1-partial, n=1: ticket as /10 (0 un-skips / cv in scroll, out-of-window 0/506, no idle LoAF > 50, un-observed elements 84 → 0); drawing layers vs w1 by y: 0: 118→66, 785: 127→82, 1570: 127→68, 2354: 129→45, 3139: 58→49, 3924: 54→63, 4709: 76→90, 5493: 60→70; area bound +83-120 MB at the 3 bottom positions (same in /10: from no-re-skip keeping hero-track/#people rendered, not from `will-change`) | patch `fixes/scroll-engine/variants/10b.diff` (on top of /10; topic dir `se10b-w1`); layer naming probe `scratchpad/scroll-engine/layers.mjs` | Named (`layers.mjs`, 03:29Z): the extra bottom layers are all in sections behind the user that w1 re-skips (#profile-showcase profile-deck 70.2 MB, #people section 19.6 MB, hero 13.8 MB, 4 orbit cards, scroll cue/float, feed record), ≈ 104 MB of area, more than the 93 MB document layer → far re-skip (/10c) | superseded by /10c |
| scroll-engine/10c | /10b + far re-skip behind the user only: a rendered, inactive section whose rect is above the viewport and outside its un-skip margin + 25 % (1.75 vh; 2.25 vh for `.pain`'s 150 % gate) goes back to `data-start-selling-render="deferred"` (height from the IO entry, no forced layout); it comes back through the existing un-skip IO (gate + 50 %), so 0.25 vh of hysteresis; sections ahead are never re-skipped | /10b's layer savings without the bottom excess: no-re-skip kept off-screen sections behind the user alive | mechanism: ticket pass (0 un-skips in scroll; 2 scroll cv events = the intended far re-skips, each once, no flap); drawing layers ≤ w1 at all 8 positions | mechanism/attribution, load 1.2-2.0, timing not claimed (1 short hold 03:40Z) | on wave1-partial, n=1: drawing layers w1 → /10c by y: 0: 118→72, 785: 120→78, 1570: 129→74, 2354: 131→43, 3139: 58→49, 3924: 54→49, 4709: 76→76, 5493: 60→56; area bound ≤ w1 except y=0/785 (+17.8 MB: the commission section, pre-rendered in idle, now has a layer while 2+ vh below); timeline: hero-track and #people re-skip once on the way down (y≈4.0-4.5 k), un-skip once on the jump back to the top, re-skip once on the jump down; idle LoAF > 50 none; scroll LoAF > 50 only gtag onscrollend (also in w1); no timer jumps | patch `fixes/scroll-engine/variants/10c.diff` (on top of /10b; topic dir `se10c-w1`); `scratchpad/scroll-engine/mech-c.sh` (mech10 + layers) | Scroll-up re-render cost not measured (paid synchronously at 1.5 vh, w1 at 1 vh): iPhone/finger check | **kept, the deliverable**. Wave-2 A/B `--on all-wave1`, n=5, 05:39Z, 0/10 contaminated: frames > 50 ms 2 → 1 (better), LoAF 115 → 59 ms (better), > 34 ms 4 → 3 (noise), p95 +0.8 ms (WORSE, see "The p95 flag"); F-011 render frame gone from the measured scroll 5/5 (moved to load time, outside the A/B window). Review ACCEPT-WITH-NOTES; known issues (scroll restore, Safari timer path) go to /10d |
| scroll-engine/10d | /10c + review fixes: (a) quiet-input gate on the idle un-skip (run only after 1.5 s without scroll/wheel/touch/pointer/key input, on both the `requestIdleCallback` path and the Safari `setTimeout(150)` fallback); (b) `fwReskip` also drops an already-deferred section that is far above from the idle queue (`fwFar` flag, cleared on un-skip), which fixes the scroll-restore bug; (c) will-change window 50 % → 100 % (p95 flag) | Safari users who scroll within ~1 s of load don't meet the first render mid-gesture; no off-screen render after a scroll restore; fewer layer promotions per scrolled distance | pending (not measured) | n/a | — | delta `fixes/scroll-engine/variants/10d.diff` (on /10c), full plain patch `variants/10d-full.diff` (+170/-6); topic dirs `scroll-engine--10d`, combined `se10d-aw1` (clean on all-wave1) | — | waits for I-018's A/A hold and the E3/part-4 diagnostics; then a mech check (ticket + layers) and an A/B `--on all-wave1` vs /10c when mgmt-ops says so |
| scroll-engine/10e | /10c with `.face` removed from the will-change window selector (F-030: IO clipped by the digit window kept firing for the 168 countdown faces) | No IO/attribute storm in the hero: ~1,915 `setAttribute` calls/s at idle → 0 | mechanism: storm gone (idle 1,915/s → 0, hero scroll 1,657/s → 1.8/s), parity 0 diffs | mechanism/attribution, load 3.8-5.1, timing not claimed (short hold 08:31Z) | counts probe `wcflip.mjs` all-wave1 / aw1-10c / aw1+10e; parity snapshot at 4 positions | `variants/10e.diff` (delta), `variants/10e-full.diff` = `patch.diff`; topic `scroll-engine--10e`, stacked `se10e-aw1` | The /10c A/B (p95 +0.8 ms) was measured with this storm present: candidate (c) of the p95 flag | **hotfix, the new deliverable**; to the iPhone hero block (P2) |

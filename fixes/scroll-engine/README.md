# Fix: scroll-engine (cluster A: scroll-engine-batching + toolbar-resize + scene-gating-tighten)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (interim: plain-baseline prototype, n=3). Not yet redone on the combined wave-1 base; that step and the final `--runs 5` are still to do.
**Topic:** `fixes/TOPICS.md` rows 2, 10, 12 (conflict cluster A)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: engine `rE`/`iE`/`aE`/`oE`/`cE`/`dE` (pretty 2663-2783), commission `a` (3106), hero exit `s` (4163), profile `f` (10928), future `l` (11303) and its `dE` registration (11359), platform `n` (12436).

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

## What changed

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

## Before / after (plain baseline, interim)

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

## Risks, conflicts, follow-ups

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
| scroll-engine/08 | `anim-ablation` (E3, diagnostic, not landable): `*, ::before, ::after { animation: none !important }` + countdown 1 s tick removed (both countdowns frozen, so no digit spring) | If main-thread infinite animations (N3) feed the per-frame style recalc, iE + `l` forced style/layout drops >= 40 % | pending (not measured yet) | n/a | — | patch `fixes/scroll-engine/variants/08.diff` (topic dir `anim-ablation`) | — | diagnostic slot queued (`fix.mjs ab anim-ablation --runs 3`, last in slot) |
| scroll-engine/09 | One-way render un-skip + no `will-change` override (N9 + N10, per arch W1/W3 and the lead's directive): sections deferred at mount are un-skipped once by our own IO at the scene margin +50 % (min 150 %) and never re-skipped (`cE` no longer defers on deactivate); CSS pause rule keeps only `animation-play-state: paused` (drops `will-change: auto !important`) | No gate flap at the scene edge (N9: `iE` idle runs, card rect reads → ~0 at `.pain` top); no content-visibility / layer rebuild inside the viewport on scroll passes (N10: fewer frames >34 ms named by cv / scene flips) | pending (not measured yet) | n/a | — | patch `fixes/scroll-engine/variants/09.diff` (topic dir `scroll-engine--unskip`); probe `scratchpad/scroll-engine/probe.mjs` (E2 + N9 idle + first-reader) | — | diagnostic slot queued (targets base, /09, anim-ablation) |

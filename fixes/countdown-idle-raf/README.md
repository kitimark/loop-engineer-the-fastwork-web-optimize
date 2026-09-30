# Fix: countdown-idle-raf

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. `patch.diff` is variant 03 (sha256 160d69a0…); **the committed `results.json` predates it**:
it measured variant 02 (no `active` prop; `results.json` `patch.sha256` 2feaf189…), with old tools (before
I-002) at host load 9.6-19.5. It will be replaced by the final `ab --runs 5`, which is held for the host-load
gate (ts-i017) or a quiet window. The only difference between 02 and 03 is the `active` prop (hunk 4 below),
which is inert unless a call site passes it.
**Topic:** see `fixes/TOPICS.md` (countdown-idle-raf)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`. Pretty lines: `$E` (digit) 3823-3876,
`tD` (number) 3878-3904, `cD` (countdown) 3918-3943. No CSS.

## Why it lags

- research: `research/01-initial-investigation/README.md` "Idle work". At idle, about 51 repaints/s
  hit the hero countdown region on the iPhone, from the digit spring rAF. `motion-inventory.md` Hero,
  "Countdown": `setInterval(1s)` plus a rAF spring per digit, ~75 `.face{will-change:transform}`
  layers, and no pause when off-screen.
- code: `cD` (3931-3943) sets the clock with `setInterval(…, 1e3)` (3936). Each digit `$E`
  (3828-3841) starts a rAF spring (`GE`, 3791-3803, `UE` = stiffness 280 / damping 18 / mass 0.3)
  on every digit change. Each frame, the spring writes the animated value, and all 10 `.face` spans
  of the digit recompute and write `transform: translateY(KE(face, value) * cellHeight)` (3862).
- spring length, simulated with the same code: a 1-step change keeps the rAF alive for ~26 frames
  (430 ms at 60 Hz); the 0->9 wrap takes ~33 frames (550 ms). So the seconds digit alone animates
  ~45 % of all frames, with 10 style writes per frame, in **both** countdown instances: the hero
  (4333) and the inverse one in the closing/nav block (13160), also while they are off-screen.
  Every 10 s the tens digit adds another spring.
- measurement: the spring's frames stay below the 50 ms LoAF threshold. In the scroll phase, no
  countdown script shows up in the LoAF top scripts on either side (the top first-party scripts are
  the IO callback @473884, `iE` @100565, `l` @413982 and `a` @116579). The scroll-phase A/B therefore
  can't see this cost. It is idle / main-thread-budget work.

## What changed

Four changes in `patch.diff`:

1. **Off-screen pause (`cD`).** An `IntersectionObserver` (`rootMargin: 64px 0px`) on the countdown
   root sets a new `__cdVisible` state. The observer is disconnected in the same cleanup as the
   interval.
2. **Prop plumbing (`tD` -> `$E`).** The state is passed down as an `animate` prop. `$E` reads it
   through a derived (`__cdAnimate`). When it is false, the digit **snaps** to its target, the same
   way the existing `prefers-reduced-motion` path does, so no rAF runs off-screen. The clock keeps
   ticking at 1 Hz, so the digits are correct when the countdown scrolls back into view. Without
   `IntersectionObserver`, `animate` stays true, which is the original behaviour.
3. **Park faces outside the cell (`$E` face transform).** The face offset is clamped to [-1, 1]
   cells. `.digit` has `overflow:hidden`, so a face 1 or more cells away is invisible at +-1 just
   as it is at +-5. Svelte's style setter (`$i`/`Qi`, `chunks/BSBv9QXB.js:2855-2870`) writes only
   changed properties, so while a spring runs only the ~2 faces inside the cell get a style write
   per frame instead of 10. Visible pixels are identical: the in-cell faces are unchanged, and the
   faces at exactly +-1 are where the original already puts the neighbours at rest.
4. **`active` prop (`cD`, variant 03).** `cD` accepts an optional `active` prop (`__cdActive =
   R(() => r.active !== !1)`) and hands `animate = visible && active` to the digits. An
   IntersectionObserver can't see `opacity: 0`, so a countdown that is mounted but invisible (the morph
   panel's second countdown at 13160, which sits in the viewport at opacity ~0) would keep springing;
   the call site can now pause it. Without the prop (the hero at 4333) nothing changes.

The spring itself is kept rather than replaced by a CSS `transition` (the TOPICS.md suggestion). The
spring moves a continuous value, and the 0->9 wrap sweeps through all the digits. A per-face CSS
transition would make the faces that wrap (e.g. -4 -> +5 cells) sweep through the visible cell, and
the result would not be identical.

Screenshot diff: top 0.19 %, middle 0, bottom 0.29 %. That is within the 0-0.4 % countdown-phase
noise: a mid-spring digit shows at a different phase in each shot.

## Why that is faster

- Off-screen (most of the scroll): 0 countdown rAF callbacks and style writes per frame, instead of
  ~45 % of frames x 2 instances x 10 writes.
- On-screen: the same spring, with ~2 style writes/frame per animating digit instead of 10. That
  means fewer style invalidations, fewer layer property updates and fewer style mutation records
  (Hotjar observes those).
- Metrics it should move: idle-phase main-thread time / rAF work (once I-002 adds an idle phase to
  verify). In the scroll phase it is expected to be invisible, and it is.

## Before / after

`node tools/fix.mjs ab countdown-idle-raf --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA order,
cold cache, serve `--vendors=local --https --latency 150`). **Host load 9.6-19.5 during these runs**
(16 owners queued; noisy machine):

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 71.3 [68-73.4] | 68.7 [67.7-71.8] | -2.6 (-3.6%) | within noise |
| scroll: frames >20 ms | 82 [76-103] | 99 [85-103] | +17 (+20.7%) | within noise |
| scroll: frames >34 ms | 12 [9-13] | 12 [11-14] | 0 (0%) | within noise |
| scroll: frames >50 ms | 5 [4-6] | 5 [4-5] | 0 (0%) | within noise |
| scroll: frames >100 ms | 0 [0-2] | 0 [0-1] | 0 | within noise |
| scroll: worst frame ms | 91.2 [82.8-108.4] | 92.1 [91.5-125.2] | +0.9 (+1%) | within noise |
| scroll: p95 frame ms | 25.6 [25.3-25.9] | 25.7 [25.4-25.9] | +0.1 (+0.4%) | within noise |
| scroll: LoAF ms | 316 [263-401] | 348 [322-380] | +32 (+10.1%) | within noise |
| scroll: LoAF script ms | 183 [136-242] | 196 [171-213] | +13 (+7.1%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 83 [38-100] | 87 [40-89] | +4 (+4.8%) | within noise |
| morph: fps | 108.2 [104.8-111.8] | 109.5 [105-111] | +1.3 (+1.2%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-1] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

A/A noise floor (`node tools/fix.mjs ab --aa --runs 5`, host load 2.8-5.8), pooled range of both
sides:

- fps 71.4-77
- frames >20 ms 54-78 (A/A delta +6)
- >34 ms 7-10
- >50 ms 3-5
- LoAF 195-283 ms
- forced 34-83 ms
- morph fps 105-112.5

The patched >20 ms median (99) is above the A/A pool, but the baseline in this A/B run reached 103
too, and the host load was 2-4x that of the A/A run. The verdict is "within noise" on every row: no
claim of a scroll-phase win or loss.

Regressions: none. No new console errors, no new 404s, `morphReached` true on 5/5 runs on both
sides, screenshot diffs <= 0.29 %.

iPhone: not used.

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| countdown-idle-raf/01 | A/A baseline vs baseline (noise floor, scroll+morph) | reference | reference | old-tools (load 2.8-5.8) | >20 ms pooled 54-78, LoAF 195-283 ms, forced 34-83 ms, n=5 | `out/ab/_aa/2026-09-30T21-11-55-249Z/results-aa.json` (worktree) | spread of >20 ms frames is ~+-12 at n=5 | sent to all owners | n/a (A/A reference, no variant) |
| countdown-idle-raf/02 | IO off-screen pause + clamp faces to +-1 cell (no `active` prop) | fewer rAF springs and style writes, so >20 ms frames / script time drop | within noise | old-tools, contaminated (load 9.6-19.5) | >20 ms 82 [76-103] -> 99 [85-103], LoAF 316 -> 348 ms, n=5 | `variants/02.diff`; commit 630d944 (was 6b52c9c before rebase) `results.json` | countdown frames are < 50 ms, so they are invisible to scroll-phase LoAF; the effect needs an idle/probe metric | superseded by /03 | pending runner |
| countdown-idle-raf/03 | /02 + `active` prop (the call site can pause a mounted but invisible countdown) | as /02, plus no springs in nav-morph's hidden morph panel (inert without nav-morph's call site) | see "Before / after" | see "Before / after" | see "Before / after" | `patch.diff` = `variants/03.diff`, `results.json` | - | on branch | pending runner |
| countdown-idle-raf/04 | drop `.face{will-change:transform}` only (~80 layers per countdown -> 0) | fewer compositing layers | abandoned: queue slot dropped for the lock budget, never measured | - | - | `variants/04.diff` (rebuilt) | - | superseded by /05 | pending runner |
| countdown-idle-raf/05 | ONE `will-change` strip per digit (11 static faces, one transform write per frame) on top of /03 | ~80 -> ~8 layers per countdown, 1 write/frame per animating digit (architecture review) | see probe | see probe | see probe | `variants/05.diff` (full overlay, not stacked), probe `out/countdown-probe/probe.json` | - | probe in the final slot | pending runner |
| countdown-idle-raf/06 | CSS `transition: transform` per face instead of the rAF spring (TOPICS.md suggestion) | no rAF at all | abandoned before editing: the spring's 0<->9 wrap sweeps through every digit, and per-face transitions would move wrapping faces (-4 -> +5 cells) through the visible cell | - | - | no patch kept (never edited) | keep the spring; cut its cost instead | dropped | no patch kept (never edited) |
| countdown-idle-raf/07 | stop the `setInterval` entirely while off-screen | zero timer work off-screen | abandoned before editing: on re-entry the stale digits would roll visibly to the current time; a 1 Hz snap costs almost nothing | - | - | no patch kept (never edited) | snap, don't stop the clock | dropped | no patch kept (never edited) |

## Risks, conflicts, follow-ups

- Behaviour: desktop and phones run the same code. Reduced motion is unchanged: the `YE` check comes
  first. Off-screen digit changes snap, which the user can't see. At the IO edge (64 px margin), a
  digit could snap instead of spring during the frame before the observer callback arrives.
- Overlap: **this patch defines the `active` contract that nav-morph's `morph-panel-lazy-mount` uses**:
  its call site at 13160 passes `cD(…, { inverse: !0, get active() { return s(E); } })`. Without this
  patch (e.g. 630d944, variant 02) that prop is ignored, and the panel's countdown animates invisibly
  for the whole visit (found by the wave-1 dry combine, wave1-dry 6d71548). Land both together, or this
  one first. Only `cD`'s body changed here, not the call site. It is independent of the scroll engine.
- Follow-ups:
  1. Final `ab --runs 5` of variant 03 with the idle phase (I-002), after the host-load gate.
  2. Probe queued (count-only: layers, face style writes, digit parity, idle counters for base / 03 /
     05). Variant 05 (one `will-change` strip per digit, architecture review) is in `variants/05.diff`.

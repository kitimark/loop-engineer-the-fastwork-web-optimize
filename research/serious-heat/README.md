# Smooth under Serious heat: where the page still drops frames, and whether "more GPU" helps

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork).

**Author:** arch-serious-heat (architecture, R and I stages of protocol v2), 2026-10-05.
**Request:** user thread T-178 #6 (04:25Z, after trying PR-023 under Xcode-induced Serious). In short: make the page
run smoothly in heat mode (Serious). Research, investigate and distinguish. Many elements were already moved to GPU
rendering, and the user thinks more of that could help.
**Scope:** no new measurement. Everything below comes from records we already have, the WebKit source and Apple and
WebKit documents. Every claim carries a status word (CLAUDE.md "Platform claims").
**Status:** R/I done. No fix code. The plan in §5 needs the lead's ordering and P-ids from ops. P-129 rev 2 (frozen
reader `p129-read.mjs`, self-test `p129-selftest.mjs`) waits for ops' delta check and the lead's signature.

## 0. Short answer

1. **Heat mode slows the GPU side, not the main thread (F-251, OBSERVED, n=3).**
   - Under Xcode-induced Serious a CPU loop runs at the same speed.
   - A sustained GPU animation runs about 25-35 % slower.
   - DOM timers move onto a 30 ms grid (CONFIRMED in source, §1).
   - So "move more to the GPU" helps only work that waits on the main thread. Work that is already on the GPU gets
     slower. More layers, blur and backdrop passes, or 80-120 Hz Core Animation loops, add load on the side that heat
     throttles.
2. **Most of the heat lag in our records comes in the first seconds after the page loads.** It does not follow the
   hero or the toolbar (§2, OBSERVED).
   - In the 8 xcode-serious robot runs of P-124:
     - 17 % of moving frames are slow in the first 8.5 s after load;
     - 7 % from 8.5 to 20 s;
     - 1 % after 20 s.
   - The robot passes the hero only in those first seconds, so the "hero" rate and the "just loaded" rate are the same
     number.
   - Only 57 of 375 slow moving frames sit at a Safari toolbar step.
3. **Two timer effects of heat are certain in mechanism and cheap to fix** (§3.3, §3.4):
   - the countdown's 1-second ticks stretch to 1020 ms, so about once every 50 s a second is skipped (the original
     page does this too);
   - the end menu's 200 ms "finger lifted" timer lands on the 30 ms grid. It is a candidate for the after-lift hiccup.
4. **First spend: split the slow frames into "main thread late" and "render server late"** with one Timeline-on
   xcode-serious block (P-129 part A, §5). It tells which of the remaining fixes (GPU-side or main-side) is worth phone
   time.
5. **Toolbar step (P-115), from the existing Simulator captures, no device time (§4.1):** in 38 of 42 heavy step
   frames, the heavy Layout has no JS on its stack. It runs inside WebKit's "Composite" window: after the frame's
   commit was built, before the commit's flush returned, and not in a rendering update. 71 % of P-126's no-stack
   surplus sits there too (OBSERVED, Simulator; the window's meaning CONFIRMED in WebKit source).
   - That points to the engine's own viewport-change path, not to page script.
   - The likeliest source is the UI process's visible-rect update (source-plausible, UNRESOLVED).

## 1. What induced Serious throttles (platform claims)

| # | claim | status | reference |
|---|---|---|---|
| T1 | WebKit's thermal mitigation aligns DOM timers (setTimeout/setInterval) to a 30 ms grid | **CONFIRMED** | `Page::updateDOMTimerAlignmentInterval`, `DOMTimer.h:54` (cited in `research/thermal-condition-cli/README.md`); seen under the induced condition (F-251) |
| T2 | rAF is halved only under *aggressive* thermal mitigation, pref `RespondToThermalPressureAggressively`, default **false** since WebKit a8c0b8f (2025-01-31) | **CONFIRMED** | `research/thermal-condition-cli/README.md` |
| T3 | A repeating timer re-arms from the time it actually fired, not from its planned time, and the next fire is re-aligned up to the grid. So `setInterval(f, 1000)` on a 30 ms grid fires every **1020 ms** | **CONFIRMED** (source) + OBSERVED (phone) | WebKit main @ bdc535f8fe (2026-02-22): `ThreadTimers.cpp` `sharedTimerFiredInternal` → `timer.setNextFireTime(interval ? fireTime + interval : …)` with `fireTime` = now; `Timer.cpp` l.502-520 `TimerBase::setNextFireTime` → `alignment->alignedFireTime`; `DOMTimer.cpp` l.436-448 `ScriptExecutionContext::alignedFireTime` returns `adjusted - (adjusted % interval) + interval + randomizedOffset`. Phone: P-074 saw 1020 ms gaps at real Serious, P-071 1005 ms at Fair |
| T4 | Induced Serious does not slow a CPU-bound loop | **OBSERVED** (n=3, in our setup) | F-251: OFF 789/784/782 ms, ON 792/783/782 ms (`research/phone-thermal-gate/README.md` l.60-98) |
| T5 | Induced Serious slows a sustained GPU animation by about 25-35 %, about the level real Serious reached; short GPU bursts are not slowed | **OBSERVED** (n=3, cause unknown: GPU clock, render-server priority or rate cap) | F-251 |
| T6 | Heat (and Low Power Mode) turn off the high frame rate that Core Animation would otherwise grant | **CONFIRMED** (Apple ProMotion docs, cited in `research/gpu-lessons/README.md` C9(b)) | https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays |
| T7 | Whether induced Serious caps the display rate at 60 Hz on the phone, and whether our CA animations ever got more than 60 Hz | **UNRESOLVED** | decisive local check: ioscap distinct-frame rate of a CA-only loop, OFF vs ON (gpu-lessons §4.4) |

**Is composited work independent of the main thread?**

| # | claim | status | reference |
|---|---|---|---|
| C1 | WebKit hands transform/opacity/filter/backdrop-filter animations to Core Animation, which runs them in the render server, off the web process main thread | **CONFIRMED** | gpu-lessons C4/C5 |
| C2 | WebKit asks for 80-120 Hz on every CA animation it creates | **CONFIRMED** (source) | gpu-lessons C9 |
| C3 | Safari 26.4+ runs scroll-driven animations on the scrolling thread, so they track the scroll without the main thread (the phone runs 26.6.1) | **CONFIRMED** | WebKit blog post 17862 (webkit.org/blog/17862) |
| C4 | Main-thread properties in WebKit: clip-path, background-color, custom properties, `steps()`, `linear()` with points, layout properties; any filter or backdrop-filter makes an implicit layer | **CONFIRMED** | `research/gpu-props/README.md` §2 |
| C5 | Apple's frame loop: a *commit hitch* is the app missing the commit deadline; a *render hitch* is the render server late (CPU prepare, then GPU render); either way "the previous frame needs to stay onscreen longer than expected" | **CONFIRMED** | https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app |
| C6 | Composited animations stay smooth when the main thread is slow, **but not when the render server or GPU is slow**: they share the frame with everything else the render server draws | **CONFIRMED** in principle (C1 + C5); how much of our heat lag is render-side is **UNRESOLVED** (P-129 part A) | |
| C7 | A rAF gap on the phone alone cannot tell a commit hitch from a render hitch: both show as a late rAF | **CONFIRMED** (C5: either hitch holds the previous frame; WebKit's rendering update waits for the previous commit) / decisive: Timeline per frame (main-thread busy vs gap) | protocol v2 §5.2 |

**Consequence (design rule for this topic, from T1-T5 and C1-C6):** under induced Serious the main thread has
*more* headroom relative to the GPU than at Fair. A main-thread → GPU move pays off only where the main thread is
the late side. Anything that adds render-server work (another layer, a blur or backdrop pass, a big repaint of a
layer, a 120 Hz request) adds to the throttled side.

## 2. What our heat data says (P-124, 8 xcode-serious robot runs)

Source: P-124's records (fix-hero-exit-threaded, PR-018 rev 7d count check, driver G, flick scripts fo/nl/fs/e4, C and
V arms pooled; iPhone 15 Pro Max, iOS 26.6.1, document height 6850, viewport 775). The records stay in that
worktree's `out/` (they carry the LAN host; not copied). Scripts: `scripts/bands.mjs`, `scripts/split.mjs`,
`scripts/early.mjs`, and for P-129's floors `scripts/perrun.mjs` and `scripts/mfps.mjs` (`node scripts/<x>.mjs <dir of
P-124 records>`). Bands: `tools/lib/gesture-rec.mjs` frameBands
(hero scrollY < 900, last screen ≥ maxY − vh, the rest middle); "moving" = scrollY changed since the previous frame;
"slow" = dt > 34 ms. All OBSERVED, in our setup.

### 2.1 By area

| area | slow / moving frames | rate | at a toolbar step (±1 frame) | finger down | ≤ 300 ms after lift | > 50 ms |
|---|---|---|---|---|---|---|
| hero | 97 / 663 | **14.6 %** | 16 | 97 | 0 | 19 |
| middle | 254 / 7033 | 3.6 % | 22 | 222 | 16 | 35 |
| last screen | 24 / 5337 | 0.4 % | **19** | 6 | **15** | 1 |
| not moving | 94 / 26875 | 0.3 % | 0 | 0 | 0 | 3 |

Most slow frames are one missed frame: median 38-40 ms; dt histogram (4 ms bins) 32:59, 36:200, 40:98, 44:33, 48:30,
52:22, 56:12, 60+:15.

### 2.2 By time since load (the main finding)

| time after page ready | slow / moving frames | rate |
|---|---|---|
| 0-8.5 s | 130 / 757 | **17.2 %** |
| 8.5-20 s | 139 / 1992 | 7.0 % |
| 20 s and later | 106 / 10284 | 1.0 % |

- **All 663 moving hero frames fall 3-8 s after page ready**, and so do all 97 slow ones. The robot never returns
  to the hero later. In these records, "hero is slow under heat" and "the first strokes after load are slow" cannot
  be told apart.
- After 20 s the whole page runs at about 1 % slow frames under induced Serious.
- Likely causes of the early cost (UNRESOLVED, none checked):
  - first-time work: image decode, first raster of each layer, first creation of layers and backing stores, JIT warm-up;
  - deferred sections rendering for the first time (`content-visibility: auto`, the scene arm);
  - CA animations starting.
  Under heat, the GPU part of this (T5) costs more.
- **Decisive check:** a "late hero" run (P-129 part B). Idle at the top for 20 s, then the same hero strokes. If the hero
  rate falls to the middle's rate, the cost is load-time work, not the hero.

### 2.3 The toolbar's share

- 57 of 375 slow moving frames (15 %) are within one frame of an `innerHeight` change. In the last screen it is most
  of the slow frames (19 of 24), where the toolbar comes back at the bottom. In the hero it is 16 of 97.
- The toolbar step is WebKit main-thread work (gpu-props §0.3, CONFIRMED: WebKit relayouts fixed/sticky renderers and
  invalidates viewport-unit styles per toolbar frame). Induced Serious does not slow the CPU (T4). So **heat is not
  expected to make the toolbar step worse**. It stays the same cost it has at Fair (inference from T4 + gpu-props;
  not measured separately).

### 2.4 After-lift frames (end menu)

- In the last screen, 15 of 24 slow frames come within 300 ms after the finger lifts.
- fix-hero-exit-threaded's finger data (C-052, user's swipes on rev 7c, normal heat) puts 13 of 21 slow frames
  186-219 ms after lift, 35-43 ms each.
- Candidates, with the timer reading from §3.4: (1) morph-scroll's own 200 ms rest timer, (2) the nav hit test at
  m ≤ 0.2, (3) the panel repaint, (4) the smooth `scrollTo` settle.

## 3. Distinguish, per area

"Main" = runs on the web process main thread (rAF/JS/style/layout/paint record). "CA" = Core Animation in the render
server (independent of the main thread, C1). "Render-bound" = cost that lands in the render server/GPU every frame,
which induced Serious slows (T5). Inventory from `research/gpu-lessons/README.md` §1 and the v8/v9 builds
(`fixes/v8-best/README.md`, v9-best overlay).

| area | already CA / threaded (v8/v9) | still main thread | render-bound under heat | misses frames when main is slow? | would "more GPU" help under Serious? |
|---|---|---|---|---|---|
| **hero** | exit on CA in live CSS mode (hero R2); glint, sweeps, scroll cue, CSS loops | first strokes after load (§2.2, cause UNRESOLVED); toolbar step relayout (WebKit, §2.3); hero clock digits outside strip mode | hero exit blurs (cluster D, `fixes/large-area-blur`); many layers at once at load; 80-120 Hz CA loops (C2) | yes for the load-time work and the toolbar step; no for the CA exit | **not proven.** Load-time cost may be GPU-side (first raster). Split first (P-129) |
| **middle cards / section switches** | accent on CA (accent-ca exact); countdown strips on CA (cd-strip, cd-roll-ca K); off-screen scenes paused and their will-change dropped (scene-scope, scroll-engine /10b) | per-scroll-frame reads (gpu-lessons rows 7/10/11/14/15); typing caret and boil (timer/rAF); scene switches flip will-change (layer create/destroy) | future card blur(14px) reveal over a 100svh card; permanent `filter: blur(0)` on entered cards; `.price` and agents-chat backdrops (6 px); layer creation at scene switches | yes for reads/typing; scene switches on both sides | **mixed.** Removing permanent blur(0) and finished-reveal filters is less GPU work (good). Adding layers is not |
| **end menu (morph)** | morph opacity at min(…, 0.9999) (morph-gpu rev 3) | the morph tween (`--morph` custom property, rAF, C4); nav hit test at m ≤ 0.2; 200 ms rest timer → `__msSettle` → smooth `scrollTo` (§3.4) | nav pill backdrop `blur(calc(20px*(1-m)))` with will-change width/height/border-radius/background (resized each morph frame); panel repaint on close | yes: the tween and the settle are main/timer-driven | **partly.** Moving the tween to CA helps only if main is late at lift. The backdrop is render-bound |
| **nav (always visible)** | none of its look is on CA | nav colour hit test (cached in nav-hit-cache, waits for v9s4-7d) | **fixed nav pill with backdrop blur 20 px over moving content: a backdrop pass every scroll frame**; nested lang-switch backdrop 12 px | hit test only | **no: this is the main render-bound candidate.** Less blur or a cheaper backdrop helps; it changes the look, so it is a proposal |
| **countdown** | digit strips roll on CA (cd-roll-ca K); hidden while unseen (countdown-faces) | 1 Hz `setInterval` tick → state write | small | no (1 Hz) | no. Heat changes the *timing*, not the cost (§3.3) |
| **closed overlays** | `.why-bring` panel on its own layer | none | `.why-bring-backdrop`: fixed, full-viewport `backdrop-filter: blur(16px)` at opacity 0 while closed. Whether CA skips a backdrop at opacity 0 is **UNRESOLVED**. Waitlist dialog backdrop 8 px (only while open) | no | removing it while closed (`display:none`/`visibility:hidden` when not open) is pixel-identical; worth it only if CA renders it at opacity 0 |

### 3.1 Why "we moved many elements to the GPU" is not the cure under Serious

- It **was** the right move for the hero exit, accent, countdown roll and the CSS loops. They no longer wait on the
  main thread, and the main thread is the side heat does not slow (T4).
- Each of those moves also added composited layers and CA animations. Chrome's v8-section-ms shows the cost side
  (OBSERVED, Chrome, not phone): at rest, Layerize/Commit takes 420-470 ms/s in v7/v8 against 245-362 in the
  baseline. More layers cost more per frame.
- On the phone that cost lands in the render server, which induced Serious slows by about 25-35 % (T5).
- So the next win under Serious is likely **subtraction** of render-server work: fewer layers alive at once, no
  idle backdrops, no permanent no-op filters, blur only while it animates. More GPU-ization is not that win. This is
  an inference: §2.2 shows the cost is front-loaded, and P-129 part A decides which side is late.

### 3.2 What is GPU-bound, where moving to the GPU would not help

- the nav pill's backdrop blur (fixed, over moving content);
- the lang-switch backdrop nested in it;
- the future card's large blur reveal;
- the hero exit's blur;
- any layer that is re-rastered (the morph panel on close, countdown faces outside strip mode).

These are already GPU work. Under Serious they can only get cheaper by doing less of them: a smaller radius, a smaller
area, the blur off when idle, or a pre-rendered static image in place of a live blur.

### 3.3 Countdown under Serious: a skipped second (mechanism CONFIRMED)

- Baseline JS l.3905-3936 and v9 l.4527-4562 both tick with `window.setInterval(e, 1e3)`. Each tick writes
  `Date.now()`, and the digits are `ceil((deadline − now)/1000)`.
- At a 30 ms grid each fire comes 1020 ms after the last (T3). The tick's phase walks 20 ms later each second. About
  every 50 s it crosses a whole second, and the shown value drops by 2.
- **The original page does this too** under Serious. It is a heat look-and-feel defect, not a frame cost
  (memory `milestone-2-heat-profiles`, Milestone 2(a) asks to check the timer-driven parts).
- **Fix candidate:** a self-correcting `setTimeout` aimed at the next whole second (from `Date.now()`, as
  countdown-faces' `__cdGo` already does once). It is the same 1 Hz work, and every value is shown.
- **Look:** each shown value is the original's value for that second, so the digits are identical. What changes is
  that no second is skipped under heat, and the tick moves by up to 30 ms within the second.
  - The digits stay identical but the tick timing differs from the original's, so the lead rules whether this is a
    bug fix or a proposal. I lean to a proposal-light: show the user one A/B under induced Serious.
- **Owner:** de-countdown (countdown-faces owns `__cdGo`/`__cdT0`), with fix-cd-roll-ca for the roll. Note the
  coupling: countdown-faces deliberately keeps "the original's phase". The fix must keep `__cdT0`'s phase rule or
  replace it consistently.

#### 3.3.1 Fix spec (lead's request, 04:4xZ; for the fix owner the lead spawns)

- **Where.** The countdown component's effect in `/_app/immutable/nodes/2.DyWL8TcE.js`, on the current best build
  (v9-best overlay l.4527-4562; baseline l.3905-3936). Three places start the 1 Hz tick:
  - the effect's first start: `__cdTimer = window.setInterval(e, 1e3)`;
  - `__cdGo`'s resume: `__cdTimer = window.setInterval(__cdTick, 1e3)` after its one aligned `setTimeout`;
  - (baseline only) the plain `window.setInterval(e, 1e3)`.
- **Change.** Replace each repeating interval with one self-correcting timeout chain aimed at the original's nominal
  phase:

  ```js
  // next whole second on the original's phase (__cdT0 = the effect's first Date.now(), as countdown-faces keeps it)
  __cdArm = () => {
    let n = Date.now();
    __cdTimer = window.setTimeout(() => (__cdTick(), __cdArm()), __cdT0 + (Math.floor((n - __cdT0) / 1e3) + 1) * 1e3 - n);
  };
  ```

  - `__cdStop` clears it. `clearInterval` and `clearTimeout` share one timer list (HTML spec, timers: both remove
    from the same map of active timers; CONFIRMED). Still use `clearTimeout` for clarity.
  - `__cdGo` keeps its first aligned timeout and then calls `__cdArm()` in place of `setInterval`.
  - Nothing else changes: the same `z(c, Date.now(), !0)` write once per second, the same state, the same derived
    digits.
- **Why it is exact.**
  - The original's digit at a tick is `ceil((deadline − now)/1000)`, with `now` the tick's own `Date.now()`.
  - The chain fires at or after `__cdT0 + k·1000` (timers never fire early; the 30 ms grid only delays). So each
    tick shows the value for second k, the same value the original shows at Fair at that second.
  - Under Serious the original's tick drifts 20 ms per second and skips one value about every 50 s; the chain does
    not drift (each fire re-aims at the next whole second).
  - Side benefit: countdown-faces' resume model (`__cdT0 + floor((now − __cdT0)/1000)·1000`, "the original's last
    fire") becomes exact. Today, under Serious, it is off by the accumulated drift (up to about 1 s per 50 s live),
    so a resume can show a value the live clock would not have shown (OBSERVED by reading only).
- **Correction (fix-countdown-tick, 2026-10-05; agreed).** The chain above aims at the whole second, but the tick
  still writes its own `Date.now()`, which lands up to about 30 ms late, and a fire whose `Date.now()` reads before
  the aimed second would show the previous value again. The owner's version writes the nominal second,
  `__cdT0 + floor((now − __cdT0)/1000)·1000`, and such an early fire writes the second it was aimed at. The shown digit is then exactly the original's at Fair for every second. Their fix README is
  the spec of record; the code block above is superseded on that point.
- **Look.**
  - Digits pixel-identical to the original at Fair for every second.
  - Under Serious, no skipped second, and the change lands up to about 30 ms after the whole second (grid).
  - Frozen-pixel checks as for countdown-faces (T2 per memory `illusion-must-be-pixel-identical`).
  - The lead's ruling (04:4xZ): landing on the less-work rule (memory `less-work-landing-rule`).
- **Work.** Same 1 Hz state write. One `setTimeout` per second in place of one interval fire; no new work.
- **Checks for the owner (count-only, no timing):**
  1. Simulator or Chrome mechanism check: over 120 s live, 120 ticks, each `Date.now() − (__cdT0 + k·1000)` in
     [0, 40] ms, no repeated or skipped value.
  2. Stop/resume (countdown-faces' hide-while-unseen): after resume the first painted value equals the value the
     live chain shows at that second.
  3. Phone, xcode-serious, idle with the clock on screen (driver none): 120 s, count distinct shown values, expect
     120 of 120 (the original about 117-118). This is the less-work no-worse phone check.
- **Expiry, 2026-11-02 05:00Z (deadline `2026-11-02T12:00:00+07:00`, JS l.3905).**
  - After it, `rD` clamps to 0: the clock shows zeros. The original keeps writing state every second with no visible
    change; the chain may keep doing the same (identical) or stop at 0 (less work, nothing visible). Spec: keep
    ticking, for byte-for-byte behaviour parity; stopping is a later option.
  - Any measurement of this fix must run before the expiry, on both arms in the same block (CLAUDE.md "Baseline
    snapshot": results before and after it never compare).
  - Checks near the expiry (the last 120 s) are not useful as phone evidence: the clock hits 0 mid-run.

### 3.4 End menu: the 200 ms rest timer lands on the 30 ms grid (hypothesis)

- morph-scroll (rev 7c/7d; v9 overlay l.14253) arms `__msTO = setTimeout(() => (__msGo = 0, __msSettle()), 200)` on
  touchend and re-arms it each rAF while no touch is down.
- `__msSettle` reads `__msEnd.offsetHeight` and `scrollHeight` (forced layout) and starts a smooth `scrollTo`.
- Its fire time (200 ms, up to about 230 ms on the 30 ms grid under Serious) matches the 186-219 ms after-lift
  cluster in C-052. C-052 was recorded at normal heat, so the grid is not what makes that cluster. The timer itself is
  a candidate in every heat state.
- **Status: hypothesis (OBSERVED coincidence of times only).** Decisive: the ready Chrome probe
  `fixes/morph-scroll/settle-trace.mjs` in fix-hero-exit-threaded's worktree (unrun; the lead decides). It stamps
  `__msSettle` and the scrollTo against the slow frame.
- Whether WebKit runs a programmatic `behavior: 'smooth'` scroll in the UI process (off the main thread) is
  **UNRESOLVED** (no reference found yet). If it does not, the settle animation itself is main-thread work.
- Possible fix direction (owner fix-hero-exit-threaded): decide the settle from `scrollend`/momentum end rather than
  a timer, and do the layout reads before lift (cached geometry). Look-neutral if the end position and the curve stay
  the same.

## 4. Answer to the lead's P-128 follow-up

Question: does the hero/toolbar share under heat make a depth-16 Timeline recapture, or splitting P-126's no-stack
surplus, worth more phone or Simulator time than other areas?

- **No, not ahead of the split in P-129 part A.**
  - The hero's high rate under heat is a "first seconds after load" rate (§2.2).
  - Toolbar steps are 15 % of slow moving frames (§2.3).
  - The toolbar work is main-thread work that induced Serious does not slow (T4).
- If P-115 continues: **split P-126's no-stack surplus first** (it needs no new device time). Run the depth-16
  recapture only if P-129 part A shows the hero's slow frames are main-thread late (commit hitch).
- The two once-per-step toggles (nav @14241, start-selling-future @12338) are below P-128's floors. They stay
  descriptive and UNRESOLVED.
- P-129 part B (late hero) separates "hero" from "just loaded" in the same block as A, at almost no extra cost.
- **Lead's ruling (04:4xZ):** toolbar-resize is parked on decision:lead. There is no depth-16 recapture and no
  further P-128-style census until P-129 says main-thread. 4c (the no-stack split) runs now, with no device time
  (§4.1).

### 4.1 Split of P-126's no-stack surplus (4c; DESCRIPTIVE, post hoc, decides nothing; no device time)

- **Input:** the P-125 Simulator Timeline captures (`out/toolbar-resize/sim125` in fix-toolbar-resize's worktree), with
  P-126's frozen frame rules imported from `read-inval126.mjs` (`loadRun`: heavy = moving, y < 3250, in view, Layout
  ≥ 10 ms; control = in-view rest).
- **Scripts:** `scripts/nostack.mjs` (dbac6b5e623d), `scripts/nostack-group.mjs` (82e6dfdf5b2d),
  `scripts/composite.mjs` (c8d4f93661e3), `scripts/heavyctx.mjs` (1721c01816a7), `scripts/raf.mjs`
  (23f8d50a9125). Run: `node scripts/<x>.mjs <sim125 dir> <path to read-inval126.mjs>`.
- **Totals reproduce P-126 exactly:** no-stack records C heavy 181 / control 406, R 168 / 304.

**Where the no-stack records start** (the chain of open Timeline records around each one; per frame):

| context | C heavy (22 frames) | C control (435) | R heavy (20) | R control (347) | share of C surplus |
|---|---|---|---|---|---|
| inside a **Composite** record | 116 (5.27) | 50 (0.11) | 98 (4.90) | 24 (0.07) | **71 %** |
| top level (no open record) | 28 (1.27) | 11 (0.03) | 34 (1.70) | 8 (0.02) | 17 % |
| inside an ObserverCallback | 10 (0.45) | 0 | 8 (0.40) | 0 | 6 % |
| inside RecalculateStyles (P-127's O7 shape: a write's layout dirtying) | 7 (0.32) | 13 (0.03) | 6 (0.30) | 10 (0.03) | 4 % |
| in a RenderingFrame only | 20 (0.91) | 332 (0.76) | 22 (1.10) | 262 (0.76) | 2 % |
| **total** | 181 (8.23) | 406 (0.93) | 168 (8.40) | 304 (0.88) | (7.30 per heavy frame) |

**What a "Composite" record is on Apple platforms** (CONFIRMED, WebKit main source):

- `Page::willStartRenderingUpdateDisplay` opens it, with the source comment: "Inspector's use of 'composite' is rather
  innacurate. On Apple platforms, the 'composite' step happens in another process; these hooks wrap the non-WebKit
  CA commit time which is mostly painting-related". Source: `Source/WebCore/page/Page.cpp` l.2808-2830 (file commit
  c7ee1c1cda).
- `RemoteLayerTreeDrawingArea::updateRendering` calls it after `finalizeRenderingUpdate`. The record closes only
  when the commit queue's backing-store flush posts back to the main run loop:
  `RunLoop::mainSingleton().dispatch(... didCompleteRenderingUpdateDisplayFlush ...)`. Source:
  `Source/WebKit/WebProcess/WebPage/RemoteLayerTree/RemoteLayerTreeDrawingArea.mm` l.319-449 (file commit 2b001c8573).
- `PageTimelineAgent` nests records by a push/pop stack: `willComposite` → `pushCurrentRecord(Composite)`, closed in
  `didComposite` or at `didCompleteRenderingFrame`. Source: `PageTimelineAgent.cpp` l.272-293 and l.360-375 (file
  commit 3941d977dc).
- So **"inside Composite" means a time window, not a cause.** It is main-thread work that ran after the frame's
  rendering update had built its commit and before the flush came back. Any run-loop task in that window nests
  there, UI-process IPC included.

**The heavy Layout itself sits in that window** (`scripts/heavyctx.mjs`, all 9 runs pooled):

| heavy frames (42) | inside Composite | outside Composite |
|---|---|---|
| largest outer Layout (median 21.8 ms); stack key `native` in all 42 | **38** (parent Composite 16, RecalculateStyles 12, RenderingFrame 10) | 4 |

- Every Composite record that holds no-stack invalidations also holds a RecalculateStyles, a Layout and a Paint
  (`scripts/composite.mjs`).
- In heavy frames the Composite window lasts a median 51.8 ms (p90 82.2) against 2.7 ms (p90 22.1) at rest.
- **It is not the next rendering update running early** (`scripts/raf.mjs`, 23f8d50a9125):
  - the page runs rAF callbacks in nearly every frame (25392 FireAnimationFrame records in 9 runs);
  - none of them starts inside a Composite window (0 of 25392);
  - none of the 38 heavy Layouts inside a window has a FireAnimationFrame before it in that window.
  So the heavy Layout comes from a run-loop task that is not a rendering update (OBSERVED).

**Reading (OBSERVED, Simulator, cause UNRESOLVED):**

- The toolbar step's heavy Layout and most of the no-stack surplus run **outside the page's own rendering update**,
  with no JS on the stack, while the previous commit's flush is in flight.
- The likeliest source is the UI process's visible-content-rect update. `WebPage::updateVisibleContentRects` (IPC, no
  JS) calls `setUnobscuredContentSize`, `setVisualViewportOverrideRect` and
  `setLayoutViewportOverrideRect(..., TriggerLayout Yes when stable)` per toolbar frame. Source:
  `Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm` l.3975 ff., l.4113-4175 (file commit 7c1d2dd42a). This
  matches gpu-props §0.3 (CONFIRMED: fixed/sticky relayout and viewport-unit invalidation per toolbar frame).
- That this IPC is the one running in the window is **UNRESOLVED**: the Timeline does not name IPC messages.
- Only 4 % of the surplus has P-127's "script write → layout dirtying" shape. So **page script writes do not explain
  the surplus** (descriptive; P-127's O7 says script writes *can* make stackless records, and here few have that shape).
- The 0.45/frame inside ObserverCallback (none at rest) are stackless records raised while an observer callback is
  open. They are not attributed further here.

**What it means:**

- For P-115: the work is the engine's response to the viewport change. The page-side levers are the gpu-props ones:
  - fewer fixed/sticky renderers in the step (`.why-bring` fixed `inset: 0` while closed: `display: none` when
    closed);
  - no viewport units (vh/svh/dvh) in large subtrees.
  A census of script callers cannot find it (P-128's FWWC-ONLY fits this).
- Under heat: this is main-thread CPU work that induced Serious does not slow (T4). But because it runs while a
  commit is in flight, it can push the next frame's commit late (a commit hitch). P-129's MAIN/RENDER split shows how
  often that happens on the phone.
- Decisive local check, if the lead wants one later (count-only Simulator, shared lane): a static test page with N
  fixed elements and viewport units, and no script, under the same toolbar flick. The no-stack-in-Composite count per
  step should follow N and the vh count. Not run.

Caveat: an "out-of-view step" class (moving, not in view) gave numbers that do not match ops' R2 (my class includes
frames before the showcase IO's first entry), so it is left out.

## 5. Ranked plan

Ranking: expected effect under Serious × confidence ÷ cost, with the measurement first where the mechanism is
unknown. Profile for every phone card: **xcode-serious** (default since T-162 #3; ops-handover "Phone ticket
profile"; never pooled with real-heat or Fair). P-ids: next free after P-128 is P-129; ops assigns the final ids.

| rank | change | mechanism and expected effect | look | owner (suggested) | decisive measurement |
|---|---|---|---|---|---|
| 1 | **Measure first: commit vs render split** | Tells whether the slow frames under Serious are main-thread late or render-server late. That decides between §5 rows 4-6 (GPU subtraction) and main-side work | none | iphone-runner (the lead's pick) | **P-129 part A** below |
| 2 | **Late-hero run** (same block) | Separates load-time cost from hero cost (§2.2). If load-time, the target becomes "first 8 s": warm-up raster, staged layer creation, decode before the first stroke | none | same runner | **P-129 part B** below |
| 3 | **Countdown self-correcting tick** | No skipped second under heat (T3). Same 1 Hz work | digits identical; tick phase differs; the lead ruled: lands on the less-work rule | a fix owner the lead spawns (with de-countdown, fix-cd-roll-ca) | fix spec and checks in §3.3.1; phone: 120 s of the clock on screen, xcode-serious, driver none (idle), count shown values, expect 120 of 120 (the original about 117-118); before the 2026-11-02 05:00Z expiry |
| 4 | **Closed overlay backdrop off** (`.why-bring-backdrop` and similar: `visibility:hidden` or `display:none` while closed, back on the open class before the 0.4 s fade) | Removes a full-viewport backdrop-blur layer if CA renders it at opacity 0 (UNRESOLVED) | pixel-identical (opacity 0 → not drawn) if the open fade keeps its first frame; T2 check | fix-large-area-blur (or the gpu-props owner) | Simulator layer tree (count-only, `LayerTree` before/after) shows whether the backdrop layer exists while closed. Only if yes: in P-129 part A's block, one arm |
| 5 | **No permanent no-op filters** (`filter: blur(0)` left on entered cards; reveal blurs removed after they finish) | Fewer filter layers and render passes every frame those cards are on screen | pixel-identical (blur(0) = none), T2 check; layer promotion changes may shift subpixel AA, hence T2 | fix-large-area-blur | count-only: layer count and filter count on the Simulator before/after; phone: less-work no-worse check (memory `less-work-landing-rule`) |
| 6 | **Nav pill backdrop cost** (proposal): smaller radius, a frosted static fill when the content below is uniform, or the blur only while the nav sits over images | The nav's backdrop is the one render pass on screen in every scroll frame, everywhere on the page. Under T5 it costs about 25-35 % more | **visible change → proposal with Try-it** (memory `illusion-must-be-pixel-identical`, `proposal-try-it-required`) | fix-nav-morph | only if P-129 part A says render-late: an A/B arm with the nav blur at 0 as an upper bound (diagnostic, not a candidate), xcode-serious, driver G, same scripts as P-124 |
| 7 | **End-menu settle without a timer** | Removes the 200 ms timer + forced layout + smooth scroll from the after-lift moment (§3.4) | none if the end position and curve stay the same | fix-hero-exit-threaded | hypothesis only (lead): P-129 part S (descriptive, no extra runs); settle-trace.mjs only on the lead's go; then the PR-023 phone/finger path |
| 8 | **CA loops request ≤ 60 Hz** (if T7 shows they run above 60 Hz at Fair): e.g. a CSS loop's speed set so WebKit's high-rate request does not apply, or loops paused while the finger is down | Less render-server work during strokes | none if the loop's speed and phase are unchanged; depends on how WebKit picks the rate (UNRESOLVED) | de-gpu (gpu-lessons owner) | gpu-lessons §4.4: ioscap distinct-frame rate of one CA loop, Fair vs xcode-serious |
| — | **Not recommended now:** moving more parts to their own layers or to CA for heat's sake | adds to the throttled side (§3.1) | — | — | revisit only if P-129 part A shows commit hitches dominate in an area that a CA move would take off the main thread |

### P-129 rev 2 (for ops' delta check and the lead's signature): where the heat lag comes from

Lead's ruling (04:4xZ): 4a and 4b form one card, P-129 (id registered by ops, 423bfab5). It is a Timeline-on
xcode-serious block in the protocol §5 shape, using existing drivers. The settle timer rides along as a descriptive part
because it costs no extra runs. **Registered before data: no run exists.**

Rev 2 answers ops' pre-data read (NOT YET, 423bfab5): C1 frozen reader with a clock gate, C2 the RenderingFrame
self-span twin, C3 a named driver-G sentinel, C4 per-run idle gates and part B floors, N1-N5. The change list is at the
end of this card.

**Questions.**
- A: in the slow frames under induced Serious, is the web process's main thread busy (commit hitch) or idle (render
  hitch)?
- B: is the hero slow under heat, or only the first seconds after load?
- S (descriptive): does the end menu's 200 ms rest timer sit in the after-lift slow frames?

**Profile:** xcode-serious (ops-handover "Phone ticket profile"; mandatory `profile:` line; never pooled with real-heat or
Fair runs). No heat pre-warm and no cooling wait; the sentinels decide validity.

**Build (N4/N5; the lead's pick).** P-124's V build, **a research build, not a ship build**: PR-018 rev 7d, JS
`29c0d537e0c9`, CSS `659b02f7169d`, snapshot `out/snapshots/ms-29c0d537e0c9` in fix-hero-exit-threaded's worktree. The
runner serves that snapshot with TICKET-7d's hash check (JS and CSS hashes before the block; a mismatch stops it).
- Chosen for comparability with P-124 (same build, same `fs` script, its Timeline-off counts set the floors below).
- It contains morph-scroll's 200 ms rest timer, so part S stays in.
- Nothing here says whether 7d (or anything) should ship; it reads where the lag comes from.

**Runner:** iphone-runner (the lead's pick), after v9's phone needs and art-worst-cases' clip holds.

**Procedures** (arms of one build, not two builds):
- **E (early):** as P-124's H2. Load, page ready, then the P-124 script `fs` (`g-fastshort-v1.json`, program hash
  `8737f212c0ff`; whole page and end lifts, the most last-screen slow frames).
- **L (late):** load, page ready, **about 20 s idle at the top** (the runner waits before starting the gesture; no
  touch), then the same `fs` script.
- E is the named control. Same port, same script, only the idle differs.

**Block (protocol §5 shape, Timeline block rules):**
1. `thermal-gate.mjs --accept-induced` at the hold start (as P-124);
2. one uncounted warm-up run (E, Timeline off);
3. start sentinel S0 (E, Timeline off);
4. **8 counted Timeline-on runs, E L L E E L L E**;
5. re-runs: a counted run that fails a run gate (below) is re-run once at the end, same procedure, before S1; at most 2
   re-runs per block;
6. end sentinel S1 (E, Timeline off), then `thermal-gate.mjs --accept-induced` again;
7. park Safari.
- Driver G (`iphone.mjs gesture --timeline`). `iphone.mjs wda check` before the gate; budget per run from
  `gesture --dry-run`'s `GESTURE_BUDGET_S` (I-112; fs: 229 s). Up to 13 runs at about 2.5-3 min each: under the
  3600 s `--block` cap.
- An F-256-style dry run of L's wait first: the first touch must land 20-23 s after page ready.
- Files: `g-<run>.json` (gesture record) and `tl-<run>.json` (its `--timeline`, segment 0) in one folder; sentinels
  have no `tl-`.
- Timeline: `Page.disable` → `Page.enable` → `Timeline.start` on the page target, re-sent after every navigation
  (F-047), at the runner's capture depth (stated in the record; nothing here reads stacks).
- At most 2 blocks for these questions (§5.3).

**Reader (C1; frozen).** `research/serious-heat/p129-read.mjs` (sha256/12 `88835d4822e9`), self-test
`p129-selftest.mjs` (`110cc04eb8fb`, 48 checks on synthetic records, `SELFTEST PASS 48`). The reader's header is the
rule text; the bullets below restate it.
`node research/serious-heat/p129-read.mjs <folder> --E E1,E2,E3,E4 --L L1,L2,L3,L4 --S S0,S1 [--json out.json]`.
Any change after the first counted run is a new card.

**Clock mapping (C1).** Frame stamps `t` are the page's `performance.now()` (the recorder's rAF timestamp). The
Timeline file carries `offsetMs = syncTL·1000 − syncT` from a `performance.mark` TimeStamp
(`tools/lib/gesture-run.mjs` timelineRecorder). A record's page time = `startTime·1000 − offsetMs`.

**Run gates (C1, C4).** A counted run that fails one is **invalid**: it is excluded, named in the output, and re-run
(block step 5).

| gate | rule |
|---|---|
| G1 timeline | `syncTL` and `offsetMs` present, records present, `stopped` true, no reconnect (no `epochs`) |
| G2 drift | the end mark's `offsetMs` within 2 ms of the start's |
| G3 alignment | ≥ 95 % of moving frames have a FireAnimationFrame starting in [t − 2, min(t + 10, next t − 2)) ms, **and** the median lag (FireAnimationFrame start − t) is within ±2 ms |
| G4 idle | first touch − `readyPageMs`: E in [4.0, 5.5] s (P-124's fs runs: 4.62-4.64 s), L in [20, 23] s |
| G5 shape | one segment, ≥ 100 frames, not aborted |
| G6 script | program hash starts with `8737f212c0ff` (fs) |

- Why G3 is asymmetric (CONFIRMED in source): `t` is the update's frozen "now", taken before the resize, scroll,
  media-query and animation steps that run before the rAF callbacks (WebKit `Page.cpp` l.2478-2535, commit
  c7ee1c1cda). So on a frame with heavy scroll handlers the callbacks start several ms after `t`. The ±2 ms median,
  over mostly light frames, pins the clock: the self-test shows a 3 ms offset error passes the hit share and fails the
  median.
- The reader run on P-124's fs records (Timeline off, so G1 fails as expected) gives idle 4.62 and 4.64 s and passes G4,
  G5 and G6.

**Sentinel (C3; named for driver G).** S0 and S1 are Timeline-off E runs, judged on moving frames:
- **PASS** when moving fps (moving frames / sum of their dt) **≥ 50**, and slow share (dt > 34) **≤ 6 %**. G5 and G6
  apply too.
- Reference: P-124's 8 xcode-serious G runs had 54.3-56.4 fps and 2.1-4.2 % (fs: 55.8 and 56.4 fps, 2.6 and 2.1 %;
  `scripts/mfps.mjs`, `007950372dc2`).
- Why not CLAUDE.md's S/W numbers (bottom ≥ 58, scroll ≥ 44): those are for scripted scrolls. A G run's rate is the
  gesture's, and frame counts from G runs don't compare with S/W/M runs (CLAUDE.md "Frame thresholds").
- A failing S0 voids the block before any counted run. A failing S1 voids every counted run (the reader prints VOID).
  Under xcode-serious there is no cooling wait: the block restarts, within the 2-block cap.
- The thermal gate (block steps 1 and 6) is the profile check, as in P-124.

**Frames (frozen).**
- Frame records `[t, dt, scrollY, innerHeight]`; moving = scrollY changed since the previous frame.
- Slow = dt > 34 ms, with the ±4 ms twins (dt > 30 / 38). A reading that differs at a twin is flagged
  threshold-sensitive.
- Bands as `tools/lib/gesture-rec.mjs` frameBands: hero y < 900; last screen y ≥ maxY − vh; middle otherwise.
- Time windows: for E from page ready, W1 [0, 8.5) s, W2 [8.5, 20) s, W3 ≥ 20 s. For L from the first touch, L1 [0, 8.5)
  s, L2 ≥ 8.5 s.
- Toolbar step = innerHeight differs from the previous or the next frame.

**Part A rule (per slow moving frame of a valid counted run, gap inside the Timeline).**
- Gap = (t − dt, t] in page ms.
- Work records = EventDispatch, FunctionCall, TimerFire, FireAnimationFrame, ObserverCallback, EvaluateScript,
  RecalculateStyles, Layout and Paint, at any depth.
- **busy** = the length of the **union** of every work record's overlap with the gap. Nested or overlapping records
  count once (N1).
- **busyRF** (C2) = busy united with the RenderingFrame self-spans in the gap. A self-span is the RenderingFrame's span
  minus its direct children's spans, so Composite's flush wait (§4.1) stays out.
- maxLR = the largest single Layout or RecalculateStyles overlap.
- **MAIN:** busy ≥ dt − 16.7 ms (the main thread alone explains the miss).
- **RENDER:** busy < 8 ms and maxLR ≤ 4 ms (the main thread was mostly idle while the frame was late).
- **MIXED:** everything else.

**Part A reading (frozen; E and L valid runs pooled).**
- **THIN:** < 30 classified slow moving frames, or < 3 runs with one.
- **RENDER-LED:** RENDER ≥ 50 %. → ranked plan rows 4-6 and 8 (GPU subtraction).
- **MAIN-LED:** MAIN ≥ 50 %. → main-side work. The toolbar depth-16 recapture or a static toolbar test page (§4.1)
  becomes worth its time only if the toolbar-step frames are MAIN too.
- **MIXED:** otherwise.
- **Attribution-sensitive (C2):** the reading is computed with busy (decides) and with busyRF. When the two differ, the
  result is "ATTRIBUTION-SENSITIVE (busy X, busyRF Y)" and **decides nothing**.
- Reported in every case, descriptive: per band, per window, toolbar-step vs other, and the twins.

**Part B rule (hero band, moving frames, dt > 34).**
- **Floor (C4):** a valid run enters part B only with ≥ 25 moving hero frames. P-124's fs runs had 82 and 83
  (`scripts/perrun.mjs`, `ba965128cca3`), so one slow frame moves a run's rate by about 1.2 points.
- rE and rL = pooled slow / moving hero frames over the E and L runs in part B; per-run rL_i listed.
- **THIN:** fewer than 3 E or 3 L runs in part B.
- **LOAD:** rL ≤ 0.5·rE **and** rL ≤ 4 % (pooled), **and** at least 3 L runs (all, when only 3) have rL_i ≤ 0.5·rE.
- **HERO:** rL ≥ 10 % **and** rL ≥ 0.75·rE (pooled), **and** at least 3 L runs (all, when only 3) have
  rL_i ≥ 0.75·rE.
- **SPLIT:** otherwise.
- The per-run spread applies to the relative criterion only (C4). The absolute 4 % and 10 % apply to the pool: with
  80-90 hero frames per run, a single run's absolute rate is too coarse (one frame = 1.2 points).

**Part S (descriptive only, decides nothing).** For slow moving last-screen frames within 300 ms after a touchend:
- does the gap hold a TimerFire whose timer was installed with a 200 ms timeout (TimerInstall `data.timeout` 200,
  matched by timer id)?
- does a Layout start after that TimerFire, inside the gap?
- Counts are reported. A later card decides (lead), for example the settle-trace probe.

**Predictions (registered before data; a miss counts against the card's author).**

| # | prediction | p |
|---|---|---|
| 1 | S0 and S1 pass in the first block | 75 % |
| 2 | E's W1 slow rate ≥ 10 %, over **all-band moving frames** in W1 (N2; Timeline on) | 70 % |
| 3 | part B reads LOAD | 60 % |
| 4 | part A reads MIXED | 45 % (RENDER-LED 30 %, MAIN-LED 25 %) |
| 5 | in W1, RENDER + MIXED ≥ 50 % of slow frames | 60 % |
| 6 | toolbar-step slow frames are MAIN ≥ 50 % (the §4.1 out-of-band Layout). Testable only with ≥ 10 toolbar-step slow frames; fewer reads "untestable" and **counts as a miss** (N3) | 65 % |
| 7 | after 20 s (W3 and L2), < 2 % of moving frames are slow | 70 % |
| 8 | part S: ≥ half of the after-lift slow frames hold the 200 ms TimerFire | 40 % |

**Limits.**
- Timeline on adds main-thread work. Only Timeline-on runs within this block compare, never with P-124's counts. P-124
  sets the floors and the sentinel reference only.
- One script (`fs`), one research build.
- The phone's frame stamps mark the rendering-update start (claims-audit §2.3), so a render hitch shows as the *next*
  frame's late stamp. Part A therefore reads the gap before each slow stamp.
- RENDER is an inference from "main idle while late" (Apple's two-hitch model, C5). It does not separate GPU from
  render-server CPU.
- Countdown expiry (2026-11-02 05:00Z): run before it.

**Rev 2 changes (against ops' 423bfab5 read).**

| item | rev 2 |
|---|---|
| C1 | frozen reader + self-test pinned by sha; clock mapping; gates G1-G3 (G3: ≥ 95 % FireAnimationFrame hits plus a ±2 ms median lag) |
| C2 | busyRF twin with the RenderingFrame self-span; a differing reading is ATTRIBUTION-SENSITIVE and decides nothing |
| C3 | named G sentinel: Timeline-off E runs, moving fps ≥ 50 and slow share ≤ 6 %, P-124 reference stated; thermal gate at start and end |
| C4 | per-run idle gates G4 (E [4.0, 5.5] s, L [20, 23] s), invalid → one re-run within the block; part B floor ≥ 25 moving hero frames per run; per-run spread on the relative criterion only |
| N1 | busy = union of overlaps |
| N2 | prediction 2's denominator = all-band moving frames |
| N3 | prediction 6 needs ≥ 10 toolbar-step slow frames, else untestable = miss |
| N4/N5 | build = 7d research build ms-29c0d537e0c9 with TICKET-7d's hash check, not a ship build; runner iphone-runner |
| also | G5 (one segment), G6 (fs program hash) added; part B THIN changed from "< 40 hero frames" to "< 3 runs per procedure in part B" |

## 6. Open items and limits

- Every rate in §2 is from one build pair (PR-018 rev 7d count check) and one robot script set. The time-since-load
  effect could be partly the scripts' order (hero strokes first). P-129 part B is the check.
- P-124 has no Fair runs of the same scripts, so "heat makes X worse" is not shown per area here. What we have:
  F-251 for CPU and GPU, and P-074/P-071 for the timer gap.
- T7 (display rate under induced Serious) and the opacity-0 backdrop question (§3, closed overlays) are UNRESOLVED.
- No Chrome or phone probe was run for this write-up (lead's rule). settle-trace.mjs is ready but unrun.

## 7. Board

- F-264 (measurement): the heat lag is front-loaded after load; the robot's hero rate is a just-loaded rate (§2.2).
- F-265 (coupling): the toolbar-step heavy Layout runs in WebKit's Composite window with no JS (§4.1).
- F-266 (pitfall): setInterval(1000) at 1020 ms under Serious; countdown skip and the faces resume drift (§3.3).

# Unknown fields and phone post-mortems: one ranked action list (arch-lead)

Status: 2026-10-01 ~11:40Z, synthesis for the lead, who executes (spawns, routing via mgmt-ops-4, user asks).
Desk only: no Chrome, no iPhone, no locks. Builds on protocol v2 (`measurement-protocol-v2.md`, "v2"), which this
note amends in §4.

Inputs (each is the evidence; this note only merges, dedupes and ranks):

| id | author | file, commit | covers |
|---|---|---|---|
| V | arch-unknowns | `research/architecture/unknowns-validity.md`, 4bcd896 | experiment validity: host, phone state, drivers, statistics (V-U1..U12) |
| X | de-unknowns-ux | `research/design-engineering/unknowns-ux.md`, 133d17d | perceived vs measured (X-U1..U13), MWFI candidate metric |
| R | de-unknowns-render | `research/design-engineering/unknowns-render.md`, 8de2df7 | render-cost terms (R-U1..U12); y≈1960 post-mortem (§1 there: src/noinert/e2/na/nb, WebKit source chain) |
| PM | de-pm-morph | `research/design-engineering/postmortem-morph.md`, 4b3bc00 | gh, gb/ghb, ghbn, the hump, first frames, a1 |
| PH | de-pm-hero | `research/design-engineering/postmortem-hero.md`, 1c375d1 + 1d34ec8 (layout-payer census, ST-2d) | hero v2 y≈700, h1, the y≈700 pair, y≈1250, h3, h4 |
| NM | fix-nav-morph | `fixes/morph-webkit/README.md`, 9dd93b9 | y≈1960 NAMED (listener add), F1/F2 candidates, ghbn Chrome check |

Findings it leans on: F-044, F-045 (weakened), F-047, F-048, F-049.

## 0. The answer in nine lines

0. **First fix our own probe.** The phone logger reads `scrollY` in rAF, which on WebKit forces a synchronous layout
   whenever y≠0 (R-U1). PH's census bounds it: of 59 whole-view layouts ≥10 ms, 40 are paid by the rendering update
   with no reader, 6 by page script, 15 by the logger. A read mostly changes *who pays* a layout already dirty, so
   whole-view layout is real; but a logger-paid *second* layout in a frame may be ours (hero card 3 is now "at least
   two layouts", not three). A/B deltas stay comparable; absolute counts wait for a 10-minute A/A (P0).

1. **Every phone refactor that underperformed was aimed at a cost Chrome could not show us.** WebKit pays whole-view
   work for changes Blink treats as cheap: window wheel/touch listener add/remove (y≈1960, ~100 ms), transitions
   that end at `opacity:1`/`filter:none`/`transform:none` (y≈1250, ~35 ms × 2), a mask-image presence change or an
   auto-width root layout in the flip pair (y≈700; D5 found no opacity/filter/transform flip there). A Chrome mechanism PASS was read as phone cost parity (§1, X1).
2. **Three attributions picked the event that sat at the same y or m, not the cause** (y≈1960 img burst, y≈1250
   scene gate, the morph "hump"). Scripted drivers make y, time and m collinear; only a decoupling run separates them (X3).
3. **Two 1 Hz page loops are hidden common terms.** The countdown's 8 `.face` layers are 80-100 Paint records per
   slow morph frame (PM). The 1 Hz whole-view Layouts in the hero window (11-43 ms) are **not** the countdown (0
   InvalidateLayout in 113-183 spring calls) but the #people avatar carousel rotator (JS 11330-11356: two `{#if}` swaps
   of 4-5 imgs 220 ms apart every ~1.02 s; 47/47 render-update-paid; D3, PH §7). Why a 104×32 clipped box lays out the
   whole view is unexplained (ST-4).
4. **rAF is the wrong instrument for a third of the open questions** (blur, backdrop, threaded animations):
   render-bound work needs Instruments (T10), which nobody has verified yet (X2).
5. **Our numbers depend on uncontrolled state:** the Mac's display (Chrome baseline 63-78 fps display-on vs 92-94
   DarkWake, no overlap over 27 holds, ddc3450), phone heat as a
   covariate, cold per-origin caches, and on a threshold that WebKit's non-vsync rAF timestamps make unstable
   (">50" vs k≥7 disagree on the goal) (X5, X6).
6. **Our counts don't follow what the user feels;** a motion-weighted interval (MWFI) does, on 3/3 verdicts (X7).
7. **Next: 7 desk items now, 14 phone items (~5 h of phone, no user), one ~10 min finger batch, 3 tool add-ons.**
   Ranked in §3; protocol amendments in §4.
8. **On hold:** the fixed-size morph diagnostic, ghr85a, R7, R8's nav half, h4, any new morph fix before the
   countdown probe and P-016.

## 1. Cross-case misunderstandings (patterns common to the cases)

| # | pattern | cases | what it cost | rule from now on |
|---|---|---|---|---|
| X1 | **WebKit-only invalidation amplifiers, hidden by Chrome.** A change Blink handles locally makes WebKit rebuild style for the whole document or lay out the whole view: (a) window wheel/touch listener add/remove → full style rebuild + event-region repaint of every layer (NM, R); (b) an opacity crossing 1 or filter/transform crossing `none` → `miscDataChangeRequiresLayout` (PH, F-049); (c) a resized composited layer repaints fully (F-036); (d) `linear()`/`steps()` easings drop time-based animations to the main thread (F-048); (e) candidate, D5: a `mask-image` none→value presence change (nav earn button, with two `mix-blend-mode: screen` animations starting at once) | y≈1960, y≈1250, y≈700 pair, hero v2 +11 ms, morph panel | src/noinert/e1 builds; h1's ≤34 target unreachable by construction; v2 shipped a loss | a phone-only class (v2 §2.3) needs a **phone Timeline segment card** (Script / Style / Layout / Composite / Other) before an F build; a Chrome counter going to 0 proves the mechanism ran, not that the phone saves |
| X2 | **Wrong instrument.** rAF gaps can't see render-server work (L13) | gb, ghb, ghbn, R7/R8, hero v2's threaded gain | three ablations measured flat and read as "no cost" | render-bound claims wait for T10 (Instruments); "flat on rAF" is recorded as *unmeasured*, never *zero* |
| X3 | **Co-located event taken for the cause.** The scripted driver makes y, time-since-event and m move together | y≈1960 (img burst via a capped logger, then `inert`); y≈1250 (scene gate; actually time-locked to the reveal end, 27/27); the morph hump (m; actually time since tween start) | ~5 phone blocks on wrong arms | every attribution card names its **axis** (y, time since a named event, m) and includes one **decoupling run** (hold at another y, change hold length, shift a threshold) before LOCATED → NAMED |
| X4 | **Serial-sum cost models from code reading.** Terms were summed; the phone frame is often a max of parallel bounds, and the dominant term was missing (layout) | h1 (style 5-29 ms assumed, 2-3 measured; 2 × 13-14 ms layout missing); gh (tail −10 ms, start transient untouched); ghb "additive" | predictions off by 2-3x | the v2 §4 closure check is done on **phone segments** for phone-only classes: the model must reproduce Layout and Composite separately, within a tick |
| X5 | **Wrong or drifting baseline.** Finger baseline used for driver predictions (L1); a one-tick, one-block gap read as an effect; Chrome's 75 → 93 fps "new floor" credited to the gated tools, likely the Mac display going off (V-U1); heat between blocks | gh, ghb, all-wave1 floor, canary drift L8 | wrong win/loss calls; a floor nobody can reproduce | host display state is recorded and held constant; phone heat recorded per run; a cross-block or cross-hold number never compares without its shared control (v2 §5.3) |
| X6 | **Threshold artifacts.** WebKit's rAF timestamp is the rendering-update start, not a vsync; 75 % of phone gaps ≥34 ms are off the 8.33 ms grid (V-U2) | goal ">50": aw1-10c 3/3/2 vs k≥7 1/2/1; #people frame 51-53 ms in 6/15 runs | goal status and the hero v2 verdict flip on the definition | phone verdicts report both (dt > 50 and k≥7) and flag frames within 4 ms of a threshold; disagreement = "threshold-sensitive" (CLAUDE.md already says so for the legacy columns) |
| X7 | **Counts are not the felt metric.** Frame-weighted p50s and >N counts under-weight the frames that carry motion; the worst frames are where nothing tracked moves | morph (75 % of motion in the first 300 ms); aw1-10c (−40 % frames >20 ms, user: "the same"); y≈1960 (largest gap, user never named the middle) | wins the user can't feel | MWFI, time-since-start profiles for M runs, and a visibility tag on long frames are reported next to counts; U3 (pacing page) picks the primary |
| X9 | **The probe changes what it measures.** The logger's rAF `scrollY` read forces layout (R-U1); the R3 logger capped at 12 events per frame (L3); a Web Inspector stays attached to every phone run (V-U10); polling every 1.5 s inside the timed window | y≈1960 (cap), hero cards 3-4 (logger-paid layouts), every phone Timeline | a wrong cause at y≈1960; possibly inflated layouts in the hero cards | every probe gets an on/off A/A before its numbers are read as absolute (v2 §5.5 already requires it for Timeline; extended to the logger's y source and the inspector) |
| X8 | **Driver coverage.** Drivers never reach finger speed (p90 3.5k px/s), the collapsed toolbar (815, 57 % of finger frames), slow drags (<300 px/s), scroll-up, a start without a 2 s rest, or the touch path | hero slow-drag (finger MWFI 2x scripted), morph start after rest, F1/F2 touch latency, toolbar resize | jank that no A/B sees; a fix that could add touch latency | each fix README lists driver coverage; touch/toolbar/slow-drag classes need G or F (v2 §5.4), plus the coverage block in §3 |

Notes that keep the cases apart:
- The y≈50 first-scroll frame is **removable work** (v2 removes it, 4/4 runs), not a rest transient (PH §6), unlike
  the morph's start transient.
- The morph's start transient is **inside WebContent** (`gap − RenderingFrame` −5..+8 ms, PM): the slow frames carry
  80-100 Paint records of the 8 countdown `.face` layers inside the panel, not render-server time. H2 is refuted;
  a1's case for rank 1 weakens accordingly.
- **y≈1250 has two rival explanations.** PH: the future card's reveal transitions *end* at flip +745/+945 ms
  (presence flips, F-049). R-U5: tile-coverage detach/re-attach between the driver's ~300 ms flicks repaints both
  deck panels (402×857), periodically over y 1249-1749. Both agree it is not y-locked (F-045's scene gate is
  retracted as the cause). P3 decides: `re-dur` moves the frame only under PH; ST-2d "fling-hold" removes it only
  under R; both = two mechanisms. Existing data leans PH for the +940 frame (185-237 ms after the scroll held, no
  flick after it, 15/15 runs); the +700/+900 frames repaint the deck panels, which fits both.
- **Whole-view layout is the common unit.** Every phone layout in the Timelines is 12-17 ms (p50 12-14, none
  between 1 and 10 ms; R-U2, PH M5), and 17 size containers can force an interleaved layout inside style (R-U3).
  The cost term to model is "which writes dirty layout", not "how many elements restyle".

## 2. Merged unknowns (deduped; ✓ = already in v2 §10 or in flight)

| key | unknown | sources | status |
|---|---|---|---|
| K1 | Mac display / power state drives Chrome numbers | V-U1 | new, high |
| K2 | phone rAF timestamp ≠ vsync; thresholds unstable | V-U2, X-U7 (60 vs 120 Hz) | new, high |
| K3 | driver coverage: speed, toolbar, slow drag, direction, second pass, start-after-load | V-U3, V-U11, X-U5, X-U8, X-U13 | new, high |
| K4 | phone heat as a covariate (battery temp, charging, 30 fps thermal halving) | V-U4 | partly ✓ (sentinel) |
| K5 | cold vs warm per origin (port) and after screen lock | V-U5, PM (cold stores, 1.5x early Composite) | new, medium-high |
| K6 | network inside the timed window (Resource Timing, http/1.1 twin) | V-U6 | new, medium, zero device |
| K7 | countdown wall-clock state; hard expiry 2026-11-02 05:00Z | V-U7 | new, certain |
| K8 | Chrome field trials / persistent profile | V-U8 | new, medium |
| K9 | phone settings never recorded (Reduce Motion, Feature Flags, charging limit) | V-U9 | new, cheap |
| K10 | attached inspector cost | V-U10 | new, low |
| K11 | docH changes mid-run on baseline | V-U12, X-U12 | new, low |
| K12 | WebKit presence-flip layouts page-wide (every transition ending at 1/none) | PH, F-049 | new, high |
| K13 | window listener add/remove anywhere else on the page | NM, R | new, high |
| K14 | countdown faces: what triggers early repaints (morph); the 1 Hz hero layouts are the avatar rotator, not the countdown (D3) | PM, PH | new, high |
| K34 | why the rotator's 104×32 `.is-carousel` swap lays out the whole view (no layout boundary on the phone's WebKit? flex item? preferred-width marking above it? content-visibility lifted while it runs) | PH §7 | new, high: the same question as K26 |
| K15 | render-server cost of blur/backdrop/threaded animations | PM case 2-3, X-U7, F-048 | ✓ v2 §10 (T10) |
| K16 | does the morph feel "laggy" even when smooth (interaction model) | X-U1 | new, very high |
| K17 | ease-out peak velocity on the setup frame | X-U2, PM (start transient) | new, high |
| K18 | which perceptual metric the eye follows | X-U3, X-U10 | new, high |
| K19 | are rAF gaps under compositor scroll visible; tile checkerboarding | X-U4, X-U11, R | new, high |
| K20 | non-passive touch arm → scroll freeze (F1/F2 risk) | X-U6, NM | new, high |
| K21 | the target number for "SOOOOO ULTRA SMOOTH" | X-U9 | new, cheap |
| K22 | event regions as a general term: listener add/remove elsewhere (Hotjar's survey path adds document touch/wheel listeners), per-layer region walk (`pan-x pan-y` rules) | R-U9, R-U12 | new, medium |
| K25 | **the phone logger forces layout** (rAF `scrollY` read) | R-U1 | new, **top**: changes how every Timeline reads |
| K26 | every layout is whole-view (12-17 ms); container queries interleave layout inside style (17 size containers) | R-U2, R-U3, PH M5 | new, high |
| K27 | the residual 62 ms frame at y≈2678 on `na` (IO callback → Style 28 with Layout 22.8 nested → Composite 18) | R-U4 | new, F1/F2's next frame |
| K28 | decode and memory: 577 MB decoded at full size, panel 62 MB for ~80 px columns, 9 JPEGs named .png; tiling shrinks under memory pressure | R-U6 | new, medium |
| K29 | post-idle Composite (backing-store volatility at 1 s / 200 ms) | R-U7, PM (H1), K5 | merged with K5 |
| K30 | async decode on the panel's first visible paint | R-U8 | new, low |
| K31 | fonts (4 swap faces, none preloaded, one TTF) | R-U10 | new, low, zero device |
| K32 | GC never captured (instruments `['Timeline']` only) | R-U11 | new, low |
| K33 | render-server offscreen passes (blend ×5, mask ×3, backdrop ×12) | R-U12 | = K15 (T10) |
| K23 | v2's +11 ms at y≈700: which segment (H2a/b/c) | PH card 1 | new |
| K24 | P3 lost v2's y≈50 gain | PH §3 h4 | new, blocks h4 |

Dedupe notes: R-U9a (listener add/remove) = K13 and NM's NAMED card; R-U5 vs PH card 4 = one question (y≈1250),
two rival models, one block (P3); R-U7 = PM's H1 = V-U5 (cold stores), probed together (P2 + P8); R-U12 = K15
(T10); R-U10 fonts folds into T1a+.

## 3. Ranked actions (value per cost; the lead executes in this order)

Columns: phone = minutes of iPhone lease (plus 10 min cooling between blocks), user = the user's minutes. "Existing"
names an agent already running; "new" means a spawn.

### 3.1 Desk now (no device, run in parallel)

| # | action | owner (agent) | probe / command | phone | user | deps | decides |
|---|---|---|---|---|---|---|---|
| D1 | **Done (ddc3450):** 27 Chrome holds back-tagged; display state alone separates the floors. Remaining: tag the canaries and A/As the same way | arch-unknowns (existing) | `pmset -g log \| grep -E "Display is turned\|DarkWake\|FullWake"` joined on `results.json` timestamps | 0 | 0 | — | whether the floor is ~76 or ~93 and whether L8 is the host |
| D2 | Page-wide scan for the two WebKit amplifiers: (a) transitions/animations ending at or starting from `opacity:1`/`filter:none`/`transform:none` on scroll-revealed elements; (b) every runtime `add/removeEventListener('wheel'\|'touch*')` on window/document | new `bundle-mapper` (haiku), name `map-webkit-amplifiers` | `fix.mjs grep` over CSS + JS; output table: selector/line, trigger y, duration, end value | 0 | 0 | — | how many more y≈1250/y≈1960-class frames exist; feeds ST-2's page-wide fix |
| D2r | **D2 result (map-webkit-amplifiers, checked by arch-lead):** (a) end-value amplifiers on scroll reveals: future card `#people` (CSS 2405-2413: opacity→1 at **0.7 s**, transform translateY(48px)→none at **0.9 s**, filter blur(14px)→none at **1.6 s**; the mapper missed the transform and placed it at y≈2300, it is the y≈1250 card); commission `.referral-fee.shown` (opacity + blur(8px)→none, 0.48 s), `.fee-message.shown` (opacity 0.28 s), `.fee-avatar.is-large.shown` (opacity + scale→1, 0.42 s), `.fee-visual-beat` (`.scrolling-out` toggles opacity 1↔0 / transform none↔translateY(-112%), 0.9 s). (b) window wheel/touch listeners: only the morph arm (JS 13060-13072, wheel + touchmove non-passive, touchstart passive, armed by IO rootMargin 200 %); Svelte's delegated touch events are registered once, not toggled. No `linear(` in the baseline (F-048's curve is the aw1 overlay's). **Consequence for P3:** PH's +745/+945 frames are the opacity and transform ends; PH's model also predicts a third frame at ≈ +1645 ms (filter→none). **Not checkable on existing data** (PH §7): every phone build carries aw1-10e's `filter 0.9s linear(...)` override (overlay CSS 2427), so there the filter ends with the transform at +945 (and, per F-048, runs on the main thread); +1550..1750 shows max dt 17-18 ms in 27/27 runs, a null control only. The test needs baseline A (filter 1.6 s) in P3. The commission set is the next y≈1250-class candidate (D5/P9 add it). | arch-lead | done | 0 | 0 | — | — |
| D3 | Name the countdown's per-tick layout dirtier from the existing Timeline captures | de-pm-hero (existing) | **done (0ab3362, postmortem-hero §7):** not the countdown; the #people avatar carousel rotator (`mM`, JS 11330-11356) dirties every 1 Hz whole-view layout (47/47 ≥10 ms, render-update-paid, logger neither dirties nor pays them); other dirtiers: hero accent word swap (L3699-3701), an IO lazy mount (old t+2286 44.6 ms frame), nav and commission rAFs. Whole-view: LOCATED, mechanism UNEXPLAINED → ST-4 (P14) | 0 | 0 | — | h3's target is the rotator, not the countdown |
| D4 | Morph clock-shift replay: t0 one frame later on the M logs | de-unknowns-ux (existing) | extend `unknowns-ux-metric.mjs`: predicted JUMP p95, MWFI | 0 | 0 | — | **Done (a014655, `morph-clock-replay.md`, 96 tweens):** the shift alone does not earn a block (max edge leap 94 → 77 px, MWFI −0.15 tick, +39 ms to first motion); on top of P-017's countdown fix it is super-additive on the leap (94 → 44/35 px) → P10 re-specified |
| D5 | Flip-pair presence-flip diff (PH card 3, step 1) | fix-hero-exit (existing) or the D2 mapper | Chrome **short lane**, counts only, 430×775: per element, computed opacity/filter/transform in the flip frame and the next | 0 | 0 | **done (4da0833)** | no presence flip in either frame (Q/P/K). Frame 1 = one class write (header loses `is-hero-pill`): earn-button `mask-image` none→var + 2 animations, max-width/padding/gap transitions, fixed auto-width nav-actions box moves 0.28 px (root layout). Frame +1 (Q, P only): card subtree visibility hidden→visible. Candidates: (a) mask presence, (b) nav auto width, (c) visibility (unlikely: K keeps the layout without it) |
| D6 | Post the cross-case rule X1 to the findings board (one pitfall: "Chrome mechanism PASS ≠ WebKit cost parity; list of known amplifiers") | arch-lead | `finding.mjs post --kind pitfall` | 0 | 0 | — | — |
| D7 | Countdown expiry: note it in the snapshot README / baseline notes | lead | one line: results before/after 2026-11-02 05:00Z do not compare | 0 | 0 | — | — |

### 3.2 Tool add-ons (fold into running toolsmiths; no new incident unless they refuse scope)

| # | action | owner | content | deps |
|---|---|---|---|---|
| T1a+ | per-run context fields in `iphone.mjs run --probe std` | ts-iphone-run (existing) | `Date.now()` at start; env fingerprint (prefers-reduced-motion, color-scheme, DPR, screen, innerHeight, hardwareConcurrency, `getAnimations().length`, UA); `scrollHeight` per frame; Resource Timing dump after the bottom phase; `idevicediagnostics ioregentry AppleSmartBattery` (Temperature, IsCharging) at run start/end; passive `touchstart` timestamps when a finger/G driver runs | T1a core first; any item that grows T1a past a day moves to T1b |
| T8+ | host record + hold discipline | T8 toolsmith (new spawn when T8 starts) | `display` (on/off), `fullWake`, `powerSource`, Chrome version, hash of `ChromeFeatureState`; `caffeinate -d -u` inside `lock.mjs run` holds (or record "off") | D1 (to confirm the field matters); MC: call out |
| T3+ | perceptual metrics + M-run profile | ts-analysis follow-up (after U3) | MWFI, HTR, STUT/s, RUNmax, JUMP in `runMetrics`/`METRICS`; M runs: time-since-start profile fwd/rev + |Δm|-weighted dt; Timeline heavy-paint share (frames with ≥80 Paint records); oracle `unknowns-ux-metric.mjs` | P5 (pacing page) picks the primary; the M profile can go now |
| T10 | Instruments route (v2 §8.1) | lead → one-time pairing with the user, then a toolsmith | `xcrun xctrace record --template 'Animation Hitches'` attaches to Safari; signposts decode | user 3-5 min once; then P7 |

### 3.3 Phone blocks, no user (iphone-runner; each ≤9 counted runs, warm-up, sentinel)

| # | action | owner | builds / driver | phone | deps | decides |
|---|---|---|---|---|---|---|
| P0 | **DONE (P-023): neutral, keep the rAF y source; the Heap pass is not evidence (0 GC events delivered; `Heap.enable` is likely needed).** **Logger y-source A/A** (R-U1), first item of the next slot; plus one pass with the `Heap` instrument (R-U11) | iphone-runner (+ ts-iphone-run's `--y-source`) | aw1-10e, y source raf vs scroll vs none, 3 passes each, Timeline; count frames with ≥2 layouts > 0.5 ms | ~10 | T1a flag, or a hand-patched logger copy | whether every Timeline-based card (hero 3-4, morph) needs a re-read |
| P1 | **Morph countdown probe** (PM action 1; P-017) | fix-nav-morph (builds) + iphone-runner | gh vs gh-cdwc (faces `will-change:auto`) + gh-cdhid (hidden, upper bound) as 3rd arm, M driver, one Timeline cycle per arm | ~25 | none (builds are one CSS line) | whether the morph's start transient is the countdown faces; if yes, it outranks a1 |
| P2 | **P-016b** hold 900 vs 2000 on gh (P-016 was invalid: hold 250 never rests at m=1) | iphone-runner | M driver, pair then C V V C if ambiguous | ~10-25 | same slot as P1 | cold-store share of the transient (H1) |
| P3 | **ST-2 reveal ends vs deck coverage** (PH card 4 vs R-U5; ticket via mgmt-ops-4) | fix-hero-exit builds `re-dur`, `re-keep`; iphone-runner | aw1-10e control, hero-A W driver, C V V C alternating arms + 1 Timeline run per arm; plus **ST-2d fling-hold** on Q (one constant fling y 1100-1800, 1.5 s hold, resume flick; 1 Timeline + 2 counted); plus **baseline A** (filter 1.6 s, no aw1 override) 1 Timeline + 2 counted: PH predicts a third frame at ≈ +1645 ms. Scoring: exclude frames within 16 ms of a rotator InvalidateLayout (D3: the 1 Hz rotator can coincide with +745/+945) | ~45 | P0 (to read the Timelines right); D2 adds sibling reveals | which model owns y≈1250, then NAMED; the page-wide fix rule. F-048: aw1-10e's filter transition uses `linear(...)` (0.9 s), so `re-keep` also tries a cubic-bezier |
| P4 | **F1/F2 y≈1960 blocks** (ticketed, P-013..015) | iphone-runner | A: C F1 F1 C C F1 F1 C; B: same with F2 (+1 no-pause F2) | ~50 | after P1/P2 (the morph session) | F-stage verdict for y≈1960; touch latency still needs F5 |
| P5 | **ST-1 flip pair segments** | iphone-runner (fix-hero-exit owns the question) | Q P K Q K P, W driver y 0-1000, Timeline | ~20 | D5 helps read it | which segment carries v2's +11 and h1's −11; picks hero-B arms (saves up to 2 blocks) |
| P6 | **Driver-coverage block** (V-U3 + X-U5 + V-U11 + R-U9a) | iphone-runner | baseline vs aw1-10e: slow W (40 px / 300 ms ≈ 130 px/s over y 400-900), fast W (`scrollBy 750` / 300 ms ≈ 2.5k px/s), down-up-down pass (the up pass shows the listener *remove* frame near y≈1830), start at load+1 s; ABBA | ~25 | T1a+ (battery temp) helpful | whether scripted gates can stand in for the finger; the slow-drag hero cost |
| P7 | **Instruments hitch block** g vs ghb vs ghbn + one control joined with rAF via `performance.mark` (V-U2) + WebKit computed `backdrop-filter` during the morph (ghbn NAVCHECK) | iphone-runner + T10 toolsmith | M driver, 3-arm Latin square | ~5 + 25 | T10 | render-bound class: blur/backdrop cost; rAF dt vs presented interval |
| P8 | **Cold vs warm per origin + post-idle volatility** (V-U5, R-U7) | iphone-runner | control after 10 min locked vs 10 min awake; first run on a fresh port vs warm port; idle 0.5 / 1.5 / 3 s before the pass, 3 runs each | ~25 | — | validates the per-arm warm-up rule (§4 A3), adopted now anyway |
| P9 | **Flip-pair decoupling block** (PH card 3, step 2 + D5) | fix-hero-exit builds; iphone-runner | 3 arms on aw1-10e, Latin square + 1 Timeline run each: control; `nomask` (earn-button mask-image fixed at its final value from load, animations unchanged); `navw` (nav-actions box given an explicit width, so the class write can't move it); the split-trigger build (nav flip at 0.72, reveal at 0.80) as a 4th Timeline-only run | ~25 | D5 done; P0 | which of (a) mask presence / (b) auto width owns frame 1's whole-view layout; positive arm + negative sibling = NAMED for the y≈700 pair |
| P11 | **Layout containment probes** (R-U2 + R-U3), one Timeline pass | iphone-runner; the question goes to a new topic `layout-containment` | depth-8 InvalidateLayout stacks before each Layout on aw1-10e; then an overlay with `container-type: normal` and `cqw` → equal calc, on `na`, over the arm frame and y 2500-2800 | ~10 | P0 | whether one containment change takes 8-25 ms off every 41-53 ms frame (the biggest page-wide lever left) |
| P14 | **ST-4 rotator whole-view layout** (PH §7), Timeline only, shares P11's slot and topic `layout-containment` | de-pm-hero specifies, fix-hero-exit or the new topic builds; iphone-runner | aw1-10e control vs A1 rotator off vs A2 `.is-carousel{contain:strict}` vs A3 imgs kept mounted (toggle only); hero window, 1 Timeline run each | ~15 | P0 | A2 moving the Layout root quad from the view to the carousel = a forced boundary works (then the h3 fix is one CSS line, and K26/K34 get a page-wide rule); A3 alone = the cost is the mount, not the box |
| P12 | Residual y≈2678 frame on `na` (R-U4) | fix-nav-morph | `R3_Y0=2600 R3_Y1=2760 node tldump.mjs <F1 label> 50` with depth-8 stacks; shares P11's pass | ~0-5 | P11 | F1/F2's next frame (mount `b` at idle?) |
| P13 | Memory and decode (R-U6) | iphone-runner; a new topic `image-sizing` only if pressure shows | `Memory.startTracking` + memoryPressure events over one S pass (and the finger pass in F4) | ~10 | — | whether 577 MB decoded triggers coverage shrink; sized panel images (62 → ~5 MB) |
| P10 | Morph clock-shift M block (re-specified by D4) | fix-nav-morph | **gh-cdwc vs gh-cdwc + clock shift (A1)**, n=3+3; gate = per-tween max edge leap, predicted −50..−60 px, null ±15 px (MWFI moves < 1 tick, report only); also record time to first motion (+39 ms predicted cost; de-morph signs off the added latency, lead 2026-10-01) | ~15 | **P1 positive**; if P1 fails, parked behind R5(b) | X-U2: whether the clock shift is worth its first-motion delay once the countdown transient is gone |

Total ≈ 5 h of phone plus cooling. Order: P0 (it changes how the rest read), then P1-P3 (cheap builds, the
biggest remaining frames), P4, P11 + P14 + P12 (one layout-containment slot), P5/P9, then the rest.

### 3.4 Chrome slots

| # | action | owner | lane | cost | deps |
|---|---|---|---|---|---|
| C1 | Canary A/A, display on/off interleaved | arch-unknowns specifies; a fix owner or integrator runs | normal slot | 10 min; **the lead asks the user** before `pmset displaysleepnow` on their Mac | D1 |
| C2 | `--enable-benchmarking` A/A (field trials off) | integrator, at the next wave boundary | normal slot | 10 min | T8+ |
| C3 | h2 vs http/1.1 hold (V-U6) | integrator | normal | 10 min | low priority |
| C4 | Toolbar resize count, 7 steps 430×775→815 (X-U8) | fix-scroll-engine | short lane | 3 min | — |

### 3.5 The finger batch (one session through the lead, ≈ 8-10 min of the user)

Order is cheapest-to-set-up first; every item after a passing control (v2 §5.2):

| # | item | builds | user min | what it decides |
|---|---|---|---|---|
| F1 | settings check (Accessibility > Motion, Battery / charging limit, Safari Extensions, Feature Flags changed?) | — | 2 | K9: one wrong toggle voids every phone number |
| F2 | push past the end twice, blind: `mw-stub` (flat box, same tween) vs gh, "laggy or not?" | fix-nav-morph builds `mw-stub` (perception only, never lands) | 1 | K16: render fixes vs interaction-model change for the morph |
| F3 | slow scroll y 1700-2300, blind aw1-10e vs F1 `mw10e-arm-load`, "anything hitch?" | existing | 1 | K19 (is y≈1960 visible) and F1's felt value |
| F4 | 3 flicks starting y 2000-4400, aw1-10e vs F1, recorder with touchstart timestamps and `Memory.startTracking` (R-U6's finger pass) | existing | 2-3 | K20: does arming at load add touch latency (F1's landing gate); K28 memory pressure under a real fling |
| F5 | pacing page: rank 5 frame patterns at 600 and 1600 px/s | de-unknowns-ux builds (no Fastwork code) | 2 | K18: the primary metric; T3+ |
| F6 | 30 s on the Apple product page arch-apple studied, "is this smooth?" + one S run | lead approves the external navigation | 1 | K21: the target number |
| F7 (opt.) | two 240 fps clips, hero v2 vs aw1-10e | second camera | 3 | X-U7 threaded 120 Hz scroll |

### 3.6 Holds (named so nobody spends a slot on them)
Fixed-size morph diagnostic; ghr85a (R5a); R7; R8 nav half (not pixel-exact: the countdown/waitlist block sits
under the nav); a1 (until P1/P2 place the transient; P1 positive makes a targeted countdown fix first); h4 (until
K24 is explained); V-U10 inspector-detached A/A and V-U12 docH (low value, folded into T1a+ fields).

## 4. Protocol v2 amendments (applied to `measurement-protocol-v2.md` on the lead's OK)

- **A1 (§2.3, X1/X4):** a phone-only class needs a phone Timeline segment card before an F build; the closure check
  reproduces Layout and Composite separately.
- **A2 (§2.3, X3):** every attribution card names its axis and carries one decoupling run.
- **A3 (§5.2, K5):** one uncounted warm-up run **per arm's port**, not only the control's; note screen-lock state.
- **A4 (§5.2, K4):** battery temperature and charging state per run; heat trend reported per block.
- **A5 (§3.2, K2):** phone verdicts in both forms (dt > 50 / k≥7 and dt > 34 / k≥5), frames within 4 ms of a
  threshold flagged; the tick model is exact on Chrome only.
- **A6 (§3.3, X7):** M runs: time-since-start profile (fwd/rev) + |Δm|-weighted dt replace the m-bin profile;
  Timeline heavy-paint share as the mechanism column (PM proposal). MWFI reported next to counts (candidate until F5).
- **A7 (§6.3, K1):** Chrome holds record display state and keep it constant; canary drift is checked against it
  before a tools bisect.
- **A9 (§5.5, X9/K25):** the logger's y source is chosen by the P0 A/A; until then phone absolute counts and Timeline
  segment cards carry a "logger-layout" caveat (A/B deltas between arms with the same logger stay valid). Any new
  probe gets an on/off A/A before its numbers are read as absolute. **Lifted:** lifted 2026-10-01 on P-023 (P0 logger y-source A/A neutral) for loggers that read scrollY once per rAF; not covered: scrollY reads in timer tasks (winrun's per-step timer, ~3.3 Hz) and the pre-T1a std probe's reads in MO/cv crossing callbacks (never used on the phone).
- **A8 (§7):** review checklist: "does the fix change a transition end value, a layer presence or a window
  listener?" (X1); "does the claim's driver cover the class?" (X8).

## 5. Answers to the lead's two asks

- **Unknown fields:** §2 (34 keys, deduped from six notes). The highest value per cost: K25 (our logger forces
  layout, 10 phone min), K1 (display state, desk), K12/K13 (WebKit amplifiers page-wide, desk), K14/K34 (countdown faces and the
  avatar rotator's whole-view layout, one phone block each), K26 (whole-view layout and container queries, one pass), K16 (morph interaction model, one user
  minute).
- **Post-mortem, what we misunderstood:** §1 X1-X9. The single biggest: treating Chrome's mechanism PASS as phone
  parity while WebKit pays whole-view layout or style for presence flips and listener changes.

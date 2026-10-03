# Breakpoints: do the fixes hold at every width? (T-034)

de-breakpoints, 2026-10-03. Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated
with Fastwork). Question from the user (console thread T-034): were the optimizations tested at other breakpoints?
They should work at any breakpoint.

**Short answer.** Before this study, nearly every check ran at one width: the calibrated phone viewport, 430x932.
The landed stack st6-rb2 has now been compared against the baseline at 11 widths (375 to 1920), touch and no touch,
in phone landscape (932x430) and with reduced motion (430 and 1440).
- **Errors.** No exceptions, console errors or HTTP errors in any arm at any width (0/0/0 everywhere).
- **Pixels.** The page looks the same as the baseline at 13 of 14 configs: every frozen-frame difference is within
  the page's own A/A noise, or is the hero accent word caught at another point of its 3 s timer (checked by
  masking it, and by a probe of its geometry), or is an entrance transition caught at another moment.
- **One real difference.** At 1440 with reduced motion, the tilted hero card photos (and the nav's "EN" label)
  render marginally sharper in st6-rb2, in 3 % of the frame at the top, while the baseline's A/A is 0 %. The layout
  is the same and nothing is missing. Leading hypothesis (OBSERVED, cause UNRESOLVED): a layer raster-scale
  history, §3.2. It is not pixel-identical, so the decision is the lead's (§6).
- **Counts.** st6-rb2's gains hold at every width measured (375-1280, touch and not): about 90 % fewer layouts at
  rest, about 40 % fewer layouts and 55-70 % fewer style recalcs while scrolling. Its known costs also hold: more
  paint events at rest and 15-23 more layers. No width reverses a count (§3.3, 9 of 15 configs; the rest were
  parked).

For the fixes still in flight, the widths each one needs and who covers them are in §2. The gate every fix must
pass before landing is in §5.

Status words follow CLAUDE.md "Platform claims": everything here is OBSERVED in our setup (headless Chrome, CDP
emulation; fw-sim for WebKit) unless marked otherwise.

## 1. The page's breakpoints

Source: the baseline CSS `_app/immutable/assets/2.gBuqKVzi.css` and JS `_app/immutable/nodes/2.DyWL8TcE.js`
(1-based lines of the prettified snapshot).

| kind | values |
|---|---|
| max-width | 400, 461, 480, 600, 640, 720, 860, 960, 1000, 1030, 1100, 1200 |
| min-width / bands | >600, >640, >=861, 861-1000, 641-1000, >=1001, 601-1279, 601-1511 |
| touch combos | `(width<=N), (device-width<=500px), (hover:none) and (pointer:coarse) and (width<=1200px)` for N = 860, 1000, 1030 |
| reduced motion | 30 `prefers-reduced-motion` blocks |
| JS gates | commission `A()` = the 1000 combo; hero `(max-width: 600px)`; pain notes `(max-width: 860px)`; future and platform shrink = the 860 combo; nav/desktop `(min-width: 861px)`; reduced motion |
| sizes that follow a breakpoint | hero title `clamp(40px, 4.5vw, 64px)` (40 px to 888 px wide, 64 px from 1422); countdown font 24 / 28 / 40 px, so the cell c = 31 (<=400) / 36 / 52 px (desktop) |

Three inputs besides the width change which branch runs:
- **Touch.** A tablet (768 or 1024, coarse pointer) takes the phone path of every combo up to 1200 px.
- **Phone landscape.** iOS reports the portrait screen as device-width, so 932x430 is wider than 600 and 860
  but still matches every combo through `device-width<=500px`.
- **Reduced motion.**

## 2. Audit: which fix touches which breakpoint-gated code

Legend:
- **covered**: checked at that width or input in this sweep or by the owner, with the result given;
- **elsewhere**: checked by the owner with their own harness;
- **untested**.

### 2.1 Landed: st6-rb2 (and its parts)

| part | breakpoint-gated code it touches | widths / inputs that change its behaviour | status |
|---|---|---|---|
| commission-forced-layout (`_cq`) | the three `A()` queries parsed once (JS ~3245): <=1000, device-width<=500, coarse<=1200 | 1000/1001 no-touch; 1024 touch (in) vs 1024 no-touch (out); landscape (in via device-width) | covered: the query matches the CSS (code); pixels at 1024 / 1024t / 932x430 equal the baseline |
| future + platform shrink (`shrinkOffMq`) | the 860 combo (JS ~4066, ~4102) | 860/861; touch to 1200; landscape | covered: 768t, 900, 1024t, 1024, 932x430 |
| desktop / reduced-motion queries cached (`desktopMq`, `reducedMotionMq`) | `(min-width: 861px)`, reduced motion | 860/861; reduce | covered: 600/601, 900, rm430, rm1440; resize across 860 in §3.4 |
| layout-animations `HEflip` (accent width at once + neighbour slide) | none by query, but the slide is `dw/128 em` and the title font follows `clamp(40px, 4.5vw, 64px)` | every width: font 40 / 46 / 64 px | covered: the accent probe (§3.2) shows the neighbours moving exactly as far as in the baseline at 430, 600, 601, 768t, 1024 and 1440, with no overshoot. The em basis is width-proof. Under reduced motion the cycle never runs (baseline JS 3681). |
| `PMsweepGate` (platform title sweeps paused off-screen) | the doc-sweep titles exist in a 860-combo variant (CSS ~5672-5960) and a >=861 variant | 860/861, touch | covered: an IntersectionObserver on the titles, not a query; pixels equal at all widths |
| scene-scope paused list | lists every media variant of the scene animations; the only media-gated animations it does not list are the platform doc-sweeps (both variants), which `PMsweepGate` pauses | none | covered (code + pixels) |
| avatar carousel (st5), nav-hit-test, morph/countdown parts | top-level CSS, no media blocks; nav-hit-test replaces a hit test, not a query | none by query | covered: pixels and F3 coverage at every width (§3.3) |

### 2.2 In flight

| fix | breakpoint-gated code / dependence | needs | status (2026-10-03) |
|---|---|---|---|
| cd-strip | strip offsets in units of c (31 / 36 / 52); c comes from Svelte's `bind:offsetHeight` on the spacer, so a resize updates it live | 375, 430, 1440, a live resize across 400 and 600 | elsewhere (owner's frozen frames vs st6-rb2, A/A in the same run, G13b-G17). 375@3: 259 frames identical. 412@2.625: 1 frame differs, and the A/A differs on the same frame. After a live resize from 430: 768@2 and 1536@1.25 0 of 21 frames; 1440@1 within A/A (a 1-px card-edge line, which the A/A shows in 13 of 21). c follows the resize: 31 / 36 / 52. Fresh loads at 768, 1440 and 1536 do not compare: the A/A differs in every frame there (the clock lands a sub-pixel apart between loads; OBSERVED, cause unknown). Not covered: WebKit at a fractional DPR |
| cd-roll-ca | roll keyframes in px from c; an effect on c rebuilds a running roll at the same startTime | as cd-strip, plus mid-roll at 375 and 1440 | untested beyond 430 and the Sim; queued in the owner's next Chrome hold (`run.sh pix` with c375, c1440 + countdown crops); waits for PR-008 rev 2 |
| countdown-faces | no width or input gate in its logic | the cd-strip widths, because c changes the faces' geometry | covered indirectly through cd-strip's faces arm (375, 1440) |
| hero-exit-threaded | WebKit-only (`'GestureEvent' in window` + view-timeline support); separate CSS for `(width>600px)` and `(width<=600px)` inside `prefers-reduced-motion: no-preference`; `heRest` picks translate by `(max-width: 600px)` | the >600 branch on WebKit (iPad, phone landscape), reduced motion | <=600 elsewhere (owner: phone and Sim at 430). >600 logic and Blink pixels covered here with a GestureEvent stub (§3.5): V = C at 932x430, 1440 and reduced motion. WebKit >600 at 980 CSS px (§3.6): logic identical; low-amplitude orbit-card pixel differences beyond the A/A, now with the owner. True phone landscape (932x430 with the dynamic toolbar) **UNRESOLVED** until a rotate tool exists; a real tablet layout **UNRESOLVED** (iPad not run) |
| F3 mw10e-arm-scope-d (nav-morph) | touch-only arm scope (touch listeners), no width query | touch at phone width; touch on a tablet (768t, 1024t) | phone 430 elsewhere; tablet touch untested (a G-driver run at 768/1024 on WebKit would cover it) |
| platform-idle | G1: the secure-network glint is a clip path in layout px (fixed 94x3.2 dash, no media), so DPR, not width, is the variable. G3: the title sweep overrides rules that are `display:inline` at 28 px in the 860 combo and other sizes at >=861 | G1: DPR 1 / 2 / 3. G3: 375 (narrowest), 861, 1024t, 1440, a title that wraps, reduced motion | elsewhere (owner's served A/B vs st6-rb2, frozen frames, probe8): 375t DPR 3, 390, 430 DPR 2 and 3, 861, 1000, 1024t DPR 2, 1440 DPR 1 and 2, plus reduced motion at all of them. The sweep titles stay on one line at every width. Reduced motion is identical (the reduced-motion block keeps the original rule, so the ::after band stays hidden). The only other diffs are 1-15 LSB in two avatar photos at 1440 DPR 1, from image decode, outside the change. Not pixel-identical by design: the sweep differs by up to 23 LSB (gradient phase) and the glint by up to 64 LSB on its anti-aliased edge rows; both go to the user as a proposal. Not covered: 932x430 landscape, 1920 |
| rest-script | arms the pain-notes interval only while `(max-width: 860px)` does not match; the CSS hides the notes with the same query (`@media (width<=860px)`, CSS 2305/2344; the touch combo does not hide them) | resize across 860 both ways; start narrow then widen | elsewhere (owner's v2, overlay a5286ebc4cb6, Chrome logpoints, counts only). 768>1024>768>1024: both arms tick twice per 1024 segment with a gap of at least 3000 ms, and do no work at 768 (st6-rb2 fires one tick that returns early; the fix fires none). After a resume the fix ticks on the original 3 s grid and never runs two intervals. 600>1440: same in both. 1440>600>1440>600>1440: the middle 1440 segment differs in this run (st6-rb2 2 ticks, fix 0). The logged cause is the pain-notes IntersectionObserver reporting only "out" after the reflow, and st6-rb2 itself took the same path in v1, so either outcome shows up run to run in both builds (OBSERVED, likely scroll anchoring after the reflow; not the gate). The fix's ResizeObserver on html fires 0 times at idle and once per resize step. The visual resize check (§3.4) was parked |

## 3. Sweep: baseline vs st6-rb2 (Chrome, functional)

### 3.1 Method

- **Arms.** B = the baseline snapshot; S = st6-rb2 from an immutable copy (`out/breakpoints/snap/st6-rb2`, JS
  sha256 7bf7c4657d21, CSS f523598b2a24, the same bytes as the landed build); B2 = the baseline again, a second
  load (the A/A noise floor). Both servers are `serve.mjs --https --vendors=local --no-cache`, with no latency.
  The check is functional, so no CPU throttle and no timing.
- **Configs** (`configs.mjs`). Viewport and DPR follow common devices. Touch configs get mobile emulation plus
  touch. The landscape config sets screen 430x932 so that device-width stays 430, as on iOS.
- **Stops.** top; hero = 0.5 vh into the hero track (mid-exit); people (0.5 vh into #people); pain; commission;
  end. The page is walked there in instant steps of at most 300 px every 100 ms. html has `scroll-behavior: smooth`,
  so every scripted scroll passes `behavior: 'instant'`.
- **Frozen frame.** Wait 2 s, then pause every running animation at currentTime 1000 ms, take a screenshot, and
  play them again. The countdown is masked (clock phase). Avatar-carousel pixels are counted apart.
- **Diff.** A pixel differs when any channel moves by more than 8 levels; "big" means more than 48. A stop is
  flagged when both A/B and S~B2 exceed A/A by more than 0.05 % of the frame. Flags are then explained from the
  heat image, crops and probes.
- **Run.** Each hold is `lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner
  de-breakpoints -- sh research/breakpoints/run.sh pix`. A run resumes where the last hold stopped (`BUDGET`
  260 s), and its JSON is checked against the snapshot. Output goes to `out/breakpoints/` (gitignored).

**Pitfall that cost a round:** with a 1.2 s settle, two stops (430 y1330 and 900 y1350) were flagged. The cause was
the future-card entrance transition (`filter: blur(14px) -> none`, 1.6 s) and the nav earn sheen/unmask
(0.52 s + 0.98 s). Both were still running in B, while S's entrance had started about 170 ms earlier. The soft
freeze then reset only one arm's transition (probe-anims.mjs). With a 2 s settle both flags went away. Freeze
only after the longest entrance has ended, or hard-freeze with `finish()` for finite animations (finding posted
2026-10-03).

### 3.2 Frozen-frame pixels

Each cell gives A/B % of the frame, then the A/A % (B vs B2); "big" is the count of pixels off by more than 48
levels. Errors per arm are exceptions / console errors / HTTP errors.

Configs: c = Chrome viewport width (t = touch, l = landscape); rm = reduced motion. 430, 375, 768t, 1024t and 932x430l at DPR 3 or 2, the rest at DPR 1-2 (`configs.mjs`).

| config | top | hero | people | pain | commission | end | errors B/S/B2 (exc/console/http) |
|---|---|---|---|---|---|---|---|
| c375 | 0 / A/A 0.065 (670 big) | 0 / A/A 1.167 (29346 big) | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0.026 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c430 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0.001 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c600 | 1.211 (202 big) / A/A 0.59 (21 big) | 0 / A/A 0 | 0.048 / A/A 0 | 0.048 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c601 | 0.089 (73 big) / A/A 0.089 (73 big) | 0.429 / A/A 0.428 | 0.032 (6 big) / A/A 0 | 0.033 (6 big) / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c768t | 0.091 (2801 big) / A/A 0.001 **FLAG** | 0.31 / A/A 0.32 | 0 / A/A 0 | 0 / A/A 0 | 0.045 (1159 big) / A/A 0.045 (1159 big) | 0.012 (93 big) / A/A 0.013 (156 big) | 0/0/0, 0/0/0, 0/0/0 |
| c900 | 0 / A/A 0.002 (12 big) | 0 / A/A 0 | 0 / A/A 0 | 0.012 / A/A 0 | 0 / A/A 0 | 0.011 (27 big) / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c1024t | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c1024 | 0.172 (973 big) / A/A 0.129 (980 big) | 0.394 / A/A 0.09 **FLAG** | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c1280 | 0.005 (1 big) / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| c1440 | 0 (1 big) / A/A 0.002 | 0 / A/A 0 | 0 / A/A 0 | 0.009 / A/A 0 | 0 / A/A 0 | 0.022 / A/A 0.022 | 0/0/0, 0/0/0, 0/0/0 |
| c1920 | 0 (2 big) / A/A 0.05 (163 big) | 0 / A/A 0.442 | 0.109 (352 big) / A/A 0.009 **FLAG** | 0 / A/A 0 | 0.049 (303 big) / A/A 0.053 (360 big) | 0.014 / A/A 0.014 | 0/0/0, 0/0/0, 0/0/0 |
| c932l | 0.201 (6733 big) / A/A 0.048 (712 big) **FLAG** | 0 / A/A 0.677 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| rm430 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |
| rm1440 | 3.063 (965 big) / A/A 0 **FLAG** | 1.328 (296 big) / A/A 0 **FLAG** | 0.015 (70 big) / A/A 0 | 0.015 (67 big) / A/A 0 | 0 / A/A 0 | 0 / A/A 0 | 0/0/0, 0/0/0, 0/0/0 |

How the flags were resolved:
- **Reduced motion at 1440, top (3.06 %) and hero (1.33 %), A/A 0 %: the one real difference.** S differs from both
  B and B2 by the same amount (S~B2 3.06 %), so it is not noise. The heat images (`out/breakpoints/pix/png/rm1440/`)
  put every differing pixel inside the tilted hero card photos and the nav's "EN" label. Card positions, sizes and
  tilt are the same: only the fine detail of the photos differs, and S's frames are sharper (PNG 696 kB vs 659 kB).
  What the element probe (`probe-el.mjs`, the Nguyen Van Nam card, rm1440 and c1440) found:
  - The cards have the same computed style in both arms: transform `rotate(-5.2deg)`, `scale: 1`,
    `will-change: transform, translate, scale, opacity`, the hero scene `active`, and S's own `data-fw-wc="1"`.
  - So neither scene-scope nor the will-change windows removed a layer at rest.
  - The same check without reduced motion (c1440) shows A/B 0 %.
  Leading hypothesis, OBSERVED in our setup and UNRESOLVED:
  - Chrome keeps the raster scale of a `will-change: transform` layer from when the layer was made. With reduced
    motion the cards have no entrance animation, which in the motion case re-rasterizes them at the end.
  - st6-rb2 toggles will-change during boot (the scene gate, `data-fw-wc`), so it rebuilds these layers once
    layout has settled. The baseline keeps its first raster.
  - That would also explain the sharper 1920 thumbnail below.
  - Decisive check (not run; the lead stopped new sweeps): in both arms, after load, toggle `will-change` off and
    on for the cards (one forced re-raster each), then compare. If the arms then match, the hypothesis holds, and
    st6-rb2 looks like a fresh raster rather than a changed render.
  What it means for a user: on desktop with "reduce motion" on, the hero photos come out marginally crisper with
  st6-rb2. Nothing moves, and nothing is missing. It is still not pixel-identical, so it goes to the lead (§6).
- **768t top (0.091 %, A/A 0.001 %) and 1024 hero (0.394 %, A/A 0.09 %).** Both are the hero accent word. Its
  word and draw-in follow a 3 s timer, so a frozen frame catches it at a random point; here S caught a different
  glyph from B, and B and B2 happened to agree. Neighbours and geometry agree:
  - The accent probe (`probe-accent.mjs`, every rAF for 10 s at the top) shows the accent widths at every width
    the same in both arms: 70 / 50 / 60 / 83.75 px at 40 px font; 80.63 / 57.59 / 69.11 / 96.47 at 1024
    (46.08 px); 112 / 80 / 96 / 134 at 1440.
  - Per word change, the neighbours move the same distance in both arms: at 430, 10 / 5 / 11.88 px; at 1024,
    11.52 / 5.77 / 13.69; at 1440, 16 / 8 / 19.
  - They never leave the straight path between their rest positions: at most 0.01 px in S, 0 in B.
  - The phase difference between arms is random: S's first change came between 911 ms earlier and 60 ms later than
    B's.
  - The masked re-run (`MASK='.hero-title .script-accent'`): both flags drop to 0 (768t top 0 %, A/A 0 %; 1024 hero 0 %, A/A 0 %; `out/breakpoints/pixm`). Confirmed: accent phase only.
- **932x430 landscape top (0.201 %, A/A 0.048 %).** Same word: the box is the accent (x 427-469, y 199-245), and the arms were caught in different accent phases (B idle, S `stroke-out`, B2 `stroke-in`). Not re-run masked (the lead stopped new sweeps).
- **1920 people (0.109 %, A/A 0.009 %).** One service thumbnail ("Original Soundtrack", the third service card).
  In S it is drawn sharper than in B and B2: same image, same place, text edges differ by up to 136 levels. That
  looks like a different raster scale of the same layer, not a layout change. The masked re-run of 1920 did not reproduce it (people 0.009 %, at most 11 levels, on one row). The element probe at that point (`probe-el.mjs`, after 2 s) caught S's future card still in its entrance transition (computed `opacity: 0.999`, `filter: blur(0px)`); B's card was already at rest. So this is the 1.6 s entrance caught at a different moment (load-time phase), not a steady difference.

### 3.3 Render and layout counts per width (census)

Counts only, no timing; one load per arm; `sweep.mjs census`. "rest" = 4 s at the top after load, "scroll" = a rAF scroll to the end at vh/40 per frame, "end" = 1.5 s at rest at the end. L / R = LayoutCount / RecalcStyleCount deltas (Performance.getMetrics), P = trace Paint events, lay = LayerTree size. F3 cover = 8x12 hit-test grid at the end: cells on #platform / on the nav. Finished for 9 of 15 configs (the lead stopped further holds); the rest are listed in §4.

| config/arm | rest L / R / P / lay | scroll L / R / P / max lay (frames) | end L / R / P | F3 cover at end: #platform / nav (of 96), O | err |
|---|---|---|---|---|---|
| c375/B | 142 / 245 / 487 / 105 | 172 / 1128 / 1395 / 142 (254) | 0 / 119 / 382 | 88 / 8, true | 0/0/0 |
| c375/S | 9 / 204 / 678 / 120 | 109 / 329 / 1271 / 143 (254) | 1 / 90 / 192 | 88 / 8, true | 0/0/0 |
| c375/B2 | 113 / 240 / 461 / 109 | 197 / 1068 / 1470 / 138 (254) | 1 / 90 / 208 | 88 / 8, true | 0/0/0 |
| c430/B | 115 / 241 / 463 / 107 | 195 / 993 / 1385 / 149 (233) | 1 / 90 / 229 | 88 / 8, true | 0/0/0 |
| c430/S | 10 / 188 / 595 / 122 | 108 / 318 / 1457 / 141 (233) | 1 / 90 / 182 | 88 / 8, true | 0/0/0 |
| c430/B2 | 105 / 240 / 441 / 107 | 197 / 999 / 1391 / 149 (233) | 3 / 91 / 256 | 88 / 8, true | 0/0/0 |
| c600/B | 115 / 240 / 465 / 110 | 201 / 1046 / 1550 / 154 (250) | 1 / 90 / 211 | 88 / 8, true | 0/0/0 |
| c600/S | 10 / 192 / 585 / 125 | 110 / 327 / 1220 / 146 (250) | 1 / 90 / 182 | 88 / 8, true | 0/0/0 |
| c600/B2 | 109 / 240 / 451 / 110 | 204 / 1045 / 1533 / 154 (250) | 1 / 90 / 211 | 88 / 8, true | 0/0/0 |
| c601/B | 113 / 240 / 471 / 121 | 202 / 1039 / 1128 / 165 (250) | 1 / 90 / 211 | 88 / 8, true | 0/0/0 |
| c601/S | 9 / 190 / 609 / 136 | 109 / 326 / 1015 / 156 (250) | 1 / 90 / 182 | 88 / 8, true | 0/0/0 |
| c601/B2 | 103 / 242 / 346 / 121 | 200 / 1054 / 1128 / 165 (250) | 1 / 90 / 211 | 88 / 8, true | 0/0/0 |
| c768t/B | 133 / 241 / 505 / 113 | 173 / 884 / 1012 / 167 (206) | 23 / 90 / 224 | 88 / 8, true | 0/0/0 |
| c768t/S | 8 / 209 / 771 / 136 | 110 / 281 / 1046 / 155 (206) | 23 / 90 / 208 | 88 / 8, true | 0/0/0 |
| c768t/B2 | 114 / 240 / 467 / 117 | 192 / 884 / 1178 / 163 (206) | 23 / 92 / 233 | 88 / 8, true | 0/0/0 |
| c900/B | 111 / 240 / 460 / 108 | 264 / 1284 / 1107 / 120 (318) | 23 / 113 / 225 | 88 / 8, true | 0/0/0 |
| c900/S | 10 / 240 / 622 / 125 | 181 / 506 / 963 / 142 (318) | 23 / 112 / 212 | 88 / 8, true | 0/0/0 |
| c900/B2 | 113 / 241 / 462 / 108 | 263 / 1277 / 1114 / 120 (318) | 23 / 113 / 225 | 88 / 8, true | 0/0/0 |
| c1024t/B | 113 / 241 / 462 / 110 | 235 / 1301 / 1428 / 128 (331) | 1 / 90 / 207 | 88 / 8, true | 0/0/0 |
| c1024t/S | 9 / 185 / 579 / 130 | 120 / 413 / 1418 / 147 (331) | 1 / 90 / 182 | 88 / 8, true | 0/0/0 |
| c1024t/B2 | 113 / 241 / 462 / 110 | 235 / 1291 / 1419 / 128 (331) | 1 / 90 / 231 | 88 / 8, true | 0/0/0 |
| c1024/B | 115 / 240 / 464 / 108 | 292 / 1482 / 1507 / 117 (386) | 1 / 90 / 213 | 88 / 8, true | 0/0/0 |
| c1024/S | 10 / 240 / 608 / 123 | 196 / 655 / 1361 / 141 (386) | 1 / 90 / 184 | 88 / 8, true | 0/0/0 |
| c1024/B2 | 147 / 240 / 457 / 103 | 247 / 1523 / 1496 / 119 (386) | 1 / 90 / 213 | 88 / 8, true | 0/0/0 |

What it shows, at every width measured (375 to 1280, touch and not):
- st6-rb2 keeps its 430 profile. Layouts at rest drop from about 105-147 to 8-10. During the scroll, layouts drop by about 40 % and style recalcs by 55-70 %.
- Its costs are the same at every width too: paint events at rest are higher (+120 to +270, e.g. 595 vs about 450 at 430; 771 vs about 486 at 768t), and there are 15-23 more layers at rest.
- Coverage at the end is identical (88 / 8 of 96; 90 / 6 at 1280, in B), and there are no errors.
- No width reverses a count. The higher paint count at rest is a property of st6-rb2, not of a width. The census cannot say which part causes it; it is reported to the lead as an open question.

### 3.4 Live resize across the JS-gated breakpoints

Not run: parked by the lead (usage window). Planned: `run.sh resize` (st6-rb2, steps D:commission, D:people, R:commission, R:people across 1440 > 1000 > 860 > 600 > 430 > 1440) and the rest-script variant (`RSTOPS=D:pain,D:people,R:pain`). The rest-script owner's own resize checks are summarized in §2.2.

### 3.5 hero-exit-threaded's wide branch in Blink (GestureEvent stub)

- Arms: C = st6-rb2 (its control, JS 7bf7c4657d21 / CSS f523598b2a24); V = hero-exit-threaded's final build (JS
  301ec740291b, CSS 55ba45f138c9, commit e36423f); C2 = C again. All three are immutable copies.
- Every arm gets `window.GestureEvent = function () {}` before any page script. View timelines are native in
  Chrome, so V enters its CSS mode.
- Frozen frames at the 6 stops, as in §3.1.

| config | .he-css in V | V vs C at the 6 stops | A/A max | errors |
|---|---|---|---|---|
| ge932l (932x430 DPR 3, touch, screen 430x932) | every stop | 0 differing px at every stop | 0.68 % (hero, accent phase) | 0/0/0 |
| ge1440 (DPR 1) | every stop | 0 %; 3 px at the top, 1 px at commission | 0.022 % | 0/0/0 |
| germ1440 (reduced motion) | every stop (the gate does not test reduce) | 0 differing px at every stop | 0.067 % | 0/0/0 |

This covers the branch's logic and Blink's rendering only. The scroll is scripted (no touch), so it goes through
V's `heSc` path. The owner's later build d48d224adcd4 changes only the frame on which heHold drops the inline
`--exit-opacity` (one frame after the animations report `ready`). Frozen frames come after a 2 s settle, so these
results stand for it too, except the switch frame itself (owner's note).

### 3.6 hero-exit-threaded's wide branch in WebKit (fw-sim, viewport width 980)

`fw-sim` cannot be rotated with our tools: rotating needs WDA's orientation call, which `tools/lib/wda.mjs`
refuses on purpose (an allowlist). The lead's decision instead:
- every arm is served with the same test-only overlay `fixes/bp-vp980` (index.html viewport meta `width=980`,
  sha256 f33aff732654). It is test scaffolding, never a shipped change, and is not committed;
- on the portrait device, Safari then lays the page out at 980 CSS px. `(width>600px)` matches, device-width
  stays 430 (so the 860 combo still matches, as in phone landscape), and GestureEvent exists.

Run: one functional shared session (`--shared --weight simulator`), 2026-10-03 09:55-09:58Z. Arms in order: C =
st6-rb2, V = hero-exit-threaded d48d224adcd4 (CSS 55ba45f138c9; the owner's build after review), C2 = C again.
Per arm:
- load, then 8 s;
- hard freeze (timers cleared, finite document-timeline animations finished, infinite ones paused);
- at y = 0 / 150 / 300 / 500 / 800 / 1400: an instant scroll, 1.6 s, a `simctl io screenshot` (1290x2796).

Diffs use the same thresholds as §3.1. Output: `out/breakpoints/simvp/`.

**Logic: the same in both arms.** Every arm reports innerWidth 980, `(width>600px)` true, the 860 combo true and
GestureEvent present. V has `.he-css` and its bob at every y; C has neither. The hero copy's computed
opacity/transform is identical in C and V at every y (e.g. y150 0.923009 / -0.77 px, y800 0.589382 / -4.11 px).

| y | V vs C % | A/A (C2 vs C) % | V vs C2 % |
|---|---|---|---|
| 0 | 0.088 | 0.298 | 0.23 |
| 150 | 0.653 | 0.267 | 0.749 |
| 300 | 0.452 | 0.216 | 0.502 |
| 500 | 0.396 | 0.164 | 0.388 |
| 800 | 0.200 | 0.044 | 0.191 |
| 1400 | 0 | 0 | 0 |

**Pixels: V differs beyond the A/A at the four mid-exit stops, on the orbit cards only.** A 6x16 grid places the
differences:
- The center column (title, copy, CTAs) is identical apart from the countdown digits.
- V's extra differences sit on the tilted orbit cards in the left and right columns, mostly at 19-50 levels per
  cell, with one cell at 121 (y800).
- To the eye, C and V look the same.
- Reading, OBSERVED with the cause unknown: a sub-pixel position or resampling difference of the scattering cards.
  V drives them from a CSS view-timeline, C from script.
- Sent to fix-hero-exit-threaded right away, as the lead asked. The decisive check is the cards' computed
  translate, scale and filter in both arms at y150 and y800.

**Coverage, in the lead's words:** the WebKit >600 branch is covered by (b) at 980 CSS px; true phone landscape
(932x430 with the dynamic toolbar) stays UNRESOLVED until the rotate tooling exists. A real tablet layout is
not covered (UNRESOLVED, iPad not run). fw-sim stayed in portrait throughout: only the page's viewport meta
changed, and the device was never rotated. After the session, sim.mjs shut fw-sim down.

## 4. What this does not cover

- **WebKit at widths other than 430 and 980**, and phone landscape with the dynamic toolbar: UNRESOLVED
  (no rotate tool). Tablets: UNRESOLVED (no iPad run; sim.mjs drives only fw-sim).
- **Finger input** at tablet widths (touch arm scope F3 at 768t/1024t).
- **Timing.** This is a functional check: counts and pixels, no frame timing (memory: defer timing).
- **Pixels inside the countdown and the accent word.** Both are masked or phase-random here. cd-strip, cd-roll-ca
  and countdown-faces check their own crops; the accent's geometry is checked by the accent probe.
- **Parked by the lead (usage window), not run:**
  - census for c1280 (S, B2), c1440, c1920, c932l, rm430 and rm1440;
  - the live-resize holds (§3.4);
  - the masked landscape re-check;
  - the decisive raster check for the rm1440 difference.

## 6. Open items for the lead

1. **st6-rb2, reduced motion at 1440.** The hero photos render sharper (3 % of the frame; A/A 0 %). Decide whether
   this is acceptable or needs the decisive check from §3.2 first. Evidence: `out/breakpoints/pix/png/rm1440/`
   (heat images) and `out/breakpoints/hold14.log` (element probe) in this worktree.
2. **st6-rb2 paints more at rest at every width** (+120 to +270 paint events in 4 s; +15-23 layers). This is not
   width-specific, and it may already be a known cost of the stack. A single attribution probe at 430 would name
   the part.
3. **hero-exit-threaded at 980 px on WebKit** (§3.6). Low-amplitude differences on the orbit cards beyond the
   A/A; sent to the owner. It is their call before landing.
4. **Gate (§5).** Adopt the gate in `fixes/README.md` Definition of done, and spawn a toolsmith for `--widths`
   (§5.1) if wanted.

## 5. Proposed breakpoint gate (every fix, before landing)

This makes `fixes/README.md` Definition of done item 5 ("behaviour kept on desktop, phones and reduced motion")
concrete:

1. **Audit.** In the fix README, list every media query, `matchMedia`, width-dependent size (clamp, vw, em on a
   breakpoint-dependent font) and input gate (touch, GestureEvent, hover/pointer) that the patch touches or
   depends on. Name the widths and inputs where its behaviour changes.
2. **Functional matrix (Chrome, shared lane, about 15-20 min in 4-5 holds).** Fix vs its control, plus an A/A
   arm, at:
   - 375t, 430t, 600, 601, 768t, 900, 1024t, 1024, 1280, 1440, 1920;
   - 932x430 landscape (screen 430x932);
   - reduced motion at 430t and 1440.
   At each: zero new console errors, exceptions or 404s; frozen-frame pixels at the 6 stops within the A/A floor
   (settle >= 2 s; countdown masked; the accent masked or checked by `probe-accent`); any flag explained by a probe.
3. **Crossings.** If the patch touches a JS-gated breakpoint (600, 860/861, 1000) or caches a size: a live resize
   across it, both ways, ending in the original width, with the same frozen frames as a fresh load (resize mode).
4. **Engine- or input-gated paths.** Exercise the path where the gate opens: a stub (GestureEvent) in Chrome for
   logic, and the Simulator (functional, viewport-meta scaffold when width matters) for WebKit rendering. Name
   what stays UNRESOLVED.
5. **Counts.** One census per width class (phone, tablet touch, desktop) so that a fix that is free at 430 is
   not expensive elsewhere. Report any count that rises against the control.
6. **Report.** In the fix README: a table of config x stop (as §3.2) and the list of what stayed untested.

### 5.1 `--widths` for `fix.mjs check` / `bench mech` (spec for a toolsmith; not built)

- `--widths phone|tablet|desktop|all|<list>`, where a list item is `WxH[@DPR][t][l][r]`:
  - t = touch + mobile emulation;
  - l = landscape (screen = HxW);
  - r = reduced motion.
  `all` expands to the 14 configs above.
- Per config:
  - arms fix, control and control-again (A/A);
  - the 6 named stops, plus `--stops` for topic stops;
  - instant-step walk, settle >= 2 s (`--settle`), then a freeze;
  - masks for `.countdown` plus `--mask <selectors>`;
  - per-channel threshold 8 and a big threshold 48;
  - flag = min(A/B, fix vs A/A arm) > A/A + 0.05 %.
- Per config, also: console errors, exceptions, HTTP >= 400 by URL, and the matchMedia truth table, so a
  report shows which branch ran.
- `--resize <seq>`: a live resize sequence (e.g. 1440,1000,860,600,430,1440), with frozen frames at each step.
- `--census`: Performance.getMetrics LayoutCount and RecalcStyleCount, trace Paint/PrePaint/Layerize/Commit,
  and LayerTree size, for 4 s at rest, then a rAF scroll to the end, then 1.5 s at rest at the end.
- `--stub GestureEvent`: install `window.GestureEvent` before page scripts in every arm.
- Output: results.json `widths[]` with per-config verdicts. The verdict is WORSE when a flag has no explanation
  (a human closes it with a note), or when there are new errors.
- Cost: about 20-25 s per (config, arm) for pixels and about 25 s for a census. Run it under the shared lane at
  weight 1, split into holds of at most 300 s, resuming like `sweep.mjs`.
- `research/breakpoints/sweep.mjs` is the reference implementation (`pix`, `pixr`, `census` and `resize`
  modes; `configs.mjs`; `summarize.mjs`).

## Files

- `configs.mjs`: viewport configs. `sweep.mjs`: pix / pixr / census / resize. `run.sh`: one hold (two servers +
  sweep). `summarize.mjs`: tables from the JSON.
- `probe-anims.mjs` (animations running at a stop), `probe-accent.mjs` (accent word geometry over time),
  `probe-el.mjs` (what is drawn at a diff point).
- `sim-vp.mjs` + `simvp.sh`: the fw-sim width-980 check.
- Output (gitignored): `out/breakpoints/` (JSON, PNG, heat images, logs).

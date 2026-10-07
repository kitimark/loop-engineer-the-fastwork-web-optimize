# Fix: join-fade (user T-242)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (pixel and state gates; no timing, none needed: three CSS rules on one button's fade)
**Stage:** R -> F (look fix of the original's own rendering; the user decides through a proposal)
**Device class / gate:** look; Chrome seek harness (430x775, 430x815, 768, 1280) + iOS Simulator (Safari 26.5)
**Driver(s) behind the claims:** Chrome seek harness (settable clock, one wheel event, nav transitions held at a
chosen time), Simulator seek harness and a Simulator run with the nav transitions slowed 50x (running, not paused)
**Topic:** join-fade (thread T-242)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`: one block appended (three rules, 40 lines with comments)

## The report

At the end of the page, while the "Join waitlist" button fades out as the menu starts to open, the user saw on the
iPhone (Safari) (1) the button's rounded edge "not transparent" and (2) the gap between the language button and the
Join button lost. The user says it is in the original site too; it is (v0 below).

## Causes

Line numbers: v0 = baseline `site-pretty/_app/immutable/assets/2.gBuqKVzi.css`; g0.0c = `fixes/platform-corners-g00b`
(the current best build, JS 5c39f7a96e41 / CSS c65da97ba01f).

1. **Corners: the blur is cut by the button's box, not by its pill.** The button blurs with the menu
   (`filter: blur(calc(var(--earn-out) * 10px))`, v0 11486, g0.0c 11868; `--earn-out` = 1 from m 0.2, ~50 ms into the
   680 ms tween) while it is still fully opaque for 0.12 s, then fades over 0.32 s. It also carries the original's
   unmask sweep as a `mask-image` (v0 11530-11540, g0.0c 11990-12000), whose end state covers the whole box.
   - Safari (Simulator, iOS 26.5): the blurred pill grows a dark **rectangle** of blur off its left end, about 45 css px
     wide, over the language button, cut straight at the box's top and bottom (see `shots`). Same in v0 and g0.0c.
     Variants injected in the same load: `filter: none` -> 0 px; `clip-path: inset(0 round 999px)` on the button ->
     0 px; `mask-image: none` -> the blur spreads left and right, still cut at top and bottom. So the blur's spill is
     what shows, and its square edges come from the clipping WebKit applies to it. Which WebKit path cuts it to a
     rectangle (and only on the left with the mask) is **UNRESOLVED**: source reading (RenderLayerBacking.cpp 2041-2045
     mask layer = graphics layer geometry; RenderLayer.cpp 5729-5735 composited filters exclude the outsets, WebKit
     4d3c1638849c) does not explain the asymmetry; decisive local check: a layer-tree dump (graphics layer vs mask
     layer bounds) at that stop. **OBSERVED** in our setup.
   - It shows in the held stops while the blur is full and the opacity still 1 (the 0.12 s delay); see the table.
   - Chrome: the blur stays inside the button's rounded box, but the corners outside the curve still pick up a sliver
     (37-59 device px per stop at 430, max 46 levels; 10-18 px at 768; 0 at 1280).
2. **Gap: it closes with the morph, the button leaves on a timer.** The actions' gap is
   `(1 - clamp(0, m / 0.2, 1)) * 8px` (4px at <= 640; v0 11440 / 11584-11586, g0.0c 11926-11945) with
   `transition: none` while `.is-morphing` (v0 11451-11453, g0.0c 11833-11835). So it is 0 at m 0.2, ~50 ms into the
   tween, while the button is still fully visible for 0.12 s and fading until 0.44 s: the language button touches the
   fading pill. Its own rule has `transition: gap 0.68s` (v0 11444), the button's width timer, and the hero-pill code
   (PR-021 rev 3 comment, g0.0c 11874-11884) samples the original's gap on that same timer, so the original meant
   the gap to leave with the button; `.is-morphing`'s `transition: none` (meant for the morph) cuts it at the end.
   v14 differs: there the language switch slides over the fading button (gap -110 px at 430).
3. **Safari only: the pill's padding snaps.** The pill's side padding shrinks with
   `transition: padding-inline 0.68s` (v0 11492 on the button, g0.0c 11940 on the earn box). In the Simulator no
   padding transition exists (`getAnimations()` lists max-width and opacity only), so at m 0.2 the pill drops from
   110 to 78 px at once and the language switch jumps ~32 px; Chrome runs padding-left/padding-right transitions.
   Source reading (WebKit 4d3c1638849c, `Source/WebCore/style/Styleable.cpp`): `compileTransitionPropertiesInStyle`
   (567-570) expands the logical shorthand `padding-inline` to the logical longhands padding-inline-start/end, and
   `transitionMatchesProperty` (529-535) compares physically resolved longhands against them, so no transition
   starts. **OBSERVED** in the Simulator, explained by the source; the local check (physical longhands do run, part 3
   below) is in the table. Bug-tracker status UNRESOLVED (not searched).

## What changed

`patch.diff` (standalone, baseline-relative: the block appended to the baseline CSS; on v0 parts 1 and 2 apply,
part 3 targets g0.0's earn box) and `../join-fade-g00c/patch.diff` (g0.0c + the block, baseline-relative; the
proposal's Try-it B; A = `fixes/platform-corners-g00b/patch.diff`, g0.0c):

1. Reduced motion off only: `.is-morphing:not(.is-hero-pill, .is-expanded) .start-selling-top-nav-btn.is-earn
   { clip-path: inset(0 round 999px) }`: the blurred button is cut to its own pill (clip-path applies after the
   filter), only while the menu morphs and the button can still show (from `.is-expanded`, m 0.92, its opacity has
   left the visible range: Simulator 0 dark px at opacity 0.21 / 0.07 without the clip); at rest, open or closed,
   nothing changes. (Rev 1 had it un-gated; rev 2 narrows it so the open menu and reduced motion stay byte-for-byte
   g0.0c's rule set.)
2. Reduced motion off only: the gap flips once, at m 0.2 (`--jf-gone`, 0 below, 1 from m 0.2), and that change is
   timed from the side it lands on: closing waits 0.44 s (the button's opacity is 0 by then) and takes 0.24 s (the
   button's last width); reopening (m back below 0.2) starts at once over 0.4 s (the original's tween tail), so the
   gap is back before the button fades in. m 0 and m >= 0.2 give the original's values.
3. Reduced motion off only: the earn box's padding transition on the physical longhands
   (`padding-left, padding-right 0.68s`, the same curve). Chrome already ran exactly this.

Reduced motion keeps the original (no transitions there; the morph jumps).

## Gates

No timing was measured and none is claimed: the fix is three CSS rules on one button's fade (no script, no new
layer, no per-frame work). Everything ran in the shared lane (probe / simulator weight). No measurement code changed
(`verify.mjs`, `lib/cdp.mjs`, `fix.mjs ab` untouched). Builds: g0.0c = JS 5c39f7a96e41 / CSS c65da97ba01f; rev 2
(the committed fix) = CSS 32a2bf7c17b0 (`../join-fade-g00c/patch.diff`); rev 1 (CSS 866a9b4c6849, the same rules
with the clip un-gated: also under reduced motion and while `.is-expanded`) ran the earlier Chrome gates, marked
"rev 1" below. Rev 2 only narrows where the clip applies; at every fade stop below the CSS state is the same in both.

**Simulator (iOS 26.5, iPhone 15 Pro Max, 430x775 at 3x), held stops** (stop `t1-ct`: wheel at clock t1 ms, nav
transitions held at ct ms; reference = the same stop and build with the Join hidden from load, diff > 12):

| stop | Join opacity | gap g0.0c -> fix (px) | pill width g0.0c -> fix | dark px over EN g0.0c -> fix | outside the box |
|---|---|---|---|---|---|
| closed-rest | 1 | 4 -> 4 | 110.4 -> 110.4 | 0 -> 0 | 0 -> 0 |
| join-24-40 | 1 | 1.95 -> 4 | 94.0 -> 110.2 | 1364 (max 46) -> 0 | 672 -> 20 |
| join-80-0 | 1 | 0 -> 4 | 78.4 -> 110.4 | 1645 (max 32) -> 0 | 0 -> 0 |
| join-80-200 | 0.68 | 0 -> 4 | 78.4 -> 86.8 | 0 -> 0 | 0 -> 0 |
| join-400-280 (is-expanded) | 0.21 | 0 -> 4 | 49.9 -> 49.9 | 0 -> 0 | 0 -> 0 |
| join-400-340 (is-expanded) | 0.07 | 0 -> 4 | 31.7 -> 31.7 | 0 -> 0 | 0 -> 0 |
| closed | 1 | 4 -> 4 | 110.4 -> 110.4 | 0 -> 0 | 0 -> 0 |

v0 (original) at the same stops: 1403 (max 52) / 1497 (max 36) px over EN at join-24-40 / join-80-0, 3879 / 5708 px
outside the box; gap 1.95 / 0. "langSame" (EN button unmoved vs its reference) holds in every row. The pill widths
show part 3: g0.0c snaps to 78.4 px at m 0.2, the fix keeps 110.4 and shrinks with max-width (Chrome's widths).
Slowed running fade (transitions at playbackRate 0.02, not paused; crops only, its counts are not reliable):
`out/jf/pr/{g00c,fix}-sim-slow{0,200}.png` show the same picture.

**Chrome held stops** (`corners off` = device px outside the pill's curve inside its box, diff > 12 vs the same
stop with the Join hidden; rev 1, see the rev 2 confirm below):

| size | stop | gap g0.0c -> fix | corners off g0.0c -> fix |
|---|---|---|---|
| 430x775 | join-24-40 / 80-0 / 80-120 / 80-200 / 80-300 | 1.95, 0, 0, 0, 0 -> 4 at all | 41, 59, 55, 37, 0 (max 65) -> 0 |
| 430x815 | same | 1.95, 0, 0, 0, 0 -> 4 | 41, 58, -, 39, 0 -> 0 |
| 768x1024 | same | 3.91, 0, -, 0, 0 -> 8 | 10, 18, -, 10, 0 -> 0 |
| 1280x800 | same | 3.91, 0, -, 0, 0 -> 8 | 0 -> 0 (DPR 1) |
| 430x775 | closing: close-680-120 / -300 | 1.0 / 3.0 -> 1.77 / 3.83 | 0 -> 0 |

The gap closes after the fade (430: 0.83 px at ct 560 with the pill at 2.8 px, 0 at 680). On the way back it opens
first (the closing rows: the gap is ahead of the original by ~0.8 px at 430, ~1.5 px at 768/1280, while the Join is
still at opacity 0 or 0.85).
Rev 2 confirm (430x775, `out/jf/r6-430.log`, 12 stops from join-24-40 to join-80-560): the fix arm gives exactly
rev 1's numbers (gap 4 at every stop until 0.83 at ct 560, corners off 0, widths and opacities identical). That run's
g0.0c arm did not reach the normal end state (Join opacity 0 and gap 39.2 even at rest; my probe, not shared tooling,
host CPU 84 % busy) and is discarded; g0.0c's numbers above come from the rev 1 runs, whose g0.0c arm is the same build.

**Parity against g0.0c, rev 2** (`fixes/g0-revert/gates/g0px.mjs end`, 50 seek stops of the menu opening, closing
and reversing; device px outside the masks that are known to move, by region; `out/jf/g4-*`):
- 430x775: by design at open-40 (62 k px, max 115), close-320/360 and rev-close-280 (47-63 k px, max 101-115): the
  Join and the gap. Elsewhere max 1-4 levels in the nav (<= 3 k px), or 0.
- The noise class: a control build (g0.0c + one CSS rule that matches nothing, `out/g0/jfnull`) gives the same max-1/2
  nav differences at the same stops (open-120..280, close-80..160, rev-close-40: up to 2.8 k px, and 64 k px max 2),
  so these follow any change to the CSS file, not these rules (raster noise, OBSERVED in our setup, cause unknown).
- Reduced motion, rev 2 (all three rules are inside `prefers-reduced-motion: no-preference`, so none applies): nav
  565 px max 1 at the open stops, the platform card's cycler in the closed states (nav 0); and the intermittent
  frame below at 7 stops. Since none of the rules applies there, these differences are noise by construction.
- One intermittent frame: a whole-nav difference of ~152 k px, max 19-20 (202 px > 8), shows at single stops in
  g0.0c-vs-fix runs (430 open-done) and in the fix's own A/A (rev 1: open-400, open-done), not in g0.0c's A/A or the
  control (one run each). It also shows under reduced motion where no rule of the fix applies, so it is not the fix's
  look; it is counted as noise (host load1 13-30 during these runs), not explained.
- The fix's own A/A, rev 2 (430x775, rev 2 against itself): the same max-1..4 nav differences at the same stops,
  most with the very same counts as in g0.0c-vs-fix (open-160..680 1.4-2.9 k px, e.g. open-200 2881 px in both), and
  the intermittent frame once (open-360, 150 k px, max 11). So the non-design differences in g0.0c-vs-fix are this
  harness's run-to-run noise.
- 768x1024 rev 2: open states ~11 k px max 3-4 (nav), close-400..600 max 30-50 (the gap's timing, by design), the
  platform cycler (noise). 1280x800 (rev 1, end phase): T0 apart from the Join stops. 430x815 rev 1: as 430x775.
- Top phase (rev 1, 430 and 1280, 20 scroll positions): nav 0 everywhere; 1280 y3655 558 px is the known load
  noise of this harness (g0-revert's gates).
- Layers (Chrome LayerTree census at the Join stops, rev 1): 76 / 79 layers in both builds, the same sets and area;
  no new layer.

T2 for the Join region: outside the three fixed defects (corners, gap, Safari padding) the button looks as in
g0.0c: same blur, opacity and width curve (Chrome widths identical at every stop), same rest look (closed-rest and
closed are 0 in both browsers).

Not run: the iPhone (unplugged; no timing asked), a finger test, 430x932.

## Risks, conflicts, follow-ups

- Changes the original's look (bug fixes of the site's own fade), so the user decides (PR-027/PR-035 precedent).
- fix-g0-box (v3-W, Safari-only composited nav fills and a clip-path corner on the header) does not touch the Join,
  the actions gap, the earn box or their transitions (fix-g0-box, 2026-10-07); its header clip-path is an ancestor of
  the Join's clip: re-check this clip on top of v3-W once it lands. fix-g0-box checked that v3-W (043143d2, not
  landed) and this block apply cleanly in both orders, also together with logo-close's delta; fix-logo-close: no
  overlap.
- Findings posted: F-342 (WebKit never transitions `padding-inline`: use the physical longhands), F-343 (Safari:
  blur + mask-image on a rounded button gives a square wash; clip-path on the element fixes it), F-344 (a
  direction-timed transition with a step variable in transition-delay / -duration).
- The held stops are settled states (transitions paused at a chosen time), not real frames; the slowed Simulator run
  checks running transitions.

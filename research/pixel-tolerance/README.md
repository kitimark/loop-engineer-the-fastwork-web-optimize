# Pixel tolerance: how we measure "pixel-identical", what the near-identical cases really differ by, a tolerance rule, and where the GPU techniques could go next

Research only (de-pixel-rule, console thread T-042, 2026-10-03). No tooling or page code was changed. Numbers below
were recomputed from PNGs that earlier runs saved (scratch scripts in the session scratchpad, not committed; they
are described in §2 so they can be re-run). Nothing new was captured, so no Chrome or Simulator time was used.
Status words as in CLAUDE.md: OBSERVED = our data only.

## 1. Measurement inventory

| # | method (file) | what it compares | metric reported | threshold | catches | misses |
|---|---|---|---|---|---|---|
| M1 | `fix.mjs ab`, `verify.mjs` (`diffImages`, tools/verify.mjs ~l.625), `check.mjs` (same code) | 3 whole-page screenshots per viewport (top, middle 45 %, bottom), animations running, 2.5 s settle | `diffPct`: % of pixels whose R+G+B differences SUM to more than 48 | sum > 48 | gross change: a section missing, moved, recoloured. Noise band 0-0.4 % = countdown / orbit / sweep phase | anything small: a sweep shade of 9 per channel (sum 27) never counts; a glint edge counts only on its few strongest pixels; one viewport, three scroll points (FINDINGS P6); running animations, so phase noise hides real differences |
| M2 | platform-idle `probe8.mjs` + `lib.mjs compare` | element crop (title box +4 px, dash box +3 px), animations paused at the same `currentTime`, `svg.setCurrentTime` for SMIL; 9 viewports; reduced motion apart | per frame: differing pixels (any level) and the max per-channel level; histogram available | none (any difference counts) | the fine differences of PR-009 (levels, phases, edge rows) | the crop hides area as a share of the frame; "A/A" was taken from the frames where nothing visible moves (A vs B, glint off the line), not from a true A vs A run; Chrome only (the Simulator ran a sibling script, `simpi.mjs`, same `compare`, crops by a magenta marker calibration, no A/A saved) |
| M3 | de-breakpoints `research/breakpoints/sweep.mjs pix` | whole frame, 14 configs x 6 stops, B (baseline) vs S (st6-rb2) vs B2 (baseline again = A/A), 2 s settle then every animation paused at 1000 ms | A/B % of frame and A/A % of frame; "big" = pixels over 48 | channel diff > 8 (any one channel); flag when both A/B and S~B2 exceed A/A by 0.05 % | structure and scale of a difference over the whole frame; separates A/A noise per stop; heat images show where | levels 1-8 are invisible to it; countdown masked; one load per arm (A/A is one sample) |
| M4 | cd-strip / cd-roll-ca `pixels.mjs`, `simpx.mjs` (Simulator) | clock box, both clocks stepped to the same virtual 60 Hz frame (Date, rAF, timeline virtualised), A/A on the control arm; plus rect positions of every visible cell | differing pixels, max level, bbox; cell offsets in px | none | 1-shade edge differences, sub-pixel path offsets (0.002-0.015 px), blank or late cells | only the crop of the clock; frames are virtual (no real compositor timing), the compositor's one-frame lead UNRESOLVED |
| M5 | hero-exit-threaded / de-breakpoints Simulator frames (`simvp`) | whole Simulator screenshot (1290x2796), C vs V vs C2 (A/A) at 6 scroll stops, hard freeze | % of frame, 6x16 grid cells, levels | as M3 | where on the page, how much beyond A/A | WebKit only at width 980 (test viewport meta); frames of different loads, so animated content (countdown, accents) is in the A/A |

What none of them does: compare a moving frame sequence (a path difference of 0.64 px, as in cd-roll-ca, is only found
by M4's position checks); check the real phone (Simulator stands in; OBSERVED, not CONFIRMED); report one uniform set
of numbers. Different thresholds (sum 48, channel 8, none) are why "the diff %" of two cases cannot be compared from
their READMEs. §2 recomputes them with one definition.

**One definition used below** (call it the "tolerance report"): for a pair X (old) vs Y (new) and an A/A pair X vs X2
on the same frame:
- max level: largest per-channel difference anywhere in the frame (or crop);
- area beyond A/A: pixels with a channel difference over 8 where the A/A pixel differs by 8 or less, as % of the whole
  frame and as CSS px2; for the platform crops (which have no A/A) pixels over 3 levels, the level of the hidden
  moments (OBSERVED proxy);
- edge or fill: a changed pixel is "flat" when its 3x3 neighbourhood in X varies by 2 levels or less (so it sits in a
  fill or gradient, not on an edge);
- static or motion: whether the difference is there at rest or only while something moves.

## 2. Numbers side by side

"Frame" = whole viewport (Chrome phone 430x932 DPR 3 = 3.61 M device px; desktop 1440x900 DPR 2 = 5.18 M; Simulator
1290x2796). CSS px2 = device px / DPR2.

| case | max level | % of frame beyond A/A | area (CSS px2) | edges or fill | static or motion | A/A for the same setup | engines checked |
|---|---|---|---|---|---|---|---|
| **PR-009 glint** (Chrome phone 430, worst of 22 moments) | 56 (d1440: 64) | 0.012 % (d1440 0.003 %); 448 px over 3 levels | 50 (d1440 44) | edges: 98 % of changed px are on the top/bottom edge rows | only while the glint passes (12 of 22 moments); the other 10 are at A/A level (<= 3) | proxy only: 3 levels at the 10 hidden moments; no true A/A | Chrome 9 viewports, Simulator 10 moments |
| **PR-009 sweep** (per title at 2 s, Chrome phone) | 8-9 (d1440: 10 at 2 s, 22-23 at some phases) | 0.055 % per title (1,987 px over 3 levels; d1440 0.057 %, 2,948 px) | 221 (d1440 737) per title | fill: 65 % (d1440 69 %) of the changed px are in flat colour inside the letters; text coverage identical | static colour phase offset the whole time a title is on screen | proxy: 3 | Chrome 9 viewports, Simulator (<= 10) |
| **PR-009 WebKit dash bottom edge** | 17-18 | about 400-500 px in the dash crop at any level; share of frame not stored (crop sizes not recorded) | about 50 (500 px / 9) | edge (the grey dashes' bottom row) | static the whole time the glint is mounted (the dash gets its own layer) | none saved | Simulator only |
| **cd-strip strip-tc** (accepted PR-008) | 1 shade (Chrome 10 % fade) | at most 119 px per frame = 0.003 %; Simulator 26 px = 0.0007 % | under 15 | glyph edges of the digits and one card top edge | only at the end of the hero fade (clock at 10 %) and mid-roll at the 50 % fade | today vs today: 0-8 px spots (2-4 of 21 frames differ in Chrome; 3 of 13 in the Simulator, same spots) | Chrome, Simulator |
| **cd-roll-ca** (user decision T-030 #10, "near-identical") | 4-5 on rolling frames; 1 at rest | 236 px in the first frame = 0.007 % of the Simulator frame (97 px over 1 level) | about 590 css px2 bbox (the two rolling seconds digits, 28x21) | glyph edges of the rolling digits | motion: the roll path follows the original's 60 Hz path within 0.002-0.015 px per frame in the Simulator, 0.08-0.64 px vs the original's own jitter in Chrome; not frame-identical at 120 Hz, 80 Hz or after a late first frame | max 1 (18 of 46 shots) | Chrome, Simulator (counted set pending) |
| **rm1440 sharper photos** (st6-rb2 vs baseline, reduced motion, 1440 DPR 1; de-breakpoints) | 222 (top, includes the EN label), 118 (hero) | top 3.07 %, hero 1.33 % above 8 levels (39,741 / 17,216 px); 20 % / 10.6 % of the frame differs by 1 level or more | top 39,741; hero 17,216 (bbox 1405x422) | none in flat areas: photo texture and edges (0 % flat) | static, the whole time (reduced motion) | 0 %: B vs B2 differ by 8 or less everywhere on the hero; top has the live countdown | Chrome only |
| **hero-exit R5** (WebKit at width 980, tilted orbit cards) | 59-130 | y150 0.53 %, y300 0.33 %, y500 0.31 %, y800 0.18 % (d>8, beyond A/A) | 11,000 / 7,000 / 6,500 / 3,800 | edges and texture (0-3 % flat); 80 % of the changed px are 9-18 levels, 82-385 px over 50 | static while resting at y150-800 | C vs C2 (README): 0.27 / 0.22 / 0.16 / 0.04 % above 8 levels (4.7 / 3.5 / 2.0 / 0.8 % at any level: countdown, accents); the README's V-minus-A/A totals are 0.39 / 0.24 / 0.23 / 0.16 %, my count above is per pixel (pixels over 8 levels that are not also differing in A/A), a different method | Simulator at width 980 only |

Reading:
- PR-009, cd-strip and cd-roll-ca live in a different class from rm1440 and R5. Their changed area is 0.0007-0.06 % of
  the frame (rm1440 1.3-3.1 %, R5 0.2-0.5 %), and their large levels sit on edge pixels only. R5 and rm1440 change
  photos and cards: texture, not rows of edge pixels, over 25-250x more area.
- The PR-009 level numbers (56-64) are one-pixel-thick edge rows: 177-448 pixels in the worst frame. The 23 on desktop
  sweep is a 1-2 % luminance step inside a text fill. Neither is a "visible change" at 1x; both would show in an
  A/B flicker at 4x. That is a judgement for the user, not a measurement.
- Gaps (cost new captures): a true A/A for PR-009 (done for Chrome in §5, rev 2; Simulator still open); the Simulator crop sizes and A/A for PR-009's WebKit numbers; cd-roll-ca's counted set after its rebuild
  on strip-tc; rm1440's decisive check (toggle will-change off and on in both arms, then compare).
- Re-run: scratch scripts `chromecmp.mjs` (PR-009 PNG pairs in `out/platform-idle/p8*/`), `frames.mjs` (full-frame
  pairs from `out/breakpoints/pix/png/rm1440/` and `out/breakpoints/simvp/`), `crops.mjs` (magnified crops). They use
  `out/platform-idle/lib.mjs` (`png`, `compare`, `encodePng`).

## 3. Tolerance rule (proposal; the user chooses)

The standing rule today (memory/illusion-must-be-pixel-identical.md): an illusion fix must be indistinguishable at every
frame; PR-001 and PR-009 are one-off exceptions. In practice the team already needs a middle class: landed or accepted
work is "within A/A" (cd-strip in WebKit), "1 shade" (cd-strip in Chrome), "up to 5 on digit edges" (cd-roll-ca).

Proposed tiers (the numbers are the choices):
- **T0 exact**: 0 differing pixels beyond A/A at every checked frame, every width and engine. Lands without asking.
- **T1 within A/A**: every difference is at or below what the old build shows against itself in the same session
  (true A/A, same setup). Lands without asking.
- **T2 near-identical**: a difference above A/A that meets ALL of: (a) levels: fill or gradient pixels <= F, edge
  pixels <= E; (b) area <= X % of the frame beyond A/A at any frozen moment, and <= Y CSS px2 per element; (c) it is
  anti-aliased edge pixels or a sub-pixel gradient or glyph phase, with no layout, geometry, colour, text, image or
  order change; (d) reduced motion exact; (e) checked in Chrome AND the Simulator (WebKit), phone width plus one
  desktop width, the DPRs the technique depends on; (f) reported with the tolerance report (§1) including a true A/A;
  (g) motion paths within 1 device px of the original at every frame, no new jump.
- **T3 needs the user** (a proposal like PR-009): anything above T2's numbers, anything on photos, text content or
  layout, anything permanent and static in the first screen, anything not checked in WebKit, a difference the A/B
  flicker test shows at 1x.

| option | F / E / X / Y | would T2 admit | trade-off |
|---|---|---|---|
| **A. keep the rule** (no T2; every look-alike is a proposal) | n/a | nothing new; cd-strip and cd-roll-ca and PR-009 each needed or need a user decision | zero risk of an unnoticed look change; the user is asked for every shade, and a 1-shade case costs the same attention as a 64-level case |
| **B. narrow-standard (recommended)** | F = 24, E = 64, X = 0.1 %, Y = 300 | PR-009 (glint 64 edge, sweep 23 fill, 0.06 %, 221-737 px2 per title: the d1440 sweep at 737 px2 is over Y, so wide desktop would need one OK), cd-strip (1), cd-roll-ca (5) | the common 1-5 shade cases and thin edge rows land after a numbers check; rm1440 (118 on photo texture, 1.3 %) and R5 (130, 0.5 %) stay with the user; the user must trust A/A numbers, so the true-A/A requirement (f) is binding |
| **C. wide** | F = 64, E = 128, X = 0.5 %, Y = 2,000 | all of B plus R5 at y300, y500 and y800 (73 / 59 / 121 levels, 0.33 / 0.31 / 0.18 %); not y150 (130 levels, 0.53 %) | more GPU techniques land without a decision (nav and morph effects); a card or photo that looks a little crisper or softer could pass unseen, which is what the rm1440 case already is |

Recommendation: B, with (f) and (e) enforced by the reviewer, and with a fixed numeric report format so every
decision page shows the same five numbers. A follow-up (toolsmith, not done here): one `tools/pixtol.mjs` that
produces the tolerance report from two frame sets and an A/A pair, so the definitions of §1 stop varying per fix.
What stays a per-fix user OK under B: static differences in the hero, any WebKit-only permanent edge shade over
E (PR-009's 17 on the dash passes numerically, but the user may still want to see it), anything the rule's
numbers cannot express (feel, perceived smoothness, motion at frame rates other than 60 Hz).

## 4. Other elements the same GPU techniques could move (survey, no code)

The techniques that won: `transform`/`opacity` bands behind a mask instead of `background-position` (sweep); a
`clip-path` over a sliding gradient instead of SMIL (glint); WAAPI transform on a strip instead of a rAF spring
(cd-roll-ca); scroll-driven `view-timeline` instead of a per-frame rect read (hero-exit-threaded); two-state opacity
keyframes instead of `step-end` (boil, WebKit). Sources: research/gpu-props §3-§6, fixes/TOPICS.md, fixes/FINDINGS.md,
the status board of 2026-10-03 10:39Z. Counts are from those documents (none new).

| rank | candidate | still on the main thread because | evidence (count) | saving | fidelity risk | owner today |
|---|---|---|---|---|---|---|
| 1 | **Morph-panel countdown clock** on the compositor roll (extend cd-roll-ca to `.countdown.inverse`) | cd-roll-ca skips the panel clock: its strips are painted unlayered, a compositor animation would layer them; the original rAF spring stays | hero clock: countdown rAF callbacks 162 -> 7 per 6 s (Chrome), WebKit 105-108 -> 4-5 per 4 s; the morph pin is where 91 long frames sit (gpu-props §0.1) | high at the pin (about 30 rAF callbacks and a style recalc per frame for half of every second while the panel is up) | low: the same T2 class as cd-roll-ca (edges <= 5, path < 1 px) | none (cd-roll-ca scope excludes it; cdwc parked; countdown-faces waits on cd-strip) |
| 2 | **WebKit `step-end` loops** (hero accent boil, commission underline boil, zero-mark boil, carets) as two-state opacity keyframes | WebKit runs `steps()` on the main thread (iOS 26.x) | Chrome counts unchanged by design; WebKit: about 1 small Layout per boil step outside accent draws (estimate, no phone count yet); one blended frame in about 140 switches at the ramp edges | medium, WebKit only, always on at the top | low: T0 except the ramp frames (T2) | illusion-boil-ca: draft, not accepted, no D card |
| 3 | **Typing and count-up loops** (agents-ask, referral fee, commission `$` count-up; text written every 18-48 ms) | script writes text, every write is style + layout under 6 size containers (a WebKit amplifier) | y 4660: style 120 / 2 s and paints 394-602 / 2 s even with all CSS paused ("agents typing", the largest at-rest cost after PR-009); typing-chunks (every 2nd write): Layout 226 -> 97 (commission), 101 -> 46 (agents), RecalcStyle unchanged (frame-driven) | medium; a pure GPU form (pre-laid-out text revealed by a stepped clip) needs caret and line-wrap parity | high for the GPU form (word wrap and caret x differ while typing); typing-chunks itself halves the writes and is T2-ish | illusion-typing-chunks (draft, not accepted); rest-script (measuring, "pixel-identical rest-time loops": check whether it covers these) |
| 4 | **Morph panel as composited reveal** (clip-path inset, fixed backdrop blur, spring as WAAPI `linear()`; TOPICS N2) | spring on `--morph` drives blur radius, widths and opacities every frame | bottom of the page 16-37 fps on the phone; 91 long frames while the finger holds the morph (gpu-props §0.1) | high for feel at the pin | high during the motion: blur radius fixed (not the same mid-motion), settles to identical; would be a motion-only T3 | fix-nav-morph (F3 touch listeners measuring; N2 not scheduled) |
| 5 | **Scroll-linked custom-property writers -> scroll-driven animations** (commission, future-shrink, platform-shrink, profile-scale, nav theme) | per-frame JS lerp (22 % per frame, about 20 frames after the scroll stops) writes `--*` and restyles subtrees | `iE` is the #1 LoAF script at every CPU rate; nav `L` 316-320 calls, 526-617 ms per run (N12) | medium on desktop and tablet (phones are gated off by phone-invisible-shrink) | medium: the easing tail is a time-based lerp a timeline cannot reproduce (identical at rest, not in motion); hero-exit-threaded's R5 shows the price (sub-pixel cards, 0.2-0.5 %, now limited to width <= 600) | scroll-engine, nav-hit-test, phone-invisible-shrink landed; none for a timeline conversion except hero-exit-threaded |
| 6 | **Layout transitions** to FLIP (`gap` on profile chrome and nav actions, `grid-template-rows` of the platform row, nav `width`) | animates geometry | trigger-driven (not continuous); platform row covered by PR-002 (accepted, scene-scope) | low to medium, per trigger | medium: FLIP gives the same geometry but resamples text at fractional offsets mid-motion | scene-scope (platform row); nav cluster none |
| 7 | **Load-only effects** (nav "earn" unmask `mask-position` 0.98 s once; hero copy `--copy-in`) | main-thread property | once at load | low | low-medium (mask resampled) | hero-exit (copy-in); nobody (unmask) |

Not candidates (already on the GPU, dead, or no identical form): vinyl, scroll cue, marquees, entries (transform/opacity);
dead CSS (§3.2 of gpu-props); SMIL (the glint was the only live SMIL: nothing left to convert); the avatar carousel
(done; WebKit still runs its `clip-path` on the main thread, no transform form); blur entries in Chrome (cred, profile,
invoice: no blur-free form, Chrome-only); the accent word draw (`stroke-dashoffset`: owned, PR-001 and PR-004); nav
backdrop-filters (not identical when replaced).

How the tolerance rule changes this list: with B, candidate 1 and 2 land on a counts gate plus a numbers check; 3 as
typing-chunks lands; 4 and 5 stay user decisions because their difference is in motion, which the T2 numbers (frozen
frames) cannot see. If the user wants 4 or 5, a motion criterion has to be agreed first (e.g. position within 1 px at
every frame of a scripted scroll).

## 5. Rev 2 of PR-010 (user decision on rev 1, 2026-10-03 10:52Z): full-page differential, Try it, size

The user asked for more on "Try it: scroll the real pages", the full-page differential, the hero photo at 1:1 ("i feel
the difference"), and noted that "if it small display in the website it may acceptable". Rev 2 (same PR-010) answers
each point. Pictures live in the proposal (they cannot go in a thread yet); scratch scripts `fullpage.mjs`, `fp2-fp6.mjs`
and the probe `probe9.mjs` are in the session scratchpad, not committed.

**New capture (one shared-lane Chrome hold, screenshots only, no timing, frozen frames):** `probe9.mjs`: the old build
(st6-rb2) loaded twice (A, A2) and the new one (platform-idle, B) once, at 430x932 DPR 3 and 1440x900 DPR 2, every
animation paused at the same moment (sweep at 2000 ms, glint at 0.4/0.5/0.6 s), whole-viewport screenshots. Numbers use
pixels where A vs A2 differs by 8 or less ("beyond A/A"), per CSS px max-pooled so thin lines stay.

| frame (whole screen, real size) | A/A inside the changed boxes | max level | changed CSS px (over 8) | where |
|---|---|---|---|---|
| PR-009 glint, phone 430 | 3 (proxy said 3: confirmed in Chrome) | 56 | 94 = 0.024 % | one 50 x 3 px line (the dash edge rows) |
| PR-009 glint, desktop 1440 | 1 | 31 | 360 = 0.028 % | dash 78 x 4, two bits of the title (9-10) |
| PR-009 sweep, desktop, title 2 | 0 | 10 | 88 = 0.007 % | 8 x 22 px in the letters, 60 % flat fill |
| PR-009 sweep, phone | 0 | 37 (letters of the off-centre title) | 59 = 0.015 % | a few letters; a 139 x 124 ring at the shield (2,295 px) is another animation at another moment, set aside |

Caveat that the full frames added: a frozen frame is not a still page. Script-driven content (count-ups "192K" vs
"200K", the review marquee, the shield rim, the status clock) is at a different moment in two loads, so the A vs B
difference of a whole screen is much larger than PR-009's (desktop title 0: 8 % of pixels, all count-up). Those pixels
are painted blue or excluded; the A/A (A vs A2) removes them only where the two old loads agree. Chrome only; the
Simulator (WebKit) A/A for PR-009 is still missing.

**cd-strip and cd-roll-ca: no whole-screen picture.** The saved whole-page shots (`check.mjs`) have a live clock and are
not frozen; the clean comparison is the virtualised clock box (M4), 28 x 21 CSS px. Their rows stay as numbers (§2).

**Size ladder** (frozen frames shrunk by box average; "1x" = one CSS px per screen px):

| case | full res | 1x | half | third |
|---|---|---|---|---|
| glint phone (max level) | 56 | 19 | 9 | 6 |
| glint desktop | 31 | 15 | 10 | 10 |
| sweep desktop (fill step) | 10 | 9 | 10 | 9 |
| hero photos rm1440, whole hero (max / % of screen over 8) | 118 / 1.33 % | same | 55 / 0.84 % | 53 / 0.51 % |
| skyline photo card 212 x 212 (mean level) | 6.8 | 6.8 | 4.7 | 3.7 |
| smooth photo cards (mean level) | 0.9 / 2.8 | | 0.7 / 2.1 | 0.6 / 1.7 |
| WebKit hero cards y300, phone (max / px over 8) | 73 | 49 / 566 | 36 / 80 | 36 / 4 |

Reading: T2 changes are thin lines or a ~4 % fill step on tens to hundreds of CSS px and shrink below 10 levels at 1x
or half; a fill step does not shrink. The photo case does not vanish when shrunk (still 3.7 mean on the detailed
photo at a third of the size) but exists only with reduced motion at desktop width (rm430, c430, c1440 all 0 %,
research/breakpoints). Whether a given level is visible is for the user's eyes (general rule of thumb: a step of about
1 % in a smooth area, 3 levels, is hard to see; UNRESOLVED on this page). "Small on the display" could become a T2 line
(change after shrinking to the displayed size); offered in the proposal's risk note, not as a fourth option.

**Which case did the user feel?** The sharper hero photos at 1440 with reduced motion (rm1440, st6-rb2): shown at 1:1
as the first pair of option A. Try it per option: A serves st6-rb2 (cannot show it in the 430-wide frame; needs a wide
window with Reduce motion), B serves PR-009 (platform-idle), C serves hero-exit-threaded (WebKit only).

## 6. Rev 3 of PR-010 (user decision on rev 2, 2026-10-03 14:41Z): the avatar slider in the Try-it panels

User note: "I was see the animation of user carousel both of option B and C is not animate the same. it is intention of this proposa ? let's investigate".
Answer: not intended; two causes, one of them real (st6-rb2).

Probe (one approved shared-lane Chrome hold; 430x932 DPR 3 mobile; rAF samples of rects and computed styles of `#people .start-selling-avatars.is-carousel img`,
6 s at three scroll positions, scene `active` throughout; arms: baseline, st6-rb2 overlay, platform-idle overlay, baseline again). All OBSERVED, Chrome only.

- **Timing (phase).** Tick period 1016-1020 ms in every arm. Phase differs even baseline vs baseline (slides start at 0/918/1934 ms in one load, 699/1716/2732 ms in the other: about 0.7 s apart). Two iframes are never in step.
- **Real difference, leaving face only, first ~100 ms of the 220 ms slide.** Baseline (`2.DyWL8TcE.js` ~L11346-11365, keyed 4/5-img block, `.is-exit`): the leaver shrinks in layout (width 32 to 0.7 px, flex-basis, margin) with scale 1 to 0.35 and opacity 1 to 0: a narrow sliver in place (at 50 ms about 9.6 px wide box, opacity 0.46, x 60.9).
  st6-rb2 (rotator-st6 / st5 / st6 / layout-animations: persistent 5 slots `st5-lead`/`st5-next`, `.is-sliding`, `avatars-shift` keyframe; `fixes/st6-rb2/patch.diff`): the leaver keeps its 32 px box, is cropped by `clip-path: ellipse` (radius 16 to 0) and translates left up to 16 px with the same scale/opacity curve (at 50 ms about 20.8 px box, clip about 14.8 px, opacity 0.46, x 55.3).
  Followers and the entering face match the baseline to about 0.1 px in x and 0.002 in opacity/scale at every frame (same 220 ms, same easing). The baseline ends each slide with a 2 px snap of the followers (60.3 to 58.3 px); st6-rb2 has none.
- **Where it comes from.** platform-idle and hero-exit-threaded patches contain the same carousel code as st6-rb2 (they are stacked on it), so B in options B and C carries it; A (plain baseline) does not. Not tested: the scene `paused` case (scene-scope coupling).
- **Earlier checks missed it** because the st6-rb2 pixel check compares frozen frames at rest ("0 px on the avatar imgs"), not mid-slide.
- Rev 3 text: answers the note, states what B carries in each option; A = `fixes/morph-inherit/patch.diff` as the base waits for I-093.

## 7. Does the console's "Try it" panel cause the slider difference? (T-042 #13-#14, 2026-10-03; OBSERVED, Chrome only)

Question: the user saw the slider look wrong in the panel, but "proper" on the iPhone and in a new tab. Probe (shared-lane hold, counts only): the real console page
(`/proposals#PR-010`, option tab "standard"), "Open both pages", then rAF samples (rect, opacity, transform, clip-path, animation play state, scene attribute) of the
slider inside each iframe at the same time, versus the same two servers opened in their own tab at 1440x900 and 430x765. Console viewport 1440x900 (iframes 430x765, the
`max-height: 85vh` rule) and 1000x800 (iframes 430x680). A = baseline, B = platform-idle on st6-rb2 (the rev 3 option).

- **The panel does not change the slider.** In every iframe: scene `active` and `visible` throughout, 60 frames/s, no frame gap over 17 ms inside a slide, a slide every 1017-1033 ms
  lasting 217-233 ms. The same numbers as in the own tab. The leaving face at 50 / 100 / 200 ms after the slide start: A 9.6 / 2.4 / 0.7 px wide in both; B 20.8 / 14.6 / 11.2 px in both (frame alignment moves A by about 1 px).
- **The two frames are in step in the panel** (slide starts of A and B 0-33 ms apart, both loaded together); the 0.7 s phase offset I measured in rev 3 was between two separate loads.
  So what a user sees side by side in the panel is exactly the st6-rb2 leaving-face change (and the baseline's 2 px end-of-slide jump), not a timing offset. In a tab alone there is nothing to compare
  against, which fits "works properly in the new tab".
- Chrome put the two iframes in their own processes (they appeared as separate CDP targets, sandboxed cross-origin frames), so the frames do not share one main thread.
- Scroll sweep (430x765, heading from +900 to -1000 px, 2.3 s per stop, down then up): the slider runs at every stop in both A and B (2-3 slides per 2.3 s), scene always `active`; no difference in when it runs.
- Not tested: Safari, the iPhone (the panel's frames point at localhost, so they cannot load on a phone), a console page scrolled so the frames are off screen, the scene `paused` case.
- Probe scripts: scratchpad `probe11.mjs` (panel and tabs), `probe12.mjs` (sweep), `an11.mjs`; not committed.

# Fix: cm-return (B = g0.0h above the end + v14's end, with a steady glass)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft, gated (Simulator and Chrome counts and pixels; no timing, no phone block). Goes to the user as a
proposal with Try-it (A = g0.0h, B = this build); nothing lands without the user's pick.
**Stage:** F (prototype + gates). No timing A/B and no phone block without the lead's signature.
**Device class / gate:** phone render-bound (end of page, nav morph); Simulator counts and pixels, Chrome pixels.
**Driver(s) behind the claims:** Simulator WDA finger (G-like, `out/cm-return/simhold.mjs`), Simulator scrollTo ladder
with a synthetic touch held (`simflick.mjs`), Simulator Timeline counts with WDA strokes (`endsim.mjs`), Chrome and
Simulator frozen-frame pixels (`fixes/g0-box/gates/px-chrome.mjs`, `px-sim.mjs`).
**Topic:** user T-253 #15-#19, #21, #22, #24/#25, #27 (thread T-253); lead's spawn prompt "cm-return".
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (from pretty line 14064 on: nav and end-of-page code, i.e.
v14's end; `__cmVals`, `__cmSet`), `/_app/immutable/assets/2.gBuqKVzi.css` (nav and end rules: `html.fw-cm`,
`.fw-cm-pre`; carried PR-035 / PR-039 rules).

**Pins** (sha256, first 12): g0.0h JS 9162843e750f / CSS 26d28a0a263b; v14 JS d23ee885d54f / CSS 4fafb83f1e72;
PR-030 B (`fixes/compositor-morph/overlay @ aa889d54fc70`) JS 2948d49e47c6 / CSS b9d2eceae44a;
**B (this build) JS f09ccfa19178 / CSS e6885953c233**.

## What B is, in plain words

- Above the end of the page B is g0.0h, byte for byte in what runs there (the files differ only in the nav and
  end-of-page code).
- At the end of the page B brings back v14's end (PR-030's card "CM" on the GPU, K6's layer pre-build, the menu follows
  the finger). **This reverses the T-228 #62 end-of-page rollback**: in g0.0h the menu opens by itself once you reach
  the end; in B it grows with your swipe, as in v14.
- B keeps PR-030's lower layer count (#21): it is PR-030's CM structure, unchanged.
- New per #27: the glass keeps the closed bar's blur (20 px) through the whole grow; only the fill colour fades, the dark
  layer `.fw-cm-dk` at opacity m over the light tint (the original's colour path: baseline CSS 11336-11343 mixes
  `#ffffff1a` toward `#131922` by m). **This replaces c3's per-frame blur write** (v13/v14 wrote
  `blur(20px x (1 - m))` inline from script at each m bucket; B writes `blur(20px)` once when the morph goes live).
- Two v14 bugs fixed (below: "closed-bar jump" and "Join sweep replay").

## Why PR-030's B flickered (step 1, Simulator, OBSERVED in our setup)

- PR-030's B animates u3's `backdrop-filter` (blur 20 px x (1 - m)) with the scroll-driven keyframes. Under a moving
  finger near m 0 the Simulator draws no glass in many frames and draws it again once the finger is still.
  WDA wiggle around m 0 (6 down/up strokes, 33 shots): glass missing in 12 of 33 frames (glass sharpness up to 1.87
  against 0.02-0.09 when frosted; box p64 up to 8 %), EN and Join change by up to 21 % / 45 % of their px (p24).
- The same WebKit behaviour is in compositor-morph's c3 notes (`fixes/compositor-morph/README.md`, c3: "Safari drew no
  glass while a scroll-driven animation ran backdrop-filter on u3"), which is why v13/v14 wrote the blur from script.
- B has no animated and no per-frame-written blur at all, so the cause is gone.

## Closed-bar jump in v14 (found here, fixed in B)

- K6 ("pre") builds the CM layers while the morph is still closed; under pre the bar, logo and actions take
  `__cmPrep(0)`'s inline values (the pre CSS gives them `animation: none`).
- When the morph had grown and came back to m <= 0 with pre still on, v14's `__cmSet` called `__cmClear()`, which
  removed those inline values. From then on the closed bar sat 4 px higher, the logo 20 px further left and the
  actions 4 px further right, and they jumped back at the next touch past m 0.
- Simulator WDA wiggle, logo left edge / Join left edge in css px (`out/cm-return/logox.mjs`):

| build | closed, fresh | open near m 0 | closed after a return |
|---|---|---|---|
| PR030B | 37.3 / 296 | 42.7-47 / 299-301 | 37.3 / 296 |
| v14 | 37.3 / 296 (first approach) | 42-47 / 296.3 | **17.3 / 300** |
| B | 37.3 / 296 | 41.3-47 / 296.3 | 37.3 / 296 |

- Fix (JS `__cmSet`, ~line 14950): at a crossing to m <= 0 while pre is on, call `__cmPrep(0)` instead of
  `__cmClear()`. It writes only on the crossing frame, as before.
- This jump is likely part of what the user saw on the "icon and buttons" (T-253 #19).

## Join sweep replay in v14 (found here, fixed in B)

- The Join button has a one-shot intro sweep (a rainbow stripe, `nav-earn-sheen` on its `::after`, 0.98 s) that plays
  when the bar appears.
- CM's wrappers (`.fw-cm-c` / `.fw-cm-u`) are `display: contents` outside `.is-morphing` and `display: block` inside.
  In the Simulator the `::after` sweep started again at every switch: when pre turned on at a rest near the end and
  when it turned off on the way up (`out/cm-return/simsheen.mjs`, animationstart log; OBSERVED, cause UNRESOLVED:
  presumably WebKit re-creates the pseudo-element when the render tree is rebuilt).

| stop (m, rest) | g0.0h starts | B before | B after the fix |
|---|---|---|---|
| -0.5 (pre on) | 0 | 1 | 0 |
| 0.05 / -0.1, twice | 0 | 0 | 0 |
| -1.6 (pre off) | 0 | 1 | 0 |
| -0.5 again / -1.6 again | 0 | 1 / 1 | 0 / 0 |

- Fix: the nav effect adds `.fw-cm-quiet` to the header from the first CM frame (live or pre) until `.is-hero-pill`
  comes back (JS after the class object, ~15595), and one CSS rule sets `animation: none` on that `::after` under
  `prefers-reduced-motion: no-preference`. At rest the sweep's start (-130 %) and end (130 %) are both outside the
  button, so the still picture is unchanged. The hero pill's own intro (leaving `.is-hero-pill`) still plays.

## Gates

All Simulator results: iPhone 15 Pro Max Simulator (iOS 26.5), functional sessions in the shared lane, counts and
pixels only, OBSERVED in our setup. The Join's sweep is frozen (paused at 0) in the pixel gates, as agreed with the lead.

**1. Flicker under a finger** (`out/cm-return/simhold.mjs`, WDA finger: down at the end, 6 short down/up strokes around
m 0, 33-34 shots per build; glass sharpness = mean horizontal luma step in the bar's band, frosted 0.02-0.09, missing
0.3-1.9; logo and Join left edge from `logox.mjs`, css px):

| build | glass missing | logo / Join x closed: fresh; after a return | flicker frames (glass, logo, EN, Join) |
|---|---|---|---|
| PR030B | 12 of 33 (sharpness up to 1.87) | 37.3 / 296; 37.3 / 296 | glass 12; EN and Join flip (p24 up to 21 / 45 %) |
| v14 | 0 of 33 | 37.3 / 296; **17.3 / 300** | logo and Join jump at every m-0 crossing after a return |
| B (final, f09ccfa19178) | 0 of 34 (0.03-0.09) | 37.3 / 296; 37.7 / 296 | 0 (open frames follow m: logo 43-47, Join 296.3, as PR030B and v14) |

**2. Hold** (#22; WDA finger to m 0.28 in 8 moves of 120 ms, held still 2 s, 8-12 still shots): 0 fall-back frames in
PR030B, v14 and B. B's last moving vs first still frame: 0 px over 24 levels, max 9. PR030B and v14 differ only by EN's
timed slide. #22 does not reproduce at m 0.28 in the Simulator; PR030B loses the glass only under the moving finger
near m 0 (gate 1).

**3. Static ladder** (`simflick.mjs`, scrollTo with a synthetic touch held, m 0 .. 0.03, 8 toggles 0 <-> 0.004/0.008):
glass p64 <= 0.97 %, logo 0, EN 0 at every stop. The Join's "flicker" at +400 ms in that run is the intro sweep replay
(the run predates the sweep fix; crop `simflick-2026-10-08T21-37-07-223Z/B-t7b-1-crop.png`); the fix was then checked
with the animation log above: 0 replays.

**4. #27 look against v14** (same Simulator frame at equal m): m 0.022: 0.04 % of px over 64; m 0.288: 0 px over 24
(max 7). Once the grow starts, the menu's own blurred backdrop covers the glass's blur.

**5. End-of-page counts** (`endsim.mjs`, Simulator Timeline, 5 WDA swipes into the end and past the bottom, then 5 back,
1 load per build; B = the build before the sweep fix, which only adds one class write per CM start; ms rank only):

| at the end | g0.0h | B | v14 | PR030B |
|---|---|---|---|---|
| frames | 1444 | 1556 | 1529 | 1548 |
| paints / frame | 3.67 | 0.69 | 0.70 | 0.71 |
| layouts / frame | 0.91 | 0.46 | 0.47 | 0.47 |
| style recalcs / frame | 1.10 | 1.46 | 1.52 | 1.47 |
| forced style+layout ms | 644 | 1356 | 1399 | 1687 |
| layers / MB at rest near the end, closed | 46 / 77.2 | 53 / 103.6 | 64 / 113.1 | 55 / 102.7 |
| layers / MB open | 56 / 99.4 | 55 / 95.7 | 55 / 95.7 | 55 / 95.5 |

- g0.0h has no end spacer: its "end" frames are the bottom of the page, where its menu opens by itself; the others'
  are the 815 px grow. The rows compare the end-of-page interaction, not the same motion.
- #21 kept: at rest near the end with the menu closed, B has fewer layers than PR030B (53 vs 55) and v14 (64).
- B's higher style and forced counts come from v14's end code (v14 has them too), not from this change.

**6. Pixels above the end** (T2: fill 64, edge 128, 0.5 %, cluster 2000 css px2; A = g0.0h, V = B, four loads A, V, A2, V2):

- Simulator (final B, `out/g0box/p168/px-sim-2026-10-08T21-54-29-600Z`, carousel frozen, 430x775): consistent 0 at
  y 0, 548, 1422, 2403; 0.0009 % at 3384 (4 css px2, max 35): pass. **Over T2 at 3875 (0.76 %, 2074 css px2 cluster,
  max 77) and 4200 (1.05 %, max 232, one image edge)**: all of it is edge pixels (flat share 0) in the #platform
  section's profile card, stats and agents-ask rows. The content is the same; it sits a fraction of a device pixel
  differently (no whole-pixel shift aligns it: 0 shift 11.6 k px over 24, +-1 px 50-79 k). OBSERVED, cause UNRESOLVED;
  the likely cause is B's 815 px taller page (v14's end spacer, which g0.0h removed) feeding #platform's scroll-linked
  shrink. A disclosed look difference, not hidden.
- Chrome 430x932 (B before #27 and the two fixes, which change only end-of-page code paths;
  `out/g0box/p168/px-mobile-2026-10-08T19-02-50-673Z`): 8 stops 0; over T2 only at y 0/300/548 (the hero's rotating
  accent word) and y 1422/1913 (avatar carousel phase), both page-own motion that the A/A shows too.

## Carried fixes from g0.0h's lineage

| fix | in B | why |
|---|---|---|
| PR-035 (platform-stage corners, `clip-path: inset(0 round 5%)`) | carried unchanged (CSS appended) | v14 has the Safari blur-corner bug in that row |
| PR-039 keep-phase (paused column tracks static, `fwColScene`) | carried (JS hunks + CSS) | v14's scene effect is the same code |
| PR-037 (nav-earn origin) | not carried | v14 already has nav-earn rev 1's origin-follow (no jump) |
| PR-038 (v3-W) | not carried | its end-of-page part is superseded by the CM card |
| PR-036 (Join blur square, gap/padding) | not carried | gap/padding parts do not apply (v14 slides EN; the pill keeps its shape). Part 1 (Safari's blur square on the fading Join): `simjoin.mjs` held the Join's fade at 120/200/280/360 ms at m 0.25 with and without PR-036's clip; the only differences were EN's own slide timing, no square around the Join (Simulator, OBSERVED) |

## Known costs and look differences (for the proposal)

- PR-030's disclosed look differences stay (compositor-morph README "Pixels"): in the early grow (m 0.02-0.4) the bar's
  top-left (logo, pill edge) is drawn slightly differently; from m 0.8 on the card's content sits up to ~1 px off and
  the blurred photos behind it differ a little; Chrome only: text can stay a bit soft at m 1 after a slow approach,
  and Chrome screenshots (not the screen) can show transparent card corners.
- #27: the glass keeps 20 px instead of v14's 20 x (1 - m); in the Simulator the frames at equal m match v14's (gate 4).
- Simulator only: the #platform section's text and images (above the end) sit a fraction of a device pixel differently
  from g0.0h at two of seven stops (gate 6), presumably from B's taller page.
- B has v14's always-on, non-passive window wheel listener, added at setup and kept until teardown (JS 15082,
  15012-15021); g0.0h adds it only when #platform reaches the 200 % zone. In WebKit the first add triggers a full style
  rebuild (F-360, fix-g0-box): in B it falls in the mount frame (fix-g0-box's Simulator numbers, OBSERVED, n=3, for a
  build that registers it at mount: mount frame 649.9 vs 639.7 ms, L+S 123.4 vs 114.4 ms).

## Not run

- No timing A/B, no phone block (lead's rule for this step). Real finger (F) on the phone: not run.
- Desktop and reduced motion: B's code there is v14's (CM runs only at `(width <= 640px)`; reduced motion as v14).

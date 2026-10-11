# Worst cases on the real iPhone: the original page vs g0.0l (captures for blog Part 1)

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). The screen
> recordings stay in the gitignored `out/` of this worktree (Hard rules 3 and 12); nothing here shows a frame.

**Status:** recorded and read (illustration, not a verdict). Owner: cap-worst, 2026-10-09.
**Driver:** G (WDA robot finger), the same frozen program on both arms. iPhone 15 Pro Max, iOS 26.6.1 Safari.
**Profile:** tool-serious (Serious induced by `iphone.mjs rearm` / `thermal.mjs`, as P-173/P-174), phone cooled below
40 °C before each prep. Do Not Disturb / Sleep focus on (console step C-139).
**Why:** the user asked (artifact comment, 2026-10-09 11:54Z) to show the worst cases we found and how the final build
fixed them. Part 1 says "no full timing run of g0.0l against the original page" (line 602): this is the first
side-by-side phone capture of the original vs g0.0l, but an illustration with n = 1-2, not a counted block.

## Builds (both served plain http, `--latency 150 --vendors=local`, from immutable copies, hashes checked before every run)

| arm | build | JS / CSS (sha256, 12) | source |
|---|---|---|---|
| A, "orig" | the original page: baseline snapshot b1789284481295-a455e793, no overlay | 4606120cf392 / 27776f3d4138 | `site-pretty` |
| V, "g0l" | g0.0l, the final best build | 4106679e0a8a / 440582cec781 | `node tools/fix.mjs apply g0-0l --reset` -> `out/wc/snap/V` |

## Cases, verified against our records before any capture

Picked from BEST_BUILDS, PROGRESS, PR_BY_VERSION, the fixes' READMEs and the 5 Oct worst-cases ranking
(research/team-article/index.html, "Worst cases on the original"). Kept only where the original shows it and a fix in
g0.0l was proven on the phone.

| case | page position (crossing) | fix in g0.0l (phone proof) | program (file sha / compiled hash) |
|---|---|---|---|
| hero cards' fade-out | top card, y 0 -> ~1,200 | v6 / PR-011 hero exit on scroll-driven CSS (P-095: >34 per run 27 -> 12, fixes/hero-exit-threaded/README.md:996) | research/team-article/capture/phone/g/hero-fade-v1.json (4c7b34b1fac9 / 0ce8d22e12c6) |
| countdown at rest (sub-window of the hero run) | top, 12 s at rest | v7/v8 countdown strips, roll, faces (P-114 no-worse) | same run, window rest -> fade |
| middle: people deck under a slow drag | y 1000-1700 | g0.0j deck sized by container units (P-172: Layout >= 5 ms 152-159 -> 0-1) | fixes/g0-0l/phone/g-approach-g0l.json (3f82842a12f2 / 65f6de58009c) |
| middle: the dark section comes in (5 Oct ranking row 2) | y 1850-2100 (~1,970, nav turns dark) | F3 arm-scope, v1 (P-022: 100-118 ms frames in 8/8 -> none over 34 in 4/4) | same run |
| middle: switch into #platform ("345 elements restyled") | y 2500-2760 (~2,610) | scene-scope, v3 (T-011: switch recalc 17.7-24.5 -> 0.4-0.5 ms); 345 -> 99 is per section switch (Chrome count) | same run |
| people-card blink on a fast flick | flick from the top, lands on the deck y ~1,320-1,440 | PR-041, g0.0l (P-174: blurred deck frames per flick 51-52 -> 0 vs g0.0k) | fixes/g0-0l/phone/g-flick-g0l.json (7146521fa62f / 22b636f36a82) |
| end of the page: pushes that open/close the menu (ranking row 1) | last screen, y >= ~5,200 | end-of-page line g0.0b..g0.0k; **different behaviour by design**: the original opens the menu by itself on a held page, g0.0l follows the finger (PR-040) | fixes/g0-box/phone/g-fastshort-g0.json (f20c7553274f / 38d7fe5d7fa8) |

Dropped: the end-of-page glass flicker (the original never had it; intermediate builds did), the end-of-page background
pictures (not fixed in g0.0l: PR-025 never built in), the GPU menu reveal (removed by the g0.0b rollback). The optional
fast-flick-through-the-top-card case was skipped (the block ran past ~40 min).

## Numbers: frames per window from the phone's own rAF log

`wc-read.mjs` reads each G record; a frame [t, dt, scrollY, innerHeight] is in a window when t is in (start, end].
Phone thresholds: > 34 and > 50 ms, twins in brackets (30 / 38 and 46 / 54), worst frame. Windows were fixed before the
data, except "end, 6 pushes" (see below). OBSERVED, iPhone 15 Pro Max, one afternoon; per run, orig first.

**Headline: clean runs only** (Serious at both ends of the hold, no profile drift, complete window):

| case (window) | orig > 34 | orig > 50 | orig worst | g0l > 34 | g0l > 50 | g0l worst | n |
|---|---|---|---|---|---|---|---|
| hero fade (3 slow drags) | 46 (73/25), 88 (105/80) | 6 (15/4), 36 (39/34) | 98, 153 ms | 4 (8/4), 6 (6/4) | 3 (4/3), 1 (2/1) | 69, 80 ms | 2 + 2 |
| countdown at rest (12 s) | 9 (12/7), 8 (11/5) | 3 (3/3), 4 (4/2) | 60, 61 ms | 1 (1/0), 0 (1/0) | 0, 0 | 36, 32 ms | 2 + 2 |
| people deck drag, y 1000-1700 | 32 (49/19), 53 (58/46) | 13 (15/8), 30 (31/26) | 109, 157 ms | 0 (2/0), 0 (1/0) | 0, 0 | 31, 32 ms | 2 + 2 |
| dark section, y 1850-2100 | 32 (32/29), 22 (31/14) | 22 (25/18), 9 (12/7) | 361, 101 ms | 0 (0/0), 0 (2/0) | 0, 0 | 30, 32 ms | 2 + 2 |
| #platform switch, y 2500-2760 | 4 (4/2), 4 (4/2) | 1 (1/1), 1 (1/0) | 58, 54 ms | 1 (1/0), 0 (2/0) | 0, 0 | 37, 32 ms | 2 + 2 |
| whole slow approach, top -> y 3400 | 93 (121/69), 104 (130/80) | 43 (52/34), 51 (57/41) | 361, 172 ms | 5 (8/4), 4 (10/4) | 1 (2/1), 1 (2/1) | 64, 62 ms | 2 + 2 |
| people flick (flick -> 3 s after landing) | 19 (32/14) | 5 (7/3) | 105 ms | 4 (5/4), 3 (4/3) | 2 (3/2), 2 (2/1) | 64, 68 ms | 1 + 2 |

- No twin reverses a direction in this table. The #platform switch is the small one: > 50 is 1 vs 0 per run, and one
  original run ties at > 54 (0 vs 0); every other row's gap is far larger than the 4 ms twin shift.
- g0.0l's remaining > 50 frames in the approach (one per run, 62-64 ms at y ~620) are the people card's slow-path
  reveal, the cost P-174 named (F-371); in the flick it is the instant reveal frame (64-68 ms).
- The orig 361 ms frame: y jumps 1,850 -> 1,953 in one frame as the dark section comes in.

**End of the page** (different behaviour by design; no feel claim, lead 2026-10-09). Window "6 pushes" = mark E20 to
mark E26 (close/open pushes of 60, 120 and 200 px). It was chosen after the data, because the first two original runs
ended after E26-E28 (see Problems), so E20-E26 is what every run covers.

| run | thermal at hold start -> end | > 34 | > 50 | worst |
|---|---|---|---|---|
| orig 20261009T140920Z (clean; run cut after E28) | Serious 38.4 -> Serious 41.0 | 875 (1072/718) | 429 (498/375) | 349 ms |
| orig 20261009T142230Z (**drift**; run cut after E26) | Serious 39.9 -> **Critical 43.2** | 474 (873/380) | 197 (242/174) | 496 ms |
| orig 20261009T144540Z (**drift**; complete) | Serious 38.8 -> **Critical 42.3** | 562 (804/466) | 259 (309/230) | 494 ms |
| g0l 20261009T141903Z (**drift**; complete) | Serious 39.9 -> **Critical 43.2** | 67 (115/43) | 10 (16/5) | 69 ms |

- There is no clean g0.0l end run: eV1 was refused by the hold-time guard and eV3 by the Critical gate. So the end
  row is n = 1 for g0.0l and from a drifted run; the lead keeps end n = 1 for g0.0l in the article.
- The original's end heats the phone fast: every hold that ran an original end run ended at Critical.

## What the screen shows (from art-gif-pb's pixel check of these recordings, FYI)

- The original's long page frames (hero 98 ms, middle 361 ms) don't show as frozen screen frames: the screen changes on
  every 60 Hz frame there. Safari's UI process scrolls the page and moves fixed layers itself (CONFIRMED in WebKit's
  source, see research/team-article/capture/README.md "CAPTURE-DIFFERS"), so a long page frame shows as script-driven
  parts (hero cards, nav colour, the people card) arriving late, not as a stopped page. Only the middle original drops
  3 screen frames (33 ms gaps), after the scroll stops.
- Stroke start on screen vs the predicted mark time: people ~0.77 s after the "flick" mark in both arms (WDA stroke
  latency after the mark, likely), hero drag 1 0.07-0.12 s before, middle arms align at a ~0.22 s shift.

## Runs, thermal state, Mac load (all OBSERVED)

| run (out/iphone-screen/ and out/wc/runs/) | arm | profile at hold start -> end | load1 start / end | recorder | note |
|---|---|---|---|---|---|
| 20261009T132512Z-wc-hero-orig | A | Serious 34.4 -> 36.5 | 10.5 / 9.6 | 3891 frames, 64.9 s | |
| 20261009T132633Z-wc-hero-g0l | V | Serious 34.4 -> 36.5 | 4.1 / 3.5 | 6597, 110.1 s | |
| 20261009T133819Z-wc-hero-g0l | V | Serious 36.1 -> 37.2 | 4.3 / 4.1 | 7536, 126.1 s | |
| 20261009T134136Z-wc-hero-orig | A | Serious 36.1 -> 37.2 | 13.5 / 10.0 | 3026, 50.5 s | |
| 20261009T134759Z-wc-people-orig | A | Serious 36.4 -> 37.9 | 12.5 / 10.2 | 2068, 34.5 s | |
| 20261009T134853Z-wc-people-g0l | V | Serious 36.4 -> 37.9 | 8.4 / 8.6 | 1071, 17.9 s | |
| 20261009T135001Z-wc-people-g0l | V | Serious 36.4 -> 37.9 | 5.8 / 6.4 | 9398, 156.8 s | |
| 20261009T135415Z-wc-people-orig | A | - | - | 4589, 76.5 s | no record: refused by the hold-time guard (I-112) |
| 20261009T135711Z-wc-middle-orig | A | Serious 38.0 -> 38.8 | 6.8 / 7.7 | 5813, 97.7 s | |
| 20261009T135904Z-wc-middle-g0l | V | Serious 38.0 -> 38.8 | 7.6 / 8.3 | 1733, 29.2 s | |
| 20261009T135954Z-wc-middle-g0l | V | Serious 38.0 -> 38.8 | 4.5 / 5.2 | 6140, 102.7 s | |
| 20261009T140304Z-wc-middle-orig | A | Serious 38.0 -> 38.8 | 5.5 / 6.5 | 1877, 31.9 s | |
| 20261009T140920Z-wc-end-orig | A | Serious 38.4 -> 41.0 | 19.1 / 4.0 | 12157, 238.5 s (cap) | aborted after E28 (I-263) |
| 20261009T141437Z-wc-end-g0l | V | - | - | 5019, 83.7 s | no record: hold-time guard |
| 20261009T141903Z-wc-end-g0l | V | Serious 39.9 -> **Critical 43.2** | 12.4 / 5.9 | 11181, 195.2 s | drift |
| 20261009T142230Z-wc-end-orig | A | Serious 39.9 -> **Critical 43.2** | 5.2 / 25.5 | 13497, 239.3 s (cap) | drift; aborted after E26 (I-263) |
| 20261009T144444Z-wc-people-orig | A | Serious 38.8 -> **Critical 42.3** | 25.3 / 18.5 | 2141, 35.7 s | drift (kept, out of the headline) |
| 20261009T144540Z-wc-end-orig | A | Serious 38.8 -> **Critical 42.3** | 7.2 / 6.1 | 19735, 349.0 s | drift; complete |
| 20261009T145232Z-wc-end-g0l | V | refused: phone Critical, 42.5 °C | - | 3866, 64.5 s | no record; the tail stopped here (lead's rule) |

"Start -> end" is the hold's thermal read (`meta.profile`); battery °C. The holds also logged one uncounted warm-up flick
per arm port. Recordings: `.mov` (1290x2796 h264, ~60 fps delivered) with `.frames.json`, `.result.json`, `.json`,
`.log` beside each; driver records, logs, `stamps.jsonl`, `vv.jsonl` in `out/wc/runs/`; `out/wc/read.json`
(`wc-read.mjs --json`), `out/wc/offsets.json` (`wc-offsets.mjs --json`: every mark as seconds into its `.mov`, clock
chain OBSERVED). For pictures, art-gif-pb has the cleanest pairs (hero 132512Z | 132633Z, people 134759Z | 134853Z,
middle 135711Z | 135904Z, end 144540Z | 141903Z, both end runs drifted).

## Problems on the way (incidents)

- **I-262** (resolved, e6fc7aa8, self-fix on the lead's go): after the focus step, a mail app's background web view
  (file://...) was listed before Safari's parked about:blank tab; `iphone.mjs open` judged Safari "not parked" and then
  could not pick a blank view. `parkedCandidates()` now checks only Safari's own views when its appId is known. Not
  measurement code. Workaround kept in `wc-hold.sh`: `FW_IPHONE_APPID=PID:<Safari pid from WDA activeAppInfo>`.
- **I-263** (open, tool, not blocking): when the recorder stops (its `--seconds` cap) the inspector link drops and a
  running gesture aborts ("fetch failed"); opens right after a recorder stop needed 1-2 retries. Workaround: recorder
  cap 600 s (longer than any run) and retried opens.
- The first focus-step wait was cut by the 30-min background cap (re-entered the same hold); the gesture tool's
  hold-time guard (I-112) refused 2 runs after slow ready retries; the tail stopped at Critical as the lead ruled.
- Phone time: ~55 min main block + ~20 min tail (incl. cooling), over the ~40 min plan.

## Files here

- `wc-serve.sh` (snapshot copy + servers, hash checks), `wc-hold.sh` (one phone hold: focus step, cooling, rearm,
  warm-ups; per item open, recorder, ready check, driver, stop, park; stop rules), `wc-block.sh` (holds in order,
  requeue on the time budget, `thermal.mjs clear` at the end), `wc-read.mjs` (window counts), `wc-offsets.mjs` (marks
  as seconds into each recording). Adapted from research/team-article/capture/phone/ (art-worst-cases) and
  fixes/g0-0l/phone/ (fix-scrollcb-g0), credited in their headers.

## Article recordings (-ar-, 2026-10-10; user-approved picture rule for out/iphone-screen/*-ar-*)

Same kit, G robot, tool-serious, focus step C-142, A B B A, 2 runs per arm. Programs fixed before any capture:
`g-ar-menu-v1.json` (end of page: approach, then 4 slow held pushes), `g-ar-carousel-v1.json` (scroll to the #people
pill, y ~1710, 12 s at rest), `g-ar-ptitle-v1.json` (the People title stroke of people-v1, then 7 s still). `ar-serve.sh`,
`ar-hold.sh`, `ar-block.sh` are copies of the wc-* scripts with the g0.0m set (made as copies so a running script was
never edited). Event windows (seconds into each .mov) went to the lead and art-ar-gifs; `wc-offsets.mjs` reproduces them.

| pair | arm B | runs | page log in the window, original vs B (>34 / >50 / worst) | thermal |
|---|---|---|---|---|
| Day 8 menu (P1 -> done) | v14 (d23ee885d54f / 4fafb83f1e72) | 040615Z, 041207Z orig; 040835Z, 041016Z v14 | 174, 139 / 64, 38 / 725, 647 ms vs 28, 15 / 5, 6 / 106, 87 ms | Serious 38.1 -> **Critical 42.1** (drift, all four) |
| carousel at rest (12 s) | g0.0m (37af49aef32b / 7a8ecdd8f8e4) | 042754Z, 043046Z orig; 042903Z, 042952Z g0m | 17, 20 / 3, 1 / 79, 59 ms vs 0, 0 / 0, 0 / 21, 21 ms | Serious 38.1 -> 39.4 |
| People title (stroke + 7 s) | g0.0m | 043157Z, 043411Z orig; 043251Z, 043332Z g0m | 3, 7 / 1, 1 / 58, 56 ms vs 2, 2 / 0, 0 / 37, 38 ms | Serious 39.5 -> 40.3 |

The Day 8 end behaves differently by design (the original opens by itself, v14 follows the finger): pictures, not a
measurement.

**People title v2 (option b, 2026-10-10).** The v1 runs above do not show the title's 'o' opening: the heading's
IntersectionObserver (threshold 0.35, baseline JS 6261-6267) fires while the #people card is still at opacity 0 under
the hero's exit, and the 'o' (1.3 s delay, JS 6250-6257) has opened before the card fades in. A headless Chrome DOM
check (430x932, both builds, same result) found a visible path: the observer resets the 'o' when the heading leaves
(JS 6264) and reopens it ~1.0 s (is-stack) + 0.12 s (is-expanded) after it re-enters, with the card at opacity 1.
`g-ar-ptitle-v2.json` goes ~1,300 px past the title, rests 1.5 s (mark return), comes back 500 px with a held 'still'
stroke (mark held) and rests 6 s (mark end); `wc-read.mjs` counts v2 runs from return to end. The first block (05:09Z)
stopped before any run (Do Not Disturb step C-143 unanswered for 30 min); the second (07:15-07:20Z, C-143 reused, A B B A,
tool-serious, Serious 39.1 -> 40.7 C, no drift) gave 4 clean runs. Path on the phone: up to y 1264-1265, back to y
774-775 (innerHeight 815 at return, 775 at held). The frame log cannot see the 'o'; art-ar-gifs checked the pictures by
eye (pair orig 071845Z / g0m 071753Z, fewest recorder writer drops): the 'o' starts to open 0.20 s before the held mark on
both (orig 51.33 s, g0m 27.82 s into the .mov, ~0.5 s after the title stops) and is fully open ~1.0 s later; Do Not
Disturb shows on all four runs. GIFs: day8-ptitle-50fps.gif, day8-ptitle-3x.gif (out/article-gifs/, main checkout).

| run | return -> end: >34 (30/38) / >50 (46/54) / worst | return -> held >34 / >50 | held -> end >34 / >50 |
|---|---|---|---|
| 071555Z orig | 53 (63/36) / 13 (14/8) / 101 ms | 27 / 11 | 26 / 2 |
| 071706Z g0m | 3 (5/2) / 1 (1/0) / 51 ms | 2 / 1 | 1 / 0 |
| 071753Z g0m | 3 (3/2) / 1 (1/1) / 66 ms | 2 / 1 | 1 / 0 |
| 071845Z orig | 52 (63/43) / 15 (19/9) / 76 ms | 27 / 12 | 25 / 3 |

Mark offsets into each .mov (wc-offsets.mjs) went to art-ar-gifs and the lead.

## The user's own finger through the hero cards (-ar-herouser / -herofinger / -herocatch, 2026-10-10, T-170 #193)

Owner: cap-finger-hero (phone runner), same kit and worktree. A = the original page, V = g0.0m (37af49aef32b /
7a8ecdd8f8e4); hashes checked before every run. All numbers OBSERVED, iPhone 15 Pro Max, one morning, n = 1-2 per arm:
illustration, not a verdict.

**1. The user's finger (console step C-146, `hf-user.sh`).** One step, 2 recorded parts, each page opened fresh at the
top (y 0, innerHeight 775): part 1 the original (10:45Z), part 2 g0.0m (10:46Z). After the user's Start: ioscap screen
recording + `iphone.mjs record --touches --seconds 22` (I-218), inside a `--no-timing` chrome-measure hold. No thermal
gate (memory user-steps-first; battery 37.7 C right after). Do Not Disturb on in both (moon in the status-bar strip).
The user flicked down through the hero cards and back to the top, again and again (orig 7 flings in ~12 s, g0.0m 11
flings in ~19 s), and stopped each down-the-page flick with the "People still need people" title in view (rest
y 638-781). The two parts are different gestures, so this row compares how each felt, not like for like:

| record | window | frames | > 34 (30/38) | > 50 (46/54) | worst |
|---|---|---|---|---|---|
| 104514Z herouser-orig | first touch -> last + 3 s (15.1 s) | 598 | 88 (138/66) | 33 (44/20) | 103 ms |
| 104634Z herouser-g0m | same (21.9 s) | 1131 | 4 (8/3) | 0 (0/0) | 44 ms |

**2. The stop taps are not in the touch log (OBSERVED in our setup; reference check pending).** `gesture-from-record.mjs`
made a 7-fling program from part 1 (`g-ar-herofinger-v1.json`, compiled hash 68e99e5c6e42). It dropped only one touch: a
0 px tap at 0 ms, before any scroll. But the scroll curve shows a stop after every down-the-page fling with no
touchstart: the coast halts within one frame (0.93 px/ms -> 0 at y 618, 0.91 -> 0 at y 781, then 0 at 766 and 779),
+284 / +334 / +630 / +650 ms after the lift. After the stop the page drifts +20 / -41 / -28 / 0 px, as if a finger
is held and dragged. iOS momentum cannot end that early: the robot's own flings at the user's lift-off speeds coasted
~730 px over ~2 s (tau ~0.48 s), to y 950-1250 (runs below). The user confirmed they tap to stop on the title
(T-170 #200/#202). Reading: a touch that lands during momentum scrolling stops the scroll in the UI process and is never
dispatched to the page. OBSERVED; follow-up: check it against WebKit's iOS touch dispatch during scroll-view
deceleration (WKContentView / UIScrollView touch handling in github.com/WebKit/WebKit) before it becomes a finding.

**3. Robot replays, two programs, A V V A each, tool-serious (`ar-hold.sh` items u and w; `ar-block.sh`).**
- v1 `g-ar-herofinger-v1.json`: the converter's strokes as recorded. Clock-aligned like the hero item (recorder from
  :20-:27, driver at :40). Block U1 10:51-10:59Z, Serious 37.4 -> 38.9 C, no drift. The page passes the title (rest y
  946-1253 vs the user's 638-781). Each run takes 28-30 s vs the user's 17.7 s, because each robot stroke starts
  ~0.5-1.3 s after it is sent.
- v2 `g-ar-herofinger-v2.json` (hash 941a8498065f): the same flings plus a catch after each down-the-page fling. The
  robot cannot copy the tap itself: a stroke is >= 40 px, a down stroke waits for a still page, and the tool sent each
  catch 2.0-2.5 s after the fling's lift (the gesture runner's page checks between strokes). So the catches (40 px up,
  80 ms press, 150 ms hold, no momentum) land on a page that has already come to rest. The stop positions come from
  slower fitted lift-offs (941 / 1293 / 1263 / ~1540 px/s; coast = v x 0.478 s). Rest y 663-786 for the first three
  stops (user 638-741) and 893-936 for the last (user 779). Block W1 11:08-11:16Z, Serious 36.6 -> 38.6 C, no drift.
  The rearm waited 4 min for the real-heat Serious after U1 to clear.

| run | program | arm | window (finger -> end) | frames | > 34 (30/38) | > 50 (46/54) | worst |
|---|---|---|---|---|---|---|---|
| 105127Z herofinger-orig | v1 | A | 30.3 s | 1264 | 204 (262/163) | 101 (119/83) | 146 ms |
| 105336Z herofinger-g0m | v1 | V | 28.3 s | 1676 | 18 (21/12) | 3 (5/3) | 75 ms |
| 105519Z herofinger-g0m | v1 | V | 28.4 s | 1686 | 16 (20/11) | 4 (4/3) | 74 ms |
| 105719Z herofinger-orig | v1 | A | 29.6 s | 1357 | 168 (202/132) | 83 (97/66) | 154 ms |
| 110844Z herocatch-orig | v2 | A | 32.5 s | 1303 | 265 (301/221) | 127 (164/108) | 150 ms |
| 111040Z herocatch-g0m | v2 | V | 31.0 s | 1808 | 40 (58/29) | 6 (9/3) | 89 ms |
| 111222Z herocatch-g0m | v2 | V | 30.1 s | 1781 | 21 (36/14) | 2 (4/0) | 54 ms |
| 111421Z herocatch-orig | v2 | A | 32.7 s | 1285 | 254 (310/221) | 134 (158/108) | 154 ms |

No twin reverses a direction (orig vs g0.0m: > 34 168-265 vs 16-40, > 50 83-134 vs 2-6). The windows include the
robot's slow gaps, so counts per run do not compare with the user's own record (15-22 s). Mark offsets into each .mov
(`wc-offsets.mjs`, out/wc/hf-offsets.json): finger at 38.8 / 23.1 / 22.8 / 22.8 s (v1) and 40.1 / 23.1 / 22.8 / 22.7 s (v2),
end ~30 s later. Recordings: out/iphone-screen/<run>.mov in this worktree (user parts: 20261010T104514Z-ar-herouser-orig,
20261010T104634Z-ar-herouser-g0m). Do Not Disturb (moon) shows on all 10 recordings, with no notification in the strip.

Pitfall (cap-finger-hero): I edited `ar-hold.sh` while block U1 was running it. sh reads a script as it runs, so the
hold ended with a syntax error after its last item (all 4 runs and the thermal clear were already done; HOLD DONE not
printed). Never edit a running kit script; copy it, as cap-worst did.

Files: `hf-user.sh` (the user step), `g-ar-herofinger-v1.json`, `g-ar-herofinger-v2.json`; `ar-hold.sh` items u/w, owner
from FW_AGENT, WC_FOCUS_STEP=skip; `ar-block.sh` owner and --doing from env; `wc-read.mjs` windows herouser / herofinger /
herocatch. Drivers: out/wc/hf-go.sh, out/wc/hf-go2.sh.

## End of the page, open and close in one take (-ar-endoc, 2026-10-10)

Owner: cap-end-openclose (phone runner), same kit and worktree. A = the original page, V = g0.0m (37af49aef32b /
7a8ecdd8f8e4); served hashes checked before every run. All numbers OBSERVED, iPhone 15 Pro Max, one afternoon, n = 2
per arm: illustration, not a verdict.

**Why a new take.** In the -wc- end runs (`g-fastshort-g0.json`) the open push E21 and the close push E22 came ~3.4 s
apart on g0.0l but ~13 s apart on the original: between them the program re-approaches the end with `repeat until
atEnd` (2 drags) and an optional 1.5 s `until atEnd`. The original keeps the page pinned at y 5213 at the end and never
reports atEnd, so both ran to their limits there; on g0.0l atEnd held at once. A clip of one open and close then had to
be cut in two separately aligned parts.

**Program `g-ar-endoc-v1.json`** (compiled hash 3d9f1908acf9, 17 strokes, dry run ~41 s, GESTURE_BUDGET_S 150; fixed
before any capture): reload, 4 s, mark approach, 12 fixed drags up (520 px in 1200 ms, 300 ms apart; the original
always ran 12, g0 builds reach the end in 11), 1.5 s, mark reset, the slow close drag that comes before E21 in
fastshort (450 px down in 2000 ms, held 300 ms), 2.5 s at rest, then two cycles: open push as E21 (up 60 px in 50 ms,
fling, mark O1/O2), a fixed 2.0 s, close push as E22 (down 120 px in 60 ms, fling, mark C1/C2), a fixed 2.0 s (1.0 s
after C2: mark after-1s), 1 s more at rest (mark done). No atEnd or settled waits. The only untils are `y>=3000`
guards before each down stroke (the compiler's pull-to-refresh rule); they were met in 3-64 ms on both builds.

**Different by design.** The original pins the page at y 5213-5214 at the end. Its own touch handlers open and close
the menu, and it opens the menu by itself on a held page; the frame log's scrollY never moves there, so the log can't
see the menu. g0.0m follows the finger: its menu is real scroll. In both g0.0m runs every open push went
y 5220/5260 -> 6035 and every close push 6035 -> 5220. So these are pictures of the same input, not of the same motion.

**Block** (`out/wc/eo-go.sh`: `ar-hold.sh` prep E0 then one hold per run, item o, A V V A, 12:54-13:07Z): no focus step
(Do Not Disturb stays on: the moon shows in the status-bar strip of all four recordings at the window's start and
end, with no notification); cooled below 40 °C (31.6 °C, at once), `iphone.mjs rearm` (tool-serious), one uncounted
warm-up flick per arm port. Between runs the battery stayed under the 39.5 °C cooling trigger, so there was no
cooling wait. No run reached Critical and no profile drifted, so all four runs are clean. Park, `thermal.mjs clear`
(NONE active) and server stop came after the block.

| run (out/iphone-screen/ and out/wc/runs/) | arm | thermal start -> end | recorder | window O1 -> after-1s |
|---|---|---|---|---|
| 20261010T125906Z-ar-endoc-orig | A | Serious 32.1 -> Serious 33.1 °C | 5576 frames, 102.5 s (54.4 fps) | 86.83 -> 99.42 s (12.59 s) |
| 20261010T130126Z-ar-endoc-g0m | V | Serious 33.5 -> Serious 34.3 °C | 4644, 77.9 s (59.6 fps) | 64.85 -> 74.88 s (10.03 s) |
| 20261010T130321Z-ar-endoc-g0m | V | Serious 34.5 -> Serious 35.3 °C | 3924, 66.2 s (59.3 fps) | 53.12 -> 63.09 s (9.97 s) |
| 20261010T130503Z-ar-endoc-orig | A | Serious 35.6 -> Serious 36.4 °C | 4590, 85.8 s (53.5 fps) | 70.79 -> 82.73 s (11.94 s) |

Page frame log (`wc-read.mjs`, case endoc), window = mark O1 to mark after-1s, the whole open-close-open-close take:

| run | frames | > 34 (30/38) | > 50 (46/54) | worst |
|---|---|---|---|---|
| 125906Z orig | 355 | 80 (122/64) | 41 (44/39) | 584 ms |
| 130126Z g0m | 587 | 4 (13/2) | 0 (0/0) | 42 ms |
| 130321Z g0m | 584 | 3 (8/0) | 0 (0/0) | 37 ms |
| 130503Z orig | 362 | 61 (88/51) | 33 (38/29) | 542 ms |

- No twin reverses a direction (> 34: 61-80 vs 3-4; > 50: 33-41 vs 0). The original's windows are ~2 s longer (see
  below), so its counts cover more time. Per cycle (`cyc1` O1 -> O2, `cyc2` O2 -> after-1s): orig > 50 24 + 17 and
  22 + 11, g0.0m 0 + 0 in both runs.

**Timing on screen** (`eo-offsets.mjs` -> `out/wc/eo-offsets.json`: every mark, plus each push's robot send and return
time, as seconds into its .mov; clock chain as wc-offsets.mjs, OBSERVED). A push touches the glass during its robot
call, between "sent" and "returned". Sent, seconds after the O1 mark:

| run | O1 open | C1 close | O2 open | C2 close | close call (C1, C2) |
|---|---|---|---|---|---|
| 125906Z orig | +0.12 | +3.16 | +7.07 | +10.03 | 1.79, 1.56 s |
| 130126Z g0m | +0.00 | +2.86 | +5.60 | +8.35 | 0.72, 0.67 s |
| 130321Z g0m | +0.01 | +2.79 | +5.47 | +8.24 | 0.67, 0.73 s |
| 130503Z orig | +0.14 | +3.12 | +6.83 | +9.65 | 1.60, 1.29 s |

- The waits in the program are the same on both builds. On g0.0m O1 -> C1 is 2.8-2.9 s; on the original it is 3.0 s.
  The 10 s gap of the -wc- runs is gone. The rest of the drift (+0.3 s at C1, +1.3-1.7 s at C2) comes from the robot's
  own call time: a close stroke's WDA call returns after 1.3-1.8 s on the original vs 0.7 s on g0.0m (opens: 0.7-0.85 s
  on both). OBSERVED in our setup; cause unknown.
- For one continuous clip per build, cut each .mov from window.startMovS to window.endMovS and align them on O1. The
  first open and close then line up within ~0.3 s; the second cycle runs up to ~1.7 s later on the original. A cut
  aligned on every push can use each push's sentMovS.

Files: `g-ar-endoc-v1.json`, `ar-hold.sh` item o (names -ar-endoc-<orig|g0m>), `wc-read.mjs` case endoc (windows take,
cyc1, cyc2), `eo-offsets.mjs`. Driver and logs: out/wc/eo-go.sh, out/wc/eo-block.log, out/wc/eo-E0..E4.log;
status-bar strips out/wc/eo-statusbar/.

## Day 11 reveal flick: g0.0l vs g0.0m (-ar-revealflick, 2026-10-11)

Owner: cap-end-openclose (phone runner), kit by cap-end-orig (`rf.sh`, `rf-read.mjs`, landed in e05ec4cf), run from this
worktree (the allowed recorder app). All numbers OBSERVED, iPhone 15 Pro Max, n = 2 per build: a recording for the
article, not a verdict (the verdict is P-175's, fixes/g0-0m/README.md).

- **Builds:** A = g0.0l (JS 4106679e0a8a / CSS 440582cec781), V = g0.0m (37af49aef32b / 7a8ecdd8f8e4). Both were built
  from main's patches (`fixes/g0-0m/phone/g0m-snap.sh`: `fix.mjs apply g0-0l|g0-0m --reset`, HASHES.txt e7947589f4c9, the same
  as P-175). Served plain http, `--latency 150 --vendors=local`, hashes checked before every run.
- **Input:** one fast robot flick from the top that lands on the People card. This is P-174/P-175's FLICK
  (`fixes/g0-0m/phone/g-flick-g0m.json`, compiled 22b636f36a82): reload, 4 s, mark flick, up 300 px in 220 ms, until
  settled, mark landed, 3 s, mark flick-end. `pb-lite.mjs` was injected so the reader finds the card's `+is-visible` flip.
  No Timeline.
- **Block** (`d11-go.sh` part 1, 04:27-04:30Z, A V V A): tool-held Serious (prep P0: cooled below 40 °C, `iphone.mjs rearm`,
  one uncounted warm-up flick per port). The hold's thermal reads were Serious 36.7 -> 37.3 °C, no drift, no Critical.
  Do Not Disturb was on: the moon shows in every recording's status-bar strip, with no notification.

The window is mark flick to mark flick-end (~7 s). The reveal frame is the first frame after the flip. R7 is the
longest frame among the reveal frame and the 3 frames on each side of it (P-175's primary).

| run (out/iphone-screen/ and out/rf/runs/) | build | frames | > 34 (30/38) | > 50 (46/54) | longest | reveal frame (after the flip) | R7 | lands at y |
|---|---|---|---|---|---|---|---|---|
| 20261011T042723Z-ar-revealflick-g0l | A g0.0l | 410 | 5 (5/4) | 0 (1/0) | 47 ms | 47 ms (+45 ms) | 47 | 1347 |
| 20261011T042826Z-ar-revealflick-g0m | V g0.0m | 418 | 2 (3/2) | 0 (0/0) | 42 ms | 31 ms (+28 ms) | 31 | 1416 |
| 20261011T042903Z-ar-revealflick-g0m | V g0.0m | 415 | 3 (5/2) | 1 (1/1) | 61 ms | 31 ms (+28 ms) | 31 | 1421 |
| 20261011T042942Z-ar-revealflick-g0l | A g0.0l | 414 | 3 (4/2) | 2 (2/2) | 70 ms | 56 ms (+53 ms) | 56 | 1360 |

- The reveal frame is 47 and 56 ms on g0.0l and 31 and 31 ms on g0.0m. This is the same picture as P-175 (~50 -> 30.5 ms):
  g0.0m paints the hidden card before it shows.
- The flick window's longest frames are not the reveal: g0.0m 61 ms at y 1403 and g0.0l 70 ms at y 1344 come as the
  flick lands, after the reveal. This read does not say what they are (no Timeline in these runs). The g0.0m run 042826Z
  had its longest frame (42 ms) at y 0, before the flick moved the page.
- Recorder: 59.7-59.8 fps delivered on all four (the first g0.0l recording is 44 s long because its ready step waited;
  the flick window is the same).

Files: `rf.sh` / `rf-read.mjs` (cap-end-orig), driver `d11-go.sh` part 1; reader output out/wc/rf-read.json.

# Research: deck-chrome (the profile deck "blink" on a fast fling, Chrome side)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). No patch: attribution only. The knock-out CSS strings are our own test overrides.

**Status:** research done, attribution OBSERVED in our setup (Chrome); no build.
**Stage:** R / I (user T-228 #126, #143). The attribution card belongs to the people-blink owner (fix-scrollcb-g0),
who merges this Chrome side with the Simulator and iPhone G runs.
**Driver:** Chrome scripted touch fling: `Input.synthesizeScrollGesture`, `gestureSourceType: touch`,
`preventFling: false`, from finger y 880. Every compositor frame comes from `Page.startScreencast` (png, 430 px wide = CSS px),
with a page log captured in the same window. Counts and pixels only: nothing here is a timing claim.
**Setting:** Chrome headed, 430x932 DPR 3 mobile with touch emulation, CPU 6x. Served with `--https --latency 150
--vendors=local`, each arm on its own server. 6 s idle at y 0, then one fling.
- The host was busy (shared lane): load1 7-66 per set, recorded in `results.json`.
- The cal set ran at load1 62-66 and is used only for fling calibration.
**Arms:**
- base = site-pretty;
- g0.0i = `fixes/g0-0i/patch.diff`, served CSS adb875d94c1f;
- g0.0j = `out/tryit/g0-0j`, JS 9162843e750f / CSS bee7fce9ad56.
- Served hashes were checked on every run (`run.json` `served`).
**Measurement code:** unchanged (`lib/cdp.mjs` is used as a library only).

## Result

**In Chrome, the deck does not blink. It is revealed late.** When a fast fling lands on the deck, the deck first shows
blank, then faded and blurred, then sharp. That is the `#people` future card's reveal transition, which starts only
once the hero track is 72 % scrolled. On a fast fling the deck is already on screen by then. Switching the reveal off
(knock-out K) removes every blank and blurred deck frame. Switching off the deck's own mechanisms (knock-out D:
will-change windows, scene gate, shell-hold) changes nothing. No one-frame flash (A-B-A) exists in any of 27 runs.
Everything in this section is OBSERVED in our setup.

### Mechanism (code)

- **Trigger:** baseline JS `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js:11303-11310` (g0.0j `:12360-12367`).
  - A rAF-scheduled scroll callback reads `.hero-track`'s rect.
  - It sets `is-visible` on `section#people.start-selling-future` when `scrolled / (trackHeight - innerHeight) >= 0.72`.
  - It is a main-thread rAF read, so on a busy main thread the flip comes late.
- **The reveal** (baseline CSS `2.gBuqKVzi.css:2393-2414`; g0.0j `:2632-2667`):
  - Hidden state: `.start-selling-future:not(.is-visible) > .start-selling-future-card` = `opacity: 0; filter: blur(14px);
    transform: translateY(48px); visibility: hidden`.
  - On `.is-visible` it transitions: opacity 0.7 s, transform 0.9 s, filter 1.6 s (baseline). g0 builds use 0.9 s with a
    `linear()` curve (fix re-keep-op: ends at opacity 0.999 / blur(0px)).
- **Geometry:** the deck sits inside that card (`.start-selling-future-card > … > .start-selling-profile-deck`, page log
  `info0.anc`).
  - The deck's document top is 1308 at 932 tall (1230 in the Simulator at 775).
  - The section has `margin-top: calc(1px - 100svh)`, so the card slides up over the sticky hero.
  - The deck is on screen (150 px or more of it) from scroll y about 530. The 0.72 crossing comes at y 616 or later, so
    even on time the fade starts with the deck's top already on screen.
  - On a slow scroll the 0.7-1.6 s fade finishes while the deck is still low on the screen. On a fast fling the deck
    crosses the whole screen inside the fade, so you see blank, then a ghost, then sharp.

### Numbers

Stop-on-deck fling, s1200d400: 400 px at 1200 px/s plus fling. It lands at y 1223-1264, with the deck filling the
screen (viewport 45-890).

| arm | n | blank deck frames (active shell >= 90 % white) | deck y while blank | `.is-visible` at screen y | landed (ms) | blur ended (ms) | blur after landing |
|---|---|---|---|---|---|---|---|
| base | 3 | 82, 70, 35 | 528-790 | 680-700 | 2136, 2126, 1619 | 3036, 3035, 2520 | +900, +909, +901 ms |
| g0.0i | 1 | 78 | 526-791 | 662 | 2108 | 2329 | +221 ms |
| g0.0j | 3 | 39, 56, 34 | 529-791 | 672-679 | 1675, 1848, 1603 | 1897, 2048, 1821 | +222, +200, +218 ms |
| base + K | 2 | 0, 0 | - | 622-675 | 2330, 1658 | no transition | 0 |
| g0.0j + K | 2 | 0, 0 | - | 718-721 | 1732, 1640 | no transition | 0 |

Landing fling, s1500d500 (lands y 1551-1586, deck in the top 520 px):

| arm | n | blank deck frames | blur ended vs landed |
|---|---|---|---|
| base | 1 | 25 | 2277 vs 2221 ms (+56) |
| g0.0i | 1 | 21 | 1570 vs 2204 ms (-634) |
| g0.0j | 1 | 24 | 1587 vs 2205 ms (-618) |
| base + K | 1 | 0 | no transition |
| g0.0j + K | 1 | 0 | no transition |
| g0.0j + D | 1 | 26 | 1626 vs 2242 ms (-616), same as g0.0j |

- **Blur after landing separates the arms.** base keeps the deck blurred for ~0.9 s after it lands; g0.0j and g0.0i
  for ~0.2 s.
  - That follows from the CSS, not from timing: filter 1.6 s in base vs 0.9 s in g0.
  - This matches the user's notes: the original blinks, and our builds blink less.
- **Blank frame counts overlap** between base (35-82) and g0.0j (34-56) at n = 3. Chrome at 6x does not separate how
  late the flip is between builds. g0.0i's longer frames (the Simulator/iPhone finding from fix-scrollcb-g0) are not
  resolved here (g0.0i n = 1).
- **No one-frame blink.** The A-B-A detector (`analyze.mjs steps`) compares each frame with the frames before and after
  it, with rows matched by document position over the deck. Its peak is at most 5.3 % of deck pixels in any run, K
  included. That level is the fixed nav bar overlapping the matched rows (it alternates pairwise, 4.8 / 0 / 4.8), not
  deck content. A real flash would show tens of percent.
- **Lazy photos ruled out in Chrome.** No `load` event fired on any deck image in any fling window.
  - The active shell's visible photos were already loaded at page load: the deck is 376 px below the first viewport,
    inside Chrome's lazy-load margin.
  - Shell 1's photos stay unloaded: it sits off to the side in the horizontal scroller.
  - fix-scrollcb-g0 sees 24-34 image loads on the iPhone during the fade, finishing ~0.5 s before the blur ends.
- **Deck-local events.** In g0, `data-fw-wc` goes 1→0 on shells 0-1 and the scene goes to paused only after the deck
  leaves. `fw-c-shell-hold` runs on shells 2-5 only, which are off the deck's scrollport. D removes all three with no
  pixel change.

### Frame strips described

All strips are under the worktree's `out/deck-chrome/` (gitignored). Each is 12 frames taken at 0.6, 0.8, 1.0 … 2.2, 2.6,
3.0, 3.4 s after the fling starts.

- `stop-2026-10-09T06-41-06/strip-base-stop.png`, base:
  - frames 1-5 (y 551-759): the grey hero text over white; the deck area is blank;
  - frame 6 (1.6 s, y 1000): the deck appears heavily blurred and faded;
  - frame 7 (1.8 s): still soft;
  - frames 8-12: sharp; the blur fades out over the last ~0.9 s after landing at y 1239.
- `stop-…/strip-g0j-stop.png`, g0.0j:
  - frames 1-3: blank or ghost;
  - frame 4 (1.2 s, y 1043): blurred;
  - frame 5 (1.4 s): almost sharp;
  - from frame 6 (1.6 s, landed y 1227): sharp.
- `koKstop-2026-10-09T06-46-42/strip-g0j-K-stop.png`, g0.0j + K: the deck is sharp in every frame from its first
  appearance. The look differs: the people title shows over the hero text at y ~540. That is why K is attribution
  only, not a fix.
- `cal-…/base-s3000d700-r1/f0083.png` (loaded host, load1 ~65): a 1.1 s main-thread stall delays the transition start
  (class flip at 352 ms, `transitionrun` at 1197 ms). The deck stays blank, then shows fully blurred while the scroll
  waits. This is the worst case of the same mechanism.

## Cases

| case | Chrome shows | why |
|---|---|---|
| fast fling that lands ON the deck (stop at y ~1240) | blank, then blur, then sharp; base still blurred ~0.9 s after landing, g0 ~0.2 s | reveal starts at y >= 616 and runs 0.7-1.6 s |
| fast fling past the deck (lands y >= 2000) | the deck passes through blank or blurred | same; the user never sees it sharp on the way |
| slow scroll | sharp by the time the deck is mid-screen | the fade finishes while the deck is low |
| very fast fling at 6000-12000 px/s | the deck is on screen for only 1-7 frames | nothing to see |
| reduced motion | not run | the trigger uses `e.matches ||` (reveal at once), CSS untested here |

Chrome cannot show WebKit-only effects: tile or backing-store latency, async image decode, raster. The CPU-6x setting
slows only the main thread (claims-audit §2.6). fix-scrollcb-g0's Simulator and iPhone G runs show the same reveal and
nothing else on the deck.

## Fix idea (for the people-blink owner; a look change, so a proposal with Try-it)

1. **Reveal at once when the deck is already in view.** When `is-visible` flips while the card's lower part is on
   screen, or on a fast scroll (the rAF callback already knows the scroll delta), apply the end state without a
   transition. One class, e.g. `is-visible-instant` with `transition: none`.
   - Slow scrolls keep today's fade.
   - Fast flings get no blank and no blur.
   - Cheapest, and it keeps the slow-scroll look.
2. Or drive the fade from the scroll position instead of time: a scroll-driven animation on the hero track, opacity and
   blur as functions of progress. Then it cannot lag the main thread, and it finishes before the deck top crosses the
   bottom of the screen. Compositor-side opacity, per the GPU playbook. Larger look change.
3. A cheap partial: shorten the blur to the opacity's 0.7 s, or drop the blur. That cuts the "sharp pops in" tail. g0's
   0.9 s already did most of it vs base's 1.6 s.

## Files

- `probe/fling.mjs`: the probe. Arms, cases, knock-out CSS/JS injection, screencast frames and the page log. Run it in
  a shared probe slot: `lock.mjs run chrome-measure --shared --weight probe --max-seconds 300`.
- `probe/analyze.mjs`: frame stats, `final` (vs last frame), `steps` (A-B-A detector), `summary` (reveal timeline),
  `strip` (PNG strips).
- `probe/knock-K-reveal.css` and `probe/knock-D-deck.css`: fix-scrollcb-g0's knock-out strings, used verbatim.
- `results.json`: every run's summary (reveal times, blank frames, landing, max A-B-A) and each set's host load.

# Before/after capture for the study article

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). The
> user decided to publish page visuals for education (T-170 #30-#47); this capture is for the article's
> "Before and after" section (T-170 #49).

`before-after.mjs` records the ORIGINAL page (the frozen baseline snapshot) and one fix build in Chrome, with the
same scripted input on both sides. It encodes one side-by-side MP4 per scene and writes the article's `<figure>`
snippet. `node research/team-article/capture/before-after.mjs --help` lists every option.

## Run it

```sh
# capture (Chrome, a normal timing hold of chrome-measure; 3 scenes x 2 sides x 3 runs, about 6 min), in the background:
node tools/lock.mjs run chrome-measure --owner art-beforeafter --max-seconds 480 \
  --doing "before/after capture for the article" -- \
  node research/team-article/capture/before-after.mjs --phase capture --build v8-best
# encode (ffmpeg, H.264 only; the script takes a --no-timing hold itself):
node research/team-article/capture/before-after.mjs --take-lock --phase encode --build v8-best
```

- **v9:** pass `--build v9-best` (`fixes/v9-best/patch.diff`), plus `--label v9` if you want a shorter name.
  `--build` also takes a patch file or an overlay directory.
- **Lock:** the script refuses to run outside a chrome-measure hold. `--take-lock` makes it take the hold through
  `tools/lock.mjs run` itself: a timing hold for capture, a `--no-timing` hold for encode. The default
  `--phase all` does both in one timing hold.
- **Servers:** `tools/serve.mjs --vendors=local --https --latency 150 --port auto` for each side. The script
  starts them and kills them when it exits. It never uses port 5173.
- **Output** (in `out/before-after/<build>/`, gitignored):
  - `<scene>.mp4`: one per scene, capped near 1 MB (`--max-mb`);
  - `snippet-pages.html`: for GitHub Pages, with the MP4s referenced as `media/<scene>.mp4`;
  - `snippet-artifact.html`: for the single-file artifact, with the MP4s inline as data: URIs and a fallback
    line pointing to `--pages-url`;
  - `capture.json`: the setup, the counts, every screencast stamp and the rAF log behind the strips.

## Method, and why

| option | what it shows | what it can't show | used? |
|---|---|---|---|
| CDP `Page.startScreencast`, headed Chrome, calibrated setting | the page's own frames, each stamped by the browser, so a stall shows as a freeze | frames the capture skipped while it waited for an ack (both sides alike); the capture's own cost (a GPU readback and a JPEG per frame, on both sides) | **yes** |
| trace screenshots (`disabled-by-default-devtools.screenshot`) | a frame per present, inside a trace | tracing perturbs timing (verify.mjs says so for `--trace-frames`); the images are small | no |
| frame-time strip from an in-page rAF logger | every frame's duration, including short hitches the 30 fps video can't show | what the frame looked like | **yes, under each clip** |
| capture both pages at once | one shared clock | the two pages would compete for the Mac's CPU | no: one after the other, sides alternating per scene, both clocks started at the first input |
| GIF / animated WebP | plays everywhere as an image | any ffmpeg image output is blocked by git-guard (I-064); the lead ruled MP4 only | no |
| MP4 (H.264) | small, plays in `<video>` | data: video inside the claude.ai artifact is unverified; hence the fallback line | **yes** |

Setting (CLAUDE.md "Calibrated measurement setting"):
- viewport 430x932, DPR 3, touch emulation;
- CPU throttle 6x, which reproduces the iPhone 15 Pro Max's scripted-scroll jank counts on this page (OBSERVED
  in our setup);
- the mirror served with `--vendors=local --https --latency 150`.

Input is verify.mjs's own: `scrollBy({top: 250, behavior: 'smooth'})` every 300 ms. The end scene adds verify's 4
touch drags past the end (`Input.synthesizeScrollGesture`).

Scenes (`--scenes`, default `hero,switch,end`; `full` is one top-to-menu run):

| scene | start | input |
|---|---|---|
| hero | top | 2 s at rest, then a scroll to 1,500 px |
| switch | 1,900 px | a scroll to 3,400 px, through the section switch at about 2,600 px |
| end | 1,100 px above the bottom | a scroll to the bottom, then 4 touch drags (the menu morph) |
| fling | top | 3 s at rest, then fast flicks down until past 1,800 px, flicks back up to the top, twice (`fixes/v8-best/phone/g/flick-hero-v1.json`) |
| load | top | a warm load, then CPU 6x, a reload, and 3 fast flicks 350 ms apart from about 0.3 s after DOMContentLoaded (`flick-fresh-v1.json`) |

`fling` and `load` (T-170 #75/#76, worst cases) run only when named in `--scenes`. They port the phone robot's own
flick scripts, chosen before any capture and not tuned on the result. A flick is the scripts' stroke: a 560 px touch
swipe in 140 ms (`Input.synthesizeScrollGesture`, touch, 4,000 px/s, `preventFling: false`, so the page keeps
gliding), sent from Node with scrollY polled between flicks. Down flicks are 350 ms apart, up flicks 1,200 ms. CDP's
swipe moves at a constant speed, while the phone's speeds up to its lift-off. Chrome's glide goes farther: one flick
carries the page about 2,900 px, and the call returns when the glide ends (2.3 s). In `load` the page also loads under
the 6x throttle, the rAF logger is injected before the document's first script, and the clip starts at the first
flick. `capture.json` keeps every flick (direction, scrollY before, call time).

**Cropped scenes** (T-170 #87, "the four trouble spots"): a scene with a crop selector, or any scene run with
`--crop <selector>`, is cut to that element. The script reads the union of the matching elements' viewport boxes
(`getBoundingClientRect`) twice per run, before the screencast starts and after it stops, so the reads add no work to
the recorded window. The clip's rectangle is the union of both shown runs' boxes, plus `--crop-margin` (16 CSS px),
clamped to the viewport; both sides get the same rectangle (`capture.json` `scenes.<s>.crop`). The cut is made in the
encode step (ffmpeg `crop` + `scale`, MP4 only, no image output). A cropped scene's screencast is taken at 2 px per
CSS px (`--crop-dpr`, 860 px wide instead of 432) so the zoom stays sharp; that costs a little more on both sides.
The panel is `--crop-zoom` (2) times the CSS size, at most 420 x 640. `--self-test` checks the crop geometry
without Chrome.

`--keep-frames` keeps the screencast JPEGs in `out/<run>/frames/` after encoding (gitignored, never viewed or
committed), so a later `--phase encode` with another `--fps` or crop needs no recapture. Without it the encode step
deletes them, and a later `--phase encode` on that capture refuses.

Each side of each scene gets a fresh isolated context, a load and a settle. The page is then moved to the
scene's start in 300 px steps (unthrottled), throttled, and recorded.

Runs: `--runs 3` by default, with the sides alternating per run (A B, B A, A B). Each clip shows that side's
**median** run: runs are sorted by frames of 54 ms or more, then 37.5 ms or more, then the longest frame. That way
the clip is neither a lucky nor an unlucky run. The snippet lists every run's count, and `capture.json` keeps
every run's counts. The unshown runs' frames are deleted at capture time.

Encoding:
- Each side's frames are laid on an `--fps` grid (30 by default, 60 for the T-170 #89 captures) by their stamps: a
  grid slot shows the latest frame drawn by then. The screencast delivers 80-94 frames/s and the page draws 81-115
  (lead, T-170 #89, from the v8 capture), so even a 60 fps clip drops frames and can't show Chrome's 120 Hz frames
  one to one; the strip shows every frame.
- The strip under each panel is that run's rAF log. Bar width is the frame's duration and height is its dt, up to
  100 ms. Colors: grey for on-time frames, amber for k>=5 (dt >= 37.5 ms), red for k>=7 (dt >= 54.17 ms), the
  study's Chrome thresholds.
- A white playhead runs across both strips.

## What it can't show (say so in the caption)

- **It is an illustration, not a measurement.** Three runs per side is far too few for a verdict, and the capture
  costs work on both sides. The article's numbers come from repeated A/B runs. The counts under each clip
  describe this capture only. In the first one-run test capture (2026-10-05), the end scene had more slow frames
  on v8 than on the original (7 vs 2 frames of 37.5 ms or more): a single run can point either way.
- **Chrome is not the phone.** The 6x throttle slows only the main thread. It can't stand in for raster or GPU
  cost, WebKit-only costs, the real phone's feel, or a finger on the glass (CLAUDE.md, claims-audit §2.6).
- **Chrome understates part of the work.** Several v8 changes act only in Safari: the hero's live CSS mode
  (WebKit touch phones only), and the animations moved to where Safari can run them on its scroll thread.
- **The video can't show every hitch.** A 30 fps video can't show a hitch shorter than about two of its frames,
  and a 60 fps one can't show Chrome's 120 Hz frames one to one; the strip shows every frame.
- **No phone at all.** The iPhone, its screen recorder (`tools/ioscap.mjs`, user T-018) and the Simulator are not
  used.

## Rules this script keeps

- **Lock:** chrome-measure is held for any Chrome or encoder work (Hard rule 7). The capture runs in one hold
  under 8 minutes; phone-block holds go first.
- **Quiet Mac:** a capture hold granted after a host-gate TIMEOUT (the Mac never got quiet in 600 s) refuses with
  exit 3 and captures nothing; requeue. `capture.json` `hostGate` keeps the gate record of the hold.
- **No image output from an encoder** (git-guard I-064; lead ruling 2026-10-05). The only ffmpeg output is
  H.264 MP4. The screencast JPEGs are intermediate files nobody views, and the encode step deletes them
  (unless `--keep-frames`); `capture.json` keeps only their timestamps.
- **What gets committed:** media over 2 MB stays in `out/`. The baseline is only read: the after side's overlay
  is built in `out/` with `git apply` from the build's `patch.diff`.

## Captures

| dir | build | captured | shown-run counts, frames of 54 ms or more (original → build), all 3 runs |
|---|---|---|---|
| `v8/` | `fixes/v8-best` (JS 3e3e94cb6e9f, CSS f836404b3728), baseline b1789284481295-4ad4a84a | 2026-10-05, Chrome, 3 runs | hero 2 → 0 (3,1,2 → 0,0,4); switch 2 → 1 (2,2,2 → 1,1,1); end 0 → 1 (1,0,0 → 1,1,1) |
| `v8/` worst cases | the same | 2026-10-05 03:28Z, Chrome, 3 runs | fling 4 → 2 (6,3,4 → 6,2,2: runs overlap, no clear difference); load 14 → 3 (9,14,17 → 9,3,2) |

`v8/` holds the three MP4s (`media/`, 0.6 MB together), both snippets (the artifact one carries the MP4s as data:
URIs, 0.85 MB, and a `PAGES_URL` placeholder in its fallback line) and `summary.json` (every run's counts). In
Chrome the end scene shows no gain.

The worst-case capture (`--scenes fling,load --out out/before-after/v8-best-worst`) added `media/fling.mp4` (0.72 MB)
and `media/load.mp4` (0.31 MB), `worst-summary.json` (counts and flicks, no frame stamps) and `worst-cases.html`: the
article fragment "Worst cases on the original" with a ranked table of the original's worst phone recordings and the two
clips. `worst-cases-artifact.html` is the same with the MP4s inline (1.4 MB, `PAGES_URL` placeholder in the fallback
lines). The article's end-of-page result (2 → 0) is an iPhone number, and Chrome has
about one slow frame there per run on either side.

## Phone clips (T-170 #101): the real iPhone's screen, original | v8

`phone/` records the iPhone 15 Pro Max's screen with `tools/ioscap.mjs` (the only allowed recorder, I-062) while the
phone robot drives the original page (A, `site-pretty`) or v8 (V, `fixes/v8-best`) with the same input, then crops
and encodes side-by-side MP4s. Plan approved by the lead with changes (2026-10-05 04:3xZ); everything stays in the
gitignored `out/phone-clips/` and `out/iphone-screen/` until the user has OKed each MP4.

- `serve.sh snap|start|check|stop`: read-only snapshot copies of both builds (hashes checked before every run), plain
  http, `--latency 150`.
- `hold.sh H<n> [--dnd] <items>`: one phone hold. Items `<scene><arm><n>` in C V V C order per scene: `e` end of the
  page (G, `flick-end-v1`), `s` scripted scroll top to bottom (S, `iphone.mjs run --driver scroll --probe std`), `h`
  fast flicks through the top card (G, `flick-hero-v1`), `f` flicks right after load (G, `flick-fresh-v1`). Thermal
  profile **serious** (Xcode heat mode on; the lead's change from fair): every clip is labelled "Xcode heat mode:
  Serious". The thermal read at the hold's start refuses a misfit.
- `vv.mjs`: one visualViewport read (height, offsetTop, scale) at the start, after the ready check and at the end
  of every run.
- `phone-clips.mjs [--motion] [--no-encode]`: per-run numbers, the traces and the MP4s (`--self-test`: 20 checks).

### What the clip shows, and what it doesn't

- **The strip is the page's own frame log; the video is the screen** (lead's change 1 and article wording). The
  strip under each panel is drawn from the driver's rAF stamps with the phone thresholds (amber dt > 34 ms, red
  dt > 50 ms). The capture's distinct-frame gaps over the same window are printed beside them as a cross-check only.
- **CAPTURE-DIFFERS in every run.** The page log has many slow frames, but the screen capture has almost none. In H1
  eA2, for example, the page has 62 frames over 50 ms and the capture has 1. The reason:
  - On iOS, Safari's page scroll view (`WKScrollView`) lives in the UI process, and Core Animation moves it there.
    A scroll only schedules an asynchronous visible-rect update to the web process, and fixed/sticky layers are
    repositioned "even when visible content rect updates are deferred". So the screen keeps scrolling at full rate
    while the page's main thread is late. CONFIRMED by the source (WebKit/WebKit at
    9eb4e2ad5983af0d494b62b38e55ff9010fb5993):
    - `Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm` line 224 (`_scrollView = adoptNS([[WKScrollView alloc]
      initWithFrame:bounds])`);
    - lines 2401-2416 (`scrollViewDidScroll:` only calls `_scheduleVisibleContentRectUpdateAfterScrollInView:`);
    - lines 3132ff (the update is deferred to a CATransaction pre-commit handler);
    - lines 3391-3400 (`_updateViewportRelativeLayersOutOfBand`);
    - overflow scrollers are the same: `Source/WebKit/UIProcess/RemoteLayerTree/ios/ScrollingTreeScrollingNodeDelegateIOS.mm`
      lines 77-96 and 560-566.
  - That this is what our capture shows stays OBSERVED (our runs only).
  - What a viewer can see is the script-driven parts arriving late. So each run also gets a numbers-only motion
    trace of one script-driven region next to the page box: the top bar for e/s, which the original recolours by
    script over dark sections; the hero card band for h/f. Its lag against the page's scroll speed and its stale
    frames are reported: the region is "stale" when its change is under 0.25 × its p90 change while the page moves
    faster than 0.1 px/ms.
- **Clock.** Page `performance.now()` maps to Mac wall time (G: the sync pairs; S: the probe's clock pair), then to
  `CLOCK_UPTIME_RAW` (stamps around every run), which is the capture's PTS clock. That last step is OBSERVED: the motion
  trace of the page box must correlate with the page's scroll speed within ±50 ms at r ≥ 0.5, or the clip is not
  made (CLOCK-CHECK FAIL).
- **Crop by geometry (privacy, lead's change 2):** the page-area box is y 119-826 pt of 932, full width: no status
  bar, and no Safari bar in either position. The end-scene close-up is made only when every viewport read has
  offsetTop 0, scale 1 and height 770-820; otherwise it is dropped, never widened. Nobody opens or reads a frame or
  an image from `out/iphone-screen/`, and ffmpeg's only outputs are MP4s and metadata text.
- **The end menu did not open** in the `flick-end-v1` runs: the records' `morph` is empty. So the e scene shows the
  end of the page and the flicks out of it, not the menu's opening.

### The holds (2026-10-05)

| hold | runs | thermal (start → end) | Mac load1 | notes |
|---|---|---|---|---|
| H1 04:37-04:47Z | eA1 eV1 eV2 eA2 sA1 sV1 sV2 sA2 | Serious 38.29 °C → Serious 40.19 °C | 9.6-16.1 | eA1 and sV1 have no driver record. The recorder start dropped the inspector and WDA links ("fetch failed", "no Safari tab"); OBSERVED, cause unknown, likely the USB link re-forming. eV1 started at 16.1, just over the line. |
| H2 04:48-04:56Z | hA1 hV1 hV2 hA2 fA1 fV1 fV2 fA2 eA1 sV1 | Serious 40.09 °C → **Critical 41.5 °C** (PROFILE-DRIFT on all 10 records) | 10.0-10.5 for hA1 only; **55-225** for the rest (MAC-LOADED) | hA2: no capture (ioscap app exit 7, "no frame arrived from the iPhone screen"). eA1 and sV1 are the H1 redos, recorded out of C V V C order. |

- **Ready check (added after H1, lead OK):** before each driver, `hold.sh` waits until WDA answers and the tab is
  listed (a viewport read). On failure it re-opens the URL, up to 6 tries. Every H2 run was ready after 0 retries.
- **MAC-LOADED** (lead, 2026-10-05): any run with load1 > 16 at its start or end. The lead's rule: never use one for
  the capture-vs-page comparison, and never publish a drifted run. The clip picks the **first clean run of each arm**
  (no error, not MAC-LOADED, no profile drift; this rule replaced "run 1" before the clean runs' traces were read).
  With hold 1 that makes e = eA2 | eV2 and s = sA1 | sV2. h and f have no clean pair, so no clip.
- **Redo slot (listed, after v9's phone work; the lead slots it):** h (hA1 hV1 hV2 hA2), f (fA1 fV1 fV2 fA2), eA1
  and sV1, about 8 minutes of runs. Conditions:
  - The phone part runs inside the runner's own `--no-timing` chrome-measure hold, so no shared or Simulator job
    runs beside the capture, with `FW_PHONE_REQUIRE_QUIET=1`.
  - The phone first cools below 40 °C (`wait.mjs phone-temp --below 40`) so the runs stay Serious.
  - Another ioscap exit 7 opens an incident.

### Clips made (2026-10-05 05:1xZ, hold 1; in `out/phone-clips/clips/`, not published before the user's OK)

| clip | shown | page log >34 / >50 (twins), original → v8 | capture >34 / >50 | clock lag, r | top-bar trace (lag, stale, longest stale) |
|---|---|---|---|---|---|
| `phone-e.mp4` (817 kB), `phone-e-close.mp4` (989 kB) | H1 eA2 \| eV2 | 138 (162/128) / 62 (75/54) → 9 (20/4) / 2 (2/1) | 1/1 → 0/0 | −4 ms .70; 4 ms .84 | 4 ms 66 % 3.5 s; 8 ms 73 % 3.1 s |
| `phone-s.mp4` (930 kB) | H1 sA2 \| sV2 | 19 (24/15) / 9 (12/5) → 5 (8/5) / 1 (3/0) | 0/0 → 0/0 | 4 ms .73; 8 ms .76 | ~316 ms 60 % 1.0 s; ~312 ms 61 % 1.0 s |

- **S-run clock fixed** (0967f805). The probe's clock pair is the phone's own `Date.now()`, about 225 ms behind the
  Mac's. The offset now comes from the run's own viewport reads. On eV2 that offset agrees with the G sync pairs
  within 4 ms. sA1 still fails the check (308 ms, r .68) and isn't shown. The "clock passed" condition was added to
  the pick rule after that failure; it says nothing about the run's frames.
- **h and f: no clip.** There is no clean pair. hA1 (clean Mac) fails the clock check (236 ms, r .47): the hero
  animates by itself, so the page box's motion is only loosely tied to scroll (OBSERVED).
- **The region traces don't separate the arms.** The top-bar r is .44-.59, with 60-73 % stale on both sides. The
  content blurred through the glass bar is UI-process motion and swamps the script-driven colour flip. The ~310 ms S
  lag on both sides is a correlation artefact of a near-constant-speed scroll, not a delay. So these numbers don't show
  a visible late script update, and the article can't claim one from them.

### Nav colour switch overshoot (`phone-clips.mjs --overshoot`, lead 2026-10-05; page log only, OBSERVED)

For each top-bar `is-on-dark` switch in the scripted-scroll runs, this measures how far the scroll has gone past the
section edge when the class flips, and how late that is.
- The edge is the lowest switch y over all S runs. That is an upper bound on the true edge, so every overshoot here
  is a lower bound.
- Lateness is interpolated between frame stamps. It is only good to about one frame: switches that are on time read
  −18 to −2 ms.

| switch (edge ≤) | H1 sA1 | H1 sA2 | H1 sV2 | H2 sV1 (MAC-LOADED, drift) |
|---|---|---|---|---|
| 1 on dark (2144) | 50 px, 36 ms | 2 px, −15 ms | 0 px, −15 ms | 10 px, −5 ms |
| 2 off dark (2922) | 180 px, 195 ms | 28 px, 24 ms | 3 px, −12 ms | 0 px, −18 ms |
| 3 on dark (4117) | 0 px, −16 ms | 7 px, −8 ms | 21 px, −3 ms | 30 px, −2 ms |

- The original was late at 3 of its 6 switches (36, 195 and 24 ms). v8 was on time at all 6.
- v8's px figures at switch 3 come with on-time lateness, so they show scroll speed, not delay.
- sA1 failed the video clock check, but that check concerns the capture, not this page-log measure.
- sV1's Mac load affects the capture, not the phone's own log; its profile drift (the phone ended at Critical) still
  applies.

Review step: C-058 (user console). It covers `phone-e.mp4` and `phone-s.mp4`; `phone-e-close` was dropped by the lead.
The review page `out/phone-clips/clips/review.html` has the MP4s inline and is served on 127.0.0.1 only.

### Second round: the user's scenes (C-058 notes, T-183; lead's plan 2026-10-05 05:3xZ)

The user rejected both clips (C-058, 05:31Z): they took the first draft (Chrome clips in the article) for the iPhone.
They named what they want to see side by side on the real phone: the hero card fade-out (first), the end of the
section, the user carousel, the "People still need people" title, the countdown clock, and (T-183) one smooth scroll
from the top to the end of the page. Everything below was fixed, and dry-run on the Simulator, before any phone data.

- **Every clip says it is the real iPhone.** The first line of each video's label strip reads "Real iPhone 15 Pro Max
  screen recording (Safari) - heat: Serious (Xcode)" (lead's change 5), not only this README.
- **Scenes and clips** (driver G, robot finger, same input on both arms; speeds fixed in the scripts in `phone/g/`):

  | clip | priority | run scene | script | window | picture |
  |---|---|---|---|---|---|
  | a hero cards fading out | 1 | a | `g/hero-fade-v1.json` | fade mark to end (3 drags of 400 px in 2.4 s, ~178 px/s) | page box |
  | p whole page, top to end | 2 | p | `g/full-page-v1.json` | page mark to end (560 px drags in 2 s, ~300 px/s, until y ≥ 5150) | page box |
  | c countdown at rest | 3 | a | same run as a | 6 s from the same whole second of the page clock on both arms | crop |
  | d user avatar carousel | 4 | n | `g/people-v1.json` | the last 6 s, at rest | crop |
  | t "People still need people" | 5 | n | same run as d | the quick stroke that brings it in, its animation, 4.5 s at rest | crop |
  | e end of the page | 6 | e | `flick-end-v1` (hold 1) | as before | page box |
  | s nav colour switch | 7 | s | S driver (hold 1 data) | as before | page box |

- **Countdown, same seconds** (lead's change 4). `hold.sh` starts the recorder at Mac second :20-:27 and the driver at
  :40, so the 12 s rest of scene a spans about :43-:55 of the page's clock. The clip starts at the first whole second
  of the page's own clock (`Date.now()`, the Mac clock minus the offset `vv.mjs` reads) that is the same second of the
  minute on both arms and leaves 6 s inside both rest phases. The minutes differ by the time between the runs. The
  frozen page counts down to 2026-11-02 05:00Z (the clip's label says so).
- **The title animates once.** Its "o" plays 1.3 s after the heading is 35 % visible and resets when it leaves
  (IntersectionObserver, JS 6225-6268; OBSERVED on the Simulator: 3 class changes within 0.75 s). So `people-v1` brings
  it in with one quick stroke that ends at rest (480 px in 700 ms, finger held), and the animation plays in place.
- **The carousel is the community pill's avatars** (`.start-selling-avatars.is-carousel`, 104x32 px). It changes about
  every 1.03 s (Simulator, 19 changes in 10 s, enter and exit about 210 ms apart). Other "carousel" candidates on the
  page: the seller profile showcase and the review-card marquees in the platform section; the user's review settles it.
- **Hero cards** (Simulator sweep): opacity goes from 1 at the top to 0.65 at y 900 and the cards scatter; after that
  they move up with the page. Scene a's drags cover y 0 to ~1150.
- **Crops** are full-width screen bands around the element where each run's page actually came to rest: document y
  from the geometry read with the page scrolled to it (`rects.mjs`; the content below the hero sits 48 px higher once
  the page is scrolled, Simulator), minus the run's resting scroll y (median of the second half of the window), plus
  59 pt (viewport top on the screen; OBSERVED assumption, checked on the countdown clip: its band must show ~6 isolated
  changes 1 s apart), padded 28 pt. Each arm is cut at its own band; the two bands have the same height. The phone's
  own geometry read (`hold.sh` item `rA`/`rV`) replaces the Simulator's when present.

  Simulator gesture dry run (counts only, arm A, 2026-10-05 05:50Z; scroll y from the touch records): `full-page-v1`
  10 drags of ~550 px, 0 to the end (132 px of rubber band on the last one), 35 s from mark to end; `hero-fade-v1`
  y 0 to 1170, 12 s rest then 13 s of drags; `people-v1` y 50 (title off screen), 520 after the quick stroke, 1730
  after the drags. WDA-sim took 0.5-1.4 s from a mark to the first touch (the windows start at marks).

  Planned bands (Simulator geometry, before phone data; screen pt of 932, full width 430):

  | crop | element (doc y, height) | resting scroll y | band |
  |---|---|---|---|
  | c countdown | 364, 88 | 0 | 395-539 |
  | t title | 888, 82 | ~520 | ~399-537 |
  | d community pill (avatars) | 2050, 85 | ~1730 | ~351-492 |

- **Clock check per new scene** runs over the scene's window only (`CLOCK_IN_WINDOW`), since the hero's own animations
  at rest swamp the scroll signal over a whole recording (H2 hA1). c and t/d use the check of the run they are cut from.
- **Size.** Each MP4 stays under 1 MB: crf 26 to 38, then once more at 85 % of the width (the long full-page clip).

#### Holds H5 and H6 (2026-10-05), and a POST-HOC clock check for scene a

- **H5** (06:59-07:08Z; Serious induced by Xcode throughout, battery 31.9 to 35.8 °C): aA1, aV1, aV2, aA2, pA1 recorded;
  pV1, pV2, pA2 refused by the gesture driver (the Mac hold had < 150 s left, I-112): the fixed-second waits of the
  `a` items used the 600 s cap, which the plan had not counted. `hold.sh` now checks the time left before each item
  (180 s, 260 s for an `a` item) and ends the hold instead (STOP budget, exit 3). **H6** (07:14-07:18Z; Serious,
  34.2 to 35.6 °C): pV1, pV2, pA2 recorded. aV2 is MAC-LOADED (load1 22.4 at its start) and stays skipped.
- **The pre-set clock check failed on every clean hero-fade run** (correlation of the capture's motion with the page's
  scroll speed over the fade window; rule |lag| <= 50 ms, r >= 0.5): aA1 544 ms r 0.41, aV1 252 ms r 0.34, aA2 504 ms
  r 0.41 (the same lags over the whole run). By the rule, clips a and c were not made.
- **Reason (OBSERVED, in our setup, cause not confirmed):** in the hero scene most of the screen's motion is the cards'
  own fade and move, which trail the scroll (more on the original: A's lag ~2x V's), so the motion trace does not
  follow the scroll speed. The H2 hero run failed the same way (hA1 236 ms r 0.47); the end-of-page runs passed.
- **POST-HOC replacement (lead's ruling 2026-10-05 ~07:4xZ, after the numbers above were read):** for scene a and the
  clip c cut from it, the **drag edge**: the first scroll move in the page log after the `fade` mark against the first
  rise of the capture's motion trace (> 3x its median over the 1-3 s before, + 0.5) within 1.5 s. Every run's edge must
  lie in 0-150 ms and the two shown runs' edges within 50 ms of each other; the same rule for both arms; the shown runs
  stay the first clean run per arm (aA1 | aV1). H5: aA1 80 ms, aV1 92 ms, aA2 69 ms (spread 23 ms), so the clock link
  holds on both arms. The slow-frame strip keeps the page clock: it **leads the video by ~80 ms** (not shifted).
  `phone-clips.mjs` prints `[POST-HOC EDGE]` on such runs and writes the note into each clip's `clock` field in
  `clips.json`. The clips are illustrations, not a gain claim.
- **Scene p** keeps the pre-set correlation; the edge rule (mark `page`) applies only to a run where it fails, and is
  labelled the same way.

#### Clips made after H5/H6 (2026-10-05 ~07:5xZ; `out/phone-clips/clips/`, not published before the user's OK)

| clip | shown runs | length | size | page >34 A/V | page >50 A/V | clock check |
|---|---|---|---|---|---|---|
| phone-a (hero fade, page box) | H5-aA1, H5-aV1 | 14.3 s | 602 KB | 82 / 58 | 37 / 26 | POST-HOC drag edge 80 / 92 ms |
| phone-c (countdown crop, at rest) | H5-aA1, H5-aV1 | 6.0 s | 49 KB | 4 / 0 | 1 / 0 | POST-HOC drag edge (same runs) |
| phone-p (whole page, page box) | H5-pA1, H6-pV1 | 38.6 s | 827 KB | 157 / 87 | 83 / 51 | pre-set correlation: 8 ms r 0.55 / 8 ms r 0.63 |

- Countdown band check (VIEW_Y): the 395-539 pt band shows 6 digit changes 983-1033 ms apart on both arms, plus one
  more 217 ms after the last on both (same pattern on both arms, cause not checked); the crop holds the countdown.
- p: pA2 (not shown) failed the correlation (r 0.49) and passed the edge fallback (127 ms), labelled `[POST-HOC EDGE]`.
  The shown pair comes from two holds (pA1 H5 at 31.9 °C, pV1 H6 at 34.2 °C; both Serious under Xcode).
- All three: the capture differs from the page log (CAPTURE-DIFFERS; iOS scrolls in its UI process), as before.
- Countdown band, extra change (OBSERVED, cause unchecked): on both shown runs the band shows one more change 217 ms
  after the sixth digit change, at the same place in both arms' windows. Not checked what it is; not mentioned in the
  clip's caption (no frame was viewed; I-062).
- User review: console step C-064 (localhost review page with the three MP4s inline, captions in plain words, the
  post-hoc clock note on clips 1 and 2); answer OK / not OK + notes.

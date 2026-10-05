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

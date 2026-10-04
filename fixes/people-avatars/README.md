# people-avatars: the People title's avatar "O" (user T-107 #1), trace only

Stage: R/I (trace). No fix built. Owner: fix-hero-exit-threaded. Build traced: v7 (best build, js 8c90da217745), whose
O code is identical to best-BR2's (the Try-it the user was on).

## What the O does (JS 6783-7077 component WD, CSS 2667-2795)

- An IntersectionObserver (threshold 0.35) on #future-heading. On enter, `is-stack` is added after 1300 ms and
  `is-expanded` 120 ms later. On leave, both are removed, so the O collapses while you scroll away, and re-entering
  replays it.
- `.start-selling-future-people-o` transitions `grid-template-columns` (0.6042em → 5.25em) and `height` over 0.92 s.
  Each face transitions `max-width`/`width`/`margin` (0.4 s) and `border-width` (0.2 s), plus opacity/transform,
  staggered by `--o-face * 0.17s`. The vector O also transitions `filter: blur`.
- Mobile: the heading is 36 px, so a face is 36 CSS px (108 device px).
- The keyframes `start-selling-people-o-peel` and `-seed-out` are unused.

## Results

Chrome (trace-chrome.mjs; 430x932 DPR 3, CPU 6x, 2 reps; arm N = O transitions off):

| phase | V layouts | N layouts | V paints | N paints |
|---|---|---|---|---|
| O grows (1.5 s after is-expanded) | 57 (65-68 ms) | 3 | 289-339 | 252-255 |
| O closes while scrolling (1 s) | 50-53 (65-68 ms) | 30-34 (16-19 ms) | 258-365 | 322-327 |

- The layouts are small: a median of 12 dirty objects out of 1781, at most 4.1 ms.
- Compositor: `grid-template-columns`/`height` fail with 8224 (unsupported property). Faces, vector and stack fail too.
- Image decodes (48 of them, ~200-286 ms at 6x) happen at the leave scroll in both arms, so they are not O-specific.

iOS Simulator (sim-o.mjs, sim-why.mjs; counts only, OBSERVED, F-084):

| window, 2 s unless noted | Layouts / RenderingFrames |
|---|---|
| O opens, 3.5 s, V / N | 110 / 147, 128 / 162 (paints 174 / 189, 2.3 / 2.4 Mpx) |
| title mid-screen, O at rest | 56-73 / 82-92 (all root 430x775) |
| 2 screens above the title / 3 screens below | 112 / 112, 74 / 110 |
| at the title, paused: #people, pill, O, showcase | 89/100, 91/97, 56/80, 84/97 |
| at the title: orbit-card `container-type: normal` | 45 / 70 |
| at the title: the whole page paused | 5 / 26 |

- At rest, WebKit lays out the whole view about every frame. Each Layout sits directly under RenderingFrame, not nested
  in style.
- The driver is page animations outside #people, so the O is not the cause. Running at the title (with the hero still
  on screen above):
  - the hero accent: stroke-dashoffset, a WebKit Layout diff (F-097), and idle-frame opacity;
  - hero-cta-orbit;
  - he-bob, vinyl-spin and the countdown cells.
- Which of these drives the layout is not bisected. Finding F-227 (coupling with toolbar-resize, whose phone data puts
  a layout at this spot at 13-14 ms).

Avatars (site/selling/sellers/<id>/avatar.jpg): 480² to 730x732 px, 30.7-83 KB, about 300 KB for 6. They are shown
at 108 device px, so 4-7x oversampled (loading=lazy, decoding=async).

Phone: no data of the O opening. In iphone-runner's T-113 robot flicks and in the user's finger runs, the title stays
in view for only 0.1-0.3 s.

## Proposal idea (not built; the lead decides)

- Widen the O with transform/clip (the faces slide and scale inside a clip) instead of grid/width transitions, plus
  right-sized avatars (e.g. 216 px).
- Start and end frames can match. The in-between frames differ, so it is a proposal with a Try-it, not a pixel-identical
  fix.
- The larger lever at this spot is the per-frame layout from the hero's animations (F-227). Its owners are
  toolbar-resize and the hero topics.

## Tools

- `trace-chrome.mjs --snap <abs>`: Chrome trace with V/N arms. Shared lane, `--weight probe`.
- `sim-o.mjs --snap <abs>`: Simulator counts for open/still/close, V/N.
- `sim-why.mjs --snap <abs>`: Simulator getAnimations, Layout parent chains and a pause bisect. Both Simulator probes
  run in a `sim.mjs session --functional` in the shared lane, `--weight simulator`.
- Output goes to `out/people-avatars/` (gitignored).

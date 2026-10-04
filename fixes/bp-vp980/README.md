# bp-vp980: test-only overlay (not a fix)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The overlay contains Fastwork's code: it stays gitignored, local only, never pushed.

**Status:** test fixture, never to be landed or served to the user.
**Owner:** de-breakpoints (T-034). **Used by:** `research/breakpoints/README.md` §3.6 (hero-exit-threaded's wide
branch in WebKit, fw-sim at viewport width 980).

## What it is

One file in `overlay/` (gitignored): `index.html` with the viewport meta changed to `width=980`, so the iPhone
Simulator lays the page out 980 CSS px wide and the page's wide (desktop) JS branch runs. Nothing else changes.
Every arm of the §3.6 check (C = st6-rb2, V = hero-exit-threaded, C2 = C again) was served with this same overlay
underneath (index.html sha256 f33aff732654), so the comparison is
between builds at one forced width, not against the plain page.

## How it was made

`node tools/fix.mjs new bp-vp980` and a copy of the baseline `index.html` in `overlay/` with the one viewport-meta
edit. The §3.6 runs served an immutable copy (`out/breakpoints/snap/vp980`, see `research/breakpoints/run.sh`
header: never a live overlay).

## Evidence

`research/breakpoints/evidence.json` keeps `fixes/bp-vp980/overlay/index.html` (Fastwork-derived, must keep).
No `patch.diff` or `results.json`: nothing was A/B-measured with this as the change under test.

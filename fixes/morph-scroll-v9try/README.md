# morph-scroll-v9try: v9 with menu rev 7d (Try-it build for PR-023)

**What:** v9 with menu swipe rev 7c swapped for rev 7d, for the user's Try-it only. Not a v9 step, not for landing:
v9-best stays int-v8's.

## Rev 5 build (current): v9-final + rev 7d

User's PR-023 decision 2026-10-05 04:45Z: "waiting v9 has landed, then try to build with v9". v9-final landed as
8b5ce9b3 (`fixes/v9-best/patch.diff` 4196eaa61d96, JS 647c9ef2b1e2 / CSS e1359ab9994a: v8 + rev 7c + double-drive
+ PR-021 Join rev 3 + nav-hit-cache U1 + glue; without scroll-cb and the close rule).

**Build:** `patch.diff` 6d1632eb0ee9, baseline-relative over 2 files: JS 1b2eecc66011, CSS e1359ab9994a (unchanged).
Made by `fix.mjs apply` of v9-final's patch, then the rev 7c -> 7d change by hand (4 code lines + comments):
`__msF0` (finger y at touchstart), the lift-off rule `e > 0.1 && __msFv > -5 && __msFy - __msF0 < 300`, and the
inert `window.__msDbg` log. Check: `diff` of the JS (v9-final -> this) equals `diff` (rev 7c 428961bda278 -> rev 7d
29c0d537e0c9), the same 15 changed lines. nav-hit-cache's glue is not in those lines (fix-nav-morph applied U1 + glue
strictly on the rev 4 build, 2026-10-05).

**Function check** 2026-10-05 09:23Z (`fix.mjs check --viewport mobile`, shared lane): CHECK OK, morph reached,
0 errors, 0 4xx, 1581 elements; pixel diff vs the plain baseline top 0.23 / middle 46.61 / bottom 71.47 % (v9's own
changes vs the original page).

## Rev 4 build (earlier): v9 step 4 + rev 7d

Commit 7fe3ce18 (was 193f6899 before the rebase): v9 step 4 (JS de237379b556) + the same 15 lines = JS 5dfb36392d07,
patch.diff c9cab1a3a6ef. Function check OK 2026-10-05 04:42Z (morph reached, 0 errors, 0 4xx, 1581 elements).

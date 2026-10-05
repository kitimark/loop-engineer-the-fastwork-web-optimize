# morph-scroll-v9try: v9 step 4 with menu rev 7d (Try-it build for PR-023 rev 4)

**What:** v9 step 4 (`fixes/v9-best/patch.diff` on main, JS de237379b556 / CSS e1359ab9994a) with menu swipe
rev 7c swapped for rev 7d. Built for the user's Try-it only (user T-180 #5: "apply v9 plus your propose"; lead OK
2026-10-05 ~04:45Z). Not a v9 step, not for landing: v9-best stays int-v8's.

**Build:** `patch.diff` is baseline-relative over 2 files: JS 5dfb36392d07, CSS e1359ab9994a (unchanged from v9).
Made by `fix.mjs apply` of v9 step 4's patch, then the rev 7c -> 7d change by hand (4 code lines + comments):
`__msF0` (finger y at touchstart), the lift-off rule `e > 0.1 && __msFv > -5 && __msFy - __msF0 < 300`, and the
inert `window.__msDbg` log. Check: `diff` of the JS (v9 -> this) equals `diff` (rev 7c 428961bda278 -> rev 7d
29c0d537e0c9), all 15 changed lines the same.

**Not in it (both PR-023 arms):** nav-hit-cache (nav colour without a per-frame hit test) and morph-close-peak
(menu-close repaint). Phone tries run with Xcode's heat mode (Serious) on.



Function check 2026-10-05 04:42Z (`fix.mjs check --viewport mobile`, shared lane): CHECK OK, morph reached, 0 errors, 0 4xx, 1581 elements (as v9 step 4); pixel diff vs the plain baseline top 0.22 / middle 46.61 / bottom 71.49 % (v9's own changes vs the original page).

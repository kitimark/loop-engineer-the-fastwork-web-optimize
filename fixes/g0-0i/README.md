# g0.0i: g0.0h + the menu clock on its own layer (best-build candidate)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**What it is.** The user asked for the menu's layer costs to be cut (T-253 #10; "illusion optical is acceptable").
g0.0i is built in two steps:
- item 1 (the closed menu's overlap layers) is PR-039 keep-phase, already in g0.0h;
- item 2 is fix-menu-layers' change (`fixes/menu-layers/`), stacked on g0.0h.

The lead's ruling on P-170b (2026-10-08 ~23:00Z) names the result g0.0i. Its delta is CSS only; the JS is g0.0h's, byte
for byte. Two rules are appended at the end of the CSS, both WebKit only (`html.fw-bx`, the page's own `GestureEvent`
test from v3-W):
- the panel countdown's wrapper inside the menu centre is a stacking context at all times (`isolation: isolate`);
- the same wrapper gets `will-change: transform` only while the menu scene is `active`.

**Why.**
- The open menu's centre is a WebKit layer of ~5.7 MB (430 px wide, DPR 3). The panel clock paints its digit cells
  unlayered.
- So every frame of a tick's roll, about 0.4 s once per second while the menu is shown, re-displayed the whole centre's
  backing store.
- With the wrapper composited, a roll frame re-displays only the 1.2 MB wrapper.
- Closed, the clock is frozen and the centre is no layer, so there is no wrapper layer either.
- The constant `isolation` keeps the `will-change` flip from changing the wrapper's used z-index, which WebKit answers
  with a Layout (F-351).
- WebKit source reasoning (RemoteLayerBackingStore, ImageBufferSet; WebKit main 6d3243c9): `fixes/menu-layers/README.md`
  "Why it costs". This is a "does less work" change; no frame-time gain is claimed.

**Pins** (sha256, first 12):

| file | g0.0h | g0.0i |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | 9162843e750f | 9162843e750f (unchanged) |
| `_app/immutable/assets/2.gBuqKVzi.css` | 26d28a0a263b | adb875d94c1f |

- `patch.diff` is baseline-relative (`node tools/fix.mjs diff g0-0i`). Applying it to fresh `site-pretty` copies
  (`node tools/fix.mjs apply g0-0i --reset`) gives the pins above (checked 2026-10-08).
- `delta.diff` is g0.0h → g0.0i: the two CSS rules and their comment, appended after g0.0h's keep-phase block.
- These are the bytes measured in every gate below: the census, the seeks, P-170/P-170b (snapshot `out/menu-layers/snap1`,
  HASHES 85be2a1a2113) and the iPad check.

**Evidence** (the less-work landing rule: cost-card counts plus a short phone no-worse check; lead ruling on P-170b):

| check | g0.0h | g0.0i | where |
|---|---|---|---|
| layers / MB, menu closed (end, m = 0, and after close; Simulator) | 43 / 55.2 | 43 / 55.2 | `fixes/menu-layers/README.md` census |
| layers / MB, menu open (m = 1) | 53 / 77.3 | 54 / 78.5 | same |
| menu-centre (5.7 MB) paints over one stepped open | 196 | 11 (morph-step repaints only; the wrapper takes 187) | same |
| backing re-displayed over one open (paints × MB) | ~1117 MB | ~287 MB (−74 %) | same |
| pixels, Chrome 430x932 DPR 3 (22 stops) | – | T2 PASS (the rules don't match in Chrome) | `seek-chrome-2` |
| pixels, iPhone Simulator (14 stops) | – | T2 PASS; glyph-edge antialiasing mid-open (≤ 76 levels, ≤ 80 CSS px²), 0 at m = 1 and at every close stop | `seek-sim-1` |
| pixels, iPad Simulator desktop-class Safari 1032 px (8 stops) | – | T2 PASS, 0 consistent pixels | `seek-ipad-2` |
| phone no-worse, P-170b (G, tool-serious, S0 + S1 sentinels, C V V C, n = 2) | O1.f2 16.5 ms, open median 17 ms | O1.f2 16.5 ms, open median 17 ms; 0 frames > 50 in both | `fixes/menu-layers/README.md` "P-170b result" |

- P-170b's verdict is **PASS (n = 2, lead ruling)**. The reader `g0b-read` decides only from n = 3, so D1-D3 were
  applied by hand; every diff is 0.
- P-170, the first block (n = 3), was void: its end sentinel failed on heat (49.4 fps at 43 °C). Its counted read, kept as
  descriptive only, was also PASS (D1 −1, D2 0, D3 0/0/0).
- Visual: a T2 look-alike, as the user allowed. Mid-open in WebKit the clock text antialiases slightly differently while
  the panel is still scaled and fading in (OBSERVED, in our setup); at rest the frame is identical.
- Reduced motion: the clock snaps instead of rolling. A tick then repaints the wrapper once instead of the centre once.

**Not checked on g0.0i:**
- a phone Timeline read of the paint/composite time per roll frame. That is the decisive check for the UNRESOLVED Core
  Animation term in the menu-layers README;
- a finger (F) test.

**Open on top of g0.0i:**
- PR-040 (fix-cm-return) puts v14's end-of-page on top of g0.0h and waits for the user's pick. If the user picks it, the
  clock-layer rules need their census and T2 redone on that end-of-page.
- fix-g0-box's drag-down work (parked until the PR-040 decision).

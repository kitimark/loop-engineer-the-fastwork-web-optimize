# nav-morph (F3): the morph at the end of the page

Owner fix-nav-morph. Cost card, coverage map and the lead's decisions on V/D: `costcard.md`. V (arm-scope-c) was dropped
as a perf fix (lead, 2026-10-03: the same work as C, no touch effect anyone can reach); 9bfb4ab on fix/f3-arm-scope keeps
the record. This file covers candidate A ("tween paint diet") and the handoff.

## A, step 1: which tween paints repaint unchanged content (Simulator, 2026-10-03)

Base: C = st6-rb2 (JS 7bf7c4657d21 / CSS f523598b2a24), V = cd-strip tc (JS 6fa0e1e8a221 / CSS 982a747d9263), served
from immutable copies (served hashes checked on every load). Two functional Simulator sessions in the shared lane,
counts only (Simulator ms are never judged, F-084). M driver (`__fwMorphDrive`, 2 cycles, hold 3.5 s), Timeline Paint
clip rects cut per rAF frame on the page clock, LayerTree paintCount snapshots in the holds, isolation probes at rest.
Tools: `tween-paint-sim.mjs`, `tween-paint-read.mjs`, `tween-paint-sim2.mjs`; data in `out/f3a/` (gitignored).

V = C in every row (within ±1 paint). The Simulator's counts match the phone's P-079 attribution (hold ~4.1, open ~15,
close 13.4-13.7 paints per frame).

**Caveat, added 2026-10-03 (F-183): these counts were measured on a morph whose children were stale (WebKit).** In
the Simulator, C's nav children never follow the header's `--morph` during a tween. Affected: nav bar, logo, actions,
earn button and the panel. The cause is scene-scope R4b: `@property --morph { inherits: false }` plus
`--morph: inherit` on those children. They re-resolve only when a header class flips:
- the logo stays at the left;
- "Join waitlist" stays visible at m = 1;
- the panel's fade is frozen at the value from the `is-morphing` flip (~0.08, so opacity ~0), then jumps at the
  `is-expanded` flip (m > 0.92).

The plain baseline animates all of them. The control (`inherit-scroll-sim.mjs`, user path, a push past the end) shows:
- baseline at m = 1: children `--morph` 1, logo x 169, earn width 0;
- C at m = 1: children `--morph` 0, logo x 43, earn width 110.

So the table below counts C's broken morph, not the motion the baseline shows. "The nav bar (logo moves)" below is
really the bar's box. P-079 (phone) is affected the same way: the iPhone read by iphone-runner on 2026-10-03 (55922
st6-rb2, 55926 strip-tc) shows children 0, logo x 43, earn width 110 and panel 0.924. Status OBSERVED, cause unknown;
the reference is UNRESOLVED. The correction is `fixes/morph-inherit/`.

| phase | paints / frame | layouts / frame | style recalcs / frame |
|---|---|---|---|
| hold m=0 / m=1 | 4.3 / 4.5 | 1.2 / 1.4 | 2.0 / 2.4 |
| open tween (17-19 frames) | 15.5-15.7 | 2.0 | 3.1 |
| close tween (22-23 frames) | 13.6-13.7 | 2.0-2.1 | 3.0 |

What paints, by layer (LayerTree paintCount, names from the layer's node):
- Holds: apart from the panel clock (~0.5/frame into `.start-selling-morph-center`), every paint is the platform's
  idle animations: `.start-selling-platform-card` (430x1880, 13 MB) 2/frame, `.start-selling-platform-stage-artboard`
  1/frame; rects 57x4 ×2, 93x39, 140x39. They go on at m=1, where the platform is at `--morph-fade` 0 (opacity 0)
  under the panel.
- Tweens: the extra ~11 (open) / ~9 (close) paints are all in the nav/panel subtree, every one a layer whose size
  changes each frame and that repaints whole (clip = whole layer, OBSERVED): the 3 image column tracks (131 → 139 wide,
  images re-scaled; ~5.5/frame open, ~3.5 close, visible tiles), the header (background colour-mix and radius,
  398x52 → 406x791; 1/frame open, ~3 close), the veil (radial gradient sized by its box), the centre block (text
  re-centred), the footer, the nav bar (logo moves); 1/frame each. Painted area: ~1.08M CSS px² per open frame,
  ~0.59M per close frame; >97 % from these layers.
- The nav actions (188x36) and the language switch (73x36) paint ~0.8/frame each without changing size or content:
  sub-pixel offset moves (RenderLayerBacking, CONFIRMED in `costcard.md`). The switch has `backdrop-filter: blur(12px)`
  (compositing reason `filters`; its parent `transformWithCompositedDescendants`), so it needs its own layer.
- Isolation: stepping only the nav's `--morph` (no classes, platform untouched) reproduces the tween's paint set
  (~12/frame); stepping only the platform's `--morph-fade` gives no per-frame paints (~4 at fade start and end). The
  whole-card repaints of the aw1-10e attribution are gone on this base.

Repaints of unchanged content: (1) nav actions + language switch, ~1.6/frame, ~1 % of the area; (2) the platform card
and artboard while the fade is exactly 0 (invisible): the m=1 hold, the open tween once m ≥ 0.55 (`QM`: fade =
1 − min(1, m/0.55), ~76 % of its time) and the first ~18 % of the close tween. Everything else repaints content that
really changes with the panel size.

Fixes that follow (sent to the lead before building):
- (a) quantising the panel width/offset reaches only (1); the resized layers still change by ≥ 1 device px per frame.
  Mid-motion edge change (T-tier). Recommended: drop.
- (b) the `--morph-fade` restyle has no target on this base (no per-frame paint; R4a keeps it to one element). Drop.
- (c) `visibility: hidden` on `.start-selling-platform` while `--morph-fade` is exactly 0 (set in `S()`), identical
  by construction (invisible both ways). Probe at the m=1 hold, 73 frames: Timeline paints 407 → 51 (C), 409 → 55 (V);
  card/artboard 0; layouts unchanged; restoring brings them back. Caveat: unlike opacity 0, it also drops the subtree
  from the accessibility tree and focus order while hidden. Overlaps fix-platform-idle (glint-ca + sweep-exact moves
  these animations to the compositor), finding F-182. Less work, little smoothness.
- A cannot reach its registered "~15 → ≤ 6 paints per tween frame": the miss it pre-registered (the extra paints are
  the box's real size change). Tween frames over 34 ms are expected to stay at ~5-11 per tween, so #4 (composited
  reveal) meets the lead's threshold for a user proposal.

Lead's decision (2026-10-03): #4 now, as a console proposal for the user (drafted here, posted by the lead; no
prediction registered until the user decides). (c) is on hold until platform-idle lands; then re-count the m=1 hold and
open-tween paints on top of it (Simulator, shared slot, counts only) and build (c) only if it still saves real work,
as a less-work fix (cost card + short phone no-worse check, the a11y/focus change in its card).

(c) recount, 2026-10-03, after platform-idle (501d9f7) and morph-inherit landed. The recount ran on main's build
(decided): P = mi + platform-idle, `mpi-65052c4a3902` / `e0f92804c521`; `pi-de29ff8aa622` is the same platform-idle
build without morph-inherit and matches 501d9f7. Builds come from `c-recount-build.mjs`; the control M is
morph-inherit alone (`mi-7c61fe7d0662`). Simulator, shared slot, counts only, ms never judged.
- Tween side (`c-recount-tween.mjs`, out/nav-morph/c-recount-tween-2026-10-03T15-02-07-432Z.json, read with
  `fixes/morph-inherit/gates/tween-paint-read.mjs`):
  - In the 1.39 s m = 1 hold span, the platform card painted 168 times on M and 0 on P; the artboard 82 on M and 0 on P.
  - Hold paints per frame: m1 4.5 → 0.8, m0 4.7 → 1.0.
  - Open tween: 16.5 → 12.4-12.6 paints per frame. Close tween: 13.7-13.8 → 9.6-9.8.
  - On P, the platform layers that still paint in a tween span are only the fade's start and end (card 3, section 2,
    artboard 2). What still paints at m = 1 is mostly the panel clock (20x38) and the language switch (73x36).
- Hold side (`c-recount-hold.mjs`, out/nav-morph/c-recount-hold-2026-10-03T15-10-05-976Z.json): the m = 1 hold, about
  73 frames per window, Timeline paints.

  | window | M | P |
  |---|---|---|
  | control | 463 | 46 |
  | `visibility: hidden` | 53 | 51 |
  | control 2 | 423 | 53 |

  On P the only layer that paints is the panel centre (46-53, the clock); card and artboard paint 0 with or without
  `visibility: hidden`. Layouts per window: 47-54 on P, 136-159 on M.
- Verdict: on main's build (c) has nothing left to save (P: 46 → 51 paints, within the window-to-window spread), so
  (c) is not built (lead, 2026-10-03). Platform-idle already stopped these invisible repaints. Its accessibility and
  focus caveat is moot.

#4 (composited reveal) moved to fix-morph-gpu as N2 (lead, 2026-10-03). The prototype (untracked
`fixes/f3-reveal/overlay`, JS 1a3c97afd47b / CSS 383fe4166c68 on st6-rb2) and the `reveal-*` tools were handed over.
fix-nav-morph keeps the arm scope (pretty 12951-13089) and morph-inherit's `__mkW` writer.

Platform claims for this card:
- "Safari doesn't animate clip-path on the compositor": CONFIRMED. WebKit `Source/WebCore/css/CSSProperties.json` at
  safari-7624-branch 0f8c6795eafb755b6c7480d2a57305315fd40ae4: the `clip-path` entry (l.4172) has no
  `animation-wrapper-acceleration`; only opacity (l.7022), filter (l.10141), backdrop-filter (l.10520), transform
  (l.11995), translate / scale / rotate (l.12143 / 12164 / 12189) carry `"always"`, offset-* `"threaded-only"`.
- "time-based `linear()` easing is not accelerated in WebKit": CONFIRMED. `Source/WebCore/animation/KeyframeEffect.cpp`,
  same commit: `canBeAccelerated` (l.1926) refuses linear() with points (l.1962); the threaded early return (l.1952)
  needs `canHaveAcceleratedRepresentation` (l.3135-3146), which for time-based animations needs
  `ThreadedTimeBasedAnimationsEnabled`, default false, status unstable (`UnifiedWebPreferences.yaml` l.8339-8352).
- "WebKit keeps repainting composited descendants of an opacity-0 layer; `visibility: hidden` stops it": OBSERVED
  (Simulator, in our setup; source not checked; decisive check: RenderLayerBacking's display path for a layer under an
  opacity-0 ancestor).

## Handoff

- **#1, panel clock on the compositor roll → cd-roll-ca (when it resumes; the lead passes it on).** Extend
  cd-roll-ca's roll to the panel clock (`.start-selling-morph-panel .waitlist-closing-countdown`), gated to m ∈ {0, 1}
  (no tween running); while a tween runs keep the spring. Why the gate: layered rolling cells repaint whole when the
  resizing panel moves them by a sub-pixel offset (the cdwc mechanism, RenderLayerBacking, CONFIRMED), so a roll
  overlapping a tween could make tween frames worse. Effect: less work only (~30 rAF/s for half of each second,
  ~0.5 paints per frame at the hold); no smoothness gain (the hold is already 17 ms p95 at Serious). Pixel class: T2,
  the user's near-identical decision would have to cover the panel clock. It stacks after cd-strip tc and cd-roll-ca;
  the panel clock's layering is fix-nav-morph's cdwc rule, so tell fix-nav-morph before changing it.

## Draft ticket (NOT registered): F3 residual edge frames, attribution (fix-nav-morph, 2026-10-04)

Asked by the lead (F3 replan). Draft only: no prediction id, no registration, nothing timed run. Timing holds stay paused
under I-098 until the user answers T-052. Second read: mgmt-ops-10 (rev 1 at 3c39f49a, points 1-8 answered in rev 2),
then the lead.

**Background.**
- P-013 (arm-load) and P-022 (arm-scope, S, block B) removed the ~100 ms y≈1960 frame 4/4. That frame was NAMED: the
  window touch listener add at the IO edge (na/nb split, `fixes/morph-webkit/README.md` "y≈1960").
- Edge frames of 40-49 ms are left (P-013: 34/49/40/42; P-022: 49 @ y 2019), unnamed.
- Best build at main = st6-rb2 (which carries arm-scope: touch listeners on #platform + header, armed at setup) +
  platform-idle + morph-inherit.
- In it, the IO edge still flips `b`. Best build JS lines below are in `nodes/2.DyWL8TcE.js` 65052c4a3902; the IO
  callback is at 13378-13379, `rootMargin: 200% 0px`.
- That `b` write sources the panel's 21 column images (`src`, l. 13518) and lifts `inert` from the pre-mounted panel
  (l. 13577).
- On aw1-10e, neither write was the ~100 ms cost (mw10e-src and mw10e-noinert, no win). With the listener add gone,
  they are the leading candidates for the residual: na (noinert + src + listeners at setup) left only 34-35 ms frames
  there.

**Ticket draft, rev 2** (answers mgmt-ops-10's second read, points 1-8, and the lead's corrections relayed by it).

Status: ops second read PASS on db908c97 (scorer 8595714c83f9); the lead approved it as the ticket. After that, the
scorer got one cosmetic fix: the block-void summary now prints "VOID (fewer than 3 of 4 C runs pass)". Final scorer
hash ad0037856fa5, re-run on the fixture below with identical scores. Registration with mgmt-ops-10 (P-091 or later)
only after T-052 lifts the I-098 pause; phone queue slot behind P-088.

```
TICKET f3-edge-residual · prediction id: assigned at registration after T-052 lifts the timing pause (P-091 or later;
  P-089 is rest-script's, P-090 fix-carousel-leaver's G)
arms (fixes/best-build/gates/arms.mjs PIN; sha256/12 as served, JS _app/immutable/nodes/2.DyWL8TcE.js /
  CSS _app/immutable/assets/2.gBuqKVzi.css):
  V = best build N, out/snapshots/best-65052c4a3902 (fixes/best-build/build.mjs --snapshot), JS 65052c4a3902 /
      CSS e0f92804c521, IO callback at 13378:13
  C = plain baseline B (no overlay; site-pretty at the snapshot baseline.json pins), JS 4606120cf392 /
      CSS 27776f3d4138, IO callback at 13083:13
  one server per arm (serve.mjs --root site-pretty [--overlay <snapshot>] --port 0 --https --vendors=local
  --latency 150 --no-cache), the phone on each one's plain http twin (I-003); ports in the block log, never 5173
served hashes: at each warm-up load, curl the JS and CSS from that arm's twin port, sha256/12 into served.txt (arm,
  port, file, hash); a mismatch with the list above stops the block before any counted run
driver G (gestures/arm-scope-touch-v1c.json, sha256/12 012758d97fe1, x 215, as P-073) · condition T-039 B
question: in V, which rendering-update phase owns the frames > 34 ms around the #platform IO crossing, and at which
  frame relative to the crossing do they fall?
probe set: std + Timeline in EVERY counted run (iphone.mjs gesture --timeline, re-armed per load: Page.disable ->
  Page.enable -> Timeline.start, F-047); no Web Inspector, layersForNode or paint rects (§5.5)
order: C V V C C V V C (8 counted) · warm-up: one uncounted load per arm's port (A3/U5)
sentinel (§5.2, Timeline block): one uncounted Timeline-OFF S run on C after the warm-ups and one at the block end
  (bottom >= 58, scroll >= 44); a failing sentinel voids back to the last passing one
per run: battery °C, charging state, thermal state (gate pair), LPM read (an LPM run is dropped and re-run)
scorer: fixes/nav-morph/edge-score.mjs sha256/12 ad0037856fa5 (final; re-hashed at registration)
  node fixes/nav-morph/edge-score.mjs --line C=13083:13 --line V=13378:13 \
    --run C:<c1.json>:<c1.tl.json> --run V:<v1.json>:<v1.tl.json> ... (the 8 counted runs in block order) \
    --out out/nav-morph/edge/score.json
expected minutes: ~45 (3 holds <= 10 min each + gates; cooling by phone-temp only if a gate fails)
```

**Condition T-039 B, quoted from P-085** (`fixes/morph-inherit/README.md`, "Condition"):
- Real thermal Serious. Every hold runs the gate pair `research/phone-thermal-gate/thermal-gate.mjs` (sha256
  `4604218c4041`, `--expect serious --max-c 44`) at its start and end. A hold counts only when both reads say Serious
  with Is Induced = No; otherwise it is re-run.
- Stop at 44 °C battery or Critical, and cool before the next hold.
- "Every gate failure goes to the lead. Two strikes (two gate-failed holds, not necessarily in a row) → roll back to
  A, reported in T-039 (the lead's switch, recorded in the block log)."
- A start read that fails before any run, with no step taken and no files written ("state changed during the read"),
  is not a strike (ops ruling on P-085 h165958, the lead agreed).

**How a run is scored** (edge-score.mjs; the rules are in its header, summarised here):
- **Crossing.** The IO `ObserverCallback` whose `FunctionCall` child is the arm's callback line (V 13378:13, C
  13083:13, in `nodes/2.DyWL8TcE.js` as served). Its page time is `(startTime - syncTL) * 1000 + syncT`. Frame k (rel 0)
  is the first logged frame stamped at or after it, i.e. the frame whose dt contains the callback. Positions compare by
  crossing, never by raw y.
- **Window.** Frames k-2 .. k+10. It is the read window and the decision window: every row below counts only frames
  in it, so no frame is read but left out of a decision.
- **Edge frames.** dt > 34 ms in the window; the twins dt > 30 and dt > 38 are scored the same way.
- **Matching.** An edge frame k' is matched to the `RenderingFrame` record that contains the previous stamp t_{k'-1}
  (±1 ms). The stamp is the logger's rAF inside a rendering update, so the rest of that update is what delays stamp k'.
  Checked on fixture e-tc2: rAF stamp 16285 inside RenderingFrame 16275-16404, the 121 ms frame.
- **Buckets** of the matched RenderingFrame:
  - style = RecalculateStyles, with the Layout nested inside it;
  - layout = Layout outside a style recalc;
  - paint = Paint;
  - Composite record = the `Composite` record's own time, minus the style, Layout and Paint nested in it. The name is
    only the record type. Which work it stands for (layer tree commit, flush) is UNRESOLVED and claimed nowhere here.
  - script = FunctionCall, FireAnimationFrame, ObserverCallback, EventDispatch, TimerFire.
- **Owner of a frame.** The largest bucket, if it is ≥ 50 % of the RenderingFrame; otherwise "split".
  - "outside": the matched RenderingFrame covers less than half of dt.
  - "unmatched": no record found.
- **Run score.** The owner of the run's longest edge frame; "none" when the window has no frame > 34 ms.

**Run voids** (decided by the scorer or the runner before any decision):
- No IntersectionObserver callback at the arm's line in the run's Timeline → void.
- The gesture misses the crossing → void. That is: no logged frame at or after the callback, or fewer than 3 frames
  before it (frame k-2 needs its own previous stamp).
- No Timeline file, or no `RenderingFrame` records in it → void.
- A served-hash mismatch → the block stops (above).
- A void run gets one re-run, in the same arm, appended after the order. A second void in the same arm voids the
  block. At most one second block per question (§5.3).

**Control void check** (numeric, fixed before any data): a C run passes when
- the longest window frame is ≥ 75 ms,
- its matched RenderingFrame is not "outside", and
- RecalculateStyles total + Composite record total (nested Layout and Paint included) ≥ 60 % of that RenderingFrame.

The block is VOID unless ≥ 3 of 4 valid C runs pass. Then the driver or the Timeline split does not reproduce the
known frame, and no V verdict is drawn. Reference: card 10-01, 34.4 + 58 of 97.6 ms.

**Decisions** (V, 4 valid runs; per threshold > 34, then > 30 and > 38; threshold-sensitive when a twin's row
differs):

| V runs with an edge frame | run scores | row | next |
|---|---|---|---|
| 0 or 1 of 4 | (any) | CLOSE | the residual is not on the G touch path; F3 needs no edge fix |
| exactly 2 of 4 | (any) | INCONCLUSIVE | no F candidate; at most one second block (§5.3), else report as inconclusive |
| ≥ 3 of 4 | style in ≥ 3 runs | STYLE | the `inert` lift is the prime candidate. F candidate: restack mw10e-noinert's delta (never inert; tabindex guard) on V, `noinert-check.mjs` in Chrome first |
| ≥ 3 of 4 | paint or Composite record in ≥ 3 runs (one class) | PAINT-COMPOSITE | the 21 image sources are the prime candidate. F candidate: restack mw10e-src's idle src staging on V, `src-check.mjs` first |
| ≥ 3 of 4 | anything else (split, layout, script, outside, unmatched, or no score in ≥ 3 runs) | SPLIT | name the nearest code threshold from the frame's script records; no F candidate until named |

- Any row is OBSERVED, n = 4 per arm, one driver.
- A fix built from it still needs its own gain block plus the user's finger test, since F3 is a top-3 smoothness fix.

**Prediction** (written before any data):
- Expected row: STYLE, P 0.4. The others: SPLIT 0.3, PAINT-COMPOSITE 0.2, CLOSE or INCONCLUSIVE 0.1.
- Expected edge frames > 34 per V run: point 1, interval [0, 2].
- Expected owner of the longest: style (RecalculateStyles with its nested Layout).
- Why it is uncertain: on the control, the crossing frame scores "split" under the 50 % rule. On fixtures e-tc1 and
  e-tc2 it was style 35 % / 33 % and Composite record 42 % / 39 %. So a residual made of the same two parts would land
  in SPLIT, not STYLE.

**Scorer run on fixtures** (data only, no device). The 10-01 aw1-10e S runs with Timeline, in iphone-runner's `out/`;
not committed, they hold LAN addresses. The literal invocation, with the aw1-10e callback lines (C 13345:13, V
13348:13):

```
node fixes/nav-morph/edge-score.mjs --line C=13345:13 --line V=13348:13 \
  --run C:<out>/e-tc1.json:<out>/e-tc1.tl.json --run V:<out>/e-ta1.json:<out>/e-ta1.tl.json \
  --run C:<out>/e-tc2.json:<out>/e-tc2.tl.json --run C:<out>/e-ta1.json:<out>/e-ta1.tl.json
```

```
C e-tc1.json: crossing t 16245 y 1957; edge >34 2 (>30 2, >38 1); score split; 100ms@+0 split {"style":34.9,"layout":14.1,"paint":3.2,"compositeRecord":40.8,"script":2.4} of 97.6 | 36ms@+1 split {"style":1.2,"layout":12.3,"paint":9.6,"compositeRecord":8.7,"script":13.4} of 35.9; control check PASS (100 ms @0)
V e-ta1.json: crossing t 16199 y 1860; edge >34 0 (>30 0, >38 0); score none
C e-tc2.json: crossing t 16286 y 1977; edge >34 1 (>30 1, >38 1); score split; 121ms@+0 split {"style":42.7,"layout":18,"paint":4,"compositeRecord":50.2,"script":3.2} of 128.8; control check PASS (121 ms @0)
C e-ta1.json: VOID no IntersectionObserver callback at 13345:13
control 2/2 pass -> VOID (fewer than 3 of 4 C runs pass)
decision: VOID (>34 CLOSE, >30 CLOSE, >38 CLOSE)
```

- Both control runs pass the numeric check.
- The block verdict VOID is correct for a 2-run fixture: the check needs ≥ 3 of 4.
- e-ta1 scored as C (with the C line) is void, "no IntersectionObserver callback at 13345:13", which exercises the
  no-callback void.
- There is no G-run Timeline file yet. The G frame format, `run.segments[seg].frames`, is read by the same code path;
  `--seg` picks the segment.

**Open point for the lead: driver M.**
- The replan named "M plus G". M (`__fwMorphDrive`) runs E(1)/E(0) at the page's max scrollY and never crosses the IO
  edge, so it cannot show these frames. M is left out of this ticket.
- mgmt-ops-10 has passed this point to the lead.

**B1 (end-pin collapse): deferred by the lead.** B1 stays UNRESOLVED. The Simulator counts check is dropped and needs
no hold now. A B1 end-pin M hold will be a separate ticket later.

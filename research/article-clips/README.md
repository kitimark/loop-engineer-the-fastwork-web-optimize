# Article clips v10: the user's own finger gesture, replayed on the original and on v10 (plan, phase 1)

Owner arch-article-clips; request: console thread T-211 (2026-10-06). Phase 1 is a plan only: no phone, no Chrome
timing, no locks. Phase 2 starts on the lead's message, after the v10 build exists and the P-153 / P-152 blocks are
done. Builds on the v8 clip kit `research/team-article/capture/phone/` (hold.sh, serve.sh, phone-clips.mjs, rects.mjs,
vv.mjs; README "Phone clips"), which the user approved in C-064 and C-066.

What is new this time: the robot finger replays **the user's own finger gesture**, captured on the original, instead of
our hand-written strokes. Every clip: left original, right v10, same robot input, real iPhone 15 Pro Max screen.

**Lead decisions (2026-10-06, after 3c875df5):** v10 is built on the landed v9-final base, JS 1b2eecc66011 (with 7d);
the clips use normal room heat with the Xcode condition off (profile `fair`); the "hero carousel" question goes to the
user in T-211 (posted by the lead), not in a phone step, so U1 is only the finger scroll. **Answered (T-211 #6, confirmed
#7):** "hero carousel" meant the user carousel, the small profile photos in the community pill
(`.start-selling-avatars.is-carousel`): a cropped clip, original and v10.

## 1. Tools: capture the finger, replay it with WDA

What exists (read in the code, 2026-10-06):
- `iphone.mjs record` (`tools/lib/iphone-record.mjs` 33-36) logs one row per rAF frame: time, dt, scrollY, innerHeight.
  It has **no touch listeners**, so it gives the scroll curve scrollY(t) but not the finger path.
- `iphone.mjs gesture` plays a JSON script through WDA (`tools/lib/gesture.mjs`): strokes with `px`, `ms`,
  `profile` (minjerk, fling, still, drag), `pressMs`, `holdMs`; `pause`, `until`, `mark`, `repeat`. Its in-page recorder
  (`tools/lib/gesture-rec.mjs` 21-37) already logs touches (start/move/end, clientY, scrollY, timeStamp) and frames.
  Guards (`gesture.mjs` 42-49): px 40-560 per stroke (safe zone y 200-760), ms 40-5000, lift-off <= 8000 px/s,
  segments >= 40 ms (WDA collapses shorter ones; F-085 / I-042, fixed by compiler v2). A script needs >= 1 stroke.
- **No tool turns a recording into a gesture script.** Earlier scripts (`finger-protocol-v1`, `slow-drag-v1`) were
  fitted by hand from human scroll curves (`research/architecture/finger-simulation.md` §4.1: strokes 1.0-1.6 s, peaks
  2500-5700 px/s, momentum tau ~0.43 s).

**Update 2026-10-06: landed as incident I-218, 6179d922 on main** (npm test 2385/2385). `iphone.mjs record --touches`
captures the touches (with clientX) next to the frames; `tools/gesture-from-record.mjs <record>` writes the script
(strokes cut at <= 560 px / 5 s at the finger's own times, fling at the finger's lift-off speed, `--overhead-ms` takes the
robot's start latency off the pauses) and prints the scroll curve the script should produce (EXPECT); `--compare <user>
<replay> --max-dy <px>` is the fidelity check of item 3 (VERDICT OK|MISS, exit 3 on a miss). The hand-fit fallback below
is no longer needed. What was proposed (kept for the record):
1. `iphone.mjs record --touches`: install `gesture-rec.mjs`'s RECORDER_JS (frames + passive touch listeners; add
   clientX) instead of RECORD_JS, and save `touches` in the record. Without the flag, record is byte-for-byte unchanged
   (test pins the injected text). It changes what runs in the page, so it is called out as measurement code; it only
   runs in the capture run, which is never compared.
2. `tools/gesture-from-record.mjs <record.json> --out <script.json> [--from <t> --to <t>]` (pure lib + CLI): split the
   touches at touchstart/touchend into strokes; each stroke's `px` = finger travel, `ms` = contact time, `profile`
   `fling` if the lift-off speed is above a threshold, else `drag`; gaps become `pause`. A stroke over 560 px is
   scaled to 560 and flagged (the replay then travels less; the clip says so). Unit tests on a fixture recording.
   Option for the toolsmith: a `profile:"path"` stroke with the user's own [ms, dy] points resampled at >= 40 ms,
   which follows the finger more closely; same guards.
3. Fidelity check (in the clip kit, numbers only): the replay's scrollY(t) from its own page log against the user's
   curve (correlation, end position, time to each scene mark). A replay that misses the user's scene (e.g. the end menu
   never opens: the v8 `flick-end-v1` runs never opened it) is redone or the script is adjusted, before any clip.

Fallback if the tool change is not landed in time: the user records with plain `record` (scroll curve only) and I fit
the strokes by hand from the curve (velocity peaks = strokes, decay after lift-off = momentum), as finger-simulation
§4.1 did; the fidelity check above is the same. Less exact: the finger's own position and lift-off moment are inferred.

Both scripts are checked on the Simulator first (`sim.mjs gesture --count-only`, shared lane, counts only): they stay
inside the guards and reach the same scroll positions as the user's run.

Limits to say in the article: the replay is a fitted copy of the finger, not the finger. WDA adds 0.5-1.4 s before
each stroke (Simulator, v8 kit) and replays at most 560 px per stroke, so pauses between strokes can be longer than the
user's. Both arms get the identical script, which is what the comparison needs. F-256: a build can change the start
state, so each run's scroll curve is checked, not only the script hash.

## 2. Screen capture and cutting

- Recorder: only `tools/ioscap.mjs record` (I-062; memory no-camera-access), inside the runner's phone hold, started
  before the gesture with `--seconds` >= the gesture budget, exactly as `hold.sh` does (H1-H8 ran it that way). It writes
  `out/iphone-screen/<label>.mov` (H.264) plus numbers-only `.frames.json`. Agents never open, view or extract a frame.
- Cutting: `phone-clips.mjs` (copied to `research/article-clips/` as a v10 kit, same rules): ffmpeg reads the .mov and
  writes **H.264 MP4 only** (no image output, git-guard I-064); trims by the page-clock to capture-clock link (the clock
  check, or the drag-edge rule the lead ruled for the hero scene); side-by-side original | v10; frame-time strip drawn
  from the page's own log numbers; label strip "Real iPhone 15 Pro Max screen recording (Safari), heat: <profile>".
- Crops by geometry, never by looking: the full-screen clips use the page box (y 119-826 pt of 932: no status bar, no
  Safari bar). Crop bands come from the phone's own geometry read (`rects.mjs`, items rA/rV) at the run's resting scroll.
  - user carousel (the pill's profile photos, `.start-selling-avatars.is-carousel`, 104x32 px, doc y ~2050, changes
    about every 1.03 s; v8 kit, Simulator): a band around the pill, 6 s at rest. Cut from the people replay when it
    comes to rest with the pill in view; otherwise one short robot item per arm (scroll to the pill, rest 6 s, no user
    gesture needed), as the v8 clip d did;
  - Join waitlist button: the nav band (button box + 16 pt margin, inside the page box) cut twice, from the hero
    replay (top: fade at the first scroll) and from the end-morph replay (end: fade into the menu). No extra runs.
- Files stay in gitignored `out/` of this worktree: `out/iphone-screen/` (raw .mov), `out/article-clips/` (runs,
  clips, review page). Never committed, never published; the review page is served on 127.0.0.1 only. The article
  inlines an MP4 only after the user's OK in a console review step. Committed: this README, the kit scripts, gesture
  scripts (no Fastwork code), numbers-only `clips.json` summaries.

## 3. v10: the exact build

v10 = v9-final + F1+U2 + P1 (PR-012 option B, accepted by the user 03:21Z) + the PR-027 option the user picks (none if
they pick "keep" or don't pick; PR-027 is still a draft, proposal rev 5).

| part | what | state 2026-10-06 ~04:2xZ | where |
|---|---|---|---|
| v9-final | ms7c+dd+earn+nav+glue, landed 8b5ce9b3; PR-023 rev 7d (189ca7ed) moved its JS 647c9ef2b1e2 -> 1b2eecc66011 (7d's touch hunks), CSS e1359ab9994a | on main | `fixes/v9-best/patch.diff` |
| F1+U2 | F1 hides #platform with the fade write; U2 skips the nav hit test while the morph is open | P-152 block 2 pending | fix-end-morph, `fixes/end-morph-f12/delta.diff`; snapshot `out/emv9f/snap-a6426953727a/V` (int-v8) |
| P1 | option B, the end-menu reveal | P-153 block 2 pending (block 1 VOID, heat) | fix-end-morph-p1; snapshot `out/emp1v9f/snap-4da641f828bb/V` (int-v8, HASHES c5138adb7dd2) |
| PR-027 | Join waitlist: keep / fadeonly (recommended) / nolift | user has not picked | fix-end-morph; `fixes/joinwl-fadeonly`, `fixes/joinwl-nolift` |

Must land first (lead, rebase + ff-only): F1+U2 (after a P-152 PASS), P1 (after a P-153 PASS), the PR-027 option.
Then int-v8 builds ONE immutable v10 snapshot with a build script like `fixes/end-morph-p1-v9f/build.sh` (strict
`patch -F0`, HASHES.txt, `node --check`, refuses an existing target), and the clip kit's `serve.sh` copies it read-only
with the pinned hash and serves two plain-http arms (I-003): A = baseline (`serve.mjs --root site-pretty --vendors=local
--latency 150 --port 0`, no overlay), V = v10 overlay; URLs only from `tools/lan.mjs`.

**Open, for the lead / int-v8 before the build:** the P-152/P-153 snapshots name v9-final as 647c9ef2b1e2, the pre-7d JS
(`p152-serve.sh` 7, `p153-serve.sh` 7), while v9-final on main is 1b2eecc66011. v10 must say which base it is; I
recommend the landed one (with 7d), which means re-applying the F1+U2 and P1 deltas on it strictly and a parity check.
If P-152 or P-153 fails, v10 is v9-final + whatever passed, and the clips say which.

## 4. Other visible problems worth a clip

Searched: `fixes/FINDINGS.md`, the findings board, fix READMEs, `research/`, ops-handover (helper map, lines re-read
for the rows marked *). Only things a viewer can see; status words as the sources give them. "In v10" assumes v10 as
defined in §3. Most are already inside the five highlights; the crop or scene that shows each is named.

| # | glitch (where) | original | v10 | status | shown in | source |
|---|---|---|---|---|---|---|
| G1 | Join waitlist stays full width ~0.6 s at the end-menu open: a dark blurred smudge on the right, EN slides from ~118 px to 8 px (end, nav) | yes | fixed (nav-earn rev 3, in v9-final) | cause traced in the CSS (11477-11495); per-frame numbers OBSERVED | button crop, end | `fixes/nav-earn/README.md` 195-207*, F-222 |
| G2 | Phone logo jumps ~15 px in one frame at the menu open, and back at the close (end, nav, width <= 640) | yes | fixed (same) | traced in the CSS (11577-11583) | end scene; button crop | nav-earn README 208-210* |
| G3 | Join waitlist rises 8 px and blurs while fully visible, then fades (end, nav) | yes | only if the user picks a PR-027 option (fadeonly or nolift) | CONFIRMED by the code (CSS 11477-11495); per frame OBSERVED | button crop, end | end-morph README §6* (fix-end-morph worktree); PR-027 |
| G4 | End-menu morph lags; #platform's tiles repaint at each Safari toolbar step even at opacity 0 (end, phone only) | yes | F1+U2 and P1 target it (P-152, P-153 pending) | mechanism OBSERVED (phone Timeline re-read), trigger UNRESOLVED | end scene | end-morph README 1-24*; F-299 (the claim that the Simulator reproduces it: REFUTED) |
| G5 | Top bar colour flips late at dark sections: original 36, 195 and 24 ms late at 3 of 6 switches, v8 on time at all 6 (mid page) | yes | expected fixed (v8 had it) | OBSERVED (page log, S driver) | a full-screen scene that crosses a dark edge, or an extra U4 | `research/team-article/capture/README.md` "Nav colour switch overshoot"* |
| G6 | Hero card fade trails the scroll (cards fade and slide by script) | yes | less (v8: lag about half the original's) | OBSERVED (motion trace, H5) | hero scene | capture README "Holds H5 and H6"* |
| G7 | Countdown band: one extra change 217 ms after the 6th digit change, same place on both arms | yes | same | OBSERVED, cause unchecked | countdown crop (only if the user wants it) | capture README, clips after H5/H6* |
| G8 | One frame of 40-54 ms near y 1250 (future card opacity ends; whole-view layout in WebKit) (hero to people) | yes | open | UNRESOLVED | people scene | F-049, F-102 |
| G9 | Hero copy shows its old state for one frame on the first scroll after a rest | yes | check: hero-exit-threaded is parked, not in v9-final | OBSERVED | hero scene | `fixes/hero-exit-threaded/README.md` 1331-1337 |

Not for clips: desktop-only items (commission card one-frame jump F-245, future-card trail; Chrome 1440x900), Chrome-
only checkerboard noise, and glitches of builds that never landed (v9.2's end-zone blinks, P-142: NO-LAND; scroll-
snap momentum loss, F-228). **Guard for v10:** run the P-122 flicker scorer (numbers only) on every v10 replay, so
the clips can't show a blink v10 brings in (v9.2 brought 6).

## 5. Schedule and user steps

Order: P-153 block 2, then P-152 block 2 (both with the 38 °C cooling-before-every-hold rule), then v10 lands and is
built, then the clips. No user phone step while a timed block runs (memory no-phone-steps-during-blocks).

**Heat profile, recommended: normal room heat, Xcode condition OFF (profile `fair`: Nominal or Fair, not induced).**
Why: the clips should show what a reader's phone does in normal use, and the user judges the lag by their own finger
on that phone. Serious (Xcode) is the study's test condition, not everyday use, and under induced Serious the phone
reached Critical after about 2 G runs from 39 °C (P-152/P-153 block 1, lead ruling 10-06), which would void runs mid-scene.
Check in U1: if the user does not see the lag on the original at normal heat, we switch to `serious` for all scenes (one
profile for the whole set; every clip's label names it; the v8 clips were Serious). Never mix profiles in one clip.

User steps (console, each from inside the runner's phone hold, one open phone step at a time):

| step | what the user does (plain words) | time |
|---|---|---|
| U0 | Turn on a Focus mode (Do Not Disturb) so no notification shows; set Auto-Lock to Never (I-215); in Xcode, stop the Thermal State condition (if we use normal heat); close other Safari tabs; then Done. | 3 min |
| U1 hero | On the original page at the top, scroll the hero cards the way that shows the lag to you, about 10-15 s, then stop. | 2 min + 1 retry |
| U2 people | Start just above "People still need people" and scroll through the title the way it lags for you, about 10 s. | 2 min |
| U3 end | Scroll to the end of the page and open the end menu the way you usually do, then scroll back up a little, about 15 s. | 2 min |
| U4 extra | (optional) Any other place that looks wrong to you, the same way. | 2 min |
| U5 review | Watch the clips on the Mac (localhost page), answer OK / not OK with notes per clip. | 10-15 min |

Each finger run is recorded with `record --touches` (scroll + touches) and, in the same hold, with ioscap; that gives
an extra "your finger on the original" clip if the user wants it.

Robot runs (no user): 3 scenes x C V V C (4 runs) = 12 G runs + 2 geometry reads + warm-up per arm. One scene per hold,
cooling with `wait.mjs phone-temp --below auto` between holds; inside the runner's own `--no-timing` chrome-measure hold
with `FW_PHONE_REQUIRE_QUIET=1` (H2 showed a loaded Mac breaks the capture link). The clip uses the first clean run per
arm; the second pair is the spare.

Estimate: user finger part ~15 min; robot holds ~3 x 12 min + cooling ~3 x 10 min = ~65 min of phone time; script
fitting and Simulator dry runs ~45 min (no phone); cutting ~30 min; review ~15 min. About 2 h of phone time in total
with redos, plus the toolsmith job (~2 h, before phase 2).

## 6. Risks

- **Heat:** with normal heat a long hold can drift to Serious (the end gate marks it; a drifted run is not shown). With
  Serious, Critical after ~2 G runs: one scene per hold, cool before each. Ceiling 44 °C / Critical everywhere.
- **Auto-Lock:** set to Never in U0 (I-215: the phone locked during a cooling wait and WDA could not start). The kit
  checks WDA after every cooling wait. Set it back after the session (U5 reminds the user).
- **Safari state:** `safari-restart` before the first open (I-214), park Safari after every hold (the v8 hold.sh's
  EXIT trap), the ready check before each run (WDA answers, tab listed), one tab only. Reader mode, zoom and text size
  stay default; the geometry read refuses a scale other than 1.
- **Toolbar:** the Safari bar collapses on scroll and changes innerHeight 775 -> 815 (finger-simulation §4.1). The
  replay starts each run from the same state (fresh load, bar expanded); the visualViewport read at start and end
  is logged; a run whose bar state differs between arms at the scene mark is not paired. The page-box crop leaves the
  bar out in both positions.
- **Countdown:** the frozen page counts down to 2026-11-02 05:00Z; clips must be made before that, and both arms must
  show the same seconds where the countdown is in view (the v8 kit's whole-second alignment).
- **Privacy:** Focus mode on (no banners in the recording); the crop leaves out the status bar (time, carrier,
  battery); no LAN address, device name or notification text in any committed file or label; the raw .mov stays in
  `out/`; nobody but the user views frames (I-062).
- **Replay fidelity:** a fitted script can miss the user's moment (end menu not opening, title animation not
  triggered); the fidelity check catches it before any clip is cut.
- **Build drift:** v10 must be one pinned snapshot; a later change to any part means a new snapshot and new runs.

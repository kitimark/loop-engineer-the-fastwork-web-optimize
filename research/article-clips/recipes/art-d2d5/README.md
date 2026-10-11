# art-d2d5: Day 2 and Day 5 comparison clips (owner T-170 #359, gesture decided in #363)

Status 2026-10-11 14:17Z: **recorded and cut.** Block 14:03-14:14Z, 6/6 runs clean; clips
`out/article-video/day2-laggy-same-60fps-strip.mp4` and `day5-breakthrough-60fps-strip.mp4` (1296x1324, 60 fps, 11.5 s,
690 frames; gitignored, copied to the main checkout's out/article-video/); article draft out/article/day2-day5-draft.html.
All numbers OBSERVED, one block, n = 2 per build: an illustration, not a verdict.

## What the clips show

The owner's own hero swipe, replayed by the robot (`fixes/worst-cases-capture/g-ar-herofinger-v2.json`, compiled
13b7b2c21740: the program behind article clip 1, Fig. 14 and src-2/src-24), on three builds in one block:

| arm | build | JS / CSS (sha256, 12) | how it is made |
|---|---|---|---|
| O | the original page (baseline snapshot b1789284481295-a455e793) | 4606120cf392 / 27776f3d4138 | site-pretty, no overlay |
| W | aw1-10c = all-wave1 + scroll-engine /10c, the build the owner swiped as "B" on 1 Oct 08:00Z ("laggy, the same", fixes/iphone-wave2/README.md §2) | 757e2cbc44e7 / c6aad94b455f | `snap.sh`: strict `patch -F0` of fixes/all-wave1/patch.diff (-> 69b915568658 / 213e21d3db9a) then fixes/se10c-aw1/patch.diff |
| S | v6 = B-R2, best build 4 Oct 07:33Z, the hero cards' fade on the GPU (the owner's "breakthrough", steps C-038/C-039) | 8018ce062d30 / 71b65c667720 | `snap.sh`: read-only copy of fix-hero-exit-threaded's immutable snapshot best-BR2-8018ce062d30, full sha256 checked against fixes/hero-exit-threaded/README.md "B-R2" (no baseline-relative v6 patch is on main) |

Clip A (Day 2) = O against W; clip B (Day 5) = O against S; both cut from the same block.

## Files

- `snap.sh`: builds out/d2d5/snap/{W,S} + HASHES.txt (read-only; refuses an existing target).
- `serve.sh`: three plain-http servers (`--vendors=local --latency 150`), served-hash checks; `port|check|stop`.
- `hold.sh`: one phone hold (copy of fixes/worst-cases-capture/tri-hold.sh, item w only, arms O/W/S, runs named
  `<UTC>-ar-herocatch4-<orig|aw1|v6>`); prep cools below 40 C, `iphone.mjs rearm` (tool-held Serious, as every -ar- run),
  one uncounted warm-up flick per port. Do Not Disturb stays on (no focus step).
- `go.sh`: the whole block: servers, WDA start if needed, prep, W1 = O W S, W2 = S W O (2 runs per arm), cooling and
  re-runs as tri-block.sh, then park, `thermal.mjs clear`, servers stopped.
- `align.py`: the first scroll move in each recording (strips.py clock chain); clip start ss = that frame's end - 0.3 s.
  Checked on clip 1's pair: prints 40.814 / 23.548, g5's values exactly.
- `strips.py`: art-strip/strips.py with the run-record root and the strip output dir as env (WC_ROOT, STRIPS_DIR).
- `gen.mjs`: filter scripts, strip specs and ffmpeg lines, clip 1's exact layout (11.5 s, 690 grid frames, half device
  pixels, strip + playhead, CRF 17, 60 fps).
- `read.mjs`: counts over Fig. 14's window (mark finger -> mark end), with twins, > 100, longest and Fig. 14's bins.

## Commands (repo root of this worktree)

```sh
sh research/article-clips/recipes/art-d2d5/snap.sh <.../out/snapshots/best-BR2-8018ce062d30>
sh research/article-clips/recipes/art-d2d5/go.sh                       # background; log out/d2d5/block.log
node research/article-clips/recipes/art-d2d5/read.mjs --json out/d2d5/read.json
python3 research/article-clips/recipes/art-d2d5/align.py out/iphone-screen/<run>.mov ...   # -> ss per run
# write out/d2d5/pairs.json {day2-laggy-same: {A:{mov,ss}, B:{mov,ss}, la, lb}, day5-breakthrough: {...}}
node research/article-clips/recipes/art-d2d5/gen.mjs out/d2d5/pairs.json out/d2d5/gen
python3 research/article-clips/recipes/art-d2d5/strips.py out/d2d5/gen/windows.json out/d2d5/strips.json
# then, inside: node tools/lock.mjs run chrome-measure --owner <o> --no-timing --max-seconds 600 -- sh -c '<cmds.json lines>'
```

## Block log

- 13:44Z: servers up, hashes ok (O/W/S as above). WDA start inside the phone hold failed: XCTest "Timed out while
  enabling automation mode", build interrupted (out/d2d5/wda-start.log). 13:47Z retry: the same (wda-start2.log). go.sh
  stopped (exit 5), Safari parked, `thermal.mjs clear`: no active condition, servers stopped. Likely the phone is locked
  or UI Automation needs re-enabling (the tool's own hint); per memory phone-problems-fix-first this goes to the lead.
- 13:57Z: the owner unlocked the phone and checked UI Automation (console step C-152). Inside the phone hold `wda start`
  came up (WDA READY), and a 3 s `ioscap.mjs record` check showed the rebuilt recorder app has the Camera permission
  (authorized; no first-run prompt).
- 13:58-14:14Z `go.sh`: prep (Serious induced by the tool, battery 36.7 C, warm-ups O W S), W1 = O W S (14:03-14:08Z,
  Serious 36.6 -> 38.2 C), W2 = S W O (14:08-14:14Z, 38.3 -> 39.5 C), no drift, no Critical, every driver and recorder
  exit 0, recorder 59.5-60 fps delivered, Mac load1 4.9-8.9. Then Safari parked, condition cleared, servers stopped.

## Results (read.mjs: whole replay, mark finger -> mark end, as Fig. 14 / src-24)

| run (out/iphone-screen/, out/wc/runs/) | build | window | frames | > 34 (30/38) | > 50 (46/54) | > 100 | longest |
|---|---|---|---|---|---|---|---|
| 20261011T140302Z-ar-herocatch4-orig | original | 34.0 s | 1288 | 272 (311/244) | 153 (177/134) | 26 | 145 ms |
| 20261011T140443Z-ar-herocatch4-aw1 | aw1-10c | 34.3 s | 1347 | 283 (338/230) | 154 (175/125) | 26 | 168 ms |
| 20261011T140626Z-ar-herocatch4-v6 | v6 | 32.6 s | 1442 | 217 (264/182) | 110 (134/82) | 4 | 122 ms |
| 20261011T140843Z-ar-herocatch4-v6 | v6 | 32.5 s | 1422 | 211 (261/180) | 106 (129/85) | 3 | 128 ms |
| 20261011T141042Z-ar-herocatch4-aw1 | aw1-10c | 34.2 s | 1364 | 275 (330/229) | 136 (162/120) | 25 | 143 ms |
| 20261011T141226Z-ar-herocatch4-orig | original | 33.2 s | 1323 | 248 (293/202) | 133 (151/109) | 20 | 157 ms |

The original matches 10 and 11 Oct on the same program (265, 254 and 263, 265 over 34 ms). aw1-10c against the original:
no difference at any threshold (the owner's "laggy the same" of 1 Oct). v6 against the original: lower at every
threshold, both twins, ranges apart; over 100 ms 26, 20 -> 4, 3.

Where (bands.mjs, src-12's code-geometry split, whole replay, over 34 ms per run): hero cards only (y < 600, moving):
original 49, 42; aw1-10c 51, 48; v6 42, 38 (about level on this fast swipe). People card over the hero (y 600-855):
113, 90; 107, 101; 58, 70. Title "o": 87, 79; 87, 88; 104, 90. Rest: 23, 37; 38, 38; 13, 13.

## Clips (gen.mjs + strips.py + out/d2d5/gen/cmds.json; encoded inside a --no-timing chrome-measure hold)

Both clips use the same original run, 140302Z (ss 40.41), the first of the block. Day 2 against aw1-10c 140443Z (ss 22.903),
Day 5 against v6 140626Z (ss 23.818); ss from align.py. pairs.json: labels "before (original site)" and
"after (Day 2 build, 1 Oct)" / "after (Day 5 build v6, 4 Oct)". Clip windows (strips.py, page frames ending in the 11.5 s):

| clip | side | frames | > 34 | > 50 | > 100 | longest |
|---|---|---|---|---|---|---|
| day2-laggy-same | original | 405 | 113 | 55 | 6 | 139 ms |
| day2-laggy-same | aw1-10c | 424 | 107 | 54 | 7 | 168 ms |
| day5-breakthrough | original | 405 | 113 | 55 | 6 | 139 ms |
| day5-breakthrough | v6 | 479 | 91 | 45 | 1 | 111 ms |

Robot stroke starts in the clip (s after the first scroll move): original 4.07, 5.76, 8.24; aw1-10c 3.88, 5.68, 8.10;
v6 3.73, 5.32, 7.89 (the original up to 0.44 s behind v6; cause not checked, as clip 1).

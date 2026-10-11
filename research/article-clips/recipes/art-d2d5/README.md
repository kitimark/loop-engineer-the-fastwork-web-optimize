# art-d2d5: Day 2 and Day 5 comparison clips (owner T-170 #359, gesture decided in #363)

Status 2026-10-11 13:50Z: **kit ready, builds rebuilt and hash-checked, phone block not run** (WDA, the robot finger,
did not start: "Timed out while enabling automation mode", twice). Nothing recorded yet; no numbers.

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

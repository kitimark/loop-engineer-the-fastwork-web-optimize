# fig2-frame-rhythms: Fig. 2 as a 60 fps looping MP4

Owner request T-170 #339 (2026-10-11): on Medium, Fig. 2 of the article ("Same thumb, three frame rhythms",
`<figure id="fig-2">`, `<canvas id="cap-pace">`) is a still picture. It must play as a looping 60 fps video, uploaded
by the owner to Cloudflare Stream like the other clips. A GIF can't carry it: GIF89a frame delays are whole 1/100 s,
so a 16.7 ms frame does not exist in a GIF.

Input: `research/team-article/artifacts/sixteen-milliseconds/index.html` (v107), its figure script near the end
("Frame-rhythm illustration for capture ... Not a recording"). Output (gitignored, never committed):
`out/article-video/fig2-frame-rhythms-60fps.mp4` in the main checkout.

## Files

- `render.mjs`: headless Chrome via `tools/lib/cdp.mjs`, opens the article at 1400 x 1000 CSS px, DPR 2 (the figure is
  1200 CSS px wide), virtual clock (performance.now, requestAnimationFrame, Date.now) installed before any page script,
  canvas backing store = its displayed device pixels (2276 x 816). Runs the page's own figure script a second time from
  its `<script>` text with three exact text edits (the two pacing lines take their time from the 60 Hz schedule; the
  page's `draw`, `gaps`, `worst`, `LOOP`, `thumb` are exposed), then draws and screenshots `#fig-2 .cap-area` for each
  of the 216 frames of one loop (+ `seam.png`, the next loop's first frame). Writes `schedule.json`. The header
  explains the schedule.
- `check.mjs`: numbers only, from raw RGB24 frames on stdin: dot position per lane against the schedule, holds,
  byte-exact holds (PNG input), the loop seam.
- `run.sh`: render, encode, ffprobe, checks, PSNR of the video against the source frames. Run it in one
  chrome-measure hold.

## Why the video does not replay the page's own timing loop

- The page's pacing rule is "next picture at `t + gap`, at the first rAF with `t >=` it". On a 60 Hz clock
  (16.667 ms steps) every 16.7 ms gap is missed by 0.033 ms and takes two frames, so the "typical" lane would run at
  30 fps. (The same rule on a 120 Hz screen shows 16.7 ms gaps as 25 ms and the worst log's 17 ms frames as 25 ms.
  OBSERVED from the code, not measured in a browser; the article is unchanged.)
- The page's three periods differ: thumb 3600 ms, typical lane 216 gaps = 3767 ms, worst log 128 frames = 3601 ms.
  The page's animation therefore never repeats, and no seamless loop of it exists.

The video keeps the page's drawing and frame data and fixes one loop on the thumb (3600 ms = 216 frames at 60 fps):

- frame k is drawn at t = k x 1000/60 ms; the AFTER lane is the page's `thumb(t)` every frame;
- per slow lane, page frame j starts at E_j = the sum of the lane's first j gaps from the loop start, in the page's
  order, and is shown from video frame round(E_j x 60 / 1000); its dot sits at `thumb()` of that video frame's time
  (the page's own rule: a picture shows the thumb when it was drawn);
- page frames that start at or after 3600 ms are cut (typical lane: the last 10 x 16.7 ms; worst log: its 15 ms last
  frame, which ends at 3601 ms); page frames shorter than one video frame (the worst log has 2-9 ms gaps) merge, as on a
  60 Hz screen.

So a page frame of g ms is held for g / 16.67 video frames, rounded at both ends (within one frame): 153 ms -> 9
frames, 120 -> 8, 128 -> 8, 130 -> 7.

## Commands (from the repo root; a worktree is fine)

```sh
node tools/lock.mjs run chrome-measure --owner art-fig2-video --no-timing --max-seconds 600 \
  --doing "Fig. 2 as a 60 fps loop: render, encode, check" -- sh research/article-clips/recipes/fig2-frame-rhythms/run.sh
```

The encode inside `run.sh` (N = 216 frames, LOOPS = 3):

```sh
ffmpeg -nostdin -v error -y -framerate 60 -start_number 0 -i out/fig2-frame-rhythms/frames/f%04d.png \
  -vf "loop=loop=2:size=216:start=0,setpts=N/(60*TB),scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -tune animation -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -r 60 -fps_mode cfr -movflags +faststart -an <main checkout>/out/article-video/fig2-frame-rhythms-60fps.mp4
```

Upload (the owner's step, with the owner's token). The clip is first in the script's ALL list (Fig. 2 comes before the
first clip on the page), and the script is safe to run again (T-170 #349): clips whose row says ready=true are skipped,
a clip already on Stream is reused instead of uploaded twice, so a plain run uploads only this one:

```sh
sh research/article-clips/upload-cf-stream.sh --dry-run      # with the token set: "would upload fig2-frame-rhythms-60fps", 19 skips
sh research/article-clips/upload-cf-stream.sh                # or name just this clip: ... upload-cf-stream.sh fig2-frame-rhythms-60fps
```

## Checks (`run.sh` prints them; `RERUN=1` adds the determinism check)

Build of 2026-10-11 (Chrome/155.0.8059.39, article v107):

| check | result |
|---|---|
| ffprobe | H.264 High, yuv420p, BT.709, 2402 x 942, r_frame_rate = avg_frame_rate = 60/1, 648 frames (3 x 216), 10.800 s, no audio, 402,358 bytes |
| size | .cap-area 1201 x 471 CSS px (its 1200 px box snapped out to whole px, white around) at DPR 2; canvas 2276 x 816 device px, 1:1 |
| dot positions, PNG | all three lanes within 0.01 device px of the schedule (centroid of the dot's colour weight) |
| holds, PNG | worst lane: 112 pictures per loop, band bytes identical in all 104 held frames, changed at all 111 updates; typical lane: 206 pictures, identical in 10 held frames, changed at 205 updates |
| seam, PNG | `seam.png` (t = 3600 ms, the next loop's frame 0) byte-equal to frame 0 (all 6,788,052 bytes) |
| dot positions, MP4 | within 0.10 device px of the schedule in all 648 frames; drift inside a hold at most 0.019 px |
| seam, MP4 | frame 216 vs frame 0: mean diff 0.050 (max 53); every other frame vs its loop-2 copy: up to mean 0.144 (max 68), so the seam is no different from any other frame; the AFTER dot steps -1.26, -0.39, then +0.39 px across it |
| MP4 vs source | PSNR average 57.7 dB (min 54.0) over loop 1 |
| determinism | a second render gives identical decoded pixels (sha256 of all 216 frames' RGB); the PNG files differ in bytes only |

Long page frames and the video frames they are held (worst lane, page frames over 34 ms):
40->3, 43->3, 43->3, 42->3, 44->3, 36->3, 45->3, 41->2, 44->2, 41->3, **153->9**, **120->8**, 43->2, 74->5, 58->3,
56->3, 65->4, 69->4, **128->8**, 99->6, 84->5, 64->3, 79->5, 71->4, 49->3, 36->2, 86->6, 92->5, 59->4, 130->7, 44->3,
44->2. Typical lane: 41->3, 58->3, 37->2, 58->3, 41->3. The decoded MP4 holds every one for exactly those frames.

Pictures: only the Chrome screenshots (`out/fig2-frame-rhythms/frames/*.png`: f0010, f0065 inside the 153 ms hold,
f0108 at the right end, f0190) were looked at. The MP4's frames are checked by numbers only: the guard hook denies
ffmpeg image exports of any video but the deck recordings (I-064), and this job did not ask to widen that.


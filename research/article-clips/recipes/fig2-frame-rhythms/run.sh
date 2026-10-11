#!/bin/sh
# fig2-frame-rhythms/run.sh: render Fig. 2 (one 3.6 s loop at 60 fps), encode the looping MP4, run the checks.
# Run from the repo root (a worktree is fine), inside ONE chrome-measure hold, in the background:
#   node tools/lock.mjs run chrome-measure --owner art-fig2-video --no-timing --max-seconds 600 \
#     --doing "Fig. 2 as a 60 fps loop: render, encode, check" -- sh research/article-clips/recipes/fig2-frame-rhythms/run.sh
# Env: VIDEO (output, default: the main checkout's out/article-video/fig2-frame-rhythms-60fps.mp4), LOOPS (default 3),
# CRF (default 17, as the other 60 fps clips), RERUN=1 (render a second time and compare the pixels).
set -eu
R=research/article-clips/recipes/fig2-frame-rhythms
O=out/fig2-frame-rhythms
MAIN=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")
VIDEO=${VIDEO:-$MAIN/out/article-video/fig2-frame-rhythms-60fps.mp4}
LOOPS=${LOOPS:-3}
CRF=${CRF:-17}
mkdir -p "$(dirname "$VIDEO")"
FAIL=0

node $R/render.mjs --out $O
N=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).n)' $O/schedule.json)

# encode: the N frames once, looped LOOPS times (loop filter repeats them; setpts renumbers), 60 fps CFR, BT.709 tags
ffmpeg -nostdin -v error -y -framerate 60 -start_number 0 -i $O/frames/f%04d.png \
  -vf "loop=loop=$((LOOPS - 1)):size=$N:start=0,setpts=N/(60*TB),scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf "$CRF" -tune animation -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -r 60 -fps_mode cfr -movflags +faststart -an "$VIDEO"

echo "== ffprobe"
ffprobe -v error -count_frames -show_entries stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,color_space \
  -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "$VIDEO"
echo "want: one video stream, no audio, nb_read_frames $((N * LOOPS)), duration $(node -e "console.log($N*$LOOPS/60)") s, 60/1"

echo "== source frames (lossless PNG) + seam frame"
{ ffmpeg -nostdin -v error -start_number 0 -i $O/frames/f%04d.png -f rawvideo -pix_fmt rgb24 -
  ffmpeg -nostdin -v error -i $O/seam.png -f rawvideo -pix_fmt rgb24 -; } | node $R/check.mjs --schedule $O/schedule.json --frames $((N + 1)) --exact || FAIL=1

echo "== decoded video"
ffmpeg -nostdin -v error -i "$VIDEO" -f rawvideo -pix_fmt rgb24 - | node $R/check.mjs --schedule $O/schedule.json --frames $((N * LOOPS)) || FAIL=1

echo "== video against the source frames (first loop, both as BT.709 yuv420p)"
ffmpeg -nostdin -v info -i "$VIDEO" -framerate 60 -start_number 0 -i $O/frames/f%04d.png -lavfi \
  "[0:v]trim=end_frame=$N,setpts=PTS-STARTPTS[a];[1:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setpts=PTS-STARTPTS[b];[a][b]psnr" \
  -f null - 2>&1 | grep -E 'PSNR' || FAIL=1

if [ -n "${RERUN:-}" ]; then   # determinism: render again into a second dir, compare the decoded pixels
  echo "== second render, pixels against the first"
  node $R/render.mjs --out $O-b >/dev/null
  A=$(ffmpeg -nostdin -v error -start_number 0 -i $O/frames/f%04d.png -f rawvideo -pix_fmt rgb24 - | shasum -a 256)
  B=$(ffmpeg -nostdin -v error -start_number 0 -i $O-b/frames/f%04d.png -f rawvideo -pix_fmt rgb24 - | shasum -a 256)
  echo "pixels run 1 $A"; echo "pixels run 2 $B"
  if [ "$A" = "$B" ]; then echo "DETERMINISTIC OK"; else echo "DETERMINISTIC FAIL"; FAIL=1; fi
fi
echo "RESULT $([ "$FAIL" = 0 ] && echo OK || echo FAIL)"
exit "$FAIL"

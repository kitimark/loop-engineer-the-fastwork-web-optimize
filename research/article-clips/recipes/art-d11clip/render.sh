set -e
cd $SCRATCH/art-d11clip
python3 mkstrips.py windows.json stats.json
mkdir -p out/article-video
ffmpeg -nostdin -v error -y -ss 36.4333 -t 5.60 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042723Z-ar-revealflick-g0l.mov -ss 12.17 -t 5.60 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042826Z-ar-revealflick-g0m.mov -i $SCRATCH/art-d11clip/strips/day11-reveal-60fps-A.png -i $SCRATCH/art-d11clip/strips/day11-reveal-60fps-B.png -filter_complex_script $SCRATCH/art-d11clip/day11-reveal-60fps.txt -map "[out]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 60 -movflags +faststart -an out/article-video/day11-reveal-60fps-strip.mp4 && echo day11-reveal-60fps ok
ffmpeg -nostdin -v error -y -ss 36.4333 -t 1.80 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042723Z-ar-revealflick-g0l.mov -ss 12.17 -t 1.80 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042826Z-ar-revealflick-g0m.mov -i $SCRATCH/art-d11clip/strips/day11-reveal-2x-A.png -i $SCRATCH/art-d11clip/strips/day11-reveal-2x-B.png -filter_complex_script $SCRATCH/art-d11clip/day11-reveal-2x.txt -map "[out]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 60 -movflags +faststart -an out/article-video/day11-reveal-2x-strip.mp4 && echo day11-reveal-2x ok
for f in day11-reveal-60fps-strip day11-reveal-2x-strip; do ffprobe -v error -show_entries format=duration,size:stream=width,height,r_frame_rate,nb_frames -of compact out/article-video/$f.mp4; done
# check frames: real-speed grid frames 46..55 and 2x output around the reveal
ffmpeg -nostdin -v error -y -i out/article-video/day11-reveal-60fps-strip.mp4 -vf "select='between(n,46,53)',scale=648:-1,tile=4x2" -frames:v 1 stills/out-real.png
ffmpeg -nostdin -v error -y -i out/article-video/day11-reveal-2x-strip.mp4 -vf "select='eq(n,98)',scale=1200:-1" -frames:v 1 stills/out-2x.png
echo RENDER-OK

set -e
cd ~/source/fastwork-com-web-optimize
ffmpeg -nostdin -v error -y -ss 80.4 -t 4.9 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig.mov -ss 76.68 -t 4.9 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14.mov -filter_complex_script $SCRATCH/art-navrise/navrise.txt -map "[out]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 60 -movflags +faststart -an out/article-video/day8-navrise-closeup-2x.mp4
ffmpeg -nostdin -v error -y -ss 1.0 -i out/article-video/day8-navrise-closeup-2x.mp4 -frames:v 1 out/art-navrise/chk-1.0.png
ffmpeg -nostdin -v error -y -ss 3.0 -i out/article-video/day8-navrise-closeup-2x.mp4 -frames:v 1 out/art-navrise/chk-3.0.png
ffmpeg -nostdin -v error -y -ss 5.5 -i out/article-video/day8-navrise-closeup-2x.mp4 -frames:v 1 out/art-navrise/chk-5.5.png
ffmpeg -nostdin -v error -y -ss 8.0 -i out/article-video/day8-navrise-closeup-2x.mp4 -frames:v 1 out/art-navrise/chk-8.0.png
ffmpeg -nostdin -v error -y -ss 9.6 -i out/article-video/day8-navrise-closeup-2x.mp4 -frames:v 1 out/art-navrise/chk-9.6.png
echo EXIT 0

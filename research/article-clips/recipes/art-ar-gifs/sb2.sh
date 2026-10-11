# art-ar-gifs: status-bar strip check (user T-272) for the People title v2 recordings, then title sheets (no GIFs yet)
set -e
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071555Z-ar-ptitle-orig.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T071555Z-ar-ptitle-orig.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071706Z-ar-ptitle-g0m.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T071706Z-ar-ptitle-g0m.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071753Z-ar-ptitle-g0m.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T071753Z-ar-ptitle-g0m.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071845Z-ar-ptitle-orig.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T071845Z-ar-ptitle-orig.png
F=fontfile=/System/Library/Fonts/Helvetica.ttc
# title sheets: held-1.5 s .. held+3.3 s, 0.1 s apart, upper 1200 device px of the view (below the cut status/address bar)
ffmpeg -nostdin -v error -y -ss 50.03 -t 5.1 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071845Z-ar-ptitle-orig.mov -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=288,setpts=PTS-STARTPTS,crop=1290:1200:0:162,scale=161:150,drawtext=$F:text='%{eif\:round(t*1000+50030)\:d}':x=2:y=2:fontsize=13:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,6))',tile=8x6" -frames:v 1 out/article-gifs/check/q-orig-pt2.png
ffmpeg -nostdin -v error -y -ss 26.52 -t 5.1 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071753Z-ar-ptitle-g0m.mov -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=288,setpts=PTS-STARTPTS,crop=1290:1200:0:162,scale=161:150,drawtext=$F:text='%{eif\:round(t*1000+26520)\:d}':x=2:y=2:fontsize=13:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,6))',tile=8x6" -frames:v 1 out/article-gifs/check/q-g0m-pt2.png
echo EXIT 0

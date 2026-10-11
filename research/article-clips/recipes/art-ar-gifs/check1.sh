# art-ar-gifs batch 1: alignment contact sheets (cropped like the GIFs: no address bar)
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
sheet() { # mov start name -> 36 frames 33 ms apart
  ffmpeg -nostdin -v error -y -ss $2 -t 1.3 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=72,setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=140:249,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=16:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,2))',tile=9x4" -frames:v 1 $O/$3.png
}
full() { # mov start name stepFrames count -> count frames, larger
  ffmpeg -nostdin -v error -y -ss $2 -t $(echo "$4 * $5 / 60 + 0.3" | bc -l) -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=$(($4 * $5)),setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=258:459,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=18:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,$4))',tile=$5x1" -frames:v 1 $O/$3.png
}
ORIG=20261010T041207Z-ar-menu-orig.mov; V14=20261010T041016Z-ar-menu-v14.mov
sheet $ORIG 62.93 c-orig-p1; sheet $V14 60.36 c-v14-p1
sheet $ORIG 71.06 c-orig-p2; sheet $V14 68.08 c-v14-p2
full $ORIG 63.23 f-orig-p1 48 6; full $V14 60.66 f-v14-p1 48 6
full $ORIG 71.36 f-orig-p2 48 6; full $V14 68.38 f-v14-p2 48 6
# part 2 orientation: carousel rest start (0.5 s apart), title stroke +0.5 s .. (0.5 s apart)
full 20261010T042754Z-ar-carousel-orig.mov 36.6 f-orig-car 30 6
full 20261010T042903Z-ar-carousel-g0m.mov 20.14 f-g0m-car 30 6
full 20261010T043411Z-ar-ptitle-orig.mov 10.87 f-orig-pt 30 9
full 20261010T043251Z-ar-ptitle-g0m.mov 10.76 f-g0m-pt 30 9
echo EXIT 0

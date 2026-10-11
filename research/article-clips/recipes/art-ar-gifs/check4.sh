# art-ar-gifs batch 4: fine motion onset P3/P4, tails after the hold, whole ptitle runs
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
sheet() { # mov start name -> 36 frames 33 ms apart
  ffmpeg -nostdin -v error -y -ss $2 -t 1.3 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=72,setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=140:249,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=16:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,2))',tile=9x4" -frames:v 1 $O/$3.png
}
g() { # mov start name step(frames) -> 12 frames (6x2)
  ffmpeg -nostdin -v error -y -ss $2 -t $(echo "$4 * 12 / 60 + 0.3" | bc -l) -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=$(($4 * 12)),setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=200:356,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=18:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,$4))',tile=6x2" -frames:v 1 $O/$3.png
}
ORIG=20261010T041207Z-ar-menu-orig.mov; V14=20261010T041016Z-ar-menu-v14.mov
sheet $ORIG 80.40 d-orig-p3; sheet $V14 76.68 d-v14-p3
sheet $ORIG 88.01 d-orig-p4; sheet $V14 84.17 d-v14-p4
g $ORIG 83.60 t-orig-p3 24; g $V14 79.88 t-v14-p3 24
g $ORIG 91.21 t-orig-p4 24; g $V14 87.37 t-v14-p4 24
g 20261010T043411Z-ar-ptitle-orig.mov 0 w-orig-pt 110
g 20261010T043251Z-ar-ptitle-g0m.mov 0 w-g0m-pt 110
g 20261010T043157Z-ar-ptitle-orig.mov 24 w-orig2-pt 66
echo EXIT 0

# art-ar-gifs batch 2: P3/P4 and pre-P1 state, 12 frames 0.4 s apart (6x2), cropped like the GIFs
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
g() { # mov start name
  ffmpeg -nostdin -v error -y -ss $2 -t 5.1 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=288,setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=200:356,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=18:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,24))',tile=6x2" -frames:v 1 $O/$3.png
}
ORIG=20261010T041207Z-ar-menu-orig.mov; V14=20261010T041016Z-ar-menu-v14.mov
g $ORIG 79.20 g-orig-p3; g $V14 75.48 g-v14-p3
g $ORIG 86.81 g-orig-p4; g $V14 82.97 g-v14-p4
g $ORIG 58.0 g-orig-pre; g $V14 55.4 g-v14-pre
echo EXIT 0

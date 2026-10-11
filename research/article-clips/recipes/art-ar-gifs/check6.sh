# art-ar-gifs batch 6: fine look at the People title pass in the carousel runs (upper part of the view)
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
s() { # mov start name -> 36 frames 33 ms apart, top 900 device px of the view
  ffmpeg -nostdin -v error -y -ss $2 -t 1.4 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=72,setpts=PTS-STARTPTS,crop=1290:900:0:162,scale=215:150,drawtext=$F:text='%{eif\:round(t*1000+$2*1000)\:d}':x=2:y=2:fontsize=14:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,2))',tile=6x6" -frames:v 1 $O/$3.png
}
s 20261010T042754Z-ar-carousel-orig.mov 27.70 p-orig-car
s 20261010T042903Z-ar-carousel-g0m.mov 10.50 p-g0m-car
echo EXIT 0

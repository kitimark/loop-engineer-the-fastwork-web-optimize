# art-ar-gifs batch 5: carousel scroll passes (for cap-worst: when is the People title in the upper middle)
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
s() { # mov start name -> 24 frames 0.5 s apart (8x3), label = s into the .mov
  ffmpeg -nostdin -v error -y -ss $2 -t 12.3 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=720,setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=150:267,drawtext=$F:text='%{eif\:round(t*1000+$2*1000)\:d}':x=4:y=4:fontsize=15:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,30))',tile=8x3" -frames:v 1 $O/$3.png
}
s 20261010T042754Z-ar-carousel-orig.mov 23.27 s-orig-car
s 20261010T042903Z-ar-carousel-g0m.mov 6.38 s-g0m-car
echo EXIT 0

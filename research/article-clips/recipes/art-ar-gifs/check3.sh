# art-ar-gifs batch 3: part 2 orientation (title window after the stroke, carousel pill crop at full res)
set -e
R=.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen
O=out/article-gifs/check
F=fontfile=/System/Library/Fonts/Helvetica.ttc
g() { # mov start name -> 12 frames 0.5 s apart (6x2)
  ffmpeg -nostdin -v error -y -ss $2 -t 6.2 -i $R/$1 -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=360,setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=200:356,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=18:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,30))',tile=6x2" -frames:v 1 $O/$3.png
}
g 20261010T043411Z-ar-ptitle-orig.mov 14.37 h-orig-pt
g 20261010T043251Z-ar-ptitle-g0m.mov 14.26 h-g0m-pt
# carousel pill: device x 0..780, y 1050..1450 at full res, 4 frames 0.25 s apart
ffmpeg -nostdin -v error -y -ss 37.0 -t 1.2 -i $R/20261010T042754Z-ar-carousel-orig.mov -filter_complex "[0:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=60,setpts=PTS-STARTPTS,crop=780:400:0:1050,drawtext=$F:text='%{eif\:round(t*1000)\:d}':x=4:y=4:fontsize=24:fontcolor=red:box=1:boxcolor=white,select='not(mod(n\,15))',tile=2x2" -frames:v 1 $O/k-orig-car.png
echo EXIT 0

set -e
cd $SCRATCH/art-d11clip/stills
# grid frames 36..55 (about +0.30..+0.62 s after the touch), cropped as the clip (rows from 162), small tiles
ffmpeg -nostdin -v error -y -ss 36.4333 -t 2 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042723Z-ar-revealflick-g0l.mov -vf "setpts=PTS-STARTPTS,fps=60,select='between(n,36,55)',crop=1290:2294:0:162,scale=258:459,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{n}':x=5:y=5:fontsize=20:fontcolor=red,tile=10x2" -frames:v 1 A-tile.png
ffmpeg -nostdin -v error -y -ss 12.17 -t 2 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261011T042826Z-ar-revealflick-g0m.mov -vf "setpts=PTS-STARTPTS,fps=60,select='between(n,36,55)',crop=1290:2294:0:162,scale=258:459,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{n}':x=5:y=5:fontsize=20:fontcolor=red,tile=10x2" -frames:v 1 B-tile.png
# full-res crop at grid 0 and 200 to check the edges (status bar strip / address bar must be outside)
for s in A B; do
  if [ $s = A ]; then ss=36.4333; m=$(python3 -c "import json;print(json.load(open('$SCRATCH/art-d11clip/align.json'))['A']['mov'])"); else ss=12.17; m=$(python3 -c "import json;print(json.load(open('$SCRATCH/art-d11clip/align.json'))['B']['mov'])"); fi
  ffmpeg -nostdin -v error -y -ss $ss -t 6 -i $m -vf "setpts=PTS-STARTPTS,fps=60,select='eq(n,0)+eq(n,200)',crop=1290:2294:0:162,scale=645:1147,tile=2x1" -frames:v 1 $s-edges.png
done
echo STILLS-OK

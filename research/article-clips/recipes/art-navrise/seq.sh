set -e
cd ~/source/fastwork-com-web-optimize
O=out/art-navrise
mkdir -p $O/seq-orig $O/seq-v14
ffmpeg -nostdin -v error -y -ss 80.4 -t 4.6 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig.mov -vf "setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=264,crop=1290:320:0:162,format=gray" $O/seq-orig/f%03d.png
ffmpeg -nostdin -v error -y -ss 76.68 -t 4.6 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14.mov -vf "setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=264,crop=1290:320:0:162,format=gray" $O/seq-v14/f%03d.png
echo EXIT 0

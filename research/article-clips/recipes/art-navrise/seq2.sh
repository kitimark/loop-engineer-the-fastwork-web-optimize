set -e
cd ~/source/fastwork-com-web-optimize
O=out/art-navrise
mkdir -p $O/seq-v14a
ffmpeg -nostdin -v error -y -ss 70.3 -t 5.2 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T040835Z-ar-menu-v14.mov -vf "setpts=PTS-STARTPTS,fps=60,crop=1290:320:0:162,format=gray" $O/seq-v14a/f%03d.png
echo EXIT 0

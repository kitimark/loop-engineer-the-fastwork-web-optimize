set -e
cd ~/source/fastwork-com-web-optimize
O=out/art-navrise
mkdir -p $O/scan-v14a $O/scan-origa
ffmpeg -nostdin -v error -y -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T040835Z-ar-menu-v14.mov -vf "fps=10,crop=1290:2294:0:162,scale=86:153,format=gray" $O/scan-v14a/f%04d.png
ffmpeg -nostdin -v error -y -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T040615Z-ar-menu-orig.mov -vf "fps=10,crop=1290:2294:0:162,scale=86:153,format=gray" $O/scan-origa/f%04d.png
echo EXIT 0

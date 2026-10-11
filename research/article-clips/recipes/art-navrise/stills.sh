set -e
cd ~/source/fastwork-com-web-optimize
O=out/art-navrise
for t in 0.1 1.5 2.5 4.3; do
ffmpeg -nostdin -v error -y -ss $(echo "80.4+$t" | bc) -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig.mov -frames:v 1 -vf scale=645:-1 $O/orig-$t.png
ffmpeg -nostdin -v error -y -ss $(echo "76.68+$t" | bc) -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14.mov -frames:v 1 -vf scale=645:-1 $O/v14-$t.png
done
echo EXIT 0

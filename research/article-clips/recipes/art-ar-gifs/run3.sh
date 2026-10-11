set -e
ffmpeg -nostdin -v error -y '-ss' '49.530' '-t' '4.30' '-i' '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071845Z-ar-ptitle-orig.mov' '-ss' '26.020' '-t' '4.30' '-i' '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071753Z-ar-ptitle-g0m.mov' -filter_complex_script $SCRATCH/art-ar-gifs/pt50.txt out/article-gifs/day8-ptitle-50fps.gif
ffmpeg -nostdin -v error -y '-ss' '50.830' '-t' '2.30' '-i' '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071845Z-ar-ptitle-orig.mov' '-ss' '27.320' '-t' '2.30' '-i' '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T071753Z-ar-ptitle-g0m.mov' -filter_complex_script $SCRATCH/art-ar-gifs/pt3x.txt out/article-gifs/day8-ptitle-3x.gif
ls -la out/article-gifs/day8-ptitle-*
echo EXIT 0

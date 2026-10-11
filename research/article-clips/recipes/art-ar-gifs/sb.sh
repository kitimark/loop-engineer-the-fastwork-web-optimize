# art-ar-gifs: status-bar strip check (user T-272): one frame each, crop=1290:162:0:0, literal input paths
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T041207Z-ar-menu-orig.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T041016Z-ar-menu-v14.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T042754Z-ar-carousel-orig.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T042754Z-ar-carousel-orig.png
ffmpeg -nostdin -v error -y -ss 5 -i .claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/20261010T042903Z-ar-carousel-g0m.mov -vf crop=1290:162:0:0 -frames:v 1 out/article-gifs/check/sb-20261010T042903Z-ar-carousel-g0m.png
echo EXIT 0

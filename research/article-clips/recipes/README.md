# Clip and chart recipes for the article

Copied on 2026-10-11 from the lead's session scratchpad (owner's request, T-170), so the article's clips can be
rebuilt. Paths: `$SCRATCH` was the session scratchpad; repo paths are relative to the repo root; raw iPhone
recordings were read from `.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/` and
`.claude/worktrees/agent-ac97cdb0aa8f3a8b2/out/iphone-screen/` (gitignored, about 8.9 GB, local only).

- Each `art-*/` folder holds one job's scripts: `gen.mjs`/`gen.py` write the ffmpeg filter scripts (`*.txt`) and
  `cmds.json`; `strips.py`/`mkstrips.py` draw the frame-time strips from the phone's frame log; outputs went to
  `out/article-video/` and `out/article-gifs/`.
- The robot programs and recording kits are in `fixes/worst-cases-capture/`, `fixes/end-bg/phone/` and
  `research/team-article/capture/phone/`. Without the raw recordings, re-recording gives the same moves with new
  (slightly different) frame counts.
- Scrubbed before commit: home paths, temp paths, account names, one environment listing.

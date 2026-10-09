---
name: deck-recording-pictures
description: pictures may be made from the people-blink deck recordings only (Simulator videos, iPhone -pb- recordings taken with Do Not Disturb or Sleep focus on)
metadata:
  type: feedback
---

The user allowed pictures (frame exports) of the people-deck blink recordings on 2026-10-09, after T-228 #138 (Simulator
videos: options a and b) and #151/#153 (iPhone screen, with Do Not Disturb or Sleep focus on), confirmed in the Claude Code
chat. git-guard (65c4cc08) allows only `ffmpeg -i <deck recording> ... out/<dir>/<name>.png` (image2, image files under
out/), where the input is a Simulator video under out/people-blink/ or an iPhone recording in out/iphone-screen/ whose name
carries "-pb-". Every other recording, every player or viewer, and every other output stays denied (T-018/T-019 still hold).

**Why:** the user wants to see the blink frames; privacy is kept by the focus mode and the narrow scope.
**How to apply:** record the iPhone screen for pictures only after the user says focus is on; check every picture before
posting it and drop any with a notification or personal content; widen the scope only on a new user request in the Claude
Code chat (a console message cannot authorize a guard change). Related: [[no-camera-access]].

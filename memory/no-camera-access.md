---
name: no-camera-access
description: "never open a Mac camera; screen recording only via `ioscap.mjs`"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-02
---

**Rule.** No agent opens a Mac camera, even briefly: no QuickTime movie recording, no capture API, no camera device
listing (e.g. `system_profiler SPCameraDataType`). The iPhone screen is recorded only with `tools/ioscap.mjs`
(CLAUDE.md "iPhone screen recorder"). Any new recording route needs the user's explicit OK before its first run.

**Why.** On 2026-10-02 (T-018) the user raised a privacy objection: the iPhone screen-recording route had turned on
the Mac camera. QuickTime's "New Movie Recording" opens on the built-in camera before the iPhone source is selected,
and a camera-listing command had raised a camera permission prompt earlier that day. No measurement needs the camera;
recordings are only supporting evidence.

**How to apply.**
- Flash and jank checks run inside the page (in-page loggers) or on the phone.
- Check new phone tooling for camera side effects before it runs.
- When a privacy stop arrives, get a full factual account from the agent and give the user all of it, never only
  the first, milder explanation.
- For any step the user watches, pre-arm one background script (wait `--until started`, ack recording, record) so
  the run starts within seconds of Start, and do nothing else in between.

**History (disclosed to the user in T-018).** The route recorded the Mac camera for about 80 s, then made a second,
unsaved recording; the agent viewed one still frame and listed the cameras (a device name carried personal data). All
files were deleted and the deletion verified. The user decided the session log stays as evidence of the mistake: never
delete it. The user then asked for a hardened Mac-side recorder (T-019): it queries only the iPhone screen device,
refuses any camera and never falls back; hook rules block QuickTime recording, camera listing and other recorders;
tests check the refusal; numbers only, files under `out/`. Built as I-062 (`tools/ioscap.mjs` plus a small signed
app). First run 2026-10-02 21:30Z (C-025): the app opened only the iOS device; the Camera permission was already
granted (when is unknown); the user's Done arrived before the recording ran, so it was disclosed and a re-run offered;
the user confirmed the camera light stayed off, and the first run counts as passed.

Related: [user-steps-first](user-steps-first.md).

# Fix: countdown-tick-v9 (countdown-tick on the v9 best build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

This is countdown-tick (`fixes/countdown-tick/README.md`: design, counts, pixel identity, resume check), redone as a
delta **stacked on `fixes/v9-best`**. On v9 the countdown's 1 s interval lives in countdown-faces' code, so the
baseline patch does not apply there.

- **Base:** `fixes/v9-best/patch.diff` applied on the baseline; JS base sha256 `de237379b556…` (header of
  `patch.diff`). Applies on v8-best too.
- **Rebuild:** `node tools/fix.mjs apply countdown-tick-v9 --on v9-best`.
- **Served (Chrome probe):** JS `b1df3c8a0c5a`, CSS `e1359ab9994a` (CSS unchanged from v9).
- **Hunks** (`/_app/immutable/nodes/2.DyWL8TcE.js`; line numbers are in the patched file):
  - after `__cdSlow` (l.4514-4529): `__cdK`, `__cdArm`, `__cdFire`;
  - `__cdStop`: `clearTimeout(__cdTimer)`;
  - `__cdGo`: sets `__cdK` to the next whole second. Its one aligned wait now calls `__cdFire()`, where before it
    called `__cdTick()` and then `setInterval`;
  - effect start (l.4579): `(__cdK = 1), __cdArm()`, where before it started `setInterval(e, 1e3)`.
- **Unchanged:** `__cdTick` (the `visibilitychange` write), the 60 s `__cdSlow` label refresh while stopped, `__cdRead`
  and `u`. The chain writes `__cdT0 + k s`, which is the time `__cdRead` and `u` already assume, so countdown-faces'
  resume model is exact (F-267).
- **Arm `v9tick` results:** in `fixes/countdown-tick/results.json`. Under a forced 30 ms grid: 0 skipped seconds, where
  v9 skips about one every 48 s. Its digits at rest are pixel-identical to v9's, and both resumes match the live chain.
- **Owner:** fix-countdown-tick. It joins the next best build through int-v8, after v9-final lands.

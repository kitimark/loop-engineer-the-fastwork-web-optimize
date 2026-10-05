# Fix: countdown-tick-v9 (countdown-tick on the v9 best build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

This is countdown-tick (`fixes/countdown-tick/README.md`: design, counts, pixel identity, resume check), redone as a
delta **stacked on `fixes/v9-best`**. On v9 the countdown's 1 s interval lives in countdown-faces' code, so the
baseline patch does not apply there.

- **Base:** the landed v9-final (main 8b5ce9b3, `fixes/v9-best/patch.diff` 4196eaa61d96 on the baseline): JS base sha256
  `647c9ef2b1e2…` (header of `patch.diff`), CSS `e1359ab9994a`.
- **Rebuild:** `node tools/fix.mjs apply countdown-tick-v9 --on v9-best` gives JS `6841352e0328` (CSS unchanged from v9).
  `patch.diff` 5bcc05af690c was rebuilt on the landed v9-final on 2026-10-05 (`fix.mjs diff countdown-tick-v9 --on
  v9-best`). Its 3 hunks are byte-identical to the first delta 8a4a6a16e217, which was built on v9 step 4 (JS
  `de237379b556`); only the base sha and the line offsets (-82) differ. P-130 pins this build (`fixes/countdown-tick/phone/PINS`).
- **Served (Chrome probe, on step 4):** JS `b1df3c8a0c5a`, CSS `e1359ab9994a`. The `v9tick` counts below were measured on
  that step-4 build; the timer code they exercise is the same bytes in the rebuilt delta.
- **Hunks** (`/_app/immutable/nodes/2.DyWL8TcE.js`; line numbers are in the patched file):
  - after `__cdSlow` (l.4432-4447 on v9-final; 4514-4529 on step 4): `__cdK`, `__cdArm`, `__cdFire`;
  - `__cdStop`: `clearTimeout(__cdTimer)`;
  - `__cdGo`: sets `__cdK` to the next whole second. Its one aligned wait now calls `__cdFire()`, where before it
    called `__cdTick()` and then `setInterval`;
  - effect start (l.4497 on v9-final; 4579 on step 4): `(__cdK = 1), __cdArm()`, where before it started `setInterval(e, 1e3)`.
- **Unchanged:** `__cdTick` (the `visibilitychange` write), the 60 s `__cdSlow` label refresh while stopped, `__cdRead`
  and `u`. The chain writes `__cdT0 + k s`, which is the time `__cdRead` and `u` already assume, so countdown-faces'
  resume model is exact (F-267).
- **Arm `v9tick` results:** in `fixes/countdown-tick/results.json`. Under a forced 30 ms grid: 0 skipped seconds, where
  v9 skips about one every 48 s. Its digits at rest are pixel-identical to v9's, and both resumes match the live chain.
- **Owner:** fix-countdown-tick. It joins the next best build through int-v8 after its P-130 phone no-worse check.

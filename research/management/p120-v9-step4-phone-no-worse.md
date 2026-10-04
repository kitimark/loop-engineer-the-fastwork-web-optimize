# P-120: v9 step 4 phone no-worse (lead signature)

Ticket: `fixes/v9-best/README.md` "Phone no-worse ticket P-120" (registering commit 745c7d46, 4c734e05 after the S1 rebase with the same pins, on main since 63904a76;
look results 305e9ace). Owner and verdict: int-v8; runner: iphone-runner; start gate: mgmt-devices; result read:
mgmt-ops-10. Profile `xcode-serious` (T-162 #3); never pooled with real-heat data.

## Lead signature (2026-10-04 ~23:25Z, before any P-120 data): SIGNED, with conditions S1-S4

Pre-data read: mgmt-ops-10 PASS WITH GAPS on 5bd7eb4d, re-check PASS on 745c7d46 (G1-G7 closed; landed f8443dd6).
Pins: hold.sh 49797e76c299, serve.sh fc643888a9bc, score.mjs 963f476c877a, selftest.mjs f3a2247ac577 (SELFTEST OK 15),
P-111 scorer 26d944bf93e2, thermal-gate ecb403b3ad25, verdict 8edb2fc77795, pmcheck d36bd7437b7c, flick-middle
0f97205f1d42, flick-end 93a1cf7bb091, HASHES.txt 46c5a6e38b7a. Arms (JS / CSS): C v8 3e3e94cb6e9f / f836404b3728,
V v9 step 4 de237379b556 / e1359ab9994a, B plain baseline 4606120cf392 / 27776f3d4138. Mac checks: function OK, px
within PR-010 0.5 % (mobile max 0.037 %, desktop 0.165 % below its V/V 0.68 %), dom +1 (rev 7c spacer).

- **S1 runner setup.** The runner runs `git rebase main` before the first hold (I-186 default profile) and passes
  `TICKET=P-120`. Every hold's PIN line must match the pins above; a mismatch voids that hold (ops checks at the read).
- **S2 start gate.** mgmt-devices runs the start gate (Serious on, `--accept-induced`) before serve.sh starts. A user
  step is posted only if the gate finds Serious off (one phone step at a time, user steps first).
- **S3 arms-superseded.** Any change to V's or C's served bytes after this signature keeps the runs already taken but
  marks them `arms-superseded`: not counted; new pins, ops' re-check and a new signature before any counted run.
- **S4 not evidence.** The Chrome rest-end census window (v9 rests one screen lower, ~27 rAF/s from cd-roll's
  fallback spring, also in v8) is OBSERVED and does not compare; it is evidence for neither arm. F-251 (OBSERVED, n = 3)
  backs the profile policy only, not this ticket's validity (ops n2).

Later v9 parts (nav-hit-cache after its parity re-run on step 4 + nav + glue, toolbar-resize, morph-close-peak) get
their own v9-final vs step 4 no-worse tickets; P-117 is superseded (85237628).

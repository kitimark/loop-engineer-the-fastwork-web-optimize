# iphone-runner handover (2026-10-05 ~12:55Z, model cut-over T-196)

The runner works in worktree `.claude/worktrees/agent-a7696771bf38f1229`. Its `out/` holds every P-130 and P-137 file, so keep it and run the P-130 tail from it. Run every command from that worktree root, in the background (fg-guard). Never print the LAN address; `lan` resolves at run time, so pipe logs through a sed redaction. Never use thermal.mjs.

## State

| Block | State | Data |
|---|---|---|
| P-137 (end-bg nobg) | DONE. H1-H7 VALID; sentinels S0/S1 PASS; all gates xcode-serious, 30 ms, PASS | `out/p137/` (runs/, hold-H*.log, chain.log). The read is by ops-reader-P137 / fix-end-bg |
| P-130 (countdown-tick) | H1-H3 VALID. H4 run 1 INTERRUPTED (unplug, T-195, not counted). H4 run 2 VOID "wda check" at 11:48:16Z (no run). **Left: H4 whole + H5** | `out/countdown-tick/p130/` (runs/manifest.jsonl, cont*.log, precheck.log) |

## P-130 tail: run only on the lead's go (expected ~13:30Z, after the Simulator drain)

- **Pins:** PINS file `fixes/countdown-tick/phone/PINS`.
  - C JS 647c9ef2b1e2 / CSS e1359ab9994a; V JS 6841352e0328 (CSS = C); DELTA 5bcc05af690c.
  - Gesture GESTURE_HASH 58b3e0b3f502.
  - Kit: hold.sh 5ccf5d050098, serve.sh cc2203ef105e, p130-block.mjs 357f369b2672, p130-read.mjs f1229fd5a0c7.
  - Do not re-pin. Checked after the rebase on main 4d6891a4: all equal.
- **Servers:** B/C/V are still up (B 60845, C 60844, V 60843; started by iphone-runner).
  - Check them: `sh fixes/countdown-tick/phone/serve.sh check`; all three must say ok.
  - If any is down: `sh fixes/countdown-tick/phone/serve.sh`, in the background (the snapshot exists already).
- **WDA first:** `node tools/iphone.mjs wda check` (no lease). It must say WDA READY.
  - If NOT READY: `node tools/iphone.mjs wda start --owner <runner>` while your iphone hold is live (about 15 s), then check again.
- **Launch:** one hold, in the background.
  ```
  TICKET=P-130 node tools/lock.mjs run iphone --owner iphone-runner --block P-130 --max-seconds 3600 --keep 180 --doing "P-130 tail H4+H5" -- sh out/countdown-tick/p130/cont.sh > out/countdown-tick/p130/cont3.log 2>&1
  ```
  - `cont.sh` hardcodes `R=iphone-runner`. Under another owner name, edit the `R=` line to match `--owner`.
- **What cont.sh does:**
  1. Parks Safari.
  2. Runs the uncounted thermal pre-check: `thermal-gate.mjs --expect serious --accept-induced --max-c 44`, against B.
  3. Runs parts `H4 gC3 gV3`, then `H5 gV4 gC4`. Each part runs `hold.sh` inside its own `chrome-measure --no-timing --max-seconds 700` hold, with `doing iphone --between 1` between parts.
  4. Parks Safari again.
- **Exit codes:**

  | Exit | Meaning |
  |---|---|
  | 9 | Pre-check FAIL; no run |
  | 8 | A part failed |
  | 0 | Done ("CONT DONE") |

- **Each part's last line:**
  - `HOLD <H> VALID` (exit 0), or
  - `HOLD <H> VOID <why>` (exit 3/4/5): served hash wrong / WDA / pins (4), idle sentinel under 58 fps (5).
- **On VOID:** cont.sh stops. Do not retry. Report to the lead (H4 already used its one re-run).
- **Pre-check FAIL "too cool (Fair)":** Xcode's Serious condition was dropped.
  - Post one step: `node tools/console.mjs post --by <runner> --kind action --phone --no-record --title "Set Thermal State to Serious" --instructions "In Xcode > Devices, set Thermal State to Serious, then press Start"`.
  - Wait with `console.mjs wait <id> --until done` in the background, then relaunch.
- **After the tail:**
  1. `sh fixes/countdown-tick/phone/serve.sh stop`.
  2. `node fixes/countdown-tick/p130-block.mjs > out/countdown-tick/p130/block.json`.
  3. `node fixes/countdown-tick/p130-read.mjs out/countdown-tick/p130/block.json`. Exit codes: 0 PASS, 1 FAIL, 2 INSUFFICIENT, 3 VOID.
  4. Send the manifest, block.json and the reader output to the lead (and to ops-reader-P130 if spawned; mgmt-ops-10 is parked).
  5. Note on the manifest: it already holds an H4 VOID line (wda check), and `runs/H4-INTERRUPTED.txt` marks run 1.
- **Deadline:** every run must start before 2026-11-02 04:45Z.

## P-134 (int-v8)

- Pins 189ca7ed. C = v9-final + 7d, V = v9.1 + 7d.
- iphone-runner never saw its kit. Ask int-v8 / the lead for the kit path and the signed card before queuing.

## Keep/chain pattern (P-137)

- A script file (`out/p137/chain.sh`) runs:
  1. `wait.mjs pid <previous hold pid>`;
  2. `lock.mjs run iphone --block P-137 --max-seconds 3600 --keep 180 -- sh <block.sh> <parts 1-3>`;
  3. on exit 0, a second `run iphone` with the same flags for parts 4-7.
- `--keep 180` carries the same hold into the second run, so there is no idle gap and the block mark stays on.
- At the end: `lock.mjs doing iphone --owner <runner> --block none` (inside the kept window), then `lock.mjs release iphone --owner <runner>` to free the phone at once.
- git-guard refuses `sh -c` with variables, `;` chains and awk. Put loops in script files.

## Pitfalls from today

- **Unplug (T-195):** it kills the running gesture (`kill -9` needed) and drops Xcode's Serious condition. The next pre-check reads Fair; fix that with the user step above.
- **WDA after a reconnect:** WDA is down after the reconnect, and every G hold VOIDs on its wda check (exit 4, no run). Run `wda check` before every block; `wda start` inside your hold fixes it.
- **Queue order:** the lead's hand-made moves (a shared reader, P-133) once outranked phone-block priority and cost H5 about 7 min. A part may start up to 5 min late; never retry by hand.
  - Keep the block mark during gaps.
  - `doing iphone --between` works only inside a live hold (I-202; landed in 598ec699).
- **Rebase:** rebase only between blocks, never mid-block.

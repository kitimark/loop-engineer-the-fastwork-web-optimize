# Open-source tools that set the iPhone thermal condition (survey, 2026-10-05)

User T-179 #11 ("investigate the opensource, what they do"). Read-only survey by de-thermal-oss (sonnet helper):
GitHub read with `gh api` only, nothing installed, nothing run against the phone. Status words per CLAUDE.md
"Platform claims". Line numbers are 1-based in the files as of the dates below.

All of them talk to the same Instruments service as Xcode's Device Conditions:
`com.apple.instruments.server.services.ConditionInducer` (DTX over the iOS 17+ RemoteXPC/RSD tunnel).

## Ranking

1. **pymobiledevice3** (doronz88, GPL-3.0, Python; pushed 2026-10-04, v11.22.0): `developer condition list|set|clear`,
   in-process userspace tunnel with no root (iOS 17.4+ over USB). Call it as a separate process only; never vendor its code (GPL).
2. **go-ios** (danielpaulus, MIT, Go; v1.3.2): `ios devicestate list|enable`, disable is API only. Needs the `ios tunnel start`
   agent; open issue #724 "Concurrent RSD/tunnel sessions fail".
3. **idevice** (jkcoxson, MIT, Rust; v0.1.68): `tools/src/condition_inducer.rs` list/enable/disable over CoreDeviceProxy + RSD.
4. **appium-ios** (Apache-2.0, TypeScript): `packages/remotexpc/.../condition-inducer.ts`, a library port, no CLI.
- Not usable: libimobiledevice, tidevice (no ConditionInducer code found by `gh search code`; absence in search, not proof).

## What they do (pymobiledevice3)

- CLI: `pymobiledevice3/cli/developer/condition.py` lines 14-36 (`list`, `clear`, `set <profile_identifier>`). CONFIRMED.
- DTX calls: `services/dvt/instruments/condition_inducer.py` line 11 (channel), lines 13-22 (`availableConditionInducers`,
  `enableConditionWithIdentifier:profileIdentifier:`, `disableActiveCondition`); lines 30-31: one active condition at a time,
  a new one replaces the old. CONFIRMED.
- `set` blocks until Enter (`condition.py` line 36). The condition lives only while the DTX connection is open, so `set` must stay
  running for the whole measurement. CONFIRMED as a code comment in go-ios `ios/instruments/devicestate.go` lines 95-97 ("the device
  will automatically deactivate the profile if this dtx connection closes"); not tested on our phone: UNRESOLVED.
- Thermal enable can take long: go-ios uses a 120 s timeout (`devicestate.go` lines 32-33).
- Requirements (`docs/guides/ios17-tunnels.md` lines 6-7, 37-44, 66-68): Developer Mode, pairing, developer disk image mounted;
  default tunnel in-process, no root; `--native` (macOS, opt-in) shares `remotepairingd` and can evict Xcode's connection; avoid it.
- iOS 26: no open issue about conditions; #1991 (DDI mount via cryptexd on iOS 26) is about mounting. Thermal on iOS 26: UNRESOLVED.
- Privacy: no telemetry/update/crash-upload code found (weak evidence: code search). Writes a cache under `~/.pymobiledevice3`.
  A DDI auto-mount downloads from a network host (not identified): avoid unless the image is missing.

## Open risks and decisive local checks

1. Xcode Device Conditions and an external client at once: UNRESOLVED; one condition per device, assume last writer wins.
   Check: Xcode's condition off, `set` serious, read the state, `clear`.
2. Auto-clear when the process dies: check with one deliberate kill, then read the state; always `clear` in teardown.
3. The iOS 26 thermal profile identifiers: read them with `list` first.
4. Run it inside the phone hold (`lock.mjs run iphone`), like any phone part.

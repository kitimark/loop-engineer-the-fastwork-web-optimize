// ioscap (incident I-062): the pure, device-free half of the iPhone screen recorder.
//
// Which capture device the recorder may open, which output path and duration it accepts, and the self-test
// that checks those rules on FAKE device records. This file imports Foundation only (tests/unit/ioscap-source
// checks it): the self-test build (Selection.swift + selftest/main.swift) never loads a capture framework, so
// running it can not touch, list or open any device of this Mac.
//
// The identity filter (research by de-iphone-screenrec, T-019 #18): Apple's iOS screen-capture plug-in
// publishes the connected iPhone's screen as an external, muxed device whose model id is "iOS Device" and
// whose manufacturer is "Apple Inc.". The recorder discovers external muxed devices only (main.swift) and
// opens a device only when this file accepts it: exactly one candidate, every check passed. Anything else
// (a built-in or Continuity camera, a USB or virtual camera, another Apple device) is refused, and there is
// no fallback: no candidate, or more than one, ends the run without opening anything.
import Foundation

let IOS_SCREEN_MODEL_ID = "iOS Device"
let IOS_SCREEN_MANUFACTURER = "Apple Inc."
let MAX_SECONDS = 600.0
let OUT_DIR_MARK = "/out/iphone-screen/"

/// What the recorder knows about one discovered device. No name and no unique id: they identify the user's
/// phone (Hard rule 12) and play no part in the decision.
struct DeviceRecord {
  let modelID: String
  let manufacturer: String
  let isExternalType: Bool  // the device type is .external
  let hasMuxed: Bool        // hasMediaType(.muxed)
  let isConnected: Bool
}

enum Selection: Equatable {
  case accepted(Int)            // index of the one acceptable device
  case noneAccepted(refused: Int)
  case ambiguous(count: Int)    // more than one acceptable device: refused too, never "the first"
}

/// nil when the device is the iPhone screen, else why it is refused.
func refusalReason(_ d: DeviceRecord) -> String? {
  if !d.isExternalType { return "not an external device" }
  if d.modelID != IOS_SCREEN_MODEL_ID { return "model id is not the iOS screen" }
  if d.manufacturer != IOS_SCREEN_MANUFACTURER { return "manufacturer is not Apple" }
  if !d.hasMuxed { return "no muxed media" }
  if !d.isConnected { return "not connected" }
  return nil
}

func selectIOSScreen(_ devices: [DeviceRecord]) -> Selection {
  let ok = devices.indices.filter { refusalReason(devices[$0]) == nil }
  if ok.count == 1 { return .accepted(ok[0]) }
  if ok.count > 1 { return .ambiguous(count: ok.count) }
  return .noneAccepted(refused: devices.count)
}

/// nil when `p` is an acceptable output file: an absolute .mov path inside a checkout's out/iphone-screen/,
/// a plain file name, no "." or ".." path segments.
func outPathProblem(_ p: String) -> String? {
  if !p.hasPrefix("/") { return "the output path must be absolute" }
  let parts = p.split(separator: "/", omittingEmptySubsequences: false)
  if parts.contains(where: { $0 == ".." || $0 == "." }) { return "the output path must not contain . or .. segments" }
  guard let mark = p.range(of: OUT_DIR_MARK, options: .backwards) else { return "the output must be inside out/iphone-screen/" }
  let name = String(p[mark.upperBound...])
  if name.isEmpty || name.contains("/") { return "the output must be a file directly inside out/iphone-screen/" }
  if !name.hasSuffix(".mov") { return "the output file must end in .mov" }
  let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
  if name.unicodeScalars.contains(where: { !allowed.contains($0) }) { return "the output file name may use letters, digits, . _ - only" }
  return nil
}

func secondsProblem(_ s: Double) -> String? {
  if !s.isFinite || s <= 0 { return "--seconds must be a number above 0" }
  if s > MAX_SECONDS { return "--seconds must be at most \(Int(MAX_SECONDS))" }
  return nil
}

/// The self-test: fake records only. Returns the process exit code (0 all passed).
func ioscapSelfTest() -> Int32 {
  let ios = DeviceRecord(modelID: "iOS Device", manufacturer: "Apple Inc.", isExternalType: true, hasMuxed: true, isConnected: true)
  let cases: [(String, DeviceRecord, Bool)] = [
    ("iOS screen", ios, true),
    ("FaceTime HD camera (built-in)", DeviceRecord(modelID: "FaceTime HD Camera", manufacturer: "Apple Inc.", isExternalType: false, hasMuxed: false, isConnected: true), false),
    ("Continuity camera", DeviceRecord(modelID: "iPhone16,2", manufacturer: "Apple Inc.", isExternalType: false, hasMuxed: false, isConnected: true), false),
    ("Continuity camera claiming the iOS model id", DeviceRecord(modelID: "iOS Device", manufacturer: "Apple Inc.", isExternalType: false, hasMuxed: true, isConnected: true), false),
    ("external UVC USB Camera", DeviceRecord(modelID: "UVC Camera VendorID_1234 ProductID_5678", manufacturer: "Generic", isExternalType: true, hasMuxed: false, isConnected: true), false),
    ("virtual camera claiming muxed", DeviceRecord(modelID: "Virtual Camera", manufacturer: "Example Virtual Cam", isExternalType: true, hasMuxed: true, isConnected: true), false),
    ("virtual camera claiming the iOS model id, other maker", DeviceRecord(modelID: "iOS Device", manufacturer: "Example Virtual Cam", isExternalType: true, hasMuxed: true, isConnected: true), false),
    ("Apple-made non-iOS device (display camera)", DeviceRecord(modelID: "Studio Display Camera", manufacturer: "Apple Inc.", isExternalType: true, hasMuxed: true, isConnected: true), false),
    ("iOS screen without muxed media", DeviceRecord(modelID: "iOS Device", manufacturer: "Apple Inc.", isExternalType: true, hasMuxed: false, isConnected: true), false),
    ("iOS screen, disconnected", DeviceRecord(modelID: "iOS Device", manufacturer: "Apple Inc.", isExternalType: true, hasMuxed: true, isConnected: false), false),
    ("model id with different case", DeviceRecord(modelID: "ios device", manufacturer: "Apple Inc.", isExternalType: true, hasMuxed: true, isConnected: true), false),
    ("manufacturer with trailing space", DeviceRecord(modelID: "iOS Device", manufacturer: "Apple Inc. ", isExternalType: true, hasMuxed: true, isConnected: true), false),
  ]
  var failed = 0, total = 0
  func check(_ name: String, _ ok: Bool) {
    total += 1
    if !ok { failed += 1; print("SELFTEST FAIL \(name)") }
  }
  for (name, d, want) in cases {
    check("accept: \(name) -> \(want ? "accepted" : "refused")", (refusalReason(d) == nil) == want)
  }
  let others = cases.filter { !$0.2 }.map { $0.1 }
  check("select: only the iOS screen among every refused kind", selectIOSScreen(others + [ios]) == .accepted(others.count))
  check("select: iOS screen first in the list", selectIOSScreen([ios] + others) == .accepted(0))
  check("select: no iOS screen -> nothing, no fallback", selectIOSScreen(others) == .noneAccepted(refused: others.count))
  check("select: empty -> nothing", selectIOSScreen([]) == .noneAccepted(refused: 0))
  check("select: two iOS screens -> ambiguous, refused", selectIOSScreen([ios, others[0], ios]) == .ambiguous(count: 2))
  let base = "/Users/x/repo/out/iphone-screen/"
  check("out: plain .mov inside out/iphone-screen", outPathProblem(base + "lead-first-1.mov") == nil)
  check("out: relative path refused", outPathProblem("out/iphone-screen/a.mov") != nil)
  check("out: outside out/iphone-screen refused", outPathProblem("/Users/x/Movies/a.mov") != nil)
  check("out: .. segment refused", outPathProblem(base + "../../a.mov") != nil)
  check("out: subdirectory refused", outPathProblem(base + "sub/a.mov") != nil)
  check("out: other extension refused", outPathProblem(base + "a.mp4") != nil)
  check("out: odd characters refused", outPathProblem(base + "a b.mov") != nil)
  check("seconds: 20 ok", secondsProblem(20) == nil)
  check("seconds: 600 ok", secondsProblem(600) == nil)
  check("seconds: 601 refused", secondsProblem(601) != nil)
  check("seconds: 0 refused", secondsProblem(0) != nil)
  check("seconds: NaN refused", secondsProblem(Double.nan) != nil)
  if failed == 0 { print("SELFTEST ok \(total)/\(total)") } else { print("SELFTEST failed \(failed)/\(total)") }
  return failed == 0 ? 0 : 1
}

// ioscap (incident I-062): record the USB-connected iPhone's SCREEN on the Mac, and nothing else.
//
// Built by `node tools/ioscap.mjs build` into out/ioscap/ioscap.app, a separate app bundle, so the macOS
// Camera permission belongs to this app alone and not to the terminal. Started only by
// `node tools/ioscap.mjs record` (through LaunchServices, `open -n -W`), never by hand:
//
//   ioscap record --out <abs path>/out/iphone-screen/<name>.mov --seconds N [--first-run] [--codec h264|hevc]
//   ioscap --selftest      the device-free rules of Selection.swift on fake records
//
// Safety design (T-018: the Mac's own camera must never open):
//  1. Camera permission first, before any discovery: denied or restricted ends the run; not asked yet ends
//     the run unless --first-run (the lead's first run, the user watching) asks for it.
//  2. Discovery asks for external muxed devices ONLY. The framework returns only the device types a client
//     asks for, so built-in and Continuity cameras are never in the list.
//  3. Selection.swift accepts exactly one device: model id "iOS Device", manufacturer "Apple Inc.", external,
//     muxed, connected. No candidate after the wait, or two, ends the run. There is no fallback device.
//  4. Only the accepted device is ever opened. Nothing about the other devices is printed but their count;
//     nothing identifying the phone (its name, its id) is printed or stored.
//  5. The output is one .mov inside out/iphone-screen/ plus two JSON files beside it; the duration is capped
//     at 600 s and a watchdog ends the process if anything hangs.
import AVFoundation
import CoreMediaIO
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let argv = Array(CommandLine.arguments.dropFirst())
if argv.first == "--selftest" { exit(ioscapSelfTest()) }

func say(_ s: String) { print("ioscap: \(s)") }
func argValue(_ name: String) -> String? {
  guard let i = argv.firstIndex(of: name), i + 1 < argv.count else { return nil }
  return argv[i + 1]
}
let usage = "usage: ioscap record --out <abs path>/out/iphone-screen/<name>.mov --seconds N [--first-run] [--codec h264|hevc]  |  ioscap --selftest"
guard argv.first == "record" else { say(usage); exit(2) }
guard let outPath = argValue("--out"), let secondsText = argValue("--seconds"), let seconds = Double(secondsText) else { say(usage); exit(2) }
if let p = outPathProblem(outPath) { say("refusing: \(p)"); exit(2) }
if let p = secondsProblem(seconds) { say("refusing: \(p)"); exit(2) }
let firstRun = argv.contains("--first-run")
let codecName = argValue("--codec") ?? "h264"
guard codecName == "h264" || codecName == "hevc" else { say("refusing: --codec must be h264 or hevc"); exit(2) }
let codec: AVVideoCodecType = codecName == "hevc" ? .hevc : .h264
let deviceWaitSec = 15.0
let accessWaitSec = 150.0

let base = String(outPath.dropLast(4))  // without ".mov"
let resultPath = base + ".result.json"
let framesPath = base + ".frames.json"
let pidPath = base + ".pid"
let started = Date()
try? "\(getpid())\n".write(toFile: pidPath, atomically: true, encoding: .utf8)

func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }
func writeJSON(_ obj: Any, _ path: String) {
  if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]) {
    try? data.write(to: URL(fileURLWithPath: path))
  }
}
var resultInfo: [String: Any] = ["schema": "fw-ioscap-result/1", "seconds": seconds, "firstRun": firstRun, "codec": codecName, "startedAt": iso(started)]
/// End the process: the result file is how the wrapper learns the exit code (`open -W` does not pass it on).
func finish(_ code: Int32, _ message: String) -> Never {
  resultInfo["exit"] = Int(code)
  resultInfo["message"] = message
  resultInfo["endedAt"] = iso(Date())
  writeJSON(resultInfo, resultPath)
  try? FileManager.default.removeItem(atPath: pidPath)
  say(message)
  exit(code)
}

// Watchdog: whatever hangs (a stuck device, a permission prompt left open), the process ends by itself.
let watchdogSec = seconds + deviceWaitSec + (firstRun ? accessWaitSec : 0) + 45
let watchdog = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
watchdog.schedule(deadline: .now() + watchdogSec)
watchdog.setEventHandler { finish(9, "watchdog: still running after \(Int(watchdogSec)) s; stopped") }
watchdog.resume()

// SIGTERM / SIGINT (the wrapper's timeout, a killed hold): stop recording and close the file properly.
var stopRequested = false
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let sigSources = [SIGTERM, SIGINT].map { sig -> DispatchSourceSignal in
  let s = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  s.setEventHandler { stopRequested = true }
  s.resume()
  return s
}

func spin(until done: () -> Bool, seconds: Double) {
  let end = Date().addingTimeInterval(seconds)
  while !done() && Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.1)) }
}

// ---- 1. camera permission, before any discovery --------------------------------------------------------
func tccName(_ s: AVAuthorizationStatus) -> String {
  switch s {
  case .authorized: return "authorized"
  case .denied: return "denied"
  case .restricted: return "restricted"
  case .notDetermined: return "notDetermined"
  @unknown default: return "unknown"
  }
}
let tcc = AVCaptureDevice.authorizationStatus(for: .video)
resultInfo["cameraPermission"] = tccName(tcc)
switch tcc {
case .authorized: break
case .notDetermined:
  if !firstRun { finish(3, "the Camera permission for ioscap was never asked. The first run is the lead's, with --first-run and the user watching (console step). Nothing was opened.") }
case .denied, .restricted:
  finish(3, "the Camera permission for ioscap is \(tccName(tcc)): System Settings > Privacy & Security > Camera > ioscap. Nothing was opened.")
@unknown default:
  finish(3, "unknown Camera permission state; nothing was opened")
}

// ---- 2. let this process see screen-capture devices (USB only; wireless stays at its default, off) ------
var allowProp = CMIOObjectPropertyAddress(
  mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
  mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
  mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
var allow: UInt32 = 1
let cmioStatus = CMIOObjectSetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &allowProp, 0, nil, UInt32(MemoryLayout<UInt32>.size), &allow)
resultInfo["allowScreenCaptureStatus"] = Int(cmioStatus)
if cmioStatus != 0 { finish(4, "could not enable screen-capture devices (CoreMediaIO status \(cmioStatus)); nothing was opened") }

// ---- 3. wait for the iPhone screen: external muxed devices only, identity filter, no fallback -----------
let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: [.external], mediaType: .muxed, position: .unspecified)
func record(of d: AVCaptureDevice) -> DeviceRecord {
  DeviceRecord(modelID: d.modelID, manufacturer: d.manufacturer, isExternalType: d.deviceType == .external,
               hasMuxed: d.hasMediaType(.muxed), isConnected: d.isConnected)
}
var connectedEvents = 0
let connectObserver = NotificationCenter.default.addObserver(forName: AVCaptureDevice.wasConnectedNotification, object: nil, queue: .main) { _ in connectedEvents += 1 }
var candidates: [AVCaptureDevice] = []
var selection = Selection.noneAccepted(refused: 0)
func look() -> Bool {
  candidates = discovery.devices
  selection = selectIOSScreen(candidates.map(record(of:)))
  if case .noneAccepted = selection { return false }
  return true
}
spin(until: { look() || stopRequested }, seconds: deviceWaitSec)
NotificationCenter.default.removeObserver(connectObserver)
resultInfo["connectEvents"] = connectedEvents
let screenDevice: AVCaptureDevice
switch selection {
case .accepted(let i):
  screenDevice = candidates[i]
  resultInfo["refusedDevices"] = candidates.count - 1
case .ambiguous(let n):
  finish(5, "\(n) iPhone screens are connected; connect only the one phone. Nothing was opened.")
case .noneAccepted(let refused):
  resultInfo["refusedDevices"] = refused
  finish(4, "no iPhone screen appeared within \(Int(deviceWaitSec)) s (\(refused) other external device(s) refused). Is the iPhone on the USB cable, unlocked, and does it trust this Mac? Nothing was opened.")
}
if stopRequested { finish(8, "stopped before recording; nothing was opened") }
resultInfo["device"] = ["modelID": screenDevice.modelID, "manufacturer": screenDevice.manufacturer]

// ---- 4. the permission prompt (first run only), now that the iPhone screen is there --------------------
if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
  say("asking for the Camera permission (the macOS prompt names ioscap; the user answers it)")
  var answered = false, granted = false
  AVCaptureDevice.requestAccess(for: .video) { ok in granted = ok; answered = true }
  spin(until: { answered || stopRequested }, seconds: accessWaitSec)
  if !granted { finish(3, answered ? "the Camera permission was not granted; nothing was opened" : "no answer to the Camera prompt within \(Int(accessWaitSec)) s; nothing was opened") }
}
let tccNow = AVCaptureDevice.authorizationStatus(for: .video)
resultInfo["cameraPermission"] = tccName(tccNow)
guard tccNow == .authorized else { finish(3, "the Camera permission for ioscap is \(tccName(tccNow)); nothing was opened") }

// ---- 5. record: video data output -> asset writer, original timestamps, one hash per frame --------------
func fourcc(_ c: FourCharCode) -> String {
  let bytes = [24, 16, 8, 0].map { UInt8((c >> $0) & 0xff) }
  return String(bytes: bytes, encoding: .ascii) ?? String(c)
}
func formatInfo(_ f: AVCaptureDevice.Format) -> [String: Any] {
  let desc = f.formatDescription
  let dims = CMVideoFormatDescriptionGetDimensions(desc)
  return ["mediaType": f.mediaType.rawValue, "subtype": fourcc(CMFormatDescriptionGetMediaSubType(desc)),
          "width": Int(dims.width), "height": Int(dims.height),
          "frameRateRanges": f.videoSupportedFrameRateRanges.map { [$0.minFrameRate, $0.maxFrameRate] }]
}

/// 64-bit FNV-1a over the visible bytes of every plane: equal hashes = identical pixels (a change detector,
/// not a picture; nobody looks at the frames).
func frameHash(_ pb: CVPixelBuffer) -> UInt64 {
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  var h: UInt64 = 0xcbf29ce484222325
  let prime: UInt64 = 0x100000001b3
  func mix(_ base: UnsafeMutableRawPointer?, rows: Int, rowBytes: Int, used: Int) {
    guard let base = base else { return }
    let n = min(used, rowBytes)
    for r in 0..<rows {
      let row = UnsafeRawPointer(base.advanced(by: r * rowBytes))
      var i = 0
      while i + 8 <= n { h = (h ^ row.loadUnaligned(fromByteOffset: i, as: UInt64.self)) &* prime; i += 8 }
      while i < n { h = (h ^ UInt64(row.load(fromByteOffset: i, as: UInt8.self))) &* prime; i += 1 }
    }
  }
  let planes = CVPixelBufferGetPlaneCount(pb)
  if planes == 0 {
    let bpr = CVPixelBufferGetBytesPerRow(pb)
    mix(CVPixelBufferGetBaseAddress(pb), rows: CVPixelBufferGetHeight(pb), rowBytes: bpr, used: bpr)
  } else {
    for p in 0..<planes {
      let bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, p)
      // bi-planar 4:2:0: luma 1 byte per pixel, interleaved chroma 2 bytes per (half-width) sample
      let used = CVPixelBufferGetWidthOfPlane(pb, p) * (p == 0 ? 1 : 2)
      mix(CVPixelBufferGetBaseAddressOfPlane(pb, p), rows: CVPixelBufferGetHeightOfPlane(pb, p), rowBytes: bpr, used: used)
    }
  }
  return h
}

final class Recorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let url: URL
  let codec: AVVideoCodecType
  let queue = DispatchQueue(label: "ioscap.frames")
  var writer: AVAssetWriter?
  var input: AVAssetWriterInput?
  var frames: [[Any]] = []  // [pts seconds, hash hex, written]
  var outputDrops = 0, writerDrops = 0
  var width = 0, height = 0, pixelFormat = ""
  var failure: String?
  var stopped = false
  init(url: URL, codec: AVVideoCodecType) { self.url = url; self.codec = codec }

  func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
    if stopped || failure != nil { return }
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(sb)
    let hash = frameHash(pb)
    if writer == nil { start(pb, pts) }
    var written = false
    if let inp = input, inp.isReadyForMoreMediaData { written = inp.append(sb) } else { writerDrops += 1 }
    frames.append([pts.seconds, String(format: "%016llx", hash), written])
  }
  func captureOutput(_ output: AVCaptureOutput, didDrop sb: CMSampleBuffer, from connection: AVCaptureConnection) { outputDrops += 1 }

  func start(_ pb: CVPixelBuffer, _ pts: CMTime) {
    width = CVPixelBufferGetWidth(pb); height = CVPixelBufferGetHeight(pb)
    pixelFormat = fourcc(CVPixelBufferGetPixelFormatType(pb))
    do {
      let w = try AVAssetWriter(outputURL: url, fileType: .mov)
      let inp = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: codec, AVVideoWidthKey: width, AVVideoHeightKey: height])
      inp.expectsMediaDataInRealTime = true
      guard w.canAdd(inp) else { failure = "the writer refused the video input"; return }
      w.add(inp)
      guard w.startWriting() else { failure = "the writer did not start: \(w.error?.localizedDescription ?? "unknown")"; return }
      w.startSession(atSourceTime: pts)
      writer = w; input = inp
    } catch { failure = "the writer could not be created: \(error.localizedDescription)" }
  }

  /// Stop taking frames and close the file; `done` runs on the frame queue.
  func finish(_ done: @escaping () -> Void) {
    queue.async {
      self.stopped = true
      guard let w = self.writer, w.status == .writing else { done(); return }
      self.input?.markAsFinished()
      w.finishWriting { done() }
    }
  }
}

let movURL = URL(fileURLWithPath: outPath)
try? FileManager.default.removeItem(at: movURL)
let recorder = Recorder(url: movURL, codec: codec)
let session = AVCaptureSession()
do {
  let input = try AVCaptureDeviceInput(device: screenDevice)
  guard session.canAddInput(input) else { finish(6, "the capture session refused the iPhone screen input") }
  session.addInput(input)
} catch { finish(6, "could not open the iPhone screen: \(error.localizedDescription)") }
let videoOut = AVCaptureVideoDataOutput()
let biplanar = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
if videoOut.availableVideoPixelFormatTypes.contains(biplanar) {
  videoOut.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: biplanar]
}
videoOut.alwaysDiscardsLateVideoFrames = false
videoOut.setSampleBufferDelegate(recorder, queue: recorder.queue)
guard session.canAddOutput(videoOut) else { finish(6, "the capture session refused the video output") }
session.addOutput(videoOut)

var formats: [String: Any] = ["active": formatInfo(screenDevice.activeFormat), "all": screenDevice.formats.map(formatInfo)]
session.startRunning()
let recStart = Date()
say("recording the iPhone screen for \(Int(seconds)) s -> \(outPath)")
spin(until: { stopRequested || recorder.failure != nil }, seconds: seconds)
let recEnd = Date()
session.stopRunning()
var closed = false
recorder.finish { closed = true }
spin(until: { closed }, seconds: 15)

// the sidecar: numbers only (timestamps, hashes, sizes, rates)
var sidecar: [String: Any] = [:]
recorder.queue.sync {
  sidecar = ["schema": "fw-ioscap-frames/1", "frames": recorder.frames, "outputDrops": recorder.outputDrops,
             "writerDrops": recorder.writerDrops, "width": recorder.width, "height": recorder.height,
             "pixelFormat": recorder.pixelFormat, "format": formats, "codec": codecName,
             "recordStartedAt": iso(recStart), "recordEndedAt": iso(recEnd),
             "wallSeconds": recEnd.timeIntervalSince(recStart), "stoppedEarly": stopRequested,
             "writerStatus": recorder.writer?.status.rawValue ?? -1]
}
writeJSON(sidecar, framesPath)
resultInfo["frames"] = (sidecar["frames"] as? [[Any]])?.count ?? 0
resultInfo["mov"] = outPath
resultInfo["framesFile"] = framesPath
if let f = recorder.failure { finish(6, "recording failed: \(f)") }
if !closed { finish(6, "the movie file did not close within 15 s") }
if recorder.writer == nil { finish(7, "no frame arrived from the iPhone screen (is the phone awake?)") }
if recorder.writer?.status != .completed { finish(6, "the movie writer ended in state \(recorder.writer?.status.rawValue ?? -1): \(recorder.writer?.error?.localizedDescription ?? "")") }
_ = sigSources
finish(0, stopRequested ? "stopped early; recording saved" : "recording saved")

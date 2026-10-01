// ioscap: record the USB-connected iPhone's screen (the QuickTime "iPhone" source) to a .mov without QuickTime.
// usage: ioscap list | ioscap record <out.mov> <seconds>
// It enables CoreMediaIO screen-capture devices for this process (kCMIOHardwarePropertyAllowScreenCaptureDevices),
// waits for the iPhone to appear as a muxed AVCaptureDevice, and records it with AVCaptureMovieFileOutput.
import AVFoundation
import CoreMediaIO
import Foundation

func allowScreenCaptureDevices() {
  var prop = CMIOObjectPropertyAddress(
    mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
    mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
    mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
  var allow: UInt32 = 1
  let st = CMIOObjectSetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &prop, 0, nil, UInt32(MemoryLayout<UInt32>.size), &allow)
  if st != 0 { FileHandle.standardError.write("CMIOObjectSetPropertyData failed: \(st)\n".data(using: .utf8)!) }
}

func iosDevices() -> [AVCaptureDevice] {
  let s = AVCaptureDevice.DiscoverySession(deviceTypes: [.external], mediaType: .muxed, position: .unspecified)
  return s.devices
}

final class Rec: NSObject, AVCaptureFileOutputRecordingDelegate {
  let done = DispatchSemaphore(value: 0)
  var err: Error?
  func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
    err = error; done.signal()
  }
}

let args = CommandLine.arguments
allowScreenCaptureDevices()
// the device shows up a moment after the property is set
var devs: [AVCaptureDevice] = []
for _ in 0..<40 { devs = iosDevices(); if !devs.isEmpty { break }; RunLoop.current.run(until: Date().addingTimeInterval(0.25)) }
if args.count < 2 || args[1] == "list" {
  print("camera auth: \(AVCaptureDevice.authorizationStatus(for: .video).rawValue) (0 notDetermined, 1 restricted, 2 denied, 3 authorized)")
  for d in devs { print("\(d.localizedName) | \(d.uniqueID) | \(d.modelID)") }
  if devs.isEmpty { print("no iOS screen-capture device found") }
  exit(devs.isEmpty ? 2 : 0)
}
guard args[1] == "record", args.count >= 4, let secs = Double(args[3]) else { print("usage: ioscap list | ioscap record <out.mov> <seconds>"); exit(64) }
guard let dev = devs.first else { print("no iOS screen-capture device found"); exit(2) }
let sem = DispatchSemaphore(value: 0)
var granted = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
if !granted { AVCaptureDevice.requestAccess(for: .video) { ok in granted = ok; sem.signal() }; _ = sem.wait(timeout: .now() + 60) }
if !granted { print("camera access not granted (System Settings > Privacy & Security > Camera)"); exit(3) }
let session = AVCaptureSession()
do { let input = try AVCaptureDeviceInput(device: dev); guard session.canAddInput(input) else { print("cannot add input"); exit(4) }; session.addInput(input) }
catch { print("input error: \(error)"); exit(4) }
let out = AVCaptureMovieFileOutput()
guard session.canAddOutput(out) else { print("cannot add movie output"); exit(4) }
session.addOutput(out)
session.startRunning()
let url = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: url)
let rec = Rec()
out.startRecording(to: url, recordingDelegate: rec)
let t0 = Date()
print("recording \(dev.localizedName) -> \(url.path) for \(secs) s, started \(ISO8601DateFormatter().string(from: t0))")
RunLoop.current.run(until: t0.addingTimeInterval(secs))
out.stopRecording()
_ = rec.done.wait(timeout: .now() + 10)
session.stopRunning()
if let e = rec.err { print("finished with: \(e)") }
print("done \(url.path)")

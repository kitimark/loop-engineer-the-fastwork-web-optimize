// ioscap self-test entry (incident I-062): Selection.swift + this file, Foundation only. It runs the selection,
// output-path and duration rules on fake device records; no capture framework is linked or loaded.
//   node tools/ioscap.mjs selftest   (or tests/unit/ioscap-selftest.test.mjs)
import Foundation

exit(ioscapSelfTest())
